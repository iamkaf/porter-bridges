/**
 * @file Enhanced HTTP Client Utilities
 *
 * Centralized HTTP client configuration with advanced error handling,
 * circuit breaker patterns, and comprehensive retry mechanisms.
 */

import ky, { type KyInstance, type Options } from 'ky';
import {
  EnhancedError,
  RetryManager,
  DEFAULT_BACKOFF_CONFIG,
  type BackoffConfig
} from './error-handling';
import {
  CircuitBreaker,
  globalCircuitBreakerRegistry,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig
} from './circuit-breaker';

// Enhanced HTTP client configuration with circuit breaker support
const DEFAULT_OPTIONS: Options = {
  retry: {
    limit: 0, // We'll handle retries manually for better control
    methods: ['get', 'head'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    backoffLimit: 3000,
  },
  timeout: 30_000,
  headers: {
    'User-Agent': 'porter-bridges/1.0.0',
  },
};

/**
 * Enhanced HTTP client with circuit breaker and retry support
 */
export class EnhancedHttpClient {
  private readonly kyInstance: KyInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryManager: RetryManager;
  private readonly name: string;

  constructor(
    name: string,
    options: Partial<Options> = {},
    circuitBreakerConfig: Partial<CircuitBreakerConfig> = {},
    retryConfig: Partial<BackoffConfig> = {}
  ) {
    this.name = name;
    this.kyInstance = ky.create({
      ...DEFAULT_OPTIONS,
      ...options,
      headers: {
        ...DEFAULT_OPTIONS.headers,
        ...options.headers,
      },
    });
    
    this.circuitBreaker = globalCircuitBreakerRegistry.getOrCreate(
      `http_${name}`,
      { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...circuitBreakerConfig }
    );
    
    this.retryManager = new RetryManager(
      { ...DEFAULT_BACKOFF_CONFIG, ...retryConfig },
      `http_${name}`
    );
  }

  /**
   * Enhanced GET request with circuit breaker and retry
   */
  async get(url: string, options?: Options): Promise<any> {
    return this.executeWithProtection(
      async () => this.kyInstance.get(url, options),
      'GET',
      url
    );
  }

  /**
   * Enhanced POST request with circuit breaker and retry
   */
  async post(url: string, options?: Options): Promise<any> {
    return this.executeWithProtection(
      async () => this.kyInstance.post(url, options),
      'POST',
      url
    );
  }

  /**
   * Enhanced PUT request with circuit breaker and retry
   */
  async put(url: string, options?: Options): Promise<any> {
    return this.executeWithProtection(
      async () => this.kyInstance.put(url, options),
      'PUT',
      url
    );
  }

  /**
   * Enhanced DELETE request with circuit breaker and retry
   */
  async delete(url: string, options?: Options): Promise<any> {
    return this.executeWithProtection(
      async () => this.kyInstance.delete(url, options),
      'DELETE',
      url
    );
  }

  /**
   * Get JSON response with error handling
   */
  async getJson<T>(url: string, options?: Options): Promise<T> {
    const response = await this.get(url, options);
    try {
      return await response.json();
    } catch (error) {
      throw EnhancedError.validation(
        `Failed to parse JSON response from ${url}`,
        { url, error: error instanceof Error ? error.message : String(error) },
        this.name
      );
    }
  }

  /**
   * Get text response with error handling
   */
  async getText(url: string, options?: Options): Promise<string> {
    const response = await this.get(url, options);
    try {
      return await response.text();
    } catch (error) {
      throw EnhancedError.validation(
        `Failed to get text response from ${url}`,
        { url, error: error instanceof Error ? error.message : String(error) },
        this.name
      );
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }

  // Private methods

  private async executeWithProtection(
    operation: () => Promise<any>,
    method: string,
    url: string
  ): Promise<any> {
    const operationName = `${method} ${url}`;

    return this.retryManager.executeWithRetry(
      async () => {
        const result = await this.circuitBreaker.execute(
          operation,
          operationName
        );

        if (result.success) {
          return result.data;
        } else {
          throw result.error;
        }
      },
      operationName
    );
  }
}

/**
 * Create an enhanced HTTP client instance
 */
export function createEnhancedHttpClient(
  name: string,
  options: Partial<Options> = {},
  circuitBreakerConfig: Partial<CircuitBreakerConfig> = {},
  retryConfig: Partial<BackoffConfig> = {}
): EnhancedHttpClient {
  return new EnhancedHttpClient(name, options, circuitBreakerConfig, retryConfig);
}

/**
 * Legacy HTTP client factory (backwards compatibility)
 */
export function createHttpClient(options: Partial<Options> = {}): KyInstance {
  return ky.create({
    ...DEFAULT_OPTIONS,
    ...options,
    headers: {
      ...DEFAULT_OPTIONS.headers,
      ...options.headers,
    },
  });
}

/**
 * Default HTTP client instance (legacy)
 */
export const httpClient = createHttpClient();

/**
 * Enhanced GitHub API client with circuit breaker
 */
export const githubClient = createEnhancedHttpClient(
  'github',
  {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'porter-bridges/1.0.0',
    },
  },
  {
    failureThreshold: 5,
    resetTimeout: 120000, // 2 minutes
    expectedResponseTime: 10000, // 10 seconds
  }
);

/**
 * Enhanced Maven repository client with circuit breaker
 */
export const mavenClient = createEnhancedHttpClient(
  'maven',
  {
    headers: {
      Accept: 'application/xml, text/xml',
    },
  },
  {
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    expectedResponseTime: 15000, // 15 seconds
  }
);

/**
 * Enhanced RSS/XML feed client with circuit breaker
 */
export const rssClient = createEnhancedHttpClient(
  'rss',
  {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  },
  {
    failureThreshold: 3,
    resetTimeout: 60000, // 1 minute
    expectedResponseTime: 8000, // 8 seconds
  }
);

/**
 * Type-safe JSON response helper with enhanced error handling
 */
export async function fetchJson<T>(url: string, options?: Options): Promise<T> {
  try {
    return await httpClient.get(url, options).json<T>();
  } catch (error) {
    throw createEnhancedHttpError(error, url, 'fetchJson');
  }
}

/**
 * Type-safe text response helper with enhanced error handling
 */
export async function fetchText(
  url: string,
  options?: Options
): Promise<string> {
  try {
    return await httpClient.get(url, options).text();
  } catch (error) {
    throw createEnhancedHttpError(error, url, 'fetchText');
  }
}

/**
 * Enhanced HTTP error class
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Create HTTP error from ky response (legacy)
 */
export function createHttpError(error: any, url: string): HttpError {
  const status = error.response?.status || 0;
  const message = `HTTP ${status}: ${error.message}`;
  return new HttpError(message, status, url);
}

/**
 * Create enhanced HTTP error with proper categorization
 */
export function createEnhancedHttpError(
  error: any,
  url: string,
  source: string = 'http'
): EnhancedError {
  const status = error.response?.status || 0;
  const message = error.message || String(error);

  // Categorize based on HTTP status code
  if (status >= 500) {
    return EnhancedError.externalApi(
      `Server error (${status}): ${message}`,
      { url, status, originalError: error },
      source
    );
  } else if (status === 429) {
    return EnhancedError.rateLimit(
      `Rate limit exceeded: ${message}`,
      { url, status, originalError: error },
      source
    );
  } else if (status === 401 || status === 403) {
    return EnhancedError.authentication(
      `Authentication failed (${status}): ${message}`,
      { url, status, originalError: error },
      source
    );
  } else if (status >= 400 && status < 500) {
    return EnhancedError.validation(
      `Client error (${status}): ${message}`,
      { url, status, originalError: error },
      source
    );
  } else if (message.toLowerCase().includes('timeout')) {
    return EnhancedError.timeout(
      `Request timeout: ${message}`,
      { url, status, originalError: error },
      source
    );
  } else if (message.toLowerCase().includes('network')) {
    return EnhancedError.network(
      `Network error: ${message}`,
      { url, status, originalError: error },
      source
    );
  } else {
    return EnhancedError.externalApi(
      `HTTP error: ${message}`,
      { url, status, originalError: error },
      source
    );
  }
}

/**
 * HTTP client health check
 */
export async function createHttpHealthCheck(
  name: string,
  url: string,
  client: EnhancedHttpClient
): Promise<{
  healthy: boolean;
  component: string;
  message: string;
  timestamp: string;
  responseTime: number;
  details?: Record<string, any>;
}> {
  const startTime = Date.now();
  const component = `http_${name}`;

  try {
    await client.get(url);
    const responseTime = Date.now() - startTime;

    return {
      healthy: true,
      component,
      message: `HTTP client ${name} is healthy`,
      timestamp: new Date().toISOString(),
      responseTime,
      details: {
        url,
        circuitBreakerStatus: client.getCircuitBreakerStatus()
      }
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const enhancedError = error instanceof EnhancedError 
      ? error 
      : createEnhancedHttpError(error, url, component);

    return {
      healthy: false,
      component,
      message: `HTTP client ${name} is unhealthy: ${enhancedError.message}`,
      timestamp: new Date().toISOString(),
      responseTime,
      details: {
        url,
        error: enhancedError.toLogFormat(),
        circuitBreakerStatus: client.getCircuitBreakerStatus()
      }
    };
  }
}
