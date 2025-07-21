/**
 * @file Performance Configuration - Centralized performance settings management
 *
 * This module provides centralized configuration for all performance optimizations
 * with environment-specific defaults and runtime adjustment capabilities.
 */

import { logger } from '../logger';

export interface PerformanceConfig {
  // Parallel processing settings
  parallelProcessing: {
    enabled: boolean;
    maxConcurrency: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    memoryThresholdMB: number;
  };

  // Caching settings
  caching: {
    enabled: boolean;
    maxMemoryMB: number;
    ttlMinutes: number;
    httpCacheEnabled: boolean;
    contentCacheEnabled: boolean;
    checkInterval: number;
  };

  // Streaming settings
  streaming: {
    enabled: boolean;
    chunkSize: number;
    thresholdSize: number;
    compressionEnabled: boolean;
    compressionLevel: number;
    maxMemoryMB: number;
  };

  // Compression settings
  compression: {
    enabled: boolean;
    level: number;
    threshold: number;
    memoryLevel: number;
    windowBits: number;
    algorithm: 'gzip' | 'deflate' | 'brotli';
    enableAutoDetection: boolean;
  };

  // Monitoring settings
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    benchmarkingEnabled: boolean;
    memoryMonitoring: boolean;
    performanceReports: boolean;
  };

  // Collection module settings
  collection: {
    maxConcurrency: number;
    batchSize: number;
    enableCache: boolean;
    enableCompression: boolean;
    enableStreaming: boolean;
    timeout: number;
    maxRedirects: number;
  };

  // Distillation module settings
  distillation: {
    maxConcurrency: number;
    batchSize: number;
    enableCache: boolean;
    enableCompression: boolean;
    enableStreaming: boolean;
    memoryThresholdMB: number;
  };

  // Bundle module settings
  bundle: {
    maxConcurrency: number;
    enableCompression: boolean;
    enableStreaming: boolean;
    enableParallelProcessing: boolean;
    compressionLevel: number;
    streamingThreshold: number;
    memoryThresholdMB: number;
  };
}

/**
 * Performance configuration manager
 */
export class PerformanceConfigManager {
  private config: PerformanceConfig;
  private listeners: ((config: PerformanceConfig) => void)[] = [];

  constructor(initialConfig?: Partial<PerformanceConfig>) {
    this.config = this.createDefaultConfig();

    if (initialConfig) {
      this.updateConfig(initialConfig);
    }

    // Load from environment variables
    this.loadFromEnvironment();

    logger.info('⚡ Performance configuration initialized', {
      parallelProcessing: this.config.parallelProcessing.enabled,
      caching: this.config.caching.enabled,
      streaming: this.config.streaming.enabled,
      compression: this.config.compression.enabled,
      monitoring: this.config.monitoring.enabled,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = this.mergeConfig(this.config, newConfig);
    this.notifyListeners();

    logger.info('⚡ Performance configuration updated', {
      changes: this.summarizeChanges(newConfig),
    });
  }

  /**
   * Enable/disable all performance optimizations
   */
  setOptimizationMode(enabled: boolean): void {
    this.updateConfig({
      parallelProcessing: { ...this.config.parallelProcessing, enabled },
      caching: { ...this.config.caching, enabled },
      streaming: { ...this.config.streaming, enabled },
      compression: { ...this.config.compression, enabled },
      monitoring: { ...this.config.monitoring, enabled },
    });
  }

  /**
   * Set performance profile (conservative, balanced, aggressive)
   */
  setPerformanceProfile(
    profile: 'conservative' | 'balanced' | 'aggressive'
  ): void {
    switch (profile) {
      case 'conservative':
        this.updateConfig({
          parallelProcessing: {
            ...this.config.parallelProcessing,
            enabled: true,
            maxConcurrency: 3,
            batchSize: 5,
            memoryThresholdMB: 200,
          },
          caching: {
            ...this.config.caching,
            enabled: true,
            maxMemoryMB: 50,
            ttlMinutes: 30,
          },
          streaming: {
            ...this.config.streaming,
            enabled: true,
            thresholdSize: 50 * 1024, // 50KB
            maxMemoryMB: 100,
          },
          compression: {
            ...this.config.compression,
            enabled: true,
            level: 4,
            threshold: 5 * 1024, // 5KB
          },
        });
        break;

      case 'balanced':
        this.updateConfig({
          parallelProcessing: {
            ...this.config.parallelProcessing,
            enabled: true,
            maxConcurrency: 8,
            batchSize: 10,
            memoryThresholdMB: 400,
          },
          caching: {
            ...this.config.caching,
            enabled: true,
            maxMemoryMB: 100,
            ttlMinutes: 60,
          },
          streaming: {
            ...this.config.streaming,
            enabled: true,
            thresholdSize: 100 * 1024, // 100KB
            maxMemoryMB: 200,
          },
          compression: {
            ...this.config.compression,
            enabled: true,
            level: 6,
            threshold: 10 * 1024, // 10KB
          },
        });
        break;

      case 'aggressive':
        this.updateConfig({
          parallelProcessing: {
            ...this.config.parallelProcessing,
            enabled: true,
            maxConcurrency: 16,
            batchSize: 20,
            memoryThresholdMB: 800,
          },
          caching: {
            ...this.config.caching,
            enabled: true,
            maxMemoryMB: 200,
            ttlMinutes: 120,
          },
          streaming: {
            ...this.config.streaming,
            enabled: true,
            thresholdSize: 200 * 1024, // 200KB
            maxMemoryMB: 400,
          },
          compression: {
            ...this.config.compression,
            enabled: true,
            level: 9,
            threshold: 20 * 1024, // 20KB
          },
        });
        break;
    }

    logger.info(`⚡ Performance profile set to ${profile}`, {
      parallelConcurrency: this.config.parallelProcessing.maxConcurrency,
      cacheMemoryMB: this.config.caching.maxMemoryMB,
      streamingThresholdKB: this.config.streaming.thresholdSize / 1024,
      compressionLevel: this.config.compression.level,
    });
  }

  /**
   * Auto-detect optimal settings based on system resources
   */
  autoDetectOptimalSettings(): void {
    const memoryGB = this.getSystemMemoryGB();
    const cpuCores = this.getSystemCpuCores();

    logger.info('⚡ Auto-detecting optimal performance settings', {
      memoryGB,
      cpuCores,
    });

    // Adjust settings based on system resources
    let profile: 'conservative' | 'balanced' | 'aggressive' = 'balanced';

    if (memoryGB < 4 || cpuCores < 4) {
      profile = 'conservative';
    } else if (memoryGB >= 8 && cpuCores >= 8) {
      profile = 'aggressive';
    }

    this.setPerformanceProfile(profile);

    // Fine-tune based on available resources
    const maxConcurrency = Math.min(cpuCores * 2, 16);
    const maxMemoryMB = Math.min(memoryGB * 1024 * 0.25, 500); // 25% of RAM, max 500MB

    this.updateConfig({
      parallelProcessing: {
        ...this.config.parallelProcessing,
        maxConcurrency,
        memoryThresholdMB: maxMemoryMB,
      },
      caching: {
        ...this.config.caching,
        maxMemoryMB: Math.min(maxMemoryMB / 2, 200),
      },
      streaming: {
        ...this.config.streaming,
        maxMemoryMB,
      },
    });

    logger.info('⚡ Auto-detection completed', {
      profile,
      maxConcurrency,
      maxMemoryMB,
    });
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations(): {
    recommendations: string[];
    warnings: string[];
    optimizations: string[];
  } {
    const recommendations: string[] = [];
    const warnings: string[] = [];
    const optimizations: string[] = [];

    const memoryGB = this.getSystemMemoryGB();
    const cpuCores = this.getSystemCpuCores();

    // Memory recommendations
    if (memoryGB < 4) {
      warnings.push(
        'Low system memory detected. Consider conservative performance settings.'
      );
      recommendations.push(
        'Reduce cache memory limits and enable aggressive garbage collection.'
      );
    } else if (memoryGB >= 8) {
      optimizations.push(
        'Sufficient memory available. Consider increasing cache sizes.'
      );
    }

    // CPU recommendations
    if (cpuCores < 4) {
      warnings.push(
        'Limited CPU cores detected. Reduce parallel processing concurrency.'
      );
      recommendations.push(
        'Set maxConcurrency to 2-4 for optimal performance.'
      );
    } else if (cpuCores >= 8) {
      optimizations.push(
        'High CPU core count detected. Consider increasing parallel processing.'
      );
    }

    // Configuration recommendations
    if (!this.config.parallelProcessing.enabled) {
      optimizations.push(
        'Enable parallel processing for significant performance improvements.'
      );
    }

    if (!this.config.caching.enabled) {
      optimizations.push(
        'Enable caching to reduce redundant HTTP requests and processing.'
      );
    }

    if (!this.config.streaming.enabled) {
      optimizations.push(
        'Enable streaming for better memory efficiency with large files.'
      );
    }

    if (!this.config.compression.enabled) {
      optimizations.push(
        'Enable compression to reduce disk usage by up to 40%.'
      );
    }

    // Specific tuning recommendations
    if (this.config.parallelProcessing.maxConcurrency > cpuCores * 2) {
      recommendations.push(
        'Consider reducing maxConcurrency to prevent thread thrashing.'
      );
    }

    if (this.config.caching.maxMemoryMB > memoryGB * 1024 * 0.3) {
      recommendations.push(
        'Cache memory usage is high. Consider reducing cache limits.'
      );
    }

    return {
      recommendations,
      warnings,
      optimizations,
    };
  }

  /**
   * Export configuration for backup
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from backup
   */
  importConfig(configJson: string): void {
    try {
      const importedConfig = JSON.parse(configJson);
      this.updateConfig(importedConfig);
      logger.info('⚡ Performance configuration imported successfully');
    } catch (error) {
      logger.error('Failed to import performance configuration', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Add configuration change listener
   */
  onConfigChange(listener: (config: PerformanceConfig) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove configuration change listener
   */
  removeConfigListener(listener: (config: PerformanceConfig) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // Private methods

  private createDefaultConfig(): PerformanceConfig {
    return {
      parallelProcessing: {
        enabled: true,
        maxConcurrency: 8,
        batchSize: 10,
        retryAttempts: 3,
        retryDelay: 1000,
        memoryThresholdMB: 400,
      },
      caching: {
        enabled: true,
        maxMemoryMB: 100,
        ttlMinutes: 60,
        httpCacheEnabled: true,
        contentCacheEnabled: true,
        checkInterval: 30_000,
      },
      streaming: {
        enabled: true,
        chunkSize: 64 * 1024, // 64KB
        thresholdSize: 100 * 1024, // 100KB
        compressionEnabled: true,
        compressionLevel: 6,
        maxMemoryMB: 200,
      },
      compression: {
        enabled: true,
        level: 6,
        threshold: 10 * 1024, // 10KB
        memoryLevel: 8,
        windowBits: 15,
        algorithm: 'gzip',
        enableAutoDetection: true,
      },
      monitoring: {
        enabled: true,
        metricsInterval: 1000,
        benchmarkingEnabled: true,
        memoryMonitoring: true,
        performanceReports: true,
      },
      collection: {
        maxConcurrency: 10,
        batchSize: 20,
        enableCache: true,
        enableCompression: true,
        enableStreaming: true,
        timeout: 30_000,
        maxRedirects: 5,
      },
      distillation: {
        maxConcurrency: 3,
        batchSize: 5,
        enableCache: true,
        enableCompression: true,
        enableStreaming: true,
        memoryThresholdMB: 500,
      },
      bundle: {
        maxConcurrency: 8,
        enableCompression: true,
        enableStreaming: true,
        enableParallelProcessing: true,
        compressionLevel: 6,
        streamingThreshold: 100 * 1024,
        memoryThresholdMB: 200,
      },
    };
  }

  private loadFromEnvironment(): void {
    const env = process.env;

    // Load performance settings from environment variables
    if (env.PERFORMANCE_PARALLEL_CONCURRENCY) {
      this.config.parallelProcessing.maxConcurrency = Number.parseInt(
        env.PERFORMANCE_PARALLEL_CONCURRENCY,
        10
      );
    }

    if (env.PERFORMANCE_CACHE_MEMORY_MB) {
      this.config.caching.maxMemoryMB = Number.parseInt(
        env.PERFORMANCE_CACHE_MEMORY_MB,
        10
      );
    }

    if (env.PERFORMANCE_COMPRESSION_LEVEL) {
      this.config.compression.level = Number.parseInt(
        env.PERFORMANCE_COMPRESSION_LEVEL,
        10
      );
    }

    if (env.PERFORMANCE_STREAMING_THRESHOLD_KB) {
      this.config.streaming.thresholdSize =
        Number.parseInt(env.PERFORMANCE_STREAMING_THRESHOLD_KB, 10) * 1024;
    }

    if (env.PERFORMANCE_MONITORING_ENABLED) {
      this.config.monitoring.enabled =
        env.PERFORMANCE_MONITORING_ENABLED === 'true';
    }
  }

  private mergeConfig(
    current: PerformanceConfig,
    updates: Partial<PerformanceConfig>
  ): PerformanceConfig {
    const merged = { ...current };

    for (const [key, value] of Object.entries(updates)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key as keyof PerformanceConfig] = {
          ...merged[key as keyof PerformanceConfig],
          ...value,
        } as any;
      } else {
        merged[key as keyof PerformanceConfig] = value as any;
      }
    }

    return merged;
  }

  private summarizeChanges(
    changes: Partial<PerformanceConfig>
  ): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [key, value] of Object.entries(changes)) {
      if (value && typeof value === 'object') {
        summary[key] = Object.keys(value);
      } else {
        summary[key] = value;
      }
    }

    return summary;
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.config);
      } catch (error) {
        logger.error('Error in performance configuration listener', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private getSystemMemoryGB(): number {
    try {
      const memInfo = process.memoryUsage();
      return Math.round(memInfo.rss / 1024 / 1024 / 1024);
    } catch {
      return 4; // Default fallback
    }
  }

  private getSystemCpuCores(): number {
    try {
      const os = require('os');
      return os.cpus().length;
    } catch {
      return 4; // Default fallback
    }
  }
}

/**
 * Global performance configuration manager
 */
export const performanceConfig = new PerformanceConfigManager();

/**
 * Convenience functions for common operations
 */
export const enablePerformanceOptimizations = () =>
  performanceConfig.setOptimizationMode(true);
export const disablePerformanceOptimizations = () =>
  performanceConfig.setOptimizationMode(false);
export const setConservativeMode = () =>
  performanceConfig.setPerformanceProfile('conservative');
export const setBalancedMode = () =>
  performanceConfig.setPerformanceProfile('balanced');
export const setAggressiveMode = () =>
  performanceConfig.setPerformanceProfile('aggressive');
export const autoConfigurePerformance = () =>
  performanceConfig.autoDetectOptimalSettings();
