/**
 * @file Version Grouper - Groups sources by Minecraft version
 *
 * This module handles the complex logic for determining Minecraft versions from various
 * source formats and grouping sources by version for organized packaging.
 */

import { logger } from '../../utils/logger';

/**
 * Groups sources by Minecraft version with intelligent version detection
 */
export class VersionGrouper {
  /**
   * Group sources by Minecraft version for PACKAGED_DATA_MODEL structure
   */
  groupSourcesByVersion(sources: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};

    for (const source of sources) {
      const version = this.determineMinecraftVersion(source);
      if (!groups[version]) {
        groups[version] = [];
      }
      groups[version].push(source);
    }

    logger.info('📂 Grouped sources by Minecraft version', {
      totalSources: sources.length,
      versions: Object.keys(groups),
      groupCounts: Object.fromEntries(
        Object.entries(groups).map(([version, sources]) => [version, sources.length])
      ),
    });

    return groups;
  }

  /**
   * Determine the best Minecraft version for a source with fallback logic
   */
  determineMinecraftVersion(source: any): string {
    // 1. Try to get version from distilled content if available
    if (
      source.distilled_minecraft_version &&
      this.isValidMinecraftVersion(source.distilled_minecraft_version)
    ) {
      return source.distilled_minecraft_version;
    }

    // 2. Use the original minecraft_version from discovery
    if (source.minecraft_version && this.isValidMinecraftVersion(source.minecraft_version)) {
      return source.minecraft_version;
    }

    // 3. Try to extract version from URL patterns (primers, etc.)
    const urlVersion = this.extractVersionFromUrl(source.url);
    if (urlVersion && this.isValidMinecraftVersion(urlVersion)) {
      return urlVersion;
    }

    // 4. Last resort: extract from title if available
    if (source.title) {
      const titleVersion = this.extractVersionFromText(source.title);
      if (titleVersion && this.isValidMinecraftVersion(titleVersion)) {
        return titleVersion;
      }
    }

    // 5. Absolute fallback
    return 'unknown';
  }

  /**
   * Check if a version string is a valid Minecraft version
   */
  isValidMinecraftVersion(version: any): boolean {
    if (!version || typeof version !== 'string') {
      return false;
    }
    // Match pattern like 1.21, 1.21.1, 1.20.6, etc.
    return /^1\.\d+(?:\.\d+)?$/.test(version);
  }

  /**
   * Extract version from URL patterns
   */
  extractVersionFromUrl(url: string): string | null {
    // Handle primer URLs like: primers/1_21_1/index.md
    const primerMatch = url.match(/primers\/(\d+)_(\d+)(?:_(\d+))?/);
    if (primerMatch) {
      const [, major, minor, patch] = primerMatch;
      return patch ? `${major}.${minor}.${patch}` : `${major}.${minor}`;
    }

    // Handle other version patterns in URLs
    const versionMatch = url.match(/\b1[._](\d+)(?:[._](\d+))?\b/);
    if (versionMatch) {
      const [, minor, patch] = versionMatch;
      return patch ? `1.${minor}.${patch}` : `1.${minor}`;
    }

    return null;
  }

  /**
   * Extract version from text content
   */
  extractVersionFromText(text: string): string | null {
    if (!text) return null;

    const matches = text.match(/\b1\.\d+(?:\.\d+)?\b/);
    return matches ? matches[0] : null;
  }

  /**
   * Update source with detected Minecraft version from distilled data
   */
  updateSourceWithDistilledVersion(source: any, distilledData: any): void {
    // Extract minecraft_version from distilled data if available
    if (
      distilledData.minecraft_version &&
      this.isValidMinecraftVersion(distilledData.minecraft_version)
    ) {
      source.distilled_minecraft_version = distilledData.minecraft_version;
    }
  }

  /**
   * Get version statistics for logging
   */
  getVersionStatistics(groups: Record<string, any[]>): any {
    const stats = {
      total_versions: Object.keys(groups).length,
      total_sources: Object.values(groups).reduce((sum, sources) => sum + sources.length, 0),
      version_breakdown: {} as Record<string, number>,
      has_unknown: 'unknown' in groups,
      unknown_count: groups.unknown?.length || 0,
    };

    for (const [version, sources] of Object.entries(groups)) {
      stats.version_breakdown[version] = sources.length;
    }

    return stats;
  }
}