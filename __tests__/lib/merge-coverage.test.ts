/**
 * Coverage + regression tests for the merge engine's core matching/grouping/selection code,
 * added alongside the review fixes. These exercise the functions that decide what actually
 * gets merged and written — previously exported "for testing" but largely untested — plus
 * the specific bugs the review fixed (antimeridian candidate search, missing-magnitude
 * threshold corruption, magnitude/focal-mechanism selection, preview↔persist parity).
 */

import {
  createSpatialIndex,
  getGridKey,
  getNearbyCells,
  eventsMatchAdaptive,
  getDistanceMultiplier,
  getTimeMultiplier,
  regroupFailedEvents,
  groupMatchingEvents,
  performMergeWithGroups,
  mergeEventGroup,
  mergeByAverage,
  mergeByNewest,
  mergeByPriority,
  selectBestMagnitude,
  selectBestDepth,
  getMagnitudePriority,
  magnitudesEquivalent,
  convertMbtoMw,
  convertMstoMw,
  convertMLtoMw,
  getFocalMechanismPriority,
  selectBestFocalMechanism,
  calculateFocalMechanismQuality,
  calculateQualityScore,
  getNetworkPriority,
} from '@/lib/merge';

const ev = (overrides: Partial<any> = {}): any => ({
  id: 'e',
  time: '2024-01-15T10:30:00.000Z',
  latitude: 0,
  longitude: 0,
  depth: 10,
  magnitude: 3.0,
  source: 'TestSource',
  ...overrides,
});

const config = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'newest' } as any;

describe('getNearbyCells — antimeridian seam (regression)', () => {
  it('offers a duplicate across ±180 as a candidate cell', () => {
    // Same event reported at +179.95 and -179.95 (~9.6 km apart at lat -30, < 10 km).
    const a = ev({ latitude: -30, longitude: 179.95 });
    const b = ev({ latitude: -30, longitude: -179.95 });
    const index = createSpatialIndex([a, b], 10);
    const keyB = getGridKey(b.latitude, b.longitude, index.cellSize);
    const nearbyOfA = getNearbyCells(a.latitude, a.longitude, index.cellSize, 1);
    expect(nearbyOfA).toContain(keyB);
  });

  it('keeps the standard 3×3 neighbourhood away from the seam', () => {
    expect(getNearbyCells(0, 0, 1.0, 1)).toHaveLength(9);
  });

  it('expands to (2r+1)^2 cells for radiusCells=2 away from the seam', () => {
    expect(getNearbyCells(0, 0, 1.0, 2)).toHaveLength(25);
  });
});

describe('eventsMatchAdaptive (untested core predicate)', () => {
  it('matches a large/deep pair at a distance a small/shallow pair would not', () => {
    // ~25 km apart at the equator (0.2247°).
    const big1 = ev({ magnitude: 7.2, depth: 350, longitude: 0 });
    const big2 = ev({ magnitude: 7.2, depth: 350, longitude: 0.2247 });
    expect(eventsMatchAdaptive(big1, big2, 60, 10)).toBe(true); // 10 × 4.0 × 1.5 = 60 km window

    const small1 = ev({ magnitude: 3.0, depth: 10, longitude: 0 });
    const small2 = ev({ magnitude: 3.0, depth: 10, longitude: 0.2247 });
    expect(eventsMatchAdaptive(small1, small2, 60, 10)).toBe(false); // 10 km window
  });

  it('missing magnitude does not over-widen (undefined → NaN) or deflate (null) thresholds', () => {
    // Two distinct events ~30 km apart. With NaN/null coercion bugs these could over-merge.
    const a = ev({ magnitude: undefined, longitude: 0 });
    const b = ev({ magnitude: undefined, longitude: 0.27 }); // ~30 km
    expect(eventsMatchAdaptive(a, b, 60, 10)).toBe(false);

    // A real M7 paired with a null-magnitude duplicate should still use the M7 widening.
    const big = ev({ magnitude: 7.2, longitude: 0 });
    const nullMag = ev({ magnitude: null, longitude: 0.2247 }); // ~25 km
    expect(eventsMatchAdaptive(big, nullMag, 60, 10)).toBe(true);
  });
});

describe('getDistanceMultiplier / getTimeMultiplier — non-finite guards (regression)', () => {
  it('returns 1.0 (base) for NaN/undefined instead of the max else-branch', () => {
    expect(getDistanceMultiplier(NaN)).toBe(1.0);
    expect(getDistanceMultiplier(undefined as any)).toBe(1.0);
    expect(getTimeMultiplier(NaN)).toBe(1.0);
  });
});

describe('regroupFailedEvents (connected-components salvage)', () => {
  it('keeps a transitive chain A~B, B~C (A≁C) in one component', () => {
    // Distinct sources so validateEventGroup's network_mismatch check does not split them.
    const a = ev({ id: 'a', source: 'A', longitude: 0, magnitude: 3 });
    const b = ev({ id: 'b', source: 'B', longitude: 0.0719, magnitude: 3 }); // ~8 km from A
    const c = ev({ id: 'c', source: 'C', longitude: 0.1438, magnitude: 3 }); // ~8 km from B, ~16 km from A
    const groups = regroupFailedEvents([a, b, c], config);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('splits a matched pair + an isolated event into two sub-groups', () => {
    const a = ev({ id: 'a', source: 'A', longitude: 0, magnitude: 3 });
    const b = ev({ id: 'b', source: 'B', longitude: 0.0719, magnitude: 3 }); // ~8 km
    const d = ev({ id: 'd', source: 'C', longitude: 5, magnitude: 3 }); // far away
    const groups = regroupFailedEvents([a, b, d], config);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.length).sort()).toEqual([1, 2]);
  });

  it('emits singletons when a matched pair still fails validation', () => {
    const a = ev({ id: 'a', source: 'A', longitude: 0, magnitude: 3.0 });
    const b = ev({ id: 'b', source: 'B', longitude: 0.0719, magnitude: 7.0 }); // matches spatially, mag range 4
    const groups = regroupFailedEvents([a, b], config);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.length === 1)).toBe(true);
  });
});

describe('merge strategies', () => {
  it('mergeByAverage keeps the hierarchy magnitude (Mw), not the arithmetic mean', () => {
    const a = ev({ magnitude: 7.0, quakeml: { magnitudes: [{ type: 'Mw', mag: { value: 7.0 } }] } });
    const b = ev({ magnitude: 6.5, longitude: 0.05, quakeml: { magnitudes: [{ type: 'ML', mag: { value: 6.5 } }] } });
    const merged = mergeByAverage([a, b]);
    expect(merged.magnitude).toBe(7.0); // not (7.0 + 6.5) / 2
    expect((merged.magnitude_type || '').toLowerCase()).toBe('mw');
  });

  it('mergeByNewest selects the latest event', () => {
    const older = ev({ id: 'old', time: '2024-01-15T10:00:00.000Z' });
    const newer = ev({ id: 'new', time: '2024-01-15T12:00:00.000Z' });
    const merged = mergeByNewest([older, newer]);
    expect(merged.time).toBe(newer.time);
  });

  it('mergeByPriority "authority" prefers the more authoritative network', () => {
    const geonet = ev({ id: 'g', source: 'GeoNet', latitude: -41, longitude: 174 });
    const usgs = ev({ id: 'u', source: 'USGS', latitude: -41, longitude: 174 });
    const merged = mergeByPriority([usgs, geonet], 'authority');
    expect(merged.source).toBe('GeoNet');
  });
});

describe('selectBestMagnitude — includes top-level magnitudes (regression)', () => {
  it('prefers a top-level Mw over another event\'s QuakeML mb', () => {
    const iscMb = ev({ id: 'isc', source: 'ISC', magnitude: 5.0, quakeml: { magnitudes: [{ type: 'mb', mag: { value: 5.0 } }] } });
    const geonetMw = ev({ id: 'gn', source: 'GeoNet', magnitude: 5.2, magnitude_type: 'Mw' }); // no quakeml array
    const best = selectBestMagnitude([iscMb, geonetMw]);
    expect(best.value).toBe(5.2);
    expect(best.type.toLowerCase()).toBe('mw');
  });
});

describe('getMagnitudePriority — category fallback (regression)', () => {
  it('classifies composite/unlisted labels by prefix instead of "unknown"', () => {
    expect(getMagnitudePriority('Mw(mB)')).toBe(1);
    expect(getMagnitudePriority('MLc')).toBe(4);
    expect(getMagnitudePriority('mbLg')).toBe(3);
    expect(getMagnitudePriority('totally-bogus')).toBe(100);
  });
});

describe('selectBestDepth — station-count tie-break (untested)', () => {
  it('prefers more stations when depth uncertainties are within 5 km', () => {
    const few = ev({ id: 'few', depth: 12, quakeml: { preferredOriginID: 'o1', origins: [{ publicID: 'o1', depth: { uncertainty: 3 }, quality: { usedStationCount: 5 } }] } });
    const many = ev({ id: 'many', depth: 20, quakeml: { preferredOriginID: 'o2', origins: [{ publicID: 'o2', depth: { uncertainty: 4 }, quality: { usedStationCount: 40 } }] } });
    expect(selectBestDepth([few, many])).toBe(20);
  });
});

describe('magnitudesEquivalent — inclusive boundary (untested)', () => {
  it('is inclusive at diff == uncertainty + tolerance', () => {
    expect(magnitudesEquivalent(5.0, 'Mw', 5.3, 'Mw', 0.3)).toBe(true); // diff 0.3, unc 0, tol 0.3
    expect(magnitudesEquivalent(5.0, 'Mw', 5.31, 'Mw', 0.3)).toBe(false);
  });
});

describe('magnitude conversions — out-of-range handling (regression)', () => {
  it('convertMbtoMw widens uncertainty beyond the calibrated range', () => {
    expect(convertMbtoMw(7.0).uncertainty).toBeGreaterThan(convertMbtoMw(5.0).uncertainty);
  });

  it('convertMstoMw switches formula at Ms = 6.2', () => {
    expect(convertMstoMw(6.19).value).toBeCloseTo(0.67 * 6.19 + 2.07, 2);
    expect(convertMstoMw(6.2).value).toBeCloseTo(0.99 * 6.2 + 0.08, 2);
  });

  it('convertMLtoMw is near-identity for moderate magnitudes (no downward bias)', () => {
    expect(convertMLtoMw(5.0).value).toBeCloseTo(5.0, 2);
  });
});

describe('focal-mechanism selection (regression)', () => {
  it('classifies "GeoNet CMT" as regional (2), not Global CMT (1)', () => {
    expect(getFocalMechanismPriority('GeoNet CMT')).toBe(2);
    expect(getFocalMechanismPriority('GCMT')).toBe(1);
  });

  it('falls back to the first mechanism when preferredFocalMechanismID is dangling', () => {
    const event = ev({
      quakeml: {
        preferredFocalMechanismID: 'does-not-exist',
        focalMechanisms: [{ publicID: 'fm-real', stationPolarityCount: 30 }],
      },
    });
    const fm = selectBestFocalMechanism([event]);
    expect(fm).not.toBeNull();
    expect(fm!.publicID).toBe('fm-real');
  });

  it('calculateFocalMechanismQuality rewards completeness (fixed budget)', () => {
    const sparse: any = { stationPolarityCount: 50 };
    const rich: any = { stationPolarityCount: 50, misfit: 0.2, momentTensor: { varianceReduction: 0.7 }, azimuthalGap: 130, evaluationStatus: 'reviewed' };
    expect(calculateFocalMechanismQuality(rich)).toBeGreaterThan(calculateFocalMechanismQuality(sparse));
    expect(calculateFocalMechanismQuality(sparse)).toBeLessThan(100);
  });
});

describe('calculateQualityScore — fixed-budget normalization (regression)', () => {
  it('a sparse-but-good event does not outrank a fully-documented one', () => {
    const sparse = ev({ quakeml: { preferredOriginID: 'o', origins: [{ publicID: 'o', quality: { usedStationCount: 30 } }] } });
    const rich = ev({
      quakeml: {
        preferredOriginID: 'o', preferredMagnitudeID: 'm',
        origins: [{ publicID: 'o', evaluationStatus: 'reviewed', quality: { usedStationCount: 30, azimuthalGap: 100, standardError: 0.2 } }],
        magnitudes: [{ publicID: 'm', type: 'Mw', mag: { value: 5, uncertainty: 0.1 } }],
      },
    });
    expect(calculateQualityScore(rich)).toBeGreaterThan(calculateQualityScore(sparse));
  });
});

describe('getNetworkPriority — NZ antimeridian region (regression)', () => {
  it('treats a Chatham Islands GeoNet event (lon -176.4) as region NZ', () => {
    const chatham = ev({ latitude: -44, longitude: -176.4, source: 'GeoNet' });
    expect(getNetworkPriority('GeoNet', chatham)).toBe(1);
  });
});

describe('preview ↔ persist parity (regression)', () => {
  it('performMergeWithGroups produces one preview group per merged output event', () => {
    // Two duplicate pairs + one singleton across a small set.
    const events = [
      ev({ id: 'a1', source: 'GeoNet', time: '2024-01-15T10:00:00.000Z', longitude: 0, magnitude: 4 }),
      ev({ id: 'a2', source: 'USGS', time: '2024-01-15T10:00:10.000Z', longitude: 0.02, magnitude: 4 }),
      ev({ id: 'b1', source: 'GeoNet', time: '2024-01-15T11:00:00.000Z', longitude: 2, magnitude: 4 }),
      ev({ id: 'b2', source: 'USGS', time: '2024-01-15T11:00:10.000Z', longitude: 2.02, magnitude: 4 }),
      ev({ id: 'solo', source: 'ISC', time: '2024-01-15T12:00:00.000Z', longitude: 5, magnitude: 4 }),
    ];
    const matchGroups = groupMatchingEvents(events, config);
    const mergedCount = matchGroups.length;
    const previewGroups = performMergeWithGroups(events, config);
    // 1:1 correspondence — preview stats (totalEventsAfter = previewGroups.length) match persist.
    expect(previewGroups).toHaveLength(mergedCount);
    // Every preview group's selected index is a valid member index.
    for (const g of previewGroups) {
      expect(g.selectedEventIndex).toBeGreaterThanOrEqual(0);
      expect(g.selectedEventIndex).toBeLessThan(g.events.length);
    }
  });
});

describe('unionMergeFields — magnitude metadata atomicity (regression, via mergeEventGroup)', () => {
  it('does not stamp a different source\'s magnitude_type onto the merged magnitude value', () => {
    // Base (priority=newest) is the ML event with no magnitude_type; another source reports Mw.
    const mlBase = ev({ id: 'ml', time: '2024-01-15T12:00:00.000Z', magnitude: 5.2, magnitude_type: null, longitude: 0, source: 'A' });
    const mwOther = ev({ id: 'mw', time: '2024-01-15T10:00:00.000Z', magnitude: 6.1, magnitude_type: 'Mw', longitude: 0.02, source: 'B' });
    const merged = mergeEventGroup([mlBase, mwOther], { ...config, mergeStrategy: 'priority', priority: 'newest' } as any);
    // Newest (mlBase) supplies the value 5.2; its type must NOT be grafted to 'Mw' from mwOther.
    expect(merged.magnitude).toBe(5.2);
    expect(merged.magnitude_type == null || merged.magnitude_type.toLowerCase() !== 'mw').toBe(true);
  });

  it('does not mislabel when another source coincidentally reports the SAME value with a different type', () => {
    // Base value 5.0 has no type; a higher-quality source reports 5.0 as 'Mw'. Matching on value
    // alone would graft 'Mw' onto the base's untyped 5.0 — it must not.
    const untypedBase = ev({
      id: 'base', time: '2024-01-15T12:00:00.000Z', magnitude: 5.0, magnitude_type: null, longitude: 0, source: 'A',
    });
    const mwSameValue = ev({
      id: 'mw', time: '2024-01-15T10:00:00.000Z', magnitude: 5.0, magnitude_type: 'Mw', longitude: 0.02, source: 'B',
      // higher quality so it ranks first in unionMergeFields
      quakeml: { preferredOriginID: 'o', origins: [{ publicID: 'o', evaluationStatus: 'reviewed', quality: { usedStationCount: 40, azimuthalGap: 80, standardError: 0.15 } }] },
    });
    const merged = mergeEventGroup([untypedBase, mwSameValue], { ...config, mergeStrategy: 'priority', priority: 'newest' } as any);
    expect(merged.magnitude).toBe(5.0);
    expect(merged.magnitude_type == null || merged.magnitude_type.toLowerCase() !== 'mw').toBe(true);
  });
});
