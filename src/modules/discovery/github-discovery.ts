/**
 * @file GitHub Discovery - Handles GitHub-specific discovery logic
 *
 * This module manages discovery from GitHub repositories, including
 * directory traversal and file discovery.
 */

import { createHash } from 'node:crypto';
import type { LoaderType, SourceType } from '../../constants/enums';
import { executeWithDegradation } from '../../utils/graceful-degradation';
import { githubClient } from '../../utils/http';
import { logger } from '../../utils/logger';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';
import { type ISourceItem, SourceItemFactory } from './source-item-factory';

// Simple retry utility with proper typing (currently unused)
// const _retry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
//   for (let i = 0; i < retries; i++) {
//     try {
//       return await fn();
//     } catch (error: unknown) {
//       if (i === retries - 1) {
//         throw error;
//       }
//       await new Promise((resolve) => setTimeout(resolve, 2 ** i * 1000));
//     }
//   }
//   throw new Error('Retry function should not reach here');
// };

export interface IGitHubDiscoveryOptions {
  userAgent: string;
  timeout: number;
  retryAttempts: number;
  discoveryModeEnabled: boolean;
}

/**
 * GitHub discovery class
 */
export class GitHubDiscovery {
  private sourceItemFactory: SourceItemFactory;
  private contentAnalyzer: ContentAnalyzer;

  constructor(_options: Partial<IGitHubDiscoveryOptions> = {}) {
    // Options are currently unused but kept for future extensibility

    this.sourceItemFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
  }

  /**
   * Discover NeoForged primers from GitHub directory
   */
  async discoverFromGitHubDirectory(
    sourceId: string,
    config: ISourceConfig,
    discoveredSources: Map<string, ISourceItem>
  ): Promise<number> {
    return executeWithDegradation(
      async () => {
        const files = await githubClient.getJson<
          Array<{
            name: string;
            type: 'file' | 'dir';
            download_url?: string;
            url: string;
            size: number;
          }>
        >(config.url);

        let discovered = 0;

        for (const item of files) {
          // Look for directories (version folders)
          if (item.type === 'dir') {
            const version = item.name;
            const sourceItemId = `${sourceId}-${version}`;

            const sourceItem = await this.sourceItemFactory.createSourceItem({
              id: sourceItemId,
              status: 'discovered',
              url: `https://raw.githubusercontent.com/neoforged/.github/main/primers/${version}/index.md`,
              source_type: config.source_type as SourceType,
              loader_type: config.loader_type as LoaderType,
              minecraft_version: version,
              title: `Vanilla Minecraft primer for ${version}`,
              file_size_bytes: undefined,
              checksum: await this._generateUrlChecksum(item.url),
              tags: ['primer', 'vanilla', 'minecraft', version],
              priority: this.contentAnalyzer.determinePriority(version),
              relevance_score: this.contentAnalyzer.calculateRelevance(
                version,
                config.source_type
              ),
            });

            discoveredSources.set(sourceItemId, sourceItem);
            discovered++;
          } else if (item.name.endsWith('.md') && item.type === 'file') {
            // Also check for direct .md files in the root directory
            const version = item.name.replace('.md', '');
            const sourceItemId = `${sourceId}-${version}`;

            const sourceItem = await this.sourceItemFactory.createSourceItem({
              id: sourceItemId,
              status: 'discovered',
              url: item.download_url,
              source_type: config.source_type as SourceType,
              loader_type: config.loader_type as LoaderType,
              minecraft_version: version,
              title:
                version === 'README'
                  ? 'Vanilla Minecraft primers README'
                  : `Vanilla Minecraft primer for ${version}`,
              file_size_bytes: item.size,
              checksum: await this._generateUrlChecksum(item.download_url),
              tags: ['primer', 'vanilla', 'minecraft', version],
              priority: this.contentAnalyzer.determinePriority(version),
              relevance_score: this.contentAnalyzer.calculateRelevance(
                version,
                config.source_type
              ),
            });

            discoveredSources.set(sourceItemId, sourceItem);
            discovered++;
          }
        }

        logger.info({ sourceId, count: discovered }, 'Discovered primers');
        return discovered;
      },
      'github_discovery',
      `discover_from_github_directory_${sourceId}`,
      {
        allowDegradation: true,
        fallbackData: 0,
        skipOnFailure: false,
        required: false,
      }
    ).then((result) => {
      if (result.degraded) {
        logger.warn('🔄 GitHub discovery completed with degradation', {
          sourceId,
          degradationLevel: result.degradationLevel,
          strategy: result.strategy,
          warnings: result.warnings,
        });
      }
      return result.data || 0;
    });
  }

  /**
   * Discover content from a GitHub repository based on glob patterns.
   */
  async discoverFromGitHubRepo(
    sourceId: string,
    config: ISourceConfig,
    discoveredSources: Map<string, ISourceItem>
  ): Promise<number> {
    return executeWithDegradation(
      async () => {
        const { owner, repo, path, glob } = config;
        if (!(owner && repo && path && glob)) {
          throw new Error(
            'Missing owner, repo, path, or glob in GitHub repo config'
          );
        }

        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const files =
          await githubClient.getJson<
            Array<{
              name: string;
              type: 'file' | 'dir';
              download_url?: string;
              url: string;
              size: number;
            }>
          >(apiUrl);

        let discovered = 0;

        for (const item of files) {
          if (
            item.type === 'file' &&
            item.name.match(
              new RegExp(glob.replace('.', '.').replace('*', '.*'))
            )
          ) {
            const sourceItemId = `${sourceId}-${item.name}`;
            const rawContentUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}/${item.name}`;

            const sourceItem = await this.sourceItemFactory.createSourceItem({
              id: sourceItemId,
              status: 'discovered',
              url: rawContentUrl,
              source_type: config.source_type as SourceType,
              loader_type: config.loader_type as LoaderType,
              title: item.name,
              file_size_bytes: item.size,
              checksum: await this._generateUrlChecksum(rawContentUrl),
              tags: ['github', owner, repo, path, item.name],
              priority: this.contentAnalyzer.determinePriority(item.name),
              relevance_score: this.contentAnalyzer.calculateRelevance(
                item.name,
                config.source_type
              ),
            });

            discoveredSources.set(sourceItemId, sourceItem);
            discovered++;
          }
        }

        logger.info(
          { sourceId, count: discovered },
          'Discovered GitHub repo files'
        );
        return discovered;
      },
      'github_discovery',
      `discover_from_github_repo_${sourceId}`,
      {
        allowDegradation: true,
        fallbackData: 0,
        skipOnFailure: false,
        required: false,
      }
    ).then((result) => {
      if (result.degraded) {
        logger.warn('🔄 GitHub repo discovery completed with degradation', {
          sourceId,
          degradationLevel: result.degradationLevel,
          strategy: result.strategy,
          warnings: result.warnings,
        });
      }
      return result.data || 0;
    });
  }

  /**
   * Generate a checksum for a URL
   */
  _generateUrlChecksum(url: string): string {
    return createHash('sha256').update(url).digest('hex').substring(0, 16);
  }
}

export default GitHubDiscovery;
