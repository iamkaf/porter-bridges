/**
 * @file Cache Manager - Intelligent caching system with LRU eviction
 *
 * This module provides a comprehensive caching system with LRU eviction,
 * TTL support, memory management, and cache statistics.
 */

import { LRUCache } from 'lru-cache';
import { logger } from '../logger';
import { performanceMonitor } from '../performance/performance-monitor';

export interface CacheConfig {
  maxSize: number;
  maxMemoryMB: number;
  ttlMinutes: number;
  updateAgeOnGet: boolean;
  updateAgeOnHas: boolean;
  allowStale: boolean;
  checkInterval: number;
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  size: number;
  lastAccess: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  totalSize: number;
  itemCount: number;
  memoryUsageMB: number;
  averageItemSize: number;
}

export class CacheManager<K, V> {
  private cache: LRUCache<K, CacheEntry<V>>;
  private config: CacheConfig;
  private stats: CacheStats;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      maxMemoryMB: config.maxMemoryMB || 100,
      ttlMinutes: config.ttlMinutes || 60,
      updateAgeOnGet: config.updateAgeOnGet !== false,
      updateAgeOnHas: config.updateAgeOnHas !== false,
      allowStale: config.allowStale,
      checkInterval: config.checkInterval || 30_000,
    };

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      totalSize: 0,
      itemCount: 0,
      memoryUsageMB: 0,
      averageItemSize: 0,
    };

    this.cache = new LRUCache<K, CacheEntry<V>>({
      max: this.config.maxSize,
      ttl: this.config.ttlMinutes * 60 * 1000,
      updateAgeOnGet: this.config.updateAgeOnGet,
      updateAgeOnHas: this.config.updateAgeOnHas,
      allowStale: this.config.allowStale,
      sizeCalculation: (entry: CacheEntry<V>) => entry.size,
      maxSize: this.config.maxMemoryMB * 1024 * 1024,
      dispose: (entry: CacheEntry<V>) => {
        this.stats.evictions++;
        this.stats.totalSize -= entry.size;
      },
    });

    // Start cleanup interval
    this.startCleanupInterval();

    logger.info('📦 Cache manager initialized', {
      maxSize: this.config.maxSize,
      maxMemoryMB: this.config.maxMemoryMB,
      ttlMinutes: this.config.ttlMinutes,
    });
  }

  /**
   * Get item from cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (entry) {
      entry.accessCount++;
      entry.lastAccess = Date.now();
      this.stats.hits++;

      logger.debug('📦 Cache hit', {
        key: this.safeStringify(key),
        accessCount: entry.accessCount,
        age: Date.now() - entry.timestamp,
      });

      return entry.value;
    }
    this.stats.misses++;

    logger.debug('📦 Cache miss', {
      key: this.safeStringify(key),
    });

    return;
  }

  /**
   * Set item in cache
   */
  set(key: K, value: V, customTtl?: number): void {
    const size = this.calculateSize(value);
    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now(),
      accessCount: 1,
      size,
      lastAccess: Date.now(),
    };

    // Use custom TTL if provided
    if (customTtl) {
      this.cache.set(key, entry, { ttl: customTtl });
    } else {
      this.cache.set(key, entry);
    }

    this.stats.sets++;
    this.stats.totalSize += size;

    logger.debug('📦 Cache set', {
      key: this.safeStringify(key),
      size,
      ttl: customTtl || this.config.ttlMinutes * 60 * 1000,
    });
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete item from cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    const deleted = this.cache.delete(key);

    if (deleted && entry) {
      this.stats.deletes++;
      this.stats.totalSize -= entry.size;

      logger.debug('📦 Cache delete', {
        key: this.safeStringify(key),
        size: entry.size,
      });
    }

    return deleted;
  }

  /**
   * Clear all items from cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalSize = 0;
    this.stats.evictions = 0;

    logger.info('📦 Cache cleared');
  }

  /**
   * Get or set with factory function
   */
  async getOrSet<T extends V>(
    key: K,
    factory: () => Promise<T>,
    customTtl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get(key);
    if (cached) {
      return cached as T;
    }

    // Generate new value
    const startTime = Date.now();
    const value = await factory();
    const generationTime = Date.now() - startTime;

    // Store in cache
    this.set(key, value, customTtl);

    logger.debug('📦 Cache factory execution', {
      key: this.safeStringify(key),
      generationTime,
      size: this.calculateSize(value),
    });

    return value;
  }

  /**
   * Bulk get multiple keys
   */
  getMultiple(keys: K[]): Map<K, V> {
    const results = new Map<K, V>();

    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    }

    return results;
  }

  /**
   * Bulk set multiple key-value pairs
   */
  setMultiple(entries: Map<K, V>, customTtl?: number): void {
    for (const [key, value] of entries) {
      this.set(key, value, customTtl);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const itemCount = this.cache.size;
    const memoryUsageMB = this.stats.totalSize / 1024 / 1024;
    const averageItemSize =
      itemCount > 0 ? this.stats.totalSize / itemCount : 0;
    const hitRate =
      this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
        : 0;

    return {
      ...this.stats,
      hitRate,
      itemCount,
      memoryUsageMB,
      averageItemSize,
    };
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Recreate cache with new config
    const oldEntries = Array.from(this.cache.entries());

    this.cache = new LRUCache<K, CacheEntry<V>>({
      max: this.config.maxSize,
      ttl: this.config.ttlMinutes * 60 * 1000,
      updateAgeOnGet: this.config.updateAgeOnGet,
      updateAgeOnHas: this.config.updateAgeOnHas,
      allowStale: this.config.allowStale,
      sizeCalculation: (entry: CacheEntry<V>) => entry.size,
      maxSize: this.config.maxMemoryMB * 1024 * 1024,
      dispose: (entry: CacheEntry<V>) => {
        this.stats.evictions++;
        this.stats.totalSize -= entry.size;
      },
    });

    // Restore entries
    for (const [key, entry] of oldEntries) {
      this.cache.set(key, entry);
    }

    logger.info('📦 Cache configuration updated', this.config);
  }

  /**
   * Get all cache keys
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all cache values
   */
  values(): V[] {
    return Array.from(this.cache.values()).map((entry) => entry.value);
  }

  /**
   * Get all cache entries
   */
  entries(): [K, V][] {
    return Array.from(this.cache.entries()).map(([key, entry]) => [
      key,
      entry.value,
    ]);
  }

  /**
   * Get cache dump for debugging
   */
  dump(): { key: K; value: V; entry: CacheEntry<V> }[] {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      value: entry.value,
      entry,
    }));
  }

  /**
   * Optimize cache by removing least used items
   */
  optimize(): void {
    const beforeSize = this.cache.size;
    const beforeMemory = this.stats.totalSize;

    // Get all entries sorted by access pattern
    const entries = Array.from(this.cache.entries());
    const sortedEntries = entries.sort(([, a], [, b]) => {
      // Sort by access count (ascending) and last access (ascending)
      const accessDiff = a.accessCount - b.accessCount;
      if (accessDiff !== 0) return accessDiff;
      return a.lastAccess - b.lastAccess;
    });

    // Remove least used 20% of items
    const itemsToRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < itemsToRemove; i++) {
      const [key] = sortedEntries[i]!;
      this.delete(key);
    }

    const afterSize = this.cache.size;
    const afterMemory = this.stats.totalSize;

    logger.info('📦 Cache optimization completed', {
      beforeSize,
      afterSize,
      removedItems: beforeSize - afterSize,
      beforeMemoryMB: Math.round(beforeMemory / 1024 / 1024),
      afterMemoryMB: Math.round(afterMemory / 1024 / 1024),
      savedMemoryMB: Math.round((beforeMemory - afterMemory) / 1024 / 1024),
    });
  }

  /**
   * Cleanup expired items
   */
  cleanup(): void {
    const beforeSize = this.cache.size;

    // LRU cache handles TTL automatically, but we can force cleanup
    this.cache.purgeStale();

    const afterSize = this.cache.size;
    const cleanedUp = beforeSize - afterSize;

    if (cleanedUp > 0) {
      logger.info('📦 Cache cleanup completed', {
        cleanedUpItems: cleanedUp,
        remainingItems: afterSize,
      });
    }
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  // Private methods

  private calculateSize(value: V): number {
    try {
      return JSON.stringify(value).length * 2; // Rough estimate (2 bytes per character)
    } catch {
      return 100; // Default size for non-serializable objects
    }
  }

  private safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();

      // Update stats
      this.stats.itemCount = this.cache.size;
      this.stats.memoryUsageMB = this.stats.totalSize / 1024 / 1024;

      // Log stats periodically
      if (this.stats.itemCount > 0) {
        const stats = this.getStats();
        logger.debug('📦 Cache stats', {
          hitRate: `${stats.hitRate.toFixed(2)}%`,
          itemCount: stats.itemCount,
          memoryUsageMB: stats.memoryUsageMB.toFixed(2),
          averageItemSize: Math.round(stats.averageItemSize),
        });
      }
    }, this.config.checkInterval);
  }
}

/**
 * Factory function for creating cache managers
 */
export function createCacheManager<K, V>(
  config: Partial<CacheConfig> = {}
): CacheManager<K, V> {
  return new CacheManager<K, V>(config);
}

/**
 * Global cache instance for general use
 */
export const globalCache = createCacheManager<string, any>({
  maxSize: 1000,
  maxMemoryMB: 50,
  ttlMinutes: 30,
});
