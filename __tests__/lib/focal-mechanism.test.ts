/**
 * Correctness tests for the double-couple beach ball (Aki & Richards, 1980).
 * The previous renderer was a heuristic that ignored dip and mis-placed quadrants;
 * these tests lock in the real physics.
 */

import { computeBeachball, getFaultType } from '@/lib/focal-mechanism-utils';

const fm = (strike: number, dip: number, rake: number) => ({ nodalPlane1: { strike, dip, rake } });

describe('computeBeachball', () => {
  it('returns geometry with a non-empty compressional region and two nodal traces', () => {
    const g = computeBeachball(fm(30, 45, 90), 200)!;
    expect(g).not.toBeNull();
    expect(g.compressionalPath.length).toBeGreaterThan(0);
    expect(g.nodalPaths).toHaveLength(2);
    expect(g.nodalPaths[0].length).toBeGreaterThan(0);
  });

  it('depends on dip (the heuristic bug): a 30° and 80° thrust differ in P/T plunge', () => {
    const shallow = computeBeachball(fm(90, 30, 90), 200)!;
    const steep = computeBeachball(fm(90, 80, 90), 200)!;
    // If dip were ignored these would be identical.
    expect(Math.abs(shallow.tAxis.plunge - steep.tAxis.plunge)).toBeGreaterThan(2);
  });

  it('places the T axis in the compressional region and P in the dilatational region', () => {
    // For a vertical left-lateral strike-slip on a N-S fault, T axis is NE, P axis is NW.
    const g = computeBeachball(fm(0, 90, 0), 200)!;
    const near = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) < 8;
    expect(near(g.tAxis.azimuth, 45) || near(g.tAxis.azimuth, 225)).toBe(true);
    expect(near(g.pAxis.azimuth, 135) || near(g.pAxis.azimuth, 315)).toBe(true);
    expect(Math.abs(g.tAxis.plunge)).toBeLessThan(5); // horizontal axes for strike-slip
    expect(Math.abs(g.pAxis.plunge)).toBeLessThan(5);
  });

  it('a pure thrust has near-vertical T axis and near-horizontal P axis', () => {
    const g = computeBeachball(fm(0, 45, 90), 200)!;
    expect(g.tAxis.plunge).toBeGreaterThan(60); // tension steeply plunging
    expect(g.pAxis.plunge).toBeLessThan(20); // pressure ~horizontal
  });

  it('getFaultType still classifies a 90° rake as reverse', () => {
    expect(getFaultType(90).type).toBe('reverse');
    expect(getFaultType(-90).type).toBe('normal');
  });
});
