/**
 * @file Content Processor - Handles content processing and file operations
 *
 * This module handles the processing of source content for packaging,
 * including file naming, content validation, and metadata extraction.
 */

import { promises as fs } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { logger } from '../../utils/logger';

export interface IContentProcessResult {
  sourceProgress: {
    status: string;
    url: string;
    checksum: string;
    collected_at: string;
  };
  distillationProgress: {
    status: string;
    distilled_at: string;
    agent: string;
    token_usage: number;
  };
  distilledData: any;
  fileSize: number;
}

/**
 * Handles content processing and file operations for packaging
 */
export class ContentProcessor {
  private options: any;

  constructor(options: any = {}) {
    this.options = {
      distilledDirectory: options.distilledDirectory || './generated/distilled-content',
      ...options,
    };
  }

  /**
   * Process a single source for PACKAGED_DATA_MODEL compliance
   */
  async processSourceForVersion(source: any, rawPath: string, _versionPath: string): Promise<IContentProcessResult> {
    try {
      // Read distilled content
      const distilledFilePath = this.getDistilledPath(source.url);

      let distilledExists: boolean;
      try {
        await fs.access(distilledFilePath);
        distilledExists = true;
      } catch {
        distilledExists = false;
      }

      if (!distilledExists) {
        throw new Error(`Distilled file not found: ${distilledFilePath}`);
      }

      const distilledContent = await fs.readFile(distilledFilePath, 'utf-8');
      const distilledData = JSON.parse(distilledContent);

      // Copy raw content to /raw/ directory
      const rawFileName = this.generateRawFileName(source);
      const rawFilePath = path.join(rawPath, rawFileName);

      // Read and copy original collected content using the same filename logic as CollectionModule
      const collectedFileName = this.generateCollectedContentFileName(source.url);
      const collectedPath = path.join(
        this.options.distilledDirectory,
        '..',
        'collected-content',
        collectedFileName
      );

      try {
        await fs.access(collectedPath);
        await fs.copyFile(collectedPath, rawFilePath);
        logger.info(`📄 Copied raw content: ${rawFileName}`);
      } catch (error: any) {
        logger.warn(`⚠️  Could not copy raw content for ${source.url}: ${error.message}`);
      }

      const contentChecksum = crypto.createHash('sha256').update(distilledContent).digest('hex');
      const fileStats = await fs.stat(distilledFilePath);

      return {
        sourceProgress: {
          status: 'collected',
          url: source.url,
          checksum: contentChecksum,
          collected_at: source.collected_at,
        },
        distillationProgress: {
          status: 'distilled',
          distilled_at: source.distilled_at,
          agent: source.distillation_metadata?.agent || 'unknown',
          token_usage: source.distillation_metadata?.token_usage?.total_tokens || 0,
        },
        distilledData,
        fileSize: fileStats.size,
      };
    } catch (error: any) {
      logger.error(`Failed to process source: ${source.url}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get the path to distilled content file
   */
  getDistilledPath(url: string): string {
    const filename = `${url.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    return path.join(this.options.distilledDirectory, filename);
  }

  /**
   * Generate collected content filename using the same logic as CollectionModule
   */
  generateCollectedContentFileName(url: string): string {
    const cleaned = url
      .replace(/^https?:\/\//, '')
      .replace(/[^\w\-_.~]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return `${cleaned}.html`;
  }

  /**
   * Generate raw filename for /raw/ directory
   */
  generateRawFileName(source: any): string {
    const type = source.source_type || 'unknown';
    const loaderType = source.loader_type || 'unknown';
    const version = source.minecraft_version || 'unknown';

    // Determine file extension based on source type
    let extension: string;
    if (source.source_type === 'primer') {
      extension = 'md';
    } else if (source.source_type === 'blog_post') {
      extension = 'html';
    } else {
      extension = 'txt';
    }

    return `${loaderType}-${type}-${version}.${extension}`;
  }

  /**
   * Generate source key for progress tracking
   */
  generateSourceKey(source: any): string {
    const type = source.source_type || 'unknown';
    const loaderType = source.loader_type || 'unknown';
    const version = source.minecraft_version || 'unknown';
    const urlHash = crypto.createHash('md5').update(source.url).digest('hex').substring(0, 8);

    return `${loaderType}-${type}-${version}-${urlHash}`;
  }

  /**
   * Validate content integrity
   */
  validateContent(content: string): { isValid: boolean; error?: string } {
    try {
      if (!content || content.trim().length === 0) {
        return { isValid: false, error: 'Content is empty' };
      }

      // Try to parse if it's JSON
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        JSON.parse(content);
      }

      return { isValid: true };
    } catch (error: any) {
      return { isValid: false, error: `Invalid JSON content: ${error.message}` };
    }
  }

  /**
   * Generate content metadata
   */
  generateContentMetadata(source: any, content: string): any {
    const contentSize = Buffer.byteLength(content, 'utf8');
    
    return {
      source_url: source.url,
      source_type: source.source_type,
      loader_type: source.loader_type,
      minecraft_version: source.minecraft_version,
      content_size_bytes: contentSize,
      content_size_kb: Math.round(contentSize / 1024),
      processed_at: new Date().toISOString(),
      checksum: crypto.createHash('sha256').update(content).digest('hex'),
    };
  }
}