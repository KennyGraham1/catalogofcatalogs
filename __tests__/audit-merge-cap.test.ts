/** @jest-environment node */
jest.mock('@/lib/mongodb', () => ({ getDb: jest.fn(), getCollection: jest.fn(), COLLECTIONS: { EVENTS: 'events', CATALOGUES: 'catalogues' }, withTransaction: jest.fn() }));
afterEach(() => { delete process.env.UNPAGINATED_EVENTS_LIMIT; });
it('merges every source event even with the unpaginated API cap enabled', async () => {
  process.env.UNPAGINATED_EVENTS_LIMIT = '2';
  jest.resetModules();
  const { getCollection } = require('@/lib/mongodb');
  const rows = ['a', 'b'].flatMap((cat, c) => Array.from({ length: 3 }, (_, i) => ({
    id: `${cat}${i}`, catalogue_id: cat, time: new Date(Date.UTC(2024, c, 1 + i)).toISOString(), latitude: -41, longitude: 174, depth: 10, magnitude: 4, source_events: '[]',
  })));
  getCollection.mockResolvedValue({ countDocuments: async (query: any) => rows.filter(e => e.catalogue_id === query.catalogue_id).length, find: (query: any) => {
    let docs = rows.filter(e => e.catalogue_id === query.catalogue_id);
    const cursor = { sort: () => cursor, skip: (n: number) => { docs = docs.slice(n); return cursor; }, limit: (n: number) => { docs = docs.slice(0, Math.min(n, 2)); return cursor; }, toArray: async () => docs };
    return cursor;
  } });
  const { mergeCatalogues, previewMerge } = require('@/lib/merge');
  const result = await mergeCatalogues('Capped', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'quality' }, undefined, true);
  expect(rows).toHaveLength(6);
  expect(result.success).toBe(true);
  expect(result.originalEventCount).toBe(6);
  expect(result.events).toHaveLength(6);
  const preview = await previewMerge([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'quality' });
  expect(preview.statistics.totalEventsBefore).toBe(6);
  expect(preview.duplicateGroups.flatMap((g: any) => g.events)).toHaveLength(6);
});
