/**
 * @file Collection Module - Downloads and collects content from discovered sources
 *
 * This module handles the second phase of the pipeline - downloading content from discovered sources.
 * It processes URLs from the discovery phase and downloads the actual content (HTML, markdown, etc.)
 * while handling errors, retries, and providing progress tracking.
 *
 * Key responsibilities:
 * - Download content from URLs discovered in the discovery phase
 * - Handle HTTP requests with proper headers, timeouts, and retries
 * - Update source status (discovered → collecting → collected/failed)
 * - Store downloaded content with proper file naming conventions
 * - Track collection metadata (file sizes, download times, error details)
 * - Support resume functionality for interrupted downloads
 * - Provide progress reporting for CLI integration
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { request } from 'undici';
import type { PipelineSourceType } from '../types/pipeline';
import { logger } from '../utils/logger';
import type { PipelineState } from '../utils/PipelineStateManager';
import { CollectionStats } from './collection/collection-stats';

/**
 * Simple filters for collection sources
 */
class CollectionFilters {
  filterSources(
    sourcesData: PipelineState,
    filters: any
  ): PipelineSourceType[] {
    if (!sourcesData.sources) {
      return [];
    }

    const sources = Object.values(sourcesData.sources);

    return sources.filter((source) => {
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
 * Content downloader with retry logic
 */
class ContentDownloader {
  private options: any;

  constructor(
    options: {
      timeout?: number;
      maxRedirects?: number;
      userAgent?: string;
    } = {}
  ) {
    this.options = {
      timeout: options.timeout || 30_000,
      maxRedirects: options.maxRedirects || 5,
      userAgent: 'porter-bridges/1.0.0',
      ...options,
    };
  }

  async downloadContent(url: string) {
    const response = await request(url, {
      method: 'GET',
      headersTimeout: this.options.timeout,
      bodyTimeout: this.options.timeout,
      maxRedirections: this.options.maxRedirects,
      headers: {
        'User-Agent': this.options.userAgent,
        Accept: 'text/html,text/plain,application/xhtml+xml,text/markdown',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Charset': 'utf-8',
        'Accept-Encoding': 'identity', // Disable compression to avoid encoding issues
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    if (response.statusCode < 200 || response.statusCode >= 400) {
      throw new Error(
        `HTTP ${response.statusCode}: ${response.statusCode || 'Request failed'}`
      );
    }

    const content = await response.body.text();

    // Validate content is not corrupted or binary
    if (!content || content.length < 50) {
      throw new Error('Empty or too-short content received');
    }

    if (content.includes('\0')) {
      throw new Error('Binary content detected - expected text content');
    }

    return {
      content,
      metadata: {
        status_code: response.statusCode,
        content_type: response.headers['content-type'] || 'unknown',
        content_length: response.headers['content-length'] || content.length,
        last_modified: response.headers['last-modified'],
        etag: response.headers.etag,
      },
    };
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
          final_url: source.url, // axios handles redirects automatically
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
          code: (error instanceof Error && error.code) || 'unknown_error',
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
 * Main Collection Module class
 */
export class CollectionModule {
  private options: {
    contentDirectory: string;
    maxConcurrent: number;
    progressCallback:
      | ((current: number, total: number, currentFile: string) => void)
      | null;
  };
  private filters: CollectionFilters;
  private stats: CollectionStats;
  private downloader: ContentDownloader;

  constructor(
    options: {
      contentDirectory?: string;
      maxConcurrent?: number;
      progressCallback?:
        | ((current: number, total: number, currentFile: string) => void)
        | null;
    } = {}
  ) {
    this.options = {
      contentDirectory:
        options.contentDirectory || './generated/collected-content',
      maxConcurrent: options.maxConcurrent || 5,
      progressCallback: options.progressCallback || null,
      ...options,
    };

    this.filters = new CollectionFilters();
    this.stats = new CollectionStats();
    this.downloader = new ContentDownloader(this.options);
  }

  /**
   * Main collection entry point
   */
  async collect(
    sourcesData: PipelineState,
    filters: Record<string, unknown> = {}
  ) {
    logger.info('📥 Starting content collection process');
    this.stats.startCollection();

    try {
      // Ensure content directory exists
      await fs.mkdir(this.options.contentDirectory, { recursive: true });

      // Filter sources based on criteria
      const sources = this.filters.filterSources(sourcesData, filters);
      this.stats.setTotalSources(sources.length);

      if (sources.length === 0) {
        logger.warn('⚠️  No sources match the collection criteria');
        this.stats.endCollection();
        return this._buildResults(sourcesData, filters);
      }

      logger.info('🎯 Found sources to collect', { count: sources.length });

      // Process sources sequentially
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i]!;
        try {
          logger.info(
            `📥 ${source.source_type}: ${source.title || source.url}`
          );

          // Call progress callback with current file being processed
          if (this.options.progressCallback) {
            const displayName = `${source.source_type}: ${source.title || source.url}`;
            this.options.progressCallback(i, sources.length, displayName);
          }

          const result = await this.downloader.collectSourceWithRetry(source);

          // Save content to file
          const fileName = this._generateFileName(source.url);
          const filePath = path.join(this.options.contentDirectory, fileName);
          await fs.writeFile(filePath, result.content, 'utf8');

          this.stats.incrementCollected(result.bytes);

          // Update source in sourcesData
          if (sourcesData.sources[source.url]) {
            Object.assign(sourcesData.sources[source.url]!, source);
          }
        } catch (error: unknown) {
          this.stats.incrementFailed();

          // Update source in sourcesData
          if (sourcesData.sources[source.url]) {
            Object.assign(sourcesData.sources[source.url]!, source);
          }

          if (error instanceof Error) {
            logger.error(
              `❌ Collection failed: ${source.url} - ${error.message}`
            );
          } else {
            logger.error(
              { error },
              `❌ Collection failed: ${source.url} - unknown error`
            );
          }
        }
      }

      this.stats.endCollection();

      // Log summary
      this._logSummary();

      return this._buildResults(sourcesData, filters);
    } catch (error: unknown) {
      this.stats.endCollection();
      if (error instanceof Error) {
        logger.error('💥 Collection failed', { error: error.message });
      } else {
        logger.error({ error }, '💥 Collection failed with unknown error');
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
    };
  }

  // Private helper methods

  _generateFileName(url: string): string {
    // Convert URL to safe filename
    const cleaned = url
      .replace(/^https?:\/\//, '')
      .replace(/[^\w\-_.~]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return `${cleaned}.html`;
  }

  _logSummary() {
    const summary = this.stats.getSummary();

    logger.info('📊 Collection Summary', {
      totalSources: summary.total_sources,
      collectedSources: summary.collected_sources,
      failedSources: summary.failed_sources,
      totalBytes: summary.total_bytes,
      totalKB: summary.total_kb,
      durationSeconds: summary.duration_seconds,
    });

    if (summary.collected_sources > 0) {
      const avgTime = summary.duration_seconds / summary.collected_sources;
      const avgSize = summary.total_kb / summary.collected_sources;
      logger.info('⚡ Performance metrics', {
        avgTimePerSourceSeconds: Math.round(avgTime * 10) / 10,
        avgSizePerSourceKB: Math.round(avgSize * 10) / 10,
      });
    }
  }

  /**
   * Resume collection from previous state
   */
  async resumeCollection(sourcesData: any, filters: any = {}): Promise<any> {
    logger.info('🔄 Resuming content collection process');
    // For simplicity, just delegate to regular collect method
    // The filtering logic will handle resume scenarios
    return await this.collect(sourcesData, { ...filters, includeRetry: true });
  }

  _buildResults(sourcesData: any, filters: any): any {
    return {
      sources: sourcesData.sources,
      collection_metadata: {
        collected_at: new Date().toISOString(),
        collection_filters: filters,
        collection_stats: {
          stats: this.stats.getStats(),
          summary: this.stats.getSummary(),
        },
        content_directory: this.options.contentDirectory,
      },
    };
  }
}
