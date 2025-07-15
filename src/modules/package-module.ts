/**
 * @file Package Module - Creates versioned data packages from distilled content
 *
 * This module handles the fourth phase of the pipeline - packaging distilled intelligence
 * into versioned, distributable packages with metadata, validation, and integrity checks.
 *
 * Key responsibilities:
 * - Create versioned package structure with metadata
 * - Validate all distilled content integrity
 * - Generate package manifests and checksums
 * - Support incremental packaging and updates
 * - Track packaging statistics and quality metrics
 */

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger';
import type { PipelineState } from '../utils/pipeline-state-manager';
import { ContentProcessor } from './packaging/content-processor';
import { CrossReferenceAnalyzer } from './packaging/cross-reference-analyzer';
import { PackageStats } from './packaging/package-stats';
import { VersionGrouper } from './packaging/version-grouper';

/**
 * Main Package Module class
 */
export class PackageModule {
  private options: any;
  private stats: PackageStats;
  private crossReferenceAnalyzer: CrossReferenceAnalyzer;
  private versionGrouper: VersionGrouper;
  private contentProcessor: ContentProcessor;

  constructor(options: any = {}) {
    this.options = {
      packageDirectory: options.packageDirectory || './generated/packages',
      distilledDirectory:
        options.distilledDirectory || './generated/distilled-content',
      version: options.version || this._generateVersion(),
      includeMetadata: options.includeMetadata !== false,
      validateIntegrity: options.validateIntegrity !== false,
      ...options,
    };

    this.stats = new PackageStats();
    this.crossReferenceAnalyzer = new CrossReferenceAnalyzer();
    this.versionGrouper = new VersionGrouper();
    this.contentProcessor = new ContentProcessor(this.options);
  }

  /**
   * Main packaging entry point - creates PACKAGED_DATA_MODEL.md compliant structure
   */
  async package(sourcesData: PipelineState, options = {}) {
    logger.info(
      '📦 Starting packaging process (PACKAGED_DATA_MODEL compliant)'
    );
    this.stats.startPackaging();

    try {
      // Filter distilled sources
      const distilledSources = this._getDistilledSources(sourcesData);
      this.stats.setTotalSources(distilledSources.length);

      if (distilledSources.length === 0) {
        logger.warn('⚠️  No distilled sources found for packaging');
        this.stats.endPackaging();
        return this._buildResults(sourcesData, options);
      }

      logger.info('📋 Found distilled sources to package', {
        count: distilledSources.length,
      });

      // Create PACKAGED_DATA_MODEL compliant structure
      const packagePath = path.join(
        this.options.packageDirectory,
        `linkie-porting-data-v${this.options.version}`
      );
      const rawPath = path.join(packagePath, 'raw');
      const distilledPath = path.join(packagePath, 'distilled');

      await fs.mkdir(rawPath, { recursive: true });
      await fs.mkdir(distilledPath, { recursive: true });

      logger.info('📁 Created package structure', {
        packagePath,
        rawPath,
        distilledPath,
      });

      // Process sources and organize by version
      const versionGroups =
        this.versionGrouper.groupSourcesByVersion(distilledSources);
      const packageResults: {
        sources: Record<string, any>;
        distillation: Record<string, any>;
      } = { sources: {}, distillation: {} };

      for (const [version, sources] of Object.entries(versionGroups)) {
        const versionPath = path.join(distilledPath, version);
        await fs.mkdir(versionPath, { recursive: true });

        logger.info(`📂 Processing version: ${version}`, {
          sourceCount: sources.length,
        });

        const breakingChanges = [];
        const apiUpdates = [];
        const migrationGuides = [];
        const dependencyUpdates = [];
        const summaries = [];

        for (const source of sources) {
          try {
            const result = await this.contentProcessor.processSourceForVersion(
              source,
              rawPath,
              versionPath
            );

            if (result) {
              packageResults.sources[
                this.contentProcessor.generateSourceKey(source)
              ] = result.sourceProgress;
              packageResults.distillation[
                this.contentProcessor.generateSourceKey(source)
              ] = result.distillationProgress;

              // Categorize distilled content and add source attribution
              if (result.distilledData.breaking_changes) {
                const attributedBreakingChanges =
                  result.distilledData.breaking_changes.map((item: any) => ({
                    ...item,
                    source_url: source.url,
                  }));
                breakingChanges.push(...attributedBreakingChanges);
              }
              if (result.distilledData.api_updates) {
                const attributedApiUpdates =
                  result.distilledData.api_updates.map((item: any) => ({
                    ...item,
                    source_url: source.url,
                  }));
                apiUpdates.push(...attributedApiUpdates);
              }
              if (result.distilledData.migration_guides) {
                const attributedMigrationGuides =
                  result.distilledData.migration_guides.map((item: any) => ({
                    ...item,
                    source_url: source.url,
                  }));
                migrationGuides.push(...attributedMigrationGuides);
              }
              if (result.distilledData.dependency_updates) {
                const attributedDependencyUpdates =
                  result.distilledData.dependency_updates.map((item: any) => ({
                    ...item,
                    source_url: source.url,
                  }));
                dependencyUpdates.push(...attributedDependencyUpdates);
              }
              if (result.distilledData.summary) {
                summaries.push({
                  summary: result.distilledData.summary,
                  source_url: source.url,
                  source_type: source.source_type,
                  loader_type: source.loader_type,
                });
              }

              this.stats.incrementPackaged(result.fileSize);
            }
          } catch (error: any) {
            this.stats.incrementFailed();
            logger.error(
              `❌ Processing failed: ${source.url} - ${error.message}`
            );

            // Add failed entry to progress tracking
            packageResults.sources[
              this.contentProcessor.generateSourceKey(source)
            ] = {
              status: 'failed',
              url: source.url,
              error: error.message,
              failed_at: new Date().toISOString(),
            };
          }
        }

        // Apply cross-referencing and de-duplication
        const processedBreakingChanges =
          this.crossReferenceAnalyzer.processWithCrossReferences(
            breakingChanges,
            'breaking_change'
          );
        const processedApiUpdates =
          this.crossReferenceAnalyzer.processWithCrossReferences(
            apiUpdates,
            'api_update'
          );

        // Write categorized content for version
        if (processedBreakingChanges.length > 0) {
          const breakingChangesPath = path.join(
            versionPath,
            'breaking-changes.json'
          );
          await fs.writeFile(
            breakingChangesPath,
            JSON.stringify(
              {
                version,
                breaking_changes: processedBreakingChanges,
                processing_metadata: {
                  total_sources: breakingChanges.length,
                  deduplicated_count:
                    breakingChanges.length - processedBreakingChanges.length,
                  cross_references_added:
                    this.crossReferenceAnalyzer.countCrossReferences(
                      processedBreakingChanges
                    ),
                },
              },
              null,
              2
            )
          );
          logger.info(`📝 Wrote breaking changes for ${version}`, {
            original: breakingChanges.length,
            processed: processedBreakingChanges.length,
            deduplicated:
              breakingChanges.length - processedBreakingChanges.length,
          });
        }

        if (processedApiUpdates.length > 0) {
          const apiUpdatesPath = path.join(versionPath, 'api-updates.json');
          await fs.writeFile(
            apiUpdatesPath,
            JSON.stringify(
              {
                version,
                api_updates: processedApiUpdates,
                processing_metadata: {
                  total_sources: apiUpdates.length,
                  deduplicated_count:
                    apiUpdates.length - processedApiUpdates.length,
                  cross_references_added:
                    this.crossReferenceAnalyzer.countCrossReferences(
                      processedApiUpdates
                    ),
                },
              },
              null,
              2
            )
          );
          logger.info(`📝 Wrote API updates for ${version}`, {
            original: apiUpdates.length,
            processed: processedApiUpdates.length,
            deduplicated: apiUpdates.length - processedApiUpdates.length,
          });
        }

        // Write migration guides (no cross-referencing needed as they're typically comprehensive)
        if (migrationGuides.length > 0) {
          const migrationGuidesPath = path.join(
            versionPath,
            'migration-guides.json'
          );
          await fs.writeFile(
            migrationGuidesPath,
            JSON.stringify(
              {
                version,
                migration_guides: migrationGuides,
                processing_metadata: {
                  total_sources: migrationGuides.length,
                },
              },
              null,
              2
            )
          );
          logger.info(`📝 Wrote migration guides for ${version}`, {
            count: migrationGuides.length,
          });
        }

        // Write dependency updates with cross-referencing
        if (dependencyUpdates.length > 0) {
          const processedDependencyUpdates =
            this.crossReferenceAnalyzer.processWithCrossReferences(
              dependencyUpdates,
              'dependency_update'
            );
          const dependencyUpdatesPath = path.join(
            versionPath,
            'dependency-updates.json'
          );
          await fs.writeFile(
            dependencyUpdatesPath,
            JSON.stringify(
              {
                version,
                dependency_updates: processedDependencyUpdates,
                processing_metadata: {
                  total_sources: dependencyUpdates.length,
                  deduplicated_count:
                    dependencyUpdates.length -
                    processedDependencyUpdates.length,
                  cross_references_added:
                    this.crossReferenceAnalyzer.countCrossReferences(
                      processedDependencyUpdates
                    ),
                },
              },
              null,
              2
            )
          );
          logger.info(`📝 Wrote dependency updates for ${version}`, {
            original: dependencyUpdates.length,
            processed: processedDependencyUpdates.length,
            deduplicated:
              dependencyUpdates.length - processedDependencyUpdates.length,
          });
        }

        // Write summaries (no cross-referencing needed)
        if (summaries.length > 0) {
          const summariesPath = path.join(versionPath, 'summaries.json');
          await fs.writeFile(
            summariesPath,
            JSON.stringify(
              {
                version,
                summaries,
                processing_metadata: {
                  total_sources: summaries.length,
                },
              },
              null,
              2
            )
          );
          logger.info(`📝 Wrote summaries for ${version}`, {
            count: summaries.length,
          });
        }
      }

      // Generate PACKAGED_DATA_MODEL compliant package.json
      const packageMetadata = await this._generatePackageMetadata(
        packageResults,
        sourcesData
      );
      const metadataPath = path.join(packagePath, 'package.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify(packageMetadata, null, 2)
      );

      logger.info('📋 Generated PACKAGED_DATA_MODEL compliant package.json', {
        path: metadataPath,
      });

      // Generate package tree structure markdown
      await this._generatePackageTree(packagePath!);
      logger.info('🌳 Generated package tree structure markdown');

      this.stats.endPackaging();
      this._logSummary(packagePath);

      return this._buildResults(sourcesData, options, packagePath);
    } catch (error: any) {
      this.stats.endPackaging();
      logger.error('💥 Packaging failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get packaging results for export
   */
  getPackageResults() {
    return {
      stats: this.stats.getStats(),
      summary: this.stats.getSummary(),
    };
  }

  // Private helper methods

  _getDistilledSources(sourcesData: PipelineState) {
    const sources = Object.values(sourcesData.sources || {});
    return sources.filter((source) => source.status === 'distilled');
  }

  /**
   * Generate PACKAGED_DATA_MODEL compliant package.json
   */
  _generatePackageMetadata(packageResults: any, _sourcesData: any): any {
    return {
      name: 'linkie-porting-data',
      version: this.options.version,
      description:
        'A comprehensive, versioned collection of Minecraft mod porting data.',
      progress: {
        sources: packageResults.sources,
        distillation: packageResults.distillation,
      },
    };
  }

  _generateContentBreakdown(sourcesData: any): Record<string, number> {
    const sources = Object.values(sourcesData.sources || {});
    const breakdown: Record<string, number> = {};

    for (const source of sources) {
      const typedSource = source as any;
      if (typedSource.status === 'distilled') {
        const key = `${typedSource.source_type}_${typedSource.loader_type}`;
        breakdown[key] = (breakdown[key] || 0) + 1;
      }
    }

    return breakdown;
  }

  async _generateChecksums(packagePath: string): Promise<any> {
    const checksums: Record<string, any> = {};

    try {
      const files = await fs.readdir(packagePath);

      for (const file of files) {
        const filePath = path.join(packagePath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile() && file !== 'checksums.json') {
          const content = await fs.readFile(filePath);
          checksums[file] = {
            sha256: crypto.createHash('sha256').update(content).digest('hex'),
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        }
      }
    } catch (error: any) {
      logger.warn('Failed to generate checksums', { error: error.message });
    }

    return {
      generated_at: new Date().toISOString(),
      checksums,
    };
  }

  _generateVersion() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}.${month}.${day}`;
  }

  _logSummary(packagePath: string): void {
    const summary = this.stats.getSummary();

    logger.info(
      '📊 Packaging Summary (with Cross-Referencing & De-duplication)',
      {
        totalSources: summary.total_sources,
        packagedSources: summary.packaged_sources,
        failedSources: summary.failed_sources,
        successRate: `${summary.success_rate}%`,
        totalSizeKB: summary.total_file_size_kb,
        durationSeconds: summary.duration_seconds,
        packagePath,
        enhancedFeatures: [
          'cross_referencing',
          'deduplication',
          'relationship_scoring',
        ],
      }
    );
  }

  /**
   * Generate a markdown file showing the package directory tree structure
   */
  async _generatePackageTree(packagePath: string): Promise<void> {
    try {
      const treeMd = await this._buildDirectoryTree(packagePath, packagePath);
      const packageName = path.basename(packagePath);

      const treeContent =
        '# Package Tree Structure\n\n' +
        `This document shows the complete directory structure of the **${packageName}** package.\n\n` +
        `Generated: ${new Date().toISOString()}\n\n` +
        '## Directory Structure\n\n' +
        `\`\`\`\n${treeMd}\`\`\`\n\n` +
        '## Structure Description\n\n' +
        '- **raw/** - Original collected content files\n' +
        '- **distilled/** - AI-processed structured content organized by Minecraft version\n' +
        '- **package.json** - Package metadata and manifest\n' +
        '- **TREE.md** - This directory structure documentation\n';

      const treePath = path.join(packagePath, 'TREE.md');
      await fs.writeFile(treePath, treeContent, 'utf8');
    } catch (error: any) {
      logger.warn('⚠️  Failed to generate package tree structure', {
        error: error.message,
      });
    }
  }

  /**
   * Recursively build directory tree structure
   */
  async _buildDirectoryTree(
    dirPath: string,
    rootPath: string,
    prefix = ''
  ): Promise<string> {
    const items = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      entries.sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory() && !b.isDirectory()) {
          return -1;
        }
        if (!a.isDirectory() && b.isDirectory()) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        const isLast = i === entries.length - 1;
        const currentPrefix = isLast ? '└── ' : '├── ';
        const nextPrefix = isLast ? '    ' : '│   ';

        items.push(prefix + currentPrefix + entry.name);

        if (entry.isDirectory()) {
          const subdirPath = path.join(dirPath, entry.name);
          const subtree: string = await this._buildDirectoryTree(
            subdirPath,
            rootPath,
            prefix + nextPrefix
          );
          items.push(subtree);
        }
      }
    } catch (_error: any) {
      // Skip directories that can't be read
    }

    return items.join('\n');
  }

  _buildResults(
    sourcesData: any,
    options: any,
    packagePath: string | null = null
  ): any {
    return {
      sources: sourcesData.sources,
      package_metadata: {
        packaged_at: new Date().toISOString(),
        package_version: this.options.version,
        package_path: packagePath,
        package_options: options,
        package_stats: {
          stats: this.stats.getStats(),
          summary: this.stats.getSummary(),
        },
      },
    };
  }
}

export default PackageModule;
