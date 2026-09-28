/**
 * Finding #8: the library's analyzeTemporalPattern declustered only when at least 10
 * located events were present, while the worker the Analytics page runs declusters
 * from 3 (its own gardnerKnopoffDeclustering floor) and keeps clusters of 3+ events.
 * A short sequence was therefore a cluster on screen and no cluster in the library.
 * Gardner-Knopoff is a per-event window method with no sample-size floor of its own,
 * so the library now follows the worker.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { analyzeTemporalPattern, type EarthquakeEvent } from '@/lib/seismological-analysis';

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

/** An M5.0 mainshock and n - 1 M2.5 aftershocks an hour apart at the same spot. */
function sequence(n: number): EarthquakeEvent[] {
  const t0 = Date.UTC(2022, 5, 1);
  return Array.from({ length: n }, (_, k) => ({
    id: `s${k}`,
    time: new Date(t0 + k * 3600_000).toISOString(),
    latitude: -42.5,
    longitude: 173.5,
    depth: 12,
    magnitude: k === 0 ? 5.0 : 2.5,
  }));
}

describe('library and worker decluster short sequences alike', () => {
  it.each([3, 5, 9])('finds the single %i-event sequence in both copies', n => {
    // Every aftershock is 0-8 h after the M5.0 at the same point: inside its window
    // (T = 143.7 d, L = 40.0 km), so the sequence is one cluster of n events.
    const events = sequence(n);
    const lib = analyzeTemporalPattern(events);
    const worker = loadWorker()({ type: 'temporal', events });
    expect(lib.clusters.map(c => c.eventCount)).toEqual([n]);
    expect(worker.clusters.map((c: any) => c.eventCount)).toEqual([n]);
    expect(lib.clusters[0].mainshock.id).toBe(worker.clusters[0].mainshock.id);
  });

  it('reports no cluster for two events in either copy', () => {
    const events = sequence(2);
    expect(analyzeTemporalPattern(events).clusters).toEqual([]);
    expect(loadWorker()({ type: 'temporal', events }).clusters).toEqual([]);
  });
});
