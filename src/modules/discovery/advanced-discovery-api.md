# Advanced Source Discovery API - Phase 2.1

This document provides comprehensive API documentation for the Phase 2.1 Advanced Source Discovery improvements implemented in Porter Bridges.

## Overview

Phase 2.1 introduces five major enhancements to the source discovery system:

1. **ML-Based Content Analysis** - Intelligent content relevance scoring using machine learning
2. **Discord Integration** - Changelog parsing from Discord channels and webhooks
3. **Community Submission System** - Community-driven source validation and approval
4. **Dynamic Source Discovery** - Trending-based discovery using GitHub activity analysis
5. **Video Content Analysis** - YouTube video transcription and analysis

## ML-Based Content Analysis

### MLContentAnalyzer

The `MLContentAnalyzer` class provides advanced content analysis using natural language processing and machine learning techniques.

```typescript
import { MLContentAnalyzer } from '../utils/ml-content-analyzer';

const analyzer = new MLContentAnalyzer();

// Analyze content
const result = await analyzer.analyzeContent({
  id: 'content-id',
  title: 'Minecraft 1.21 NeoForge Migration Guide',
  content: 'This guide covers breaking changes...',
  source_type: 'guide',
  minecraft_version: '1.21',
  loader_type: 'neoforge'
});
```

#### ContentAnalysisResult

```typescript
interface ContentAnalysisResult {
  relevance_score: number;          // 0-1 relevance score
  confidence: number;               // 0-1 confidence in analysis
  topics: string[];                 // Extracted topics
  keywords: string[];               // Relevant keywords
  sentiment: 'positive' | 'negative' | 'neutral';
  content_type: 'tutorial' | 'changelog' | 'guide' | 'announcement' | 'documentation';
  complexity_score: number;         // 0-1 technical complexity
  version_mentions: string[];       // Minecraft versions mentioned
  breaking_changes_likelihood: number; // 0-1 likelihood of breaking changes
  tags: string[];                   // Generated tags
  similar_content_ids: string[];    // Similar content IDs
}
```

#### Key Features

- **Semantic Analysis**: Uses TF-IDF and natural language processing
- **Domain Knowledge**: Minecraft and mod development specific terms
- **Similarity Detection**: Finds related content using cosine similarity
- **Version Extraction**: Automatically detects Minecraft versions
- **Sentiment Analysis**: Determines content sentiment
- **Content Classification**: Categorizes content type automatically

## Discord Integration

### DiscordDiscovery

The `DiscordDiscovery` class enables changelog parsing from Discord channels and webhooks.

```typescript
import { DiscordDiscovery } from '../modules/discovery/discord-discovery';

const discovery = new DiscordDiscovery({
  timeout: 30000,
  maxMessages: 100
});

// Discover from Discord channel
await discovery.discoverFromDiscordChannel(
  'fabric_announcements',
  {
    type: 'discord_channel',
    guild_id: '507304429255393322',
    channel_id: '507982666755670019',
    bot_token: 'YOUR_BOT_TOKEN',
    message_filters: {
      keywords: ['release', 'update', 'changelog'],
      min_length: 50,
      max_age_days: 30
    }
  },
  discoveredSources
);
```

#### Message Filtering

```typescript
interface MessageFilters {
  keywords?: string[];           // Required keywords
  exclude_keywords?: string[];   // Keywords to exclude
  user_ids?: string[];          // Filter by user IDs
  min_length?: number;          // Minimum message length
  max_age_days?: number;        // Maximum message age
}
```

#### Webhook Support

```typescript
// Discover from Discord webhook
await discovery.discoverFromDiscordWebhook(
  'neoforge_releases',
  {
    type: 'discord_webhook',
    webhook_url: 'https://discord.com/api/webhooks/ID/TOKEN',
    webhook_filters: {
      username_patterns: ['.*bot.*'],
      content_patterns: ['release.*'],
      embed_required: true
    }
  },
  discoveredSources
);
```

## Community Submission System

### CommunityDiscovery

The `CommunityDiscovery` class provides a comprehensive community-driven source submission system.

```typescript
import { CommunityDiscovery } from '../modules/discovery/community-discovery';

const community = new CommunityDiscovery({
  submissionsDir: './community-submissions',
  maxSubmissionsPerUser: 10,
  autoApproveThreshold: 0.8,
  enableCommunityVoting: true,
  minVotesForApproval: 3
});

await community.initialize();
```

#### Submitting Sources

```typescript
const result = await community.submitSource({
  url: 'https://example.com/guide',
  title: 'Minecraft 1.21 Modding Guide',
  description: 'Comprehensive guide for 1.21 modding',
  source_type: 'guide',
  loader_type: 'neoforge',
  minecraft_version: '1.21',
  tags: ['tutorial', 'neoforge', '1.21'],
  category: 'tutorial',
  submitter: {
    username: 'developer123',
    email: 'dev@example.com',
    github_username: 'developer123'
  }
});

console.log(result.success); // true/false
console.log(result.submissionId); // Generated ID
console.log(result.message); // Status message
```

#### Review System

```typescript
// Review a submission
await community.reviewSubmission(
  'submission_id',
  'reviewer_username',
  'approve', // 'approve' | 'reject' | 'request_changes'
  'Looks good, high quality content'
);

// Add community feedback
await community.addFeedback(
  'submission_id',
  'community_member',
  'upvote' // 'upvote' | 'downvote' | 'comment'
);
```

#### Contributor Statistics

```typescript
const stats = await community.getContributorStats('username');
console.log(stats.total_submissions);
console.log(stats.approved_submissions);
console.log(stats.reputation_score);
console.log(stats.badges); // ['First Contribution', 'Active Contributor']
```

## Dynamic Source Discovery

### DynamicDiscovery

The `DynamicDiscovery` class provides intelligent source discovery based on GitHub trending analysis and community activity.

```typescript
import { DynamicDiscovery } from '../modules/discovery/dynamic-discovery';

const dynamic = new DynamicDiscovery({
  githubToken: 'YOUR_GITHUB_TOKEN',
  maxTrendingRepos: 50,
  trendingAnalysisPeriod: 'weekly',
  enableActivityAnalysis: true,
  enableTopicAnalysis: true,
  enableCommunityTracking: true
});

// Discover dynamic sources
const insights = await dynamic.discoverDynamicSources(
  'github_trending',
  config,
  discoveredSources
);
```

#### Discovery Insights

```typescript
interface DiscoveryInsight {
  type: 'trending_repo' | 'active_repo' | 'hot_topic' | 'community_interest';
  confidence: number;
  relevance_score: number;
  data: any;
  discovery_reason: string;
  potential_sources: string[];
  recommended_actions: string[];
}
```

#### Repository Analysis

```typescript
interface ActivityAnalysis {
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
```

## Video Content Analysis

### VideoDiscovery

The `VideoDiscovery` class provides YouTube video discovery and analysis capabilities.

```typescript
import { VideoDiscovery } from '../modules/discovery/video-discovery';

const video = new VideoDiscovery({
  youtubeApiKey: 'YOUR_YOUTUBE_API_KEY',
  maxVideoResults: 20,
  minVideoDuration: 300,  // 5 minutes
  maxVideoDuration: 3600, // 1 hour
  enableSubtitleDownload: true,
  enableThumbnailAnalysis: true
});

// Discover from videos
await video.discoverFromVideos(
  'minecraft_tutorials',
  config,
  discoveredSources
);
```

#### Video Analysis

```typescript
interface VideoAnalysis {
  metadata: VideoMetadata;
  transcription?: VideoTranscription;
  relevance_score: number;
  content_classification: {
    type: 'tutorial' | 'showcase' | 'review' | 'news' | 'technical';
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
```

## Enhanced Discovery Core

### Updated DiscoveryCore

The `DiscoveryCore` class has been enhanced to support all new discovery types:

```typescript
import { DiscoveryCore } from '../modules/discovery/discovery-core';

const core = new DiscoveryCore({
  cacheDirectory: './.discovery-cache',
  // Traditional options
  timeout: 30000,
  retryAttempts: 3,
  // Discord options
  maxMessages: 100,
  // Video options
  youtubeApiKey: 'YOUR_KEY',
  maxVideoResults: 20,
  // Dynamic discovery options
  githubToken: 'YOUR_GITHUB_TOKEN',
  maxTrendingRepos: 50,
  // Community options
  submissionsDir: './community-submissions',
  maxSubmissionsPerUser: 10
});

// Run discovery
const results = await core.discover();
```

### New Source Types

The system now supports these additional source types:

- `discord_channel` - Discord channel messages
- `discord_webhook` - Discord webhook messages  
- `video_discovery` - YouTube video content
- `dynamic_discovery` - GitHub trending analysis
- `community_discovery` - Community submissions

## Configuration Examples

### Source Configuration

```typescript
// Discord channel configuration
{
  type: 'discord_channel',
  url: 'https://discord.com/channels/GUILD_ID/CHANNEL_ID',
  source_type: 'changelog',
  loader_type: 'fabric',
  description: 'Fabric Discord announcements',
  guild_id: 'GUILD_ID',
  channel_id: 'CHANNEL_ID',
  bot_token: 'BOT_TOKEN',
  message_filters: {
    keywords: ['release', 'update'],
    min_length: 50,
    max_age_days: 30
  }
}

// Video discovery configuration
{
  type: 'video_discovery',
  url: 'https://www.youtube.com/results?search_query=minecraft+modding',
  source_type: 'guide',
  loader_type: 'vanilla',
  description: 'YouTube modding tutorials',
  youtubeApiKey: 'YOUR_KEY',
  maxVideoResults: 20,
  minVideoDuration: 300,
  maxVideoDuration: 3600
}

// Dynamic discovery configuration
{
  type: 'dynamic_discovery',
  url: 'https://github.com/trending',
  source_type: 'guide',
  loader_type: 'vanilla',
  description: 'GitHub trending repositories',
  githubToken: 'YOUR_TOKEN',
  maxTrendingRepos: 50,
  trendingAnalysisPeriod: 'weekly'
}

// Community discovery configuration
{
  type: 'community_discovery',
  url: 'community://submissions',
  source_type: 'guide',
  loader_type: 'vanilla',
  description: 'Community-submitted sources',
  submissionsDir: './community-submissions',
  maxSubmissionsPerUser: 10
}
```

## Error Handling

All discovery modules implement comprehensive error handling:

```typescript
try {
  await discovery.discoverFromDiscordChannel(sourceId, config, sources);
} catch (error) {
  logger.error(`Discovery failed: ${error.message}`);
  // Discovery continues with other sources
}
```

## Performance Considerations

### Caching

- **Repository Analysis**: Cached for 1 hour
- **Topic Analysis**: Cached for 24 hours
- **Video Metadata**: Cached for 6 hours
- **ML Analysis**: Results cached per content hash

### Rate Limiting

- **GitHub API**: Respects GitHub rate limits
- **YouTube API**: Implements quota management
- **Discord API**: Uses recommended rate limits

### Parallel Processing

- Multiple discovery sources run in parallel
- Individual source failures don't affect others
- Graceful degradation when services are unavailable

## Security Considerations

### API Keys

- All API keys should be stored securely
- Use environment variables or secure config files
- Implement key rotation policies

### Discord Bot Permissions

- Minimal required permissions (Read Messages, Read Message History)
- Channel-specific access only
- No administrative permissions required

### Content Validation

- All community submissions are validated
- URL accessibility checks
- Content relevance verification
- Malicious content detection

## Monitoring and Observability

### Metrics

- Discovery success/failure rates
- Processing times per source type
- Content quality scores
- Community engagement metrics

### Logging

- Structured logging for all discovery operations
- Error tracking with context
- Performance monitoring
- Audit trails for community submissions

## Future Enhancements

### Planned Features

- **Advanced ML Models**: Integration with transformer models
- **Real-time Discovery**: WebSocket-based live updates
- **Multi-language Support**: Content analysis in multiple languages
- **Advanced Filtering**: Custom filter expressions
- **API Endpoints**: REST API for external integrations

### Community Features

- **Reputation System**: Advanced contributor scoring
- **Moderation Tools**: Community moderation capabilities
- **Integration APIs**: Third-party integration support
- **Analytics Dashboard**: Community insights and metrics

## Conclusion

The Phase 2.1 Advanced Source Discovery system provides a comprehensive, intelligent, and community-driven approach to discovering mod porting information. The ML-powered analysis, combined with diverse source types and community validation, creates a robust foundation for automated mod porting intelligence.

For additional examples and detailed implementation guides, see the test files in `src/modules/discovery/tests/`.