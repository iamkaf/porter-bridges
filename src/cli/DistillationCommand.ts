/**
 * @file Distillation Command - Individual distillation phase execution
 */

import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { DistillationModule } from '../modules/DistillationModule';
import { CriticalError, PipelineValidator } from '../utils/CriticalError';
import type { DistillationCLIOptions, PipelineSourceType } from '../types/pipeline';

export async function executeDistillationCommand(options: DistillationCLIOptions) {
  try {
    logger.info('🚀 Linkie Porting Intelligence - Distillation Module');

    // Load collected sources
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
      console.log('💡 Run collection first: npm run collect');
      process.exit(1);
    }

    // Prepare distillation filters
    const filters: Record<string, any> = {
      sourceType: options.filterType,
      loaderType: options.filterLoader,
      priority: options.filterPriority,
      minRelevance: options.minRelevance ? parseFloat(options.minRelevance) : undefined,
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
      maxConcurrentDistillations: parseInt(options.maxConcurrent),
      timeout: parseInt(options.timeout),
    });

    // Run distillation
    const results = options.resume
      ? await distillation.resumeDistillation(sourcesData, filters)
      : await distillation.distill(sourcesData, filters);

    // CRITICAL: Validate distillation output before proceeding
    try {
      PipelineValidator.validateDistillationOutput(results);
      logger.info('✅ Distillation validation passed');
    } catch (error: any) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL DISTILLATION FAILURE', error.toLogFormat());
        console.error(error.toCLIFormat());
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
      console.log('\n🎉 Ready for next step:');
      console.log(`   npm run bundle -i ${options.output}`);
      console.log(`   View distilled content in: ${options.outputDir}`);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Distillation failed');
    process.exit(1);
  }
}
