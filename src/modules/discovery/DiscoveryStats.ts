/**
 * @file Discovery Statistics - Tracks and reports discovery metrics
 *
 * This module handles tracking statistics throughout the discovery process,
 * including timing, success rates, and source breakdowns.
 */

import { logger } from '../../utils/logger';
import { groupBy, mapValues, pipe } from 'remeda';
import type { ISourceItem } from './SourceItemFactory';

/**
 * Discovery statistics class
 */
export class DiscoveryStats {
  stats: { total_discovered: number; new_sources: number; updated_sources: number; failed_discoveries: number; discovery_start_time: string | null; discovery_end_time: string | null; };

  constructor() {
    this.stats = {
      total_discovered: 0,
      new_sources: 0,
      updated_sources: 0,
      failed_discoveries: 0,
      discovery_start_time: null,
      discovery_end_time: null,
    };
  }

  /**
   * Start discovery timing
   */
  startDiscovery() {
    this.stats.discovery_start_time = new Date().toISOString();
  }

  /**
   * End discovery timing
   */
  endDiscovery() {
    this.stats.discovery_end_time = new Date().toISOString();
  }

  /**
   * Add discovered sources count
   */
  addDiscoveredSources(count: number) {
    this.stats.total_discovered += count;
    this.stats.new_sources += count; // Simplified for now
  }

  /**
   * Increment failed discoveries
   */
  incrementFailedDiscoveries() {
    this.stats.failed_discoveries++;
  }

  /**
   * Get current stats
   */
  getStats() {
    return this.stats;
  }

  /**
   * Print discovery statistics
   */
  printDiscoveryStats(discoveredSources: Map<string, ISourceItem>) {
    const duration =
      new Date(this.stats.discovery_end_time!).getTime() - new Date(this.stats.discovery_start_time!).getTime();

    const summary = {
      totalDiscovered: this.stats.total_discovered,
      newSources: this.stats.new_sources,
      updatedSources: this.stats.updated_sources,
      failedDiscoveries: this.stats.failed_discoveries,
      durationSeconds: Math.round(duration / 1000),
    };

    logger.info(summary, '📊 Discovery Summary');

    if (discoveredSources.size > 0) {
      const sources = Array.from(discoveredSources.values());
      
      // Use remeda for type-safe grouping and counting
      const byType = pipe(
        sources,
        groupBy((source) => source.source_type),
        mapValues((group) => group.length)
      );
      
      const byLoader = pipe(
        sources,
        groupBy((source) => source.loader_type),
        mapValues((group) => group.length)
      );

      logger.info(
        {
          byType,
          byLoader,
        },
        '📋 Source breakdown'
      );
    }
  }
}

export default DiscoveryStats;
