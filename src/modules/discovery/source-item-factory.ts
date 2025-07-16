/**
 * @file Source Item Factory - Creates and validates source items
 *
 * This module handles creating source items using the SourceItemSchema
 * and provides validation and error handling.
 */

import { SourceItemSchema } from '../../schemas/source-item-schema';
import { logger } from '../../utils/logger';

export interface ISourceItem {
  status:
    | 'discovered'
    | 'pending'
    | 'collected'
    | 'collecting'
    | 'distilling'
    | 'distilled'
    | 'failed'
    | 'packaging'
    | 'packaged'
    | 'bundling'
    | 'bundled';
  url: string;
  source_type:
    | 'primer'
    | 'blog_post'
    | 'changelog'
    | 'guide'
    | 'documentation'
    | 'local_document';
  checksum?: string;
  title?: string;
  minecraft_version?: string;
  loader_type?: 'vanilla' | 'fabric' | 'neoforge' | 'forge';
  priority?: 'high' | 'medium' | 'low' | 'critical';
  tags?: string[];
  relevance_score?: number;
  size_kb?: number;
  content_type?: string;
  loader_version?: string;
  content_preview?: string;
  metadata?:
    | {
        release_tag: string;
        published_at: string;
        is_prerelease: boolean;
        assets_count: number;
        download_count: number;
      }
    | {
        url_type: string;
        domain: string;
        direct_source: boolean;
        specialization: string;
      }
    | {
        maven_version: string;
        maven_repository: string;
        changelog_type: string;
      };
  id?: string;
  _sourceKey?: string;
  content_length?: number;
  discovered_at?: string;
  file_size_bytes?: number;

  // Additional pipeline metadata fields
  discovered_by?: string;
  collected_at?: string;
  collection_metadata?: {
    status_code: number;
    content_type: string;
    content_length?: string;
    etag?: string;
    size_bytes: number;
    size_kb: number;
    collection_attempt: number;
    final_url: string;
  };
  distilled_at?: string;
  distillation_metadata?: {
    agent: string;
    prompt_version: string;
    processing_duration_ms: number;
    source_checksum: string;
    output_path: string;
    token_usage?: {
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };
    confidence_score: number;
    validation_passed: boolean;
  };
  packaged_at?: string;
  packaging_metadata?: Record<string, any>;
  bundled_at?: string;
  bundling_metadata?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    timestamp: string;
    retry_count: number;
    phase?:
      | 'discovered'
      | 'collected'
      | 'collecting'
      | 'distilling'
      | 'distilled'
      | 'failed'
      | 'packaging'
      | 'packaged'
      | 'bundling'
      | 'bundled';
  };
}

/**
 * Source item factory class
 */
export class SourceItemFactory {
  /**
   * Create a validated source item using SourceItemSchema
   */
  createSourceItem(data: ISourceItem) {
    const sourceItem = {
      status: data.status || 'discovered',
      url: data.url,
      source_type: data.source_type,
      title: data.title,
      minecraft_version: data.minecraft_version,
      loader_type: data.loader_type,
      discovered_at: data.discovered_at || new Date().toISOString(),
      discovered_by: 'DiscoveryModule',
      content_length: data.content_length,
      file_size_bytes: data.file_size_bytes,
      priority: data.priority || 'medium',
      tags: data.tags || [],
      relevance_score: data.relevance_score,
      checksum: data.checksum,
      collected_at: data.collected_at,
      collection_metadata: data.collection_metadata,
      metadata: data.metadata,
      // Mark changelogs to skip distillation
      processing_hints: data.source_type === 'changelog' ? {
        skip_distillation: true
      } : undefined,
    };

    // Validate against schema
    try {
      return SourceItemSchema.parse(sourceItem);
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.warn(
          `⚠️  Schema validation failed for ${data.id}:`,
          error.message
        );
      } else {
        logger.warn(
          { error },
          `⚠️  Schema validation failed for ${data.id}: unknown error`
        );
      }
      return sourceItem; // Return unvalidated for now, log the issue
    }
  }
}

export default SourceItemFactory;
