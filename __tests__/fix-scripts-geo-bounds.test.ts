/**
 * @jest-environment node
 *
 * gs#2: scripts/fix-missing-geo-bounds.ts tested `catalogue.min_latitude !== null`
 * etc. No writer ever stores null bounds — insertCatalogue's metadata allow-list
 * excludes them, so a catalogue without bounds has the keys ABSENT (undefined),
 * and `undefined !== null` is true. The script therefore treated "no bounds" as
 * "already has bounds" and skipped every catalogue it exists to fix.
 *
 * It also used to read events through the unpaginated getEventsByCatalogueId,
 * which lib/db.ts caps at UNPAGINATED_EVENTS_LIMIT when that variable is set —
 * so computed bounds could cover only the newest `cap` events instead of the
 * whole catalogue.
 *
 * This drives the REAL lib/db.ts (dbQueries) and lib/geo-bounds-utils.ts against
 * an in-memory fake collection.
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

function makeEventsCollection(events: Array<{ id: string; catalogue_id: string; latitude: number; longitude: number }>) {
  return {
    find: jest.fn((filter: any, _opts?: any) => {
      const matched = events.filter((e) => e.catalogue_id === filter.catalogue_id);
      return makeCursor(matched);
    }),
    countDocuments: jest.fn(async (filter: any) => events.filter((e) => e.catalogue_id === filter.catalogue_id).length),
  };
}

function makeCataloguesCollection(catalogues: any[]) {
  return {
    find: jest.fn(() => makeCursor([...catalogues])),
    updateOne: jest.fn(async (filter: any, update: any) => {
      const doc = catalogues.find((c) => c.id === filter.id);
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
    }),
  };
}

async function setup(opts: {
  cap?: string;
  catalogue: any;
  events: Array<{ id: string; catalogue_id: string; latitude: number; longitude: number }>;
}) {
  jest.resetModules();
  if (opts.cap === undefined) delete process.env.UNPAGINATED_EVENTS_LIMIT;
  else process.env.UNPAGINATED_EVENTS_LIMIT = opts.cap;

  const catalogues = [opts.catalogue];
  const cataloguesCollection = makeCataloguesCollection(catalogues);
  const eventsCollection = makeEventsCollection(opts.events);

  jest.doMock('@/lib/mongodb', () => ({
    getDb: jest.fn(),
    getCollection: jest.fn(async (name: string) =>
      name === 'merged_catalogues' ? cataloguesCollection : eventsCollection),
    COLLECTIONS: { CATALOGUES: 'merged_catalogues', EVENTS: 'merged_events' },
    withTransaction: jest.fn(),
  }));
  jest.doMock('@/lib/cache', () => ({ invalidateCatalogueCache: jest.fn() }));

  const { fixMissingGeoBounds } = await import('@/scripts/fix-missing-geo-bounds');
  return { fixMissingGeoBounds, catalogues, eventsCollection };
}

describe('gs#2 fix-missing-geo-bounds.ts', () => {
  const originalCap = process.env.UNPAGINATED_EVENTS_LIMIT;
  afterEach(() => {
    if (originalCap === undefined) delete process.env.UNPAGINATED_EVENTS_LIMIT;
    else process.env.UNPAGINATED_EVENTS_LIMIT = originalCap;
    jest.dontMock('@/lib/mongodb');
    jest.dontMock('@/lib/cache');
  });

  it('computes and writes bounds for a catalogue whose bounds are ABSENT (the only state the app produces)', async () => {
    const catalogue = { id: 'kermadec', name: 'Kermadec catalogue', min_latitude: undefined, max_latitude: undefined, min_longitude: undefined, max_longitude: undefined };
    const events = [
      { id: 'e1', catalogue_id: 'kermadec', latitude: -30.0, longitude: 178.5 },
      { id: 'e2', catalogue_id: 'kermadec', latitude: -29.0, longitude: 179.5 },
      { id: 'e3', catalogue_id: 'kermadec', latitude: -31.0, longitude: 179.0 },
    ];
    const { fixMissingGeoBounds, catalogues } = await setup({ catalogue, events });

    await fixMissingGeoBounds();

    // The old `!== null` check treated undefined bounds as "already has bounds"
    // and never called updateCatalogueGeoBounds at all.
    expect(catalogues[0].min_latitude).toBe(-31.0);
    expect(catalogues[0].max_latitude).toBe(-29.0);
    expect(catalogues[0].min_longitude).toBeCloseTo(178.5, 9);
    expect(catalogues[0].max_longitude).toBeCloseTo(179.5, 9);
  });

  it('does not touch a catalogue whose bounds are genuinely present and finite', async () => {
    const catalogue = { id: 'wgtn', name: 'Wellington', min_latitude: -41.5, max_latitude: -41.0, min_longitude: 174.5, max_longitude: 175.0 };
    const { fixMissingGeoBounds, catalogues, eventsCollection } = await setup({
      catalogue,
      events: [{ id: 'e1', catalogue_id: 'wgtn', latitude: -41.2, longitude: 174.8 }],
    });

    await fixMissingGeoBounds();

    expect(catalogues[0]).toEqual({ id: 'wgtn', name: 'Wellington', min_latitude: -41.5, max_latitude: -41.0, min_longitude: 174.5, max_longitude: 175.0 });
    expect(eventsCollection.find).not.toHaveBeenCalled();
  });

  it('reports "no events" and does not write bounds for an empty catalogue', async () => {
    const catalogue = { id: 'empty', name: 'Empty', min_latitude: undefined, max_latitude: undefined, min_longitude: undefined, max_longitude: undefined };
    const { fixMissingGeoBounds, catalogues } = await setup({ catalogue, events: [] });

    await fixMissingGeoBounds();

    expect(catalogues[0].min_latitude).toBeUndefined();
  });

  it('with UNPAGINATED_EVENTS_LIMIT set, bounds still cover ALL events, not just the newest `cap`', async () => {
    // 3 older Kermadec events + 2 newer Wellington-ish events, cap=2. The old
    // unpaginated reader (sorted newest-first) would see only the 2 Wellington
    // events and miss the Kermadec ones entirely.
    const catalogue = { id: 'mixed', name: 'Mixed catalogue', min_latitude: undefined, max_latitude: undefined, min_longitude: undefined, max_longitude: undefined };
    const events = [
      { id: 'old1', catalogue_id: 'mixed', latitude: -30.0, longitude: 178.0 },
      { id: 'old2', catalogue_id: 'mixed', latitude: -29.5, longitude: 178.5 },
      { id: 'old3', catalogue_id: 'mixed', latitude: -31.0, longitude: 179.0 },
      { id: 'new1', catalogue_id: 'mixed', latitude: -41.3, longitude: 174.8 },
      { id: 'new2', catalogue_id: 'mixed', latitude: -41.2, longitude: 174.9 },
    ];
    const { fixMissingGeoBounds, catalogues } = await setup({ cap: '2', catalogue, events });

    await fixMissingGeoBounds();

    // Must span both the Kermadec cluster AND the Wellington cluster, not just
    // the newest 2.
    expect(catalogues[0].min_latitude).toBe(-41.3);
    expect(catalogues[0].max_latitude).toBe(-29.5);
    expect(catalogues[0].min_longitude).toBeCloseTo(174.8, 9);
    expect(catalogues[0].max_longitude).toBeCloseTo(179.0, 9);
  });

  it('treats a non-finite/NaN bound the same as an absent one', async () => {
    const catalogue = { id: 'nanbounds', name: 'NaN bounds', min_latitude: NaN, max_latitude: -41.0, min_longitude: 174.5, max_longitude: 175.0 };
    const { fixMissingGeoBounds, catalogues } = await setup({
      catalogue,
      events: [{ id: 'e1', catalogue_id: 'nanbounds', latitude: -41.2, longitude: 174.8 }],
    });

    await fixMissingGeoBounds();

    expect(catalogues[0].min_latitude).toBe(-41.2);
    expect(catalogues[0].max_latitude).toBe(-41.2);
  });
});
