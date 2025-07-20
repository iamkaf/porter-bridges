/**
 * @file Community Discovery - Community-driven source submission system
 *
 * This module provides a comprehensive community source submission system with:
 * - Source submission validation
 * - Approval workflows
 * - Community voting and ranking
 * - Automated quality checks
 * - Contributor recognition
 */

import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../utils/logger';
import { MLContentAnalyzer } from '../../utils/ml-content-analyzer';
import { ContentAnalyzer } from './content-analyzer';
import type { ISourceConfig } from './source-configs';
import { type ISourceItem, SourceItemFactory } from './source-item-factory';

export interface ICommunitySubmission {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'under_review';
  submitted_at: string;
  submitted_by: {
    username: string;
    email?: string;
    github_username?: string;
    discord_username?: string;
  };
  source_info: {
    url: string;
    title: string;
    description: string;
    source_type:
      | 'primer'
      | 'blog_post'
      | 'changelog'
      | 'guide'
      | 'documentation'
      | 'video'
      | 'discord_channel';
    loader_type: 'vanilla' | 'fabric' | 'neoforge' | 'forge' | 'quilt';
    minecraft_version?: string;
    tags: string[];
    category: string;
  };
  validation_results: {
    url_accessible: boolean;
    content_relevant: boolean;
    quality_score: number;
    duplicate_check: boolean;
    automated_checks_passed: boolean;
    manual_review_required: boolean;
    issues: string[];
  };
  community_feedback: {
    upvotes: number;
    downvotes: number;
    comments: Array<{
      username: string;
      comment: string;
      timestamp: string;
      type: 'review' | 'question' | 'improvement';
    }>;
  };
  review_history: Array<{
    reviewer: string;
    action: 'approve' | 'reject' | 'request_changes';
    timestamp: string;
    notes: string;
  }>;
  metadata: {
    priority: number;
    relevance_score: number;
    confidence: number;
    processing_notes: string[];
  };
}

export interface ICommunityDiscoveryOptions {
  submissionsDir?: string;
  maxSubmissionsPerUser?: number;
  autoApproveThreshold?: number;
  requireManualReview?: boolean;
  enableCommunityVoting?: boolean;
  minVotesForApproval?: number;
  trustedContributors?: string[];
}

export interface ISubmissionRequest {
  url: string;
  title: string;
  description: string;
  source_type: string;
  loader_type: string;
  minecraft_version?: string;
  tags: string[];
  category: string;
  submitter: {
    username: string;
    email?: string;
    github_username?: string;
    discord_username?: string;
  };
}

/**
 * Community-driven source discovery system
 */
export class CommunityDiscovery {
  private options: ICommunityDiscoveryOptions;
  private sourceItemFactory: SourceItemFactory;
  private contentAnalyzer: ContentAnalyzer;
  private mlAnalyzer: MLContentAnalyzer;
  private submissionsPath: string;
  private approvedSourcesPath: string;
  private contributorsPath: string;

  constructor(options: ICommunityDiscoveryOptions = {}) {
    this.options = {
      submissionsDir:
        options.submissionsDir || './generated/community-submissions',
      maxSubmissionsPerUser: options.maxSubmissionsPerUser || 10,
      autoApproveThreshold: options.autoApproveThreshold || 0.8,
      requireManualReview: options.requireManualReview,
      enableCommunityVoting: true,
      minVotesForApproval: options.minVotesForApproval || 3,
      trustedContributors: options.trustedContributors || [],
    };

    this.sourceItemFactory = new SourceItemFactory();
    this.contentAnalyzer = new ContentAnalyzer();
    this.mlAnalyzer = new MLContentAnalyzer();

    this.submissionsPath = join(
      this.options.submissionsDir!,
      'submissions.json'
    );
    this.approvedSourcesPath = join(
      this.options.submissionsDir!,
      'approved-sources.json'
    );
    this.contributorsPath = join(
      this.options.submissionsDir!,
      'contributors.json'
    );
  }

  /**
   * Initialize community discovery system
   */
  async initialize(): Promise<void> {
    await this.ensureDirectoryExists();
    await this.initializeDataFiles();
  }

  /**
   * Submit a new source for community review
   */
  async submitSource(
    request: ISubmissionRequest
  ): Promise<{ success: boolean; submissionId?: string; message: string }> {
    try {
      logger.info(`📝 Processing source submission: ${request.title}`);

      // Validate submission
      const validationResult = await this.validateSubmission(request);
      if (!validationResult.valid) {
        return {
          success: false,
          message: `Submission validation failed: ${validationResult.errors.join(', ')}`,
        };
      }

      // Check user submission limits
      const userSubmissions = await this.getUserSubmissions(
        request.submitter.username
      );
      if (userSubmissions.length >= this.options.maxSubmissionsPerUser!) {
        return {
          success: false,
          message: `User has reached maximum submissions limit (${this.options.maxSubmissionsPerUser})`,
        };
      }

      // Check for duplicates
      const isDuplicate = await this.checkForDuplicates(request.url);
      if (isDuplicate) {
        return {
          success: false,
          message: 'This source has already been submitted',
        };
      }

      // Perform automated quality checks
      const qualityResults = await this.performQualityChecks(request);

      // Create submission record
      const submission: ICommunitySubmission = {
        id: this.generateSubmissionId(),
        status: this.determineInitialStatus(
          qualityResults,
          request.submitter.username
        ),
        submitted_at: new Date().toISOString(),
        submitted_by: request.submitter,
        source_info: {
          url: request.url,
          title: request.title,
          description: request.description,
          source_type: request.source_type as any,
          loader_type: request.loader_type as any,
          minecraft_version: request.minecraft_version,
          tags: request.tags,
          category: request.category,
        },
        validation_results: qualityResults,
        community_feedback: {
          upvotes: 0,
          downvotes: 0,
          comments: [],
        },
        review_history: [],
        metadata: {
          priority: this.calculatePriority(qualityResults),
          relevance_score: qualityResults.quality_score,
          confidence: qualityResults.automated_checks_passed ? 0.8 : 0.5,
          processing_notes: [],
        },
      };

      // Save submission
      await this.saveSubmission(submission);

      // Update contributor stats
      await this.updateContributorStats(request.submitter.username);

      logger.info(`✅ Source submitted successfully: ${submission.id}`);

      return {
        success: true,
        submissionId: submission.id,
        message: `Source submitted successfully! Status: ${submission.status}`,
      };
    } catch (error) {
      logger.error('Failed to submit source:', error);
      return {
        success: false,
        message: 'Internal error processing submission',
      };
    }
  }

  /**
   * Get pending submissions for review
   */
  async getPendingSubmissions(): Promise<ICommunitySubmission[]> {
    const submissions = await this.loadSubmissions();
    return submissions.filter(
      (s) => s.status === 'pending' || s.status === 'under_review'
    );
  }

  /**
   * Review a submission (approve/reject)
   */
  async reviewSubmission(
    submissionId: string,
    reviewerId: string,
    action: 'approve' | 'reject' | 'request_changes',
    notes: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const submissions = await this.loadSubmissions();
      const submission = submissions.find((s) => s.id === submissionId);

      if (!submission) {
        return { success: false, message: 'Submission not found' };
      }

      // Add review to history
      submission.review_history.push({
        reviewer: reviewerId,
        action,
        timestamp: new Date().toISOString(),
        notes,
      });

      // Update status
      if (action === 'approve') {
        submission.status = 'approved';
        await this.moveToApprovedSources(submission);
      } else if (action === 'reject') {
        submission.status = 'rejected';
      } else {
        submission.status = 'under_review';
      }

      await this.saveSubmissions(submissions);

      logger.info(
        `📋 Submission ${submissionId} reviewed by ${reviewerId}: ${action}`
      );

      return {
        success: true,
        message: `Submission ${action}ed successfully`,
      };
    } catch (error) {
      logger.error(`Failed to review submission ${submissionId}:`, error);
      return {
        success: false,
        message: 'Internal error processing review',
      };
    }
  }

  /**
   * Add community feedback (vote/comment)
   */
  async addFeedback(
    submissionId: string,
    username: string,
    type: 'upvote' | 'downvote' | 'comment',
    data?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const submissions = await this.loadSubmissions();
      const submission = submissions.find((s) => s.id === submissionId);

      if (!submission) {
        return { success: false, message: 'Submission not found' };
      }

      if (type === 'upvote') {
        submission.community_feedback.upvotes++;
      } else if (type === 'downvote') {
        submission.community_feedback.downvotes++;
      } else if (type === 'comment' && data) {
        submission.community_feedback.comments.push({
          username,
          comment: data,
          timestamp: new Date().toISOString(),
          type: 'review',
        });
      }

      // Check if community voting threshold is met
      if (this.options.enableCommunityVoting) {
        const totalVotes =
          submission.community_feedback.upvotes +
          submission.community_feedback.downvotes;
        const upvoteRatio = submission.community_feedback.upvotes / totalVotes;

        if (
          totalVotes >= this.options.minVotesForApproval! &&
          upvoteRatio >= 0.7
        ) {
          submission.status = 'approved';
          await this.moveToApprovedSources(submission);
        }
      }

      await this.saveSubmissions(submissions);

      return {
        success: true,
        message: 'Feedback added successfully',
      };
    } catch (error) {
      logger.error(
        `Failed to add feedback to submission ${submissionId}:`,
        error
      );
      return {
        success: false,
        message: 'Internal error processing feedback',
      };
    }
  }

  /**
   * Get approved sources for discovery
   */
  async getApprovedSources(): Promise<ISourceItem[]> {
    try {
      const approvedSources = await this.loadApprovedSources();
      return approvedSources.map((source) => this.convertToSourceItem(source));
    } catch (error) {
      logger.error('Failed to load approved sources:', error);
      return [];
    }
  }

  /**
   * Get contributor statistics
   */
  async getContributorStats(username: string): Promise<{
    total_submissions: number;
    approved_submissions: number;
    rejected_submissions: number;
    pending_submissions: number;
    reputation_score: number;
    badges: string[];
  }> {
    try {
      const submissions = await this.loadSubmissions();
      const userSubmissions = submissions.filter(
        (s) => s.submitted_by.username === username
      );

      const stats = {
        total_submissions: userSubmissions.length,
        approved_submissions: userSubmissions.filter(
          (s) => s.status === 'approved'
        ).length,
        rejected_submissions: userSubmissions.filter(
          (s) => s.status === 'rejected'
        ).length,
        pending_submissions: userSubmissions.filter(
          (s) => s.status === 'pending' || s.status === 'under_review'
        ).length,
        reputation_score: this.calculateReputationScore(userSubmissions),
        badges: this.calculateBadges(userSubmissions),
      };

      return stats;
    } catch (error) {
      logger.error(`Failed to get contributor stats for ${username}:`, error);
      return {
        total_submissions: 0,
        approved_submissions: 0,
        rejected_submissions: 0,
        pending_submissions: 0,
        reputation_score: 0,
        badges: [],
      };
    }
  }

  /**
   * Private helper methods
   */
  private async ensureDirectoryExists(): Promise<void> {
    if (!existsSync(this.options.submissionsDir!)) {
      await mkdir(this.options.submissionsDir!, { recursive: true });
    }
  }

  private async initializeDataFiles(): Promise<void> {
    const files = [
      { path: this.submissionsPath, data: [] },
      { path: this.approvedSourcesPath, data: [] },
      { path: this.contributorsPath, data: {} },
    ];

    for (const file of files) {
      if (!existsSync(file.path)) {
        await writeFile(file.path, JSON.stringify(file.data, null, 2));
      }
    }
  }

  private async validateSubmission(
    request: ISubmissionRequest
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Basic validation
    if (!(request.url && request.title && request.description)) {
      errors.push('URL, title, and description are required');
    }

    // URL validation
    try {
      new URL(request.url);
    } catch {
      errors.push('Invalid URL format');
    }

    // Check if URL is accessible
    try {
      const response = await fetch(request.url, { method: 'HEAD' });
      if (!response.ok) {
        errors.push(`URL not accessible: ${response.status}`);
      }
    } catch (error) {
      errors.push('URL not accessible');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private async performQualityChecks(
    request: ISubmissionRequest
  ): Promise<ICommunitySubmission['validation_results']> {
    const results = {
      url_accessible: true,
      content_relevant: false,
      quality_score: 0,
      duplicate_check: false,
      automated_checks_passed: false,
      manual_review_required: false,
      issues: [] as string[],
    };

    try {
      // Check URL accessibility
      const response = await fetch(request.url);
      results.url_accessible = response.ok;

      if (response.ok) {
        const content = await response.text();

        // Analyze content relevance
        const relevanceScore =
          this.contentAnalyzer.calculatePortingRelevance(content);
        results.content_relevant = relevanceScore > 0.3;
        results.quality_score = relevanceScore;

        // ML analysis
        const mlResult = await this.mlAnalyzer.analyzeContent({
          id: request.url,
          title: request.title,
          content,
          source_type: request.source_type,
          minecraft_version: request.minecraft_version,
          loader_type: request.loader_type,
        });

        results.quality_score = Math.max(
          results.quality_score,
          mlResult.relevance_score
        );
        results.content_relevant =
          results.content_relevant || mlResult.relevance_score > 0.5;

        // Check for automated approval
        results.automated_checks_passed =
          results.url_accessible &&
          results.content_relevant &&
          results.quality_score >= this.options.autoApproveThreshold!;

        results.manual_review_required =
          this.options.requireManualReview! ||
          results.quality_score < 0.6 ||
          !results.content_relevant;
      }
    } catch (error) {
      results.issues.push(`Quality check failed: ${error}`);
      results.manual_review_required = true;
    }

    return results;
  }

  private async getUserSubmissions(
    username: string
  ): Promise<ICommunitySubmission[]> {
    const submissions = await this.loadSubmissions();
    return submissions.filter((s) => s.submitted_by.username === username);
  }

  private async checkForDuplicates(url: string): Promise<boolean> {
    const submissions = await this.loadSubmissions();
    const approvedSources = await this.loadApprovedSources();

    return (
      submissions.some((s) => s.source_info.url === url) ||
      approvedSources.some((s) => s.source_info.url === url)
    );
  }

  private determineInitialStatus(
    qualityResults: ICommunitySubmission['validation_results'],
    submitterUsername: string
  ): ICommunitySubmission['status'] {
    // Auto-approve for trusted contributors
    if (this.options.trustedContributors!.includes(submitterUsername)) {
      return 'approved';
    }

    // Auto-approve if quality checks pass
    if (
      qualityResults.automated_checks_passed &&
      !qualityResults.manual_review_required
    ) {
      return 'approved';
    }

    // Otherwise, pending review
    return 'pending';
  }

  private calculatePriority(
    qualityResults: ICommunitySubmission['validation_results']
  ): number {
    if (qualityResults.quality_score > 0.8) return 1;
    if (qualityResults.quality_score > 0.6) return 2;
    return 3;
  }

  private generateSubmissionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async loadSubmissions(): Promise<ICommunitySubmission[]> {
    try {
      const data = await readFile(this.submissionsPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.warn('Failed to load submissions, returning empty array');
      return [];
    }
  }

  private async saveSubmissions(
    submissions: ICommunitySubmission[]
  ): Promise<void> {
    await writeFile(this.submissionsPath, JSON.stringify(submissions, null, 2));
  }

  private async saveSubmission(
    submission: ICommunitySubmission
  ): Promise<void> {
    const submissions = await this.loadSubmissions();
    submissions.push(submission);
    await this.saveSubmissions(submissions);
  }

  private async loadApprovedSources(): Promise<ICommunitySubmission[]> {
    try {
      const data = await readFile(this.approvedSourcesPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.warn('Failed to load approved sources, returning empty array');
      return [];
    }
  }

  private async moveToApprovedSources(
    submission: ICommunitySubmission
  ): Promise<void> {
    const approvedSources = await this.loadApprovedSources();
    approvedSources.push(submission);
    await writeFile(
      this.approvedSourcesPath,
      JSON.stringify(approvedSources, null, 2)
    );
  }

  private convertToSourceItem(submission: ICommunitySubmission): ISourceItem {
    return this.sourceItemFactory.createSourceItem({
      status: 'discovered',
      url: submission.source_info.url,
      source_type: submission.source_info.source_type,
      title: submission.source_info.title,
      minecraft_version: submission.source_info.minecraft_version,
      loader_type: submission.source_info.loader_type,
      priority:
        submission.metadata.priority === 1
          ? 'high'
          : submission.metadata.priority === 2
            ? 'medium'
            : 'low',
      tags: submission.source_info.tags,
      relevance_score: submission.metadata.relevance_score,
      metadata: {
        community_submission: true,
        submitted_by: submission.submitted_by.username,
        submitted_at: submission.submitted_at,
        upvotes: submission.community_feedback.upvotes,
        downvotes: submission.community_feedback.downvotes,
        category: submission.source_info.category,
      },
    });
  }

  private async updateContributorStats(username: string): Promise<void> {
    try {
      const data = await readFile(this.contributorsPath, 'utf-8');
      const contributors = JSON.parse(data);

      if (!contributors[username]) {
        contributors[username] = {
          first_submission: new Date().toISOString(),
          total_submissions: 0,
          last_submission: new Date().toISOString(),
        };
      }

      contributors[username].total_submissions++;
      contributors[username].last_submission = new Date().toISOString();

      await writeFile(
        this.contributorsPath,
        JSON.stringify(contributors, null, 2)
      );
    } catch (error) {
      logger.error(
        `Failed to update contributor stats for ${username}:`,
        error
      );
    }
  }

  private calculateReputationScore(
    submissions: ICommunitySubmission[]
  ): number {
    if (submissions.length === 0) return 0;

    const approvedCount = submissions.filter(
      (s) => s.status === 'approved'
    ).length;
    const rejectedCount = submissions.filter(
      (s) => s.status === 'rejected'
    ).length;
    const totalFeedback = submissions.reduce(
      (sum, s) =>
        sum + s.community_feedback.upvotes + s.community_feedback.downvotes,
      0
    );

    return Math.round(
      approvedCount * 10 - rejectedCount * 5 + totalFeedback * 0.5
    );
  }

  private calculateBadges(submissions: ICommunitySubmission[]): string[] {
    const badges: string[] = [];
    const approvedCount = submissions.filter(
      (s) => s.status === 'approved'
    ).length;
    const totalUpvotes = submissions.reduce(
      (sum, s) => sum + s.community_feedback.upvotes,
      0
    );

    if (approvedCount >= 1) badges.push('First Contribution');
    if (approvedCount >= 5) badges.push('Active Contributor');
    if (approvedCount >= 10) badges.push('Expert Contributor');
    if (totalUpvotes >= 50) badges.push('Community Favorite');

    return badges;
  }
}

export default CommunityDiscovery;
