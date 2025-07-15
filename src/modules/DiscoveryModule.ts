/**
 * @file Discovery Module - Automatically discovers and catalogs mod porting information sources
 *
 * This module is responsible for finding and tracking sources of mod porting information across
 * the Minecraft ecosystem. It scans GitHub repositories, RSS feeds, and other known sources to
 * build a comprehensive catalog of available content. The module uses the SourceItemSchema to
 * track discovery progress and maintains a registry of known sources.
 *
 * Key responsibilities:
 * - Discover NeoForged primers from GitHub
 * - Monitor Fabric and NeoForge blog RSS feeds
 * - Track version-specific content availability
 * - Detect new sources and content updates
 * - Maintain source registry with metadata
 */

import { DiscoveryCore } from './discovery/DiscoveryCore';

/**
 * Main Discovery Module class - wrapper for backward compatibility
 */
export class DiscoveryModule {
  core: DiscoveryCore;
  
  constructor(options = {}) {
    this.core = new DiscoveryCore(options);
  }

  /**
   * Main discovery entry point - discovers all sources
   */
  discover() {
    return this.core.discover();
  }

  /**
   * Get discovered sources by criteria
   */
  getSourcesByCriteria(criteria = {}) {
    return this.core.getSourcesByCriteria(criteria);
  }

  /**
   * Export discovered sources to JSON
   */
  exportDiscoveredSources() {
    return this.core.exportDiscoveredSources();
  }
}

export default DiscoveryModule;
