/**
 * @file Distillation Command - Individual distillation phase execution
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DistillationModule } from '../modules/distillation-module';
import type {
  DistillationCLIOptions,
  PipelineSourceType,
} from '../types/pipeline';
import type { PipelineState } from '../utils/pipeline-state-manager';
import { CriticalError, PipelineValidator } from '../utils/CriticalError';
import { logger } from '../utils/logger';

export async function executeDistillationCommand(
  options: DistillationCLIOptions
) {
  try {
    logger.info('🚀 Linkie Porting Intelligence - Distillation Module');

    // Load collected sources
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.error(
          { inputFile: options.input, error: error.message },
          '❌ Failed to load sources'
        );
      } else {
        logger.error(
          { inputFile: options.input, error },
          '❌ Failed to load sources with unknown error'
        );
      }
      process.exit(1);
    }

    // Prepare distillation filters
    const filters: Record<string, unknown> = {
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
      if (filters[key as string] === undefined) {
        delete filters[key as string];
      }
    });

    // Log distillation configuration
    logger.info(
      {
        contentDirectory: options.contentDir,
        outputDirectory: options.outputDir,
        geminiModel: options.geminiModel,
        maxConcurrent: options.maxConcurrent,
        timeout: options.timeout,
        filters: Object.keys(filters).length > 0 ? filters : 'none',
      },
      '⚙️  Distillation Configuration'
    );

    // Initialize distillation module
    const distillation = new DistillationModule({
      contentDirectory: options.contentDir,
      outputDirectory: options.outputDir,
      geminiModel: options.geminiModel,
      maxConcurrentDistillations: Number.parseInt(options.maxConcurrent, 10),
      timeout: Number.parseInt(options.timeout, 10),
    });

    // Run distillation
    const results = options.resume
      ? await distillation.resumeDistillation(sourcesData, filters)
      : await distillation.distill(sourcesData, filters);

    // CRITICAL: Validate distillation output before proceeding
    try {
      PipelineValidator.validateDistillationOutput(results);
      logger.info('✅ Distillation validation passed');
    } catch (error: unknown) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL DISTILLATION FAILURE', error.toLogFormat());
        process.exit(1);
      }
      throw error;
    }

    // Add distillation metadata to results
    const outputData = {
      ...results,
      distillation_metadata: {
        distilled_at: new Date().toISOString(),
        distillation_filters: filters,
        distillation_stats: distillation.getDistillationResults(),
        content_directory: options.contentDir,
        output_directory: options.outputDir,
        gemini_model: options.geminiModel,
      },
    };

    // Write results to file
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, JSON.stringify(outputData, null, 2));

    const distilledCount = Object.values(outputData.sources || {}).filter(
      (s: PipelineSourceType) => s.status === 'distilled'
    ).length;

    logger.info(
      {
        outputFile: options.output,
        outputDirectory: options.outputDir,
        distilledCount,
      },
      '✅ Distillation complete! Results saved'
    );

    // Show next steps
    if (distilledCount > 0) {
      // Empty block, intentionally left blank
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error({ error: error.message }, '💥 Distillation failed');
    } else {
      logger.error({ error }, '💥 Distillation failed with unknown error');
    }
    process.exit(1);
  }
}
