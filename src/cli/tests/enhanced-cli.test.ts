/**
 * @file Enhanced CLI Test Suite
 *
 * Comprehensive test suite for the enhanced CLI features including
 * configuration wizard, progress manager, completions, and colorized output.
 */

import { promises as fs } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionInstaller } from '../completions';
import { ConfigWizard } from '../config-wizard';
import { EnhancedCLI } from '../enhanced-cli';
import {
  createPipelineProgressManager,
  type ProgressManager,
} from '../progress-manager';

// Mock dependencies
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    copyFile: vi.fn(),
    appendFile: vi.fn(),
    unlink: vi.fn(),
    rm: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
    isSpinning: false,
  })),
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Enhanced CLI', () => {
  let cli: EnhancedCLI;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    cli = new EnhancedCLI();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('CLI Program Setup', () => {
    it('should create program with correct name and version', () => {
      const program = cli.getProgram();
      expect(program.name()).toBe('porter-bridges');
      expect(program.version()).toBe('1.0.0');
    });

    it('should have all required commands', () => {
      const program = cli.getProgram();
      const commands = program.commands.map((cmd) => cmd.name());

      expect(commands).toContain('orchestrate');
      expect(commands).toContain('config-wizard');
      expect(commands).toContain('health');
      expect(commands).toContain('install-completions');
      expect(commands).toContain('interactive');
      expect(commands).toContain('quickstart');
      expect(commands).toContain('benchmark');
      expect(commands).toContain('version');
    });

    it('should have global options', () => {
      const program = cli.getProgram();
      const options = program.options.map((opt) => opt.long);

      expect(options).toContain('--verbose');
      expect(options).toContain('--quiet');
      expect(options).toContain('--config');
      expect(options).toContain('--no-color');
      expect(options).toContain('--json');
    });
  });

  describe('Command Help and Description', () => {
    it('should show enhanced help with styling', () => {
      const program = cli.getProgram();
      const helpText = program.helpInformation();

      expect(helpText).toContain('Porter Bridges');
      expect(helpText).toContain('Minecraft Mod Porting Intelligence System');
    });

    it('should show version information', () => {
      const program = cli.getProgram();
      program.parse(['node', 'test', 'version']);

      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});

describe('Configuration Wizard', () => {
  let configWizard: ConfigWizard;
  let mockInquirer: any;

  beforeEach(async () => {
    configWizard = new ConfigWizard();
    mockInquirer = (await import('inquirer')).default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Loading', () => {
    it('should load existing configuration', async () => {
      const mockConfig = {
        general: { maxConcurrency: 8 },
        discovery: { enabledSources: ['test'] },
        distillation: { geminiModel: 'gemini-2.5-flash' },
        performance: { enableCaching: true },
        output: { packageDirectory: './packages' },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockInquirer.prompt.mockResolvedValueOnce({ useExisting: true });
      mockInquirer.prompt.mockResolvedValueOnce({ usePreset: 'custom' });
      mockInquirer.prompt.mockResolvedValueOnce({ customize: false });
      mockInquirer.prompt.mockResolvedValueOnce({ configureTokens: false });
      mockInquirer.prompt.mockResolvedValueOnce({ confirm: true });

      await configWizard.run();

      expect(fs.readFile).toHaveBeenCalledWith(
        './porter-bridges.config.json',
        'utf-8'
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should create new configuration with preset', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockInquirer.prompt.mockResolvedValueOnce({ usePreset: 'development' });
      mockInquirer.prompt.mockResolvedValueOnce({ customize: false });
      mockInquirer.prompt.mockResolvedValueOnce({ configureTokens: false });
      mockInquirer.prompt.mockResolvedValueOnce({ confirm: true });

      await configWizard.run();

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle custom configuration', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockInquirer.prompt.mockResolvedValueOnce({ usePreset: 'custom' });
      mockInquirer.prompt.mockResolvedValueOnce({ customize: true });

      // Mock custom configuration prompts
      mockInquirer.prompt.mockResolvedValueOnce({
        maxConcurrency: 4,
        timeout: 30_000,
        retryAttempts: 3,
        logLevel: 'info',
      });

      mockInquirer.prompt.mockResolvedValueOnce({
        enabledSources: ['neoforged_primers'],
      });

      mockInquirer.prompt.mockResolvedValueOnce({
        geminiModel: 'gemini-2.5-flash',
        maxTokens: 8192,
        temperature: 0.3,
        maxConcurrentDistillations: 1,
      });

      mockInquirer.prompt.mockResolvedValueOnce({
        enableCaching: true,
        enableCompression: true,
        cacheMemoryMB: 100,
        compressionLevel: 6,
      });

      mockInquirer.prompt.mockResolvedValueOnce({
        packageDirectory: './packages',
        bundleDirectory: './bundles',
        enableMetadata: true,
        enableIntegrityChecks: true,
      });

      mockInquirer.prompt.mockResolvedValueOnce({ configureTokens: false });
      mockInquirer.prompt.mockResolvedValueOnce({ confirm: true });

      await configWizard.run();

      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle API token configuration', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      mockInquirer.prompt.mockResolvedValueOnce({ usePreset: 'development' });
      mockInquirer.prompt.mockResolvedValueOnce({ customize: false });
      mockInquirer.prompt.mockResolvedValueOnce({ configureTokens: true });

      mockInquirer.prompt.mockResolvedValueOnce({
        githubToken: 'test-github-token',
        discordBotToken: 'test-discord-token',
        youtubeApiKey: 'test-youtube-key',
      });

      mockInquirer.prompt.mockResolvedValueOnce({ confirm: true });

      await configWizard.run();

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate configuration inputs', async () => {
      const config = configWizard.getConfig();

      expect(config.general.maxConcurrency).toBeGreaterThan(0);
      expect(config.general.timeout).toBeGreaterThan(0);
      expect(config.general.retryAttempts).toBeGreaterThanOrEqual(0);
      expect(['debug', 'info', 'warn', 'error']).toContain(
        config.general.logLevel
      );
    });
  });
});

describe('Progress Manager', () => {
  let progressManager: ProgressManager;
  let consoleLogSpy: any;

  beforeEach(() => {
    progressManager = createPipelineProgressManager({ interactive: false });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    progressManager.cleanup();
  });

  describe('Phase Management', () => {
    it('should start a phase', () => {
      progressManager.startPhase('Discovery', 'Finding sources');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Finding sources')
      );
    });

    it('should update phase progress', () => {
      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.updatePhase('Discovery', 'Processing sources', 5, 10);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing sources (5/10)')
      );
    });

    it('should complete a phase', () => {
      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.completePhase('Discovery', 'All sources found');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('All sources found')
      );
    });

    it('should fail a phase', () => {
      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.failPhase('Discovery', 'Network error');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Network error')
      );
    });

    it('should add warnings to a phase', () => {
      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.warnPhase('Discovery', 'Some sources unavailable');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Some sources unavailable')
      );
    });

    it('should add info to a phase', () => {
      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.infoPhase('Discovery', 'Found 10 sources');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found 10 sources')
      );
    });
  });

  describe('Statistics', () => {
    it('should track phase statistics', () => {
      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.completePhase('Discovery', 'All sources found');

      const stats = progressManager.getStats();
      expect(stats.completedPhases).toBe(1);
      expect(stats.errors).toBe(0);
      expect(stats.warnings).toBe(0);
    });

    it('should track errors and warnings', () => {
      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.warnPhase('Discovery', 'Warning message');
      progressManager.failPhase('Discovery', 'Error message');

      const stats = progressManager.getStats();
      expect(stats.errors).toBe(1);
      expect(stats.warnings).toBe(1);
    });
  });

  describe('Event Emission', () => {
    it('should emit phase events', () => {
      const startListener = vi.fn();
      const completeListener = vi.fn();

      progressManager.on('phaseStart', startListener);
      progressManager.on('phaseComplete', completeListener);

      progressManager.startPhase('Discovery', 'Finding sources');
      progressManager.completePhase('Discovery', 'All sources found');

      expect(startListener).toHaveBeenCalledWith({
        type: 'start',
        phase: 'Discovery',
        message: '🔍 Finding sources',
      });

      expect(completeListener).toHaveBeenCalledWith({
        type: 'complete',
        phase: 'Discovery',
        message: 'All sources found',
      });
    });
  });
});

describe('Completion Installer', () => {
  let completionInstaller: CompletionInstaller;

  beforeEach(() => {
    completionInstaller = new CompletionInstaller();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Installation', () => {
    it('should install all completions', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('');
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      await completionInstaller.installAll();

      expect(fs.writeFile).toHaveBeenCalledTimes(3); // bash, zsh, fish
      expect(fs.mkdir).toHaveBeenCalled();
    });

    it('should uninstall completions', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await completionInstaller.uninstall();

      expect(fs.unlink).toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalled();
    });

    it('should check installation status', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const status = await completionInstaller.isInstalled();

      expect(status).toEqual({
        bash: true,
        zsh: true,
        fish: true,
      });
    });
  });

  describe('Completion Scripts', () => {
    it('should generate valid bash completion script', () => {
      const { BASH_COMPLETION } = require('../completions');

      expect(BASH_COMPLETION).toContain('_porter_bridges_completions');
      expect(BASH_COMPLETION).toContain('orchestrate');
      expect(BASH_COMPLETION).toContain('config-wizard');
      expect(BASH_COMPLETION).toContain('health');
    });

    it('should generate valid zsh completion script', () => {
      const { ZSH_COMPLETION } = require('../completions');

      expect(ZSH_COMPLETION).toContain('#compdef porter-bridges');
      expect(ZSH_COMPLETION).toContain('_porter_bridges');
      expect(ZSH_COMPLETION).toContain('commands');
    });

    it('should generate valid fish completion script', () => {
      const { FISH_COMPLETION } = require('../completions');

      expect(FISH_COMPLETION).toContain('complete -c porter-bridges');
      expect(FISH_COMPLETION).toContain('orchestrate');
      expect(FISH_COMPLETION).toContain('config-wizard');
    });
  });
});

describe('CLI Integration', () => {
  let cli: EnhancedCLI;

  beforeEach(() => {
    cli = new EnhancedCLI();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Handling', () => {
    it('should handle CLI errors gracefully', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => {
          throw new Error('Process exit');
        });

      try {
        await cli.run(['node', 'test', 'invalid-command']);
      } catch (error) {
        expect(error.message).toBe('Process exit');
      }

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });
  });

  describe('Command Parsing', () => {
    it('should parse orchestrate command with options', () => {
      const program = cli.getProgram();
      const command = program.commands.find(
        (cmd) => cmd.name() === 'orchestrate'
      );

      expect(command).toBeDefined();
      expect(command?.options.map((opt) => opt.long)).toContain(
        '--skip-discovery'
      );
      expect(command?.options.map((opt) => opt.long)).toContain(
        '--gemini-model'
      );
      expect(command?.options.map((opt) => opt.long)).toContain(
        '--max-concurrent'
      );
    });

    it('should parse config-wizard command with options', () => {
      const program = cli.getProgram();
      const command = program.commands.find(
        (cmd) => cmd.name() === 'config-wizard'
      );

      expect(command).toBeDefined();
      expect(command?.options.map((opt) => opt.long)).toContain(
        '--config-path'
      );
      expect(command?.options.map((opt) => opt.long)).toContain('--preset');
      expect(command?.options.map((opt) => opt.long)).toContain(
        '--non-interactive'
      );
    });
  });
});

describe('CLI Styling and Output', () => {
  let cli: EnhancedCLI;
  let consoleLogSpy: any;

  beforeEach(() => {
    cli = new EnhancedCLI();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  describe('Banner and Styling', () => {
    it('should show styled banner', () => {
      const program = cli.getProgram();
      const helpText = program.helpInformation();

      expect(helpText).toContain('Porter Bridges');
      expect(helpText).toContain('🌉');
    });

    it('should show version with styling', () => {
      const program = cli.getProgram();
      program.parse(['node', 'test', 'version']);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Porter Bridges')
      );
    });
  });

  describe('Help Formatting', () => {
    it('should format help text with colors', () => {
      const program = cli.getProgram();
      const helpText = program.helpInformation();

      // Check that help text contains expected sections
      expect(helpText).toContain('Usage:');
      expect(helpText).toContain('Options:');
      expect(helpText).toContain('Commands:');
    });
  });
});

describe('CLI Performance', () => {
  let cli: EnhancedCLI;

  beforeEach(() => {
    cli = new EnhancedCLI();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization Performance', () => {
    it('should initialize quickly', () => {
      const startTime = Date.now();
      new EnhancedCLI();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should initialize in under 1 second
    });

    it('should handle large command sets efficiently', () => {
      const program = cli.getProgram();
      const commandCount = program.commands.length;

      expect(commandCount).toBeGreaterThan(5); // Should have multiple commands
      expect(commandCount).toBeLessThan(20); // But not too many
    });
  });
});

describe('CLI Accessibility', () => {
  let cli: EnhancedCLI;

  beforeEach(() => {
    cli = new EnhancedCLI();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Screen Reader Support', () => {
    it('should provide meaningful command descriptions', () => {
      const program = cli.getProgram();
      const commands = program.commands;

      commands.forEach((command) => {
        expect(command.description()).toBeDefined();
        expect(command.description()).not.toBe('');
      });
    });

    it('should provide clear option descriptions', () => {
      const program = cli.getProgram();
      const globalOptions = program.options;

      globalOptions.forEach((option) => {
        expect(option.description).toBeDefined();
        expect(option.description).not.toBe('');
      });
    });
  });

  describe('No-Color Support', () => {
    it('should support --no-color option', () => {
      const program = cli.getProgram();
      const options = program.options.map((opt) => opt.long);

      expect(options).toContain('--no-color');
    });
  });
});

describe('CLI Documentation', () => {
  let cli: EnhancedCLI;

  beforeEach(() => {
    cli = new EnhancedCLI();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Help System', () => {
    it('should provide comprehensive help', () => {
      const program = cli.getProgram();
      const helpText = program.helpInformation();

      expect(helpText).toContain('Usage:');
      expect(helpText).toContain('Options:');
      expect(helpText).toContain('Commands:');
      expect(helpText).toContain('orchestrate');
      expect(helpText).toContain('config-wizard');
      expect(helpText).toContain('health');
    });

    it('should provide command-specific help', () => {
      const program = cli.getProgram();
      const orchestrateCommand = program.commands.find(
        (cmd) => cmd.name() === 'orchestrate'
      );

      expect(orchestrateCommand?.helpInformation()).toContain('Usage:');
      expect(orchestrateCommand?.helpInformation()).toContain('Options:');
    });
  });
});
