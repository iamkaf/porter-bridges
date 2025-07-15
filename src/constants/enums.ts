/**
 * @file Centralized Type-Safe Enum Constants
 *
 * This file provides compile-time type safety for all enum values used throughout
 * the application, eliminating string literal type mismatches and improving IntelliSense.
 */

// Pipeline phase constants
export const PIPELINE_PHASES = [
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
] as const;

export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

// Source type constants
export const SOURCE_TYPES = [
  'primer',
  'blog_post',
  'changelog',
  'guide',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

// Loader type constants
export const LOADER_TYPES = ['vanilla', 'fabric', 'neoforge', 'forge'] as const;

export type LoaderType = (typeof LOADER_TYPES)[number];

// Priority level constants
export const PRIORITY_LEVELS = ['high', 'medium', 'low'] as const;

export type Priority = (typeof PRIORITY_LEVELS)[number];

// Severity level constants
export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

// Status constants for SourceItemSchema compatibility
export const SOURCE_STATUSES = [
  'discovered',
  'pending',
  'collecting',
  'collected',
  'failed',
] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

// API update types
export const API_UPDATE_TYPES = [
  'new_api',
  'enhancement',
  'deprecation',
  'bug_fix',
] as const;

export type ApiUpdateType = (typeof API_UPDATE_TYPES)[number];

// Distillation item statuses
export const DISTILLATION_STATUSES = [
  'pending',
  'distilling',
  'distilled',
  'failed',
  'validation_failed',
] as const;

export type DistillationStatus = (typeof DISTILLATION_STATUSES)[number];

// Output format types
export const OUTPUT_FORMATS = ['json', 'yaml'] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

// Helper functions for validation
export const isValidPipelinePhase = (value: string): value is PipelinePhase => {
  return PIPELINE_PHASES.includes(value as PipelinePhase);
};

export const isValidSourceType = (value: string): value is SourceType => {
  return SOURCE_TYPES.includes(value as SourceType);
};

export const isValidLoaderType = (value: string): value is LoaderType => {
  return LOADER_TYPES.includes(value as LoaderType);
};

export const isValidPriority = (value: string): value is Priority => {
  return PRIORITY_LEVELS.includes(value as Priority);
};

// Enum mappings for backward compatibility
export const ENUM_MAPPINGS = {
  pipelinePhases: PIPELINE_PHASES,
  sourceTypes: SOURCE_TYPES,
  loaderTypes: LOADER_TYPES,
  priorities: PRIORITY_LEVELS,
  severityLevels: SEVERITY_LEVELS,
  sourceStatuses: SOURCE_STATUSES,
  apiUpdateTypes: API_UPDATE_TYPES,
  distillationStatuses: DISTILLATION_STATUSES,
  outputFormats: OUTPUT_FORMATS,
} as const;
