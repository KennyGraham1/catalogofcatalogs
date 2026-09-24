/**
 * @jest-environment node
 *
 * Regression tests for the streaming longitude bounds of POST /api/catalogues
 * (cluster: server2).
 *
 * Both import paths used to push every event longitude into an array and hand it to
 * longitudeExtent(), which wraps each value in a [lon, lon] tuple and sorts the lot —
 * an O(n log n) pass and two allocations per event in the code path written specifically
 * to stream batches and never materialise the catalogue. The accumulator that replaced
 * it must produce the SAME dateline-aware arc, so every case here is checked against
 * longitudeExtent() over the same longitudes.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'editor', email: 'e@example.com' } })),
}));

jest.mock('@/lib/db', () => ({
  ...jest.requireActual('@/lib/db'),
  dbQueries: {
    insertCatalogue: jest.fn(),
    bulkInsertEvents: jest.fn(),
    countEventsByCatalogue: jest.fn(),
    updateCatalogueStatus: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    getCatalogueById: jest.fn(),
    deleteCatalogue: jest.fn(),
  },
}));

jest.mock('@/lib/rate-limiter', () => ({
  applyRateLimit: jest.fn(() => ({ success: true, headers: {} })),
  readRateLimiter: {},
  apiRateLimiter: {},
}));

jest.mock('@/lib/pending-uploads', () => ({
  deletePendingUpload: jest.fn(async () => undefined),
  getPendingUploadEvents: jest.fn(async () => null),
  iteratePendingUploadEventBatches: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/catalogues/route';
import { dbQueries } from '@/lib/db';
import { iteratePendingUploadEventBatches } from '@/lib/pending-uploads';
import { longitudeExtent } from '@/lib/geo-bounds-utils';

const mockDb = dbQueries as unknown as Record<string, jest.Mock>;
const mockIterate = iteratePendingUploadEventBatches as unknown as jest.Mock;

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/catalogues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

const eventAt = (longitude: number, i: number) => ({
  time: new Date(Date.UTC(2024, 0, 1 + (i % 28))).toISOString(),
  latitude: -41 + (i % 7) * 0.1,
  longitude,
  magnitude: 3.5,
});

/** Deterministic pseudo-random stream (mulberry32) so the fixtures never drift. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap into [-180, 180) the way real longitude data arrives. */
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

function storedBounds() {
  expect(mockDb.updateCatalogueGeoBounds).toHaveBeenCalledTimes(1);
  const [, , , west, east] = mockDb.updateCatalogueGeoBounds.mock.calls[0] as number[];
  return { west, east };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.countEventsByCatalogue.mockImplementation(async () => {
    const counts = await Promise.all(mockDb.bulkInsertEvents.mock.results.map(result => result.value));
    return counts.reduce((sum, count) => sum + count, 0);
  });
  mockDb.insertCatalogue.mockResolvedValue(undefined);
  mockDb.updateCatalogueStatus.mockResolvedValue(undefined);
  mockDb.updateCatalogueEventCount.mockResolvedValue(undefined);
  mockDb.updateCatalogueGeoBounds.mockResolvedValue(undefined);
  mockDb.deleteCatalogue.mockResolvedValue(undefined);
  mockDb.getCatalogueById.mockResolvedValue({ id: 'cat', name: 'Test' });
  mockDb.bulkInsertEvents.mockImplementation(async (rows: unknown[]) => rows.length);
});

// Longitude sets, each with the arc that lib/geo-bounds-utils computes for it.
const cases: Array<{ name: string; longitudes: number[] }> = [
  {
    // Kermadec/Raoul: 177.9°E .. 177.8°W going east across 180°.
    name: 'a catalogue that crosses the antimeridian',
    longitudes: [177.9, 178.6, 179.4, -179.6, -178.3, -177.8],
  },
  {
    name: 'a mainland New Zealand cluster',
    longitudes: [166.4, 168.1, 171.2, 173.673, 174.8, 176.2, 178.0],
  },
  {
    name: 'a single event',
    longitudes: [173.673],
  },
  {
    name: 'longitudes either side of the prime meridian',
    longitudes: [-5.4, -0.1, 0, 0.2, 4.9],
  },
  {
    // Two clusters whose widest hole is interior, so the tight arc crosses 180°.
    name: 'two clusters separated by a wide interior gap',
    longitudes: [-179.2, -178.4, 160.5, 161.9, 179.9],
  },
];

describe('server2 :: streaming longitude arc matches longitudeExtent', () => {
  describe.each(cases)('$name', ({ longitudes }) => {
    const expected = longitudeExtent(longitudes)!;

    it('inline events path', async () => {
      const response = await post({
        name: 'Arc test',
        events: longitudes.map((lon, i) => eventAt(lon, i)),
      });

      expect(response.status).toBe(201);
      const { west, east } = storedBounds();
      expect(west).toBeCloseTo(expected.west, 10);
      expect(east).toBeCloseTo(expected.east, 10);
    });

    it('streamed pending-upload path', async () => {
      mockIterate.mockImplementation(async function* () {
        // Two batches, to prove the accumulator carries state across them.
        const events = longitudes.map((lon, i) => eventAt(lon, i));
        const half = Math.ceil(events.length / 2);
        yield events.slice(0, half);
        if (events.length > half) yield events.slice(half);
      });

      const response = await post({ name: 'Arc test', pendingUploadIds: ['pu-1'] });

      expect(response.status).toBe(201);
      const { west, east } = storedBounds();
      expect(west).toBeCloseTo(expected.west, 10);
      expect(east).toBeCloseTo(expected.east, 10);
    });
  });

  it('matches over a large scattered catalogue, including across the dateline', async () => {
    // 4000 events: a dense NZ cluster plus an offshore arm reaching over 180°, with the
    // only wide hole in the middle of the Pacific — the arc must cross the antimeridian.
    const next = rng(20240513);
    const longitudes: number[] = [];
    for (let i = 0; i < 3000; i++) longitudes.push(166 + next() * 12); // 166..178
    for (let i = 0; i < 1000; i++) longitudes.push(wrap(178 + next() * 6)); // 178..184 -> -176

    const expected = longitudeExtent(longitudes)!;
    expect(expected.west).toBeGreaterThan(expected.east); // sanity: it does cross 180

    const response = await post({
      name: 'Arc test',
      events: longitudes.map((lon, i) => eventAt(lon, i)),
    });

    expect(response.status).toBe(201);
    const { west, east } = storedBounds();
    expect(west).toBeCloseTo(expected.west, 10);
    expect(east).toBeCloseTo(expected.east, 10);
  });

  it('stores no bounds when no event has a usable longitude', async () => {
    mockIterate.mockImplementation(async function* () {
      yield [];
    });

    const response = await post({ name: 'Arc test', pendingUploadIds: ['pu-1'] });

    expect(response.status).toBe(404); // nothing submitted -> pending upload expired
    expect(mockDb.updateCatalogueGeoBounds).not.toHaveBeenCalled();
  });
});
