/**
 * @jest-environment node
 *
 * GET /api/catalogues/[id]/export: version-specific, filtered and declustered exports
 * (cluster C, contracts C3, C4, C7, C12; paper §Export Formats / §Versioning).
 *
 * Only the external boundaries are replaced: the MongoDB driver (an in-memory collection that
 * evaluates the filter query and honours skip/limit, so paging really runs), NextAuth, the
 * cache and the rate limiter. lib/db.ts, lib/event-filter-params.ts, the exporters and the
 * declustering engine are the real code.
 */

export {};

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  getCollection: jest.fn(),
  withTransaction: jest.fn((callback: (s: unknown) => unknown) => callback({})),
  COLLECTIONS: {
    CATALOGUES: 'merged_catalogues',
    EVENTS: 'merged_events',
  },
}));

jest.mock('@/lib/cache', () => ({
  apiCache: { get: jest.fn(), set: jest.fn(), delete: jest.fn(), clear: jest.fn() },
  catalogueCache: { get: jest.fn(), set: jest.fn(), delete: jest.fn() },
  generateCacheKey: jest.fn((prefix: string, params: unknown) => `${prefix}:${JSON.stringify(params)}`),
  invalidateCacheByPrefix: jest.fn(),
}));

jest.mock('@/lib/rate-limiter', () => ({
  applyRateLimit: jest.fn(() => ({ success: true, headers: {} })),
  readRateLimiter: {},
  apiRateLimiter: {},
}));

import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { getCollection } from '@/lib/mongodb';
import { CSV_EVENT_HEADERS, CSV_DECLUSTER_HEADERS } from '@/lib/exporters';
import { parseWithDelimiter } from '@/lib/delimiter-detector';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

let storedEvents: any[] = [];
const mockFindOne = jest.fn();
const findQueries: Array<Record<string, unknown>> = [];

/** The subset of MongoDB query semantics the export's queries use. */
function matches(doc: any, query: Record<string, unknown>): boolean {
  return Object.keys(query).every(field => {
    const condition = query[field] as any;
    if (condition instanceof RegExp) return condition.test(String(doc[field] ?? ''));
    if (condition && typeof condition === 'object') {
      return (condition.$gte === undefined || (doc[field] != null && doc[field] >= condition.$gte)) &&
        (condition.$lte === undefined || (doc[field] != null && doc[field] <= condition.$lte));
    }
    return doc[field] === condition;
  });
}

/** A cursor over already newest-first documents (the order EVENT_TIME_SORT_DESC produces). */
function cursorOver(docs: any[]) {
  let items = docs.slice();
  const cursor: any = {
    sort: () => cursor,
    project: () => cursor,
    skip: (n: number) => { items = items.slice(n); return cursor; },
    limit: (n: number) => { items = items.slice(0, n); return cursor; },
    toArray: async () => items,
  };
  return cursor;
}

function makeEvent(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `evt-${String(i).padStart(5, '0')}`,
    catalogue_id: 'cat-123',
    time: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
    latitude: -41.5,
    longitude: 174.0,
    depth: 12.5,
    magnitude: 1 + (i % 50) / 10, // 1.0 .. 5.9
    source_events: JSON.stringify([{ source: 'upload', eventId: `u-${i}` }]),
    created_at: '2024-01-01T00:00:00.000Z',
    ...over,
  };
}

/** Store events newest first, as the database returns them. */
function store(events: any[]) {
  storedEvents = events.slice().sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : (a.id < b.id ? 1 : -1)));
}

async function exportCatalogue(query: string) {
  const { GET } = await import('@/app/api/catalogues/[id]/export/route');
  const request = new NextRequest(`http://localhost:3000/api/catalogues/cat-123/export?${query}`);
  return GET(request, { params: Promise.resolve({ id: 'cat-123' }) });
}

function csvRecords(csv: string): Array<Record<string, string>> {
  const { rows } = parseWithDelimiter(csv, ',');
  const header = csv.split('\n')[0].split(',');
  return rows.map(values => Object.fromEntries(header.map((name, i) => [name, values[i] ?? ''])));
}

beforeEach(() => {
  jest.clearAllMocks();
  findQueries.length = 0;
  (getCollection as jest.Mock).mockResolvedValue({
    findOne: mockFindOne,
    find: jest.fn((query: Record<string, unknown>) => {
      findQueries.push(query);
      return cursorOver(storedEvents.filter(doc => matches(doc, query)));
    }),
    countDocuments: jest.fn(async (query: Record<string, unknown>) => storedEvents.filter(doc => matches(doc, query)).length),
  });
  (getServerSession as jest.Mock).mockResolvedValue({
    user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
  });
  store([makeEvent(0), makeEvent(1), makeEvent(2)]);
  mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 3, created_at: '2024-01-01T00:00:00.000Z' });
});

describe('version-specific exports (C3/C12)', () => {
  it('a catalogue stored before versioning exports as 1.0.0, in headers, rows and filename', async () => {
    const response = await exportCatalogue('format=csv');
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(response.headers.get('X-Catalogue-ID')).toBe('cat-123');
    expect(response.headers.get('X-Catalogue-Version')).toBe('1.0.0');
    expect(csvRecords(body).map(r => r.CatalogueVersion)).toEqual(['1.0.0', '1.0.0', '1.0.0']);
    expect(response.headers.get('Content-Disposition')).toContain('_v1.0.0_');
  });

  it('the checksum header is the SHA-256 of the plain CSV body', async () => {
    const response = await exportCatalogue('format=csv');
    const body = await response.text();
    expect(body.split('\n')[0]).toBe(CSV_EVENT_HEADERS.join(','));
    expect(response.headers.get('X-Export-Rows-SHA256')).toBe(sha256(body));
  });

  it('every format of the same selection records the same version, checksum and timestamp', async () => {
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 3, version: '2.1.0', version_updated_at: '2026-09-01T00:00:00.000Z', source_version: 'GeoNet 2024.1' });
    const csv = await exportCatalogue('format=csv');
    const plainChecksum = sha256(await csv.text());

    const json = await exportCatalogue('format=json');
    const jsonBody = await json.json();
    expect(json.headers.get('X-Catalogue-Version')).toBe('2.1.0');
    expect(jsonBody.metadata).toMatchObject({
      catalogueId: 'cat-123',
      version: '2.1.0',
      versionUpdatedAt: '2026-09-01T00:00:00.000Z',
      sourceVersion: 'GeoNet 2024.1',
      checksum: { algorithm: 'SHA-256', value: plainChecksum },
      filter: null,
      declustering: { algorithm: 'none' },
    });
    expect(jsonBody.metadata.generated).toBe(json.headers.get('X-Export-Timestamp'));
    expect(json.headers.get('X-Export-Rows-SHA256')).toBe(plainChecksum);

    const quakeml = await (await exportCatalogue('format=quakeml')).text();
    expect(quakeml).toContain(`Event Rows SHA-256: ${plainChecksum}`);
    expect(quakeml).toContain('<version>2.1.0</version>');
  });

  it('the CSV prologue, when requested, carries the same checksum over the rows below it', async () => {
    const response = await exportCatalogue('format=csv&metadata=comments');
    const lines = (await response.text()).split('\n');
    const checksum = response.headers.get('X-Export-Rows-SHA256');
    expect(lines).toContain(`# Event Rows SHA-256: ${checksum}`);
    expect(lines).toContain('# Version: 1.0.0');
    expect(sha256(lines.slice(lines.indexOf('#') + 1).join('\n'))).toBe(checksum);
  });
});

describe('filtered exports (C4)', () => {
  beforeEach(() => {
    // 12,000 events: more than one page of the export's paged read (5,000 per page).
    store(Array.from({ length: 12_000 }, (_, i) => makeEvent(i)));
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 12_000 });
  });

  it('exports every matching event, across pages, and records the filter', async () => {
    const expected = storedEvents.filter(e => e.magnitude >= 3).length;
    expect(expected).toBeGreaterThan(5_000);

    const response = await exportCatalogue('format=json&minMagnitude=3');
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.events).toHaveLength(expected);
    expect(body.events.every((e: any) => e.magnitude.value >= 3)).toBe(true);
    expect(body.metadata.eventCount).toBe(expected);
    expect(body.metadata.filter).toEqual({ minMagnitude: 3 });
    expect(response.headers.get('X-Export-Filter')).toBe('minMagnitude=3');
    expect(response.headers.get('Content-Disposition')).toContain('_filtered');
    // The database did the filtering: the export asked for magnitude >= 3.
    expect(findQueries.some(q => (q.magnitude as any)?.$gte === 3)).toBe(true);
  }, 60_000);

  it('records "none" when no filter is given', async () => {
    const response = await exportCatalogue('format=csv');
    expect(response.headers.get('X-Export-Filter')).toBe('none');
    expect(csvRecords(await response.text())).toHaveLength(12_000);
  }, 60_000);

  it.each([
    ['minMagnitude=abc', /minMagnitude/],
    ['minMagnitude=5&maxMagnitude=3', /magnitude range/],
    ['startTime=not-a-date', /startTime/],
    ['evaluationStatus=approved', /evaluationStatus/],
  ])('rejects %s with 400', async (query, message) => {
    const response = await exportCatalogue(`format=csv&${query}`);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
  });
});

describe('declustered exports (C7)', () => {
  const t0 = Date.UTC(2021, 2, 4, 13, 27, 0);
  const iso = (ms: number) => new Date(ms).toISOString();

  beforeEach(() => {
    store([
      // An M6.0 mainshock with two aftershocks well inside its window (T(6) ~ 500 d, L(6) ~ 53 km)…
      makeEvent(0, { id: 'main', time: iso(t0), latitude: -41.00, longitude: 174.00, magnitude: 6.0 }),
      makeEvent(1, { id: 'after-1', time: iso(t0 + 3_600_000), latitude: -41.05, longitude: 174.05, magnitude: 3.0 }),
      makeEvent(2, { id: 'after-2', time: iso(t0 + 2 * 86_400_000), latitude: -40.95, longitude: 174.08, magnitude: 3.5 }),
      // …and an event 500 km away the same day, which is independent.
      makeEvent(3, { id: 'far', time: iso(t0 + 86_400_000), latitude: -45.50, longitude: 170.00, magnitude: 3.0 }),
    ]);
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 4 });
  });

  it('tags each event with its cluster and whether it is a mainshock', async () => {
    const response = await exportCatalogue('format=csv&decluster=gardner-knopoff');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Export-Declustering')).toBe('gardner-knopoff');
    const csv = await response.text();
    expect(csv.split('\n')[0]).toBe(CSV_EVENT_HEADERS.concat(CSV_DECLUSTER_HEADERS).join(','));

    const tags = Object.fromEntries(csvRecords(csv).map(r => [r.ID, [r.ClusterID, r.IsMainshock]]));
    expect(tags).toEqual({
      main: ['main', 'true'],
      'after-1': ['main', 'false'],
      'after-2': ['main', 'false'],
      far: ['', 'true'],
    });
  });

  it('records the algorithm, its windows and the counts', async () => {
    const body = await (await exportCatalogue('format=json&decluster=gardner-knopoff')).json();
    const declustering = body.metadata.declustering;
    expect(declustering.algorithm).toBe('gardner-knopoff');
    expect(declustering.summary).toEqual({ eventCount: 4, mainshockCount: 2, dependentCount: 2, clusterCount: 1 });
    const m6 = declustering.parameters.windows.find((w: any) => w.magnitude === 6);
    // Gardner & Knopoff (1974) as tabulated by van Stiphout et al. (2012): M < 6.5 branch.
    expect(m6.timeWindowDays).toBeCloseTo(Math.pow(10, 0.5409 * 6 - 0.547), 2);
    expect(m6.distanceWindowKm).toBeCloseTo(Math.pow(10, 0.1238 * 6 + 0.983), 2);
    expect(body.events.find((e: any) => e.id === 'after-2')).toMatchObject({ clusterId: 'main', isMainshock: false });
  });

  it('rejects an unknown algorithm with 400', async () => {
    const response = await exportCatalogue('format=csv&decluster=reasenberg');
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/decluster/);
  });
});
