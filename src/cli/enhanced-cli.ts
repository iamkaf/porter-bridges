/**
 * @file Enhanced CLI Command
 *
 * Integrates all CLI enhancements including interactive wizard, progress bars,
 * colorized output, and improved user experience.
 */

import { promises as fs } from 'node:fs';
import boxen from 'boxen';
import chalk from 'chalk';
import { Command } from 'commander';
import figlet from 'figlet';
import gradient from 'gradient-string';
import { logger } from '../utils/logger';
import { CompletionInstaller } from './completions';
import { ConfigWizard } from './config-wizard';
import { OrchestrationCommand } from './orchestration-command';
import { createPipelineProgressManager } from './progress-manager';

/**
 * Enhanced CLI with modern features
 */
export class EnhancedCLI {
  private program: Command;
  private configWizard: ConfigWizard;
  private completionInstaller: CompletionInstaller;

  constructor() {
    this.program = new Command();
    this.configWizard = new ConfigWizard();
    this.completionInstaller = new CompletionInstaller();

    this.setupProgram();
  }

  /**
   * Setup the CLI program
   */
  private setupProgram(): void {
    this.program
      .name('porter-bridges')
      .alias('pb')
      .version('1.0.0')
      .description(this.getDescription())
      .configureOutput({
        outputError: (str: string) => {
          console.error(chalk.red(str));
        },
      })
      .configureHelp({
        formatHelp: (cmd: Command, helper: any) => {
          const terminalWidth = process.stdout.columns || 80;
          const helpText = helper.formatHelp(cmd, helper);
          return this.formatHelpText(helpText, terminalWidth);
        },
      });

    // Add global options
    this.program
      .option('-v, --verbose', 'Enable verbose output')
      .option('-q, --quiet', 'Suppress output')
      .option('-c, --config <path>', 'Configuration file path')
      .option('--no-color', 'Disable colored output')
      .option('--json', 'Output in JSON format');

    // Add commands
    this.addCommands();
  }

  /**
   * Get enhanced description with ASCII art
   */
  private getDescription(): string {
    const title = figlet.textSync('Porter Bridges', {
      font: 'Small',
      horizontalLayout: 'default',
      verticalLayout: 'default',
    });

    const gradientTitle = gradient('cyan', 'magenta')(title);
    const subtitle = chalk.gray('🌉 Minecraft Mod Porting Intelligence System');
    const description = chalk.dim(
      'Automated discovery, processing, and packaging of mod porting data'
    );

    return `${gradientTitle}\n${subtitle}\n${description}`;
  }

  /**
   * Format help text with better styling
   */
  private formatHelpText(helpText: string, terminalWidth: number): string {
    const lines = helpText.split('\n');
    const formatted = lines.map((line) => {
      // Highlight command names
      if (line.includes('Usage:')) {
        return chalk.yellow.bold(line);
      }

      // Highlight section headers
      if (line.match(/^[A-Z][a-z]+:$/)) {
        return chalk.cyan.bold(line);
      }

      // Highlight options
      if (line.match(/^\s*-/)) {
        const parts = line.split(/\s{2,}/);
        if (parts.length >= 2) {
          return `  ${chalk.green(parts[0].trim())}  ${chalk.gray(parts[1])}`;
        }
      }

      return line;
    });

    return formatted.join('\n');
  }

  /**
   * Add all CLI commands
   */
  private addCommands(): void {
    // Enhanced orchestrate command
    this.program
      .command('orchestrate')
      .alias('run')
      .description('🚀 Run the complete Porter Bridges pipeline')
      .option('--skip-discovery', 'Skip discovery phase')
      .option('--skip-collection', 'Skip collection phase')
      .option('--skip-distillation', 'Skip distillation phase')
      .option('--skip-packaging', 'Skip packaging phase')
      .option(
        '--gemini-model <model>',
        'Gemini model to use',
        'gemini-2.5-flash'
      )
      .option('--max-concurrent <number>', 'Maximum concurrent operations', '8')
      .option('--timeout <ms>', 'Request timeout in milliseconds', '60000')
      .option(
        '--distill-timeout <ms>',
        'Distillation timeout in milliseconds',
        '600000'
      )
      .option('--bundle-name <name>', 'Bundle name', 'porter-bridges')
      .option('--version <version>', 'Package version')
      .option('--interactive', 'Interactive mode with prompts', true)
      .option('--log-mode', 'Log mode instead of spinners')
      .option(
        '--force-proceed',
        'Continue pipeline despite failed sources (not recommended)'
      )
      .action(async (options) => {
        await this.runOrchestration(options);
      });

    // Configuration wizard
    this.program
      .command('config-wizard')
      .alias('config')
      .description('🔧 Interactive configuration wizard')
      .option(
        '--config-path <path>',
        'Configuration file path',
        './porter-bridges.config.json'
      )
      .option('--preset <preset>', 'Configuration preset', 'development')
      .option('--non-interactive', 'Non-interactive mode')
      .option('--validate', 'Validate existing configuration')
      .action(async (options) => {
        await this.runConfigWizard(options);
      });

    // Health check command
    this.program
      .command('health')
      .alias('status')
      .description('🏥 Check system health and status')
      .option('--component <component>', 'Check specific component')
      .option('--watch', 'Watch mode with continuous monitoring')
      .option('--interval <seconds>', 'Watch interval in seconds', '30')
      .option('--json', 'Output in JSON format')
      .option('--reset-breakers', 'Reset circuit breakers')
      .action(async (options) => {
        await this.runHealthCheck(options);
      });

    // Install completions
    this.program
      .command('install-completions')
      .alias('completions')
      .description('📝 Install shell auto-completions')
      .option('--shell <shell>', 'Shell type (bash, zsh, fish, all)', 'all')
      .option('--uninstall', 'Uninstall completions')
      .action(async (options) => {
        await this.installCompletions(options);
      });

    // Interactive mode
    this.program
      .command('interactive')
      .alias('i')
      .description('🎮 Interactive mode with guided workflows')
      .action(async () => {
        await this.runInteractiveMode();
      });

    // Quick start
    this.program
      .command('quickstart')
      .alias('start')
      .description('🚀 Quick start guide for new users')
      .action(async () => {
        await this.runQuickstart();
      });

    // Benchmark
    this.program
      .command('benchmark')
      .alias('bench')
      .description('🏃 Run performance benchmarks')
      .option('--component <component>', 'Benchmark specific component')
      .option('--iterations <number>', 'Number of iterations', '3')
      .option('--output <path>', 'Output file for results')
      .action(async (options) => {
        await this.runBenchmark(options);
      });

    // Version with enhanced display
    this.program
      .command('version')
      .description('📋 Show version information')
      .action(() => {
        this.showVersion();
      });
  }

  /**
   * Run orchestration with enhanced progress
   */
  private async runOrchestration(options: any): Promise<void> {
    try {
      this.showBanner();

      const progressManager = createPipelineProgressManager({
        interactive: options.interactive && !options.logMode,
        logMode: options.logMode,
      });

      const orchestrationCommand = new OrchestrationCommand();

      // Set up progress event handlers
      progressManager.on('phaseStart', (event) => {
        logger.info(`Starting ${event.phase}: ${event.message}`);
      });

      progressManager.on('phaseComplete', (event) => {
        logger.info(`Completed ${event.phase}: ${event.message}`);
      });

      progressManager.on('phaseError', (event) => {
        logger.error(`Error in ${event.phase}: ${event.message}`);
      });

      // Run the orchestration
      await orchestrationCommand.execute(options);

      progressManager.showSummary();
    } catch (error) {
      console.error(chalk.red('❌ Orchestration failed:'), error);
      process.exit(1);
    }
  }

  /**
   * Run configuration wizard
   */
  private async runConfigWizard(options: any): Promise<void> {
    try {
      if (options.validate) {
        await this.validateConfiguration(options.configPath);
        return;
      }

      this.configWizard = new ConfigWizard(options.configPath);
      await this.configWizard.run();
    } catch (error) {
      console.error(chalk.red('❌ Configuration wizard failed:'), error);
      process.exit(1);
    }
  }

  /**
   * Run health check
   */
  private async runHealthCheck(options: any): Promise<void> {
    // Implementation would integrate with the health check system
    console.log(chalk.cyan('🏥 Health Check System'));
    console.log(chalk.gray('Health check implementation would go here'));
  }

  /**
   * Install shell completions
   */
  private async installCompletions(options: any): Promise<void> {
    try {
      if (options.uninstall) {
        await this.completionInstaller.uninstall();
      } else {
        await this.completionInstaller.installAll();
      }
    } catch (error) {
      console.error(chalk.red('❌ Completion installation failed:'), error);
      process.exit(1);
    }
  }

  /**
   * Run interactive mode
   */
  private async runInteractiveMode(): Promise<void> {
    this.showBanner();

    console.log(chalk.cyan('🎮 Interactive Mode - Coming Soon!'));
    console.log(
      chalk.gray(
        'This will provide guided workflows and step-by-step assistance.'
      )
    );
  }

  /**
   * Run quickstart guide
   */
  private async runQuickstart(): Promise<void> {
    this.showBanner();

    console.log(chalk.cyan.bold('🚀 Porter Bridges Quickstart Guide\n'));

    const steps = [
      '1. Run configuration wizard: porter-bridges config-wizard',
      '2. Install shell completions: porter-bridges install-completions',
      '3. Run your first pipeline: porter-bridges orchestrate',
      '4. Check system health: porter-bridges health',
      '5. View results in generated/bundles/',
    ];

    steps.forEach((step) => {
      console.log(chalk.green(`  ${step}`));
    });

    console.log(chalk.yellow('\n💡 Need help? Run: porter-bridges --help\n'));
  }

  /**
   * Run benchmark
   */
  private async runBenchmark(options: any): Promise<void> {
    console.log(chalk.cyan('🏃 Performance Benchmark'));
    console.log(chalk.gray('Benchmark implementation would go here'));
  }

  /**
   * Show enhanced version information
   */
  private showVersion(): void {
    const versionInfo = boxen(
      `${chalk.cyan.bold('Porter Bridges')} ${chalk.green('v1.0.0')}\n\n` +
        `${chalk.gray('🌉 Minecraft Mod Porting Intelligence System')}\n` +
        `${chalk.gray('Built with ❤️ for the modding community')}\n\n` +
        `${chalk.dim('Node.js:')} ${process.version}\n` +
        `${chalk.dim('Platform:')} ${process.platform}\n` +
        `${chalk.dim('Architecture:')} ${process.arch}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        backgroundColor: 'black',
      }
    );

    console.log(versionInfo);
  }

  /**
   * Show welcome banner
   */
  private showBanner(): void {
    const banner = boxen(
      gradient('cyan', 'magenta')('🌉 Porter Bridges') +
        '\n' +
        chalk.gray('Minecraft Mod Porting Intelligence System'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        textAlignment: 'center',
      }
    );

    console.log(banner);
  }

  /**
   * Validate configuration
   */
  private async validateConfiguration(configPath: string): Promise<void> {
    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);

      console.log(chalk.green('✅ Configuration is valid'));
      console.log(chalk.gray(`   File: ${configPath}`));
      console.log(chalk.gray(`   Size: ${configData.length} bytes`));
    } catch (error) {
      console.error(chalk.red('❌ Configuration validation failed:'), error);
      process.exit(1);
    }
  }

  /**
   * Run the CLI
   */
  async run(args: string[] = process.argv): Promise<void> {
    try {
      await this.program.parseAsync(args);
    } catch (error) {
      console.error(chalk.red('❌ CLI error:'), error);
      process.exit(1);
    }
  }

  /**
   * Get the program instance
   */
  getProgram(): Command {
    return this.program;
  }
}

/**
 * Create and run the enhanced CLI
 */
export async function createAndRunEnhancedCLI(args?: string[]): Promise<void> {
  const cli = new EnhancedCLI();
  await cli.run(args);
}

/**
 * Export for use in other modules
 */
export { EnhancedCLI };
