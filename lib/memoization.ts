/**
 * Performance Optimization: Memoization utilities for expensive calculations
 * 
 * This module provides LRU cache-based memoization for computationally expensive
 * operations like seismological analysis. Caching results can reduce CPU usage
 * by 90% for repeated calculations with the same input data.
 */

import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';

/**
 * Options for creating a memoized function
 */
export interface MemoizeOptions {
  /**
   * Maximum number of cached results (default: 100)
   */
  maxSize?: number;
  
  /**
   * Time-to-live for cached results in milliseconds (default: 5 minutes)
   */
  ttl?: number;
  
  /**
   * Custom key generator function
   * If not provided, uses JSON.stringify + hash
   */
  keyGenerator?: (...args: any[]) => string;
}

/**
 * Create a cache key from function arguments
 * Uses SHA-256 hash of JSON-stringified arguments for consistent keys
 */
function defaultKeyGenerator(...args: any[]): string {
  try {
    const serialized = JSON.stringify(args, (key, value) => {
      // Handle special types that don't serialize well
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) };
      }
      if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) };
      }
      return value;
    });
    
    // Use hash for consistent, short keys
    return createHash('sha256').update(serialized).digest('hex');
  } catch (error) {
    // Fallback to timestamp-based key if serialization fails
    console.warn('[Memoization] Failed to serialize arguments, using timestamp key', error);
    return `fallback_${Date.now()}_${Math.random()}`;
  }
}

/**
 * Memoize a function using LRU cache
 * 
 * @param fn - The function to memoize
 * @param options - Memoization options
 * @returns Memoized version of the function with cache statistics
 * 
 * @example
 * ```typescript
 * const expensiveCalculation = memoize(
 *   (events: EventData[]) => calculateGutenbergRichter(events),
 *   { maxSize: 50, ttl: 10 * 60 * 1000 } // 10 minutes
 * );
 * 
 * // First call: performs calculation
 * const result1 = expensiveCalculation(events);
 * 
 * // Second call with same events: returns cached result
 * const result2 = expensiveCalculation(events);
 * 
 * // Check cache statistics
 * console.log(expensiveCalculation.cacheStats());
 * ```
 */
export function memoize<TArgs extends any[], TResult extends {}>(
  fn: (...args: TArgs) => TResult,
  options: MemoizeOptions = {}
): ((...args: TArgs) => TResult) & {
  cache: LRUCache<string, TResult>;
  cacheStats: () => { size: number; hits: number; misses: number; hitRate: string };
  clearCache: () => void;
} {
  const {
    maxSize = 100,
    ttl = 5 * 60 * 1000, // 5 minutes default
    keyGenerator = defaultKeyGenerator
  } = options;

  // Create LRU cache
  const cache = new LRUCache<string, TResult>({
    max: maxSize,
    ttl,
    updateAgeOnGet: true, // Reset TTL on cache hit
    updateAgeOnHas: false
  });

  let hits = 0;
  let misses = 0;

  // Create memoized function
  const memoized = (...args: TArgs): TResult => {
    const key = keyGenerator(...args);
    
    // Check cache
    const cached = cache.get(key);
    if (cached !== undefined) {
      hits++;
      return cached;
    }
    
    // Cache miss: compute result
    misses++;
    const result = fn(...args);
    cache.set(key, result);
    
    return result;
  };

  // Attach cache utilities
  memoized.cache = cache;
  
  memoized.cacheStats = () => {
    const total = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00';
    
    return {
      size: cache.size,
      hits,
      misses,
      hitRate: `${hitRate}%`
    };
  };
  
  memoized.clearCache = () => {
    cache.clear();
    hits = 0;
    misses = 0;
  };

  return memoized;
}

/**
 * Memoize an async function using LRU cache
 * 
 * @param fn - The async function to memoize
 * @param options - Memoization options
 * @returns Memoized version of the async function
 */
export function memoizeAsync<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: MemoizeOptions = {}
): ((...args: TArgs) => Promise<TResult>) & {
  cache: LRUCache<string, Promise<TResult>>;
  cacheStats: () => { size: number; hits: number; misses: number; hitRate: string };
  clearCache: () => void;
} {
  const {
    maxSize = 100,
    ttl = 5 * 60 * 1000,
    keyGenerator = defaultKeyGenerator
  } = options;

  const cache = new LRUCache<string, Promise<TResult>>({
    max: maxSize,
    ttl,
    updateAgeOnGet: true
  });

  let hits = 0;
  let misses = 0;

  const memoized = async (...args: TArgs): Promise<TResult> => {
    const key = keyGenerator(...args);
    
    const cached = cache.get(key);
    if (cached !== undefined) {
      hits++;
      return cached;
    }
    
    misses++;
    const resultPromise = fn(...args);
    cache.set(key, resultPromise);
    
    // If promise rejects, remove from cache
    resultPromise.catch(() => {
      cache.delete(key);
    });
    
    return resultPromise;
  };

  memoized.cache = cache;
  memoized.cacheStats = () => {
    const total = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00';
    return { size: cache.size, hits, misses, hitRate: `${hitRate}%` };
  };
  memoized.clearCache = () => {
    cache.clear();
    hits = 0;
    misses = 0;
  };

  return memoized;
}

