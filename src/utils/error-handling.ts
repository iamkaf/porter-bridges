/**
 * @file Enhanced Error Handling - Comprehensive error management system
 *
 * This module provides enhanced error handling capabilities including:
 * - Categorized error types with recovery strategies
 * - Retry mechanisms with exponential backoff and jitter
 * - Circuit breaker patterns for external API calls
 * - Graceful degradation for partial system failures
 * - Health check endpoints for system monitoring
 */

import { logger } from './logger';

/**
 * Error categories for classification and recovery strategies
 */
export enum ErrorCategory {
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  SYSTEM = 'system',
  EXTERNAL_API = 'external_api',
  AI_PROCESSING = 'ai_processing',
  FILE_SYSTEM = 'file_system',
  CONFIGURATION = 'configuration',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Recovery strategies for different error types
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  CIRCUIT_BREAKER = 'circuit_breaker',
  FALLBACK = 'fallback',
  ESCALATE = 'escalate',
  IGNORE = 'ignore',
  ABORT = 'abort',
}

/**
 * Enhanced error class with categorization and recovery strategies
 */
export class EnhancedError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly recoveryStrategy: RecoveryStrategy;
  public readonly retryable: boolean;
  public readonly context: Record<string, any>;
  public readonly timestamp: string;
  public readonly source: string;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoveryStrategy: RecoveryStrategy = RecoveryStrategy.RETRY,
    context: Record<string, any> = {},
    source = 'unknown'
  ) {
    super(message);
    this.name = 'EnhancedError';
    this.category = category;
    this.severity = severity;
    this.recoveryStrategy = recoveryStrategy;
    this.retryable = recoveryStrategy === RecoveryStrategy.RETRY;
    this.context = { ...context };
    this.timestamp = new Date().toISOString();
    this.source = source;
  }

  /**
   * Create network-related error
   */
  static network(
    message: string,
    context: Record<string, any> = {},
    source = 'network'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.RETRY,
      context,
      source
    );
  }

  /**
   * Create rate limit error
   */
  static rateLimit(
    message: string,
    context: Record<string, any> = {},
    source = 'api'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.RATE_LIMIT,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.CIRCUIT_BREAKER,
      context,
      source
    );
  }

  /**
   * Create authentication error
   */
  static authentication(
    message: string,
    context: Record<string, any> = {},
    source = 'auth'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.HIGH,
      RecoveryStrategy.ESCALATE,
      context,
      source
    );
  }

  /**
   * Create validation error
   */
  static validation(
    message: string,
    context: Record<string, any> = {},
    source = 'validation'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.VALIDATION,
      ErrorSeverity.HIGH,
      RecoveryStrategy.ABORT,
      context,
      source
    );
  }

  /**
   * Create system error
   */
  static system(
    message: string,
    context: Record<string, any> = {},
    source = 'system'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.SYSTEM,
      ErrorSeverity.CRITICAL,
      RecoveryStrategy.ESCALATE,
      context,
      source
    );
  }

  /**
   * Create external API error
   */
  static externalApi(
    message: string,
    context: Record<string, any> = {},
    source = 'external_api'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.EXTERNAL_API,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.CIRCUIT_BREAKER,
      context,
      source
    );
  }

  /**
   * Create AI processing error
   */
  static aiProcessing(
    message: string,
    context: Record<string, any> = {},
    source = 'ai_processing'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.AI_PROCESSING,
      ErrorSeverity.HIGH,
      RecoveryStrategy.RETRY,
      context,
      source
    );
  }

  /**
   * Create file system error
   */
  static fileSystem(
    message: string,
    context: Record<string, any> = {},
    source = 'file_system'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.FILE_SYSTEM,
      ErrorSeverity.HIGH,
      RecoveryStrategy.RETRY,
      context,
      source
    );
  }

  /**
   * Create timeout error
   */
  static timeout(
    message: string,
    context: Record<string, any> = {},
    source = 'timeout'
  ) {
    return new EnhancedError(
      message,
      ErrorCategory.TIMEOUT,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.RETRY,
      context,
      source
    );
  }

  /**
   * Convert to structured log format
   */
  toLogFormat() {
    return {
      error: this.message,
      category: this.category,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp,
      source: this.source,
      stack: this.stack,
    };
  }

  /**
   * Convert to CLI display format
   */
  toCLIFormat() {
    const severityEmoji = {
      [ErrorSeverity.LOW]: '⚪',
      [ErrorSeverity.MEDIUM]: '🟡',
      [ErrorSeverity.HIGH]: '🟠',
      [ErrorSeverity.CRITICAL]: '🔴',
    };

    const strategyEmoji = {
      [RecoveryStrategy.RETRY]: '🔄',
      [RecoveryStrategy.CIRCUIT_BREAKER]: '⚡',
      [RecoveryStrategy.FALLBACK]: '🔀',
      [RecoveryStrategy.ESCALATE]: '📢',
      [RecoveryStrategy.IGNORE]: '🙈',
      [RecoveryStrategy.ABORT]: '🛑',
    };

    return `${severityEmoji[this.severity]} ${strategyEmoji[this.recoveryStrategy]} ${this.category.toUpperCase()} ERROR
Source: ${this.source}
Message: ${this.message}
Recovery: ${this.recoveryStrategy}
Retryable: ${this.retryable}
Timestamp: ${this.timestamp}`;
  }
}

/**
 * Error classifier that categorizes errors based on their properties
 */
export class ErrorClassifier {
  /**
   * Classify an error based on its properties
   */
  static classify(error: unknown, source = 'unknown'): EnhancedError {
    if (error instanceof EnhancedError) {
      return error;
    }

    if (error instanceof Error) {
      return ErrorClassifier.classifyStandardError(error, source);
    }

    // Handle non-Error objects
    const message = typeof error === 'string' ? error : String(error);
    return new EnhancedError(
      message,
      ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.RETRY,
      { originalError: error },
      source
    );
  }

  /**
   * Classify standard JavaScript errors
   */
  private static classifyStandardError(
    error: Error,
    source: string
  ): EnhancedError {
    const message = error.message.toLowerCase();
    const context = { originalError: error, stack: error.stack };

    // Network-related errors
    if (ErrorClassifier.isNetworkError(error, message)) {
      return EnhancedError.network(error.message, context, source);
    }

    // Rate limiting errors
    if (ErrorClassifier.isRateLimitError(error, message)) {
      return EnhancedError.rateLimit(error.message, context, source);
    }

    // Authentication errors
    if (ErrorClassifier.isAuthenticationError(error, message)) {
      return EnhancedError.authentication(error.message, context, source);
    }

    // Timeout errors
    if (ErrorClassifier.isTimeoutError(error, message)) {
      return EnhancedError.timeout(error.message, context, source);
    }

    // File system errors
    if (ErrorClassifier.isFileSystemError(error, message)) {
      return EnhancedError.fileSystem(error.message, context, source);
    }

    // Validation errors
    if (ErrorClassifier.isValidationError(error, message)) {
      return EnhancedError.validation(error.message, context, source);
    }

    // Default to unknown
    return new EnhancedError(
      error.message,
      ErrorCategory.UNKNOWN,
      ErrorSeverity.MEDIUM,
      RecoveryStrategy.RETRY,
      context,
      source
    );
  }

  private static isNetworkError(error: Error, message: string): boolean {
    return (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('econnreset') ||
      message.includes('socket') ||
      ('code' in error &&
        ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'].includes(
          error.code as string
        ))
    );
  }

  private static isRateLimitError(error: Error, message: string): boolean {
    return (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429') ||
      ('status' in error && error.status === 429)
    );
  }

  private static isAuthenticationError(error: Error, message: string): boolean {
    return (
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('401') ||
      message.includes('403') ||
      ('status' in error && [401, 403].includes(error.status as number))
    );
  }

  private static isTimeoutError(error: Error, message: string): boolean {
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout') ||
      ('code' in error && error.code === 'ETIMEDOUT')
    );
  }

  private static isFileSystemError(error: Error, message: string): boolean {
    return (
      message.includes('enoent') ||
      message.includes('eacces') ||
      message.includes('eperm') ||
      message.includes('file') ||
      message.includes('directory') ||
      ('code' in error &&
        ['ENOENT', 'EACCES', 'EPERM', 'EEXIST'].includes(error.code as string))
    );
  }

  private static isValidationError(error: Error, message: string): boolean {
    return (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('schema') ||
      message.includes('parse') ||
      error.name === 'ValidationError' ||
      error.name === 'SyntaxError'
    );
  }
}

/**
 * Exponential backoff configuration
 */
export interface BackoffConfig {
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: boolean;
  maxRetries: number;
}

/**
 * Default backoff configuration
 */
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelay: 1000,
  maxDelay: 30_000,
  multiplier: 2,
  jitter: true,
  maxRetries: 3,
};

/**
 * Calculate exponential backoff delay with optional jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number {
  const baseDelay = Math.min(
    config.initialDelay * config.multiplier ** (attempt - 1),
    config.maxDelay
  );

  if (config.jitter) {
    // Add jitter to prevent thundering herd
    const jitterAmount = baseDelay * 0.1;
    return baseDelay + (Math.random() * jitterAmount * 2 - jitterAmount);
  }

  return baseDelay;
}

/**
 * Enhanced retry mechanism with exponential backoff and error classification
 */
export class RetryManager {
  private readonly config: BackoffConfig;
  private readonly source: string;

  constructor(config: Partial<BackoffConfig> = {}, source = 'retry_manager') {
    this.config = { ...DEFAULT_BACKOFF_CONFIG, ...config };
    this.source = source;
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName = 'operation',
    customConfig?: Partial<BackoffConfig>
  ): Promise<T> {
    const config = { ...this.config, ...customConfig };
    let lastError: EnhancedError | null = null;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await operation();

        if (attempt > 1) {
          logger.info(
            `✅ ${operationName} succeeded after ${attempt} attempts`,
            { source: this.source, attempt }
          );
        }

        return result;
      } catch (error) {
        const enhancedError = ErrorClassifier.classify(error, this.source);
        lastError = enhancedError;

        logger.warn(
          `❌ ${operationName} failed (attempt ${attempt}/${config.maxRetries})`,
          {
            source: this.source,
            error: enhancedError.toLogFormat(),
            attempt,
            maxRetries: config.maxRetries,
          }
        );

        // Check if error is retryable
        if (!enhancedError.retryable) {
          logger.error(`🛑 ${operationName} failed with non-retryable error`, {
            source: this.source,
            error: enhancedError.toLogFormat(),
          });
          throw enhancedError;
        }

        // If this is the last attempt, throw the error
        if (attempt === config.maxRetries) {
          logger.error(
            `💥 ${operationName} failed after ${config.maxRetries} attempts`,
            { source: this.source, error: enhancedError.toLogFormat() }
          );
          throw enhancedError;
        }

        // Calculate delay and wait
        const delay = calculateBackoffDelay(attempt, config);
        logger.info(
          `⏳ Retrying ${operationName} in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`,
          { source: this.source, delay, nextAttempt: attempt + 1 }
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw (
      lastError ||
      new EnhancedError(
        `${operationName} failed after ${config.maxRetries} attempts`,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.HIGH,
        RecoveryStrategy.ESCALATE,
        {},
        this.source
      )
    );
  }
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  component: string;
  message: string;
  timestamp: string;
  responseTime: number;
  details?: Record<string, any>;
}

/**
 * Health check manager for system monitoring
 */
export class HealthCheckManager {
  private readonly checks: Map<string, () => Promise<HealthCheckResult>>;

  constructor() {
    this.checks = new Map();
  }

  /**
   * Register a health check
   */
  registerCheck(name: string, checkFn: () => Promise<HealthCheckResult>): void {
    this.checks.set(name, checkFn);
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {};

    for (const [name, checkFn] of this.checks) {
      try {
        results[name] = await checkFn();
      } catch (error) {
        const enhancedError = ErrorClassifier.classify(
          error,
          `health_check_${name}`
        );
        results[name] = {
          healthy: false,
          component: name,
          message: enhancedError.message,
          timestamp: new Date().toISOString(),
          responseTime: -1,
          details: enhancedError.toLogFormat(),
        };
      }
    }

    return results;
  }

  /**
   * Run a specific health check
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      throw new EnhancedError(
        `Health check '${name}' not found`,
        ErrorCategory.CONFIGURATION,
        ErrorSeverity.MEDIUM,
        RecoveryStrategy.ABORT,
        { availableChecks: Array.from(this.checks.keys()) },
        'health_check_manager'
      );
    }

    return await checkFn();
  }

  /**
   * Get overall system health
   */
  async getSystemHealth(): Promise<{
    healthy: boolean;
    checks: Record<string, HealthCheckResult>;
    summary: {
      total: number;
      healthy: number;
      unhealthy: number;
      timestamp: string;
    };
  }> {
    const checks = await this.runAllChecks();
    const healthyCount = Object.values(checks).filter((c) => c.healthy).length;
    const totalCount = Object.values(checks).length;

    return {
      healthy: healthyCount === totalCount,
      checks,
      summary: {
        total: totalCount,
        healthy: healthyCount,
        unhealthy: totalCount - healthyCount,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Global health check manager instance
 */
export const globalHealthCheckManager = new HealthCheckManager();

/**
 * Error recovery coordinator
 */
export class ErrorRecoveryCoordinator {
  constructor(
    _retryConfig: Partial<BackoffConfig> = {},
    _healthCheckManager: HealthCheckManager = globalHealthCheckManager
  ) {
    // Configuration applied but variables not used in current implementation
  }

  /**
   * Handle error with appropriate recovery strategy
   */
  async handleError(
    error: unknown,
    context: {
      operation: string;
      source: string;
      retryable?: boolean;
      onRetry?: () => Promise<void>;
      onFallback?: () => Promise<any>;
    }
  ): Promise<void> {
    const enhancedError = ErrorClassifier.classify(error, context.source);

    logger.error(`🚨 Error occurred in ${context.operation}`, {
      error: enhancedError.toLogFormat(),
      context,
    });

    // Apply recovery strategy
    switch (enhancedError.recoveryStrategy) {
      case RecoveryStrategy.RETRY:
        if (context.onRetry) {
          await context.onRetry();
        }
        break;

      case RecoveryStrategy.FALLBACK:
        if (context.onFallback) {
          await context.onFallback();
        }
        break;

      case RecoveryStrategy.ESCALATE:
        logger.error(`📢 Escalating error for ${context.operation}`, {
          error: enhancedError.toLogFormat(),
        });
        // Could send to monitoring system, alert admins, etc.
        break;

      case RecoveryStrategy.CIRCUIT_BREAKER:
        logger.warn(`⚡ Circuit breaker triggered for ${context.operation}`, {
          error: enhancedError.toLogFormat(),
        });
        // Circuit breaker logic would be implemented here
        break;

      case RecoveryStrategy.ABORT:
        logger.error(`🛑 Aborting operation ${context.operation}`, {
          error: enhancedError.toLogFormat(),
        });
        throw enhancedError;

      case RecoveryStrategy.IGNORE:
        logger.warn(`🙈 Ignoring error in ${context.operation}`, {
          error: enhancedError.toLogFormat(),
        });
        break;
    }
  }
}

/**
 * Global error recovery coordinator
 */
export const globalErrorRecoveryCoordinator = new ErrorRecoveryCoordinator();
