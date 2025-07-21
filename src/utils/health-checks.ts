/**
 * @file Health Checks - Comprehensive system health monitoring
 *
 * This module provides health check endpoints and monitoring capabilities
 * for all system components including external APIs, AI processing,
 * file systems, and circuit breakers.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createEnhancedAIProcessor } from './ai-processing';
import { globalCircuitBreakerRegistry } from './circuit-breaker';
import {
  globalHealthCheckManager,
  type HealthCheckResult,
} from './error-handling';
import { globalDegradationManager } from './graceful-degradation';
import {
  createHttpHealthCheck,
  githubClient,
  mavenClient,
  rssClient,
} from './http';
import { logger } from './logger';

/**
 * Overall system health status
 */
export interface SystemHealthStatus {
  healthy: boolean;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  components: Record<string, HealthCheckResult>;
  circuitBreakers: Record<string, any>;
  degradation: {
    level: string;
    canContinue: boolean;
    activeServices: string[];
    failedServices: string[];
  };
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    warnings: string[];
    errors: string[];
  };
}

/**
 * Health check manager for the porter-bridges system
 */
export class PorterBridgesHealthManager {
  private readonly startTime: number;
  private aiProcessor: any;

  constructor() {
    this.startTime = Date.now();
    this.aiProcessor = createEnhancedAIProcessor('health_check');
    this.registerHealthChecks();
  }

  /**
   * Register all health checks
   */
  private registerHealthChecks(): void {
    // File system health checks
    globalHealthCheckManager.registerCheck('file_system', async () => {
      return this.checkFileSystem();
    });

    // GitHub API health check
    globalHealthCheckManager.registerCheck('github_api', async () => {
      return createHttpHealthCheck(
        'github',
        'https://api.github.com',
        githubClient
      );
    });

    // RSS feeds health check
    globalHealthCheckManager.registerCheck('rss_feeds', async () => {
      return createHttpHealthCheck(
        'rss',
        'https://neoforged.net/news/rss.xml',
        rssClient
      );
    });

    // Maven repository health check
    globalHealthCheckManager.registerCheck('maven_repo', async () => {
      return createHttpHealthCheck(
        'maven',
        'https://maven.neoforged.net',
        mavenClient
      );
    });

    // AI processing health check
    globalHealthCheckManager.registerCheck('ai_processing', async () => {
      return this.aiProcessor.getHealthCheck();
    });

    // Pipeline state health check
    globalHealthCheckManager.registerCheck('pipeline_state', async () => {
      return this.checkPipelineState();
    });

    // Generated directories health check
    globalHealthCheckManager.registerCheck(
      'generated_directories',
      async () => {
        return this.checkGeneratedDirectories();
      }
    );

    // Configuration health check
    globalHealthCheckManager.registerCheck('configuration', async () => {
      return this.checkConfiguration();
    });

    logger.info('✅ Health checks registered successfully');
  }

  /**
   * Get comprehensive system health status
   */
  async getSystemHealth(): Promise<SystemHealthStatus> {
    const startTime = Date.now();

    try {
      // Get all health check results
      const healthChecks = await globalHealthCheckManager.runAllChecks();

      // Get circuit breaker status
      const circuitBreakers = globalCircuitBreakerRegistry.getAllStatus();

      // Get degradation status
      const degradationContext =
        globalDegradationManager.getDegradationContext();
      const systemHealthSummary =
        globalDegradationManager.getSystemHealthSummary();

      // Calculate summary
      const healthyComponents = Object.values(healthChecks).filter(
        (c) => c.healthy
      ).length;
      const totalComponents = Object.values(healthChecks).length;
      const unhealthyComponents = totalComponents - healthyComponents;

      const warnings: string[] = [];
      const errors: string[] = [];

      // Collect warnings and errors
      for (const [name, check] of Object.entries(healthChecks)) {
        if (!check.healthy) {
          errors.push(`${name}: ${check.message}`);
        }
      }

      // Add degradation warnings
      if (degradationContext.level !== 'none') {
        warnings.push(
          `System operating in ${degradationContext.level} degradation mode`
        );
      }

      // Add circuit breaker warnings
      for (const [name, breaker] of Object.entries(circuitBreakers)) {
        if (!breaker.healthy) {
          warnings.push(`Circuit breaker ${name} is ${breaker.state}`);
        }
      }

      const overallHealthy =
        healthyComponents === totalComponents &&
        systemHealthSummary.canContinue;

      const systemHealth: SystemHealthStatus = {
        healthy: overallHealthy,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        version: this.getVersion(),
        environment: this.getEnvironment(),
        components: healthChecks,
        circuitBreakers,
        degradation: {
          level: degradationContext.level,
          canContinue: systemHealthSummary.canContinue,
          activeServices: degradationContext.activeServices,
          failedServices: degradationContext.failedServices,
        },
        summary: {
          total: totalComponents,
          healthy: healthyComponents,
          unhealthy: unhealthyComponents,
          warnings,
          errors,
        },
      };

      const duration = Date.now() - startTime;
      logger.info(`📊 System health check completed in ${duration}ms`, {
        healthy: overallHealthy,
        healthyComponents,
        totalComponents,
        degradationLevel: degradationContext.level,
        canContinue: systemHealthSummary.canContinue,
      });

      return systemHealth;
    } catch (error) {
      logger.error('❌ System health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get health status for a specific component
   */
  async getComponentHealth(componentName: string): Promise<HealthCheckResult> {
    return globalHealthCheckManager.runCheck(componentName);
  }

  /**
   * Get simplified health status for monitoring
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    message: string;
  }> {
    try {
      const systemHealth = await this.getSystemHealth();

      let status: 'healthy' | 'degraded' | 'unhealthy';
      let message: string;

      if (systemHealth.healthy) {
        status = 'healthy';
        message = 'All systems operational';
      } else if (systemHealth.degradation.canContinue) {
        status = 'degraded';
        message = `System degraded: ${systemHealth.degradation.level} mode`;
      } else {
        status = 'unhealthy';
        message = 'System cannot continue operation';
      }

      return {
        status,
        timestamp: systemHealth.timestamp,
        uptime: systemHealth.uptime,
        message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Reset all circuit breakers (for recovery)
   */
  resetCircuitBreakers(): void {
    globalCircuitBreakerRegistry.resetAll();
    logger.info('🔧 All circuit breakers reset');
  }

  // Private health check methods

  private async checkFileSystem(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const testDir = './generated';
    const testFile = path.join(testDir, 'health-check.tmp');

    try {
      // Test directory creation
      await fs.mkdir(testDir, { recursive: true });

      // Test file write
      await fs.writeFile(testFile, 'health-check-test', 'utf8');

      // Test file read
      const content = await fs.readFile(testFile, 'utf8');

      // Test file deletion
      await fs.unlink(testFile);

      if (content !== 'health-check-test') {
        throw new Error('File content verification failed');
      }

      return {
        healthy: true,
        component: 'file_system',
        message: 'File system is healthy',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          testDir,
          operations: ['mkdir', 'writeFile', 'readFile', 'unlink'],
        },
      };
    } catch (error) {
      return {
        healthy: false,
        component: 'file_system',
        message: `File system check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          testDir,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async checkPipelineState(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const stateFile = './generated/pipeline-state.json';

    try {
      // Check if state file exists
      await fs.access(stateFile);

      // Read and parse state file
      const stateContent = await fs.readFile(stateFile, 'utf8');
      const state = JSON.parse(stateContent);

      // Basic validation
      if (!state.sources || typeof state.sources !== 'object') {
        throw new Error('Invalid pipeline state structure');
      }

      const sourceCount = Object.keys(state.sources).length;

      return {
        healthy: true,
        component: 'pipeline_state',
        message: `Pipeline state is healthy with ${sourceCount} sources`,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          stateFile,
          sourceCount,
          lastUpdate: state.last_update,
        },
      };
    } catch (error) {
      const isFileNotFound =
        error instanceof Error && 'code' in error && error.code === 'ENOENT';

      return {
        healthy: isFileNotFound, // Missing state file is OK for new installations
        component: 'pipeline_state',
        message: isFileNotFound
          ? 'Pipeline state file not found (new installation)'
          : `Pipeline state check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          stateFile,
          error: error instanceof Error ? error.message : String(error),
          fileNotFound: isFileNotFound,
        },
      };
    }
  }

  private async checkGeneratedDirectories(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const requiredDirs = [
      './generated',
      './generated/collected-content',
      './generated/distilled-content',
      './generated/packages',
      './generated/bundles',
      './logs',
    ];

    const results: Record<string, boolean> = {};
    const errors: string[] = [];

    for (const dir of requiredDirs) {
      try {
        await fs.access(dir);
        results[dir] = true;
      } catch (error) {
        results[dir] = false;
        errors.push(
          `${dir}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const healthyDirs = Object.values(results).filter(Boolean).length;
    const totalDirs = requiredDirs.length;
    const healthy = healthyDirs === totalDirs;

    return {
      healthy,
      component: 'generated_directories',
      message: healthy
        ? `All ${totalDirs} directories are accessible`
        : `${healthyDirs}/${totalDirs} directories are accessible`,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      details: {
        directories: results,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  private async checkConfiguration(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const checks: Record<string, boolean> = {};
    const issues: string[] = [];

    // Check environment variables
    const envVars = ['NODE_ENV', 'HOME'];
    for (const envVar of envVars) {
      const value = process.env[envVar];
      checks[`env_${envVar}`] = !!value;
      if (!value) {
        issues.push(`Missing environment variable: ${envVar}`);
      }
    }

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = Number.parseInt(nodeVersion.slice(1).split('.')[0]);
    checks.node_version = majorVersion >= 18;
    if (majorVersion < 18) {
      issues.push(
        `Node.js version ${nodeVersion} is below minimum requirement (18)`
      );
    }

    // Check available memory
    const memoryUsage = process.memoryUsage();
    const availableMemory = memoryUsage.heapTotal - memoryUsage.heapUsed;
    checks.memory = availableMemory > 100 * 1024 * 1024; // 100MB threshold
    if (!checks.memory) {
      issues.push(
        `Low available memory: ${Math.round(availableMemory / 1024 / 1024)}MB`
      );
    }

    const healthy = Object.values(checks).every(Boolean);

    return {
      healthy,
      component: 'configuration',
      message: healthy
        ? 'Configuration is healthy'
        : `Configuration issues detected: ${issues.join(', ')}`,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      details: {
        checks,
        issues: issues.length > 0 ? issues : undefined,
        nodeVersion,
        memoryUsage: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
        },
      },
    };
  }

  private getVersion(): string {
    try {
      // Try to read from package.json
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = require(packageJsonPath);
      return packageJson.version || '0.0.0';
    } catch (error) {
      return '0.0.0';
    }
  }

  private getEnvironment(): string {
    return process.env.NODE_ENV || 'development';
  }
}

/**
 * Global health manager instance
 */
export const globalHealthManager = new PorterBridgesHealthManager();

/**
 * Health check CLI command handler
 */
export async function healthCheckCommand(): Promise<void> {
  try {
    console.log('🔍 Running system health check...\n');

    const startTime = Date.now();
    const systemHealth = await globalHealthManager.getSystemHealth();
    const duration = Date.now() - startTime;

    // Print overall status
    const statusEmoji = systemHealth.healthy ? '✅' : '❌';
    const uptimeHours = Math.floor(systemHealth.uptime / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor(
      (systemHealth.uptime % (1000 * 60 * 60)) / (1000 * 60)
    );

    console.log(
      `${statusEmoji} System Status: ${systemHealth.healthy ? 'HEALTHY' : 'UNHEALTHY'}`
    );
    console.log(`⏱️  Uptime: ${uptimeHours}h ${uptimeMinutes}m`);
    console.log(`🏷️  Version: ${systemHealth.version}`);
    console.log(`🌍 Environment: ${systemHealth.environment}`);
    console.log(`⚡ Check Duration: ${duration}ms\n`);

    // Print component status
    console.log('📊 Component Status:');
    for (const [name, check] of Object.entries(systemHealth.components)) {
      const emoji = check.healthy ? '✅' : '❌';
      console.log(
        `  ${emoji} ${name}: ${check.message} (${check.responseTime}ms)`
      );
    }
    console.log();

    // Print degradation status
    if (systemHealth.degradation.level !== 'none') {
      console.log(
        `⚠️  Degradation Level: ${systemHealth.degradation.level.toUpperCase()}`
      );
      console.log(
        `🔄 Can Continue: ${systemHealth.degradation.canContinue ? 'Yes' : 'No'}`
      );
      if (systemHealth.degradation.failedServices.length > 0) {
        console.log(
          `💥 Failed Services: ${systemHealth.degradation.failedServices.join(', ')}`
        );
      }
      console.log();
    }

    // Print circuit breaker status
    const circuitBreakers = Object.values(systemHealth.circuitBreakers);
    const unhealthyBreakers = circuitBreakers.filter((b: any) => !b.healthy);
    if (unhealthyBreakers.length > 0) {
      console.log('⚡ Circuit Breaker Status:');
      for (const breaker of unhealthyBreakers) {
        console.log(`  🔴 ${breaker.name}: ${breaker.state.toUpperCase()}`);
      }
      console.log();
    }

    // Print warnings and errors
    if (systemHealth.summary.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      for (const warning of systemHealth.summary.warnings) {
        console.log(`  • ${warning}`);
      }
      console.log();
    }

    if (systemHealth.summary.errors.length > 0) {
      console.log('❌ Errors:');
      for (const error of systemHealth.summary.errors) {
        console.log(`  • ${error}`);
      }
      console.log();
    }

    // Print summary
    console.log('📈 Summary:');
    console.log(
      `  Components: ${systemHealth.summary.healthy}/${systemHealth.summary.total} healthy`
    );
    console.log(`  Warnings: ${systemHealth.summary.warnings.length}`);
    console.log(`  Errors: ${systemHealth.summary.errors.length}`);

    // Exit with appropriate code
    process.exit(systemHealth.healthy ? 0 : 1);
  } catch (error) {
    console.error(
      '❌ Health check failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

/**
 * Simple health endpoint for monitoring systems
 */
export async function simpleHealthEndpoint(): Promise<{
  status: string;
  timestamp: string;
  uptime: number;
}> {
  const healthStatus = await globalHealthManager.getHealthStatus();
  return {
    status: healthStatus.status,
    timestamp: healthStatus.timestamp,
    uptime: healthStatus.uptime,
  };
}
