/**
 * @file Discord Discovery - Discover changelog content from Discord channels
 *
 * This module provides Discord API integration for discovering changelog content
 * from Discord channels, webhooks, and announcement channels.
 */

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import type { APIMessage, APIChannel } from 'discord-api-types/v10';
import { logger } from '../../utils/logger';
import { SourceItemFactory, type ISourceItem } from './source-item-factory';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';

export interface IDiscordDiscoveryOptions {
  userAgent?: string;
  timeout?: number;
  retryAttempts?: number;
  maxMessages?: number;
}

export interface IDiscordChannelConfig extends ISourceConfig {
  type: 'discord_channel';
  guild_id: string;
  channel_id: string;
  bot_token?: string;
  webhook_url?: string;
  message_filters?: {
    keywords?: string[];
    exclude_keywords?: string[];
    user_ids?: string[];
    min_length?: number;
    max_age_days?: number;
  };
}

export interface IDiscordWebhookConfig extends ISourceConfig {
  type: 'discord_webhook';
  webhook_url: string;
  guild_id?: string;
  channel_id?: string;
  webhook_filters?: {
    username_patterns?: string[];
    content_patterns?: string[];
    embed_required?: boolean;
  };
}

/**
 * Discord discovery engine for changelog content
 */
export class DiscordDiscovery {
  private rest: REST | null = null;
  private sourceItemFactory: SourceItemFactory;
  private contentAnalyzer: ContentAnalyzer;
  private options: IDiscordDiscoveryOptions;

  constructor(options: IDiscordDiscoveryOptions = {}) {
    this.options = {
      userAgent: options.userAgent || 'porter-bridges/1.0.0',
      timeout: options.timeout || 30000,
      retryAttempts: options.retryAttempts || 3,
      maxMessages: options.maxMessages || 100,
    };

    this.sourceItemFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
  }

  /**
   * Initialize Discord REST client with bot token
   */
  private initializeRestClient(botToken: string) {
    if (!this.rest) {
      this.rest = new REST({ version: '10' }).setToken(botToken);
    }
  }

  /**
   * Discover sources from Discord channel
   */
  async discoverFromDiscordChannel(
    sourceId: string,
    config: IDiscordChannelConfig,
    discoveredSources: Map<string, ISourceItem>
  ): Promise<void> {
    if (!config.bot_token) {
      throw new Error('Bot token is required for Discord channel discovery');
    }

    this.initializeRestClient(config.bot_token);

    try {
      logger.info(`🔍 Discovering from Discord channel: ${config.channel_id}`);

      // Get channel info
      const channel = await this.rest!.get(
        Routes.channel(config.channel_id)
      ) as APIChannel;

      logger.info(`📢 Found channel: ${channel.name || 'Unknown'}`);

      // Get recent messages
      const messages = await this.rest!.get(
        Routes.channelMessages(config.channel_id),
        {
          query: new URLSearchParams({
            limit: this.options.maxMessages!.toString(),
          }),
        }
      ) as APIMessage[];

      logger.info(`📨 Found ${messages.length} messages`);

      // Filter and process messages
      const relevantMessages = this.filterMessages(messages, config.message_filters);
      logger.info(`📊 Filtered to ${relevantMessages.length} relevant messages`);

      // Convert messages to source items
      for (const message of relevantMessages) {
        const sourceItem = this.createSourceItemFromMessage(
          message,
          config,
          sourceId,
          channel
        );

        if (sourceItem) {
          discoveredSources.set(sourceItem.url, sourceItem);
        }
      }

      logger.info(`✅ Successfully discovered ${relevantMessages.length} sources from Discord channel`);
    } catch (error) {
      logger.error(`❌ Failed to discover from Discord channel ${config.channel_id}:`, error);
      throw error;
    }
  }

  /**
   * Discover sources from Discord webhook
   */
  async discoverFromDiscordWebhook(
    sourceId: string,
    config: IDiscordWebhookConfig,
    discoveredSources: Map<string, ISourceItem>
  ): Promise<void> {
    try {
      logger.info(`🔍 Discovering from Discord webhook: ${config.webhook_url}`);

      // Parse webhook URL to extract info
      const webhookInfo = this.parseWebhookUrl(config.webhook_url);
      
      if (!webhookInfo) {
        throw new Error('Invalid webhook URL format');
      }

      // Get webhook messages using REST API
      const response = await fetch(
        `${config.webhook_url}/messages?limit=${this.options.maxMessages}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': this.options.userAgent!,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const messages = await response.json() as APIMessage[];
      logger.info(`📨 Found ${messages.length} webhook messages`);

      // Filter messages based on webhook filters
      const relevantMessages = this.filterWebhookMessages(messages, config.webhook_filters);
      logger.info(`📊 Filtered to ${relevantMessages.length} relevant webhook messages`);

      // Convert messages to source items
      for (const message of relevantMessages) {
        const sourceItem = this.createSourceItemFromWebhookMessage(
          message,
          config,
          sourceId,
          webhookInfo
        );

        if (sourceItem) {
          discoveredSources.set(sourceItem.url, sourceItem);
        }
      }

      logger.info(`✅ Successfully discovered ${relevantMessages.length} sources from Discord webhook`);
    } catch (error) {
      logger.error(`❌ Failed to discover from Discord webhook ${config.webhook_url}:`, error);
      throw error;
    }
  }

  /**
   * Filter messages based on criteria
   */
  private filterMessages(
    messages: APIMessage[],
    filters?: IDiscordChannelConfig['message_filters']
  ): APIMessage[] {
    if (!filters) return messages;

    return messages.filter(message => {
      // Check message length
      if (filters.min_length && message.content.length < filters.min_length) {
        return false;
      }

      // Check keywords
      if (filters.keywords && filters.keywords.length > 0) {
        const hasKeyword = filters.keywords.some(keyword =>
          message.content.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!hasKeyword) return false;
      }

      // Check exclude keywords
      if (filters.exclude_keywords && filters.exclude_keywords.length > 0) {
        const hasExcludeKeyword = filters.exclude_keywords.some(keyword =>
          message.content.toLowerCase().includes(keyword.toLowerCase())
        );
        if (hasExcludeKeyword) return false;
      }

      // Check user IDs
      if (filters.user_ids && filters.user_ids.length > 0) {
        if (!filters.user_ids.includes(message.author.id)) {
          return false;
        }
      }

      // Check age
      if (filters.max_age_days) {
        const messageDate = new Date(message.timestamp);
        const maxAge = new Date();
        maxAge.setDate(maxAge.getDate() - filters.max_age_days);
        if (messageDate < maxAge) return false;
      }

      // Check for changelog-related content
      return this.isChangelogRelevant(message.content);
    });
  }

  /**
   * Filter webhook messages based on criteria
   */
  private filterWebhookMessages(
    messages: APIMessage[],
    filters?: IDiscordWebhookConfig['webhook_filters']
  ): APIMessage[] {
    if (!filters) return messages;

    return messages.filter(message => {
      // Check username patterns
      if (filters.username_patterns && filters.username_patterns.length > 0) {
        const username = message.author.username || '';
        const hasPattern = filters.username_patterns.some(pattern =>
          new RegExp(pattern, 'i').test(username)
        );
        if (!hasPattern) return false;
      }

      // Check content patterns
      if (filters.content_patterns && filters.content_patterns.length > 0) {
        const hasPattern = filters.content_patterns.some(pattern =>
          new RegExp(pattern, 'i').test(message.content)
        );
        if (!hasPattern) return false;
      }

      // Check embed requirement
      if (filters.embed_required && (!message.embeds || message.embeds.length === 0)) {
        return false;
      }

      return this.isChangelogRelevant(message.content);
    });
  }

  /**
   * Check if message content is changelog-relevant
   */
  private isChangelogRelevant(content: string): boolean {
    return this.contentAnalyzer.isPortingRelevant('Discord Message', content);
  }

  /**
   * Create source item from Discord message
   */
  private createSourceItemFromMessage(
    message: APIMessage,
    config: IDiscordChannelConfig,
    sourceId: string,
    channel: APIChannel
  ): ISourceItem | null {
    try {
      // Extract content from message and embeds
      let fullContent = message.content;
      if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
          if (embed.title) fullContent += `\n\n**${embed.title}**`;
          if (embed.description) fullContent += `\n${embed.description}`;
          if (embed.fields) {
            for (const field of embed.fields) {
              fullContent += `\n\n**${field.name}**\n${field.value}`;
            }
          }
        }
      }

      // Extract version from content
      const minecraftVersion = this.contentAnalyzer.extractMinecraftVersion(fullContent, '');
      const relevanceScore = this.contentAnalyzer.calculateBlogRelevance(fullContent, '');
      const tags = this.contentAnalyzer.extractTags(fullContent, '');
      const priority = this.contentAnalyzer.determineBlogPriority({
        title: `Discord: ${message.author.username}`,
        description: fullContent
      });

      const sourceItem: ISourceItem = {
        status: 'discovered',
        url: `https://discord.com/channels/${config.guild_id}/${config.channel_id}/${message.id}`,
        source_type: 'changelog',
        title: `Discord: ${message.author.username} - ${fullContent.substring(0, 100)}...`,
        minecraft_version: minecraftVersion || undefined,
        loader_type: config.loader_type as any,
        priority: priority as any,
        tags: tags,
        relevance_score: relevanceScore,
        content_type: 'application/json',
        metadata: {
          discord_message_id: message.id,
          discord_channel_id: config.channel_id,
          discord_guild_id: config.guild_id,
          discord_author: message.author.username,
          discord_timestamp: message.timestamp,
          discord_channel_name: channel.name || 'Unknown',
          message_type: 'channel_message',
          has_embeds: message.embeds ? message.embeds.length > 0 : false,
          embed_count: message.embeds ? message.embeds.length : 0
        }
      };

      return this.sourceItemFactory.createSourceItem(sourceItem);
    } catch (error) {
      logger.error(`Failed to create source item from Discord message ${message.id}:`, error);
      return null;
    }
  }

  /**
   * Create source item from webhook message
   */
  private createSourceItemFromWebhookMessage(
    message: APIMessage,
    config: IDiscordWebhookConfig,
    sourceId: string,
    webhookInfo: { id: string; token: string }
  ): ISourceItem | null {
    try {
      // Similar to channel message processing but for webhook
      let fullContent = message.content;
      if (message.embeds && message.embeds.length > 0) {
        for (const embed of message.embeds) {
          if (embed.title) fullContent += `\n\n**${embed.title}**`;
          if (embed.description) fullContent += `\n${embed.description}`;
        }
      }

      const minecraftVersion = this.contentAnalyzer.extractMinecraftVersion(fullContent, '');
      const relevanceScore = this.contentAnalyzer.calculateBlogRelevance(fullContent, '');
      const tags = this.contentAnalyzer.extractTags(fullContent, '');
      const priority = this.contentAnalyzer.determineBlogPriority({
        title: `Webhook: ${message.author.username}`,
        description: fullContent
      });

      const sourceItem: ISourceItem = {
        status: 'discovered',
        url: `https://discord.com/api/webhooks/${webhookInfo.id}/${webhookInfo.token}/messages/${message.id}`,
        source_type: 'changelog',
        title: `Webhook: ${message.author.username} - ${fullContent.substring(0, 100)}...`,
        minecraft_version: minecraftVersion || undefined,
        loader_type: config.loader_type as any,
        priority: priority as any,
        tags: tags,
        relevance_score: relevanceScore,
        content_type: 'application/json',
        metadata: {
          discord_message_id: message.id,
          discord_webhook_id: webhookInfo.id,
          discord_author: message.author.username,
          discord_timestamp: message.timestamp,
          message_type: 'webhook_message',
          has_embeds: message.embeds ? message.embeds.length > 0 : false,
          embed_count: message.embeds ? message.embeds.length : 0
        }
      };

      return this.sourceItemFactory.createSourceItem(sourceItem);
    } catch (error) {
      logger.error(`Failed to create source item from webhook message ${message.id}:`, error);
      return null;
    }
  }

  /**
   * Parse webhook URL to extract ID and token
   */
  private parseWebhookUrl(url: string): { id: string; token: string } | null {
    const match = url.match(/\/api\/webhooks\/(\d+)\/([^\/]+)/);
    if (!match) return null;

    return {
      id: match[1],
      token: match[2]
    };
  }

  /**
   * Get Discord channel info
   */
  async getChannelInfo(channelId: string, botToken: string): Promise<APIChannel | null> {
    try {
      this.initializeRestClient(botToken);
      return await this.rest!.get(Routes.channel(channelId)) as APIChannel;
    } catch (error) {
      logger.error(`Failed to get channel info for ${channelId}:`, error);
      return null;
    }
  }

  /**
   * Test Discord API connection
   */
  async testConnection(botToken: string): Promise<boolean> {
    try {
      this.initializeRestClient(botToken);
      await this.rest!.get(Routes.user());
      return true;
    } catch (error) {
      logger.error('Discord API connection test failed:', error);
      return false;
    }
  }
}

export default DiscordDiscovery;