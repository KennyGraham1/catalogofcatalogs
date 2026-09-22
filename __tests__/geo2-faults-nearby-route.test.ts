/**
 * @jest-environment node
 *
 * Regression tests for GET /api/faults/nearby.
 *
 * Two defects are pinned here:
 *
 * 1. The WFS bounding box was built as lon ± radius/(111·cos φ) with no wrapping
 *    and no clamping, so a query near 180° (Raoul Island, the Kermadec arc) sent
 *    a bbox with a longitude outside [-180, 180] — and at the poles cos φ → 0
 *    made it Infinity. A WFS bbox also cannot express minLon > maxLon, so a
 *    crossing window has to be issued as two boxes.
 * 2. AF250 publishes slip rate, displacement, last-event age and recurrence
 *    interval as coded-domain class codes (see lib/fault-data.ts), and the route
 *    returned those integers under names a client reads as mm/yr, metres or
 *    years, while never decoding the slip-type code it does have a table for.
 *
 * Expected bbox numbers are computed here from the route's documented
 * approximation (1° latitude ≈ 111 km, 1° longitude ≈ 111·cos φ km) rather than
 * read back out of the implementation.
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/faults/nearby/route';

type Bbox = { minLon: number; minLat: number; maxLon: number; maxLat: number };

const requestedBboxes = (): Bbox[] =>
  (global.fetch as jest.Mock).mock.calls.map(([url]) => {
    const bbox = new URL(String(url)).searchParams.get('bbox') as string;
    const [minLon, minLat, maxLon, maxLat] = bbox.split(',').map(Number);
    return { minLon, minLat, maxLon, maxLat };
  });

const mockWfs = (features: unknown[]) => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ type: 'FeatureCollection', features }),
  })) as unknown as typeof fetch;
};

const call = async (query: string) => {
  const response = await GET(
    new NextRequest(`http://localhost/api/faults/nearby?${query}`)
  );
  return { status: response.status, body: await response.json() };
};

/** A fault trace as the AF250 WFS publishes it: MultiLineString + integer codes. */
const fault = (id: string, coordinates: number[][][], properties: Record<string, unknown>) => ({
  type: 'Feature',
  id,
  geometry: { type: 'MultiLineString', coordinates },
  properties,
});

describe('bounding box construction', () => {
  beforeEach(() => mockWfs([]));
  afterEach(() => jest.restoreAllMocks());

  it('sends a single in-range bbox for an ordinary mainland query', async () => {
    // Wellington, 50 km: latDelta = 50/111 = 0.450450,
    // lonDelta = 50/(111·cos 41.29°) = 50/(111·0.7513763) = 0.5994981.
    // With an empty service the route climbs its 5 / 20 / 50 km ladder; the last box
    // is the full-radius one.
    await call('lat=-41.29&lon=174.77&radius=50');
    const boxes = requestedBboxes();
    expect(boxes).toHaveLength(3);
    const full = boxes[boxes.length - 1];
    expect(full.minLon).toBeCloseTo(174.77 - 0.5994981, 6);
    expect(full.maxLon).toBeCloseTo(174.77 + 0.5994981, 6);
    expect(full.minLat).toBeCloseTo(-41.29 - 0.450450, 6);
    expect(full.maxLat).toBeCloseTo(-41.29 + 0.450450, 6);
    // The first box is the 5 km one: 5/111 = 0.045045 in latitude.
    expect(boxes[0].maxLat - boxes[0].minLat).toBeCloseTo(2 * 0.045045, 6);
  });

  it('stops widening once the requested number of faults lies inside a small box', async () => {
    // Three faults within 2 km of the point: the 5 km box already settles the ranking.
    const near = (id: string, dLat: number) => fault(id, [[[174.77, -41.29 + dLat], [174.771, -41.29 + dLat]]], { NAME: id });
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [near('a', 0.005), near('b', 0.01), near('c', 0.015)] }),
    }));
    const { body } = await call('lat=-41.29&lon=174.77&radius=50&limit=3');
    expect(body.faults.map((f: any) => f.id)).toEqual(['a', 'b', 'c']);
    expect(requestedBboxes()).toHaveLength(1);
  });

  it('splits a query that straddles 180 into two in-range boxes', async () => {
    // lon 179.8, lat -29.25, 50 km: lonDelta = 50/(111·cos 29.25°)
    // = 50/(111·0.8724960) = 0.5162780, so the window is
    // 179.2837220 .. 180.3162780, i.e. 179.2837220 .. 180 plus
    // -180 .. -179.6837220.
    await call('lat=-29.25&lon=179.8&radius=50');
    const boxes = requestedBboxes().slice(-2); // the full-radius pair
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.minLon).toBeGreaterThanOrEqual(-180);
      expect(box.maxLon).toBeLessThanOrEqual(180);
      expect(box.minLon).toBeLessThanOrEqual(box.maxLon);
    }
    expect(boxes[0].minLon).toBeCloseTo(179.2837220, 6);
    expect(boxes[0].maxLon).toBe(180);
    expect(boxes[1].minLon).toBe(-180);
    expect(boxes[1].maxLon).toBeCloseTo(-179.6837220, 6);
  });

  it('splits a query just east of 180 as well (Raoul Island)', async () => {
    // lon -179.9 with the same 0.5162780 half-width:
    // -180.4162780 .. -179.3837220, wrapped to 179.5837220 .. 180 plus
    // -180 .. -179.3837220.
    await call('lat=-29.25&lon=-179.9&radius=50');
    const boxes = requestedBboxes().slice(-2); // the full-radius pair
    expect(boxes).toHaveLength(2);
    expect(boxes[0].minLon).toBeCloseTo(179.5837220, 6);
    expect(boxes[0].maxLon).toBe(180);
    expect(boxes[1].minLon).toBe(-180);
    expect(boxes[1].maxLon).toBeCloseTo(-179.3837220, 6);
  });

  it('clamps latitude and covers every longitude near the pole', async () => {
    // cos 89.9° = 0.001745, so the longitude half-width would be 258°, wider
    // than a half circle: every longitude qualifies. Latitude must stay <= 90.
    await call('lat=89.9&lon=0&radius=50');
    const boxes = requestedBboxes();
    const full = boxes[boxes.length - 1]; // the 50 km rung of the ladder
    expect(full.minLon).toBe(-180);
    expect(full.maxLon).toBe(180);
    expect(full.maxLat).toBe(90);
    for (const box of boxes) {
      expect(Number.isFinite(box.minLon)).toBe(true);
      expect(box.maxLat).toBeLessThanOrEqual(90);
    }
  });

  it('never emits a longitude outside [-180, 180] for any query point', async () => {
    for (const lon of [-180, -179.99, -90, 0, 90, 179.99, 180]) {
      (global.fetch as jest.Mock).mockClear();
      await call(`lat=-35&lon=${lon}&radius=200`);
      for (const box of requestedBboxes()) {
        expect(box.minLon).toBeGreaterThanOrEqual(-180);
        expect(box.maxLon).toBeLessThanOrEqual(180);
        expect(box.minLat).toBeGreaterThanOrEqual(-90);
        expect(box.maxLat).toBeLessThanOrEqual(90);
        expect(box.minLon).toBeLessThanOrEqual(box.maxLon);
      }
    }
  });

  it('rejects a non-numeric or non-positive radius instead of sending it', async () => {
    const bad = await call('lat=-41.29&lon=174.77&radius=abc');
    expect(bad.status).toBe(400);
    const zero = await call('lat=-41.29&lon=174.77&radius=0');
    expect(zero.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('dense fault search completeness', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([12000, 12001])('does not claim a nearest result from a truncated %i-trace search', async (total) => {
    const rows = Array.from({ length: total }, (_, i) => {
      const nearest = i === total - 1;
      const latitude = nearest ? -41.278 : -41.27;
      return fault(nearest ? 'nearest-last' : `far-${i}`, [[[174.772, latitude], [174.7721, latitude]]], {});
    });
    global.fetch = jest.fn(async (url) => {
      const query = new URL(String(url)).searchParams;
      const [west, south, east, north] = query.get('bbox')!.split(',').slice(0, 4).map(Number);
      const start = Number(query.get('startIndex') || 0);
      const count = Number(query.get('count'));
      const matched = rows.filter(row => row.geometry.coordinates.some(line => line.some(([x, y]) => x >= west && x <= east && y >= south && y <= north)));
      return { ok: true, json: async () => ({ numberMatched: matched.length, features: matched.slice(start, start + count) }) };
    }) as unknown as typeof fetch;
    const { status, body } = await call('lat=-41.29&lon=174.77&radius=50&limit=1');
    if (total === 12000) {
      expect(status).toBe(200);
      expect(body.faults[0].id).toBe('nearest-last');
      expect(body.faults[0].distance).toBe(1.3);
    } else {
      expect(status).toBe(502);
      expect(body.code).toBe('FAULT_DATA_INCOMPLETE');
      expect(body.faults).toBeUndefined();
      expect(body.success).not.toBe(true);
    }
    expect((global.fetch as jest.Mock).mock.calls.length).toBeLessThanOrEqual(18);
  });
});

describe('coded-domain attributes', () => {
  afterEach(() => jest.restoreAllMocks());

  it('decodes the slip-type code and never reports a class code as a measurement', async () => {
    mockWfs([
      fault('AF250.FAULTS.1', [[[174.77, -41.29]]], {
        name: 'Wellington Fault',
        slip_type: 1,
        sub_sliptype: 0,
        slip_rate: 3,
        displacement: 2,
        last_event: 1,
        rec_interval: 'IV',
      }),
    ]);

    const { body } = await call('lat=-41.29&lon=174.77&radius=50');
    expect(body.faults).toHaveLength(1);
    const [f] = body.faults;

    expect(f.name).toBe('Wellington Fault');
    // slip_type 1 is the AF250 code for dextral.
    expect(f.slipType).toBe('dextral');
    // sub_sliptype 0 means "no subsidiary sense recorded".
    expect(f.senseOfMovement).toBeNull();

    // None of these may come back as a physical value...
    expect(f.slipRate).toBeNull();
    expect(f.displacement).toBeNull();
    expect(f.lastEvent).toBeNull();
    expect(f.recurrenceInterval).toBeNull();
    // ...but the class codes stay available under names that say so.
    expect(f.slipRateClass).toBe(3);
    expect(f.displacementClass).toBe(2);
    expect(f.lastEventClass).toBe(1);
    expect(f.recurrenceIntervalClass).toBe('IV');
  });

  it('passes descriptive text from other fault layers through unchanged', async () => {
    mockWfs([
      fault('X.1', [[[174.77, -41.29]]], {
        NAME: 'Some Other Layer Fault',
        SLIP_TYPE: 'Reverse',
        SLIP_RATE: '1-2 mm/yr',
        REC_INT: '<Null>',
      }),
    ]);

    const { body } = await call('lat=-41.29&lon=174.77&radius=50');
    const [f] = body.faults;
    expect(f.slipType).toBe('Reverse');
    expect(f.slipRate).toBe('1-2 mm/yr');
    expect(f.slipRateClass).toBeNull();
    // '<Null>' is the layer's literal placeholder, not a value.
    expect(f.recurrenceInterval).toBeNull();
    expect(f.recurrenceIntervalClass).toBeNull();
  });

  it('reports each fault once when both halves of a split query return it', async () => {
    const straddling = fault('AF250.FAULTS.99', [[[179.95, -29.25], [-179.95, -29.26]]], {
      name: 'Kermadec Trace',
      slip_type: 3,
    });
    mockWfs([straddling]);

    const { body } = await call('lat=-29.25&lon=179.8&radius=50');
    // Every rung of the ladder that straddles 180 issues two boxes; the fault comes
    // back from both halves of each and is reported once.
    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(body.faults).toHaveLength(1);
    expect(body.faults[0].slipType).toBe('reverse');
  });
});
