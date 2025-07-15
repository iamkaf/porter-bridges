/**
 * @file Package Stats - Statistics tracking for packaging operations
 *
 * This module tracks packaging statistics including timing, success rates,
 * and file size metrics for the packaging phase of the pipeline.
 */

export interface IPackageStats {
  total_sources: number;
  packaged_sources: number;
  failed_sources: number;
  total_file_size: number;
  package_start_time: string | null;
  package_end_time: string | null;
}

export interface IPackageSummary {
  total_sources: number;
  packaged_sources: number;
  failed_sources: number;
  success_rate: number;
  total_file_size_kb: number;
  duration_seconds: number;
}

/**
 * Statistics tracking for packaging operations
 */
export class PackageStats {
  stats: IPackageStats;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stats = {
      total_sources: 0,
      packaged_sources: 0,
      failed_sources: 0,
      total_file_size: 0,
      package_start_time: null,
      package_end_time: null,
    };
  }

  startPackaging(): void {
    this.stats.package_start_time = new Date().toISOString();
  }

  setTotalSources(count: number): void {
    this.stats.total_sources = count;
  }

  incrementPackaged(fileSize = 0): void {
    this.stats.packaged_sources++;
    this.stats.total_file_size += fileSize;
  }

  incrementFailed(): void {
    this.stats.failed_sources++;
  }

  endPackaging(): void {
    this.stats.package_end_time = new Date().toISOString();
  }

  getStats(): IPackageStats {
    return { ...this.stats };
  }

  getSummary(): IPackageSummary {
    const durationMs =
      this.stats.package_end_time && this.stats.package_start_time
        ? new Date(this.stats.package_end_time).getTime() -
          new Date(this.stats.package_start_time).getTime()
        : 0;

    return {
      total_sources: this.stats.total_sources,
      packaged_sources: this.stats.packaged_sources,
      failed_sources: this.stats.failed_sources,
      success_rate:
        this.stats.total_sources > 0
          ? Math.round(
              (this.stats.packaged_sources / this.stats.total_sources) * 100
            )
          : 0,
      total_file_size_kb: Math.round(this.stats.total_file_size / 1024),
      duration_seconds: Math.round(durationMs / 1000),
    };
  }
}
