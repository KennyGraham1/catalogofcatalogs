/** @jest-environment node */

/**
 * Findings #64 / #129: merge inputs were paged with skip/offset over newest-first order, so
 * an event inserted into a source catalogue while the merge was reading it (e.g. a GeoNet
 * import) shifted every later page: the last rows of a page were read twice and the new rows
 * never. Inputs are now read with the (time, id) keyset cursor, which resumes strictly after
 * the last row returned.
 *
 * The real lib/db cursor read and the real lib/merge loader run against an in-memory
 * collection with MongoDB's semantics (equality, the keyset $or, sort, skip, limit).
 */

jest.mock('@/lib/mongodb', () => ({ getDb: jest.fn(), getCollection: jest.fn(), COLLECTIONS: { EVENTS: 'events', CATALOGUES: 'catalogues' }, withTransaction: jest.fn() }));

function memoryCollection(rows: any[], onFind?: (findCount: number) => void) {
  let finds = 0;
  const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
  const fieldMatches = (value: any, condition: any) =>
    condition && typeof condition === 'object'
      ? ('$lt' in condition ? value < condition.$lt : true) && ('$gt' in condition ? value > condition.$gt : true)
      : value === condition;
  const matches = (doc: any, query: any): boolean =>
    Object.entries(query).every(([key, condition]) =>
      key === '$or' ? (condition as any[]).some(clause => matches(doc, clause)) : fieldMatches(doc[key], condition)
    );
  return {
    countDocuments: async (query: any) => rows.filter(r => matches(r, query)).length,
    findOne: async () => null,
    find: (query: any) => {
      finds++;
      onFind?.(finds);
      let docs = rows.filter(r => matches(r, query));
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
        toArray: async () => docs.map(d => ({ ...d })),
      };
      return cursor;
    },
  };
}

const row = (id: string, catalogue: string, minute: number) => ({
  id, catalogue_id: catalogue, time: new Date(Date.UTC(2024, 0, 1, 0, minute)).toISOString(),
  latitude: -41, longitude: 174, depth: 10, magnitude: 3, source_events: '[]',
});

describe('#64 / #129 merge inputs are read with a stable keyset cursor', () => {
  beforeEach(() => jest.resetModules());

  it('reads every stored row exactly once while newer rows are inserted between pages', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`s${String(i).padStart(2, '0')}`, 'S', i));
    const existing = rows.map(r => r.id);
    const { getCollection } = require('@/lib/mongodb');
    // After the first page has been served, a GeoNet import adds three newer events.
    getCollection.mockResolvedValue(memoryCollection(rows, (finds) => {
      if (finds === 2) rows.push(row('new1', 'S', 100), row('new2', 'S', 101), row('new3', 'S', 102));
    }));
    const { loadCompleteCatalogueEvents } = require('@/lib/merge');

    const loaded: any[] = await loadCompleteCatalogueEvents('S', 3);
    const ids = loaded.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length); // nothing read twice
    expect(ids.filter(id => existing.includes(id)).sort()).toEqual(existing); // nothing skipped
  });

  it('gives the preview the right input count for a source larger than one page', async () => {
    // One page of 10 000 plus five rows; five newer rows arrive after page 1. Offset paging
    // read rows 9 995-9 999 twice (10 010 inputs) and never the new ones.
    const rows = Array.from({ length: 10_005 }, (_, i) => ({
      ...row(`r${i}`, 'S', 0), time: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
    }));
    const other = [row('t0', 'T', 0)];
    const all = [...rows, ...other];
    const { getCollection } = require('@/lib/mongodb');
    let served = 0;
    getCollection.mockResolvedValue(memoryCollection(all, () => {
      served++;
      if (served === 2) {
        for (let k = 0; k < 5; k++) {
          all.push({ ...row(`late${k}`, 'S', 0), time: new Date(Date.UTC(2031, 0, 1) + k * 1000).toISOString() });
        }
      }
    }));
    const { previewMerge } = require('@/lib/merge');
    const preview = await previewMerge(
      [{ id: 'S', name: 'S', events: 10_005, source: 'S' }, { id: 'T', name: 'T', events: 1, source: 'T' }],
      { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' }
    );
    expect(preview.statistics.totalEventsBefore).toBe(10_006);
    const ids = preview.duplicateGroups.flatMap((g: any) => g.events.map((e: any) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
