/**
 * Post-fix review of the seismology engine (lib/seismological-analysis.ts and the worker
 * the Analysis page runs, driven through its own `self.onmessage`):
 *
 *  1  the GFT summed an empty bin above the largest continuous magnitude;
 *  2  one unparseable origin time corrupted Gardner-Knopoff (NaN in the sort);
 *  3  float-noisy magnitudes (float32, 8-digit prints) read as continuous;
 *  5  reporting steps coarser than 0.1 (0.2, 0.25, 0.5) were misreported;
 *  6  "events at or above Mc" used an exact comparison where the fit was tolerant;
 *  8  a whitespace-only magnitude type was excluded from the moment sum;
 *  b  one unparseable origin time failed the whole temporal analysis;
 *  and Reasenberg, which sorted and linked through NaN times the same way.
 *
 * Expected values come from each construction, from brute-force oracles written in
 * this file, or from hand formulas, never from the code under test.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {
  analyzeSeismicityTimeSeries,
  analyzeTemporalPattern,
  calculateGutenbergRichter,
  calculateSeismicMoment,
  declusterGardnerKnopoff,
  estimateCompletenessMagnitude,
  gardnerKnopoffDeclustering,
  getGardnerKnopoffWindow,
  reasenbergDeclustering,
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

/** mulberry32: a seeded PRNG in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal CDF (Abramowitz & Stegun 7.1.26). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(z) * erf);
}

/** Continuous b = 1 magnitudes above 0.5, thinned by a detection ramp complete near 2.0. */
function continuousWithIncompleteTail(n: number, random: () => number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const m = 0.5 - Math.log(1 - random()) / Math.LN10;
    if (random() < normalCdf((m - 1.7) / 0.15)) out.push(m);
  }
  return out;
}

function eventsWithMagnitudes(magnitudes: number[], types?: (string | undefined)[]): EarthquakeEvent[] {
  const base = Date.UTC(2020, 0, 1);
  return magnitudes.map((magnitude, i) => ({
    id: `e${i}`, time: new Date(base + i * 3600_000).toISOString(),
    latitude: -41, longitude: 174, depth: 10, magnitude,
    ...(types && types[i] !== undefined && { magnitude_type: types[i] }),
  }));
}

const repeat = (m: number, n: number) => new Array<number>(n).fill(m);

describe('1: the GFT sums up to the bin holding the largest magnitude', () => {
  /**
   * Wiemer & Wyss (2000) for continuous magnitudes: 0.1 bins from the one holding the
   * smallest magnitude to the one holding the largest; for each candidate Mi with >= 10
   * events in >= 3 populated bins, b = log10(e) / (mean - Mi), S_j = N 10^(-b (M_j - Mi)),
   * B_j = #{M >= M_j}, R = 100 - 100 sum|B - S| / sum B over the bins from Mi to the top.
   */
  function oracle(magnitudes: number[]): { curve: Map<number, number>; mc: number | null } {
    const edge = (m: number) => Math.floor(m / 0.1 + 1e-9);
    const lo = edge(Math.min(...magnitudes));
    const hi = edge(Math.max(...magnitudes));
    const counts = new Map<number, number>();
    for (const m of magnitudes) counts.set(edge(m), (counts.get(edge(m)) ?? 0) + 1);
    const curve = new Map<number, number>();
    for (let i = lo; i <= hi; i++) {
      const mi = Number((i * 0.1).toFixed(1));
      const sample = magnitudes.filter(m => edge(m) >= i);
      let populated = 0;
      for (let j = i; j <= hi; j++) if (counts.get(j)) populated++;
      if (sample.length < 10 || populated < 3) break;
      const b = Math.LOG10E / (sample.reduce((s, m) => s + m, 0) / sample.length - mi);
      let misfit = 0;
      let observed = 0;
      for (let j = i; j <= hi; j++) {
        const B = magnitudes.filter(m => edge(m) >= j).length;
        misfit += Math.abs(B - sample.length * Math.pow(10, -b * (j - i) * 0.1));
        observed += B;
      }
      curve.set(mi, 100 - (100 * misfit) / observed);
    }
    const points = Array.from(curve.entries());
    const at = (level: number) => points.find(([, r]) => r >= level)?.[0] ?? null;
    return { curve, mc: at(95) ?? at(90) };
  }

  it('reproduces the reference R curve and Mc on continuous magnitudes, in both copies', () => {
    const run = loadWorker();
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const magnitudes = continuousWithIncompleteTail(seed % 2 ? 250 : 120, rng(seed));
      const events = eventsWithMagnitudes(magnitudes);
      const lib = estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'GFT' });
      const ref = oracle(magnitudes);
      expect(lib.gftCurve!.map(p => p.magnitude)).toEqual(Array.from(ref.curve.keys()));
      // The engine estimates the reporting resolution rather than being told it, which
      // moves R by far less than 0.01; the phantom bin moved it by 0.1 to 3 points.
      for (const point of lib.gftCurve!) expect(Math.abs(point.fit - ref.curve.get(point.magnitude)!)).toBeLessThan(0.01);
      expect(lib.method === 'GFT' ? lib.mc : null).toBe(ref.mc);
      const worker = run({ type: 'completeness', events, mcMethod: 'GFT' });
      expect(worker.mc).toBe(lib.mc);
      worker.gftCurve.forEach((p: any, i: number) => expect(p.fit).toBeCloseTo(lib.gftCurve![i].fit, 12));
    }
  });
});

describe('2: an unparseable origin time does not disturb Gardner-Knopoff', () => {
  const DAY = 86400_000;
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /** The window method written out: heads by magnitude, then time (bad last), then input order. */
  function bruteForce(events: EarthquakeEvent[]): Map<string, string> {
    const time = new Map(events.map(e => [e.id, Date.parse(e.time)]));
    const index = new Map(events.map((e, i) => [e.id, i]));
    const key = (e: EarthquakeEvent) => (Number.isFinite(time.get(e.id)!) ? time.get(e.id)! : Infinity);
    const heads = [...events].sort((a, b) => b.magnitude - a.magnitude ||
      (key(a) === key(b) ? 0 : key(a) < key(b) ? -1 : 1) || index.get(a.id)! - index.get(b.id)!);
    const taken = new Set<string | number>();
    const headOf = new Map<string, string>();
    for (const head of heads) {
      if (taken.has(head.id)) continue;
      taken.add(head.id);
      const t0 = time.get(head.id)!;
      if (!Number.isFinite(t0)) continue;
      const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(head.magnitude);
      for (const e of events) {
        if (taken.has(e.id)) continue;
        const dt = (time.get(e.id)! - t0) / DAY;
        if (!(dt >= 0 && dt <= timeWindowDays)) continue;
        if (haversine(head.latitude, head.longitude, e.latitude, e.longitude) <= distanceWindowKm) {
          taken.add(e.id);
          headOf.set(String(e.id), String(head.id));
        }
      }
    }
    return headOf;
  }

  /** Mainshocks with aftershocks in and beyond their windows, shuffled, some times broken. */
  function catalogue(seed: number, n: number, broken: number): EarthquakeEvent[] {
    const r = rng(seed);
    const events: EarthquakeEvent[] = [];
    let k = 0;
    while (events.length < n) {
      const lat = -48 + r() * 14;
      const lon = 166 + r() * 12;
      const t = Date.UTC(2015, 0, 1) + Math.floor(r() * 3 * 365 * DAY);
      const mag = 2 - Math.log(1 - r()) / Math.LN10;
      events.push({ id: `m${k++}`, time: new Date(t).toISOString(), latitude: lat, longitude: lon, depth: 10, magnitude: mag });
      const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(mag);
      const aftershocks = Math.floor(Math.pow(10, 0.8 * (mag - 2)) * r() * 3);
      for (let a = 0; a < aftershocks && events.length < n; a++) {
        const dist = r() * 1.3 * distanceWindowKm;
        const az = r() * 2 * Math.PI;
        events.push({
          id: `m${k++}`,
          time: new Date(t + (r() * 1.3 - 0.1) * timeWindowDays * DAY).toISOString(),
          latitude: lat + (dist / 111.2) * Math.cos(az),
          longitude: lon + (dist / (111.2 * Math.cos((lat * Math.PI) / 180))) * Math.sin(az),
          depth: 10,
          magnitude: Math.min(1.5 - Math.log(1 - r()) / Math.LN10, mag - 0.01),
        });
      }
    }
    for (let i = events.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [events[i], events[j]] = [events[j], events[i]];
    }
    for (let i = 0; i < broken; i++) events[Math.floor(r() * events.length)].time = 'not a time';
    return events;
  }

  it.each([[101, 1], [202, 3], [303, 5]])('matches brute force with bad times (seed %s, %s broken)', (seed, broken) => {
    const events = catalogue(seed, 1500, broken);
    const expected = bruteForce(events);
    const { clusters } = gardnerKnopoffDeclustering(events);
    const got = new Map<string, string>();
    clusters.forEach((members, head) => members.forEach(m => { if (m.id !== head) got.set(String(m.id), String(head)); }));
    for (const e of events) expect(got.get(String(e.id)) ?? null).toBe(expected.get(String(e.id)) ?? null);

    const tags = declusterGardnerKnopoff(events.map(({ id, time, latitude, longitude, magnitude }) => ({ id: String(id), time, latitude, longitude, magnitude })));
    for (const e of events) {
      const head = expected.get(String(e.id));
      expect(tags.get(String(e.id))!.isDependent).toBe(head !== undefined);
      if (head !== undefined) expect(tags.get(String(e.id))!.clusterId).toBe(head);
    }
  });

  it('gives the worker the same clusters as the library', () => {
    const events = catalogue(404, 1500, 4);
    const lib = analyzeTemporalPattern(events);
    const worker = loadWorker()({ type: 'temporal', events });
    const summarise = (clusters: any[]) => clusters.map(c => [String(c.mainshock.id), c.eventCount]);
    expect(summarise(worker.clusters)).toEqual(summarise(lib.clusters));
  });

  it('Reasenberg leaves an unparseable time out of every cluster and the rest unchanged', () => {
    const base = Date.UTC(2020, 0, 1);
    const at = (id: string, hours: number, magnitude: number) => ({
      id, time: new Date(base + hours * 3600_000).toISOString(), latitude: -41, longitude: 174, depth: 10, magnitude,
    });
    const clean = [at('main', 0, 5), at('a1', 1, 3), at('a2', 2, 3), at('far', 24 * 400, 3)];
    const withBad = [clean[0], { ...at('bad', 1.5, 3), time: 'not a time' }, clean[1], clean[2], clean[3]];
    const members = (result: ReturnType<typeof reasenbergDeclustering>) =>
      Array.from(result.clusters.values()).map(c => c.map(e => String(e.id)).sort());
    const expected = members(reasenbergDeclustering(clean));
    const got = reasenbergDeclustering(withBad);
    expect(members(got)).toEqual(expected);
    expect(got.mainshocks.map(e => e.id)).toContain('bad');
  });
});

describe('3: float-noisy 0.1-grid magnitudes are read as reported to 0.1', () => {
  /** A b = 1 law on the 0.1 grid above M1.0 with exact decimal magnitudes. */
  const exact = (() => {
    const out: number[] = [];
    for (let k = 0; k <= 40; k++) {
      const m = Number((1.0 + k * 0.1).toFixed(1));
      out.push(...repeat(m, Math.round(4000 * Math.pow(10, -(m - 1)))));
    }
    return out;
  })();
  const variants: [string, (m: number) => number][] = [
    ['float32', m => Math.fround(m)],
    ['float32 printed to 8 significant digits', m => Number(Math.fround(m).toPrecision(8))],
    ['one ulp low (2.3 - 0.1)', m => m - m * Number.EPSILON],
  ];

  it.each(variants)('%s: same b, resolution and correction as the exact decimals, in both copies', (_, noisy) => {
    const reference = calculateGutenbergRichter(eventsWithMagnitudes(exact), 2.0);
    expect(reference.magnitudeResolution).toBe(0.1);
    expect(reference.binningCorrection).toBeCloseTo(0.05, 12);
    const events = eventsWithMagnitudes(exact.map(noisy));
    const lib = calculateGutenbergRichter(events, 2.0);
    expect(lib.magnitudeResolution).toBe(0.1);
    expect(lib.binningCorrection).toBeCloseTo(0.05, 6);
    expect(lib.eventsAboveMc).toBe(reference.eventsAboveMc);
    expect(lib.bValue).toBeCloseTo(reference.bValue, 5);
    const worker = loadWorker()({ type: 'gutenberg-richter', events, minMagnitude: 2.0 });
    expect(worker.bValue).toBeCloseTo(lib.bValue, 12);
  });

  it.each(variants)('%s: the same FMD bins and MAXC Mc', (_, noisy) => {
    const reference = estimateCompletenessMagnitude(eventsWithMagnitudes(exact));
    const lib = estimateCompletenessMagnitude(eventsWithMagnitudes(exact.map(noisy)));
    expect(lib.magnitudeDistribution).toEqual(reference.magnitudeDistribution);
    expect(lib.mc).toBe(reference.mc);
    expect(loadWorker()({ type: 'completeness', events: eventsWithMagnitudes(exact.map(noisy)) }).magnitudeDistribution)
      .toEqual(reference.magnitudeDistribution);
  });
});

describe('5: magnitudes reported to 0.5, 0.25 or 0.2 take half that step as the Utsu correction', () => {
  it.each([0.5, 0.25, 0.2])('reported to %s', step => {
    // A b = 1 law on the coarse grid from M3.0: counts round(20000 * 10^-(M - 3)).
    const magnitudes: number[] = [];
    for (let k = 0; 3 + k * step <= 6.5 + 1e-9; k++) {
      const m = Number((3 + k * step).toFixed(2));
      magnitudes.push(...repeat(m, Math.round(20000 * Math.pow(10, -(m - 3)))));
    }
    const events = eventsWithMagnitudes(magnitudes);
    const lib = calculateGutenbergRichter(events, 3.0);
    // Utsu (1966): b = log10(e) / (mean - (Mc - step / 2)), by hand from the counts.
    const mean = magnitudes.reduce((s, m) => s + m, 0) / magnitudes.length;
    expect(lib.magnitudeResolution).toBe(step);
    expect(lib.binningCorrection).toBeCloseTo(step / 2, 12);
    expect(lib.bValue).toBeCloseTo(Math.LOG10E / (mean - (3.0 - step / 2)), 10);
    const worker = loadWorker()({ type: 'gutenberg-richter', events, minMagnitude: 3.0 });
    expect([worker.magnitudeResolution, worker.bValue]).toEqual([lib.magnitudeResolution, lib.bValue]);
  });

  it('does not mistake a 0.1-grid catalogue for a coarse one', () => {
    const magnitudes: number[] = [];
    for (let k = 0; k <= 35; k++) {
      const m = Number((2 + k * 0.1).toFixed(1));
      magnitudes.push(...repeat(m, Math.round(3000 * Math.pow(10, -(m - 2)))));
    }
    expect(calculateGutenbergRichter(eventsWithMagnitudes(magnitudes), 2.0).magnitudeResolution).toBe(0.1);
  });
});

describe('6: every "at or above Mc" count uses the same tolerant test', () => {
  it('counts a value one ulp below Mc (2.3 - 0.1) on the Mc tab, in the fit and in the rate series', () => {
    const counts: [number, number][] = [
      [1.8, 300], [1.9, 500], [2.0, 900], [2.1, 700], [2.3, 450], [2.4, 350], [2.5, 280], [2.6, 220], [2.7, 180], [3.0, 90], [3.5, 30],
    ];
    const magnitudes = counts.flatMap(([m, n]) => repeat(m, n));
    magnitudes.push(...repeat(2.3 - 0.1, 560)); // 2.1999999999999997: the 2.2 bin, the fullest
    const events = eventsWithMagnitudes(magnitudes);
    // MAXC: bin 2.2 (560) + 0.2 would be 2.4, but bins 2.0 (900) is fullest: Mc = 2.2.
    const mc = estimateCompletenessMagnitude(events);
    expect(mc.mc).toBeCloseTo(2.2, 10);
    // Everything from the 2.2 bin up: 560 + 450 + 350 + 280 + 220 + 180 + 90 + 30.
    const byHand = 560 + 450 + 350 + 280 + 220 + 180 + 90 + 30;
    expect(mc.eventsAboveMc).toBe(byHand);
    expect(calculateGutenbergRichter(events).eventsAboveMc).toBe(byHand);
    expect(analyzeSeismicityTimeSeries(events).rate.eventCount).toBe(byHand);
    expect(loadWorker()({ type: 'completeness', events }).eventsAboveMc).toBe(byHand);
  });
});

describe('8: a blank magnitude type is untyped, in the moment sum as in the type table', () => {
  it('assumes ML ~ Mw for whitespace-only types in both copies', () => {
    const events = eventsWithMagnitudes([3, 3, 3, 3, 3], ['ML', '', '  ', undefined, 'mb']);
    const lib = calculateSeismicMoment(events);
    expect([lib.assumedMwCount, lib.excludedCount]).toEqual([4, 1]);
    const worker = loadWorker()({ type: 'moment', events });
    expect([worker.assumedMwCount, worker.excludedCount]).toEqual([4, 1]);
    expect(analyzeSeismicityTimeSeries(events).release.assumedMwCount).toBe(4);
  });
});

describe('b: one unparseable origin time does not fail the temporal analysis', () => {
  it('counts it, leaves it out of the series, and agrees with the worker', () => {
    const events = eventsWithMagnitudes(Array.from({ length: 100 }, (_, i) => 2 + (i % 20) / 10));
    events[5] = { ...events[5], time: 'not a time' };
    const lib = analyzeTemporalPattern(events);
    expect(lib.untimedEvents).toBe(1);
    expect(lib.timeSeries.reduce((s, b) => s + b.count, 0)).toBe(99);
    expect(lib.binDays).toBe(1);
    const worker = loadWorker()({ type: 'temporal', events });
    expect(worker.error).toBeUndefined();
    expect(worker.untimedEvents).toBe(1);
    expect(worker.timeSeries).toEqual(lib.timeSeries);
    expect(worker.eventsPerDay).toBeCloseTo(lib.eventsPerDay, 12);
  });

  it('reports a catalogue with no parseable time as an error in both copies', () => {
    const events = eventsWithMagnitudes([2, 3]).map(e => ({ ...e, time: 'not a time' }));
    expect(() => analyzeTemporalPattern(events)).toThrow(/No events with a valid origin time/);
    expect(loadWorker()({ type: 'temporal', events }).error).toMatch(/No events with a valid origin time/);
  });
});
