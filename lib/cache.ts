/**
 * Enhanced in-memory LRU cache for API responses
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number;
}

class Cache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number; // Time to live in milliseconds
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: CacheOptions | number = {}) {
    // Support legacy constructor signature
    if (typeof options === 'number') {
      this.defaultTTL = options;
      this.maxSize = 100;
    } else {
      this.defaultTTL = options.defaultTTL || 5 * 60 * 1000;
      this.maxSize = options.maxSize || 100;
    }
    this.cache = new Map();
  }

  /**
   * Get a value from the cache
   * @param key - The cache key
   * @param ttl - Optional custom TTL for this entry
   * @returns The cached value or null if not found or expired
   */
  get<T>(key: string, ttl?: number): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    const maxAge = ttl || this.defaultTTL;
    const age = Date.now() - entry.timestamp;

    if (age > maxAge) {
      // Entry has expired
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update hit count and move to end (LRU)
    entry.hits++;
    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data as T;
  }

  /**
   * Set a value in the cache
   * @param key - The cache key
   * @param data - The data to cache
   */
  set<T>(key: string, data: T): void {
    // If key exists, update it
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // If cache is full, remove least recently used item
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Clear a specific cache entry
   * @param key - The cache key to clear
   */
  clear(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Remove all expired entries
   */
  cleanup(): void {
    const now = Date.now();
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.defaultTTL) {
        this.cache.delete(key);
      }
    });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate.toFixed(2) + '%',
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        hits: entry.hits,
        age: Date.now() - entry.timestamp,
      })),
    };
  }

  /**
   * Get or set a value using a factory function
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get<T>(key, ttl);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value);
    return value;
  }

  /**
   * Invalidate entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Performance Optimization: Invalidate entries matching a string pattern
   * More efficient than regex for simple string matching
   */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Performance Optimization: Invalidate entries containing a substring
   */
  invalidateBySubstring(substring: string): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.includes(substring)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
}

// Export singleton instances for different data types
export const apiCache = new Cache({ defaultTTL: 5 * 60 * 1000, maxSize: 100 });
export const catalogueCache = new Cache({ defaultTTL: 10 * 60 * 1000, maxSize: 50 });
export const eventCache = new Cache({ defaultTTL: 5 * 60 * 1000, maxSize: 100 });
export const statisticsCache = new Cache({ defaultTTL: 15 * 60 * 1000, maxSize: 30 });

// Export the class for custom instances
export { Cache };

/**
 * Helper function to generate cache keys
 */
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');

  return `${prefix}:${sortedParams}`;
}

/**
 * Performance Optimization: Invalidate all caches related to a catalogue
 * Uses substring matching instead of regex for better performance
 */
export function invalidateCatalogueCache(catalogueId: string): void {
  const catalogueCount = catalogueCache.invalidateBySubstring(catalogueId);
  const eventCount = eventCache.invalidateBySubstring(catalogueId);
  const statsCount = statisticsCache.invalidateBySubstring(catalogueId);

  console.log(`[Cache] Invalidated ${catalogueCount + eventCount + statsCount} entries for catalogue ${catalogueId}`);
}

/**
 * Performance Optimization: Invalidate all event caches (useful after bulk operations)
 */
export function invalidateAllEventCaches(): void {
  eventCache.clearAll();
  console.log(`[Cache] Cleared all event caches`);
}

/**
 * Performance Optimization: Invalidate specific cache types by prefix
 */
export function invalidateCacheByPrefix(prefix: string): void {
  const apiCount = apiCache.invalidateByPrefix(prefix);
  const catalogueCount = catalogueCache.invalidateByPrefix(prefix);
  const eventCount = eventCache.invalidateByPrefix(prefix);
  const statsCount = statisticsCache.invalidateByPrefix(prefix);

  const total = apiCount + catalogueCount + eventCount + statsCount;
  console.log(`[Cache] Invalidated ${total} entries with prefix "${prefix}"`);
}

/**
 * Get cache statistics for all caches
 */
export function getAllCacheStats() {
  return {
    api: apiCache.getStats(),
    catalogue: catalogueCache.getStats(),
    event: eventCache.getStats(),
    statistics: statisticsCache.getStats(),
  };
}
