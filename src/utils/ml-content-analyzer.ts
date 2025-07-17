/**
 * @file ML Content Analyzer - Advanced content analysis using machine learning
 *
 * This module provides ML-powered content analysis including:
 * - Semantic similarity analysis
 * - Content classification
 * - Context-aware relevance scoring
 * - Topic modeling and clustering
 */

import { distance } from 'ml-distance';
import { TfIdf } from 'natural';
// @ts-ignore - natural doesn't have perfect types
import { SentimentAnalyzer, PorterStemmer } from 'natural';
import nlp from 'compromise';
import { logger } from './logger';

export interface ContentAnalysisResult {
  relevance_score: number;
  confidence: number;
  topics: string[];
  keywords: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  content_type: 'tutorial' | 'changelog' | 'guide' | 'announcement' | 'documentation';
  complexity_score: number;
  version_mentions: string[];
  breaking_changes_likelihood: number;
  tags: string[];
  similar_content_ids: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  content: string;
  source_type: string;
  minecraft_version?: string;
  loader_type?: string;
  url?: string;
}

/**
 * ML-powered content analyzer with advanced features
 */
export class MLContentAnalyzer {
  private tfidf: TfIdf;
  private contentVectors: Map<string, number[]> = new Map();
  private knowledgeBase: ContentItem[] = [];
  private minecraftTerms: Set<string>;
  private portingTerms: Set<string>;
  private versionPatterns: RegExp[];

  constructor() {
    this.tfidf = new TfIdf();
    this.initializeTerms();
    this.initializePatterns();
  }

  /**
   * Initialize domain-specific terms and patterns
   */
  private initializeTerms() {
    this.minecraftTerms = new Set([
      'minecraft', 'mod', 'modding', 'forge', 'fabric', 'neoforge', 'quilt',
      'mixin', 'blockstate', 'entity', 'item', 'block', 'recipe', 'datapack',
      'resourcepack', 'mappings', 'mcp', 'yarn', 'obfuscated', 'deobfuscated',
      'api', 'event', 'registry', 'capability', 'biome', 'dimension', 'world',
      'server', 'client', 'chunk', 'worldgen', 'generation', 'structure'
    ]);

    this.portingTerms = new Set([
      'migration', 'porting', 'update', 'upgrade', 'breaking', 'deprecated',
      'removed', 'changed', 'refactored', 'renamed', 'moved', 'replaced',
      'incompatible', 'compatibility', 'backwards', 'forward', 'version',
      'release', 'snapshot', 'pre-release', 'alpha', 'beta', 'stable'
    ]);
  }

  /**
   * Initialize regex patterns for content analysis
   */
  private initializePatterns() {
    this.versionPatterns = [
      /\b1\.\d+(?:\.\d+)?(?:-\w+)?\b/g,
      /\bversion\s+\d+\.\d+(?:\.\d+)?\b/gi,
      /\bminecraft\s+\d+\.\d+(?:\.\d+)?\b/gi,
      /\b(?:forge|fabric|neoforge)\s+\d+\.\d+(?:\.\d+)?\b/gi
    ];
  }

  /**
   * Analyze content with ML-powered features
   */
  async analyzeContent(content: ContentItem): Promise<ContentAnalysisResult> {
    logger.info(`🧠 Analyzing content: ${content.title}`);

    const text = `${content.title} ${content.content}`;
    const doc = nlp(text);

    // Extract basic features
    const keywords = this.extractKeywords(text);
    const topics = this.extractTopics(doc);
    const versionMentions = this.extractVersionMentions(text);
    const sentiment = this.analyzeSentiment(text);
    const contentType = this.classifyContentType(text, content.source_type);
    
    // Calculate advanced scores
    const relevanceScore = this.calculateAdvancedRelevance(text, content);
    const complexityScore = this.calculateComplexity(doc);
    const breakingChangesLikelihood = this.calculateBreakingChangesLikelihood(text);
    const confidence = this.calculateConfidence(text, keywords, topics);
    
    // Generate tags
    const tags = this.generateTags(text, topics, versionMentions);
    
    // Find similar content
    const similarContentIds = this.findSimilarContent(content.id, text);

    // Add to knowledge base for future similarity comparisons
    this.addToKnowledgeBase(content);

    return {
      relevance_score: relevanceScore,
      confidence,
      topics,
      keywords,
      sentiment,
      content_type: contentType,
      complexity_score: complexityScore,
      version_mentions: versionMentions,
      breaking_changes_likelihood: breakingChangesLikelihood,
      tags,
      similar_content_ids: similarContentIds
    };
  }

  /**
   * Extract keywords using TF-IDF and domain knowledge
   */
  private extractKeywords(text: string): string[] {
    const doc = nlp(text);
    const terms = doc.terms().out('array');
    
    // Add document to TF-IDF
    this.tfidf.addDocument(text);
    
    // Get TF-IDF scores for terms
    const tfidfScores: { term: string; score: number }[] = [];
    const docIndex = this.tfidf.documents.length - 1;
    
    this.tfidf.listTerms(docIndex).forEach(item => {
      if (item.term.length > 3) {
        tfidfScores.push({ term: item.term, score: item.tfidf });
      }
    });

    // Combine with domain-specific terms
    const domainKeywords = terms.filter(term => 
      this.minecraftTerms.has(term.toLowerCase()) || 
      this.portingTerms.has(term.toLowerCase())
    );

    // Sort by TF-IDF score and take top keywords
    const topTfidfTerms = tfidfScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.term);

    return [...new Set([...domainKeywords, ...topTfidfTerms])].slice(0, 15);
  }

  /**
   * Extract topics using NLP and domain knowledge
   */
  private extractTopics(doc: any): string[] {
    const topics: string[] = [];
    
    // Extract named entities
    const entities = doc.entities().out('array');
    topics.push(...entities.slice(0, 5));

    // Extract technical terms
    const techTerms = doc.match('#Value').out('array');
    topics.push(...techTerms.slice(0, 5));

    // Extract actions/verbs that might indicate changes
    const actions = doc.verbs().out('array');
    const relevantActions = actions.filter(action => 
      ['add', 'remove', 'change', 'update', 'fix', 'break', 'deprecate', 'replace'].includes(action.toLowerCase())
    );
    topics.push(...relevantActions);

    return [...new Set(topics)].slice(0, 10);
  }

  /**
   * Extract version mentions from text
   */
  private extractVersionMentions(text: string): string[] {
    const versions: string[] = [];
    
    for (const pattern of this.versionPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        versions.push(...matches);
      }
    }

    return [...new Set(versions)];
  }

  /**
   * Analyze sentiment of the content
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const doc = nlp(text);
    
    // Count positive and negative indicators
    const positiveWords = ['new', 'improved', 'better', 'enhanced', 'added', 'support'];
    const negativeWords = ['deprecated', 'removed', 'broken', 'incompatible', 'issue', 'problem'];
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    const words = doc.terms().out('array');
    
    for (const word of words) {
      const lowerWord = word.toLowerCase();
      if (positiveWords.includes(lowerWord)) positiveScore++;
      if (negativeWords.includes(lowerWord)) negativeScore++;
    }
    
    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  /**
   * Classify content type based on features
   */
  private classifyContentType(text: string, sourceType: string): ContentAnalysisResult['content_type'] {
    const lowerText = text.toLowerCase();
    
    if (sourceType === 'changelog') return 'changelog';
    if (sourceType === 'guide') return 'guide';
    
    // Classification based on content patterns
    if (lowerText.includes('tutorial') || lowerText.includes('how to')) return 'tutorial';
    if (lowerText.includes('release') || lowerText.includes('version')) return 'changelog';
    if (lowerText.includes('guide') || lowerText.includes('migration')) return 'guide';
    if (lowerText.includes('announce') || lowerText.includes('news')) return 'announcement';
    if (lowerText.includes('documentation') || lowerText.includes('reference')) return 'documentation';
    
    return 'guide';
  }

  /**
   * Calculate advanced relevance score using multiple factors
   */
  private calculateAdvancedRelevance(text: string, content: ContentItem): number {
    const lowerText = text.toLowerCase();
    let score = 0;
    
    // Base relevance from existing analyzer
    score += this.calculateBasicRelevance(lowerText);
    
    // Version recency bonus
    if (content.minecraft_version) {
      const versionParts = content.minecraft_version.split('.').map(Number);
      if (versionParts[1] >= 21) score += 0.2;
      else if (versionParts[1] >= 20) score += 0.1;
    }
    
    // Source type importance
    if (content.source_type === 'primer') score += 0.3;
    if (content.source_type === 'changelog') score += 0.2;
    if (content.source_type === 'guide') score += 0.15;
    
    // Loader type relevance
    if (content.loader_type && ['fabric', 'neoforge', 'forge'].includes(content.loader_type)) {
      score += 0.1;
    }
    
    // Content depth (longer content might be more comprehensive)
    const contentLength = text.length;
    if (contentLength > 5000) score += 0.1;
    else if (contentLength > 2000) score += 0.05;
    
    // Domain-specific term density
    const words = text.split(/\s+/);
    const domainTermCount = words.filter(word => 
      this.minecraftTerms.has(word.toLowerCase()) || 
      this.portingTerms.has(word.toLowerCase())
    ).length;
    
    score += Math.min(domainTermCount / words.length, 0.2);
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate basic relevance score (from existing analyzer)
   */
  private calculateBasicRelevance(text: string): number {
    const portingKeywords = [
      { keywords: ['breaking', 'breaking change'], weight: 0.3 },
      { keywords: ['migration', 'porting', 'migrate'], weight: 0.2 },
      { keywords: ['api', 'api change', 'deprecated'], weight: 0.15 },
      { keywords: ['version', 'update', 'upgrade'], weight: 0.1 },
      { keywords: ['minecraft', 'mod', 'forge', 'fabric', 'neoforge'], weight: 0.1 },
      { keywords: ['1.20', '1.21', '1.19'], weight: 0.1 },
      { keywords: ['changelog', 'release', 'notes'], weight: 0.05 }
    ];

    let score = 0;
    for (const group of portingKeywords) {
      for (const keyword of group.keywords) {
        if (text.includes(keyword)) {
          score += group.weight;
          break;
        }
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Calculate complexity score based on technical terms and structure
   */
  private calculateComplexity(doc: any): number {
    const sentences = doc.sentences().out('array');
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;
    
    // Technical term density
    const terms = doc.terms().out('array');
    const techTerms = terms.filter(term => 
      this.minecraftTerms.has(term.toLowerCase()) ||
      /^[A-Z][a-z]*[A-Z]/.test(term) // CamelCase terms
    );
    
    const techDensity = techTerms.length / terms.length;
    
    // Code block indicators
    const codeIndicators = ['```', '`', 'code', 'method', 'class', 'function'];
    const codeScore = codeIndicators.reduce((score, indicator) => {
      return score + (doc.text().includes(indicator) ? 0.1 : 0);
    }, 0);
    
    return Math.min((avgSentenceLength / 20) + techDensity + codeScore, 1.0);
  }

  /**
   * Calculate likelihood of breaking changes
   */
  private calculateBreakingChangesLikelihood(text: string): number {
    const breakingIndicators = [
      'breaking', 'incompatible', 'deprecated', 'removed', 'changed api',
      'no longer', 'replaced', 'renamed', 'moved', 'refactored'
    ];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    for (const indicator of breakingIndicators) {
      if (lowerText.includes(indicator)) {
        score += 0.15;
      }
    }
    
    // Version transition indicators
    if (lowerText.includes('1.20') && lowerText.includes('1.21')) score += 0.2;
    if (lowerText.includes('migration') || lowerText.includes('porting')) score += 0.3;
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate confidence score based on multiple factors
   */
  private calculateConfidence(text: string, keywords: string[], topics: string[]): number {
    let confidence = 0.5; // Base confidence
    
    // Content length confidence
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 1000) confidence += 0.2;
    else if (wordCount > 500) confidence += 0.1;
    
    // Keyword richness
    confidence += Math.min(keywords.length / 20, 0.2);
    
    // Topic diversity
    confidence += Math.min(topics.length / 15, 0.1);
    
    // Structure indicators (lists, headers, etc.)
    const structureIndicators = ['\n#', '\n-', '\n*', '\n1.', '\n2.'];
    const structureScore = structureIndicators.reduce((score, indicator) => {
      return score + (text.includes(indicator) ? 0.05 : 0);
    }, 0);
    
    confidence += Math.min(structureScore, 0.2);
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Generate tags based on content analysis
   */
  private generateTags(text: string, topics: string[], versionMentions: string[]): string[] {
    const tags: string[] = [];
    
    // Version tags
    tags.push(...versionMentions);
    
    // Topic tags
    tags.push(...topics.slice(0, 5));
    
    // Content type tags
    const lowerText = text.toLowerCase();
    if (lowerText.includes('breaking')) tags.push('breaking-changes');
    if (lowerText.includes('migration')) tags.push('migration');
    if (lowerText.includes('api')) tags.push('api-changes');
    if (lowerText.includes('deprecated')) tags.push('deprecation');
    if (lowerText.includes('tutorial')) tags.push('tutorial');
    if (lowerText.includes('guide')) tags.push('guide');
    
    return [...new Set(tags)];
  }

  /**
   * Find similar content using cosine similarity
   */
  private findSimilarContent(contentId: string, text: string): string[] {
    const currentVector = this.textToVector(text);
    const similarities: { id: string; similarity: number }[] = [];
    
    for (const [id, vector] of this.contentVectors) {
      if (id !== contentId) {
        const similarity = this.cosineSimilarity(currentVector, vector);
        similarities.push({ id, similarity });
      }
    }
    
    // Store current vector for future comparisons
    this.contentVectors.set(contentId, currentVector);
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .filter(item => item.similarity > 0.3) // Only return significantly similar content
      .map(item => item.id);
  }

  /**
   * Convert text to vector representation
   */
  private textToVector(text: string): number[] {
    const doc = nlp(text);
    const terms = doc.terms().out('array');
    
    // Create a simple bag-of-words vector
    const vocabulary = [...this.minecraftTerms, ...this.portingTerms];
    const vector = new Array(vocabulary.length).fill(0);
    
    for (let i = 0; i < vocabulary.length; i++) {
      const term = vocabulary[i];
      vector[i] = terms.filter(t => t.toLowerCase() === term).length;
    }
    
    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Add content to knowledge base for future similarity comparisons
   */
  private addToKnowledgeBase(content: ContentItem) {
    this.knowledgeBase.push(content);
    
    // Limit knowledge base size to prevent memory issues
    if (this.knowledgeBase.length > 1000) {
      this.knowledgeBase.shift();
    }
  }

  /**
   * Batch analyze multiple content items
   */
  async batchAnalyze(contents: ContentItem[]): Promise<Map<string, ContentAnalysisResult>> {
    logger.info(`🧠 Batch analyzing ${contents.length} content items`);
    
    const results = new Map<string, ContentAnalysisResult>();
    
    for (const content of contents) {
      try {
        const result = await this.analyzeContent(content);
        results.set(content.id, result);
      } catch (error) {
        logger.error(`Failed to analyze content ${content.id}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Get content recommendations based on user preferences
   */
  getContentRecommendations(
    userPreferences: {
      minecraft_version?: string;
      loader_type?: string;
      content_types?: string[];
      min_relevance?: number;
    }
  ): ContentItem[] {
    return this.knowledgeBase.filter(content => {
      if (userPreferences.minecraft_version && content.minecraft_version !== userPreferences.minecraft_version) {
        return false;
      }
      if (userPreferences.loader_type && content.loader_type !== userPreferences.loader_type) {
        return false;
      }
      if (userPreferences.content_types && !userPreferences.content_types.includes(content.source_type)) {
        return false;
      }
      return true;
    }).slice(0, 10);
  }
}

export default MLContentAnalyzer;