/**
 * @file Critical Error - Enhanced error handling for pipeline failures
 *
 * This module provides critical error detection and escalation for the
 * porter-bridges pipeline to prevent silent failures.
 */

import type { ISourceItem } from '../modules/discovery/source-item-factory';

interface PipelineData {
  sources: Record<string, ISourceItem>;
  [key: string]: any;
}

/**
 * Critical Error class for escalating serious pipeline failures
 */
export class CriticalError extends Error {
  public phase: string;
  public details: any;
  public timestamp: string;
  public severity: string;

  constructor(message: string, phase: string, details: any = {}) {
    super(message);
    this.name = 'CriticalError';
    this.phase = phase;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.severity = 'critical';
  }

  /**
   * Format error for logging with context
   */
  toLogFormat() {
    return {
      error: this.message,
      phase: this.phase,
      details: this.details,
      timestamp: this.timestamp,
      severity: this.severity,
    };
  }

  /**
   * Format error for CLI display
   */
  toCLIFormat() {
    return `🚨 CRITICAL SYSTEM FAILURE DETECTED 🚨
Phase: ${this.phase}
Issue: ${this.message}
Impact: ${this.details.impact || 'System unable to continue'}
Evidence: ${this.details.evidence || 'See logs for details'}
Recommended Action: ${this.details.recommendedAction || 'Fix critical issue before continuing'}

Timestamp: ${this.timestamp}`;
  }
}

/**
 * Pipeline Validator for detecting critical failures between phases
 */
export class PipelineValidator {
  /**
   * Validate discovery phase output
   */
  static validateDiscoveryOutput(data: PipelineData) {
    if (!data.sources || Object.keys(data.sources).length < 10) {
      throw new CriticalError(
        `Discovery found only ${Object.keys(data.sources || {}).length} sources, expected 10+`,
        'discovery',
        {
          impact: 'Insufficient sources for meaningful porting intelligence',
          evidence: `Sources discovered: ${Object.keys(data.sources || {}).length}`,
          recommendedAction:
            'Check source configurations and network connectivity',
        }
      );
    }

    // Check for EventBus guide specifically - look for the source ID or URL pattern
    const hasEventBus = Object.values(data.sources).some(
      (s) =>
        (s.url?.includes('PaintNinja') &&
          s.url.includes('ad82c224aecee25efac1ea3e2cf19b91')) ||
        s.id?.includes('eventbus_migration_guide') ||
        s.title?.toLowerCase().includes('eventbus')
    );

    if (!hasEventBus) {
      const sourceIds = Object.values(data.sources)
        .map((s) => s.id || s.url)
        .slice(0, 5);
      throw new CriticalError(
        'Missing critical EventBus 7 Migration Guide for Forge 1.21.7',
        'discovery',
        {
          impact: 'Critical Forge 1.21.7 porting information unavailable',
          evidence: `EventBus guide not found. Sample source IDs: ${sourceIds.join(', ')}`,
          recommendedAction:
            'Verify EventBus guide URL in source configurations',
        }
      );
    }
  }

  /**
   * Validate collection phase output
   */
  static validateCollectionOutput(data: PipelineData) {
    const sources = Object.values(data.sources || {});
    const collectedSources = sources.filter((s) => s.status === 'collected');
    const failureRate =
      sources.length > 0
        ? (sources.length - collectedSources.length) / sources.length
        : 1;

    if (collectedSources.length === 0) {
      throw new CriticalError(
        'Collection phase produced ZERO successful downloads',
        'collection',
        {
          impact: 'No content available for distillation',
          evidence: `0 out of ${sources.length} sources collected successfully`,
          recommendedAction: 'Fix content encoding and network issues',
        }
      );
    }

    if (failureRate > 0.5) {
      throw new CriticalError(
        `Collection phase has ${Math.round(failureRate * 100)}% failure rate`,
        'collection',
        {
          impact: 'High failure rate indicates systematic issues',
          evidence: `${collectedSources.length} collected, ${sources.length - collectedSources.length} failed out of ${sources.length} total`,
          recommendedAction:
            'Investigate collection errors and fix systematic issues',
        }
      );
    }
  }

  /**
   * Validate distillation phase output
   */
  static validateDistillationOutput(data: PipelineData) {
    const sources = Object.values(data.sources || {});
    const distilledSources = sources.filter((s) => s.status === 'distilled');
    const collectedSources = sources.filter((s) => s.status === 'collected');

    if (distilledSources.length === 0 && collectedSources.length > 0) {
      throw new CriticalError(
        'Distillation phase produced ZERO successful extractions',
        'distillation',
        {
          impact: 'No structured intelligence available for packaging',
          evidence: `0 distilled out of ${collectedSources.length} collected sources`,
          recommendedAction:
            'Check Gemini CLI availability and AI processing errors',
        }
      );
    }

    const failureRate =
      collectedSources.length > 0
        ? (collectedSources.length - distilledSources.length) /
          collectedSources.length
        : 0;

    if (failureRate > 0.5) {
      throw new CriticalError(
        `Distillation phase has ${Math.round(failureRate * 100)}% failure rate`,
        'distillation',
        {
          impact: 'High failure rate indicates AI processing issues',
          evidence: `${distilledSources.length} distilled out of ${collectedSources.length} collected sources`,
          recommendedAction:
            'Check AI model availability and content preprocessing',
        }
      );
    }
  }

  /**
   * Validate packaging phase output
   */
  static validatePackagingOutput(data: any) {
    if (!data.package_metadata) {
      throw new CriticalError(
        'Packaging phase produced no metadata',
        'packaging',
        {
          impact: 'No package tracking information available',
          evidence: 'No package_metadata found in results',
          recommendedAction:
            'Ensure PackageModule returns proper metadata structure',
        }
      );
    }

    // Check if package stats indicate success
    const packageStats = data.package_metadata.package_stats;
    if (packageStats?.summary) {
      const summary = packageStats.summary;
      if (summary.packaged_sources === 0 && summary.total_sources > 0) {
        throw new CriticalError(
          'Packaging phase failed to package any sources',
          'packaging',
          {
            impact: 'No packaged content available for bundling',
            evidence: `0 packaged out of ${summary.total_sources} distilled sources`,
            recommendedAction:
              'Check distilled content directory and packaging logic',
          }
        );
      }
    }

    // Check for package path creation
    if (!data.package_metadata.package_path) {
      throw new CriticalError(
        'Packaging phase created no package directory',
        'packaging',
        {
          impact: 'No package structure available for bundling',
          evidence: 'package_path is missing from metadata',
          recommendedAction:
            'Verify packaging creates proper PACKAGED_DATA_MODEL structure',
        }
      );
    }
  }

  /**
   * Validate bundle phase output
   */
  static validateBundleOutput(data: any) {
    if (!data.bundle_metadata) {
      throw new CriticalError('Bundle phase produced no metadata', 'bundling', {
        impact: 'No bundle tracking information available',
        evidence: 'No bundle_metadata found in results',
        recommendedAction:
          'Ensure BundleModule returns proper metadata structure',
      });
    }

    // Check if bundle stats indicate success
    const bundleStats = data.bundle_metadata.bundle_stats;
    if (bundleStats?.summary) {
      const summary = bundleStats.summary;
      if (summary.bundled_packages === 0 && summary.total_packages > 0) {
        throw new CriticalError(
          'Bundle phase failed to create any bundles',
          'bundling',
          {
            impact: 'No distributable archives created',
            evidence: `0 bundled out of ${summary.total_packages} packages`,
            recommendedAction:
              'Check package directory and bundle creation logic',
          }
        );
      }
    }

    // Check for archive creation if enabled
    if (
      data.bundle_metadata.archive_path === null &&
      data.bundle_metadata.bundle_options?.createArchive !== false
    ) {
      throw new CriticalError(
        'Bundle phase failed to create distribution archive',
        'bundling',
        {
          impact: 'No ZIP archive available for distribution',
          evidence: 'archive_path is null despite archiving being enabled',
          recommendedAction: 'Check ZIP creation logic and archiver dependency',
        }
      );
    }
  }
}

export default { CriticalError, PipelineValidator };
