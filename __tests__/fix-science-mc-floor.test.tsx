/**
 * Findings #3 / #137: the paper (srl_paper.tex, sec:mc) says CofC withholds an Mc
 * estimated from fewer than 50 events. estimateCompletenessMagnitude enforced that,
 * but calculateGutenbergRichter ran its own MAXC on as few as 10 events, anchored
 * the MLE on it and returned it as `completeness`, which the G-R tab shows as
 * "Mc (Completeness)". The same small-sample MAXC fed every per-cluster b-value.
 *
 * The floor now applies wherever Mc is ESTIMATED: the library, the worker the
 * Analytics page runs (driven through its own `self.onmessage`), the hook's
 * pre-gate, and the per-cluster b-values. An explicit cut-off is not an estimate,
 * so the 10-event fitting floor still governs it.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { renderHook } from '@testing-library/react';

import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  gardnerKnopoffDeclustering,
  analyzeTemporalPattern,
  type EarthquakeEvent,
} from '@/lib/seismological-analysis';
import { useSeismologicalWorker } from '@/hooks/use-seismological-worker';
import { createSeismologicalWorker } from '@/lib/seismological-worker-client';

jest.mock('@/lib/seismological-worker-client', () => ({ createSeismologicalWorker: jest.fn() }));

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

/**
 * The brief's 24-event sequence on the 0.1 grid, M1.0-3.1 with its non-cumulative
 * peak at M1.2: MAXC + 0.2 would give Mc = 1.4 with 14 events at or above it, so
 * every floor the fit used to check (10 events, 3 bins above Mc) was met.
 */
const SEQUENCE_24 = [
  1.0, 1.1, 1.1, 1.2, 1.2, 1.2, 1.2, 1.3, 1.3, 1.3,
  1.4, 1.4, 1.5, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2, 2.4, 2.6, 2.9, 3.1,
];

describe('an estimated Mc needs at least 50 events wherever it is used', () => {
  it('withholds the library fit, agreeing with estimateCompletenessMagnitude', () => {
    const events = eventsWithMagnitudes(SEQUENCE_24);
    expect(() => estimateCompletenessMagnitude(events)).toThrow(/at least 50 events/);
    // The old code returned Mc = 1.4 here.
    expect(() => calculateGutenbergRichter(events)).toThrow(/at least 50 events/);
  });

  it('withholds the worker fit the G-R tab shows', () => {
    const run = loadWorker();
    const events = eventsWithMagnitudes(SEQUENCE_24);
    expect(run({ type: 'completeness', events }).error).toMatch(/at least 50 events/);
    const gr = run({ type: 'gutenberg-richter', events });
    expect(gr.error).toMatch(/at least 50 events/);
    expect(gr.completeness).toBeUndefined();
  });

  it('still fits above an explicit cut-off, which is not an estimate', () => {
    const events = eventsWithMagnitudes(SEQUENCE_24);
    // 14 events at or above M1.4 across 12 populated bins: both fitting floors met.
    const lib = calculateGutenbergRichter(events, 1.4);
    expect(lib.completeness).toBe(1.4);
    expect(lib.eventsAboveMc).toBe(14);
    const worker = loadWorker()({ type: 'gutenberg-richter', events, minMagnitude: 1.4 });
    expect(worker.error).toBeUndefined();
    expect(worker.bValue).toBeCloseTo(lib.bValue, 12);
  });
});

describe('per-cluster b-values are withheld below the Mc floor in both copies', () => {
  /** A mainshock followed by `n - 1` aftershocks an hour apart at the same spot. */
  function sequence(n: number, idPrefix: string, startDay: number, lat: number): EarthquakeEvent[] {
    const t0 = Date.UTC(2021, 0, 1) + startDay * 86400_000;
    return Array.from({ length: n }, (_, k) => ({
      id: `${idPrefix}${k}`,
      time: new Date(t0 + k * 3600_000).toISOString(),
      latitude: lat,
      longitude: 174,
      depth: 10,
      // Mainshock M5.0, then aftershocks cycling M2.0-3.1 on the 0.1 grid.
      magnitude: k === 0 ? 5.0 : Number((2.0 + (k % 12) * 0.1).toFixed(1)),
    }));
  }

  // 30 events is above the old 10-event trigger but below the 50-event Mc floor;
  // 60 events clears it. The sequences are 400 days and 5 degrees apart, far
  // outside each other's Gardner-Knopoff windows (M5: 144 d, 40 km).
  const events = [...sequence(30, 'small-', 0, -38), ...sequence(60, 'large-', 400, -43)];

  it('library: no b-value for the 30-event cluster, one for the 60-event cluster', () => {
    const { clusterInfo } = gardnerKnopoffDeclustering(events);
    const byCount = new Map(clusterInfo.map(c => [c.eventCount, c]));
    expect(byCount.get(30)!.bValue).toBeUndefined();
    expect(byCount.get(60)!.bValue).toBeGreaterThan(0);
  });

  it('worker: identical per-cluster b-values to the library', () => {
    const worker = loadWorker()({ type: 'temporal', events });
    const lib = analyzeTemporalPattern(events);
    const summarise = (clusters: any[]) => clusters
      .map(c => [c.eventCount, c.bValue === undefined ? undefined : Number(c.bValue.toFixed(9))])
      .sort((a: any[], b: any[]) => a[0] - b[0]);
    expect(summarise(worker.clusters)).toEqual(summarise(lib.clusters));
    expect(summarise(worker.clusters)[0]).toEqual([30, undefined]);
  });
});

describe('the Analytics hook applies the same floor before starting a worker', () => {
  beforeEach(() => {
    (createSeismologicalWorker as jest.Mock).mockReset();
    (createSeismologicalWorker as jest.Mock).mockImplementation(() => ({
      onmessage: null, onerror: null, postMessage: jest.fn(), terminate: jest.fn(),
    }));
  });

  it('refuses an estimated-Mc fit on fewer than 50 events', () => {
    const rows = eventsWithMagnitudes(SEQUENCE_24.concat(SEQUENCE_24));
    const { result } = renderHook(() => useSeismologicalWorker('gutenberg-richter', rows));
    expect(result.current.error).toMatch(/at least 50 events/);
    expect(createSeismologicalWorker).not.toHaveBeenCalled();
  });

  it('runs the fit when an explicit cut-off is supplied', () => {
    const rows = eventsWithMagnitudes(SEQUENCE_24);
    const { result } = renderHook(() => useSeismologicalWorker('gutenberg-richter', rows, true, { minMagnitude: 1.4 }));
    expect(result.current.error).toBeNull();
    expect(createSeismologicalWorker).toHaveBeenCalledTimes(1);
  });
});
