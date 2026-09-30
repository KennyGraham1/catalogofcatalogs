/**
 * A2 items 3 and 4: the time-series panels' computed series.
 *
 * - Seismicity rate (paper, temporal pattern analysis): events at or above the
 *   estimated Mc (or the user's explicit cut-off) binned per UTC day or ISO week, chosen
 *   from the span; below the 50-event Mc floor every event is counted, with a note.
 *   A binning choice (day, week, month) re-bins the same series (paper, sec:viz).
 * - Cumulative release: seismic moment M0 = 10^(1.5 Mw + 9.1) N m (Hanks & Kanamori,
 *   1979) and radiated energy log10 E = 1.5 M + 4.8 (J), with the Moment tab's
 *   eligibility rule, on the same bins.
 *
 * Library and worker must agree exactly; the worker is driven through `self.onmessage`.
 * Expected counts, dates and sums are worked out by hand from each construction.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {
  analyzeSeismicityTimeSeries,
  calculateSeismicMoment,
  estimateCompletenessMagnitude,
  type EarthquakeEvent,
} from '@/lib/seismological-analysis';

const WORKER_PATH = path.join(__dirname, '..', 'workers', 'seismological-worker.ts');

function loadWorker(): (message: Record<string, unknown>) => any {
  const js = ts.transpileModule(fs.readFileSync(WORKER_PATH, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const posted: any[] = [];
  const selfStub: any = { postMessage: (message: any) => posted.push(message) };
  const moduleStub = { exports: {} as Record<string, unknown> };
  new Function('self', 'module', 'exports', js)(selfStub, moduleStub, moduleStub.exports);
  return (message: Record<string, unknown>) => {
    posted.length = 0;
    selfStub.onmessage({ data: message });
    return posted[posted.length - 1].result;
  };
}

let nextId = 1;
const event = (time: string, magnitude: number, magnitude_type?: string): EarthquakeEvent => ({
  id: nextId++, time, latitude: -41, longitude: 174, depth: 10, magnitude,
  ...(magnitude_type !== undefined && { magnitude_type }),
});

/** Both copies, compared whole: they run the same arithmetic in the same order. */
function bothCopies(events: EarthquakeEvent[], options: Record<string, unknown> = {}) {
  const lib = analyzeSeismicityTimeSeries(events, options as any);
  const worker = loadWorker()({ type: 'time-series', events, ...options });
  expect(worker).toEqual(JSON.parse(JSON.stringify(lib)));
  return lib;
}

describe('calendar bins (UTC)', () => {
  // Wednesday 3 Jan 2024, Wednesday 10 Jan 2024 (00:00Z), Tuesday 20 Feb 2024 (23:59:59Z).
  const three = () => [
    event('2024-01-03T05:00:00Z', 2.0),
    event('2024-01-10T00:00:00Z', 3.0),
    event('2024-02-20T23:59:59Z', 4.0),
  ];

  it('bins ISO weeks from Monday, keeps empty weeks, and marks partial first and last weeks', () => {
    const result = bothCopies(three(), { interval: 'week' });
    expect(result.interval).toBe('week');
    expect([result.startDate, result.endDate]).toEqual(['2024-01-03', '2024-02-20']);
    // Mondays 1, 8, 15, 22, 29 Jan and 5, 12, 19 Feb.
    expect(result.rate.bins.map(b => b.date)).toEqual([
      '2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22', '2024-01-29', '2024-02-05', '2024-02-12', '2024-02-19',
    ]);
    expect(result.rate.bins.map(b => b.count)).toEqual([1, 1, 0, 0, 0, 0, 0, 1]);
    expect(result.rate.bins.every(b => b.days === 7)).toBe(true);
    // The span starts on a Wednesday (5 of 7 days) and ends on a Tuesday (2 of 7).
    expect(result.rate.bins[0].coveredDays).toBe(5);
    expect(result.rate.bins[7].coveredDays).toBe(2);
    expect(result.rate.bins.slice(1, 7).every(b => b.coveredDays === undefined)).toBe(true);
  });

  it('bins calendar months with their own lengths (February 2024 has 29 days)', () => {
    const result = bothCopies(three(), { interval: 'month' });
    expect(result.rate.bins).toEqual([
      { date: '2024-01-01', count: 2, days: 31, coveredDays: 29 },
      { date: '2024-02-01', count: 1, days: 29, coveredDays: 20 },
    ]);
  });

  it('bins UTC days: an event late on the 20th UTC is not moved to a local next day', () => {
    const result = bothCopies(three(), { interval: 'day' });
    expect(result.rate.bins).toHaveLength(49); // 3 Jan to 20 Feb inclusive
    expect(result.rate.bins[48]).toEqual({ date: '2024-02-20', count: 1, days: 1 });
    expect(result.rate.bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it('chooses daily bins up to a 365-day span and weekly beyond (paper: "chosen from the span")', () => {
    const shortSpan = [event('2023-01-01T00:00:00Z', 2), event('2024-01-01T00:00:00Z', 2)]; // 365 days
    expect(bothCopies(shortSpan).interval).toBe('day');
    const longSpan = [event('2023-01-01T00:00:00Z', 2), event('2024-01-01T00:00:01Z', 2)]; // just over
    const result = bothCopies(longSpan);
    expect(result.interval).toBe('week');
    expect(result.requestedInterval).toBe('auto');
  });

  it('rejects an unknown interval in both copies', () => {
    expect(() => analyzeSeismicityTimeSeries(three(), { interval: 'year' as any })).toThrow(/Unknown rate interval/);
    expect(loadWorker()({ type: 'time-series', events: three(), interval: 'year' }).error).toMatch(/Unknown rate interval/);
  });
});

describe('the rate series counts events at or above Mc', () => {
  /**
   * 1000 events on the 0.1 grid, one per hour from 1 Mar 2024: 300 at M1.0 (under-
   * detected), 400 at M1.2 (the fullest bin), then a declining tail. MAXC + 0.2 = 1.4,
   * so with MAXC chosen the rate counts the events at M1.4 and above. (The catalogue is
   * built around its MAXC peak, so these tests choose MAXC; the default is MBS.)
   */
  function catalogue(): EarthquakeEvent[] {
    const magnitudes = [
      ...new Array(300).fill(1.0), ...new Array(400).fill(1.2), ...new Array(150).fill(1.3),
      ...new Array(80).fill(1.4), ...new Array(40).fill(1.6), ...new Array(20).fill(2.0), ...new Array(10).fill(3.0),
    ];
    const base = Date.UTC(2024, 2, 1);
    // Interleave magnitudes so every day holds a mix.
    const order = magnitudes.map((m, i) => ({ m, key: (i * 7919) % magnitudes.length })).sort((a, b) => a.key - b.key);
    return order.map(({ m }, i) => event(new Date(base + i * 3600_000).toISOString(), m));
  }

  it('uses the estimated Mc as the threshold, stating the method', () => {
    const events = catalogue();
    const result = bothCopies(events, { mcMethod: 'MAXC' });
    expect(estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'MAXC' }).mc).toBeCloseTo(1.4, 10);
    expect(result.rate.threshold).toBeCloseTo(1.4, 10);
    expect(result.rate.thresholdSource).toBe('mc');
    expect(result.rate.mcMethod).toBe('MAXC');
    expect(result.rate.maxcCorrection).toBe(0.2);
    // 80 + 40 + 20 + 10 events at or above M1.4.
    expect(result.rate.eventCount).toBe(150);
    expect(result.rate.bins.reduce((s, b) => s + b.count, 0)).toBe(150);
    // 1000 hours from 1 Mar 00:00Z end on 11 Apr (day 41 after): daily bins.
    expect(result.interval).toBe('day');
    expect(result.rate.bins).toHaveLength(42);
  });

  it('follows the Mc settings: a +0.4 correction raises the threshold to 1.6', () => {
    const result = bothCopies(catalogue(), { mcMethod: 'MAXC', maxcCorrection: 0.4 });
    expect(result.rate.threshold).toBeCloseTo(1.6, 10);
    expect(result.rate.eventCount).toBe(40 + 20 + 10);
  });

  it('estimates the threshold by b-value stability by default, as the Mc tab does', () => {
    const events = catalogue();
    const result = bothCopies(events);
    const mc = estimateCompletenessMagnitude(events);
    expect(result.rate.requestedMcMethod).toBe('MBS');
    expect(result.rate.mcMethod).toBe(mc.method);
    expect(result.rate.threshold).toBe(mc.mc);
    expect(result.rate.eventCount).toBe(mc.eventsAboveMc);
  });

  it("uses the user's explicit cut-off instead of an estimate", () => {
    const result = bothCopies(catalogue(), { minMagnitude: 2.0 });
    expect(result.rate.threshold).toBe(2.0);
    expect(result.rate.thresholdSource).toBe('cutoff');
    expect(result.rate.mcMethod).toBeUndefined();
    expect(result.rate.eventCount).toBe(30);
  });

  it('counts every event, with a note, when too few events exist to estimate Mc', () => {
    const events = catalogue().slice(0, 49);
    const result = bothCopies(events);
    expect(result.rate.threshold).toBeNull();
    expect(result.rate.thresholdSource).toBe('none');
    expect(result.rate.note).toMatch(/at least 50 events.*49 were analysed.*every event is counted/);
    expect(result.rate.eventCount).toBe(49);
  });

  it('places no event without a valid origin time, and counts it', () => {
    const events = [...catalogue(), { ...event('2024-03-02T00:00:00Z', 5.0), time: 'not a time' }];
    const result = bothCopies(events, { mcMethod: 'MAXC' });
    expect(result.untimedEvents).toBe(1);
    expect(result.rate.bins.reduce((s, b) => s + b.count, 0)).toBe(150);
  });
});

describe('cumulative release uses the Moment tab eligibility rule', () => {
  const events = () => [
    event('2024-01-01T00:00:00Z', 2.0, 'Mw'),   // exact
    event('2024-01-01T12:00:00Z', 3.0, 'ML'),   // assumed ML ~ Mw
    event('2024-01-02T00:00:00Z', 4.0, 'M'),    // GeoNet summary M: assumed
    event('2024-01-02T06:00:00Z', 5.0),         // untyped: assumed
    event('2024-01-03T00:00:00Z', 6.0, 'mb'),   // excluded (saturates)
    event('2024-01-03T01:00:00Z', 6.5, 'Ms'),   // excluded
    event('2024-01-03T02:00:00Z', 3.5, 'Md'),   // excluded
  ];
  const M0 = (m: number) => Math.pow(10, 1.5 * m + 9.1);
  const E = (m: number) => Math.pow(10, 1.5 * m + 4.8);

  it('sums M0 = 10^(1.5M + 9.1) N m and E = 10^(1.5M + 4.8) J per bin, cumulatively', () => {
    const result = bothCopies(events(), { interval: 'day' });
    const [d1, d2, d3] = result.release.bins;
    expect(d1.date).toBe('2024-01-01');
    expect(d1.moment).toBeCloseTo(M0(2) + M0(3), -6);
    expect(d2.moment).toBeCloseTo(M0(4) + M0(5), -9);
    expect(d3.moment).toBe(0); // only excluded scales that day
    expect(d3.cumulativeMoment).toBeCloseTo(M0(2) + M0(3) + M0(4) + M0(5), -9);
    expect(d3.cumulativeEnergy / E(5)).toBeCloseTo((E(2) + E(3) + E(4) + E(5)) / E(5), 12);
    // log10 E - log10 M0 = 4.8 - 9.1 for every event: Kanamori's E = M0 / 2e4 for Mw.
    expect(Math.log10(result.release.totalEnergy / result.release.totalMoment)).toBeCloseTo(-4.3, 12);
    expect([result.release.usedCount, result.release.assumedMwCount, result.release.excludedCount]).toEqual([4, 3, 3]);
  });

  it('ends at the Moment tab total', () => {
    const list = events();
    const result = bothCopies(list);
    const moment = calculateSeismicMoment(list);
    expect(result.release.totalMoment / moment.totalMoment).toBeCloseTo(1, 12);
    expect(result.release.excludedCount).toBe(moment.excludedCount);
    expect(result.release.assumedMwCount).toBe(moment.assumedMwCount);
  });

  it('counts release from every event, below the rate threshold too', () => {
    // With an explicit cut-off of M4.5 three events enter the rate series (M5.0, and the
    // mb 6.0 and Ms 6.5 the moment sum excludes), but the release still sums all four
    // moment-eligible events, M2.0 to M5.0.
    const result = bothCopies(events(), { minMagnitude: 4.5, interval: 'day' });
    expect(result.rate.eventCount).toBe(3); // M5.0, M6.0 and M6.5 are at or above M4.5
    expect(result.release.usedCount).toBe(4);
  });
});
