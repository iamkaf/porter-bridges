/**
 * @file Graceful Degradation - Handles partial system failures gracefully
 *
 * This module provides mechanisms to continue operation when parts of the system
 * fail, allowing the pipeline to produce partial results rather than failing completely.
 */

import { logger } from './logger';
import {
  EnhancedError,
  ErrorClassifier
} from './error-handling';

/**
 * Degradation levels for different types of failures
 */
export enum DegradationLevel {
  NONE = 'none',
  MINIMAL = 'minimal',
  PARTIAL = 'partial',
  SIGNIFICANT = 'significant',
  CRITICAL = 'critical'
}

/**
 * Degradation strategy for handling failures
 */
export enum DegradationStrategy {
  CONTINUE = 'continue',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  CACHED = 'cached',
  MINIMAL_RESULT = 'minimal_result',
  ABORT = 'abort'
}

/**
 * Degradation context for tracking system state
 */
export interface DegradationContext {
  level: DegradationLevel;
  strategy: DegradationStrategy;
  failures: string[];
  activeServices: string[];
  failedServices: string[];
  lastUpdate: string;
  metadata: Record<string, any>;
}

/**
 * Degradation result for operations
 */
export interface DegradationResult<T> {
  success: boolean;
  data?: T;
  degraded: boolean;
  degradationLevel: DegradationLevel;
  strategy: DegradationStrategy;
  warnings: string[];
  errors: EnhancedError[];
  fallbacksUsed: string[];
  metadata: Record<string, any>;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  name: string;
  healthy: boolean;
  lastCheckTime: string;
  consecutiveFailures: number;
  lastError?: EnhancedError;
  metadata: Record<string, any>;
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradationManager {
  private readonly serviceHealth: Map<string, ServiceHealth>;
  private readonly degradationContext: DegradationContext;
  private readonly fallbackStrategies: Map<string, () => Promise<any>>;
  private readonly minimumRequiredServices: Set<string>;

  constructor(minimumRequiredServices: string[] = []) {
    this.serviceHealth = new Map();
    this.fallbackStrategies = new Map();
    this.minimumRequiredServices = new Set(minimumRequiredServices);
    this.degradationContext = {
      level: DegradationLevel.NONE,
      strategy: DegradationStrategy.CONTINUE,
      failures: [],
      activeServices: [],
      failedServices: [],
      lastUpdate: new Date().toISOString(),
      metadata: {}
    };
  }

  /**
   * Register a service for health monitoring
   */
  registerService(name: string, metadata: Record<string, any> = {}): void {
    this.serviceHealth.set(name, {
      name,
      healthy: true,
      lastCheckTime: new Date().toISOString(),
      consecutiveFailures: 0,
      metadata
    });

    this.updateDegradationContext();
  }

  /**
   * Register a fallback strategy for a service
   */
  registerFallback(serviceName: string, fallbackFn: () => Promise<any>): void {
    this.fallbackStrategies.set(serviceName, fallbackFn);
  }

  /**
   * Report service failure
   */
  reportFailure(serviceName: string, error: unknown): void {
    const enhancedError = ErrorClassifier.classify(error, serviceName);
    const serviceHealth = this.serviceHealth.get(serviceName);

    if (serviceHealth) {
      serviceHealth.healthy = false;
      serviceHealth.lastCheckTime = new Date().toISOString();
      serviceHealth.consecutiveFailures++;
      serviceHealth.lastError = enhancedError;

      logger.warn(
        `⚠️ Service ${serviceName} reported failure`,
        {
          service: serviceName,
          consecutiveFailures: serviceHealth.consecutiveFailures,
          error: enhancedError.toLogFormat()
        }
      );
    } else {
      // Register the service if it doesn't exist
      this.registerService(serviceName);
      this.reportFailure(serviceName, error);
      return;
    }

    this.updateDegradationContext();
  }

  /**
   * Report service recovery
   */
  reportRecovery(serviceName: string): void {
    const serviceHealth = this.serviceHealth.get(serviceName);

    if (serviceHealth) {
      serviceHealth.healthy = true;
      serviceHealth.lastCheckTime = new Date().toISOString();
      serviceHealth.consecutiveFailures = 0;
      serviceHealth.lastError = undefined;

      logger.info(
        `✅ Service ${serviceName} recovered`,
        { service: serviceName }
      );
    }

    this.updateDegradationContext();
  }

  /**
   * Execute operation with graceful degradation
   */
  async executeWithDegradation<T>(
    operation: () => Promise<T>,
    serviceName: string,
    operationName: string,
    options: {
      allowDegradation?: boolean;
      fallbackData?: T;
      skipOnFailure?: boolean;
      required?: boolean;
    } = {}
  ): Promise<DegradationResult<T>> {
    const startTime = Date.now();
    const {
      allowDegradation = true,
      fallbackData,
      skipOnFailure = false,
      required = false
    } = options;

    try {
      const result = await operation();
      
      // Mark service as healthy if operation succeeded
      this.reportRecovery(serviceName);

      return {
        success: true,
        data: result,
        degraded: false,
        degradationLevel: DegradationLevel.NONE,
        strategy: DegradationStrategy.CONTINUE,
        warnings: [],
        errors: [],
        fallbacksUsed: [],
        metadata: {
          serviceName,
          operationName,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      const enhancedError = ErrorClassifier.classify(error, serviceName);
      
      // Report failure to the service
      this.reportFailure(serviceName, enhancedError);

      // If degradation is not allowed or service is required, fail fast
      if (!allowDegradation || required) {
        logger.error(
          `❌ Critical service ${serviceName} failed - no degradation allowed`,
          { service: serviceName, error: enhancedError.toLogFormat() }
        );

        return {
          success: false,
          degraded: false,
          degradationLevel: DegradationLevel.CRITICAL,
          strategy: DegradationStrategy.ABORT,
          warnings: [],
          errors: [enhancedError],
          fallbacksUsed: [],
          metadata: {
            serviceName,
            operationName,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            required,
            allowDegradation
          }
        };
      }

      // Try fallback strategies
      const fallbackResults = await this.tryFallbackStrategies(
        serviceName,
        operationName,
        fallbackData,
        skipOnFailure
      );

      return {
        success: fallbackResults.success,
        data: fallbackResults.data,
        degraded: true,
        degradationLevel: this.degradationContext.level,
        strategy: fallbackResults.strategy,
        warnings: fallbackResults.warnings,
        errors: [enhancedError, ...fallbackResults.errors],
        fallbacksUsed: fallbackResults.fallbacksUsed,
        metadata: {
          serviceName,
          operationName,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          originalError: enhancedError.toLogFormat(),
          degradationContext: this.degradationContext
        }
      };
    }
  }

  /**
   * Get current degradation context
   */
  getDegradationContext(): DegradationContext {
    return { ...this.degradationContext };
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceName?: string): ServiceHealth | Map<string, ServiceHealth> {
    if (serviceName) {
      return this.serviceHealth.get(serviceName) || {
        name: serviceName,
        healthy: false,
        lastCheckTime: new Date().toISOString(),
        consecutiveFailures: 0,
        metadata: {}
      };
    }
    return new Map(this.serviceHealth);
  }

  /**
   * Check if system can continue operation
   */
  canContinueOperation(): boolean {
    const activeServices = Array.from(this.serviceHealth.values())
      .filter(service => service.healthy)
      .map(service => service.name);

    // Check if minimum required services are available
    for (const requiredService of this.minimumRequiredServices) {
      if (!activeServices.includes(requiredService)) {
        return false;
      }
    }

    return this.degradationContext.level !== DegradationLevel.CRITICAL;
  }

  /**
   * Get system health summary
   */
  getSystemHealthSummary(): {
    healthy: boolean;
    degradationLevel: DegradationLevel;
    totalServices: number;
    healthyServices: number;
    failedServices: number;
    canContinue: boolean;
    recommendations: string[];
  } {
    const services = Array.from(this.serviceHealth.values());
    const healthyServices = services.filter(s => s.healthy);
    const failedServices = services.filter(s => !s.healthy);
    const canContinue = this.canContinueOperation();

    const recommendations: string[] = [];

    if (failedServices.length > 0) {
      recommendations.push(`${failedServices.length} service(s) need attention`);
    }

    if (this.degradationContext.level !== DegradationLevel.NONE) {
      recommendations.push('System is operating in degraded mode');
    }

    if (!canContinue) {
      recommendations.push('System cannot continue operation - critical services failed');
    }

    return {
      healthy: failedServices.length === 0,
      degradationLevel: this.degradationContext.level,
      totalServices: services.length,
      healthyServices: healthyServices.length,
      failedServices: failedServices.length,
      canContinue,
      recommendations
    };
  }

  // Private methods

  private async tryFallbackStrategies(
    serviceName: string,
    operationName: string,
    fallbackData?: any,
    skipOnFailure?: boolean
  ): Promise<{
    success: boolean;
    data?: any;
    strategy: DegradationStrategy;
    warnings: string[];
    errors: EnhancedError[];
    fallbacksUsed: string[];
  }> {
    const warnings: string[] = [];
    const errors: EnhancedError[] = [];
    const fallbacksUsed: string[] = [];

    // Try registered fallback
    const fallbackFn = this.fallbackStrategies.get(serviceName);
    if (fallbackFn) {
      try {
        const result = await fallbackFn();
        fallbacksUsed.push(`${serviceName}_fallback`);
        warnings.push(`Using fallback strategy for ${serviceName}`);
        
        logger.info(
          `🔄 Fallback successful for ${serviceName}`,
          { service: serviceName, operation: operationName }
        );

        return {
          success: true,
          data: result,
          strategy: DegradationStrategy.FALLBACK,
          warnings,
          errors,
          fallbacksUsed
        };
      } catch (fallbackError) {
        const enhancedError = ErrorClassifier.classify(fallbackError, `${serviceName}_fallback`);
        errors.push(enhancedError);
        warnings.push(`Fallback failed for ${serviceName}: ${enhancedError.message}`);
        
        logger.warn(
          `⚠️ Fallback failed for ${serviceName}`,
          { service: serviceName, error: enhancedError.toLogFormat() }
        );
      }
    }

    // Try using provided fallback data
    if (fallbackData !== undefined) {
      fallbacksUsed.push(`${serviceName}_fallback_data`);
      warnings.push(`Using fallback data for ${serviceName}`);
      
      logger.info(
        `📄 Using fallback data for ${serviceName}`,
        { service: serviceName, operation: operationName }
      );

      return {
        success: true,
        data: fallbackData,
        strategy: DegradationStrategy.FALLBACK,
        warnings,
        errors,
        fallbacksUsed
      };
    }

    // Try skipping if allowed
    if (skipOnFailure) {
      warnings.push(`Skipping operation for ${serviceName}`);
      
      logger.info(
        `⏭️ Skipping operation for ${serviceName}`,
        { service: serviceName, operation: operationName }
      );

      return {
        success: true,
        data: undefined,
        strategy: DegradationStrategy.SKIP,
        warnings,
        errors,
        fallbacksUsed
      };
    }

    // No fallback available - return failure
    return {
      success: false,
      strategy: DegradationStrategy.ABORT,
      warnings,
      errors,
      fallbacksUsed
    };
  }

  private updateDegradationContext(): void {
    const services = Array.from(this.serviceHealth.values());
    const healthyServices = services.filter(s => s.healthy);
    const failedServices = services.filter(s => !s.healthy);

    this.degradationContext.activeServices = healthyServices.map(s => s.name);
    this.degradationContext.failedServices = failedServices.map(s => s.name);
    this.degradationContext.lastUpdate = new Date().toISOString();

    // Update failures list
    this.degradationContext.failures = failedServices.map(s => 
      `${s.name}: ${s.lastError?.message || 'Unknown error'}`
    );

    // Calculate degradation level
    const totalServices = services.length;
    const healthyCount = healthyServices.length;
    const failureRate = totalServices > 0 ? (totalServices - healthyCount) / totalServices : 0;

    let newLevel: DegradationLevel;
    let newStrategy: DegradationStrategy;

    if (failureRate === 0) {
      newLevel = DegradationLevel.NONE;
      newStrategy = DegradationStrategy.CONTINUE;
    } else if (failureRate < 0.2) {
      newLevel = DegradationLevel.MINIMAL;
      newStrategy = DegradationStrategy.CONTINUE;
    } else if (failureRate < 0.5) {
      newLevel = DegradationLevel.PARTIAL;
      newStrategy = DegradationStrategy.FALLBACK;
    } else if (failureRate < 0.8) {
      newLevel = DegradationLevel.SIGNIFICANT;
      newStrategy = DegradationStrategy.MINIMAL_RESULT;
    } else {
      newLevel = DegradationLevel.CRITICAL;
      newStrategy = DegradationStrategy.ABORT;
    }

    // Check if critical services failed
    const criticalServicesFailed = Array.from(this.minimumRequiredServices).some(
      service => !this.degradationContext.activeServices.includes(service)
    );

    if (criticalServicesFailed) {
      newLevel = DegradationLevel.CRITICAL;
      newStrategy = DegradationStrategy.ABORT;
    }

    // Update context if changed
    if (newLevel !== this.degradationContext.level || newStrategy !== this.degradationContext.strategy) {
      const previousLevel = this.degradationContext.level;
      this.degradationContext.level = newLevel;
      this.degradationContext.strategy = newStrategy;

      logger.info(
        `📊 Degradation level changed: ${previousLevel} → ${newLevel}`,
        {
          level: newLevel,
          strategy: newStrategy,
          healthyServices: healthyCount,
          totalServices,
          failureRate: Math.round(failureRate * 100),
          activeServices: this.degradationContext.activeServices,
          failedServices: this.degradationContext.failedServices
        }
      );
    }
  }
}

/**
 * Global degradation manager instance
 */
export const globalDegradationManager = new GracefulDegradationManager([
  'github',
  'ai_processing'
]);

/**
 * Convenience function to execute with degradation
 */
export async function executeWithDegradation<T>(
  operation: () => Promise<T>,
  serviceName: string,
  operationName: string,
  options: {
    allowDegradation?: boolean;
    fallbackData?: T;
    skipOnFailure?: boolean;
    required?: boolean;
  } = {}
): Promise<DegradationResult<T>> {
  return globalDegradationManager.executeWithDegradation(
    operation,
    serviceName,
    operationName,
    options
  );
}