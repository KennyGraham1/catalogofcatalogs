/**
 * Regression tests for the seismicity hard floors and the temporal bin keys.
 *
 * Expected values are derived from the published estimators and from the
 * calendar, never by running the implementation:
 *   - MAXC (Wiemer & Wyss, 2000): Mc is the argmax of the NON-cumulative FMD,
 *     plus the +0.2 correction of Woessner & Wiemer (2005).
 *   - Aki (1965) / Utsu (1965) MLE: b = log10(e) / (mean(M) - (Mc - dM/2)).
 *   - The paper (srl_paper.tex, sec:mc) states that CofC "enforces hard floors
 *     below which an estimate is withheld rather than reported, requiring at
 *     least 10 events (and three populated magnitude bins) for a
 *     Gutenberg-Richter fit".
 *   - ISO-8601 weeks start on Monday; the weekday of each date below was taken
 *     from the calendar (14 Feb 2016 was a Sunday, and so on).
 */

import {
  calculateGutenbergRichter,
  analyzeTemporalPattern,
  type EarthquakeEvent,
} from '../lib/seismological-analysis';

/** Events carrying the given magnitudes, one hour apart, at a single location. */
function eventsWithMagnitudes(magnitudes: number[]): EarthquakeEvent[] {
  const base = Date.UTC(2020, 0, 1);
  return magnitudes.map((magnitude, i) => ({
    id: i + 1,
    time: new Date(base + i * 3600_000).toISOString(),
    latitude: -41,
    longitude: 174,
    depth: 10,
    magnitude,
  }));
}

/** Expand a {magnitude: count} table into a magnitude list. */
function expand(table: Array<[number, number]>): number[] {
  const magnitudes: number[] = [];
  for (const [magnitude, count] of table) {
    for (let i = 0; i < count; i++) magnitudes.push(magnitude);
  }
  return magnitudes;
}

describe('Gutenberg-Richter hard floors are withheld, not silently relaxed', () => {
  it('withholds an estimated Mc, and so the fit, below 50 events', () => {
    // A 14-event aftershock sequence. The paper (sec:mc) withholds an Mc estimated
    // from fewer than 50 events, and without a cut-off the fit estimates Mc itself.
    // (Older code fell back to the catalogue floor here and reported completeness
    // = 1.0 with b = 0.5287.)
    const sequence = [1.0, 1.0, 1.0, 1.0, 1.0, 1.1, 1.2, 1.3, 1.5, 1.8, 2.2, 2.7, 3.4, 4.6];
    expect(() => calculateGutenbergRichter(eventsWithMagnitudes(sequence))).toThrow(
      /need at least 50 events/
    );
  });

  it('withholds the fit when fewer than 10 events lie above the estimated Mc', () => {
    // 52 events, enough to estimate Mc. Non-cumulative FMD: 1.0 -> 42, 1.1 -> 2,
    // and 1.2, 1.3, 1.5, 1.8, 2.2, 2.7, 3.4, 4.6 -> 1 each. MAXC picks M1.0, so
    // Mc = 1.0 + 0.2 = 1.2 and only those 8 events sit at or above it. Eight is
    // below the floor of ten, so no estimate may be returned.
    const events = eventsWithMagnitudes(
      expand([[1.0, 42], [1.1, 2], [1.2, 1], [1.3, 1], [1.5, 1], [1.8, 1], [2.2, 1], [2.7, 1], [3.4, 1], [4.6, 1]])
    );

    expect(() => calculateGutenbergRichter(events)).toThrow(
      /Insufficient data above the completeness magnitude/
    );
  });

  it('withholds the fit when fewer than three magnitude bins are populated', () => {
    // Two populated bins only (M1.0 and M4.0). The cumulative FMD still has 31
    // entries between them, which is why counting cumulative points passed this
    // through and returned b = 0.1524 with R^2 = -13.54.
    const events = eventsWithMagnitudes(expand([[1.0, 35], [4.0, 20]]));

    expect(() => calculateGutenbergRichter(events)).toThrow(
      /at least 3 populated bins/
    );
  });

  it('still fits, and reports the MAXC Mc, when both floors are met', () => {
    // Incomplete tail below M2.2, complete b = 1 catalogue above it (counts
    // 1000 x 10^-(M-2.2) out to M5.0). The non-cumulative peak is at M2.0, so
    // MAXC + 0.2 gives Mc = 2.2 exactly.
    const table: Array<[number, number]> = [
      [2.0, 1200], // peak of the non-cumulative FMD
      [2.1, 1100],
    ];
    for (let k = 0; k <= 28; k++) {
      const magnitude = Number((2.2 + k * 0.1).toFixed(1));
      table.push([magnitude, Math.round(1000 * Math.pow(10, -(magnitude - 2.2)))]);
    }
    const events = eventsWithMagnitudes(expand(table));
    const result = calculateGutenbergRichter(events);

    expect(result.completeness).toBeCloseTo(2.2, 10);

    // Independent Aki-Utsu evaluation over the same count table.
    const aboveMc = table.filter(([m]) => m >= 2.2 - 1e-9);
    const n = aboveMc.reduce((sum, [, c]) => sum + c, 0);
    const meanMag = aboveMc.reduce((sum, [m, c]) => sum + m * c, 0) / n;
    const expectedB = Math.LOG10E / (meanMag - (2.2 - 0.05));
    expect(result.bValue).toBeCloseTo(expectedB, 10);
    // sigma_b = b / sqrt(N) (Aki, 1965), with N counted above Mc only.
    expect(result.bUncertainty).toBeCloseTo(expectedB / Math.sqrt(n), 10);
    // The planted b is 1.0; the estimator must land near it.
    expect(result.bValue).toBeGreaterThan(0.9);
    expect(result.bValue).toBeLessThan(1.1);
  });
});

describe('temporal time-series bin keys are parseable dates', () => {
  /** One event at each of the given instants, spread over more than a year. */
  function eventsAt(times: string[]): EarthquakeEvent[] {
    return times.map((time, i) => ({
      id: i + 1,
      time,
      latitude: -41 + i * 0.001,
      longitude: 174 + i * 0.001,
      depth: 10,
      magnitude: 2.0 + (i % 5) * 0.1,
    }));
  }

  const times = [
    '2016-02-14T06:00:00Z', // Sunday   -> ISO week starting Mon 2016-02-08
    '2016-11-13T23:30:00Z', // Sunday   -> Mon 2016-11-07
    '2017-01-01T00:00:00Z', // Sunday   -> Mon 2016-12-26 (previous calendar year)
    '2019-06-15T12:00:00Z', // Saturday -> Mon 2019-06-10
  ];

  it('keys weekly bins by the Monday of the ISO week, not "YYYY-Www"', () => {
    const result = analyzeTemporalPattern(eventsAt(times));
    // Span is > 365 days, so the weekly branch is used.
    expect(result.timeSpanDays).toBeGreaterThan(365);

    expect(result.timeSeries.map(p => p.date)).toEqual([
      '2016-02-08',
      '2016-11-07',
      '2016-12-26',
      '2019-06-10',
    ]);
  });

  it('emits only keys a date formatter can parse', () => {
    const result = analyzeTemporalPattern(eventsAt(times));
    for (const point of result.timeSeries) {
      const parsed = new Date(point.date);
      // "2016-W47" parses to Invalid Date, which rendered as "NaN/aN" on the
      // chart axis and "Invalid Date" in the tooltip.
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('conserves the event count across weekly bins', () => {
    const result = analyzeTemporalPattern(eventsAt(times));
    const last = result.timeSeries[result.timeSeries.length - 1];
    expect(last.cumulativeCount).toBe(times.length);
  });

  it('keeps daily bins on the event date when the span is under a year', () => {
    const result = analyzeTemporalPattern(
      eventsAt(['2020-03-01T01:00:00Z', '2020-03-01T22:00:00Z', '2020-05-04T09:00:00Z'])
    );
    expect(result.timeSeries.map(p => p.date)).toEqual(['2020-03-01', '2020-05-04']);
  });
});
