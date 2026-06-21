/**
 * Regression tests for antimeridian (180°) handling (audit root cause A).
 *
 * The RFC 7946 §5.2 convention is used: a box that crosses the antimeridian has
 * minLongitude (west edge) > maxLongitude (east edge).
 */

import {
  extractBoundsFromEvents,
  boundsOverlap,
  pointInBounds,
  calculateBoundsArea,
  getBoundsCenter,
  validateBounds,
  crossesDateline,
  type GeographicBounds,
} from '@/lib/geo-bounds-utils';

const ev = (latitude: number, longitude: number) => ({ latitude, longitude } as any);

describe('extractBoundsFromEvents — antimeridian-aware', () => {
  it('produces a normal (non-crossing) box for a compact mid-Pacific cluster', () => {
    const b = extractBoundsFromEvents([ev(-41, 170), ev(-40, 172), ev(-42, 174)])!;
    expect(b.minLongitude).toBe(170);
    expect(b.maxLongitude).toBe(174);
    expect(crossesDateline(b)).toBe(false);
  });

  it('produces a tight crossing box for events straddling 180° (not a globe-spanning one)', () => {
    const b = extractBoundsFromEvents([ev(-30, 178), ev(-31, -178)])!;
    expect(b.minLongitude).toBe(178); // west edge
    expect(b.maxLongitude).toBe(-178); // east edge
    expect(crossesDateline(b)).toBe(true);
    // 4° wide across the dateline, NOT ~356° through Greenwich.
    expect(calculateBoundsArea(b)).toBeCloseTo((b.maxLatitude - b.minLatitude) * 4, 6);
  });

  it('handles a NZ-main-plus-Kermadec catalogue (Kermadec stored as ~-177.9)', () => {
    const b = extractBoundsFromEvents([ev(-41, 175), ev(-29, -177.9)])!;
    expect(crossesDateline(b)).toBe(true);
    expect(b.minLongitude).toBe(175);
    expect(b.maxLongitude).toBe(-177.9);
    expect(calculateBoundsArea(b)).toBeCloseTo((b.maxLatitude - b.minLatitude) * 7.1, 6);
  });
});

describe('pointInBounds — crossing box', () => {
  const crossing: GeographicBounds = { minLatitude: -32, maxLatitude: -28, minLongitude: 178, maxLongitude: -178 };
  it('includes points just east and west of the dateline', () => {
    expect(pointInBounds(-30, 179, crossing)).toBe(true);
    expect(pointInBounds(-30, -179, crossing)).toBe(true);
    expect(pointInBounds(-30, 180, crossing)).toBe(true);
  });
  it('excludes points on the far side of the globe and outside latitude', () => {
    expect(pointInBounds(-30, 0, crossing)).toBe(false);
    expect(pointInBounds(-30, 100, crossing)).toBe(false);
    expect(pointInBounds(-50, 179, crossing)).toBe(false);
  });
});

describe('boundsOverlap — crossing vs normal', () => {
  const crossing: GeographicBounds = { minLatitude: -32, maxLatitude: -28, minLongitude: 178, maxLongitude: -178 };
  it('overlaps a normal box that touches the east side of the dateline', () => {
    const normal: GeographicBounds = { minLatitude: -31, maxLatitude: -29, minLongitude: -180, maxLongitude: -179 };
    expect(boundsOverlap(crossing, normal)).toBe(true);
  });
  it('overlaps a normal box on the west side of the dateline', () => {
    const normal: GeographicBounds = { minLatitude: -31, maxLatitude: -29, minLongitude: 179, maxLongitude: 179.5 };
    expect(boundsOverlap(crossing, normal)).toBe(true);
  });
  it('does not overlap a box on the far side of the globe', () => {
    const far: GeographicBounds = { minLatitude: -31, maxLatitude: -29, minLongitude: 0, maxLongitude: 10 };
    expect(boundsOverlap(crossing, far)).toBe(false);
  });
});

describe('getBoundsCenter & validateBounds — crossing box', () => {
  it('centers a crossing box near 180°', () => {
    const b: GeographicBounds = { minLatitude: -32, maxLatitude: -28, minLongitude: 178, maxLongitude: -178 };
    const c = getBoundsCenter(b);
    expect(Math.abs(Math.abs(c.longitude) - 180)).toBeLessThan(1e-9); // 180 or -180
    expect(c.latitude).toBe(-30);
  });
  it('accepts minLon > maxLon as the dateline convention', () => {
    const b: GeographicBounds = { minLatitude: -32, maxLatitude: -28, minLongitude: 178, maxLongitude: -178 };
    expect(validateBounds(b).valid).toBe(true);
  });
});
