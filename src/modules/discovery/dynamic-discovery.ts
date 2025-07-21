/**
 * @file Dynamic Discovery - Intelligent source discovery based on trends and activity
 *
 * This module provides dynamic source discovery capabilities including:
 * - GitHub trending repository analysis
 * - Activity-based source discovery
 * - Topic trend analysis
 * - Automated source relationship mapping
 * - Community interest tracking
 */

import { logger } from '../../utils/logger';
import { MLContentAnalyzer } from '../../utils/ml-content-analyzer';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';
import { type ISourceItem, SourceItemFactory } from './source-item-factory';

export interface IDynamicDiscoveryOptions {
  userAgent?: string;
  timeout?: number;
  retryAttempts?: number;
  maxTrendingRepos?: number;
  githubToken?: string;
  trendingAnalysisPeriod?: 'daily' | 'weekly' | 'monthly';
  minStarsForConsideration?: number;
  enableActivityAnalysis?: boolean;
  enableTopicAnalysis?: boolean;
  enableCommunityTracking?: boolean;
}

export interface ITrendingRepository {
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  topics: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  has_issues: boolean;
  has_wiki: boolean;
  has_discussions: boolean;
  license?: {
    name: string;
    spdx_id: string;
  };
}

export interface IActivityAnalysis {
  repository: string;
  recent_commits: number;
  recent_releases: number;
  recent_issues: number;
  recent_discussions: number;
  activity_score: number;
  relevance_indicators: string[];
  minecraft_version_mentions: string[];
  loader_type_indicators: string[];
}

export interface ITrendingTopic {
  name: string;
  frequency: number;
  related_repositories: string[];
  related_keywords: string[];
  trend_score: number;
  minecraft_relevance: number;
  loader_associations: string[];
}

export interface IDiscoveryInsight {
  type: 'trending_repo' | 'active_repo' | 'hot_topic' | 'community_interest';
  confidence: number;
  relevance_score: number;
  data: any;
  discovery_reason: string;
  potential_sources: string[];
  recommended_actions: string[];
}

/**
 * Dynamic source discovery system
 */
export class DynamicDiscovery {
  private options: IDynamicDiscoveryOptions;
  private sourceItemFactory: SourceItemFactory;
  private contentAnalyzer: ContentAnalyzer;
  private mlAnalyzer: MLContentAnalyzer;
  private githubApiBase = 'https://api.github.com';
  private trendingCache: Map<string, ITrendingRepository[]> = new Map();
  private activityCache: Map<string, IActivityAnalysis> = new Map();
  private topicCache: Map<string, ITrendingTopic[]> = new Map();

  constructor(options: IDynamicDiscoveryOptions = {}) {
    this.options = {
      userAgent: options.userAgent || 'porter-bridges/1.0.0',
      timeout: options.timeout || 30_000,
      retryAttempts: options.retryAttempts || 3,
      maxTrendingRepos: options.maxTrendingRepos || 50,
      trendingAnalysisPeriod: options.trendingAnalysisPeriod || 'weekly',
      minStarsForConsideration: options.minStarsForConsideration || 10,
      enableActivityAnalysis: options.enableActivityAnalysis !== false,
      enableTopicAnalysis: options.enableTopicAnalysis !== false,
      enableCommunityTracking: options.enableCommunityTracking !== false,
      ...options,
    };

    this.sourceItemFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
    this.mlAnalyzer = new MLContentAnalyzer();
  }

  /**
   * Discover sources dynamically based on trending topics and activity
   */
  async discoverDynamicSources(
    sourceId: string,
    config: ISourceConfig,
    discoveredSources: Map<string, ISourceItem>
  ): Promise<IDiscoveryInsight[]> {
    logger.info(`🔍 Starting dynamic source discovery for ${sourceId}`);

    const insights: IDiscoveryInsight[] = [];

    try {
      // Analyze trending repositories
      if (this.options.enableActivityAnalysis) {
        const trendingInsights = await this.analyzeTrendingRepositories();
        insights.push(...trendingInsights);
      }

      // Analyze topic trends
      if (this.options.enableTopicAnalysis) {
        const topicInsights = await this.analyzeTopicTrends();
        insights.push(...topicInsights);
      }

      // Analyze community activity
      if (this.options.enableCommunityTracking) {
        const communityInsights = await this.analyzeCommunityActivity();
        insights.push(...communityInsights);
      }

      // Convert high-confidence insights to source items
      const highConfidenceInsights = insights.filter((i) => i.confidence > 0.7);

      for (const insight of highConfidenceInsights) {
        const sources = await this.convertInsightToSources(insight, config);
        for (const source of sources) {
          discoveredSources.set(source.url, source);
        }
      }

      logger.info(
        `✅ Dynamic discovery completed: ${insights.length} insights, ${highConfidenceInsights.length} high-confidence`
      );
      return insights;
    } catch (error) {
      logger.error('Dynamic discovery failed:', error);
      return [];
    }
  }

  /**
   * Analyze trending repositories for Minecraft modding relevance
   */
  private async analyzeTrendingRepositories(): Promise<IDiscoveryInsight[]> {
    logger.info('📈 Analyzing trending repositories...');

    const insights: IDiscoveryInsight[] = [];

    try {
      const trendingRepos = await this.getTrendingRepositories();
      const minecraftRepos =
        await this.filterMinecraftRelevantRepos(trendingRepos);

      for (const repo of minecraftRepos) {
        const activityAnalysis = await this.analyzeRepositoryActivity(repo);
        const relevanceScore = this.calculateRepoRelevanceScore(
          repo,
          activityAnalysis
        );

        if (relevanceScore > 0.5) {
          insights.push({
            type: 'trending_repo',
            confidence: Math.min(relevanceScore * 0.8, 0.9),
            relevance_score: relevanceScore,
            data: {
              repository: repo,
              activity: activityAnalysis,
            },
            discovery_reason: `Trending repository with ${repo.stars} stars, ${activityAnalysis.recent_commits} recent commits`,
            potential_sources: [
              `${repo.html_url}/releases`,
              `${repo.html_url}/wiki`,
              `${repo.html_url}/discussions`,
            ],
            recommended_actions: [
              'Monitor for new releases',
              'Check wiki for documentation',
              'Track discussions for updates',
            ],
          });
        }
      }

      logger.info(
        `📊 Analyzed ${trendingRepos.length} trending repos, found ${insights.length} relevant insights`
      );
      return insights;
    } catch (error) {
      logger.error('Failed to analyze trending repositories:', error);
      return [];
    }
  }

  /**
   * Analyze topic trends in the Minecraft modding ecosystem
   */
  private async analyzeTopicTrends(): Promise<IDiscoveryInsight[]> {
    logger.info('🏷️ Analyzing topic trends...');

    const insights: IDiscoveryInsight[] = [];

    try {
      const hotTopics = await this.getHotTopics();
      const minecraftTopics = hotTopics.filter(
        (t) => t.minecraft_relevance > 0.6
      );

      for (const topic of minecraftTopics) {
        const topicInsight = await this.analyzeTopicImplications(topic);

        if (topicInsight.confidence > 0.6) {
          insights.push({
            type: 'hot_topic',
            confidence: topicInsight.confidence,
            relevance_score: topic.minecraft_relevance,
            data: {
              topic,
              implications: topicInsight,
            },
            discovery_reason: `Hot topic "${topic.name}" with ${topic.frequency} mentions and ${topic.related_repositories.length} related repos`,
            potential_sources: topicInsight.potential_sources,
            recommended_actions: [
              'Monitor repositories using this topic',
              'Track discussions around this topic',
              'Look for related documentation',
            ],
          });
        }
      }

      logger.info(
        `📊 Analyzed ${hotTopics.length} topics, found ${insights.length} relevant insights`
      );
      return insights;
    } catch (error) {
      logger.error('Failed to analyze topic trends:', error);
      return [];
    }
  }

  /**
   * Analyze community activity patterns
   */
  private async analyzeCommunityActivity(): Promise<IDiscoveryInsight[]> {
    logger.info('👥 Analyzing community activity...');

    const insights: IDiscoveryInsight[] = [];

    try {
      // Analyze GitHub discussions
      const discussionInsights = await this.analyzeGitHubDiscussions();
      insights.push(...discussionInsights);

      // Analyze issue patterns
      const issueInsights = await this.analyzeIssuePatterns();
      insights.push(...issueInsights);

      // Analyze release patterns
      const releaseInsights = await this.analyzeReleasePatterns();
      insights.push(...releaseInsights);

      logger.info(
        `📊 Analyzed community activity, found ${insights.length} insights`
      );
      return insights;
    } catch (error) {
      logger.error('Failed to analyze community activity:', error);
      return [];
    }
  }

  /**
   * Get trending repositories from GitHub
   */
  private async getTrendingRepositories(): Promise<ITrendingRepository[]> {
    const cacheKey = `trending_${this.options.trendingAnalysisPeriod}`;

    if (this.trendingCache.has(cacheKey)) {
      return this.trendingCache.get(cacheKey)!;
    }

    try {
      const queries = [
        'minecraft mod',
        'minecraft forge',
        'minecraft fabric',
        'minecraft neoforge',
        'minecraft modding',
        'minecraft api',
      ];

      const allRepos: ITrendingRepository[] = [];

      for (const query of queries) {
        const repos = await this.searchRepositories(query);
        allRepos.push(...repos);
      }

      // Remove duplicates and sort by relevance
      const uniqueRepos = this.removeDuplicateRepos(allRepos);
      const sortedRepos = uniqueRepos
        .sort((a, b) => b.stars - a.stars)
        .slice(0, this.options.maxTrendingRepos);

      this.trendingCache.set(cacheKey, sortedRepos);
      return sortedRepos;
    } catch (error) {
      logger.error('Failed to get trending repositories:', error);
      return [];
    }
  }

  /**
   * Search repositories using GitHub API
   */
  private async searchRepositories(
    query: string
  ): Promise<ITrendingRepository[]> {
    const headers: Record<string, string> = {
      'User-Agent': this.options.userAgent!,
      Accept: 'application/vnd.github.v3+json',
    };

    if (this.options.githubToken) {
      headers['Authorization'] = `token ${this.options.githubToken}`;
    }

    const period = this.options.trendingAnalysisPeriod;
    const dateThreshold = new Date();

    if (period === 'daily') {
      dateThreshold.setDate(dateThreshold.getDate() - 1);
    } else if (period === 'weekly') {
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else {
      dateThreshold.setMonth(dateThreshold.getMonth() - 1);
    }

    const searchQuery = `${query} stars:>=${this.options.minStarsForConsideration} pushed:>${dateThreshold.toISOString().split('T')[0]}`;

    const response = await fetch(
      `${this.githubApiBase}/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=100`,
      { headers }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * Filter repositories for Minecraft modding relevance
   */
  private async filterMinecraftRelevantRepos(
    repos: ITrendingRepository[]
  ): Promise<ITrendingRepository[]> {
    const relevant: ITrendingRepository[] = [];

    for (const repo of repos) {
      const relevanceScore = this.calculateRepoRelevanceScore(repo);
      if (relevanceScore > 0.3) {
        relevant.push(repo);
      }
    }

    return relevant;
  }

  /**
   * Calculate repository relevance score
   */
  private calculateRepoRelevanceScore(
    repo: ITrendingRepository,
    activity?: IActivityAnalysis
  ): number {
    let score = 0;

    // Topic relevance
    const minecraftTopics = [
      'minecraft',
      'minecraft-mod',
      'minecraft-forge',
      'minecraft-fabric',
      'minecraft-neoforge',
    ];
    const topicMatches = repo.topics.filter((t) =>
      minecraftTopics.includes(t)
    ).length;
    score += topicMatches * 0.2;

    // Description relevance
    const description = (repo.description || '').toLowerCase();
    const relevanceScore =
      this.contentAnalyzer.calculatePortingRelevance(description);
    score += relevanceScore * 0.3;

    // Repository activity
    if (activity) {
      const activityScore = Math.min(activity.activity_score / 100, 1);
      score += activityScore * 0.2;
    }

    // Repository popularity
    const popularityScore = Math.min(repo.stars / 1000, 1);
    score += popularityScore * 0.1;

    // Language relevance
    if (repo.language === 'Java') score += 0.1;
    if (repo.language === 'Kotlin') score += 0.05;

    // Recent activity
    const daysSinceUpdate =
      (Date.now() - new Date(repo.updated_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 30) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Analyze repository activity
   */
  private async analyzeRepositoryActivity(
    repo: ITrendingRepository
  ): Promise<IActivityAnalysis> {
    const cacheKey = repo.full_name;

    if (this.activityCache.has(cacheKey)) {
      return this.activityCache.get(cacheKey)!;
    }

    try {
      const analysis: IActivityAnalysis = {
        repository: repo.full_name,
        recent_commits: await this.getRecentCommitsCount(repo.full_name),
        recent_releases: await this.getRecentReleasesCount(repo.full_name),
        recent_issues: await this.getRecentIssuesCount(repo.full_name),
        recent_discussions: await this.getRecentDiscussionsCount(
          repo.full_name
        ),
        activity_score: 0,
        relevance_indicators: [],
        minecraft_version_mentions: [],
        loader_type_indicators: [],
      };

      // Calculate activity score
      analysis.activity_score =
        analysis.recent_commits * 2 +
        analysis.recent_releases * 5 +
        analysis.recent_issues * 1 +
        analysis.recent_discussions * 3;

      // Extract relevance indicators
      analysis.relevance_indicators = this.extractRelevanceIndicators(repo);
      analysis.minecraft_version_mentions = this.extractVersionMentions(
        repo.description || ''
      );
      analysis.loader_type_indicators = this.extractLoaderTypeIndicators(repo);

      this.activityCache.set(cacheKey, analysis);
      return analysis;
    } catch (error) {
      logger.error(`Failed to analyze activity for ${repo.full_name}:`, error);

      // Return basic analysis on error
      return {
        repository: repo.full_name,
        recent_commits: 0,
        recent_releases: 0,
        recent_issues: 0,
        recent_discussions: 0,
        activity_score: 0,
        relevance_indicators: [],
        minecraft_version_mentions: [],
        loader_type_indicators: [],
      };
    }
  }

  /**
   * Get hot topics from repository analysis
   */
  private async getHotTopics(): Promise<ITrendingTopic[]> {
    const cacheKey = 'hot_topics';

    if (this.topicCache.has(cacheKey)) {
      return this.topicCache.get(cacheKey)!;
    }

    try {
      const trendingRepos = await this.getTrendingRepositories();
      const topicFrequency = new Map<string, number>();
      const topicRepos = new Map<string, string[]>();

      // Count topic frequency
      for (const repo of trendingRepos) {
        for (const topic of repo.topics) {
          topicFrequency.set(topic, (topicFrequency.get(topic) || 0) + 1);

          if (!topicRepos.has(topic)) {
            topicRepos.set(topic, []);
          }
          topicRepos.get(topic)!.push(repo.full_name);
        }
      }

      // Create trending topics
      const hotTopics: ITrendingTopic[] = [];

      for (const [topic, frequency] of topicFrequency.entries()) {
        if (frequency >= 3) {
          // Topic must appear in at least 3 repos
          const minecraftRelevance =
            this.calculateTopicMinecraftRelevance(topic);

          if (minecraftRelevance > 0.3) {
            hotTopics.push({
              name: topic,
              frequency,
              related_repositories: topicRepos.get(topic) || [],
              related_keywords: this.extractRelatedKeywords(topic),
              trend_score: frequency * minecraftRelevance,
              minecraft_relevance: minecraftRelevance,
              loader_associations: this.extractLoaderAssociations(topic),
            });
          }
        }
      }

      const sortedTopics = hotTopics.sort(
        (a, b) => b.trend_score - a.trend_score
      );
      this.topicCache.set(cacheKey, sortedTopics);

      return sortedTopics;
    } catch (error) {
      logger.error('Failed to get hot topics:', error);
      return [];
    }
  }

  /**
   * Helper methods for API calls
   */
  private async getRecentCommitsCount(repoName: string): Promise<number> {
    try {
      const response = await githubClient.getJson<Array<any>>(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
      );
      return response.length;
    } catch {
      return 0;
    }
  }

  private async getRecentReleasesCount(repoName: string): Promise<number> {
    try {
      const response = await this.githubApiCall(
        `/repos/${repoName}/releases?per_page=10`
      );
      const recentDate = new Date(this.getRecentDate());
      return response.filter(
        (release: any) => new Date(release.published_at) > recentDate
      ).length;
    } catch {
      return 0;
    }
  }

  private async getRecentIssuesCount(repoName: string): Promise<number> {
    try {
      const response = await this.githubApiCall(
        `/repos/${repoName}/issues?since=${this.getRecentDate()}&state=all`
      );
      return response.length;
    } catch {
      return 0;
    }
  }

  private async getRecentDiscussionsCount(repoName: string): Promise<number> {
    // GitHub Discussions API is more complex, returning 0 for now
    return 0;
  }

  private async githubApiCall(endpoint: string): Promise<any> {
    const headers: Record<string, string> = {
      'User-Agent': this.options.userAgent!,
      Accept: 'application/vnd.github.v3+json',
    };

    if (this.options.githubToken) {
      headers['Authorization'] = `token ${this.options.githubToken}`;
    }

    const response = await fetch(`${this.githubApiBase}${endpoint}`, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return await response.json();
  }

  private getRecentDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30); // Last 30 days
    return date.toISOString();
  }

  private removeDuplicateRepos(
    repos: ITrendingRepository[]
  ): ITrendingRepository[] {
    const seen = new Set<string>();
    return repos.filter((repo) => {
      if (seen.has(repo.full_name)) {
        return false;
      }
      seen.add(repo.full_name);
      return true;
    });
  }

  private extractRelevanceIndicators(repo: ITrendingRepository): string[] {
    const indicators: string[] = [];
    const text = `${repo.name} ${repo.description || ''}`.toLowerCase();

    const keywords = [
      'mod',
      'forge',
      'fabric',
      'neoforge',
      'minecraft',
      'api',
      'library',
    ];

    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        indicators.push(keyword);
      }
    }

    return indicators;
  }

  private extractVersionMentions(text: string): string[] {
    const versionPattern = /\b1\.\d+(?:\.\d+)?\b/g;
    return text.match(versionPattern) || [];
  }

  private extractLoaderTypeIndicators(repo: ITrendingRepository): string[] {
    const indicators: string[] = [];
    const text =
      `${repo.name} ${repo.description || ''} ${repo.topics.join(' ')}`.toLowerCase();

    const loaders = ['forge', 'fabric', 'neoforge', 'quilt'];

    for (const loader of loaders) {
      if (text.includes(loader)) {
        indicators.push(loader);
      }
    }

    return indicators;
  }

  private calculateTopicMinecraftRelevance(topic: string): number {
    const minecraftKeywords = [
      'minecraft',
      'mod',
      'forge',
      'fabric',
      'neoforge',
      'quilt',
    ];
    const lowerTopic = topic.toLowerCase();

    let score = 0;
    for (const keyword of minecraftKeywords) {
      if (lowerTopic.includes(keyword)) {
        score += 0.3;
      }
    }

    return Math.min(score, 1.0);
  }

  private extractRelatedKeywords(topic: string): string[] {
    // This would use more sophisticated keyword extraction in a real implementation
    return [topic];
  }

  private extractLoaderAssociations(topic: string): string[] {
    const associations: string[] = [];
    const lowerTopic = topic.toLowerCase();

    const loaders = ['forge', 'fabric', 'neoforge', 'quilt'];

    for (const loader of loaders) {
      if (lowerTopic.includes(loader)) {
        associations.push(loader);
      }
    }

    return associations;
  }

  /**
   * Placeholder methods for community analysis
   */
  private async analyzeGitHubDiscussions(): Promise<IDiscoveryInsight[]> {
    // Implementation would analyze GitHub discussions for trending topics
    return [];
  }

  private async analyzeIssuePatterns(): Promise<IDiscoveryInsight[]> {
    // Implementation would analyze issue patterns for common problems
    return [];
  }

  private async analyzeReleasePatterns(): Promise<IDiscoveryInsight[]> {
    // Implementation would analyze release patterns for version updates
    return [];
  }

  private async analyzeTopicImplications(topic: ITrendingTopic): Promise<any> {
    // Implementation would analyze what a trending topic means for the ecosystem
    return {
      confidence: 0.7,
      potential_sources: topic.related_repositories.map(
        (repo) => `https://github.com/${repo}`
      ),
    };
  }

  private async convertInsightToSources(
    insight: IDiscoveryInsight,
    config: ISourceConfig
  ): Promise<ISourceItem[]> {
    const sources: ISourceItem[] = [];

    for (const url of insight.potential_sources) {
      const sourceItem: ISourceItem = {
        status: 'discovered',
        url,
        source_type: 'guide',
        title: `Dynamic Discovery: ${insight.type}`,
        loader_type: config.loader_type as any,
        priority: insight.confidence > 0.8 ? 'high' : 'medium',
        relevance_score: insight.relevance_score,
        tags: ['dynamic-discovery', insight.type],
        metadata: {
          discovery_insight: insight,
          discovery_method: 'dynamic',
          confidence: insight.confidence,
        },
      };

      sources.push(this.sourceItemFactory.createSourceItem(sourceItem));
    }

    return sources;
  }
}

export default DynamicDiscovery;
