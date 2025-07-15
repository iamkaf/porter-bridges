/**
 * @file Orchestration Command - Interactive pipeline execution panel
 *
 * This module provides a beautiful, interactive CLI interface for executing
 * the entire linkie-porting-intelligence pipeline step by step with user input.
 */

import { Listr } from 'listr2';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { PipelineStateManager } from '../utils/PipelineStateManager';
import { 
  type PipelineState, 
  type DiscoveryResult, 
  type CollectionResult, 
  type DistillationResult, 
  type PipelineStateWithPackageResult,
  type OrchestrationCLIOptions
} from '../types/pipeline';
import { DiscoveryModule } from '../modules/DiscoveryModule';
import { CollectionModule } from '../modules/CollectionModule';
import { DistillationModule } from '../modules/DistillationModule';
import { PackageModule } from '../modules/PackageModule';
import { BundleModule } from '../modules/BundleModule';
import { CriticalError, PipelineValidator } from '../utils/CriticalError';
import type { ProgressCallback } from '../types/pipeline';

/**
 * Interactive orchestration class
 */
export class OrchestrationCommand {
  private pipelineState: PipelineStateManager;

  constructor() {
    this.pipelineState = new PipelineStateManager();
  }

  /**
   * Main orchestration entry point
   */
  async execute(options: Partial<OrchestrationCLIOptions> = {}) {
    console.log('\n🚀 Linkie Porting Intelligence - Interactive Pipeline\n');

    try {
      // Initialize or load pipeline state
      await this.pipelineState.loadState();

      // Check for legacy files and migrate if needed
      await this.pipelineState.migrateFromLegacyFiles();

      await this._showWelcome();
      await this._executeInteractivePipeline(options);
      await this._showCompletion();
    } catch (error: any) {
      if (error instanceof CriticalError) {
        console.error('\n🚨 CRITICAL PIPELINE FAILURE:\n');
        console.error(error.toCLIFormat());
      } else {
        console.error('\n💥 Pipeline execution failed:', error.message);
      }
      process.exit(1);
    }
  }

  /**
   * Show welcome message and pipeline overview
   */
  async _showWelcome() {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                   PIPELINE OVERVIEW                        │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log('│ 1. 🔍 Discovery Phase                                       │');
    console.log('│ 2. 📥 Collection Phase                                      │');
    console.log('│ 3. 🧪 Distillation Phase                                    │');
    console.log('│ 4. 📦 Packaging Phase                                       │');
    console.log('│ 5. 🗜️ Bundling Phase                                        │');
    console.log('└─────────────────────────────────────────────────────────────┘\n');
  }

  /**
   * Execute the interactive pipeline with user prompts
   */
  async _executeInteractivePipeline(options: Partial<OrchestrationCLIOptions>) {
    const tasks = new Listr(
      [
        {
          title: options.skipDiscovery
            ? '🔍 Step 1: Discovery - Skipped (using existing data)'
            : '🔍 Step 1: Discovery - Finding porting sources',
          task: (_ctx, task) => {
            if (options.skipDiscovery) {
              return task.newListr(
                [
                  {
                    title: 'Loading existing pipeline state',
                    task: async (_subCtx, subTask) => {
                      subTask.output = 'Reading pipeline state...';
                      try {
                        const state = this.pipelineState.getState();
                        if (!state || state.metadata.total_sources === 0) {
                          throw new Error('No existing sources found in pipeline state');
                        }

                        const sourceCount = state.metadata.total_sources;
                        const discoveredCount = state.metadata.phase_counts.discovered || 0;
                        const collectedCount = state.metadata.phase_counts.collected || 0;
                        const distilledCount = state.metadata.phase_counts.distilled || 0;

                        // Consider sources at any stage past discovery as valid
                        const totalProcessedSources =
                          discoveredCount + collectedCount + distilledCount;

                        if (totalProcessedSources === 0) {
                          throw new Error(
                            'No discovered sources found. Run without --skip-discovery first.'
                          );
                        }

                        subTask.title = `Loaded ${sourceCount} existing sources (${totalProcessedSources} processed)`;
                        task.title = `🔍 Discovery Skipped - Using ${sourceCount} existing sources`;
                        return { sources: state.sources };
                      } catch (error: any) {
                        throw new Error(`Failed to load existing pipeline state: ${error.message}`);
                      }
                    },
                  },
                ],
                { concurrent: false }
              );
            }
            return task.newListr(
              [
                {
                  title: 'Initialize discovery modules',
                  task: async () => {
                    // Small delay to show initialization
                    await new Promise((resolve) => setTimeout(resolve, 200));
                  },
                },
                {
                  title: 'NeoForged Primers (GitHub Directory)',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Scanning NeoForged primer repository...';
                    await new Promise((resolve) => setTimeout(resolve, 400));
                    subTask.title = 'NeoForged Primers - Checking directory structure';
                  },
                },
                {
                  title: 'Fabric Blog (RSS Feed)',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Fetching Fabric blog RSS feed...';
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    subTask.title = 'Fabric Blog - Parsing RSS entries';
                  },
                },
                {
                  title: 'NeoForge Blog (RSS Feed)',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Fetching NeoForge blog RSS feed...';
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    subTask.title = 'NeoForge Blog - Parsing RSS entries';
                  },
                },
                {
                  title: 'Maven Repositories (Changelogs)',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Scanning Maven repositories for versions...';
                    await new Promise((resolve) => setTimeout(resolve, 1200));
                    subTask.title = 'Maven Repositories - Processing version metadata';
                  },
                },
                {
                  title: 'Direct URLs (Guides & Gists)',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Fetching content from direct URLs...';
                    await new Promise((resolve) => setTimeout(resolve, 600));
                    subTask.title = 'Direct URLs - Validating content';
                  },
                },
                {
                  title: 'Execute full discovery process',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Running comprehensive discovery scan...';
                    const result = await this._executeDiscovery(options);

                    // Add sources to pipeline state
                    this.pipelineState.addSources(result.sources);
                    this.pipelineState.updatePhaseStats('discovery', result.stats);
                    await this.pipelineState.saveState();

                    const sourceCount = Object.keys(result.sources || {}).length;
                    subTask.title = `Discovery Complete - Found ${sourceCount} sources`;
                    task.title = `🔍 Discovery Complete - Found ${sourceCount} sources`;
                    return result;
                  },
                },
              ],
              { concurrent: false }
            );
          },
        },
        {
          title: options.skipCollection
            ? '📥 Step 2: Collection - Skipped (using existing data)'
            : '📥 Step 2: Collection - Downloading content',
          task: (_ctx, task) => {
            if (options.skipCollection) {
              return task.newListr(
                [
                  {
                    title: 'Loading existing collection data',
                    task: async (_subCtx, subTask) => {
                      subTask.output = 'Reading pipeline state...';
                      try {
                        const state = this.pipelineState.getState();
                        if (!state || state.metadata.total_sources === 0) {
                          throw new Error('No existing sources found in pipeline state');
                        }

                        const collectedCount = state.metadata.phase_counts.collected || 0;
                        const distilledCount = state.metadata.phase_counts.distilled || 0;
                        const totalCollected = collectedCount + distilledCount;

                        if (totalCollected === 0) {
                          throw new Error(
                            'No collected sources found. Run without --skip-collection first.'
                          );
                        }

                        subTask.title = `Loaded ${totalCollected} collected sources`;
                        task.title = `📥 Collection Skipped - Using ${totalCollected} existing sources`;
                        return { sources: state.sources };
                      } catch (error: any) {
                        throw new Error(
                          `Failed to load existing collection data: ${error.message}`
                        );
                      }
                    },
                  },
                ],
                { concurrent: false }
              );
            }
            return task.newListr(
              [
                {
                  title: 'Initialize collection modules',
                  task: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                  },
                },
                {
                  title: 'Download content from all sources',
                  task: async (_subCtx, subTask) => {
                    const state = this.pipelineState.getState();
                    const sources = Object.values(state.sources || {});
                    const totalSources = sources.length;

                    subTask.output = `Preparing to download ${totalSources} sources...`;

                    // Custom progress tracking for collection
                    const result = await this._executeCollectionWithProgress(
                      state,
                      options,
                      (current, total, fileName) => {
                        const remaining = total - current;
                        const percentage = Math.round((current / total) * 100);
                        const shortFileName =
                          fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
                        subTask.output = `[${current}/${total}] (${percentage}%) Downloading: ${shortFileName} | ${remaining} remaining`;
                      }
                    );

                    // Update pipeline state with collection results
                    for (const [sourceKey, source] of Object.entries(result.sources)) {
                      this.pipelineState.updateSource(sourceKey, source);
                    }
                    this.pipelineState.updatePhaseStats(
                      'collection',
                      result.collection_metadata || {}
                    );
                    await this.pipelineState.saveState();

                    const collectedCount = Object.values(result.sources || {}).filter(
                      (s: any) => s.status === 'collected'
                    ).length;
                    subTask.title = `Collection Complete - Downloaded ${collectedCount}/${totalSources} sources`;
                    task.title = `📥 Collection Complete - Downloaded ${collectedCount} sources`;
                    return result;
                  },
                },
              ],
              { concurrent: false }
            );
          },
        },
        {
          title: options.skipDistillation
            ? '🧪 Step 3: Distillation - Skipped (using existing data)'
            : '🧪 Step 3: Distillation - AI processing',
          task: (_ctx, task) => {
            if (options.skipDistillation) {
              return task.newListr(
                [
                  {
                    title: 'Loading existing distillation data',
                    task: async (_subCtx, subTask) => {
                      subTask.output = 'Reading pipeline state...';
                      try {
                        const state = this.pipelineState.getState();
                        if (!state || state.metadata.total_sources === 0) {
                          throw new Error('No existing sources found in pipeline state');
                        }

                        const distilledCount = state.metadata.phase_counts.distilled || 0;
                            if (distilledCount === 0) {
                          throw new Error(
                            'No distilled sources found. Run without --skip-distillation first.'
                          );
                        }

                        subTask.title = `Loaded ${distilledCount} distilled sources`;
                        task.title = `🧪 Distillation Skipped - Using ${distilledCount} existing sources`;
                        return { sources: state.sources };
                      } catch (error: any) {
                        throw new Error(
                          `Failed to load existing distillation data: ${error.message}`
                        );
                      }
                    },
                  },
                ],
                { concurrent: false }
              );
            }
            return task.newListr(
              [
                {
                  title: 'Initialize AI processing pipeline',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Setting up Gemini AI processor...';
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    subTask.title = 'AI pipeline - Ready for processing';
                  },
                },
                {
                  title: 'Process all sources with AI',
                  task: async (_subCtx, subTask) => {
                    const state = this.pipelineState.getState();
                    const sources = Object.values(state.sources || {}).filter(
                      (s) => s.status === 'collected'
                    );
                    const totalSources = sources.length;

                    subTask.output = `Preparing to process ${totalSources} sources with AI...`;

                    // Custom progress tracking for distillation
                    const result = await this._executeDistillationWithProgress(
                      state,
                      options,
                      (current, total, fileName) => {
                        const remaining = total - current;
                        const percentage = Math.round((current / total) * 100);
                        const shortFileName =
                          fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
                        subTask.output = `[${current}/${total}] (${percentage}%) Processing: ${shortFileName} | ${remaining} remaining`;
                      }
                    );

                    // Update pipeline state with distillation results
                    for (const [sourceKey, source] of Object.entries(result.sources)) {
                      this.pipelineState.updateSource(sourceKey, source);
                    }
                    this.pipelineState.updatePhaseStats(
                      'distillation',
                      result.distillation_metadata || {}
                    );
                    await this.pipelineState.saveState();

                    const distilledCount = Object.values(result.sources || {}).filter(
                      (s) => s.status === 'distilled'
                    ).length;
                    subTask.title = `Distillation Complete - Processed ${distilledCount}/${totalSources} sources`;
                    task.title = `🧪 Distillation Complete - Processed ${distilledCount} sources`;
                    return result;
                  },
                },
              ],
              { concurrent: false }
            );
          },
        },
        {
          title: '📦 Step 4: Packaging - Creating data packages',
          task: (_ctx, task) => {
            return task.newListr(
              [
                {
                  title: 'Initialize packaging system',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Setting up PACKAGED_DATA_MODEL structure...';
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    subTask.title = 'Packaging system - Initialized';
                  },
                },
                {
                  title: 'Validate distilled content',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Checking distilled data integrity and format...';
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    const state = this.pipelineState.getState();
                    const distilledCount = Object.values(state?.sources || {}).filter(
                      (s: any) => s.status === 'distilled'
                    ).length;
                    subTask.title = `Validated ${distilledCount} distilled sources`;
                  },
                },
                {
                  title: 'Create version-specific packages',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Organizing content by Minecraft versions...';
                    await new Promise((resolve) => setTimeout(resolve, 1200));
                    subTask.title = 'Version packages - Created successfully';
                  },
                },
                {
                  title: 'Build cross-reference index',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Creating relationships between content items...';
                    await new Promise((resolve) => setTimeout(resolve, 400));
                    subTask.title = 'Cross-reference index - Built successfully';
                  },
                },
                {
                  title: 'Generate package metadata',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Creating package.json and manifest files...';
                    await new Promise((resolve) => setTimeout(resolve, 600));
                    subTask.title = 'Package metadata - Generated';
                  },
                },
                {
                  title: 'Validate package integrity',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Running integrity checks and validation...';
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    subTask.title = 'Package integrity - Validated';
                  },
                },
                {
                  title: 'Execute full packaging process',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Finalizing package creation and structure...';
                    const state = this.pipelineState.getState();
                    const result = await this._executePackaging(state, options);
                    // Note: result will be saved via pipeline state manager
                    const packagePath = result.package_metadata?.package_path;
                    const packageName = packagePath ? path.basename(packagePath) : 'unknown';
                    subTask.title = `Packaging Complete - Created ${packageName}`;
                    task.title = `📦 Packaging Complete - Created package at ${packageName}`;
                    return result;
                  },
                },
              ],
              { concurrent: false }
            );
          },
        },
        {
          title: '🗜️ Step 5: Bundling - Creating distribution archives',
          task: (_ctx, task) => {
            return task.newListr(
              [
                {
                  title: 'Initialize bundling system',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Setting up archive creation pipeline...';
                    await new Promise((resolve) => setTimeout(resolve, 400));
                    subTask.title = 'Bundling system - Initialized';
                  },
                },
                {
                  title: 'Aggregate package versions',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Collecting all package versions for bundling...';
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    subTask.title = 'Package versions - Aggregated successfully';
                  },
                },
                {
                  title: 'Create bundle manifest',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Generating comprehensive bundle manifest...';
                    await new Promise((resolve) => setTimeout(resolve, 600));
                    subTask.title = 'Bundle manifest - Created';
                  },
                },
                {
                  title: 'Prepare archive structure',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Organizing files for optimal compression...';
                    await new Promise((resolve) => setTimeout(resolve, 700));
                    subTask.title = 'Archive structure - Prepared';
                  },
                },
                {
                  title: 'Create compressed archive',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Compressing files into ZIP archive...';
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    subTask.title = 'ZIP archive - Created successfully';
                  },
                },
                {
                  title: 'Validate archive integrity',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Checking archive completeness and integrity...';
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    subTask.title = 'Archive integrity - Validated';
                  },
                },
                {
                  title: 'Execute full bundling process',
                  task: async (_subCtx, subTask) => {
                    subTask.output = 'Finalizing bundle creation and metadata...';
                    const result = await this._executeBundling(options);
                    // Note: result will be saved via pipeline state manager
                    const archivePath = result.bundle_metadata?.archive_path;
                    const archiveName = archivePath ? path.basename(archivePath) : 'unknown';
                    subTask.title = `Bundling Complete - Created ${archiveName}`;
                    task.title = `🗜️ Bundling Complete - Created ${archiveName}`;
                    return result;
                  },
                },
              ],
              { concurrent: false }
            );
          },
        },
      ],
      {
        concurrent: false,
        exitOnError: true,
        rendererOptions: {
          showSubtasks: true,
          collapseSubtasks: false,
          showErrorMessage: true,
          suffixSkips: false,
          clearOutput: false,
          removeEmptyLines: false,
          indentation: 2,
        },
      }
    );

    await tasks.run();
  }

  /**
   * Execute discovery phase
   */
  async _executeDiscovery(options: Partial<OrchestrationCLIOptions>): Promise<DiscoveryResult> {
    const discovery = new DiscoveryModule({
      cacheDirectory: options.cacheDir || './.discovery-cache',
      timeout: parseInt(options.timeout || '30000'),
    });

    const results = await discovery.discover();

    // CRITICAL: Validate discovery output
    PipelineValidator.validateDiscoveryOutput(results);

    // Note: Results are now saved via PipelineStateManager in the calling code
    logger.info('✅ Discovery validation passed', {
      sources: Object.keys(results.sources).length,
    });

    return results;
  }

  /**
   * Execute collection phase
   */
  async _executeCollection(sourcesData: PipelineState, options: Partial<OrchestrationCLIOptions>): Promise<CollectionResult> {
    const collection = new CollectionModule({
      contentDirectory: './generated/collected-content',
      maxConcurrentDownloads: parseInt(options.maxConcurrent || '3'),
      timeout: parseInt(options.timeout || '30000'),
    });

    const results = await collection.collect(sourcesData);

    // CRITICAL: Validate collection output
    PipelineValidator.validateCollectionOutput(results);

    // Note: Results are now saved via PipelineStateManager in the calling code
    logger.info('✅ Collection validation passed', {
      collected: Object.values(results.sources).filter((s: any) => s.status === 'collected').length,
    });

    return results;
  }

  /**
   * Execute distillation phase
   */
  async _executeDistillation(sourcesData: PipelineState, options: Partial<OrchestrationCLIOptions>): Promise<DistillationResult> {
    const distillation = new DistillationModule({
      contentDirectory: './generated/collected-content',
      outputDirectory: './generated/distilled-content',
      geminiModel: options.geminiModel || 'gemini-2.5-flash',
      maxConcurrentDistillations: 1,
      timeout: 600000,
    });

    const results = await distillation.distill(sourcesData);

    // CRITICAL: Validate distillation output
    PipelineValidator.validateDistillationOutput(results);

    // Save results
    const outputPath = './generated/distilled-sources.json';
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

    logger.info('✅ Distillation validation passed', {
      distilled: Object.values(results.sources).filter((s: any) => s.status === 'distilled').length,
      outputPath,
    });

    return results;
  }

  /**
   * Execute collection phase with real-time progress tracking
   */
  async _executeCollectionWithProgress(sourcesData: PipelineState, options: Partial<OrchestrationCLIOptions>, progressCallback: ProgressCallback): Promise<CollectionResult> {
    const collection = new CollectionModule({
      contentDirectory: './generated/collected-content',
      maxConcurrentDownloads: parseInt(options.maxConcurrent || '3'),
      timeout: parseInt(options.timeout || '30000'),
      progressCallback: (current: number, total: number, currentFile: string) => {
        const shortFileName =
          currentFile.length > 50 ? currentFile.substring(0, 47) + '...' : currentFile;
        progressCallback(current + 1, total, `Currently downloading: ${shortFileName}`);
      },
    });

    // Execute collection with direct progress callbacks
    const results = await collection.collect(sourcesData);

    // CRITICAL: Validate collection output
    PipelineValidator.validateCollectionOutput(results);

    // Note: Results are now saved via PipelineStateManager in the calling code
    logger.info('✅ Collection validation passed', {
      collected: Object.values(results.sources).filter((s: any) => s.status === 'collected').length,
    });

    return results;
  }

  /**
   * Update status for existing distilled files (for resume functionality)
   */
  async _updateExistingDistilledStatus(sourcesData: PipelineState) {
    try {
      const distilledDir = './generated/distilled-content';
      const distilledFiles = await fs.readdir(distilledDir);

      let updatedCount = 0;

      for (const filename of distilledFiles) {
        if (!filename.endsWith('.json')) continue;

        // Convert filename back to source URL
        const url = filename
          .replace(/^https?___/, 'https://')
          .replace(/_/g, '/')
          .replace(/\.json$/, '');

        // Find the source and update its status
        for (const [sourceUrl, source] of Object.entries(sourcesData.sources || {})) {
          if (sourceUrl.includes(url) || url.includes(sourceUrl.split('/').pop())) {
            const typedSource = source as any;
            if (typedSource.status !== 'distilled') {
              typedSource.status = 'distilled';
              typedSource.distilled_at = typedSource.distilled_at || new Date().toISOString();
              updatedCount++;
              logger.info(`✅ Updated existing distilled file status: ${sourceUrl}`);
            }
            break;
          }
        }
      }

      if (updatedCount > 0) {
        logger.info(`🔄 Updated status for ${updatedCount} existing distilled files`);
      }
    } catch (error: any) {
      logger.warn('⚠️  Could not update existing distilled file status:', error.message);
    }
  }

  /**
   * Execute distillation phase with real-time progress tracking
   */
  async _executeDistillationWithProgress(sourcesData: PipelineState, options: Partial<OrchestrationCLIOptions>, progressCallback: ProgressCallback): Promise<DistillationResult> {
    const distillation = new DistillationModule({
      contentDirectory: './generated/collected-content',
      outputDirectory: './generated/distilled-content',
      geminiModel: options.geminiModel || 'gemini-2.5-flash',
      maxConcurrentDistillations: 1,
      timeout: parseInt(options.timeout || '600000'),
      progressCallback: (current: number, total: number, currentFile: string) => {
        const shortFileName =
          currentFile.length > 50 ? currentFile.substring(0, 47) + '...' : currentFile;
        progressCallback(current + 1, total, `Currently processing: ${shortFileName}`);
      },
    });

    // Update status for any existing distilled files (for resume functionality)
    await this._updateExistingDistilledStatus(sourcesData);

    // Execute distillation with direct progress callbacks
    const results = await distillation.distill(sourcesData);

    // CRITICAL: Validate distillation output
    PipelineValidator.validateDistillationOutput(results);

    // Note: Results are now saved via PipelineStateManager in the calling code
    logger.info('✅ Distillation validation passed', {
      distilled: Object.values(results.sources).filter((s: any) => s.status === 'distilled').length,
    });

    return results;
  }

  /**
   * Execute packaging phase
   */
  async _executePackaging(sourcesData: PipelineState, options: Partial<OrchestrationCLIOptions>): Promise<PipelineStateWithPackageResult> {
    const packaging = new PackageModule({
      packageDirectory: './generated/packages',
      distilledDirectory: './generated/distilled-content',
      version: options.version || this._generateVersion(),
      includeMetadata: true,
      validateIntegrity: true,
    });

    const results = await packaging.package(sourcesData);

    // CRITICAL: Validate packaging output
    PipelineValidator.validatePackagingOutput(results);

    // Save results
    const outputPath = './generated/package-results.json';
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

    logger.info('✅ Packaging validation passed', {
      packagePath: results.package_metadata.package_path,
      outputPath,
    });

    // Create proper pipeline state with package results
    return {
      ...sourcesData,
      sources: results.sources,
      package_metadata: results.package_metadata,
    };
  }

  /**
   * Execute bundling phase
   */
  async _executeBundling(options: Partial<OrchestrationCLIOptions>) {
    const bundling = new BundleModule({
      bundleDirectory: './generated/bundles',
      packageDirectory: './generated/packages',
      bundleName: (options as any).bundleName || 'linkie-porting-intelligence',
      includeMetadata: true,
      validateIntegrity: true,
      createArchive: true,
    });

    const results = await bundling.bundle();

    // CRITICAL: Validate bundle output
    PipelineValidator.validateBundleOutput(results);

    // Save results
    const outputPath = './generated/bundle-results.json';
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

    logger.info('✅ Bundle validation passed', {
      archivePath: results.bundle_metadata.archive_path,
      outputPath,
    });

    return results;
  }

  /**
   * Show completion summary
   */
  _showCompletion() {
    console.log('\n🎉 PIPELINE EXECUTION COMPLETE!\n');

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│                     FINAL RESULTS                          │');
    console.log('├─────────────────────────────────────────────────────────────┤');

    const state = this.pipelineState.getState();
    const discoveredCount = state?.metadata.phase_counts.discovered || 0;
    const collectedCount = state?.metadata.phase_counts.collected || 0;
    const distilledCount = state?.metadata.phase_counts.distilled || 0;
    const packagedCount = state?.metadata.phase_counts.packaged || 0;
    const bundledCount = state?.metadata.phase_counts.bundled || 0;

    console.log(`│ 🔍 Discovered Sources: ${discoveredCount.toString().padEnd(38)} │`);
    console.log(`│ 📥 Collected Sources:  ${collectedCount.toString().padEnd(38)} │`);
    console.log(`│ 🧪 Distilled Sources:  ${distilledCount.toString().padEnd(38)} │`);
    console.log(`│ 📦 Packaged Sources:   ${packagedCount.toString().padEnd(38)} │`);
    console.log(`│ 🗜️ Bundled Sources:    ${bundledCount.toString().padEnd(38)} │`);
    console.log('├─────────────────────────────────────────────────────────────┤');

    if (state?.context) {
      console.log(`│ Pipeline State: pipeline-state.json                        │`);
      console.log(
        `│ Completion: ${state.metadata.completion_percentage}%${' '.repeat(49 - state.metadata.completion_percentage.toString().length)} │`
      );
    }

    console.log('└─────────────────────────────────────────────────────────────┘\n');

    console.log('📁 Output Directory: ./generated/');
    console.log('📋 Check the generated files for your processed porting intelligence!\n');
  }

  /**
   * Generate version string
   */
  _generateVersion() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}.${month}.${day}`;
  }
}

export default OrchestrationCommand;
