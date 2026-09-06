/**
 * @jest-environment node
 *
 * Regression tests for the remaining antimeridian siblings.
 *
 * New Zealand's territory crosses 180° at the Kermadec arc (Raoul Island sits at
 * about -29.25, -177.9), so a viewport, a fault query, a WFS bounding box and a
 * stored catalogue extent all have to survive west > east — the RFC 7946 §5.2
 * convention already used by lib/merge.ts and lib/db.ts. Each expectation below
 * is derived by hand from that convention (and from the great-circle geometry
 * where distances are involved), not from running the code.
 */

import fs from 'fs';
import path from 'path';
import {
  createSpatialIndex,
  queryEventsInBounds,
  isEventInBounds,
  type ViewportBounds,
} from '@/lib/earthquake-utils';
import { getFaultsInBounds, type FaultCollection, type FaultFeature } from '@/lib/fault-data';
import {
  unionBounds,
  finiteExtent,
  longitudeExtent,
  type GeographicBounds,
} from '@/lib/geo-bounds-utils';

// ---------------------------------------------------------------------------
// 1. Spatial-index cell walk (lib/earthquake-utils.ts)
// ---------------------------------------------------------------------------

type Ev = { id: string; latitude: number; longitude: number };

const EVENTS: Ev[] = [
  { id: 'k1', latitude: -30, longitude: 177.5 },   // west of 180
  { id: 'k2', latitude: -30, longitude: 179.9 },   // just west of 180
  { id: 'dl', latitude: -30, longitude: 180 },     // exactly on the antimeridian
  { id: 'k3', latitude: -30, longitude: -179.5 },  // just east of 180
  { id: 'k4', latitude: -30, longitude: -176.5 },  // east of 180
  { id: 'nz', latitude: -41, longitude: 174.8 },   // Wellington
  { id: 'far', latitude: -30, longitude: 100 },    // Indian Ocean
];

const ids = (events: Ev[]): string[] => events.map((e) => e.id).sort();

describe('queryEventsInBounds — the cell walk has to wrap at 180°', () => {
  // Kermadec viewport in the RFC 7946 form: runs east from 177, across 180, to -176.
  const kermadec: ViewportBounds = { north: -25, south: -35, west: 177, east: -176 };
  // The same viewport as Leaflet reports it, unwrapped past 180.
  const kermadecUnwrapped: ViewportBounds = { north: -25, south: -35, west: 177, east: 184 };

  it('returns the events inside a dateline-crossing viewport (was: zero)', () => {
    const grid = createSpatialIndex(EVENTS, 1);
    // By hand: 177.5, 179.9, 180, -179.5 and -176.5 all lie on the eastward arc
    // 177 -> 180 -> -176; 174.8 is west of the arc and 100 far outside it.
    expect(ids(queryEventsInBounds(grid, kermadec, 1))).toEqual(['dl', 'k1', 'k2', 'k3', 'k4']);
  });

  it('treats Leaflet-style unwrapped bounds the same way', () => {
    const grid = createSpatialIndex(EVENTS, 1);
    expect(ids(queryEventsInBounds(grid, kermadecUnwrapped, 1))).toEqual([
      'dl', 'k1', 'k2', 'k3', 'k4',
    ]);
  });

  it('agrees with a brute-force isEventInBounds scan for every viewport shape', () => {
    const viewports: ViewportBounds[] = [
      kermadec,
      kermadecUnwrapped,
      { north: -40, south: -42, west: 174, east: 175 },   // ordinary NZ box
      { north: 90, south: -90, west: -180, east: 180 },    // whole world
      { north: -25, south: -35, west: 179.5, east: -179.5 }, // 1°-wide box on 180
      { north: -25, south: -35, west: 530, east: 550 },     // triple-wrapped Leaflet box
    ];
    for (const cellSize of [1, 2, 5]) {
      const grid = createSpatialIndex(EVENTS, cellSize);
      for (const viewport of viewports) {
        const expected = ids(EVENTS.filter((e) => isEventInBounds(e, viewport)));
        expect(ids(queryEventsInBounds(grid, viewport, cellSize))).toEqual(expected);
      }
    }
  });

  it('still restricts an ordinary non-crossing viewport', () => {
    const grid = createSpatialIndex(EVENTS, 1);
    const wellington: ViewportBounds = { north: -40, south: -42, west: 174, east: 175 };
    expect(ids(queryEventsInBounds(grid, wellington, 1))).toEqual(['nz']);
  });

  it('returns every event for a whole-world viewport and none for a NaN one', () => {
    const grid = createSpatialIndex(EVENTS, 1);
    expect(queryEventsInBounds(grid, { north: 90, south: -90, west: -180, east: 180 }, 1))
      .toHaveLength(EVENTS.length);
    expect(queryEventsInBounds(grid, { north: 90, south: -90, west: NaN, east: NaN }, 1))
      .toHaveLength(0);
  });

  it('does not report an event twice when the walk wraps onto the same cell', () => {
    const grid = createSpatialIndex(EVENTS, 1);
    // 359.5° wide, so the walk covers nearly every column and additionally
    // probes the +180 cell as the twin of the -180 one it already visits.
    const nearGlobal: ViewportBounds = { north: -25, south: -35, west: -179.75, east: 179.75 };
    const hits = queryEventsInBounds(grid, nearGlobal, 1);
    expect(hits.length).toBe(new Set(hits.map((e) => e.id)).size);
  });
});

// ---------------------------------------------------------------------------
// 2. getFaultsInBounds (lib/fault-data.ts)
// ---------------------------------------------------------------------------

const mls = (lines: number[][][], name: string): FaultFeature => ({
  type: 'Feature',
  geometry: { type: 'MultiLineString', coordinates: lines },
  properties: { name },
});

describe('getFaultsInBounds — dateline-crossing boxes', () => {
  const west180 = mls([[[179.4, -30.1], [179.6, -30.2]]], 'West of 180');
  const east180 = mls([[[-177.2, -30.1], [-177.0, -30.2]]], 'East of 180');
  const mainland = mls([[[174.7, -41.2], [174.9, -41.3]]], 'Mainland');
  const outside = mls([[[170.0, -30.0], [170.2, -30.1]]], 'Outside');
  const collection: FaultCollection = {
    type: 'FeatureCollection',
    features: [west180, east180, mainland, outside],
  };
  const names = (features: FaultFeature[]) => features.map((f) => f.properties.name).sort();

  it('keeps faults on both sides of 180 when west > east', () => {
    // The box runs east from 177 across 180 to -176 between 35°S and 25°S:
    // 179.4/179.6 and -177.2/-177.0 are on that arc, 174.8 is not (and the
    // mainland fault is south of the box anyway), 170 is far west of it.
    const hits = getFaultsInBounds(collection, { north: -25, south: -35, east: -176, west: 177 });
    expect(names(hits)).toEqual(['East of 180', 'West of 180']);
  });

  it('accepts the same box in Leaflet unwrapped form (east past 180)', () => {
    const hits = getFaultsInBounds(collection, { north: -25, south: -35, east: 184, west: 177 });
    expect(names(hits)).toEqual(['East of 180', 'West of 180']);
  });

  it('still selects only faults inside an ordinary box', () => {
    const hits = getFaultsInBounds(collection, { north: -40, south: -42, east: 175, west: 174 });
    expect(names(hits)).toEqual(['Mainland']);
  });

  it('returns everything for a whole-world box and nothing for a NaN one', () => {
    expect(getFaultsInBounds(collection, { north: 90, south: -90, east: 180, west: -180 }))
      .toHaveLength(4);
    expect(getFaultsInBounds(collection, { north: 90, south: -90, east: NaN, west: NaN }))
      .toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. smallestCoveringArc / unionBounds guards (lib/geo-bounds-utils.ts)
// ---------------------------------------------------------------------------

const B = (
  minLatitude: number,
  maxLatitude: number,
  minLongitude: number,
  maxLongitude: number
): GeographicBounds => ({ minLatitude, maxLatitude, minLongitude, maxLongitude });

describe('unionBounds — non-finite input must not throw', () => {
  it('ignores a box whose longitudes are NaN instead of dereferencing merged[-1]', () => {
    // Previously threw TypeError: Cannot read properties of undefined (reading '1').
    const u = unionBounds(B(-10, 10, NaN, NaN), B(-10, 10, 170, 175));
    expect(u).toEqual(B(-10, 10, 170, 175));
  });

  it('ignores infinite longitudes the same way', () => {
    const u = unionBounds(B(-10, 10, -Infinity, Infinity), B(-5, 5, 170, 175));
    expect(u.minLongitude).toBe(170);
    expect(u.maxLongitude).toBe(175);
  });

  it('ignores a half-NaN box rather than widening the union to -180', () => {
    const u = unionBounds(B(-10, 10, NaN, 175), B(-10, 10, 170, 172));
    expect(u.minLongitude).toBe(170);
    expect(u.maxLongitude).toBe(172);
  });

  it('ignores a non-finite latitude instead of poisoning the box', () => {
    const u = unionBounds(B(NaN, NaN, 170, 175), B(-10, 10, 176, 177));
    expect(u.minLatitude).toBe(-10);
    expect(u.maxLatitude).toBe(10);
    expect(u.minLongitude).toBe(170);
    expect(u.maxLongitude).toBe(177);
  });

  it('reports NaN longitudes when neither box has a finite arc', () => {
    const u = unionBounds(B(-10, 10, NaN, NaN), B(-10, 10, NaN, NaN));
    expect(Number.isNaN(u.minLongitude)).toBe(true);
    expect(Number.isNaN(u.maxLongitude)).toBe(true);
  });

  it('leaves the finite behaviour unchanged (NZ mainland + Kermadec)', () => {
    // Merged intervals on the circle: [-180,-176], [166,180]. The widest gap is
    // -176 -> 166 (342°), so the covering arc is its complement, 166 -> -176.
    const u = unionBounds(B(-47, -34, 166, 179), B(-32, -28, 177, -176));
    expect(u).toEqual(B(-47, -28, 166, -176));
  });
});

// ---------------------------------------------------------------------------
// 4. finiteExtent — the Math.min(...array) replacement
// ---------------------------------------------------------------------------

describe('finiteExtent', () => {
  it('returns the min and max of a finite series', () => {
    expect(finiteExtent([3, 1, 2])).toEqual({ min: 1, max: 3 });
    expect(finiteExtent([-41.29])).toEqual({ min: -41.29, max: -41.29 });
  });

  it('skips non-finite values and returns null when nothing is left', () => {
    expect(finiteExtent([NaN, 5, Infinity, -Infinity])).toEqual({ min: 5, max: 5 });
    expect(finiteExtent([])).toBeNull();
    expect(finiteExtent([NaN, Infinity])).toBeNull();
  });

  it('handles a series larger than the engine argument limit', () => {
    // 300k values: Math.min(...values) blows the argument limit (~125k in V8),
    // which is exactly the failure the import script used to hit.
    const values = new Array<number>(300000);
    for (let i = 0; i < values.length; i++) values[i] = i % 1000;
    values[123456] = -7.5;
    values[7] = 4242;

    expect(() => Math.min(...values)).toThrow();
    expect(finiteExtent(values)).toEqual({ min: -7.5, max: 4242 });
  });
});

// ---------------------------------------------------------------------------
// 5. scripts/import-temp-networks.ts
//
// The script runs its import at module scope (importTemporaryNetworks() is
// invoked at the bottom of the file), so it cannot be imported into a test
// without opening a database connection. Its two defects are therefore pinned
// at the source level; the behaviour they now delegate to is covered by the
// finiteExtent and longitudeExtent tests above.
// ---------------------------------------------------------------------------

describe('import-temp-networks bounds calculation', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'import-temp-networks.ts'),
    'utf8'
  );
  // Comments describe the old code, so match against code only.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  it('never spreads an event array into Math.min/Math.max', () => {
    expect(code).not.toMatch(/Math\.(min|max)\(\s*\.\.\./);
    // The one remaining Math.min is the batch-slice bound, not a spread.
    expect(code).toMatch(/Math\.min\(i \+ batchSize, eventDocs\.length\)/);
  });

  it('stores the antimeridian-aware longitude extent, not a plain min/max', () => {
    expect(code).toMatch(/min_longitude:\s*lonExtent\.west/);
    expect(code).toMatch(/max_longitude:\s*lonExtent\.east/);
    expect(code).toMatch(/longitudeExtent\(events\.map\(/);
  });

  it('would have stored a near-global box for a Kermadec catalogue', () => {
    // The longitudes a Raoul Island deployment produces: plain min/max gives
    // -179.4 .. 179.9, a 359.3° box covering almost the whole globe, while the
    // covering arc is 178.6 -> -176.8, a 4.6° box crossing 180°. (Widest gap on
    // the circle: -176.8 -> 178.6 = 355.4°, wider than the 0.7° wrap gap.)
    const lons = [179.2, 178.6, 179.9, -179.4, -177.9, -176.8];
    expect(Math.min(...lons)).toBe(-179.4);
    expect(Math.max(...lons)).toBe(179.9);
    expect(longitudeExtent(lons)).toEqual({ west: 178.6, east: -176.8 });
  });
});
