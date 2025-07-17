/**
 * Configuration schema for Porter Bridges CLI
 * Defines the structure and validation for user configuration
 */

import { z } from 'zod';

export const ConfigPresetSchema = z.object({
  name: z.string(),
  description: z.string(),
  cache_dir: z.string().optional(),
  timeout: z.number().optional(),
  max_concurrent: z.number().optional(),
  gemini_model: z.string().optional(),
  distill_timeout: z.number().optional(),
  bundle_name: z.string().optional(),
  skip_discovery: z.boolean().optional(),
  skip_collection: z.boolean().optional(),
  skip_distillation: z.boolean().optional(),
  filter_type: z.enum(['primer', 'blog_post', 'changelog']).optional(),
  filter_loader: z.enum(['fabric', 'forge', 'neoforge', 'vanilla']).optional(),
  filter_priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  min_relevance: z.number().min(0).max(1).optional(),
  include_retry: z.boolean().optional(),
  resume: z.boolean().optional(),
});

export const ConfigSchema = z.object({
  version: z.string(),
  user: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    first_time: z.boolean().default(true),
    last_config_update: z.string().optional(),
  }),
  defaults: z.object({
    cache_dir: z.string().default('./.discovery-cache'),
    timeout: z.number().default(30000),
    max_concurrent: z.number().default(3),
    gemini_model: z.string().default('gemini-2.5-flash'),
    distill_timeout: z.number().default(600000),
    bundle_name: z.string().default('porter-bridges'),
    min_relevance: z.number().min(0).max(1).default(0.3),
    include_retry: z.boolean().default(false),
    resume: z.boolean().default(false),
  }),
  presets: z.record(ConfigPresetSchema).default({}),
  ui: z.object({
    theme: z.enum(['default', 'minimal', 'colorful']).default('default'),
    progress_style: z.enum(['bar', 'spinner', 'dots']).default('bar'),
    show_timestamps: z.boolean().default(true),
    show_debug: z.boolean().default(false),
    animation_speed: z.enum(['slow', 'medium', 'fast']).default('medium'),
  }),
  advanced: z.object({
    enable_caching: z.boolean().default(true),
    enable_compression: z.boolean().default(true),
    enable_parallel_processing: z.boolean().default(true),
    enable_auto_updates: z.boolean().default(true),
    telemetry_enabled: z.boolean().default(false),
    debug_mode: z.boolean().default(false),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigPreset = z.infer<typeof ConfigPresetSchema>;

export const DEFAULT_CONFIG: Config = {
  version: '1.0.0',
  user: {
    first_time: true,
  },
  defaults: {
    cache_dir: './.discovery-cache',
    timeout: 30000,
    max_concurrent: 3,
    gemini_model: 'gemini-2.5-flash',
    distill_timeout: 600000,
    bundle_name: 'porter-bridges',
    min_relevance: 0.3,
    include_retry: false,
    resume: false,
  },
  presets: {},
  ui: {
    theme: 'default',
    progress_style: 'bar',
    show_timestamps: true,
    show_debug: false,
    animation_speed: 'medium',
  },
  advanced: {
    enable_caching: true,
    enable_compression: true,
    enable_parallel_processing: true,
    enable_auto_updates: true,
    telemetry_enabled: false,
    debug_mode: false,
  },
};

export const BUILT_IN_PRESETS: Record<string, ConfigPreset> = {
  development: {
    name: 'Development',
    description: 'Fast iteration with debug features enabled',
    timeout: 15000,
    max_concurrent: 2,
    gemini_model: 'gemini-2.5-flash',
    min_relevance: 0.2,
    include_retry: true,
    resume: true,
  },
  production: {
    name: 'Production',
    description: 'Optimized for stability and complete processing',
    timeout: 60000,
    max_concurrent: 5,
    gemini_model: 'gemini-2.5-flash',
    min_relevance: 0.5,
    include_retry: false,
    resume: false,
  },
  ci_cd: {
    name: 'CI/CD',
    description: 'Automated pipeline execution with minimal interaction',
    timeout: 30000,
    max_concurrent: 3,
    gemini_model: 'gemini-2.5-flash',
    min_relevance: 0.3,
    include_retry: false,
    resume: false,
    skip_discovery: false,
    skip_collection: false,
    skip_distillation: false,
  },
  quick_test: {
    name: 'Quick Test',
    description: 'Minimal processing for testing and validation',
    timeout: 10000,
    max_concurrent: 1,
    gemini_model: 'gemini-2.5-flash',
    min_relevance: 0.1,
    filter_priority: 'high',
    include_retry: false,
    resume: true,
  },
  comprehensive: {
    name: 'Comprehensive',
    description: 'Full processing with all sources and maximum quality',
    timeout: 120000,
    max_concurrent: 8,
    gemini_model: 'gemini-2.5-flash',
    min_relevance: 0.1,
    include_retry: true,
    resume: true,
  },
};