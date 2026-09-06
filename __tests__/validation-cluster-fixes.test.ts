/**
 * Regression tests for the "validation" cluster.
 *
 * Covers:
 *  - lib/cross-field-validation.ts: azimuthal-gap rules (the >180 deg check must not be
 *    gated on a station count, and the "few stations + small gap = clustering" rule was
 *    geometrically inverted and is replaced by the 360/N geometric-floor test).
 *  - lib/validation.ts: assessDataQuality completeness measures required-field presence,
 *    not a full-schema pass; and the accuracy score must not reward withheld uncertainties.
 *  - lib/field-definitions.ts: the ranges/units shown to depositors must match what
 *    earthquakeEventSchema actually enforces.
 *
 * Expected values are derived from the physics/definitions, not from running the code:
 *  - N stations produce N azimuthal separations that sum to 360 deg, so the largest of them
 *    (the azimuthal gap) can never be below 360/N.
 *  - completeness is "% of events carrying time/latitude/longitude/magnitude in range".
 *  - 1 degree of latitude = 111 km; 1 degree of longitude = 111 km * cos(latitude).
 */

import { assessDataQuality, earthquakeEventSchema } from '@/lib/validation';
import { validateQualityMetricsConsistency } from '@/lib/cross-field-validation';
import { getFieldById } from '@/lib/field-definitions';

const gapChecks = (event: Record<string, unknown>) =>
  validateQualityMetricsConsistency(event).filter(c => c.field === 'azimuthal_gap');

describe('azimuthal gap cross-field rules', () => {
  it('flags a gap > 180 deg with no station count reported', () => {
    const checks = gapChecks({ azimuthal_gap: 300 });
    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].message).toContain('300');
    // No station count was supplied, so the message must not invent one.
    expect(checks[0].message).not.toContain('stations');
  });

  it('flags a gap > 180 deg when only a handful of stations are reported', () => {
    // 4 stations, gap 300 deg: above the 360/4 = 90 deg floor, so only the large-gap warning.
    const checks = gapChecks({ azimuthal_gap: 300, used_station_count: 4, used_phase_count: 8 });
    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].message).toContain('with only 4 stations');
  });

  it('still flags a large gap despite many stations', () => {
    const checks = gapChecks({ azimuthal_gap: 200, used_station_count: 25 });
    expect(checks).toHaveLength(1);
    expect(checks[0].message).toContain('despite 25 stations');
  });

  it('uses a strict > 180 deg threshold', () => {
    expect(gapChecks({ azimuthal_gap: 180, used_station_count: 12 })).toHaveLength(0);
    expect(gapChecks({ azimuthal_gap: 181, used_station_count: 12 })).toHaveLength(1);
  });

  it('does not flag a small gap with few stations as station clustering', () => {
    // 5 stations can attain 360/5 = 72 deg, so 80 deg is near-optimal coverage, not a defect.
    expect(gapChecks({ azimuthal_gap: 80, used_station_count: 5, used_phase_count: 10 })).toHaveLength(0);
  });

  it('flags a gap below the 360/N geometric floor', () => {
    // 4 stations cannot produce a maximum separation below 360/4 = 90 deg.
    const checks = gapChecks({ azimuthal_gap: 30, used_station_count: 4, used_phase_count: 12 });
    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].message).toContain('90.0');
    expect(checks[0].message).toContain('4 stations');
  });

  it('accepts a gap exactly at the geometric floor', () => {
    // 4 stations spaced evenly 90 deg apart: gap = 90 deg is attainable.
    expect(gapChecks({ azimuthal_gap: 90, used_station_count: 4, used_phase_count: 12 })).toHaveLength(0);
  });

  it('tolerates gap values rounded to whole degrees at the floor', () => {
    // 8 stations: floor = 45 deg. 44.6 is within the 0.5 deg rounding allowance; 44.4 is not.
    expect(gapChecks({ azimuthal_gap: 44.6, used_station_count: 8, used_phase_count: 20 })).toHaveLength(0);
    expect(gapChecks({ azimuthal_gap: 44.4, used_station_count: 8, used_phase_count: 20 })).toHaveLength(1);
  });

  it('leaves a well-constrained solution unflagged', () => {
    // 18 stations: floor = 20 deg, gap 120 deg is between the floor and the 180 deg limit.
    expect(gapChecks({ azimuthal_gap: 120, used_station_count: 18, used_phase_count: 45 })).toHaveLength(0);
  });

  it('does not divide by a zero station count', () => {
    expect(gapChecks({ azimuthal_gap: 0, used_station_count: 0 })).toHaveLength(0);
  });
});

describe('assessDataQuality completeness', () => {
  const wellFormed = {
    time: '2016-11-13T11:02:56Z',
    latitude: -42.69,
    longitude: 173.02,
    depth: 15,
    magnitude: 7.8,
  };

  it('counts an event whose required fields are all present, even if an optional metadata value is out of range', () => {
    // standard_error is optional metadata; its 100 s sanity cap is exceeded here, so the
    // full schema rejects the record - but every required field is present and in range.
    const event = { ...wellFormed, standard_error: 250 };
    expect(earthquakeEventSchema.safeParse(event).success).toBe(false);
    expect(assessDataQuality([event]).completeness).toBe(100);
  });

  it('reports 0% when a required field is actually missing', () => {
    const { magnitude, ...noMagnitude } = wellFormed;
    expect(assessDataQuality([noMagnitude]).completeness).toBe(0);
  });

  it('accepts pre-instrumental origin-time uncertainties (1855 Wairarapa)', () => {
    // The schema admits events back to 1000 CE, whose origin times are known only to the
    // nearest hour or so; a 3600 s uncertainty must therefore parse.
    const wairarapa = {
      time: '1855-01-23T09:00:00Z',
      latitude: -41.2,
      longitude: 175.2,
      depth: 15,
      magnitude: 8.2,
      time_uncertainty: 3600,
    };
    expect(earthquakeEventSchema.safeParse(wairarapa).success).toBe(true);
    expect(assessDataQuality([wairarapa]).completeness).toBe(100);
  });

  it('accepts agency-scale station and phase counts', () => {
    const isc = { ...wellFormed, used_station_count: 620, used_phase_count: 1800 };
    expect(earthquakeEventSchema.safeParse(isc).success).toBe(true);
  });
});

describe('assessDataQuality accuracy', () => {
  const catalogue = (extra: Record<string, number>) =>
    Array.from({ length: 20 }, (_, i) => ({
      time: new Date(Date.UTC(2016, 10, 13, 11, 2, i)).toISOString(),
      latitude: -41,
      longitude: 174 + i * 0.001,
      depth: 15,
      magnitude: 4.5,
      ...extra,
    }));

  it('does not reward a catalogue that reports no uncertainty at all', () => {
    const withheld = assessDataQuality(catalogue({}));
    // 0.01 deg = 1.1 km latitude / 0.84 km longitude at 41 deg S: well-constrained.
    const reported = assessDataQuality(
      catalogue({ latitude_uncertainty: 0.01, longitude_uncertainty: 0.01 })
    );

    expect(reported.accuracy).toBe(100);
    expect(withheld.accuracy).toBeLessThan(reported.accuracy);
    // Every event withholds the field, so the full missing-metadata penalty applies.
    expect(withheld.accuracy).toBe(70);
  });

  it('does not rank a fully undocumented catalogue above an honestly poor one', () => {
    const withheld = assessDataQuality(catalogue({}));
    // 0.2 deg = 22.2 km latitude: genuinely high uncertainty, honestly reported.
    const honestlyPoor = assessDataQuality(
      catalogue({ latitude_uncertainty: 0.2, longitude_uncertainty: 0.2 })
    );
    expect(withheld.accuracy).toBeLessThanOrEqual(honestlyPoor.accuracy);
  });

  it('applies the cos(latitude) factor to longitude uncertainty', () => {
    // At 41 deg S: 0.1 deg of latitude = 11.1 km (> 10 km, high);
    //              0.1 deg of longitude = 111 * cos(41 deg) * 0.1 = 8.4 km (<= 10 km, not high).
    const latOnly = assessDataQuality(catalogue({ latitude_uncertainty: 0.1 }));
    const lonOnly = assessDataQuality(catalogue({ longitude_uncertainty: 0.1 }));

    expect(latOnly.accuracy).toBe(70);
    expect(lonOnly.accuracy).toBe(100);
  });
});

describe('field-definitions documented ranges match enforcement', () => {
  const base = {
    time: '2024-01-01T00:00:00Z',
    latitude: -39.28,
    longitude: 175.57,
    magnitude: 2,
    depth: 1,
  };

  it('documents the depth range the platform accepts, including above-sea-level events', () => {
    const depth = getFieldById('depth')!;
    expect(depth.validation).toEqual({ min: -5, max: 1000 });
    // A Ruapehu volcano-seismic event 1.5 km above sea level must be inside the documented range.
    expect(earthquakeEventSchema.safeParse({ ...base, depth: -1.5 }).success).toBe(true);
    expect(earthquakeEventSchema.safeParse({ ...base, depth: depth.validation!.min }).success).toBe(true);
    expect(earthquakeEventSchema.safeParse({ ...base, depth: depth.validation!.max }).success).toBe(true);
    expect(earthquakeEventSchema.safeParse({ ...base, depth: depth.validation!.min! - 0.1 }).success).toBe(false);
    expect(earthquakeEventSchema.safeParse({ ...base, depth: depth.validation!.max! + 0.1 }).success).toBe(false);
  });

  it('documents the magnitude range the platform accepts', () => {
    const magnitude = getFieldById('magnitude')!;
    expect(magnitude.validation).toEqual({ min: -3, max: 10 });
    // Borehole/mine microseismicity below M -2 is accepted, so it must be documented as accepted.
    expect(earthquakeEventSchema.safeParse({ ...base, magnitude: -2.4 }).success).toBe(true);
    expect(earthquakeEventSchema.safeParse({ ...base, magnitude: magnitude.validation!.min }).success).toBe(true);
    expect(earthquakeEventSchema.safeParse({ ...base, magnitude: magnitude.validation!.max }).success).toBe(true);
    expect(earthquakeEventSchema.safeParse({ ...base, magnitude: magnitude.validation!.min! - 0.1 }).success).toBe(false);
    expect(earthquakeEventSchema.safeParse({ ...base, magnitude: magnitude.validation!.max! + 0.1 }).success).toBe(false);
  });

  it('documents horizontal location uncertainties in degrees, as the platform reads them', () => {
    for (const id of ['latitude_uncertainty', 'longitude_uncertainty']) {
      const field = getFieldById(id)!;
      expect(field.unit).toBe('degrees');
      expect(field.description).toMatch(/degrees/i);
      expect(field.description).not.toMatch(/in kilometers/i);
      // The documented example must be a plausible degree-scale value, not a kilometre one.
      expect(Number(field.example)).toBeLessThan(1);
      expect(field.validation).toEqual({ min: 0, max: 10 });
    }
  });

  it('documents the same optional-metadata maxima that the schema enforces', () => {
    const cases: Array<[string, number]> = [
      ['time_uncertainty', 86400],
      ['latitude_uncertainty', 10],
      ['longitude_uncertainty', 10],
      ['depth_uncertainty', 100],
      ['magnitude_uncertainty', 5],
      ['magnitude_station_count', 5000],
      ['azimuthal_gap', 360],
      ['used_phase_count', 10000],
      ['used_station_count', 5000],
      ['standard_error', 100],
    ];

    for (const [id, max] of cases) {
      expect(getFieldById(id)!.validation!.max).toBe(max);
      expect(earthquakeEventSchema.safeParse({ ...base, [id]: max }).success).toBe(true);
      expect(earthquakeEventSchema.safeParse({ ...base, [id]: max + 1 }).success).toBe(false);
    }
  });
});
