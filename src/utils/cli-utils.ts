/**
 * CLI Utilities for Porter Bridges
 * Provides enhanced formatting, colors, and user interaction tools
 */

import boxen from 'boxen';
import chalk from 'chalk';
import Table from 'cli-table3';
import figlet from 'figlet';
import gradient from 'gradient-string';
import updateNotifier from 'update-notifier';
import { logger } from './logger';

export class CLIUtils {
  /**
   * Create a beautiful header with ASCII art
   */
  static createHeader(title: string, subtitle?: string): string {
    const asciiArt = figlet.textSync(title, {
      font: 'ANSI Shadow',
      horizontalLayout: 'fitted',
      verticalLayout: 'fitted',
    });

    const gradientArt = gradient(['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'])(
      asciiArt
    );

    let header = gradientArt;

    if (subtitle) {
      header += '\n\n' + chalk.cyan.italic(subtitle);
    }

    return header;
  }

  /**
   * Create a styled box with content
   */
  static createBox(
    content: string,
    options?: {
      title?: string;
      type?: 'info' | 'success' | 'warning' | 'error';
      padding?: number;
      margin?: number;
    }
  ): string {
    const { title, type = 'info', padding = 1, margin = 1 } = options || {};

    let borderColor = '#ffffff';
    let titleColor = chalk.white;

    switch (type) {
      case 'success':
        borderColor = '#00ff00';
        titleColor = chalk.green;
        break;
      case 'warning':
        borderColor = '#ffff00';
        titleColor = chalk.yellow;
        break;
      case 'error':
        borderColor = '#ff0000';
        titleColor = chalk.red;
        break;
      case 'info':
      default:
        borderColor = '#00ffff';
        titleColor = chalk.cyan;
    }

    return boxen(content, {
      title: title ? titleColor(title) : undefined,
      borderColor: borderColor as any,
      borderStyle: 'round',
      padding,
      margin,
      align: 'left',
    });
  }

  /**
   * Create a progress indicator
   */
  static createProgress(current: number, total: number, width = 40): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const progressBar = gradient(['#ff6b6b', '#4ecdc4', '#45b7d1'])(bar);

    return `${progressBar} ${percentage}% (${current}/${total})`;
  }

  /**
   * Create a status indicator
   */
  static createStatus(
    status: 'pending' | 'running' | 'success' | 'error' | 'warning',
    message: string
  ): string {
    let icon: string;
    let color: typeof chalk.white;

    switch (status) {
      case 'pending':
        icon = '⏳';
        color = chalk.yellow;
        break;
      case 'running':
        icon = '🔄';
        color = chalk.blue;
        break;
      case 'success':
        icon = '✅';
        color = chalk.green;
        break;
      case 'error':
        icon = '❌';
        color = chalk.red;
        break;
      case 'warning':
        icon = '⚠️';
        color = chalk.yellow;
        break;
    }

    return `${icon} ${color(message)}`;
  }

  /**
   * Create a table with data
   */
  static createTable(
    headers: string[],
    rows: string[][],
    options?: {
      title?: string;
      style?: 'compact' | 'default' | 'fancy';
    }
  ): string {
    const { title, style = 'default' } = options || {};

    const tableOptions: any = {
      head: headers.map((h) => chalk.cyan.bold(h)),
    };

    switch (style) {
      case 'compact':
        tableOptions.style = { compact: true };
        break;
      case 'fancy':
        tableOptions.style = {
          head: ['cyan'],
          border: ['grey'],
        };
        break;
      case 'default':
      default:
        tableOptions.style = {
          head: ['cyan'],
        };
    }

    const table = new Table(tableOptions);
    table.push(...rows);

    let result = table.toString();

    if (title) {
      result = chalk.bold.underline(title) + '\n\n' + result;
    }

    return result;
  }

  /**
   * Create a section separator
   */
  static createSeparator(title?: string, length = 60): string {
    const line = '═'.repeat(length);
    const gradientLine = gradient(['#ff6b6b', '#4ecdc4'])(line);

    if (title) {
      const titleLength = title.length;
      const padding = Math.max(0, Math.floor((length - titleLength - 2) / 2));
      const paddedTitle =
        '═'.repeat(padding) + ` ${title} ` + '═'.repeat(padding);
      return gradient(['#ff6b6b', '#4ecdc4'])(paddedTitle);
    }

    return gradientLine;
  }

  /**
   * Create a formatted list
   */
  static createList(
    items: string[],
    options?: {
      type?: 'bullet' | 'number' | 'check';
      indent?: number;
    }
  ): string {
    const { type = 'bullet', indent = 2 } = options || {};
    const indentStr = ' '.repeat(indent);

    return items
      .map((item, index) => {
        let prefix: string;

        switch (type) {
          case 'number':
            prefix = chalk.cyan(`${index + 1}.`);
            break;
          case 'check':
            prefix = chalk.green('✓');
            break;
          case 'bullet':
          default:
            prefix = chalk.blue('•');
        }

        return `${indentStr}${prefix} ${item}`;
      })
      .join('\n');
  }

  /**
   * Create a key-value display
   */
  static createKeyValue(
    data: Record<string, any>,
    options?: {
      title?: string;
      indent?: number;
      colorKeys?: boolean;
    }
  ): string {
    const { title, indent = 2, colorKeys = true } = options || {};
    const indentStr = ' '.repeat(indent);

    const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));

    const lines = Object.entries(data).map(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLength);
      const coloredKey = colorKeys ? chalk.cyan(paddedKey) : paddedKey;
      const coloredValue =
        typeof value === 'string'
          ? chalk.white(value)
          : chalk.yellow(String(value));

      return `${indentStr}${coloredKey}: ${coloredValue}`;
    });

    let result = lines.join('\n');

    if (title) {
      result = chalk.bold.underline(title) + '\n\n' + result;
    }

    return result;
  }

  /**
   * Create a warning message
   */
  static createWarning(message: string, details?: string[]): string {
    let content = chalk.yellow.bold('⚠️  WARNING: ') + chalk.yellow(message);

    if (details && details.length > 0) {
      content += '\n\n' + details.map((detail) => `  • ${detail}`).join('\n');
    }

    return CLIUtils.createBox(content, { type: 'warning' });
  }

  /**
   * Create an error message
   */
  static createError(message: string, details?: string[]): string {
    let content = chalk.red.bold('❌ ERROR: ') + chalk.red(message);

    if (details && details.length > 0) {
      content += '\n\n' + details.map((detail) => `  • ${detail}`).join('\n');
    }

    return CLIUtils.createBox(content, { type: 'error' });
  }

  /**
   * Create a success message
   */
  static createSuccess(message: string, details?: string[]): string {
    let content = chalk.green.bold('✅ SUCCESS: ') + chalk.green(message);

    if (details && details.length > 0) {
      content += '\n\n' + details.map((detail) => `  • ${detail}`).join('\n');
    }

    return CLIUtils.createBox(content, { type: 'success' });
  }

  /**
   * Create an info message
   */
  static createInfo(message: string, details?: string[]): string {
    let content = chalk.cyan.bold('ℹ️  INFO: ') + chalk.cyan(message);

    if (details && details.length > 0) {
      content += '\n\n' + details.map((detail) => `  • ${detail}`).join('\n');
    }

    return CLIUtils.createBox(content, { type: 'info' });
  }

  /**
   * Clear the screen
   */
  static clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[0f');
  }

  /**
   * Check for updates
   */
  static async checkForUpdates(): Promise<void> {
    try {
      const notifier = updateNotifier({
        pkg: {
          name: 'porter-bridges',
          version: '1.0.0',
        },
        updateCheckInterval: 1000 * 60 * 60 * 24, // 24 hours
      });

      if (notifier.update) {
        const message = `Update available: ${chalk.dim(notifier.update.current)} → ${chalk.green(notifier.update.latest)}`;
        const updateBox = CLIUtils.createBox(
          message +
            '\n\n' +
            chalk.cyan('Run: ') +
            chalk.white('npm install -g porter-bridges'),
          { title: 'Update Available', type: 'info' }
        );

        console.log(updateBox);
      }
    } catch (error) {
      logger.debug('Failed to check for updates', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Create a loading animation
   */
  static createSpinner(message: string): {
    start: () => void;
    stop: () => void;
    updateMessage: (msg: string) => void;
  } {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let currentFrame = 0;
    let interval: NodeJS.Timeout | null = null;
    let currentMessage = message;

    const start = () => {
      if (interval) return;

      interval = setInterval(() => {
        process.stdout.write(
          `\r${chalk.cyan(frames[currentFrame])} ${currentMessage}`
        );
        currentFrame = (currentFrame + 1) % frames.length;
      }, 100);
    };

    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
        process.stdout.write(
          '\r' + ' '.repeat(currentMessage.length + 2) + '\r'
        );
      }
    };

    const updateMessage = (msg: string) => {
      currentMessage = msg;
    };

    return { start, stop, updateMessage };
  }

  /**
   * Format file size
   */
  static formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Format duration
   */
  static formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Create a timestamp
   */
  static createTimestamp(date?: Date): string {
    const now = date || new Date();
    return chalk.gray(`[${now.toISOString().substr(11, 8)}]`);
  }
}
