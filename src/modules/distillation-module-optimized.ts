/**
 * @file Optimized Distillation Module - High-performance AI processing with batching
 *
 * This module provides optimized AI distillation with batch processing,
 * memory management, intelligent caching, and parallel processing for maximum performance.
 */

import { promises as fs } from 'node:fs';
import { logger } from '../utils/logger';
import type { PipelineState } from '../utils/pipeline-state-manager';
import { GeminiProcessor } from './distillation/gemini-processor';
import { 
  ParallelProcessor, 
  createParallelProcessor,
  type ParallelProcessingConfig 
} from '../utils/performance/parallel-processor';
import { performanceMonitor } from '../utils/performance/performance-monitor';
import { globalCache } from '../utils/cache/cache-manager';
import { compressionManager } from '../utils/performance/compression-manager';
import { streamingProcessor } from '../utils/streaming/streaming-file-processor';

/**
 * Enhanced filters for distillation sources with caching
 */
class OptimizedDistillationFilters {
  private processedFilesCache = new Map<string, boolean>();

  async filterSources(sourcesData: any, filters: any, outputDirectory: string) {
    const sources = [];
    let skippedCount = 0;

    // Check for existing distilled files with caching
    let existingFiles: Set<string> = new Set();
    try {
      const cacheKey = `distilled-files-${outputDirectory}`;
      const cachedFiles = globalCache.get(cacheKey);
      
      if (cachedFiles) {
        existingFiles = cachedFiles;
      } else {
        const files = await fs.readdir(outputDirectory);
        existingFiles = new Set(files.filter(f => f.endsWith('.json')));
        
        // Cache the file list for 5 minutes
        globalCache.set(cacheKey, existingFiles, 5 * 60 * 1000);
      }
      
      if (existingFiles.size > 0) {
        logger.info(`🔍 Found ${existingFiles.size} existing distilled files in ${outputDirectory}`);
      }
    } catch (error) {
      // Directory might not exist yet, that's okay
    }

    // Process sources with enhanced filtering
    for (const [sourceKey, source] of Object.entries(sourcesData.sources || {})) {
      const sourceWithKey = { ...(source as any), _sourceKey: sourceKey };

      // Check if this source already has a distilled file
      const outputFilename = `${(source as any).url.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      
      if (existingFiles.has(outputFilename) && !filters.forceReprocess) {
        // Update the source status to distilled if file exists
        (source as any).status = 'distilled';
        (source as any).distilled_at = (source as any).distilled_at || new Date().toISOString();
        
        // Apply this update back to the sourcesData immediately
        if (sourcesData.sources && sourcesData.sources[sourceKey]) {
          sourcesData.sources[sourceKey].status = 'distilled';
          sourcesData.sources[sourceKey].distilled_at = (source as any).distilled_at;
        }
        
        logger.debug(`⏭️  Skipping already distilled: ${(source as any).url}`);
        skippedCount++;
        continue;
      }

      // Skip sources marked to skip distillation
      if ((source as any).processing_hints?.skip_distillation) {
        // Update status to indicate it was skipped
        (source as any).status = 'packaged';
        (source as any).distillation_metadata = {
          skipped: true,
          reason: 'skip_distillation hint',
          timestamp: new Date().toISOString()
        };
        
        // Apply this update back to the sourcesData immediately
        if (sourcesData.sources && sourcesData.sources[sourceKey]) {
          sourcesData.sources[sourceKey].status = 'packaged';
          sourcesData.sources[sourceKey].distillation_metadata = (source as any).distillation_metadata;
        }
        
        logger.debug(`⏭️  Skipping distillation (marked to skip): ${(source as any).url}`);
        skippedCount++;
        continue;
      }

      // Enhanced filtering logic
      if (!this.shouldProcessSource(source as any, filters)) {
        continue;
      }

      sources.push(sourceWithKey);
    }

    if (skippedCount > 0) {
      logger.info(`✅ Skipped ${skippedCount} already distilled sources`);
    }

    return { sources, skippedCount };
  }

  private shouldProcessSource(source: any, filters: any): boolean {
    // Only process collected sources (unless retrying)
    if (!filters.includeRetry && source.status !== 'collected') {
      return false;
    }

    // For retry, include failed distillations
    if (
      filters.includeRetry &&
      source.status !== 'collected' &&
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

    if (filters.minRelevance && source.relevance_score < filters.minRelevance) {
      return false;
    }

    return true;
  }
}

/**
 * Enhanced stats tracking for distillation with performance metrics
 */
class OptimizedDistillationStats {
  stats: any;

  constructor() {
    this.reset();
  }

  reset() {
    this.stats = {
      total_sources: 0,
      distilled_sources: 0,
      failed_sources: 0,
      skipped_sources: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_processing_time: 0,
      average_processing_time: 0,
      memory_usage_peak: 0,
      cache_hits: 0,
      cache_misses: 0,
      compression_savings: 0,
      batch_count: 0,
      distillation_start_time: null,
      distillation_end_time: null,
    };
  }

  startDistillation() {
    this.stats.distillation_start_time = new Date().toISOString();
    this.stats.memory_usage_peak = process.memoryUsage().heapUsed;
  }

  setTotalSources(count: number) {
    this.stats.total_sources = count;
  }

  incrementDistilled(processingTime: number = 0) {
    this.stats.distilled_sources++;
    this.stats.total_processing_time += processingTime;
    this.stats.average_processing_time = this.stats.distilled_sources > 0 
      ? this.stats.total_processing_time / this.stats.distilled_sources 
      : 0;
    
    // Update memory usage peak
    const currentMemory = process.memoryUsage().heapUsed;
    if (currentMemory > this.stats.memory_usage_peak) {
      this.stats.memory_usage_peak = currentMemory;
    }
  }

  incrementFailed() {
    this.stats.failed_sources++;
  }

  incrementSkipped() {
    this.stats.skipped_sources++;
  }

  addSkipped(count: number) {
    this.stats.skipped_sources += count;
  }

  incrementCacheHit() {
    this.stats.cache_hits++;
  }

  incrementCacheMiss() {
    this.stats.cache_misses++;
  }

  addCompressionSavings(savings: number) {
    this.stats.compression_savings += savings;
  }

  incrementBatch() {
    this.stats.batch_count++;
  }

  endDistillation() {
    this.stats.distillation_end_time = new Date().toISOString();
  }

  getStats() {
    return { ...this.stats };
  }

  getSummary() {
    const durationMs =
      this.stats.distillation_end_time && this.stats.distillation_start_time
        ? new Date(this.stats.distillation_end_time).getTime() -
          new Date(this.stats.distillation_start_time).getTime()
        : 0;

    const cacheHitRate = (this.stats.cache_hits + this.stats.cache_misses) > 0
      ? (this.stats.cache_hits / (this.stats.cache_hits + this.stats.cache_misses)) * 100
      : 0;

    return {
      total_sources: this.stats.total_sources,
      distilled_sources: this.stats.distilled_sources,
      failed_sources: this.stats.failed_sources,
      skipped_sources: this.stats.skipped_sources,
      success_rate: this.stats.total_sources > 0
        ? Math.round((this.stats.distilled_sources / this.stats.total_sources) * 100)
        : 0,
      total_tokens: this.stats.total_input_tokens + this.stats.total_output_tokens,
      duration_seconds: Math.round(durationMs / 1000),
      average_processing_time: this.stats.average_processing_time,
      memory_usage_peak_mb: Math.round(this.stats.memory_usage_peak / 1024 / 1024),
      cache_hit_rate: cacheHitRate,
      compression_savings_kb: Math.round(this.stats.compression_savings / 1024),
      batch_count: this.stats.batch_count,
      throughput: durationMs > 0 ? (this.stats.distilled_sources / durationMs) * 1000 : 0,
    };
  }
}

/**
 * High-performance Distillation Module with batch processing and optimization
 */
export class OptimizedDistillationModule {
  private options: {
    outputDirectory: string;
    maxConcurrentDistillations: number;
    batchSize: number;
    enableCompression: boolean;
    enableCache: boolean;
    enableStreaming: boolean;
    memoryThresholdMB: number;
    progressCallback: ((current: number, total: number, currentFile: string) => void) | null;
  };
  private filters: OptimizedDistillationFilters;
  private stats: OptimizedDistillationStats;
  private geminiProcessor: GeminiProcessor;
  private parallelProcessor: ParallelProcessor;
  private contentCache = new Map<string, any>();

  constructor(options: any = {}) {
    this.options = {
      outputDirectory: options.outputDirectory || './generated/distilled-content',
      maxConcurrentDistillations: options.maxConcurrentDistillations || 3, // Conservative for AI processing
      batchSize: options.batchSize || 5, // Smaller batches for AI processing
      enableCompression: options.enableCompression !== false,
      enableCache: options.enableCache !== false,
      enableStreaming: options.enableStreaming !== false,
      memoryThresholdMB: options.memoryThresholdMB || 500,
      progressCallback: options.progressCallback || null,
    };

    this.filters = new OptimizedDistillationFilters();
    this.stats = new OptimizedDistillationStats();
    this.geminiProcessor = new GeminiProcessor(this.options);

    // Configure parallel processor for AI workloads
    const parallelConfig: Partial<ParallelProcessingConfig> = {
      maxConcurrency: this.options.maxConcurrentDistillations,
      batchSize: this.options.batchSize,
      retryAttempts: 2, // Reduced retries for AI processing
      retryDelay: 5000, // Longer delay between retries
      progressCallback: this.options.progressCallback,
      errorHandler: (error, item) => {
        logger.warn('Distillation retry for source', {
          url: (item as any).url,
          error: error.message,
        });
        return 'retry';
      },
    };

    this.parallelProcessor = createParallelProcessor(parallelConfig);

    logger.info('🚀 Optimized distillation module initialized', {
      outputDirectory: this.options.outputDirectory,
      maxConcurrentDistillations: this.options.maxConcurrentDistillations,
      batchSize: this.options.batchSize,
      enableCompression: this.options.enableCompression,
      enableCache: this.options.enableCache,
      enableStreaming: this.options.enableStreaming,
      memoryThresholdMB: this.options.memoryThresholdMB,
    });
  }

  /**
   * Update existing distilled status by scanning for existing files
   */
  async updateExistingDistilledStatus(sourcesData: any) {
    try {
      await fs.mkdir(this.options.outputDirectory, { recursive: true });
      const filterResult = await this.filters.filterSources(sourcesData, {}, this.options.outputDirectory);
      
      logger.info(`✅ Skipped ${filterResult.skippedCount} already distilled sources`);
      
      return {
        skippedCount: filterResult.skippedCount,
        sources: filterResult.sources
      };
    } catch (error: unknown) {
      logger.error('Failed to update existing distilled status:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * High-performance distillation with batch processing and optimization
   */
  async distill(sourcesData: any, filters: Record<string, any> = {}) {
    const operationName = 'optimized-distillation';
    
    logger.info('🧪 Starting optimized AI distillation process');
    this.stats.startDistillation();
    
    performanceMonitor.startMonitoring(operationName, {
      enableCompression: this.options.enableCompression,
      enableCache: this.options.enableCache,
      enableStreaming: this.options.enableStreaming,
      maxConcurrentDistillations: this.options.maxConcurrentDistillations,
      batchSize: this.options.batchSize,
    });

    try {
      // Ensure output directory exists
      await fs.mkdir(this.options.outputDirectory, { recursive: true });

      // Verify Gemini CLI is available
      await this.geminiProcessor.verifyGeminiCLI();

      // Filter sources based on criteria
      const filterResult = await this.filters.filterSources(sourcesData, filters, this.options.outputDirectory);
      const sources = filterResult.sources;
      this.stats.setTotalSources(sources.length);
      
      if (filterResult.skippedCount > 0) {
        this.stats.addSkipped(filterResult.skippedCount);
      }

      if (sources.length === 0) {
        const distilledCount = Object.values(sourcesData.sources || {}).filter(
          (s: any) => s.status === 'distilled'
        ).length;
        
        if (distilledCount > 0) {
          logger.info(`✅ All ${distilledCount} sources are already distilled`);
        } else {
          logger.warn('⚠️  No sources match the distillation criteria');
        }
        
        this.stats.endDistillation();
        performanceMonitor.endMonitoring(operationName, 'distillation', { totalSources: 0 });
        return this._buildResults(sourcesData, filters);
      }

      logger.info('🎯 Found sources to distill', { 
        count: sources.length,
        maxConcurrency: this.options.maxConcurrentDistillations,
        batchSize: this.options.batchSize,
      });

      // Group sources by type for better processing
      const sourcesByType = this._groupSourcesByType(sources);
      const alreadyDistilledCount = Object.values(sourcesData.sources || {}).filter(
        (s: any) => s.status === 'distilled'
      ).length;
      
      logger.info('📋 Distillation plan', {
        breakdown: this._getBreakdownCounts(sourcesByType),
        alreadyDistilled: alreadyDistilledCount,
        toProcess: sources.length,
      });

      // Estimate processing time based on content size
      const estimatedMinutes = this.estimateProcessingTime(sources);
      logger.info('⏱️  Estimated processing time', {
        estimatedTimeMinutes: estimatedMinutes,
        memoryThresholdMB: this.options.memoryThresholdMB,
      });

      // Process sources in optimized batches
      const batchResult = await this.parallelProcessor.processItems(
        sources,
        async (source) => {
          const result = await this.distillSingleSourceOptimized(source, sourcesData);
          return result;
        },
        'distillation-processing'
      );

      // Update stats from batch result
      this.stats.incrementDistilled(batchResult.averageTime);
      this.stats.setFailedSources(batchResult.failed);

      this.stats.endDistillation();
      
      performanceMonitor.endMonitoring(operationName, 'distillation', {
        totalSources: sources.length,
        processed: batchResult.totalItems,
        successful: batchResult.successful,
        failed: batchResult.failed,
        throughput: batchResult.throughput,
        averageTime: batchResult.averageTime,
      });

      // Log performance summary
      this._logPerformanceSummary(batchResult);

      return this._buildResults(sourcesData, filters);
    } catch (error: any) {
      this.stats.endDistillation();
      performanceMonitor.endMonitoring(operationName, 'distillation', { error: true });
      
      logger.error('💥 Optimized distillation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get distillation results for export
   */
  getDistillationResults() {
    return {
      stats: this.stats.getStats(),
      summary: this.stats.getSummary(),
      parallelProcessorStats: this.parallelProcessor.getStats(),
      memoryUsage: this.getMemoryUsage(),
      cacheStats: globalCache.getStats(),
    };
  }

  /**
   * Resume distillation from previous state
   */
  async resumeDistillation(sourcesData: any, filters: any = {}): Promise<any> {
    logger.info('🔄 Resuming optimized distillation process');
    return await this.distill(sourcesData, { ...filters, includeRetry: true });
  }

  /**
   * Update processing settings dynamically
   */
  updateProcessingSettings(newConcurrency: number, newBatchSize?: number, newMemoryThreshold?: number): void {
    this.options.maxConcurrentDistillations = newConcurrency;
    if (newBatchSize) {
      this.options.batchSize = newBatchSize;
    }
    if (newMemoryThreshold) {
      this.options.memoryThresholdMB = newMemoryThreshold;
    }
    
    this.parallelProcessor.updateConcurrency(newConcurrency);
    
    logger.info('🔄 Distillation settings updated', {
      maxConcurrency: newConcurrency,
      batchSize: newBatchSize || this.options.batchSize,
      memoryThresholdMB: newMemoryThreshold || this.options.memoryThresholdMB,
    });
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.contentCache.clear();
    globalCache.clear();
    logger.info('📦 Distillation caches cleared');
  }

  /**
   * Force garbage collection if memory usage is high
   */
  async manageMemory(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    
    if (memoryUsageMB > this.options.memoryThresholdMB) {
      logger.warn('🧠 High memory usage detected, performing cleanup', {
        memoryUsageMB: Math.round(memoryUsageMB),
        threshold: this.options.memoryThresholdMB,
      });
      
      // Clear caches
      this.contentCache.clear();
      globalCache.optimize();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const newMemoryUsage = process.memoryUsage();
      const newMemoryUsageMB = newMemoryUsage.heapUsed / 1024 / 1024;
      
      logger.info('🧠 Memory cleanup completed', {
        beforeMB: Math.round(memoryUsageMB),
        afterMB: Math.round(newMemoryUsageMB),
        freedMB: Math.round(memoryUsageMB - newMemoryUsageMB),
      });
    }
  }

  // Private methods

  private async distillSingleSourceOptimized(
    source: any,
    sourcesData: any
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `distilled-${source.url}`;
      if (this.options.enableCache && this.contentCache.has(cacheKey)) {
        this.stats.incrementCacheHit();
        const cachedResult = this.contentCache.get(cacheKey);
        
        logger.debug('🧪 Cache hit for distillation', {
          url: source.url,
          cacheKey,
        });
        
        return cachedResult;
      }

      this.stats.incrementCacheMiss();
      
      // Perform memory management before processing
      await this.manageMemory();

      logger.info(`🧪 ${source.source_type}: ${source.title || source.url}`);

      // Process with Gemini
      const result = await this.geminiProcessor.distillSingleSource(source, {
        output: 'Processing...',
      });

      // Update source with result
      Object.assign(source, result.updatedSource);

      // Cache the result if enabled
      if (this.options.enableCache) {
        this.contentCache.set(cacheKey, result);
      }

      // Update source in sourcesData using the preserved source key
      if (source._sourceKey && sourcesData.sources[source._sourceKey]) {
        Object.assign(sourcesData.sources[source._sourceKey], source);
        sourcesData.sources[source._sourceKey]._sourceKey = undefined;
      }

      const processingTime = Date.now() - startTime;
      this.stats.incrementDistilled(processingTime);

      return result;
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      this.stats.incrementFailed();

      // Update source with error
      source.status = 'failed';
      source.error = {
        code: 'distillation_error',
        message: error.message,
        timestamp: new Date().toISOString(),
        retry_count: (source.error?.retry_count || 0) + 1,
        processing_time: processingTime,
      };

      // Update source in sourcesData using the preserved source key
      if (source._sourceKey && sourcesData.sources[source._sourceKey]) {
        Object.assign(sourcesData.sources[source._sourceKey], source);
        sourcesData.sources[source._sourceKey]._sourceKey = undefined;
      }

      throw error;
    }
  }

  private estimateProcessingTime(sources: any[]): number {
    // More sophisticated estimation based on content size and type
    let totalEstimatedMinutes = 0;
    
    for (const source of sources) {
      const contentSize = source.size_kb || 50; // Default 50KB
      const baseTime = 0.5; // Base 30 seconds per source
      const sizeMultiplier = Math.min(contentSize / 100, 3); // Max 3x multiplier for large content
      
      // Different processing times by source type
      let typeMultiplier = 1;
      switch (source.source_type) {
        case 'github_primer':
          typeMultiplier = 2; // Primers are more complex
          break;
        case 'blog_post':
          typeMultiplier = 1.5; // Blog posts are moderately complex
          break;
        case 'rss_feed':
          typeMultiplier = 0.8; // RSS feeds are simpler
          break;
        default:
          typeMultiplier = 1;
      }
      
      totalEstimatedMinutes += baseTime * sizeMultiplier * typeMultiplier;
    }
    
    // Account for parallelization
    const parallelismFactor = Math.min(this.options.maxConcurrentDistillations, sources.length);
    return Math.ceil(totalEstimatedMinutes / parallelismFactor);
  }

  private getMemoryUsage(): any {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024),
      percentOfThreshold: (usage.heapUsed / (this.options.memoryThresholdMB * 1024 * 1024)) * 100,
    };
  }

  private _groupSourcesByType(sources: any[]) {
    const grouped: Record<string, any[]> = {};
    for (const source of sources) {
      const type = source.source_type || 'unknown';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(source);
    }
    return grouped;
  }

  private _getBreakdownCounts(sourcesByType: Record<string, any[]>) {
    const breakdown: Record<string, number> = {};
    for (const [type, sources] of Object.entries(sourcesByType)) {
      breakdown[type] = sources.length;
    }
    return breakdown;
  }

  private _logPerformanceSummary(batchResult: any): void {
    const summary = this.stats.getSummary();
    const memoryUsage = this.getMemoryUsage();
    const cacheStats = globalCache.getStats();
    const processorStats = this.parallelProcessor.getStats();

    logger.info('📊 Optimized Distillation Performance Summary', {
      totalSources: summary.total_sources,
      distilledSources: summary.distilled_sources,
      failedSources: summary.failed_sources,
      skippedSources: summary.skipped_sources,
      successRate: `${summary.success_rate}%`,
      durationSeconds: summary.duration_seconds,
      throughput: `${summary.throughput.toFixed(2)} sources/sec`,
      averageProcessingTime: `${summary.average_processing_time.toFixed(2)}ms`,
      
      // Memory performance
      memoryUsagePeakMB: summary.memory_usage_peak_mb,
      currentMemoryUsageMB: memoryUsage.heapUsed,
      memoryThresholdMB: this.options.memoryThresholdMB,
      
      // Cache performance
      cacheHitRate: `${summary.cache_hit_rate.toFixed(2)}%`,
      compressionSavingsKB: summary.compression_savings_kb,
      
      // Batch processing performance
      batchCount: summary.batch_count,
      averageBatchTime: batchResult.averageTime,
      batchThroughput: `${batchResult.throughput.toFixed(2)} items/sec`,
      
      // Parallel processing performance
      parallelProcessorStats: processorStats,
    });

    if (summary.distilled_sources > 0) {
      const performanceImprovement = this.calculatePerformanceImprovement(summary.average_processing_time, batchResult.throughput);
      
      logger.info('⚡ Performance Metrics', {
        avgProcessingTimeMs: Math.round(summary.average_processing_time),
        batchThroughput: `${batchResult.throughput.toFixed(2)} items/sec`,
        estimatedSpeedupVsSequential: `${performanceImprovement.toFixed(1)}x`,
        cacheHitRate: `${summary.cache_hit_rate.toFixed(2)}%`,
        memoryEfficiency: `${(100 - memoryUsage.percentOfThreshold).toFixed(1)}%`,
        compressionSavingsKB: summary.compression_savings_kb,
      });
    }
  }

  private calculatePerformanceImprovement(avgProcessingTime: number, throughput: number): number {
    // Estimate improvement vs sequential processing
    const sequentialTime = avgProcessingTime * this.options.maxConcurrentDistillations;
    const parallelTime = 1000 / throughput; // Convert to ms
    return sequentialTime / parallelTime;
  }

  private _buildResults(sourcesData: any, filters: any): any {
    return {
      sources: sourcesData.sources,
      distillation_metadata: {
        distilled_at: new Date().toISOString(),
        distillation_filters: filters,
        distillation_stats: {
          stats: this.stats.getStats(),
          summary: this.stats.getSummary(),
        },
        performance_stats: {
          parallel_processor_stats: this.parallelProcessor.getStats(),
          memory_usage: this.getMemoryUsage(),
          cache_stats: globalCache.getStats(),
        },
        content_directory: this.options.outputDirectory,
        optimization_settings: {
          max_concurrent_distillations: this.options.maxConcurrentDistillations,
          batch_size: this.options.batchSize,
          enable_compression: this.options.enableCompression,
          enable_cache: this.options.enableCache,
          enable_streaming: this.options.enableStreaming,
          memory_threshold_mb: this.options.memoryThresholdMB,
        },
      },
    };
  }
}

export { OptimizedDistillationModule as DistillationModule };