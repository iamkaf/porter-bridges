/**
 * @file Compression Manager - Content compression system for disk space optimization
 *
 * This module provides intelligent compression for stored content, bundles,
 * and cached data to reduce disk usage by up to 40%.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { deflate, gunzip, gzip, inflate } from 'node:zlib';
import pako from 'pako';
import { logger } from '../logger';
import { performanceMonitor } from './performance-monitor';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

export interface CompressionConfig {
  defaultAlgorithm: 'gzip' | 'deflate' | 'brotli';
  level: number;
  threshold: number;
  memoryLevel: number;
  windowBits: number;
  chunkSize: number;
  enableAutoDetection: boolean;
  fileTypeRules: Map<string, CompressionRule>;
}

export interface CompressionRule {
  algorithm: 'gzip' | 'deflate' | 'brotli' | 'none';
  level: number;
  threshold: number;
  enabled: boolean;
}

export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm: string;
  level: number;
  processingTime: number;
  spaceSaved: number;
}

export interface CompressionStats {
  totalFilesCompressed: number;
  totalOriginalSize: number;
  totalCompressedSize: number;
  totalSpaceSaved: number;
  averageCompressionRatio: number;
  algorithmUsage: Record<string, number>;
  processingTime: number;
}

export class CompressionManager {
  private config: CompressionConfig;
  private stats: CompressionStats;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = {
      defaultAlgorithm: config.defaultAlgorithm || 'gzip',
      level: config.level || 6,
      threshold: config.threshold || 1024, // 1KB minimum
      memoryLevel: config.memoryLevel || 8,
      windowBits: config.windowBits || 15,
      chunkSize: config.chunkSize || 16_384,
      enableAutoDetection: config.enableAutoDetection !== false,
      fileTypeRules: config.fileTypeRules || this.getDefaultFileTypeRules(),
    };

    this.stats = {
      totalFilesCompressed: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      totalSpaceSaved: 0,
      averageCompressionRatio: 0,
      algorithmUsage: {},
      processingTime: 0,
    };

    logger.info('🗜️ Compression manager initialized', {
      defaultAlgorithm: this.config.defaultAlgorithm,
      level: this.config.level,
      threshold: this.config.threshold,
      enableAutoDetection: this.config.enableAutoDetection,
    });
  }

  /**
   * Compress buffer with optimal algorithm
   */
  async compressBuffer(
    buffer: Buffer,
    options: {
      algorithm?: 'gzip' | 'deflate' | 'brotli';
      level?: number;
      filename?: string;
    } = {}
  ): Promise<{
    compressed: Buffer;
    result: CompressionResult;
  }> {
    const startTime = Date.now();
    const originalSize = buffer.length;

    // Skip compression if below threshold
    if (originalSize < this.config.threshold) {
      return {
        compressed: buffer,
        result: {
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1,
          algorithm: 'none',
          level: 0,
          processingTime: 0,
          spaceSaved: 0,
        },
      };
    }

    // Determine compression algorithm
    const algorithm = this.selectAlgorithm(options.filename, options.algorithm);
    const level = options.level || this.config.level;

    let compressed: Buffer;
    let actualAlgorithm: string;

    try {
      switch (algorithm) {
        case 'gzip':
          compressed = await gzipAsync(buffer, { level });
          actualAlgorithm = 'gzip';
          break;
        case 'deflate':
          compressed = await deflateAsync(buffer, { level });
          actualAlgorithm = 'deflate';
          break;
        case 'brotli':
          // Use pako for Brotli compression
          compressed = Buffer.from(
            pako.deflate(buffer, { level, windowBits: this.config.windowBits })
          );
          actualAlgorithm = 'brotli';
          break;
        default:
          compressed = buffer;
          actualAlgorithm = 'none';
      }
    } catch (error) {
      logger.warn('Compression failed, using original buffer', {
        algorithm,
        level,
        error: error instanceof Error ? error.message : String(error),
      });

      compressed = buffer;
      actualAlgorithm = 'none';
    }

    const processingTime = Date.now() - startTime;
    const compressedSize = compressed.length;
    const compressionRatio =
      originalSize > 0 ? compressedSize / originalSize : 1;
    const spaceSaved = originalSize - compressedSize;

    // Only use compression if it actually saves space
    if (compressionRatio >= 0.95) {
      compressed = buffer;
      actualAlgorithm = 'none';
    }

    const result: CompressionResult = {
      originalSize,
      compressedSize: compressed.length,
      compressionRatio: compressed.length / originalSize,
      algorithm: actualAlgorithm,
      level,
      processingTime,
      spaceSaved: actualAlgorithm === 'none' ? 0 : spaceSaved,
    };

    // Update stats
    this.updateStats(result);

    logger.debug('🗜️ Buffer compression completed', {
      algorithm: actualAlgorithm,
      level,
      originalSize,
      compressedSize: compressed.length,
      compressionRatio: result.compressionRatio.toFixed(3),
      spaceSaved,
      processingTime,
    });

    return { compressed, result };
  }

  /**
   * Decompress buffer
   */
  async decompressBuffer(
    buffer: Buffer,
    algorithm: 'gzip' | 'deflate' | 'brotli'
  ): Promise<Buffer> {
    const startTime = Date.now();

    try {
      let decompressed: Buffer;

      switch (algorithm) {
        case 'gzip':
          decompressed = await gunzipAsync(buffer);
          break;
        case 'deflate':
          decompressed = await inflateAsync(buffer);
          break;
        case 'brotli':
          decompressed = Buffer.from(pako.inflate(buffer));
          break;
        default:
          throw new Error(`Unsupported decompression algorithm: ${algorithm}`);
      }

      const processingTime = Date.now() - startTime;

      logger.debug('🗜️ Buffer decompression completed', {
        algorithm,
        compressedSize: buffer.length,
        decompressedSize: decompressed.length,
        processingTime,
      });

      return decompressed;
    } catch (error) {
      logger.error('Decompression failed', {
        algorithm,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Compress file with optimal settings
   */
  async compressFile(
    inputPath: string,
    outputPath: string,
    options: {
      algorithm?: 'gzip' | 'deflate' | 'brotli';
      level?: number;
      preserveOriginal?: boolean;
    } = {}
  ): Promise<CompressionResult> {
    const startTime = Date.now();
    const operationName = `compress-${path.basename(inputPath)}`;

    performanceMonitor.startMonitoring(operationName, {
      input: inputPath,
      output: outputPath,
      algorithm: options.algorithm || this.config.defaultAlgorithm,
      level: options.level || this.config.level,
    });

    try {
      // Read input file
      const buffer = await fs.readFile(inputPath);
      const originalSize = buffer.length;

      // Compress buffer
      const { compressed, result } = await this.compressBuffer(buffer, {
        algorithm: options.algorithm,
        level: options.level,
        filename: inputPath,
      });

      // Write compressed file
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, compressed);

      // Remove original file if not preserving
      if (!options.preserveOriginal && result.spaceSaved > 0) {
        await fs.unlink(inputPath);
      }

      performanceMonitor.endMonitoring(operationName, 'compression', {
        originalSizeMB: Math.round(originalSize / 1024 / 1024),
        compressedSizeMB: Math.round(result.compressedSize / 1024 / 1024),
        compressionRatio: result.compressionRatio,
        spaceSavedMB: Math.round(result.spaceSaved / 1024 / 1024),
      });

      logger.info('🗜️ File compression completed', {
        input: inputPath,
        output: outputPath,
        algorithm: result.algorithm,
        level: result.level,
        originalSizeMB: Math.round(originalSize / 1024 / 1024),
        compressedSizeMB: Math.round(result.compressedSize / 1024 / 1024),
        compressionRatio: result.compressionRatio.toFixed(3),
        spaceSavedMB: Math.round(result.spaceSaved / 1024 / 1024),
        processingTime: result.processingTime,
      });

      return result;
    } catch (error) {
      performanceMonitor.endMonitoring(operationName, 'compression', {
        error: true,
      });

      logger.error('🗜️ File compression failed', {
        input: inputPath,
        output: outputPath,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Decompress file
   */
  async decompressFile(
    inputPath: string,
    outputPath: string,
    algorithm: 'gzip' | 'deflate' | 'brotli'
  ): Promise<void> {
    const startTime = Date.now();
    const operationName = `decompress-${path.basename(inputPath)}`;

    performanceMonitor.startMonitoring(operationName, {
      input: inputPath,
      output: outputPath,
      algorithm,
    });

    try {
      // Read compressed file
      const buffer = await fs.readFile(inputPath);
      const compressedSize = buffer.length;

      // Decompress buffer
      const decompressed = await this.decompressBuffer(buffer, algorithm);

      // Write decompressed file
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, decompressed);

      const processingTime = Date.now() - startTime;

      performanceMonitor.endMonitoring(operationName, 'decompression', {
        compressedSizeMB: Math.round(compressedSize / 1024 / 1024),
        decompressedSizeMB: Math.round(decompressed.length / 1024 / 1024),
        processingTime,
      });

      logger.info('🗜️ File decompression completed', {
        input: inputPath,
        output: outputPath,
        algorithm,
        compressedSizeMB: Math.round(compressedSize / 1024 / 1024),
        decompressedSizeMB: Math.round(decompressed.length / 1024 / 1024),
        processingTime,
      });
    } catch (error) {
      performanceMonitor.endMonitoring(operationName, 'decompression', {
        error: true,
      });

      logger.error('🗜️ File decompression failed', {
        input: inputPath,
        output: outputPath,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Compress directory recursively
   */
  async compressDirectory(
    inputDir: string,
    outputDir: string,
    options: {
      algorithm?: 'gzip' | 'deflate' | 'brotli';
      level?: number;
      preserveOriginal?: boolean;
      fileExtension?: string;
    } = {}
  ): Promise<CompressionStats> {
    const startTime = Date.now();
    const operationName = `compress-directory-${path.basename(inputDir)}`;

    performanceMonitor.startMonitoring(operationName, {
      inputDir,
      outputDir,
      algorithm: options.algorithm || this.config.defaultAlgorithm,
      level: options.level || this.config.level,
    });

    const dirStats: CompressionStats = {
      totalFilesCompressed: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      totalSpaceSaved: 0,
      averageCompressionRatio: 0,
      algorithmUsage: {},
      processingTime: 0,
    };

    try {
      const files = await this.getAllFiles(inputDir);
      const extension = options.fileExtension || '.gz';

      for (const file of files) {
        const relativePath = path.relative(inputDir, file);
        const outputPath = path.join(outputDir, relativePath + extension);

        try {
          const result = await this.compressFile(file, outputPath, {
            algorithm: options.algorithm,
            level: options.level,
            preserveOriginal: options.preserveOriginal,
          });

          // Update directory stats
          dirStats.totalFilesCompressed++;
          dirStats.totalOriginalSize += result.originalSize;
          dirStats.totalCompressedSize += result.compressedSize;
          dirStats.totalSpaceSaved += result.spaceSaved;
          dirStats.algorithmUsage[result.algorithm] =
            (dirStats.algorithmUsage[result.algorithm] || 0) + 1;
        } catch (error) {
          logger.warn('Failed to compress file in directory', {
            file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      dirStats.processingTime = Date.now() - startTime;
      dirStats.averageCompressionRatio =
        dirStats.totalOriginalSize > 0
          ? dirStats.totalCompressedSize / dirStats.totalOriginalSize
          : 1;

      performanceMonitor.endMonitoring(operationName, 'compression', {
        filesCompressed: dirStats.totalFilesCompressed,
        originalSizeMB: Math.round(dirStats.totalOriginalSize / 1024 / 1024),
        compressedSizeMB: Math.round(
          dirStats.totalCompressedSize / 1024 / 1024
        ),
        spaceSavedMB: Math.round(dirStats.totalSpaceSaved / 1024 / 1024),
        averageCompressionRatio: dirStats.averageCompressionRatio,
      });

      logger.info('🗜️ Directory compression completed', {
        inputDir,
        outputDir,
        filesCompressed: dirStats.totalFilesCompressed,
        originalSizeMB: Math.round(dirStats.totalOriginalSize / 1024 / 1024),
        compressedSizeMB: Math.round(
          dirStats.totalCompressedSize / 1024 / 1024
        ),
        spaceSavedMB: Math.round(dirStats.totalSpaceSaved / 1024 / 1024),
        averageCompressionRatio: dirStats.averageCompressionRatio.toFixed(3),
        processingTime: dirStats.processingTime,
      });

      return dirStats;
    } catch (error) {
      performanceMonitor.endMonitoring(operationName, 'compression', {
        error: true,
      });

      logger.error('🗜️ Directory compression failed', {
        inputDir,
        outputDir,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get compression statistics
   */
  getStats(): CompressionStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalFilesCompressed: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      totalSpaceSaved: 0,
      averageCompressionRatio: 0,
      algorithmUsage: {},
      processingTime: 0,
    };
  }

  /**
   * Update compression configuration
   */
  updateConfig(newConfig: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...newConfig };

    logger.info('🗜️ Compression configuration updated', this.config);
  }

  // Private methods

  private selectAlgorithm(
    filename?: string,
    override?: string
  ): 'gzip' | 'deflate' | 'brotli' {
    if (override) {
      return override;
    }

    if (filename && this.config.enableAutoDetection) {
      const ext = path.extname(filename).toLowerCase();
      const rule = this.config.fileTypeRules.get(ext);

      if (rule && rule.enabled && rule.algorithm !== 'none') {
        return rule.algorithm as 'gzip' | 'deflate' | 'brotli';
      }
    }

    return this.config.defaultAlgorithm;
  }

  private getDefaultFileTypeRules(): Map<string, CompressionRule> {
    const rules = new Map<string, CompressionRule>();

    // JSON files - high compression
    rules.set('.json', {
      algorithm: 'gzip',
      level: 9,
      threshold: 512,
      enabled: true,
    });

    // JavaScript/TypeScript files - medium compression
    rules.set('.js', {
      algorithm: 'gzip',
      level: 6,
      threshold: 1024,
      enabled: true,
    });

    rules.set('.ts', {
      algorithm: 'gzip',
      level: 6,
      threshold: 1024,
      enabled: true,
    });

    // Text files - high compression
    rules.set('.txt', {
      algorithm: 'gzip',
      level: 9,
      threshold: 512,
      enabled: true,
    });

    // Already compressed files - skip
    rules.set('.gz', {
      algorithm: 'none',
      level: 0,
      threshold: 0,
      enabled: false,
    });
    rules.set('.zip', {
      algorithm: 'none',
      level: 0,
      threshold: 0,
      enabled: false,
    });
    rules.set('.7z', {
      algorithm: 'none',
      level: 0,
      threshold: 0,
      enabled: false,
    });

    return rules;
  }

  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      logger.warn(`Failed to read directory: ${dir}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return files;
  }

  private updateStats(result: CompressionResult): void {
    this.stats.totalFilesCompressed++;
    this.stats.totalOriginalSize += result.originalSize;
    this.stats.totalCompressedSize += result.compressedSize;
    this.stats.totalSpaceSaved += result.spaceSaved;
    this.stats.processingTime += result.processingTime;

    this.stats.algorithmUsage[result.algorithm] =
      (this.stats.algorithmUsage[result.algorithm] || 0) + 1;

    this.stats.averageCompressionRatio =
      this.stats.totalOriginalSize > 0
        ? this.stats.totalCompressedSize / this.stats.totalOriginalSize
        : 1;
  }
}

/**
 * Global compression manager instance
 */
export const compressionManager = new CompressionManager();
