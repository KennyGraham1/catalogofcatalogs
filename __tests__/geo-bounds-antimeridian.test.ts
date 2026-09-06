/**
 * Regression tests for the antimeridian-aware longitude union.
 *
 * unionBounds used to build its answer by sampling the circle in 1° steps and
 * then taking the smallest arc through the sampled points. For a near-global
 * input the largest gap between samples is the 1° sampling step itself, so the
 * "smallest covering arc" logic treated that artefact as a real hole: the union
 * of a near-global box with a small one came back 1° *narrower* than the
 * near-global input and flagged as dateline-crossing. A union can never be
 * smaller than either of its inputs, so these tests assert containment as well
 * as the exact expected edges.
 *
 * Expected edges below are derived by hand from the minimum-arc rule: merge the
 * two longitude ranges on the circle, find the widest uncovered gap, and take
 * its complement. RFC 7946 §5.2 convention: west (minLongitude) > east
 * (maxLongitude) means the box crosses 180°.
 */

import {
  unionBounds,
  pointInBounds,
  crossesDateline,
  longitudeExtent,
  calculateBoundsArea,
  type GeographicBounds,
} from '@/lib/geo-bounds-utils';

const B = (
  minLatitude: number,
  maxLatitude: number,
  minLongitude: number,
  maxLongitude: number
): GeographicBounds => ({ minLatitude, maxLatitude, minLongitude, maxLongitude });

/** Angular width of a box's longitude arc, in degrees. */
const arcWidth = (b: { minLongitude: number; maxLongitude: number }): number =>
  b.maxLongitude >= b.minLongitude
    ? b.maxLongitude - b.minLongitude
    : b.maxLongitude + 360 - b.minLongitude;

describe('unionBounds — near-global inputs (the sampling-artefact regression)', () => {
  it('returns the near-global box unchanged when the other box is inside it', () => {
    // a spans 359.96° west-to-east without crossing 180°; b (NZ mainland) is inside a.
    const a = B(-80, 80, -179.98, 179.98);
    const b = B(-45, -35, 174, 175);
    const u = unionBounds(a, b);

    expect(u.minLongitude).toBe(-179.98);
    expect(u.maxLongitude).toBe(179.98);
    expect(crossesDateline(u)).toBe(false);
    expect(u.minLatitude).toBe(-80);
    expect(u.maxLatitude).toBe(80);
  });

  it('keeps every longitude of the near-global input inside the union', () => {
    const a = B(-80, 80, -179.98, 179.98);
    const b = B(-45, -35, 174, 175);
    const u = unionBounds(a, b);

    // -178.5 sat in the 1°-wide hole the old sampling loop invented.
    for (const lon of [-179.9, -179, -178.5, -178, -90, 0, 90, 179, 179.9]) {
      expect(pointInBounds(0, lon, a)).toBe(true); // sanity: inside input a
      expect(pointInBounds(0, lon, u)).toBe(true); // therefore must be inside the union
    }
  });

  it('collapses a full-circle union to the whole globe, not a 359° crossing box', () => {
    const u = unionBounds(B(-80, 80, -180, 180), B(-1, 1, 0, 1));

    expect(u.minLongitude).toBe(-180);
    expect(u.maxLongitude).toBe(180);
    expect(crossesDateline(u)).toBe(false);
    expect(arcWidth(u)).toBe(360);
    expect(pointInBounds(0, -179.5, u)).toBe(true);
    expect(calculateBoundsArea(u)).toBe(160 * 360);
  });

  it('is symmetric for the near-global case', () => {
    const a = B(-80, 80, -179.98, 179.98);
    const b = B(-45, -35, 174, 175);
    expect(unionBounds(b, a)).toEqual(unionBounds(a, b));
  });
});

describe('unionBounds — ordinary non-crossing cases still work', () => {
  it('unions two NZ-mainland-only boxes without inventing a crossing', () => {
    // 166..179 ∪ 170..178 = 166..179; widest hole is the 347° arc through Greenwich.
    const u = unionBounds(B(-47, -34, 166, 179), B(-42, -38, 170, 178));
    expect(u).toEqual(B(-47, -34, 166, 179));
    expect(crossesDateline(u)).toBe(false);
  });

  it('unions two disjoint mid-longitude boxes across the shorter arc', () => {
    // 0..10 ∪ 20..30: interior hole 10°, wrap hole 330° -> keep the wrap hole out.
    const u = unionBounds(B(-10, 10, 0, 10), B(-10, 10, 20, 30));
    expect(u).toEqual(B(-10, 10, 0, 30));
    expect(arcWidth(u)).toBe(30);
  });

  it('is idempotent on identical boxes', () => {
    const a = B(-47, -34, 166, 179);
    expect(unionBounds(a, a)).toEqual(a);
  });

  it('unions two single-point boxes into the short arc between them', () => {
    const u = unionBounds(B(0, 0, 10, 10), B(0, 0, 12, 12));
    expect(u).toEqual(B(0, 0, 10, 12));
  });
});

describe('unionBounds — genuine antimeridian cases', () => {
  it('unions NZ mainland with a Kermadec box into a tight crossing box', () => {
    // 166..179 ∪ 177..-176 -> 166 east across 180 to -176: 14° + 4° = 18° wide.
    const u = unionBounds(B(-47, -34, 166, 179), B(-32, -28, 177, -176));
    expect(u.minLongitude).toBe(166);
    expect(u.maxLongitude).toBe(-176);
    expect(crossesDateline(u)).toBe(true);
    expect(arcWidth(u)).toBeCloseTo(18, 10);
    expect(u.minLatitude).toBe(-47);
    expect(u.maxLatitude).toBe(-28);
  });

  it('unions two crossing boxes into the wider crossing box', () => {
    const u = unionBounds(B(-10, 10, 170, -170), B(-10, 10, 179, -179));
    expect(u.minLongitude).toBe(170);
    expect(u.maxLongitude).toBe(-170);
    expect(arcWidth(u)).toBeCloseTo(20, 10);
  });

  it('absorbs a normal box that lies inside a crossing box', () => {
    const u = unionBounds(B(-10, 10, 170, -170), B(-5, 5, 175, 178));
    expect(u.minLongitude).toBe(170);
    expect(u.maxLongitude).toBe(-170);
  });

  it('bridges two boxes either side of 180° across the dateline, not the globe', () => {
    // 170..175 ∪ -175..-170: interior hole 340°, dateline hole 10° -> cross 180.
    const u = unionBounds(B(-10, 10, 170, 175), B(-10, 10, -175, -170));
    expect(u.minLongitude).toBe(170);
    expect(u.maxLongitude).toBe(-170);
    expect(crossesDateline(u)).toBe(true);
    expect(arcWidth(u)).toBeCloseTo(20, 10);
    expect(pointInBounds(0, 180, u)).toBe(true);
    expect(pointInBounds(0, 0, u)).toBe(false);
  });
});

describe('longitudeExtent — point sets', () => {
  it('returns a degenerate arc for a single longitude', () => {
    expect(longitudeExtent([174.77])).toEqual({ west: 174.77, east: 174.77 });
  });

  it('returns null for an empty set and for an all-non-finite set', () => {
    expect(longitudeExtent([])).toBeNull();
    expect(longitudeExtent([NaN, Infinity])).toBeNull();
  });

  it('ignores non-finite values mixed in with real longitudes', () => {
    expect(longitudeExtent([NaN, 174, 175, Infinity])).toEqual({ west: 174, east: 175 });
  });

  it('crosses 180° for a Kermadec-straddling set', () => {
    expect(longitudeExtent([178, -178, 179.5])).toEqual({ west: 178, east: -178 });
  });

  it('picks a 180°-wide arc for two antipodal longitudes (either is valid)', () => {
    // The two candidate arcs are exactly equal, so only the width is well defined.
    const e = longitudeExtent([0, 180])!;
    expect(arcWidth({ minLongitude: e.west, maxLongitude: e.east })).toBeCloseTo(180, 10);
  });
});
