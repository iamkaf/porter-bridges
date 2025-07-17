/**
 * @file Advanced Discovery Demo - Demonstration CLI for Phase 2.1 features
 *
 * This CLI command demonstrates all the Phase 2.1 Advanced Source Discovery features:
 * - ML-based content analysis
 * - Discord integration
 * - Community submission system
 * - Dynamic source discovery
 * - Video content analysis
 */

import { Command } from 'commander';
import { logger } from '../utils/logger';
import { MLContentAnalyzer } from '../utils/ml-content-analyzer';
import { DiscordDiscovery } from '../modules/discovery/discord-discovery';
import { VideoDiscovery } from '../modules/discovery/video-discovery';
import { DynamicDiscovery } from '../modules/discovery/dynamic-discovery';
import { CommunityDiscovery } from '../modules/discovery/community-discovery';
import { DiscoveryCore } from '../modules/discovery/discovery-core';

/**
 * Advanced Discovery Demo Command
 */
export class AdvancedDiscoveryDemoCommand {
  private command: Command;

  constructor() {
    this.command = new Command('advanced-discovery-demo')
      .description('Demonstrate Phase 2.1 Advanced Source Discovery features')
      .option('--feature <feature>', 'Specific feature to demo (ml, discord, video, dynamic, community, all)', 'all')
      .option('--github-token <token>', 'GitHub token for dynamic discovery')
      .option('--youtube-api-key <key>', 'YouTube API key for video discovery')
      .option('--discord-bot-token <token>', 'Discord bot token for Discord discovery')
      .option('--verbose', 'Enable verbose logging', false)
      .action(this.execute.bind(this));
  }

  getCommand(): Command {
    return this.command;
  }

  private async execute(options: any): Promise<void> {
    logger.info('🚀 Starting Advanced Discovery Demo');
    
    if (options.verbose) {
      // Enable verbose logging if supported
      console.log('Verbose logging enabled');
    }

    const feature = options.feature.toLowerCase();

    try {
      switch (feature) {
        case 'ml':
          await this.demoMLAnalysis();
          break;
        case 'discord':
          await this.demoDiscordDiscovery(options.discordBotToken);
          break;
        case 'video':
          await this.demoVideoDiscovery(options.youtubeApiKey);
          break;
        case 'dynamic':
          await this.demoDynamicDiscovery(options.githubToken);
          break;
        case 'community':
          await this.demoCommunityDiscovery();
          break;
        case 'all':
          await this.demoAllFeatures(options);
          break;
        default:
          logger.error(`Unknown feature: ${feature}`);
          process.exit(1);
      }

      logger.info('✅ Demo completed successfully!');
    } catch (error) {
      logger.error('❌ Demo failed:', error);
      process.exit(1);
    }
  }

  /**
   * Demonstrate ML-based content analysis
   */
  private async demoMLAnalysis(): Promise<void> {
    logger.info('🧠 ML-Based Content Analysis Demo');
    logger.info('=====================================');

    const analyzer = new MLContentAnalyzer();

    // Sample content for analysis
    const testContents = [
      {
        id: 'guide-1',
        title: 'Minecraft 1.21 NeoForge Migration Guide',
        content: `
          This comprehensive guide covers all the breaking changes when migrating from Minecraft 1.20 to 1.21 with NeoForge.

          Key changes include:
          - New block registration API
          - Entity system refactoring
          - Deprecated ItemStack methods
          - Changes to world generation
          - New event system architecture

          The migration process involves updating your mod's dependencies, refactoring deprecated code, and adapting to the new APIs.
        `,
        source_type: 'guide',
        minecraft_version: '1.21',
        loader_type: 'neoforge'
      },
      {
        id: 'tutorial-1',
        title: 'How to Create Your First Fabric Mod',
        content: `
          Step-by-step tutorial for creating your first Minecraft mod using Fabric.

          In this tutorial, you'll learn:
          - Setting up your development environment
          - Creating a basic mod structure
          - Adding items and blocks
          - Implementing recipes
          - Testing your mod

          Perfect for beginners who want to get started with Minecraft modding.
        `,
        source_type: 'guide',
        minecraft_version: '1.21',
        loader_type: 'fabric'
      },
      {
        id: 'irrelevant-1',
        title: 'Chocolate Cake Recipe',
        content: `
          Here's how to make a delicious chocolate cake for your next birthday party.

          Ingredients:
          - 2 cups flour
          - 1.5 cups sugar
          - 3/4 cup cocoa powder
          - 2 eggs
          - 1 cup milk

          Mix all ingredients and bake at 350°F for 30 minutes.
        `,
        source_type: 'blog_post',
        minecraft_version: undefined,
        loader_type: undefined
      }
    ];

    for (const content of testContents) {
      logger.info(`\n📄 Analyzing: ${content.title}`);
      logger.info('-'.repeat(50));

      const analysis = await analyzer.analyzeContent(content);

      logger.info(`🎯 Relevance Score: ${analysis.relevance_score.toFixed(2)}`);
      logger.info(`🔍 Confidence: ${analysis.confidence.toFixed(2)}`);
      logger.info(`📝 Content Type: ${analysis.content_type}`);
      logger.info(`💥 Breaking Changes Likelihood: ${analysis.breaking_changes_likelihood.toFixed(2)}`);
      logger.info(`📊 Complexity Score: ${analysis.complexity_score.toFixed(2)}`);
      logger.info(`😊 Sentiment: ${analysis.sentiment}`);
      logger.info(`🏷️ Keywords: ${analysis.keywords.slice(0, 5).join(', ')}`);
      logger.info(`📌 Topics: ${analysis.topics.slice(0, 3).join(', ')}`);
      logger.info(`🎮 Versions: ${analysis.version_mentions.join(', ')}`);
      logger.info(`🔗 Tags: ${analysis.tags.slice(0, 5).join(', ')}`);
      
      if (analysis.similar_content_ids.length > 0) {
        logger.info(`🔄 Similar Content: ${analysis.similar_content_ids.join(', ')}`);
      }
    }
  }

  /**
   * Demonstrate Discord discovery
   */
  private async demoDiscordDiscovery(botToken?: string): Promise<void> {
    logger.info('💬 Discord Discovery Demo');
    logger.info('==========================');

    if (!botToken) {
      logger.warn('⚠️ Discord bot token not provided. Skipping Discord discovery demo.');
      logger.info('To test Discord discovery, provide a bot token with --discord-bot-token');
      return;
    }

    const discovery = new DiscordDiscovery({
      timeout: 10000,
      maxMessages: 10
    });

    // Test Discord API connection
    logger.info('🔌 Testing Discord API connection...');
    const connectionTest = await discovery.testConnection(botToken);
    
    if (!connectionTest) {
      logger.error('❌ Discord API connection failed');
      return;
    }

    logger.info('✅ Discord API connection successful');

    // Example Discord channel configurations
    const discordConfigs = [
      {
        name: 'Fabric Announcements',
        config: {
          type: 'discord_channel',
          url: 'https://discord.com/channels/507304429255393322/507982666755670019',
          source_type: 'changelog',
          loader_type: 'fabric',
          description: 'Fabric Discord announcements channel',
          guild_id: '507304429255393322',
          channel_id: '507982666755670019',
          bot_token: botToken,
          message_filters: {
            keywords: ['release', 'update', 'version', 'changelog'],
            min_length: 50,
            max_age_days: 30
          }
        }
      }
    ];

    for (const { name, config } of discordConfigs) {
      logger.info(`\n📢 Testing ${name}...`);
      
      try {
        const discoveredSources = new Map();
        await discovery.discoverFromDiscordChannel(
          name.toLowerCase().replace(/\s+/g, '_'),
          config as any,
          discoveredSources
        );

        logger.info(`✅ Discovered ${discoveredSources.size} sources from ${name}`);
        
        // Show sample of discovered sources
        let count = 0;
        for (const [url, source] of discoveredSources) {
          if (count >= 3) break;
          logger.info(`   📄 ${source.title?.substring(0, 60)}...`);
          count++;
        }
      } catch (error) {
        logger.warn(`⚠️ Failed to discover from ${name}:`, error);
      }
    }
  }

  /**
   * Demonstrate video discovery
   */
  private async demoVideoDiscovery(youtubeApiKey?: string): Promise<void> {
    logger.info('🎥 Video Discovery Demo');
    logger.info('=======================');

    if (!youtubeApiKey) {
      logger.warn('⚠️ YouTube API key not provided. Skipping video discovery demo.');
      logger.info('To test video discovery, provide an API key with --youtube-api-key');
      return;
    }

    const discovery = new VideoDiscovery({
      youtubeApiKey,
      maxVideoResults: 5,
      minVideoDuration: 300,
      maxVideoDuration: 1800,
      enableSubtitleDownload: false // Disable for demo
    });

    const videoConfig = {
      type: 'video_discovery',
      url: 'https://www.youtube.com/results?search_query=minecraft+modding+tutorial',
      source_type: 'guide',
      loader_type: 'vanilla',
      description: 'YouTube modding tutorials'
    };

    logger.info('🔍 Searching for Minecraft modding tutorials...');

    try {
      const discoveredSources = new Map();
      await discovery.discoverFromVideos(
        'minecraft_tutorials',
        videoConfig,
        discoveredSources
      );

      logger.info(`✅ Discovered ${discoveredSources.size} video sources`);

      // Show details of discovered videos
      for (const [url, source] of discoveredSources) {
        logger.info(`\n📹 Video: ${source.title}`);
        logger.info(`   🔗 URL: ${url}`);
        logger.info(`   🎯 Relevance: ${source.relevance_score?.toFixed(2) || 'N/A'}`);
        logger.info(`   🏷️ Tags: ${source.tags?.join(', ') || 'None'}`);
        logger.info(`   📊 Priority: ${source.priority || 'medium'}`);
        
        if (source.metadata) {
          logger.info(`   👀 Views: ${source.metadata.view_count || 'N/A'}`);
          logger.info(`   ⏱️ Duration: ${source.metadata.duration || 'N/A'}s`);
          logger.info(`   📺 Channel: ${source.metadata.channel_name || 'N/A'}`);
        }
      }
    } catch (error) {
      logger.error('❌ Video discovery failed:', error);
    }
  }

  /**
   * Demonstrate dynamic discovery
   */
  private async demoDynamicDiscovery(githubToken?: string): Promise<void> {
    logger.info('🔄 Dynamic Discovery Demo');
    logger.info('==========================');

    const discovery = new DynamicDiscovery({
      githubToken,
      maxTrendingRepos: 10,
      trendingAnalysisPeriod: 'weekly',
      enableActivityAnalysis: true,
      enableTopicAnalysis: true,
      enableCommunityTracking: true
    });

    const dynamicConfig = {
      type: 'dynamic_discovery',
      url: 'https://github.com/trending',
      source_type: 'guide',
      loader_type: 'vanilla',
      description: 'GitHub trending repositories analysis'
    };

    logger.info('📈 Analyzing GitHub trending repositories...');

    try {
      const discoveredSources = new Map();
      const insights = await discovery.discoverDynamicSources(
        'github_trending',
        dynamicConfig,
        discoveredSources
      );

      logger.info(`✅ Generated ${insights.length} discovery insights`);
      logger.info(`📊 Discovered ${discoveredSources.size} potential sources`);

      // Show top insights
      const topInsights = insights
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);

      for (const insight of topInsights) {
        logger.info(`\n🔍 Insight: ${insight.type}`);
        logger.info(`   🎯 Confidence: ${insight.confidence.toFixed(2)}`);
        logger.info(`   📊 Relevance: ${insight.relevance_score.toFixed(2)}`);
        logger.info(`   💡 Reason: ${insight.discovery_reason}`);
        logger.info(`   🔗 Sources: ${insight.potential_sources.length}`);
        logger.info(`   📋 Actions: ${insight.recommended_actions.slice(0, 2).join(', ')}`);
      }
    } catch (error) {
      logger.error('❌ Dynamic discovery failed:', error);
    }
  }

  /**
   * Demonstrate community discovery
   */
  private async demoCommunityDiscovery(): Promise<void> {
    logger.info('👥 Community Discovery Demo');
    logger.info('============================');

    const discovery = new CommunityDiscovery({
      submissionsDir: './demo-submissions',
      maxSubmissionsPerUser: 5,
      autoApproveThreshold: 0.8,
      enableCommunityVoting: true,
      minVotesForApproval: 2
    });

    await discovery.initialize();

    // Demo submission
    logger.info('📝 Submitting demo community source...');

    const demoSubmission = {
      url: 'https://example.com/minecraft-1.21-modding-guide',
      title: 'Complete Minecraft 1.21 Modding Guide',
      description: 'A comprehensive guide covering all aspects of Minecraft 1.21 modding with practical examples and best practices.',
      source_type: 'guide',
      loader_type: 'neoforge',
      minecraft_version: '1.21',
      tags: ['tutorial', 'neoforge', '1.21', 'comprehensive'],
      category: 'tutorial',
      submitter: {
        username: 'demo_user',
        email: 'demo@example.com',
        github_username: 'demo_user'
      }
    };

    // Mock fetch for demo
    global.fetch = (() => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('Demo content for validation')
    })) as any;

    try {
      const result = await discovery.submitSource(demoSubmission);
      
      logger.info(`✅ Submission result: ${result.success ? 'Success' : 'Failed'}`);
      logger.info(`📄 Message: ${result.message}`);
      
      if (result.submissionId) {
        logger.info(`🆔 Submission ID: ${result.submissionId}`);
      }
    } catch (error) {
      logger.error('❌ Community submission failed:', error);
    }

    // Demo contributor stats
    logger.info('\n📊 Contributor Statistics:');
    const stats = await discovery.getContributorStats('demo_user');
    
    logger.info(`   📝 Total Submissions: ${stats.total_submissions}`);
    logger.info(`   ✅ Approved: ${stats.approved_submissions}`);
    logger.info(`   ❌ Rejected: ${stats.rejected_submissions}`);
    logger.info(`   ⏳ Pending: ${stats.pending_submissions}`);
    logger.info(`   ⭐ Reputation: ${stats.reputation_score}`);
    logger.info(`   🏆 Badges: ${stats.badges.join(', ') || 'None'}`);

    // Demo approved sources
    logger.info('\n📚 Approved Community Sources:');
    const approvedSources = await discovery.getApprovedSources();
    
    if (approvedSources.length === 0) {
      logger.info('   No approved sources yet');
    } else {
      for (const source of approvedSources.slice(0, 3)) {
        logger.info(`   📄 ${source.title}`);
        logger.info(`      🔗 ${source.url}`);
        logger.info(`      🎯 Relevance: ${source.relevance_score?.toFixed(2) || 'N/A'}`);
      }
    }
  }

  /**
   * Demonstrate all features together
   */
  private async demoAllFeatures(options: any): Promise<void> {
    logger.info('🌟 Complete Advanced Discovery Demo');
    logger.info('====================================');

    // Run all demos
    await this.demoMLAnalysis();
    logger.info('\n' + '='.repeat(60) + '\n');
    
    await this.demoDiscordDiscovery(options.discordBotToken);
    logger.info('\n' + '='.repeat(60) + '\n');
    
    await this.demoVideoDiscovery(options.youtubeApiKey);
    logger.info('\n' + '='.repeat(60) + '\n');
    
    await this.demoDynamicDiscovery(options.githubToken);
    logger.info('\n' + '='.repeat(60) + '\n');
    
    await this.demoCommunityDiscovery();
    logger.info('\n' + '='.repeat(60) + '\n');

    // Integration test - run full discovery with all features
    logger.info('🔗 Integration Test: Full Discovery Pipeline');
    logger.info('============================================');

    const discoveryCore = new DiscoveryCore({
      cacheDirectory: './demo-cache',
      timeout: 10000,
      retryAttempts: 1,
      githubToken: options.githubToken,
      youtubeApiKey: options.youtubeApiKey,
      maxVideoResults: 3,
      maxTrendingRepos: 5
    });

    try {
      const results = await discoveryCore.discover();
      
      logger.info('✅ Full discovery completed!');
      logger.info(`📊 Total sources discovered: ${results.stats.total_discovered}`);
      logger.info(`⏱️ Discovery time: ${Date.now() - new Date(results.stats.discovery_start_time).getTime()}ms`);
      logger.info(`🎯 Success rate: ${((results.stats.total_discovered / (results.stats.total_discovered + results.stats.failed_discoveries)) * 100).toFixed(1)}%`);
      
      // Show distribution by source type
      logger.info('\n📈 Sources by Type:');
      const sourceTypes = Object.values(results.sources).reduce((acc: any, source: any) => {
        acc[source.source_type] = (acc[source.source_type] || 0) + 1;
        return acc;
      }, {});
      
      for (const [type, count] of Object.entries(sourceTypes)) {
        logger.info(`   ${type}: ${count}`);
      }
      
      // Show sample of discovered sources
      logger.info('\n📚 Sample Discovered Sources:');
      const sampleSources = Object.values(results.sources).slice(0, 5);
      for (const source of sampleSources) {
        logger.info(`   📄 ${source.title || 'Untitled'}`);
        logger.info(`      🔗 ${source.url}`);
        logger.info(`      📝 Type: ${source.source_type}`);
        logger.info(`      🎯 Relevance: ${source.relevance_score?.toFixed(2) || 'N/A'}`);
        logger.info(`      📊 Priority: ${source.priority || 'medium'}`);
      }
    } catch (error) {
      logger.error('❌ Full discovery failed:', error);
    }
  }
}

// Mock global fetch for demo purposes
declare global {
  var fetch: any;
}

export default AdvancedDiscoveryDemoCommand;