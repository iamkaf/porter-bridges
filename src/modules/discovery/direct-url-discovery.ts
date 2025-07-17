/**
 * @file Direct URL Discovery - Discovers sources from direct URLs
 *
 * This module handles discovery of content from direct URLs like GitHub Gists,
 * documentation pages, and other specialized guides.
 */

import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import type { LoaderType, Priority, SourceType } from '../../constants/enums';
import { createHttpError, httpClient } from '../../utils/http';
import { logger } from '../../utils/logger';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';
import { SourceItemFactory } from './source-item-factory';

export interface IDirectUrlDiscoveryOptions {
  timeout: number;
}

export interface IUrlInfo {
  type: string;
  domain: string;
  path: string;
  username?: string | undefined;
  gistId?: string | undefined;
  owner?: string | undefined;
  repo?: string | undefined;
}

/**
 * Direct URL Discovery class
 */
export class DirectUrlDiscovery {
  options: IDirectUrlDiscoveryOptions;
  sourceFactory: SourceItemFactory;
  contentAnalyzer: ContentAnalyzer;

  constructor(options: Partial<IDirectUrlDiscoveryOptions>) {
    this.options = {
      timeout: options.timeout || 30_000,
      ...options,
    };

    this.sourceFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
  }

  /**
   * Discover source from direct URL
   */
  async discover(sourceConfig: ISourceConfig) {
    const sources = [];

    try {
      // Fetch the URL to verify it exists and get metadata
      await httpClient.head(sourceConfig.url);

      // Extract metadata from URL and config
      const urlInfo = this._analyzeUrl(sourceConfig.url);
      const title = this._generateTitle(sourceConfig, urlInfo);

      // Create source item
      const sourceItem = await this.sourceFactory.createSourceItem({
        status: 'discovered',
        url: sourceConfig.url,
        source_type: sourceConfig.source_type as SourceType,
        loader_type: sourceConfig.loader_type as LoaderType,
        title,
        minecraft_version: this._extractMinecraftVersion(sourceConfig, urlInfo),
        checksum: this._generateUrlChecksum(sourceConfig.url),
        tags: this._generateTags(sourceConfig, urlInfo),
        relevance_score: this._calculateRelevance(sourceConfig),
        priority: this._calculatePriority(sourceConfig),
        metadata: {
          url_type: urlInfo.type,
          domain: urlInfo.domain,
          direct_source: true,
          specialization: sourceConfig.source_type,
        },
      });

      sources.push(sourceItem);
    } catch (error: any) {
      const httpError = createHttpError(error, sourceConfig.url);
      logger.error(
        { error: httpError.message },
        'Failed to discover from direct URL'
      );
      throw httpError;
    }

    return sources;
  }

  /**
   * Analyze URL to extract metadata
   */
  _analyzeUrl(url: string) {
    const urlObj = new URL(url);

    let type = 'unknown';

    const details: Partial<IUrlInfo> = {};

    if (url.includes('gist.github.com')) {
      type = 'github_gist';
      const pathParts = urlObj.pathname.split('/');
      details.username = pathParts[1];
      details.gistId = pathParts[2];
    } else if (url.includes('github.com') && !url.includes('gist')) {
      type = 'github_page';
      const pathParts = urlObj.pathname.split('/');
      details.owner = pathParts[1];
      details.repo = pathParts[2];
    } else if (url.includes('docs.')) {
      type = 'documentation';
    } else {
      type = 'webpage';
    }

    return {
      type,
      domain: urlObj.hostname,
      path: urlObj.pathname,
      ...details,
    };
  }

  /**
   * Generate appropriate title for the source
   */
  _generateTitle(sourceConfig: ISourceConfig, urlInfo: IUrlInfo): string {
    // Use description as base if available
    if (sourceConfig.description) {
      return sourceConfig.description;
    }

    // Generate based on URL type
    if (urlInfo.type === 'github_gist') {
      if (sourceConfig.source_type === 'guide') {
        return `${this._capitalize(sourceConfig.loader_type)} Guide`;
      }
      return `GitHub Gist by ${urlInfo.username}`;
    }
    if (urlInfo.type === 'github_page') {
      return `${urlInfo.owner}/${urlInfo.repo} Guide`;
    }
    if (urlInfo.type === 'documentation') {
      return `${this._capitalize(sourceConfig.loader_type)} Documentation`;
    }
    return `${this._capitalize(sourceConfig.source_type)} - ${urlInfo.domain}`;
  }

  /**
   * Extract Minecraft version from config or URL
   */
  _extractMinecraftVersion(
    sourceConfig: ISourceConfig,
    _urlInfo: IUrlInfo
  ): string | null {
    // Check if explicitly mentioned in description
    if (sourceConfig.description) {
      const versionMatch =
        sourceConfig.description.match(/\b1\.\d+(?:\.\d+)?\b/);
      if (versionMatch) {
        return versionMatch[0];
      }
    }

    // For EventBus guide, it's specifically for Forge on 1.21.7
    if (
      sourceConfig.url.includes('PaintNinja') &&
      sourceConfig.url.includes('ad82c224')
    ) {
      return '1.21.7'; // EventBus 7 is specifically for Forge on MC 1.21.7
    }

    return null;
  }

  /**
   * Generate relevant tags
   */
  _generateTags(sourceConfig: ISourceConfig, urlInfo: any): string[] {
    const tags = [sourceConfig.source_type, sourceConfig.loader_type];

    if (urlInfo.type) {
      tags.push(urlInfo.type);
    }

    if (urlInfo.type === 'github_gist') {
      tags.push('gist', 'community');
    }

    // Add specific tags based on known content
    if (
      sourceConfig.url.includes('eventbus') ||
      sourceConfig.description?.toLowerCase().includes('eventbus')
    ) {
      tags.push('eventbus', 'migration', 'events');
    }

    const minecraftVersion = this._extractMinecraftVersion(
      sourceConfig,
      urlInfo
    );
    if (minecraftVersion) {
      tags.push(minecraftVersion);
    }

    return tags;
  }

  /**
   * Calculate relevance score
   */
  _calculateRelevance(sourceConfig: ISourceConfig): number {
    let relevance = 0.8; // Base high relevance for curated direct sources

    // Guides get higher relevance
    if (sourceConfig.source_type === 'guide') {
      relevance = 0.95;
    }

    // EventBus migration guide is highly relevant
    if (
      sourceConfig.url.includes('PaintNinja') &&
      sourceConfig.url.includes('eventbus')
    ) {
      relevance = 1.0;
    }

    return relevance;
  }

  /**
   * Calculate priority
   */
  _calculatePriority(sourceConfig: ISourceConfig): Priority {
    // Guides get high priority
    if (sourceConfig.source_type === 'guide') {
      return 'high';
    }

    // Direct curated sources get medium priority
    return 'medium';
  }

  /**
   * Generate a checksum for a URL
   */
  _generateUrlChecksum(url: string): string {
    return createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Capitalize first letter
   */
  _capitalize(str: string) {
    if (!str) {
      return '';
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

export default DirectUrlDiscovery;
