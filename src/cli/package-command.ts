/**
 * @file Package Command - Individual packaging phase execution
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PackageModule } from '../modules/package-module';
import type { PackageCLIOptions, PipelineSourceType } from '../types/pipeline';
import { CriticalError, PipelineValidator } from '../utils/critical-error';
import { logger } from '../utils/logger';
import type { PipelineState } from '../utils/pipeline-state-manager';

export async function executePackageCommand(options: PackageCLIOptions) {
  try {
    logger.info('🚀 Porter Bridges - Package Module');

    // Load distilled sources
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

    // Log packaging configuration
    logger.info(
      {
        packageDirectory: options.outputDir,
        distilledDirectory: options.input,
        version: options.version || 'auto-generated',
        includeMetadata: true,
        validateIntegrity: true,
      },
      '⚙️  Packaging Configuration'
    );

    // Initialize package module
    const packaging = new PackageModule({
      packageDirectory: options.outputDir,
      distilledDirectory: options.input,
      version: options.version,
      includeMetadata: true,
      validateIntegrity: true,
    });

    // Run packaging
    const results = await packaging.package(sourcesData);

    // CRITICAL: Validate packaging output before proceeding
    try {
      PipelineValidator.validatePackagingOutput(results);
      logger.info('✅ Packaging validation passed');
    } catch (error: any) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL PACKAGING FAILURE', error.toLogFormat());
        process.exit(1);
      }
      throw error;
    }

    // Add packaging metadata to results
    const outputData = {
      ...results,
      packaging_metadata: {
        packaged_at: new Date().toISOString(),
        packaging_stats: packaging.getPackageResults(),
        package_directory: options.outputDir,
      },
    };

    // Write results to file
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, JSON.stringify(outputData, null, 2));

    const packagedCount = Object.values(outputData.sources || {}).filter(
      (s: PipelineSourceType) => s.status === 'distilled'
    ).length;

    logger.info(
      {
        outputFile: options.output,
        packageDirectory: options.outputDir,
        packagedCount,
      },
      '✅ Packaging complete! Results saved'
    );

    // Show next steps
    if (packagedCount > 0) {
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Packaging failed');
    process.exit(1);
  }
}
