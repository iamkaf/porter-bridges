/**
 * @file Circuit Breaker - Prevents cascading failures in external API calls
 *
 * This module implements the circuit breaker pattern to prevent system overload
 * when external services are failing or slow. It provides three states:
 * - CLOSED: Normal operation, requests are allowed
 * - OPEN: Circuit is open, requests are rejected immediately
 * - HALF_OPEN: Testing if service has recovered
 */

import { logger } from './logger';
import { EnhancedError } from './error-handling';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedResponseTime: number;
  slowCallThreshold: number;
  slowCallDurationThreshold: number;
  minimumNumberOfCalls: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringPeriod: 10000, // 10 seconds
  expectedResponseTime: 5000, // 5 seconds
  slowCallThreshold: 3,
  slowCallDurationThreshold: 10000, // 10 seconds
  minimumNumberOfCalls: 5
};

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  slowCalls: number;
  averageResponseTime: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  consecutiveFailures: number;
  windowStart: number;
}

/**
 * Circuit breaker call result
 */
export interface CircuitBreakerResult<T> {
  success: boolean;
  data?: T;
  error?: EnhancedError;
  duration: number;
  timestamp: number;
  state: CircuitBreakerState;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private readonly name: string;
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private metrics: CircuitBreakerMetrics;
  private lastFailureTime: number;
  private resetTimeoutId: NodeJS.Timeout | null;

  constructor(
    name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.name = name;
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.state = CircuitBreakerState.CLOSED;
    this.lastFailureTime = 0;
    this.resetTimeoutId = null;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<CircuitBreakerResult<T>> {
    const startTime = Date.now();

    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      const timeSinceLastFailure = startTime - this.lastFailureTime;
      
      if (timeSinceLastFailure < this.config.resetTimeout) {
        // Circuit is still open, reject immediately
        const error = EnhancedError.externalApi(
          `Circuit breaker is OPEN for ${this.name}. Rejecting ${operationName} immediately.`,
          {
            circuitName: this.name,
            state: this.state,
            timeSinceLastFailure,
            resetTimeout: this.config.resetTimeout,
            metrics: this.metrics
          },
          `circuit_breaker_${this.name}`
        );

        logger.warn(
          `⚡ Circuit breaker OPEN - rejecting ${operationName}`,
          {
            circuitName: this.name,
            operationName,
            timeSinceLastFailure,
            resetTimeout: this.config.resetTimeout
          }
        );

        return {
          success: false,
          error,
          duration: Date.now() - startTime,
          timestamp: startTime,
          state: this.state
        };
      } else {
        // Time to try half-open
        this.transitionToHalfOpen();
      }
    }

    // Execute the operation
    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      // Record success
      this.recordSuccess(duration);

      // If we were in half-open state, transition to closed
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.transitionToClosed();
      }

      return {
        success: true,
        data: result,
        duration,
        timestamp: startTime,
        state: this.state
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const enhancedError = this.handleFailure(error, operationName, duration);

      return {
        success: false,
        error: enhancedError,
        duration,
        timestamp: startTime,
        state: this.state
      };
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): {
    name: string;
    state: CircuitBreakerState;
    metrics: CircuitBreakerMetrics;
    config: CircuitBreakerConfig;
    healthy: boolean;
  } {
    return {
      name: this.name,
      state: this.state,
      metrics: this.getMetrics(),
      config: this.config,
      healthy: this.state === CircuitBreakerState.CLOSED
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.metrics = this.initializeMetrics();
    this.lastFailureTime = 0;
    
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }

    logger.info(`🔧 Circuit breaker ${this.name} manually reset`, {
      circuitName: this.name,
      state: this.state
    });
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.transitionToOpen();
    logger.warn(`⚡ Circuit breaker ${this.name} forced open`, {
      circuitName: this.name,
      state: this.state
    });
  }

  // Private methods

  private initializeMetrics(): CircuitBreakerMetrics {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      slowCalls: 0,
      averageResponseTime: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      consecutiveFailures: 0,
      windowStart: Date.now()
    };
  }

  private recordSuccess(duration: number): void {
    this.metrics.totalCalls++;
    this.metrics.successfulCalls++;
    this.metrics.lastSuccessTime = Date.now();
    this.metrics.consecutiveFailures = 0;

    // Check if call was slow
    if (duration > this.config.slowCallDurationThreshold) {
      this.metrics.slowCalls++;
    }

    // Update average response time
    this.updateAverageResponseTime(duration);

    // Reset window if needed
    this.resetWindowIfNeeded();

    logger.debug(`✅ Circuit breaker ${this.name} recorded success`, {
      circuitName: this.name,
      duration,
      totalCalls: this.metrics.totalCalls,
      successfulCalls: this.metrics.successfulCalls
    });
  }

  private handleFailure(error: unknown, operationName: string, duration: number): EnhancedError {
    const enhancedError = error instanceof EnhancedError
      ? error
      : EnhancedError.externalApi(
          error instanceof Error ? error.message : String(error),
          {
            circuitName: this.name,
            operationName,
            duration,
            originalError: error
          },
          `circuit_breaker_${this.name}`
        );

    this.metrics.totalCalls++;
    this.metrics.failedCalls++;
    this.metrics.lastFailureTime = Date.now();
    this.metrics.consecutiveFailures++;

    // Update average response time
    this.updateAverageResponseTime(duration);

    // Reset window if needed
    this.resetWindowIfNeeded();

    logger.error(`❌ Circuit breaker ${this.name} recorded failure`, {
      circuitName: this.name,
      error: enhancedError.toLogFormat(),
      duration,
      consecutiveFailures: this.metrics.consecutiveFailures,
      failureThreshold: this.config.failureThreshold
    });

    // Check if we should open the circuit
    if (this.shouldOpen()) {
      this.transitionToOpen();
    }

    return enhancedError;
  }

  private shouldOpen(): boolean {
    // Need minimum number of calls
    if (this.metrics.totalCalls < this.config.minimumNumberOfCalls) {
      return false;
    }

    // Check failure threshold
    if (this.metrics.consecutiveFailures >= this.config.failureThreshold) {
      return true;
    }

    // Check slow call threshold
    if (this.metrics.slowCalls >= this.config.slowCallThreshold) {
      return true;
    }

    // Check failure rate
    const failureRate = this.metrics.failedCalls / this.metrics.totalCalls;
    return failureRate >= 0.5; // 50% failure rate
  }

  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.lastFailureTime = Date.now();

    logger.warn(`⚡ Circuit breaker ${this.name} transitioned to OPEN`, {
      circuitName: this.name,
      state: this.state,
      metrics: this.metrics,
      resetTimeout: this.config.resetTimeout
    });

    // Schedule transition to half-open
    this.scheduleHalfOpenTransition();
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }

    logger.info(`🔄 Circuit breaker ${this.name} transitioned to HALF_OPEN`, {
      circuitName: this.name,
      state: this.state
    });
  }

  private transitionToClosed(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.metrics = this.initializeMetrics();

    logger.info(`✅ Circuit breaker ${this.name} transitioned to CLOSED`, {
      circuitName: this.name,
      state: this.state
    });
  }

  private scheduleHalfOpenTransition(): void {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    this.resetTimeoutId = setTimeout(() => {
      if (this.state === CircuitBreakerState.OPEN) {
        this.transitionToHalfOpen();
      }
    }, this.config.resetTimeout);
  }

  private updateAverageResponseTime(duration: number): void {
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalCalls - 1);
    this.metrics.averageResponseTime = (totalTime + duration) / this.metrics.totalCalls;
  }

  private resetWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.metrics.windowStart > this.config.monitoringPeriod) {
      // Reset metrics for new window
      this.metrics = {
        ...this.initializeMetrics(),
        windowStart: now
      };
    }
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private readonly breakers: Map<string, CircuitBreaker>;

  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   */
  getOrCreate(
    name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      return this.breakers.delete(name);
    }
    return false;
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get status of all circuit breakers
   */
  getAllStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get overall health of all circuit breakers
   */
  getOverallHealth(): {
    healthy: boolean;
    totalBreakers: number;
    healthyBreakers: number;
    unhealthyBreakers: number;
    breakerDetails: Record<string, any>;
  } {
    const breakerDetails = this.getAllStatus();
    const totalBreakers = this.breakers.size;
    const healthyBreakers = Object.values(breakerDetails).filter(
      (status: any) => status.healthy
    ).length;

    return {
      healthy: healthyBreakers === totalBreakers,
      totalBreakers,
      healthyBreakers,
      unhealthyBreakers: totalBreakers - healthyBreakers,
      breakerDetails
    };
  }
}

/**
 * Global circuit breaker registry
 */
export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Convenience function to execute operation with circuit breaker
 */
export async function executeWithCircuitBreaker<T>(
  operation: () => Promise<T>,
  circuitName: string,
  operationName: string = 'operation',
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  const breaker = globalCircuitBreakerRegistry.getOrCreate(circuitName, config);
  const result = await breaker.execute(operation, operationName);
  
  if (result.success) {
    return result.data!;
  } else {
    throw result.error!;
  }
}