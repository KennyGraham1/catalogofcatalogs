/**
 * Regression tests for the quality-scoring cluster.
 *
 * Every expected number below is derived by hand from the documented penalty tables in
 * lib/quality-scoring.ts (and the QS thresholds in lib/geonet-quality-score.ts), not by
 * running the code and pasting its output. The derivation is written out next to each
 * assertion so it can be re-checked against the tables.
 *
 * Covered defects:
 *   1. Omitting quality metadata used to RAISE the event score (missing-data penalties sat
 *      mid-range instead of at the worst reportable value).
 *   2. A 'rejected' origin matched no branch and scored the evaluation dimension at 100 —
 *      the same as 'final', above 'preliminary'; mixed-case statuses also fell through.
 *   3. assessEventQuality() never read the horizontal_uncertainty (km) column, so QuakeML
 *      origins carrying only <horizontalUncertainty> were scored "no data" / QS0.
 *   4. validateEventQuality() compared a degree threshold against degree columns only.
 *   5. The catalogue-level score was blind to location quality.
 */

import {
  calculateQualityScore,
  metricsFromEvent,
  type QualityMetrics,
} from '@/lib/quality-scoring';
import {
  assessEventQuality,
  formatIntegratedAssessment,
} from '@/lib/integrated-quality-assessment';
import {
  performQualityCheck,
  validateEventQuality,
} from '@/lib/data-quality-checker';

/** A historic solution that honestly reports how poorly constrained it is. */
const honestlyPoorEvent = {
  time: '1960-05-24T00:00:00Z',
  latitude: -41.2,
  longitude: 174.8,
  depth: 12,
  magnitude: 5.0,
  horizontal_uncertainty: 15, // km
  depth_uncertainty: 20, // km
  time_uncertainty: 1.5, // s
  azimuthal_gap: 280, // deg
  used_station_count: 4,
  used_phase_count: 7,
  standard_error: 1.2, // s RMS
  magnitude_uncertainty: 0.4,
  magnitude_station_count: 2,
  evaluation_mode: 'automatic',
  evaluation_status: 'preliminary',
};

/** The same event with every quality field deleted. */
const strippedEvent = {
  time: honestlyPoorEvent.time,
  latitude: honestlyPoorEvent.latitude,
  longitude: honestlyPoorEvent.longitude,
  depth: honestlyPoorEvent.depth,
  magnitude: honestlyPoorEvent.magnitude,
};

describe('missing metadata is scored conservatively (paper Eq. 1 discussion)', () => {
  it('an event with no quality metadata cannot outscore the same event reported as poor', () => {
    const honest = calculateQualityScore(metricsFromEvent(honestlyPoorEvent));
    const stripped = calculateQualityScore(metricsFromEvent(strippedEvent));

    // Hand derivation, stripped event (every field absent -> worst-case penalty):
    //   loc  = 100 - 40 (horiz) - 30 (depth) - 30 (time)        = 0
    //   net  = 100 - 50 (gap)   - 30 (stations) - 20 (phases)   = 0
    //   sol  = 100 - 100 (RMS)                                  = 0
    //   mag  = 100 - 60 (mag unc) - 40 (mag stations)           = 0
    //   eval = 100 - 20 (mode absent) - 30 (status absent)      = 50
    //   Q    = .35*0 + .25*0 + .15*0 + .15*0 + .10*50           = 5
    expect(stripped.components.location.score).toBe(0);
    expect(stripped.components.network.score).toBe(0);
    expect(stripped.components.solution.score).toBe(0);
    expect(stripped.components.magnitude.score).toBe(0);
    expect(stripped.components.evaluation.score).toBe(50);
    expect(stripped.overall).toBe(5);

    // Hand derivation, honest event:
    //   loc  = 100 - min(40, 15*4=60) - min(30, 20*3=60) - min(30, 1.5*30=45) = 0
    //   net  = 100 - (45 + min(5, (280-180)/18)) - (25 + (5-4)) - (13 + min(7, 8-7))
    //        = 100 - 50 - 26 - 14 = 10
    //   sol  = 100 - (50 + min(50, (1.2-1.0)*50=10)) = 40
    //   mag  = 100 - min(60, 0.4*120=48) - min(40, 30 + (3-2)*5=35) = 100 - 48 - 35 = 17
    //   eval = 100 - 20 (automatic) - 30 (preliminary) = 50
    //   Q    = .35*0 + .25*10 + .15*40 + .15*17 + .10*50 = 2.5 + 6 + 2.55 + 5 = 16.05 -> 16
    expect(honest.components.network.score).toBe(10);
    expect(honest.components.solution.score).toBe(40);
    expect(honest.components.magnitude.score).toBe(17);
    expect(honest.overall).toBe(16);

    // The defect: deleting the eleven fields used to raise the score from 16 (F) to 61 (C).
    expect(stripped.overall).toBeLessThanOrEqual(honest.overall);
  });

  it.each([
    // [field, worst reportable value, dimension] — missing must equal the worst value
    ['horizontalUncertainty', 10, 'location'], // -40 cap reached at 10 km
    ['depthUncertainty', 10, 'location'], // -30 cap reached at 10 km
    ['timeUncertainty', 1, 'location'], // -30 cap reached at 1 s
    ['azimuthalGap', 270, 'network'], // -50 cap reached at 270 deg
    ['usedStationCount', 0, 'network'], // -30 floor at 0 stations
    ['usedPhaseCount', 0, 'network'], // -20 floor at 0 phases
    ['standardError', 2, 'solution'], // -100 cap reached at 2 s
    ['magnitudeUncertainty', 0.5, 'magnitude'], // -60 cap reached at 0.5
    ['magnitudeStationCount', 0, 'magnitude'], // -40 floor at 0 stations
  ] as const)(
    'reporting the worst value for %s scores the same as omitting it, never worse',
    (field, worstValue, dimension) => {
      const reported = calculateQualityScore({ [field]: worstValue } as QualityMetrics);
      const omitted = calculateQualityScore({} as QualityMetrics);
      expect(reported.components[dimension].score).toBe(omitted.components[dimension].score);
    }
  );

  it('a reported horizontal uncertainty of exactly 0 km is not treated as missing data', () => {
    // loc = 100 - 0 (horiz) - 30 (depth absent) - 30 (time absent) = 40
    expect(calculateQualityScore({ horizontalUncertainty: 0 }).components.location.score).toBe(40);
    // ...whereas an absent value takes the full -40: 100 - 40 - 30 - 30 = 0
    expect(calculateQualityScore({}).components.location.score).toBe(0);
  });
});

describe('evaluation dimension (QuakeML 1.2 BED EvaluationStatus)', () => {
  const evalScore = (status?: string, mode = 'manual') =>
    calculateQualityScore({ evaluationMode: mode, evaluationStatus: status })
      .components.evaluation.score;

  it('ranks rejected below every other status', () => {
    // manual mode contributes 0; status penalties are 0/0/-10/-30/-100.
    expect(evalScore('final')).toBe(100);
    expect(evalScore('reviewed')).toBe(100);
    expect(evalScore('confirmed')).toBe(90);
    expect(evalScore('preliminary')).toBe(70);
    expect(evalScore('rejected')).toBe(0); // clamped at 0 (100 - 100)
    expect(evalScore('rejected')).toBeLessThan(evalScore('preliminary'));
  });

  it('penalises an absent evaluation status as heavily as a preliminary one', () => {
    expect(evalScore(undefined)).toBe(70); // 100 - 0 (manual) - 30 (status absent)
    expect(evalScore(undefined)).toBeLessThanOrEqual(evalScore('preliminary'));
    // Absent mode as well: 100 - 20 - 30 = 50
    expect(calculateQualityScore({}).components.evaluation.score).toBe(50);
  });

  it('compares status and mode case-insensitively', () => {
    // lib/geojson-parser.ts and lib/merge.ts store the source string verbatim.
    expect(evalScore('Preliminary')).toBe(70);
    expect(evalScore('REJECTED')).toBe(0);
    expect(calculateQualityScore({ evaluationMode: 'Automatic' }).components.evaluation.score)
      .toBe(50); // 100 - 20 (automatic) - 30 (status absent)
  });

  it('reports a rejected origin as a weakness', () => {
    const details = calculateQualityScore({ evaluationStatus: 'rejected' }).details;
    expect(details.weaknesses.some(w => /rejected/i.test(w))).toBe(true);
  });
});

describe('assessEventQuality reads the horizontal_uncertainty km column', () => {
  // A SeisComP-style origin: <originUncertainty><horizontalUncertainty> only, no
  // per-coordinate latitude/longitude uncertainties.
  const event = {
    latitude: -41.3,
    longitude: 174.8,
    horizontal_uncertainty: 1.2, // km
    depth_uncertainty: 2.0, // km
    time_uncertainty: 0.2, // s
    azimuthal_gap: 60,
    used_station_count: 35,
    used_phase_count: 60,
    standard_error: 0.15,
    magnitude_uncertainty: 0.05,
    magnitude_station_count: 20,
    evaluation_mode: 'manual',
    evaluation_status: 'reviewed',
    minimum_distance: 0.15, // degrees
  };

  it('scores the km column instead of taking the no-data branch', () => {
    const assessment = assessEventQuality(event);

    // Hand derivation:
    //   loc  = 100 - 1.2*4 - 2.0*3 - 0.2*30 = 100 - 4.8 - 6 - 6 = 83.2
    //   net  = 100 (gap 60 < 90; 35 >= 20 stations; 60 >= 30 phases)
    //   sol  = 100 (RMS 0.15 < 0.3)
    //   mag  = 100 - 0.05*120 = 94 (20 >= 10 magnitude stations)
    //   eval = 100 (manual + reviewed)
    //   Q    = .35*83.2 + .25*100 + .15*100 + .15*94 + .10*100
    //        = 29.12 + 25 + 15 + 14.1 + 10 = 93.22 -> 93
    expect(assessment.detailedScore.components.location.score).toBeCloseTo(83.2, 10);
    expect(assessment.detailedScore.overall).toBe(93);
  });

  it('feeds the same value to the QS heuristic (1.2 km => criterion score 5)', () => {
    const assessment = assessEventQuality(event);
    const horiz = assessment.geonetQS.criteriaBreakdown.horizontalUncertainty;
    expect(horiz.value).toBeCloseTo(1.2, 10);
    expect(horiz.score).toBe(5); // "Very Good (1-2km)" band
    // Other criteria: gap 60 -> 6, 35 stations -> 6, RMS 0.15 -> 6, depth 2.0 km -> 6,
    // minimum distance 0.15 deg * 111.19 = 16.7 km -> 6. Minimum is therefore 5.
    expect(assessment.geonetQS.qualityScore).toBe(5);
  });

  it('never disagrees with the metricsFromEvent adapter used by the map views', () => {
    const viaAdapter = calculateQualityScore(metricsFromEvent(event));
    expect(assessEventQuality(event).detailedScore.overall).toBe(viaAdapter.overall);
  });

  it('does not present the in-house heuristic as the published GeoNet QS', () => {
    const text = formatIntegratedAssessment(assessEventQuality(event));
    expect(text).toContain('Location quality heuristic (in-house, not the GeoNet QS)');
    expect(text).not.toMatch(/^GeoNet QS:/m);
  });
});

describe('validateEventQuality thresholds are in km', () => {
  it('warns on a large horizontal_uncertainty reported in the km column', () => {
    const checks = validateEventQuality({ horizontal_uncertainty: 200, depth_uncertainty: 150 });
    expect(checks.map(c => c.field).sort()).toEqual(['depth_uncertainty', 'location_uncertainty']);
    expect(checks.find(c => c.field === 'location_uncertainty')?.message).toContain('200.0km');
  });

  it('honours a caller threshold expressed in km', () => {
    // 0.5 deg of latitude = 55.5 km, which exceeds a 10 km threshold. Under the old
    // degree-valued threshold this compared 0.5 against 10 deg (1111 km) and stayed silent.
    const event = { latitude: -41, latitude_uncertainty: 0.5 };
    expect(validateEventQuality(event, { maxHorizontalUncertainty: 10 })).toHaveLength(1);
    expect(validateEventQuality(event, { maxHorizontalUncertainty: 60 })).toHaveLength(0);
  });

  it('does not warn for a well-constrained location', () => {
    expect(validateEventQuality({ horizontal_uncertainty: 5, depth_uncertainty: 2 })).toHaveLength(0);
  });

  it('warns when a reported station count is zero', () => {
    // Truthiness previously skipped the check for a reported 0.
    expect(validateEventQuality({ used_station_count: 0 })[0]?.field).toBe('used_station_count');
  });
});

describe('catalogue-level score responds to location quality', () => {
  const makeCatalogue = (extra: Record<string, number>) =>
    Array.from({ length: 50 }, (_, i) => ({
      time: new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString(),
      latitude: -41 - i * 0.001,
      longitude: 174 + i * 0.001,
      depth: 10,
      magnitude: 3.5,
      ...extra,
    }));

  // Unusable locations: 80 km horizontal, 60 km depth, 340 deg gap, 2 stations, 4 s RMS.
  const unusable = makeCatalogue({
    horizontal_uncertainty: 80,
    depth_uncertainty: 60,
    azimuthal_gap: 340,
    used_station_count: 2,
    standard_error: 4.0,
  });
  // Well-constrained: 0.4 km horizontal, 0.8 km depth, 45 deg gap, 40 stations, 0.08 s RMS.
  const wellConstrained = makeCatalogue({
    horizontal_uncertainty: 0.4,
    depth_uncertainty: 0.8,
    azimuthal_gap: 45,
    used_station_count: 40,
    standard_error: 0.08,
  });

  it('computes the mean event quality index per catalogue', () => {
    // Unusable, per event:
    //   loc  = 100 - 40 (>=10 km) - 30 (>=10 km) - 30 (time absent) = 0
    //   net  = 100 - (45 + 5) - (25 + (5-2)) - 20 (phases absent)   = 2
    //   sol  = 100 - (50 + min(50, (4.0-1.0)*50))                   = 0
    //   mag  = 0 (both fields absent)   eval = 50 (both absent)
    //   Q    = .25*2 + .10*50 = 0.5 + 5 = 5.5 -> 6
    expect(performQualityCheck(unusable).eventQuality).toBe(6);

    // Well constrained, per event:
    //   loc  = 100 - 0.4*4 - 0.8*3 - 30 (time absent) = 100 - 1.6 - 2.4 - 30 = 66
    //   net  = 100 - 0 - 0 - 20 (phases absent)       = 80
    //   sol  = 100 (RMS 0.08 < 0.3)   mag = 0   eval = 50
    //   Q    = .35*66 + .25*80 + .15*100 + .10*50 = 23.1 + 20 + 15 + 5 = 63.1 -> 63
    expect(performQualityCheck(wellConstrained).eventQuality).toBe(63);
  });

  it('no longer gives an unusable catalogue the same score as an excellent one', () => {
    const bad = performQualityCheck(unusable);
    const good = performQualityCheck(wellConstrained);

    // The headline score is a four-term mean: completeness, consistency, accuracy and the
    // mean event-quality index Q. Completeness and consistency are identical across the two
    // fixtures (both are fully populated and internally consistent, so both score 100), but
    // TWO terms differ, not one:
    //   Q:        63 vs 6                                    -> (63 - 6) / 4 = 14.25
    //   accuracy: 100 vs 70, because the unusable fixture's 80 km horizontal uncertainty
    //             trips the ">10 km on a majority of events" penalty (-30) in
    //             assessDataQuality                          -> (100 - 70) / 4 =  7.50
    // so the gap is 21.75 before rounding. The scores themselves round to
    //   bad  = (100 + 100 +  70 +  5.5) / 4 = 68.875 -> 69
    //   good = (100 + 100 + 100 + 63.1) / 4 = 90.775 -> 91
    // giving a reported difference of 22.
    expect(good.score - bad.score).toBe(22);
    expect(bad.score).toBeLessThan(good.score);
    expect(bad.recommendations).not.toContain('Data quality is excellent - ready for import');
    expect(bad.recommendations.some(r => /event quality index/i.test(r))).toBe(true);
  });

  it('keeps the score defined for an empty catalogue', () => {
    const result = performQualityCheck([]);
    expect(result.score).toBe(0);
    expect(result.eventQuality).toBe(0);
  });
});
