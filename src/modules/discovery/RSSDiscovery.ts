/**
 * @file RSS Discovery - Handles RSS/Atom feed discovery logic
 *
 * This module manages discovery from RSS and Atom feeds, including
 * feed parsing and content relevance analysis.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { rssClient, createHttpError } from '../../utils/http';
import { SourceItemFactory } from './SourceItemFactory';
import { ContentAnalyzer } from './ContentAnalyzer';
import { FeedParser } from './FeedParser';
import { type SourceType, type LoaderType, type Priority } from '../../constants/enums';
import type { ISourceConfig } from './SourceConfigs';

export interface IRSSDiscoveryOptions {
  userAgent: string;
  timeout: number;
  retryAttempts: number;
}

/**
 * RSS discovery class
 */
export class RSSDiscovery {
  options: IRSSDiscoveryOptions;
  sourceItemFactory: SourceItemFactory;
  contentAnalyzer: ContentAnalyzer;
  feedParser: FeedParser;

  constructor(options: Partial<IRSSDiscoveryOptions> = {}) {
    this.options = {
      userAgent: 'linkie-porting-intelligence/1.0.0',
      timeout: 30000,
      retryAttempts: 3,
      ...options,
    };

    this.sourceItemFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
    this.feedParser = new FeedParser();
  }

  /**
   * Discover blog posts from RSS feeds
   */
  async discoverFromRSSFeed(sourceId: string, config: ISourceConfig, discoveredSources: Map<string, any>) {
    try {
      const rssContent = await rssClient.get(config.url).text();
      const posts = this.feedParser.parseRSSFeed(rssContent);
      let discovered = 0;

      for (const post of posts) {
        if (this.contentAnalyzer.isPortingRelevant(post.title, post.description)) {
          const sourceItemId = `${sourceId}-${this._generatePostId(post.url)}`;

          const sourceItem = await this.sourceItemFactory.createSourceItem({
            id: sourceItemId,
            status: 'discovered',
            url: post.url,
            source_type: config.source_type as SourceType,
            loader_type: config.loader_type as LoaderType,
            title: post.title,
            minecraft_version:
              this.contentAnalyzer.extractMinecraftVersion(post.title, post.description) || undefined,
            content_length: post.description?.length || 0,
            checksum: await this._generateUrlChecksum(post.url),
            tags: this.contentAnalyzer.extractTags(post.title, post.description),
            priority: this.contentAnalyzer.determineBlogPriority(post),
            relevance_score: this.contentAnalyzer.calculateBlogRelevance(
              post.title,
              post.description
            ),
            discovered_at: new Date().toISOString(),
          });

          discoveredSources.set(sourceItemId, sourceItem);
          discovered++;
        }
      }

      logger.info({ sourceId, count: discovered }, 'Discovered relevant blog posts');
      return discovered;
    } catch (error) {
      const httpError = createHttpError(error, config.url);
      logger.error({ error: httpError.message }, 'Failed to discover from RSS feed');
      throw httpError;
    }
  }

  /**
   * Generate a unique post ID from URL
   */
  _generatePostId(url: string) {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }

  /**
   * Generate a checksum for a URL
   */
  _generateUrlChecksum(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  }
}

export default RSSDiscovery;
