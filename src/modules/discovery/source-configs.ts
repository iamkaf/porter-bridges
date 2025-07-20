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
  // Discord-specific configuration
  guild_id?: string;
  channel_id?: string;
  bot_token?: string;
  webhook_url?: string;
  message_filters?: {
    keywords?: string[];
    exclude_keywords?: string[];
    user_ids?: string[];
    min_length?: number;
    max_age_days?: number;
  };
  // Video-specific configuration
  youtubeApiKey?: string;
  maxVideoResults?: number;
  minVideoDuration?: number;
  maxVideoDuration?: number;
  // Dynamic discovery configuration
  githubToken?: string;
  trendingAnalysisPeriod?: 'daily' | 'weekly' | 'monthly';
  maxTrendingRepos?: number;
  // Community submission configuration
  submissionsDir?: string;
  maxSubmissionsPerUser?: number;
}

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
        description:
          'Vanilla Minecraft version primers hosted by NeoForged GitHub repository',
      },
      fabric_blog: {
        type: 'github_repo',
        owner: 'FabricMC',
        repo: 'fabricmc.net',
        path: '_posts',
        glob: '*.md',
        source_type: 'blog_post',
        loader_type: 'fabric',
        description: 'Fabric official blog posts and announcements',
      },
      neoforge_blog: {
        type: 'github_repo',
        owner: 'neoforged',
        repo: 'websites',
        path: 'content/news',
        glob: '*.md',
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
        description: 'EventBus 7 migration guide for MinecraftForge 1.21.7',
      },
      // Discord-based discovery
      fabric_discord_announcements: {
        type: 'discord_channel',
        url: 'https://discord.com/channels/507304429255393322/507982666755670019',
        source_type: 'changelog',
        loader_type: 'fabric',
        description: 'Fabric Discord announcements channel',
        guild_id: '507304429255393322',
        channel_id: '507982666755670019',
        message_filters: {
          keywords: ['release', 'update', 'version', 'changelog'],
          min_length: 50,
          max_age_days: 30,
        },
      },
      neoforge_discord_releases: {
        type: 'discord_channel',
        url: 'https://discord.com/channels/313125603924639766/313125603924639766',
        source_type: 'changelog',
        loader_type: 'neoforge',
        description: 'NeoForge Discord releases channel',
        guild_id: '313125603924639766',
        channel_id: '313125603924639766',
        message_filters: {
          keywords: ['release', 'neoforge', 'minecraft'],
          min_length: 30,
          max_age_days: 60,
        },
      },
      // Video-based discovery
      minecraft_modding_tutorials: {
        type: 'video_discovery',
        url: 'https://www.youtube.com/results?search_query=minecraft+modding+tutorial',
        source_type: 'guide',
        loader_type: 'vanilla',
        description: 'YouTube tutorials for Minecraft modding',
        maxVideoResults: 20,
        minVideoDuration: 300,
        maxVideoDuration: 3600,
      },
      // Dynamic discovery
      github_trending_modding: {
        type: 'dynamic_discovery',
        url: 'https://github.com/trending',
        source_type: 'guide',
        loader_type: 'vanilla',
        description:
          'Dynamic discovery of trending Minecraft modding repositories',
        maxTrendingRepos: 50,
        trendingAnalysisPeriod: 'weekly',
      },
      // Community submissions
      community_submitted_sources: {
        type: 'community_discovery',
        url: 'community://submissions',
        source_type: 'guide',
        loader_type: 'vanilla',
        description: 'Community-submitted modding sources',
        submissionsDir: './generated/community-submissions',
        maxSubmissionsPerUser: 10,
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
