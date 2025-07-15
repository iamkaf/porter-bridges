/**
 * @file Maven Discovery - Discovers changelog sources from Maven repositories
 *
 * This module handles discovery of changelog content from Maven repositories.
 * It fetches Maven metadata and creates sources for changelog-type content.
 */

import { createHash } from 'crypto';
import { SourceItemFactory } from './SourceItemFactory';
import { ContentAnalyzer } from './ContentAnalyzer';
import { mavenClient, createHttpError } from '../../utils/http';
import { logger } from '../../utils/logger';
import { type SourceType, type LoaderType, type Priority } from '../../constants/enums';
import type { ISourceConfig } from './SourceConfigs';

export interface IMavenDiscoveryOptions {
  includeSnapshots: any;
  timeout: number;
  maxVersions: number;
}

/**
 * Maven Discovery class
 */
export class MavenDiscovery {
  options: IMavenDiscoveryOptions;
  sourceFactory: SourceItemFactory;
  contentAnalyzer: ContentAnalyzer;

  constructor(options: Partial<IMavenDiscoveryOptions> = {}) {
    this.options = {
      includeSnapshots: options.includeSnapshots || true,
      timeout: options.timeout || 30000,
      maxVersions: options.maxVersions || 20, // Limit to recent versions
      ...options,
    };

    this.sourceFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
  }

  /**
   * Discover changelog sources from Maven repositories
   */
  async discover(sourceConfig: ISourceConfig) {
    const sources = [];

    try {
      // Get Maven metadata XML
      const metadataUrl = this._buildMetadataUrl(sourceConfig.url);
      const versions = await this._fetchMavenVersions(metadataUrl);

      // Limit to recent versions to avoid overwhelming the system
      const recentVersions = versions.slice(0, this.options.maxVersions);

      for (const version of recentVersions) {
        try {
          // Build changelog URL for this version
          const changelogUrl = this._buildChangelogUrl(sourceConfig.url, version);

          // Check if changelog exists (HEAD request)
          const exists = await this._checkChangelogExists(changelogUrl);
          if (!exists) {
            continue;
          }

          // Extract version information
          const versionInfo = this._extractVersionInfo(version, sourceConfig.loader_type);

          // Create source item
          const sourceItem = await this.sourceFactory.createSourceItem({
            status: 'discovered',
            url: changelogUrl,
            source_type: sourceConfig.source_type as SourceType,
            loader_type: sourceConfig.loader_type as LoaderType,
            title: `${sourceConfig.loader_type} ${version} Changelog`,
            minecraft_version: versionInfo.minecraft_version,
            loader_version: versionInfo.loader_version,
            checksum: this._generateUrlChecksum(changelogUrl),
            tags: this._generateTags(version, sourceConfig),
            relevance_score: this._calculateRelevance(version, sourceConfig),
            priority: this._calculatePriority(version, sourceConfig),
            metadata: {
              maven_version: version,
              maven_repository: this._extractRepositoryName(sourceConfig.url),
              changelog_type: 'maven_txt',
            },
          });

          sources.push(sourceItem);
        } catch (_error) {
          // Skip individual version failures
          continue;
        }
      }
    } catch (error: any) {
      const httpError = createHttpError(error, sourceConfig.url);
      logger.error({ error: httpError.message }, 'Failed to discover from Maven repository');
      throw httpError;
    }

    return sources;
  }

  /**
   * Build Maven metadata URL from base URL
   */
  _buildMetadataUrl(baseUrl: string) {
    // Convert artifact URL to metadata URL
    // Example: https://maven.neoforged.net/releases/net/neoforged/neoforge/
    // becomes: https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml

    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }

    return `${baseUrl}maven-metadata.xml`;
  }

  /**
   * Fetch available versions from Maven metadata
   */
  async _fetchMavenVersions(metadataUrl: string): Promise<string[]> {
    try {
      const xmlContent = await mavenClient.get(metadataUrl).text();

      // Parse XML to extract versions
      const versions = this._parseVersionsFromXml(xmlContent);

      // Sort versions by recency (newest first)
      return this._sortVersionsByRecency(versions);
    } catch (error: any) {
      throw new Error(`Failed to fetch Maven metadata: ${error.message}`);
    }
  }

  /**
   * Parse versions from Maven metadata XML
   */
  _parseVersionsFromXml(xmlContent) {
    const versions = [];

    // Simple regex parsing for <version> tags
    const versionRegex = /<version>([^<]+)<\/version>/g;
    let match;

    while ((match = versionRegex.exec(xmlContent)) !== null) {
      const version = match[1];

      // Skip snapshot versions unless specifically included
      if (version.includes('SNAPSHOT') && !this.options.includeSnapshots) {
        continue;
      }

      versions.push(version);
    }

    return versions;
  }

  /**
   * Sort versions by recency (newest first)
   */
  _sortVersionsByRecency(versions) {
    return versions.sort((a, b) => {
      // Extract numeric parts for comparison
      const getNumericParts = (version) => {
        const numbers = version.match(/(\d+)/g);
        return numbers ? numbers.map(Number) : [0];
      };

      const aParts = getNumericParts(a);
      const bParts = getNumericParts(b);

      // Compare each numeric part
      const maxLength = Math.max(aParts.length, bParts.length);
      for (let i = 0; i < maxLength; i++) {
        const aNum = aParts[i] || 0;
        const bNum = bParts[i] || 0;

        if (aNum !== bNum) {
          return bNum - aNum; // Descending order
        }
      }

      return 0;
    });
  }

  /**
   * Build changelog URL for specific version
   */
  _buildChangelogUrl(baseUrl, version) {
    // NeoForge: https://maven.neoforged.net/releases/net/neoforged/neoforge/21.7.19-beta/neoforge-21.7.19-beta-changelog.txt
    // Forge: https://maven.minecraftforge.net/net/minecraftforge/forge/1.21.7-57.0.2/forge-1.21.7-57.0.2-changelog.txt

    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }

    if (baseUrl.includes('neoforged')) {
      return `${baseUrl}${version}/neoforge-${version}-changelog.txt`;
    } else if (baseUrl.includes('minecraftforge')) {
      return `${baseUrl}${version}/forge-${version}-changelog.txt`;
    } else {
      // Generic pattern
      const artifactName = this._extractArtifactName(baseUrl);
      return `${baseUrl}${version}/${artifactName}-${version}-changelog.txt`;
    }
  }

  /**
   * Extract artifact name from Maven URL
   */
  _extractArtifactName(url) {
    const parts = url.split('/');
    return parts[parts.length - 2] || 'artifact';
  }

  /**
   * Extract repository name for metadata
   */
  _extractRepositoryName(url) {
    if (url.includes('maven.neoforged.net')) {
      return 'neoforged-maven';
    } else if (url.includes('maven.minecraftforge.net')) {
      return 'minecraftforge-maven';
    } else {
      return 'unknown-maven';
    }
  }

  /**
   * Check if changelog exists for version
   */
  async _checkChangelogExists(changelogUrl: string): Promise<boolean> {
    try {
      await mavenClient.head(changelogUrl);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Extract version information from Maven version string
   */
  _extractVersionInfo(version, loaderType) {
    let minecraftVersion = null;
    const loaderVersion = version;

    if (loaderType === 'neoforge') {
      // NeoForge pattern: 21.7.19-beta (21.7 maps to 1.21.7)
      const match = version.match(/^(\d+)\.(\d+)/);
      if (match) {
        minecraftVersion = `1.${match[1]}.${match[2]}`;
      }
    } else if (loaderType === 'forge') {
      // Forge pattern: 1.21.7-57.0.2
      const match = version.match(/^(1\.\d+(?:\.\d+)?)/);
      if (match) {
        minecraftVersion = match[1];
      }
    }

    return {
      minecraft_version: minecraftVersion,
      loader_version: loaderVersion,
    };
  }

  /**
   * Generate relevant tags for version
   */
  _generateTags(version, sourceConfig) {
    const tags = ['changelog', sourceConfig.loader_type, 'maven'];

    if (version.includes('beta')) {
      tags.push('beta');
    }

    if (version.includes('alpha')) {
      tags.push('alpha');
    }

    // Add minecraft version if extracted
    const versionInfo = this._extractVersionInfo(version, sourceConfig.loader_type);
    if (versionInfo.minecraft_version) {
      tags.push(versionInfo.minecraft_version);
    }

    tags.push(version);

    return tags;
  }

  /**
   * Calculate relevance score for version
   */
  _calculateRelevance(version, sourceConfig) {
    let relevance = 0.7; // Base relevance for changelogs

    // Recent versions get higher relevance
    const versionInfo = this._extractVersionInfo(version, sourceConfig.loader_type);
    if (versionInfo.minecraft_version) {
      const minorVersion = parseFloat(versionInfo.minecraft_version.substring(2)); // Extract 21.7 from 1.21.7
      if (minorVersion >= 21.0) {
        relevance += 0.2; // Recent MC versions
      }
    }

    // Beta/Alpha versions get slightly lower relevance
    if (version.includes('beta')) {
      relevance -= 0.1;
    } else if (version.includes('alpha')) {
      relevance -= 0.2;
    }

    return Math.min(relevance, 1.0);
  }

  /**
   * Calculate priority based on version characteristics
   */
  _calculatePriority(version, sourceConfig) {
    const versionInfo = this._extractVersionInfo(version, sourceConfig.loader_type);

    // Recent Minecraft versions get high priority
    if (versionInfo.minecraft_version) {
      const minorVersion = parseFloat(versionInfo.minecraft_version.substring(2));
      if (minorVersion >= 21.6) {
        return 'high';
      } else if (minorVersion >= 21.0) {
        return 'medium';
      }
    }

    return 'low';
  }

  /**
   * Generate a checksum for a URL
   */
  _generateUrlChecksum(url: string): string {
    return createHash('sha256').update(url).digest('hex').substring(0, 16);
  }
}

export default MavenDiscovery;
