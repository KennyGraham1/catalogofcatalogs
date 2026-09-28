/**
 * Finding #7: the seismic-moment code sums Mw exactly, sums ML-family and UNTYPED
 * magnitudes under the ML ~ Mw assumption, and excludes every other stated scale
 * (mb, Ms, Md, and anything unrecognised such as Me, mB or Mjma). Its messages said
 * the excluded events were "mb/Ms/Md ... because they saturate", which misattributes
 * an Me or Md exclusion, and a field comment said untyped events were excluded.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import { calculateSeismicMoment, type EarthquakeEvent } from '@/lib/seismological-analysis';

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

const typed = (types: (string | undefined)[]): EarthquakeEvent[] => types.map((magnitude_type, i) => ({
  id: i, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4 + i * 0.1, magnitude_type,
}));

describe('moment exclusions are described by what the code does', () => {
  it('does not blame saturation when energy or duration magnitudes are excluded', () => {
    const events = typed(['Me', 'Md', 'Mjma']);
    let message = '';
    try { calculateSeismicMoment(events); } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/other stated scales/);
    expect(message).not.toMatch(/because they saturate/);
    expect(loadWorker()({ type: 'moment', events }).error).toBe(message);
  });

  it('sums untyped magnitudes under the ML assumption rather than excluding them', () => {
    const result = calculateSeismicMoment(typed([undefined, undefined, 'Me']));
    expect([result.assumedMwCount, result.excludedCount]).toEqual([2, 1]);
  });
});
