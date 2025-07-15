/**
 * @file Validation Fixer - Fixes common validation issues
 *
 * This module handles fixing common validation issues in AI responses,
 * including enum corrections and missing field additions.
 */

/**
 * Validation fixer class
 */
export class ValidationFixer {
  /**
   * Fix common validation issues in the parsed response
   */
  fixCommonValidationIssues(parsed: string) {
    const fixed: any = JSON.parse(JSON.stringify(parsed)); // Deep clone

    // Fix content_scope enum values
    if (fixed.target_context?.content_scope) {
      const validScopes = ['single_version', 'version_range', 'cross_version'];
      if (!validScopes.includes(fixed.target_context.content_scope)) {
        // Map common invalid values to valid ones
        const scopeMap: Record<string, string> = {
          general_concept: 'single_version',
          general: 'single_version',
          multiple_versions: 'version_range',
          all_versions: 'cross_version',
        };
        fixed.target_context.content_scope =
          scopeMap[fixed.target_context.content_scope as string] ||
          'single_version';
      }
    }

    // Ensure all required arrays exist and are arrays
    const requiredArrays = [
      'breaking_changes',
      'api_updates',
      'migration_guides',
      'dependency_updates',
    ];
    requiredArrays.forEach((arrayName) => {
      if (!(fixed as any)[arrayName]) {
        (fixed as any)[arrayName] = [];
      } else if (!Array.isArray((fixed as any)[arrayName])) {
        (fixed as any)[arrayName] = [];
      }
    });

    // Fix missing required fields in nested objects
    if (fixed.breaking_changes && Array.isArray(fixed.breaking_changes)) {
      fixed.breaking_changes.forEach((change: any) => {
        if (!change.id) {
          change.id = `breaking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        if (!change.title) {
          change.title = change.description || 'Breaking change';
        }
        if (!change.category) {
          change.category = 'api_removal';
        }
        if (!change.severity) {
          change.severity = 'medium';
        }
        if (!change.affected_apis) {
          change.affected_apis = change.references || [];
        }
        if (!change.impact_description) {
          change.impact_description =
            change.impact || change.description || 'No description provided';
        }
        if (!change.introduced_in) {
          change.introduced_in = 'unknown';
        }
        if (!change.migration_required) {
          change.migration_required = false;
        }
        if (!change.compatibility) {
          change.compatibility = { minecraft_versions: [] };
        }
        if (!change.source) {
          change.source = {
            source_id: 'unknown',
            source_type: 'blog_post',
            confidence_score: 0.5,
            extraction_timestamp: new Date().toISOString(),
          };
        }
      });
    }

    if (fixed.api_updates && Array.isArray(fixed.api_updates)) {
      fixed.api_updates.forEach((update: any) => {
        if (!update.id) {
          update.id = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        if (!update.title) {
          update.title = update.description || 'API update';
        }

        // Fix invalid API update types
        if (!update.type) {
          update.type = 'api_enhancement';
        }
        const validTypes = [
          'new_api',
          'api_enhancement',
          'deprecation',
          'performance_improvement',
          'bug_fix',
          'feature_addition',
        ];
        if (!validTypes.includes(update.type)) {
          const typeMap: Record<string, string> = {
            signature_change: 'api_enhancement',
            parameter_change: 'api_enhancement',
            method_change: 'api_enhancement',
            class_change: 'api_enhancement',
            behavior_change: 'api_enhancement',
            guidance: 'api_enhancement',
          };
          update.type = typeMap[update.type as string] || 'api_enhancement';
        }

        if (!update.affected_apis) {
          update.affected_apis = update.references || [];
        }
        if (!update.description) {
          update.description = 'No description provided';
        }
        if (!update.introduced_in) {
          update.introduced_in = 'unknown';
        }
        if (!update.compatibility) {
          update.compatibility = { minecraft_versions: [] };
        }
        if (!update.source) {
          update.source = {
            source_id: 'unknown',
            source_type: 'blog_post',
            confidence_score: 0.5,
            extraction_timestamp: new Date().toISOString(),
          };
        }
      });
    }

    // Fix migration guides
    if (fixed.migration_guides && Array.isArray(fixed.migration_guides)) {
      fixed.migration_guides.forEach((guide: any) => {
        if (!guide.id) {
          guide.id = `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        if (!guide.title) {
          guide.title = guide.description || 'Migration guide';
        }
        if (!guide.scope) {
          guide.scope = 'version_upgrade';
        }
        if (!guide.from_version) {
          guide.from_version = 'unknown';
        }
        if (!guide.to_version) {
          guide.to_version = 'unknown';
        }
        if (!guide.loader_context) {
          guide.loader_context = 'neoforge';
        }
        if (!guide.overview) {
          guide.overview = guide.description || 'No overview provided';
        }
        if (!guide.prerequisites) {
          guide.prerequisites = [];
        }
        if (!guide.sections) {
          guide.sections = [];
        }
        if (!guide.estimated_effort) {
          guide.estimated_effort = {
            small_mod: 'hours',
            medium_mod: 'days',
            large_mod: 'weeks',
          };
        }
        if (!guide.completion_checklist) {
          guide.completion_checklist = [];
        }
        if (!guide.steps) {
          guide.steps = [];
        }
        if (!guide.testing_requirements) {
          guide.testing_requirements = [];
        }
        if (!guide.source) {
          guide.source = {
            source_id: 'unknown',
            source_type: 'blog_post',
            confidence_score: 0.5,
            extraction_timestamp: new Date().toISOString(),
          };
        }
        if (!guide.last_updated) {
          guide.last_updated = new Date().toISOString();
        }
      });
    }

    return fixed;
  }
}

export default ValidationFixer;
