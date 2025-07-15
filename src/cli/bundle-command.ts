/**
 * @file Bundle Command - Individual bundling phase execution
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BundleModule } from '../modules/bundle-module';
import { CriticalError, PipelineValidator } from '../utils/critical-error';
import { logger } from '../utils/logger';

export async function executeBundleCommand(options: {
  bundleDir: string;
  packageDir: string;
  bundleName: string;
  metadata: string;
  checksums: string;
  archive: string;
  output: string;
}) {
  try {
    logger.info('🚀 Porter Bridges - Bundle Module');

    // Log bundling configuration
    logger.info(
      {
        bundleDirectory: options.bundleDir,
        packageDirectory: options.packageDir,
        bundleName: options.bundleName,
        includeMetadata: options.metadata,
        validateIntegrity: options.checksums,
        createArchive: options.archive,
      },
      '⚙️  Bundling Configuration'
    );

    // Initialize bundle module
    const bundling = new BundleModule({
      bundleDirectory: options.bundleDir,
      packageDirectory: options.packageDir,
      bundleName: options.bundleName,
      includeMetadata: Boolean(options.metadata),
      validateIntegrity: Boolean(options.checksums),
      createArchive: Boolean(options.archive),
    });

    // Run bundling
    const results = await bundling.bundle();

    // CRITICAL: Validate bundle output before proceeding
    try {
      PipelineValidator.validateBundleOutput(results);
      logger.info('✅ Bundle validation passed');
    } catch (error: unknown) {
      if (error instanceof CriticalError) {
        logger.error('🚨 CRITICAL BUNDLE FAILURE', error.toLogFormat());
        process.exit(1);
      }
      throw error;
    }

    // Add bundling metadata to results
    const outputData = {
      ...results,
      bundling_metadata: {
        bundled_at: new Date().toISOString(),
        bundling_stats: bundling.getBundleResults(),
        bundle_directory: options.bundleDir,
      },
    };

    // Write results to file
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, JSON.stringify(outputData, null, 2));

    const bundleStats = bundling.getBundleResults();

    logger.info(
      {
        outputFile: options.output,
        bundleDirectory: options.bundleDir,
        bundledPackages: bundleStats.summary.bundled_packages,
        totalFiles: bundleStats.summary.total_files,
      },
      '✅ Bundling complete! Results saved'
    );

    // Show completion message
    if (
      bundleStats.summary.bundled_packages > 0 &&
      results.bundle_metadata?.archive_path
    ) {
      // Empty block, intentionally left blank
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error({ error: error.message }, '💥 Bundling failed');
    } else {
      logger.error({ error }, '💥 Bundling failed with unknown error');
    }
    process.exit(1);
  }
}
