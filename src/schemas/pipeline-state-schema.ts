/**
 * @file Pipeline State Schema - Unified schema for tracking all pipeline progress
 *
 * This schema consolidates the previously separate discovered-sources.json,
 * collected-sources.json, and distilled-sources.json files into a single
 * pipeline-state.json file that tracks all progress through the pipeline.
 */

import { z } from 'zod';

/**
 * Pipeline phase enumeration
 */
export const PipelinePhase = z.enum([
  'discovered',
  'collected',
  'collecting',
  'distilling',
  'distilled',
  'failed',
  'packaging',
  'packaged',
  'bundling',
  'bundled',
]);

/**
 * Pipeline phase statistics
 */
export const PhaseStats = z.object({
  total_sources: z.number().int().min(0),
  new_sources: z.number().int().min(0).optional(),
  updated_sources: z.number().int().min(0).optional(),
  failed_sources: z.number().int().min(0).optional(),
  skipped_sources: z.number().int().min(0).optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  duration_seconds: z.number().min(0).optional(),

  // Phase-specific stats
  total_input_tokens: z.number().int().min(0).optional(),
  total_output_tokens: z.number().int().min(0).optional(),
  success_rate: z.number().min(0).max(100).optional(),
});

/**
 * Source metadata for different pipeline phases
 */
export const SourceMetadata = z.object({
  // Discovery metadata
  discovered_at: z.string().datetime().optional(),
  discovered_by: z.string().optional(),

  // Collection metadata
  collected_at: z.string().datetime().optional(),
  collection_metadata: z
    .object({
      status_code: z.number().int(),
      content_type: z.string(),
      content_length: z.string().optional(),
      etag: z.string().optional(),
      size_bytes: z.number().int().min(0),
      size_kb: z.number().min(0),
      collection_attempt: z.number().int().min(1),
      final_url: z.string().url(),
    })
    .optional(),

  // Distillation metadata
  distilled_at: z.string().datetime().optional(),
  distillation_metadata: z
    .object({
      agent: z.string(),
      prompt_version: z.string(),
      processing_duration_ms: z.number().int().min(0),
      source_checksum: z.string(),
      output_path: z.string(),
      token_usage: z
        .object({
          input_tokens: z.number().int().min(0),
          output_tokens: z.number().int().min(0),
          total_tokens: z.number().int().min(0),
        })
        .optional(),
      confidence_score: z.number().min(0).max(1),
      validation_passed: z.boolean(),
    })
    .optional(),

  // Packaging metadata
  packaged_at: z.string().datetime().optional(),
  packaging_metadata: z.record(z.string(), z.any()).optional(),

  // Bundling metadata
  bundled_at: z.string().datetime().optional(),
  bundling_metadata: z.record(z.string(), z.any()).optional(),

  // Error tracking
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      timestamp: z.string().datetime(),
      retry_count: z.number().int().min(0).default(0),
      phase: PipelinePhase,
    })
    .optional(),
});

/**
 * Individual source item in the pipeline
 */
export const PipelineSource = z
  .object({
    // Core identification
    status: PipelinePhase,
    url: z.string().url(),
    source_type: z.enum(['primer', 'blog_post', 'changelog', 'guide']),
    checksum: z.string(),

    // Content metadata
    title: z.string(),
    minecraft_version: z.string().optional(),
    loader_type: z.enum(['vanilla', 'fabric', 'neoforge', 'forge']).optional(),
    priority: z.enum(['high', 'medium', 'low']),
    tags: z.array(z.string()),
    relevance_score: z.number().min(0).max(1),

    // Legacy fields (for backward compatibility)
    size_kb: z.number().min(0).optional(),
    content_type: z.string().optional(),
  })
  .merge(SourceMetadata);

/**
 * Pipeline execution context
 */
export const PipelineContext = z.object({
  pipeline_version: z.string(),
  execution_id: z.string(),
  started_at: z.string().datetime(),
  last_updated: z.string().datetime(),
  current_phase: PipelinePhase,

  // Resume capability
  resume_from: PipelinePhase.optional(),
  skip_phases: z.array(PipelinePhase).default([]),

  // Execution options
  options: z.record(z.string(), z.any()).default({}),
});

/**
 * Complete pipeline state schema
 */
export const PipelineStateSchema = z.object({
  // Execution context
  context: PipelineContext,

  // All sources with their current state
  sources: z.record(z.string(), PipelineSource),

  // Statistics for each pipeline phase
  stats: z.object({
    discovery: PhaseStats.optional(),
    collection: PhaseStats.optional(),
    distillation: PhaseStats.optional(),
    packaging: PhaseStats.optional(),
    bundling: PhaseStats.optional(),
  }),

  // Overall pipeline metadata
  metadata: z.object({
    total_sources: z.number().int().min(0),
    phase_counts: z.record(PipelinePhase, z.number().int().min(0)),
    completion_percentage: z.number().min(0).max(100),
    estimated_completion: z.string().datetime().optional(),
  }),
});

export default PipelineStateSchema;
