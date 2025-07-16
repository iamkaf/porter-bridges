# Porter Bridges

> *"I'm Sam Porter Bridges, and I'm gonna reconnect America."*

Just like Sam Porter Bridges delivers packages to reconnect isolated communities in Death Stranding, I built Porter Bridges to collect and deliver porting information that helps reconnect the Minecraft modding community across different game versions.

## What This Is

Porter Bridges is a comprehensive development utility that discovers, processes, and packages Minecraft mod porting data from across the ecosystem. Think of it as an automated courier service for porting intelligence, I gather breaking changes, API updates, and migration guides from various sources (GitHub repositories, RSS feeds, blog posts) and process them using AI into structured, distributable **Bridge Bundles (BB)**.

These Bridge Bundles serve as literal bridges that mod developers can use to cross the gap between Minecraft versions, just like the infrastructure Sam builds to connect isolated settlements.

## How It Works

The system operates as a 5-phase pipeline, each phase building on the last:

1. **🔍 Discovery** — Automatically finds porting information sources across the ecosystem
2. **📥 Collection** — Downloads raw content from discovered sources
3. **🧪 Distillation** — Uses AI (Gemini) to process content into structured intelligence
4. **📦 Packaging** — Creates versioned data packages with integrity validation
5. **🌉 Bundling** — Generates compressed Bridge Bundles for distribution

## Quick Start

The easiest way to use Porter Bridges is through the interactive orchestration command:

```bash
bun run orchestrate                    # Full interactive pipeline
bun run orchestrate --skip-discovery  # Skip discovery phase
bun run orchestrate --skip-collection # Skip collection phase
bun run orchestrate --skip-distillation # Skip distillation phase
```

This launches a beautiful step-by-step interface that guides you through the entire pipeline. You can also run individual phases:

```bash
bun run discover   # Find new sources
bun run collect    # Download content
bun run distill    # Process with AI
bun run package    # Create versioned packages
bun run bundle     # Generate Bridge Bundles
```

## Getting Bridge Bundles

Pre-built Bridge Bundles are available for download from the [GitHub Releases page](https://github.com/iamkaf/porter-bridges/releases). These contain processed porting intelligence for major Minecraft version transitions, ready to use in your development workflow.

## Development

Porter Bridges is built with TypeScript and Bun, designed for developers who need reliable porting intelligence:

```bash
# Install dependencies
bun install

# Run the interactive pipeline
bun run orchestrate

# Individual development commands
bun run typecheck   # Type checking
bun run lint        # Code linting
bun run format      # Code formatting
bun run clean       # Clean generated files (preserves distilled-content)
```

## The AI Processing System

The distillation phase uses Gemini CLI with a comprehensive JSON healing system that can automatically repair malformed AI output using multiple repair strategies. This ensures maximum reliability when processing large volumes of content.

## Why "Porter Bridges"?

The name comes from Death Stranding's Sam Porter Bridges, who delivers packages to reconnect isolated communities. Just as Sam builds bridges between settlements, Porter Bridges builds connections between different Minecraft versions by delivering the porting intelligence developers need to keep their mods working across updates.

In Death Stranding, each package delivery strengthens the network that connects everyone. Similarly, each Bridge Bundle I create helps strengthen the connections that keep the modding community thriving across Minecraft's evolution.

---

*Keep on keeping on, and happy modding!*