# Packaged Data Model

This document defines the data structures used for the packaged porting intelligence data.

## Core Concepts

- **Data Package:** A self-contained, versioned collection of all porting information across all supported Minecraft and tool versions. Each new version of the package is a complete, updated snapshot of all data.
- **Distilled Information:** Raw data is processed into a structured format, focusing on breaking changes, API updates, and migration steps.
- **Cherry-Picking:** The data is structured to allow for easy selection of specific information relevant to a particular porting task by the consumer of the package.

## Data Package Structure

A data package is a directory with a `package.json` file that defines its own version (e.g., `1.0.0`, `1.1.0`) and the progress of data collection. The data is organized as follows:

```
/linkie-porting-data-v1.0.0/
├── package.json
├── raw/
│   ├── neoforged-primers/
│   │   ├── 1.21.1.md
│   │   └── 1.21.2.md
│   └── fabric-blogs/
│       └── an-update-on-rendering.html
└── distilled/
    ├── 1.21.1/
    │   ├── breaking-changes.json
    │   └── api-updates.json
    └── 1.21.2/
        ├── breaking-changes.json
        └── api-updates.json
```

## Progress Tracking Model

To support robust and resumable data collection and distillation, the `package.json` will contain a `progress` field with the following structure:

```json
{
  "name": "linkie-porting-data",
  "version": "1.0.0",
  "description": "A comprehensive, versioned collection of Minecraft mod porting data.",
  "progress": {
    "sources": {
      "neoforged-primer-1.21.1": {
        "status": "collected",
        "url": "...",
        "checksum": "...",
        "collected_at": "..."
      },
      "fabric-blog-post-123": {
        "status": "pending",
        "url": "..."
      }
    },
    "distillation": {
      "neoforged-primer-1.21.1": {
        "status": "distilled",
        "distilled_at": "...",
        "agent": "claude-3-opus",
        "token_usage": 12345
      },
      "fabric-blog-post-123": {
        "status": "pending"
      }
    }
  }
}
```

### Status Fields

-   **`status`:** Can be `pending`, `collected`, `distilling`, `distilled`, or `failed`.
-   **`url`:** The source URL of the data.
-   **`checksum`:** The SHA-256 checksum of the raw downloaded content.
-   **`collected_at` / `distilled_at`:** Timestamps for when the respective process was completed.
-   **`agent`:** The AI agent used for distillation.
-   **`token_usage`:** The number of tokens used during the distillation process.
