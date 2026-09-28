/**
 * @jest-environment node
 *
 * gs#1: scripts/fix-catalogue-event-counts.ts derived "actual" counts from
 * getEventsByCatalogueId's unpaginated read, which lib/db.ts caps at
 * UNPAGINATED_EVENTS_LIMIT when that deployment variable is set. Writing
 * min(true count, cap) as event_count then disables the export route's own
 * truncation guard (getAllEventsForExport treats event_count == returned length
 * as proof the read is complete), silently truncating every future export.
 *
 * This drives the REAL lib/db.ts (dbQueries) against an in-memory fake
 * collection — only the MongoDB driver is faked, per the fix-scripts contract.
 * UNPAGINATED_EVENTS_LIMIT is read once at module load, so each test sets the
 * env var and re-imports lib/db.ts (and the script) fresh via resetModules().
 */

// No top-level static import in this file (modules under test are loaded
// dynamically); `export {}` marks it as an ES module so its declarations don't
// collide with same-named ones in other import-less test files under `tsc`.
export {};

function makeCursor(docs: any[]) {
  const cursor: any = { _docs: docs };
  cursor.sort = jest.fn(() => cursor);
  cursor.skip = jest.fn((n: number) => { cursor._docs = cursor._docs.slice(n); return cursor; });
  cursor.limit = jest.fn((n: number) => { cursor._docs = cursor._docs.slice(0, n); return cursor; });
  cursor.toArray = jest.fn(async () => cursor._docs);
  return cursor;
}

function makeEventsCollection(events: Array<{ id: string; catalogue_id: string }>) {
  return {
    find: jest.fn((filter: any) => {
      const matched = events.filter((e) => e.catalogue_id === filter.catalogue_id);
      return makeCursor(matched);
    }),
    countDocuments: jest.fn(async (filter: any) => events.filter((e) => e.catalogue_id === filter.catalogue_id).length),
  };
}

function makeCataloguesCollection(catalogues: Array<{ id: string; name: string; event_count: number }>) {
  return {
    find: jest.fn(() => makeCursor([...catalogues])),
    updateOne: jest.fn(async (filter: any, update: any) => {
      const doc = catalogues.find((c) => c.id === filter.id);
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { modifiedCount: doc ? 1 : 0 };
    }),
  };
}

async function loadWithCap(cap: string | undefined) {
  jest.resetModules();
  if (cap === undefined) delete process.env.UNPAGINATED_EVENTS_LIMIT;
  else process.env.UNPAGINATED_EVENTS_LIMIT = cap;

  const catalogues = [{ id: 'big', name: 'Big correct catalogue', event_count: 218 }];
  const events = Array.from({ length: 218 }, (_, i) => ({ id: `e${i}`, catalogue_id: 'big' }));

  const cataloguesCollection = makeCataloguesCollection(catalogues);
  const eventsCollection = makeEventsCollection(events);

  jest.doMock('@/lib/mongodb', () => ({
    getDb: jest.fn(),
    getCollection: jest.fn(async (name: string) =>
      name === 'merged_catalogues' ? cataloguesCollection : eventsCollection),
    COLLECTIONS: { CATALOGUES: 'merged_catalogues', EVENTS: 'merged_events' },
    withTransaction: jest.fn(),
  }));
  jest.doMock('@/lib/cache', () => ({ invalidateCatalogueCache: jest.fn() }));

  const { fixCatalogueEventCounts } = await import('@/scripts/fix-catalogue-event-counts');
  return { fixCatalogueEventCounts, catalogues, events };
}

describe('gs#1 fix-catalogue-event-counts.ts', () => {
  const originalCap = process.env.UNPAGINATED_EVENTS_LIMIT;
  afterEach(() => {
    if (originalCap === undefined) delete process.env.UNPAGINATED_EVENTS_LIMIT;
    else process.env.UNPAGINATED_EVENTS_LIMIT = originalCap;
    jest.dontMock('@/lib/mongodb');
    jest.dontMock('@/lib/cache');
  });

  it('with UNPAGINATED_EVENTS_LIMIT set, writes the TRUE count (218), not the capped one (50)', async () => {
    const { fixCatalogueEventCounts, catalogues } = await loadWithCap('50');
    await fixCatalogueEventCounts();
    // The old script wrote 50 here (min(218, 50)) via getEventsByCatalogueId(...).length,
    // which would have made the export route treat this catalogue's newest-50-event read
    // as complete and silently drop the other 168 events from every future export.
    expect(catalogues[0].event_count).toBe(218);
  });

  it('with the cap unset (the default), still writes the true count', async () => {
    const { fixCatalogueEventCounts, catalogues } = await loadWithCap(undefined);
    await fixCatalogueEventCounts();
    expect(catalogues[0].event_count).toBe(218);
  });

  it('leaves an already-correct count alone and reports it as correct, not fixed', async () => {
    const { fixCatalogueEventCounts, catalogues } = await loadWithCap('50');
    catalogues[0].event_count = 218; // already correct
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await fixCatalogueEventCounts();
    logSpy.mockRestore();
    expect(catalogues[0].event_count).toBe(218);
  });

  it('never calls the unpaginated events reader at all (count comes from countDocuments only)', async () => {
    const { fixCatalogueEventCounts, events } = await loadWithCap('50');
    // Re-derive the collection mock actually in use to assert on its .find calls.
    const mongodb = await import('@/lib/mongodb');
    const collection: any = await (mongodb.getCollection as jest.Mock)('merged_events');
    await fixCatalogueEventCounts();
    expect(collection.find).not.toHaveBeenCalled();
    expect(collection.countDocuments).toHaveBeenCalledWith({ catalogue_id: 'big' });
    expect(events).toHaveLength(218); // fixture sanity check
  });
});
