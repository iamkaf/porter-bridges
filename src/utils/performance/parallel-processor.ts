/**
 * @file Parallel Processor - Controlled concurrency framework for parallel processing
 *
 * This module provides a robust parallel processing framework with configurable
 * concurrency limits, batch processing, error handling, and progress tracking.
 */

import pLimit from 'p-limit';
import { logger } from '../logger';
import { performanceMonitor } from './performance-monitor';

export interface ParallelProcessingConfig {
  maxConcurrency: number;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
  progressCallback?: (processed: number, total: number, item: any) => void;
  errorHandler?: (error: Error, item: any) => 'retry' | 'skip' | 'fail';
}

export interface ProcessingResult<T> {
  item: T;
  success: boolean;
  result?: any;
  error?: Error;
  attempts: number;
  processingTime: number;
}

export interface BatchResult<T> {
  totalItems: number;
  successful: number;
  failed: number;
  results: ProcessingResult<T>[];
  totalTime: number;
  averageTime: number;
  throughput: number;
}

export class ParallelProcessor {
  private config: ParallelProcessingConfig;
  private limiter: ReturnType<typeof pLimit>;

  constructor(config: Partial<ParallelProcessingConfig> = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency || 5,
      batchSize: config.batchSize || 10,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      progressCallback: config.progressCallback,
      errorHandler: config.errorHandler,
    };

    this.limiter = pLimit(this.config.maxConcurrency);

    logger.info('🔄 Parallel processor initialized', {
      maxConcurrency: this.config.maxConcurrency,
      batchSize: this.config.batchSize,
      retryAttempts: this.config.retryAttempts,
    });
  }

  /**
   * Process items in parallel with controlled concurrency
   */
  async processItems<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    operationName = 'parallel-processing'
  ): Promise<BatchResult<T>> {
    if (items.length === 0) {
      return this.createEmptyResult();
    }

    const startTime = Date.now();
    performanceMonitor.startMonitoring(operationName, {
      itemCount: items.length,
      maxConcurrency: this.config.maxConcurrency,
      batchSize: this.config.batchSize,
    });

    logger.info(`🚀 Starting parallel processing of ${items.length} items`, {
      operation: operationName,
      maxConcurrency: this.config.maxConcurrency,
      batchSize: this.config.batchSize,
    });

    const results: ProcessingResult<T>[] = [];
    let processedCount = 0;

    // Process items in batches
    const batches = this.createBatches(items);

    for (const [batchIndex, batch] of batches.entries()) {
      logger.info(`📦 Processing batch ${batchIndex + 1}/${batches.length}`, {
        batchSize: batch.length,
        totalProcessed: processedCount,
        remainingItems: items.length - processedCount,
      });

      // Process batch items in parallel
      const batchPromises = batch.map((item) =>
        this.limiter(async () => {
          const result = await this.processItemWithRetry(
            item,
            processor,
            operationName
          );

          processedCount++;
          performanceMonitor.incrementProcessed(operationName);

          // Call progress callback if provided
          if (this.config.progressCallback) {
            this.config.progressCallback(processedCount, items.length, item);
          }

          return result;
        })
      );

      // Wait for batch completion
      const batchResults = await Promise.allSettled(batchPromises);

      // Process batch results
      for (const promiseResult of batchResults) {
        if (promiseResult.status === 'fulfilled') {
          results.push(promiseResult.value);
        } else {
          logger.error('Batch processing error', {
            error: promiseResult.reason,
            batchIndex,
          });

          // Create failed result for unknown item
          results.push({
            item: null as any,
            success: false,
            error: promiseResult.reason,
            attempts: 0,
            processingTime: 0,
          });
        }
      }

      // Add small delay between batches to prevent overwhelming
      if (batchIndex < batches.length - 1) {
        await this.sleep(100);
      }
    }

    const totalTime = Date.now() - startTime;
    const batchResult = this.createBatchResult(results, totalTime);

    performanceMonitor.endMonitoring(operationName, 'processing', {
      totalItems: items.length,
      successful: batchResult.successful,
      failed: batchResult.failed,
      throughput: batchResult.throughput,
    });

    this.logBatchSummary(operationName, batchResult);
    return batchResult;
  }

  /**
   * Process items with mapping transformation
   */
  async mapItems<T, R>(
    items: T[],
    mapper: (item: T) => Promise<R>,
    operationName = 'parallel-mapping'
  ): Promise<R[]> {
    const batchResult = await this.processItems(items, mapper, operationName);
    return batchResult.results.filter((r) => r.success).map((r) => r.result);
  }

  /**
   * Process items with filtering
   */
  async filterItems<T>(
    items: T[],
    predicate: (item: T) => Promise<boolean>,
    operationName = 'parallel-filtering'
  ): Promise<T[]> {
    const batchResult = await this.processItems(
      items,
      predicate,
      operationName
    );
    return batchResult.results
      .filter((r) => r.success && r.result)
      .map((r) => r.item);
  }

  /**
   * Update concurrency limit dynamically
   */
  updateConcurrency(newLimit: number): void {
    this.config.maxConcurrency = newLimit;
    this.limiter = pLimit(newLimit);

    logger.info(`🔄 Concurrency limit updated to ${newLimit}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): ParallelProcessingConfig {
    return { ...this.config };
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    activePromises: number;
    pendingPromises: number;
    maxConcurrency: number;
  } {
    return {
      activePromises: this.limiter.activeCount,
      pendingPromises: this.limiter.pendingCount,
      maxConcurrency: this.config.maxConcurrency,
    };
  }

  // Private methods

  private async processItemWithRetry<T, R>(
    item: T,
    processor: (item: T) => Promise<R>,
    operationName: string
  ): Promise<ProcessingResult<T>> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.config.retryAttempts) {
      attempts++;

      try {
        const result = await processor(item);
        const processingTime = Date.now() - startTime;

        return {
          item,
          success: true,
          result,
          attempts,
          processingTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn(
          `⚠️ Processing failed for item (attempt ${attempts}/${this.config.retryAttempts})`,
          {
            operation: operationName,
            error: lastError.message,
            item: this.safeStringify(item),
          }
        );

        // Check if custom error handler wants to control retry behavior
        if (this.config.errorHandler) {
          const action = this.config.errorHandler(lastError, item);

          if (action === 'skip') {
            break;
          }
          if (action === 'fail') {
            throw lastError;
          }
          // 'retry' continues the loop
        }

        // Wait before retry (exponential backoff)
        if (attempts < this.config.retryAttempts) {
          const delay = this.config.retryDelay * 2 ** (attempts - 1);
          await this.sleep(delay);
        }
      }
    }

    const processingTime = Date.now() - startTime;
    return {
      item,
      success: false,
      error: lastError,
      attempts,
      processingTime,
    };
  }

  private createBatches<T>(items: T[]): T[][] {
    const batches: T[][] = [];
    const batchSize = this.config.batchSize;

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  private createBatchResult<T>(
    results: ProcessingResult<T>[],
    totalTime: number
  ): BatchResult<T> {
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const averageTime =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.processingTime, 0) / results.length
        : 0;
    const throughput = totalTime > 0 ? (results.length / totalTime) * 1000 : 0;

    return {
      totalItems: results.length,
      successful,
      failed,
      results,
      totalTime,
      averageTime,
      throughput,
    };
  }

  private createEmptyResult<T>(): BatchResult<T> {
    return {
      totalItems: 0,
      successful: 0,
      failed: 0,
      results: [],
      totalTime: 0,
      averageTime: 0,
      throughput: 0,
    };
  }

  private logBatchSummary<T>(
    operationName: string,
    result: BatchResult<T>
  ): void {
    const successRate =
      result.totalItems > 0
        ? Math.round((result.successful / result.totalItems) * 100)
        : 0;

    logger.info(`📊 Parallel processing completed for ${operationName}`, {
      totalItems: result.totalItems,
      successful: result.successful,
      failed: result.failed,
      successRate: `${successRate}%`,
      totalTime: `${result.totalTime}ms`,
      averageTime: `${Math.round(result.averageTime)}ms`,
      throughput: `${result.throughput.toFixed(2)} items/sec`,
    });

    if (result.failed > 0) {
      logger.warn(`⚠️ ${result.failed} items failed processing`, {
        operation: operationName,
        failedItems: result.results
          .filter((r) => !r.success)
          .map((r) => ({
            item: this.safeStringify(r.item),
            error: r.error?.message,
            attempts: r.attempts,
          }))
          .slice(0, 5), // Show first 5 failures
      });
    }
  }

  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating parallel processors
 */
export function createParallelProcessor(
  config: Partial<ParallelProcessingConfig> = {}
): ParallelProcessor {
  return new ParallelProcessor(config);
}

/**
 * Utility function for quick parallel processing
 */
export async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: Partial<ParallelProcessingConfig> = {}
): Promise<BatchResult<T>> {
  const parallelProcessor = createParallelProcessor(options);
  return parallelProcessor.processItems(items, processor);
}

/**
 * Utility function for quick parallel mapping
 */
export async function mapInParallel<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  options: Partial<ParallelProcessingConfig> = {}
): Promise<R[]> {
  const parallelProcessor = createParallelProcessor(options);
  return parallelProcessor.mapItems(items, mapper);
}

/**
 * Utility function for quick parallel filtering
 */
export async function filterInParallel<T>(
  items: T[],
  predicate: (item: T) => Promise<boolean>,
  options: Partial<ParallelProcessingConfig> = {}
): Promise<T[]> {
  const parallelProcessor = createParallelProcessor(options);
  return parallelProcessor.filterItems(items, predicate);
}
