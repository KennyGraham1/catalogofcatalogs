/**
 * @jest-environment node
 *
 * Stored catalogue statistics (lib/catalogue-statistics.ts, lib/db.ts): the answer of
 * GET /api/catalogues/[id]/statistics is kept in the catalogue_statistics collection
 * under the catalogue's shared cache generation, so it survives a restart and is not
 * recomputed until a write changes the catalogue. A computation that fell behind a write
 * never replaces its successor, the stored copy goes with its catalogue, and the
 * background refresh after writes (lib/catalogue-statistics-refresh.ts) stores it before
 * anyone asks.
 *
 * The real data layer, cache and route run against an in-memory stand-in for MongoDB
 * that implements the filters and updates these paths use, and the unique index on
 * catalogue_statistics.catalogue_id.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// In-memory MongoDB fake
// ---------------------------------------------------------------------------
type Doc = Record<string, any>;

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

function compare(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}
function matchValue(value: unknown, cond: any): boolean {
  if (cond instanceof RegExp) return typeof value === 'string' && cond.test(value);
  if (cond === null) return value === null || value === undefined;
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, operand]) => {
      const c = compare(value, operand);
      switch (op) {
        case '$gte': return c !== null && c >= 0;
        case '$gt': return c !== null && c > 0;
        case '$lte': return c !== null && c <= 0;
        case '$lt': return c !== null && c < 0;
        case '$ne': return !matchValue(value, operand);
        case '$in': return (operand as unknown[]).some((o) => matchValue(value, o));
        case '$nin': return !(operand as unknown[]).some((o) => matchValue(value, o));
        case '$exists': return (value !== undefined) === Boolean(operand);
        case '$type': return operand === 'string' ? typeof value === 'string' : operand === 'number' ? typeof value === 'number' : true;
        case '$not': return !matchValue(value, operand);
        default: throw new Error(`fake mongo: unsupported operator ${op}`);
      }
    });
  }
  return JSON.stringify(value) === JSON.stringify(cond);
}
function matches(doc: Doc, filter: Doc = {}): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return (cond as Doc[]).some((f) => matches(doc, f));
    if (key === '$and') return (cond as Doc[]).every((f) => matches(doc, f));
    return matchValue(doc[key], cond);
  });
}
function project(doc: Doc, projection?: Record<string, 0 | 1>): Doc {
  const { _id, ...rest } = doc;
  if (!projection) return { _id, ...rest };
  const includes = Object.entries(projection).filter(([k, v]) => v === 1 && k !== '_id').map(([k]) => k);
  if (includes.length > 0) {
    const out: Doc = {};
    for (const k of includes) if (k in rest) out[k] = rest[k];
    if (projection._id !== 0) out._id = _id;
    return out;
  }
  const out: Doc = projection._id === 0 ? { ...rest } : { _id, ...rest };
  for (const [k, v] of Object.entries(projection)) if (v === 0) delete out[k];
  return out;
}
function applyUpdate(doc: Doc, update: Doc): void {
  for (const [op, fields] of Object.entries(update)) {
    for (const [k, v] of Object.entries(fields as Doc)) {
      if (op === '$set') doc[k] = clone(v);
      else if (op === '$unset') delete doc[k];
      else if (op === '$inc') doc[k] = (doc[k] ?? 0) + (v as number);
      else if (op === '$max') doc[k] = doc[k] == null || (v as number) > doc[k] ? v : doc[k];
      else throw new Error(`fake mongo: unsupported update ${op}`);
    }
  }
}
function sortDocs(docs: Doc[], spec: Record<string, 1 | -1>): Doc[] {
  const keys = Object.entries(spec);
  return docs.sort((a, b) => {
    for (const [k, dir] of keys) {
      const c = compare(a[k], b[k]) ?? 0;
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}

class FakeCursor {
  constructor(private docs: Doc[], private projection?: Record<string, 0 | 1>) {}
  sort(spec: Record<string, 1 | -1>) { sortDocs(this.docs, spec); return this; }
  skip(n: number) { this.docs = this.docs.slice(n); return this; }
  limit(n: number) { if (n > 0) this.docs = this.docs.slice(0, n); return this; }
  project(p: Record<string, 0 | 1>) { this.projection = p; return this; }
  async toArray() { return this.docs.map((d) => project(clone(d), this.projection)); }
}

const duplicateKey = () => Object.assign(new Error('E11000 duplicate key'), { code: 11000 });

let nextObjectId = 1;
class FakeCollection {
  docs: Doc[] = [];
  /** Test hook: thrown by bulkWrite (the shared cache generation bump). */
  bulkWriteError: Error | null = null;
  constructor(readonly name: string) {}

  private clash(doc: Doc, others: Doc[]): boolean {
    if (this.name === 'merged_events') return others.some((d) => d.id === doc.id);
    // The unique index on catalogue_statistics.catalogue_id (lib/event-indexes.ts).
    if (this.name === 'catalogue_statistics') return others.some((d) => d.catalogue_id === doc.catalogue_id);
    return false;
  }
  async findOne(filter: Doc = {}, options: Doc = {}) {
    let selected = this.docs.filter((d) => matches(d, filter));
    if (options.sort) selected = sortDocs([...selected], options.sort);
    return selected[0] ? project(clone(selected[0]), options.projection) : null;
  }
  find(filter: Doc = {}, options: Doc = {}) {
    return new FakeCursor(this.docs.filter((d) => matches(d, filter)), options.projection);
  }
  async insertOne(doc: Doc) {
    if (this.clash(doc, this.docs)) throw duplicateKey();
    this.docs.push({ _id: nextObjectId++, ...clone(doc) });
    return { acknowledged: true };
  }
  async insertMany(docs: Doc[]) {
    let insertedCount = 0;
    const writeErrors: Array<{ index: number; code: number }> = [];
    docs.forEach((doc, index) => {
      if (this.clash(doc, this.docs)) { writeErrors.push({ index, code: 11000 }); return; }
      this.docs.push({ _id: nextObjectId++, ...clone(doc) });
      insertedCount++;
    });
    if (writeErrors.length) {
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000, writeErrors, result: { insertedCount } });
    }
    return { insertedCount };
  }
  async updateOne(filter: Doc, update: Doc, options: Doc = {}) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (!doc) {
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0 };
      const created: Doc = {};
      for (const [k, v] of Object.entries(filter)) if (!k.startsWith('$') && (v === null || typeof v !== 'object')) created[k] = v;
      applyUpdate(created, update);
      if (this.clash(created, this.docs)) throw duplicateKey();
      this.docs.push({ _id: nextObjectId++, ...created });
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    const before = JSON.stringify(doc);
    applyUpdate(doc, update);
    return { matchedCount: 1, modifiedCount: before === JSON.stringify(doc) ? 0 : 1 };
  }
  async bulkWrite(ops: Doc[]) {
    if (this.bulkWriteError) throw this.bulkWriteError;
    for (const op of ops) await this.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert });
    return { ok: 1 };
  }
  async deleteOne(filter: Doc) {
    const i = this.docs.findIndex((d) => matches(d, filter));
    if (i >= 0) this.docs.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }
  async deleteMany(filter: Doc) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    return { deletedCount: before - this.docs.length };
  }
  async countDocuments(filter: Doc = {}) { return this.docs.filter((d) => matches(d, filter)).length; }
  async distinct(field: string, filter: Doc = {}) {
    return Array.from(new Set(this.docs.filter((d) => matches(d, filter)).map((d) => d[field]).filter((v) => v !== undefined)));
  }
}

const db = new Map<string, FakeCollection>();
const collection = (name: string) => {
  if (!db.has(name)) db.set(name, new FakeCollection(name));
  return db.get(name)!;
};

jest.mock('@/lib/mongodb', () => {
  const actual = jest.requireActual('@/lib/mongodb');
  return {
    COLLECTIONS: actual.COLLECTIONS,
    getCollection: jest.fn(async (name: string) => collection(name)),
    getDb: jest.fn(),
    withTransaction: jest.fn(async (fn: (session: object) => Promise<unknown>) => fn({ fakeSession: true })),
  };
});
jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(async () => ({ user: { id: 'viewer-1', email: 'v@example.test', role: 'viewer' } })),
  requireEditor: jest.fn(),
  requireAdmin: jest.fn(),
}));

import { dbQueries, markCatalogueDataChanged, resolveMergedEventReview, type CatalogueEventStatistics } from '@/lib/db';
import { GET } from '@/app/api/catalogues/[id]/statistics/route';
import { catalogueScope, clearAllCaches, getCacheGenerationParts, statisticsCache } from '@/lib/cache';
import { CATALOGUE_STATISTICS_FORMAT, refreshCatalogueStatistics } from '@/lib/catalogue-statistics';
import {
  configureCatalogueStatisticsRefresh,
  resetCatalogueStatisticsRefresh,
  whenCatalogueStatisticsRefreshIdle,
} from '@/lib/catalogue-statistics-refresh';
import { DATABASE_INDEXES } from '@/lib/event-indexes';
import { COLLECTIONS } from '@/lib/mongodb';

const q = dbQueries!;
const STATS = COLLECTIONS.CATALOGUE_STATISTICS;
const CATALOGUES = COLLECTIONS.CATALOGUES;
const EVENTS = COLLECTIONS.EVENTS;

/** What getCatalogueEventStatistics returns, with `overrides`. */
const aggregate = (overrides: Partial<CatalogueEventStatistics> = {}): CatalogueEventStatistics => ({
  eventCount: 3,
  earliestTime: '2016-11-13T11:02:56.100Z',
  latestTime: '2016-11-14T23:02:56.100Z',
  magnitudeCount: 3,
  minMagnitude: 2.4,
  maxMagnitude: 7.8,
  averageMagnitude: 4.6,
  medianMagnitude: 3.5,
  depthCount: 3,
  minDepth: 5,
  maxDepth: 33,
  averageDepth: 15,
  magnitudeTypes: [{ type: 'Mw', count: 2 }, { type: 'ML', count: 1 }],
  // No event reports a gap or a station count: the response leaves both out.
  averageAzimuthalGap: null,
  averageStationCount: null,
  eventsWithUncertainty: 2,
  eventsWithHorizontalUncertainty: 2,
  eventsWithDepthUncertainty: 1,
  eventsWithFocalMechanism: 1,
  qualityScoreCount: 3,
  averageQualityScore: 61.5,
  qualityGrades: [{ grade: 'B', count: 1 }, { grade: 'C', count: 2 }],
  ...overrides,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

/** Let pending promise chains run (the fake's operations are all promise-based). */
const settle = async (rounds = 20) => { for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r)); };

/** Wait (bounded) until `condition` holds. */
async function until(condition: () => boolean, rounds = 200): Promise<void> {
  for (let i = 0; i < rounds && !condition(); i++) await new Promise((r) => setImmediate(r));
  expect(condition()).toBe(true);
}

const getStatistics = async (id = 'cat-1') => {
  const response = await GET(new NextRequest(`http://localhost/api/catalogues/${id}/statistics`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: await response.json() };
};

const sharedGeneration = async (id = 'cat-1') => (await getCacheGenerationParts(catalogueScope(id)))!.shared!;

const storedDocs = (id = 'cat-1') => collection(STATS).docs.filter((d) => d.catalogue_id === id);

function liveCatalogue(id: string, extra: Doc = {}) {
  collection(CATALOGUES).docs.push({
    id, name: `Catalogue ${id}`, status: 'complete', version: '1.2.0',
    created_at: '2026-01-01T00:00:00.000Z', event_count: 3, ...extra,
  });
}

let aggregation: jest.SpyInstance;

beforeEach(() => {
  db.clear();
  clearAllCaches();
  resetCatalogueStatisticsRefresh();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  aggregation = jest.spyOn(q, 'getCatalogueEventStatistics').mockResolvedValue(aggregate());
});
afterEach(async () => {
  resetCatalogueStatisticsRefresh(); // cancels what is still waiting
  await whenCatalogueStatisticsRefreshIdle(); // and lets what is running finish
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe('the statistics endpoint answers from the stored copy', () => {
  it('stores what it computed, and after a restart answers from it without aggregating', async () => {
    liveCatalogue('cat-1');
    const first = await getStatistics();
    expect(first.status).toBe(200);
    expect(aggregation).toHaveBeenCalledTimes(1);

    const [doc] = storedDocs();
    expect(storedDocs()).toHaveLength(1);
    expect(doc).toMatchObject({
      catalogue_id: 'cat-1',
      generation: await sharedGeneration(),
      version: '1.2.0',
      format: CATALOGUE_STATISTICS_FORMAT,
    });
    expect(doc.computed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(doc.statistics).toEqual(first.body);

    // A restart empties this process's caches and its local generations; the stored
    // copy is keyed by the shared generation alone, so it still counts.
    clearAllCaches();
    const second = await getStatistics();
    expect(aggregation).toHaveBeenCalledTimes(1);
    expect(second.body).toEqual(first.body);
  });

  it('sends exactly the same JSON from the stored copy as from the aggregation, absent members and nulls included', async () => {
    liveCatalogue('cat-1');
    liveCatalogue('cat-empty', { event_count: 0 });
    aggregation.mockImplementation(async (id: string) =>
      id === 'cat-empty'
        ? aggregate({
            eventCount: 0, earliestTime: null, latestTime: null, magnitudeCount: 0, minMagnitude: null,
            maxMagnitude: null, averageMagnitude: null, medianMagnitude: null, depthCount: 0, minDepth: null,
            maxDepth: null, averageDepth: null, magnitudeTypes: [], eventsWithUncertainty: 0,
            eventsWithHorizontalUncertainty: 0, eventsWithDepthUncertainty: 0, eventsWithFocalMechanism: 0,
            qualityScoreCount: 0, averageQualityScore: null, qualityGrades: [],
          })
        : aggregate()
    );
    const store = jest.spyOn(q, 'storeCatalogueStatistics');

    const computed = await getStatistics('cat-1');
    const computedEmpty = await getStatistics('cat-empty');
    clearAllCaches();
    const stored = await getStatistics('cat-1');
    const storedEmpty = await getStatistics('cat-empty');
    expect(aggregation).toHaveBeenCalledTimes(2);

    expect(stored.body).toEqual(computed.body);
    expect(storedEmpty.body).toEqual(computedEmpty.body);
    expect(computed.body).toEqual({
      catalogueId: 'cat-1',
      version: '1.2.0',
      eventCount: 3,
      dateRange: { earliest: '2016-11-13T11:02:56.100Z', latest: '2016-11-14T23:02:56.100Z', spanDays: 2 },
      magnitudeRange: { min: 2.4, max: 7.8, average: 4.6, median: 3.5 },
      depthRange: { min: 5, max: 33, average: 15 },
      magnitudeTypes: [{ type: 'Mw', count: 2 }, { type: 'ML', count: 1 }],
      qualityMetrics: {
        eventsWithUncertainty: 2,
        eventsWithHorizontalUncertainty: 2,
        eventsWithDepthUncertainty: 1,
        eventsWithFocalMechanism: 1,
        eventsWithQualityScore: 3,
        averageQualityScore: 61.5,
        gradeDistribution: [{ grade: 'B', count: 1 }, { grade: 'C', count: 2 }],
      },
    });
    expect(storedEmpty.body).toEqual({
      catalogueId: 'cat-empty', version: '1.2.0', eventCount: 0, dateRange: null,
      magnitudeRange: null, depthRange: null, magnitudeTypes: [], qualityMetrics: null,
    });
    // The member is absent, not null, in both: what is stored is what was sent, so BSON,
    // which writes an undefined member as null, never sees an undefined one.
    expect('averageAzimuthalGap' in stored.body.qualityMetrics).toBe(false);
    const written = store.mock.calls[0][0].statistics;
    expect(Object.keys(written.qualityMetrics!)).not.toContain('averageAzimuthalGap');
    expect(Object.keys(written.qualityMetrics!)).not.toContain('averageStationCount');
  });

  it('recomputes and replaces the stored copy after a write to the catalogue', async () => {
    liveCatalogue('cat-1');
    await getStatistics();
    const before = await sharedGeneration();

    await q.updateCatalogueName('Renamed', 'cat-1');
    aggregation.mockResolvedValue(aggregate({ eventCount: 4 }));
    const after = await getStatistics();

    expect(aggregation).toHaveBeenCalledTimes(2);
    expect(after.body.eventCount).toBe(4);
    expect(storedDocs()).toHaveLength(1);
    expect(storedDocs()[0].generation).toBeGreaterThan(before);
    expect(storedDocs()[0].generation).toBe(await sharedGeneration());
    expect(storedDocs()[0].statistics.eventCount).toBe(4);
  });

  it('recomputes when the stored copy is of another catalogue version or format', async () => {
    liveCatalogue('cat-1');
    await getStatistics();

    clearAllCaches();
    collection(STATS).docs[0].format = CATALOGUE_STATISTICS_FORMAT - 1;
    await getStatistics();
    expect(aggregation).toHaveBeenCalledTimes(2);
    expect(storedDocs()[0].format).toBe(CATALOGUE_STATISTICS_FORMAT);

    // A version change whose generation bump was lost still retires the stored copy.
    clearAllCaches();
    collection(CATALOGUES).docs[0].version = '2.0.0';
    const body = (await getStatistics()).body;
    expect(aggregation).toHaveBeenCalledTimes(3);
    expect(body.version).toBe('2.0.0');
    expect(storedDocs()[0].version).toBe('2.0.0');
  });

  it('computes when the stored copy cannot be read', async () => {
    liveCatalogue('cat-1');
    jest.spyOn(q, 'getStoredCatalogueStatistics').mockRejectedValue(new Error('read failed'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { status, body } = await getStatistics();
    expect(status).toBe(200);
    expect(body.eventCount).toBe(3);
    expect(aggregation).toHaveBeenCalledTimes(1);
  });

  it('runs one aggregation for concurrent requests of the same generation', async () => {
    liveCatalogue('cat-1');
    const gate = deferred<CatalogueEventStatistics>();
    aggregation.mockReturnValue(gate.promise);

    const a = getStatistics();
    const b = getStatistics();
    await until(() => aggregation.mock.calls.length === 1);
    await settle();
    gate.resolve(aggregate());
    const [first, second] = await Promise.all([a, b]);

    expect(aggregation).toHaveBeenCalledTimes(1);
    expect(second.body).toEqual(first.body);
  });
});

// ---------------------------------------------------------------------------
describe('a computation that fell behind a write', () => {
  it('does not replace the answer stored for the newer generation', async () => {
    liveCatalogue('cat-1');
    const slow = deferred<CatalogueEventStatistics>();
    aggregation.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(aggregate({ eventCount: 5 }));

    // A reads generation G and starts its (slow) aggregation...
    const a = getStatistics();
    await until(() => aggregation.mock.calls.length === 1);
    const old = await sharedGeneration();

    // ...a write commits (G+1), and B computes and stores the new answer...
    await markCatalogueDataChanged(['cat-1']);
    const b = await getStatistics();
    expect(b.body.eventCount).toBe(5);
    expect(storedDocs()[0].generation).toBe(old + 1);

    // ...then A finishes with what it read before the write. Its store is refused.
    slow.resolve(aggregate({ eventCount: 3 }));
    await a;
    expect(storedDocs()).toHaveLength(1);
    expect(storedDocs()[0]).toMatchObject({ generation: old + 1, statistics: { eventCount: 5 } });

    clearAllCaches();
    expect((await getStatistics()).body.eventCount).toBe(5);
    expect(aggregation).toHaveBeenCalledTimes(2);
  });

  it('storeCatalogueStatistics keeps a newer generation and replaces the same or an older one', async () => {
    liveCatalogue('cat-1');
    const doc = (generation: number, eventCount: number) => ({
      catalogue_id: 'cat-1', generation, version: '1.2.0', format: CATALOGUE_STATISTICS_FORMAT,
      computed_at: new Date().toISOString(),
      statistics: { eventCount } as any,
    });

    await expect(q.storeCatalogueStatistics(doc(5, 50))).resolves.toBe(true);
    await expect(q.storeCatalogueStatistics(doc(4, 40))).resolves.toBe(false);
    expect(storedDocs()).toEqual([expect.objectContaining({ generation: 5, statistics: { eventCount: 50 } })]);

    await expect(q.storeCatalogueStatistics(doc(5, 51))).resolves.toBe(true);
    await expect(q.storeCatalogueStatistics(doc(7, 70))).resolves.toBe(true);
    expect(storedDocs()).toEqual([expect.objectContaining({ generation: 7, statistics: { eventCount: 70 } })]);
    await expect(q.getStoredCatalogueStatistics('cat-1')).resolves.toMatchObject({ generation: 7 });
    await expect(q.getStoredCatalogueStatistics('cat-2')).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('the stored copy goes with its catalogue', () => {
  it('is deleted with the catalogue', async () => {
    liveCatalogue('cat-1');
    liveCatalogue('cat-2');
    await getStatistics('cat-1');
    await getStatistics('cat-2');
    expect(collection(STATS).docs).toHaveLength(2);

    await expect(q.deleteCatalogue('cat-1')).resolves.toBe(true);
    expect(collection(STATS).docs.map((d) => d.catalogue_id)).toEqual(['cat-2']);
  });

  it('is never stored for a catalogue that is being deleted or is gone', async () => {
    liveCatalogue('cat-d', { status: 'deleting', deleting_at: new Date().toISOString() });
    const doc = {
      catalogue_id: 'cat-d', generation: 1, version: '1.0.0', format: CATALOGUE_STATISTICS_FORMAT,
      computed_at: new Date().toISOString(), statistics: {} as any,
    };
    await expect(q.storeCatalogueStatistics(doc)).resolves.toBe(false);
    await expect(q.storeCatalogueStatistics({ ...doc, catalogue_id: 'never-existed' })).resolves.toBe(false);
    expect(collection(STATS).docs).toHaveLength(0);
  });

  it('is reported, then removed, by the integrity sweep when its catalogue no longer exists', async () => {
    liveCatalogue('live');
    await getStatistics('live');
    collection(STATS).docs.push({ catalogue_id: 'gone', generation: 3, version: '1.0.0', format: 1, statistics: {} });

    const report = await q.sweepOrphans();
    expect(report.orphanedCatalogueIds).toEqual(['gone']);
    expect(collection(STATS).docs).toHaveLength(2); // a dry run by default

    await q.sweepOrphans({ apply: true });
    expect(collection(STATS).docs.map((d) => d.catalogue_id)).toEqual(['live']);
  });

  it('has a unique index on catalogue_id among the indexes database setup creates', () => {
    expect(DATABASE_INDEXES.filter((index) => index.collection === 'catalogue_statistics')).toEqual([
      { collection: 'catalogue_statistics', name: 'catalogue_statistics_catalogue_unique_idx', key: { catalogue_id: 1 }, options: { unique: true } },
    ]);
  });
});

// ---------------------------------------------------------------------------
describe('writes refresh the stored copy in the background', () => {
  const event = (id: string, catalogueId: string, extra: Doc = {}) => ({
    id, catalogue_id: catalogueId, time: '2024-03-01T00:00:00.000Z',
    latitude: -41.2, longitude: 174.8, depth: 12, magnitude: 3.4, source_events: '[]', ...extra,
  });

  it('after an upload completes, stores the statistics so the first open does not aggregate', async () => {
    configureCatalogueStatisticsRefresh({ enabled: true, debounceMs: 20 });

    // The writes of an upload: the catalogue, its batches, its count, then 'complete'.
    await q.insertCatalogue('cat-u', 'Upload', '[]', '{}', 0, 'processing');
    await q.bulkInsertEvents([event('u1', 'cat-u'), event('u2', 'cat-u')] as any);
    await q.bulkInsertEvents([event('u3', 'cat-u')] as any);
    await q.updateCatalogueEventCount('cat-u', 3);
    await q.updateCatalogueStatus('complete', 'cat-u');
    expect(aggregation).not.toHaveBeenCalled(); // nothing ran in the writes themselves

    await whenCatalogueStatisticsRefreshIdle();
    expect(aggregation).toHaveBeenCalledTimes(1); // the burst was debounced into one
    expect(storedDocs('cat-u')).toHaveLength(1);
    expect(storedDocs('cat-u')[0].generation).toBe(await sharedGeneration('cat-u'));

    clearAllCaches();
    const { body } = await getStatistics('cat-u');
    expect(body.eventCount).toBe(3);
    expect(aggregation).toHaveBeenCalledTimes(1);
  });

  it('skips a catalogue that is still loading, being deleted or gone', async () => {
    liveCatalogue('cat-p', { status: 'processing' });
    liveCatalogue('cat-x', { status: 'deleting', deleting_at: new Date().toISOString() });
    await expect(refreshCatalogueStatistics('cat-p')).resolves.toBe('skipped');
    await expect(refreshCatalogueStatistics('cat-x')).resolves.toBe('skipped');
    await expect(refreshCatalogueStatistics('nope')).resolves.toBe('skipped');
    expect(aggregation).not.toHaveBeenCalled();
    expect(collection(STATS).docs).toHaveLength(0);
  });

  it('is asked for by a merge once its transaction has ended, and by event updates and review resolutions', async () => {
    const run = jest.fn(async () => undefined);
    configureCatalogueStatisticsRefresh({ enabled: true, debounceMs: 50, run });
    liveCatalogue('cat-m', { version: '1.0.0' });
    collection(EVENTS).docs.push(
      event('m1', 'cat-m'),
      event('m2', 'cat-m', { review_status: 'pending', review_reasons: '[]', source_events: '[]' }),
    );

    // A merge writes inside a transaction; nothing is asked for until it has ended.
    await q.transaction(async (session) => {
      await q.updateCatalogueEventCount('cat-m', 2, session);
      await settle();
      expect(run).not.toHaveBeenCalled();
    });
    await whenCatalogueStatisticsRefreshIdle();
    expect(run.mock.calls).toEqual([['cat-m']]);

    await q.updateEvent('m1', { magnitude: 4.2 });
    await whenCatalogueStatisticsRefreshIdle();
    expect(run.mock.calls).toEqual([['cat-m'], ['cat-m']]);

    await resolveMergedEventReview('cat-m', 'm2', 'keep', { userId: 'reviewer-1' });
    await whenCatalogueStatisticsRefreshIdle();
    expect(run.mock.calls).toEqual([['cat-m'], ['cat-m'], ['cat-m']]);
  });

  it('never fails the write that asked for it', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    configureCatalogueStatisticsRefresh({
      enabled: true,
      debounceMs: 0,
      run: () => { throw new Error('refresh exploded'); },
      discard: () => { throw new Error('discard exploded'); },
    });
    liveCatalogue('cat-1');
    await expect(q.updateCatalogueName('Still renamed', 'cat-1')).resolves.toBe(true);
    collection(COLLECTIONS.CACHE_GENERATIONS).bulkWriteError = new Error('generation store down');
    await expect(q.updateCatalogueName('Renamed again', 'cat-1')).resolves.toBe(true);
    await whenCatalogueStatisticsRefreshIdle();
    expect(collection(CATALOGUES).docs[0].name).toBe('Renamed again');
  });

  it('drops the stored copy at once when a write could not advance the shared generation', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    liveCatalogue('cat-1');
    await getStatistics();
    expect(storedDocs()).toHaveLength(1);
    // The background refresh is left waiting, so only the drop is observed.
    configureCatalogueStatisticsRefresh({ enabled: true, debounceMs: 60_000 });

    collection(COLLECTIONS.CACHE_GENERATIONS).bulkWriteError = new Error('generation store down');
    await q.updateCatalogueName('Renamed', 'cat-1');

    // Its generation still matches, so it would otherwise have been served as current.
    await until(() => storedDocs().length === 0);
  });
});
