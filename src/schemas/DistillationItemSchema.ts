/**
 * @file Defines the schema for the distillation status of a single source item.
 *
 * This schema validates the structure of each entry in the `progress.distillation` map. It tracks
 * the state of the AI-powered distillation process for each piece of raw data. This includes not only
 * the current status but also metadata about the distillation process itself, such as which AI agent
 * was used and the number of tokens consumed. This information is vital for monitoring the cost and
 * efficiency of the distillation pipeline and for ensuring that the process can be reliably resumed
 * if interrupted.
 */

import { z } from 'zod';

/**
 * Schema for tracking AI distillation progress of a single source item
 */
export const DistillationItemSchema = z.object({
  // Current processing status
  status: z.enum([
    'pending', // Not yet started
    'distilling', // Currently being processed by AI
    'distilled', // Successfully completed
    'failed', // Processing failed
  ]),

  // Timing information
  started_at: z.string().datetime().optional(),
  distilled_at: z.string().datetime().optional(),

  // AI agent information
  agent: z.string().optional().describe('AI model used (e.g., claude-3-opus, gpt-4)'),
  agent_version: z.string().optional().describe('Specific version of the AI agent'),

  // Resource usage tracking
  token_usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),

  // Quality metrics
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('AI confidence in distillation quality (0-1)'),

  // Error handling
  error: z
    .object({
      code: z.string().describe('Error type (rate_limit, parsing_error, etc.)'),
      message: z.string().describe('Human-readable error description'),
      timestamp: z.string().datetime(),
      retry_count: z.number().int().nonnegative().default(0),
    })
    .optional(),

  // Processing metadata
  processing_duration_ms: z.number().int().nonnegative().optional(),
  retry_after: z.string().datetime().optional().describe('When to retry after rate limiting'),

  // Content validation
  output_size_bytes: z.number().int().nonnegative().optional(),
  validation_passed: z.boolean().optional().describe('Whether output passed schema validation'),

  // Distillation context
  prompt_version: z.string().optional().describe('Version of the distillation prompt used'),
  source_checksum: z.string().optional().describe('SHA-256 of the source content distilled'),
});

export default DistillationItemSchema;
