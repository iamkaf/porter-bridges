/**
 * @file Collection Command - Individual collection phase execution
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { CollectionModule } from '../modules/CollectionModule';
import { CriticalError, PipelineValidator } from '../utils/CriticalError';
import type { CollectionCLIOptions, PipelineSourceType } from '../types/pipeline';

export async function executeCollectionCommand(options: CollectionCLIOptions) {
  try {
    logger.info('🚀 Linkie Porting Intelligence - Collection Module');

    // Load discovered sources
    let sourcesData;
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
      logger.error({ inputFile: options.input, error: error.message }, '❌ Failed to load sources');
      console.log('💡 Run discovery first: npm run cli discover');
      process.exit(1);
    }

    // Prepare collection filters
    const filters: Record<string, any> = {
      sourceType: options.filterType,
      loaderType: options.filterLoader,
      priority: options.filterPriority,
      minRelevance: options.minRelevance ? parseFloat(options.minRelevance) : undefined,
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
      maxConcurrentDownloads: parseInt(options.maxConcurrent || '3'),
      timeout: parseInt(options.timeout ?? '30000' as any), // fuck off TS
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
        console.error(error.toCLIFormat());
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
      console.log('\n🎉 Ready for next step:');
      console.log(`   npm run cli distill -i ${options.output}`);
      console.log(`   View content in: ${options.contentDir}`);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Collection failed');
    process.exit(1);
  }
}
