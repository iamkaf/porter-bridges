# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Porter Bridges** is a comprehensive development utility for discovering, processing, and packaging Minecraft mod porting data. It automates the collection of breaking changes, API updates, and migration guides from various sources (GitHub repositories, RSS feeds, blog posts) and processes them using AI into structured intelligence for mod developers.

## Core Architecture

### 5-Phase Pipeline Architecture

The system operates as a sequential pipeline with 5 distinct phases:

1. **Discovery** → Find and catalog porting information sources
2. **Collection** → Download raw content from discovered sources  
3. **Distillation** → Process content using AI (Gemini) to extract structured intelligence
4. **Packaging** → Create versioned data packages with metadata and integrity checks
5. **Bundling** → Create distributable Bridge Bundles for end users

Each phase maintains its own state and can be run independently or skipped if data already exists.

### Key Commands

```bash
# Main interactive orchestration (recommended)
bun run orchestrate                    # Full interactive pipeline
bun run orchestrate --skip-discovery  # Skip discovery phase
bun run orchestrate --skip-collection # Skip collection phase

# Individual phase commands (for advanced users)
bun run discover      # Phase 1: Discovery
bun run collect       # Phase 2: Collection  
bun run distill       # Phase 3: Distillation
bun run package       # Phase 4: Packaging
bun run bundle        # Phase 5: Bundling

# Development commands
bun run build         # TypeScript compilation
bun run typecheck     # Type checking without emit
bun run clean         # Clean generated/ directory
bun run lint          # Code linting
bun run format        # Code formatting
```

### Directory Structure & Data Flow

```
generated/
├── discovered-sources.json    # Phase 1 output
├── collected-sources.json     # Phase 2 output  
├── distilled-sources.json     # Phase 3 output
├── collected-content/         # Raw downloaded content
├── distilled-content/         # AI-processed JSON files
├── packages/                  # Versioned packages
├── bundles/                   # Final distributable Bridge Bundles
└── trash/                     # Invalid JSON files for manual review
```

### State Management

The pipeline uses `PipelineStateManager` to maintain persistent state across runs:
- **Central state file**: Tracks all sources and their current phase status
- **Resume capability**: Can restart from any phase without losing progress
- **Source tracking**: Each source has status (discovered → collecting → collected → distilling → distilled → etc.)
- **Migration support**: Automatically migrates from legacy file formats

### AI Processing & JSON Healing

The distillation phase uses Gemini CLI with comprehensive JSON healing:

**Gemini Integration**:
- Processes collected content using `GeminiProcessor`
- Generates structured JSON matching `DistilledContentSchema`
- Tracks token usage and processing duration

**JSON Healing System** (`src/utils/json-healer.ts`):
- **4-layer repair strategy**: jsonrepair → dirty-json → jsonc-parser → custom fallback
- **Automatic healing**: Integrated into response parser for seamless operation
- **Metadata tracking**: Records which strategy was used for repair
- **Fallback handling**: Broken JSON moved to trash/ for manual review

### Module Architecture

Each phase is implemented as a self-contained module in `src/modules/`:

- **DiscoveryModule**: Finds sources via GitHub API, RSS feeds, direct URLs
- **CollectionModule**: Downloads content with retry logic and error handling
- **DistillationModule**: AI processing with Gemini CLI integration
- **PackageModule**: Creates versioned packages with integrity validation
- **BundleModule**: Generates compressed Bridge Bundles for distribution

All modules follow the same pattern:
- Dedicated stats tracking classes
- Filtering systems for source selection
- Progress reporting for CLI integration
- Error handling with retry logic

### CLI Architecture

The CLI uses Commander.js with two main interaction modes:

1. **Interactive Orchestration** (`OrchestrationCommand`): Beautiful step-by-step pipeline execution with Listr2
2. **Individual Commands**: Direct access to each phase for advanced users

The orchestration command provides:
- Progress visualization with Listr2
- User prompts for configuration
- Graceful error handling and recovery
- Skip options for individual phases

### Schema Validation

All data structures use Zod schemas for validation:
- `SourceItemSchema`: Source metadata and status tracking
- `DistilledContentSchema`: AI-generated structured intelligence
- `PipelineStateSchema`: Central state management
- `PackageProgressSchema`: Packaging progress tracking

### Key Implementation Details

**Source Discovery**: 
- GitHub API integration for NeoForged primers
- RSS feed parsing for blog posts
- Direct URL processing for known sources
- Caching to avoid rate limits

**Content Collection**:
- Handles HTML and markdown content
- Special handling for GitHub releases via API vs HTML
- Retry logic with exponential backoff
- Progress tracking and resume capability

**AI Processing**:
- Gemini CLI spawning with timeout handling
- File-based input/output (not stdin/stdout)
- Comprehensive logging of all AI interactions
- Automatic JSON healing for malformed responses

**Error Handling**:
- Critical errors vs recoverable errors
- Comprehensive logging with Winston
- Failed content moved to trash/ for review
- Retry mechanisms with configurable attempts

### Dependencies

**Core Runtime**:
- Bun as the JavaScript runtime
- TypeScript for type safety
- Commander.js for CLI interface
- Listr2 for progress visualization

**AI & JSON Processing**:
- Gemini CLI (external dependency)
- jsonrepair, dirty-json, jsonc-parser for JSON healing
- Zod for schema validation

**HTTP & File Operations**:
- undici for HTTP requests
- archiver for Bridge Bundle creation
- winston for logging

This architecture enables robust, resumable processing of large-scale porting intelligence while maintaining data integrity and providing excellent user experience through the interactive CLI.