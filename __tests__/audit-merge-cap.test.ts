/** @jest-environment node */
jest.mock('@/lib/mongodb', () => ({ getDb: jest.fn(), getCollection: jest.fn(), COLLECTIONS: { EVENTS: 'events', CATALOGUES: 'catalogues' }, withTransaction: jest.fn() }));
afterEach(() => { delete process.env.UNPAGINATED_EVENTS_LIMIT; });

/**
 * A MongoDB-faithful stand-in for the events collection: equality on catalogue_id, the
 * (time, id) keyset $or the cursor read sends, sort on time/id, skip and limit. (It used to
 * cap every query at two rows whatever limit was asked for, which MongoDB never does; merge
 * input is now read with the keyset cursor rather than the unpaginated call the
 * UNPAGINATED_EVENTS_LIMIT cap applies to.)
 */
function collectionOf(rows: any[]) {
  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
  const fieldMatches = (value: any, condition: any) =>
    condition && typeof condition === 'object'
      ? ('$lt' in condition ? value < condition.$lt : true) && ('$gt' in condition ? value > condition.$gt : true)
      : value === condition;
  const matches = (doc: any, query: any): boolean =>
    Object.entries(query).every(([key, condition]) =>
      key === '$or'
        ? (condition as any[]).some(clause => matches(doc, clause))
        : fieldMatches(doc[key], condition)
    );
  return {
    findOne: async (query: any) => ({ id: query.id, status: 'complete' }),
    countDocuments: async (query: any) => rows.filter(e => matches(e, query)).length,
    find: (query: any) => {
      let docs = rows.filter(e => matches(e, query));
      const cursor = {
        sort: (spec: Record<string, 1 | -1>) => {
          docs = docs.slice().sort((a, b) => {
            for (const [key, dir] of Object.entries(spec)) {
              const c = cmp(a[key], b[key]);
              if (c !== 0) return c * dir;
            }
            return 0;
          });
          return cursor;
        },
        skip: (n: number) => { docs = docs.slice(n); return cursor; },
        limit: (n: number) => { docs = docs.slice(0, n); return cursor; },
        toArray: async () => docs,
      };
      return cursor;
    },
  };
}

it('merges every source event even with the unpaginated API cap enabled', async () => {
  process.env.UNPAGINATED_EVENTS_LIMIT = '2';
  jest.resetModules();
  const { getCollection } = require('@/lib/mongodb');
  const rows = ['a', 'b'].flatMap((cat, c) => Array.from({ length: 3 }, (_, i) => ({
    id: `${cat}${i}`, catalogue_id: cat, time: new Date(Date.UTC(2024, c, 1 + i)).toISOString(), latitude: -41, longitude: 174, depth: 10, magnitude: 4, source_events: '[]',
  })));
  getCollection.mockResolvedValue(collectionOf(rows));
  const { mergeCatalogues, previewMerge } = require('@/lib/merge');
  const { dbQueries } = require('@/lib/db');
  // The cap is real: the unpaginated read the merge used to depend on returns two rows.
  expect(await dbQueries.getEventsByCatalogueId('a')).toHaveLength(2);

  const result = await mergeCatalogues('Capped', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'quality' }, undefined, true);
  expect(rows).toHaveLength(6);
  expect(result.success).toBe(true);
  expect(result.originalEventCount).toBe(6);
  expect(result.events).toHaveLength(6);
  const preview = await previewMerge([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'quality' });
  expect(preview.statistics.totalEventsBefore).toBe(6);
  expect(preview.duplicateGroups.flatMap((g: any) => g.events)).toHaveLength(6);
});
