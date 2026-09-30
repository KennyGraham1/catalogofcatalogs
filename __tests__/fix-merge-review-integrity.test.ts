/** @jest-environment node */

jest.mock('@/lib/db', () => ({
  dbQueries: {
    transaction: jest.fn(async (fn: any) => fn({ id: 'session' })),
    insertCatalogue: jest.fn(),
    getEventsByCatalogueId: jest.fn(),
    getCatalogueById: jest.fn(async (id: string) => ({ id, status: 'complete' })),
    bulkInsertEvents: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueStatus: jest.fn(),
  },
}));
jest.mock('@/lib/mongodb', () => ({ getDb: jest.fn() }));
jest.mock('@/lib/merge-authority', () => ({
  ...jest.requireActual('@/lib/merge-authority'),
  loadMergeAuthority: jest.fn(async () => jest.requireActual('@/lib/merge-authority').DEFAULT_MERGE_AUTHORITY),
}));

import {
  buildMergedEventFields, mergeCatalogues, mergeEventGroup, OPTIONAL_DB_FIELDS,
  previewMerge, rebuildMergedEventForReport,
} from '@/lib/merge';
import { dbQueries } from '@/lib/db';
import type { MergeConfig } from '@/lib/validation';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const config: MergeConfig = {
  timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'custom',
  priorityOrder: ['a', 'b'],
};
const report = (id: string, extra: Record<string, unknown> = {}): any => ({
  id, catalogueId: id, source: id, time: '2024-01-01T00:00:00.000Z',
  latitude: -41, longitude: 174, depth: 10, magnitude: 4, magnitude_type: 'ML', ...extra,
});
const stored = (reports: any[], settings: MergeConfig = config) =>
  buildMergedEventFields(mergeEventGroup(reports, settings), OPTIONAL_DB_FIELDS);

describe('a published measurement keeps only its own metadata', () => {
  const a = report('a');
  // Identical rounded values do not make these independent measurements the same solution.
  const b = report('b', {
    used_station_count: 50, magnitude_uncertainty: 0.1, magnitude_station_count: 40,
    magnitude_method_id: 'method-b', magnitude_evaluation_status: 'reviewed',
    horizontal_uncertainty: 2, min_horizontal_uncertainty: 1,
    max_horizontal_uncertainty: 3, confidence_level: 90,
  });

  it('does not borrow uncertainty or station counts from another report with the same magnitude', () => {
    const row = stored([a, b]);
    expect(row.magnitude).toBe(4);
    for (const field of ['magnitude_uncertainty', 'magnitude_station_count', 'magnitude_method_id', 'magnitude_evaluation_status']) {
      expect({ field, value: row[field] }).toEqual({ field, value: null });
    }
    expect(JSON.parse(row.source_events as string)[1].originalData.magnitude_uncertainty).toBe(0.1);
  });

  it.each(['priority', 'average', 'median'] as const)('%s does not borrow an ellipse at coincident coordinates', (mergeStrategy) => {
    const row = stored([a, b], { ...config, mergeStrategy });
    for (const field of ['horizontal_uncertainty', 'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'confidence_level']) {
      expect({ field, value: row[field] }).toEqual({ field, value: null });
    }
  });

  it('does not combine a chosen report\'s partial ellipse with another report\'s confidence', () => {
    const row = stored([{ ...a, horizontal_uncertainty: 5 }, b]);
    expect(row.horizontal_uncertainty).toBe(5);
    expect(row.confidence_level).toBeNull();
    expect(row.max_horizontal_uncertainty).toBeNull();
  });

  it('keeps a field rule\'s selected magnitude metadata empty when its report supplies none', () => {
    const row = stored([a, b], {
      ...config, priorityOrder: ['b', 'a'],
      fieldRules: { magnitude: { rule: 'catalogue', catalogueId: 'a' } },
    });
    expect(row.magnitude_uncertainty).toBeNull();
    expect(JSON.parse(row.source_events as string).find((s: any) => s.magnitudeSelected).catalogueId).toBe('a');
  });

  it('keeps the preferred magnitude id when type preference chooses a scalar measurement', () => {
    const row = stored([report('a', { magnitude_type: 'Mw', preferred_magnitude_id: 'smi:a/magnitude/1' }), b], {
      ...config, fieldRules: { magnitude: { rule: 'type-preference' } },
    });
    expect(row.preferred_magnitude_id).toBe('smi:a/magnitude/1');
  });

  it('reviewing a report preserves its missing metadata as missing', () => {
    const row = stored([a, b]);
    const rebuilt = rebuildMergedEventForReport(row, 0);
    expect(rebuilt.magnitude_uncertainty).toBeNull();
    expect(rebuilt.horizontal_uncertainty).toBeNull();
  });
});

describe('separate merge groups survive source id collisions', () => {
  const sources = ['a', 'b'].map(id => ({ id, name: 'Shared label', source: 'Shared label', events: 1 }));
  const rows = {
    a: [report('a', { source_id: '123' })],
    b: [report('b', { source_id: '123', magnitude: 7 })],
  };
  const held: MergeConfig = { ...config, onConflict: 'hold' };

  beforeEach(() => {
    jest.clearAllMocks();
    db.getEventsByCatalogueId.mockImplementation(async (id: keyof typeof rows) => rows[id]);
    // Model the database's in-batch source_id deduplication, not just the submitted length.
    db.bulkInsertEvents.mockImplementation(async (events: any[]) => {
      const seen = new Set<string>();
      return events.filter(event => {
        if (event.source_id == null) return true;
        if (seen.has(event.source_id)) return false;
        seen.add(event.source_id);
        return true;
      }).length;
    });
  });

  it('saves every separated report and agrees with the preview and export counts', async () => {
    const preview = await previewMerge(sources, held);
    const exported = await mergeCatalogues('merged', sources, held, undefined, true);
    const saved = await mergeCatalogues('merged', sources, held);
    expect(preview.statistics.totalEventsAfter).toBe(2);
    expect(exported.eventCount).toBe(2);
    expect(saved.eventCount).toBe(2);
    expect(saved.heldForReviewCount).toBe(2);
    const inserted = db.bulkInsertEvents.mock.calls[0][0];
    expect(new Set(inserted.map((e: any) => e.source_id)).size).toBe(2);
    for (const row of inserted) {
      expect(JSON.parse(row.source_events)[0].originalData.source_id).toBe('123');
      expect(row.review_status).toBe('pending');
    }
    for (const row of (exported as any).events) {
      expect(row.source_id).toBe(`merge-row:${row.id}`);
    }
  });

  it('keeps disambiguated identities when each held report is published by a reviewer', async () => {
    await mergeCatalogues('merged', sources, held);
    const inserted = db.bulkInsertEvents.mock.calls[0][0];
    const rebuilt = inserted.map((row: any) => rebuildMergedEventForReport(row, 0));
    expect(new Set(rebuilt.map((row: any) => row.source_id)).size).toBe(2);
    expect(rebuilt.map((row: any) => row.source_id)).toEqual(inserted.map((row: any) => row.source_id));
  });
});

describe('merge sources must exist and be ready to read', () => {
  const sources = ['a', 'b'].map(id => ({ id, name: id, source: id, events: 1 }));
  const exportMerge = () => mergeCatalogues('merged', sources, config, undefined, true);

  beforeEach(() => {
    jest.clearAllMocks();
    db.getCatalogueById.mockImplementation(async (id: string) => ({ id, status: 'complete' }));
    db.getEventsByCatalogueId.mockImplementation(async (id: string) => [report(id)]);
    db.bulkInsertEvents.mockImplementation(async (events: any[]) => events.length);
  });

  it('export rejects a missing catalogue instead of treating it as empty', async () => {
    db.getCatalogueById.mockImplementation(async (id: string) => id === 'b' ? undefined : { id, status: 'complete' });
    db.getEventsByCatalogueId.mockImplementation(async (id: string) => id === 'b' ? [] : [report(id)]);
    await expect(exportMerge()).rejects.toMatchObject({ statusCode: 404, code: 'CATALOGUE_NOT_FOUND' });
    expect(db.bulkInsertEvents).not.toHaveBeenCalled();
  });

  it('export rejects a catalogue still being imported', async () => {
    db.getCatalogueById.mockResolvedValue({ id: 'a', status: 'processing' });
    await expect(exportMerge()).rejects.toMatchObject({ statusCode: 409, code: 'CATALOGUE_NOT_READY' });
    expect(db.getEventsByCatalogueId).not.toHaveBeenCalled();
    expect(db.bulkInsertEvents).not.toHaveBeenCalled();
  });

  it('does not swallow a source metadata read failure and change the authority ranking', async () => {
    const failure = new Error('source lookup unavailable');
    db.getCatalogueById.mockRejectedValue(failure);
    await expect(exportMerge()).rejects.toBe(failure);
  });

  it('allows a catalogue that exists and is genuinely empty', async () => {
    db.getEventsByCatalogueId.mockImplementation(async (id: string) => id === 'b' ? [] : [report(id)]);
    const result = await mergeCatalogues('merged', sources, config, undefined, true);
    expect(result.originalEventCount).toBe(1);
    expect(result.eventCount).toBe(1);
  });
});
