# Mod Loader Documentation Location Report

## Executive Summary

This report provides a comprehensive investigation of documentation sources for three major Minecraft mod loaders: Fabric, NeoForge, and Minecraft Forge. The investigation was conducted to establish accurate data sources for the Porter Bridges loader-docs feature.

## Investigation Findings

### 1. Fabric Documentation

**Repository**: https://github.com/FabricMC/fabric-docs

**Structure**: Version-specific directories under `versions/` folder, with current version in `develop/`

**Available Versions**:
| Version | Location | Status |
|---------|----------|--------|
| 1.21.4 | `/develop` | Current/Latest |
| 1.21 | `/versions/1.21/develop` | Versioned |
| 1.20.4 | `/versions/1.20.4/develop` | Versioned |

**Key Findings**:
- Uses VitePress for documentation
- Current version is 1.21.4 (confirmed via `.vitepress/config.mts`)
- Only 3 versions are currently documented (relatively new documentation system)
- Each version contains comprehensive developer documentation including:
  - blocks, commands, data-generation, entities
  - getting-started, items, rendering, sounds
  - Various .md files for specific topics

**URLs**:
- Current (1.21.4): https://github.com/FabricMC/fabric-docs/tree/main/develop
- 1.21: https://github.com/FabricMC/fabric-docs/tree/main/versions/1.21/develop
- 1.20.4: https://github.com/FabricMC/fabric-docs/tree/main/versions/1.20.4/develop

### 2. NeoForge Documentation

**Repository**: https://github.com/neoforged/Documentation

**Structure**: Version-specific directories under `versioned_docs/` with pattern `version-X.X.X`, current version in `docs/`

**Available Versions**:
| Version | Location | Status |
|---------|----------|--------|
| 1.21.6-1.21.8 | `/docs` | Current/Latest |
| 1.21.5 | `/versioned_docs/version-1.21.5` | Archived (no longer maintained) |
| 1.21.4 | `/versioned_docs/version-1.21.4` | Versioned |
| 1.21.3 | `/versioned_docs/version-1.21.3` | Versioned |
| 1.21.1 | `/versioned_docs/version-1.21.1` | Versioned |
| 1.20.6 | `/versioned_docs/version-1.20.6` | Versioned |
| 1.20.4 | `/versioned_docs/version-1.20.4` | Versioned |

**Key Findings**:
- Uses Docusaurus for documentation
- Current version is 1.21.6-1.21.8 (confirmed via version banner on docs site)
- Note: `versions.json` contains only archived versions, not current documentation
- Version 1.21.5 displays warning that it's "no longer actively maintained"
- Well-structured versioned documentation system
- 7 versions available in total

**URLs**:
- Current (1.21.6-1.21.8): https://github.com/neoforged/Documentation/tree/main/docs
- Versioned docs: https://github.com/neoforged/Documentation/tree/main/versioned_docs/version-[VERSION]

### 3. Minecraft Forge Documentation

**Repository**: https://github.com/MinecraftForge/Documentation

**Structure**: Documentation organized by branches, not directories. Each Minecraft version has its own branch.

**Available Branches**:
| Version | Branch Name | Status |
|---------|-------------|--------|
| 1.21.x | `1.21.x` | Default/Current |
| 1.20.x | `1.20.x` | Active |
| 1.20.1 | `1.20.1` | Patch version |
| 1.19.x | `1.19.x` | Active |
| 1.19.2 | `1.19.2` | Patch version |
| 1.18.x | `1.18.x` | Active |
| 1.17.x | `1.17.x` | Active |
| 1.16.x | `1.16.x` | Active |
| 1.15.x | `1.15.x` | Active |
| 1.14.x | `1.14.x` | Active |
| 1.13.x | `1.13.x` | Active |
| 1.12.x | `1.12.x` | Active |
| FG/5.x | `FG/5.x` | Forge Gradle |
| FG/6.x | `FG/6.x` | Forge Gradle |

**Key Findings**:
- Uses branch-based versioning (different from Fabric and NeoForge)
- Extensive version coverage from 1.12.x to 1.21.x
- Documentation stored in `/docs` directory within each branch
- 14 total branches (12 major versions + 2 Forge Gradle)
- Oldest supported version is 1.12.x

**URLs**:
- Pattern: https://github.com/MinecraftForge/Documentation/tree/[BRANCH]/docs
- Example (1.21.x): https://github.com/MinecraftForge/Documentation/tree/1.21.x/docs

## Comparison Summary

| Loader | Structure | Version Count | Oldest Version | Latest Version | Documentation System |
|--------|-----------|---------------|----------------|----------------|---------------------|
| Fabric | Directories | 3 | 1.20.4 | 1.21.4 | VitePress |
| NeoForge | Directories | 7 | 1.20.4 | 1.21.5 | Docusaurus |
| Forge | Branches | 12+ | 1.12.x | 1.21.x | Unknown |

## Implementation Considerations for Porter Bridges

1. **Different Repository Structures**: 
   - Fabric and NeoForge use directory-based versioning
   - Forge uses branch-based versioning
   - Implementation must handle both approaches

2. **Version Detection**:
   - Fabric: Check `.vitepress/config.mts` for current version
   - NeoForge: Check `versions.json` for version list
   - Forge: Enumerate branches via GitHub API

3. **Content Location**:
   - Fabric: `/develop` for current, `/versions/[VERSION]/develop` for others
   - NeoForge: `/docs` for current, `/versioned_docs/version-[VERSION]` for others
   - Forge: `/docs` directory in each branch

4. **API Requirements**:
   - GitHub API for branch enumeration (Forge)
   - Raw content access for all loaders
   - Consider rate limiting for multiple version fetches

## Recommended Data Source Design

```typescript
interface LoaderDocsSource {
  loader: 'fabric' | 'neoforge' | 'forge';
  version: string;
  url: string;
  structure: 'directory' | 'branch';
  status: 'current' | 'versioned';
}
```

The loader-docs module should:
1. Implement loader-specific discovery strategies
2. Normalize version formats across loaders
3. Handle both directory and branch-based structures
4. Cache version information to reduce API calls
5. Process documentation content similar to existing sources

## Conclusion

All three mod loaders maintain comprehensive documentation, but with significantly different organizational approaches. Fabric has the newest but most limited documentation (3 versions), NeoForge has a modern versioned approach (7 versions), and Forge has the most extensive historical coverage (12+ versions) using a branch-based system. The Porter Bridges implementation must be flexible enough to handle these diverse structures while providing a unified interface for documentation discovery and processing.