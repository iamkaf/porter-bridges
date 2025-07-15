/**
 * @file Source Configurations - Known source configurations
 *
 * This module defines the known source configurations for different
 * types of discovery sources (GitHub, RSS feeds, etc.).
 */

export interface ISourceConfig {
  type: string;
  url: string;
  source_type: string;
  loader_type: string;
  description: string;
  title?: string;
  minecraft_version?: string;
  distilled_minecraft_version?: string;
};

export interface ISourceConfigs {
  [x: string]: ISourceConfig;
}

/**
 * Source configurations class
 */
export class SourceConfigs {
  sourceConfigs: ISourceConfigs;

  constructor() {
    this.sourceConfigs = {
      neoforged_primers: {
        type: 'github_directory',
        url: 'https://api.github.com/repos/neoforged/.github/contents/primers',
        source_type: 'primer',
        loader_type: 'vanilla', // Primers are for vanilla Minecraft, not NeoForge-specific
        description: 'Vanilla Minecraft version primers hosted by NeoForged GitHub repository',
      },
      fabric_blog: {
        type: 'rss_feed',
        url: 'https://fabricmc.net/feed.xml',
        source_type: 'blog_post',
        loader_type: 'fabric',
        description: 'Fabric official blog posts and announcements',
      },
      neoforge_blog: {
        type: 'rss_feed',
        url: 'https://neoforged.net/index.xml',
        source_type: 'blog_post',
        loader_type: 'neoforge',
        description: 'NeoForge official blog posts and announcements',
      },
      fabric_changelog: {
        type: 'github_releases',
        url: 'https://api.github.com/repos/FabricMC/fabric/releases',
        source_type: 'changelog',
        loader_type: 'fabric',
        description: 'Fabric Loader changelog and release notes',
      },
      neoforge_changelog: {
        type: 'maven_repository',
        url: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/',
        source_type: 'changelog',
        loader_type: 'neoforge',
        description: 'NeoForge changelog from Maven repository',
      },
      minecraftforge_changelog: {
        type: 'maven_repository',
        url: 'https://maven.minecraftforge.net/net/minecraftforge/forge/',
        source_type: 'changelog',
        loader_type: 'forge',
        description: 'Minecraft Forge changelog from Maven repository',
      },
      eventbus_migration_guide: {
        type: 'direct_url',
        url: 'https://gist.github.com/PaintNinja/ad82c224aecee25efac1ea3e2cf19b91',
        source_type: 'guide',
        loader_type: 'forge',
        description: 'EventBus 7 migration guide for MinecraftForge',
      },
    };
  }

  /**
   * Get all source configurations
   */
  getConfigs() {
    return this.sourceConfigs;
  }

  /**
   * Get specific source configuration
   */
  getConfig(sourceId: keyof ISourceConfigs) {
    return this.sourceConfigs[sourceId];
  }

  /**
   * Add new source configuration
   */
  addConfig(sourceId: keyof ISourceConfigs, config: ISourceConfig) {
    this.sourceConfigs[sourceId] = config;
  }
}

export default SourceConfigs;
