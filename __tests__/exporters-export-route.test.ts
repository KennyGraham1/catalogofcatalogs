/**
 * @jest-environment node
 *
 * Regression tests for GET /api/catalogues/[id]/export.
 *
 * The default jsdom environment has no Request/Response, so this suite runs under node.
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

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { getCollection } from '@/lib/mongodb';
import { CSV_EVENT_HEADERS } from '@/lib/exporters';

const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockToArray = jest.fn();
const mockCountDocuments = jest.fn();

function makeEvent(i: number) {
  return {
    id: `evt-${i}`,
    catalogue_id: 'cat-123',
    time: new Date(Date.UTC(2000, 0, 1) + i * 60_000).toISOString(),
    latitude: -41.5,
    longitude: 174.0,
    depth: 12.5,
    magnitude: 3.2,
    source_events: '[]',
    created_at: '2024-01-01T00:00:00Z',
  };
}

async function exportCatalogue(query: string) {
  const { GET } = await import('@/app/api/catalogues/[id]/export/route');
  const request = new NextRequest(`http://localhost:3000/api/catalogues/cat-123/export?${query}`);
  return GET(request, { params: Promise.resolve({ id: 'cat-123' }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockToArray.mockResolvedValue([]);
  mockFind.mockReturnValue({ sort: jest.fn().mockReturnValue({ toArray: mockToArray }) });
  (getCollection as jest.Mock).mockResolvedValue({
    findOne: mockFindOne,
    find: mockFind,
    countDocuments: mockCountDocuments,
  });
  (getServerSession as jest.Mock).mockResolvedValue({
    user: { id: 'viewer-123', email: 'viewer@example.com', role: 'viewer' },
  });
});

describe('CSV export is plain RFC 4180 by default', () => {
  beforeEach(() => {
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 2 });
    mockToArray.mockResolvedValue([makeEvent(0), makeEvent(1)]);
  });

  it('starts with the header record, not a "#" comment prologue', async () => {
    const response = await exportCatalogue('format=csv');
    expect(response.status).toBe(200);

    const lines = (await response.text()).split('\n');
    expect(lines[0]).toBe(CSV_EVENT_HEADERS.join(','));
    expect(lines).toHaveLength(3); // header + 2 events
  });

  it('points at the metadata resource with a Link header instead', async () => {
    const response = await exportCatalogue('format=csv');
    expect(response.headers.get('Link')).toBe(
      '</api/catalogues/cat-123>; rel="describedby"; type="application/json"'
    );
  });

  it('restores the comment prologue on ?metadata=comments', async () => {
    const response = await exportCatalogue('format=csv&metadata=comments');
    const lines = (await response.text()).split('\n');

    expect(lines[0]).toBe('# Catalogue: Export Test');
    expect(lines).toContain('# Event Count: 2');
    expect(lines).toContain(CSV_EVENT_HEADERS.join(','));
  });
});

describe('export streams every format', () => {
  beforeEach(() => {
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Export Test', event_count: 2 });
    mockToArray.mockResolvedValue([makeEvent(0), makeEvent(1)]);
  });

  it('emits a complete GeoJSON FeatureCollection', async () => {
    const response = await exportCatalogue('format=geojson');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('geo+json');

    const body = await response.json();
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toHaveLength(2);
    expect(body.metadata.count).toBe(2);
  });

  it('emits a complete JSON document', async () => {
    const body = await (await exportCatalogue('format=json')).json();
    expect(body.events).toHaveLength(2);
    expect(body.metadata.eventCount).toBe(2);
  });

  it('emits a complete KML document', async () => {
    const text = await (await exportCatalogue('format=kml')).text();
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(text.trimEnd().endsWith('</kml>')).toBe(true);
    expect((text.match(/<Placemark>/g) || []).length).toBe(2);
  });

  it('derives the time period from the events when the catalogue declares none', async () => {
    const body = await (await exportCatalogue('format=json')).json();
    // makeEvent(i) is 2000-01-01T00:00:00Z + i minutes.
    expect(body.metadata.timePeriod.start).toBe('2000-01-01T00:00:00.000Z');
    expect(body.metadata.timePeriod.end).toBe('2000-01-01T00:01:00.000Z');
  });
});

describe('export survives a catalogue larger than the argument-spread limit', () => {
  // Math.min(...times) pushes one argument per event onto the call stack. Measured on this
  // Node (v20): 100,000 arguments succeed, 131,072 throw RangeError. The old export route
  // spread the whole event array, so any catalogue past that point returned HTTP 500.
  const EVENT_COUNT = 140_000;

  it('returns 200, not 500, for 140,000 events', async () => {
    const events = Array.from({ length: EVENT_COUNT }, (_, i) => makeEvent(i));
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Big', event_count: EVENT_COUNT });
    mockToArray.mockResolvedValue(events);

    // Sanity check that this input really would break the spread form.
    expect(() => Math.min(...events.map((_, i) => i))).toThrow(RangeError);

    const response = await exportCatalogue('format=csv');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('csv');
  }, 60_000);
});

describe('empty catalogue', () => {
  it('exports a header-only CSV', async () => {
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Empty', event_count: 0 });
    mockToArray.mockResolvedValue([]);

    const response = await exportCatalogue('format=csv');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CSV_EVENT_HEADERS.join(','));
  });

  it('exports an empty but valid FeatureCollection', async () => {
    mockFindOne.mockResolvedValue({ id: 'cat-123', name: 'Empty', event_count: 0 });
    mockToArray.mockResolvedValue([]);

    const body = await (await exportCatalogue('format=geojson')).json();
    expect(body.features).toEqual([]);
  });
});
