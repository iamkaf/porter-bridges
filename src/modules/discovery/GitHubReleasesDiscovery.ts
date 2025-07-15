/**
 * @file GitHub Releases Discovery - Discovers changelog sources from GitHub releases
 *
 * This module handles discovery of changelog content from GitHub releases API.
 * It fetches release information and creates sources for changelog-type content.
 */

import { createHash } from 'crypto';
import { SourceItemFactory } from './SourceItemFactory';
import { ContentAnalyzer } from './ContentAnalyzer';
import { githubClient, createHttpError } from '../../utils/http';
import { logger } from '../../utils/logger';
import { type SourceType, type LoaderType, type Priority } from '../../constants/enums';
import type { ISourceConfig } from './SourceConfigs';

export interface IGitHubReleasesDiscoveryOptions {
  timeout: number;
  maxReleases: number;
  includePreReleases: boolean;
}

/**
 * GitHub Releases Discovery class
 */
export class GitHubReleasesDiscovery {
  options: IGitHubReleasesDiscoveryOptions;
  sourceFactory: SourceItemFactory;
  contentAnalyzer: ContentAnalyzer;

  constructor(options: Partial<IGitHubReleasesDiscoveryOptions> = {}) {
    this.options = {
      includePreReleases: options.includePreReleases || true,
      timeout: options.timeout || 30000,
      maxReleases: options.maxReleases || 20, // Limit to recent releases
      ...options,
    };

    this.sourceFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
  }

  /**
   * Discover changelog sources from GitHub releases
   */
  async discover(sourceConfig: ISourceConfig) {
    const sources = [];

    try {
      // Fetch releases from GitHub API
      const releases = await githubClient.get(sourceConfig.url).json<any[]>();

      // Limit to recent releases to avoid overwhelming the system
      const recentReleases = releases.slice(0, this.options.maxReleases);

      for (const release of recentReleases) {
        // Skip pre-releases and drafts unless specifically included
        if (release.draft || (release.prerelease && !this.options.includePreReleases)) {
          continue;
        }

        // Analyze release for porting relevance
        const releaseText = `${release.name || ''} ${release.body || ''}`;
        const relevanceScore = this.contentAnalyzer.calculatePortingRelevance(releaseText);

        // Only include releases with reasonable relevance for porting
        if (relevanceScore < 0.2) {
          continue;
        }

        // Extract version information
        const version = this._extractVersionFromRelease(release);

        // Create source item
        const sourceItem = await this.sourceFactory.createSourceItem({
          status: 'discovered',
          url: release.html_url, // Use HTML URL for direct access
          source_type: sourceConfig.source_type as SourceType,
          loader_type: sourceConfig.loader_type as LoaderType,
          title: release.name || `${sourceConfig.loader_type} Release ${release.tag_name}`,
          minecraft_version: version.minecraft_version,
          loader_version: version.loader_version,
          content_preview: this._truncateText(release.body || '', 200),
          checksum: this._generateUrlChecksum(release.html_url),
          tags: this._generateTags(release, sourceConfig),
          relevance_score: relevanceScore,
          priority: this._calculatePriority(release, relevanceScore),
          metadata: {
            release_tag: release.tag_name,
            published_at: release.published_at,
            is_prerelease: release.prerelease,
            assets_count: release.assets ? release.assets.length : 0,
            download_count: this._calculateDownloadCount(release),
          },
        });

        sources.push(sourceItem);
      }
    } catch (error: any) {
      const httpError = createHttpError(error, sourceConfig.url);
      logger.error({ error: httpError.message }, 'Failed to discover from GitHub releases');
      throw httpError;
    }

    return sources;
  }

  /**
   * Extract version information from release
   */
  _extractVersionFromRelease(release: any): { minecraft_version: string | null; loader_version: string } {
    const tagName = release.tag_name || '';
    const releaseName = release.name || '';
    const releaseBody = release.body || '';

    // Common patterns for Minecraft versions
    const mcVersionPatterns = [
      /minecraft[\s-]*(1\.\d+(?:\.\d+)?)/i,
      /mc[\s-]*(1\.\d+(?:\.\d+)?)/i,
      /(1\.\d+(?:\.\d+)?)/,
      /for[\s-]*(1\.\d+(?:\.\d+)?)/i,
    ];

    let minecraftVersion = null;
    const searchText = `${tagName} ${releaseName} ${releaseBody}`;

    for (const pattern of mcVersionPatterns) {
      const match = searchText.match(pattern);
      if (match) {
        minecraftVersion = match[1];
        break;
      }
    }

    return {
      minecraft_version: minecraftVersion,
      loader_version: tagName,
    };
  }

  /**
   * Generate relevant tags for release
   */
  _generateTags(release: any, sourceConfig: ISourceConfig): string[] {
    const tags = ['changelog', sourceConfig.loader_type, 'release'];

    if (release.prerelease) {
      tags.push('prerelease');
    }

    if (release.tag_name) {
      tags.push(release.tag_name);
    }

    // Add minecraft version if found
    const version = this._extractVersionFromRelease(release);
    if (version.minecraft_version) {
      tags.push(version.minecraft_version);
    }

    return tags;
  }

  /**
   * Calculate priority based on release characteristics
   */
  _calculatePriority(release: any, relevanceScore: number): Priority {
    // Recent releases with high relevance get higher priority
    const publishedDate = new Date(release.published_at || Date.now());
    const daysSincePublished = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSincePublished < 30 && relevanceScore > 0.7) {
      return 'high';
    } else if (daysSincePublished < 90 && relevanceScore > 0.5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Calculate total download count for release
   */
  _calculateDownloadCount(release: any): number {
    if (!release.assets) {
      return 0;
    }

    return release.assets.reduce((total, asset) => {
      return total + (asset.download_count || 0);
    }, 0);
  }

  /**
   * Generate a checksum for a URL
   */
  _generateUrlChecksum(url: string): string {
    return createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Truncate text to specified length
   */
  _truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.substring(0, maxLength - 3)}...`;
  }
}

export default GitHubReleasesDiscovery;
