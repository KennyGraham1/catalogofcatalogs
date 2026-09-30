/**
 * Findings #1 / #125 / #131: the Aki-Utsu b-value subtracted half the HISTOGRAM bin
 * width (0.05) from Mc whatever precision the magnitudes were reported at. The Utsu
 * (1966) / Bender (1983) term corrects for magnitudes ROUNDED to a grid of width dM,
 * where a reported Mc stands for the continuous interval [Mc - dM/2, Mc + dM/2). For
 * continuous magnitudes (GeoNet publishes SeisComP magnitudes at full precision) the
 * sample cut at M >= Mc starts at Mc itself, so the extra 0.05 biased b low by
 * 1/(1 + 0.05 b ln10), i.e. to 0.897 for a true b of 1.
 *
 * Every sample below is a seeded Gutenberg-Richter draw with a planted b = 1. The
 * acceptance band is 3 sigma of the counting error, sigma = b / sqrt(N) (Aki, 1965),
 * derived from the construction, never from running either implementation. The
 * library and the real worker (driven through its own `self.onmessage`, as in
 * __tests__/seismicity-worker-parity.test.ts) must both recover it, and agree exactly.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { calculateGutenbergRichter, type EarthquakeEvent } from '@/lib/seismological-analysis';

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

// Deterministic PRNG (mulberry32), as in __tests__/paper/worked-example.test.ts.
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

const B_TRUE = 1.0;
const BETA = B_TRUE * Math.LN10;
const MC = 2.0;
const N = 40000;
/** 3 sigma of the Aki counting error at N events and b = 1. */
const THREE_SIGMA = (3 * B_TRUE) / Math.sqrt(N);

/**
 * N magnitudes of a complete GR law whose continuous lower edge is `lower`, reported
 * at `step` (0 = full precision). Drawing a gridded set from Mc - step/2 fills the
 * lowest reported bin completely, which is the case the Utsu correction describes.
 */
function grMagnitudes(seed: number, lower: number, step: number, n = N): number[] {
  const rng = mulberry32(seed);
  const mags: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = lower + -Math.log(1 - rng()) / BETA;
    mags.push(step > 0 ? Math.round(m / step) * step : m);
  }
  return mags;
}

function asEvents(mags: number[]): EarthquakeEvent[] {
  return mags.map((magnitude, i) => ({
    id: `m${i}`,
    time: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
    latitude: -41,
    longitude: 174,
    depth: 10,
    magnitude,
  }));
}

/** Runs the same fit through the library and the worker and checks they agree exactly. */
function fitBoth(events: EarthquakeEvent[], minMagnitude?: number, mcMethod?: 'MAXC' | 'GFT' | 'MBS') {
  const lib = calculateGutenbergRichter(events, minMagnitude, 0.1, { method: mcMethod });
  const worker = loadWorker()({ type: 'gutenberg-richter', events, minMagnitude, mcMethod });
  expect(worker.error).toBeUndefined();
  expect(worker.bValue).toBeCloseTo(lib.bValue, 12);
  expect(worker.completeness).toBe(lib.completeness);
  expect(worker.binningCorrection).toBeCloseTo(lib.binningCorrection, 12);
  expect(worker.magnitudeResolution).toBe(lib.magnitudeResolution);
  return lib;
}

describe('b-value binning correction follows the reporting resolution of the magnitudes', () => {
  it('recovers b = 1 from continuous (full-precision) magnitudes with no correction', () => {
    const result = fitBoth(asEvents(grMagnitudes(11, MC, 0)), MC);
    // The old code returned ~0.897 here: 20+ sigma low.
    expect(Math.abs(result.bValue - B_TRUE)).toBeLessThan(THREE_SIGMA);
    expect(result.magnitudeResolution).toBe(0);
    // A full-precision value sits on a multiple of 0.001 only by chance.
    expect(result.binningCorrection).toBeLessThan(1e-6);
  });

  it('recovers b = 1 from 0.01-resolution magnitudes with a 0.005 correction', () => {
    const result = fitBoth(asEvents(grMagnitudes(12, MC - 0.005, 0.01)), MC);
    expect(Math.abs(result.bValue - B_TRUE)).toBeLessThan(THREE_SIGMA);
    expect(result.magnitudeResolution).toBe(0.01);
    // Chance multiples of 0.1 among 0.01-resolution values are unmixed, not taken
    // as 0.1-rounded; what remains is well inside a thousandth of a unit.
    expect(Math.abs(result.binningCorrection - 0.005)).toBeLessThan(0.001);
  });

  it('keeps the Utsu dM/2 = 0.05 correction for magnitudes rounded to 0.1', () => {
    // Analytic expectation (see __tests__/paper-figure-claims.test.ts): with a full
    // lowest bin the Utsu approximation returns 0.99561 for a planted b of 1.
    const result = fitBoth(asEvents(grMagnitudes(13, MC - 0.05, 0.1)), MC);
    expect(Math.abs(result.bValue - 0.99561)).toBeLessThan(THREE_SIGMA);
    expect(result.magnitudeResolution).toBe(0.1);
    expect(result.binningCorrection).toBeCloseTo(0.05, 12);
  });

  it('recovers b on the automatic Mc paths for continuous magnitudes', () => {
    // A detection roll-off below M2.0 under a law complete from M2.0; the complete part
    // above it is continuous. The UI never passes a cut-off, so this is the Analytics path.
    const rng = mulberry32(14);
    const tail: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const m = 1.0 + rng();
      // Detection probability rises from 0 at M1.0 to 1 at M2.0.
      if (rng() < m - 1.0) tail.push(m);
    }
    const events = asEvents([...grMagnitudes(15, MC, 0), ...tail]);
    const recovered = (result: ReturnType<typeof fitBoth>) => {
      const nAboveMc = Math.round(N * Math.pow(10, -B_TRUE * (result.completeness - MC)));
      expect(Math.abs(result.bValue - B_TRUE)).toBeLessThan((3 * B_TRUE) / Math.sqrt(nAboveMc));
      expect(result.binningCorrection).toBeLessThan(1e-6);
    };
    // MAXC on bins centred on the 0.1 grid: [2.05, 2.15) holds 40000 (10^-0.05 - 10^-0.15)
    // = 7,332 events, more than [1.95, 2.05) (4,350 at M2.0 and above plus ~975 of the
    // roll-off) or [2.15, 2.25) (5,824), so the peak is 2.1 and Mc = 2.1 + 0.2. (Binned
    // by lower edge the peak was [2.0, 2.1), labelled 2.0, and Mc 2.2.)
    const maxc = fitBoth(events, undefined, 'MAXC');
    expect(maxc.completeness).toBeCloseTo(2.3, 10);
    recovered(maxc);
    // b-value stability, the default, keeps a cut-off at or above the true Mc and at most
    // 0.3 above it (with 40,000 events db is ~0.005, so the stable plateau is narrow).
    const mbs = fitBoth(events);
    expect(mbs.mcSource).toBe('MBS');
    expect(mbs.completeness).toBeGreaterThanOrEqual(MC);
    expect(mbs.completeness).toBeLessThanOrEqual(MC + 0.3 + 1e-9);
    recovered(mbs);
  });

  it('weights the correction by share when a catalogue mixes resolutions', () => {
    // A merged catalogue: half the events from a full-precision source, half from a
    // source reporting to 0.1. The first-order MLE correction is the share-weighted
    // half-step, 0.5 * 0.05 = 0.025. Either extreme (0 or 0.05) misses b = 1 by
    // about 5% here, well outside 3 sigma.
    const mags = [
      ...grMagnitudes(16, MC, 0, N / 2),
      ...grMagnitudes(17, MC - 0.05, 0.1, N / 2),
    ];
    const result = fitBoth(asEvents(mags), MC);
    expect(Math.abs(result.binningCorrection - 0.025)).toBeLessThan(0.002);
    expect(Math.abs(result.bValue - B_TRUE)).toBeLessThan(THREE_SIGMA);
  });

  it('places the lower bound at the first reported value above an off-grid cut-off', () => {
    // Magnitudes on the 0.1 grid cut at 2.25: the lowest value kept is 2.3, which
    // stands for [2.25, 2.35), so the continuous lower bound is 2.25 itself. The old
    // Mc - 0.05 = 2.20 put it a half-step too low.
    const result = fitBoth(asEvents(grMagnitudes(18, MC - 0.05, 0.1)), 2.25);
    const nAbove = Math.round(N * Math.pow(10, -B_TRUE * (2.25 - (MC - 0.05))));
    expect(Math.abs(result.bValue - B_TRUE)).toBeLessThan((3 * B_TRUE) / Math.sqrt(nAbove));
    expect(result.binningCorrection).toBeCloseTo(0, 9);
  });
});
