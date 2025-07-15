# Porter Bridges - Lean MVP

A focused utility for discovering, processing, and distilling Minecraft mod porting data using AI. This is the **lean MVP version** optimized for simplicity and core functionality.

## Core Philosophy

**Keep the intelligence, remove the fat.** This system focuses on what matters.

## Complete Workflow

1. **Discovery** → Find porting sources (RSS feeds, GitHub primers, release notes)
2. **Collection** → Download and cache content from discovered sources  
3. **Distillation** → AI-powered extraction of structured porting intelligence
4. **Packaging** → Create versioned packages with metadata and validation
5. **Bundling** → Create distributable archives for static hosting

## Quick Start

```bash
# Install minimal dependencies
bun install

# Discover sources (RSS feeds, GitHub repos, etc.)
bun src/index.ts discover

# Collect content from discovered sources
bun src/index.ts collect

# Distill porting intelligence using AI
bun src/index.ts distill

# Package into versioned releases
bun src/index.ts package

# Bundle for distribution
bun src/index.ts bundle
```

## Generated Output

All dynamic files are organized in `generated/`:
```
generated/
├── discovered-sources.json    # Found porting sources
├── collected-content/         # Downloaded HTML/markdown  
├── collected-sources.json     # Collection metadata
├── distilled-content/         # AI-extracted JSON
├── distilled-sources.json     # Distillation metadata
├── packages/                  # Versioned packages
├── package-results.json       # Package metadata
├── bundles/                   # Distribution bundles
└── bundle-results.json        # Bundle metadata
```

## Dependencies (Lean Stack)

- **commander** - CLI interface
- **undici** - Fast HTTP client  
- **zod** - Schema validation (we love Zod!)
- **fs** - Native Node.js file operations
- **Simple logging** - No external logger dependencies

## Architecture

**Five-module architecture:**
1. **DiscoveryModule** - Find porting sources intelligently
2. **CollectionModule** - Download and cache content  
3. **DistillationModule** - AI-powered information extraction
4. **PackageModule** - Create versioned packages with validation
5. **BundleModule** - Create distributable archives

All generated files are properly gitignored and organized in the `generated/` directory.

## Example Usage

```bash
# Full pipeline
bun src/index.ts discover
bun src/index.ts collect
bun src/index.ts distill
bun src/index.ts package
bun src/index.ts bundle

# Direct URL processing
bun src/index.ts collect --input custom-sources.json
bun src/index.ts distill --content-dir ./my-content
```
