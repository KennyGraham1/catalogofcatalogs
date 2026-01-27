/**
 * Duplicate Detection Tests
 *
 * Tests the duplicate detection logic including:
 * - Similarity score calculation
 * - Duplicate matching with various presets
 * - Edge cases (missing data, date line, etc.)
 * - findDuplicatePairs and groupDuplicates functions
 */

import {
  calculateSimilarityScore,
  areDuplicates,
  findDuplicatePairs,
  groupDuplicates,
  getPresetConfig,
  type DuplicateDetectionConfig,
} from '@/lib/duplicate-detection';

import { calculateDistance, calculateTimeDifference } from '@/lib/earthquake-utils';

describe('Duplicate Detection', () => {
  // Base test events
  const baseEvent = {
    id: 'event1',
    time: '2024-01-01T00:00:00.000Z',
    latitude: -41.0,
    longitude: 174.0,
    depth: 10,
    magnitude: 5.0,
  };

  describe('calculateSimilarityScore', () => {
    it('should return 1.0 for identical events', () => {
      const config = getPresetConfig('strict');
      const score = calculateSimilarityScore(baseEvent, baseEvent, config);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('should return high score for very similar events', () => {
      const similarEvent = {
        id: 'event2',
        time: '2024-01-01T00:00:03.000Z', // 3 seconds later (30% of 10s threshold)
        latitude: -41.02, // ~2 km away (20% of 10km threshold)
        longitude: 174.02,
        depth: 11, // 1 km diff (10% of 10km threshold)
        magnitude: 5.05, // 0.05 diff (17% of 0.3 threshold)
      };
      const config = getPresetConfig('strict');
      const score = calculateSimilarityScore(baseEvent, similarEvent, config);
      // With Gaussian decay, events well within thresholds should score high
      expect(score).toBeGreaterThan(0.85);
    });

    it('should return ~0.5 for events at threshold boundaries', () => {
      const thresholdEvent = {
        id: 'event2',
        time: '2024-01-01T00:00:10.000Z', // 10 seconds (exactly at threshold)
        latitude: -41.09, // ~10 km away (approximately at threshold)
        longitude: 174.0,
        depth: 20, // 10 km diff (at threshold)
        magnitude: 5.3, // 0.3 diff (at threshold)
      };
      const config = getPresetConfig('strict');
      const score = calculateSimilarityScore(baseEvent, thresholdEvent, config);
      // At thresholds, each component should be ~0.5, so weighted avg should be ~0.5
      expect(score).toBeGreaterThan(0.4);
      expect(score).toBeLessThan(0.6);
    });

    it('should return low score for events well beyond thresholds', () => {
      const differentEvent = {
        id: 'event3',
        time: '2024-01-01T01:00:00.000Z', // 1 hour later
        latitude: -42.0, // ~111 km away
        longitude: 175.0,
        depth: 50,
        magnitude: 6.5,
      };
      const config = getPresetConfig('strict');
      const score = calculateSimilarityScore(baseEvent, differentEvent, config);
      expect(score).toBeLessThan(0.3);
    });

    it('should handle null depth gracefully', () => {
      const nullDepthEvent = {
        id: 'event4',
        time: '2024-01-01T00:00:03.000Z',
        latitude: -41.02,
        longitude: 174.02,
        depth: null,
        magnitude: 5.1,
      };
      const config = getPresetConfig('strict');

      // Should not throw and should redistribute depth weight
      const score = calculateSimilarityScore(baseEvent, nullDepthEvent, config);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThan(0.7); // Should still be high
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle undefined depth gracefully', () => {
      const undefinedDepthEvent = {
        id: 'event5',
        time: '2024-01-01T00:00:03.000Z',
        latitude: -41.02,
        longitude: 174.02,
        depth: undefined,
        magnitude: 5.1,
      };
      const config = getPresetConfig('strict');

      const score = calculateSimilarityScore(baseEvent, undefinedDepthEvent, config);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThan(0.7);
    });

    it('should use magnitude-dependent threshold when configured', () => {
      const largeEvent1 = { ...baseEvent, magnitude: 7.0 };
      const largeEvent2 = {
        ...baseEvent,
        id: 'event6',
        time: '2024-01-01T00:00:10.000Z',
        latitude: -41.1, // ~11 km away
        longitude: 174.1,
        magnitude: 7.1,
      };

      const configWithMagDep = getPresetConfig('moderate'); // Uses magnitude-dependent threshold
      const configWithoutMagDep = getPresetConfig('strict'); // Doesn't use it

      const scoreWithMagDep = calculateSimilarityScore(largeEvent1, largeEvent2, configWithMagDep);
      const scoreWithoutMagDep = calculateSimilarityScore(largeEvent1, largeEvent2, configWithoutMagDep);

      // With magnitude-dependent threshold, score should be higher (more lenient)
      expect(scoreWithMagDep).toBeGreaterThan(scoreWithoutMagDep);
    });
  });

  describe('areDuplicates', () => {
    it('should detect identical events as duplicates with high confidence', () => {
      const config = getPresetConfig('strict');
      const match = areDuplicates(baseEvent, baseEvent, config);
      expect(match).not.toBeNull();
      expect(match?.confidence).toBe('high');
      expect(match?.similarityScore).toBeCloseTo(1.0, 2);
    });

    it('should detect very similar events as duplicates', () => {
      const similarEvent = {
        id: 'event2',
        time: '2024-01-01T00:00:03.000Z',
        latitude: -41.01,
        longitude: 174.01,
        depth: 11,
        magnitude: 5.1,
      };
      const config = getPresetConfig('moderate');
      const match = areDuplicates(baseEvent, similarEvent, config);
      expect(match).not.toBeNull();
      expect(match?.distanceKm).toBeLessThan(5);
      expect(match?.timeDifferenceSeconds).toBe(3);
    });

    it('should NOT detect very different events as duplicates', () => {
      const differentEvent = {
        id: 'event3',
        time: '2024-01-01T02:00:00.000Z', // 2 hours later
        latitude: -43.0, // ~222 km away
        longitude: 176.0,
        depth: 100,
        magnitude: 7.0,
      };
      const config = getPresetConfig('loose');
      const match = areDuplicates(baseEvent, differentEvent, config);
      expect(match).toBeNull();
    });

    it('should handle null input gracefully', () => {
      const config = getPresetConfig('strict');
      // Use type assertions since the function handles null at runtime but types don't allow it
      expect(areDuplicates(null as unknown as typeof baseEvent, baseEvent, config)).toBeNull();
      expect(areDuplicates(baseEvent, null as unknown as typeof baseEvent, config)).toBeNull();
      expect(areDuplicates(null as unknown as typeof baseEvent, null as unknown as typeof baseEvent, config)).toBeNull();
    });

    it('should handle events without time gracefully', () => {
      // Use type assertion since the function handles missing time at runtime
      const noTimeEvent = { ...baseEvent, time: undefined as unknown as string };
      const config = getPresetConfig('strict');
      expect(areDuplicates(baseEvent, noTimeEvent, config)).toBeNull();
    });
  });

  describe('findDuplicatePairs', () => {
    it('should find duplicate pairs in a list of events', () => {
      const events = [
        baseEvent,
        { ...baseEvent, id: 'event2', time: '2024-01-01T00:00:03.000Z' },
        { ...baseEvent, id: 'event3', time: '2024-01-01T01:00:00.000Z', latitude: -42.0 }, // Different
      ];
      const config = getPresetConfig('strict');
      const pairs = findDuplicatePairs(events, config);

      expect(pairs.length).toBe(1);
      expect(pairs[0].event1Id).toBe('event1');
      expect(pairs[0].event2Id).toBe('event2');
    });

    it('should return empty array for single event', () => {
      const config = getPresetConfig('strict');
      const pairs = findDuplicatePairs([baseEvent], config);
      expect(pairs).toEqual([]);
    });

    it('should return empty array for empty list', () => {
      const config = getPresetConfig('strict');
      const pairs = findDuplicatePairs([], config);
      expect(pairs).toEqual([]);
    });
  });

  describe('groupDuplicates', () => {
    it('should group duplicate events together', () => {
      const events = [
        baseEvent,
        { ...baseEvent, id: 'event2', time: '2024-01-01T00:00:03.000Z' },
        { ...baseEvent, id: 'event3', time: '2024-01-01T00:00:06.000Z' },
      ];
      const config = getPresetConfig('strict');
      const groups = groupDuplicates(events, config);

      expect(groups.length).toBe(1);
      expect(groups[0].events.length).toBe(3);
    });

    it('should not group non-duplicates', () => {
      const events = [
        baseEvent,
        { ...baseEvent, id: 'event2', time: '2024-01-01T02:00:00.000Z', latitude: -43.0 },
      ];
      const config = getPresetConfig('strict');
      const groups = groupDuplicates(events, config);

      expect(groups.length).toBe(0);
    });

    it('should handle events without IDs', () => {
      const events = [
        { time: '2024-01-01T00:00:00.000Z', latitude: -41.0, longitude: 174.0, depth: 10, magnitude: 5.0 },
        { time: '2024-01-01T00:00:03.000Z', latitude: -41.0, longitude: 174.0, depth: 10, magnitude: 5.0 },
      ];
      const config = getPresetConfig('strict');
      const groups = groupDuplicates(events, config);

      expect(groups.length).toBe(1);
      expect(groups[0].events.length).toBe(2);
    });
  });

  describe('Date Line Handling', () => {
    it('should correctly calculate distance across date line', () => {
      const eventEast = {
        id: 'eventEast',
        time: '2024-01-01T00:00:00.000Z',
        latitude: -41.0,
        longitude: 179.9,
        depth: 10,
        magnitude: 5.0,
      };

      const eventWest = {
        id: 'eventWest',
        time: '2024-01-01T00:00:00.000Z',
        latitude: -41.0,
        longitude: -179.9,
        depth: 10,
        magnitude: 5.0,
      };

      // Distance across date line should be ~17 km, not ~40000 km
      const distance = calculateDistance(
        eventEast.latitude, eventEast.longitude,
        eventWest.latitude, eventWest.longitude
      );

      expect(distance).toBeLessThan(25); // Should be around 17 km
      expect(distance).toBeGreaterThan(10);
    });

    it('should detect duplicates across date line', () => {
      const eventEast = {
        id: 'eventEast',
        time: '2024-01-01T00:00:00.000Z',
        latitude: -41.0,
        longitude: 179.9,
        depth: 10,
        magnitude: 5.0,
      };

      const eventWest = {
        id: 'eventWest',
        time: '2024-01-01T00:00:00.000Z',
        latitude: -41.0,
        longitude: -179.9,
        depth: 10,
        magnitude: 5.0,
      };

      // With moderate config (25km threshold), these should be duplicates
      const config = getPresetConfig('moderate');
      const match = areDuplicates(eventEast, eventWest, config);
      expect(match).not.toBeNull();
    });
  });

  describe('Preset Configurations', () => {
    it('strict preset should have tight thresholds', () => {
      const config = getPresetConfig('strict');
      expect(config.timeThresholdSeconds).toBe(10);
      expect(config.distanceThresholdKm).toBe(10);
      expect(config.minimumSimilarityScore).toBe(0.85);
    });

    it('moderate preset should have medium thresholds', () => {
      const config = getPresetConfig('moderate');
      expect(config.timeThresholdSeconds).toBe(30);
      expect(config.distanceThresholdKm).toBe(25);
      expect(config.minimumSimilarityScore).toBe(0.70);
      expect(config.useMagnitudeDependentThreshold).toBe(true);
    });

    it('loose preset should have relaxed thresholds', () => {
      const config = getPresetConfig('loose');
      expect(config.timeThresholdSeconds).toBe(60);
      expect(config.distanceThresholdKm).toBe(50);
      expect(config.minimumSimilarityScore).toBe(0.60);
    });
  });
});

