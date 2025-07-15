# Development Hints for Linkie Porting Intelligence

*Last Updated: 2025-07-11*

This document provides a set of pointers and reminders for developers (including AI assistants) working on the `linkie-porting-intelligence` module. It is intended to be a quick reference to navigate this specific sub-project.

## Core Philosophy

This module is a **development-time data processing utility**. Its primary goal is to fetch raw information from various online sources, process it into a structured and optimized format, and package it for static inclusion in other applications, such as the `mcp-server`. It is **not** a runtime component of the main Linkie-Web application.

## Project Structure Overview

-   `src/`: Contains the core logic for the utility.
    -   `modules/`: Reusable modules for tasks like data fetching, parsing, and file system operations.
    -   `index.js`: The main entry point that orchestrates the different stages of the process via a CLI.
-   `docs/`: Documentation specific to this module.
    -   `README.md`: High-level overview.
    -   `PACKAGED_DATA_MODEL.md`: Defines the structure of the final, processed data.
    -   `DATA_SOURCES.md`: Lists the external sources of information.
-   `scripts/`: Standalone scripts for specific, often manual, tasks related to data management.
-   `data/`: The output directory for the structured, processed data. This directory is the primary artifact produced by this module.
-   `PROGRESS.md`: Tracks the development progress of this module.

## Key Logic and Data Locations

-   **CLI Commands:** The main commands (`discover`, `package`, `collect`, `distill`, `bundle`) are defined in `src/index.js`.
-   **Data Fetching:** Logic for interacting with external APIs and websites should be placed in `src/`. For example, a file for fetching data from NeoForged primers would live here.

## Data Sources

This module relies on several external sources. When adding new features or fixing bugs, it's often necessary to consult these directly:

-   **NeoForged Primers:** The primary source for detailed, official porting guides. Found in the `.github` repository of the `neoforged` organization on GitHub.
-   **Mod Loader Changelogs:** Located in the GitHub releases of the respective mod loader repositories (Fabric, Forge, NeoForge).
-   **Community Blogs:** The official blogs for Fabric and NeoForge, which are often the first place to announce major changes. These are typically consumed via RSS feeds.
-   **Specialized Guides:** Community-written guides, often in the form of GitHub Gists or blog posts, that cover specific, complex topics (e.g., the EventBus 7 migration).

## Development Workflow & Gotchas

-   **Incremental Data Collection:** The intended workflow is to run the `discover`, `package`, `collect`, and `distill` commands incrementally. It is not designed to fetch and process all data in a single, monolithic step.
-   **Data Schema is King:** All data processing should be guided by the schemas defined in `docs/PACKAGED_DATA_MODEL.md`. Any changes to the data structure should be reflected there first.
-   **Error Handling is Crucial:** Since this module interacts with many external services, robust error handling, retries, and fallback mechanisms are essential for any data fetching logic.
-   **Dependencies:** This is a Node.js project. Use `npm install` to fetch dependencies defined in `package.json`. Any new external libraries should be added there.
-   **Testing:** While there is no formal testing structure yet, it is good practice to create small, standalone test scripts in the `scripts/` directory to verify new data fetching and processing logic before integrating it into the main application.