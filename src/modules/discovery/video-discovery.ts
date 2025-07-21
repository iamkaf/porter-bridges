/**
 * @file Video Discovery - Video content transcription and analysis
 *
 * This module provides video content discovery and analysis including:
 * - YouTube video transcription
 * - Video content relevance analysis
 * - Subtitle extraction and processing
 * - Video metadata analysis
 * - Automated video categorization
 */

import { logger } from '../../utils/logger';
import { MLContentAnalyzer } from '../../utils/ml-content-analyzer';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';
import { type ISourceItem, SourceItemFactory } from './source-item-factory';

export interface IVideoDiscoveryOptions {
  userAgent?: string;
  timeout?: number;
  retryAttempts?: number;
  youtubeApiKey?: string;
  maxVideoResults?: number;
  transcriptionService?: 'youtube' | 'whisper' | 'google' | 'azure';
  enableSubtitleDownload?: boolean;
  enableThumbnailAnalysis?: boolean;
  minVideoDuration?: number;
  maxVideoDuration?: number;
}

export interface IVideoMetadata {
  id: string;
  title: string;
  description: string;
  duration: number;
  published_at: string;
  channel: {
    id: string;
    name: string;
    subscriber_count?: number;
  };
  view_count: number;
  like_count: number;
  comment_count: number;
  tags: string[];
  category: string;
  language: string;
  captions_available: boolean;
  thumbnail_url: string;
  url: string;
}

export interface IVideoTranscription {
  video_id: string;
  language: string;
  confidence: number;
  segments: Array<{
    start_time: number;
    end_time: number;
    text: string;
    confidence: number;
  }>;
  full_text: string;
  keywords: string[];
  topics: string[];
  minecraft_version_mentions: string[];
  loader_type_mentions: string[];
}

export interface IVideoAnalysis {
  metadata: IVideoMetadata;
  transcription?: IVideoTranscription;
  relevance_score: number;
  content_classification: {
    type: 'tutorial' | 'showcase' | 'review' | 'news' | 'technical' | 'other';
    confidence: number;
  };
  modding_relevance: {
    is_modding_related: boolean;
    confidence: number;
    detected_topics: string[];
    minecraft_version: string | null;
    loader_type: string | null;
  };
  quality_indicators: {
    audio_quality: 'high' | 'medium' | 'low';
    video_quality: 'high' | 'medium' | 'low';
    educational_value: number;
    technical_depth: number;
  };
}

/**
 * Video content discovery and analysis system
 */
export class VideoDiscovery {
  private options: IVideoDiscoveryOptions;
  private sourceItemFactory: SourceItemFactory;
  private contentAnalyzer: ContentAnalyzer;
  private mlAnalyzer: MLContentAnalyzer;
  private youtubeApiBase = 'https://www.googleapis.com/youtube/v3';

  constructor(options: IVideoDiscoveryOptions = {}) {
    this.options = {
      userAgent: options.userAgent || 'porter-bridges/1.0.0',
      timeout: options.timeout || 60_000, // Videos take longer to process
      retryAttempts: options.retryAttempts || 3,
      maxVideoResults: options.maxVideoResults || 20,
      transcriptionService: options.transcriptionService || 'youtube',
      enableSubtitleDownload: options.enableSubtitleDownload !== false,
      enableThumbnailAnalysis: options.enableThumbnailAnalysis !== false,
      minVideoDuration: options.minVideoDuration || 60, // 1 minute minimum
      maxVideoDuration: options.maxVideoDuration || 3600, // 1 hour maximum
      ...options,
    };

    this.sourceItemFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
    this.mlAnalyzer = new MLContentAnalyzer();
  }

  /**
   * Discover sources from video content
   */
  async discoverFromVideos(
    sourceId: string,
    config: ISourceConfig,
    discoveredSources: Map<string, ISourceItem>
  ): Promise<void> {
    logger.info(`🎥 Discovering from video sources: ${sourceId}`);

    try {
      // Search for relevant videos
      const videoMetadata = await this.searchRelevantVideos(config);
      logger.info(
        `📹 Found ${videoMetadata.length} potentially relevant videos`
      );

      // Analyze each video
      const videoAnalyses: IVideoAnalysis[] = [];

      for (const metadata of videoMetadata) {
        try {
          const analysis = await this.analyzeVideo(metadata);

          if (analysis.relevance_score > 0.5) {
            videoAnalyses.push(analysis);
          }
        } catch (error) {
          logger.error(`Failed to analyze video ${metadata.id}:`, error);
        }
      }

      logger.info(
        `📊 ${videoAnalyses.length} videos passed relevance threshold`
      );

      // Convert to source items
      for (const analysis of videoAnalyses) {
        const sourceItem = this.createSourceItemFromVideoAnalysis(
          analysis,
          config,
          sourceId
        );

        if (sourceItem) {
          discoveredSources.set(sourceItem.url, sourceItem);
        }
      }

      logger.info(
        `✅ Successfully discovered ${videoAnalyses.length} video sources`
      );
    } catch (error) {
      logger.error(
        `❌ Failed to discover from video sources ${sourceId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Search for relevant videos using YouTube API
   */
  private async searchRelevantVideos(
    config: ISourceConfig
  ): Promise<IVideoMetadata[]> {
    if (!this.options.youtubeApiKey) {
      logger.warn('YouTube API key not provided, skipping video discovery');
      return [];
    }

    const searchQueries = this.generateSearchQueries(config);
    const allVideos: IVideoMetadata[] = [];

    for (const query of searchQueries) {
      try {
        const videos = await this.searchYouTubeVideos(query);
        allVideos.push(...videos);
      } catch (error) {
        logger.error(
          `Failed to search for videos with query "${query}":`,
          error
        );
      }
    }

    // Remove duplicates and filter by duration
    const uniqueVideos = this.removeDuplicateVideos(allVideos);
    const filteredVideos = uniqueVideos.filter(
      (video) =>
        video.duration >= this.options.minVideoDuration! &&
        video.duration <= this.options.maxVideoDuration!
    );

    return filteredVideos.slice(0, this.options.maxVideoResults);
  }

  /**
   * Generate search queries based on source configuration
   */
  private generateSearchQueries(config: ISourceConfig): string[] {
    const baseQueries = [
      'minecraft mod tutorial',
      'minecraft modding guide',
      'minecraft forge tutorial',
      'minecraft fabric tutorial',
      'minecraft neoforge tutorial',
    ];

    const versionQueries = [
      'minecraft 1.21 modding',
      'minecraft 1.20 modding',
      'minecraft modding 2024',
    ];

    const loaderSpecificQueries = [];
    if (config.loader_type === 'forge') {
      loaderSpecificQueries.push('minecraft forge mod development');
    } else if (config.loader_type === 'fabric') {
      loaderSpecificQueries.push('minecraft fabric mod development');
    } else if (config.loader_type === 'neoforge') {
      loaderSpecificQueries.push('minecraft neoforge mod development');
    }

    return [...baseQueries, ...versionQueries, ...loaderSpecificQueries];
  }

  /**
   * Search YouTube videos using YouTube Data API
   */
  private async searchYouTubeVideos(query: string): Promise<IVideoMetadata[]> {
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      order: 'relevance',
      maxResults: '10',
      key: this.options.youtubeApiKey!,
    });

    const searchResponse = await fetch(
      `${this.youtubeApiBase}/search?${searchParams.toString()}`
    );

    if (!searchResponse.ok) {
      throw new Error(`YouTube API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const videoIds = searchData.items.map((item: any) => item.id.videoId);

    if (videoIds.length === 0) {
      return [];
    }

    // Get detailed video information
    const videoParams = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: videoIds.join(','),
      key: this.options.youtubeApiKey!,
    });

    const videoResponse = await fetch(
      `${this.youtubeApiBase}/videos?${videoParams.toString()}`
    );

    if (!videoResponse.ok) {
      throw new Error(`YouTube API error: ${videoResponse.status}`);
    }

    const videoData = await videoResponse.json();

    return videoData.items.map((item: any) => this.parseVideoMetadata(item));
  }

  /**
   * Parse YouTube API response to video metadata
   */
  private parseVideoMetadata(apiResponse: any): IVideoMetadata {
    const duration = this.parseDuration(apiResponse.contentDetails.duration);

    return {
      id: apiResponse.id,
      title: apiResponse.snippet.title,
      description: apiResponse.snippet.description,
      duration,
      published_at: apiResponse.snippet.publishedAt,
      channel: {
        id: apiResponse.snippet.channelId,
        name: apiResponse.snippet.channelTitle,
      },
      view_count: Number.parseInt(apiResponse.statistics.viewCount || '0'),
      like_count: Number.parseInt(apiResponse.statistics.likeCount || '0'),
      comment_count: Number.parseInt(
        apiResponse.statistics.commentCount || '0'
      ),
      tags: apiResponse.snippet.tags || [],
      category: apiResponse.snippet.categoryId,
      language: apiResponse.snippet.defaultLanguage || 'en',
      captions_available: apiResponse.contentDetails.caption === 'true',
      thumbnail_url: apiResponse.snippet.thumbnails.high?.url || '',
      url: `https://www.youtube.com/watch?v=${apiResponse.id}`,
    };
  }

  /**
   * Parse YouTube duration format (PT1H2M3S) to seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = Number.parseInt(match[1] || '0');
    const minutes = Number.parseInt(match[2] || '0');
    const seconds = Number.parseInt(match[3] || '0');

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Analyze video content for relevance and quality
   */
  private async analyzeVideo(
    metadata: IVideoMetadata
  ): Promise<IVideoAnalysis> {
    logger.info(`🔍 Analyzing video: ${metadata.title}`);

    // Get transcription if available
    const transcription = await this.getVideoTranscription(metadata);

    // Analyze content
    const contentText = `${metadata.title} ${metadata.description} ${transcription?.full_text || ''}`;
    const relevanceScore =
      this.contentAnalyzer.calculatePortingRelevance(contentText);

    // Classify content type
    const contentClassification = this.classifyVideoContent(
      metadata,
      transcription
    );

    // Analyze modding relevance
    const moddingRelevance = this.analyzeModdingRelevance(
      metadata,
      transcription
    );

    // Assess quality indicators
    const qualityIndicators = this.assessVideoQuality(metadata, transcription);

    return {
      metadata,
      transcription,
      relevance_score: relevanceScore,
      content_classification: contentClassification,
      modding_relevance: moddingRelevance,
      quality_indicators: qualityIndicators,
    };
  }

  /**
   * Get video transcription/captions
   */
  private async getVideoTranscription(
    metadata: IVideoMetadata
  ): Promise<IVideoTranscription | undefined> {
    if (!(this.options.enableSubtitleDownload && metadata.captions_available)) {
      return;
    }

    try {
      // This is a simplified implementation - in reality you'd use youtube-dl,
      // yt-dlp, or similar tools to extract captions
      const captions = await this.extractYouTubeCaptions(metadata.id);

      if (captions) {
        return this.processTranscription(metadata.id, captions);
      }
    } catch (error) {
      logger.error(
        `Failed to get transcription for video ${metadata.id}:`,
        error
      );
    }

    return;
  }

  /**
   * Extract YouTube captions (simplified implementation)
   */
  private async extractYouTubeCaptions(
    videoId: string
  ): Promise<string | null> {
    // This is a placeholder - in a real implementation you would:
    // 1. Use youtube-dl or yt-dlp to extract captions
    // 2. Use YouTube's caption API if available
    // 3. Use a third-party transcription service

    // For now, return null to indicate no captions available
    return null;
  }

  /**
   * Process raw transcription into structured format
   */
  private processTranscription(
    videoId: string,
    rawCaptions: string
  ): IVideoTranscription {
    

    // Extract keywords and topics
    const keywords = this.contentAnalyzer.extractTags(rawCaptions, '');
    const topics = []; // Would extract using NLP

    // Extract version mentions
    const versionMentions = this.contentAnalyzer.extractMinecraftVersion(
      rawCaptions,
      ''
    );

    // Extract loader type mentions
    const loaderMentions = this.extractLoaderTypeMentions(rawCaptions);

    return {
      video_id: videoId,
      language: 'en',
      confidence: 0.8,
      segments: [], // Would parse individual segments
      full_text: rawCaptions,
      keywords,
      topics,
      minecraft_version_mentions: versionMentions ? [versionMentions] : [],
      loader_type_mentions: loaderMentions,
    };
  }

  /**
   * Classify video content type
   */
  private classifyVideoContent(
    metadata: IVideoMetadata,
    transcription?: IVideoTranscription
  ): IVideoAnalysis['content_classification'] {
    const text =
      `${metadata.title} ${metadata.description} ${transcription?.full_text || ''}`.toLowerCase();

    const patterns = {
      tutorial: ['tutorial', 'how to', 'guide', 'learn', 'step by step'],
      showcase: ['showcase', 'demo', 'showing', 'preview', 'look at'],
      review: ['review', 'thoughts', 'opinion', 'rating', 'pros and cons'],
      news: ['news', 'update', 'announcement', 'released', 'coming'],
      technical: ['technical', 'deep dive', 'advanced', 'programming', 'code'],
    };

    let bestMatch: keyof typeof patterns = 'other';
    let bestScore = 0;

    for (const [type, keywords] of Object.entries(patterns)) {
      const score = keywords.reduce((sum, keyword) => {
        return sum + (text.includes(keyword) ? 1 : 0);
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = type as keyof typeof patterns;
      }
    }

    return {
      type: bestMatch as any,
      confidence: Math.min(bestScore / 3, 1.0),
    };
  }

  /**
   * Analyze modding relevance
   */
  private analyzeModdingRelevance(
    metadata: IVideoMetadata,
    transcription?: IVideoTranscription
  ): IVideoAnalysis['modding_relevance'] {
    const text =
      `${metadata.title} ${metadata.description} ${transcription?.full_text || ''}`.toLowerCase();

    const moddingKeywords = [
      'mod',
      'modding',
      'forge',
      'fabric',
      'neoforge',
      'minecraft',
    ];
    const moddingScore = moddingKeywords.reduce((score, keyword) => {
      return score + (text.includes(keyword) ? 1 : 0);
    }, 0);

    const isModdingRelated = moddingScore >= 2;
    const confidence = Math.min(moddingScore / 4, 1.0);

    // Extract detected topics
    const detectedTopics = [];
    if (text.includes('tutorial')) detectedTopics.push('tutorial');
    if (text.includes('api')) detectedTopics.push('api');
    if (text.includes('development')) detectedTopics.push('development');

    // Extract versions and loaders
    const minecraftVersion = this.contentAnalyzer.extractMinecraftVersion(
      text,
      ''
    );
    const loaderType = this.extractLoaderType(text);

    return {
      is_modding_related: isModdingRelated,
      confidence,
      detected_topics: detectedTopics,
      minecraft_version: minecraftVersion,
      loader_type: loaderType,
    };
  }

  /**
   * Assess video quality indicators
   */
  private assessVideoQuality(
    metadata: IVideoMetadata,
    transcription?: IVideoTranscription
  ): IVideoAnalysis['quality_indicators'] {
    // Quality assessment based on various factors

    const audioQuality =
      transcription?.confidence > 0.8
        ? 'high'
        : transcription?.confidence > 0.6
          ? 'medium'
          : 'low';

    const videoQuality =
      metadata.view_count > 1000
        ? 'high'
        : metadata.view_count > 100
          ? 'medium'
          : 'low';

    const educationalValue = this.assessEducationalValue(
      metadata,
      transcription
    );
    const technicalDepth = this.assessTechnicalDepth(metadata, transcription);

    return {
      audio_quality: audioQuality as any,
      video_quality: videoQuality as any,
      educational_value: educationalValue,
      technical_depth: technicalDepth,
    };
  }

  /**
   * Create source item from video analysis
   */
  private createSourceItemFromVideoAnalysis(
    analysis: IVideoAnalysis,
    config: ISourceConfig,
    sourceId: string
  ): ISourceItem | null {
    try {
      const {
        metadata,
        transcription,
        relevance_score,
        content_classification,
        modding_relevance,
      } = analysis;

      // Determine priority based on relevance and quality
      const priority =
        relevance_score > 0.8
          ? 'high'
          : relevance_score > 0.6
            ? 'medium'
            : 'low';

      // Generate tags
      const tags = [
        'video',
        content_classification.type,
        ...metadata.tags.slice(0, 5),
        ...(transcription?.keywords || []).slice(0, 5),
      ];

      const sourceItem: ISourceItem = {
        status: 'discovered',
        url: metadata.url,
        source_type: 'guide',
        title: metadata.title,
        minecraft_version: modding_relevance.minecraft_version || undefined,
        loader_type:
          (modding_relevance.loader_type as any) || config.loader_type,
        priority: priority as any,
        tags,
        relevance_score,
        content_type: 'video/mp4',
        metadata: {
          video_id: metadata.id,
          channel_name: metadata.channel.name,
          duration: metadata.duration,
          view_count: metadata.view_count,
          like_count: metadata.like_count,
          published_at: metadata.published_at,
          content_classification: content_classification.type,
          modding_relevance: modding_relevance.is_modding_related,
          has_transcription: !!transcription,
          quality_score: analysis.quality_indicators.educational_value,
        },
      };

      return this.sourceItemFactory.createSourceItem(sourceItem);
    } catch (error) {
      logger.error('Failed to create source item from video analysis:', error);
      return null;
    }
  }

  /**
   * Helper methods
   */
  private removeDuplicateVideos(videos: IVideoMetadata[]): IVideoMetadata[] {
    const seen = new Set<string>();
    return videos.filter((video) => {
      if (seen.has(video.id)) {
        return false;
      }
      seen.add(video.id);
      return true;
    });
  }

  private extractLoaderTypeMentions(text: string): string[] {
    const loaderTypes = ['forge', 'fabric', 'neoforge', 'quilt'];
    const mentions = [];

    for (const loader of loaderTypes) {
      if (text.toLowerCase().includes(loader)) {
        mentions.push(loader);
      }
    }

    return mentions;
  }

  private extractLoaderType(text: string): string | null {
    const loaderTypes = ['forge', 'fabric', 'neoforge', 'quilt'];

    for (const loader of loaderTypes) {
      if (text.includes(loader)) {
        return loader;
      }
    }

    return null;
  }

  private assessEducationalValue(
    metadata: IVideoMetadata,
    transcription?: IVideoTranscription
  ): number {
    let score = 0;

    // Based on title and description
    const text = `${metadata.title} ${metadata.description}`.toLowerCase();
    const educationalKeywords = [
      'tutorial',
      'guide',
      'learn',
      'how to',
      'step by step',
    ];

    for (const keyword of educationalKeywords) {
      if (text.includes(keyword)) {
        score += 0.2;
      }
    }

    // Based on duration (longer videos might be more educational)
    if (metadata.duration > 600) score += 0.1; // 10+ minutes
    if (metadata.duration > 1200) score += 0.1; // 20+ minutes

    // Based on engagement
    const engagementRatio =
      metadata.like_count / Math.max(metadata.view_count, 1);
    score += Math.min(engagementRatio * 10, 0.2);

    return Math.min(score, 1.0);
  }

  private assessTechnicalDepth(
    metadata: IVideoMetadata,
    transcription?: IVideoTranscription
  ): number {
    let score = 0;

    const text =
      `${metadata.title} ${metadata.description} ${transcription?.full_text || ''}`.toLowerCase();
    const technicalKeywords = [
      'code',
      'programming',
      'advanced',
      'technical',
      'api',
      'development',
    ];

    for (const keyword of technicalKeywords) {
      if (text.includes(keyword)) {
        score += 0.15;
      }
    }

    // Check for code-related tags
    const codeRelatedTags = metadata.tags.filter((tag) =>
      ['programming', 'coding', 'development', 'tutorial'].includes(
        tag.toLowerCase()
      )
    );

    score += codeRelatedTags.length * 0.1;

    return Math.min(score, 1.0);
  }
}

export default VideoDiscovery;
