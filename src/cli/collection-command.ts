/**
 * @file Collection Command - Individual collection phase execution
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CollectionModule } from '../modules/collection-module';
import type {
  CollectionCLIOptions,
  PipelineSourceType,
} from '../types/pipeline';
import { CriticalError, PipelineValidator } from '../utils/critical-error';
import { logger } from '../utils/logger';
import { PipelineStateManager, type PipelineState } from '../utils/pipeline-state-manager';

export async function executeCollectionCommand(options: CollectionCLIOptions) {
  try {
    logger.info('🚀 Porter Bridges - Collection Module');

    // Initialize pipeline state manager
    const stateManager = new PipelineStateManager();
    
    // Load pipeline state (always use state manager for persistence)
    let sourcesData: PipelineState;
    try {
      // Load from pipeline state manager
      await stateManager.loadState();
      sourcesData = stateManager.getState();
      logger.info(
        {
          sourceCount: Object.keys(sourcesData.sources || {}).length,
        },
        '📂 Loaded pipeline state'
      );
    } catch (error: any) {
      logger.error(
        { inputFile: options.input, error: error.message },
        '❌ Failed to load sources'
      );
      process.exit(1);
    }

    // Prepare collection filters
    const filters: Record<string, any> = {
      sourceType: options.filterType,
      loaderType: options.filterLoader,
      priority: options.filterPriority,
      minRelevance: options.minRelevance
        ? Number.parseFloat(options.minRelevance)
        : undefined,
      includeRetry: options.includeRetry || options.resume,
    };

    // Remove undefined filters
    Object.keys(filters).forEach((key) => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    // Log collection configuration
    logger.info(
      {
        contentDirectory: options.contentDir,
        maxConcurrent: options.maxConcurrent,
        timeout: options.timeout,
        filters: Object.keys(filters).length > 0 ? filters : 'none',
      },
      '⚙️  Collection Configuration'
    );

    // Initialize collection module
    const collection = new CollectionModule({
      contentDirectory: options.contentDir,
      maxConcurrent: Number.parseInt(options.maxConcurrent || '3', 10),
    });

    // Run collection
    const results = options.resume
      ? await collection.resumeCollection(sourcesData, filters)
      : await collection.collect(sourcesData, filters);

    // Update pipeline state with collection results FIRST (before validation)
    for (const [sourceKey, source] of Object.entries(results.sources)) {
      stateManager.updateSource(sourceKey, source);
    }
    stateManager.updatePhaseStats('collection', results.collection_metadata || {});
    await stateManager.saveState();

    // CRITICAL: Validate collection output after saving state
    try {
      PipelineValidator.validateCollectionOutput(results);
      logger.info('✅ Collection validation passed');
    } catch (error: any) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL COLLECTION FAILURE', error.toLogFormat());
        // State was already saved above, so this is just a warning about overall failure rate
        logger.warn('⚠️  State has been saved despite validation failure');
        process.exit(1);
      }
      throw error;
    }

    // Add collection metadata to results
    const outputData = {
      ...results,
      collection_metadata: {
        collected_at: new Date().toISOString(),
        collection_filters: filters,
        collection_stats: collection.getCollectionResults(),
        content_directory: options.contentDir,
      },
    };

    // Write results to file (for backward compatibility)
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, JSON.stringify(outputData, null, 2));

    const collectedCount = Object.values(outputData.sources || {}).filter(
      (s: PipelineSourceType) => s.status === 'collected'
    ).length;

    logger.info(
      {
        outputFile: options.output,
        contentDirectory: options.contentDir,
        collectedCount,
      },
      '✅ Collection complete! Results saved'
    );

    // Show next steps
    if (collectedCount > 0) {
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Collection failed');
    process.exit(1);
  }
}
