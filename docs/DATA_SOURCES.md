# Data Sources and Distillation Process

This document outlines the data sources used and the process for distilling that information into a structured format.

## Data Sources

- **NeoForged Primers:** Official porting guides from the NeoForged team.
- **Mod Loader Changelogs:** Release notes from Fabric, Forge, and NeoForge.
- **Community Blogs:** Posts from the Fabric and NeoForge communities.
- **Specialized Guides:** Technical articles and guides on specific topics (e.g., EventBus migration).
- **Local Documents:** First-hand accounts and notes from developers who have gone through the mod porting process. These documents provide real-world context and practical insights.

## Distillation Process

1.  **Fetch:** Raw content is downloaded from its source.
2.  **Parse:** HTML, Markdown, and other formats are parsed into a common structure.
3.  **AI-Powered Distillation:** The parsed content is passed to an AI model (such as Claude Code or Gemini CLI) for distillation. This process is designed to be asynchronous and resumable to handle potential rate limiting or other interruptions.
    -   The AI is prompted to extract key information, such as breaking changes, API updates, and migration steps.
    -   The model is instructed to structure this information according to the schemas defined in `PACKAGED_DATA_MODEL.md`.
4.  **Structure & Cross-Reference:** The AI-generated structured data is then validated, and information from different sources is linked and de-duplicated.
5.  **Format:** The final, structured data is formatted and saved according to the packaged data model.
