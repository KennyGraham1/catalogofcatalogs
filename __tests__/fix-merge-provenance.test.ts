/** @jest-environment node */

/**
 * Contract C2 (merged-event provenance), finding #132 (which member was published) and
 * C16 (confidence_level travels with its origin), through the real mergeCatalogues path with
 * only the database boundary stubbed.
 *
 * Every merged row carries merge_strategy, merge_parameters (the effective config as a JSON
 * string), source_catalogue_ids (distinct, in source_events order), source_events with
 * `selected: true` on the member whose solution (time and epicentre) was published — none for
 * an averaged epicentre — and quality_score / quality_grade computed from the PUBLISHED row.
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

import { mergeCatalogues } from '@/lib/merge';
import { dbQueries } from '@/lib/db';
import { metricsFromEvent, scoreQualityMetrics, scoreToGrade } from '@/lib/quality-scoring';

const db = dbQueries as unknown as Record<string, jest.Mock>;

const geonetRows = [
  {
    id: 'g1', catalogue_id: 'cat-gn', source_id: '2024p000001', time: '2024-01-01T00:00:00.000Z',
    latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 4.1, magnitude_type: 'ML',
    horizontal_uncertainty: 2, max_horizontal_uncertainty: 2.5, min_horizontal_uncertainty: 1.5,
    azimuth_max_horizontal_uncertainty: 40, confidence_level: 68,
    used_station_count: 40, azimuthal_gap: 50, standard_error: 0.3, evaluation_status: 'reviewed',
    source_events: '[]',
  },
  {
    id: 'g2', catalogue_id: 'cat-gn', source_id: '2024p000999', time: '2024-03-01T00:00:00.000Z',
    latitude: -38.7, longitude: 176.1, depth: 5, magnitude: 3.0, magnitude_type: 'ML', source_events: '[]',
  },
];
const iscRows = [
  {
    id: 'i1', catalogue_id: 'cat-isc', source_id: '600001', time: '2024-01-01T00:00:01.000Z',
    latitude: -41.32, longitude: 174.82, depth: 25, magnitude: 4.0, magnitude_type: 'mb',
    used_station_count: 12, azimuthal_gap: 150, evaluation_status: 'preliminary', source_events: '[]',
  },
];
const rowsOf: Record<string, any[]> = { 'cat-gn': geonetRows, 'cat-isc': iscRows };

const sources: any[] = [
  { id: 'cat-gn', name: 'GeoNet', events: 2, source: 'GeoNet' },
  { id: 'cat-isc', name: 'ISC', events: 1, source: 'ISC' },
];

beforeEach(() => {
  jest.clearAllMocks();
  db.transaction.mockImplementation(async (fn: any) => fn({ id: 'session' }));
  db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
    data: rowsOf[id] ?? [],
    pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
  }));
  db.getCatalogueById.mockImplementation(async (id: string) => ({ id, status: 'complete' }));
  db.bulkInsertEvents.mockImplementation(async (rows: any[]) => rows.length);
});

async function savedRows(config: Record<string, unknown>) {
  await mergeCatalogues('Merged', sources, { timeThreshold: 60, distanceThreshold: 10, ...config } as any, undefined, false, { createdBy: 'user-1' });
  return db.bulkInsertEvents.mock.calls[0][0] as any[];
}

describe('C2 provenance on every merged row', () => {
  it('records the strategy, the effective configuration and the contributing catalogues', async () => {
    const rows = await savedRows({ mergeStrategy: 'quality', priority: 'quality' });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.merge_strategy).toBe('quality');
      expect(JSON.parse(row.merge_parameters)).toMatchObject({
        mergeStrategy: 'quality',
        timeThresholdSeconds: 60,
        distanceThresholdKm: 10,
        priority: 'quality',
        adaptiveWindows: true,
      });
    }
    const merged = rows.find(r => JSON.parse(r.source_events).length === 2)!;
    const single = rows.find(r => JSON.parse(r.source_events).length === 1)!;
    expect(merged.source_catalogue_ids).toEqual(['cat-gn', 'cat-isc']);
    expect(single.source_catalogue_ids).toEqual(['cat-gn']);
  });

  it('marks the member whose solution was published, and only that one (#132)', async () => {
    const rows = await savedRows({ mergeStrategy: 'quality', priority: 'quality' });
    for (const row of rows) {
      const members = JSON.parse(row.source_events);
      const selected = members.filter((m: any) => m.selected === true);
      expect(selected).toHaveLength(1);
      // The flag names the report whose time and epicentre the row carries.
      expect([selected[0].originalData.time, selected[0].originalData.latitude, selected[0].originalData.longitude])
        .toEqual([row.time, row.latitude, row.longitude]);
    }
  });

  it('marks no member of an averaged epicentre, and the lone report of a singleton', async () => {
    const rows = await savedRows({ mergeStrategy: 'average', priority: 'newest' });
    const merged = rows.find(r => JSON.parse(r.source_events).length === 2)!;
    const single = rows.find(r => JSON.parse(r.source_events).length === 1)!;
    expect(JSON.parse(merged.source_events).some((m: any) => m.selected)).toBe(false);
    expect(JSON.parse(single.source_events)[0].selected).toBe(true);
    expect(merged.merge_strategy).toBe('average');
  });

  it('records a Custom Order ranking in the parameters when one decided the merge', async () => {
    const rows = await savedRows({ mergeStrategy: 'priority', priority: 'custom', priorityOrder: ['cat-isc', 'cat-gn'] });
    expect(JSON.parse(rows[0].merge_parameters).priorityOrder).toEqual(['cat-isc', 'cat-gn']);
    // ...and the ranking decided it: ISC's solution is published for the duplicate.
    const merged = rows.find(r => JSON.parse(r.source_events).length === 2)!;
    expect(merged.source_id).toBe('ISC:600001');
  });

  it('scores the published row with the platform quality index (C1)', async () => {
    for (const config of [{ mergeStrategy: 'quality', priority: 'quality' }, { mergeStrategy: 'average', priority: 'newest' }]) {
      jest.clearAllMocks();
      db.transaction.mockImplementation(async (fn: any) => fn({ id: 'session' }));
      db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
        data: rowsOf[id] ?? [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
      }));
      db.bulkInsertEvents.mockImplementation(async (rows: any[]) => rows.length);
      const rows = await savedRows(config);
      for (const row of rows) {
        const expected = scoreQualityMetrics(metricsFromEvent(row)).overall;
        expect(row.quality_score).toBe(expected);
        expect(row.quality_grade).toBe(scoreToGrade(expected));
      }
    }
  });

  it('records the session user as the creator through the trusted insertCatalogue option', async () => {
    await savedRows({ mergeStrategy: 'quality', priority: 'quality' });
    expect(db.insertCatalogue).toHaveBeenCalledTimes(1);
    expect(db.insertCatalogue.mock.calls[0][8]).toEqual({ createdBy: 'user-1' });
  });
});

describe('C16 confidence_level travels with the origin uncertainty it qualifies', () => {
  it('keeps the published origin\'s ellipse confidence', async () => {
    const rows = await savedRows({ mergeStrategy: 'priority', priority: 'geonet' });
    const merged = rows.find(r => JSON.parse(r.source_events).length === 2)!;
    expect([merged.max_horizontal_uncertainty, merged.confidence_level]).toEqual([2.5, 68]);
  });

  it('drops it with the ellipse when the epicentre is averaged', async () => {
    const rows = await savedRows({ mergeStrategy: 'average', priority: 'newest' });
    const merged = rows.find(r => JSON.parse(r.source_events).length === 2)!;
    expect([merged.max_horizontal_uncertainty, merged.confidence_level]).toEqual([null, null]);
  });

  it('is not borrowed from another agency when the published origin has none', async () => {
    const rows = await savedRows({ mergeStrategy: 'priority', priority: 'isc' });
    const merged = rows.find(r => JSON.parse(r.source_events).length === 2)!;
    expect(merged.latitude).toBe(-41.32);
    expect(merged.confidence_level).toBeNull();
  });
});
