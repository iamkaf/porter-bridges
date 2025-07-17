/**
 * @file Bundle Module - Creates distributable Bridge Bundles from packaged content
 *
 * This module handles the final phase of the pipeline - bundling packaged intelligence
 * into single, distributable Bridge Bundles with compression, validation, and distribution metadata.
 *
 * Key responsibilities:
 * - Aggregate multiple package versions into single Bridge Bundle
 * - Create compressed archives for distribution
 * - Generate Bridge Bundle manifests and distribution metadata
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
    logger.info('📦 Starting Bridge Bundle creation process');
    this.stats.startBundling();

    try {
      // Ensure bundle directory exists
      await fs.mkdir(this.options.bundleDirectory, { recursive: true });

      // Find available packages
      const availablePackages = await this._findAvailablePackages();
      this.stats.setTotalPackages(availablePackages.length);

      if (availablePackages.length === 0) {
        logger.warn('⚠️  No packages found for Bridge Bundle creation');
        this.stats.endBundling();
        return this._buildResults(options);
      }

      logger.info('📋 Found packages to include in Bridge Bundle', {
        count: availablePackages.length,
      });

      // Create Bridge Bundle structure
      const bundleName = `${this.options.bundleName}-${this._generateTimestamp()}`;
      const bundlePath = path.join(this.options.bundleDirectory, bundleName);
      await fs.mkdir(bundlePath, { recursive: true });

      // Bundle packages into Bridge Bundle
      const bundledData: Record<string, any> = {};

      for (const packageInfo of availablePackages) {
        try {
          logger.info(`📦 Adding package to Bridge Bundle: ${packageInfo.version}`);

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
            `❌ Failed to add package to Bridge Bundle: ${packageInfo.version} - ${error.message}`
          );
        }
      }

      // Generate Bridge Bundle manifest
      if (this.options.includeMetadata) {
        const manifest = await this._generateBundleManifest(
          bundledData,
          bundleName
        );
        const manifestPath = path.join(bundlePath, 'manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

        logger.info('📋 Bridge Bundle manifest generated', { path: manifestPath });
      }

      // Generate integrity checksums
      if (this.options.validateIntegrity) {
        const checksums = await this._generateBundleChecksums(bundlePath);
        const checksumPath = path.join(bundlePath, 'checksums.json');
        await fs.writeFile(checksumPath, JSON.stringify(checksums, null, 2));

        logger.info('🔐 Bridge Bundle checksums generated', { path: checksumPath });
      }

      // Validate Bridge Bundle quality and content expectations
      const validationResult = await this._validateBundleQuality(bundlePath, bundledData);
      if (!validationResult.isValid) {
        logger.warn('⚠️  Bridge Bundle validation warnings detected', {
          warnings: validationResult.warnings,
          bundlePath,
        });
      } else {
        logger.info('✅ Bridge Bundle validation passed', {
          fileCount: validationResult.metrics.fileCount,
          sizeKB: validationResult.metrics.sizeKB,
          distilledVersions: validationResult.metrics.distilledVersions,
          loaderTypes: validationResult.metrics.loaderTypes,
        });
      }

      // Perform comprehensive integrity validation
      const integrityResult = await this._validateBundleIntegrity(bundlePath, bundledData);
      if (!integrityResult.isValid) {
        logger.error('❌ Bridge Bundle integrity validation failed', {
          errors: integrityResult.errors,
          bundlePath,
        });
        // Note: We continue with bundle creation even if integrity checks fail
        // This allows for debugging and partial recovery
      } else {
        logger.info('🔒 Bridge Bundle integrity validation passed', {
          checksumValidation: integrityResult.metrics.checksumValidation,
          metadataValidation: integrityResult.metrics.metadataValidation,
          fileIntegrityScore: integrityResult.metrics.fileIntegrityScore,
        });
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
      logger.error('💥 Bridge Bundle creation failed', { error: error.message });
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

      // Copy all package files and directories recursively
      const { fileCount, totalSize } = await this._copyDirectoryRecursive(
        packageInfo.path,
        packageBundlePath
      );

      return {
        version: packageInfo.version,
        file_count: fileCount,
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

  /**
   * Recursively copy a directory and all its contents
   */
  async _copyDirectoryRecursive(
    sourcePath: string,
    destPath: string
  ): Promise<{ fileCount: number; totalSize: number }> {
    let fileCount = 0;
    let totalSize = 0;

    try {
      const entries = await fs.readdir(sourcePath, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(sourcePath, entry.name);
        const dstPath = path.join(destPath, entry.name);

        if (entry.isDirectory()) {
          await fs.mkdir(dstPath, { recursive: true });
          const subResult = await this._copyDirectoryRecursive(srcPath, dstPath);
          fileCount += subResult.fileCount;
          totalSize += subResult.totalSize;
        } else if (entry.isFile()) {
          await fs.copyFile(srcPath, dstPath);
          const stats = await fs.stat(srcPath);
          fileCount++;
          totalSize += stats.size;
        }
      }
    } catch (error: any) {
      logger.warn(`Failed to copy directory: ${sourcePath}`, { error: error.message });
    }

    return { fileCount, totalSize };
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

            // Clean up temporary bundle directory after successful ZIP creation
            try {
              await fs.rm(bundlePath, { recursive: true, force: true });
              logger.info('🧹 Cleaned up temporary bundle directory', {
                bundlePath,
              });
            } catch (cleanupError: unknown) {
              if (cleanupError instanceof Error) {
                logger.warn('Failed to clean up temporary bundle directory', {
                  bundlePath,
                  error: cleanupError.message,
                });
              } else {
                logger.warn('Failed to clean up temporary bundle directory with unknown error', {
                  bundlePath,
                  cleanupError,
                });
              }
            }

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

        output.on('error', async (error: unknown) => {
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

          // Clean up temporary bundle directory on error
          try {
            await fs.rm(bundlePath, { recursive: true, force: true });
            logger.info('🧹 Cleaned up temporary bundle directory after error', {
              bundlePath,
            });
          } catch (cleanupError: unknown) {
            if (cleanupError instanceof Error) {
              logger.warn('Failed to clean up temporary bundle directory after error', {
                bundlePath,
                error: cleanupError.message,
              });
            } else {
              logger.warn('Failed to clean up temporary bundle directory after error with unknown error', {
                bundlePath,
                cleanupError,
              });
            }
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

        archive.on('error', async (error: unknown) => {
          if (error instanceof Error) {
            logger.error('Archive error', { error: error.message });
          } else {
            logger.error({ error }, 'Archive error with unknown type');
          }

          // Clean up temporary bundle directory on error
          try {
            await fs.rm(bundlePath, { recursive: true, force: true });
            logger.info('🧹 Cleaned up temporary bundle directory after archive error', {
              bundlePath,
            });
          } catch (cleanupError: unknown) {
            if (cleanupError instanceof Error) {
              logger.warn('Failed to clean up temporary bundle directory after archive error', {
                bundlePath,
                error: cleanupError.message,
              });
            } else {
              logger.warn('Failed to clean up temporary bundle directory after archive error with unknown error', {
                bundlePath,
                cleanupError,
              });
            }
          }

          reject(error);
        });

        // Pipe archive data to output stream
        archive.pipe(output);

        // Add entire Bridge Bundle directory to archive
        logger.info('📁 Adding Bridge Bundle directory to ZIP archive', {
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

    logger.info('📊 Bridge Bundle Creation Summary', {
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

  /**
   * Comprehensive Bridge Bundle integrity validation
   */
  async _validateBundleIntegrity(
    bundlePath: string,
    bundledData: Record<string, any>
  ): Promise<{
    isValid: boolean;
    errors: string[];
    metrics: {
      checksumValidation: 'passed' | 'failed' | 'partial';
      metadataValidation: 'passed' | 'failed' | 'partial';
      fileIntegrityScore: number;
      corruptedFiles: string[];
      missingRequiredFiles: string[];
      invalidMetadataFiles: string[];
    };
  }> {
    const errors: string[] = [];
    const metrics = {
      checksumValidation: 'passed' as 'passed' | 'failed' | 'partial',
      metadataValidation: 'passed' as 'passed' | 'failed' | 'partial',
      fileIntegrityScore: 100,
      corruptedFiles: [] as string[],
      missingRequiredFiles: [] as string[],
      invalidMetadataFiles: [] as string[],
    };

    try {
      // 1. Validate checksums if they exist
      if (this.options.validateIntegrity) {
        const checksumPath = path.join(bundlePath, 'checksums.json');
        try {
          const checksumContent = await fs.readFile(checksumPath, 'utf-8');
          const checksumData = JSON.parse(checksumContent);
          
          if (!checksumData.checksums || typeof checksumData.checksums !== 'object') {
            errors.push('Checksum file format is invalid');
            metrics.checksumValidation = 'failed';
          } else {
            // Validate each file's checksum
            let validChecksums = 0;
            let totalChecksums = 0;

            for (const [filePath, checksumInfo] of Object.entries(checksumData.checksums)) {
              totalChecksums++;
              const fullPath = path.join(bundlePath, filePath);
              
              try {
                await fs.access(fullPath);
                const fileContent = await fs.readFile(fullPath);
                const actualChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');
                
                if (actualChecksum === (checksumInfo as any).sha256) {
                  validChecksums++;
                } else {
                  metrics.corruptedFiles.push(filePath);
                  errors.push(`Checksum mismatch for file: ${filePath}`);
                }
              } catch {
                metrics.missingRequiredFiles.push(filePath);
                errors.push(`File referenced in checksums but missing: ${filePath}`);
              }
            }

            if (validChecksums === totalChecksums) {
              metrics.checksumValidation = 'passed';
            } else if (validChecksums > 0) {
              metrics.checksumValidation = 'partial';
            } else {
              metrics.checksumValidation = 'failed';
            }

            metrics.fileIntegrityScore = totalChecksums > 0 ? Math.round((validChecksums / totalChecksums) * 100) : 0;
          }
        } catch (error: any) {
          errors.push(`Failed to validate checksums: ${error.message}`);
          metrics.checksumValidation = 'failed';
        }
      }

      // 2. Validate manifest and metadata completeness
      if (this.options.includeMetadata) {
        const manifestPath = path.join(bundlePath, 'manifest.json');
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          
          // Check required manifest fields
          const requiredFields = ['bundle_info', 'bundle_contents', 'package_details'];
          const missingFields = requiredFields.filter(field => !(field in manifest));
          
          if (missingFields.length > 0) {
            errors.push(`Manifest missing required fields: ${missingFields.join(', ')}`);
            metrics.invalidMetadataFiles.push('manifest.json');
          }

          // Validate bundle_info structure
          if (manifest.bundle_info) {
            const requiredBundleInfo = ['name', 'created_at', 'generator'];
            const missingBundleInfo = requiredBundleInfo.filter(field => !(field in manifest.bundle_info));
            if (missingBundleInfo.length > 0) {
              errors.push(`Manifest bundle_info missing fields: ${missingBundleInfo.join(', ')}`);
              metrics.invalidMetadataFiles.push('manifest.json');
            }
          }

          // Validate package details match bundled data
          if (manifest.package_details) {
            const manifestPackages = Object.keys(manifest.package_details);
            const bundlePackages = Object.keys(bundledData);
            
            const missingInManifest = bundlePackages.filter(pkg => !manifestPackages.includes(pkg));
            const extraInManifest = manifestPackages.filter(pkg => !bundlePackages.includes(pkg));
            
            if (missingInManifest.length > 0) {
              errors.push(`Manifest missing package details for: ${missingInManifest.join(', ')}`);
            }
            if (extraInManifest.length > 0) {
              errors.push(`Manifest has extra package details for: ${extraInManifest.join(', ')}`);
            }
          }

          if (metrics.invalidMetadataFiles.length === 0) {
            metrics.metadataValidation = 'passed';
          } else {
            metrics.metadataValidation = 'partial';
          }
        } catch (error: any) {
          errors.push(`Failed to validate manifest: ${error.message}`);
          metrics.metadataValidation = 'failed';
          metrics.invalidMetadataFiles.push('manifest.json');
        }
      }

      // 3. Validate package structure integrity
      const packagesDir = path.join(bundlePath, 'packages');
      try {
        const packageEntries = await fs.readdir(packagesDir, { withFileTypes: true });
        
        for (const entry of packageEntries) {
          if (entry.isDirectory()) {
            const packagePath = path.join(packagesDir, entry.name);
            
            // Check for required package files
            const packageJsonPath = path.join(packagePath, 'package.json');
            try {
              await fs.access(packageJsonPath);
              
              // Validate package.json structure
              const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
              const packageJson = JSON.parse(packageContent);
              
              if (!packageJson.name || !packageJson.version) {
                errors.push(`Package ${entry.name} has invalid package.json structure`);
                metrics.invalidMetadataFiles.push(`packages/${entry.name}/package.json`);
              }
            } catch {
              errors.push(`Package ${entry.name} missing package.json`);
              metrics.missingRequiredFiles.push(`packages/${entry.name}/package.json`);
            }

            // Check for distilled directory structure
            const distilledDir = path.join(packagePath, 'distilled');
            try {
              await fs.access(distilledDir);
              
              // Validate that distilled content is valid JSON
              const distilledVersions = await fs.readdir(distilledDir, { withFileTypes: true });
              for (const versionDir of distilledVersions) {
                if (versionDir.isDirectory()) {
                  const versionPath = path.join(distilledDir, versionDir.name);
                  const loaderDirs = await fs.readdir(versionPath, { withFileTypes: true });
                  
                  for (const loaderDir of loaderDirs) {
                    if (loaderDir.isDirectory()) {
                      const loaderPath = path.join(versionPath, loaderDir.name);
                      const jsonFiles = await fs.readdir(loaderPath);
                      
                      for (const jsonFile of jsonFiles) {
                        if (jsonFile.endsWith('.json')) {
                          try {
                            const jsonPath = path.join(loaderPath, jsonFile);
                            const jsonContent = await fs.readFile(jsonPath, 'utf-8');
                            JSON.parse(jsonContent); // Validate JSON syntax
                          } catch {
                            errors.push(`Invalid JSON file: packages/${entry.name}/distilled/${versionDir.name}/${loaderDir.name}/${jsonFile}`);
                            metrics.corruptedFiles.push(`packages/${entry.name}/distilled/${versionDir.name}/${loaderDir.name}/${jsonFile}`);
                          }
                        }
                      }
                    }
                  }
                }
              }
            } catch {
              errors.push(`Package ${entry.name} missing distilled directory`);
              metrics.missingRequiredFiles.push(`packages/${entry.name}/distilled/`);
            }
          }
        }
      } catch (error: any) {
        errors.push(`Failed to validate package structure: ${error.message}`);
      }

      // Adjust file integrity score based on corruption and missing files
      const totalIssues = metrics.corruptedFiles.length + metrics.missingRequiredFiles.length + metrics.invalidMetadataFiles.length;
      if (totalIssues > 0) {
        metrics.fileIntegrityScore = Math.max(0, metrics.fileIntegrityScore - (totalIssues * 10));
      }

    } catch (error: any) {
      errors.push(`Integrity validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      metrics,
    };
  }

  /**
   * Validate Bridge Bundle quality and content expectations
   */
  async _validateBundleQuality(
    bundlePath: string,
    bundledData: Record<string, any>
  ): Promise<{
    isValid: boolean;
    warnings: string[];
    metrics: {
      fileCount: number;
      sizeKB: number;
      distilledVersions: number;
      loaderTypes: string[];
    };
  }> {
    const warnings: string[] = [];
    const metrics = {
      fileCount: 0,
      sizeKB: 0,
      distilledVersions: 0,
      loaderTypes: new Set<string>(),
    };

    try {
      // 1. Validate basic file count and size
      const allFiles = await this._getAllFiles(bundlePath);
      metrics.fileCount = allFiles.length;

      if (metrics.fileCount < 10) {
        warnings.push(`Low file count: ${metrics.fileCount} files (expected at least 10)`);
      }

      // Calculate total bundle size
      let totalSize = 0;
      for (const file of allFiles) {
        const stats = await fs.stat(file);
        totalSize += stats.size;
      }
      metrics.sizeKB = Math.round(totalSize / 1024);

      if (metrics.sizeKB < 50) {
        warnings.push(`Small bundle size: ${metrics.sizeKB}KB (expected at least 50KB)`);
      }

      // 2. Validate expected directory structure
      const packagesDir = path.join(bundlePath, 'packages');
      try {
        await fs.access(packagesDir);
      } catch {
        warnings.push('Missing required packages/ directory');
      }

      // 3. Validate required files
      if (this.options.includeMetadata) {
        const manifestPath = path.join(bundlePath, 'manifest.json');
        try {
          await fs.access(manifestPath);
        } catch {
          warnings.push('Missing required manifest.json file');
        }
      }

      if (this.options.validateIntegrity) {
        const checksumPath = path.join(bundlePath, 'checksums.json');
        try {
          await fs.access(checksumPath);
        } catch {
          warnings.push('Missing required checksums.json file');
        }
      }

      // 4. Validate distilled content structure
      try {
        const packageEntries = await fs.readdir(packagesDir, { withFileTypes: true });
        for (const entry of packageEntries) {
          if (entry.isDirectory()) {
            metrics.distilledVersions++;
            
            const distilledDir = path.join(packagesDir, entry.name, 'distilled');
            try {
              await fs.access(distilledDir);
              
              // Check for loader-specific organization
              const versionEntries = await fs.readdir(distilledDir, { withFileTypes: true });
              for (const versionEntry of versionEntries) {
                if (versionEntry.isDirectory()) {
                  const loaderDirs = await fs.readdir(path.join(distilledDir, versionEntry.name), { withFileTypes: true });
                  for (const loaderDir of loaderDirs) {
                    if (loaderDir.isDirectory() && ['vanilla', 'fabric', 'neoforge', 'forge'].includes(loaderDir.name)) {
                      metrics.loaderTypes.add(loaderDir.name);
                    }
                  }
                }
              }
            } catch {
              warnings.push(`Package ${entry.name} missing distilled/ directory`);
            }
          }
        }
      } catch {
        warnings.push('Unable to validate distilled content structure');
      }

      if (metrics.distilledVersions === 0) {
        warnings.push('No distilled versions found in bundle');
      }

      if (metrics.loaderTypes.size === 0) {
        warnings.push('No loader-specific content directories found');
      }

      // 5. Validate content consistency with bundled data
      const expectedPackages = Object.keys(bundledData).length;
      if (metrics.distilledVersions !== expectedPackages) {
        warnings.push(`Package count mismatch: found ${metrics.distilledVersions}, expected ${expectedPackages}`);
      }

    } catch (error: any) {
      warnings.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      metrics: {
        ...metrics,
        loaderTypes: Array.from(metrics.loaderTypes).sort(),
      },
    };
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
