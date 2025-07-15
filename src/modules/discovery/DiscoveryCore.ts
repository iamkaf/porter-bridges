/**
 * @file Discovery Core - Main discovery orchestration logic
 *
 * This module handles the core discovery workflow coordination and statistics tracking.
 * It manages the overall discovery process across multiple source types.
 */

import { logger } from '../../utils/logger';
import { SourceConfigs, type ISourceConfig } from './SourceConfigs';
import { DiscoveryStats } from './DiscoveryStats';
import { GitHubDiscovery, type IGitHubDiscoveryOptions } from './GitHubDiscovery';
import { RSSDiscovery, type IRSSDiscoveryOptions } from './RSSDiscovery';
import {
  GitHubReleasesDiscovery,
  type IGitHubReleasesDiscoveryOptions,
} from './GitHubReleasesDiscovery';
import { MavenDiscovery, type IMavenDiscoveryOptions } from './MavenDiscovery';
import { DirectUrlDiscovery, type IDirectUrlDiscoveryOptions } from './DirectUrlDiscovery';
import type { ISourceItem } from './SourceItemFactory';
import type { PipelineState } from '../../utils/PipelineStateManager';

type IDiscoveryOptions = { cacheDirectory: string } & IGitHubDiscoveryOptions &
  IRSSDiscoveryOptions &
  IGitHubReleasesDiscoveryOptions &
  IMavenDiscoveryOptions &
  IDirectUrlDiscoveryOptions;

/**
 * Core Discovery Module class
 */
export class DiscoveryCore {
  sourceConfigs: SourceConfigs;
  stats: DiscoveryStats;
  githubDiscovery: GitHubDiscovery;
  rssDiscovery: RSSDiscovery;
  githubReleasesDiscovery: GitHubReleasesDiscovery;
  mavenDiscovery: MavenDiscovery;
  directUrlDiscovery: DirectUrlDiscovery;
  discoveredSources: Map<string, ISourceItem>;
  options: IDiscoveryOptions;

  constructor(options: Partial<IDiscoveryOptions> = {}) {
    this.options = {
      cacheDirectory: options.cacheDirectory || './.discovery-cache',
      userAgent: options.userAgent || 'linkie-porting-intelligence/1.0.0',
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      discoveryModeEnabled: options.discoveryModeEnabled || true,
      maxReleases: options.maxReleases || 20,
      includePreReleases: options.includePreReleases || true,
      includeSnapshots: options.includeSnapshots || true,
      maxVersions: options.maxVersions || 20,
      ...options,
    };

    this.sourceConfigs = new SourceConfigs();
    this.stats = new DiscoveryStats();
    this.githubDiscovery = new GitHubDiscovery(this.options);
    this.rssDiscovery = new RSSDiscovery(this.options);
    this.githubReleasesDiscovery = new GitHubReleasesDiscovery(this.options);
    this.mavenDiscovery = new MavenDiscovery(this.options);
    this.directUrlDiscovery = new DirectUrlDiscovery(this.options);
    this.discoveredSources = new Map();
  }

  /**
   * Main discovery entry point
   */
  async discover() {
    logger.info('🔍 Starting source discovery process');
    this.stats.startDiscovery();

    try {
      // Discover from each configured source
      for (const [sourceId, config] of Object.entries(this.sourceConfigs.getConfigs())) {
        logger.info(`📡 Discovering from ${sourceId}`);

        try {
          await this._discoverFromSource(sourceId, config);
          logger.info(`✓ Discovered from ${sourceId}`);
        } catch (error: any) {
          logger.error({ sourceId, error: error.message }, 'Failed to discover from source');
          this.stats.incrementFailedDiscoveries();
          logger.warn(`✗ Failed to discover from ${sourceId}`);
        }
      }

      this.stats.endDiscovery();
      logger.info(`🎯 Discovery complete! Found ${this.discoveredSources.size} sources`);
      this.stats.printDiscoveryStats(this.discoveredSources);

      return this._getDiscoveryResults();
    } catch (error: any) {
      logger.error('💥 Discovery process failed');
      logger.error({ error: error.message }, 'Discovery process failed');
      throw error;
    }
  }

  /**
   * Discover sources from a specific source configuration
   */
  async _discoverFromSource(sourceId: string, config: ISourceConfig) {
    const startingCount = this.discoveredSources.size;

    switch (config.type) {
      case 'github_directory':
        await this.githubDiscovery.discoverFromGitHubDirectory(
          sourceId,
          config,
          this.discoveredSources
        );
        break;
      case 'rss_feed':
        await this.rssDiscovery.discoverFromRSSFeed(sourceId, config, this.discoveredSources);
        break;
      case 'github_releases':
        await this._discoverFromGitHubReleases(sourceId, config);
        break;
      case 'maven_repository':
        await this._discoverFromMaven(sourceId, config);
        break;
      case 'direct_url':
        await this._discoverFromDirectUrl(sourceId, config);
        break;
      default:
        throw new Error(`Unknown source type: ${config.type}`);
    }

    // Update discovery stats
    const newCount = this.discoveredSources.size - startingCount;
    this.stats.addDiscoveredSources(newCount);

    // Validate discovery results
    this._validateDiscoveryResults(sourceId, newCount, config);
  }

  /**
   * Get discovery results in structured format
   */
  _getDiscoveryResults() {
    return {
      stats: this.stats.getStats(),
      sources: Object.fromEntries(this.discoveredSources),
      summary: {
        total_sources: this.discoveredSources.size,
        source_types: [
          ...new Set(Array.from(this.discoveredSources.values()).map((s) => s.source_type)),
        ],
        loader_types: [
          ...new Set(Array.from(this.discoveredSources.values()).map((s) => s.loader_type)),
        ],
        minecraft_versions: [
          ...new Set(
            Array.from(this.discoveredSources.values())
              .map((s) => s.minecraft_version)
              .filter(Boolean)
          ),
        ],
      },
    };
  }

  /**
   * Get discovered sources by criteria
   */
  getSourcesByCriteria(
    criteria: Partial<{
      source_type: any;
      loader_type: any;
      minecraft_version: any;
      priority: any;
      min_relevance: any;
    }> = {}
  ) {
    const sources = Array.from(this.discoveredSources.values());

    return sources.filter((source) => {
      if (criteria.source_type && source.source_type !== criteria.source_type) {
        return false;
      }
      if (criteria.loader_type && source.loader_type !== criteria.loader_type) {
        return false;
      }
      if (criteria.minecraft_version && source.minecraft_version !== criteria.minecraft_version) {
        return false;
      }
      if (criteria.priority && source.priority !== criteria.priority) {
        return false;
      }
      if (criteria.min_relevance && source.relevance_score < criteria.min_relevance) {
        return false;
      }

      return true;
    });
  }

  /**
   * Export discovered sources to JSON
   */
  exportDiscoveredSources() {
    return {
      export_timestamp: new Date().toISOString(),
      discovery_stats: this.stats.getStats(),
      sources: Object.fromEntries(this.discoveredSources),
    };
  }

  /**
   * Validate discovery results to detect silent failures
   */
  _validateDiscoveryResults(sourceId: string, discoveredCount: number, config: ISourceConfig) {
    const expectedMinimums = {
      fabric_blog: 5,
      neoforge_blog: 10,
      neoforged_primers: 10,
    };

    if (discoveredCount === 0) {
      logger.warn(
        `🚨 Source ${sourceId} returned zero results - potential parser failure or source unavailable`
      );
      return;
    }

    const expectedMin = expectedMinimums[sourceId];
    if (expectedMin && discoveredCount < expectedMin) {
      logger.warn(
        `⚠️ Source ${sourceId} returned ${discoveredCount} results, expected minimum ${expectedMin}`
      );
      logger.warn('   This may indicate a parser issue or source format change');
    }

    if (config.type === 'rss_feed') {
      logger.info(
        `✅ RSS/Atom feed ${sourceId} parsed successfully: ${discoveredCount} relevant posts found`
      );
    }

    logger.info(`📊 ${sourceId}: discovered ${discoveredCount} items`);
  }

  /**
   * Discover sources from GitHub releases
   */
  async _discoverFromGitHubReleases(sourceId: string, config: ISourceConfig) {
    try {
      const sources = await this.githubReleasesDiscovery.discover(config);

      for (const source of sources) {
        this.discoveredSources.set(source.url, source);
      }

      logger.info(
        { sourceId: sourceId, count: sources.length },
        `📊 ${sourceId}: discovered ${sources.length} changelog releases`
      );
    } catch (error: any) {
      logger.error(`❌ Failed to discover from GitHub releases ${sourceId}: ${error.message}`);
    }
  }

  /**
   * Discover sources from Maven repository
   */
  async _discoverFromMaven(sourceId: string, config: ISourceConfig) {
    try {
      const sources = await this.mavenDiscovery.discover(config);

      for (const source of sources) {
        this.discoveredSources.set(source.url, source);
      }

      logger.info(
        { sourceId: sourceId, count: sources.length },
        `📊 ${sourceId}: discovered ${sources.length} changelog versions`
      );
    } catch (error: any) {
      logger.error(`❌ Failed to discover from Maven repository ${sourceId}: ${error.message}`);
    }
  }

  /**
   * Discover sources from direct URL
   */
  async _discoverFromDirectUrl(sourceId: string, config: ISourceConfig) {
    try {
      const sources = await this.directUrlDiscovery.discover(config);

      for (const source of sources) {
        this.discoveredSources.set(source.url, source);
      }

      logger.info(
        { sourceId: sourceId, count: sources.length },
        `📊 ${sourceId}: discovered ${sources.length} direct sources`
      );
    } catch (error: any) {
      logger.error(`❌ Failed to discover from direct URL ${sourceId}: ${error.message}`);
    }
  }
}

export default DiscoveryCore;
