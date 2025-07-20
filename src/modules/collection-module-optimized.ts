/**
 * @file Optimized Collection Module - High-performance parallel content collection
 *
 * This module provides optimized content collection with parallel processing,
 * intelligent caching, compression, and memory management for maximum performance.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PipelineSourceType } from '../types/pipeline';
import { generateCollectedContentFilename } from '../utils/filename-utils';
import { cachedHttpClient } from '../utils/http-cached';
import { logger } from '../utils/logger';
import { compressionManager } from '../utils/performance/compression-manager';
import {
  createParallelProcessor,
  type ParallelProcessingConfig,
  type ParallelProcessor,
} from '../utils/performance/parallel-processor';
import { performanceMonitor } from '../utils/performance/performance-monitor';
import type { PipelineState } from '../utils/pipeline-state-manager';
import { streamingProcessor } from '../utils/streaming/streaming-file-processor';
import { CollectionStats } from './collection/collection-stats';

/**
 * Enhanced filters for collection sources with performance optimizations
 */
class OptimizedCollectionFilters {
  filterSources(
    sourcesData: PipelineState,
    filters: any
  ): PipelineSourceType[] {
    if (!sourcesData.sources) {
      return [];
    }

    const sources = Object.values(sourcesData.sources);

    return sources.filter((source) => {
      // Skip sources that are already collected from GitHub API
      if (
        source.status === 'collected' &&
        source.collection_metadata?.source === 'github_api'
      ) {
        return false;
      }

      // Only process discovered sources (unless retrying)
      if (!filters.includeRetry && source.status !== 'discovered') {
        return false;
      }

      // For retry, include failed collections
      if (
        filters.includeRetry &&
        source.status !== 'discovered' &&
        source.status !== 'failed'
      ) {
        return false;
      }

      // Apply filters
      if (filters.sourceType && source.source_type !== filters.sourceType) {
        return false;
      }

      if (filters.loaderType && source.loader_type !== filters.loaderType) {
        return false;
      }

      if (filters.priority && source.priority !== filters.priority) {
        return false;
      }

      if (
        filters.minRelevance &&
        source.relevance_score < filters.minRelevance
      ) {
        return false;
      }

      return true;
    });
  }
}

/**
 * High-performance content downloader with caching and compression
 */
class OptimizedContentDownloader {
  private config: {
    timeout: number;
    maxRedirects: number;
    userAgent: string;
    enableCache: boolean;
    enableCompression: boolean;
  };

  constructor(config: any = {}) {
    this.config = {
      timeout: config.timeout || 30_000,
      maxRedirects: config.maxRedirects || 5,
      userAgent: config.userAgent || 'porter-bridges/1.0.0',
      enableCache: config.enableCache !== false,
      enableCompression: config.enableCompression !== false,
    };
  }

  async downloadContent(url: string) {
    const startTime = Date.now();

    try {
      // Use cached HTTP client for automatic caching and compression
      const response = await cachedHttpClient.request(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.config.userAgent,
          Accept:
            'text/html,text/plain,application/xhtml+xml,text/markdown,application/json',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Charset': 'utf-8',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: this.config.timeout,
        cache: this.config.enableCache,
        compress: this.config.enableCompression,
        maxRedirects: this.config.maxRedirects,
      });

      const content = response.body.toString('utf-8');
      const responseTime = Date.now() - startTime;

      // Validate content is not corrupted or binary
      if (!content || content.length < 50) {
        throw new Error('Empty or too-short content received');
      }

      if (content.includes('\0')) {
        throw new Error('Binary content detected - expected text content');
      }

      logger.debug('📥 Content downloaded', {
        url,
        size: content.length,
        cached: response.fromCache,
        responseTime,
        compressionRatio: response.compressionRatio,
      });

      return {
        content,
        metadata: {
          status_code: response.status,
          content_type: response.headers['content-type'] || 'unknown',
          content_length: response.headers['content-length'] || content.length,
          last_modified: response.headers['last-modified'],
          etag: response.headers.etag,
          from_cache: response.fromCache,
          response_time: responseTime,
          compression_ratio: response.compressionRatio,
        },
      };
    } catch (error: unknown) {
      const responseTime = Date.now() - startTime;

      logger.error('📥 Content download failed', {
        url,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  async collectSourceWithRetry(source: PipelineSourceType, retries = 3) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        source.status = 'collecting';

        const result = await this.downloadContent(source.url);

        // Calculate content metadata
        const contentSize = Buffer.byteLength(result.content, 'utf8');
        const contentSizeKB = Math.round(contentSize / 1024);

        // Update source with collection metadata
        source.status = 'collected';
        source.collected_at = new Date().toISOString();
        source.collection_metadata = {
          status_code: result.metadata.status_code,
          content_type: Array.isArray(result.metadata.content_type)
            ? result.metadata.content_type[0]
            : result.metadata.content_type,
          content_length: Array.isArray(result.metadata.content_length)
            ? result.metadata.content_length[0]
            : String(result.metadata.content_length),
          etag: Array.isArray(result.metadata.etag)
            ? result.metadata.etag[0]
            : result.metadata.etag,
          size_bytes: contentSize,
          size_kb: contentSizeKB,
          collection_attempt: attempt,
          final_url: source.url,
          from_cache: result.metadata.from_cache,
          response_time: result.metadata.response_time,
          compression_ratio: result.metadata.compression_ratio,
        };

        // Update source properties from metadata
        source.size_kb = contentSizeKB;
        source.content_type = Array.isArray(result.metadata.content_type)
          ? result.metadata.content_type[0]
          : result.metadata.content_type;

        return {
          source,
          content: result.content,
          bytes: contentSize,
        };
      } catch (error: unknown) {
        lastError = error;

        const errorInfo = {
          code:
            (error instanceof Error && 'code' in error && String(error.code)) ||
            'unknown_error',
          message: (error instanceof Error && error.message) || String(error),
          attempt,
          timestamp: new Date().toISOString(),
        };

        if (attempt < retries) {
          const delay = 2 ** (attempt - 1) * 1000; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Final attempt failed
          source.status = 'failed';
          source.error = {
            code: errorInfo.code,
            message: errorInfo.message,
            timestamp: errorInfo.timestamp,
            retry_count: retries,
            phase: 'failed',
          };
        }
      }
    }

    throw lastError;
  }
}

/**
 * High-performance Collection Module with parallel processing and caching
 */
export class OptimizedCollectionModule {
  private options: {
    contentDirectory: string;
    maxConcurrency: number;
    batchSize: number;
    enableCompression: boolean;
    enableCache: boolean;
    enableStreaming: boolean;
    progressCallback:
      | ((current: number, total: number, currentFile: string) => void)
      | null;
  };
  private filters: OptimizedCollectionFilters;
  private stats: CollectionStats;
  private downloader: OptimizedContentDownloader;
  private parallelProcessor: ParallelProcessor;

  constructor(options: any = {}) {
    this.options = {
      contentDirectory:
        options.contentDirectory || './generated/collected-content',
      maxConcurrency: options.maxConcurrency || 10, // Increased concurrency
      batchSize: options.batchSize || 20, // Larger batch size
      enableCompression: options.enableCompression !== false,
      enableCache: options.enableCache !== false,
      enableStreaming: options.enableStreaming !== false,
      progressCallback: options.progressCallback || null,
    };

    this.filters = new OptimizedCollectionFilters();
    this.stats = new CollectionStats();
    this.downloader = new OptimizedContentDownloader({
      enableCache: this.options.enableCache,
      enableCompression: this.options.enableCompression,
    });

    // Configure parallel processor
    const parallelConfig: Partial<ParallelProcessingConfig> = {
      maxConcurrency: this.options.maxConcurrency,
      batchSize: this.options.batchSize,
      retryAttempts: 3,
      retryDelay: 1000,
      progressCallback: this.options.progressCallback,
      errorHandler: (error, item) => {
        logger.warn('Collection retry for source', {
          url: (item as any).url,
          error: error.message,
        });
        return 'retry';
      },
    };

    this.parallelProcessor = createParallelProcessor(parallelConfig);

    logger.info('🚀 Optimized collection module initialized', {
      contentDirectory: this.options.contentDirectory,
      maxConcurrency: this.options.maxConcurrency,
      batchSize: this.options.batchSize,
      enableCompression: this.options.enableCompression,
      enableCache: this.options.enableCache,
      enableStreaming: this.options.enableStreaming,
    });
  }

  /**
   * High-performance collection with parallel processing
   */
  async collect(
    sourcesData: PipelineState,
    filters: Record<string, unknown> = {}
  ) {
    const operationName = 'optimized-collection';

    logger.info('📥 Starting optimized content collection process');
    this.stats.startCollection();

    performanceMonitor.startMonitoring(operationName, {
      enableCompression: this.options.enableCompression,
      enableCache: this.options.enableCache,
      enableStreaming: this.options.enableStreaming,
      maxConcurrency: this.options.maxConcurrency,
      batchSize: this.options.batchSize,
    });

    try {
      // Ensure content directory exists
      await fs.mkdir(this.options.contentDirectory, { recursive: true });

      // Filter sources - this will exclude already collected GitHub API sources
      const sources = this.filters.filterSources(sourcesData, filters);

      // Also count already collected GitHub API sources for stats
      const alreadyCollectedSources = Object.values(sourcesData.sources).filter(
        (source) =>
          source.status === 'collected' &&
          source.collection_metadata?.source === 'github_api'
      );

      // Set total including both sources needing collection and already collected
      this.stats.setTotalSources(
        sources.length + alreadyCollectedSources.length
      );

      // Count already collected sources and their bytes
      if (alreadyCollectedSources.length > 0) {
        logger.info(
          `📋 Found ${alreadyCollectedSources.length} sources already collected from GitHub API`
        );
        for (const source of alreadyCollectedSources) {
          this.stats.incrementCollected(
            source.collection_metadata?.size_bytes || 0
          );
        }
      }

      if (sources.length === 0 && alreadyCollectedSources.length === 0) {
        logger.warn('⚠️  No sources match the collection criteria');
        this.stats.endCollection();
        performanceMonitor.endMonitoring(operationName, 'collection', {
          totalSources: 0,
        });
        return this._buildResults(sourcesData, filters);
      }

      if (sources.length === 0) {
        logger.info(
          `✅ All ${alreadyCollectedSources.length} sources already collected from GitHub API`
        );
        this.stats.endCollection();
        performanceMonitor.endMonitoring(operationName, 'collection', {
          totalSources: alreadyCollectedSources.length,
          allFromCache: true,
        });
        return this._buildResults(sourcesData, filters);
      }

      logger.info('🎯 Found sources to collect', {
        count: sources.length,
        alreadyCollected: alreadyCollectedSources.length,
        maxConcurrency: this.options.maxConcurrency,
        batchSize: this.options.batchSize,
      });

      // Process sources in parallel
      const batchResult = await this.parallelProcessor.processItems(
        sources,
        async (source) => {
          const result = await this.collectSingleSource(source, sourcesData);
          return result;
        },
        'collection-processing'
      );

      // Update stats from batch result
      this.stats.incrementCollected(
        batchResult.results
          .filter((r) => r.success)
          .reduce((sum, r) => sum + (r.result?.bytes || 0), 0)
      );

      this.stats.setFailedSources(batchResult.failed);

      this.stats.endCollection();

      performanceMonitor.endMonitoring(operationName, 'collection', {
        totalSources: sources.length + alreadyCollectedSources.length,
        processed: batchResult.totalItems,
        successful: batchResult.successful,
        failed: batchResult.failed,
        throughput: batchResult.throughput,
        averageTime: batchResult.averageTime,
      });

      // Log performance summary
      this._logPerformanceSummary(batchResult);

      return this._buildResults(sourcesData, filters);
    } catch (error: unknown) {
      this.stats.endCollection();
      performanceMonitor.endMonitoring(operationName, 'collection', {
        error: true,
      });

      if (error instanceof Error) {
        logger.error('💥 Optimized collection failed', {
          error: error.message,
        });
      } else {
        logger.error(
          { error },
          '💥 Optimized collection failed with unknown error'
        );
      }
      throw error;
    }
  }

  /**
   * Get collection results for export
   */
  getCollectionResults() {
    return {
      stats: this.stats.getStats(),
      summary: this.stats.getSummary(),
      parallelProcessorStats: this.parallelProcessor.getStats(),
      httpClientStats: cachedHttpClient.getStats(),
    };
  }

  /**
   * Resume collection from previous state
   */
  async resumeCollection(sourcesData: any, filters: any = {}): Promise<any> {
    logger.info('🔄 Resuming optimized content collection process');
    return await this.collect(sourcesData, { ...filters, includeRetry: true });
  }

  /**
   * Update concurrency settings dynamically
   */
  updateConcurrency(newConcurrency: number, newBatchSize?: number): void {
    this.options.maxConcurrency = newConcurrency;
    if (newBatchSize) {
      this.options.batchSize = newBatchSize;
    }

    this.parallelProcessor.updateConcurrency(newConcurrency);

    logger.info('🔄 Collection concurrency updated', {
      maxConcurrency: newConcurrency,
      batchSize: newBatchSize || this.options.batchSize,
    });
  }

  /**
   * Clear HTTP cache
   */
  clearCache(): void {
    cachedHttpClient.clearCache();
    logger.info('📦 HTTP cache cleared');
  }

  // Private methods

  private async collectSingleSource(
    source: PipelineSourceType,
    sourcesData: PipelineState
  ): Promise<{ source: PipelineSourceType; content: string; bytes: number }> {
    try {
      logger.info(`📥 ${source.source_type}: ${source.title || source.url}`);

      const result = await this.downloader.collectSourceWithRetry(source);

      // Save content to file (with optional compression and streaming)
      const fileName = generateCollectedContentFilename(
        source.url,
        source.source_type
      );
      const filePath = path.join(this.options.contentDirectory, fileName);

      await this.saveContentToFile(result.content, filePath);

      // Update source in sourcesData
      if (sourcesData.sources[source.url]) {
        Object.assign(sourcesData.sources[source.url]!, source);
      }

      return result;
    } catch (error: unknown) {
      // Update source in sourcesData
      if (sourcesData.sources[source.url]) {
        Object.assign(sourcesData.sources[source.url]!, source);
      }

      throw error;
    }
  }

  private async saveContentToFile(
    content: string,
    filePath: string
  ): Promise<void> {
    if (this.options.enableStreaming && content.length > 100 * 1024) {
      // Use streaming for large files
      const tempFilePath = `${filePath}.tmp`;

      await streamingProcessor.processFile(
        tempFilePath,
        filePath,
        async (chunk) => chunk, // No transformation
        {
          compress: this.options.enableCompression,
        }
      );

      // Clean up temp file
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    } else if (this.options.enableCompression && content.length > 10 * 1024) {
      // Use compression for medium files
      const buffer = Buffer.from(content, 'utf8');
      const { compressed } = await compressionManager.compressBuffer(buffer, {
        filename: filePath,
      });

      await fs.writeFile(filePath, compressed);
    } else {
      // Regular file write for small files
      await fs.writeFile(filePath, content, 'utf8');
    }
  }

  private _logPerformanceSummary(batchResult: any): void {
    const summary = this.stats.getSummary();
    const httpStats = cachedHttpClient.getStats();
    const processorStats = this.parallelProcessor.getStats();

    logger.info('📊 Optimized Collection Performance Summary', {
      totalSources: summary.total_sources,
      collectedSources: summary.collected_sources,
      failedSources: summary.failed_sources,
      totalBytes: summary.total_bytes,
      totalKB: summary.total_kb,
      durationSeconds: summary.duration_seconds,
      throughput: batchResult.throughput,
      averageTime: batchResult.averageTime,

      // HTTP cache performance
      httpCacheHitRate: `${httpStats.cacheHitRate.toFixed(2)}%`,
      httpCompressionSavings: Math.round(httpStats.compressionSavings / 1024),
      httpAverageResponseTime: Math.round(httpStats.averageResponseTime),

      // Parallel processing performance
      parallelProcessorStats: processorStats,
    });

    if (summary.collected_sources > 0) {
      const avgTime = summary.duration_seconds / summary.collected_sources;
      const avgSize = summary.total_kb / summary.collected_sources;
      const performanceImprovement = this.calculatePerformanceImprovement(
        avgTime,
        batchResult.throughput
      );

      logger.info('⚡ Performance Metrics', {
        avgTimePerSourceSeconds: Math.round(avgTime * 10) / 10,
        avgSizePerSourceKB: Math.round(avgSize * 10) / 10,
        parallelThroughput: `${batchResult.throughput.toFixed(2)} items/sec`,
        estimatedSpeedupVsSequential: `${performanceImprovement.toFixed(1)}x`,
        cacheHitRate: `${httpStats.cacheHitRate.toFixed(2)}%`,
        compressionSavingsKB: Math.round(httpStats.compressionSavings / 1024),
      });
    }
  }

  private calculatePerformanceImprovement(
    avgTime: number,
    throughput: number
  ): number {
    // Estimate improvement vs sequential processing
    const sequentialTime = avgTime * this.options.maxConcurrency;
    const parallelTime = 1 / throughput;
    return sequentialTime / parallelTime;
  }

  private _buildResults(sourcesData: any, filters: any): any {
    return {
      sources: sourcesData.sources,
      collection_metadata: {
        collected_at: new Date().toISOString(),
        collection_filters: filters,
        collection_stats: {
          stats: this.stats.getStats(),
          summary: this.stats.getSummary(),
        },
        performance_stats: {
          http_stats: cachedHttpClient.getStats(),
          parallel_processor_stats: this.parallelProcessor.getStats(),
        },
        content_directory: this.options.contentDirectory,
        optimization_settings: {
          max_concurrency: this.options.maxConcurrency,
          batch_size: this.options.batchSize,
          enable_compression: this.options.enableCompression,
          enable_cache: this.options.enableCache,
          enable_streaming: this.options.enableStreaming,
        },
      },
    };
  }
}

export { OptimizedCollectionModule as CollectionModule };
