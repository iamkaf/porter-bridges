/**
 * @file Interactive Configuration Wizard
 *
 * Provides an interactive CLI wizard for first-time setup and advanced configuration
 * of Porter Bridges. Guides users through all configuration options with validation.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { logger } from '../utils/logger';

/**
 * Configuration structure for Porter Bridges
 */
interface PorterBridgesConfig {
  general: {
    maxConcurrency: number;
    timeout: number;
    retryAttempts: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  discovery: {
    enabledSources: string[];
    githubToken?: string;
    discordBotToken?: string;
    youtubeApiKey?: string;
  };
  distillation: {
    geminiModel: string;
    maxTokens: number;
    temperature: number;
    maxConcurrentDistillations: number;
  };
  performance: {
    enableCaching: boolean;
    enableCompression: boolean;
    cacheMemoryMB: number;
    compressionLevel: number;
  };
  output: {
    packageDirectory: string;
    bundleDirectory: string;
    enableMetadata: boolean;
    enableIntegrityChecks: boolean;
  };
}

/**
 * Preset configurations for common workflows
 */
const PRESETS = {
  development: {
    general: {
      maxConcurrency: 3,
      timeout: 30_000,
      retryAttempts: 2,
      logLevel: 'debug' as const,
    },
    discovery: {
      enabledSources: ['neoforged_primers', 'fabric_blog', 'neoforge_blog'],
    },
    distillation: {
      geminiModel: 'gemini-2.5-flash',
      maxTokens: 8192,
      temperature: 0.3,
      maxConcurrentDistillations: 1,
    },
    performance: {
      enableCaching: true,
      enableCompression: false,
      cacheMemoryMB: 50,
      compressionLevel: 4,
    },
    output: {
      packageDirectory: './generated/packages',
      bundleDirectory: './generated/bundles',
      enableMetadata: true,
      enableIntegrityChecks: false,
    },
  },
  production: {
    general: {
      maxConcurrency: 8,
      timeout: 60_000,
      retryAttempts: 3,
      logLevel: 'info' as const,
    },
    discovery: {
      enabledSources: [
        'neoforged_primers',
        'fabric_blog',
        'neoforge_blog',
        'fabric_changelog',
        'neoforge_changelog',
        'forge_changelog',
        'eventbus_migration_guide',
      ],
    },
    distillation: {
      geminiModel: 'gemini-2.5-flash',
      maxTokens: 8192,
      temperature: 0.1,
      maxConcurrentDistillations: 2,
    },
    performance: {
      enableCaching: true,
      enableCompression: true,
      cacheMemoryMB: 200,
      compressionLevel: 6,
    },
    output: {
      packageDirectory: './generated/packages',
      bundleDirectory: './generated/bundles',
      enableMetadata: true,
      enableIntegrityChecks: true,
    },
  },
  ci: {
    general: {
      maxConcurrency: 16,
      timeout: 120_000,
      retryAttempts: 5,
      logLevel: 'warn' as const,
    },
    discovery: {
      enabledSources: [
        'neoforged_primers',
        'fabric_blog',
        'neoforge_blog',
        'fabric_changelog',
        'neoforge_changelog',
        'forge_changelog',
        'eventbus_migration_guide',
      ],
    },
    distillation: {
      geminiModel: 'gemini-2.5-flash',
      maxTokens: 8192,
      temperature: 0.0,
      maxConcurrentDistillations: 4,
    },
    performance: {
      enableCaching: true,
      enableCompression: true,
      cacheMemoryMB: 500,
      compressionLevel: 9,
    },
    output: {
      packageDirectory: './generated/packages',
      bundleDirectory: './generated/bundles',
      enableMetadata: true,
      enableIntegrityChecks: true,
    },
  },
};

/**
 * Interactive Configuration Wizard
 */
export class ConfigWizard {
  private configPath: string;
  private config: PorterBridgesConfig;

  constructor(configPath = './porter-bridges.config.json') {
    this.configPath = configPath;
    this.config = this.getDefaultConfig();
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): PorterBridgesConfig {
    return {
      general: {
        maxConcurrency: 8,
        timeout: 60_000,
        retryAttempts: 3,
        logLevel: 'info',
      },
      discovery: {
        enabledSources: ['neoforged_primers', 'fabric_blog', 'neoforge_blog'],
      },
      distillation: {
        geminiModel: 'gemini-2.5-flash',
        maxTokens: 8192,
        temperature: 0.3,
        maxConcurrentDistillations: 1,
      },
      performance: {
        enableCaching: true,
        enableCompression: true,
        cacheMemoryMB: 100,
        compressionLevel: 6,
      },
      output: {
        packageDirectory: './generated/packages',
        bundleDirectory: './generated/bundles',
        enableMetadata: true,
        enableIntegrityChecks: true,
      },
    };
  }

  /**
   * Load existing configuration
   */
  private async loadExistingConfig(): Promise<PorterBridgesConfig | null> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(configData);
    } catch {
      return null;
    }
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Welcome message
   */
  private showWelcome(): void {
    console.log(
      chalk.cyan.bold('\n🌉 Welcome to Porter Bridges Configuration Wizard!\n')
    );
    console.log(
      chalk.gray('This wizard will guide you through setting up Porter Bridges')
    );
    console.log(chalk.gray('for your specific use case and environment.\n'));
  }

  /**
   * Show configuration summary
   */
  private showSummary(): void {
    console.log(chalk.green.bold('\n📋 Configuration Summary:\n'));

    console.log(chalk.cyan('General Settings:'));
    console.log(`  Max Concurrency: ${this.config.general.maxConcurrency}`);
    console.log(`  Timeout: ${this.config.general.timeout}ms`);
    console.log(`  Retry Attempts: ${this.config.general.retryAttempts}`);
    console.log(`  Log Level: ${this.config.general.logLevel}`);

    console.log(chalk.cyan('\nDiscovery Settings:'));
    console.log(
      `  Enabled Sources: ${this.config.discovery.enabledSources.length}`
    );
    console.log(
      `  GitHub Token: ${this.config.discovery.githubToken ? '✓ Configured' : '✗ Not set'}`
    );
    console.log(
      `  Discord Bot Token: ${this.config.discovery.discordBotToken ? '✓ Configured' : '✗ Not set'}`
    );
    console.log(
      `  YouTube API Key: ${this.config.discovery.youtubeApiKey ? '✓ Configured' : '✗ Not set'}`
    );

    console.log(chalk.cyan('\nDistillation Settings:'));
    console.log(`  Gemini Model: ${this.config.distillation.geminiModel}`);
    console.log(`  Max Tokens: ${this.config.distillation.maxTokens}`);
    console.log(`  Temperature: ${this.config.distillation.temperature}`);
    console.log(
      `  Max Concurrent: ${this.config.distillation.maxConcurrentDistillations}`
    );

    console.log(chalk.cyan('\nPerformance Settings:'));
    console.log(
      `  Caching: ${this.config.performance.enableCaching ? '✓ Enabled' : '✗ Disabled'}`
    );
    console.log(
      `  Compression: ${this.config.performance.enableCompression ? '✓ Enabled' : '✗ Disabled'}`
    );
    console.log(`  Cache Memory: ${this.config.performance.cacheMemoryMB}MB`);
    console.log(
      `  Compression Level: ${this.config.performance.compressionLevel}`
    );

    console.log(chalk.cyan('\nOutput Settings:'));
    console.log(`  Package Directory: ${this.config.output.packageDirectory}`);
    console.log(`  Bundle Directory: ${this.config.output.bundleDirectory}`);
    console.log(
      `  Metadata: ${this.config.output.enableMetadata ? '✓ Enabled' : '✗ Disabled'}`
    );
    console.log(
      `  Integrity Checks: ${this.config.output.enableIntegrityChecks ? '✓ Enabled' : '✗ Disabled'}`
    );
  }

  /**
   * Run the configuration wizard
   */
  async run(): Promise<void> {
    this.showWelcome();

    // Check for existing configuration
    const existingConfig = await this.loadExistingConfig();
    if (existingConfig) {
      this.config = existingConfig;
      console.log(
        chalk.yellow('⚠️  Existing configuration found at:'),
        this.configPath
      );

      const { useExisting } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useExisting',
          message: 'Would you like to modify the existing configuration?',
          default: true,
        },
      ]);

      if (!useExisting) {
        const { startFresh } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'startFresh',
            message: 'Would you like to start with a fresh configuration?',
            default: false,
          },
        ]);

        if (startFresh) {
          this.config = this.getDefaultConfig();
        } else {
          console.log(chalk.gray('Configuration wizard cancelled.'));
          return;
        }
      }
    }

    // Ask about preset configuration
    const { usePreset } = await inquirer.prompt([
      {
        type: 'list',
        name: 'usePreset',
        message: 'Would you like to use a preset configuration?',
        choices: [
          {
            name: 'Development - Optimized for local development',
            value: 'development',
          },
          {
            name: 'Production - Optimized for production use',
            value: 'production',
          },
          { name: 'CI/CD - Optimized for continuous integration', value: 'ci' },
          { name: 'Custom - Manual configuration', value: 'custom' },
        ],
        default: 'development',
      },
    ]);

    if (usePreset !== 'custom') {
      this.config = PRESETS[usePreset as keyof typeof PRESETS];
      console.log(chalk.green(`✓ Applied ${usePreset} preset configuration`));
    }

    // Ask if user wants to customize further
    const { customize } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'customize',
        message: 'Would you like to customize the configuration further?',
        default: usePreset === 'custom',
      },
    ]);

    if (customize) {
      await this.runCustomConfiguration();
    }

    // Ask about API tokens
    await this.configureApiTokens();

    // Show summary
    this.showSummary();

    // Confirm and save
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Save this configuration?',
        default: true,
      },
    ]);

    if (confirm) {
      const spinner = ora('Saving configuration...').start();
      try {
        await this.saveConfig();
        spinner.succeed(`Configuration saved to ${this.configPath}`);
        console.log(
          chalk.green.bold(
            '\n🎉 Configuration wizard completed successfully!\n'
          )
        );
        console.log(
          chalk.gray(
            'You can now run Porter Bridges with your custom configuration.'
          )
        );
        console.log(
          chalk.gray('To reconfigure, run: porter-bridges config-wizard\n')
        );
      } catch (error) {
        spinner.fail('Failed to save configuration');
        logger.error('Configuration save failed:', error);
      }
    } else {
      console.log(chalk.gray('Configuration not saved.'));
    }
  }

  /**
   * Run custom configuration prompts
   */
  private async runCustomConfiguration(): Promise<void> {
    console.log(chalk.yellow('\n🔧 Custom Configuration\n'));

    // General settings
    const generalSettings = await inquirer.prompt([
      {
        type: 'number',
        name: 'maxConcurrency',
        message: 'Max concurrent operations:',
        default: this.config.general.maxConcurrency,
        validate: (value) =>
          value > 0 && value <= 32 ? true : 'Must be between 1 and 32',
      },
      {
        type: 'number',
        name: 'timeout',
        message: 'Request timeout (ms):',
        default: this.config.general.timeout,
        validate: (value) => (value > 0 ? true : 'Must be greater than 0'),
      },
      {
        type: 'number',
        name: 'retryAttempts',
        message: 'Retry attempts:',
        default: this.config.general.retryAttempts,
        validate: (value) =>
          value >= 0 && value <= 10 ? true : 'Must be between 0 and 10',
      },
      {
        type: 'list',
        name: 'logLevel',
        message: 'Log level:',
        choices: ['debug', 'info', 'warn', 'error'],
        default: this.config.general.logLevel,
      },
    ]);

    this.config.general = { ...this.config.general, ...generalSettings };

    // Discovery sources
    const availableSources = [
      'neoforged_primers',
      'fabric_blog',
      'neoforge_blog',
      'fabric_changelog',
      'neoforge_changelog',
      'forge_changelog',
      'eventbus_migration_guide',
    ];

    const { enabledSources } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'enabledSources',
        message: 'Select discovery sources:',
        choices: availableSources,
        default: this.config.discovery.enabledSources,
        validate: (choices) =>
          choices.length > 0 ? true : 'Select at least one source',
      },
    ]);

    this.config.discovery.enabledSources = enabledSources;

    // Distillation settings
    const distillationSettings = await inquirer.prompt([
      {
        type: 'list',
        name: 'geminiModel',
        message: 'Gemini model:',
        choices: ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        default: this.config.distillation.geminiModel,
      },
      {
        type: 'number',
        name: 'maxTokens',
        message: 'Max tokens:',
        default: this.config.distillation.maxTokens,
        validate: (value) => (value > 0 ? true : 'Must be greater than 0'),
      },
      {
        type: 'number',
        name: 'temperature',
        message: 'Temperature (0.0-1.0):',
        default: this.config.distillation.temperature,
        validate: (value) =>
          value >= 0 && value <= 1 ? true : 'Must be between 0.0 and 1.0',
      },
      {
        type: 'number',
        name: 'maxConcurrentDistillations',
        message: 'Max concurrent distillations:',
        default: this.config.distillation.maxConcurrentDistillations,
        validate: (value) =>
          value > 0 && value <= 8 ? true : 'Must be between 1 and 8',
      },
    ]);

    this.config.distillation = {
      ...this.config.distillation,
      ...distillationSettings,
    };

    // Performance settings
    const performanceSettings = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableCaching',
        message: 'Enable caching?',
        default: this.config.performance.enableCaching,
      },
      {
        type: 'confirm',
        name: 'enableCompression',
        message: 'Enable compression?',
        default: this.config.performance.enableCompression,
      },
      {
        type: 'number',
        name: 'cacheMemoryMB',
        message: 'Cache memory (MB):',
        default: this.config.performance.cacheMemoryMB,
        validate: (value) => (value > 0 ? true : 'Must be greater than 0'),
      },
      {
        type: 'number',
        name: 'compressionLevel',
        message: 'Compression level (1-9):',
        default: this.config.performance.compressionLevel,
        validate: (value) =>
          value >= 1 && value <= 9 ? true : 'Must be between 1 and 9',
      },
    ]);

    this.config.performance = {
      ...this.config.performance,
      ...performanceSettings,
    };

    // Output settings
    const outputSettings = await inquirer.prompt([
      {
        type: 'input',
        name: 'packageDirectory',
        message: 'Package directory:',
        default: this.config.output.packageDirectory,
        validate: (value) =>
          value.trim() !== '' ? true : 'Directory path cannot be empty',
      },
      {
        type: 'input',
        name: 'bundleDirectory',
        message: 'Bundle directory:',
        default: this.config.output.bundleDirectory,
        validate: (value) =>
          value.trim() !== '' ? true : 'Directory path cannot be empty',
      },
      {
        type: 'confirm',
        name: 'enableMetadata',
        message: 'Enable metadata generation?',
        default: this.config.output.enableMetadata,
      },
      {
        type: 'confirm',
        name: 'enableIntegrityChecks',
        message: 'Enable integrity checks?',
        default: this.config.output.enableIntegrityChecks,
      },
    ]);

    this.config.output = { ...this.config.output, ...outputSettings };
  }

  /**
   * Configure API tokens
   */
  private async configureApiTokens(): Promise<void> {
    console.log(chalk.yellow('\n🔐 API Token Configuration\n'));
    console.log(
      chalk.gray('Optional: Configure API tokens for enhanced functionality\n')
    );

    const { configureTokens } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configureTokens',
        message: 'Would you like to configure API tokens?',
        default: false,
      },
    ]);

    if (!configureTokens) {
      return;
    }

    const tokenSettings = await inquirer.prompt([
      {
        type: 'password',
        name: 'githubToken',
        message: 'GitHub token (optional):',
        default: this.config.discovery.githubToken,
        mask: '*',
      },
      {
        type: 'password',
        name: 'discordBotToken',
        message: 'Discord bot token (optional):',
        default: this.config.discovery.discordBotToken,
        mask: '*',
      },
      {
        type: 'password',
        name: 'youtubeApiKey',
        message: 'YouTube API key (optional):',
        default: this.config.discovery.youtubeApiKey,
        mask: '*',
      },
    ]);

    // Only set tokens if they were provided
    if (tokenSettings.githubToken) {
      this.config.discovery.githubToken = tokenSettings.githubToken;
    }
    if (tokenSettings.discordBotToken) {
      this.config.discovery.discordBotToken = tokenSettings.discordBotToken;
    }
    if (tokenSettings.youtubeApiKey) {
      this.config.discovery.youtubeApiKey = tokenSettings.youtubeApiKey;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PorterBridgesConfig {
    return this.config;
  }
}

/**
 * Export configuration types and presets
 */
export { type PorterBridgesConfig, PRESETS };
