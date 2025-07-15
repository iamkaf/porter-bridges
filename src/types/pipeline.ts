/**
 * @file Pipeline Types - TypeScript types inferred from Zod schemas
 */

import type { z } from 'zod';
import type {
  PipelineContext,
  PipelinePhase,
  PipelineSource,
  PipelineStateSchema,
} from '../schemas/pipeline-state-schema';

// Infer TypeScript types from Zod schemas
export type PipelineState = z.infer<typeof PipelineStateSchema>;
export type PipelineSourceType = z.infer<typeof PipelineSource>;
export type PipelinePhaseType = z.infer<typeof PipelinePhase>;
export type PipelineContextType = z.infer<typeof PipelineContext>;

// Sources collection type (keyed by source ID)
export type SourcesCollection = Record<string, PipelineSourceType>;

// Common options types for CLI commands
export interface DiscoveryCLIOptions {
  output: string;
  filterType?: string;
  filterLoader?: string;
  minRelevance?: string;
  cacheDir?: string;
  timeout?: string;
}

export interface CollectionCLIOptions {
  input: string;
  output: string;
  outputDir: string;
  concurrency?: number;
  timeout?: number;
  filterType?: string;
  filterLoader?: string;
  filterPriority?: string;
  minRelevance?: string;
  includeRetry?: boolean;
  resume?: boolean;
  contentDir?: string;
  maxConcurrent?: string;
}

export interface DistillationCLIOptions {
  input: string;
  output: string;
  outputDir: string;
  concurrency?: number;
  geminiModel?: string;
  filterType?: string;
  filterLoader?: string;
  filterPriority?: string;
  minRelevance?: string;
  includeRetry?: boolean;
  resume?: boolean;
  contentDir?: string;
  maxConcurrent?: string;
  timeout?: string;
}

export interface PackageCLIOptions {
  input: string;
  output: string;
  outputDir: string;
  version?: string;
}

export interface BundleCLIOptions {
  input: string;
  output: string;
  outputDir: string;
  createArchive?: boolean;
}

export interface OrchestrationCLIOptions {
  output: string;
  resume?: boolean;
  skipPhases?: string[];
  concurrency?: number;
  skipDiscovery?: boolean;
  skipCollection?: boolean;
  skipDistillation?: boolean;
  cacheDir?: string;
  timeout?: string;
  maxConcurrent?: string;
  geminiModel?: string;
  version?: string;
}

// Progress callback type
export type ProgressCallback = (
  current: number,
  total: number,
  currentFile: string
) => void;

// Module result types
export interface DiscoveryResult {
  stats: {
    total_discovered: number;
    new_sources: number;
    updated_sources: number;
    failed_discoveries: number;
    discovery_start_time: string;
    discovery_end_time: string;
  };
  sources: Record<string, any>;
  summary: {
    total_sources: number;
    source_types: string[];
    loader_types: string[];
    minecraft_versions: string[];
  };
}

export interface CollectionResult {
  sources: Record<string, any>;
  collection_metadata: {
    collected_at: string;
    collection_filters: any;
    collection_stats: {
      stats: any;
      summary: any;
    };
    content_directory: string;
  };
}

export interface DistillationResult {
  sources: Record<string, any>;
  distillation_metadata: {
    distilled_at: string;
    distillation_filters: any;
    distillation_stats: {
      stats: any;
      summary: any;
    };
    content_directory: string;
    output_directory: string;
    gemini_model: string;
  };
}

export interface PackageResult {
  sources: any;
  package_metadata: {
    packaged_at: string;
    package_version: any;
    package_path: any;
    package_options: any;
    package_stats: {
      stats: any;
      summary: {
        total_sources: any;
        packaged_sources: any;
        failed_sources: any;
        success_rate: number;
        total_file_size_kb: number;
        duration_seconds: number;
      };
    };
  };
}

// Pipeline state with additional metadata for different phases
export interface PipelineStateWithCollectionResult extends PipelineState {
  collection_metadata?: CollectionResult['collection_metadata'];
}

export interface PipelineStateWithDistillationResult extends PipelineState {
  distillation_metadata?: DistillationResult['distillation_metadata'];
}

export interface PipelineStateWithPackageResult extends PipelineState {
  package_metadata?: PackageResult['package_metadata'];
}
