/**
 * @file Collection Stats - Statistics tracking for collection operations
 *
 * This module tracks collection statistics including timing, success rates,
 * data volume, and failure tracking for the collection phase of the pipeline.
 */

export interface ICollectionStats {
  total_sources: number;
  collected_sources: number;
  failed_sources: number;
  skipped_sources: number;
  bytes_downloaded: number;
  collection_start_time: string | null;
  collection_end_time: string | null;
}

export interface ICollectionSummary {
  total_sources: number;
  collected_sources: number;
  failed_sources: number;
  success_rate: number;
  total_bytes: number;
  total_kb: number;
  duration_seconds: number;
}

/**
 * Statistics tracking for collection operations
 */
export class CollectionStats {
  stats: ICollectionStats;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.stats = {
      total_sources: 0,
      collected_sources: 0,
      failed_sources: 0,
      skipped_sources: 0,
      bytes_downloaded: 0,
      collection_start_time: null,
      collection_end_time: null,
    };
  }

  startCollection(): void {
    this.stats.collection_start_time = new Date().toISOString();
  }

  setTotalSources(count: number): void {
    this.stats.total_sources = count;
  }

  incrementCollected(bytes = 0): void {
    this.stats.collected_sources++;
    this.stats.bytes_downloaded += bytes;
  }

  incrementFailed(): void {
    this.stats.failed_sources++;
  }

  incrementSkipped(): void {
    this.stats.skipped_sources++;
  }

  endCollection(): void {
    this.stats.collection_end_time = new Date().toISOString();
  }

  getStats(): ICollectionStats {
    return { ...this.stats };
  }

  getSummary(): ICollectionSummary {
    const durationMs =
      this.stats.collection_end_time && this.stats.collection_start_time
        ? new Date(this.stats.collection_end_time).getTime() -
          new Date(this.stats.collection_start_time).getTime()
        : 0;

    return {
      total_sources: this.stats.total_sources,
      collected_sources: this.stats.collected_sources,
      failed_sources: this.stats.failed_sources,
      success_rate:
        this.stats.total_sources > 0
          ? Math.round(
              (this.stats.collected_sources / this.stats.total_sources) * 100
            )
          : 0,
      total_bytes: this.stats.bytes_downloaded,
      total_kb: Math.round(this.stats.bytes_downloaded / 1024),
      duration_seconds: Math.round(durationMs / 1000),
    };
  }
}
