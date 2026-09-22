/**
 * Regression tests for the uncertainty ellipse (uncertainty cluster, findings 3 and 4).
 *
 * Two things are pinned here:
 *  1. The azimuth convention. QuakeML OriginUncertainty gives the azimuth of the
 *     semi-major axis CLOCKWISE FROM NORTH; the polygon renderer measures its
 *     rotation COUNTER-CLOCKWISE FROM EAST in the local (east, north) plane.
 *     Those two differ, so rotation = 90 - azimuth. The end-to-end test below
 *     re-derives the drawn bearing from the polygon itself rather than trusting
 *     the rotation field.
 *  2. The "confidence" number is a display weight only: it must not change the
 *     geometry, and the same geometry must be produced for any azimuthal gap.
 */

import { calculateUncertaintyEllipse, generateEllipsePoints } from '@/lib/uncertainty-utils';

const R = 6371000; // metres, as used by generateEllipsePoints

/**
 * Initial bearing (deg clockwise from north) and great-circle range (m) of a point from
 * the ellipse centre: the exact inverse of the spherical destination step the renderer
 * takes, so the check is independent of the flat-earth approximation.
 */
function bearingAndRange(center: [number, number], point: [number, number]) {
  const toRad = Math.PI / 180;
  const lat1 = center[0] * toRad, lat2 = point[0] * toRad, dLon = (point[1] - center[1]) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) / toRad + 360) % 360;
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const range = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { bearing, range };
}

describe('calculateUncertaintyEllipse — real OriginUncertainty ellipse', () => {
  const origin = {
    latitude: -41.3,
    longitude: 174.8,
    // GeoNet-shaped horizontal error ellipse, km (DB convention)
    max_horizontal_uncertainty: 4.2,
    min_horizontal_uncertainty: 1.1,
    azimuth_max_horizontal_uncertainty: 35,
    // marginals that would otherwise produce a near-circular N-S blob
    latitude_uncertainty: 0.0315,
    longitude_uncertainty: 0.0308,
  };

  it('prefers the reported ellipse over the lat/lon marginals', () => {
    const e = calculateUncertaintyEllipse(origin)!;
    expect(e.source).toBe('origin-uncertainty');
    expect(e.semiMajorAxis).toBe(4200);
    expect(e.semiMinorAxis).toBe(1100);
    // azimuth 35 clockwise from north -> rotation 90 - 35 = 55 ccw from east
    expect(e.rotation).toBe(55);
  });

  it('draws the semi-major axis at the reported compass azimuth', () => {
    const e = calculateUncertaintyEllipse(origin)!;
    const points = generateEllipsePoints(e.center, e.semiMajorAxis, e.semiMinorAxis, e.rotation, 64);
    // index 0 is the parametric angle 0, i.e. the tip of the semi-major axis
    const tip = bearingAndRange(e.center, points[0]);
    expect(tip.bearing).toBeCloseTo(35, 6);
    expect(tip.range).toBeCloseTo(4200, 0);
    // index 16 of 64 is a quarter turn later: the tip of the semi-minor axis,
    // 90 degrees round the compass from the major axis.
    const minorTip = bearingAndRange(e.center, points[16]);
    expect(minorTip.bearing).toBeCloseTo(35 - 90 + 360, 6);
    expect(minorTip.range).toBeCloseTo(1100, 0);
  });

  it.each([
    [0, 90],
    [90, 0],
    [45, 45],
    [125, 325],
  ])('maps azimuth %i to rotation %i', (azimuth, rotation) => {
    const e = calculateUncertaintyEllipse({
      latitude: -41.3,
      longitude: 174.8,
      max_horizontal_uncertainty: 4.2,
      min_horizontal_uncertainty: 1.1,
      azimuth_max_horizontal_uncertainty: azimuth,
    })!;
    expect(e.rotation).toBe(rotation);
  });
});

describe('calculateUncertaintyEllipse — lat/lon fallback', () => {
  it('is flagged as the approximate construction', () => {
    const e = calculateUncertaintyEllipse({
      latitude: -41,
      longitude: 174,
      latitude_uncertainty: 0.02,
      longitude_uncertainty: 0.01,
    })!;
    expect(e.source).toBe('latlon-marginals');
    expect(e.rotation).toBe(90); // N-S dominant
    expect(e.semiMajorAxis).toBeCloseTo(0.02 * 111000, 0);
  });

  it('returns null when there is nothing to draw', () => {
    expect(calculateUncertaintyEllipse({ latitude: -41, longitude: 174 })).toBeNull();
  });
});

describe('displayWeight is a display heuristic, not a confidence level', () => {
  it('changes with the azimuthal gap while the drawn geometry stays identical', () => {
    const base = { latitude: -41, longitude: 174, latitude_uncertainty: 0.02, longitude_uncertainty: 0.01 };
    const results = [0, 90, 180, 270, 350].map(gap =>
      calculateUncertaintyEllipse({ ...base, azimuthal_gap: gap })!
    );

    // 1 - gap/360 clamped to [0.3, 0.95]
    expect(results.map(r => r.displayWeight)).toEqual([0.95, 0.75, 0.5, 0.3, 0.3]);

    // ... but every one of them draws exactly the same polygon.
    const geometry = results.map(r => [r.semiMajorAxis, r.semiMinorAxis, r.rotation]);
    geometry.forEach(g => expect(g).toEqual(geometry[0]));
  });
});
