/** @jest-environment node */

/**
 * The merge QC summary is kept with the merge (lib/merge.ts mergeCatalogues): computed from
 * the grouping the merge writes, inserted with the transaction's session after the rows, and
 * returned by POST /api/merge for saved and export-only merges alike. The rows themselves
 * are unchanged: they are compared byte for byte with the per-group algorithm the persist
 * path ran before (mergeEventGroup, then the hold columns). The database boundary is
 * stubbed; lib/merge and the route run for real.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(async () => ({ user: { id: 'editor-1', email: 'editor@example.org', role: 'editor' } })),
}));
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));
jest.mock('@/lib/merge-authority', () => {
  const actual = jest.requireActual('@/lib/merge-authority');
  return { ...actual, loadMergeAuthority: async () => actual.DEFAULT_MERGE_AUTHORITY };
});
jest.mock('@/lib/db', () => ({
  dbQueries: {
    transaction: jest.fn(),
    insertCatalogue: jest.fn(),
    getEventsByCatalogueIdCursor: jest.fn(),
    getCatalogueById: jest.fn(),
    bulkInsertEvents: jest.fn(),
    insertMergeQcSummary: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueStatus: jest.fn(),
  },
}));

import {
  OPTIONAL_DB_FIELDS,
  assessMatchGroup,
  buildMergedEventFields,
  catalogueAgencyOf,
  groupMatchingEvents,
  mergeCatalogues,
  mergeEventGroup,
} from '@/lib/merge';
import { dbQueries } from '@/lib/db';
import { POST } from '@/app/api/merge/route';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const SESSION = { id: 'session' };

// a ~ b ~ c fall in one window but span 0.7 magnitude units: the cluster fails the gate,
// {a, b} is salvaged and c kept apart (one split). e ~ f is an ordinary pair; d is alone.
const rows: Record<string, any[]> = {
  'cat-gn': [
    { id: 'a', catalogue_id: 'cat-gn', source_id: '2024p1', time: '2024-01-01T00:00:00.000Z', latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 3.5, magnitude_type: 'ML', used_station_count: 40, azimuthal_gap: 50, quality_score: 88, source_events: '[]' },
    { id: 'd', catalogue_id: 'cat-gn', source_id: '2024p9', time: '2024-03-01T00:00:00.000Z', latitude: -38.7, longitude: 176.1, depth: 5, magnitude: 3.0, magnitude_type: 'ML', source_events: '[]' },
    { id: 'e', catalogue_id: 'cat-gn', source_id: '2024p5', time: '2024-02-01T00:00:00.000Z', latitude: -40.0, longitude: 175.0, depth: 12, depth_type: 'from location', magnitude: 4.0, magnitude_type: 'ML', source_events: '[]' },
  ],
  'cat-isc': [
    { id: 'b', catalogue_id: 'cat-isc', source_id: '600001', time: '2024-01-01T00:00:02.000Z', latitude: -41.31, longitude: 174.81, depth: 22, magnitude: 3.8, magnitude_type: 'ML', used_station_count: 12, azimuthal_gap: 150, source_events: '[]' },
    { id: 'f', catalogue_id: 'cat-isc', source_id: '600005', time: '2024-02-01T00:00:03.000Z', latitude: -40.05, longitude: 175.0, depth: 15, depth_type: 'operator assigned', magnitude: 4.2, magnitude_type: 'ML', source_events: '[]' },
  ],
  'cat-other': [
    { id: 'c', catalogue_id: 'cat-other', source_id: 'x1', time: '2024-01-01T00:00:04.000Z', latitude: -41.32, longitude: 174.82, depth: 25, magnitude: 4.2, magnitude_type: 'ML', source_events: '[]' },
  ],
};
const sources: any[] = [
  { id: 'cat-gn', name: 'GeoNet', events: 3, source: 'GeoNet' },
  { id: 'cat-isc', name: 'ISC', events: 2, source: 'ISC' },
  { id: 'cat-other', name: 'Other', events: 1, source: 'Other' },
];
const base = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };

beforeEach(() => {
  jest.clearAllMocks();
  db.transaction.mockImplementation(async (fn: any) => fn(SESSION));
  db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
    data: rows[id] ?? [],
    pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
  }));
  db.getCatalogueById.mockImplementation(async (id: string) => ({ id, status: 'complete' }));
  db.bulkInsertEvents.mockImplementation(async (saved: any[]) => saved.length);
  db.insertMergeQcSummary.mockResolvedValue(undefined);
});

/** The rows the persist path wrote before the QC refactor: per group, mergeEventGroup, then the hold columns. */
function expectedRows(config: Record<string, any>) {
  const events: any[] = [];
  for (const source of sources) {
    const agency = catalogueAgencyOf(source, { id: source.id, status: 'complete' } as any);
    for (const row of rows[source.id]) {
      events.push({ ...row, source: source.source, catalogueId: source.id, _catalogueAgency: agency });
    }
  }
  return groupMatchingEvents(events, config as any).map(group => {
    const merged: any = mergeEventGroup(group.events, config as any);
    if (config.onConflict === 'hold') {
      const assessment = assessMatchGroup(group, config as any);
      if (assessment.suspicious || assessment.separated) {
        merged.review_status = 'pending';
        merged.review_reasons = assessment.warnings.slice(0, 50).map(r => (r.length > 500 ? `${r.slice(0, 499)}…` : r));
      }
    }
    return buildMergedEventFields(merged, OPTIONAL_DB_FIELDS);
  });
}

const withoutIds = (row: Record<string, unknown>) => {
  const { id: _id, catalogue_id: _catalogueId, ...rest } = row;
  return rest;
};

describe('a saved merge keeps its QC summary', () => {
  it.each([
    ['resolve', {}],
    ['hold', { onConflict: 'hold' }],
  ])('writes the same rows as before (%s)', async (_label, extra) => {
    const config = { ...base, ...extra };
    await mergeCatalogues('Merged', sources, config as any, undefined, false, { createdBy: 'user-1' });
    const saved = db.bulkInsertEvents.mock.calls[0][0] as any[];
    expect(JSON.stringify(saved.map(withoutIds))).toBe(JSON.stringify(expectedRows(config).map(withoutIds)));
  });

  it('inserts the summary in the transaction, after the rows, and returns it', async () => {
    const result: any = await mergeCatalogues('Merged', sources, { ...base, onConflict: 'hold' } as any, undefined, false, { createdBy: 'user-1' });
    expect(db.insertMergeQcSummary).toHaveBeenCalledTimes(1);
    const [catalogueId, summary, session] = db.insertMergeQcSummary.mock.calls[0];
    expect(catalogueId).toBe(result.catalogueId);
    expect(session).toBe(SESSION);
    expect(summary).toBe(result.qc);
    // Rows first, then the summary, then the catalogue is released.
    const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
    expect(order(db.bulkInsertEvents)).toBeLessThan(order(db.insertMergeQcSummary));
    expect(order(db.insertMergeQcSummary)).toBeLessThan(order(db.updateCatalogueStatus));
  });

  it('describes the grouping the rows were written from, its listed groups by merged event id', async () => {
    const result: any = await mergeCatalogues('Merged', sources, { ...base, onConflict: 'hold' } as any, undefined, false);
    const saved = db.bulkInsertEvents.mock.calls[0][0] as any[];
    const qc = result.qc;

    expect(qc.version).toBe(1);
    expect(qc.config).toEqual({ ...base, onConflict: 'hold' });
    expect(qc.sourceCatalogues).toEqual([
      { id: 'cat-gn', name: 'GeoNet' }, { id: 'cat-isc', name: 'ISC' }, { id: 'cat-other', name: 'Other' },
    ]);
    expect(qc.totals).toEqual({
      entriesBefore: 6,
      eventsAfter: saved.length,
      matchedGroups: 2,
      entriesCombined: 6 - saved.length,
      flaggedGroups: 1,
      keptApartEntries: 1,
      splits: 1,
      heldForReview: 2,
      supersededEntries: 0,
    });
    expect(saved).toHaveLength(4);

    // The held rows are exactly the listed groups, by id.
    const pending = saved.filter(row => row.review_status === 'pending').map(row => row.id).sort();
    expect(qc.listedGroups.map((g: any) => g.id).sort()).toEqual(pending);
    expect(qc.listedGroupsTotal).toBe(2);
    const [salvaged, lone] = qc.listedGroups;
    expect(salvaged.kinds).toEqual(['flagged', 'held']);
    expect(lone.kinds).toEqual(['kept-apart', 'held']);
    expect(salvaged.splitKey).toBe('split-1');
    expect(lone.splitKey).toBe('split-1');
    expect(salvaged.entries.map((e: any) => [e.catalogueName, e.sourceId, e.qualityScore])).toEqual([
      ['GeoNet', '2024p1', 88], ['ISC', '600001', null],
    ]);
    // The published entry's id is the merged row's (source-qualified) id.
    const publishedRow = saved.find(row => row.id === salvaged.id);
    expect(publishedRow.source_id).toBe(`GeoNet:${salvaged.entries[salvaged.publishedIndex].sourceId}`);

    // GeoNet-ISC: the salvaged pair and e ~ f. f's depth is fixed, so only one depth pair.
    const gnIsc = qc.pairwise[0];
    expect(gnIsc.pairs).toBe(2);
    expect(gnIsc.originTime).toMatchObject({ n: 2, median: 2.5 });
    expect(gnIsc.depth).toEqual({ n: 1, median: 2, robustSigma: 0, p05: 2, p95: 2 });
    expect(qc.windowUse.matchedPairs).toBe(2);
    expect(qc.perCatalogue.map((c: any) => [c.id, c.entries, c.matched, c.unique])).toEqual([
      ['cat-gn', 3, 2, 1], ['cat-isc', 2, 2, 0], ['cat-other', 1, 0, 1],
    ]);
  });

  it('fails the merge when the summary cannot be stored (the transaction then rolls back)', async () => {
    db.insertMergeQcSummary.mockRejectedValueOnce(new Error('write failed'));
    await expect(mergeCatalogues('Merged', sources, base as any, undefined, false)).rejects.toThrow('write failed');
    expect(db.updateCatalogueStatus).not.toHaveBeenCalled();
  });

  it('stores no summary when the rows could not all be saved', async () => {
    db.bulkInsertEvents.mockResolvedValueOnce(1);
    await expect(mergeCatalogues('Merged', sources, base as any, undefined, false)).rejects.toThrow(/rolled back/);
    expect(db.insertMergeQcSummary).not.toHaveBeenCalled();
  });

  it('an export-only merge returns the summary and stores nothing', async () => {
    const result: any = await mergeCatalogues('Merged', sources, base as any, undefined, true);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insertMergeQcSummary).not.toHaveBeenCalled();
    expect(result.qc.totals.eventsAfter).toBe(result.events.length);
    expect(result.qc.listedGroups.map((g: any) => g.id).every((id: string) => result.events.some((e: any) => e.id === id))).toBe(true);
  });
});

describe('POST /api/merge returns the summary', () => {
  const post = (body: Record<string, unknown>) =>
    POST(new NextRequest('http://localhost/api/merge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
  const body = (exportOnly: boolean) => ({ name: 'Merged', sourceCatalogues: sources, config: base, exportOnly });

  it.each([false, true])('exportOnly %s', async (exportOnly) => {
    const response = await post(body(exportOnly));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.qc).toMatchObject({ version: 1, totals: { entriesBefore: 6 } });
    expect(json.qc.listedGroupsTotal).toBe(2);
    expect(db.insertMergeQcSummary).toHaveBeenCalledTimes(exportOnly ? 0 : 1);
  });
});
