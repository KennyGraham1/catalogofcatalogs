/** @jest-environment node */

/**
 * Hold flagged groups for review (contract M4), through the real mergeCatalogues and
 * previewMerge paths with only the database boundary stubbed. One predicate,
 * assessMatchGroup, decides what is flagged for both, so the preview's heldForReviewCount
 * equals the number of rows written with review_status 'pending'. Without onConflict
 * 'hold' every row is written with review_status null, exactly as before.
 */

jest.mock('@/lib/db', () => ({
  dbQueries: {
    transaction: jest.fn(),
    insertCatalogue: jest.fn(),
    getEventsByCatalogueIdCursor: jest.fn(),
    getCatalogueById: jest.fn(),
    bulkInsertEvents: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueStatus: jest.fn(),
  },
}));

import { mergeCatalogues, previewMerge, assessMatchGroup, groupMatchingEvents, buildMergedEventFields, mergeEventGroup, OPTIONAL_DB_FIELDS } from '@/lib/merge';
import { dbQueries } from '@/lib/db';

const db = dbQueries as unknown as Record<string, jest.Mock>;

// A (GeoNet 3.5) ~ B (ISC 3.8) ~ C (Other 4.2) all fall inside one window, but the three
// span 0.7 magnitude units against a 0.5 tier: the cluster fails the gate and is split into
// the salvaged pair {A, B} and the lone C, both flagged with the gate's reason (C was matched,
// then separated: a reviewer must see it). D is an unrelated singleton, never flagged.
const rows: Record<string, any[]> = {
  'cat-gn': [
    { id: 'a', catalogue_id: 'cat-gn', source_id: '2024p1', time: '2024-01-01T00:00:00.000Z', latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 3.5, magnitude_type: 'ML', used_station_count: 40, azimuthal_gap: 50, source_events: '[]' },
    { id: 'd', catalogue_id: 'cat-gn', source_id: '2024p9', time: '2024-03-01T00:00:00.000Z', latitude: -38.7, longitude: 176.1, depth: 5, magnitude: 3.0, magnitude_type: 'ML', source_events: '[]' },
  ],
  'cat-isc': [
    { id: 'b', catalogue_id: 'cat-isc', source_id: '600001', time: '2024-01-01T00:00:02.000Z', latitude: -41.31, longitude: 174.81, depth: 22, magnitude: 3.8, magnitude_type: 'ML', used_station_count: 12, azimuthal_gap: 150, source_events: '[]' },
  ],
  'cat-other': [
    { id: 'c', catalogue_id: 'cat-other', source_id: 'x1', time: '2024-01-01T00:00:04.000Z', latitude: -41.32, longitude: 174.82, depth: 25, magnitude: 4.2, magnitude_type: 'ML', source_events: '[]' },
  ],
};
const sources: any[] = [
  { id: 'cat-gn', name: 'GeoNet', events: 2, source: 'GeoNet' },
  { id: 'cat-isc', name: 'ISC', events: 1, source: 'ISC' },
  { id: 'cat-other', name: 'Other', events: 1, source: 'Other' },
];
const base = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };

beforeEach(() => {
  jest.clearAllMocks();
  db.transaction.mockImplementation(async (fn: any) => fn({ id: 'session' }));
  db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
    data: rows[id] ?? [],
    pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
  }));
  db.getCatalogueById.mockResolvedValue(undefined);
  db.bulkInsertEvents.mockImplementation(async (saved: any[]) => saved.length);
});

async function merge(config: Record<string, unknown>) {
  const result = await mergeCatalogues('Merged', sources, { ...base, ...config } as any, undefined, false, { createdBy: 'user-1' });
  return { result, saved: db.bulkInsertEvents.mock.calls[0][0] as any[] };
}

describe("onConflict 'hold'", () => {
  it('writes the flagged group pending with the preview warnings, every other row null', async () => {
    const { result, saved } = await merge({ onConflict: 'hold' });
    expect(saved).toHaveLength(3);
    const held = saved.filter(r => r.review_status === 'pending');
    expect(held).toHaveLength(2);
    const members = (row: any) => JSON.parse(row.source_events).map((s: any) => s.originalData.id);
    const pair = held.find(r => members(r).length === 2)!;
    const lone = held.find(r => members(r).length === 1)!;
    expect(members(pair)).toEqual(['a', 'b']);
    expect(pair.review_reasons).toEqual([expect.stringMatching(/^Salvaged from a larger matched cluster.*Reason: Large magnitude range: 0\.70 units/)]);
    expect(members(lone)).toEqual(['c']);
    expect(lone.review_reasons).toEqual([expect.stringMatching(/^Matched with another report but separated.*Reason: Large magnitude range/)]);
    // A provisional solution: the strategy still published coordinates.
    expect([pair.latitude, pair.longitude, pair.magnitude]).toEqual([-41.3, 174.8, 3.5]);
    const d = saved.find(r => members(r)[0] === 'd')!;
    expect([d.review_status, d.review_reasons]).toEqual([null, null]);
    expect(result.heldForReviewCount).toBe(2);
    expect(JSON.parse(pair.merge_parameters).onConflict).toBe('hold');
  });

  it('the export-only path reports the held count too', async () => {
    const result: any = await mergeCatalogues('Merged', sources, { ...base, onConflict: 'hold' } as any, undefined, true);
    expect(result.heldForReviewCount).toBe(2);
    expect(result.events.filter((e: any) => e.review_status === 'pending')).toHaveLength(2);
  });

  it('the preview flags the same group and counts what the merge writes', async () => {
    const preview = await previewMerge(sources, { ...base, onConflict: 'hold' } as any);
    const held = preview.duplicateGroups.filter(g => g.heldForReview);
    expect(held.map(g => g.events.map(e => e.id))).toEqual([['a', 'b'], ['c']]);
    expect(preview.statistics.heldForReviewCount).toBe(2);
    expect(preview.statistics.supersededReportsCount).toBe(0);
    for (const group of preview.duplicateGroups) expect(group.supersededEventIndexes).toEqual([]);

    // The reasons stored are the reasons the preview showed, group by group.
    const { saved } = await merge({ onConflict: 'hold' });
    for (const group of held) {
      const ids = group.events.map(e => e.id);
      const row = saved.find(r => JSON.stringify(JSON.parse(r.source_events).map((s: any) => s.originalData.id)) === JSON.stringify(ids))!;
      expect(row.review_reasons).toEqual(group.validationWarnings);
    }
  });
});

describe("onConflict 'resolve' / omitted", () => {
  it('writes every row with review_status null and holds nothing', async () => {
    for (const config of [{}, { onConflict: 'resolve' }]) {
      jest.clearAllMocks();
      db.transaction.mockImplementation(async (fn: any) => fn({ id: 'session' }));
      db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
        data: rows[id] ?? [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
      }));
      db.getCatalogueById.mockResolvedValue(undefined);
      db.bulkInsertEvents.mockImplementation(async (saved: any[]) => saved.length);
      const { result, saved } = await merge(config);
      expect(saved.map(r => r.review_status)).toEqual([null, null, null]);
      expect(result.heldForReviewCount).toBe(0);
    }
    const preview = await previewMerge(sources, base as any);
    expect(preview.duplicateGroups.some(g => g.heldForReview)).toBe(false);
    expect(preview.statistics.heldForReviewCount).toBe(0);
    // Still flagged: holding is a choice, flagging is not. The salvaged pair is a suspicious
    // match; the report the split left alone is counted apart, as separated.
    expect(preview.statistics.suspiciousGroupsCount).toBe(1);
    expect(preview.statistics.separatedReportsCount).toBe(1);
    expect(preview.duplicateGroups.filter(g => g.separated).map(g => g.events.map(e => e.id))).toEqual([['c']]);
  });
});

describe('assessMatchGroup and the review columns', () => {
  const ev = (id: string, magnitude: number, seconds: number): any => ({
    id, catalogueId: `cat-${id}`, source: id, time: `2024-01-01T00:00:0${seconds}.000Z`,
    latitude: -41.3, longitude: 174.8, depth: 20, magnitude, magnitude_type: 'ML',
  });

  it('flags a salvaged group and reports its reasons; a clean pair is not flagged', () => {
    const groups = groupMatchingEvents([ev('a', 3.5, 0), ev('b', 3.8, 2), ev('c', 4.2, 4)], base as any);
    const pair = groups.find(g => g.events.length === 2)!;
    const verdict = assessMatchGroup(pair, base as any);
    expect(verdict.suspicious).toBe(true);
    expect(verdict.warnings).toEqual([expect.stringContaining('Salvaged')]);
    // The report the split left on its own is flagged too, with the gate's reason.
    const lone = groups.find(g => g.events.length === 1)!;
    expect(assessMatchGroup(lone, base as any)).toEqual({
      suspicious: false,
      separated: true,
      warnings: [expect.stringMatching(/^Matched with another report but separated.*Large magnitude range/)],
    });

    const clean = groupMatchingEvents([ev('a', 3.5, 0), ev('b', 3.8, 2)], base as any);
    expect(assessMatchGroup(clean[0], base as any)).toEqual({ suspicious: false, separated: false, warnings: [] });
  });

  it('a re-merged row does not inherit the review columns of its source catalogue', () => {
    const stale = { ...ev('a', 3.5, 0), review_status: 'pending', review_reasons: ['old'], reviewed_by: 'someone', review_choice: 'keep' };
    const merged: any = mergeEventGroup([stale, ev('b', 3.8, 2)], base as any);
    expect([merged.review_status, merged.review_reasons, merged.reviewed_by, merged.review_choice]).toEqual([null, null, null, null]);
    const alone: any = mergeEventGroup([stale], base as any);
    expect(alone.review_status).toBeNull();
  });

  it('buildMergedEventFields always emits the five review columns', () => {
    const merged = mergeEventGroup([ev('a', 3.5, 0), ev('b', 3.8, 2)], base as any);
    const row: any = buildMergedEventFields(merged, OPTIONAL_DB_FIELDS);
    expect(row).toMatchObject({ review_status: null, review_reasons: null, reviewed_by: null, reviewed_at: null, review_choice: null });
    const held: any = buildMergedEventFields({ ...merged, review_status: 'pending', review_reasons: ['why'] }, OPTIONAL_DB_FIELDS);
    expect(held).toMatchObject({ review_status: 'pending', review_reasons: ['why'], review_choice: null });
  });
});
