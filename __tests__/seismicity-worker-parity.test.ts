/**
 * lib/seismological-analysis.ts and workers/seismological-worker.ts are two
 * hand-maintained copies of the same estimators: the Analytics tab reads the
 * worker, server/report paths read the lib. They drifted (different binning,
 * different Mc correction, a 20-cluster cap in one of them), so the two printed
 * different numbers for the same catalogue.
 *
 * These tests load the real worker source, run it through its own `onmessage`
 * entry point, and assert it agrees with the lib exactly. Expected values come
 * from the lib functions ONLY as a cross-check of agreement; every standalone
 * expectation below (cluster counts, withheld fits, bin keys) is derived from
 * the construction of the input, not from running either implementation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  analyzeTemporalPattern,
  gardnerKnopoffDeclustering,
  type EarthquakeEvent,
  calculateSeismicMoment,
} from '../lib/seismological-analysis';

const WORKER_PATH = path.join(__dirname, '..', 'workers', 'seismological-worker.ts');

/**
 * Compile the worker and hand back a `run(message)` helper that drives its
 * `self.onmessage` handler. Each call returns a fresh module instance (and so a
 * fresh result cache), because the worker's cache key covers only the event
 * list, not the analysis parameters.
 */
function loadWorker(): (message: Record<string, unknown>) => any {
  const source = fs.readFileSync(WORKER_PATH, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
    },
  }).outputText;

  const posted: any[] = [];
  const selfStub: any = { postMessage: (message: any) => posted.push(message) };
  const moduleStub = { exports: {} as Record<string, unknown> };
  const factory = new Function('self', 'module', 'exports', js);
  factory(selfStub, moduleStub, moduleStub.exports);

  return (message: Record<string, unknown>) => {
    posted.length = 0;
    selfStub.onmessage({ data: message });
    return posted[posted.length - 1].result;
  };
}

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

describe('Gardner-Knopoff cluster ownership', () => {
  const event = (id: string, day: number, magnitude: number): EarthquakeEvent => ({
    id, time: new Date(Date.UTC(2020, 0, 1) + day * 86400000).toISOString(),
    latitude: -41, longitude: 174, depth: 10, magnitude,
  });

  it('keeps a mainshock and its cluster separate from an earlier smaller event', () => {
    const events = [event('fore', -.1, 3), event('main', 0, 5), event('after-1', .1, 2), event('after-2', .2, 2)];
    const result = gardnerKnopoffDeclustering(events);
    expect(result.mainshocks.map(e => e.id)).toEqual(['fore', 'main']);
    expect(Array.from(result.clusters.values()).map(c => c.map(e => e.id))).toEqual([['main', 'after-1', 'after-2']]);
    const worker = loadWorker()({ type: 'temporal', events });
    expect(worker.clusters).toHaveLength(1);
    expect(worker.clusters[0]).toMatchObject({ eventCount: 3, maxMagnitude: 5, mainshock: { id: 'main' } });
  });

  it('assigns each event once across the 6.5 magnitude window discontinuity', () => {
    const events = [
      event('early', 0, 6.49), event('early-1', .1, 2), event('early-2', .2, 2),
      event('late', 900, 6.5), event('late-1', 900.1, 2), event('late-2', 900.2, 2),
    ];
    const result = gardnerKnopoffDeclustering(events);
    const members = Array.from(result.clusters.values()).flat();
    expect(members).toHaveLength(events.length);
    expect(new Set(members.map(e => e.id)).size).toBe(events.length);
    expect(result.mainshocks.map(e => e.id)).toEqual(['early', 'late']);
    const worker = loadWorker()({ type: 'temporal', events });
    expect(worker.clusters).toHaveLength(2);
    expect(worker.clusters.map((c: any) => c.eventCount)).toEqual([3, 3]);
    expect(worker.clusters.map((c: any) => [c.mainshock.id, c.maxMagnitude, c.aftershockCount]))
      .toEqual([['late', 6.5, 2], ['early', 6.49, 2]]);
  });

  it('does not let an earlier smaller event consume an independent larger event', () => {
    const events = [event('fore', -.1, 3), event('main', 0, 5)];
    const result = gardnerKnopoffDeclustering(events);
    expect(result.mainshocks.map(e => e.id)).toEqual(['fore', 'main']);
    expect(result.clusters.size).toBe(0);
  });
});

/**
 * A b = 1 catalogue on the 0.1 grid above M2.0 with an incomplete tail below it.
 * Deterministic: no RNG, so both copies see byte-identical input.
 */
function syntheticCatalogue(): EarthquakeEvent[] {
  const magnitudes: number[] = [];
  const push = (magnitude: number, count: number) => {
    for (let i = 0; i < count; i++) magnitudes.push(magnitude);
  };
  push(1.8, 300); // under-detected tail
  push(1.9, 700);
  for (let k = 0; k <= 30; k++) {
    const magnitude = Number((2.0 + k * 0.1).toFixed(1));
    push(magnitude, Math.round(2000 * Math.pow(10, -(magnitude - 2.0))));
  }
  return eventsWithMagnitudes(magnitudes);
}

describe('worker and lib agree on the Gutenberg-Richter fit', () => {
  it('returns identical b, a, Mc and sigma_b for the same catalogue', () => {
    const events = syntheticCatalogue();
    const expected = calculateGutenbergRichter(events);
    const actual = loadWorker()({ type: 'gutenberg-richter', events });

    expect(actual.error).toBeUndefined();
    expect(actual.bValue).toBeCloseTo(expected.bValue, 12);
    expect(actual.aValue).toBeCloseTo(expected.aValue, 12);
    expect(actual.completeness).toBe(expected.completeness);
    expect(actual.bUncertainty).toBeCloseTo(expected.bUncertainty, 12);
    expect(actual.rSquared).toBeCloseTo(expected.rSquared, 12);
    expect(actual.dataPoints.map((p: any) => [p.magnitude, p.count])).toEqual(
      expected.dataPoints.map(p => [p.magnitude, p.count])
    );
  });

  it('withholds the fit in both copies when fewer than 10 events sit above Mc', () => {
    // Same 52-event catalogue as __tests__/seismicity-hard-floors.test.ts: MAXC
    // gives Mc = 1.2 and only 8 events are at or above it.
    const events = eventsWithMagnitudes([
      ...new Array(42).fill(1.0), 1.1, 1.1, 1.2, 1.3, 1.5, 1.8, 2.2, 2.7, 3.4, 4.6,
    ]);

    expect(() => calculateGutenbergRichter(events)).toThrow(
      /Insufficient data above the completeness magnitude/
    );
    const actual = loadWorker()({ type: 'gutenberg-richter', events });
    expect(actual.error).toMatch(/Insufficient data above the completeness magnitude/);
    expect(actual.bValue).toBeUndefined();
  });

  it('withholds the fit in both copies when fewer than three bins are populated', () => {
    const events = eventsWithMagnitudes([
      ...new Array(35).fill(1.0),
      ...new Array(20).fill(4.0),
    ]);

    expect(() => calculateGutenbergRichter(events)).toThrow(/at least 3 populated bins/);
    expect(loadWorker()({ type: 'gutenberg-richter', events }).error).toMatch(
      /at least 3 populated bins/
    );
  });
});

describe('the worker copy survives a national-scale catalogue', () => {
  it('analyses more events than the V8 spread-argument limit', () => {
    // Math.min(...array) throws RangeError above ~131,000 arguments on Node 20;
    // the paper's worked example merges 218,000 records.
    const n = 150_000;
    const magnitudes = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      magnitudes[i] = Math.round((1 + (i % 41) * 0.1) * 10) / 10;
    }
    const events = eventsWithMagnitudes(magnitudes);

    const gr = loadWorker()({ type: 'gutenberg-richter', events });
    expect(gr.error).toBeUndefined();
    expect(gr.bValue).toBeGreaterThan(0);

    const mc = loadWorker()({ type: 'completeness', events });
    expect(mc.error).toBeUndefined();
    expect(mc.mc).toBeGreaterThan(0);
  });
});

describe('worker and lib agree on the completeness magnitude', () => {
  it('returns an identical Mc and non-cumulative FMD at the default bin width', () => {
    const events = syntheticCatalogue();
    const expected = estimateCompletenessMagnitude(events, 0.1);
    const actual = loadWorker()({ type: 'completeness', events });

    expect(actual.mc).toBe(expected.mc);
    expect(actual.method).toBe('MAXC');
    expect(actual.confidence).toBeCloseTo(expected.confidence, 12);
    expect(actual.magnitudeDistribution).toEqual(expected.magnitudeDistribution);
    // A frequency-magnitude distribution must partition the sample. The worker's
    // old per-bin `m >= edge && m < edge + binWidth` rescan counted magnitudes on
    // a bin boundary twice (0.2 + 0.1 is 0.30000000000000004), so its bins summed
    // to about 132% of N.
    const binned = actual.magnitudeDistribution.reduce(
      (sum: number, bin: { count: number }) => sum + bin.count,
      0
    );
    expect(binned).toBe(events.length);
    // Independent check: the modal bin of this catalogue is M2.0 by construction
    // (2000 events there, more than any other), so MAXC + 0.2 must give 2.2.
    expect(actual.mc).toBeCloseTo(2.2, 10);
  });

  it('honours the requested bin width instead of assuming 0.1', () => {
    const events = syntheticCatalogue();
    const expected = estimateCompletenessMagnitude(events, 0.05);
    const actual = loadWorker()({ type: 'completeness', events, binWidth: 0.05 });

    expect(actual.mc).toBe(expected.mc);
    expect(actual.magnitudeDistribution).toEqual(expected.magnitudeDistribution);
    // Half-width bins over the same magnitude range must double the bin count.
    expect(actual.magnitudeDistribution.length).toBeGreaterThan(
      estimateCompletenessMagnitude(events, 0.1).magnitudeDistribution.length
    );
  });
});

describe('worker and lib agree on temporal analysis', () => {
  it('preserves all occupied periods and a burst in the last period beyond 500 bins', () => {
    const start = Date.UTC(2000, 0, 3);
    const events = eventsWithMagnitudes(new Array(511).fill(-1));
    events.forEach((event, i) => {
      event.time = new Date(start + Math.min(i, 501) * 14 * 86400_000).toISOString();
    });
    const actual = loadWorker()({ type: 'temporal', events });
    expect(actual.timeSeries).toHaveLength(502);
    expect(actual.timeSeries.reduce((sum: number, bin: { count: number }) => sum + bin.count, 0)).toBe(511);
    expect(actual.timeSeries[501]).toMatchObject({ count: 10, cumulativeCount: 511 });
    expect(actual.timeSeries).toEqual(analyzeTemporalPattern(events).timeSeries);
  });

  /**
   * 25 isolated mainshock-aftershock sequences plus one larger sequence.
   * Sequences are 100 days apart (longer than the M4 Gardner-Knopoff time
   * window of 10^(0.5409*4-0.547) = 41.4 d) and 0.5 degrees of latitude apart
   * (~55 km, wider than the M5 distance window of 10^(0.1238*5+0.983) = 40 km),
   * so each sequence must be recovered as exactly one cluster.
   */
  function clusteredCatalogue(): EarthquakeEvent[] {
    const events: EarthquakeEvent[] = [];
    const base = Date.UTC(2015, 0, 5); // a Monday
    let id = 1;
    const DAY = 86400_000;

    for (let s = 0; s < 25; s++) {
      const t0 = base + s * 100 * DAY;
      const lat = -30 - s * 0.5;
      // Mainshock plus three aftershocks hours later at the same spot.
      const mags = [4.0, 2.8, 2.5, 2.2];
      mags.forEach((magnitude, k) => {
        events.push({
          id: id++,
          time: new Date(t0 + k * 3600_000).toISOString(),
          latitude: lat,
          longitude: 174,
          depth: 10,
          magnitude,
        });
      });
    }

    // One long sequence (60 events, above the 50-event floor for estimating its
    // Mc) so the per-cluster b-value path is exercised.
    const tBig = base + 26 * 100 * DAY;
    for (let k = 0; k < 60; k++) {
      events.push({
        id: id++,
        time: new Date(tBig + k * 3600_000).toISOString(),
        latitude: -30 - 26 * 0.5,
        longitude: 174,
        depth: 10,
        magnitude: k === 0 ? 5.0 : Number((2.0 + (k % 12) * 0.1).toFixed(1)),
      });
    }

    return events;
  }

  it('reports every cluster, not the top 20', () => {
    const events = clusteredCatalogue();
    const expected = analyzeTemporalPattern(events);
    const actual = loadWorker()({ type: 'temporal', events });

    // 26 sequences were planted and each is isolated in both space and time, so
    // 26 clusters of >= 3 events must be reported. The worker used to cap at 20.
    expect(expected.clusters.length).toBe(26);
    expect(actual.clusters.length).toBe(26);
  });

  it('produces identical cluster summaries in both copies', () => {
    const events = clusteredCatalogue();
    const expected = analyzeTemporalPattern(events);
    const actual = loadWorker()({ type: 'temporal', events });

    const summarise = (clusters: any[]) =>
      clusters.map(c => ({
        eventCount: c.eventCount,
        maxMagnitude: c.maxMagnitude,
        mainshockId: c.mainshock.id,
        aftershockCount: c.aftershockCount,
        foreshockCount: c.foreshockCount,
        clusterType: c.clusterType,
        durationDays: Number(c.durationDays.toFixed(9)),
        spatialExtentKm: Number(c.spatialExtentKm.toFixed(9)),
        bValue: c.bValue === undefined ? undefined : Number(c.bValue.toFixed(9)),
      }));

    expect(summarise(actual.clusters)).toEqual(summarise(expected.clusters));
    // The 60-event sequence clears the Mc floor, so a per-cluster b-value exists.
    expect(expected.clusters.some(c => c.eventCount === 60 && c.bValue !== undefined)).toBe(true);
  });

  it('produces identical, parseable weekly time-series keys in both copies', () => {
    const events = clusteredCatalogue();
    const expected = analyzeTemporalPattern(events);
    const actual = loadWorker()({ type: 'temporal', events });

    expect(expected.timeSpanDays).toBeGreaterThan(365); // weekly branch
    expect(actual.timeSeries).toEqual(expected.timeSeries);
    for (const point of actual.timeSeries) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(point.date).getTime())).toBe(false);
    }
    // 5 Jan 2015 is itself a Monday, so the first sequence keys its own date.
    expect(actual.timeSeries[0].date).toBe('2015-01-05');
  });
});

describe('worker and lib agree on seismic moment', () => {
  it('returns identical totals, eligibility counts and 0.5-magnitude bins', () => {
    const events = syntheticCatalogue().map((e, i) => ({
      ...e,
      // Mix the scales the eligibility rule distinguishes, including GeoNet's bare 'M'.
      magnitude_type: (['Mw', 'ML', 'M', 'mb', 'Ms', undefined] as const)[i % 6],
    }));
    const expected = calculateSeismicMoment(events as any);
    const actual = loadWorker()({ type: 'moment', events });
    expect(actual.error).toBeUndefined();
    expect(actual.totalMoment).toBeCloseTo(expected.totalMoment, 6);
    expect(actual.totalMomentMagnitude).toBeCloseTo(expected.totalMomentMagnitude, 12);
    expect([actual.assumedMwCount, actual.excludedCount]).toEqual([expected.assumedMwCount, expected.excludedCount]);
    expect(actual.momentByMagnitude.map((b: any) => [b.magnitude, b.count])).toEqual(
      expected.momentByMagnitude.map(b => [b.magnitude, b.count])
    );
    expect(actual.largestEvent.magnitude).toBe(expected.largestEvent.magnitude);
  });
});
