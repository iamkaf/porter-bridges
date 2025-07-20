/**
 * @file Content Analyzer - Analyzes content for relevance and metadata
 *
 * This module handles content analysis including relevance scoring,
 * priority determination, and metadata extraction.
 */

import { MLContentAnalyzer } from '../../utils/ml-content-analyzer';

/**
 * Content analyzer class with ML enhancement
 */
export class ContentAnalyzer {
  private mlAnalyzer: MLContentAnalyzer;

  constructor() {
    this.mlAnalyzer = new MLContentAnalyzer();
  }

  /**
   * Analyze content with ML enhancement
   */
  async analyzeContentWithML(content: {
    id: string;
    title: string;
    content: string;
    source_type: string;
    minecraft_version?: string;
    loader_type?: string;
  }) {
    return await this.mlAnalyzer.analyzeContent(content);
  }

  /**
   * Determine if a blog post is relevant to mod porting
   */
  isPortingRelevant(title: string, description: string) {
    const portingKeywords = [
      'migration',
      'porting',
      'update',
      'changes',
      'breaking',
      'api',
      'version',
      'upgrade',
      'compatibility',
      'deprecat',
      'remov',
      '1.20',
      '1.21',
      'minecraft',
      'mod',
    ];

    const text = `${title} ${description}`.toLowerCase();
    return portingKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Calculate porting relevance score (0-1)
   */
  calculatePortingRelevance(text: string) {
    if (!text) {
      return 0;
    }

    const portingKeywords = [
      { keywords: ['breaking', 'breaking change'], weight: 0.3 },
      { keywords: ['migration', 'porting', 'migrate'], weight: 0.2 },
      { keywords: ['api', 'api change', 'deprecated'], weight: 0.15 },
      { keywords: ['version', 'update', 'upgrade'], weight: 0.1 },
      {
        keywords: ['minecraft', 'mod', 'forge', 'fabric', 'neoforge'],
        weight: 0.1,
      },
      { keywords: ['1.20', '1.21', '1.19'], weight: 0.1 },
      { keywords: ['changelog', 'release', 'notes'], weight: 0.05 },
    ];

    const lowerText = text.toLowerCase();
    let score = 0;

    for (const group of portingKeywords) {
      for (const keyword of group.keywords) {
        if (lowerText.includes(keyword)) {
          score += group.weight;
          break; // Only count once per group
        }
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Extract Minecraft version from text
   */
  extractMinecraftVersion(title: string, description: string) {
    const versionRegex = /\b1\.\d+(?:\.\d+)?\b/g;
    const text = `${title} ${description}`;
    const matches = text.match(versionRegex);
    return matches ? matches[0] : null;
  }

  /**
   * Extract relevant tags from content
   */
  extractTags(title: string, description: string) {
    const text = `${title} ${description}`.toLowerCase();
    const tags = [];

    if (text.includes('breaking')) {
      tags.push('breaking_changes');
    }
    if (text.includes('api')) {
      tags.push('api_changes');
    }
    if (text.includes('migration')) {
      tags.push('migration');
    }
    if (text.includes('deprecat')) {
      tags.push('deprecation');
    }
    if (text.includes('remov')) {
      tags.push('removal');
    }

    // Extract version tags
    const versionMatches = text.match(/\b1\.\d+(?:\.\d+)?\b/g);
    if (versionMatches) {
      tags.push(...versionMatches);
    }

    return tags;
  }

  /**
   * Determine priority based on version recency
   */
  determinePriority(version: string) {
    if (!version) {
      return 'low';
    }

    const versionParts = version.split('.').map(Number);
    if (versionParts[1] >= 21) {
      return 'high';
    }
    if (versionParts[1] >= 20) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Determine blog post priority
   */
  determineBlogPriority(post: { title: string; description: string }) {
    const text = `${post.title} ${post.description}`.toLowerCase();
    if (text.includes('breaking') || text.includes('migration')) {
      return 'high';
    }
    if (text.includes('api') || text.includes('update')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Calculate relevance score for content
   */
  calculateRelevance(version: string | undefined | null, sourceType: string) {
    // All porting primers should have maximum relevance (PRIMARY source)
    if (sourceType === 'primer') {
      return 1.0;
    }

    let score = 0.5; // Base score for other content

    if (version?.includes('1.21')) {
      score += 0.2;
    } // Recent versions more relevant

    return Math.min(score, 1.0);
  }

  /**
   * Calculate blog relevance score
   */
  calculateBlogRelevance(title: string, description: string) {
    const text = `${title} ${description}`.toLowerCase();

    // PRIMARY SOURCES: Version announcement blog posts get maximum relevance
    // "Fabric for Minecraft [version]" pattern
    if (/fabric for minecraft \d+\.\d+/.test(text)) {
      return 1.0;
    }

    // "NeoForge [version] for Minecraft [version]" pattern
    if (/neoforge \d+\.\d+(?:\.\d+)? for minecraft \d+\.\d+/.test(text)) {
      return 1.0;
    }

    let score = 0.3; // Base score for other blog posts

    if (text.includes('breaking')) {
      score += 0.3;
    }
    if (text.includes('migration') || text.includes('porting')) {
      score += 0.25;
    }
    if (text.includes('api')) {
      score += 0.2;
    }
    if (text.includes('1.21')) {
      score += 0.15;
    }

    return Math.min(score, 1.0);
  }
}

export default ContentAnalyzer;
