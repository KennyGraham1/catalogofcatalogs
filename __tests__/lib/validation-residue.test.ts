/** @jest-environment node */

// Validation ranges, cross-field checks and presence counts.

import { assessDataQuality, horizontalUncertaintyKm, validateGeographicBounds } from '@/lib/validation';
import { validateUncertaintyRelationships } from '@/lib/cross-field-validation';
import { validateMergedEvent } from '@/lib/db';

const base = (i: number, extra: Record<string, unknown> = {}) => ({
  id: 'e' + i, catalogue_id: 'c', source_id: 's' + i, source_events: '[]',
  time: '2024-01-01T00:00:00Z', latitude: -41 + i * 0.01, longitude: 174, depth: 10, magnitude: 3, ...extra,
});

describe('withholding poor uncertainties cannot raise the accuracy score', () => {
  it.each([7, 11, 13])('rounds the penalty once when poor measurements are hidden among %i events', (count) => {
    const honest = Array.from({ length: count }, (_, i) => base(i, { horizontal_uncertainty: i < 2 ? 20 : 1 }));
    const expected = 100 - Math.round(30 * 2 / count);
    for (const hiddenCount of [0, 1, 2]) {
      const hidden = honest.map((event, i) => i < hiddenCount ? { ...event, horizontal_uncertainty: null } : event);
      expect(assessDataQuality(hidden).accuracy).toBe(expected);
    }
    // Removing a good measurement must never improve the assessment either.
    const hiddenGood = honest.map((event, i) => i === 2 ? { ...event, horizontal_uncertainty: null } : event);
    expect(assessDataQuality(hiddenGood).accuracy).toBeLessThanOrEqual(expected);
  });

  it('scores a catalogue the same whether its poor measurements are reported or hidden', () => {
    // 10 events, 6 at 20 km (poor), 4 at 2 km. Hiding two of the poor ones used to move
    // the reporting set below the 50% majority and turn a flat -30 into nothing.
    const honest = Array.from({ length: 10 }, (_, i) => base(i, { horizontal_uncertainty: i < 6 ? 20 : 2 }));
    const hidden = honest.map((e, i) => (i < 2 ? { ...e, horizontal_uncertainty: null } : e));
    const a = assessDataQuality(honest as any).accuracy;
    const b = assessDataQuality(hidden as any).accuracy;
    // Proportional: 6/10 poor costs 30*0.6 = 18 -> 82; hiding two costs 30*0.2 (missing)
    // + 30*0.4 (still poor) = 18 -> 82. Identical by construction.
    expect(a).toBe(82);
    expect(b).toBe(82);
  });
});

describe('anisotropy is judged in kilometres, not degrees', () => {
  const at85 = { time: '2024-01-01T00:00:00Z', longitude: 174, depth: 10, magnitude: 3, latitude: 85 };
  const asym = (e: any) => validateUncertaintyRelationships(e).filter((c) => /asymmetric/i.test(c.message));
  it('does not flag a physically isotropic ellipse at high latitude', () => {
    // cos(85 deg) = 0.0872, so 0.01 deg lat and 0.1147 deg lon are both 1.11 km.
    expect(asym({ ...at85, latitude_uncertainty: 0.01, longitude_uncertainty: 0.1147 })).toHaveLength(0);
  });
  it('does flag a genuinely anisotropic ellipse whose degree values happen to be equal', () => {
    // 0.01 deg each -> 1.11 km north-south but only 0.097 km east-west: 11.5:1.
    expect(asym({ ...at85, latitude_uncertainty: 0.01, longitude_uncertainty: 0.01 })).toHaveLength(1);
  });
});

describe('a single-point extent is valid', () => {
  it('raises no error when min and max latitude coincide', () => {
    const errors = validateGeographicBounds({ minLat: -41, maxLat: -41, minLon: 174, maxLon: 174 })
      .filter((c) => c.severity === 'error');
    expect(errors).toHaveLength(0);
  });
  it('still rejects an inverted latitude extent', () => {
    const errors = validateGeographicBounds({ minLat: -40, maxLat: -41, minLon: 174, maxLon: 175 })
      .filter((c) => c.severity === 'error');
    expect(errors).toHaveLength(1);
  });
});

describe('the DB validator agrees with the schema', () => {
  const ok = (extra: Record<string, unknown>) => () => validateMergedEvent(base(1, extra) as any);
  it('rejects a future origin time', () => {
    expect(ok({ time: '2099-01-01T00:00:00Z' })).toThrow(/out of range/);
  });
  it('rejects non-finite and out-of-bound optional metrics the schema rejects', () => {
    expect(ok({ horizontal_uncertainty: Infinity })).toThrow(/horizontal_uncertainty/);
    expect(ok({ used_station_count: 2.5 })).toThrow(/used_station_count/);
    expect(ok({ minimum_distance: 181 })).toThrow(/minimum_distance/);
  });
  it('accepts values inside the schema bounds', () => {
    expect(ok({ horizontal_uncertainty: 5, used_station_count: 12, minimum_distance: 0.5 })).not.toThrow();
  });
});

describe('presence counts keep reported zeros', () => {
  it('counts ellipse axes, including zero, and assesses the reported major axis in km', () => {
    const ellipse = base(1, { min_horizontal_uncertainty: 1, max_horizontal_uncertainty: 4, azimuth_max_horizontal_uncertainty: 35 });
    const zero = base(2, { min_horizontal_uncertainty: 0, max_horizontal_uncertainty: 0 });
    const report = assessDataQuality([ellipse, zero]);
    expect(report.statistics.eventsWithUncertainties).toBe(2);
    expect(report.accuracy).toBe(100);
    expect(horizontalUncertaintyKm(ellipse)).toBe(4);
    expect(horizontalUncertaintyKm(zero)).toBe(0);
    expect(assessDataQuality([base(3, { max_horizontal_uncertainty: 20 })]).accuracy).toBe(70);
    // An orientation alone does not specify an uncertainty size.
    expect(assessDataQuality([base(4, { azimuth_max_horizontal_uncertainty: 35 })]).statistics.eventsWithUncertainties).toBe(0);
  });

  it('counts a reported azimuthal gap of 0 as a reported metric', () => {
    const r = assessDataQuality([base(1, { azimuthal_gap: 0 }), base(2, { azimuthal_gap: 90 })] as any);
    expect(r.statistics.eventsWithQualityMetrics).toBe(2);
  });
  it('counts time-only and magnitude-only uncertainties as reported', () => {
    const r = assessDataQuality([base(1, { time_uncertainty: 0.1 }), base(2, { magnitude_uncertainty: 0.1 })] as any);
    expect(r.statistics.eventsWithUncertainties).toBe(2);
  });
});
