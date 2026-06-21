/**
 * Regression test for the uncertainty-ellipse orientation fix (audit finding #9).
 *
 * The renderer (generateEllipsePoints) puts the semi-major axis along EAST-WEST at
 * rotation 0. So a location whose dominant uncertainty is in LATITUDE (north-south)
 * must be drawn with rotation = 90; longitude-dominant -> rotation 0. The code
 * previously had this inverted.
 */

import { calculateUncertaintyEllipse } from '@/lib/uncertainty-utils';

describe('calculateUncertaintyEllipse orientation', () => {
  it('rotates the major axis to N-S when latitude uncertainty dominates', () => {
    const e = calculateUncertaintyEllipse({
      latitude: -41,
      longitude: 174,
      latitude_uncertainty: 0.02, // larger (N-S)
      longitude_uncertainty: 0.01,
    } as any)!;
    expect(e.rotation).toBe(90);
    // semi-major axis is the latitude uncertainty converted to metres
    expect(e.semiMajorAxis).toBeCloseTo(0.02 * 111000, 0);
  });

  it('keeps the major axis E-W when longitude uncertainty dominates', () => {
    const e = calculateUncertaintyEllipse({
      latitude: -41,
      longitude: 174,
      latitude_uncertainty: 0.01,
      longitude_uncertainty: 0.03, // larger (E-W), even after the cos(lat) factor
    } as any)!;
    expect(e.rotation).toBe(0);
  });
});
