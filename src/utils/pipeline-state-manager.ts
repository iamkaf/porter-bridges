/**
 * @file Pipeline State Manager - Manages unified pipeline state
 *
 * This class handles reading, writing, and updating the consolidated
 * pipeline-state.json file that replaces the separate discovered/collected/distilled files.
 */

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import { PipelineStateSchema } from '../schemas/pipeline-state-schema';
import { logger } from './logger';

export type PipelineState = z.infer<typeof PipelineStateSchema>;
export interface PipelineStateWithPackageResult extends PipelineState {
  package_metadata: {
    package_path: string;
    package_stats: any;
  };
}
export interface PipelineStateWithBundleResult extends PipelineState {
  bundle_metadata: {
    bundle_path: string | null;
    archive_path: string | null;
    bundle_options: any;
    bundle_stats: any;
  };
}

export class PipelineStateManager {
  private stateFilePath: string;
  private state: PipelineState;

  constructor(stateFilePath = './generated/pipeline-state.json') {
    this.stateFilePath = stateFilePath;
    this.state = {
      context: {
        pipeline_version: '1.0.0',
        execution_id: '',
        started_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        current_phase: 'discovered',
        skip_phases: [],
        options: {},
      },
      sources: {},
      stats: {},
      metadata: {
        total_sources: 0,
        phase_counts: {
          discovered: 0,
          collected: 0,
          collecting: 0,
          distilling: 0,
          distilled: 0,
          failed: 0,
          packaging: 0,
          packaged: 0,
          bundling: 0,
          bundled: 0,
        },
        completion_percentage: 0,
      },
    };
  }

  /**
   * Initialize a new pipeline state
   */
  async initializeState(options: any = {}): Promise<PipelineState> {
    const executionId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.state = {
      context: {
        pipeline_version: '1.0.0',
        execution_id: executionId,
        started_at: now,
        last_updated: now,
        current_phase: 'discovered',
        skip_phases: options.skipPhases || [],
        options,
      },
      sources: {},
      stats: {},
      metadata: {
        total_sources: 0,
        phase_counts: {
          discovered: 0,
          collected: 0,
          collecting: 0,
          distilling: 0,
          distilled: 0,
          failed: 0,
          packaging: 0,
          packaged: 0,
          bundling: 0,
          bundled: 0,
        },
        completion_percentage: 0,
      },
    };

    await this.saveState();
    logger.info('🆕 Initialized new pipeline state', {
      executionId,
      stateFile: this.stateFilePath,
    });

    return this.state;
  }

  /**
   * Load existing pipeline state or create new one
   */
  async loadState(): Promise<PipelineState> {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      this.state = JSON.parse(data);

      // Validate against schema (be lenient during development)
      const validation = PipelineStateSchema.safeParse(this.state);
      if (!validation.success) {
        logger.warn(
          '⚠️  Pipeline state validation failed, will attempt to fix',
          {
            errors: (validation.error as any).errors?.slice(0, 3), // Show only first 3 errors
          }
        );

        // Try to fix the state structure if it has sources but invalid schema
        if (this.state.sources && Object.keys(this.state.sources).length > 0) {
          this.state = this._fixStateStructure(this.state);
        } else {
          return await this.initializeState();
        }
      }

      // Update last_updated
      this.state.context.last_updated = new Date().toISOString();
      await this.saveState();

      logger.info('📂 Loaded existing pipeline state', {
        executionId: this.state.context.execution_id,
        totalSources: this.state.metadata.total_sources,
        currentPhase: this.state.context.current_phase,
      });

      return this.state;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info('📝 Creating new pipeline state file');
        return await this.initializeState();
      }
      throw error;
    }
  }

  /**
   * Save current state to file
   */
  async saveState(): Promise<void> {
    if (!this.state) {
      throw new Error(
        'No state to save - call loadState() or initializeState() first'
      );
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });

    // Update metadata before saving
    this.updateMetadata();

    // Update last_updated timestamp
    this.state.context.last_updated = new Date().toISOString();

    // Write to file
    await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2));

    logger.info('💾 Saved pipeline state', {
      totalSources: this.state.metadata.total_sources,
      completionPercentage: this.state.metadata.completion_percentage,
    });
  }

  /**
   * Update sources from legacy format (for migration)
   */
  updateSourcesFromLegacy(legacyData: any, phase: string): void {
    if (!this.state) {
      throw new Error('State not loaded');
    }

    // Handle both old format (with stats) and direct sources object
    const sources = legacyData.sources || legacyData;

    for (const [sourceKey, source] of Object.entries(sources)) {
      if (this.state.sources[sourceKey]) {
        // Update existing source
        Object.assign(this.state.sources[sourceKey], source);
      } else {
        // Add new source
        this.state.sources[sourceKey] = source as any;
      }
    }

    // Update current phase
    this.state.context.current_phase = phase as any;

    logger.info(
      `🔄 Updated ${Object.keys(sources).length} sources from legacy ${phase} data`
    );
  }

  /**
   * Update a single source
   */
  updateSource(sourceKey: string, updates: any): void {
    if (!this.state) {
      throw new Error('State not loaded');
    }

    if (!this.state.sources[sourceKey]) {
      logger.warn(`⚠️  Source ${sourceKey} not found in state`);
      return;
    }

    Object.assign(this.state.sources[sourceKey], updates);
    logger.info(`✅ Updated source ${sourceKey}`, { status: updates.status });
  }

  /**
   * Add new sources (typically from discovery)
   */
  addSources(sources: any): void {
    if (!this.state) {
      throw new Error('State not loaded');
    }

    for (const [sourceKey, source] of Object.entries(sources)) {
      this.state.sources[sourceKey] = source as any;
    }

    logger.info(
      `➕ Added ${Object.keys(sources).length} new sources to pipeline state`
    );
  }

  /**
   * Get sources by status/phase
   */
  getSourcesByPhase(phase: string): any {
    if (!this.state) {
      throw new Error('State not loaded');
    }

    return Object.entries(this.state.sources)
      .filter(([_, source]) => source.status === phase)
      .reduce(
        (acc, [key, source]) => {
          (acc as any)[key] = source;
          return acc;
        },
        {} as Record<string, any>
      );
  }

  /**
   * Get sources as array (for processing)
   */
  getSourcesArray(phase: string | null = null): any[] {
    if (!this.state) {
      throw new Error('State not loaded');
    }

    let sources = Object.values(this.state.sources);

    if (phase) {
      sources = sources.filter((source) => source.status === phase);
    }

    // Add _sourceKey for compatibility with existing code
    return Object.entries(this.state.sources)
      .filter(([_, source]) => !phase || source.status === phase)
      .map(([key, source]) => ({ ...source, _sourceKey: key }));
  }

  /**
   * Update phase statistics
   */
  updatePhaseStats(phase: string, stats: any): void {
    if (!this.state) {
      throw new Error('State not loaded');
    }

    (this.state.stats as any)[phase] = {
      ...(this.state.stats as any)[phase],
      ...stats,
    };

    logger.info(`📊 Updated ${phase} statistics`, stats);
  }

  /**
   * Update overall metadata (called automatically on save)
   */
  updateMetadata(): void {
    if (!this.state) {
      return;
    }

    const sources = this.state.sources;
    const totalSources = Object.keys(sources).length;

    // Count sources by phase
    const phaseCounts = {
      discovered: 0,
      collected: 0,
      collecting: 0,
      distilling: 0,
      distilled: 0,
      failed: 0,
      packaging: 0,
      packaged: 0,
      bundling: 0,
      bundled: 0,
    };

    for (const source of Object.values(sources)) {
      if (Object.hasOwn(phaseCounts, source.status)) {
        phaseCounts[source.status]++;
      }
    }

    // Calculate completion percentage (sources that have made it past discovery)
    const completedSources =
      phaseCounts.collected +
      phaseCounts.distilled +
      phaseCounts.packaged +
      phaseCounts.bundled;
    const completionPercentage =
      totalSources > 0
        ? Math.round((completedSources / totalSources) * 100)
        : 0;

    this.state.metadata = {
      total_sources: totalSources,
      phase_counts: phaseCounts,
      completion_percentage: completionPercentage,
    };
  }

  /**
   * Get current state (read-only)
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Fix state structure to match schema
   */
  _fixStateStructure(state: any): any {
    const now = new Date().toISOString();

    // Ensure context exists
    if (!state.context) {
      state.context = {
        pipeline_version: '1.0.0',
        execution_id: crypto.randomUUID(),
        started_at: now,
        last_updated: now,
        current_phase: 'discovered',
        skip_phases: [],
        options: {},
      };
    }

    // Ensure stats exists
    if (!state.stats) {
      state.stats = {};
    }

    // Ensure metadata exists
    if (!state.metadata) {
      state.metadata = {
        total_sources: Object.keys(state.sources || {}).length,
        phase_counts: {
          discovered: 0,
          collected: 0,
          collecting: 0,
          distilling: 0,
          distilled: 0,
          failed: 0,
          packaging: 0,
          packaged: 0,
          bundling: 0,
          bundled: 0,
        },
        completion_percentage: 0,
      };
    }

    logger.info('🔧 Fixed pipeline state structure');
    return state;
  }

  /**
   * Migrate from legacy files
   */
  async migrateFromLegacyFiles(): Promise<boolean> {
    logger.info('🔄 Starting migration from legacy tracking files...');

    // Check for existing legacy files
    const legacyFiles = [
      { path: './generated/discovered-sources.json', phase: 'discovered' },
      { path: './generated/collected-sources.json', phase: 'collected' },
      { path: './generated/distilled-sources.json', phase: 'distilled' },
    ];

    let foundLegacyData = false;

    for (const { path: filePath, phase } of legacyFiles) {
      try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        this.updateSourcesFromLegacy(data, phase);
        foundLegacyData = true;
        logger.info(`✅ Migrated data from ${filePath}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn(`⚠️  Failed to migrate ${filePath}:`, error.message);
        }
      }
    }

    if (foundLegacyData) {
      await this.saveState();
      logger.info('✅ Migration completed successfully');
    } else {
      logger.info('ℹ️  No legacy files found to migrate');
    }

    return foundLegacyData;
  }
}

export default PipelineStateManager;
