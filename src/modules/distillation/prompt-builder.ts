/**
 * @file Prompt Builder - Builds prompts for AI distillation
 *
 * This module handles building structured prompts for Gemini AI processing,
 * including schema definitions and content preparation.
 */

import type { ISourceConfig } from '../discovery/source-configs';

/**
 * Prompt builder class
 */
export class PromptBuilder {
  /**
   * Build enhanced distillation prompt for Gemini with file path and output file
   */
  buildDistillationPrompt(
    source: ISourceConfig,
    filePath: string,
    outputFilePath: string
  ) {
    const contextInfo = {
      source_type: source.source_type,
      loader_type: source.loader_type,
      minecraft_version: source.minecraft_version,
      title: source.title,
      url: source.url,
    };

    return `You are a Minecraft mod development expert specializing in cross-version porting. Read the file content and extract ALL porting-relevant information with comprehensive detail.

INPUT FILE PATH: ${filePath}
OUTPUT FILE PATH: ${outputFilePath}

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE content from the input file carefully - don't miss any sections
2. Extract ALL breaking changes, API updates, and migration information 
3. Write the result as valid JSON to the output file path specified above
4. Do NOT output anything to stdout - write directly to the file
5. Be thorough - extract more rather than less
6. Use specific technical details, class names, method signatures

SOURCE CONTEXT:
- Type: ${contextInfo.source_type} (${this._getSourceTypeGuidance(contextInfo.source_type)})
- Title: ${contextInfo.title}
- Loader: ${contextInfo.loader_type}
- Version: ${contextInfo.minecraft_version || 'detect from content'}

MINECRAFT MODDING EXPERTISE - WHAT TO LOOK FOR:

**BREAKING CHANGES** (things that break existing mod code):
- Removed classes, methods, fields
- Changed method signatures (parameters, return types)
- Moved classes to different packages
- Changed access modifiers (public → private)
- Removed or renamed parameters
- Changed inheritance hierarchies
- Registry requirement changes
- Event system changes
- Configuration format changes

**API UPDATES** (new functionality and enhancements):
- New classes, methods, fields
- New events and callbacks
- New configuration options
- Enhanced existing APIs
- New utilities and helpers
- Performance improvements
- New data structures

**MIGRATION GUIDES** (step-by-step porting instructions):
- Version-to-version porting guides
- Code replacement patterns
- Step-by-step migration instructions
- Before/after code examples
- Recommended approaches

**DEPENDENCY UPDATES**:
- Mod loader version requirements
- Mapping version changes
- Library dependency updates
- Minimum version requirements

CONTENT ANALYSIS STRATEGY:
${this._getContentAnalysisGuidance(contextInfo.source_type)}

VALIDATION CHECKLIST:
- Did I extract ALL code changes mentioned?
- Did I capture ALL new APIs and features?
- Did I include specific class/method names?
- Did I identify ALL breaking changes?
- Is my summary comprehensive?

RESPONSE FORMAT:
{
  "minecraft_version": "${contextInfo.minecraft_version || 'extract_from_content'}",
  "breaking_changes": [/* ALL breaking changes with specific details */],
  "api_updates": [/* ALL new APIs and enhancements */], 
  "migration_guides": [/* ALL porting instructions */],
  "dependency_updates": [/* ALL version/dependency changes */],
  "summary": "Comprehensive summary covering all major changes"
}

Each breaking_change should include:
{
  "id": "unique-kebab-case-id",
  "title": "Specific descriptive title",
  "description": "Detailed technical description with class/method names",
  "severity": "high|medium|low",
  "affected_apis": ["full.class.name.Method", "package.ClassName"],
  "minecraft_version": "x.y.z"
}

Each api_update should include:
{
  "id": "unique-kebab-case-id", 
  "title": "Specific descriptive title",
  "description": "Detailed description of new functionality",
  "type": "new_api|enhancement|performance",
  "affected_apis": ["full.class.name.Method"],
  "minecraft_version": "x.y.z"
}

Be extremely thorough - extract EVERYTHING that could affect mod development.`;
  }

  /**
   * Get source type specific guidance
   */
  _getSourceTypeGuidance(sourceType: string) {
    switch (sourceType) {
      case 'primer':
        return 'comprehensive porting guide with detailed technical changes';
      case 'blog_post':
        return 'release announcement with change highlights and migration info';
      case 'changelog':
        return 'detailed list of all changes and improvements';
      case 'documentation':
        return 'technical documentation with API details';
      default:
        return 'technical content about Minecraft modding changes';
    }
  }

  /**
   * Get content analysis guidance based on source type
   */
  _getContentAnalysisGuidance(sourceType: string) {
    switch (sourceType) {
      case 'primer':
        return `- Focus on "Breaking Changes" and "Vanilla Changes" sections
- Extract ALL class/method changes with full names
- Look for migration code examples (before/after)
- Pay attention to package moves and renames
- Extract version-specific information`;

      case 'blog_post':
        return `- Scan for "Breaking Changes", "Changes", "Updates" sections  
- Extract code examples and snippets
- Look for deprecation notices
- Find new feature announcements
- Extract version compatibility information
- Look for migration instructions and tips`;

      case 'changelog':
        return `- Process each changelog entry systematically
- Categorize additions vs removals vs changes
- Extract specific commit/change details
- Look for "BREAKING" or "API" prefixes
- Extract version numbers and dates`;

      default:
        return `- Thoroughly scan all content sections
- Extract any technical changes or updates
- Look for code examples and class names
- Identify version-specific information
- Find any migration or porting guidance`;
    }
  }

  /**
   * Extract text content from HTML
   */
  _extractTextFromHTML(html: string) {
    // Simple HTML tag removal - extract text content
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

export default PromptBuilder;
