/** @jest-environment node */

// #83: a blank CSV cell arrives as null, and no cross-field rule may read that null as a
// reported 0 ("exceeds phase count (null)", "Unusually small RMS residual (nulls)").
// The magnitude-vs-location station-count rule is gone: the two counts are independent.

import { parseCSV } from '@/lib/parsers';
import {
  validateEventsCrossFields, validateQualityMetricsConsistency, validateTimeLocationConsistency,
  validateUncertaintyRelationships,
} from '@/lib/cross-field-validation';

const head = 'time,latitude,longitude,depth,magnitude';
const base = '2024-01-01T00:00:00Z,-41.1,174.2,10,3.1';

const parse = (extraHeader: string, extraRow: string) => {
  const result = parseCSV([`${head},${extraHeader}`, `${base},${extraRow}`].join('\n'), ',');
  expect(result.success).toBe(true);
  return {
    event: result.events[0] as any,
    messages: (result.validationReport?.failures ?? []).filter((f) => f.category === 'cross_field').map((f) => f.message),
  };
};

describe('#83 cross-field rules ignore blank (null) cells', () => {
  it('blank phase count and RMS raise nothing', () => {
    const { event, messages } = parse('nst,nph,rms', '10,,');
    expect([event.used_phase_count, event.standard_error]).toEqual([null, null]); // the parser's blank cells
    expect(messages).toEqual([]);
  });

  it('a blank station count leaves the large-gap warning without a station note', () => {
    expect(parse('gap,nst', '250,').messages).toEqual(['Large azimuthal gap (250°)']);
  });

  it('a magnitude station count above the location count is not flagged', () => {
    expect(parse('mag_nst,nst,nph', '8,,').messages).toEqual([]);
    expect(parse('mag_nst,nst,nph', '30,12,20').messages).toEqual([]);
  });

  it('the upload page re-check (after a JSON round trip) agrees', () => {
    const { event } = parse('nst,nph,rms,gap,mag_nst', '10,,,250,8');
    const { summary, results } = validateEventsCrossFields([JSON.parse(JSON.stringify(event))]);
    expect(results[0].checks.map((c) => c.message)).toEqual(['Large azimuthal gap (250°) despite 10 stations']);
    expect([summary.warnings, summary.info]).toEqual([1, 0]);
  });

  it('reported values still trigger the rules', () => {
    const checks = validateQualityMetricsConsistency({ used_station_count: 10, used_phase_count: 8, standard_error: 0.0005 });
    expect(checks.map((c) => c.field)).toEqual(['used_station_count', 'used_phase_count', 'standard_error']);
    expect(validateUncertaintyRelationships({ depth: 5, depth_uncertainty: 12, magnitude: 3, magnitude_uncertainty: null }).map((c) => c.severity))
      .toEqual(['warning', 'info']);
  });

  it('null coordinates are not "very close to (0°, 0°)"', () => {
    expect(validateTimeLocationConsistency({ latitude: null, longitude: null })).toEqual([]);
    expect(validateTimeLocationConsistency({ latitude: 0, longitude: 0 }).map((c) => c.severity)).toEqual(['warning', 'warning']);
  });
});
