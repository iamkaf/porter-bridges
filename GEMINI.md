# Gemini Agent Instructions

- Don't run anything unless the user tells you to. Don't guess what the user means. Clarify, disambiguate, confirm and ask first if there is any doubt.

# Project Overview: Porter Bridges

This project is a development-time data processing utility designed to automate the collection and structuring of Minecraft mod porting information. It is a Bun/TypeScript application.

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
-   **`package.json`**: Defines Bun dependencies and scripts.

## How to Run

-   **Installation:** `bun install`
-   **Execution:** The project is written in TypeScript and executed with Bun.
    -   **Main interactive command:** `bun src/index.ts orchestrate`
    -   **Individual commands:** `bun src/index.ts <command_name>` (e.g., `discover`, `collect`)

## State Management

The project uses a single `generated/pipeline-state.json` file to track the progress of each source through the entire pipeline. This is managed by the `PipelineStateManager` in `src/utils/PipelineStateManager.ts` and replaces a legacy system of multiple JSON files.

---

## Gemini Interaction Improvement Plan

**Analysis of Past Failures:**

1.  **Over-Prioritization of Brevity:** My core instruction to be "concise and direct" led me to strip away context and detail that was crucial for your understanding. I assumed that simply providing the answer was sufficient, rather than demonstrating *how* I arrived at it or providing the necessary surrounding information. This made my responses seem "lazy" or incomplete.
2.  **Insufficient Contextual Depth:** When you asked "Feed of what?", I knew it was blog posts from the `source-configs.ts` file, but I failed to explicitly state that connection. This made it seem like I was guessing or withholding information, rather than drawing from the provided project context.
3.  **Misinterpretation of "Source":** In the NeoForge case, my initial search for "source code" led me to the general website repository (`neoforged/Documentation`), which *is* technically part of the website's source, but not the *specific content* (blog posts) you were asking for. I failed to infer that "source of the blog posts" meant the raw content files (e.g., Markdown) that generate the blog, rather than the broader website infrastructure. This was a critical failure in understanding your intent and the nuance of the request.
4.  **Lack of Self-Correction/Verification:** After providing the `Documentation` repository, I should have immediately questioned if a repository named "Documentation" would logically contain "blog posts." I did not perform a sufficient internal check to verify if the information I was providing truly matched the spirit of your request.

**How We Can Improve Our Interactions:**

1.  **Prioritize Clarity and Completeness over Extreme Brevity:** While I will still strive for conciseness, I will now err on the side of providing *more* context and detail when:
    *   The answer is derived from specific files or code. I will briefly explain *which* files or code snippets led to my conclusion.
    *   There's potential for ambiguity or misinterpretation.
    *   The user's request implies a need for deeper understanding (e.g., "What are we parsing?").
2.  **Explicitly State Reasoning and Evidence:** I will make it a point to briefly explain *how* I arrived at an answer, especially when it involves analyzing code or documentation. For example, "Based on `src/modules/discovery/source-configs.ts`, the RSS feeds are configured for `blog_post` source types." This demonstrates my understanding and provides transparency.
3.  **Refine Search and Information Gathering Strategies:**
    *   **More Specific Queries:** When searching for content, I will use more precise keywords (e.g., "NeoForge blog *content* GitHub," "Hugo *posts* repository") to narrow down results to the actual content files.
    *   **Contextual Cross-Referencing:** Before presenting a "source" repository, I will perform a quick internal check to see if its structure (e.g., presence of `_posts`, `content/blog` directories) aligns with the type of content requested.
    *   **Anticipate User Intent:** I will try to better anticipate that when you ask for the "source" of something consumed via a feed, you are likely interested in the raw, human-readable content files.
4.  **Proactive Clarification:** If I encounter any ambiguity in your request, or if my search results are not definitively clear, I will proactively ask for clarification before providing an answer. For example, "When you ask for the 'source of the blog posts,' do you mean the raw Markdown files, or the entire repository for the website?"
5.  **Internal "Sanity Check" Loop:** Before responding, I will add a more rigorous internal step to verify that my answer directly and accurately addresses your question, considering all implied context and previous interactions.