/**
 * Completeness magnitude: b-value stability (MBS) as the default method, and maximum
 * curvature (MAXC) on bins centred on the magnitude grid.
 *
 * - MAXC took the fullest bin of an FMD binned by LOWER edge ([1.6, 1.7) labelled 1.6).
 *   Wiemer & Wyss (2000) and ZMAP round each magnitude to the nearest bin centre, so for
 *   full-precision magnitudes the old peak, and Mc, sat one bin low. For magnitudes
 *   already on the 0.1 grid the two conventions agree.
 * - MBS (Cao & Gao, 2002, in the form of Woessner & Wiemer, 2005): b(Mi) is the Aki-Utsu
 *   MLE above each cut-off Mi, db(Mi) its Shi & Bolt (1982) uncertainty, b_ave(Mi) the
 *   mean b over Mi .. Mi + 0.5, and Mc the lowest Mi with |b_ave - b| <= db, each cut-off
 *   holding at least 50 events. With none, Mc falls back to the GFT (and so to MAXC).
 *
 * Expected values come from the construction or from the definitions re-derived in this
 * file, never from running the code under test. The library and the worker the Analytics
 * page uses (driven through its own `self.onmessage`) must agree exactly.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {
  analyzeSeismicityTimeSeries,
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  type EarthquakeEvent,
  type McMethod,
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

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26; |error| < 1.5e-7). */
function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * `n` detected full-precision magnitudes of a b = 1 law, each detected with the
 * Ogata & Katsura (1993) probability Phi((M - mu) / sigma): a GeoNet-like smooth roll-off.
 * With mu = 1.6 and sigma = 0.15 detection is 95% at M1.85, 98% at M1.9 and 99% at M1.95.
 */
function taperedSample(seed: number, n: number, mu = 1.6, sigma = 0.15): number[] {
  const rng = mulberry32(seed);
  const mags: number[] = [];
  while (mags.length < n) {
    const m = 0.5 - Math.log(1 - rng()) / Math.LN10;
    if (rng() < normalCdf((m - mu) / sigma)) mags.push(m);
  }
  return mags;
}

function eventsWithMagnitudes(magnitudes: number[]): EarthquakeEvent[] {
  const base = Date.UTC(2020, 0, 1);
  return magnitudes.map((magnitude, i) => ({
    id: i + 1, time: new Date(base + i * 3600_000).toISOString(),
    latitude: -41, longitude: 174, depth: 10, magnitude,
  }));
}

/** Fullest 0.1 bin, the lowest on a tie, with bins keyed by `key` (index of 0.1 steps). */
function fullestBin(magnitudes: number[], key: (m: number) => number): number {
  const counts = new Map<number, number>();
  for (const m of magnitudes) counts.set(key(m), (counts.get(key(m)) ?? 0) + 1);
  const [peak] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return Number((peak / 10).toFixed(1));
}
const centreKey = (m: number) => Math.round(m * 10);
const lowerEdgeKey = (m: number) => Math.floor(m * 10);

/**
 * MBS re-derived from its definition for FULL-PRECISION magnitudes (no reporting-grid
 * correction, so the Aki-Utsu lower bound is the cut-off itself), on 0.1 cut-offs from the
 * lowest bin edge up, each needing 50 events in 3 populated 0.1 bins at or above it.
 */
function mbsByHand(magnitudes: number[]) {
  const first = Math.floor(Math.min(...magnitudes) * 10);
  const points: { magnitude: number; b: number; deltaB: number; n: number }[] = [];
  for (let k = first; ; k++) {
    const cutoff = Number((k / 10).toFixed(1));
    const above = magnitudes.filter(m => m >= cutoff);
    const n = above.length;
    if (n < 50 || new Set(above.map(lowerEdgeKey)).size < 3) break;
    const mean = above.reduce((s, m) => s + m, 0) / n;
    const b = Math.LOG10E / (mean - cutoff);
    const squares = above.reduce((s, m) => s + (m - mean) ** 2, 0);
    points.push({ magnitude: cutoff, b, deltaB: 2.3 * b * b * Math.sqrt(squares / (n * (n - 1))), n });
  }
  const curve = points.map((p, i) => ({
    ...p,
    bAve: i + 5 < points.length ? points.slice(i, i + 6).reduce((s, q) => s + q.b, 0) / 6 : null,
  }));
  const stable = curve.find(p => p.bAve != null && Math.abs(p.bAve - p.b) <= p.deltaB);
  return { mc: stable ? stable.magnitude : null, curve };
}

describe('MAXC takes the fullest bin centred on the grid', () => {
  // Seed 10 of the tapered sample: centred bins peak at M1.7, lower-edge bins at M1.6,
  // as on the synthetic GeoNet-like catalogue.
  const magnitudes = taperedSample(10, 5000);
  const events = eventsWithMagnitudes(magnitudes);

  it('puts the peak, and Mc, on the centred bin for full-precision magnitudes', () => {
    const centrePeak = fullestBin(magnitudes, centreKey);
    const lowerEdgePeak = fullestBin(magnitudes, lowerEdgeKey);
    expect([centrePeak, lowerEdgePeak]).toEqual([1.7, 1.6]); // the two conventions differ here
    const lib = estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'MAXC' });
    expect(lib.mc).toBe(Number((centrePeak + 0.2).toFixed(1)));
    expect(lib.method).toBe('MAXC');
    const worker = loadWorker()({ type: 'completeness', events, mcMethod: 'MAXC' });
    expect(worker.mc).toBe(lib.mc);
    expect(calculateGutenbergRichter(events, undefined, 0.1, { method: 'MAXC' }).completeness).toBe(lib.mc);
  });

  it('displays the same centred bins, so the tallest bar is the MAXC peak', () => {
    const lib = estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'MAXC' });
    const tallest = lib.magnitudeDistribution.reduce((best, bin) => (bin.count > best.count ? bin : best));
    expect(tallest.magnitude).toBe(1.7);
    expect(Number((lib.mc - lib.maxcCorrection).toFixed(1))).toBe(tallest.magnitude);
    // Bin M holds [M - 0.05, M + 0.05): counted by hand.
    for (const bin of lib.magnitudeDistribution) {
      expect(bin.count).toBe(magnitudes.filter(m => centreKey(m) === Math.round(bin.magnitude * 10)).length);
    }
    expect(lib.magnitudeDistribution.reduce((s, bin) => s + bin.count, 0)).toBe(magnitudes.length);
  });

  it('is unchanged for magnitudes already on the 0.1 grid', () => {
    const onGrid = magnitudes.map(m => Number(m.toFixed(1)));
    const lib = estimateCompletenessMagnitude(eventsWithMagnitudes(onGrid), 0.1, 0.2, { method: 'MAXC' });
    // On the grid, the bin labelled M holds exactly the values M under either convention.
    const peak = fullestBin(onGrid, m => Math.round(m * 10));
    expect(lib.mc).toBe(Number((peak + 0.2).toFixed(1)));
    const byValue = new Map<number, number>();
    for (const m of onGrid) byValue.set(m, (byValue.get(m) ?? 0) + 1);
    expect(lib.magnitudeDistribution.filter(bin => bin.count > 0))
      .toEqual(Array.from(byValue.entries()).sort((a, b) => a[0] - b[0]).map(([magnitude, count]) => ({ magnitude, count })));
  });
});

describe('b-value stability (MBS)', () => {
  it('is the default method in the library, the worker and the rate series', () => {
    const events = eventsWithMagnitudes(taperedSample(2, 3000));
    expect(estimateCompletenessMagnitude(events).requestedMethod).toBe('MBS');
    expect(calculateGutenbergRichter(events).requestedMcMethod).toBe('MBS');
    expect(analyzeSeismicityTimeSeries(events).rate.requestedMcMethod).toBe('MBS');
    const run = loadWorker();
    expect(run({ type: 'completeness', events }).requestedMethod).toBe('MBS');
    expect(run({ type: 'gutenberg-richter', events }).requestedMcMethod).toBe('MBS');
    expect(run({ type: 'time-series', events }).rate.requestedMcMethod).toBe('MBS');
  });

  it('finds the plateau of a tapered sample, as its definition does by hand', () => {
    // Values within 1e-5 of a multiple of 0.001 are dropped, so that none reads as lying
    // on a reporting grid (tolerance 2^-20) and the Aki-Utsu lower bound is the cut-off.
    const magnitudes = taperedSample(5, 5000).filter(m => Math.abs(m * 1000 - Math.round(m * 1000)) > 0.01);
    const lib = estimateCompletenessMagnitude(eventsWithMagnitudes(magnitudes));
    const byHand = mbsByHand(magnitudes);
    expect(lib.method).toBe('MBS');
    expect(lib.mc).toBe(byHand.mc);
    // Detection reaches 98% at M1.9: Mc within 0.2 of it. (Over seeds 1-40 of this
    // construction MBS gives 1.7-1.9 for 37 and 2.2-2.3 for 3; this seed gives 1.8.)
    expect(lib.mc).toBeGreaterThanOrEqual(1.7);
    expect(lib.mc).toBeLessThanOrEqual(2.1);
    // The curve, point by point.
    expect(lib.mbsCurve.map(p => p.magnitude)).toEqual(byHand.curve.map(p => p.magnitude));
    lib.mbsCurve.forEach((p, i) => {
      const q = byHand.curve[i];
      expect(p.n).toBe(q.n);
      expect(p.b).toBeCloseTo(q.b, 9);
      expect(p.deltaB).toBeCloseTo(q.deltaB, 9);
      if (q.bAve == null) expect(p.bAve).toBeNull();
      else expect(p.bAve).toBeCloseTo(q.bAve, 9);
    });
    // The fit above it, which the G-R tab reports.
    const gr = calculateGutenbergRichter(eventsWithMagnitudes(magnitudes));
    expect(gr.completeness).toBe(lib.mc);
    expect(gr.mcSource).toBe('MBS');
    expect(Math.abs(gr.bValue - 1)).toBeLessThan(3 * gr.bUncertainty);
  });

  it('uses the half-bin (Utsu) b of the b-value fit for magnitudes on the 0.1 grid', () => {
    const onGrid = taperedSample(4, 4000).map(m => Number(m.toFixed(1)));
    const lib = estimateCompletenessMagnitude(eventsWithMagnitudes(onGrid));
    for (const point of lib.mbsCurve) {
      const above = onGrid.filter(m => m >= point.magnitude - 1e-9);
      const mean = above.reduce((s, m) => s + m, 0) / above.length;
      expect(point.b).toBeCloseTo(Math.LOG10E / (mean - (point.magnitude - 0.05)), 9);
      // The b the G-R fit reports with this cut-off.
      expect(point.b).toBeCloseTo(calculateGutenbergRichter(eventsWithMagnitudes(onGrid), point.magnitude).bValue, 9);
    }
  });

  it('reports the curve for every method, with b_ave only where the 0.5 window is whole', () => {
    const events = eventsWithMagnitudes(taperedSample(5, 3000));
    const mbs = estimateCompletenessMagnitude(events).mbsCurve;
    for (const method of ['GFT', 'MAXC'] as McMethod[]) {
      expect(estimateCompletenessMagnitude(events, 0.1, 0.2, { method }).mbsCurve).toEqual(mbs);
    }
    // Every point holds 50 events; the last five have no whole window above them.
    expect(mbs.every(p => p.n >= 50)).toBe(true);
    expect(mbs.slice(-5).every(p => p.bAve == null)).toBe(true);
    expect(mbs.slice(0, -5).every(p => p.bAve != null)).toBe(true);
  });

  it('falls back to the GFT, and says so, when too few events leave no 0.5 window', () => {
    // 150 events of a b = 1 law on the 0.1 grid from M2.0: N(>= 2.5) is 150 * 10^-0.5 = 47
    // (rounded per bin, 46), under 50, so no cut-off has a whole window.
    const magnitudes: number[] = [];
    for (let k = 0; k <= 20; k++) {
      const m = Number((2 + k * 0.1).toFixed(1));
      magnitudes.push(...new Array(Math.round(150 * (1 - Math.pow(10, -0.1)) * Math.pow(10, -(m - 2)))).fill(m));
    }
    expect(magnitudes.filter(m => m >= 2.5 - 1e-9).length).toBeLessThan(50);
    const events = eventsWithMagnitudes(magnitudes);
    const lib = estimateCompletenessMagnitude(events);
    expect(lib.requestedMethod).toBe('MBS');
    expect(lib.method).toBe('GFT');
    expect(lib.fallbackReason).toBe(
      'Too few events for b-value stability (it needs 50 at or above Mc + 0.5), so Mc is from the goodness-of-fit test'
    );
    expect(lib.mc).toBe(estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'GFT' }).mc);
    expect(lib.mbsCurve.every(p => p.bAve == null)).toBe(true);
    const gr = calculateGutenbergRichter(events);
    expect([gr.mcSource, gr.requestedMcMethod, gr.fallbackReason]).toEqual(['GFT', 'MBS', lib.fallbackReason]);
    const worker = loadWorker()({ type: 'completeness', events });
    expect([worker.mc, worker.method, worker.fallbackReason]).toEqual([lib.mc, 'GFT', lib.fallbackReason]);
  });

  it('falls back through the GFT to MAXC when no b is stable and no fit reaches 90%', () => {
    // A flat FMD, 60 events in each 0.1 bin from M1.0 to M3.0: b grows with every cut-off,
    // so none is stable, and no exponential law fits it. MAXC takes the first of the tied
    // bins, M1.0, so Mc is 1.0 + 0.3.
    const flat: number[] = [];
    for (let k = 0; k <= 20; k++) flat.push(...new Array(60).fill(Number((1 + k * 0.1).toFixed(1))));
    const events = eventsWithMagnitudes(flat);
    const lib = estimateCompletenessMagnitude(events, 0.1, 0.3);
    expect([lib.mc, lib.method, lib.requestedMethod, lib.gftLevel]).toEqual([1.3, 'MAXC', 'MBS', null]);
    expect(lib.fallbackReason).toBe(
      'No cut-off had a stable b-value and no cut-off reached a 90% goodness of fit, so Mc is maximum curvature + 0.3'
    );
    expect(lib.mbsCurve.some(p => p.bAve != null)).toBe(true);
    const worker = loadWorker()({ type: 'completeness', events, maxcCorrection: 0.3 });
    expect([worker.mc, worker.method, worker.fallbackReason]).toEqual([1.3, 'MAXC', lib.fallbackReason]);
  });

  it('rejects an unknown method in both copies, naming the three', () => {
    const events = eventsWithMagnitudes(taperedSample(6, 200));
    expect(() => estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'EMR' as any }))
      .toThrow('Unknown Mc method "EMR" (expected MBS, GFT or MAXC)');
    expect(loadWorker()({ type: 'completeness', events, mcMethod: 'EMR' }).error)
      .toBe('Unknown Mc method "EMR" (expected MBS, GFT or MAXC)');
  });
});

describe('library and worker agree exactly for every method', () => {
  const samples: Array<[string, number[]]> = [
    ['full precision', taperedSample(7, 4000)],
    ['0.1 grid', taperedSample(8, 4000).map(m => Number(m.toFixed(1)))],
  ];
  const methods: Array<McMethod | undefined> = [undefined, 'MBS', 'GFT', 'MAXC'];

  it.each(samples)('on %s magnitudes', (_label, magnitudes) => {
    const events = eventsWithMagnitudes(magnitudes);
    for (const method of methods) {
      const run = loadWorker();
      const plain = (x: unknown) => JSON.parse(JSON.stringify(x));
      expect(run({ type: 'completeness', events, mcMethod: method }))
        .toEqual(plain(estimateCompletenessMagnitude(events, 0.1, 0.2, { method })));
      expect(run({ type: 'gutenberg-richter', events, mcMethod: method }))
        .toEqual(plain(calculateGutenbergRichter(events, undefined, 0.1, { method })));
      expect(run({ type: 'time-series', events, mcMethod: method }))
        .toEqual(plain(analyzeSeismicityTimeSeries(events, { mcMethod: method })));
    }
  });

  it('at a 0.05 bin width, whose 0.5 window spans eleven cut-offs', () => {
    const events = eventsWithMagnitudes(taperedSample(9, 4000));
    const lib = estimateCompletenessMagnitude(events, 0.05);
    const worker = loadWorker()({ type: 'completeness', events, binWidth: 0.05 });
    expect(worker).toEqual(JSON.parse(JSON.stringify(lib)));
    const withWindow = lib.mbsCurve.filter(p => p.bAve != null);
    expect(withWindow.length).toBe(lib.mbsCurve.length - 10);
    // b_ave is the mean over the eleven cut-offs Mi .. Mi + 0.5.
    const first = lib.mbsCurve.slice(0, 11).reduce((s, p) => s + p.b, 0) / 11;
    expect(lib.mbsCurve[0].bAve).toBeCloseTo(first, 12);
  });
});
