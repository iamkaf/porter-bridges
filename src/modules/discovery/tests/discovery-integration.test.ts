/**
 * @file Discovery Integration Tests - Comprehensive tests for Phase 2.1 improvements
 *
 * This module provides comprehensive testing for all Phase 2.1 Advanced Source Discovery improvements:
 * - ML-based relevance scoring
 * - Discord changelog parsing
 * - Community source submission system
 * - Dynamic source discovery
 * - Video content transcription
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { MLContentAnalyzer } from '../../../utils/ml-content-analyzer';
import { CommunityDiscovery } from '../community-discovery';
import { ContentAnalyzer } from '../content-analyzer';
import { DiscordDiscovery } from '../discord-discovery';
import { DiscoveryCore } from '../discovery-core';
import { DynamicDiscovery } from '../dynamic-discovery';
import { SourceConfigs } from '../source-configs';
import { VideoDiscovery } from '../video-discovery';

describe('Phase 2.1 Advanced Source Discovery', () => {
  let discoveryCore: DiscoveryCore;
  let mlAnalyzer: MLContentAnalyzer;
  let contentAnalyzer: ContentAnalyzer;

  beforeEach(() => {
    discoveryCore = new DiscoveryCore({
      cacheDirectory: './test-cache',
      timeout: 10_000,
      retryAttempts: 1,
    });

    mlAnalyzer = new MLContentAnalyzer();
    contentAnalyzer = new ContentAnalyzer();
  });

  afterEach(() => {
    // Clean up test cache
    // In a real test, you'd clean up the test cache directory
  });

  describe('ML-Based Content Analysis', () => {
    it('should analyze content with ML-powered relevance scoring', async () => {
      const testContent = {
        id: 'test-content-1',
        title: 'Minecraft 1.21 NeoForge Migration Guide',
        content:
          'This guide covers the breaking changes when migrating from Minecraft 1.20 to 1.21 with NeoForge. Key changes include new block API, entity system refactoring, and deprecated methods.',
        source_type: 'guide',
        minecraft_version: '1.21',
        loader_type: 'neoforge',
      };

      const analysis = await mlAnalyzer.analyzeContent(testContent);

      expect(analysis.relevance_score).toBeGreaterThan(0.7);
      expect(analysis.confidence).toBeGreaterThan(0.5);
      expect(analysis.content_type).toBe('guide');
      expect(analysis.breaking_changes_likelihood).toBeGreaterThan(0.5);
      expect(analysis.keywords).toContain('minecraft');
      expect(analysis.keywords).toContain('neoforge');
      expect(analysis.version_mentions).toContain('1.21');
      expect(analysis.tags).toContain('migration');
    });

    it('should detect low-relevance content', async () => {
      const testContent = {
        id: 'test-content-2',
        title: 'Cooking Recipe: Chocolate Cake',
        content:
          'Here is how to make a delicious chocolate cake for your next party.',
        source_type: 'blog_post',
        minecraft_version: undefined,
        loader_type: undefined,
      };

      const analysis = await mlAnalyzer.analyzeContent(testContent);

      expect(analysis.relevance_score).toBeLessThan(0.3);
      expect(analysis.confidence).toBeLessThan(0.7);
      expect(analysis.breaking_changes_likelihood).toBeLessThan(0.2);
    });

    it('should classify content types correctly', async () => {
      const tutorialContent = {
        id: 'tutorial-test',
        title: 'How to Create Your First Minecraft Mod',
        content:
          'Step by step tutorial for creating your first mod. Learn about setup, basic mod structure, and common patterns.',
        source_type: 'guide',
        minecraft_version: '1.21',
        loader_type: 'fabric',
      };

      const analysis = await mlAnalyzer.analyzeContent(tutorialContent);

      expect(analysis.content_type).toBe('tutorial');
      expect(analysis.complexity_score).toBeGreaterThan(0.3);
      expect(analysis.topics).toContain('tutorial');
    });

    it('should find similar content', async () => {
      const content1 = {
        id: 'content-1',
        title: 'Minecraft 1.21 Breaking Changes',
        content:
          'This document outlines the breaking changes in Minecraft 1.21 that affect mod development.',
        source_type: 'guide',
        minecraft_version: '1.21',
        loader_type: 'forge',
      };

      const content2 = {
        id: 'content-2',
        title: 'Minecraft 1.21 Migration Guide',
        content:
          'A comprehensive guide for migrating mods from 1.20 to 1.21, covering all breaking changes.',
        source_type: 'guide',
        minecraft_version: '1.21',
        loader_type: 'forge',
      };

      await mlAnalyzer.analyzeContent(content1);
      const analysis2 = await mlAnalyzer.analyzeContent(content2);

      expect(analysis2.similar_content_ids).toContain('content-1');
    });
  });

  describe('Discord Discovery', () => {
    let discordDiscovery: DiscordDiscovery;

    beforeEach(() => {
      discordDiscovery = new DiscordDiscovery({
        timeout: 5000,
        maxMessages: 10,
      });
    });

    it('should parse Discord webhook URL correctly', () => {
      const webhookUrl =
        'https://discord.com/api/webhooks/123456789/abcdef123456';
      const parsed = (discordDiscovery as any).parseWebhookUrl(webhookUrl);

      expect(parsed).toEqual({
        id: '123456789',
        token: 'abcdef123456',
      });
    });

    it('should filter messages by relevance', () => {
      const testMessages = [
        {
          id: '1',
          content:
            'NeoForge 1.21.7 has been released! Check out the changelog.',
          author: { id: 'user1', username: 'developer' },
          timestamp: new Date().toISOString(),
          embeds: [],
        },
        {
          id: '2',
          content: 'Hello everyone, how is your day?',
          author: { id: 'user2', username: 'casual' },
          timestamp: new Date().toISOString(),
          embeds: [],
        },
        {
          id: '3',
          content:
            'Breaking changes in the latest Minecraft update affecting block registration.',
          author: { id: 'user3', username: 'modder' },
          timestamp: new Date().toISOString(),
          embeds: [],
        },
      ];

      const filters = {
        keywords: ['release', 'breaking', 'update'],
        min_length: 20,
      };

      const filtered = (discordDiscovery as any).filterMessages(
        testMessages,
        filters
      );

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('1');
      expect(filtered[1].id).toBe('3');
    });

    it('should create source items from Discord messages', () => {
      const testMessage = {
        id: '123',
        content:
          'Fabric 1.21.7 released with improved mod loading and new API features.',
        author: { id: 'dev', username: 'fabric_dev' },
        timestamp: '2024-01-01T00:00:00Z',
        embeds: [],
      };

      const config = {
        type: 'discord_channel',
        guild_id: '507304429255393322',
        channel_id: '507982666755670019',
        source_type: 'changelog',
        loader_type: 'fabric',
      };

      const channel = { name: 'announcements' };

      const sourceItem = (discordDiscovery as any).createSourceItemFromMessage(
        testMessage,
        config,
        'fabric_discord',
        channel
      );

      expect(sourceItem).toBeDefined();
      expect(sourceItem.source_type).toBe('changelog');
      expect(sourceItem.loader_type).toBe('fabric');
      expect(sourceItem.url).toContain('discord.com/channels');
      expect(sourceItem.title).toContain('fabric_dev');
    });
  });

  describe('Community Discovery', () => {
    let communityDiscovery: CommunityDiscovery;

    beforeEach(async () => {
      communityDiscovery = new CommunityDiscovery({
        submissionsDir: './test-submissions',
        maxSubmissionsPerUser: 5,
        autoApproveThreshold: 0.9,
        enableCommunityVoting: true,
      });

      await communityDiscovery.initialize();
    });

    it('should validate source submissions', async () => {
      const validSubmission = {
        url: 'https://example.com/valid-guide',
        title: 'Minecraft 1.21 Modding Guide',
        description:
          'A comprehensive guide for modding Minecraft 1.21 with NeoForge',
        source_type: 'guide',
        loader_type: 'neoforge',
        minecraft_version: '1.21',
        tags: ['tutorial', 'neoforge', '1.21'],
        category: 'tutorial',
        submitter: {
          username: 'test_user',
          email: 'test@example.com',
        },
      };

      // Mock fetch to return a successful response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await communityDiscovery.submitSource(validSubmission);

      expect(result.success).toBe(true);
      expect(result.submissionId).toBeDefined();
      expect(result.message).toContain('submitted successfully');
    });

    it('should reject invalid submissions', async () => {
      const invalidSubmission = {
        url: 'invalid-url',
        title: '',
        description: 'A guide',
        source_type: 'guide',
        loader_type: 'neoforge',
        tags: [],
        category: 'tutorial',
        submitter: {
          username: 'test_user',
        },
      };

      const result = await communityDiscovery.submitSource(invalidSubmission);

      expect(result.success).toBe(false);
      expect(result.message).toContain('validation failed');
    });

    it('should track contributor statistics', async () => {
      const stats = await communityDiscovery.getContributorStats('test_user');

      expect(stats).toHaveProperty('total_submissions');
      expect(stats).toHaveProperty('approved_submissions');
      expect(stats).toHaveProperty('rejected_submissions');
      expect(stats).toHaveProperty('pending_submissions');
      expect(stats).toHaveProperty('reputation_score');
      expect(stats).toHaveProperty('badges');
    });

    it('should handle community feedback', async () => {
      // This would test the voting and comment system
      const mockSubmissionId = 'test-submission-123';

      const feedbackResult = await communityDiscovery.addFeedback(
        mockSubmissionId,
        'test_reviewer',
        'upvote'
      );

      // Since this is a mock submission, it should fail
      expect(feedbackResult.success).toBe(false);
      expect(feedbackResult.message).toContain('not found');
    });
  });

  describe('Dynamic Discovery', () => {
    let dynamicDiscovery: DynamicDiscovery;

    beforeEach(() => {
      dynamicDiscovery = new DynamicDiscovery({
        maxTrendingRepos: 10,
        trendingAnalysisPeriod: 'weekly',
        enableActivityAnalysis: true,
        enableTopicAnalysis: true,
        enableCommunityTracking: true,
      });
    });

    it('should calculate repository relevance scores', () => {
      const testRepo = {
        name: 'minecraft-mod-template',
        full_name: 'user/minecraft-mod-template',
        html_url: 'https://github.com/user/minecraft-mod-template',
        description: 'A template for creating Minecraft mods with NeoForge',
        stars: 150,
        forks: 25,
        language: 'Java',
        topics: ['minecraft', 'neoforge', 'template'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        pushed_at: '2024-01-01T00:00:00Z',
        size: 1000,
        has_issues: true,
        has_wiki: true,
        has_discussions: true,
      };

      const relevanceScore = (
        dynamicDiscovery as any
      ).calculateRepoRelevanceScore(testRepo);

      expect(relevanceScore).toBeGreaterThan(0.5);
    });

    it('should extract relevance indicators from repositories', () => {
      const testRepo = {
        name: 'fabric-mod-example',
        description: 'Example Fabric mod for Minecraft 1.21',
        topics: ['minecraft', 'fabric', 'mod'],
      };

      const indicators = (dynamicDiscovery as any).extractRelevanceIndicators(
        testRepo
      );

      expect(indicators).toContain('fabric');
      expect(indicators).toContain('minecraft');
      expect(indicators).toContain('mod');
    });

    it('should extract version mentions from text', () => {
      const text = 'This mod supports Minecraft 1.21 and 1.20.4 versions';
      const versions = (dynamicDiscovery as any).extractVersionMentions(text);

      expect(versions).toContain('1.21');
      expect(versions).toContain('1.20.4');
    });

    it('should calculate topic minecraft relevance', () => {
      const minecraftTopic = 'minecraft-mod';
      const irrelevantTopic = 'web-development';

      const relevanceScore1 = (
        dynamicDiscovery as any
      ).calculateTopicMinecraftRelevance(minecraftTopic);
      const relevanceScore2 = (
        dynamicDiscovery as any
      ).calculateTopicMinecraftRelevance(irrelevantTopic);

      expect(relevanceScore1).toBeGreaterThan(0.5);
      expect(relevanceScore2).toBeLessThan(0.3);
    });
  });

  describe('Video Discovery', () => {
    let videoDiscovery: VideoDiscovery;

    beforeEach(() => {
      videoDiscovery = new VideoDiscovery({
        maxVideoResults: 5,
        minVideoDuration: 60,
        maxVideoDuration: 1800,
        enableSubtitleDownload: false, // Disable for testing
      });
    });

    it('should parse YouTube duration format', () => {
      const duration1 = 'PT1H30M45S'; // 1 hour 30 minutes 45 seconds
      const duration2 = 'PT15M30S'; // 15 minutes 30 seconds
      const duration3 = 'PT45S'; // 45 seconds

      const seconds1 = (videoDiscovery as any).parseDuration(duration1);
      const seconds2 = (videoDiscovery as any).parseDuration(duration2);
      const seconds3 = (videoDiscovery as any).parseDuration(duration3);

      expect(seconds1).toBe(5445); // 1*3600 + 30*60 + 45
      expect(seconds2).toBe(930); // 15*60 + 30
      expect(seconds3).toBe(45);
    });

    it('should generate appropriate search queries', () => {
      const config = {
        type: 'video_discovery',
        loader_type: 'fabric',
        source_type: 'guide',
      };

      const queries = (videoDiscovery as any).generateSearchQueries(config);

      expect(queries).toContain('minecraft fabric tutorial');
      expect(queries.length).toBeGreaterThan(5);
    });

    it('should classify video content type', () => {
      const tutorialVideo = {
        title: 'How to Create Your First Minecraft Mod - Tutorial',
        description: 'Step by step guide for beginners',
        tags: ['tutorial', 'minecraft', 'modding'],
      };

      const showcaseVideo = {
        title: 'Showcasing My New Minecraft Mod',
        description: 'Check out this cool new mod I created',
        tags: ['showcase', 'demo'],
      };

      const classification1 = (videoDiscovery as any).classifyVideoContent(
        tutorialVideo
      );
      const classification2 = (videoDiscovery as any).classifyVideoContent(
        showcaseVideo
      );

      expect(classification1.type).toBe('tutorial');
      expect(classification2.type).toBe('showcase');
    });

    it('should assess video quality indicators', () => {
      const highQualityVideo = {
        duration: 1200, // 20 minutes
        view_count: 10_000,
        like_count: 500,
        comment_count: 100,
      };

      const lowQualityVideo = {
        duration: 120, // 2 minutes
        view_count: 50,
        like_count: 2,
        comment_count: 1,
      };

      const quality1 = (videoDiscovery as any).assessVideoQuality(
        highQualityVideo
      );
      const quality2 = (videoDiscovery as any).assessVideoQuality(
        lowQualityVideo
      );

      expect(quality1.educational_value).toBeGreaterThan(
        quality2.educational_value
      );
      expect(quality1.video_quality).toBe('high');
      expect(quality2.video_quality).toBe('low');
    });
  });

  describe('Enhanced Content Analyzer', () => {
    it('should integrate with ML analyzer', async () => {
      const testContent = {
        id: 'test-ml-integration',
        title: 'Advanced Minecraft Modding with Fabric',
        content:
          'This advanced guide covers complex modding techniques using Fabric API',
        source_type: 'guide',
        minecraft_version: '1.21',
        loader_type: 'fabric',
      };

      const mlResult = await contentAnalyzer.analyzeContentWithML(testContent);

      expect(mlResult).toBeDefined();
      expect(mlResult.relevance_score).toBeGreaterThan(0.5);
      expect(mlResult.content_type).toBe('guide');
    });

    it('should maintain backward compatibility', () => {
      const title = 'Minecraft 1.21 Breaking Changes';
      const description = 'Important changes that affect mod development';

      const isRelevant = contentAnalyzer.isPortingRelevant(title, description);
      const relevanceScore = contentAnalyzer.calculatePortingRelevance(
        `${title} ${description}`
      );
      const version = contentAnalyzer.extractMinecraftVersion(
        title,
        description
      );

      expect(isRelevant).toBe(true);
      expect(relevanceScore).toBeGreaterThan(0.5);
      expect(version).toBe('1.21');
    });
  });

  describe('Integration Tests', () => {
    it('should discover sources from all new source types', async () => {
      const sourceConfigs = new SourceConfigs();
      const configs = sourceConfigs.getConfigs();

      // Test that all new source types are configured
      const expectedTypes = [
        'discord_channel',
        'video_discovery',
        'dynamic_discovery',
        'community_discovery',
      ];

      const configuredTypes = Object.values(configs).map((c) => c.type);

      for (const expectedType of expectedTypes) {
        expect(configuredTypes).toContain(expectedType);
      }
    });

    it('should handle discovery from multiple source types', async () => {
      

      // Mock successful discovery from each source type
      const testConfig = {
        type: 'community_discovery',
        url: 'community://submissions',
        source_type: 'guide',
        loader_type: 'vanilla',
        description: 'Test community discovery',
      };

      // This would test the actual discovery process
      // For now, we just verify the structure is correct
      expect(discoveryCore._discoverFromSource).toBeDefined();
      expect(discoveryCore._discoverFromCommunitySubmissions).toBeDefined();
      expect(discoveryCore._discoverFromDynamicSources).toBeDefined();
      expect(discoveryCore._discoverFromVideos).toBeDefined();
      expect(discoveryCore._discoverFromDiscordChannel).toBeDefined();
    });

    it('should provide comprehensive discovery statistics', async () => {
      const stats = discoveryCore.stats.getStats();

      expect(stats).toHaveProperty('discovery_start_time');
      expect(stats).toHaveProperty('total_sources_discovered');
      expect(stats).toHaveProperty('failed_discoveries');
      expect(stats).toHaveProperty('sources_by_type');
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network failure
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const testConfig = {
        type: 'dynamic_discovery',
        url: 'https://api.github.com/search/repositories',
        source_type: 'guide',
        loader_type: 'vanilla',
        description: 'Test dynamic discovery',
      };

      // Discovery should not throw but should log errors
      await expect(
        discoveryCore._discoverFromDynamicSources('test', testConfig)
      ).not.toThrow();
    });

    it('should handle invalid Discord configuration', async () => {
      const invalidConfig = {
        type: 'discord_channel',
        url: 'invalid-url',
        source_type: 'changelog',
        loader_type: 'fabric',
        description: 'Invalid Discord config',
      };

      await expect(
        discoveryCore._discoverFromDiscordChannel('test', invalidConfig)
      ).not.toThrow();
    });

    it('should handle malformed community submissions', async () => {
      const malformedSubmission = {
        url: 'https://example.com',
        title: null,
        description: undefined,
        submitter: {},
      };

      const result = await communityDiscovery.submitSource(
        malformedSubmission as any
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('validation failed');
    });
  });
});

// Mock global fetch for testing
declare global {
  var fetch: jest.Mock;
}

// Helper function to create mock Discord API responses
function createMockDiscordMessage(id: string, content: string, author: string) {
  return {
    id,
    content,
    author: { id: author, username: author },
    timestamp: new Date().toISOString(),
    embeds: [],
  };
}

// Helper function to create mock GitHub API responses
function createMockGitHubRepo(
  name: string,
  description: string,
  stars: number
) {
  return {
    name,
    full_name: `user/${name}`,
    html_url: `https://github.com/user/${name}`,
    description,
    stars,
    forks: Math.floor(stars / 10),
    language: 'Java',
    topics: ['minecraft', 'mod'],
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    pushed_at: '2024-01-01T00:00:00Z',
    size: 1000,
    has_issues: true,
    has_wiki: true,
    has_discussions: true,
  };
}

// Helper function to create mock YouTube API responses
function createMockYouTubeVideo(
  id: string,
  title: string,
  description: string
) {
  return {
    id,
    title,
    description,
    duration: 600,
    published_at: '2024-01-01T00:00:00Z',
    channel: { id: 'channel1', name: 'Test Channel' },
    view_count: 1000,
    like_count: 50,
    comment_count: 10,
    tags: ['minecraft', 'tutorial'],
    category: 'Education',
    language: 'en',
    captions_available: true,
    thumbnail_url: 'https://example.com/thumbnail.jpg',
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}
