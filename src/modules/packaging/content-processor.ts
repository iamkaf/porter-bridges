/**
 * @file Content Processor - Handles content processing and file operations
 *
 * This module handles the processing of source content for packaging,
 * including file naming, content validation, and metadata extraction.
 */

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  generateRawContentFilename,
  generateSafeFilename,
} from '../../utils/filename-utils';
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
      distilledDirectory:
        options.distilledDirectory || './generated/distilled-content',
      ...options,
    };
  }

  /**
   * Process a single source for PACKAGED_DATA_MODEL compliance
   */
  async processSourceForVersion(
    source: any,
    rawPath: string,
    _versionPath: string,
    docsPath?: string
  ): Promise<IContentProcessResult> {
    try {
      // Check if this source skipped distillation
      const skippedDistillation = source.processing_hints?.skip_distillation;

      let distilledData = null;
      let distilledContent = '';

      if (skippedDistillation) {
        // Handle documentation sources specially
        if (source.source_type === 'documentation' && docsPath) {
          await this.copyDocumentationCorpus(source, docsPath);
          
          distilledData = {
            breaking_changes: [],
            api_updates: [],
            migration_guides: [],
            dependency_updates: [],
            summaries: [],
            metadata: {
              source_type: source.source_type,
              skipped_distillation: true,
              reason: 'Documentation corpus - copied to docs/ directory',
              docs_location: `docs/${source.loader_type}/${source.minecraft_version}/`,
            },
          };
        } else {
          // For other sources that skipped distillation, use empty structure
          distilledData = {
            breaking_changes: [],
            api_updates: [],
            migration_guides: [],
            dependency_updates: [],
            summaries: [],
            metadata: {
              source_type: source.source_type,
              skipped_distillation: true,
              reason: 'Changelog content - preserved as-is',
            },
          };
        }
      } else {
        // Read distilled content for sources that went through distillation
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

        distilledContent = await fs.readFile(distilledFilePath, 'utf-8');
        distilledData = JSON.parse(distilledContent);
      }

      // Copy raw content to /raw/ directory
      const rawFileName = generateRawContentFilename(source);
      const rawFilePath = path.join(rawPath, rawFileName);

      // Find and copy original collected content with fallback extensions
      const collectedPath = await this.findCollectedContentFile(source.url);

      if (collectedPath) {
        try {
          await fs.copyFile(collectedPath, rawFilePath);
          logger.info(
            `📄 Copied raw content: ${rawFileName} (from ${path.basename(collectedPath)})`
          );
        } catch (error: any) {
          logger.warn(
            `⚠️  Could not copy raw content for ${source.url}: ${error.message}`
          );
        }
      } else {
        logger.warn(
          `⚠️  Could not find collected content for ${source.url} (tried .html and .md extensions)`
        );
      }

      // For sources that skipped distillation, get stats from collected content
      let fileStats;
      let contentChecksum;

      if (skippedDistillation) {
        // For skipped sources, use collected content for stats
        if (collectedPath) {
          try {
            fileStats = await fs.stat(collectedPath);
            const collectedContent = await fs.readFile(collectedPath, 'utf-8');
            contentChecksum = crypto
              .createHash('sha256')
              .update(collectedContent)
              .digest('hex');
          } catch {
            // Use defaults if collected content is not available
            fileStats = { size: 0 };
            contentChecksum = source.checksum || '';
          }
        } else {
          // Use defaults if no collected content found
          fileStats = { size: 0 };
          contentChecksum = source.checksum || '';
        }
      } else {
        const distilledFilePath = this.getDistilledPath(source.url);
        fileStats = await fs.stat(distilledFilePath);
        contentChecksum = crypto
          .createHash('sha256')
          .update(distilledContent)
          .digest('hex');
      }

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
          token_usage:
            source.distillation_metadata?.token_usage?.total_tokens || 0,
        },
        distilledData,
        fileSize: fileStats.size,
      };
    } catch (error: any) {
      logger.error(`Failed to process source: ${source.url}`, {
        error: error.message,
      });
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
   * Try to find collected content file with fallback extensions and URL encoding variants
   */
  async findCollectedContentFile(url: string): Promise<string | null> {
    const collectedDir = path.join(
      this.options.distilledDirectory,
      '..',
      'collected-content'
    );

    // Generate both decoded and encoded versions of the filename
    const decodedBaseName = generateSafeFilename(url);
    const encodedBaseName = url
      .replace(/^https?:\/\//, '')
      .replace(/[^\w\-_.~]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const possibleExtensions = ['.html', '.md', '.txt'];
    const possibleBaseNames = [decodedBaseName, encodedBaseName];

    // Try all combinations of base names and extensions
    for (const baseName of possibleBaseNames) {
      for (const ext of possibleExtensions) {
        const filePath = path.join(collectedDir, `${baseName}${ext}`);
        try {
          await fs.access(filePath);
          return filePath;
        } catch {
          // Continue to next combination
        }
      }
    }

    return null;
  }

  /**
   * Generate raw filename for /raw/ directory
   * @deprecated Use generateRawContentFilename from filename-utils instead
   */
  generateRawFileName(source: any): string {
    return generateRawContentFilename(source);
  }

  /**
   * Copy documentation corpus from collected-docs to package docs directory
   */
  async copyDocumentationCorpus(source: any, docsPath: string): Promise<void> {
    try {
      // Build source path from collected-docs structure
      const collectedDocsDir = process.env.PORTER_BRIDGES_DOCS_DIR || './generated/collected-docs';
      const sourcePath = path.join(collectedDocsDir, 'docs', source.loader_type, source.minecraft_version);
      
      // Build target path in package
      const targetPath = path.join(docsPath, source.loader_type, source.minecraft_version);
      
      // Check if source exists
      let sourceExists: boolean;
      try {
        await fs.access(sourcePath);
        sourceExists = true;
      } catch {
        sourceExists = false;
      }
      
      if (!sourceExists) {
        logger.warn(`Documentation corpus not found: ${sourcePath}`);
        return;
      }
      
      // Copy entire documentation tree
      await this.copyDirectoryRecursive(sourcePath, targetPath);
      
      logger.info(`📚 Copied documentation corpus: ${source.loader_type}/${source.minecraft_version}`);
      
    } catch (error: any) {
      logger.error(`Failed to copy documentation corpus for ${source.url}`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Recursively copy directory contents
   */
  async copyDirectoryRecursive(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Generate source key for progress tracking
   */
  generateSourceKey(source: any): string {
    const type = source.source_type || 'unknown';
    const loaderType = source.loader_type || 'unknown';
    const version = source.minecraft_version || 'unknown';
    const urlHash = crypto
      .createHash('md5')
      .update(source.url)
      .digest('hex')
      .substring(0, 8);

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
      return {
        isValid: false,
        error: `Invalid JSON content: ${error.message}`,
      };
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
