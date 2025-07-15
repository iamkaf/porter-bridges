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
import { CriticalError, PipelineValidator } from '../utils/CriticalError';
import { logger } from '../utils/logger';
import type { PipelineState } from '../utils/pipeline-state-manager';

export async function executeCollectionCommand(options: CollectionCLIOptions) {
  try {
    logger.info('🚀 Porter Bridges - Collection Module');

    // Load discovered sources
    let sourcesData: PipelineState;
    try {
      sourcesData = JSON.parse(await fs.readFile(options.input, 'utf8'));
      logger.info(
        {
          inputFile: options.input,
          sourceCount: Object.keys(sourcesData.sources || {}).length,
        },
        '📂 Loaded sources'
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
      maxConcurrentDownloads: Number.parseInt(options.maxConcurrent || '3', 10),
      timeout: Number.parseInt(options.timeout ?? ('30000' as any), 10), // fuck off TS
    });

    // Run collection
    const results = options.resume
      ? await collection.resumeCollection(sourcesData, filters)
      : await collection.collect(sourcesData, filters);

    // CRITICAL: Validate collection output before proceeding
    try {
      PipelineValidator.validateCollectionOutput(results);
      logger.info('✅ Collection validation passed');
    } catch (error: any) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL COLLECTION FAILURE', error.toLogFormat());
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

    // Write results to file
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
