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
  /**
   * Upper bound on rows in arrays and paginated { data: [...] } responses. Event pages are
   * 500-5000 rows each, so an entry-count cap alone let this cache retain
   * hundreds of megabytes (measured 324 MB at maxSize=100).
   */
  maxRows?: number;
}

function countRows(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object' && 'data' in value && Array.isArray(value.data)) {
    return value.data.length;
  }
  return 0;
}

class Cache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number; // Time to live in milliseconds
  private maxSize: number;
  private maxRows: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: CacheOptions | number = {}) {
    // Support legacy constructor signature
    if (typeof options === 'number') {
      this.defaultTTL = options;
      this.maxSize = 100;
      this.maxRows = Infinity;
    } else {
      this.defaultTTL = options.defaultTTL || 5 * 60 * 1000;
      this.maxSize = options.maxSize || 100;
      this.maxRows = options.maxRows ?? Infinity;
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

    // Evict least-recently-used entries until response rows fit the budget. The
    // entry just written is never evicted, so an oversized page is still served.
    if (this.maxRows !== Infinity) {
      let rows = 0;
      this.cache.forEach((entry) => { rows += countRows(entry.data); });
      for (const oldest of Array.from(this.cache.keys())) {
        if (rows <= this.maxRows || oldest === key) break;
        const entry = this.cache.get(oldest);
        rows -= countRows(entry?.data);
        this.cache.delete(oldest);
      }
    }
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
export const eventCache = new Cache({ defaultTTL: 5 * 60 * 1000, maxSize: 100, maxRows: 50_000 });
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

// ---------------------------------------------------------------------------
// Cache generations
//
// Deleting entries after a write is not enough on its own. A request that read the
// database just BEFORE a write can store its stale result just AFTER the write's
// invalidation, and every server instance (a Vercel function, a second container) has
// its own copy of these caches, which an invalidation in another instance never
// reaches. Readers therefore put a generation in their cache keys: it changes on every
// write to the data the key covers, so an entry stored under an older generation is
// never looked up again (it simply ages out). The generation combines
//   - a process-local counter, bumped by the invalidation functions below, and
//   - a shared counter kept in the database, bumped by every catalogue mutation in
//     lib/db.ts, which registers the reader for it (this module stays importable by
//     client code, so it cannot import the database layer itself).
// ---------------------------------------------------------------------------

/** Generation scope of the catalogue list and region searches (any catalogue's fields). */
export const CATALOGUE_LIST_SCOPE = 'catalogues';

/** Generation scope of one catalogue's events and statistics. */
export function catalogueScope(catalogueId: string): string {
  return `catalogue:${catalogueId}`;
}

/** Key prefix of the catalogue list entries (GET /api/catalogues). */
export const CATALOGUE_LIST_CACHE_PREFIX = 'catalogues';
/** Key prefix of the region-search entries (GET /api/catalogues/search/region). */
export const REGION_SEARCH_CACHE_PREFIX = 'region:';

type SharedGenerationSource = (scope: string) => Promise<number>;

let sharedGenerationSource: SharedGenerationSource | null = null;
// Never reset: a counter that returned to an earlier value could make an entry keyed
// under that value current again.
let processEpoch = 0;
const localGenerations = new Map<string, number>();

function bumpLocalGeneration(scope: string): void {
  localGenerations.set(scope, (localGenerations.get(scope) ?? 0) + 1);
}

/** Register the reader of the shared (database) generation. Server-side only. */
export function registerCacheGenerationSource(source: SharedGenerationSource | null): void {
  sharedGenerationSource = source;
}

/**
 * The generation to put in a cache key for data in `scope`. Take it BEFORE reading
 * the database. Resolves to null when the shared generation cannot be read: the
 * caller must then neither read nor write the cache for this request, since it can
 * no longer tell whether a cached entry is current.
 */
export async function getCacheGeneration(scope: string): Promise<string | null> {
  const parts = await getCacheGenerationParts(scope);
  return parts ? parts.generation : null;
}

export interface CacheGenerationParts {
  /** What getCacheGeneration resolves to: for keys of this process's caches. */
  generation: string;
  /**
   * The shared (database) counter alone, or null when no shared source is registered
   * (client code, or tests that replace the database layer). Unlike `generation` it is
   * the same in every server instance and survives a restart, so it is the one to store
   * beside data persisted in the database. Every committed catalogue write advances it.
   */
  shared: number | null;
}

/**
 * Both generations of `scope`, from one read of the shared counter. Take it BEFORE
 * reading the database. Resolves to null when the shared generation cannot be read,
 * with the same meaning as for getCacheGeneration.
 */
export async function getCacheGenerationParts(scope: string): Promise<CacheGenerationParts | null> {
  const local = `${processEpoch}.${localGenerations.get(scope) ?? 0}`;
  if (!sharedGenerationSource) return { generation: local, shared: null };
  try {
    const shared = await sharedGenerationSource(scope);
    return { generation: `${shared}:${local}`, shared };
  } catch (error) {
    console.warn(`[Cache] Shared cache generation for ${scope} unavailable; bypassing the cache:`,
      error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Performance Optimization: Invalidate all caches related to a catalogue
 * Uses substring matching instead of regex for better performance
 */
export function invalidateCatalogueCache(catalogueId: string): void {
  bumpLocalGeneration(catalogueScope(catalogueId));
  const catalogueCount = catalogueCache.invalidateBySubstring(catalogueId);
  const eventCount = eventCache.invalidateBySubstring(catalogueId);
  const statsCount = statisticsCache.invalidateBySubstring(catalogueId);
  const apiCount = apiCache.invalidateBySubstring(catalogueId);

  console.log(`[Cache] Invalidated ${catalogueCount + eventCount + statsCount + apiCount} entries for catalogue ${catalogueId}`);
}

/**
 * Invalidate everything derived from the set of catalogues and their catalogue-level
 * fields: the catalogue list and every region search. Keys of these never contain a
 * catalogue id, so invalidateCatalogueCache cannot reach them.
 */
export function invalidateCatalogueListCaches(): number {
  bumpLocalGeneration(CATALOGUE_LIST_SCOPE);
  const count =
    catalogueCache.invalidateByPrefix(CATALOGUE_LIST_CACHE_PREFIX) +
    apiCache.invalidateByPrefix(CATALOGUE_LIST_CACHE_PREFIX) +
    apiCache.invalidateByPrefix(REGION_SEARCH_CACHE_PREFIX);
  console.log(`[Cache] Invalidated ${count} catalogue list / region search entries`);
  return count;
}

/** Empty every server cache and retire every generation handed out so far. */
export function clearAllCaches(): void {
  processEpoch++;
  apiCache.clearAll();
  catalogueCache.clearAll();
  eventCache.clearAll();
  statisticsCache.clearAll();
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
