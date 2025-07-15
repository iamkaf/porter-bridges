/**
 * @file GitHub Releases Discovery - Discovers changelog sources from GitHub releases
 *
 * This module handles discovery of changelog content from GitHub releases API.
 * It fetches release information and creates sources for changelog-type content.
 */

import { createHash } from 'node:crypto';
import type { LoaderType, Priority, SourceType } from '../../constants/enums';
import { createHttpError, githubClient } from '../../utils/http';
import { logger } from '../../utils/logger';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';
import { SourceItemFactory } from './source-item-factory';

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
      includePreReleases: true,
      timeout: options.timeout || 30_000,
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
      const releases = await githubClient.get(sourceConfig.url).json<Record<string, unknown>[]>();

      // Limit to recent releases to avoid overwhelming the system
      const recentReleases = releases.slice(0, this.options.maxReleases);

      for (const release of recentReleases) {
        // Skip pre-releases and drafts unless specifically included
        if (
          release.draft ||
          (release.prerelease && !this.options.includePreReleases)
        ) {
          continue;
        }

        // Analyze release for porting relevance
        const releaseText = `${release.name || ''} ${release.body || ''}`;
        const relevanceScore =
          this.contentAnalyzer.calculatePortingRelevance(releaseText);

        // Only include releases with reasonable relevance for porting
        if (relevanceScore < 0.2) {
          continue;
        }

        // Extract version information
        const version = this._extractVersionFromRelease(release);

        // Create source item
        const sourceItem = await this.sourceFactory.createSourceItem({
          status: 'discovered',
          url: release.html_url as string, // Use HTML URL for direct access
          source_type: sourceConfig.source_type as SourceType,
          loader_type: sourceConfig.loader_type as LoaderType,
          title:
            (release.name as string) ||
            `${sourceConfig.loader_type} Release ${release.tag_name}`,
          minecraft_version: version.minecraft_version,
          loader_version: version.loader_version,
          content_preview: this._truncateText((release.body as string) || '', 200),
          checksum: this._generateUrlChecksum(release.html_url as string),
          tags: this._generateTags(release, sourceConfig),
          relevance_score: relevanceScore,
          priority: this._calculatePriority(release, relevanceScore),
          metadata: {
            release_tag: release.tag_name as string,
            published_at: release.published_at as string,
            is_prerelease: release.prerelease as boolean,
            assets_count: (release.assets as unknown[] | undefined)?.length || 0,
            download_count: this._calculateDownloadCount(release),
          },
        });

        sources.push(sourceItem);
      }
    } catch (error: unknown) {
      const httpError = createHttpError(error, sourceConfig.url);
      logger.error(
        { error: httpError.message },
        'Failed to discover from GitHub releases'
      );
      throw httpError;
    }

    return sources;
  }

  /**
   * Extract version information from release
   */
  _extractVersionFromRelease(release: Record<string, unknown>): {
    minecraft_version: string | null;
    loader_version: string;
  } {
    const tagName = (release.tag_name as string) || '';
    const releaseName = (release.name as string) || '';
    const releaseBody = (release.body as string) || '';

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
  _generateTags(release: Record<string, unknown>, sourceConfig: ISourceConfig): string[] {
    const tags = ['changelog', sourceConfig.loader_type, 'release'];

    if (release.prerelease) {
      tags.push('prerelease');
    }

    if (release.tag_name) {
      tags.push(release.tag_name as string);
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
  _calculatePriority(release: Record<string, unknown>, relevanceScore: number): Priority {
    // Recent releases with high relevance get higher priority
    const publishedDate = new Date((release.published_at as string) || Date.now());
    const daysSincePublished =
      (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSincePublished < 30 && relevanceScore > 0.7) {
      return 'high';
    }
    if (daysSincePublished < 90 && relevanceScore > 0.5) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Calculate total download count for release
   */
  _calculateDownloadCount(release: Record<string, unknown>): number {
    if (!release.assets) {
      return 0;
    }

    return (release.assets as unknown[]).reduce((total, asset: Record<string, unknown>) => {
      return total + ((asset.download_count as number) || 0);
    }, 0);
  }
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
