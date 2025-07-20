/**
 * @file Shell Auto-completion
 *
 * Provides shell auto-completion scripts for bash, zsh, and fish
 * to enhance the CLI user experience with tab completion.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { logger } from '../utils/logger';

/**
 * Bash completion script
 */
const BASH_COMPLETION = `#!/bin/bash
# Porter Bridges bash completion script

_porter_bridges_completions() {
    local cur prev words cword
    _init_completion || return

    local commands="orchestrate discover collect distill package bundle health config-wizard install-completions"
    local global_options="--help --version --verbose --quiet --config"
    
    # Handle command-specific completions
    case "$prev" in
        porter-bridges)
            COMPREPLY=($(compgen -W "$commands" -- "$cur"))
            return 0
            ;;
        orchestrate)
            local orchestrate_options="--skip-discovery --skip-collection --skip-distillation --skip-packaging --gemini-model --max-concurrent --timeout --distill-timeout --bundle-name --version --force-proceed"
            COMPREPLY=($(compgen -W "$orchestrate_options $global_options" -- "$cur"))
            return 0
            ;;
        discover)
            local discover_options="--cache-dir --timeout --filter --source-type --loader-type"
            COMPREPLY=($(compgen -W "$discover_options $global_options" -- "$cur"))
            return 0
            ;;
        collect)
            local collect_options="--content-dir --max-concurrent --timeout --retry-attempts"
            COMPREPLY=($(compgen -W "$collect_options $global_options" -- "$cur"))
            return 0
            ;;
        distill)
            local distill_options="--content-dir --output-dir --gemini-model --max-concurrent --timeout --temperature --max-tokens"
            COMPREPLY=($(compgen -W "$distill_options $global_options" -- "$cur"))
            return 0
            ;;
        package)
            local package_options="--package-dir --distilled-dir --version --include-metadata --validate-integrity"
            COMPREPLY=($(compgen -W "$package_options $global_options" -- "$cur"))
            return 0
            ;;
        bundle)
            local bundle_options="--bundle-dir --package-dir --bundle-name --create-archive --include-metadata --validate-integrity"
            COMPREPLY=($(compgen -W "$bundle_options $global_options" -- "$cur"))
            return 0
            ;;
        health)
            local health_options="--component --watch --interval --json --reset-breakers"
            COMPREPLY=($(compgen -W "$health_options $global_options" -- "$cur"))
            return 0
            ;;
        config-wizard)
            local config_options="--config-path --preset --interactive --validate"
            COMPREPLY=($(compgen -W "$config_options $global_options" -- "$cur"))
            return 0
            ;;
        --gemini-model)
            COMPREPLY=($(compgen -W "gemini-2.5-flash gemini-1.5-pro gemini-1.5-flash" -- "$cur"))
            return 0
            ;;
        --preset)
            COMPREPLY=($(compgen -W "development production ci custom" -- "$cur"))
            return 0
            ;;
        --source-type)
            COMPREPLY=($(compgen -W "primer changelog blog guide release" -- "$cur"))
            return 0
            ;;
        --loader-type)
            COMPREPLY=($(compgen -W "fabric neoforge forge vanilla" -- "$cur"))
            return 0
            ;;
        --component)
            COMPREPLY=($(compgen -W "github_api rss_feeds ai_processing file_system circuit_breakers cache_system performance_monitor graceful_degradation" -- "$cur"))
            return 0
            ;;
        --config)
            COMPREPLY=($(compgen -f -X "!*.json" -- "$cur"))
            return 0
            ;;
        --cache-dir|--content-dir|--output-dir|--package-dir|--distilled-dir|--bundle-dir)
            COMPREPLY=($(compgen -d -- "$cur"))
            return 0
            ;;
        --config-path)
            COMPREPLY=($(compgen -f -- "$cur"))
            return 0
            ;;
    esac

    # Handle options that start with --
    if [[ "$cur" == -* ]]; then
        COMPREPLY=($(compgen -W "$global_options" -- "$cur"))
        return 0
    fi

    # Default to commands
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return 0
}

# Register the completion function
complete -F _porter_bridges_completions porter-bridges
complete -F _porter_bridges_completions pb
`;

/**
 * Zsh completion script
 */
const ZSH_COMPLETION = `#compdef porter-bridges pb

# Porter Bridges zsh completion script

_porter_bridges() {
    local context state line
    typeset -A opt_args

    local global_options=(
        "--help[Show help information]"
        "--version[Show version information]"
        "--verbose[Enable verbose output]"
        "--quiet[Suppress output]"
        "--config[Configuration file path]:file:_files -g '*.json'"
    )

    _arguments -C \
        $global_options \
        "1: :->commands" \
        "*::arg:->args" && return 0

    case $state in
        commands)
            local commands=(
                "orchestrate:Run the complete pipeline"
                "discover:Discover porting sources"
                "collect:Collect content from sources"
                "distill:Process content with AI"
                "package:Create data packages"
                "bundle:Create distribution bundles"
                "health:Check system health"
                "config-wizard:Interactive configuration wizard"
                "install-completions:Install shell completions"
            )
            _describe -t commands "commands" commands && return 0
        ;;
        args)
            case $line[1] in
                orchestrate)
                    _arguments \
                        $global_options \
                        "--skip-discovery[Skip discovery phase]" \
                        "--skip-collection[Skip collection phase]" \
                        "--skip-distillation[Skip distillation phase]" \
                        "--skip-packaging[Skip packaging phase]" \
                        "--gemini-model[Gemini model to use]:model:(gemini-2.5-flash gemini-1.5-pro gemini-1.5-flash)" \
                        "--max-concurrent[Maximum concurrent operations]:number:" \
                        "--timeout[Request timeout in ms]:number:" \
                        "--distill-timeout[Distillation timeout in ms]:number:" \
                        "--bundle-name[Bundle name]:string:" \
                        "--version[Package version]:string:" \
                        "--force-proceed[Continue despite failed sources (not recommended)]"
                ;;
                discover)
                    _arguments \
                        $global_options \
                        "--cache-dir[Cache directory]:directory:_files -/" \
                        "--timeout[Request timeout in ms]:number:" \
                        "--filter[Filter pattern]:string:" \
                        "--source-type[Source type]:type:(primer changelog blog guide release)" \
                        "--loader-type[Loader type]:type:(fabric neoforge forge vanilla)"
                ;;
                collect)
                    _arguments \
                        $global_options \
                        "--content-dir[Content directory]:directory:_files -/" \
                        "--max-concurrent[Maximum concurrent downloads]:number:" \
                        "--timeout[Request timeout in ms]:number:" \
                        "--retry-attempts[Number of retry attempts]:number:"
                ;;
                distill)
                    _arguments \
                        $global_options \
                        "--content-dir[Content directory]:directory:_files -/" \
                        "--output-dir[Output directory]:directory:_files -/" \
                        "--gemini-model[Gemini model to use]:model:(gemini-2.5-flash gemini-1.5-pro gemini-1.5-flash)" \
                        "--max-concurrent[Maximum concurrent distillations]:number:" \
                        "--timeout[Processing timeout in ms]:number:" \
                        "--temperature[AI temperature]:number:" \
                        "--max-tokens[Maximum tokens]:number:"
                ;;
                package)
                    _arguments \
                        $global_options \
                        "--package-dir[Package directory]:directory:_files -/" \
                        "--distilled-dir[Distilled content directory]:directory:_files -/" \
                        "--version[Package version]:string:" \
                        "--include-metadata[Include metadata]" \
                        "--validate-integrity[Validate integrity]"
                ;;
                bundle)
                    _arguments \
                        $global_options \
                        "--bundle-dir[Bundle directory]:directory:_files -/" \
                        "--package-dir[Package directory]:directory:_files -/" \
                        "--bundle-name[Bundle name]:string:" \
                        "--create-archive[Create ZIP archive]" \
                        "--include-metadata[Include metadata]" \
                        "--validate-integrity[Validate integrity]"
                ;;
                health)
                    _arguments \
                        $global_options \
                        "--component[Component to check]:component:(github_api rss_feeds ai_processing file_system circuit_breakers cache_system performance_monitor graceful_degradation)" \
                        "--watch[Watch mode]" \
                        "--interval[Watch interval in seconds]:number:" \
                        "--json[JSON output]" \
                        "--reset-breakers[Reset circuit breakers]"
                ;;
                config-wizard)
                    _arguments \
                        $global_options \
                        "--config-path[Configuration file path]:file:_files" \
                        "--preset[Configuration preset]:preset:(development production ci custom)" \
                        "--interactive[Interactive mode]" \
                        "--validate[Validate configuration]"
                ;;
            esac
        ;;
    esac
}

_porter_bridges "$@"
`;

/**
 * Fish completion script
 */
const FISH_COMPLETION = `# Porter Bridges fish completion script

# Global options
set -l global_options "help version verbose quiet config"

# Commands
set -l commands "orchestrate discover collect distill package bundle health config-wizard install-completions"

# Models
set -l gemini_models "gemini-2.5-flash gemini-1.5-pro gemini-1.5-flash"

# Source types
set -l source_types "primer changelog blog guide release"

# Loader types
set -l loader_types "fabric neoforge forge vanilla"

# Presets
set -l presets "development production ci custom"

# Health components
set -l health_components "github_api rss_feeds ai_processing file_system circuit_breakers cache_system performance_monitor graceful_degradation"

# Main command completions
complete -c porter-bridges -f -n "__fish_use_subcommand" -a "$commands"
complete -c pb -f -n "__fish_use_subcommand" -a "$commands"

# Global options
complete -c porter-bridges -l help -d "Show help information"
complete -c porter-bridges -l version -d "Show version information"
complete -c porter-bridges -l verbose -d "Enable verbose output"
complete -c porter-bridges -l quiet -d "Suppress output"
complete -c porter-bridges -l config -d "Configuration file path" -r -F

complete -c pb -l help -d "Show help information"
complete -c pb -l version -d "Show version information"
complete -c pb -l verbose -d "Enable verbose output"
complete -c pb -l quiet -d "Suppress output"
complete -c pb -l config -d "Configuration file path" -r -F

# Orchestrate command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l skip-discovery -d "Skip discovery phase"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l skip-collection -d "Skip collection phase"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l skip-distillation -d "Skip distillation phase"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l skip-packaging -d "Skip packaging phase"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l gemini-model -d "Gemini model to use" -a "$gemini_models"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l max-concurrent -d "Maximum concurrent operations"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l timeout -d "Request timeout in ms"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l distill-timeout -d "Distillation timeout in ms"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l bundle-name -d "Bundle name"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l version -d "Package version"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from orchestrate" -l force-proceed -d "Continue despite failed sources (not recommended)"

complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l skip-discovery -d "Skip discovery phase"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l skip-collection -d "Skip collection phase"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l skip-distillation -d "Skip distillation phase"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l skip-packaging -d "Skip packaging phase"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l gemini-model -d "Gemini model to use" -a "$gemini_models"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l max-concurrent -d "Maximum concurrent operations"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l timeout -d "Request timeout in ms"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l distill-timeout -d "Distillation timeout in ms"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l bundle-name -d "Bundle name"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l version -d "Package version"
complete -c pb -f -n "__fish_seen_subcommand_from orchestrate" -l force-proceed -d "Continue despite failed sources (not recommended)"

# Discover command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from discover" -l cache-dir -d "Cache directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from discover" -l timeout -d "Request timeout in ms"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from discover" -l filter -d "Filter pattern"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from discover" -l source-type -d "Source type" -a "$source_types"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from discover" -l loader-type -d "Loader type" -a "$loader_types"

complete -c pb -f -n "__fish_seen_subcommand_from discover" -l cache-dir -d "Cache directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from discover" -l timeout -d "Request timeout in ms"
complete -c pb -f -n "__fish_seen_subcommand_from discover" -l filter -d "Filter pattern"
complete -c pb -f -n "__fish_seen_subcommand_from discover" -l source-type -d "Source type" -a "$source_types"
complete -c pb -f -n "__fish_seen_subcommand_from discover" -l loader-type -d "Loader type" -a "$loader_types"

# Collect command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from collect" -l content-dir -d "Content directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from collect" -l max-concurrent -d "Maximum concurrent downloads"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from collect" -l timeout -d "Request timeout in ms"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from collect" -l retry-attempts -d "Number of retry attempts"

complete -c pb -f -n "__fish_seen_subcommand_from collect" -l content-dir -d "Content directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from collect" -l max-concurrent -d "Maximum concurrent downloads"
complete -c pb -f -n "__fish_seen_subcommand_from collect" -l timeout -d "Request timeout in ms"
complete -c pb -f -n "__fish_seen_subcommand_from collect" -l retry-attempts -d "Number of retry attempts"

# Distill command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from distill" -l content-dir -d "Content directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from distill" -l output-dir -d "Output directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from distill" -l gemini-model -d "Gemini model to use" -a "$gemini_models"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from distill" -l max-concurrent -d "Maximum concurrent distillations"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from distill" -l timeout -d "Processing timeout in ms"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from distill" -l temperature -d "AI temperature"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from distill" -l max-tokens -d "Maximum tokens"

complete -c pb -f -n "__fish_seen_subcommand_from distill" -l content-dir -d "Content directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from distill" -l output-dir -d "Output directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from distill" -l gemini-model -d "Gemini model to use" -a "$gemini_models"
complete -c pb -f -n "__fish_seen_subcommand_from distill" -l max-concurrent -d "Maximum concurrent distillations"
complete -c pb -f -n "__fish_seen_subcommand_from distill" -l timeout -d "Processing timeout in ms"
complete -c pb -f -n "__fish_seen_subcommand_from distill" -l temperature -d "AI temperature"
complete -c pb -f -n "__fish_seen_subcommand_from distill" -l max-tokens -d "Maximum tokens"

# Package command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from package" -l package-dir -d "Package directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from package" -l distilled-dir -d "Distilled content directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from package" -l version -d "Package version"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from package" -l include-metadata -d "Include metadata"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from package" -l validate-integrity -d "Validate integrity"

complete -c pb -f -n "__fish_seen_subcommand_from package" -l package-dir -d "Package directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from package" -l distilled-dir -d "Distilled content directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from package" -l version -d "Package version"
complete -c pb -f -n "__fish_seen_subcommand_from package" -l include-metadata -d "Include metadata"
complete -c pb -f -n "__fish_seen_subcommand_from package" -l validate-integrity -d "Validate integrity"

# Bundle command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from bundle" -l bundle-dir -d "Bundle directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from bundle" -l package-dir -d "Package directory" -a "(__fish_complete_directories)"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from bundle" -l bundle-name -d "Bundle name"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from bundle" -l create-archive -d "Create ZIP archive"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from bundle" -l include-metadata -d "Include metadata"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from bundle" -l validate-integrity -d "Validate integrity"

complete -c pb -f -n "__fish_seen_subcommand_from bundle" -l bundle-dir -d "Bundle directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from bundle" -l package-dir -d "Package directory" -a "(__fish_complete_directories)"
complete -c pb -f -n "__fish_seen_subcommand_from bundle" -l bundle-name -d "Bundle name"
complete -c pb -f -n "__fish_seen_subcommand_from bundle" -l create-archive -d "Create ZIP archive"
complete -c pb -f -n "__fish_seen_subcommand_from bundle" -l include-metadata -d "Include metadata"
complete -c pb -f -n "__fish_seen_subcommand_from bundle" -l validate-integrity -d "Validate integrity"

# Health command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from health" -l component -d "Component to check" -a "$health_components"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from health" -l watch -d "Watch mode"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from health" -l interval -d "Watch interval in seconds"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from health" -l json -d "JSON output"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from health" -l reset-breakers -d "Reset circuit breakers"

complete -c pb -f -n "__fish_seen_subcommand_from health" -l component -d "Component to check" -a "$health_components"
complete -c pb -f -n "__fish_seen_subcommand_from health" -l watch -d "Watch mode"
complete -c pb -f -n "__fish_seen_subcommand_from health" -l interval -d "Watch interval in seconds"
complete -c pb -f -n "__fish_seen_subcommand_from health" -l json -d "JSON output"
complete -c pb -f -n "__fish_seen_subcommand_from health" -l reset-breakers -d "Reset circuit breakers"

# Config wizard command
complete -c porter-bridges -f -n "__fish_seen_subcommand_from config-wizard" -l config-path -d "Configuration file path" -r -F
complete -c porter-bridges -f -n "__fish_seen_subcommand_from config-wizard" -l preset -d "Configuration preset" -a "$presets"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from config-wizard" -l interactive -d "Interactive mode"
complete -c porter-bridges -f -n "__fish_seen_subcommand_from config-wizard" -l validate -d "Validate configuration"

complete -c pb -f -n "__fish_seen_subcommand_from config-wizard" -l config-path -d "Configuration file path" -r -F
complete -c pb -f -n "__fish_seen_subcommand_from config-wizard" -l preset -d "Configuration preset" -a "$presets"
complete -c pb -f -n "__fish_seen_subcommand_from config-wizard" -l interactive -d "Interactive mode"
complete -c pb -f -n "__fish_seen_subcommand_from config-wizard" -l validate -d "Validate configuration"
`;

/**
 * Completion installer and manager
 */
export class CompletionInstaller {
  private homeDir: string;
  private completionDir: string;

  constructor() {
    this.homeDir = process.env.HOME || process.env.USERPROFILE || '/';
    this.completionDir = path.join(__dirname, '../../completions');
  }

  /**
   * Install completions for all supported shells
   */
  async installAll(): Promise<void> {
    console.log(
      chalk.cyan('🔧 Installing shell completions for Porter Bridges...\n')
    );

    try {
      // Create completion scripts directory
      await fs.mkdir(this.completionDir, { recursive: true });

      // Install for each shell
      const results = await Promise.allSettled([
        this.installBash(),
        this.installZsh(),
        this.installFish(),
      ]);

      // Report results
      const bashResult = results[0];
      const zshResult = results[1];
      const fishResult = results[2];

      console.log(chalk.green('✅ Completion installation summary:'));
      console.log(
        `   Bash: ${bashResult.status === 'fulfilled' ? '✓' : '✗'} ${bashResult.status === 'fulfilled' ? 'Installed' : 'Failed'}`
      );
      console.log(
        `   Zsh: ${zshResult.status === 'fulfilled' ? '✓' : '✗'} ${zshResult.status === 'fulfilled' ? 'Installed' : 'Failed'}`
      );
      console.log(
        `   Fish: ${fishResult.status === 'fulfilled' ? '✓' : '✗'} ${fishResult.status === 'fulfilled' ? 'Installed' : 'Failed'}`
      );

      console.log(chalk.yellow('\n⚠️  To enable completions, you may need to:'));
      console.log('   1. Restart your shell or source your profile');
      console.log('   2. Run: source ~/.bashrc (for bash)');
      console.log('   3. Run: source ~/.zshrc (for zsh)');
      console.log('   4. Fish completions should work immediately');
    } catch (error) {
      logger.error('Failed to install completions:', error);
      throw error;
    }
  }

  /**
   * Install bash completions
   */
  async installBash(): Promise<void> {
    const bashCompletionPath = path.join(
      this.completionDir,
      'porter-bridges.bash'
    );
    await fs.writeFile(bashCompletionPath, BASH_COMPLETION);

    // Try to add to bash completion directory
    const bashCompletionDirs = [
      '/usr/local/share/bash-completion/completions',
      '/usr/share/bash-completion/completions',
      path.join(this.homeDir, '.bash_completion.d'),
    ];

    let installed = false;
    for (const dir of bashCompletionDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        await fs.copyFile(bashCompletionPath, path.join(dir, 'porter-bridges'));
        installed = true;
        break;
      } catch {
        // Continue to next directory
      }
    }

    if (!installed) {
      // Fall back to adding to .bashrc
      const bashrcPath = path.join(this.homeDir, '.bashrc');
      const sourceCommand = `\n# Porter Bridges completions\nsource "${bashCompletionPath}"\n`;

      try {
        const bashrcContent = await fs.readFile(bashrcPath, 'utf-8');
        if (!bashrcContent.includes('Porter Bridges completions')) {
          await fs.appendFile(bashrcPath, sourceCommand);
        }
      } catch {
        // Create .bashrc if it doesn't exist
        await fs.writeFile(bashrcPath, sourceCommand);
      }
    }
  }

  /**
   * Install zsh completions
   */
  async installZsh(): Promise<void> {
    const zshCompletionPath = path.join(this.completionDir, '_porter-bridges');
    await fs.writeFile(zshCompletionPath, ZSH_COMPLETION);

    // Try to add to zsh completion directory
    const zshCompletionDirs = [
      path.join(this.homeDir, '.zsh/completions'),
      '/usr/local/share/zsh/site-functions',
      '/usr/share/zsh/site-functions',
    ];

    let installed = false;
    for (const dir of zshCompletionDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        await fs.copyFile(zshCompletionPath, path.join(dir, '_porter-bridges'));
        installed = true;
        break;
      } catch {
        // Continue to next directory
      }
    }

    if (!installed) {
      // Fall back to adding to .zshrc
      const zshrcPath = path.join(this.homeDir, '.zshrc');
      const fpath = path.dirname(zshCompletionPath);
      const sourceCommand = `\n# Porter Bridges completions\nfpath=(${fpath} $fpath)\nautoload -U compinit && compinit\n`;

      try {
        const zshrcContent = await fs.readFile(zshrcPath, 'utf-8');
        if (!zshrcContent.includes('Porter Bridges completions')) {
          await fs.appendFile(zshrcPath, sourceCommand);
        }
      } catch {
        // Create .zshrc if it doesn't exist
        await fs.writeFile(zshrcPath, sourceCommand);
      }
    }
  }

  /**
   * Install fish completions
   */
  async installFish(): Promise<void> {
    const fishCompletionPath = path.join(
      this.completionDir,
      'porter-bridges.fish'
    );
    await fs.writeFile(fishCompletionPath, FISH_COMPLETION);

    // Try to add to fish completion directory
    const fishCompletionDirs = [
      path.join(this.homeDir, '.config/fish/completions'),
      '/usr/local/share/fish/completions',
      '/usr/share/fish/completions',
    ];

    for (const dir of fishCompletionDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        await fs.copyFile(
          fishCompletionPath,
          path.join(dir, 'porter-bridges.fish')
        );
        break;
      } catch {
        // Continue to next directory
      }
    }
  }

  /**
   * Uninstall completions
   */
  async uninstall(): Promise<void> {
    console.log(chalk.yellow('🗑️  Removing Porter Bridges completions...\n'));

    const completionFiles = [
      // Bash
      '/usr/local/share/bash-completion/completions/porter-bridges',
      '/usr/share/bash-completion/completions/porter-bridges',
      path.join(this.homeDir, '.bash_completion.d/porter-bridges'),
      // Zsh
      path.join(this.homeDir, '.zsh/completions/_porter-bridges'),
      '/usr/local/share/zsh/site-functions/_porter-bridges',
      '/usr/share/zsh/site-functions/_porter-bridges',
      // Fish
      path.join(this.homeDir, '.config/fish/completions/porter-bridges.fish'),
      '/usr/local/share/fish/completions/porter-bridges.fish',
      '/usr/share/fish/completions/porter-bridges.fish',
    ];

    for (const file of completionFiles) {
      try {
        await fs.unlink(file);
      } catch {
        // File doesn't exist, continue
      }
    }

    // Remove completion directory
    try {
      await fs.rm(this.completionDir, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, continue
    }

    console.log(chalk.green('✅ Completions removed successfully'));
  }

  /**
   * Check if completions are installed
   */
  async isInstalled(): Promise<{ bash: boolean; zsh: boolean; fish: boolean }> {
    const bashPath = path.join(
      this.homeDir,
      '.bash_completion.d/porter-bridges'
    );
    const zshPath = path.join(this.homeDir, '.zsh/completions/_porter-bridges');
    const fishPath = path.join(
      this.homeDir,
      '.config/fish/completions/porter-bridges.fish'
    );

    const [bashExists, zshExists, fishExists] = await Promise.allSettled([
      fs.access(bashPath),
      fs.access(zshPath),
      fs.access(fishPath),
    ]);

    return {
      bash: bashExists.status === 'fulfilled',
      zsh: zshExists.status === 'fulfilled',
      fish: fishExists.status === 'fulfilled',
    };
  }
}

/**
 * Create completion installer
 */
export function createCompletionInstaller(): CompletionInstaller {
  return new CompletionInstaller();
}

/**
 * Export completion scripts for testing
 */
export { BASH_COMPLETION, ZSH_COMPLETION, FISH_COMPLETION };
