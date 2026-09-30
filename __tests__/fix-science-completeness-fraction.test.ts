/**
 * Finding #4: the Mc tab showed `confidence` = N(M >= Mc) / N under the title
 * "Catalogue Completeness" with a 0-100% progress bar. It is the share of events the
 * MAXC cut keeps, not a completeness score: for a perfectly complete b = 1 catalogue
 * the +0.2 correction alone caps it at 10^(-0.2) = 63.1%. Both estimators now also
 * return the count behind the share and the bin width, so the page can label it
 * as what it is and show Mc with its one-bin lower-bound uncertainty.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { estimateCompletenessMagnitude, type EarthquakeEvent } from '@/lib/seismological-analysis';

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

/** A perfectly complete b = 1 catalogue on the 0.1 grid from M2.0 to M6.0. */
function completeCatalogue(): EarthquakeEvent[] {
  const events: EarthquakeEvent[] = [];
  for (let k = 0; k <= 40; k++) {
    const magnitude = Number((2.0 + k * 0.1).toFixed(1));
    const count = Math.round(10000 * Math.pow(10, -(magnitude - 2.0)));
    for (let i = 0; i < count; i++) {
      events.push({ id: `${k}-${i}`, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude });
    }
  }
  return events;
}

it('returns the events at or above Mc and the bin width, identically in both copies', () => {
  const events = completeCatalogue();
  const lib = estimateCompletenessMagnitude(events, 0.1, 0.2, { method: 'MAXC' });
  const worker = loadWorker()({ type: 'completeness', events, mcMethod: 'MAXC' });
  // MAXC picks the lowest bin (M2.0), so Mc = 2.2 and the kept share is ~10^-0.2.
  expect(lib.mc).toBeCloseTo(2.2, 10);
  const expectedAbove = events.filter(e => e.magnitude >= 2.2 - 1e-9).length;
  expect(lib.eventsAboveMc).toBe(expectedAbove);
  expect(lib.confidence).toBeCloseTo(expectedAbove / events.length, 12);
  expect(lib.confidence).toBeCloseTo(Math.pow(10, -0.2), 2);
  expect(lib.binWidth).toBe(0.1);
  expect(worker.eventsAboveMc).toBe(lib.eventsAboveMc);
  expect(worker.binWidth).toBe(lib.binWidth);
  expect(worker.confidence).toBeCloseTo(lib.confidence, 12);
});

it('keeps the whole of a perfectly complete catalogue under b-value stability, the default', () => {
  const events = completeCatalogue();
  const lib = estimateCompletenessMagnitude(events);
  // b is stable from the lowest bin, so nothing complete is set aside.
  expect([lib.mc, lib.method, lib.confidence]).toEqual([2.0, 'MBS', 1]);
  const worker = loadWorker()({ type: 'completeness', events });
  expect([worker.mc, worker.method, worker.confidence]).toEqual([2.0, 'MBS', 1]);
});
