/**
 * Configuration Manager for Porter Bridges CLI
 * Handles loading, saving, and validating user configuration
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { ConfigSchema, DEFAULT_CONFIG, type Config } from '../schemas/config-schema';
import { logger } from './logger';

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private configPath: string;
  private configDir: string;

  private constructor() {
    this.configDir = path.join(homedir(), '.porter-bridges');
    this.configPath = path.join(this.configDir, 'config.json');
    this.config = DEFAULT_CONFIG;
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<Config> {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Check if config file exists
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        const parsedConfig = JSON.parse(configData);
        
        // Validate and merge with defaults
        const validatedConfig = ConfigSchema.parse({
          ...DEFAULT_CONFIG,
          ...parsedConfig,
        });

        this.config = validatedConfig;
        logger.debug('Configuration loaded successfully', { path: this.configPath });
      } catch (error) {
        // Config file doesn't exist or is invalid - use defaults
        logger.info('Using default configuration', { reason: error instanceof Error ? error.message : 'Unknown error' });
        this.config = DEFAULT_CONFIG;
      }
    } catch (error) {
      logger.error('Failed to load configuration', { error: error instanceof Error ? error.message : error });
      this.config = DEFAULT_CONFIG;
    }

    return this.config;
  }

  /**
   * Save configuration to file
   */
  async saveConfig(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Update last config update timestamp
      this.config.user.last_config_update = new Date().toISOString();

      // Write configuration
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      logger.debug('Configuration saved successfully', { path: this.configPath });
    } catch (error) {
      logger.error('Failed to save configuration', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<Config>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
  }

  /**
   * Update user settings
   */
  updateUserSettings(userSettings: Partial<Config['user']>): void {
    this.config.user = {
      ...this.config.user,
      ...userSettings,
    };
  }

  /**
   * Update default settings
   */
  updateDefaults(defaults: Partial<Config['defaults']>): void {
    this.config.defaults = {
      ...this.config.defaults,
      ...defaults,
    };
  }

  /**
   * Update UI settings
   */
  updateUISettings(uiSettings: Partial<Config['ui']>): void {
    this.config.ui = {
      ...this.config.ui,
      ...uiSettings,
    };
  }

  /**
   * Update advanced settings
   */
  updateAdvancedSettings(advancedSettings: Partial<Config['advanced']>): void {
    this.config.advanced = {
      ...this.config.advanced,
      ...advancedSettings,
    };
  }

  /**
   * Add or update a preset
   */
  setPreset(name: string, preset: Config['presets'][string]): void {
    this.config.presets[name] = preset;
  }

  /**
   * Remove a preset
   */
  removePreset(name: string): void {
    delete this.config.presets[name];
  }

  /**
   * Get a preset by name
   */
  getPreset(name: string): Config['presets'][string] | undefined {
    return this.config.presets[name];
  }

  /**
   * Get all presets
   */
  getPresets(): Record<string, Config['presets'][string]> {
    return this.config.presets;
  }

  /**
   * Check if this is the first time running
   */
  isFirstTime(): boolean {
    return this.config.user.first_time;
  }

  /**
   * Mark first time setup as complete
   */
  markFirstTimeComplete(): void {
    this.config.user.first_time = false;
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.config = {
      ...DEFAULT_CONFIG,
      user: {
        ...this.config.user, // Preserve user info
        first_time: false,
      },
    };
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get configuration directory
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Validate configuration
   */
  validateConfig(): boolean {
    try {
      ConfigSchema.parse(this.config);
      return true;
    } catch (error) {
      logger.error('Configuration validation failed', { error: error instanceof Error ? error.message : error });
      return false;
    }
  }
}