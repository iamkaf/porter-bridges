/**
 * @file Bundle Stats - Statistics tracking for Bridge Bundle creation operations
 *
 * This module tracks Bridge Bundle creation statistics including timing, success rates,
 * file counts, and bundle size metrics for the bundling phase of the pipeline.
 */

export interface IBundleStats {
  total_packages: number;
  bundled_packages: number;
  failed_packages: number;
  total_files: number;
  bundle_size: number;
  bundle_start_time: string | null;
  bundle_end_time: string | null;
}

export interface IBundleSummary {
  total_packages: number;
  bundled_packages: number;
  failed_packages: number;
  success_rate: number;
  total_files: number;
  bundle_size_kb: number;
  duration_seconds: number;
}

/**
 * Statistics tracking for Bridge Bundle creation operations
 */
export class BundleStats {
  stats: IBundleStats;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stats = {
      total_packages: 0,
      bundled_packages: 0,
      failed_packages: 0,
      total_files: 0,
      bundle_size: 0,
      bundle_start_time: null,
      bundle_end_time: null,
    };
  }

  startBundling(): void {
    this.stats.bundle_start_time = new Date().toISOString();
  }

  setTotalPackages(count: number): void {
    this.stats.total_packages = count;
  }

  incrementBundled(fileCount = 0, bundleSize = 0): void {
    this.stats.bundled_packages++;
    this.stats.total_files += fileCount;
    this.stats.bundle_size += bundleSize;
  }

  incrementFailed(): void {
    this.stats.failed_packages++;
  }

  endBundling(): void {
    this.stats.bundle_end_time = new Date().toISOString();
  }

  getStats(): IBundleStats {
    return { ...this.stats };
  }

  getSummary(): IBundleSummary {
    const durationMs =
      this.stats.bundle_end_time && this.stats.bundle_start_time
        ? new Date(this.stats.bundle_end_time).getTime() -
          new Date(this.stats.bundle_start_time).getTime()
        : 0;

    return {
      total_packages: this.stats.total_packages,
      bundled_packages: this.stats.bundled_packages,
      failed_packages: this.stats.failed_packages,
      success_rate:
        this.stats.total_packages > 0
          ? Math.round(
              (this.stats.bundled_packages / this.stats.total_packages) * 100
            )
          : 0,
      total_files: this.stats.total_files,
      bundle_size_kb: Math.round(this.stats.bundle_size / 1024),
      duration_seconds: Math.round(durationMs / 1000),
    };
  }
}
