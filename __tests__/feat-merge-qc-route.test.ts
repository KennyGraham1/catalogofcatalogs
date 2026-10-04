/**
 * @jest-environment node
 *
 * GET /api/catalogues/[id]/merge-qc: the QC summary kept with a merged catalogue, as JSON or
 * (format=csv) its listed groups as a CSV download, behind the same viewer check and
 * catalogue visibility as the other catalogue reads. Auth and the data layer are mocked;
 * the route and lib/merge-qc are the real code.
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(),
  requireEditor: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  dbQueries: { getCatalogueById: jest.fn(), getMergeQcSummary: jest.fn() },
}));

import { requireViewer } from '@/lib/auth/middleware';
import { dbQueries } from '@/lib/db';
import { QC_CSV_COLUMNS, type MergeQcSummary } from '@/lib/merge-qc';
import { GET } from '@/app/api/catalogues/[id]/merge-qc/route';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const viewer = { session: {}, user: { id: 'user-viewer', email: 'v@example.org', role: 'viewer' } };

const SUMMARY: MergeQcSummary = {
  version: 1,
  generatedAt: '2026-10-04T00:00:00.000Z',
  generatedBy: 'Earthquake Catalogue Platform 0.1.0',
  config: { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' },
  sourceCatalogues: [{ id: 'cat-gn', name: 'GeoNet' }, { id: 'cat-isc', name: 'ISC' }],
  totals: {
    entriesBefore: 3, eventsAfter: 2, matchedGroups: 1, entriesCombined: 1, flaggedGroups: 1,
    keptApartEntries: 0, splits: 0, heldForReview: 1, supersededEntries: 0,
  },
  perCatalogue: [
    { id: 'cat-gn', name: 'GeoNet', entries: 2, matched: 1, unique: 1, published: 1, superseded: 0 },
    { id: 'cat-isc', name: 'ISC', entries: 1, matched: 1, unique: 0, published: 0, superseded: 0 },
  ],
  pairwise: [],
  windowUse: { nearTimeLimit: 0, nearDistanceLimit: 0, matchedPairs: 1 },
  listedGroups: [{
    id: 'evt-1',
    kinds: ['flagged', 'held'],
    reasons: ['Large depth range: 40.0 km (threshold: 30 km)'],
    publishedIndex: 0,
    splitKey: null,
    entries: [
      { catalogueId: 'cat-gn', catalogueName: 'GeoNet', sourceId: '2024p1', time: '2024-01-01T00:00:00.000Z', latitude: -41.3, longitude: 174.8, depth: 5, magnitude: 3.5, magnitudeType: 'ML', qualityScore: 88 },
      { catalogueId: 'cat-isc', catalogueName: 'ISC', sourceId: '600001', time: '2024-01-01T00:00:02.000Z', latitude: -41.31, longitude: 174.81, depth: 45, magnitude: 3.6, magnitudeType: 'mb', qualityScore: null },
    ],
  }],
  listedGroupsTotal: 1,
};

const get = (query = '', id = 'cat-m') =>
  GET(new NextRequest(`http://localhost/api/catalogues/${id}/merge-qc${query ? `?${query}` : ''}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  (requireViewer as jest.Mock).mockResolvedValue(viewer);
  db.getCatalogueById.mockImplementation(async (id: string) =>
    id === 'missing' ? undefined : { id, name: 'NZ Merged', status: 'complete', version: '1.2.0' }
  );
  db.getMergeQcSummary.mockImplementation(async (id: string) =>
    id === 'cat-m' ? { catalogue_id: id, created_at: '2026-10-04T00:00:01.000Z', summary: SUMMARY } : null
  );
});

it('returns the stored summary as JSON', async () => {
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toMatch(/application\/json/);
  expect(await response.json()).toEqual(SUMMARY);
  expect(db.getMergeQcSummary).toHaveBeenCalledWith('cat-m');
});

it('returns the listed groups as a CSV download, one row per entry', async () => {
  const response = await get('format=csv');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="nz_merged_v1\.2\.0_\d{8}_\d{6}_merge_qc\.csv"/);
  expect(response.headers.get('x-qc-listed-groups')).toBe('1');
  expect(response.headers.get('x-qc-listed-groups-total')).toBe('1');
  const lines = (await response.text()).trimEnd().split('\n');
  expect(lines).toEqual([
    QC_CSV_COLUMNS.join(','),
    'evt-1,flagged; held,Large depth range: 40.0 km (threshold: 30 km),yes,GeoNet,2024p1,2024-01-01T00:00:00.000Z,-41.3,174.8,5,3.5,ML,88',
    'evt-1,flagged; held,Large depth range: 40.0 km (threshold: 30 km),no,ISC,600001,2024-01-01T00:00:02.000Z,-41.31,174.81,45,3.6,mb,',
  ]);
});

it('is a 404 with MERGE_QC_NOT_FOUND for a catalogue without a summary (not a merge)', async () => {
  const response = await get('', 'cat-imported');
  expect(response.status).toBe(404);
  const body = await response.json();
  expect(body.code).toBe('MERGE_QC_NOT_FOUND');
  expect(body.error).toMatch(/no merge quality-control summary/);
  expect(/report/i.test(body.error)).toBe(false);
  const csv = await get('format=csv', 'cat-imported');
  expect(csv.status).toBe(404);
});

it('is a 404 with NOT_FOUND when the catalogue does not exist (or is being deleted)', async () => {
  const response = await get('', 'missing');
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('NOT_FOUND');
  expect(db.getMergeQcSummary).not.toHaveBeenCalled();
});

it('rejects an unknown format', async () => {
  const response = await get('format=xml');
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe('VALIDATION_ERROR');
});

it('requires a viewer session, before reading anything', async () => {
  (requireViewer as jest.Mock).mockResolvedValue(NextResponse.json({ error: 'Authentication required' }, { status: 401 }));
  expect((await get()).status).toBe(401);
  (requireViewer as jest.Mock).mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
  expect((await get('format=csv')).status).toBe(403);
  expect(db.getCatalogueById).not.toHaveBeenCalled();
  expect(db.getMergeQcSummary).not.toHaveBeenCalled();
});

it('masks an unexpected failure', async () => {
  db.getMergeQcSummary.mockRejectedValueOnce(new Error('driver detail'));
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const response = await get();
  spy.mockRestore();
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body).toEqual({ error: 'Failed to load the merge quality-control summary', code: 'MERGE_QC_FAILED' });
});
