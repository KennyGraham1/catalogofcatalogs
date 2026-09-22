/**
 * Regression tests for the merge-cluster review fixes.
 *
 * Every expected value below is derived by hand from the documented rubric / published
 * relation named in the comment, NOT by running the code and recording its output.
 */

import {
  calculateQualityScore,
  mergeByQuality,
  mergeByAverage,
  mergeEventGroup,
  regroupFailedEvents,
  groupMatchingEvents,
  selectBestDepth,
  validateEventGroup,
  getMergeConflictLog,
} from '@/lib/merge';

const config: any = { timeThreshold: 30, distanceThreshold: 30, mergeStrategy: 'quality', priority: 'quality' };

// ---------------------------------------------------------------------------
// calculateQualityScore: flat MergedEvent columns (the only shape merge ever sees)
// ---------------------------------------------------------------------------

describe('calculateQualityScore — flat DB columns (regression)', () => {
  // A stored MergedEvent has no `quakeml` object: the upload routes strip it before insert.
  const wellConstrained: any = {
    id: 'gn', time: '2020-01-01T00:00:00.000Z', latitude: -41, longitude: 174, depth: 10,
    magnitude: 4.4, source: 'GeoNet',
    used_station_count: 120, azimuthal_gap: 45, standard_error: 0.15,
    magnitude_type: 'Mw', magnitude_uncertainty: 0.05, evaluation_status: 'reviewed',
  };
  const poorlyConstrained: any = {
    id: 'isc', time: '2020-01-01T00:00:01.000Z', latitude: -41.001, longitude: 174.001, depth: 11,
    magnitude: 4.4, source: 'ISC',
    used_station_count: 3, azimuthal_gap: 310, standard_error: 2.9,
    magnitude_type: 'Md', magnitude_uncertainty: 0.9, evaluation_status: 'preliminary',
  };

  it('scores a quakeml-free event from its flat columns, not the 25-point fallback', () => {
    // Rubric (docstring): stations 25 + gap 20 + RMS 15 + mag unc 15 + mag type 15 + status 10.
    // 120 stations: 25 * log2(121)/log2(32) = 25 * 6.919/5 = 34.6 -> capped at 25.
    // gap 45 <= 120 -> 20 | RMS 0.15 <= 0.3 -> 15 | mag unc 0.05 <= 0.1 -> 15
    // Mw -> 15 | reviewed -> 10.   Total 100.
    expect(calculateQualityScore(wellConstrained)).toBeCloseTo(100, 6);

    // 3 stations: 25 * log2(4)/log2(32) = 25 * 2/5 = 10 exactly.
    // gap 310 > 270 -> 0 | RMS 2.9 > 2.0 -> 0 | mag unc 0.9 > 0.5 -> 0
    // Md -> 3 | preliminary -> 2.   Total 15.
    expect(calculateQualityScore(poorlyConstrained)).toBeCloseTo(15, 6);
  });

  it('mergeByQuality picks the better-constrained record regardless of input order', () => {
    expect(mergeByQuality([poorlyConstrained, wellConstrained]).source).toBe('GeoNet');
    expect(mergeByQuality([wellConstrained, poorlyConstrained]).source).toBe('GeoNet');
  });
});

// ---------------------------------------------------------------------------
// regroupFailedEvents: real salvage instead of an unconditional singleton explosion
// ---------------------------------------------------------------------------

describe('regroupFailedEvents — salvages the consistent sub-group (regression)', () => {
  // One M~4.4 cluster, all three within 3 s / 3 km, so all three match the anchor and the
  // match graph is a star -> the connected-component pass alone can never split it.
  const A: any = { id: 'A', time: '2020-01-01T00:00:00.000Z', latitude: -41.0, longitude: 174.0, depth: 10, magnitude: 4.0, source: 'ISC' };
  const B: any = { id: 'B', time: '2020-01-01T00:00:01.000Z', latitude: -41.005, longitude: 174.005, depth: 10, magnitude: 4.3, source: 'GeoNet' };
  const C: any = { id: 'C', time: '2020-01-01T00:00:02.000Z', latitude: -41.01, longitude: 174.01, depth: 10, magnitude: 5.0, source: 'USGS' };

  it('the group is genuinely inconsistent but the A/B pair is not', () => {
    // avg(4.0,4.3,5.0) = 4.433 -> gate 0.8; range 1.0 > 0.8 -> reject.
    expect(validateEventGroup([A, B, C])).toBe(false);
    // avg(4.0,4.3) = 4.15 -> gate 0.8; range 0.3 <= 0.8 -> accept.
    expect(validateEventGroup([A, B])).toBe(true);
  });

  it('splits {A,B,C} into {A,B} + {C} instead of three singletons', () => {
    const subGroups = regroupFailedEvents([A, B, C], config);
    expect(subGroups.map(g => g.map((e: any) => e.id))).toEqual([['A', 'B'], ['C']]);
  });

  it('groupMatchingEvents therefore yields 2 output events, not 3', () => {
    const groups = groupMatchingEvents([A, B, C], config);
    expect(groups.map(g => g.events.map((e: any) => e.id))).toEqual([['A', 'B'], ['C']]);
  });

  it('a pair that cannot be salvaged still becomes singletons', () => {
    const small: any = { ...A, id: 's', magnitude: 3.0, source: 'X' };
    const big: any = { ...B, id: 'b', magnitude: 7.0, source: 'Y' };
    const subGroups = regroupFailedEvents([small, big], config);
    expect(subGroups.map(g => g.length)).toEqual([1, 1]);
  });

  it('speculative trial validations are not written to the QC conflict log', () => {
    const log = getMergeConflictLog();
    log.clear();
    groupMatchingEvents([A, B, C], config);
    // Exactly two real rejections of {A,B,C}: the one in groupMatchingEvents and the
    // component re-check in regroupFailedEvents. The greedy trial of {A,B,C} inside
    // splitInconsistentGroup must stay silent (it would make three).
    expect(log.getConflictsByType('magnitude_range')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// mergeByAverage: metadata must describe the values actually published
// ---------------------------------------------------------------------------

describe('mergeByAverage — magnitude/location/depth metadata provenance (regression)', () => {
  const geonet: any = {
    id: 'gn', time: '2020-01-01T00:00:00.000Z', latitude: -41.0, longitude: 174.0, depth: 10,
    magnitude: 5.4, magnitude_type: 'ML', source: 'GeoNet',
    magnitude_uncertainty: 0.08, magnitude_station_count: 40,
    horizontal_uncertainty: 1.2, latitude_uncertainty: 0.01,
    used_station_count: 60, azimuthal_gap: 50, standard_error: 0.2, evaluation_status: 'reviewed',
  };
  const usgs: any = {
    id: 'us', time: '2020-01-01T00:00:02.000Z', latitude: -41.2, longitude: 174.3, depth: 12,
    magnitude: 5.9, magnitude_type: 'Mw', source: 'USGS',
    magnitude_uncertainty: 0.06, magnitude_station_count: 12,
  };

  it('carries the magnitude metadata of the source that reported the selected magnitude', () => {
    const merged: any = mergeEventGroup([geonet, usgs], { ...config, mergeStrategy: 'average' });
    // Mw outranks ML in the ISC hierarchy, so the USGS Mw 5.9 is selected...
    expect(merged.magnitude).toBe(5.9);
    expect(merged.magnitude_type).toBe('Mw');
    // ...and its uncertainty / station count must come with it, not GeoNet's 0.08 / 40.
    expect(merged.magnitude_uncertainty).toBe(0.06);
    expect(merged.magnitude_station_count).toBe(12);
  });

  it('leaves location uncertainties unset for an epicentre no source reported', () => {
    const merged: any = mergeEventGroup([geonet, usgs], { ...config, mergeStrategy: 'average' });
    // Inverse-variance blend: GeoNet lat -41.0 at 1.2 km -> w = 1/1.2^2 = 0.6944;
    // USGS lat -41.2 with no reported uncertainty -> neutral w = 1.0.
    // (-41.0*0.6944 + -41.2*1.0) / 1.6944 = -41.118033. (The former -41.109091 was
    // the 1/sigma blend, w = 1/1.2 = 0.8333.)
    expect(merged.latitude).toBeCloseTo(-41.118033, 6);
    expect(merged.longitude).toBeCloseTo(174.177049, 6); // same weights: (174.0*0.6944 + 174.3) / 1.6944
    expect(merged.latitude_uncertainty).toBeNull();
    expect(merged.longitude_uncertainty).toBeNull();
    expect(merged.horizontal_uncertainty).toBeNull();
  });

  it('does not stamp a magnitude type on an untyped selected magnitude', () => {
    const untyped: any = { ...usgs, magnitude_type: undefined };
    const merged: any = mergeByAverage([geonet, untyped]);
    // Only ML is typed, so the hierarchy selects the ML 5.4 (priority 4 beats 'unknown').
    expect(merged.magnitude).toBe(5.4);
    expect(merged.magnitude_type).toBe('ML');
  });
});

// ---------------------------------------------------------------------------
// selectBestDepth: reads the stored column, in kilometres
// ---------------------------------------------------------------------------

describe('selectBestDepth — stored depth_uncertainty column (regression)', () => {
  const wellConstrained: any = {
    id: 'gn', time: '2020-01-01T00:00:00.000Z', latitude: -41, longitude: 174,
    depth: 10, magnitude: 4.5, source: 'GeoNet', depth_uncertainty: 1.2, used_station_count: 120,
  };
  const poorlyConstrained: any = {
    id: 'isc', time: '2020-01-01T00:00:01.000Z', latitude: -41, longitude: 174,
    depth: 33, magnitude: 4.5, source: 'ISC', depth_uncertainty: 15, used_station_count: 3,
  };

  it('prefers the better-constrained depth regardless of input order', () => {
    // 15 km is more than 5 km worse than 1.2 km, so only the GeoNet depth is comparable.
    expect(selectBestDepth([poorlyConstrained, wellConstrained])).toBe(10);
    expect(selectBestDepth([wellConstrained, poorlyConstrained])).toBe(10);
  });

  it('treats a QuakeML depth uncertainty as metres, not kilometres', () => {
    // QuakeML BED: Origin/depth/uncertainty is in metres (lib/quakeml-to-db.ts divides by
    // 1000). 2000 m = 2 km, which is far better constrained than "no uncertainty reported".
    const measured: any = {
      id: 'm', time: '2020-01-01T00:00:00.000Z', latitude: -41, longitude: 174, depth: 10,
      magnitude: 4.5, source: 'A',
      quakeml: { preferredOriginID: 'o', origins: [{ publicID: 'o', depth: { uncertainty: 2000 } }] },
    };
    const unmeasured: any = {
      id: 'u', time: '2020-01-01T00:00:01.000Z', latitude: -41, longitude: 174, depth: 40,
      magnitude: 4.5, source: 'B',
    };
    expect(selectBestDepth([measured, unmeasured])).toBe(10);
    expect(selectBestDepth([unmeasured, measured])).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// validateEventGroup: cross-scale magnitude comparison
// ---------------------------------------------------------------------------

describe('validateEventGroup — Mw-equivalent rescue across magnitude scales (regression)', () => {
  const at = (sec: number, extra: any) => ({
    time: new Date(Date.UTC(2020, 0, 1, 0, 0, sec)).toISOString(),
    latitude: -41.0, longitude: 174.0, depth: 12, ...extra,
  }) as any;

  it('accepts one earthquake reported as mb by ISC and ML by GeoNet', () => {
    // Scordilis (2006): Mw = 0.85*mb + 1.03, so a true Mw 3.8 is mb 3.26.
    // Raw: avg 3.53 -> gate 0.5; range 0.54 > 0.5 -> would be rejected.
    // Mw-equivalent: 0.85*3.26 + 1.03 = 3.80 and ML 3.80 ~ Mw 3.80 -> range 0.00 -> accept.
    const isc = at(0, { id: 'isc', magnitude: 3.26, magnitude_type: 'mb', source: 'ISC' });
    const geonet = at(2, { id: 'gn', magnitude: 3.8, magnitude_type: 'ML', source: 'GeoNet', latitude: -41.027 });
    expect(validateEventGroup([isc, geonet])).toBe(true);
    expect(groupMatchingEvents([isc, geonet], config)).toHaveLength(1);
  });

  it('accepts an ML 4.5 / mb 4.0 / Mw 4.9 triple as one earthquake', () => {
    // Mw-equivalents: 4.50, 0.85*4.0+1.03 = 4.43, 4.90 -> range 0.47, mean 4.61 -> gate 0.8.
    const a = at(0, { id: 'a', magnitude: 4.5, magnitude_type: 'ML', source: 'GeoNet' });
    const b = at(2, { id: 'b', magnitude: 4.0, magnitude_type: 'mb', source: 'ISC', latitude: -41.02 });
    const c = at(3, { id: 'c', magnitude: 4.9, magnitude_type: 'Mw', source: 'USGS', latitude: -41.01 });
    expect(validateEventGroup([a, b, c])).toBe(true);
    expect(groupMatchingEvents([a, b, c], config)).toHaveLength(1);
  });

  it('still rejects a genuinely inconsistent typed group', () => {
    // Mw-equivalents 3.0 and 7.0 -> range 4.0, mean 5.0 -> gate 0.8 -> reject.
    const a = at(0, { id: 'a', magnitude: 3.0, magnitude_type: 'ML', source: 'GeoNet' });
    const b = at(2, { id: 'b', magnitude: 7.0, magnitude_type: 'Mw', source: 'USGS' });
    expect(validateEventGroup([a, b])).toBe(false);
  });

  it('falls back to the raw comparison when a magnitude type is missing', () => {
    // No types anywhere: nothing can be homogenised, so the raw 0.8 range at avg 3.4
    // (gate 0.5) must still be rejected.
    const a = at(0, { id: 'a', magnitude: 3.0, source: 'GeoNet' });
    const b = at(2, { id: 'b', magnitude: 3.8, source: 'ISC' });
    expect(validateEventGroup([a, b])).toBe(false);
  });
});
