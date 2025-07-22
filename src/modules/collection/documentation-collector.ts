/**
 * @file Documentation Collector - Collects entire documentation corpus using git
 *
 * This module handles collection of documentation from mod loader repositories using
 * simple-git for efficient sparse checkout. It downloads entire documentation trees
 * while preserving directory structure for inclusion in final Bridge Bundles.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import simpleGit from 'simple-git';
import type { PipelineSourceType } from '../../types/pipeline';
import { logger } from '../../utils/logger';

export interface IDocumentationCollectorOptions {
  timeout: number;
  maxRetries: number;
  tempDir?: string;
}

export interface IRepoInfo {
  owner: string;
  repo: string;
  branch?: string;
  path: string;
}

export interface ICollectionResult {
  source: PipelineSourceType;
  targetPath: string;
  fileCount: number;
  totalSize: number;
}

/**
 * Documentation collector using simple-git for repository cloning
 */
export class DocumentationCollector {
  private options: IDocumentationCollectorOptions;

  constructor(options: Partial<IDocumentationCollectorOptions> = {}) {
    this.options = {
      timeout: options.timeout || 120_000, // 2 minutes for git operations
      maxRetries: options.maxRetries || 3,
      tempDir: options.tempDir || tmpdir(),
    };
  }

  /**
   * Collect documentation from a repository source
   */
  async collect(source: PipelineSourceType): Promise<ICollectionResult> {
    logger.info(`📚 Collecting documentation corpus: ${source.url}`);
    
    try {
      // Parse GitHub URL to extract repository information
      const repoInfo = this._parseGitHubUrl(source.url);
      
      // Normalize version for clean directory structure
      const normalizedVersion = this._normalizeVersion(source.minecraft_version || 'unknown');
      
      // Build target path: docs/[loader]/[version]/
      const targetPath = this._buildTargetPath(
        source.loader_type,
        normalizedVersion
      );
      
      // Collect repository content
      const { fileCount, totalSize } = await this._collectRepository(
        repoInfo,
        targetPath
      );
      
      // Update source metadata
      source.status = 'collected';
      source.collected_at = new Date().toISOString();
      source.collection_metadata = {
        collection_type: 'documentation_corpus',
        target_path: targetPath,
        file_count: fileCount,
        total_size_bytes: totalSize,
        collection_method: 'git_sparse_checkout',
        final_url: source.url,
      };
      
      logger.info(`✅ Documentation collection complete: ${fileCount} files, ${Math.round(totalSize / 1024)}KB`);
      
      return {
        source,
        targetPath,
        fileCount,
        totalSize,
      };
      
    } catch (error: any) {
      source.status = 'failed';
      source.error = {
        code: 'documentation_collection_failed',
        message: error.message,
        timestamp: new Date().toISOString(),
        retry_count: 0,
      };
      
      logger.error(`❌ Documentation collection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Collect repository content using git sparse checkout
   */
  private async _collectRepository(
    repoInfo: IRepoInfo,
    targetPath: string
  ): Promise<{ fileCount: number; totalSize: number }> {
    const tempDir = await this._createTempDir();
    
    try {
      // Create fresh git instance for this operation
      const git = simpleGit();
      
      // Build repository URL
      const repoUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}.git`;
      
      logger.debug(`Cloning repository: ${repoUrl}`);
      
      // Clone with no checkout
      const cloneOptions = ['--no-checkout', '--depth', '1'];
      if (repoInfo.branch) {
        cloneOptions.push('--branch', repoInfo.branch, '--single-branch');
      }
      
      await git.clone(repoUrl, tempDir, cloneOptions);
      
      // Set working directory and configure sparse checkout
      await git.cwd(tempDir);
      await git.raw(['sparse-checkout', 'init', '--cone']);
      await git.raw(['sparse-checkout', 'set', repoInfo.path]);
      
      // Checkout to populate working directory
      await git.checkout();
      
      // Verify the sparse checkout worked
      const sourcePath = path.join(tempDir, repoInfo.path);
      const sourceExists = await fs.access(sourcePath).then(() => true).catch(() => false);
      
      if (!sourceExists) {
        throw new Error(`Sparse checkout failed: ${repoInfo.path} not found in repository`);
      }
      
      // Copy documentation files to target
      await fs.mkdir(targetPath, { recursive: true });
      const { fileCount, totalSize } = await this._copyDirectory(sourcePath, targetPath);
      
      logger.debug(`Copied ${fileCount} files (${Math.round(totalSize / 1024)}KB) to ${targetPath}`);
      
      return { fileCount, totalSize };
      
    } finally {
      // Clean up temporary directory
      await this._cleanup(tempDir);
    }
  }

  /**
   * Parse GitHub URL to extract repository information
   */
  private _parseGitHubUrl(url: string): IRepoInfo {
    // Expected formats:
    // https://github.com/FabricMC/fabric-docs/tree/main/develop
    // https://github.com/neoforged/Documentation/tree/main/docs  
    // https://github.com/MinecraftForge/Documentation/tree/1.21.x/docs
    
    const urlPattern = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/;
    const match = url.match(urlPattern);
    
    if (!match) {
      throw new Error(`Invalid GitHub URL format: ${url}`);
    }
    
    const [, owner, repo, branch, path] = match;
    
    return {
      owner,
      repo,
      branch: branch === 'main' ? undefined : branch, // Don't specify branch for main
      path,
    };
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
   * Build target path for documentation
   */
  private _buildTargetPath(loaderType: string, version: string): string {
    // Ensure we have a base directory for collections
    const baseDir = process.env.PORTER_BRIDGES_DOCS_DIR || './generated/collected-docs';
    return path.join(baseDir, 'docs', loaderType, version);
  }

  /**
   * Copy directory recursively and track file statistics
   */
  private async _copyDirectory(
    source: string,
    target: string
  ): Promise<{ fileCount: number; totalSize: number }> {
    let fileCount = 0;
    let totalSize = 0;
    
    const copyRecursive = async (src: string, dest: string) => {
      const stats = await fs.stat(src);
      
      if (stats.isDirectory()) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src);
        
        for (const entry of entries) {
          await copyRecursive(
            path.join(src, entry),
            path.join(dest, entry)
          );
        }
      } else {
        await fs.copyFile(src, dest);
        fileCount++;
        totalSize += stats.size;
      }
    };
    
    await copyRecursive(source, target);
    return { fileCount, totalSize };
  }

  /**
   * Create temporary directory for git operations
   */
  private async _createTempDir(): Promise<string> {
    const tempDir = path.join(
      this.options.tempDir!,
      `porter-bridges-docs-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * Clean up temporary directory
   */
  private async _cleanup(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.debug(`Cleaned up temporary directory: ${tempDir}`);
    } catch (error: any) {
      logger.warn(`Failed to cleanup temporary directory: ${error.message}`);
    }
  }
}

export default DocumentationCollector;