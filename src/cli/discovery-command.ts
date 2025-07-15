/**
 * @file Discovery Command - Individual discovery phase execution
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DiscoveryModule } from '../modules/discovery-module';
import type {
  DiscoveryCLIOptions,
  PipelineSourceType,
} from '../types/pipeline';
import { CriticalError, PipelineValidator } from '../utils/CriticalError';
import { logger } from '../utils/logger';

export async function executeDiscoveryCommand(options: DiscoveryCLIOptions) {
  try {
    logger.info('🚀 Porter Bridges - Discovery Module');

    // Initialize discovery module
    const discovery = new DiscoveryModule({
      cacheDirectory: options.cacheDir,
      timeout: Number.parseInt(options.timeout, 10),
    });

    // Run discovery
    const results = await discovery.discover();

    // CRITICAL: Validate discovery output before proceeding
    try {
      PipelineValidator.validateDiscoveryOutput(results);
      logger.info('✅ Discovery validation passed');
    } catch (error: unknown) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL DISCOVERY FAILURE', error.toLogFormat());
        process.exit(1);
      }
      throw error;
    }

    // Apply filters if specified
    let filteredSources: PipelineSourceType[] = Object.values(results.sources);

    if (options.filterType) {
      filteredSources = filteredSources.filter(
        (s) => s.source_type === options.filterType
      );
      logger.info(
        { type: options.filterType, count: filteredSources.length },
        '🔍 Filtered by source type'
      );
    }

    if (options.filterLoader) {
      filteredSources = filteredSources.filter(
        (s) => s.loader_type === options.filterLoader
      );
      logger.info(
        { loader: options.filterLoader, count: filteredSources.length },
        '🔍 Filtered by loader type'
      );
    }

    if (options.minRelevance) {
      const minScore = Number.parseFloat(options.minRelevance);
      filteredSources = filteredSources.filter(
        (s) => s.relevance_score >= minScore
      );
      logger.info(
        { minScore, count: filteredSources.length },
        '🔍 Filtered by relevance score'
      );
    }

    // Prepare output data
    const outputData = {
      ...results,
      sources: Object.fromEntries(filteredSources.map((s) => [s.url, s])),
      filters_applied: {
        type: options.filterType || null,
        loader: options.filterLoader || null,
        min_relevance: options.minRelevance
          ? Number.parseFloat(options.minRelevance)
          : null,
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
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error({ error: error.message }, '💥 Discovery failed');
    } else {
      logger.error({ error }, '💥 Discovery failed with unknown error');
    }
    process.exit(1);
  }
}
