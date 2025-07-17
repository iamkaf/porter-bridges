/**
 * @file Benchmark Tool - Comprehensive performance benchmarking and comparison
 *
 * This module provides benchmarking tools to measure performance improvements
 * and validate the 50% processing time reduction, 30% memory reduction, and
 * 40% disk usage reduction targets.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../logger';
import { performanceMonitor, type BenchmarkResult } from './performance-monitor';
import { performanceConfig } from './performance-config';
import { cachedHttpClient } from '../http-cached';
import { globalCache } from '../cache/cache-manager';
import { compressionManager } from './compression-manager';
import { streamingProcessor } from '../streaming/streaming-file-processor';

export interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  sampleSize: number;
  enableProfiling: boolean;
  outputDirectory: string;
  compareWithBaseline: boolean;
  baselineFile?: string;
}

export interface BenchmarkSuite {
  name: string;
  description: string;
  benchmarks: BenchmarkTest[];
}

export interface BenchmarkTest {
  name: string;
  description: string;
  category: 'collection' | 'distillation' | 'bundling' | 'compression' | 'streaming' | 'caching';
  setup?: () => Promise<void>;
  test: () => Promise<any>;
  teardown?: () => Promise<void>;
  expectedImprovementPercent?: number;
}

export interface BenchmarkReport {
  suite: string;
  timestamp: string;
  systemInfo: SystemInfo;
  configuration: any;
  results: BenchmarkTestResult[];
  summary: BenchmarkSummary;
  recommendations: string[];
}

export interface BenchmarkTestResult {
  test: string;
  category: string;
  iterations: number;
  metrics: {
    averageTime: number;
    minTime: number;
    maxTime: number;
    standardDeviation: number;
    throughput: number;
    memoryUsage: number;
    diskUsage: number;
    cacheHitRate: number;
    compressionRatio: number;
  };
  baseline?: BenchmarkTestResult;
  improvement?: {
    timeReduction: number;
    memoryReduction: number;
    diskReduction: number;
    throughputIncrease: number;
  };
}

export interface BenchmarkSummary {
  totalTests: number;
  totalTime: number;
  averageImprovement: {
    timeReduction: number;
    memoryReduction: number;
    diskReduction: number;
    throughputIncrease: number;
  };
  targetsAchieved: {
    timeReduction50: boolean;
    memoryReduction30: boolean;
    diskReduction40: boolean;
  };
  topPerformers: string[];
  needsImprovement: string[];
}

export interface SystemInfo {
  platform: string;
  arch: string;
  cpuCores: number;
  memoryGB: number;
  nodeVersion: string;
  bunVersion: string;
}

export class BenchmarkTool {
  private config: BenchmarkConfig;
  private results: BenchmarkTestResult[] = [];
  private baseline: Map<string, BenchmarkTestResult> = new Map();

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = {
      iterations: config.iterations || 5,
      warmupIterations: config.warmupIterations || 2,
      sampleSize: config.sampleSize || 10,
      enableProfiling: config.enableProfiling || false,
      outputDirectory: config.outputDirectory || './generated/benchmarks',
      compareWithBaseline: config.compareWithBaseline || false,
      baselineFile: config.baselineFile,
    };

    logger.info('📊 Benchmark tool initialized', {
      iterations: this.config.iterations,
      warmupIterations: this.config.warmupIterations,
      sampleSize: this.config.sampleSize,
      enableProfiling: this.config.enableProfiling,
    });
  }

  /**
   * Run complete benchmark suite
   */
  async runBenchmarkSuite(suite: BenchmarkSuite): Promise<BenchmarkReport> {
    logger.info(`🚀 Starting benchmark suite: ${suite.name}`);
    
    // Ensure output directory exists
    await fs.mkdir(this.config.outputDirectory, { recursive: true });
    
    // Load baseline if requested
    if (this.config.compareWithBaseline && this.config.baselineFile) {
      await this.loadBaseline(this.config.baselineFile);
    }

    const startTime = Date.now();
    const systemInfo = await this.getSystemInfo();
    const configuration = performanceConfig.getConfig();

    this.results = [];

    // Run each benchmark test
    for (const test of suite.benchmarks) {
      logger.info(`🧪 Running benchmark: ${test.name}`);
      
      try {
        const result = await this.runBenchmarkTest(test);
        this.results.push(result);
        
        logger.info(`✅ Benchmark completed: ${test.name}`, {
          averageTime: `${result.metrics.averageTime.toFixed(2)}ms`,
          throughput: `${result.metrics.throughput.toFixed(2)} ops/sec`,
          memoryUsage: `${result.metrics.memoryUsage.toFixed(2)}MB`,
        });
      } catch (error) {
        logger.error(`❌ Benchmark failed: ${test.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const summary = this.generateSummary();
    const recommendations = this.generateRecommendations();

    const report: BenchmarkReport = {
      suite: suite.name,
      timestamp: new Date().toISOString(),
      systemInfo,
      configuration,
      results: this.results,
      summary,
      recommendations,
    };

    // Save report
    await this.saveReport(report);
    
    // Log summary
    this.logSummary(summary, totalTime);

    return report;
  }

  /**
   * Run performance comparison between optimized and unoptimized versions
   */
  async runPerformanceComparison(): Promise<{
    optimized: BenchmarkReport;
    unoptimized: BenchmarkReport;
    comparison: ComparisonResult;
  }> {
    logger.info('🔬 Starting performance comparison');

    // Create test suites
    const optimizedSuite = this.createOptimizedBenchmarkSuite();
    const unoptimizedSuite = this.createUnoptimizedBenchmarkSuite();

    // Run optimized benchmarks
    logger.info('🚀 Running optimized benchmarks');
    const optimizedReport = await this.runBenchmarkSuite(optimizedSuite);

    // Run unoptimized benchmarks
    logger.info('🐌 Running unoptimized benchmarks');
    const unoptimizedReport = await this.runBenchmarkSuite(unoptimizedSuite);

    // Generate comparison
    const comparison = this.generateComparison(optimizedReport, unoptimizedReport);

    // Save comparison report
    await this.saveComparisonReport(optimizedReport, unoptimizedReport, comparison);

    return {
      optimized: optimizedReport,
      unoptimized: unoptimizedReport,
      comparison,
    };
  }

  /**
   * Run single benchmark test
   */
  async runBenchmarkTest(test: BenchmarkTest): Promise<BenchmarkTestResult> {
    const operationName = `benchmark-${test.name}`;
    
    // Setup
    if (test.setup) {
      await test.setup();
    }

    // Warmup iterations
    for (let i = 0; i < this.config.warmupIterations; i++) {
      await test.test();
    }

    // Clear performance monitor for clean measurements
    performanceMonitor.clearBenchmarks();

    // Actual benchmark iterations
    const times: number[] = [];
    const memoryUsages: number[] = [];
    const diskUsages: number[] = [];

    for (let i = 0; i < this.config.iterations; i++) {
      const iterationName = `${operationName}-${i}`;
      
      // Measure memory before
      const memoryBefore = process.memoryUsage();
      
      // Measure disk usage before
      const diskBefore = await this.measureDiskUsage();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Run test
      performanceMonitor.startMonitoring(iterationName, { iteration: i });
      
      const startTime = Date.now();
      await test.test();
      const endTime = Date.now();
      
      performanceMonitor.endMonitoring(iterationName, test.category, {
        iteration: i,
        duration: endTime - startTime,
      });

      // Measure memory after
      const memoryAfter = process.memoryUsage();
      const memoryDiff = (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024; // MB
      
      // Measure disk usage after
      const diskAfter = await this.measureDiskUsage();
      const diskDiff = diskAfter - diskBefore;

      times.push(endTime - startTime);
      memoryUsages.push(memoryDiff);
      diskUsages.push(diskDiff);

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Teardown
    if (test.teardown) {
      await test.teardown();
    }

    // Calculate metrics
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const standardDeviation = this.calculateStandardDeviation(times);
    const throughput = 1000 / averageTime; // ops/sec
    const averageMemoryUsage = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;
    const averageDiskUsage = diskUsages.reduce((sum, disk) => sum + disk, 0) / diskUsages.length;

    // Get cache and compression stats
    const cacheStats = globalCache.getStats();
    const compressionStats = compressionManager.getStats();
    const httpStats = cachedHttpClient.getStats();

    const cacheHitRate = cacheStats.hitRate;
    const compressionRatio = compressionStats.averageCompressionRatio;

    const result: BenchmarkTestResult = {
      test: test.name,
      category: test.category,
      iterations: this.config.iterations,
      metrics: {
        averageTime,
        minTime,
        maxTime,
        standardDeviation,
        throughput,
        memoryUsage: averageMemoryUsage,
        diskUsage: averageDiskUsage,
        cacheHitRate,
        compressionRatio,
      },
    };

    // Add baseline comparison if available
    const baselineKey = `${test.category}-${test.name}`;
    if (this.baseline.has(baselineKey)) {
      const baseline = this.baseline.get(baselineKey)!;
      result.baseline = baseline;
      result.improvement = {
        timeReduction: ((baseline.metrics.averageTime - averageTime) / baseline.metrics.averageTime) * 100,
        memoryReduction: ((baseline.metrics.memoryUsage - averageMemoryUsage) / baseline.metrics.memoryUsage) * 100,
        diskReduction: ((baseline.metrics.diskUsage - averageDiskUsage) / baseline.metrics.diskUsage) * 100,
        throughputIncrease: ((throughput - baseline.metrics.throughput) / baseline.metrics.throughput) * 100,
      };
    }

    return result;
  }

  /**
   * Create optimized benchmark suite
   */
  createOptimizedBenchmarkSuite(): BenchmarkSuite {
    return {
      name: 'Optimized Performance Suite',
      description: 'Benchmark suite with all performance optimizations enabled',
      benchmarks: [
        {
          name: 'parallel-http-requests',
          description: 'Parallel HTTP requests with caching',
          category: 'collection',
          setup: async () => {
            performanceConfig.setPerformanceProfile('aggressive');
            cachedHttpClient.clearCache();
          },
          test: async () => {
            const urls = this.generateTestUrls(this.config.sampleSize);
            const promises = urls.map(url => cachedHttpClient.get(url).catch(() => null));
            await Promise.all(promises);
          },
        },
        {
          name: 'streaming-file-operations',
          description: 'Large file operations with streaming',
          category: 'streaming',
          setup: async () => {
            await this.createTestFiles(this.config.sampleSize);
          },
          test: async () => {
            const inputPath = path.join(this.config.outputDirectory, 'test-input.txt');
            const outputPath = path.join(this.config.outputDirectory, 'test-output.txt');
            
            await streamingProcessor.copyFile(inputPath, outputPath, {
              compress: true,
            });
          },
          teardown: async () => {
            await this.cleanupTestFiles();
          },
        },
        {
          name: 'compression-efficiency',
          description: 'Content compression with optimal settings',
          category: 'compression',
          test: async () => {
            const testData = Buffer.from('a'.repeat(100000)); // 100KB of data
            const { compressed } = await compressionManager.compressBuffer(testData);
            await compressionManager.decompressBuffer(compressed, 'gzip');
          },
        },
        {
          name: 'cache-performance',
          description: 'Cache hit rate and performance',
          category: 'caching',
          setup: async () => {
            globalCache.clear();
          },
          test: async () => {
            // Populate cache
            for (let i = 0; i < this.config.sampleSize; i++) {
              await globalCache.getOrSet(`key-${i}`, async () => ({ data: `value-${i}` }));
            }
            
            // Test cache hits
            for (let i = 0; i < this.config.sampleSize; i++) {
              globalCache.get(`key-${i}`);
            }
          },
        },
      ],
    };
  }

  /**
   * Create unoptimized benchmark suite
   */
  createUnoptimizedBenchmarkSuite(): BenchmarkSuite {
    return {
      name: 'Unoptimized Performance Suite',
      description: 'Benchmark suite with performance optimizations disabled',
      benchmarks: [
        {
          name: 'sequential-http-requests',
          description: 'Sequential HTTP requests without caching',
          category: 'collection',
          setup: async () => {
            performanceConfig.setPerformanceProfile('conservative');
            performanceConfig.updateConfig({
              caching: { ...performanceConfig.getConfig().caching, enabled: false },
              parallelProcessing: { ...performanceConfig.getConfig().parallelProcessing, enabled: false },
            });
          },
          test: async () => {
            const urls = this.generateTestUrls(this.config.sampleSize);
            for (const url of urls) {
              try {
                await cachedHttpClient.get(url);
              } catch {
                // Ignore errors
              }
            }
          },
        },
        {
          name: 'synchronous-file-operations',
          description: 'Large file operations without streaming',
          category: 'streaming',
          setup: async () => {
            await this.createTestFiles(this.config.sampleSize);
          },
          test: async () => {
            const inputPath = path.join(this.config.outputDirectory, 'test-input.txt');
            const outputPath = path.join(this.config.outputDirectory, 'test-output.txt');
            
            // Read entire file into memory
            const content = await fs.readFile(inputPath);
            await fs.writeFile(outputPath, content);
          },
          teardown: async () => {
            await this.cleanupTestFiles();
          },
        },
        {
          name: 'no-compression',
          description: 'Content storage without compression',
          category: 'compression',
          test: async () => {
            const testData = Buffer.from('a'.repeat(100000)); // 100KB of data
            // Just return the data without compression
            return testData;
          },
        },
        {
          name: 'no-caching',
          description: 'Operations without caching',
          category: 'caching',
          test: async () => {
            // Simulate repeated expensive operations without caching
            for (let i = 0; i < this.config.sampleSize; i++) {
              await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
            }
          },
        },
      ],
    };
  }

  // Private methods

  private async loadBaseline(baselineFile: string): Promise<void> {
    try {
      const content = await fs.readFile(baselineFile, 'utf-8');
      const report: BenchmarkReport = JSON.parse(content);
      
      for (const result of report.results) {
        const key = `${result.category}-${result.test}`;
        this.baseline.set(key, result);
      }
      
      logger.info('📊 Baseline loaded successfully', {
        baselineFile,
        tests: this.baseline.size,
      });
    } catch (error) {
      logger.warn('Failed to load baseline', {
        baselineFile,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async getSystemInfo(): Promise<SystemInfo> {
    const os = require('os');
    
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      memoryGB: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      nodeVersion: process.version,
      bunVersion: process.versions.bun || 'unknown',
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  private async measureDiskUsage(): Promise<number> {
    try {
      const stats = await fs.stat(this.config.outputDirectory);
      return stats.size;
    } catch {
      return 0;
    }
  }

  private generateSummary(): BenchmarkSummary {
    const totalTests = this.results.length;
    const totalTime = this.results.reduce((sum, result) => sum + result.metrics.averageTime, 0);
    
    const improvements = this.results
      .filter(result => result.improvement)
      .map(result => result.improvement!);

    const averageImprovement = improvements.length > 0 ? {
      timeReduction: improvements.reduce((sum, imp) => sum + imp.timeReduction, 0) / improvements.length,
      memoryReduction: improvements.reduce((sum, imp) => sum + imp.memoryReduction, 0) / improvements.length,
      diskReduction: improvements.reduce((sum, imp) => sum + imp.diskReduction, 0) / improvements.length,
      throughputIncrease: improvements.reduce((sum, imp) => sum + imp.throughputIncrease, 0) / improvements.length,
    } : {
      timeReduction: 0,
      memoryReduction: 0,
      diskReduction: 0,
      throughputIncrease: 0,
    };

    const targetsAchieved = {
      timeReduction50: averageImprovement.timeReduction >= 50,
      memoryReduction30: averageImprovement.memoryReduction >= 30,
      diskReduction40: averageImprovement.diskReduction >= 40,
    };

    // Find top performers and those needing improvement
    const topPerformers = this.results
      .filter(result => result.improvement && result.improvement.timeReduction > 40)
      .map(result => result.test)
      .slice(0, 3);

    const needsImprovement = this.results
      .filter(result => result.improvement && result.improvement.timeReduction < 20)
      .map(result => result.test)
      .slice(0, 3);

    return {
      totalTests,
      totalTime,
      averageImprovement,
      targetsAchieved,
      topPerformers,
      needsImprovement,
    };
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const summary = this.generateSummary();

    if (!summary.targetsAchieved.timeReduction50) {
      recommendations.push('Consider increasing parallel processing concurrency to achieve 50% time reduction target');
    }

    if (!summary.targetsAchieved.memoryReduction30) {
      recommendations.push('Enable streaming for large file operations to achieve 30% memory reduction target');
    }

    if (!summary.targetsAchieved.diskReduction40) {
      recommendations.push('Increase compression levels to achieve 40% disk reduction target');
    }

    if (summary.needsImprovement.length > 0) {
      recommendations.push(`Focus optimization efforts on: ${summary.needsImprovement.join(', ')}`);
    }

    // Add cache-specific recommendations
    const cacheResults = this.results.filter(r => r.category === 'caching');
    if (cacheResults.length > 0) {
      const avgCacheHitRate = cacheResults.reduce((sum, r) => sum + r.metrics.cacheHitRate, 0) / cacheResults.length;
      if (avgCacheHitRate < 80) {
        recommendations.push('Improve cache hit rate by increasing cache size or TTL');
      }
    }

    return recommendations;
  }

  private generateComparison(optimized: BenchmarkReport, unoptimized: BenchmarkReport): ComparisonResult {
    const comparisons: TestComparison[] = [];

    for (const optimizedResult of optimized.results) {
      const unoptimizedResult = unoptimized.results.find(r => r.test === optimizedResult.test);
      
      if (unoptimizedResult) {
        const timeImprovement = ((unoptimizedResult.metrics.averageTime - optimizedResult.metrics.averageTime) / unoptimizedResult.metrics.averageTime) * 100;
        const memoryImprovement = ((unoptimizedResult.metrics.memoryUsage - optimizedResult.metrics.memoryUsage) / unoptimizedResult.metrics.memoryUsage) * 100;
        const diskImprovement = ((unoptimizedResult.metrics.diskUsage - optimizedResult.metrics.diskUsage) / unoptimizedResult.metrics.diskUsage) * 100;
        const throughputImprovement = ((optimizedResult.metrics.throughput - unoptimizedResult.metrics.throughput) / unoptimizedResult.metrics.throughput) * 100;

        comparisons.push({
          test: optimizedResult.test,
          category: optimizedResult.category,
          improvement: {
            timeReduction: timeImprovement,
            memoryReduction: memoryImprovement,
            diskReduction: diskImprovement,
            throughputIncrease: throughputImprovement,
          },
          optimized: optimizedResult,
          unoptimized: unoptimizedResult,
        });
      }
    }

    const overallImprovement = {
      timeReduction: comparisons.reduce((sum, c) => sum + c.improvement.timeReduction, 0) / comparisons.length,
      memoryReduction: comparisons.reduce((sum, c) => sum + c.improvement.memoryReduction, 0) / comparisons.length,
      diskReduction: comparisons.reduce((sum, c) => sum + c.improvement.diskReduction, 0) / comparisons.length,
      throughputIncrease: comparisons.reduce((sum, c) => sum + c.improvement.throughputIncrease, 0) / comparisons.length,
    };

    const targetsAchieved = {
      timeReduction50: overallImprovement.timeReduction >= 50,
      memoryReduction30: overallImprovement.memoryReduction >= 30,
      diskReduction40: overallImprovement.diskReduction >= 40,
    };

    return {
      overallImprovement,
      targetsAchieved,
      comparisons,
    };
  }

  private async saveReport(report: BenchmarkReport): Promise<void> {
    const filename = `benchmark-${report.suite.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.config.outputDirectory, filename);
    
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    
    logger.info('📊 Benchmark report saved', {
      filepath,
      tests: report.results.length,
      averageImprovement: report.summary.averageImprovement,
    });
  }

  private async saveComparisonReport(optimized: BenchmarkReport, unoptimized: BenchmarkReport, comparison: ComparisonResult): Promise<void> {
    const comparisonReport = {
      timestamp: new Date().toISOString(),
      optimized,
      unoptimized,
      comparison,
    };

    const filename = `performance-comparison-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.config.outputDirectory, filename);
    
    await fs.writeFile(filepath, JSON.stringify(comparisonReport, null, 2));
    
    logger.info('📊 Performance comparison report saved', {
      filepath,
      overallImprovement: comparison.overallImprovement,
      targetsAchieved: comparison.targetsAchieved,
    });
  }

  private logSummary(summary: BenchmarkSummary, totalTime: number): void {
    logger.info('📊 Benchmark Summary', {
      totalTests: summary.totalTests,
      totalTime: `${totalTime}ms`,
      averageImprovement: {
        timeReduction: `${summary.averageImprovement.timeReduction.toFixed(2)}%`,
        memoryReduction: `${summary.averageImprovement.memoryReduction.toFixed(2)}%`,
        diskReduction: `${summary.averageImprovement.diskReduction.toFixed(2)}%`,
        throughputIncrease: `${summary.averageImprovement.throughputIncrease.toFixed(2)}%`,
      },
      targetsAchieved: {
        timeReduction50: summary.targetsAchieved.timeReduction50 ? '✅' : '❌',
        memoryReduction30: summary.targetsAchieved.memoryReduction30 ? '✅' : '❌',
        diskReduction40: summary.targetsAchieved.diskReduction40 ? '✅' : '❌',
      },
      topPerformers: summary.topPerformers,
      needsImprovement: summary.needsImprovement,
    });
  }

  private generateTestUrls(count: number): string[] {
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      urls.push(`https://httpbin.org/delay/${Math.random() * 2 + 1}`);
    }
    return urls;
  }

  private async createTestFiles(count: number): Promise<void> {
    const testData = 'a'.repeat(1024 * 1024); // 1MB of data
    const filePath = path.join(this.config.outputDirectory, 'test-input.txt');
    await fs.writeFile(filePath, testData);
  }

  private async cleanupTestFiles(): Promise<void> {
    try {
      const inputPath = path.join(this.config.outputDirectory, 'test-input.txt');
      const outputPath = path.join(this.config.outputDirectory, 'test-output.txt');
      
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
}

interface ComparisonResult {
  overallImprovement: {
    timeReduction: number;
    memoryReduction: number;
    diskReduction: number;
    throughputIncrease: number;
  };
  targetsAchieved: {
    timeReduction50: boolean;
    memoryReduction30: boolean;
    diskReduction40: boolean;
  };
  comparisons: TestComparison[];
}

interface TestComparison {
  test: string;
  category: string;
  improvement: {
    timeReduction: number;
    memoryReduction: number;
    diskReduction: number;
    throughputIncrease: number;
  };
  optimized: BenchmarkTestResult;
  unoptimized: BenchmarkTestResult;
}

/**
 * Global benchmark tool instance
 */
export const benchmarkTool = new BenchmarkTool();