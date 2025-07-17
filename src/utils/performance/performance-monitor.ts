/**
 * @file Performance Monitor - Comprehensive performance monitoring and benchmarking
 *
 * This module provides real-time performance monitoring, metrics collection,
 * and benchmarking capabilities for all pipeline operations.
 */

import { logger } from '../logger';

export interface PerformanceMetrics {
  // Timing metrics
  startTime: number;
  endTime?: number;
  duration?: number;
  
  // Memory metrics
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  
  // Processing metrics
  itemsProcessed: number;
  itemsPerSecond?: number;
  
  // Custom metrics
  customMetrics: Record<string, number>;
}

export interface BenchmarkResult {
  name: string;
  metrics: PerformanceMetrics;
  timestamp: string;
  phase: string;
  configuration: Record<string, any>;
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private benchmarks: BenchmarkResult[] = [];
  private intervalId?: NodeJS.Timeout;
  private isMonitoring = false;

  constructor(private monitoringInterval = 1000) {}

  /**
   * Start monitoring performance for a specific operation
   */
  startMonitoring(operationName: string, configuration: Record<string, any> = {}): void {
    const metrics: PerformanceMetrics = {
      startTime: Date.now(),
      memoryUsage: this.getCurrentMemoryUsage(),
      itemsProcessed: 0,
      customMetrics: {},
    };

    this.metrics.set(operationName, metrics);
    
    logger.info(`📊 Performance monitoring started for ${operationName}`, {
      operation: operationName,
      configuration,
      initialMemory: this.formatMemoryUsage(metrics.memoryUsage),
    });

    // Start continuous monitoring if not already running
    if (!this.isMonitoring) {
      this.startContinuousMonitoring();
    }
  }

  /**
   * Update metrics for an ongoing operation
   */
  updateMetrics(operationName: string, updates: Partial<PerformanceMetrics>): void {
    const existing = this.metrics.get(operationName);
    if (!existing) {
      logger.warn(`No performance monitoring found for operation: ${operationName}`);
      return;
    }

    // Update metrics
    Object.assign(existing, updates);
    
    // Update memory usage
    existing.memoryUsage = this.getCurrentMemoryUsage();
    
    // Calculate items per second if items processed is updated
    if (updates.itemsProcessed !== undefined) {
      const elapsed = (Date.now() - existing.startTime) / 1000;
      existing.itemsPerSecond = elapsed > 0 ? existing.itemsProcessed / elapsed : 0;
    }
  }

  /**
   * Increment processed items counter
   */
  incrementProcessed(operationName: string, count = 1): void {
    const existing = this.metrics.get(operationName);
    if (existing) {
      existing.itemsProcessed += count;
      
      // Update items per second
      const elapsed = (Date.now() - existing.startTime) / 1000;
      existing.itemsPerSecond = elapsed > 0 ? existing.itemsProcessed / elapsed : 0;
    }
  }

  /**
   * Add custom metric
   */
  addCustomMetric(operationName: string, metricName: string, value: number): void {
    const existing = this.metrics.get(operationName);
    if (existing) {
      existing.customMetrics[metricName] = value;
    }
  }

  /**
   * End monitoring and generate benchmark result
   */
  endMonitoring(operationName: string, phase: string, configuration: Record<string, any> = {}): BenchmarkResult | null {
    const metrics = this.metrics.get(operationName);
    if (!metrics) {
      logger.warn(`No performance monitoring found for operation: ${operationName}`);
      return null;
    }

    // Finalize metrics
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.memoryUsage = this.getCurrentMemoryUsage();
    
    // Calculate final items per second
    const durationSeconds = metrics.duration / 1000;
    metrics.itemsPerSecond = durationSeconds > 0 ? metrics.itemsProcessed / durationSeconds : 0;

    // Create benchmark result
    const benchmarkResult: BenchmarkResult = {
      name: operationName,
      metrics: { ...metrics },
      timestamp: new Date().toISOString(),
      phase,
      configuration,
    };

    this.benchmarks.push(benchmarkResult);
    this.metrics.delete(operationName);

    logger.info(`📊 Performance monitoring completed for ${operationName}`, {
      operation: operationName,
      phase,
      duration: `${metrics.duration}ms`,
      itemsProcessed: metrics.itemsProcessed,
      itemsPerSecond: metrics.itemsPerSecond?.toFixed(2),
      finalMemory: this.formatMemoryUsage(metrics.memoryUsage),
      customMetrics: metrics.customMetrics,
    });

    return benchmarkResult;
  }

  /**
   * Get current metrics for an operation
   */
  getCurrentMetrics(operationName: string): PerformanceMetrics | null {
    const metrics = this.metrics.get(operationName);
    if (!metrics) {
      return null;
    }

    // Return current snapshot
    return {
      ...metrics,
      memoryUsage: this.getCurrentMemoryUsage(),
      duration: Date.now() - metrics.startTime,
    };
  }

  /**
   * Get all benchmark results
   */
  getBenchmarks(): BenchmarkResult[] {
    return [...this.benchmarks];
  }

  /**
   * Get benchmark results for a specific phase
   */
  getBenchmarksForPhase(phase: string): BenchmarkResult[] {
    return this.benchmarks.filter(b => b.phase === phase);
  }

  /**
   * Compare performance between two operations
   */
  compareBenchmarks(operation1: string, operation2: string): {
    operation1: BenchmarkResult | null;
    operation2: BenchmarkResult | null;
    comparison: {
      durationImprovement: number;
      memoryImprovement: number;
      throughputImprovement: number;
    } | null;
  } {
    const bench1 = this.benchmarks.find(b => b.name === operation1);
    const bench2 = this.benchmarks.find(b => b.name === operation2);

    if (!bench1 || !bench2) {
      return {
        operation1: bench1 || null,
        operation2: bench2 || null,
        comparison: null,
      };
    }

    const durationImprovement = bench1.metrics.duration && bench2.metrics.duration
      ? ((bench1.metrics.duration - bench2.metrics.duration) / bench1.metrics.duration) * 100
      : 0;

    const memoryImprovement = ((bench1.metrics.memoryUsage.heapUsed - bench2.metrics.memoryUsage.heapUsed) / bench1.metrics.memoryUsage.heapUsed) * 100;

    const throughputImprovement = bench1.metrics.itemsPerSecond && bench2.metrics.itemsPerSecond
      ? ((bench2.metrics.itemsPerSecond - bench1.metrics.itemsPerSecond) / bench1.metrics.itemsPerSecond) * 100
      : 0;

    return {
      operation1: bench1,
      operation2: bench2,
      comparison: {
        durationImprovement,
        memoryImprovement,
        throughputImprovement,
      },
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    summary: {
      totalBenchmarks: number;
      averageDuration: number;
      averageMemoryUsage: number;
      averageThroughput: number;
    };
    benchmarks: BenchmarkResult[];
    recommendations: string[];
  } {
    if (this.benchmarks.length === 0) {
      return {
        summary: {
          totalBenchmarks: 0,
          averageDuration: 0,
          averageMemoryUsage: 0,
          averageThroughput: 0,
        },
        benchmarks: [],
        recommendations: ['No benchmarks available. Start monitoring operations to gather performance data.'],
      };
    }

    const validBenchmarks = this.benchmarks.filter(b => b.metrics.duration);
    const totalDuration = validBenchmarks.reduce((sum, b) => sum + (b.metrics.duration || 0), 0);
    const totalMemory = this.benchmarks.reduce((sum, b) => sum + b.metrics.memoryUsage.heapUsed, 0);
    const totalThroughput = this.benchmarks.reduce((sum, b) => sum + (b.metrics.itemsPerSecond || 0), 0);

    const summary = {
      totalBenchmarks: this.benchmarks.length,
      averageDuration: validBenchmarks.length > 0 ? totalDuration / validBenchmarks.length : 0,
      averageMemoryUsage: totalMemory / this.benchmarks.length,
      averageThroughput: totalThroughput / this.benchmarks.length,
    };

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (summary.averageDuration > 60000) {
      recommendations.push('Consider enabling parallel processing to reduce operation duration');
    }
    
    if (summary.averageMemoryUsage > 500 * 1024 * 1024) {
      recommendations.push('High memory usage detected. Consider enabling streaming for large operations');
    }
    
    if (summary.averageThroughput < 1) {
      recommendations.push('Low throughput detected. Consider optimizing batch sizes or enabling caching');
    }

    return {
      summary,
      benchmarks: [...this.benchmarks],
      recommendations,
    };
  }

  /**
   * Clear all benchmarks
   */
  clearBenchmarks(): void {
    this.benchmarks = [];
    logger.info('📊 Performance benchmarks cleared');
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.isMonitoring = false;
    }
  }

  // Private methods

  private getCurrentMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    };
  }

  private formatMemoryUsage(usage: PerformanceMetrics['memoryUsage']): string {
    return `${Math.round(usage.heapUsed / 1024 / 1024)}MB heap, ${Math.round(usage.rss / 1024 / 1024)}MB RSS`;
  }

  private startContinuousMonitoring(): void {
    this.isMonitoring = true;
    this.intervalId = setInterval(() => {
      // Update memory usage for all active operations
      for (const [operationName, metrics] of this.metrics.entries()) {
        metrics.memoryUsage = this.getCurrentMemoryUsage();
      }
    }, this.monitoringInterval);
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance monitoring decorator
 */
export function withPerformanceMonitoring<T extends any[], R>(
  operationName: string,
  phase: string,
  configuration: Record<string, any> = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: T): Promise<R> {
      performanceMonitor.startMonitoring(operationName, configuration);
      
      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } finally {
        performanceMonitor.endMonitoring(operationName, phase, configuration);
      }
    };

    return descriptor;
  };
}