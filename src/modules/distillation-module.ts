/**
 * @file Distillation Module - Processes collected content using AI to extract structured porting intelligence
 *
 * This module handles the third phase of the pipeline - using AI to analyze collected content and extract
 * structured porting information. It processes raw HTML and markdown content from blog posts and primers,
 * transforming them into structured data that matches the DistilledContentSchema.
 *
 * Key responsibilities:
 * - Process collected content using Gemini CLI
 * - Extract structured porting intelligence (breaking changes, API updates, migration guides)
 * - Update source status (collected → distilling → distilled/failed)
 * - Track processing metadata (token usage, timing, confidence scores)
 * - Handle AI processing errors with retry logic
 * - Support resume functionality for interrupted processing
 * - Provide progress reporting for CLI integration
 */

import { promises as fs } from 'node:fs';
import { logger } from '../utils/logger';
import type { PipelineState } from '../utils/pipeline-state-manager';
import { GeminiProcessor } from './distillation/gemini-processor';

/**
 * Simple filters for distillation sources
 */
class DistillationFilters {
  async filterSources(sourcesData: any, filters: any, outputDirectory: string) {
    const sources = [];
    let skippedCount = 0;

    // Check for existing distilled files
    let existingFiles: Set<string> = new Set();
    try {
      const files = await fs.readdir(outputDirectory);
      existingFiles = new Set(files.filter(f => f.endsWith('.json')));
      if (existingFiles.size > 0) {
        logger.info(`🔍 Found ${existingFiles.size} existing distilled files in ${outputDirectory}`);
      }
    } catch (error) {
      // Directory might not exist yet, that's okay
    }

    // Preserve the original keys for proper updating
    for (const [sourceKey, source] of Object.entries(
      sourcesData.sources || {}
    )) {
      // Add the source key to the source object for later reference
      const sourceWithKey = { ...(source as any), _sourceKey: sourceKey };

      // Check if this source already has a distilled file
      const outputFilename = `${(source as any).url.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      if (existingFiles.has(outputFilename) && !filters.forceReprocess) {
        // Update the source status to distilled if file exists
        (source as any).status = 'distilled';
        (source as any).distilled_at = (source as any).distilled_at || new Date().toISOString();
        
        // CRITICAL: Apply this update back to the sourcesData immediately
        if (sourcesData.sources && sourcesData.sources[sourceKey]) {
          sourcesData.sources[sourceKey].status = 'distilled';
          sourcesData.sources[sourceKey].distilled_at = (source as any).distilled_at;
        }
        
        logger.info(`⏭️  Skipping already distilled: ${(source as any).url} (found ${outputFilename})`);
        skippedCount++;
        continue;
      }

      // Skip sources marked to skip distillation
      if ((source as any).processing_hints?.skip_distillation) {
        // Update status to indicate it was skipped
        (source as any).status = 'packaged';
        (source as any).distillation_metadata = {
          skipped: true,
          reason: 'skip_distillation hint',
          timestamp: new Date().toISOString()
        };
        
        // CRITICAL: Apply this update back to the sourcesData immediately
        if (sourcesData.sources && sourcesData.sources[sourceKey]) {
          sourcesData.sources[sourceKey].status = 'packaged';
          sourcesData.sources[sourceKey].distillation_metadata = (source as any).distillation_metadata;
        }
        
        logger.info(`⏭️  Skipping distillation (marked to skip): ${(source as any).url}`);
        skippedCount++;
        continue;
      }

      // Only process collected sources (unless retrying)
      if (!filters.includeRetry && (source as any).status !== 'collected') {
        continue;
      }

      // For retry, include failed distillations
      if (
        filters.includeRetry &&
        (source as any).status !== 'collected' &&
        (source as any).status !== 'failed'
      ) {
        continue;
      }

      // Apply filters
      if (
        filters.sourceType &&
        (source as any).source_type !== filters.sourceType
      ) {
        continue;
      }

      if (
        filters.loaderType &&
        (source as any).loader_type !== filters.loaderType
      ) {
        continue;
      }

      if (filters.priority && (source as any).priority !== filters.priority) {
        continue;
      }

      if (
        filters.minRelevance &&
        (source as any).relevance_score < filters.minRelevance
      ) {
        continue;
      }

      sources.push(sourceWithKey);
    }

    if (skippedCount > 0) {
      logger.info(`✅ Skipped ${skippedCount} already distilled sources (found existing files in output directory)`);
    }

    return { sources, skippedCount };
  }
}

/**
 * Simple stats tracking for distillation
 */
class DistillationStats {
  stats: any;

  constructor() {
    this.reset();
  }

  reset() {
    this.stats = {
      total_sources: 0,
      distilled_sources: 0,
      failed_sources: 0,
      skipped_sources: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      distillation_start_time: null,
      distillation_end_time: null,
    };
  }

  startDistillation() {
    this.stats.distillation_start_time = new Date().toISOString();
  }

  setTotalSources(count: number) {
    this.stats.total_sources = count;
  }

  incrementDistilled() {
    this.stats.distilled_sources++;
  }

  incrementFailed() {
    this.stats.failed_sources++;
  }

  incrementSkipped() {
    this.stats.skipped_sources++;
  }

  addSkipped(count: number) {
    this.stats.skipped_sources += count;
  }

  endDistillation() {
    this.stats.distillation_end_time = new Date().toISOString();
  }

  getStats() {
    return { ...this.stats };
  }

  getSummary() {
    const durationMs =
      this.stats.distillation_end_time && this.stats.distillation_start_time
        ? new Date(this.stats.distillation_end_time).getTime() -
          new Date(this.stats.distillation_start_time).getTime()
        : 0;

    return {
      total_sources: this.stats.total_sources,
      distilled_sources: this.stats.distilled_sources,
      failed_sources: this.stats.failed_sources,
      success_rate:
        this.stats.total_sources > 0
          ? Math.round(
              (this.stats.distilled_sources / this.stats.total_sources) * 100
            )
          : 0,
      total_tokens:
        this.stats.total_input_tokens + this.stats.total_output_tokens,
      duration_seconds: Math.round(durationMs / 1000),
    };
  }
}

/**
 * Main Distillation Module class
 */
export class DistillationModule {
  private options: any;
  private filters: any;
  private stats: any;
  private geminiProcessor: any;

  constructor(options: any = {}) {
    this.options = {
      outputDirectory:
        options.outputDirectory || './generated/distilled-content',
      maxConcurrentDistillations: options.maxConcurrentDistillations || 1,
      progressCallback: options.progressCallback || null,
      ...options,
    };

    this.filters = new DistillationFilters();
    this.stats = new DistillationStats();
    this.geminiProcessor = new GeminiProcessor(this.options);
  }

  /**
   * Main distillation entry point
   */
  async distill(sourcesData: any, filters: Record<string, any> = {}) {
    logger.info('🧪 Starting AI distillation process');
    this.stats.startDistillation();

    try {
      // Ensure output directory exists
      await fs.mkdir(this.options.outputDirectory, { recursive: true });

      // Verify Gemini CLI is available
      await this.geminiProcessor.verifyGeminiCLI();

      // Filter sources based on criteria
      const filterResult = await this.filters.filterSources(sourcesData, filters, this.options.outputDirectory);
      const sources = filterResult.sources;
      this.stats.setTotalSources(sources.length);
      if (filterResult.skippedCount > 0) {
        this.stats.addSkipped(filterResult.skippedCount);
      }

      if (sources.length === 0) {
        const distilledCount = Object.values(sourcesData.sources || {}).filter(
          (s: any) => s.status === 'distilled'
        ).length;
        if (distilledCount > 0) {
          logger.info(`✅ All ${distilledCount} sources are already distilled`);
        } else {
          logger.warn('⚠️  No sources match the distillation criteria');
        }
        this.stats.endDistillation();
        return this._buildResults(sourcesData, filters);
      }

      logger.info('🎯 Found sources to distill', { count: sources.length });

      // Group sources by type for better progress reporting
      const sourcesByType = this._groupSourcesByType(sources);
      const alreadyDistilledCount = Object.values(sourcesData.sources || {}).filter(
        (s: any) => s.status === 'distilled'
      ).length;
      logger.info('📋 Distillation plan', {
        breakdown: this._getBreakdownCounts(sourcesByType),
        alreadyDistilled: alreadyDistilledCount,
        toProcess: sources.length,
      });

      // Estimate processing time
      const estimatedMinutes = Math.ceil(sources.length * 1); // ~1 minute per source
      logger.info('⏱️  Estimated processing time', {
        estimatedTimeMinutes: estimatedMinutes,
      });

      // Process sources sequentially
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        try {
          logger.info(
            `🧪 ${source.source_type}: ${source.title || source.url}`
          );

          // Call progress callback with current file being processed
          if (this.options.progressCallback) {
            const displayName = `${source.source_type}: ${source.title || source.url}`;
            this.options.progressCallback(i, sources.length, displayName);
          }

          const result = await this.geminiProcessor.distillSingleSource(
            source,
            {
              output: 'Processing...',
            }
          );
          this.stats.incrementDistilled();

          // CRITICAL: Use the metadata from GeminiProcessor result
          Object.assign(source, result.updatedSource);

          // Update source in sourcesData using the preserved source key
          if (source._sourceKey && sourcesData.sources[source._sourceKey]) {
            Object.assign(sourcesData.sources[source._sourceKey], source);
            // Remove the temporary key from the source object
            sourcesData.sources[source._sourceKey]._sourceKey = undefined;
          }
        } catch (error: any) {
          this.stats.incrementFailed();

          // Update source with error
          source.status = 'failed';
          source.error = {
            code: 'distillation_error',
            message: error.message,
            timestamp: new Date().toISOString(),
            retry_count: (source.error?.retry_count || 0) + 1,
          };

          // Update source in sourcesData using the preserved source key
          if (source._sourceKey && sourcesData.sources[source._sourceKey]) {
            Object.assign(sourcesData.sources[source._sourceKey], source);
            // Remove the temporary key from the source object
            sourcesData.sources[source._sourceKey]._sourceKey = undefined;
          }

          logger.error(
            `❌ Distillation failed: ${source.url} - ${error.message}`
          );
        }
      }

      this.stats.endDistillation();

      // Log summary
      this._logSummary();

      return this._buildResults(sourcesData, filters);
    } catch (error: any) {
      this.stats.endDistillation();
      logger.error('💥 Distillation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get distillation results for export
   */
  getDistillationResults() {
    return {
      stats: this.stats.getStats(),
      summary: this.stats.getSummary(),
    };
  }

  // Private helper methods

  _groupSourcesByType(sources: any[]) {
    const grouped: Record<string, any[]> = {};
    for (const source of sources) {
      const type = source.source_type || 'unknown';
      if (!grouped[type as string]) {
        grouped[type as string] = [];
      }
      grouped[type as string].push(source);
    }
    return grouped;
  }

  _getBreakdownCounts(sourcesByType: Record<string, any[]>) {
    const breakdown: Record<string, number> = {};
    for (const [type, sources] of Object.entries(sourcesByType)) {
      breakdown[type] = (sources as any[]).length;
    }
    return breakdown;
  }

  _createDistillationTasks(
    sourcesByType: Record<string, unknown[]>,
    sourcesData: PipelineState
  ) {
    const tasks = [];

    for (const [type, sources] of Object.entries(sourcesByType)) {
      for (const source of sources as any[]) {
        tasks.push({
          title: `${type}: ${source.title || source.url}`,
          task: async (_ctx: unknown, task: unknown) => {
            try {
              await this.geminiProcessor.distillSingleSource(source, task);
              this.stats.incrementDistilled();

              // Update source in sourcesData using the preserved source key
              if (source._sourceKey && sourcesData.sources[source._sourceKey]) {
                Object.assign(sourcesData.sources[source._sourceKey], source);
                // Remove the temporary key from the source object
                sourcesData.sources[source._sourceKey]._sourceKey = undefined;
              }
            } catch (error: any) {
              this.stats.incrementFailed();

              // Update source with error
              source.status = 'failed';
              source.error = {
                code: 'distillation_error',
                message: error.message,
                timestamp: new Date().toISOString(),
                retry_count: (source.error?.retry_count || 0) + 1,
              };

              // Update source in sourcesData using the preserved source key
              if (source._sourceKey && sourcesData.sources[source._sourceKey]) {
                Object.assign(sourcesData.sources[source._sourceKey], source);
                // Remove the temporary key from the source object
                sourcesData.sources[source._sourceKey]._sourceKey = undefined;
              }

              logger.error('❌ Distillation failed', {
                sourceUrl: source.url,
                error: error.message,
              });

              throw error;
            }
          },
        });
      }
    }

    return tasks;
  }

  _logSummary() {
    const summary = this.stats.getSummary();

    logger.info('📊 Distillation Summary', {
      totalSources: summary.total_sources,
      distilledSources: summary.distilled_sources,
      failedSources: summary.failed_sources,
      skippedSources: this.stats.stats.skipped_sources,
      totalInputTokens: this.stats.stats.total_input_tokens,
      totalOutputTokens: this.stats.stats.total_output_tokens,
      durationSeconds: summary.duration_seconds,
    });

    if (this.stats.stats.skipped_sources > 0) {
      logger.info(`⏭️  Skipped ${this.stats.stats.skipped_sources} already distilled sources (files exist in output directory)`);
    }

    if (summary.distilled_sources > 0) {
      const avgTime = summary.duration_seconds / summary.distilled_sources;
      logger.info('⚡ Performance metrics', {
        avgTimePerSourceSeconds: Math.round(avgTime),
      });
    }
  }

  /**
   * Resume distillation from previous state
   */
  async resumeDistillation(sourcesData: any, filters: any = {}): Promise<any> {
    logger.info('🔄 Resuming distillation process');
    // For simplicity, just delegate to regular distill method
    // The filtering logic will handle resume scenarios
    return await this.distill(sourcesData, { ...filters, includeRetry: true });
  }

  _buildResults(sourcesData: any, filters: any): any {
    return {
      sources: sourcesData.sources,
      distillation_metadata: {
        distilled_at: new Date().toISOString(),
        distillation_filters: filters,
        distillation_stats: {
          stats: this.stats.getStats(),
          summary: this.stats.getSummary(),
        },
        content_directory: this.options.contentDirectory,
        output_directory: this.options.outputDirectory,
        gemini_model: this.options.geminiModel,
      },
    };
  }
}

export default DistillationModule;
