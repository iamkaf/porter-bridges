/**
 * @file Simplified schema for distilled content - essential porting intelligence only
 */

import { z } from 'zod';

/**
 * Simple breaking change schema
 */
const SimpleBreakingChangeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  affected_apis: z.array(z.string()),
  minecraft_version: z.string(),
});

/**
 * Simple API update schema
 */
const SimpleApiUpdateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(['new_api', 'enhancement', 'deprecation', 'bug_fix']),
  affected_apis: z.array(z.string()),
  minecraft_version: z.string(),
});

/**
 * Simple migration guide schema
 */
const SimpleMigrationGuideSchema = z.object({
  id: z.string(),
  title: z.string(),
  from_version: z.string(),
  to_version: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
});

/**
 * Simple dependency update schema
 */
const SimpleDependencyUpdateSchema = z.object({
  id: z.string(),
  name: z.string(),
  from_version: z.string(),
  to_version: z.string(),
  description: z.string(),
  minecraft_version: z.string(),
});

/**
 * Main distilled content schema - porting information only
 */
export const DistilledContentSchema = z.object({
  minecraft_version: z
    .string()
    .describe('Primary Minecraft version this content targets'),
  breaking_changes: z
    .array(SimpleBreakingChangeSchema)
    .describe('List of breaking changes identified'),
  api_updates: z
    .array(SimpleApiUpdateSchema)
    .describe('List of API updates and new features'),
  migration_guides: z
    .array(SimpleMigrationGuideSchema)
    .describe('Migration guides'),
  dependency_updates: z
    .array(SimpleDependencyUpdateSchema)
    .describe('Dependency and tooling updates'),
  summary: z.string().describe('Brief summary of the content'),
});

export type IDistilledContentSchema = z.infer<typeof DistilledContentSchema>;

export default DistilledContentSchema;
