/**
 * @jest-environment node
 *
 * Region search with the national 'New Zealand (All)' box, end to end through
 * GET /api/catalogues/search/region and dbQueries.getCataloguesByRegion. The box
 * crosses 180 (west edge 165 E, east edge 175 W), which the route and the query layer
 * accept: the Mongo filter bounds latitude only, and longitude overlap is decided by
 * the antimeridian-aware boundsOverlap. MongoDB is replaced by an in-memory collection
 * that evaluates the emitted filter.
 */
import { NextRequest } from 'next/server';

type Doc = Record<string, any>;
let catalogueDocs: Doc[] = [];

/** Evaluate the subset of the Mongo query language the region query emits. */
const matches = (doc: Doc, filter: Doc) => Object.entries(filter).every(([field, condition]) => {
  const value = doc[field];
  if (condition === null || typeof condition !== 'object') return value === condition;
  return Object.entries(condition).every(([op, operand]) => {
    if (op === '$ne') return value !== operand && !(operand === null && value === undefined);
    if (op === '$lte') return value != null && value <= (operand as number);
    if (op === '$gte') return value != null && value >= (operand as number);
    throw new Error(`operator ${op} not simulated`);
  });
});

jest.mock('@/lib/mongodb', () => ({
  getDb: jest.fn(),
  COLLECTIONS: { CATALOGUES: 'catalogues', EVENTS: 'events' },
  withTransaction: jest.fn(),
  getCollection: jest.fn(async () => ({
    find: (filter: Doc) => {
      const found = catalogueDocs.filter((doc) => matches(doc, filter));
      const cursor = { sort: () => cursor, toArray: async () => found };
      return cursor;
    },
  })),
}));
jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(async () => ({ session: {}, user: { id: 'viewer', role: 'viewer' } })),
}));

import { GET } from '@/app/api/catalogues/search/region/route';
import { NZ_NATIONAL_BOUNDS } from '@/lib/geo-bounds-utils';

const catalogue = (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number): Doc => ({
  id, name: id, min_latitude: minLat, max_latitude: maxLat, min_longitude: minLon, max_longitude: maxLon,
  created_at: '2026-01-01T00:00:00Z',
});

beforeEach(() => {
  catalogueDocs = [
    catalogue('canterbury', -44.5, -42.5, 170.5, 173.5),
    catalogue('kermadec-2021', -30.2, -29.0, -177.8, -176.5),
    catalogue('chatham-rise', -44.3, -43.5, -177.0, -176.2),
    catalogue('east-cape-east-of-179', -37.8, -37.2, 179.3, 179.8),
    catalogue('east-cape-straddling-180', -37.8, -37.2, 179.49, -179.8),
    catalogue('campbell-plateau', -52.8, -52.3, 168.8, 169.5),
    catalogue('japan', 30, 45, 130, 145),
    catalogue('tonga', -21.5, -15, -176, -173),
  ];
});

const search = async (bounds: typeof NZ_NATIONAL_BOUNDS) => {
  const params = new URLSearchParams({
    minLat: String(bounds.minLatitude), maxLat: String(bounds.maxLatitude),
    minLon: String(bounds.minLongitude), maxLon: String(bounds.maxLongitude),
  });
  const response = await GET(new NextRequest(`http://localhost/api/catalogues/search/region?${params}`));
  expect(response.status).toBe(200);
  const body = await response.json();
  return body.catalogues.map((c: Doc) => c.id).sort();
};

it('finds every New Zealand catalogue, including those wholly east of 179 E, and nothing abroad', async () => {
  expect(NZ_NATIONAL_BOUNDS.minLongitude).toBeGreaterThan(NZ_NATIONAL_BOUNDS.maxLongitude);
  expect(await search(NZ_NATIONAL_BOUNDS)).toEqual([
    'campbell-plateau', 'canterbury', 'chatham-rise', 'east-cape-east-of-179',
    'east-cape-straddling-180', 'kermadec-2021',
  ]);
});

it('the former 47.5-34 S, 166-179 E preset missed every catalogue wholly offshore', async () => {
  // Kept as the record of what the preset used to return through the same path.
  expect(await search({ minLatitude: -47.5, maxLatitude: -34, minLongitude: 166, maxLongitude: 179 })).toEqual(['canterbury']);
});
