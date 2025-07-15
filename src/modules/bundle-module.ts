/**
 * @file Bundle Module - Creates distributable bundles from packaged content
 *
 * This module handles the final phase of the pipeline - bundling packaged intelligence
 * into single, distributable archives with compression, validation, and distribution metadata.
 *
 * Key responsibilities:
 * - Aggregate multiple package versions into single bundle
 * - Create compressed archives for distribution
 * - Generate bundle manifests and distribution metadata
 * - Support incremental bundling and updates
 * - Track bundling statistics and file optimization
 */

import crypto from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { logger } from '../utils/logger';
import { BundleStats } from './bundling/bundle-stats';

export interface IBundleModule {
  bundleDirectory: string;
  packageDirectory: string;
  bundleName: string;
  includeMetadata: boolean;
  validateIntegrity: boolean;
  createArchive: boolean;
}

/**
 * Main Bundle Module class
 */
export class BundleModule {
  private stats: BundleStats;
  options: IBundleModule;

  constructor(options: Partial<IBundleModule> = {}) {
    this.options = {
      bundleDirectory: options.bundleDirectory || './generated/bundles',
      packageDirectory: options.packageDirectory || './generated/packages',
      bundleName: options.bundleName || 'porter-bridges',
      includeMetadata: options.includeMetadata !== false,
      validateIntegrity: options.validateIntegrity !== false,
      createArchive: options.createArchive !== false,
      ...options,
    };

    this.stats = new BundleStats();
  }

  /**
   * Main bundling entry point
   */
  async bundle(options: Record<string, any> = {}) {
    logger.info('📦 Starting bundling process');
    this.stats.startBundling();

    try {
      // Ensure bundle directory exists
      await fs.mkdir(this.options.bundleDirectory, { recursive: true });

      // Find available packages
      const availablePackages = await this._findAvailablePackages();
      this.stats.setTotalPackages(availablePackages.length);

      if (availablePackages.length === 0) {
        logger.warn('⚠️  No packages found for bundling');
        this.stats.endBundling();
        return this._buildResults(options);
      }

      logger.info('📋 Found packages to bundle', {
        count: availablePackages.length,
      });

      // Create bundle structure
      const bundleName = `${this.options.bundleName}-${this._generateTimestamp()}`;
      const bundlePath = path.join(this.options.bundleDirectory, bundleName);
      await fs.mkdir(bundlePath, { recursive: true });

      // Bundle packages
      const bundledData: Record<string, any> = {};

      for (const packageInfo of availablePackages) {
        try {
          logger.info(`📦 Bundling package: ${packageInfo.version}`);

          const packageData = await this._bundleSinglePackage(
            packageInfo,
            bundlePath
          );
          bundledData[packageInfo.version as string] = packageData;

          this.stats.incrementBundled(
            packageData.file_count,
            packageData.total_size
          );
        } catch (error: any) {
          this.stats.incrementFailed();
          logger.error(
            `❌ Bundling failed: ${packageInfo.version} - ${error.message}`
          );
        }
      }

      // Generate bundle manifest
      if (this.options.includeMetadata) {
        const manifest = await this._generateBundleManifest(
          bundledData,
          bundleName
        );
        const manifestPath = path.join(bundlePath, 'manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

        logger.info('📋 Bundle manifest generated', { path: manifestPath });
      }

      // Generate integrity checksums
      if (this.options.validateIntegrity) {
        const checksums = await this._generateBundleChecksums(bundlePath);
        const checksumPath = path.join(bundlePath, 'checksums.json');
        await fs.writeFile(checksumPath, JSON.stringify(checksums, null, 2));

        logger.info('🔐 Bundle checksums generated', { path: checksumPath });
      }

      // Create distribution archive (optional)
      let archivePath = null;
      if (this.options.createArchive) {
        archivePath = await this._createDistributionArchive(
          bundlePath,
          bundleName
        );
      }

      this.stats.endBundling();

      // Log summary
      this._logSummary(bundlePath, archivePath);

      return this._buildResults(options, bundlePath, archivePath);
    } catch (error: any) {
      this.stats.endBundling();
      logger.error('💥 Bundling failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get bundling results for export
   */
  getBundleResults() {
    return {
      stats: this.stats.getStats(),
      summary: this.stats.getSummary(),
    };
  }

  // Private helper methods

  async _findAvailablePackages(): Promise<
    Array<{ version: string; path: string; manifestPath: string }>
  > {
    const packages: Array<{
      version: string;
      path: string;
      manifestPath: string;
    }> = [];

    try {
      let packageDirExists;
      try {
        await fs.access(this.options.packageDirectory);
        packageDirExists = true;
      } catch {
        packageDirExists = false;
      }

      if (!packageDirExists) {
        return packages;
      }

      const entries = await fs.readdir(this.options.packageDirectory, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          (entry.name.startsWith('v') ||
            entry.name.startsWith('linkie-porting-data-v'))
        ) {
          const packagePath = path.join(
            this.options.packageDirectory,
            entry.name
          );
          const packageJsonPath = path.join(packagePath, 'package.json');

          try {
            await fs.access(packageJsonPath);
            packages.push({
              version: entry.name,
              path: packagePath,
              manifestPath: packageJsonPath,
            });
          } catch {
            logger.warn(`Package missing manifest: ${entry.name}`);
          }
        }
      }

      // Sort packages by version (newest first)
      packages.sort((a, b) => b.version.localeCompare(a.version));
    } catch (error: any) {
      logger.warn('Failed to find packages', { error: error.message });
    }

    return packages;
  }

  async _bundleSinglePackage(
    packageInfo: { version: string; path: string; manifestPath: string },
    bundlePath: string
  ) {
    try {
      // Read package manifest
      const manifestContent = await fs.readFile(
        packageInfo.manifestPath,
        'utf-8'
      );
      const manifest = JSON.parse(manifestContent);

      // Create package directory in bundle
      const packageBundlePath = path.join(
        bundlePath,
        'packages',
        packageInfo.version
      );
      await fs.mkdir(packageBundlePath, { recursive: true });

      // Copy all package files
      const packageFiles = await fs.readdir(packageInfo.path);
      let totalSize = 0;

      for (const file of packageFiles) {
        const sourcePath = path.join(packageInfo.path, file);
        const destPath = path.join(packageBundlePath, file);

        const stats = await fs.stat(sourcePath);
        if (stats.isFile()) {
          await fs.copyFile(sourcePath, destPath);
          totalSize += stats.size;
        }
      }

      return {
        version: packageInfo.version,
        file_count: packageFiles.length,
        total_size: totalSize,
        manifest,
        bundled_at: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error(`Failed to bundle package: ${packageInfo.version}`, {
        error: error.message,
      });
      throw error;
    }
  }

  _generateBundleManifest(
    bundledData: Record<string, any>,
    bundleName: string
  ) {
    const summary = this.stats.getSummary();

    const packageVersions = Object.keys(bundledData).sort();
    const contentSummary: Record<string, number> = {};

    // Aggregate content statistics from all packages
    for (const [_version, data] of Object.entries(bundledData)) {
      const typedData = data as any;
      if (typedData.manifest?.content_breakdown) {
        for (const [type, count] of Object.entries(
          typedData.manifest.content_breakdown
        )) {
          contentSummary[type as string] =
            (contentSummary[type as string] || 0) + (count as number);
        }
      }
    }

    return {
      bundle_info: {
        name: bundleName,
        created_at: new Date().toISOString(),
        generator: 'porter-bridges',
        generator_version: '1.0.0',
      },
      bundle_contents: {
        total_packages: summary.bundled_packages,
        package_versions: packageVersions,
        total_files: summary.total_files,
        total_size_kb: summary.bundle_size_kb,
      },
      content_summary: contentSummary,
      package_details: bundledData,
      bundling_metadata: {
        bundling_duration_seconds: summary.duration_seconds,
        success_rate_percent: summary.success_rate,
        options_used: this.options,
      },
    };
  }

  async _generateBundleChecksums(bundlePath: string) {
    const checksums: Record<string, any> = {};

    try {
      const files = await this._getAllFiles(bundlePath);

      for (const file of files) {
        const relativePath = path.relative(bundlePath, file);
        const content = await fs.readFile(file);
        const stats = await fs.stat(file);

        checksums[relativePath as string] = {
          sha256: crypto.createHash('sha256').update(content).digest('hex'),
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      }
    } catch (error: any) {
      logger.warn('Failed to generate bundle checksums', {
        error: error.message,
      });
    }

    return {
      generated_at: new Date().toISOString(),
      checksums,
    };
  }

  async _getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this._getAllFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name !== 'checksums.json') {
          files.push(fullPath);
        }
      }
    } catch (error: any) {
      logger.warn(`Failed to read directory: ${dir}`, { error: error.message });
    }

    return files;
  }

  _createDistributionArchive(
    bundlePath: string,
    bundleName: string
  ): Promise<any> {
    const archivePath = path.join(
      this.options.bundleDirectory,
      `${bundleName}.zip`
    );

    return new Promise((resolve, reject) => {
      try {
        // Create write stream
        const output = createWriteStream(archivePath);

        // Create archiver with maximum compression
        const archive = archiver('zip', {
          zlib: { level: 9 }, // Sets the compression level
        });

        // Handle stream events
        output.on('close', async () => {
          try {
            const archiveStats = await fs.stat(archivePath);
            const originalSize = this.stats.getStats().bundle_size;
            const compressionRatio =
              originalSize > 0
                ? Math.round((1 - archiveStats.size / originalSize) * 100)
                : 0;

            logger.info('📦 ZIP archive created successfully', {
              path: archivePath,
              originalSizeKB: Math.round(originalSize / 1024),
              compressedSizeKB: Math.round(archiveStats.size / 1024),
              compressionRatio: `${compressionRatio}%`,
              totalBytes: archive.pointer(),
            });

            resolve(archivePath);
          } catch (error: unknown) {
            if (error instanceof Error) {
              logger.error('Failed to get archive stats', {
                error: error.message,
              });
            } else {
              logger.error(
                { error },
                'Failed to get archive stats with unknown error'
              );
            }
            resolve(archivePath);
          }
        });

        output.on('error', (error: unknown) => {
          if (error instanceof Error) {
            logger.error('Archive output stream error', {
              error: error.message,
            });
          } else {
            logger.error(
              { error },
              'Archive output stream error with unknown error'
            );
          }
          reject(error);
        });

        archive.on('warning', (warning: unknown) => {
          if (warning instanceof Error) {
            if ((warning as any).code === 'ENOENT') {
              logger.warn('Archive warning', { warning: warning.message });
            } else {
              logger.error('Archive warning', { warning: warning.message });
              reject(warning);
            }
          } else {
            logger.warn({ warning }, 'Archive warning with unknown type');
          }
        });

        archive.on('error', (error: unknown) => {
          if (error instanceof Error) {
            logger.error('Archive error', { error: error.message });
          } else {
            logger.error({ error }, 'Archive error with unknown type');
          }
          reject(error);
        });

        // Pipe archive data to output stream
        archive.pipe(output);

        // Add entire bundle directory to archive
        logger.info('📁 Adding bundle directory to ZIP archive', {
          bundlePath,
        });
        archive.directory(bundlePath, false);

        // Finalize the archive (triggers the 'close' event)
        archive.finalize();
      } catch (error: unknown) {
        if (error instanceof Error) {
          logger.error('Failed to create ZIP archive', {
            error: error.message,
          });
        } else {
          logger.error(
            { error },
            'Failed to create ZIP archive with unknown error'
          );
        }
        reject(error);
      }
    });
  }

  _generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');

    return `${year}${month}${day}-${hour}${minute}`;
  }

  _logSummary(bundlePath: string, archivePath: string | null) {
    const summary = this.stats.getSummary();

    logger.info('📊 Bundling Summary', {
      totalPackages: summary.total_packages,
      bundledPackages: summary.bundled_packages,
      failedPackages: summary.failed_packages,
      successRate: `${summary.success_rate}%`,
      totalFiles: summary.total_files,
      bundleSizeKB: summary.bundle_size_kb,
      durationSeconds: summary.duration_seconds,
      bundlePath,
      archivePath: archivePath || 'none',
    });
  }

  _buildResults(
    options: any,
    bundlePath: string | null = null,
    archivePath: string | null = null
  ) {
    return {
      bundle_metadata: {
        bundled_at: new Date().toISOString(),
        bundle_path: bundlePath,
        archive_path: archivePath,
        bundle_options: options,
        bundle_stats: {
          stats: this.stats.getStats(),
          summary: this.stats.getSummary(),
        },
      },
    };
  }
}

export default BundleModule;
