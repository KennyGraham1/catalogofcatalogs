/** @jest-environment node */

// #78: the quality index Q and each dimension score stay in [0, 100], and a negative or
// -999 / -1 missing-value sentinel scores as absent (as the DB stores it), never as a bonus.

import { parseCSV } from '@/lib/parsers';
import { performQualityCheck, formatQualityCheckResults } from '@/lib/data-quality-checker';
import { assessDataQuality, horizontalUncertaintyKm } from '@/lib/validation';
import {
  calculateQualityScore, scoreQualityMetrics, metricsFromEvent, QUALITY_INPUT_RANGES,
} from '@/lib/quality-scoring';
import { EVENT_OPTIONAL_RANGES } from '@/lib/db';

const csv = (header: string, rows: string[]) => {
  const result = parseCSV([header, ...rows].join('\n'), ',');
  expect(result.success).toBe(true);
  return result.events;
};

const inBounds = (score: ReturnType<typeof calculateQualityScore>) => {
  for (const c of Object.values(score.components)) {
    expect(c.score).toBeGreaterThanOrEqual(0);
    expect(c.score).toBeLessThanOrEqual(100);
  }
  expect(score.overall).toBeGreaterThanOrEqual(0);
  expect(score.overall).toBeLessThanOrEqual(100);
};

describe('#78 Q is bounded and sentinels score as absent', () => {
  it('a -999 depth_error column does not lift the upload report above 100', () => {
    const sentinel = csv('time,latitude,longitude,depth,magnitude,depth_error', [
      '2024-01-01T00:00:00Z,-41.1,174.2,10,3.1,-999',
      '2024-01-02T00:00:00Z,-41.2,174.3,12,3.4,-999',
    ]);
    // The parser now reads negative sentinels in non-negative columns as missing; the
    // scorer must agree with the blank-column file either way.
    expect(sentinel[0].depth_uncertainty).toBeNull();
    const blank = csv('time,latitude,longitude,depth,magnitude', [
      '2024-01-01T00:00:00Z,-41.1,174.2,10,3.1',
      '2024-01-02T00:00:00Z,-41.2,174.3,12,3.4',
    ]);
    const withSentinel = performQualityCheck(sentinel);
    const without = performQualityCheck(blank);
    expect(withSentinel.eventQuality).toBe(without.eventQuality);
    expect(withSentinel.score).toBe(without.score);
    expect(withSentinel.score).toBeLessThanOrEqual(100);
    expect(formatQualityCheckResults(withSentinel).summary).not.toMatch(/A\+/);
  });

  it('-1 sentinels in the error columns score as the same event without them', () => {
    const [row] = csv('time,latitude,longitude,depth,magnitude,depth_error,mag_error,time_error,gap,rms,nst,nph,mag_nst', [
      '2024-01-01T00:00:00Z,-41.1,174.2,10,3.1,-1,-1,-1,-1,-1,-1,-1,-1',
    ]);
    const [bare] = csv('time,latitude,longitude,depth,magnitude', ['2024-01-01T00:00:00Z,-41.1,174.2,10,3.1']);
    const q = calculateQualityScore(metricsFromEvent(row));
    inBounds(q);
    expect(q.overall).toBe(calculateQualityScore(metricsFromEvent(bare)).overall);
    // A -1 gap or RMS is not "excellent coverage" / "good fit".
    expect(q.details.strengths).toEqual([]);
  });

  it('negative uncertainties via metricsFromEvent give the no-data score, not a bonus', () => {
    const base = { latitude: -41, longitude: 174, azimuthal_gap: 80, used_station_count: 25, used_phase_count: 40,
      standard_error: 0.2, magnitude_station_count: 12, evaluation_mode: 'manual', evaluation_status: 'reviewed' };
    const negative = calculateQualityScore(metricsFromEvent({ ...base, depth_uncertainty: -40, time_uncertainty: -5, magnitude_uncertainty: -2 }));
    inBounds(negative);
    expect(negative.overall).toBe(calculateQualityScore(metricsFromEvent(base)).overall);
    expect(negative.grade).not.toBe('A+');
  });

  it('a sentinel in one lat/lon marginal leaves the horizontal term unreported', () => {
    expect(metricsFromEvent({ latitude: -41, latitude_uncertainty: -999, longitude_uncertainty: 0.01 }).horizontalUncertainty).toBeNull();
    expect(metricsFromEvent({ latitude: -41, latitude_uncertainty: 0.01, longitude_uncertainty: 0.01 }).horizontalUncertainty).toBeCloseTo(1.11, 2);
  });

  it('components and Q are clamped for QualityMetrics passed directly', () => {
    const direct = calculateQualityScore({
      horizontalUncertainty: 0.5, depthUncertainty: -40, timeUncertainty: -5, azimuthalGap: -1,
      usedStationCount: -999, usedPhaseCount: 40, standardError: -1, magnitudeUncertainty: -2, magnitudeStationCount: 12,
      evaluationMode: 'manual', evaluationStatus: 'final',
    });
    inBounds(direct);
    expect(direct.components.location.score).toBe(100 - 2 - 30 - 30); // depth and time scored as absent
    expect(direct.components.solution.score).toBe(0); // a -1 RMS is no RMS
    // A negative weight cannot push the reported Q outside [0, 100] either.
    const skewed = calculateQualityScore({ evaluationMode: 'manual', evaluationStatus: 'final' }, { location: -1 });
    expect(skewed.overall).toBeLessThanOrEqual(100);
    expect(scoreQualityMetrics({ evaluationMode: 'manual', evaluationStatus: 'final' }, { location: -1 }).overall).toBeLessThanOrEqual(100);
  });

  it('the accuracy term does not count a -999 horizontal uncertainty as reported', () => {
    const row = (h: number | null) => ({ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 3, horizontal_uncertainty: h });
    expect(horizontalUncertaintyKm(row(-999))).toBeNull();
    expect(assessDataQuality([row(-999)]).accuracy).toBe(assessDataQuality([row(null)]).accuracy);
    expect(assessDataQuality([row(2)]).accuracy).toBe(100);
  });

  it('the scorer\'s input ranges mirror the DB\'s optional-field ranges', () => {
    for (const [field, range] of Object.entries(QUALITY_INPUT_RANGES)) {
      const db = EVENT_OPTIONAL_RANGES.find(([name]) => name === field);
      expect(db).toBeDefined();
      expect([db![1], db![2], db![3]]).toEqual([...range]);
    }
  });
});
