/** @jest-environment node */

// Geographic queries and the GeoNet client
// contract.

import { NextRequest } from 'next/server';
import { GET as nearbyFaults } from '@/app/api/faults/nearby/route';
import { boundsOverlap, pointInBounds, unionBounds } from '@/lib/geo-bounds-utils';
import { isEventInBounds } from '@/lib/earthquake-utils';
import { GeoNetClient } from '@/lib/geonet-client';
import { retry, retryFetch } from '@/lib/retry-utils';

// The route now requires a viewer session; these tests exercise the search logic.
jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(async () => ({ session: {}, user: { id: 'viewer', role: 'viewer' } })),
}));

const feature = (id: string, coords: number[][]) => ({ type: 'Feature', id, geometry: { type: 'MultiLineString', coordinates: [coords] }, properties: { name: id } });

/** WFS stub honouring bbox, count and startIndex like GeoServer. */
const mockWfs = (available: any[], opts: { obeyCount?: boolean; obeyBox?: boolean } = {}) => {
  const requests: Array<{ bbox: number[]; count: number; startIndex: number }> = [];
  global.fetch = jest.fn(async (url: string) => {
    const p = new URL(url).searchParams;
    const box = (p.get('bbox') || '').split(',').slice(0, 4).map(Number);
    const count = Number(p.get('count')); const startIndex = Number(p.get('startIndex') || 0);
    requests.push({ bbox: box, count, startIndex });
    let returned = available;
    if (opts.obeyBox) returned = returned.filter((f) => f.geometry.coordinates.some((line: number[][]) => line.some(([lon, lat]) => lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3])));
    if (opts.obeyCount) returned = returned.slice(startIndex, startIndex + count);
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: returned }) };
  }) as unknown as typeof fetch;
  return requests;
};
const query = async (q: string) => {
  const r = await nearbyFaults(new NextRequest(`http://localhost/api/faults/nearby?${q}`));
  expect(r.status).toBe(200);
  return r.json();
};

describe('nearby-fault distance and search extent', () => {
  afterEach(() => jest.restoreAllMocks());

  it('distance is measured to the trace, not to its vertices', async () => {
    mockWfs([feature('crossing', [[174.77, -41.39], [174.77, -41.19]])]);
    const within1km = await query('lat=-41.29&lon=174.77&radius=1&limit=10');
    expect(within1km.count).toBe(1);
    expect(within1km.faults[0].distance).toBe(0);
  });

  it('a box the service truncates is split and paged until the nearest fault is seen', async () => {
    const far = Array.from({ length: 2000 }, (_, i) => feature('far-' + i, [[174.77, -41.19 - i * 1e-6], [174.77, -41.18 - i * 1e-6]]));
    const nearest = feature('near', [[174.77, -41.28], [174.77, -41.279]]);
    mockWfs([...far, nearest], { obeyCount: true, obeyBox: true });
    const r = await query('lat=-41.29&lon=174.77&radius=50&limit=1');
    expect(r.faults[0].id).toBe('near');
  });

  it('a cap that reaches the pole searches every longitude', async () => {
    const requests = mockWfs([feature('near-pole', [[180, 89.99], [180, 89.999]])], { obeyBox: true });
    const r = await query('lat=89.6&lon=0&radius=50&limit=10');
    expect(r.count).toBe(1);
    const last = requests[requests.length - 1];
    expect([last.bbox[0], last.bbox[2]]).toEqual([-180, 180]);
  });

  it('the radius filter uses the unrounded distance', async () => {
    const lonForKm = (km: number) => (km / 6371) * (180 / Math.PI) / Math.SQRT2;
    mockWfs([feature('just-outside', [[lonForKm(1.04), lonForKm(1.04)], [lonForKm(1.04) + 0.001, lonForKm(1.04) + 0.001]])]);
    expect((await query('lat=0&lon=0&radius=1&limit=10')).count).toBe(0);
  });

  it('+180 and -180 are one meridian for membership, but unions keep their shape', () => {
    const minusBox = { minLatitude: -1, maxLatitude: 1, minLongitude: -180, maxLongitude: -179 };
    expect(pointInBounds(0, 180, minusBox)).toBe(true);
    expect(boundsOverlap({ minLatitude: -1, maxLatitude: 1, minLongitude: 180, maxLongitude: 180 }, minusBox)).toBe(true);
    expect(isEventInBounds({ latitude: 0, longitude: 180 }, { west: -180, east: -179, south: -1, north: 1 })).toBe(true);
    const u = unionBounds({ minLatitude: -1, maxLatitude: 1, minLongitude: 170, maxLongitude: 180 }, { minLatitude: -1, maxLatitude: 1, minLongitude: 172, maxLongitude: 175 });
    expect([u.minLongitude, u.maxLongitude]).toEqual([170, 180]);
  });
});

describe('GeoNet client contract', () => {
  const header = '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType';
  const row = (id: string) => `${id}|2024-01-01T00:00:00|-41|174|10|GNS|NZ|GNS|${id}|ML|3.2|GNS|Wellington|earthquake`;
  const params = { starttime: '2024-01-01T00:00:00Z', endtime: '2024-01-01T02:00:00Z' };
  const mockText = (body: string, status = 200) => {
    global.fetch = jest.fn(async () => new Response(status === 204 ? null : body, { status, statusText: status === 404 ? 'Not Found' : 'OK', headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;
  };
  afterEach(() => jest.restoreAllMocks());

  it('an explicit nodata=404 answer is an empty result, a plain 404 is still an error', async () => {
    mockText('No data', 404);
    await expect(new GeoNetClient().fetchEventsText({ ...params, nodata: '404' })).resolves.toEqual([]);
    await expect(new GeoNetClient().fetchEventsQuakeML({ ...params, nodata: '404' })).resolves.toBeNull();
    await expect(new GeoNetClient().fetchEventsText(params)).rejects.toThrow(/404/);
  });

  it('a body cut off mid-row is rejected as truncated and counted in the diagnostics', async () => {
    mockText([header, row('E0'), row('E1'), 'E2|2024-01-01T00:00:00|-41'].join('\n'));
    const client = new GeoNetClient();
    await expect(client.fetchEventsText(params)).rejects.toThrow(/truncated/);
    expect(client.getLastFetchDiagnostics().truncatedTail).toBe(true);
    // A malformed row in the middle is skipped and reported, not fatal.
    mockText([header, row('E0'), 'garbage', row('E1')].join('\n'));
    await expect(client.fetchEventsText(params)).resolves.toHaveLength(2);
    expect(client.getLastFetchDiagnostics()).toEqual({ skippedRows: 1, truncatedTail: false });
  });

  it('FDSN comment lines before the header are accepted', async () => {
    mockText(`# Query complete\n${header}\n${row('VALID')}`);
    const events = await new GeoNetClient().fetchEventsText(params);
    expect(events.map((e) => e.EventID)).toEqual(['VALID']);
  });

  it('maxAttempts is the attempt budget', async () => {
    let attempts = 0;
    const value = await retry(async () => {
      attempts++;
      if (attempts < 4) throw Object.assign(new Error('HTTP 503: Service Unavailable'), { status: 503 });
      return 'recovered';
    }, { maxAttempts: 5, initialDelay: 0, jitter: false, timeout: 100 });
    expect([attempts, value]).toEqual([4, 'recovered']);
  });

  it('a caller abort stops after one attempt with no backoff', async () => {
    const external = new AbortController(); external.abort();
    let attempts = 0;
    global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      attempts++;
      if (init.signal?.aborted) throw new DOMException('This operation was aborted', 'AbortError');
      return new Response('ok');
    }) as unknown as typeof fetch;
    const started = Date.now();
    await expect(retryFetch('https://example.invalid/query', { signal: external.signal }, { initialDelay: 200, jitter: false, timeout: 1000 })).rejects.toThrow(/aborted/);
    expect(attempts).toBeLessThanOrEqual(1); // an already-aborted signal is refused before any fetch
    expect(Date.now() - started).toBeLessThan(150);
  });
});
