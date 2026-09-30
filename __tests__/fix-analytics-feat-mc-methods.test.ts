/**
 * A2 items 1 and 2: the MAXC correction is adjustable (paper, sec:mc: "+0.2 correction
 * by default, which users can adjust") and the goodness-of-fit test (GFT; Wiemer & Wyss,
 * 2000) is available as an Mc method beside MAXC (docs, visualization.rst "Completeness
 * Magnitude"). b-value stability (MBS) is the default method, so the MAXC tests choose
 * MAXC explicitly (MBS itself: __tests__/fix-science-mc-stability.test.ts). Both run
 * through the library AND the worker the Analytics page uses, which must agree exactly;
 * the worker is driven through its own `self.onmessage`.
 *
 * Expected values come from the construction of each catalogue, or from an independent
 * re-derivation of the GFT statistic written out in this file; never from running the
 * code under test.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  DEFAULT_MAXC_CORRECTION,
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

function eventsWithMagnitudes(magnitudes: number[]): EarthquakeEvent[] {
  const base = Date.UTC(2020, 0, 1);
  return magnitudes.map((magnitude, i) => ({
    id: i + 1, time: new Date(base + i * 3600_000).toISOString(),
    latitude: -41, longitude: 174, depth: 10, magnitude,
  }));
}

const repeat = (magnitude: number, count: number) => new Array<number>(count).fill(magnitude);

/**
 * Complete from M2.0 by construction: N(M) = round(2000 * 10^-(M - 2)) on the 0.1 grid
 * up to M5.0 (a b = 1 law), below it an under-detected tail (300 at M1.8 and 700 at
 * M1.9 where the law predicts ~3170 and ~2520). The fullest bin is M2.0.
 */
function completeFromTwo(): EarthquakeEvent[] {
  const magnitudes = [...repeat(1.8, 300), ...repeat(1.9, 700)];
  for (let k = 0; k <= 30; k++) {
    const m = Number((2.0 + k * 0.1).toFixed(1));
    magnitudes.push(...repeat(m, Math.round(2000 * Math.pow(10, -(m - 2)))));
  }
  return eventsWithMagnitudes(magnitudes);
}

/**
 * The GFT statistic re-derived from Wiemer & Wyss (2000) for magnitudes on the 0.1 grid:
 * MLE b above the cut-off with the Utsu half-step correction, predicted cumulative counts
 * S_j = N 10^(-b (M_j - Mc)) at each bin edge M_j >= Mc, and
 * R = 100 - 100 sum|B_j - S_j| / sum B_j over the observed cumulative counts B_j.
 */
function gftFitByHand(magnitudes: number[], mc: number): number {
  const above = magnitudes.filter(m => m >= mc - 1e-9);
  const mean = above.reduce((s, m) => s + m, 0) / above.length;
  const b = Math.LOG10E / (mean - (mc - 0.05));
  const top = Math.max(...above);
  let misfit = 0;
  let observed = 0;
  for (let edge = mc; edge <= top + 1e-9; edge = Number((edge + 0.1).toFixed(1))) {
    const B = above.filter(m => m >= edge - 1e-9).length;
    const S = above.length * Math.pow(10, -b * (edge - mc));
    misfit += Math.abs(B - S);
    observed += B;
  }
  return 100 - (100 * misfit) / observed;
}

describe('item 1: the MAXC correction is adjustable and reported', () => {
  const events = completeFromTwo();

  it('defaults to +0.2 and reports the value used, in the library and the worker', () => {
    const lib = estimateCompletenessMagnitude(events, undefined, undefined, { method: 'MAXC' });
    // Modal bin M2.0 (2000 events) + 0.2.
    expect(lib.mc).toBeCloseTo(2.2, 10);
    expect(lib.maxcCorrection).toBe(0.2);
    expect(DEFAULT_MAXC_CORRECTION).toBe(0.2);
    expect(lib.method).toBe('MAXC');
    const worker = loadWorker()({ type: 'completeness', events, mcMethod: 'MAXC' });
    expect(worker.mc).toBe(lib.mc);
    expect(worker.maxcCorrection).toBe(0.2);
  });

  it.each([0, 0.1, 0.3, 0.5])('applies a correction of +%s to the modal bin in both copies', correction => {
    const expected = Number((2.0 + correction).toFixed(2));
    const lib = estimateCompletenessMagnitude(events, 0.1, correction, { method: 'MAXC' });
    expect(lib.mc).toBe(expected);
    expect(lib.maxcCorrection).toBe(correction);
    const worker = loadWorker()({ type: 'completeness', events, mcMethod: 'MAXC', maxcCorrection: correction });
    expect(worker.mc).toBe(expected);
    expect(worker.maxcCorrection).toBe(correction);
  });

  it('feeds the G-R fit, which reports the correction and the method behind its Mc', () => {
    const lib = calculateGutenbergRichter(events, undefined, 0.1, { method: 'MAXC', maxcCorrection: 0.3 });
    expect(lib.completeness).toBe(2.3);
    expect(lib.mcSource).toBe('MAXC');
    expect(lib.maxcCorrection).toBe(0.3);
    const worker = loadWorker()({ type: 'gutenberg-richter', events, mcMethod: 'MAXC', maxcCorrection: 0.3 });
    expect(worker.completeness).toBe(2.3);
    expect(worker.mcSource).toBe('MAXC');
    expect(worker.maxcCorrection).toBe(0.3);
    expect(worker.bValue).toBeCloseTo(lib.bValue, 12);
    expect(worker.eventsAboveMc).toBe(lib.eventsAboveMc);
  });

  it('marks an explicit cut-off as such and ignores the Mc settings for it', () => {
    const lib = calculateGutenbergRichter(events, 2.5, 0.1, { method: 'GFT', maxcCorrection: 0.4 });
    expect(lib.completeness).toBe(2.5);
    expect(lib.mcSource).toBe('cutoff');
    expect(lib.maxcCorrection).toBeUndefined();
    const worker = loadWorker()({ type: 'gutenberg-richter', events, minMagnitude: 2.5, mcMethod: 'GFT', maxcCorrection: 0.4 });
    expect(worker.mcSource).toBe('cutoff');
    expect(worker.bValue).toBeCloseTo(lib.bValue, 12);
  });

  it.each([-0.1, 0.6, Number.NaN])('rejects a correction of %s outside 0-0.5 in both copies', correction => {
    expect(() => estimateCompletenessMagnitude(events, 0.1, correction)).toThrow(/Invalid MAXC correction/);
    expect(() => calculateGutenbergRichter(events, undefined, 0.1, { maxcCorrection: correction })).toThrow(/Invalid MAXC correction/);
    expect(loadWorker()({ type: 'completeness', events, maxcCorrection: correction }).error).toMatch(/Invalid MAXC correction/);
    expect(loadWorker()({ type: 'gutenberg-richter', events, maxcCorrection: correction }).error).toMatch(/Invalid MAXC correction/);
  });
});

describe('item 2: the goodness-of-fit test (Wiemer & Wyss, 2000)', () => {
  it('finds the magnitude the catalogue is complete from, where MAXC + 0.2 overshoots', () => {
    const events = completeFromTwo();
    const lib = estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'GFT' });
    expect(lib.mc).toBe(2.0);
    expect(lib.method).toBe('GFT');
    expect(lib.requestedMethod).toBe('GFT');
    expect(lib.gftLevel).toBe(95);
    expect(lib.fallbackReason).toBeUndefined();
    // R at the chosen Mc, recomputed by hand from the definition.
    const magnitudes = events.map(e => e.magnitude);
    expect(lib.gftFit).toBeCloseTo(gftFitByHand(magnitudes, 2.0), 6);
    expect(lib.gftFit!).toBeGreaterThanOrEqual(95);
    // The incomplete candidates below it fall short of 95%: that is why 2.0 is chosen.
    const byCutoff = new Map(lib.gftCurve!.map(p => [p.magnitude, p.fit]));
    expect(byCutoff.get(1.8)).toBeCloseTo(gftFitByHand(magnitudes, 1.8), 6);
    expect(byCutoff.get(1.9)).toBeCloseTo(gftFitByHand(magnitudes, 1.9), 6);
    expect(byCutoff.get(1.8)!).toBeLessThan(95);
    expect(byCutoff.get(1.9)!).toBeLessThan(95);
  });

  it('is identical in the worker, curve included', () => {
    const events = completeFromTwo();
    const lib = estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'GFT' });
    const worker = loadWorker()({ type: 'completeness', events, mcMethod: 'GFT' });
    expect(worker.mc).toBe(lib.mc);
    expect(worker.method).toBe('GFT');
    expect(worker.gftLevel).toBe(lib.gftLevel);
    expect(worker.gftFit).toBeCloseTo(lib.gftFit!, 12);
    expect(worker.gftCurve.map((p: any) => p.magnitude)).toEqual(lib.gftCurve!.map(p => p.magnitude));
    worker.gftCurve.forEach((p: any, i: number) => expect(p.fit).toBeCloseTo(lib.gftCurve![i].fit, 12));
  });

  it('drives the G-R fit above the GFT Mc in both copies', () => {
    const events = completeFromTwo();
    const lib = calculateGutenbergRichter(events, undefined, 0.1, { method: 'GFT' });
    expect(lib.completeness).toBe(2.0);
    expect(lib.mcSource).toBe('GFT');
    expect(lib.gftLevel).toBe(95);
    // Every event from M2.0 up: the b = 1 law's counts, so b is close to 1.
    expect(lib.eventsAboveMc).toBe(events.filter(e => e.magnitude >= 2.0).length);
    expect(lib.bValue).toBeCloseTo(1.0, 1);
    const worker = loadWorker()({ type: 'gutenberg-richter', events, mcMethod: 'GFT' });
    expect(worker.completeness).toBe(2.0);
    expect(worker.mcSource).toBe('GFT');
    expect(worker.bValue).toBeCloseTo(lib.bValue, 12);
  });

  it('settles for the lowest cut-off reaching 90% when none reaches 95%', () => {
    // A b = 1 law from M2.0 whose bins alternate 50% above and below it: the cumulative
    // counts wander about the law, so no cut-off reaches 95% but 2.0 already reaches 90%.
    const magnitudes: number[] = [];
    for (let k = 0; k <= 25; k++) {
      const m = Number((2 + k * 0.1).toFixed(1));
      magnitudes.push(...repeat(m, Math.round(1000 * Math.pow(10, -(m - 2)) * (k % 2 === 0 ? 1.5 : 0.5))));
    }
    const lib = estimateCompletenessMagnitude(eventsWithMagnitudes(magnitudes), 0.1, 0.2, { method: 'GFT' });
    expect(lib.gftCurve!.every(p => p.fit < 95)).toBe(true);
    expect(lib.mc).toBe(2.0);
    expect(lib.gftLevel).toBe(90);
    expect(lib.gftFit).toBeCloseTo(gftFitByHand(magnitudes, 2.0), 6);
    const worker = loadWorker()({ type: 'completeness', events: eventsWithMagnitudes(magnitudes), mcMethod: 'GFT' });
    expect([worker.mc, worker.gftLevel]).toEqual([2.0, 90]);
  });

  it('falls back to MAXC, and says so, when no cut-off reaches 90%', () => {
    // A flat FMD, 60 events in each 0.1 bin from M1.0 to M3.0: no exponential law fits
    // it. MAXC takes the first of the tied bins, M1.0, so the fallback is 1.0 + 0.3.
    const flat: number[] = [];
    for (let k = 0; k <= 20; k++) flat.push(...repeat(Number((1 + k * 0.1).toFixed(1)), 60));
    const events = eventsWithMagnitudes(flat);
    const lib = estimateCompletenessMagnitude(events, 0.1, 0.3, { method: 'GFT' });
    expect(lib.gftCurve!.length).toBeGreaterThan(0);
    expect(lib.gftCurve!.every(p => p.fit < 90)).toBe(true);
    expect(lib.mc).toBe(1.3);
    expect(lib.method).toBe('MAXC');
    expect(lib.requestedMethod).toBe('GFT');
    expect(lib.gftLevel).toBeNull();
    expect(lib.fallbackReason).toMatch(/No cut-off reached a 90% goodness of fit.*maximum curvature \+ 0\.3/);
    const gr = calculateGutenbergRichter(events, undefined, 0.1, { method: 'GFT', maxcCorrection: 0.3 });
    expect(gr.completeness).toBe(1.3);
    expect(gr.mcSource).toBe('MAXC');
    expect(gr.requestedMcMethod).toBe('GFT');
    expect(gr.fallbackReason).toBe(lib.fallbackReason);
    const worker = loadWorker()({ type: 'completeness', events, mcMethod: 'GFT', maxcCorrection: 0.3 });
    expect([worker.mc, worker.method, worker.gftLevel, worker.fallbackReason]).toEqual([1.3, 'MAXC', null, lib.fallbackReason]);
  });

  it('holds candidates to the fitting floors: two populated bins give no candidate at all', () => {
    const events = eventsWithMagnitudes([...repeat(1.0, 35), ...repeat(4.0, 15)]);
    const lib = estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'GFT' });
    expect(lib.gftCurve).toEqual([]);
    expect([lib.mc, lib.method, lib.gftLevel]).toEqual([1.2, 'MAXC', null]);
  });

  it('respects the 50-event floor for an estimated Mc in both copies', () => {
    const events = eventsWithMagnitudes(completeFromTwo().slice(0, 49).map(e => e.magnitude));
    expect(() => estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'GFT' })).toThrow(/at least 50 events/);
    expect(() => calculateGutenbergRichter(events, undefined, 0.1, { method: 'GFT' })).toThrow(/at least 50 events/);
    const run = loadWorker();
    expect(run({ type: 'completeness', events, mcMethod: 'GFT' }).error).toMatch(/at least 50 events/);
    expect(run({ type: 'gutenberg-richter', events, mcMethod: 'GFT' }).error).toMatch(/at least 50 events/);
  });

  it('rejects an unknown method in both copies', () => {
    const events = completeFromTwo();
    expect(() => estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'EMR' as any })).toThrow(/Unknown Mc method/);
    expect(loadWorker()({ type: 'completeness', events, mcMethod: 'EMR' }).error).toMatch(/Unknown Mc method/);
  });

  it('keys the worker cache on the Mc settings', () => {
    const run = loadWorker();
    const events = completeFromTwo();
    expect(run({ type: 'completeness', events, mcMethod: 'MAXC' }).mc).toBeCloseTo(2.2, 10);
    // Same events, different settings: must not be answered from the first result.
    expect(run({ type: 'completeness', events, mcMethod: 'MAXC', maxcCorrection: 0.1 }).mc).toBeCloseTo(2.1, 10);
    expect(run({ type: 'completeness', events, mcMethod: 'GFT' }).method).toBe('GFT');
    expect(run({ type: 'completeness', events }).method).toBe('MBS');
  });
});
