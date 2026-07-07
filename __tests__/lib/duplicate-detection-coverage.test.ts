/**
 * Coverage + regression tests for lib/duplicate-detection.ts, added alongside the review
 * fixes: magnitude-dependent threshold tiers, representative/confidence selection, the
 * time-based early-termination bug, stable-id collisions, and the confidence id-scheme bug.
 */

import {
  getMagnitudeDependentThreshold,
  getPresetConfig,
  findDuplicatePairs,
  groupDuplicates,
  selectRepresentativeEvent,
  determineGroupConfidence,
} from '@/lib/duplicate-detection';

const base = (overrides: Record<string, any> = {}): any => ({
  time: '2024-01-01T00:00:00.000Z',
  latitude: -41.0,
  longitude: 174.0,
  depth: 10,
  magnitude: 5.0,
  ...overrides,
});

describe('getMagnitudeDependentThreshold — tier boundaries', () => {
  const b = 10;
  it.each([
    [2.9, 0.8],
    [3.0, 1.0],
    [3.9, 1.0],
    [4.0, 1.5],
    [4.9, 1.5],
    [5.0, 2.0],
    [5.9, 2.0],
    [6.0, 3.0],
    [6.9, 3.0],
    [7.0, 4.0],
  ])('M%p → %p× base', (mag, mult) => {
    expect(getMagnitudeDependentThreshold(mag as number, b)).toBeCloseTo(b * (mult as number), 5);
  });
});

describe('early-termination does not skip far-in-time duplicates (regression)', () => {
  it('detects an identical-location/mag/depth pair beyond the time cutoff (moderate preset)', () => {
    // Moderate preset: minimumSimilarityScore 0.70, nonTimeMax 0.70 → no safe time cutoff.
    const config = getPresetConfig('moderate');
    const events = [
      base({ id: 'a', time: '2024-01-01T00:00:00.000Z' }),
      // 3 minutes later — well beyond the old (timeThreshold × 4) cutoff — but identical otherwise.
      base({ id: 'b', time: '2024-01-01T00:03:00.000Z' }),
    ];
    const pairs = findDuplicatePairs(events, config);
    expect(pairs).toHaveLength(1);
  });

  it('detects a far-in-time pair under the loose preset', () => {
    const config = getPresetConfig('loose');
    const events = [
      base({ id: 'a', time: '2024-01-01T00:00:00.000Z' }),
      base({ id: 'b', time: '2024-01-01T00:05:00.000Z' }), // 5 minutes later
    ];
    expect(findDuplicatePairs(events, config)).toHaveLength(1);
  });
});

describe('stable-id collisions do not drop a group (regression)', () => {
  it('groups two distinct rows sharing the same event_public_id', () => {
    const config = getPresetConfig('moderate');
    const events = [
      base({ event_public_id: '2016p858000', time: '2024-01-01T00:00:00.000Z', source: 'GeoNet' }),
      base({ event_public_id: '2016p858000', time: '2024-01-01T00:00:05.000Z', latitude: -41.01, source: 'USGS' }),
    ];
    const groups = groupDuplicates(events, config);
    expect(groups).toHaveLength(1);
    expect(groups[0].events).toHaveLength(2);
  });
});

describe('selectRepresentativeEvent', () => {
  it('prefers a reviewed solution over an automatic one', () => {
    const events = [
      base({ id: 'auto', evaluation_status: 'automatic', used_station_count: 40 }),
      base({ id: 'reviewed', evaluation_status: 'reviewed', used_station_count: 12 }),
    ];
    expect(selectRepresentativeEvent(events).id).toBe('reviewed');
  });
});

describe('determineGroupConfidence — id scheme (regression)', () => {
  it('returns a real (non-low) confidence for id-less events grouped as high-quality duplicates', () => {
    // No id / event_public_id → ensureEventIds assigns generated positional ids; the
    // confidence must be computed using those same ids, not `id || event_public_id`.
    const config = getPresetConfig('moderate');
    const events = [
      base({ time: '2024-01-01T00:00:00.000Z', source: 'GeoNet' }),
      base({ time: '2024-01-01T00:00:01.000Z', latitude: -41.001, source: 'USGS' }),
    ];
    const groups = groupDuplicates(events, config);
    expect(groups).toHaveLength(1);
    // Near-identical events → high pairwise confidence → group confidence must not be 'low'.
    expect(groups[0].confidence).not.toBe('low');
  });
});
