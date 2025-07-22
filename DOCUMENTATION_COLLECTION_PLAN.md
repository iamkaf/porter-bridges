# Documentation Collection Implementation Plan

## Overview
Implement documentation corpus collection using simple-git for Porter Bridges loader-docs feature.

## Objective
Download entire documentation corpus for each loader/version and organize in final package as `docs/[loader]/[version]/[corpus]`, skipping distillation.

## Key Improvements from Original Plan
1. **Version Naming Cleanup**: "1.21.6-1.21.8" → "1.21.8" (pick highest), "1.21.x" → "1.21"
2. **simple-git Integration**: Use Node.js git wrapper instead of GitHub API
3. **Sparse Checkout**: Only download documentation directories, not entire repos

## Implementation Strategy

### 1. DocumentationCollector Class
```typescript
class DocumentationCollector {
  private git = simpleGit();
  
  async collectRepo(repoUrl: string, targetPath: string, sparsePattern: string, branch?: string): Promise<void>
  private async createTempDir(): Promise<string>
  private async copyFiles(source: string, target: string): Promise<void>  
  private async cleanup(tempDir: string): Promise<void>
  private normalizeVersion(rawVersion: string): string
}
```

### 2. Per-Loader Implementation

**NeoForge:**
- Current: `docs/neoforge/1.21.8/` (normalized from 1.21.6-1.21.8)
- Versioned: `docs/neoforge/1.21.5/` etc.
- Sparse pattern: `docs` and `versioned_docs/version-X.X.X`

**Fabric:**
- Current: `docs/fabric/1.21.4/`
- Versioned: `docs/fabric/1.21/`, `docs/fabric/1.20.4/`
- Sparse pattern: `develop` and `versions/X.X/develop`

**Forge:**
- Branch-based: `docs/forge/1.21/` (from 1.21.x branch)
- Sparse pattern: `docs`

### 3. Version Normalization Logic
```typescript
private normalizeVersion(rawVersion: string): string {
  // "1.21.6-1.21.8" → "1.21.8" (pick highest)
  if (rawVersion.includes('-')) {
    return rawVersion.split('-').pop()!;
  }
  // "1.21.x" → "1.21" (clean branch name)
  return rawVersion.replace('.x', '');
}
```

### 4. Integration Points

**Collection Module Detection:**
```typescript
if (source.source_type === 'documentation') {
  await this.documentationCollector.collect(source);
} else {
  await this.contentDownloader.collectSourceWithRetry(source);
}
```

**Skip Distillation:**
- Use existing `processing_hints.skip_distillation` infrastructure
- Documentation sources marked in SourceItemFactory

### 5. Expected Final Structure
```
bridge-bundle/
├── docs/
│   ├── fabric/
│   │   ├── 1.21.4/    # clean version names
│   │   ├── 1.21/
│   │   └── 1.20.4/
│   ├── neoforge/
│   │   ├── 1.21.8/    # highest in range  
│   │   ├── 1.21.5/
│   │   └── 1.21.4/
│   └── forge/
│       ├── 1.21/      # clean branch name
│       ├── 1.20/
│       └── 1.19/
├── raw/ (existing)
└── distilled/ (existing)
```

## Current Progress

### ✅ Completed
- [x] Investigation of loader documentation locations
- [x] Dynamic version detection implementation  
- [x] Added simple-git dependency (v3.28.0)
- [x] Created comprehensive implementation plan
- [x] **DocumentationCollector class** created with full simple-git integration
- [x] **Version normalization** method added to LoaderDocsDiscovery

### 🚧 In Progress
- [x] Creating DocumentationCollector class ✅
- [x] Updating LoaderDocsDiscovery to use normalized versions ✅
- [x] Adding skip_distillation marking for documentation sources ✅
- [x] Modifying CollectionModule to detect and route documentation sources ✅

### 📋 Todo List
1. ✅ **Create DocumentationCollector class** with simple-git integration
2. 🚧 **Add version normalization** (1.21.6-1.21.8 → 1.21.8, 1.21.x → 1.21) - method added
3. **Update LoaderDocsDiscovery** to use normalized version names in source creation
4. **Ensure documentation sources** are marked with skip_distillation
5. **Modify CollectionModule** to detect and route documentation sources
6. **Test documentation collection** with simple-git

### 📝 Recent Progress (Current Session)
- ✅ Added `simple-git@^3.28.0` dependency  
- ✅ Created `DocumentationCollector` class in `/src/modules/collection/documentation-collector.ts`
- ✅ Implemented git sparse checkout logic for efficient repo cloning
- ✅ Added version normalization method `_normalizeVersion()` to LoaderDocsDiscovery
- ✅ Updated LoaderDocsDiscovery to use normalized versions and skip_distillation
- ✅ Modified CollectionModule to detect and route documentation sources
- ✅ Fixed TypeScript errors in HTTP client usage
- ✅ **Ready for testing**: All implementation components are complete

## Technical Details

### simple-git Usage Pattern
```typescript
// Clone with sparse checkout
const cloneOptions = ['--no-checkout'];
if (branch) cloneOptions.push('--branch', branch, '--single-branch');

await this.git.clone(repoUrl, tempDir, cloneOptions);
await this.git.cwd(tempDir);
await this.git.raw(['sparse-checkout', 'init', '--cone']);
await this.git.raw(['sparse-checkout', 'set', sparsePattern]);
await this.git.checkout();
```

### Benefits of This Approach
✅ **Simple**: Single git operation per docs version  
✅ **Fast**: No API rate limits, built-in git efficiency  
✅ **Reliable**: Git's built-in retry and error handling  
✅ **Clean**: "1.21.8" instead of "1.21.6-1.21.8"  
✅ **Integrated**: Pure Node.js, fits Porter Bridges perfectly  
✅ **Sparse**: Only downloads needed directories

## Dependencies Added
- `simple-git@^3.28.0` - Git operations in Node.js

## Files to Create/Modify
1. `src/modules/collection/documentation-collector.ts` - New class
2. `src/modules/discovery/loader-docs-discovery.ts` - Update version normalization
3. `src/modules/collection-module.ts` - Add documentation routing
4. `src/modules/discovery/source-item-factory.ts` - Ensure skip_distillation for docs

## Next Session Tasks
1. Implement DocumentationCollector class
2. Add version normalization helper
3. Update existing modules for integration
4. Test end-to-end documentation collection workflow