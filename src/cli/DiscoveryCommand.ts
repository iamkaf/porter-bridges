/**
 * @file Discovery Command - Individual discovery phase execution
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { DiscoveryModule } from '../modules/DiscoveryModule';
import { CriticalError, PipelineValidator } from '../utils/CriticalError';
import type { DiscoveryCLIOptions, PipelineSourceType } from '../types/pipeline';

export async function executeDiscoveryCommand(options: DiscoveryCLIOptions) {
  try {
    logger.info('🚀 Linkie Porting Intelligence - Discovery Module');

    // Initialize discovery module
    const discovery = new DiscoveryModule({
      cacheDirectory: options.cacheDir,
      timeout: parseInt(options.timeout),
    });

    // Run discovery
    const results = await discovery.discover();

    // CRITICAL: Validate discovery output before proceeding
    try {
      PipelineValidator.validateDiscoveryOutput(results);
      logger.info('✅ Discovery validation passed');
    } catch (error: any) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL DISCOVERY FAILURE', error.toLogFormat());
        console.error(error.toCLIFormat());
        process.exit(1);
      }
      throw error;
    }

    // Apply filters if specified
    let filteredSources: PipelineSourceType[] = Object.values(results.sources);

    if (options.filterType) {
      filteredSources = filteredSources.filter((s) => s.source_type === options.filterType);
      logger.info(
        { type: options.filterType, count: filteredSources.length },
        '🔍 Filtered by source type'
      );
    }

    if (options.filterLoader) {
      filteredSources = filteredSources.filter((s) => s.loader_type === options.filterLoader);
      logger.info(
        { loader: options.filterLoader, count: filteredSources.length },
        '🔍 Filtered by loader type'
      );
    }

    if (options.minRelevance) {
      const minScore = parseFloat(options.minRelevance);
      filteredSources = filteredSources.filter((s) => s.relevance_score >= minScore);
      logger.info({ minScore, count: filteredSources.length }, '🔍 Filtered by relevance score');
    }

    // Prepare output data
    const outputData = {
      ...results,
      sources: Object.fromEntries(filteredSources.map((s) => [s.url, s])),
      filters_applied: {
        type: options.filterType || null,
        loader: options.filterLoader || null,
        min_relevance: options.minRelevance ? parseFloat(options.minRelevance) : null,
      },
    };

    // Write results to file
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, JSON.stringify(outputData, null, 2));

    logger.info(
      {
        outputFile: options.output,
        sourceCount: filteredSources.length,
      },
      '✅ Discovery complete! Results saved'
    );

    console.log('\n🎉 Ready for next step:');
    console.log(`   npm run cli collect -i ${options.output}`);
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Discovery failed');
    process.exit(1);
  }
}
