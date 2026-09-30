/** @jest-environment node */

/**
 * What the merge preview sends its duplicate-group map (map redesign S6):
 *   - catalogue colours from the Okabe–Ito palette the maps use, so the group card's dots
 *     and the map's catalogue colours are the same CVD-safe set;
 *   - for an averaged / median group, the computed epicentre the merge publishes (no single
 *     report is selected), so the map can draw it and measure each report from it.
 */
jest.mock('@/lib/db', () => ({
  dbQueries: {
    getEventsByCatalogueIdCursor: jest.fn(),
    getCatalogueById: jest.fn(),
  },
}));
// The built-in authority table, without a settings read (there is no database here).
jest.mock('@/lib/merge-authority', () => {
  const actual = jest.requireActual('@/lib/merge-authority');
  return { ...actual, loadMergeAuthority: async () => actual.DEFAULT_MERGE_AUTHORITY };
});

import { mergeEventGroup, medianEpicentre, performMergeWithGroups, previewMerge } from '@/lib/merge';
import { dbQueries } from '@/lib/db';
import { OKABE_ITO } from '@/lib/map-style';

const db = dbQueries as unknown as Record<string, jest.Mock>;

const report = (id: string, extra: Record<string, unknown>): any => ({
  id, source: id, catalogueId: `cat-${id}`, time: '2020-01-01T00:00:00.000Z',
  latitude: -41, longitude: 174, depth: 12, magnitude: 4.0, magnitude_type: 'ML', ...extra,
});
const a = report('a', { latitude: -41.0, longitude: 174.0 });
const b = report('b', { latitude: -41.02, longitude: 174.03, time: '2020-01-01T00:00:01.000Z' });
const c = report('c', { latitude: -41.05, longitude: 174.01, time: '2020-01-01T00:00:03.000Z' });
const config = (mergeStrategy: string): any => ({ timeThreshold: 60, distanceThreshold: 50, mergeStrategy, priority: 'quality' });

describe('computedEpicentre on preview groups', () => {
  it('is the median epicentre and time of a median group, which selects no report', () => {
    const [group] = performMergeWithGroups([a, b, c], config('median'));
    expect(group.selectedEventIndex).toBe(-1);
    expect(group.computedEpicentre).toEqual(medianEpicentre([a, b, c]));
  });

  it('is the averaged solution the merge publishes for an averaged group', () => {
    const [group] = performMergeWithGroups([a, b, c], config('average'));
    const published = mergeEventGroup([a, b, c], config('average'));
    expect(group.selectedEventIndex).toBe(-1);
    expect(group.computedEpicentre).toEqual({ latitude: published.latitude, longitude: published.longitude, time: published.time });
  });

  it('is null when a report is published as it stands', () => {
    const groups = performMergeWithGroups([a, b, c, report('lone', { time: '2021-06-01T00:00:00.000Z' })], config('quality'));
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.selectedEventIndex).toBeGreaterThanOrEqual(0);
      expect(group.computedEpicentre).toBeNull();
    }
  });
});

describe('previewMerge', () => {
  const rows: Record<string, any[]> = {
    'cat-1': [{ id: 'x1', catalogue_id: 'cat-1', time: '2020-01-01T00:00:00.000Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4, magnitude_type: 'ML', source_events: '[]' }],
    'cat-2': [{ id: 'x2', catalogue_id: 'cat-2', time: '2020-01-01T00:00:01.000Z', latitude: -41.01, longitude: 174.01, depth: 11, magnitude: 4.1, magnitude_type: 'ML', source_events: '[]' }],
    'cat-3': [{ id: 'x3', catalogue_id: 'cat-3', time: '2020-01-01T00:00:02.000Z', latitude: -41.02, longitude: 174.02, depth: 12, magnitude: 4.2, magnitude_type: 'ML', source_events: '[]' }],
  };
  const sources: any[] = ['cat-1', 'cat-2', 'cat-3'].map((id, i) => ({ id, name: `Catalogue ${i + 1}`, source: `Agency ${i + 1}` }));

  beforeEach(() => {
    jest.clearAllMocks();
    db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
      data: rows[id] ?? [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
    }));
    db.getCatalogueById.mockImplementation(async (id: string) => ({ id, status: 'complete' }));
  });

  it('colours the catalogues with Okabe–Ito in source order', async () => {
    const preview = await previewMerge(sources, config('quality'));
    expect(preview.catalogueColors).toEqual({ 'cat-1': OKABE_ITO[0], 'cat-2': OKABE_ITO[1], 'cat-3': OKABE_ITO[2] });
  });

  it('sends the computed epicentre of an averaged group, and null otherwise', async () => {
    const averaged = await previewMerge(sources, config('average'));
    expect(averaged.duplicateGroups).toHaveLength(1);
    expect(averaged.duplicateGroups[0].computedEpicentre).toEqual({
      latitude: expect.any(Number), longitude: expect.any(Number), time: expect.any(String),
    });
    const selected = await previewMerge(sources, config('quality'));
    expect(selected.duplicateGroups[0].computedEpicentre).toBeNull();
  });
});
