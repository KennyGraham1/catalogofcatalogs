/**
 * Finding #2: Gardner-Knopoff declustering rescanned the whole catalogue from its
 * first event for every unassigned head and re-parsed each ISO time string on every
 * comparison, so it was O(N^2) in date parses (reviewers measured 21.7 s at 10k
 * events, and extrapolated hours for a national GeoNet catalogue). The Temporal tab
 * returns its time series and its clusters in one worker message, so the cheap time
 * series waited on that loop too.
 *
 * The window is forward-only and events are time-sorted, so each head's window is a
 * contiguous run of the sorted catalogue. These tests pin (1) that the fast path
 * returns exactly what the window definition implies, via a brute-force reference
 * written from the definition, and (2) that it scales.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {
  gardnerKnopoffDeclustering,
  getGardnerKnopoffWindow,
  analyzeTemporalPattern,
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

const DAY = 86400_000;
const T0 = Date.UTC(2015, 0, 1);

function haversineKm(a: EarthquakeEvent, b: EarthquakeEvent): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Brute-force Gardner-Knopoff straight from the definition: heads in decreasing
 * magnitude (ties in time order); each unassigned head claims every unassigned
 * event with 0 <= t - t_head <= T(M) and distance <= L(M).
 */
function referenceClusters(events: EarthquakeEvent[]): Map<string, string[]> {
  const t = (e: EarthquakeEvent) => Date.parse(e.time);
  const sorted = [...events].sort((a, b) => t(a) - t(b));
  const byMagnitude = [...sorted].sort((a, b) => b.magnitude - a.magnitude);
  const assigned = new Set<string | number>();
  const clusters = new Map<string, string[]>();
  for (const head of byMagnitude) {
    if (assigned.has(head.id)) continue;
    assigned.add(head.id);
    const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(head.magnitude);
    const members = [String(head.id)];
    for (const e of sorted) {
      if (e.id === head.id || assigned.has(e.id)) continue;
      const dt = (t(e) - t(head)) / DAY;
      if (dt < 0 || dt > timeWindowDays) continue;
      if (haversineKm(head, e) <= distanceWindowKm) {
        members.push(String(e.id));
        assigned.add(e.id);
      }
    }
    if (members.length > 1) clusters.set(String(head.id), members);
  }
  return clusters;
}

/**
 * NZ-extent background seismicity plus mainshock-aftershock sequences, with tied
 * origin times and tied magnitudes so the ordering rules are exercised.
 */
function clusteredCatalogue(n: number, seed: number): EarthquakeEvent[] {
  const rng = mulberry32(seed);
  const events: EarthquakeEvent[] = [];
  let id = 0;
  const push = (time: number, lat: number, lon: number, magnitude: number) =>
    events.push({
      id: `e${id++}`, time: new Date(time).toISOString(),
      latitude: lat, longitude: lon, depth: 5 + rng() * 30, magnitude,
    });
  const background = Math.round(n * 0.7);
  for (let i = 0; i < background; i++) {
    push(T0 + rng() * 10 * 365 * DAY, -47 + rng() * 13, 166 + rng() * 13,
      Number((1.5 - Math.log(1 - rng()) / Math.LN10).toFixed(1)));
  }
  while (events.length < n) {
    const t = T0 + rng() * 10 * 365 * DAY;
    const lat = -46 + rng() * 11;
    const lon = 167 + rng() * 11;
    // Half the sequences record a smaller event at the mainshock's exact origin time
    // BEFORE the mainshock, so it sorts ahead of its head at dt = 0.
    if (rng() < 0.5) push(t, lat, lon, 2.0);
    push(t, lat, lon, Number((4.5 + rng() * 2).toFixed(1)));
    const size = 5 + Math.floor(rng() * 40);
    for (let k = 0; k < size && events.length < n; k++) {
      // Every fifth aftershock shares the mainshock's origin time exactly.
      const dt = k % 5 === 4 ? 0 : rng() * 30 * DAY;
      push(t + dt, lat + (rng() - 0.5) * 0.3, lon + (rng() - 0.5) * 0.3,
        Number((2.0 + rng() * 1.5).toFixed(1)));
    }
  }
  return events;
}

describe('Gardner-Knopoff declustering: fast path matches the window definition', () => {
  const events = clusteredCatalogue(3000, 7);

  it('assigns exactly the clusters the brute-force definition does', () => {
    const expected = referenceClusters(events);
    const actual = gardnerKnopoffDeclustering(events);
    const asIds = new Map(
      Array.from(actual.clusters.entries()).map(([head, members]) => [String(head), members.map(e => String(e.id))])
    );
    expect(expected.size).toBeGreaterThan(30); // the catalogue really is clustered
    // Compare as sorted membership: cluster-info building re-sorts members in place.
    const norm = (m: Map<string, string[]>) =>
      Array.from(m.entries()).map(([h, ms]) => [h, [...ms].sort()] as const).sort((a, b) => a[0].localeCompare(b[0]));
    expect(norm(asIds)).toEqual(norm(expected));

    const dependent = new Set(Array.from(expected.values()).flatMap(ms => ms.slice(1)));
    expect(actual.mainshocks.map(e => String(e.id)).sort())
      .toEqual(events.map(e => String(e.id)).filter(id => !dependent.has(id)).sort());
  });

  it('gives the worker the same clusters as the library', () => {
    const lib = analyzeTemporalPattern(events);
    const worker = loadWorker()({ type: 'temporal', events });
    const summarise = (clusters: any[]) =>
      clusters.map(c => [String(c.mainshock.id), c.eventCount]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(summarise(worker.clusters)).toEqual(summarise(lib.clusters));
  });
});

describe('Gardner-Knopoff declustering scales to national catalogues', () => {
  // 8,000 events took ~10-15 s per path before (quadratic). The windowed scan
  // takes a few tens of milliseconds, so a 2 s budget leaves a wide margin for a
  // loaded machine while still failing the quadratic loop by a large factor.
  const events = clusteredCatalogue(8000, 99);

  it('library declustering stays well inside the budget', () => {
    const start = Date.now();
    const { mainshocks } = gardnerKnopoffDeclustering(events);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(mainshocks.length).toBeGreaterThan(0);
  }, 120_000);

  it('the worker Temporal message stays well inside the budget', () => {
    const run = loadWorker();
    const start = Date.now();
    const result = run({ type: 'temporal', events });
    expect(Date.now() - start).toBeLessThan(2000);
    expect(result.error).toBeUndefined();
    expect(result.timeSeries.length).toBeGreaterThan(0);
  }, 120_000);
});
