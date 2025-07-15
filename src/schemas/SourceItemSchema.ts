/**
 * @file Defines the schema for a single source item in the progress tracking system.
 *
 * This schema validates the structure of each entry in the `progress.sources` map. It ensures that
 * every source being tracked has a well-defined status and associated metadata, such as the URL from
 * which the data was fetched, a checksum to verify the integrity of the raw data, and a timestamp
 * marking when the collection was completed. This level of detail is crucial for maintaining a
 * reliable and resumable data collection pipeline.
 */

import { z } from 'zod';

/**
 * Schema for tracking data source collection progress
 */
export const SourceItemSchema = z.object({
  // Status tracking
  status: z.enum([
    'discovered', // Source discovered by discovery module
    'pending', // Source identified but not yet collected
    'collecting', // Currently being downloaded/fetched
    'collected', // Successfully collected
    'failed', // Collection failed
  ]),

  // Source metadata
  url: z.string().url().describe('URL of the source'),
  source_type: z
    .enum(['primer', 'changelog', 'blog_post', 'guide', 'documentation', 'local_document'])
    .describe('Type of source'),

  // Collection metadata
  checksum: z.string().optional().describe('SHA-256 checksum of collected content'),
  collected_at: z.string().datetime().optional().describe('When collection was completed'),
  file_size_bytes: z.number().int().nonnegative().optional().describe('Size of collected content'),

  // Content metadata
  title: z.string().optional().describe('Title of the source content'),
  minecraft_version: z.string().optional().describe('Primary Minecraft version this source covers'),
  loader_type: z
    .enum(['fabric', 'forge', 'neoforge', 'vanilla'])
    .optional()
    .describe('Mod loader type'),

  // Discovery metadata
  discovered_at: z.string().datetime().optional().describe('When this source was first discovered'),
  discovered_by: z.string().optional().describe('Method or tool that discovered this source'),

  // Content analysis
  content_length: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Length of content in characters'),
  content_type: z.string().optional().describe('MIME type of the content'),
  language: z.string().optional().describe('Language of the content'),

  // Error handling
  error: z
    .object({
      code: z.string().describe('Error type (network_error, parse_error, etc.)'),
      message: z.string().describe('Human-readable error description'),
      timestamp: z.string().datetime(),
      retry_count: z.number().int().nonnegative().default(0),
      http_status: z.number().int().optional().describe('HTTP status code if applicable'),
    })
    .optional(),

  // Retry management
  retry_after: z.string().datetime().optional().describe('When to retry after failure'),
  last_attempt_at: z.string().datetime().optional().describe('Last collection attempt timestamp'),

  // Priority and scheduling
  priority: z
    .enum(['low', 'medium', 'high', 'critical'])
    .default('medium')
    .describe('Collection priority'),
  tags: z.array(z.string()).optional().describe('Tags for categorizing this source'),

  // Quality metrics
  relevance_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Estimated relevance for porting (0-1)'),
  freshness_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('How recent/fresh this content is (0-1)'),

  // Relationships
  parent_source: z
    .string()
    .optional()
    .describe('ID of parent source if this is derived from another'),
  related_sources: z.array(z.string()).optional().describe('IDs of related sources'),

  // Caching information
  etag: z.string().optional().describe('HTTP ETag for caching'),
  last_modified: z.string().datetime().optional().describe('Last-Modified header from source'),
  cache_control: z.string().optional().describe('Cache-Control header information'),

  // Processing hints
  processing_hints: z
    .object({
      skip_distillation: z
        .boolean()
        .optional()
        .describe('Whether to skip AI distillation for this source'),
      high_priority_distillation: z
        .boolean()
        .optional()
        .describe('Whether to prioritize this source for distillation'),
      custom_prompt: z.string().optional().describe('Custom distillation prompt for this source'),
      expected_categories: z.array(z.string()).optional().describe('Expected content categories'),
    })
    .optional(),
});

export default SourceItemSchema;
