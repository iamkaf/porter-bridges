/**
 * @file Enhanced HTTP Client with Caching - High-performance HTTP client with intelligent caching
 *
 * This module provides an enhanced HTTP client with integrated caching,
 * parallel request handling, and response compression for optimal performance.
 */

import { request } from 'undici';
import { type CacheHitInfo, httpCache } from './cache/http-cache';
import {
  type CircuitBreaker,
  type CircuitBreakerConfig,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  globalCircuitBreakerRegistry,
} from './circuit-breaker';
import {
  type BackoffConfig,
  DEFAULT_BACKOFF_CONFIG,
  EnhancedError,
  RetryManager,
} from './error-handling';
import { logger } from './logger';
import { compressionManager } from './performance/compression-manager';
import { performanceMonitor } from './performance/performance-monitor';

export interface CachedHttpConfig {
  name: string;
  timeout: number;
  maxRedirects: number;
  userAgent: string;
  enableCache: boolean;
  enableCompression: boolean;
  enableGzip: boolean;
  maxRetries: number;
  retryDelay: number;
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  retryConfig?: Partial<BackoffConfig>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
  cache?: boolean;
  compress?: boolean;
  followRedirects?: boolean;
  maxRedirects?: number;
}

export interface CachedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  cached: boolean;
  cacheHitInfo?: CacheHitInfo;
  responseTime: number;
  compressionRatio?: number;
  fromCache: boolean;
}

export class CachedHttpClient {
  private config: CachedHttpConfig;
  private circuitBreaker: CircuitBreaker;
  private retryManager: RetryManager;
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    compressionSavings: 0,
    totalResponseTime: 0,
    errorCount: 0,
  };

  constructor(config: Partial<CachedHttpConfig> = {}) {
    this.config = {
      name: config.name || 'default',
      timeout: config.timeout || 30_000,
      maxRedirects: config.maxRedirects || 5,
      userAgent: config.userAgent || 'porter-bridges/1.0.0',
      enableCache: config.enableCache !== false,
      enableCompression: config.enableCompression !== false,
      enableGzip: config.enableGzip !== false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      circuitBreakerConfig: config.circuitBreakerConfig,
      retryConfig: config.retryConfig,
    };

    this.circuitBreaker = globalCircuitBreakerRegistry.getOrCreate(
      `cached_http_${this.config.name}`,
      { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...this.config.circuitBreakerConfig }
    );

    this.retryManager = new RetryManager(
      { ...DEFAULT_BACKOFF_CONFIG, ...this.config.retryConfig },
      `cached_http_${this.config.name}`
    );

    logger.info('🌐 Cached HTTP client initialized', {
      name: this.config.name,
      timeout: this.config.timeout,
      enableCache: this.config.enableCache,
      enableCompression: this.config.enableCompression,
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Make HTTP request with caching and compression support
   */
  async request(
    url: string,
    options: RequestOptions = {}
  ): Promise<CachedResponse> {
    const startTime = Date.now();
    const method = options.method || 'GET';
    const operationName = `${method.toLowerCase()}-${this.config.name}`;

    performanceMonitor.startMonitoring(operationName, {
      url,
      method,
      cache: this.config.enableCache && options.cache !== false,
      compress: this.config.enableCompression && options.compress !== false,
    });

    this.stats.totalRequests++;

    try {
      // Check cache first for GET requests
      if (
        method === 'GET' &&
        this.config.enableCache &&
        options.cache !== false
      ) {
        const cacheResult = await httpCache.get(url, method);

        if (cacheResult.entry) {
          this.stats.cacheHits++;

          const response: CachedResponse = {
            status: cacheResult.entry.status,
            statusText: this.getStatusText(cacheResult.entry.status),
            headers: cacheResult.entry.headers,
            body: cacheResult.entry.body,
            cached: true,
            cacheHitInfo: cacheResult.hitInfo,
            responseTime: cacheResult.entry.responseTime,
            fromCache: true,
          };

          performanceMonitor.endMonitoring(operationName, 'http-cached', {
            cached: true,
            responseTime: cacheResult.entry.responseTime,
            stale: cacheResult.hitInfo.stale,
          });

          logger.debug('🌐 Cache hit', {
            url,
            method,
            age: cacheResult.hitInfo.age,
            stale: cacheResult.hitInfo.stale,
            size: cacheResult.entry.body.length,
          });

          return response;
        }
        this.stats.cacheMisses++;
      }

      // Make actual HTTP request
      const response = await this.makeRequest(url, options, startTime);

      // Cache successful GET responses
      if (
        method === 'GET' &&
        this.config.enableCache &&
        options.cache !== false &&
        response.status >= 200 &&
        response.status < 300
      ) {
        await httpCache.set(
          url,
          method,
          response.status,
          response.headers,
          response.body,
          response.responseTime
        );
      }

      performanceMonitor.endMonitoring(operationName, 'http-request', {
        status: response.status,
        responseTime: response.responseTime,
        bodySize: response.body.length,
        fromCache: false,
      });

      return response;
    } catch (error) {
      this.stats.errorCount++;

      performanceMonitor.endMonitoring(operationName, 'http-request', {
        error: true,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * GET request with caching
   */
  async get(
    url: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<CachedResponse> {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post(
    url: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<CachedResponse> {
    return this.request(url, { ...options, method: 'POST' });
  }

  /**
   * PUT request
   */
  async put(
    url: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<CachedResponse> {
    return this.request(url, { ...options, method: 'PUT' });
  }

  /**
   * DELETE request
   */
  async delete(
    url: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<CachedResponse> {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  /**
   * HEAD request
   */
  async head(
    url: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<CachedResponse> {
    return this.request(url, { ...options, method: 'HEAD' });
  }

  /**
   * Get JSON response
   */
  async getJson<T>(
    url: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<T> {
    const response = await this.get(url, options);

    try {
      return JSON.parse(response.body.toString('utf-8'));
    } catch (error) {
      throw EnhancedError.validation(
        `Failed to parse JSON response from ${url}`,
        {
          url,
          status: response.status,
          error: error instanceof Error ? error.message : String(error),
        },
        this.config.name
      );
    }
  }

  /**
   * Get text response
   */
  async getText(
    url: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<string> {
    const response = await this.get(url, options);
    return response.body.toString('utf-8');
  }

  /**
   * Download file with streaming
   */
  async downloadFile(
    url: string,
    filePath: string,
    options: Omit<RequestOptions, 'method'> = {}
  ): Promise<void> {
    const response = await this.get(url, { ...options, compress: false });

    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, response.body);

    logger.info('📥 File downloaded', {
      url,
      filePath,
      size: response.body.length,
      cached: response.fromCache,
    });
  }

  /**
   * Clear cache for specific URL or all URLs
   */
  clearCache(url?: string): void {
    if (url) {
      httpCache.invalidate(url);
    } else {
      httpCache.clear();
    }
  }

  /**
   * Get client statistics
   */
  getStats(): {
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    compressionSavings: number;
    averageResponseTime: number;
    errorCount: number;
    errorRate: number;
  } {
    const cacheHitRate =
      this.stats.totalRequests > 0
        ? (this.stats.cacheHits / this.stats.totalRequests) * 100
        : 0;

    const averageResponseTime =
      this.stats.totalRequests > 0
        ? this.stats.totalResponseTime / this.stats.totalRequests
        : 0;

    const errorRate =
      this.stats.totalRequests > 0
        ? (this.stats.errorCount / this.stats.totalRequests) * 100
        : 0;

    return {
      totalRequests: this.stats.totalRequests,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      cacheHitRate,
      compressionSavings: this.stats.compressionSavings,
      averageResponseTime,
      errorCount: this.stats.errorCount,
      errorRate,
    };
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

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      compressionSavings: 0,
      totalResponseTime: 0,
      errorCount: 0,
    };
  }

  // Private methods

  private async makeRequest(
    url: string,
    options: RequestOptions,
    startTime: number
  ): Promise<CachedResponse> {
    const operationName = `${options.method || 'GET'} ${url}`;

    return this.retryManager.executeWithRetry(async () => {
      const result = await this.circuitBreaker.execute(
        async () => this.executeRequest(url, options, startTime),
        operationName
      );

      if (result.success) {
        return result.data;
      }
      throw result.error;
    }, operationName);
  }

  private async executeRequest(
    url: string,
    options: RequestOptions,
    startTime: number
  ): Promise<CachedResponse> {
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
      'User-Agent': this.config.userAgent,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Charset': 'utf-8',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...options.headers,
    };

    // Add compression headers if enabled
    if (this.config.enableGzip && options.compress !== false) {
      headers['Accept-Encoding'] = 'gzip, deflate';
    }

    // Add conditional headers for caching
    if (
      method === 'GET' &&
      this.config.enableCache &&
      options.cache !== false
    ) {
      const conditionalHeaders = httpCache.getConditionalHeaders(url, method);
      Object.assign(headers, conditionalHeaders);
    }

    const requestStartTime = Date.now();

    try {
      const response = await request(url, {
        method,
        headers,
        body: options.body,
        headersTimeout: options.timeout || this.config.timeout,
        bodyTimeout: options.timeout || this.config.timeout,
        maxRedirections: options.maxRedirects || this.config.maxRedirects,
      });

      const responseTime = Date.now() - requestStartTime;
      this.stats.totalResponseTime += responseTime;

      // Handle 304 Not Modified
      if (response.statusCode === 304) {
        const cachedEntry = httpCache.handleNotModified(
          url,
          method,
          responseTime
        );

        if (cachedEntry) {
          return {
            status: cachedEntry.status,
            statusText: this.getStatusText(cachedEntry.status),
            headers: cachedEntry.headers,
            body: cachedEntry.body,
            cached: true,
            responseTime,
            fromCache: true,
          };
        }
      }

      // Check for HTTP errors
      if (response.statusCode < 200 || response.statusCode >= 400) {
        throw EnhancedError.externalApi(
          `HTTP ${response.statusCode}: ${response.statusMessage || 'Request failed'}`,
          { url, status: response.statusCode, method },
          this.config.name
        );
      }

      // Read response body
      const body = await response.body.arrayBuffer();
      let bodyBuffer = Buffer.from(body);

      // Handle compression
      const contentEncoding = response.headers['content-encoding'];
      if (
        contentEncoding &&
        (contentEncoding.includes('gzip') ||
          contentEncoding.includes('deflate'))
      ) {
        const originalSize = bodyBuffer.length;

        try {
          bodyBuffer = await compressionManager.decompressBuffer(
            bodyBuffer,
            contentEncoding.includes('gzip') ? 'gzip' : 'deflate'
          );

          const compressionRatio =
            originalSize > 0 ? bodyBuffer.length / originalSize : 1;
          this.stats.compressionSavings += originalSize - bodyBuffer.length;

          logger.debug('🌐 Response decompressed', {
            url,
            originalSize,
            decompressedSize: bodyBuffer.length,
            compressionRatio: compressionRatio.toFixed(3),
          });
        } catch (error) {
          logger.warn('Failed to decompress response', {
            url,
            contentEncoding,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Validate content
      if (bodyBuffer.length < 10 && method === 'GET') {
        logger.warn('Received suspiciously small response', {
          url,
          method,
          size: bodyBuffer.length,
          status: response.statusCode,
        });
      }

      if (bodyBuffer.includes(0)) {
        logger.warn('Binary content detected in text response', {
          url,
          method,
          size: bodyBuffer.length,
          status: response.statusCode,
        });
      }

      // Convert headers to simple object
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers)) {
        responseHeaders[key] = Array.isArray(value)
          ? value[0] || ''
          : value || '';
      }

      return {
        status: response.statusCode,
        statusText: this.getStatusText(response.statusCode),
        headers: responseHeaders,
        body: bodyBuffer,
        cached: false,
        responseTime,
        fromCache: false,
      };
    } catch (error) {
      const responseTime = Date.now() - requestStartTime;
      this.stats.totalResponseTime += responseTime;

      if (error instanceof EnhancedError) {
        throw error;
      }

      // Convert other errors to EnhancedError
      const message = error instanceof Error ? error.message : String(error);

      if (message.toLowerCase().includes('timeout')) {
        throw EnhancedError.timeout(
          `Request timeout: ${message}`,
          { url, method, timeout: options.timeout || this.config.timeout },
          this.config.name
        );
      }
      if (message.toLowerCase().includes('network')) {
        throw EnhancedError.network(
          `Network error: ${message}`,
          { url, method, originalError: error },
          this.config.name
        );
      }
      throw EnhancedError.externalApi(
        `HTTP request failed: ${message}`,
        { url, method, originalError: error },
        this.config.name
      );
    }
  }

  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      204: 'No Content',
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };

    return statusTexts[status] || `HTTP ${status}`;
  }
}

/**
 * Factory function for creating cached HTTP clients
 */
export function createCachedHttpClient(
  config: Partial<CachedHttpConfig> = {}
): CachedHttpClient {
  return new CachedHttpClient(config);
}

/**
 * Global cached HTTP client instances
 */
export const cachedHttpClient = createCachedHttpClient({ name: 'global' });

export const cachedGithubClient = createCachedHttpClient({
  name: 'github',
  userAgent: 'porter-bridges/1.0.0',
  timeout: 15_000,
  enableCache: true,
  enableCompression: true,
});

export const cachedMavenClient = createCachedHttpClient({
  name: 'maven',
  userAgent: 'porter-bridges/1.0.0',
  timeout: 30_000,
  enableCache: true,
  enableCompression: true,
});

export const cachedRssClient = createCachedHttpClient({
  name: 'rss',
  userAgent: 'porter-bridges/1.0.0',
  timeout: 10_000,
  enableCache: true,
  enableCompression: true,
});
