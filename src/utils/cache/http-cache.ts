/**
 * @file HTTP Cache - Intelligent HTTP response caching with ETag and Last-Modified support
 *
 * This module provides HTTP-specific caching with proper cache headers,
 * conditional requests, and response compression.
 */


import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { logger } from '../logger';
import { type CacheManager, createCacheManager } from './cache-manager';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface HttpCacheEntry {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  compressed: boolean;
  etag?: string;
  lastModified?: string;
  cacheControl?: string;
  maxAge?: number;
  timestamp: number;
  responseTime: number;
}

export interface HttpCacheConfig {
  maxSize: number;
  maxMemoryMB: number;
  ttlMinutes: number;
  compressResponses: boolean;
  respectCacheHeaders: boolean;
  staleWhileRevalidate: boolean;
  minSizeForCompression: number;
}

export interface CacheHitInfo {
  hit: boolean;
  key: string;
  age: number;
  stale: boolean;
  compressionRatio?: number;
}

export class HttpCache {
  private cache: CacheManager<string, HttpCacheEntry>;
  private config: HttpCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    staleHits: 0,
    compressionSavings: 0,
    totalRequests: 0,
  };

  constructor(config: Partial<HttpCacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      maxMemoryMB: config.maxMemoryMB || 100,
      ttlMinutes: config.ttlMinutes || 60,
      compressResponses: config.compressResponses !== false,
      respectCacheHeaders: config.respectCacheHeaders !== false,
      staleWhileRevalidate: config.staleWhileRevalidate !== false,
      minSizeForCompression: config.minSizeForCompression || 1024,
    };

    this.cache = createCacheManager<string, HttpCacheEntry>({
      maxSize: this.config.maxSize,
      maxMemoryMB: this.config.maxMemoryMB,
      ttlMinutes: this.config.ttlMinutes,
    });

    logger.info('🌐 HTTP cache initialized', {
      maxSize: this.config.maxSize,
      maxMemoryMB: this.config.maxMemoryMB,
      ttlMinutes: this.config.ttlMinutes,
      compressResponses: this.config.compressResponses,
    });
  }

  /**
   * Get cached response
   */
  async get(
    url: string,
    method = 'GET'
  ): Promise<{
    entry: HttpCacheEntry | null;
    hitInfo: CacheHitInfo;
  }> {
    const key = this.generateCacheKey(url, method);
    const entry = this.cache.get(key);

    this.stats.totalRequests++;

    if (!entry) {
      this.stats.misses++;
      return {
        entry: null,
        hitInfo: {
          hit: false,
          key,
          age: 0,
          stale: false,
        },
      };
    }

    const age = Date.now() - entry.timestamp;
    const isStale = this.isEntryStale(entry, age);

    if (isStale && !this.config.staleWhileRevalidate) {
      this.stats.misses++;
      this.cache.delete(key);

      return {
        entry: null,
        hitInfo: {
          hit: false,
          key,
          age,
          stale: true,
        },
      };
    }

    if (isStale) {
      this.stats.staleHits++;
    } else {
      this.stats.hits++;
    }

    // Decompress if needed
    if (entry.compressed) {
      try {
        const decompressed = await gunzipAsync(entry.body);
        entry.body = decompressed;
        entry.compressed = false;
      } catch (error) {
        logger.warn('Failed to decompress cached response', {
          url,
          error: error instanceof Error ? error.message : String(error),
        });

        this.cache.delete(key);
        return {
          entry: null,
          hitInfo: {
            hit: false,
            key,
            age,
            stale: false,
          },
        };
      }
    }

    logger.debug('🌐 HTTP cache hit', {
      url,
      method,
      age,
      stale: isStale,
      size: entry.body.length,
      compressed: entry.compressed,
    });

    return {
      entry,
      hitInfo: {
        hit: true,
        key,
        age,
        stale: isStale,
        compressionRatio: entry.compressed
          ? this.calculateCompressionRatio(entry)
          : undefined,
      },
    };
  }

  /**
   * Cache HTTP response
   */
  async set(
    url: string,
    method: string,
    status: number,
    headers: Record<string, string>,
    body: Buffer,
    responseTime: number
  ): Promise<void> {
    const key = this.generateCacheKey(url, method);

    // Check if response is cacheable
    if (!this.isCacheable(method, status, headers)) {
      logger.debug('🌐 Response not cacheable', {
        url,
        method,
        status,
        cacheControl: headers['cache-control'],
      });
      return;
    }

    // Calculate TTL based on cache headers
    const ttl = this.calculateTTL(headers);

    // Compress response if enabled and body is large enough
    let finalBody = body;
    let compressed = false;

    if (
      this.config.compressResponses &&
      body.length >= this.config.minSizeForCompression
    ) {
      try {
        const compressedBody = await gzipAsync(body);
        const compressionRatio =
          (body.length - compressedBody.length) / body.length;

        if (compressionRatio > 0.1) {
          // Only use compression if it saves at least 10%
          finalBody = compressedBody;
          compressed = true;
          this.stats.compressionSavings += body.length - compressedBody.length;

          logger.debug('🌐 Response compressed', {
            url,
            originalSize: body.length,
            compressedSize: compressedBody.length,
            compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
          });
        }
      } catch (error) {
        logger.warn('Failed to compress response', {
          url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Extract cache-related headers
    const etag = headers.etag;
    const lastModified = headers['last-modified'];
    const cacheControl = headers['cache-control'];

    const entry: HttpCacheEntry = {
      url,
      method,
      status,
      headers: { ...headers },
      body: finalBody,
      compressed,
      etag,
      lastModified,
      cacheControl,
      maxAge: this.parseMaxAge(cacheControl),
      timestamp: Date.now(),
      responseTime,
    };

    this.cache.set(key, entry, ttl);

    logger.debug('🌐 HTTP response cached', {
      url,
      method,
      status,
      size: finalBody.length,
      compressed,
      ttl,
      etag,
      lastModified,
    });
  }

  /**
   * Generate conditional request headers
   */
  getConditionalHeaders(url: string, method = 'GET'): Record<string, string> {
    const key = this.generateCacheKey(url, method);
    const entry = this.cache.get(key);

    if (!entry) {
      return {};
    }

    const headers: Record<string, string> = {};

    if (entry.etag) {
      headers['if-none-match'] = entry.etag;
    }

    if (entry.lastModified) {
      headers['if-modified-since'] = entry.lastModified;
    }

    return headers;
  }

  /**
   * Handle 304 Not Modified response
   */
  handleNotModified(
    url: string,
    method = 'GET',
    responseTime: number
  ): HttpCacheEntry | null {
    const key = this.generateCacheKey(url, method);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Update timestamp to refresh TTL
    entry.timestamp = Date.now();
    entry.responseTime = responseTime;

    this.cache.set(key, entry);
    this.stats.hits++;

    logger.debug('🌐 HTTP 304 Not Modified', {
      url,
      method,
      age: Date.now() - entry.timestamp,
    });

    return entry;
  }

  /**
   * Invalidate cache entry
   */
  invalidate(url: string, method?: string): void {
    if (method) {
      const key = this.generateCacheKey(url, method);
      this.cache.delete(key);
    } else {
      // Invalidate all methods for this URL
      const keys = this.cache
        .keys()
        .filter((key) => key.startsWith(this.normalizeUrl(url)));
      keys.forEach((key) => this.cache.delete(key));
    }

    logger.debug('🌐 Cache invalidated', { url, method });
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    staleHits: number;
    hitRate: number;
    compressionSavings: number;
    totalRequests: number;
    cacheSize: number;
    memoryUsageMB: number;
  } {
    const cacheStats = this.cache.getStats();
    const hitRate =
      this.stats.totalRequests > 0
        ? ((this.stats.hits + this.stats.staleHits) /
            this.stats.totalRequests) *
          100
        : 0;

    return {
      ...this.stats,
      hitRate,
      cacheSize: cacheStats.itemCount,
      memoryUsageMB: cacheStats.memoryUsageMB,
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      staleHits: 0,
      compressionSavings: 0,
      totalRequests: 0,
    };

    logger.info('🌐 HTTP cache cleared');
  }

  /**
   * Optimize cache
   */
  optimize(): void {
    this.cache.optimize();
  }

  // Private methods

  private generateCacheKey(url: string, method: string): string {
    const normalizedUrl = this.normalizeUrl(url);
    return `${method.toUpperCase()}:${normalizedUrl}`;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove fragment and normalize
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private isCacheable(
    method: string,
    status: number,
    headers: Record<string, string>
  ): boolean {
    // Only cache GET and HEAD requests
    if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
      return false;
    }

    // Only cache successful responses
    if (status < 200 || status >= 300) {
      return false;
    }

    // Check cache-control headers
    const cacheControl = headers['cache-control'];
    if (cacheControl) {
      const directives = cacheControl
        .toLowerCase()
        .split(',')
        .map((d) => d.trim());

      if (directives.includes('no-cache') || directives.includes('no-store')) {
        return false;
      }
    }

    return true;
  }

  private calculateTTL(headers: Record<string, string>): number | undefined {
    if (!this.config.respectCacheHeaders) {
      return; // Use default TTL
    }

    const cacheControl = headers['cache-control'];
    if (cacheControl) {
      const maxAge = this.parseMaxAge(cacheControl);
      if (maxAge !== undefined) {
        return maxAge * 1000; // Convert to milliseconds
      }
    }

    // Fallback to Expires header
    const expires = headers.expires;
    if (expires) {
      const expiresDate = new Date(expires);
      const now = new Date();
      const ttl = expiresDate.getTime() - now.getTime();

      if (ttl > 0) {
        return ttl;
      }
    }

    return; // Use default TTL
  }

  private parseMaxAge(cacheControl?: string): number | undefined {
    if (!cacheControl) {
      return;
    }

    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    if (maxAgeMatch) {
      return Number.parseInt(maxAgeMatch[1]!, 10);
    }

    return;
  }

  private isEntryStale(entry: HttpCacheEntry, age: number): boolean {
    // Check max-age from cache-control
    if (entry.maxAge !== undefined) {
      return age > entry.maxAge * 1000;
    }

    // Use default TTL
    return age > this.config.ttlMinutes * 60 * 1000;
  }

  private calculateCompressionRatio(entry: HttpCacheEntry): number | undefined {
    if (!entry.compressed) {
      return;
    }

    // This is approximate since we don't store original size
    // In practice, gzip typically achieves 60-80% compression for text
    return 0.7; // Estimate 70% compression
  }
}

/**
 * Global HTTP cache instance
 */
export const httpCache = new HttpCache({
  maxSize: 1000,
  maxMemoryMB: 100,
  ttlMinutes: 60,
  compressResponses: true,
  respectCacheHeaders: true,
  staleWhileRevalidate: true,
});
