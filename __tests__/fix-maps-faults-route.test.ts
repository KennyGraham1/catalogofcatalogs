/**
 * @jest-environment node
 *
 * GET /api/faults/nearby proxies the GNS Science AF250 WFS. It had no auth, no rate
 * limit and no upper bound on `radius` or `limit`, so one anonymous request such as
 * lat=-41&lon=160&radius=3000&limit=1 (Tasman Sea: the 5 and 20 km rungs find nothing,
 * so the full-radius box covers the whole layer) fanned out into ~27 upstream requests
 * and ~20 MB of GeoJSON, and a huge `limit` became the WFS page size. The only caller,
 * the analytics map popup, sends radius=50&limit=3 for a signed-in viewer.
 *
 * The WFS is simulated in-process (bbox / count / startIndex / numberMatched); no
 * network is used.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(async () => ({ session: {}, user: { id: 'viewer', role: 'viewer' } })),
}));

import { GET } from '@/app/api/faults/nearby/route';
import { requireViewer } from '@/lib/auth/middleware';

type Upstream = { bbox: number[]; count: number; startIndex: number };
let upstream: Upstream[] = [];

/** Short traces scattered around Wellington, as the AF250 layer publishes them. */
const FAULTS = Array.from({ length: 40 }, (_, i) => {
  const lat = -41.29 + (i % 8) * 0.05;
  const lon = 174.6 + Math.floor(i / 8) * 0.08;
  return {
    type: 'Feature',
    id: `AF250.FAULTS.${i}`,
    geometry: { type: 'MultiLineString', coordinates: [[[lon, lat], [lon + 0.01, lat + 0.01]]] },
    properties: { name: `Fault ${i}`, slip_type: 1 },
  };
});

beforeEach(() => {
  upstream = [];
  (requireViewer as jest.Mock).mockClear();
  global.fetch = jest.fn(async (url: string) => {
    const params = new URL(String(url)).searchParams;
    const bbox = (params.get('bbox') || '').split(',').slice(0, 4).map(Number);
    const count = Number(params.get('count'));
    const startIndex = Number(params.get('startIndex') || 0);
    upstream.push({ bbox, count, startIndex });
    const [west, south, east, north] = bbox;
    const matched = FAULTS.filter((f) => f.geometry.coordinates.some((line) =>
      line.some(([x, y]) => x >= west && x <= east && y >= south && y <= north)));
    return {
      ok: true,
      json: async () => ({ type: 'FeatureCollection', numberMatched: matched.length, features: matched.slice(startIndex, startIndex + count) }),
    };
  }) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

let client = 0;
/** Each call comes from its own client unless one is given, so budgets do not interact. */
const call = async (query: string, ip = `198.51.100.${++client}`) => {
  const response = await GET(new NextRequest(`http://localhost/api/faults/nearby?${query}`, {
    headers: { 'x-forwarded-for': ip, 'x-real-ip': ip },
  }));
  return { status: response.status, headers: response.headers, body: await response.json() };
};

describe('radius and limit are bounded', () => {
  it('refuses the offshore whole-layer query without contacting the WFS', async () => {
    const { status, body } = await call('lat=-41&lon=160&radius=3000&limit=1');
    expect(status).toBe(400);
    expect(body.error).toMatch(/radius/i);
    expect(upstream).toHaveLength(0);
  });

  it('refuses a world radius with a huge limit without contacting the WFS', async () => {
    const { status } = await call('lat=-41&lon=175&radius=20000&limit=999999999');
    expect(status).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it('refuses a limit above the cap even for a small radius', async () => {
    const { status, body } = await call('lat=-41.29&lon=174.77&radius=50&limit=51');
    expect(status).toBe(400);
    expect(body.error).toMatch(/limit/i);
    expect(upstream).toHaveLength(0);
  });

  it('refuses a radius just above the cap', async () => {
    expect((await call('lat=-41.29&lon=174.77&radius=200.5&limit=3')).status).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it('still serves the popup query and the largest allowed query', async () => {
    const popup = await call('lat=-41.29&lon=174.77&radius=50&limit=3');
    expect(popup.status).toBe(200);
    expect(popup.body.faults).toHaveLength(3);
    const widest = await call('lat=-41.29&lon=174.77&radius=200&limit=50');
    expect(widest.status).toBe(200);
    expect(widest.body.faults).toHaveLength(40);
  });

  it('keeps the WFS page size independent of the display limit', async () => {
    await call('lat=-41.29&lon=174.77&radius=50&limit=1');
    await call('lat=-41.29&lon=174.77&radius=50&limit=50');
    const pageSizes = new Set(upstream.map(({ count }) => count));
    expect(pageSizes).toEqual(new Set([2000]));
  });
});

describe('access control', () => {
  it('answers an anonymous caller with 401 before any upstream request', async () => {
    (requireViewer as jest.Mock).mockImplementationOnce(async () =>
      NextResponse.json({ error: 'Authentication required' }, { status: 401 }));
    const { status } = await call('lat=-41.29&lon=174.77&radius=50&limit=3');
    expect(status).toBe(401);
    expect(upstream).toHaveLength(0);
  });

  it('checks the session on every request', async () => {
    await call('lat=-41.29&lon=174.77&radius=50&limit=3');
    expect(requireViewer).toHaveBeenCalledTimes(1);
  });

  it('throttles one client at 30 lookups a minute, before contacting the WFS', async () => {
    // A fresh module registry gives a fresh in-memory limiter, so earlier tests in this
    // file cannot have spent any of this client's budget.
    let isolatedGET!: typeof GET;
    jest.isolateModules(() => {
      isolatedGET = require('@/app/api/faults/nearby/route').GET;
    });
    const request = (ip = '203.0.113.77') => isolatedGET(new NextRequest(
      'http://localhost/api/faults/nearby?lat=-41.29&lon=174.77&radius=50&limit=3',
      { headers: { 'x-forwarded-for': ip, 'x-real-ip': ip } },
    ));
    for (let i = 0; i < 30; i++) expect((await request()).status).toBe(200);
    const before = upstream.length;
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    expect(upstream).toHaveLength(before);

    // Another client still has its own budget.
    expect((await request('203.0.113.78')).status).toBe(200);
  });
});
