# Gemini Agent Instructions

- Don't run anything unless the user tells you to. Don't guess what the user means. Clarify, disambiguate, confirm and ask first if there is any doubt.

# Project Overview: Linkie Porting Intelligence

This project is a development-time data processing utility designed to automate the collection and structuring of Minecraft mod porting information. It is a Node.js/TypeScript application.

## Core Pipeline

The application operates as a five-stage pipeline. The main command `orchestrate` runs the entire pipeline interactively, but each stage can also be executed as a standalone command.

1.  **Discovery (`discover`):** Finds porting-related content from various sources (GitHub, RSS feeds, Maven repositories).
2.  **Collection (`collect`):** Downloads the raw content (HTML, Markdown, etc.) from the discovered sources.
3.  **Distillation (`distill`):** Uses an AI model (Gemini) to process the raw content and extract structured information like breaking changes, API updates, and migration steps.
4.  **Packaging (`package`):** Organizes the structured data into versioned packages according to the schema in `docs/PACKAGED_DATA_MODEL.md`.
5.  **Bundling (`bundle`):** Creates compressed, distributable archives of the final data packages.

## Project Structure

-   **`src/`**: Contains all core TypeScript source code.
    -   **`index.ts`**: The main entry point, defining the CLI commands using `commander`.
    -   **`cli/`**: Handlers for the individual CLI commands.
    -   **`modules/`**: The core logic for each of the five pipeline stages.
    -   **`schemas/`**: `zod` schemas that define and validate the data structures at each stage of the pipeline. This is critical to the project's integrity.
    -   **`utils/`**: Utility functions for logging, HTTP requests, and state management.
-   **`docs/`**: High-level documentation about the project, its data sources, and its data model.
-   **`generated/`**: The output directory for all pipeline artifacts (e.g., `discovered-sources.json`, `collected-content/`, `distilled-content/`). This directory is gitignored.
-   **`logs/`**: Contains runtime logs, including detailed logs of calls made to the Gemini API.
-   **`package.json`**: Defines npm dependencies and scripts.

## How to Run

-   **Installation:** `npm install`
-   **Execution:** The project is written in TypeScript and requires a loader to run directly.
    -   **Main interactive command:** `node --loader ts-node/esm src/index.ts orchestrate`
    -   **Individual commands:** `node --loader ts-node/esm src/index.ts <command_name>` (e.g., `discover`, `collect`)

## State Management

The project uses a single `generated/pipeline-state.json` file to track the progress of each source through the entire pipeline. This is managed by the `PipelineStateManager` in `src/utils/PipelineStateManager.ts` and replaces a legacy system of multiple JSON files.
