/**
 * @file Progress Manager
 * 
 * Provides enhanced progress bars, real-time status updates, and visual feedback
 * for Porter Bridges CLI operations using modern CLI libraries.
 */

import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { EventEmitter } from 'events';

/**
 * Progress event types
 */
export interface ProgressEvent {
  type: 'start' | 'progress' | 'complete' | 'error' | 'warning' | 'info';
  phase: string;
  message: string;
  current?: number;
  total?: number;
  data?: any;
}

/**
 * Phase configuration
 */
export interface PhaseConfig {
  name: string;
  emoji: string;
  color: keyof typeof chalk;
  estimatedDuration?: number;
}

/**
 * Progress statistics
 */
export interface ProgressStats {
  totalPhases: number;
  completedPhases: number;
  currentPhase: string;
  startTime: number;
  estimatedEndTime?: number;
  errors: number;
  warnings: number;
}

/**
 * Enhanced Progress Manager with real-time updates
 */
export class ProgressManager extends EventEmitter {
  private spinners: Map<string, Ora> = new Map();
  private phases: Map<string, PhaseConfig> = new Map();
  private stats: ProgressStats;
  private startTime: number = Date.now();
  private isInteractive: boolean = true;
  private logMode: boolean = false;

  constructor(phases: PhaseConfig[] = [], options: { interactive?: boolean; logMode?: boolean } = {}) {
    super();
    
    this.isInteractive = options.interactive ?? process.stdout.isTTY;
    this.logMode = options.logMode ?? false;
    
    this.stats = {
      totalPhases: phases.length,
      completedPhases: 0,
      currentPhase: '',
      startTime: this.startTime,
      errors: 0,
      warnings: 0,
    };

    // Register phases
    phases.forEach(phase => {
      this.phases.set(phase.name, phase);
    });

    // Handle process events
    this.setupProcessHandlers();
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Start a phase
   */
  startPhase(phaseName: string, message?: string): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    this.stats.currentPhase = phaseName;
    const displayMessage = message || `${phase.emoji} ${phase.name}`;

    if (this.logMode) {
      console.log(chalk[phase.color](`[${this.formatTime()}] Starting: ${displayMessage}`));
    } else if (this.isInteractive) {
      const spinner = ora({
        text: displayMessage,
        color: phase.color,
        spinner: 'dots',
      }).start();
      
      this.spinners.set(phaseName, spinner);
    } else {
      console.log(chalk[phase.color](`⏳ ${displayMessage}`));
    }

    this.emit('phaseStart', {
      type: 'start',
      phase: phaseName,
      message: displayMessage,
    });
  }

  /**
   * Update phase progress
   */
  updatePhase(phaseName: string, message: string, current?: number, total?: number): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    const progressText = current !== undefined && total !== undefined 
      ? `${message} (${current}/${total})`
      : message;

    if (this.logMode) {
      console.log(chalk[phase.color](`[${this.formatTime()}] ${progressText}`));
    } else if (this.isInteractive) {
      const spinner = this.spinners.get(phaseName);
      if (spinner) {
        spinner.text = `${phase.emoji} ${progressText}`;
      }
    } else {
      console.log(chalk[phase.color](`📊 ${progressText}`));
    }

    this.emit('phaseProgress', {
      type: 'progress',
      phase: phaseName,
      message: progressText,
      current,
      total,
    });
  }

  /**
   * Complete a phase
   */
  completePhase(phaseName: string, message?: string): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    this.stats.completedPhases++;
    const displayMessage = message || `${phase.name} completed`;

    if (this.logMode) {
      console.log(chalk.green(`[${this.formatTime()}] ✓ ${displayMessage}`));
    } else if (this.isInteractive) {
      const spinner = this.spinners.get(phaseName);
      if (spinner) {
        spinner.succeed(displayMessage);
        this.spinners.delete(phaseName);
      }
    } else {
      console.log(chalk.green(`✓ ${displayMessage}`));
    }

    this.emit('phaseComplete', {
      type: 'complete',
      phase: phaseName,
      message: displayMessage,
    });
  }

  /**
   * Fail a phase
   */
  failPhase(phaseName: string, error: string): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    this.stats.errors++;
    const displayMessage = `${phase.name} failed: ${error}`;

    if (this.logMode) {
      console.log(chalk.red(`[${this.formatTime()}] ✗ ${displayMessage}`));
    } else if (this.isInteractive) {
      const spinner = this.spinners.get(phaseName);
      if (spinner) {
        spinner.fail(displayMessage);
        this.spinners.delete(phaseName);
      }
    } else {
      console.log(chalk.red(`✗ ${displayMessage}`));
    }

    this.emit('phaseError', {
      type: 'error',
      phase: phaseName,
      message: displayMessage,
    });
  }

  /**
   * Add a warning to a phase
   */
  warnPhase(phaseName: string, warning: string): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    this.stats.warnings++;
    const displayMessage = `${phase.name} warning: ${warning}`;

    if (this.logMode) {
      console.log(chalk.yellow(`[${this.formatTime()}] ⚠ ${displayMessage}`));
    } else if (this.isInteractive) {
      const spinner = this.spinners.get(phaseName);
      if (spinner) {
        spinner.warn(displayMessage);
        // Restart spinner after warning
        const newSpinner = ora({
          text: `${phase.emoji} ${phase.name}`,
          color: phase.color,
          spinner: 'dots',
        }).start();
        this.spinners.set(phaseName, newSpinner);
      }
    } else {
      console.log(chalk.yellow(`⚠ ${displayMessage}`));
    }

    this.emit('phaseWarning', {
      type: 'warning',
      phase: phaseName,
      message: displayMessage,
    });
  }

  /**
   * Add info message to a phase
   */
  infoPhase(phaseName: string, info: string): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    const displayMessage = `${phase.name}: ${info}`;

    if (this.logMode) {
      console.log(chalk.cyan(`[${this.formatTime()}] ℹ ${displayMessage}`));
    } else if (this.isInteractive) {
      const spinner = this.spinners.get(phaseName);
      if (spinner) {
        spinner.info(displayMessage);
        // Restart spinner after info
        const newSpinner = ora({
          text: `${phase.emoji} ${phase.name}`,
          color: phase.color,
          spinner: 'dots',
        }).start();
        this.spinners.set(phaseName, newSpinner);
      }
    } else {
      console.log(chalk.cyan(`ℹ ${displayMessage}`));
    }

    this.emit('phaseInfo', {
      type: 'info',
      phase: phaseName,
      message: displayMessage,
    });
  }

  /**
   * Show overall progress summary
   */
  showSummary(): void {
    const duration = Date.now() - this.startTime;
    const formattedDuration = this.formatDuration(duration);

    console.log('\n' + chalk.bold('📊 Progress Summary:'));
    console.log(`   Duration: ${formattedDuration}`);
    console.log(`   Completed: ${this.stats.completedPhases}/${this.stats.totalPhases} phases`);
    
    if (this.stats.errors > 0) {
      console.log(chalk.red(`   Errors: ${this.stats.errors}`));
    }
    
    if (this.stats.warnings > 0) {
      console.log(chalk.yellow(`   Warnings: ${this.stats.warnings}`));
    }

    const successRate = (this.stats.completedPhases / this.stats.totalPhases) * 100;
    const statusColor = successRate === 100 ? 'green' : successRate > 50 ? 'yellow' : 'red';
    console.log(chalk[statusColor](`   Success Rate: ${successRate.toFixed(1)}%`));
    
    if (this.stats.errors === 0) {
      console.log(chalk.green('   Status: ✓ Success'));
    } else {
      console.log(chalk.red('   Status: ✗ Failed'));
    }
  }

  /**
   * Get current progress statistics
   */
  getStats(): ProgressStats {
    return { ...this.stats };
  }

  /**
   * Clean up spinners
   */
  cleanup(): void {
    this.spinners.forEach(spinner => {
      if (spinner.isSpinning) {
        spinner.stop();
      }
    });
    this.spinners.clear();
  }

  /**
   * Format current time
   */
  private formatTime(): string {
    return new Date().toLocaleTimeString();
  }

  /**
   * Format duration in human readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

/**
 * Create a progress manager for Porter Bridges pipeline
 */
export function createPipelineProgressManager(options: { interactive?: boolean; logMode?: boolean } = {}): ProgressManager {
  const phases: PhaseConfig[] = [
    {
      name: 'Discovery',
      emoji: '🔍',
      color: 'cyan',
      estimatedDuration: 30000,
    },
    {
      name: 'Collection',
      emoji: '📥',
      color: 'blue',
      estimatedDuration: 60000,
    },
    {
      name: 'Distillation',
      emoji: '🧪',
      color: 'magenta',
      estimatedDuration: 120000,
    },
    {
      name: 'Packaging',
      emoji: '📦',
      color: 'yellow',
      estimatedDuration: 30000,
    },
    {
      name: 'Bundling',
      emoji: '🗜️',
      color: 'green',
      estimatedDuration: 20000,
    },
  ];

  return new ProgressManager(phases, options);
}

/**
 * Simple progress bar for batch operations
 */
export class BatchProgressBar {
  private total: number;
  private current: number = 0;
  private label: string;
  private width: number = 40;
  private isInteractive: boolean;

  constructor(total: number, label: string, options: { width?: number; interactive?: boolean } = {}) {
    this.total = total;
    this.label = label;
    this.width = options.width ?? 40;
    this.isInteractive = options.interactive ?? process.stdout.isTTY;
  }

  /**
   * Update progress
   */
  update(current: number, message?: string): void {
    this.current = current;
    
    if (!this.isInteractive) {
      if (message) {
        console.log(`[${current}/${this.total}] ${message}`);
      }
      return;
    }

    const percent = Math.round((current / this.total) * 100);
    const filled = Math.round((current / this.total) * this.width);
    const empty = this.width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const line = `\r${this.label} [${bar}] ${percent}% (${current}/${this.total})`;
    
    if (message) {
      process.stdout.write(line + ` - ${message}`);
    } else {
      process.stdout.write(line);
    }

    if (current >= this.total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Complete the progress bar
   */
  complete(message?: string): void {
    this.update(this.total, message);
  }
}

/**
 * Multi-line progress display for concurrent operations
 */
export class MultiProgressDisplay {
  private operations: Map<string, { current: number; total: number; message: string }> = new Map();
  private isInteractive: boolean;

  constructor(options: { interactive?: boolean } = {}) {
    this.isInteractive = options.interactive ?? process.stdout.isTTY;
  }

  /**
   * Add or update an operation
   */
  updateOperation(id: string, current: number, total: number, message: string): void {
    this.operations.set(id, { current, total, message });
    
    if (!this.isInteractive) {
      console.log(`[${id}] ${current}/${total} - ${message}`);
      return;
    }

    this.render();
  }

  /**
   * Complete an operation
   */
  completeOperation(id: string, message?: string): void {
    const op = this.operations.get(id);
    if (op) {
      this.updateOperation(id, op.total, op.total, message || 'Complete');
    }
  }

  /**
   * Remove an operation
   */
  removeOperation(id: string): void {
    this.operations.delete(id);
    if (this.isInteractive) {
      this.render();
    }
  }

  /**
   * Render the multi-progress display
   */
  private render(): void {
    if (!this.isInteractive) return;

    // Clear previous output
    process.stdout.write('\x1B[2J\x1B[0f');
    
    console.log(chalk.bold('🔄 Operations in Progress:\n'));
    
    this.operations.forEach((op, id) => {
      const percent = Math.round((op.current / op.total) * 100);
      const filled = Math.round((op.current / op.total) * 20);
      const empty = 20 - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      
      const color = percent === 100 ? 'green' : percent > 50 ? 'yellow' : 'cyan';
      console.log(chalk[color](`${id}: [${bar}] ${percent}% - ${op.message}`));
    });
  }

  /**
   * Clear the display
   */
  clear(): void {
    this.operations.clear();
    if (this.isInteractive) {
      process.stdout.write('\x1B[2J\x1B[0f');
    }
  }
}

/**
 * Export types and utilities
 */
export { PhaseConfig, ProgressEvent, ProgressStats };