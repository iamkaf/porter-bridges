/**
 * @file Defines the schema for the overall progress tracking object within a data package's package.json.
 *
 * This schema is the root of the progress tracking system. It validates the main `progress` object,
 * ensuring that it contains valid `sources` and `distillation` maps. Each of these maps is expected
 * to contain a collection of items that conform to the `SourceItemSchema` and `DistillationItemSchema`
 * respectively. This schema provides a high-level view of the entire data collection and distillation
 * process for a given data package.
 */

import { z } from 'zod';
import { DistillationItemSchema } from './distillation-item-schema';
import { SourceItemSchema } from './source-item-schema';

/**
 * Schema for overall package statistics
 */
const PackageStatsSchema = z.object({
  // Source statistics
  total_sources: z
    .number()
    .int()
    .nonnegative()
    .describe('Total number of sources identified'),
  sources_collected: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of sources successfully collected'),
  sources_failed: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of sources that failed collection'),

  // Distillation statistics
  total_distillations: z
    .number()
    .int()
    .nonnegative()
    .describe('Total number of distillation tasks'),
  distillations_completed: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of completed distillations'),
  distillations_failed: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of failed distillations'),

  // Progress percentages
  collection_progress: z
    .number()
    .min(0)
    .max(100)
    .describe('Collection progress percentage'),
  distillation_progress: z
    .number()
    .min(0)
    .max(100)
    .describe('Distillation progress percentage'),
  overall_progress: z
    .number()
    .min(0)
    .max(100)
    .describe('Overall package progress percentage'),

  // Resource usage
  total_tokens_used: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Total tokens consumed by AI'),
  total_processing_time_ms: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Total processing time'),

  // Timestamps
  started_at: z
    .string()
    .datetime()
    .optional()
    .describe('When package processing started'),
  last_updated_at: z
    .string()
    .datetime()
    .optional()
    .describe('Last update timestamp'),
  estimated_completion: z
    .string()
    .datetime()
    .optional()
    .describe('Estimated completion time'),
});

/**
 * Schema for package configuration and metadata
 */
const PackageConfigSchema = z.object({
  // Package identification
  package_version: z.string().describe('Version of this data package'),
  created_at: z.string().datetime().describe('When this package was created'),

  // Target versions
  target_minecraft_versions: z
    .array(z.string())
    .describe('Minecraft versions this package targets'),
  target_loaders: z
    .array(z.enum(['fabric', 'forge', 'neoforge']))
    .describe('Mod loaders this package targets'),

  // Processing configuration
  distillation_agent: z
    .string()
    .default('claude-3-opus')
    .describe('Default AI agent for distillation'),
  max_concurrent_collections: z
    .number()
    .int()
    .positive()
    .default(5)
    .describe('Max concurrent source collections'),
  max_concurrent_distillations: z
    .number()
    .int()
    .positive()
    .default(2)
    .describe('Max concurrent distillations'),

  // Quality thresholds
  min_confidence_threshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.7)
    .describe('Minimum confidence for accepting distillation'),
  max_retry_attempts: z
    .number()
    .int()
    .nonnegative()
    .default(3)
    .describe('Maximum retry attempts for failed operations'),

  // Output configuration
  output_format: z
    .enum(['json', 'yaml'])
    .default('json')
    .describe('Format for distilled output'),
  include_raw_sources: z
    .boolean()
    .default(true)
    .describe('Whether to include raw source files in package'),

  // Automation settings
  auto_discover_sources: z
    .boolean()
    .default(true)
    .describe('Whether to automatically discover new sources'),
  auto_process_new_sources: z
    .boolean()
    .default(false)
    .describe('Whether to automatically process new sources'),
});

/**
 * Main schema for package progress tracking
 */
export const PackageProgressSchema = z.object({
  // Configuration and metadata
  config: PackageConfigSchema.describe('Package configuration and metadata'),

  // Overall statistics
  stats: PackageStatsSchema.describe('Package statistics and progress metrics'),

  // Source collection progress
  sources: z
    .record(z.string(), SourceItemSchema)
    .describe('Map of source ID to collection progress'),

  // Distillation progress
  distillation: z
    .record(z.string(), DistillationItemSchema)
    .describe('Map of source ID to distillation progress'),

  // Package-level status
  package_status: z
    .enum([
      'initializing', // Package being set up
      'collecting', // Sources being collected
      'distilling', // Content being distilled
      'bundling', // Final bundle being created
      'completed', // Package fully processed
      'failed', // Package processing failed
    ])
    .describe('Overall package status'),

  // Dependency tracking
  dependencies: z
    .object({
      required_tools: z
        .array(z.string())
        .optional()
        .describe('Required tools for processing'),
      ai_agents: z
        .array(z.string())
        .optional()
        .describe('AI agents used in this package'),
      external_apis: z
        .array(z.string())
        .optional()
        .describe('External APIs this package depends on'),
    })
    .optional(),

  // Quality assurance
  validation: z
    .object({
      schema_version: z
        .string()
        .describe('Version of schemas used for validation'),
      validation_errors: z
        .array(z.string())
        .optional()
        .describe('Validation errors encountered'),
      quality_checks_passed: z
        .boolean()
        .optional()
        .describe('Whether quality checks passed'),
      last_validated_at: z
        .string()
        .datetime()
        .optional()
        .describe('When validation was last performed'),
    })
    .optional(),

  // Notes and metadata
  notes: z.string().optional().describe('Additional notes about this package'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Tags for categorizing this package'),
});

export default PackageProgressSchema;
