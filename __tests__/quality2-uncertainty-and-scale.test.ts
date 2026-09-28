/**
 * quality2 cluster regression tests.
 *
 * 1. assessDataQuality()'s accuracy dimension must resolve horizontal location uncertainty
 *    from EITHER the horizontal_uncertainty column (km, what the QuakeML/GeoNet import path
 *    writes) or the latitude/longitude_uncertainty pair (degrees). It previously read only the
 *    degree pair, so every QuakeML-derived catalogue was reported as publishing no location
 *    uncertainty and lost the full 30-point penalty.
 *
 * 2. The event-level quality index Q has a documented scale (lib/quality-scoring.ts). These
 *    tests pin the 0 / 5 / 50 / ~98 reference points that comment names, and the missing-data
 *    invariant it rests on, so the scale and the code cannot drift apart.
 *
 * 3. Catalogue admissibility (`passed`, meetsMinimumQuality) is judged on data integrity, not
 *    on the headline score, so an honest plain-CSV catalogue is not refused for lacking
 *    optional instrument metadata.
 *
 * Every expected number below is derived by hand from the weights and cut-offs in the source,
 * not by running the code first; the derivations are written out in the comments.
 */

import {
  assessDataQuality,
  horizontalUncertaintyKm,
} from '@/lib/validation';
import {
  calculateQualityScore,
  metricsFromEvent,
} from '@/lib/quality-scoring';
import {
  performQualityCheck,
  meetsMinimumQuality,
} from '@/lib/data-quality-checker';

/** Build n plain events with distinct timestamps, merging `extra` into each. */
function buildEvents(n: number, extra: Record<string, unknown> = {}): any[] {
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(),
    latitude: -41.2 + i * 0.001,
    longitude: 174.8 + i * 0.001,
    depth: 12,
    magnitude: 4.5,
    ...extra,
  }));
}

describe('horizontalUncertaintyKm', () => {
  it('returns null when the event reports none of the three columns', () => {
    expect(horizontalUncertaintyKm({ latitude: -41.2, longitude: 174.8 })).toBeNull();
    expect(horizontalUncertaintyKm({})).toBeNull();
    expect(horizontalUncertaintyKm(null)).toBeNull();
  });

  it('returns the horizontal_uncertainty column verbatim (already km)', () => {
    expect(horizontalUncertaintyKm({ horizontal_uncertainty: 2.5, latitude: -41.2 })).toBe(2.5);
  });

  it('prefers the km column over the degree pair when both are present', () => {
    // The degree pair would give 0.5 * 111 = 55.5 km; the km column says 1.2 km and wins.
    const km = horizontalUncertaintyKm({
      horizontal_uncertainty: 1.2,
      latitude_uncertainty: 0.5,
      longitude_uncertainty: 0.5,
      latitude: -41.2,
    });
    expect(km).toBe(1.2);
  });

  it('accepts a single degree component and converts it with 111 km/deg', () => {
    // Only latitude_uncertainty reported: 0.2 deg * 111 = 22.2 km.
    expect(horizontalUncertaintyKm({ latitude_uncertainty: 0.2, latitude: -41.2 }))
      .toBeCloseTo(22.2, 6);
  });

  it('shortens a longitude degree by cos(latitude)', () => {
    // 0.2 deg of longitude at the equator is 0.2 * 111 = 22.2 km ...
    expect(horizontalUncertaintyKm({ longitude_uncertainty: 0.2, latitude: 0 }))
      .toBeCloseTo(22.2, 6);
    // ... but at -60 deg, cos(60) = 0.5 exactly, so it is 11.1 km.
    expect(horizontalUncertaintyKm({ longitude_uncertainty: 0.2, latitude: -60 }))
      .toBeCloseTo(11.1, 6);
  });

  it('ignores non-finite and non-numeric values', () => {
    expect(horizontalUncertaintyKm({ horizontal_uncertainty: '2.5' })).toBeNull();
    expect(horizontalUncertaintyKm({ horizontal_uncertainty: NaN, latitude_uncertainty: 0.1, latitude: 0 }))
      .toBeCloseTo(11.1, 6);
  });
});

describe('assessDataQuality accuracy dimension resolves either uncertainty representation', () => {
  it('gives full accuracy to a catalogue that publishes only horizontal_uncertainty (km)', () => {
    // 10 events, every one reporting 0.5 km. Nothing is missing (so no share of the 30-point
    // missing-uncertainty penalty) and 0.5 km is well under the 10 km "high" cut-off, so the
    // accuracy dimension must be a clean 100.
    const report = assessDataQuality(buildEvents(10, { horizontal_uncertainty: 0.5 }));

    expect(report.accuracy).toBe(100);
    expect(
      report.checks.some(c => c.field === 'location_uncertainty')
    ).toBe(false);
  });

  it('still applies the >10 km warning when the km column is the one that is large', () => {
    // 10 events at 25 km. None missing, so no missing-data penalty; all 10 exceed 10 km,
    // which is more than half, so accuracy = 100 - 30 = 70.
    const report = assessDataQuality(buildEvents(10, { horizontal_uncertainty: 25 }));

    expect(report.accuracy).toBe(70);
    const check = report.checks.find(c => c.field === 'location_uncertainty');
    expect(check?.severity).toBe('warning');
    expect(check?.message).toContain('100.0%');
    expect(check?.message).toContain('high location uncertainty');
  });

  it('counts km-column and degree-pair events together when computing the missing fraction', () => {
    // 5 events with the km column, 5 with the degree pair, 10 with nothing at all.
    // Missing fraction = 10/20 = 0.5, so accuracy = 100 - round(30 * 0.5) = 85.
    // None of the 10 reported values exceeds 10 km, so no further penalty.
    const events = [
      ...buildEvents(5, { horizontal_uncertainty: 1.0 }),
      ...buildEvents(5, { latitude_uncertainty: 0.01, longitude_uncertainty: 0.01 }),
      ...buildEvents(10),
    ].map((e, i) => ({ ...e, time: new Date(Date.UTC(2024, 0, 2, 0, i)).toISOString() }));

    const report = assessDataQuality(events);

    expect(report.accuracy).toBe(85);
    const missing = report.checks.find(
      c => c.field === 'location_uncertainty' && c.message.includes('report no horizontal')
    );
    expect(missing?.message).toContain('50.0%');
  });

  it('leaves a catalogue with no uncertainty at all on the full missing-data penalty', () => {
    // Nothing reported anywhere: missing fraction 1.0, accuracy = 100 - 30 = 70.
    const report = assessDataQuality(buildEvents(10));
    expect(report.accuracy).toBe(70);
  });

  it('counts horizontal_uncertainty in the eventsWithUncertainties statistic', () => {
    // The statistic drives the "Add uncertainty estimates" recommendation and the upload
    // report's "Events with Uncertainties" tile; reading only the degree columns reported 0
    // for every QuakeML import.
    const report = assessDataQuality(buildEvents(10, { horizontal_uncertainty: 0.5 }));
    expect(report.statistics.eventsWithUncertainties).toBe(10);

    // A genuinely reported zero is still a reported value.
    const zeroed = assessDataQuality(buildEvents(4, { horizontal_uncertainty: 0 }));
    expect(zeroed.statistics.eventsWithUncertainties).toBe(4);
  });
});

describe('event-level quality index Q: documented scale reference points', () => {
  it('scores the documented Q=50 solution at 50', () => {
    // Derivation from lib/quality-scoring.ts:
    //   location  = 100 - min(40, 5*4) - min(30, 5*3) - min(30, 0.5*30) = 100-20-15-15 = 50
    //   network   = 100 - (45 + (180-180)/18) - (20-10)*1.5 - (30-15)/2  = 100-45-15-7.5 = 32.5
    //   solution  = 100 - (20 + (0.5-0.5)*60)                            = 80
    //   magnitude = 100 - min(60, 0.25*120) - (10-5)*4                   = 100-30-20 = 50
    //   evaluation= 100 - 20 (automatic) - 30 (preliminary)              = 50
    //   overall   = 50*.35 + 32.5*.25 + 80*.15 + 50*.15 + 50*.10
    //             = 17.5 + 8.125 + 12 + 7.5 + 5 = 50.125 -> 50
    const q = calculateQualityScore(metricsFromEvent({
      latitude: -41.2,
      horizontal_uncertainty: 5,
      depth_uncertainty: 5,
      time_uncertainty: 0.5,
      azimuthal_gap: 180,
      used_station_count: 10,
      used_phase_count: 15,
      standard_error: 0.5,
      magnitude_uncertainty: 0.25,
      magnitude_station_count: 5,
      evaluation_mode: 'automatic',
      evaluation_status: 'preliminary',
    }));

    expect(q.overall).toBe(50);
    expect(q.grade).toBe('C');
  });

  it('scores the documented Q=100 end of the scale at 98', () => {
    //   location  = 100 - 0.4*4 - 0.6*3 - 0.03*30 = 100 - 1.6 - 1.8 - 0.9 = 95.7
    //   network   = 100 (gap 45 < 90, 40 >= 20 stations, 60 >= 30 phases)
    //   solution  = 100 (RMS 0.15 < 0.3)
    //   magnitude = 100 - min(60, 0.04*120) - 0 = 95.2
    //   evaluation= 100 (manual, final)
    //   overall   = 95.7*.35 + 100*.25 + 100*.15 + 95.2*.15 + 100*.10
    //             = 33.495 + 25 + 15 + 14.28 + 10 = 97.775 -> 98
    const q = calculateQualityScore(metricsFromEvent({
      latitude: -41.2,
      horizontal_uncertainty: 0.4,
      depth_uncertainty: 0.6,
      time_uncertainty: 0.03,
      azimuthal_gap: 45,
      used_station_count: 40,
      used_phase_count: 60,
      standard_error: 0.15,
      magnitude_uncertainty: 0.04,
      magnitude_station_count: 20,
      evaluation_mode: 'manual',
      evaluation_status: 'final',
    }));

    expect(q.overall).toBe(98);
    expect(q.grade).toBe('A+');
  });

  it('puts an undocumented event and an all-poor-cut-offs event on the same 5/100', () => {
    // This equality IS the missing-data convention: with no metrics published there is no
    // evidence to separate silence from a demonstrably poor solution, so silence may not
    // score better. Both leave every dimension at 0 except evaluation, which sits at
    // 100 - 20 (unknown/automatic mode) - 30 (unknown/preliminary status) = 50,
    // contributing 50 * 0.10 = 5 to the overall.
    const bare = calculateQualityScore(metricsFromEvent({
      time: '2024-01-15T10:30:00.000Z',
      latitude: -41.2,
      longitude: 174.8,
      depth: 12,
      magnitude: 4.5,
    }));

    const allPoor = calculateQualityScore(metricsFromEvent({
      latitude: -41.2,
      horizontal_uncertainty: 10,
      depth_uncertainty: 10,
      time_uncertainty: 1,
      azimuthal_gap: 270,
      used_station_count: 0,
      used_phase_count: 0,
      standard_error: 2,
      magnitude_uncertainty: 0.5,
      magnitude_station_count: 0,
      evaluation_mode: 'automatic',
      evaluation_status: 'preliminary',
    }));

    expect(bare.overall).toBe(5);
    expect(allPoor.overall).toBe(5);
    // The invariant: withholding metadata must never pay.
    expect(bare.overall).toBeLessThanOrEqual(allPoor.overall);
  });

  it('reaches the documented Q=0 floor only with a rejected origin', () => {
    // evaluation = 100 - 20 (no mode) - 100 (rejected) -> clamped to 0, so every dimension
    // is 0 and the weighted overall is 0.
    const q = calculateQualityScore(metricsFromEvent({
      latitude: -41.2,
      evaluation_status: 'rejected',
    }));
    expect(q.overall).toBe(0);
    expect(q.grade).toBe('F');
  });
});

describe('catalogue admissibility does not hinge on optional instrument metadata', () => {
  /**
   * 100 plain-CSV events, 60 of which carry a magnitude. Derived expectations:
   *   completeness = 60 (only 60/100 have all four required fields)
   *   consistency  = 100 (distinct timestamps, no shallow M>8)
   *   accuracy     = 70  (no uncertainties reported anywhere: 100 - 30)
   *   Q            = 5   (no solution metadata on any event)
   *   headline score    = (60 + 100 + 70 + 5) / 4 = 58.75 -> 59, i.e. BELOW the 60 threshold
   *   data-integrity    = (60 + 100 + 70) / 3     = 76.67, i.e. comfortably above it
   */
  function honestCsvCatalogue(): any[] {
    return Array.from({ length: 100 }, (_, i) => {
      const event: any = {
        time: new Date(Date.UTC(2024, 0, 1, Math.floor(i / 60), i % 60)).toISOString(),
        latitude: -41.2 + i * 0.001,
        longitude: 174.8 + i * 0.001,
        depth: 12,
      };
      if (i < 60) event.magnitude = 4.5;
      return event;
    });
  }

  it('passes an honest plain-CSV catalogue whose headline score is below 60', () => {
    const result = performQualityCheck(honestCsvCatalogue());

    expect(result.report.completeness).toBe(60);
    expect(result.report.consistency).toBe(100);
    expect(result.report.accuracy).toBe(70);
    expect(result.eventQuality).toBe(5);
    expect(result.score).toBe(59);

    // The headline score is below the old `score >= 60` gate, but the catalogue is complete
    // enough, internally consistent and honest about its (absent) uncertainties, so it is
    // admissible. It must not be refused for lacking azimuthal gaps and station counts.
    expect(result.passed).toBe(true);
    expect(meetsMinimumQuality(result)).toBe(true);
  });

  it('still refuses a catalogue that fails on data integrity', () => {
    // 40/100 events carry a magnitude: completeness = 40, which trips the < 50% ERROR check
    // in assessDataQuality and also drags integrity to (40 + 100 + 70) / 3 = 70... the error
    // alone is disqualifying.
    const events = Array.from({ length: 100 }, (_, i) => {
      const event: any = {
        time: new Date(Date.UTC(2024, 0, 1, Math.floor(i / 60), i % 60)).toISOString(),
        latitude: -41.2 + i * 0.001,
        longitude: 174.8 + i * 0.001,
        depth: 12,
      };
      if (i < 40) event.magnitude = 4.5;
      return event;
    });

    const result = performQualityCheck(events);
    expect(result.report.completeness).toBe(40);
    expect(result.report.checks.some(c => c.severity === 'error')).toBe(true);
    expect(result.passed).toBe(false);
    expect(meetsMinimumQuality(result)).toBe(false);
  });

  it('admits a mediocre-but-honest catalogue: the integrity mean cannot fall below 60 without a hard error or heavy duplication', () => {
    // The accuracy term is proportional and its only
    // penalty is capped at 30, so accuracy >= 70 for any catalogue. Completeness below 50
    // is an ERROR-severity check. Therefore, with no hard error, the three-term mean is
    // bounded below by (50 + consistency + 70) / 3, and consistency would have to be
    // under 60 for the mean to dip below 60 - which the consistency checks produce only
    // when over a third of the records are duplicate-timestamp copies, not for a
    // structurally sound catalogue. The former version of this test refused such a
    // catalogue only because ONE reported 40 km value was "a majority of the reported
    // ones" and triggered a flat -30: the exact defect that was removed.
    //
    //   completeness = 50 (50/100 carry a magnitude; ERROR branch is `< 50`)
    //   consistency  = 100 - 1 (one duplicated timestamp: 1 extra copy in 100) - 5 (a shallow M8.5) = 94
    //   accuracy     = 100 - round(30 * 1.00) = 70 (every event reports a poor 40 km)
    //   integrity    = (50 + 94 + 70) / 3 = 71.3 -> admitted, correctly: honest and mediocre
    // (All 100 events used to share one timestamp here, which the flat -10 duplicate penalty
    // scored like a single coincident pair.)
    const events = Array.from({ length: 100 }, (_, i) => {
      const event: any = {
        time: new Date(Date.UTC(2024, 0, 1, 0, Math.max(0, i - 1))).toISOString(),
        latitude: -41.2,
        longitude: 174.8,
        depth: 12,
        horizontal_uncertainty: 40,
      };
      if (i < 50) event.magnitude = 4.5;
      if (i === 0) { event.depth = 2; event.magnitude = 8.5; }
      return event;
    });

    const result = performQualityCheck(events);
    expect(result.report.completeness).toBe(50);
    expect(result.report.consistency).toBe(94);
    expect(result.report.accuracy).toBe(70);
    expect(result.report.checks.some(c => c.severity === 'error')).toBe(false);
    expect(result.passed).toBe(true);
    expect(meetsMinimumQuality(result)).toBe(true);
  });

  it('rewards a fully documented QuakeML catalogue on both the score and the accuracy term', () => {
    // Every event reports 0.5 km horizontal uncertainty via the km column, so accuracy is 100
    // (it was 70 before the fix, because only the degree columns were consulted).
    const events = buildEvents(10, {
      horizontal_uncertainty: 0.5,
      depth_uncertainty: 0.8,
      time_uncertainty: 0.05,
      azimuthal_gap: 60,
      used_station_count: 25,
      used_phase_count: 40,
      standard_error: 0.2,
      magnitude_uncertainty: 0.05,
      magnitude_station_count: 12,
      evaluation_mode: 'manual',
      evaluation_status: 'reviewed',
    });

    const result = performQualityCheck(events);
    expect(result.report.accuracy).toBe(100);
    expect(result.report.completeness).toBe(100);
    expect(result.report.consistency).toBe(100);
    // Per-event Q for this metric set:
    //   location  = 100 - 0.5*4 - 0.8*3 - 0.05*30 = 100 - 2 - 2.4 - 1.5 = 94.1
    //   network   = 100, solution = 100, evaluation = 100
    //   magnitude = 100 - min(60, 0.05*120) - (10-10 -> 0) = 94
    //   overall   = 94.1*.35 + 100*.25 + 100*.15 + 94*.15 + 100*.10
    //             = 32.935 + 25 + 15 + 14.1 + 10 = 97.035 -> 97
    expect(result.eventQuality).toBe(97);
    // headline = (100 + 100 + 100 + 97) / 4 = 99.25 -> 99
    expect(result.score).toBe(99);
    expect(result.passed).toBe(true);
  });
});
