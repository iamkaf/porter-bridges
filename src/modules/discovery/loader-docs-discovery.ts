/**
 * @file Loader Documentation Discovery - Discovers documentation sources from mod loaders
 *
 * This module handles discovery of documentation from Fabric, NeoForge, and Minecraft Forge
 * documentation repositories. It handles different repository structures (directory-based vs branch-based).
 */

import { createHash } from 'node:crypto';
import type { LoaderType, Priority, SourceType } from '../../constants/enums';
import { createHttpError, httpClient } from '../../utils/http';
import { logger } from '../../utils/logger';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';
import { SourceItemFactory } from './source-item-factory';

export interface ILoaderDocsDiscoveryOptions {
  timeout: number;
  githubToken?: string;
  maxVersions?: number;
}

export interface ILoaderDocsConfig {
  loader: 'fabric' | 'neoforge' | 'forge';
  structure: 'directory' | 'branch';
  currentVersion?: string;
  versions?: string[];
  baseUrl: string;
  docsPath: string;
}

/**
 * Loader Documentation Discovery class
 */
export class LoaderDocsDiscovery {
  options: ILoaderDocsDiscoveryOptions;
  sourceFactory: SourceItemFactory;
  contentAnalyzer: ContentAnalyzer;
  private githubApiBase = 'https://api.github.com';

  constructor(options: Partial<ILoaderDocsDiscoveryOptions> = {}) {
    this.options = {
      timeout: options.timeout || 30_000,
      maxVersions: options.maxVersions || 20,
      ...options,
    };

    this.sourceFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
  }

  /**
   * Discover documentation sources based on loader configuration
   */
  async discover(sourceConfig: ISourceConfig) {
    const sources = [];

    try {
      // Parse loader configuration from source config
      const loaderConfig = this._parseLoaderConfig(sourceConfig);

      if (loaderConfig.structure === 'directory') {
        // Handle directory-based documentation (Fabric, NeoForge)
        return await this._discoverDirectoryDocs(sourceConfig, loaderConfig);
      } else {
        // Handle branch-based documentation (Minecraft Forge)
        return await this._discoverBranchDocs(sourceConfig, loaderConfig);
      }
    } catch (error: any) {
      const httpError = createHttpError(error, sourceConfig.url);
      logger.error(
        { error: httpError.message },
        'Failed to discover loader documentation'
      );
      throw httpError;
    }

    return sources;
  }

  /**
   * Parse loader configuration from source config
   */
  private _parseLoaderConfig(sourceConfig: ISourceConfig): ILoaderDocsConfig {
    // Extract loader type from source config
    const loader = sourceConfig.loader_type as 'fabric' | 'neoforge' | 'forge';
    
    // Determine structure based on loader
    const structure = loader === 'forge' ? 'branch' : 'directory';
    
    // Parse base URL and docs path
    const urlParts = sourceConfig.url.split('/');
    const baseUrl = urlParts.slice(0, urlParts.indexOf('tree') > -1 ? urlParts.indexOf('tree') : urlParts.length).join('/');
    
    return {
      loader,
      structure,
      baseUrl,
      docsPath: sourceConfig.path || '',
      currentVersion: sourceConfig.minecraft_version,
      versions: sourceConfig.versions || []
    };
  }

  /**
   * Discover documentation from directory-based structure (Fabric, NeoForge)
   */
  private async _discoverDirectoryDocs(
    sourceConfig: ISourceConfig,
    loaderConfig: ILoaderDocsConfig
  ) {
    const sources = [];

    try {
      // Discover versions based on loader type
      const versions = await this._discoverVersions(loaderConfig);

      // Create source items for each version
      for (const version of versions) {
        const url = this._buildDocumentationUrl(loaderConfig, version);
        
        // Normalize version for clean directory structure
        const normalizedVersion = this._normalizeVersion(version.minecraftVersion);
        
        const sourceItem = await this.sourceFactory.createSourceItem({
          status: 'discovered',
          url,
          source_type: 'documentation' as SourceType,
          loader_type: loaderConfig.loader as LoaderType,
          title: `${this._capitalize(loaderConfig.loader)} Documentation - ${version.label}`,
          minecraft_version: normalizedVersion,
          checksum: this._generateUrlChecksum(url),
          tags: [
            'documentation',
            'official',
            loaderConfig.loader,
            `mc-${normalizedVersion}`,
            version.isCurrent ? 'current' : 'archived'
          ],
          relevance_score: version.isCurrent ? 1.0 : 0.8,
          priority: version.isCurrent ? 'high' as Priority : 'medium' as Priority,
          metadata: {
            loader: loaderConfig.loader,
            version: normalizedVersion,
            original_version: version.minecraftVersion,
            is_current: version.isCurrent,
            docs_path: version.path,
            structure_type: 'directory'
          },
          processing_hints: {
            skip_distillation: true,
          },
        });

        sources.push(sourceItem);
      }
    } catch (error) {
      logger.error(
        { loader: loaderConfig.loader, error },
        'Failed to discover directory-based documentation'
      );
    }

    return sources;
  }

  /**
   * Discover documentation from branch-based structure (Minecraft Forge)
   */
  private async _discoverBranchDocs(
    sourceConfig: ISourceConfig,
    loaderConfig: ILoaderDocsConfig
  ) {
    const sources = [];

    try {
      // Get all branches from GitHub API
      const branches = await this._getGitHubBranches(loaderConfig);

      // Filter for version branches (e.g., 1.21.x, 1.20.x)
      const versionBranches = branches.filter(branch => 
        /^\d+\.\d+\.x$/.test(branch.name)
      );

      // Sort branches by version (newest first)
      versionBranches.sort((a, b) => {
        const versionA = this._parseVersion(a.name);
        const versionB = this._parseVersion(b.name);
        return versionB - versionA;
      });

      // Limit to maxVersions
      const limitedBranches = versionBranches.slice(0, this.options.maxVersions);

      // Create source items for each branch
      for (let i = 0; i < limitedBranches.length; i++) {
        const branch = limitedBranches[i];
        const isCurrent = i === 0; // First branch is current
        
        const url = `${loaderConfig.baseUrl}/tree/${branch.name}/docs`;
        
        // Normalize version for clean directory structure
        const normalizedVersion = this._normalizeVersion(branch.name);
        
        const sourceItem = await this.sourceFactory.createSourceItem({
          status: 'discovered',
          url,
          source_type: 'documentation' as SourceType,
          loader_type: 'forge' as LoaderType,
          title: `Minecraft Forge Documentation - ${branch.name}`,
          minecraft_version: normalizedVersion,
          checksum: this._generateUrlChecksum(url),
          tags: [
            'documentation',
            'official',
            'forge',
            `mc-${normalizedVersion}`,
            isCurrent ? 'current' : 'archived'
          ],
          relevance_score: isCurrent ? 1.0 : 0.8,
          priority: isCurrent ? 'high' as Priority : 'medium' as Priority,
          metadata: {
            loader: 'forge',
            version: normalizedVersion,
            original_version: branch.name,
            branch_name: branch.name,
            is_current: isCurrent,
            structure_type: 'branch'
          },
          processing_hints: {
            skip_distillation: true,
          },
        });

        sources.push(sourceItem);
      }
    } catch (error) {
      logger.error(
        { loader: loaderConfig.loader, error },
        'Failed to discover branch-based documentation'
      );
    }

    return sources;
  }

  /**
   * Discover available versions for directory-based loaders
   */
  private async _discoverVersions(loaderConfig: ILoaderDocsConfig) {
    const versions = [];

    if (loaderConfig.loader === 'fabric') {
      // Fabric versions - hardcoded based on investigation
      versions.push(
        { 
          minecraftVersion: '1.21.4', 
          label: '1.21.4 (Current)', 
          path: '/develop',
          isCurrent: true 
        },
        { 
          minecraftVersion: '1.21', 
          label: '1.21', 
          path: '/versions/1.21/develop',
          isCurrent: false 
        },
        { 
          minecraftVersion: '1.20.4', 
          label: '1.20.4', 
          path: '/versions/1.20.4/develop',
          isCurrent: false 
        }
      );
    } else if (loaderConfig.loader === 'neoforge') {
      // NeoForge versions - fetch current version dynamically
      try {
        // Get current version dynamically
        const currentVersion = await this._fetchNeoForgeCurrentVersion(loaderConfig);
        
        // Current version is always at /docs
        versions.push({
          minecraftVersion: currentVersion,
          label: `${currentVersion} (Current)`,
          path: '/docs',
          isCurrent: true
        });
        
        // Get archived versions from versions.json
        const versionsUrl = `${loaderConfig.baseUrl.replace('github.com', 'raw.githubusercontent.com')}/main/versions.json`;
        const response = await httpClient.get(versionsUrl, {
          headers: this._getHeaders(),
          timeout: this.options.timeout,
        });

        const versionList = await response.body.json() as string[];
        
        // All versions in versions.json are archived
        for (let i = 0; i < versionList.length && i < (this.options.maxVersions - 1); i++) {
          const version = versionList[i];
          versions.push({
            minecraftVersion: version,
            label: version,
            path: `/versioned_docs/version-${version}`,
            isCurrent: false
          });
        }
      } catch (error) {
        // Final fallback to hardcoded versions if everything fails
        logger.warn('Failed to fetch NeoForge versions dynamically, using complete hardcoded fallback');
        try {
          // Try to get current version one more time
          const fallbackCurrentVersion = await this._fetchNeoForgeCurrentVersion(loaderConfig);
          versions.push({ minecraftVersion: fallbackCurrentVersion, label: `${fallbackCurrentVersion} (Current)`, path: '/docs', isCurrent: true });
        } catch {
          // Ultimate fallback
          versions.push({ minecraftVersion: '1.21.6-1.21.8', label: '1.21.6-1.21.8 (Current)', path: '/docs', isCurrent: true });
        }
        
        // Add known archived versions
        versions.push(
          { minecraftVersion: '1.21.5', label: '1.21.5', path: '/versioned_docs/version-1.21.5', isCurrent: false },
          { minecraftVersion: '1.21.4', label: '1.21.4', path: '/versioned_docs/version-1.21.4', isCurrent: false },
          { minecraftVersion: '1.21.3', label: '1.21.3', path: '/versioned_docs/version-1.21.3', isCurrent: false },
          { minecraftVersion: '1.21.1', label: '1.21.1', path: '/versioned_docs/version-1.21.1', isCurrent: false },
          { minecraftVersion: '1.20.6', label: '1.20.6', path: '/versioned_docs/version-1.20.6', isCurrent: false },
          { minecraftVersion: '1.20.4', label: '1.20.4', path: '/versioned_docs/version-1.20.4', isCurrent: false }
        );
      }
    }

    return versions;
  }

  /**
   * Fetch current NeoForge version dynamically from docs site
   */
  private async _fetchNeoForgeCurrentVersion(loaderConfig: ILoaderDocsConfig): Promise<string> {
    try {
      // Scrape the docs site directly to get the current version
      const docsResponse = await httpClient.get('https://docs.neoforged.net/docs/gettingstarted/', {
        timeout: this.options.timeout,
      });
      
      const docsHtml = await docsResponse.body.text();
      
      // Look for version information in the HTML
      // The version selector or page title should contain the current version
      // Look for patterns like "1.21.6 - 1.21.8" or "1.21.x"
      const versionMatch = docsHtml.match(/1\.\d+\.\d+(?:\s*-\s*1\.\d+\.\d+)?/);
      if (versionMatch) {
        return versionMatch[0];
      }
      
      // Fallback if we can't parse it
      throw new Error('Could not extract current version from docs site');
      
    } catch (error) {
      logger.warn('Failed to fetch NeoForge current version dynamically, using hardcoded fallback');
      // Return a reasonable fallback that will work until manually updated
      return '1.21.6-1.21.8';
    }
  }

  /**
   * Get branches from GitHub repository
   */
  private async _getGitHubBranches(loaderConfig: ILoaderDocsConfig) {
    // Extract owner and repo from base URL
    const urlParts = loaderConfig.baseUrl.split('/');
    const owner = urlParts[3];
    const repo = urlParts[4];
    
    const url = `${this.githubApiBase}/repos/${owner}/${repo}/branches`;
    
    try {
      const response = await httpClient.get(url, {
        headers: this._getHeaders(),
        timeout: this.options.timeout,
      });

      return await response.body.json() as Array<{ name: string }>;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch GitHub branches');
      throw error;
    }
  }

  /**
   * Build documentation URL based on loader config and version
   */
  private _buildDocumentationUrl(loaderConfig: ILoaderDocsConfig, version: any) {
    if (loaderConfig.loader === 'fabric') {
      return `https://github.com/FabricMC/fabric-docs/tree/main${version.path}`;
    } else if (loaderConfig.loader === 'neoforge') {
      return `https://github.com/neoforged/Documentation/tree/main${version.path}`;
    }
    
    return loaderConfig.baseUrl;
  }

  /**
   * Get HTTP headers for requests
   */
  private _getHeaders() {
    const headers: Record<string, string> = {
      'User-Agent': 'porter-bridges/1.0.0',
    };

    if (this.options.githubToken) {
      headers.Authorization = `token ${this.options.githubToken}`;
    }

    return headers;
  }

  /**
   * Generate checksum for URL
   */
  private _generateUrlChecksum(url: string): string {
    return createHash('sha256').update(url).digest('hex');
  }

  /**
   * Capitalize first letter
   */
  private _capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Normalize version strings for clean directory names
   */
  private _normalizeVersion(rawVersion: string): string {
    // "1.21.6-1.21.8" → "1.21.8" (pick highest in range)
    if (rawVersion.includes('-')) {
      const parts = rawVersion.split('-');
      return parts[parts.length - 1].trim();
    }
    
    // "1.21.x" → "1.21" (clean branch name)
    if (rawVersion.endsWith('.x')) {
      return rawVersion.slice(0, -2);
    }
    
    // "1.21.6 - 1.21.8" → "1.21.8" (with spaces)
    if (rawVersion.includes(' - ')) {
      const parts = rawVersion.split(' - ');
      return parts[parts.length - 1].trim();
    }
    
    return rawVersion;
  }

  /**
   * Parse version string to number for comparison
   */
  private _parseVersion(versionStr: string): number {
    const parts = versionStr.replace('.x', '').split('.');
    return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + (parseInt(parts[2]) || 0);
  }
}

export default LoaderDocsDiscovery;