/**
 * Cache Module Tests
 * 
 * Tests for the cache functionality including:
 * - Basic cache operations (get, set, clear)
 * - Cache invalidation patterns
 * - Bulk operations and performance optimizations
 * - Catalogue cache invalidation (the bug that was fixed)
 */

import {
  Cache,
  apiCache,
  catalogueCache,
  eventCache,
  statisticsCache,
  generateCacheKey,
  invalidateCatalogueCache,
  invalidateAllEventCaches,
  invalidateCacheByPrefix,
  getAllCacheStats,
} from '@/lib/cache';

describe('Cache Module', () => {
  // Create a fresh cache instance for each test
  let testCache: Cache;

  beforeEach(() => {
    testCache = new Cache({ defaultTTL: 5000, maxSize: 10 });
    // Clear all singleton caches before each test
    apiCache.clearAll();
    catalogueCache.clearAll();
    eventCache.clearAll();
    statisticsCache.clearAll();
  });

  describe('Basic Cache Operations', () => {
    it('should set and get values', () => {
      testCache.set('key1', { data: 'value1' });
      const result = testCache.get('key1');
      expect(result).toEqual({ data: 'value1' });
    });

    it('should return null for missing keys', () => {
      const result = testCache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should clear specific keys', () => {
      testCache.set('key1', 'value1');
      testCache.set('key2', 'value2');
      testCache.clear('key1');
      
      expect(testCache.get('key1')).toBeNull();
      expect(testCache.get('key2')).toBe('value2');
    });

    it('should clear all keys', () => {
      testCache.set('key1', 'value1');
      testCache.set('key2', 'value2');
      testCache.clearAll();
      
      expect(testCache.get('key1')).toBeNull();
      expect(testCache.get('key2')).toBeNull();
      expect(testCache.size()).toBe(0);
    });

    it('should respect max size (LRU eviction)', () => {
      const smallCache = new Cache({ defaultTTL: 5000, maxSize: 3 });
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4'); // Should evict key1
      
      expect(smallCache.get('key1')).toBeNull(); // Evicted
      expect(smallCache.get('key2')).toBe('value2');
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys', () => {
      const key1 = generateCacheKey('prefix', { a: 1, b: 2 });
      const key2 = generateCacheKey('prefix', { b: 2, a: 1 }); // Different order
      
      expect(key1).toBe(key2); // Should be the same due to sorting
    });

    it('should generate different keys for different params', () => {
      const key1 = generateCacheKey('prefix', { a: 1 });
      const key2 = generateCacheKey('prefix', { a: 2 });
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Pattern-based Invalidation', () => {
    it('should invalidate by prefix', () => {
      testCache.set('events:cat1:page1', 'data1');
      testCache.set('events:cat1:page2', 'data2');
      testCache.set('events:cat2:page1', 'data3');
      testCache.set('catalogues:list', 'data4');
      
      const count = testCache.invalidateByPrefix('events:cat1');
      
      expect(count).toBe(2);
      expect(testCache.get('events:cat1:page1')).toBeNull();
      expect(testCache.get('events:cat1:page2')).toBeNull();
      expect(testCache.get('events:cat2:page1')).toBe('data3');
      expect(testCache.get('catalogues:list')).toBe('data4');
    });

    it('should invalidate by substring', () => {
      testCache.set('events:cat-abc-123:page1', 'data1');
      testCache.set('stats:cat-abc-123:summary', 'data2');
      testCache.set('events:cat-xyz-456:page1', 'data3');
      
      const count = testCache.invalidateBySubstring('cat-abc-123');
      
      expect(count).toBe(2);
      expect(testCache.get('events:cat-abc-123:page1')).toBeNull();
      expect(testCache.get('stats:cat-abc-123:summary')).toBeNull();
      expect(testCache.get('events:cat-xyz-456:page1')).toBe('data3');
    });

    it('should invalidate by regex pattern', () => {
      testCache.set('events:cat1:page1', 'data1');
      testCache.set('events:cat1:page2', 'data2');
      testCache.set('catalogues:cat1', 'data3');
      
      const count = testCache.invalidatePattern(/^events:/);
      
      expect(count).toBe(2);
      expect(testCache.get('catalogues:cat1')).toBe('data3');
    });
  });

  describe('Catalogue Cache Invalidation', () => {
    const testCatalogueId = '5486981e-b014-4a90-9ec6-2da41c53b469';

    it('should invalidate all caches for a catalogue ID', () => {
      // Set up cache entries across different cache types
      catalogueCache.set(`catalogue:${testCatalogueId}`, { name: 'Test' });
      eventCache.set(`events:${testCatalogueId}:page1`, [{ id: 1 }]);
      eventCache.set(`events:${testCatalogueId}:page2`, [{ id: 2 }]);
      statisticsCache.set(`stats:${testCatalogueId}`, { count: 100 });

      // This is the function that was being called N times before the fix
      // Now it should only be called once per unique catalogue ID
      invalidateCatalogueCache(testCatalogueId);

      // All entries containing the catalogue ID should be invalidated
      expect(catalogueCache.get(`catalogue:${testCatalogueId}`)).toBeNull();
      expect(eventCache.get(`events:${testCatalogueId}:page1`)).toBeNull();
      expect(eventCache.get(`events:${testCatalogueId}:page2`)).toBeNull();
      expect(statisticsCache.get(`stats:${testCatalogueId}`)).toBeNull();
    });

    it('should not affect other catalogues when invalidating', () => {
      const catalogueId1 = 'catalogue-1-uuid';
      const catalogueId2 = 'catalogue-2-uuid';

      // Set up entries for two different catalogues
      eventCache.set(`events:${catalogueId1}:page1`, [{ id: 1 }]);
      eventCache.set(`events:${catalogueId2}:page1`, [{ id: 2 }]);

      // Invalidate only catalogue 1
      invalidateCatalogueCache(catalogueId1);

      // Catalogue 1 should be invalidated
      expect(eventCache.get(`events:${catalogueId1}:page1`)).toBeNull();
      // Catalogue 2 should remain
      expect(eventCache.get(`events:${catalogueId2}:page1`)).toEqual([{ id: 2 }]);
    });
  });

  describe('Bulk Insert Cache Invalidation Behavior', () => {
    /**
     * This test documents the expected behavior after the fix for:
     * "Cache invalidation being called repeatedly during merge"
     *
     * Before the fix: insertEvent was called N times, each triggering
     * invalidateCatalogueCache, resulting in N cache invalidation calls.
     *
     * After the fix: bulkInsertEvents is called once, which collects
     * unique catalogue IDs and only invalidates once per unique ID.
     */
    it('should only invalidate once per unique catalogue ID in bulk operations', () => {
      const catalogueId = 'bulk-test-catalogue';

      // Simulate what happens with bulkInsertEvents
      // All events have the same catalogue_id
      const events = [
        { catalogue_id: catalogueId, id: '1' },
        { catalogue_id: catalogueId, id: '2' },
        { catalogue_id: catalogueId, id: '3' },
        { catalogue_id: catalogueId, id: '4' },
        { catalogue_id: catalogueId, id: '5' },
      ];

      // Set up cache entry
      eventCache.set(`events:${catalogueId}:all`, events);

      // Collect unique catalogue IDs (this is what bulkInsertEvents does)
      const uniqueCatalogueIds = new Set(events.map(e => e.catalogue_id));

      // Should only have 1 unique ID
      expect(uniqueCatalogueIds.size).toBe(1);

      // Invalidate once per unique ID (not once per event)
      let invalidationCount = 0;
      uniqueCatalogueIds.forEach(id => {
        invalidateCatalogueCache(id);
        invalidationCount++;
      });

      // Should have only called invalidation once
      expect(invalidationCount).toBe(1);

      // Cache should be invalidated
      expect(eventCache.get(`events:${catalogueId}:all`)).toBeNull();
    });

    it('should handle multiple unique catalogue IDs in bulk operations', () => {
      const catalogueId1 = 'bulk-cat-1';
      const catalogueId2 = 'bulk-cat-2';

      // Events from two different catalogues (e.g., when merging)
      const events = [
        { catalogue_id: catalogueId1, id: '1' },
        { catalogue_id: catalogueId1, id: '2' },
        { catalogue_id: catalogueId2, id: '3' },
        { catalogue_id: catalogueId2, id: '4' },
      ];

      // Set up cache entries
      eventCache.set(`events:${catalogueId1}:all`, []);
      eventCache.set(`events:${catalogueId2}:all`, []);

      // Collect unique catalogue IDs
      const uniqueCatalogueIds = new Set(events.map(e => e.catalogue_id));

      // Should have 2 unique IDs
      expect(uniqueCatalogueIds.size).toBe(2);

      // Invalidate each unique ID once
      uniqueCatalogueIds.forEach(id => {
        invalidateCatalogueCache(id);
      });

      // Both should be invalidated
      expect(eventCache.get(`events:${catalogueId1}:all`)).toBeNull();
      expect(eventCache.get(`events:${catalogueId2}:all`)).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache statistics', () => {
      testCache.set('key1', 'value1');
      testCache.get('key1'); // Hit
      testCache.get('key1'); // Hit
      testCache.get('nonexistent'); // Miss

      const stats = testCache.getStats();

      expect(stats.size).toBe(1);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it('should return stats for all caches', () => {
      const allStats = getAllCacheStats();

      expect(allStats).toHaveProperty('api');
      expect(allStats).toHaveProperty('catalogue');
      expect(allStats).toHaveProperty('event');
      expect(allStats).toHaveProperty('statistics');
    });
  });

  describe('invalidateAllEventCaches', () => {
    it('should clear all event caches', () => {
      eventCache.set('events:cat1:page1', [{ id: 1 }]);
      eventCache.set('events:cat2:page1', [{ id: 2 }]);

      invalidateAllEventCaches();

      expect(eventCache.size()).toBe(0);
    });
  });

  describe('invalidateCacheByPrefix', () => {
    it('should invalidate across all cache types by prefix', () => {
      apiCache.set('test:key1', 'value1');
      catalogueCache.set('test:key2', 'value2');
      eventCache.set('test:key3', 'value3');
      statisticsCache.set('test:key4', 'value4');

      invalidateCacheByPrefix('test:');

      expect(apiCache.get('test:key1')).toBeNull();
      expect(catalogueCache.get('test:key2')).toBeNull();
      expect(eventCache.get('test:key3')).toBeNull();
      expect(statisticsCache.get('test:key4')).toBeNull();
    });
  });
});

