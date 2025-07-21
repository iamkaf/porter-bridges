/**
 * @file Streaming File Processor - Memory-efficient file operations with streaming
 *
 * This module provides streaming file operations to reduce memory usage
 * during large file processing, with compression and progress tracking.
 */

import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { logger } from '../logger';
import { performanceMonitor } from '../performance/performance-monitor';

export interface StreamingConfig {
  chunkSize: number;
  compressionLevel: number;
  enableCompression: boolean;
  progressInterval: number;
  tempDirectory: string;
  maxMemoryMB: number;
}

export interface StreamingProgress {
  bytesProcessed: number;
  totalBytes: number;
  percentage: number;
  throughputMBps: number;
  estimatedRemainingMs: number;
}

export interface StreamingResult {
  inputSize: number;
  outputSize: number;
  compressionRatio: number;
  processingTime: number;
  throughputMBps: number;
  tempFilesCreated: number;
}

export class StreamingFileProcessor {
  private config: StreamingConfig;
  private progressCallbacks: ((progress: StreamingProgress) => void)[] = [];

  constructor(config: Partial<StreamingConfig> = {}) {
    this.config = {
      chunkSize: config.chunkSize || 64 * 1024, // 64KB chunks
      compressionLevel: config.compressionLevel || 6,
      enableCompression: config.enableCompression !== false,
      progressInterval: config.progressInterval || 1000, // 1 second
      tempDirectory: config.tempDirectory || './temp',
      maxMemoryMB: config.maxMemoryMB || 100,
    };

    logger.info('🌊 Streaming file processor initialized', {
      chunkSize: this.config.chunkSize,
      compressionLevel: this.config.compressionLevel,
      enableCompression: this.config.enableCompression,
      maxMemoryMB: this.config.maxMemoryMB,
    });
  }

  /**
   * Stream copy file with optional compression
   */
  async copyFile(
    sourcePath: string,
    destPath: string,
    options: {
      compress?: boolean;
      progressCallback?: (progress: StreamingProgress) => void;
    } = {}
  ): Promise<StreamingResult> {
    const startTime = Date.now();
    const operationName = `copy-${path.basename(sourcePath)}`;

    performanceMonitor.startMonitoring(operationName, {
      source: sourcePath,
      destination: destPath,
      compression: options.compress,
    });

    try {
      // Get source file size
      const stats = await fs.stat(sourcePath);
      const inputSize = stats.size;

      // Create destination directory if needed
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Create streams
      const readStream = createReadStream(sourcePath, {
        highWaterMark: this.config.chunkSize,
      });
      const writeStream = createWriteStream(destPath);

      // Add progress tracking
      let bytesProcessed = 0;
      const progressStream = new Transform({
        transform(chunk, encoding, callback) {
          bytesProcessed += chunk.length;

          if (options.progressCallback) {
            const progress = this.calculateProgress(
              bytesProcessed,
              inputSize,
              startTime
            );
            options.progressCallback(progress);
          }

          callback(null, chunk);
        },
      });

      // Set up pipeline with optional compression
      const streams = [readStream, progressStream];

      if (options.compress && this.config.enableCompression) {
        const gzipStream = createGzip({ level: this.config.compressionLevel });
        streams.push(gzipStream);
      }

      streams.push(writeStream);

      // Execute pipeline
      await pipeline(streams);

      // Get final output size
      const outputStats = await fs.stat(destPath);
      const outputSize = outputStats.size;

      const processingTime = Date.now() - startTime;
      const throughputMBps =
        inputSize / (1024 * 1024) / (processingTime / 1000);
      const compressionRatio = inputSize > 0 ? outputSize / inputSize : 1;

      const result: StreamingResult = {
        inputSize,
        outputSize,
        compressionRatio,
        processingTime,
        throughputMBps,
        tempFilesCreated: 0,
      };

      performanceMonitor.endMonitoring(operationName, 'streaming', {
        inputSizeMB: Math.round(inputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio,
        throughputMBps,
      });

      logger.info('🌊 File copy completed', {
        source: sourcePath,
        destination: destPath,
        inputSizeMB: Math.round(inputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio: compressionRatio.toFixed(3),
        processingTime,
        throughputMBps: throughputMBps.toFixed(2),
      });

      return result;
    } catch (error) {
      performanceMonitor.endMonitoring(operationName, 'streaming', {
        error: true,
      });

      logger.error('🌊 File copy failed', {
        source: sourcePath,
        destination: destPath,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Stream process large file with transformation
   */
  async processFile<T>(
    inputPath: string,
    outputPath: string,
    transformer: (chunk: Buffer) => Promise<Buffer>,
    options: {
      compress?: boolean;
      progressCallback?: (progress: StreamingProgress) => void;
    } = {}
  ): Promise<StreamingResult> {
    const startTime = Date.now();
    const operationName = `process-${path.basename(inputPath)}`;

    performanceMonitor.startMonitoring(operationName, {
      input: inputPath,
      output: outputPath,
      compression: options.compress,
    });

    try {
      // Get input file size
      const stats = await fs.stat(inputPath);
      const inputSize = stats.size;

      // Create destination directory if needed
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Create streams
      const readStream = createReadStream(inputPath, {
        highWaterMark: this.config.chunkSize,
      });
      const writeStream = createWriteStream(outputPath);

      // Create transformation stream
      let bytesProcessed = 0;
      const transformStream = new Transform({
        async transform(chunk: Buffer, encoding, callback) {
          try {
            const transformed = await transformer(chunk);
            bytesProcessed += chunk.length;

            if (options.progressCallback) {
              const progress = this.calculateProgress(
                bytesProcessed,
                inputSize,
                startTime
              );
              options.progressCallback(progress);
            }

            callback(null, transformed);
          } catch (error) {
            callback(error);
          }
        },
      });

      // Set up pipeline with optional compression
      const streams = [readStream, transformStream];

      if (options.compress && this.config.enableCompression) {
        const gzipStream = createGzip({ level: this.config.compressionLevel });
        streams.push(gzipStream);
      }

      streams.push(writeStream);

      // Execute pipeline
      await pipeline(streams);

      // Get final output size
      const outputStats = await fs.stat(outputPath);
      const outputSize = outputStats.size;

      const processingTime = Date.now() - startTime;
      const throughputMBps =
        inputSize / (1024 * 1024) / (processingTime / 1000);
      const compressionRatio = inputSize > 0 ? outputSize / inputSize : 1;

      const result: StreamingResult = {
        inputSize,
        outputSize,
        compressionRatio,
        processingTime,
        throughputMBps,
        tempFilesCreated: 0,
      };

      performanceMonitor.endMonitoring(operationName, 'streaming', {
        inputSizeMB: Math.round(inputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio,
        throughputMBps,
      });

      logger.info('🌊 File processing completed', {
        input: inputPath,
        output: outputPath,
        inputSizeMB: Math.round(inputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio: compressionRatio.toFixed(3),
        processingTime,
        throughputMBps: throughputMBps.toFixed(2),
      });

      return result;
    } catch (error) {
      performanceMonitor.endMonitoring(operationName, 'streaming', {
        error: true,
      });

      logger.error('🌊 File processing failed', {
        input: inputPath,
        output: outputPath,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Stream merge multiple files into one
   */
  async mergeFiles(
    inputPaths: string[],
    outputPath: string,
    options: {
      compress?: boolean;
      separator?: Buffer;
      progressCallback?: (progress: StreamingProgress) => void;
    } = {}
  ): Promise<StreamingResult> {
    const startTime = Date.now();
    const operationName = `merge-${inputPaths.length}-files`;

    performanceMonitor.startMonitoring(operationName, {
      inputCount: inputPaths.length,
      output: outputPath,
      compression: options.compress,
    });

    try {
      // Calculate total input size
      let totalInputSize = 0;
      for (const inputPath of inputPaths) {
        const stats = await fs.stat(inputPath);
        totalInputSize += stats.size;
      }

      // Create destination directory if needed
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Create output stream
      const writeStream = createWriteStream(outputPath);

      // Set up compression if enabled
      let finalStream = writeStream;
      if (options.compress && this.config.enableCompression) {
        const gzipStream = createGzip({ level: this.config.compressionLevel });
        gzipStream.pipe(writeStream);
        finalStream = gzipStream;
      }

      let bytesProcessed = 0;
      const separator = options.separator || Buffer.from('\n');

      // Process each input file
      for (let i = 0; i < inputPaths.length; i++) {
        const inputPath = inputPaths[i]!;
        const readStream = createReadStream(inputPath, {
          highWaterMark: this.config.chunkSize,
        });

        // Create progress tracking transform
        const progressStream = new PassThrough();
        progressStream.on('data', (chunk) => {
          bytesProcessed += chunk.length;

          if (options.progressCallback) {
            const progress = this.calculateProgress(
              bytesProcessed,
              totalInputSize,
              startTime
            );
            options.progressCallback(progress);
          }
        });

        // Pipe through progress tracking
        await pipeline(readStream, progressStream, finalStream, { end: false });

        // Add separator between files (except for last file)
        if (i < inputPaths.length - 1) {
          finalStream.write(separator);
        }
      }

      // Close the final stream
      finalStream.end();

      // Wait for write completion
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Get final output size
      const outputStats = await fs.stat(outputPath);
      const outputSize = outputStats.size;

      const processingTime = Date.now() - startTime;
      const throughputMBps =
        totalInputSize / (1024 * 1024) / (processingTime / 1000);
      const compressionRatio =
        totalInputSize > 0 ? outputSize / totalInputSize : 1;

      const result: StreamingResult = {
        inputSize: totalInputSize,
        outputSize,
        compressionRatio,
        processingTime,
        throughputMBps,
        tempFilesCreated: 0,
      };

      performanceMonitor.endMonitoring(operationName, 'streaming', {
        inputSizeMB: Math.round(totalInputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio,
        throughputMBps,
      });

      logger.info('🌊 File merge completed', {
        inputCount: inputPaths.length,
        output: outputPath,
        inputSizeMB: Math.round(totalInputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio: compressionRatio.toFixed(3),
        processingTime,
        throughputMBps: throughputMBps.toFixed(2),
      });

      return result;
    } catch (error) {
      performanceMonitor.endMonitoring(operationName, 'streaming', {
        error: true,
      });

      logger.error('🌊 File merge failed', {
        inputCount: inputPaths.length,
        output: outputPath,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Stream decompress file
   */
  async decompressFile(
    inputPath: string,
    outputPath: string,
    options: {
      progressCallback?: (progress: StreamingProgress) => void;
    } = {}
  ): Promise<StreamingResult> {
    const startTime = Date.now();
    const operationName = `decompress-${path.basename(inputPath)}`;

    performanceMonitor.startMonitoring(operationName, {
      input: inputPath,
      output: outputPath,
    });

    try {
      // Get input file size
      const stats = await fs.stat(inputPath);
      const inputSize = stats.size;

      // Create destination directory if needed
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Create streams
      const readStream = createReadStream(inputPath, {
        highWaterMark: this.config.chunkSize,
      });
      const writeStream = createWriteStream(outputPath);
      const gunzipStream = createGunzip();

      // Add progress tracking
      let bytesProcessed = 0;
      const progressStream = new Transform({
        transform(chunk, encoding, callback) {
          bytesProcessed += chunk.length;

          if (options.progressCallback) {
            const progress = this.calculateProgress(
              bytesProcessed,
              inputSize,
              startTime
            );
            options.progressCallback(progress);
          }

          callback(null, chunk);
        },
      });

      // Execute pipeline
      await pipeline([readStream, progressStream, gunzipStream, writeStream]);

      // Get final output size
      const outputStats = await fs.stat(outputPath);
      const outputSize = outputStats.size;

      const processingTime = Date.now() - startTime;
      const throughputMBps =
        inputSize / (1024 * 1024) / (processingTime / 1000);
      const compressionRatio = inputSize > 0 ? outputSize / inputSize : 1;

      const result: StreamingResult = {
        inputSize,
        outputSize,
        compressionRatio,
        processingTime,
        throughputMBps,
        tempFilesCreated: 0,
      };

      performanceMonitor.endMonitoring(operationName, 'streaming', {
        inputSizeMB: Math.round(inputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio,
        throughputMBps,
      });

      logger.info('🌊 File decompression completed', {
        input: inputPath,
        output: outputPath,
        inputSizeMB: Math.round(inputSize / 1024 / 1024),
        outputSizeMB: Math.round(outputSize / 1024 / 1024),
        compressionRatio: compressionRatio.toFixed(3),
        processingTime,
        throughputMBps: throughputMBps.toFixed(2),
      });

      return result;
    } catch (error) {
      performanceMonitor.endMonitoring(operationName, 'streaming', {
        error: true,
      });

      logger.error('🌊 File decompression failed', {
        input: inputPath,
        output: outputPath,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentOfLimit: number;
  } {
    const usage = process.memoryUsage();
    const limitBytes = this.config.maxMemoryMB * 1024 * 1024;
    const percentOfLimit = (usage.heapUsed / limitBytes) * 100;

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      percentOfLimit,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...newConfig };

    logger.info('🌊 Streaming configuration updated', this.config);
  }

  // Private methods

  private calculateProgress(
    bytesProcessed: number,
    totalBytes: number,
    startTime: number
  ): StreamingProgress {
    const elapsed = Date.now() - startTime;
    const percentage = totalBytes > 0 ? (bytesProcessed / totalBytes) * 100 : 0;
    const throughputMBps =
      elapsed > 0 ? bytesProcessed / (1024 * 1024) / (elapsed / 1000) : 0;

    let estimatedRemainingMs = 0;
    if (throughputMBps > 0 && percentage > 0) {
      const remainingBytes = totalBytes - bytesProcessed;
      const remainingMB = remainingBytes / (1024 * 1024);
      estimatedRemainingMs = (remainingMB / throughputMBps) * 1000;
    }

    return {
      bytesProcessed,
      totalBytes,
      percentage,
      throughputMBps,
      estimatedRemainingMs,
    };
  }
}

/**
 * Global streaming file processor instance
 */
export const streamingProcessor = new StreamingFileProcessor();
