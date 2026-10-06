/**
 * @jest-environment node
 *
 * Catalogue/event lifecycle in the database layer, driven through the REAL lib/db.ts,
 * lib/cache.ts and route handlers against an in-memory MongoDB fake (below) that
 * implements the filter and update semantics these code paths use, plus the unique
 * indexes the events collection carries.
 *
 * Findings and contracts covered:
 *  #55  every catalogue mutation invalidates the list, region and event caches
 *       (in this instance, and in other instances through the shared generation)
 *  #63  deletion is ordered and marked, and imports cannot leave orphans
 *  C1   quality_score / quality_grade persisted on insert, recomputed on update
 *  C3   catalogue version bumps (MAJOR / MINOR / PATCH, once per operation)
 *  gc#6 time_period_* stored as UTC 'Z'
 *  #68 / gap gi#7  canonical QuakeML depth types
 *  C2 / C8 / C16  provenance fields, raw event type, confidence level
 */

import { NextRequest, NextResponse } from 'next/server';

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
        case '$regex': return typeof value === 'string' && new RegExp(operand as string).test(value);
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

class FakeCursor {
  constructor(private docs: Doc[], private projection?: Record<string, 0 | 1>) {}
  sort(spec: Record<string, 1 | -1>) {
    const keys = Object.entries(spec);
    this.docs.sort((a, b) => {
      for (const [k, dir] of keys) {
        const c = compare(a[k], b[k]) ?? 0;
        if (c !== 0) return c * dir;
      }
      return 0;
    });
    return this;
  }
  skip(n: number) { this.docs = this.docs.slice(n); return this; }
  limit(n: number) { if (n > 0) this.docs = this.docs.slice(0, n); return this; }
  project(p: Record<string, 0 | 1>) { this.projection = p; return this; }
  async toArray() { return this.docs.map((d) => project(clone(d), this.projection)); }
}

let nextObjectId = 1;
class FakeCollection {
  docs: Doc[] = [];
  /** Test hook: awaited before every find() result is read. */
  findGate: Promise<void> | null = null;
  constructor(readonly name: string) {}

  private checkUnique(doc: Doc, existing: Doc[]): { code: number } | null {
    if (this.name !== 'merged_events') return null;
    if (existing.some((d) => d.id === doc.id)) return { code: 11000 };
    if (typeof doc.source_id === 'string' &&
        existing.some((d) => d.catalogue_id === doc.catalogue_id && d.source_id === doc.source_id)) {
      return { code: 11000 };
    }
    return null;
  }
  async findOne(filter: Doc = {}, options: Doc = {}) {
    const doc = this.docs.find((d) => matches(d, filter));
    return doc ? project(clone(doc), options.projection) : null;
  }
  find(filter: Doc = {}, options: Doc = {}) {
    const selected = this.docs.filter((d) => matches(d, filter));
    const cursor = new FakeCursor(selected, options.projection);
    const gate = this.findGate;
    if (gate) {
      const toArray = cursor.toArray.bind(cursor);
      cursor.toArray = async () => { await gate; return toArray(); };
    }
    return cursor;
  }
  async insertOne(doc: Doc) {
    const clash = this.checkUnique(doc, this.docs);
    if (clash) throw Object.assign(new Error('E11000 duplicate key'), clash);
    this.docs.push({ _id: nextObjectId++, ...clone(doc) });
    return { acknowledged: true };
  }
  async insertMany(docs: Doc[]) {
    let insertedCount = 0;
    const writeErrors: Array<{ index: number; code: number }> = [];
    docs.forEach((doc, index) => {
      const clash = this.checkUnique(doc, this.docs);
      if (clash) { writeErrors.push({ index, code: clash.code }); return; }
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
      this.docs.push(created);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    const before = JSON.stringify(doc);
    applyUpdate(doc, update);
    return { matchedCount: 1, modifiedCount: before === JSON.stringify(doc) ? 0 : 1 };
  }
  async bulkWrite(ops: Doc[]) {
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
  requireEditor: jest.fn(),
  requireViewer: jest.fn(),
  requireAdmin: jest.fn(),
}));

import { dbQueries, classifyEventUpdate, normalizeDepthType, ALLOWED_DEPTH_TYPE, validateMergedEvent } from '@/lib/db';
import { calculateQualityScore, metricsFromEvent } from '@/lib/quality-scoring';
import {
  catalogueCache, apiCache, eventCache, generateCacheKey, getCacheGeneration,
  catalogueScope, CATALOGUE_LIST_SCOPE,
} from '@/lib/cache';
import { requireEditor, requireViewer } from '@/lib/auth/middleware';
import { GET as listCatalogues } from '@/app/api/catalogues/route';
import { DELETE as deleteCatalogueRoute, PATCH as patchCatalogue, GET as getCatalogue } from '@/app/api/catalogues/[id]/route';
import { GET as getEvents } from '@/app/api/catalogues/[id]/events/route';
import { GET as regionSearch } from '@/app/api/catalogues/search/region/route';
import { DELETE as clearCaches } from '@/app/api/cache/stats/route';
import { requireAdmin } from '@/lib/auth/middleware';

const q = dbQueries!;
const CATALOGUES = 'merged_catalogues';
const EVENTS = 'merged_events';

const event = (id: string, catalogueId: string, extra: Doc = {}) => ({
  id,
  catalogue_id: catalogueId,
  time: '2024-03-01T00:00:00.000Z',
  latitude: -41.2,
  longitude: 174.8,
  depth: 12,
  magnitude: 3.4,
  source_events: '[]',
  ...extra,
});

const catalogueDoc = (id: string) => collection(CATALOGUES).docs.find((d) => d.id === id)!;

/** A catalogue that has completed its first load (version 1.0.0, released). */
async function releasedCatalogue(id: string, name = id, events: Doc[] = []) {
  await q.insertCatalogue(id, name, '[]', '{}', 0, 'processing');
  if (events.length) await q.bulkInsertEvents(events as any);
  await q.updateCatalogueEventCount(id, events.length);
  await q.updateCatalogueStatus('complete', id);
}

beforeEach(() => {
  db.clear();
  catalogueCache.clearAll();
  apiCache.clearAll();
  eventCache.clearAll();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  (requireEditor as jest.Mock).mockResolvedValue({ user: { id: 'editor-1', email: 'e@example.test', role: 'editor' } });
  (requireViewer as jest.Mock).mockResolvedValue({ user: { id: 'viewer-1', email: 'v@example.test', role: 'viewer' } });
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
describe('#55 :: catalogue mutations invalidate the server caches', () => {
  const list = async () => (await (await listCatalogues(new NextRequest('http://localhost/api/catalogues'))).json())
    .map((c: Doc) => c.name);
  const idContext = (id: string) => ({ params: Promise.resolve({ id }) });

  it('a deleted catalogue leaves the cached list at once, and its cached event pages stop being served', async () => {
    await releasedCatalogue('cat-x', 'X', [event('x1', 'cat-x'), event('x2', 'cat-x')]);
    await releasedCatalogue('cat-z', 'Z');
    expect((await list()).sort()).toEqual(['X', 'Z']); // list now cached

    const eventsReq = () => getEvents(new NextRequest('http://localhost/api/catalogues/cat-x/events?limit=10'), idContext('cat-x'));
    expect((await (await eventsReq()).json()).data).toHaveLength(2); // page now cached

    const response = await deleteCatalogueRoute(new NextRequest('http://localhost/api/catalogues/cat-x', { method: 'DELETE' }), idContext('cat-x'));
    expect(response.status).toBe(200);

    expect(await list()).toEqual(['Z']);
    expect((await (await eventsReq()).json()).data).toHaveLength(0);
  });

  it('a rename is visible in the cached list immediately', async () => {
    await releasedCatalogue('cat-r', 'Old name');
    expect(await list()).toEqual(['Old name']);
    const response = await patchCatalogue(
      new NextRequest('http://localhost/api/catalogues/cat-r', { method: 'PATCH', body: JSON.stringify({ name: 'New name' }) }),
      idContext('cat-r'));
    expect(response.status).toBe(200);
    expect(await list()).toEqual(['New name']);
  });

  it('a catalogue created by any flow (merge, GeoNet, upload) appears in the cached list and region searches', async () => {
    await releasedCatalogue('cat-a', 'A');
    expect(await list()).toEqual(['A']);
    const region = async () => (await (await regionSearch(new NextRequest(
      'http://localhost/api/catalogues/search/region?minLat=-50&maxLat=-30&minLon=160&maxLon=180'))).json()).count;
    expect(await region()).toBe(0); // cached: no catalogue has bounds yet

    await q.insertCatalogue('cat-y', 'Y', '[]', '{}', 0, 'processing');
    await q.updateCatalogueGeoBounds('cat-y', -42, -40, 172, 176);
    await q.updateCatalogueStatus('complete', 'cat-y');

    expect((await list()).sort()).toEqual(['A', 'Y']);
    expect(await region()).toBe(1);
  });

  it('a region search that read the database before a write cannot cache its stale answer', async () => {
    await releasedCatalogue('cat-b', 'B');
    const url = 'http://localhost/api/catalogues/search/region?minLat=-50&maxLat=-30&minLon=160&maxLon=180';
    let release!: () => void;
    collection(CATALOGUES).findGate = new Promise<void>((resolve) => { release = resolve; });
    const slow = regionSearch(new NextRequest(url)); // reads, then waits at the gate
    await new Promise((resolve) => setTimeout(resolve, 0));
    collection(CATALOGUES).findGate = null;

    await q.updateCatalogueGeoBounds('cat-b', -42, -40, 172, 176); // the write lands mid-read
    release();
    expect((await (await slow).json()).count).toBe(0); // the stale read itself

    expect((await (await regionSearch(new NextRequest(url))).json()).count).toBe(1);
  });

  it('a write made by another server instance (shared generation only) stales this instance\'s caches', async () => {
    await releasedCatalogue('cat-c', 'C', [event('c1', 'cat-c')]);
    const eventsReq = () => getEvents(new NextRequest('http://localhost/api/catalogues/cat-c/events?limit=10'), idContext('cat-c'));
    expect((await (await eventsReq()).json()).data).toHaveLength(1);

    // Another instance inserts an event: its in-process invalidation cannot reach this
    // one, only the shared generation it advances in the database.
    collection(EVENTS).docs.push({ ...event('c2', 'cat-c', { time: '2024-04-01T00:00:00.000Z' }) });
    await collection('cache_generations').updateOne({ _id: catalogueScope('cat-c') }, { $inc: { generation: 1 } }, { upsert: true });

    expect((await (await eventsReq()).json()).data).toHaveLength(2);
  });

  it('advances the shared generation of the scopes each write touches', async () => {
    const before = await getCacheGeneration(CATALOGUE_LIST_SCOPE);
    await q.insertCatalogue('cat-g', 'G', '[]', '{}', 0, 'processing');
    expect(await getCacheGeneration(CATALOGUE_LIST_SCOPE)).not.toBe(before);
    const eventsBefore = await getCacheGeneration(catalogueScope('cat-g'));
    await q.bulkInsertEvents([event('g1', 'cat-g')] as any);
    expect(await getCacheGeneration(catalogueScope('cat-g'))).not.toBe(eventsBefore);
  });

  it('defers the invalidation of writes made inside a transaction until it has ended', async () => {
    const key = generateCacheKey('catalogues', { all: true });
    catalogueCache.set(key, ['stale']);
    await q.transaction(async (session) => {
      await q.insertCatalogue('cat-t', 'T', '[]', '{}', 0, 'processing', undefined, session);
      expect(catalogueCache.get(key)).toEqual(['stale']); // not yet: uncommitted
    });
    expect(catalogueCache.get(key)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('#63 :: deleting a catalogue cannot leave orphans', () => {
  it('marks the catalogue deleting, removes events and import history, then the row', async () => {
    await releasedCatalogue('cat-d', 'D', [event('d1', 'cat-d')]);
    await q.insertImportHistory('h1', 'cat-d', '2024-01-01', '2024-01-02', 1, 1, 0, 0, null);
    await expect(q.deleteCatalogue('cat-d')).resolves.toBe(true);
    expect(collection(CATALOGUES).docs).toHaveLength(0);
    expect(collection(EVENTS).docs).toHaveLength(0);
    expect(collection('import_history').docs).toHaveLength(0);
    await expect(q.deleteCatalogue('cat-d')).resolves.toBe(false);
  });

  it('hides a catalogue being deleted and refuses new events for it', async () => {
    await releasedCatalogue('cat-e', 'E');
    catalogueDoc('cat-e').status = 'deleting';
    expect(await q.getCatalogueById('cat-e')).toBeUndefined();
    expect(await q.getCatalogues()).toEqual([]);
    await expect(q.bulkInsertEvents([event('e1', 'cat-e')] as any)).rejects.toMatchObject({ statusCode: 409 });
    await expect(q.bulkInsertEvents([event('n1', 'no-such-catalogue')] as any)).rejects.toMatchObject({ statusCode: 409 });
    expect(collection(EVENTS).docs).toHaveLength(0);
    // A status change from a finishing import must not resurrect it.
    await expect(q.updateCatalogueStatus('complete', 'cat-e')).resolves.toBe(false);
    expect(catalogueDoc('cat-e').status).toBe('deleting');
  });

  it('removes a batch that committed after the deletion began (import racing a DELETE)', async () => {
    await releasedCatalogue('cat-f', 'F');
    const events = collection(EVENTS);
    const insertMany = events.insertMany.bind(events);
    // The DELETE lands while the batch is in flight: after the writability check,
    // before the insert commits.
    events.insertMany = async (docs: Doc[]) => {
      await q.deleteCatalogue('cat-f');
      return insertMany(docs);
    };
    await expect(q.bulkInsertEvents([event('f1', 'cat-f'), event('f2', 'cat-f')] as any))
      .rejects.toMatchObject({ code: 'CATALOGUE_NOT_WRITABLE' });
    expect(events.docs).toHaveLength(0);
  });

  it('the integrity sweep reports, then removes, orphaned events and history and finishes stuck deletions', async () => {
    await releasedCatalogue('cat-live', 'Live', [event('l1', 'cat-live')]);
    collection(EVENTS).docs.push(event('o1', 'gone'), event('o2', 'gone'));
    collection('import_history').docs.push({ id: 'h-gone', catalogue_id: 'gone' });
    collection(CATALOGUES).docs.push(
      { id: 'stuck', name: 'Stuck', status: 'deleting', deleting_at: '2020-01-01T00:00:00.000Z' },
      { id: 'busy', name: 'Busy', status: 'deleting', deleting_at: new Date().toISOString() },
    );
    collection(EVENTS).docs.push(event('s1', 'stuck'), event('b1', 'busy'));

    const report = await q.sweepOrphans();
    expect(report).toEqual({
      orphanedCatalogueIds: ['gone', 'stuck'],
      orphanedEvents: 3,
      orphanedImportHistory: 1,
      staleDeletions: ['stuck'],
      applied: false,
    });
    expect(collection(EVENTS).docs).toHaveLength(5); // dry run by default

    await q.sweepOrphans({ apply: true });
    expect(collection(EVENTS).docs.map((d) => d.id).sort()).toEqual(['b1', 'l1']);
    expect(collection('import_history').docs).toHaveLength(0);
    expect(collection(CATALOGUES).docs.map((d) => d.id).sort()).toEqual(['busy', 'cat-live']);
  });
});

// ---------------------------------------------------------------------------
describe('C1 :: stored event quality score', () => {
  const rich = {
    horizontal_uncertainty: 1.2, depth_uncertainty: 2.5, time_uncertainty: 0.2,
    azimuthal_gap: 80, used_station_count: 25, used_phase_count: 40, standard_error: 0.3,
    magnitude_uncertainty: 0.1, magnitude_station_count: 12,
    evaluation_mode: 'manual', evaluation_status: 'reviewed',
  };

  it('computes Q with the shared scorer on every insert path', async () => {
    await releasedCatalogue('cat-q', 'Q');
    await q.bulkInsertEvents([event('q1', 'cat-q', rich), event('q2', 'cat-q')] as any);
    await q.insertEvent(event('q3', 'cat-q', { azimuthal_gap: 300 }) as any);
    for (const doc of collection(EVENTS).docs) {
      const expected = calculateQualityScore(metricsFromEvent(doc));
      expect(doc.quality_score).toBe(expected.overall);
      expect(doc.quality_grade).toBe(expected.grade);
      expect(Number.isInteger(doc.quality_score)).toBe(true);
    }
    const [q1, q2] = collection(EVENTS).docs;
    expect(q1.quality_score).toBeGreaterThan(q2.quality_score);
  });

  it('keeps a finite score the row already carries (e.g. from the merge), with a consistent grade', async () => {
    await releasedCatalogue('cat-m', 'M');
    await q.bulkInsertEvents([event('m1', 'cat-m', { quality_score: 86.6, quality_grade: 'C' })] as any);
    expect(collection(EVENTS).docs[0]).toMatchObject({ quality_score: 87, quality_grade: 'A' });
    await expect(q.bulkInsertEvents([event('m2', 'cat-m', { quality_score: 140 })] as any)).rejects.toThrow(/quality_score/);
  });

  it('recomputes Q when an update changes one of its inputs, and only then', async () => {
    await releasedCatalogue('cat-u', 'U', [event('u1', 'cat-u', rich)]);
    const stored = () => collection(EVENTS).docs[0];
    const original = stored().quality_score;

    await q.updateEvent('u1', { magnitude: 4.1 });
    expect(stored().quality_score).toBe(original);

    await q.updateEvent('u1', { azimuthal_gap: 340, used_station_count: 3 });
    const expected = calculateQualityScore(metricsFromEvent(stored()));
    expect(stored().quality_score).toBe(expected.overall);
    expect(stored().quality_score).toBeLessThan(original);
    expect(stored().quality_grade).toBe(expected.grade);
  });

  it('reports the catalogue-level mean Q and grade distribution in the statistics API', async () => {
    // The aggregation itself runs in MongoDB; the statistics route must pass these on.
    const { GET } = await import('@/app/api/catalogues/[id]/statistics/route');
    await releasedCatalogue('cat-s', 'S');
    jest.spyOn(q, 'getCatalogueEventStatistics').mockResolvedValue({
      eventCount: 3, earliestTime: '2024-01-01T00:00:00.000Z', latestTime: '2024-01-02T00:00:00.000Z',
      magnitudeCount: 3, minMagnitude: 1, maxMagnitude: 3, averageMagnitude: 2, medianMagnitude: 2,
      depthCount: 3, minDepth: 1, maxDepth: 9, averageDepth: 5, magnitudeTypes: [],
      averageAzimuthalGap: null, averageStationCount: null,
      eventsWithUncertainty: 2, eventsWithHorizontalUncertainty: 2, eventsWithDepthUncertainty: 1,
      eventsWithFocalMechanism: 0, qualityScoreCount: 3, averageQualityScore: 70,
      qualityGrades: [{ grade: 'A', count: 1 }, { grade: 'C', count: 2 }],
    });
    const body = await (await GET(new NextRequest('http://localhost/api/catalogues/cat-s/statistics'),
      { params: Promise.resolve({ id: 'cat-s' }) })).json();
    expect(body.qualityMetrics).toMatchObject({
      eventsWithQualityScore: 3, averageQualityScore: 70,
      gradeDistribution: [{ grade: 'A', count: 1 }, { grade: 'C', count: 2 }],
    });
  });
});

// ---------------------------------------------------------------------------
describe('C3 :: catalogue versions', () => {
  const version = (id: string) => catalogueDoc(id).version;

  it('a new catalogue is 1.0.0, and its first load does not bump it', async () => {
    await releasedCatalogue('cat-v', 'V', [event('v1', 'cat-v'), event('v2', 'cat-v')]);
    expect(version('cat-v')).toBe('1.0.0');
    expect((await q.getCatalogueById('cat-v'))?.version).toBe('1.0.0');
    expect((await q.getCatalogueById('cat-v'))?.version_updated_at).toMatch(/Z$/);
  });

  it('adding events to a catalogue that has them is MINOR, once per operation', async () => {
    await releasedCatalogue('cat-v', 'V', [event('v1', 'cat-v')]);
    await q.updateCatalogueStatus('processing', 'cat-v'); // e.g. a GeoNet import begins
    await q.bulkInsertEvents([event('v2', 'cat-v')] as any);
    await q.bulkInsertEvents([event('v3', 'cat-v')] as any);
    expect(version('cat-v')).toBe('1.0.0'); // not released yet
    await q.updateCatalogueStatus('complete', 'cat-v');
    expect(version('cat-v')).toBe('1.1.0');
  });

  it('changing existing events\' parameters is MAJOR, and outranks additions in the same operation', async () => {
    await releasedCatalogue('cat-v', 'V', [event('v1', 'cat-v')]);
    await q.updateCatalogueStatus('processing', 'cat-v');
    await q.bulkInsertEvents([event('v2', 'cat-v')] as any);
    await q.updateEvent('v1', { magnitude: 3.9 });
    await q.updateCatalogueStatus('complete', 'cat-v');
    expect(version('cat-v')).toBe('2.0.0');
  });

  it('a metadata edit is PATCH, applied in the same update as the edit', async () => {
    await releasedCatalogue('cat-v', 'V');
    const result = await q.updateCatalogueMetadata('cat-v', { description: 'Better words' }, { modifiedBy: 'u-1' });
    expect(result).toEqual({ version: '1.0.1' });
    expect(catalogueDoc('cat-v')).toMatchObject({ version: '1.0.1', description: 'Better words', modified_by: 'u-1' });
  });

  it('saving an edit form unchanged neither bumps nor restamps modified_at', async () => {
    await releasedCatalogue('cat-v', 'V');
    const form = { description: 'Same', keywords: ['a', 'b'] as any, data_quality: { completeness: 'high' } as any };
    await q.updateCatalogueMetadata('cat-v', form, { name: 'V', modifiedBy: 'u-1' });
    const stamped = catalogueDoc('cat-v').modified_at;
    await expect(q.updateCatalogueMetadata('cat-v', form, { name: 'V', modifiedBy: 'u-2' })).resolves.toEqual({ version: '1.0.1' });
    expect(catalogueDoc('cat-v')).toMatchObject({ version: '1.0.1', modified_at: stamped, modified_by: 'u-1' });
  });

  it('an update that changes nothing does not bump', async () => {
    await releasedCatalogue('cat-v', 'V', [event('v1', 'cat-v')]);
    await q.updateEvent('v1', { magnitude: 3.4 });
    expect(version('cat-v')).toBe('1.0.0');
  });

  it('classifies event updates by what they replace', () => {
    expect(classifyEventUpdate({ magnitude: 3 }, { magnitude: 3.2 })).toBe('major');
    expect(classifyEventUpdate({ magnitude: 3 }, { depth_uncertainty: 1.5 })).toBe('minor');
    expect(classifyEventUpdate({ region: 'Cook Strait' }, { region: 'Cook Strait, NZ' })).toBe('patch');
    expect(classifyEventUpdate({ magnitude: 3 }, { magnitude: 3, quality_score: 50 })).toBeNull();
  });

  it('a catalogue stored before versioning reads as 1.0.0 and keeps its free-text label as source_version', async () => {
    collection(CATALOGUES).docs.push({ id: 'legacy', name: 'Legacy', status: 'complete', created_at: '2023-05-01T00:00:00.000Z', version: '2024.1' });
    expect(await q.getCatalogueById('legacy')).toMatchObject({
      version: '1.0.0', version_updated_at: '2023-05-01T00:00:00.000Z', source_version: '2024.1',
    });
    await q.updateCatalogueMetadata('legacy', { notes: 'corrected' });
    expect(catalogueDoc('legacy')).toMatchObject({ version: '1.0.1', source_version: '2024.1' });
  });

  it('never takes the version or provenance from client metadata', async () => {
    await q.insertCatalogue('cat-w', 'W', '[]', '{}', 0, 'processing',
      { version: '9.9.9', created_by: 'forged', modified_by: 'forged', modified_at: '2001-01-01' } as any,
      undefined, { createdBy: 'session-user' });
    expect(catalogueDoc('cat-w')).toMatchObject({ version: '1.0.0', source_version: '9.9.9', created_by: 'session-user' });
    expect(catalogueDoc('cat-w').modified_by).toBeUndefined();
    await q.updateCatalogueStatus('complete', 'cat-w');
    await q.updateCatalogueMetadata('cat-w', { version: '5.0.0', created_by: 'x', modified_at: '1999' } as any);
    expect(catalogueDoc('cat-w')).toMatchObject({ version: '1.0.0', created_by: 'session-user' });
  });
});

// ---------------------------------------------------------------------------
describe('gc#6 :: catalogue time periods are stored as UTC', () => {
  it('normalises offset-less and offset values to ISO 8601 Z on insert and update', async () => {
    await q.insertCatalogue('cat-p', 'P', '[]', '{}', 0, 'processing', {
      time_period_start: '2024-01-01T00:00', time_period_end: '2024-12-31T23:59:59+13:00',
    });
    expect(catalogueDoc('cat-p')).toMatchObject({
      time_period_start: '2024-01-01T00:00:00.000Z', time_period_end: '2024-12-31T10:59:59.000Z',
    });
    await q.updateCatalogueMetadata('cat-p', { time_period_end: '2025-06-30 12:00' });
    expect(catalogueDoc('cat-p').time_period_end).toBe('2025-06-30T12:00:00.000Z');
    await q.updateCatalogueMetadata('cat-p', { time_period_end: '' });
    expect(catalogueDoc('cat-p').time_period_end).toBeNull();
  });

  it('rejects an unparseable or reversed period', async () => {
    await expect(q.insertCatalogue('cat-p', 'P', '[]', '{}', 0, 'processing', { time_period_start: 'soon' }))
      .rejects.toThrow(/time_period_start/);
    await releasedCatalogue('cat-p2', 'P2');
    await expect(q.updateCatalogueMetadata('cat-p2', { time_period_start: '2024-02-01', time_period_end: '2024-01-01' }))
      .rejects.toThrow(/time_period_start/);
  });
});

// ---------------------------------------------------------------------------
describe('#68 / gap gi#7 :: QuakeML depth types', () => {
  it('accepts every BED OriginDepthType in any case and stores the canonical spelling', async () => {
    await releasedCatalogue('cat-dt', 'DT');
    const lowered = 'from modeling of broad-band p waveforms';
    expect(ALLOWED_DEPTH_TYPE.has(lowered)).toBe(true); // the upload route's lookup
    expect(ALLOWED_DEPTH_TYPE.has('constrained by depth and direct phases')).toBe(true);
    expect(ALLOWED_DEPTH_TYPE.has('constrained by s-p time differences')).toBe(false); // not BED
    await q.bulkInsertEvents([
      event('d1', 'cat-dt', { depth_type: lowered }),
      event('d2', 'cat-dt', { depth_type: 'Constrained by depth and direct phases' }),
    ] as any);
    expect(collection(EVENTS).docs.map((d) => d.depth_type)).toEqual([
      'from modeling of broad-band P waveforms', 'constrained by depth and direct phases',
    ]);
    await q.updateEvent('d1', { depth_type: 'OPERATOR ASSIGNED' });
    expect(collection(EVENTS).docs[0].depth_type).toBe('operator assigned');
  });

  it('rejects a depth type outside the BED vocabulary', () => {
    expect(normalizeDepthType('constrained by S-P time differences')).toBeNull();
    expect(() => validateMergedEvent(event('x', 'c', { depth_type: 'constrained by S-P time differences' }) as any))
      .toThrow(/depth_type/);
  });
});

// ---------------------------------------------------------------------------
describe('C2 / C8 / C16 :: provenance, raw event type and confidence level persist', () => {
  it('stores merged-event provenance and validates its shape', async () => {
    await releasedCatalogue('cat-mg', 'MG');
    const sourceEvents = JSON.stringify([
      { catalogueId: 'a', id: 'a1', selected: true }, { catalogueId: 'b', id: 'b1' },
    ]);
    await q.bulkInsertEvents([event('mg1', 'cat-mg', {
      source_events: sourceEvents,
      merge_strategy: 'quality',
      merge_parameters: JSON.stringify({ mergeStrategy: 'quality', timeThresholdSeconds: 10 }),
      source_catalogue_ids: ['a', 'b'],
      source_event_type: 'outside of network interest',
      confidence_level: 95,
    })] as any);
    const stored = collection(EVENTS).docs[0];
    expect(stored).toMatchObject({
      merge_strategy: 'quality', source_catalogue_ids: ['a', 'b'],
      source_event_type: 'outside of network interest', confidence_level: 95,
    });
    expect(JSON.parse(stored.source_events)[0].selected).toBe(true);

    for (const bad of [
      { merge_strategy: 'best' },
      { merge_parameters: '{not json' },
      { source_catalogue_ids: 'a,b' },
      { confidence_level: 101 },
      { confidence_level: -1 },
    ]) {
      expect(() => validateMergedEvent(event('bad', 'c', bad) as any)).toThrow();
    }
    await expect(q.updateEvent('mg1', { confidence_level: 150 } as any)).rejects.toThrow(/confidence_level/);
  });
});

// ---------------------------------------------------------------------------
describe('#62 / #122 / C13 :: PATCH /api/catalogues/[id]', () => {
  const patch = (id: string, body: unknown, raw = false) => patchCatalogue(
    new NextRequest(`http://localhost/api/catalogues/${id}`, {
      method: 'PATCH',
      headers: { 'x-forwarded-for': '203.0.113.9' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) });
  const audit = () => collection('audit_logs').docs;

  it('ignores client-supplied provenance and version, stamps modified_* from the session, and audits the edit', async () => {
    await q.insertCatalogue('cat-e1', 'E1', '[]', '{}', 0, 'processing', undefined, undefined, { createdBy: 'creator' });
    await q.updateCatalogueStatus('complete', 'cat-e1');
    const response = await patch('cat-e1', {
      name: 'Edited', description: 'New description',
      created_by: 'someone-else', modified_at: '2001-01-01', modified_by: 'ghost', version: '9.0.0', evil: 1,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, version: '1.0.1' });
    const doc = catalogueDoc('cat-e1');
    expect(doc).toMatchObject({ name: 'Edited', description: 'New description', created_by: 'creator', modified_by: 'editor-1', version: '1.0.1' });
    expect(doc.modified_at).not.toBe('2001-01-01');
    expect(doc.evil).toBeUndefined();
    expect(audit()).toEqual([expect.objectContaining({
      action: 'catalogue.update', actor_id: 'editor-1', target_id: 'cat-e1', target_type: 'catalogue',
      metadata: { fields: ['name', 'description'], version: '1.0.1' },
    })]);
  });

  it.each([
    [{ description: { nested: 'object' } }],
    [{ keywords: 'not-an-array' }],
    [{ notes: 'x'.repeat(60_000) }],
    [{ contact_email: 'not an email' }],
    [{ name: '   ' }],
  ])('rejects an invalid edit with 400 and writes nothing (%j)', async (body) => {
    await releasedCatalogue('cat-e2', 'E2');
    const before = JSON.stringify(catalogueDoc('cat-e2'));
    expect((await patch('cat-e2', body)).status).toBe(400);
    expect(JSON.stringify(catalogueDoc('cat-e2'))).toBe(before);
    expect(audit()).toEqual([]);
  });

  it('rejects a body that is not JSON, and an unparseable time period', async () => {
    await releasedCatalogue('cat-e3', 'E3');
    expect((await patch('cat-e3', '{not json', true)).status).toBe(400);
    expect((await patch('cat-e3', { time_period_start: 'last tuesday' })).status).toBe(400);
  });

  it('answers 404 for a catalogue that does not exist, and audits nothing', async () => {
    expect((await patch('missing', { description: 'x' })).status).toBe(404);
    expect((await patch('missing', {})).status).toBe(404);
    expect(audit()).toEqual([]);
  });

  it('DELETE answers 404 for a catalogue that does not exist', async () => {
    const response = await deleteCatalogueRoute(
      new NextRequest('http://localhost/api/catalogues/missing', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'missing' }) });
    expect(response.status).toBe(404);
  });

  it('clearing the caches is audited (cache.clear)', async () => {
    (requireAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', email: 'a@example.test', role: 'admin' } });
    catalogueCache.set('catalogues:all=true', ['x']);
    const response = await clearCaches(new NextRequest('http://localhost/api/cache/stats', { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(catalogueCache.get('catalogues:all=true')).toBeNull();
    expect(audit()).toEqual([expect.objectContaining({ action: 'cache.clear', actor_id: 'admin-1' })]);
  });

  it('clearing the caches also drops the statistics stored for every catalogue', async () => {
    (requireAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin-1', email: 'a@example.test', role: 'admin' } });
    const stored = collection('catalogue_statistics');
    await stored.insertOne({ catalogue_id: 'cat-s1', generation: 3, version: '1.0.0', format: 1, statistics: {} });
    await stored.insertOne({ catalogue_id: 'cat-s2', generation: 5, version: '1.0.0', format: 1, statistics: {} });
    const response = await clearCaches(new NextRequest('http://localhost/api/cache/stats', { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ success: true, storedStatisticsCleared: true }));
    expect(await stored.countDocuments()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('#1 (review) :: saving the edit form unchanged is no change', () => {
  /** Exactly what app/catalogues/[id]/edit/page.tsx sends when the user saves without editing. */
  async function editFormPayload(id: string) {
    const data: Doc = (await q.getCatalogueById(id))!;
    const parseArray = (v: any) => (Array.isArray(v) ? v
      : typeof v === 'string' ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
    const parseObject = (v: any, d: any) => (typeof v === 'object' && v !== null ? v
      : typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return d; } })() : d);
    return {
      name: data.name,
      description: data.description || '', data_source: data.data_source || '', provider: data.provider || '',
      geographic_region: data.geographic_region || '', time_period_start: data.time_period_start || '',
      time_period_end: data.time_period_end || '',
      data_quality: parseObject(data.data_quality, { completeness: '', accuracy: '', reliability: '' }),
      quality_notes: data.quality_notes || '', contact_name: data.contact_name || '', contact_email: data.contact_email || '',
      contact_organization: data.contact_organization || '', license: data.license || '', usage_terms: data.usage_terms || '',
      citation: data.citation || '', doi: data.doi || '',
      keywords: parseArray(data.keywords), reference_links: parseArray(data.reference_links), notes: data.notes || '',
    };
  }
  const save = async (id: string, body: unknown) => (await patchCatalogue(
    new NextRequest(`http://localhost/api/catalogues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) })).json();

  it.each([
    ['GeoNet-created (no metadata stored)', undefined],
    ['merge-created (keywords and data quality stored as JSON text)', {
      description: 'Merged NZ', keywords: JSON.stringify(['nz', 'merge']), data_quality: JSON.stringify({ completeness: 'high' }),
    }],
    ['upload-created with every field filled', {
      description: 'd', data_source: 's', provider: 'p', geographic_region: 'r', quality_notes: 'q', contact_name: 'n',
      contact_email: 'a@b.co', contact_organization: 'o', license: 'l', usage_terms: 'u', citation: 'c', doi: '10.1/x',
      notes: 'x', keywords: ['k'], reference_links: ['https://x'], data_quality: { completeness: 'a', accuracy: 'b', reliability: 'c' },
      time_period_start: '2024-01-01T00:00', time_period_end: '2024-12-31T23:59',
    }],
  ])('%s', async (_label, metadata) => {
    await q.insertCatalogue('cat-f', 'F', '[]', '{}', 0, 'processing', metadata as any);
    await q.updateCatalogueStatus('complete', 'cat-f');
    const stored = JSON.stringify(catalogueDoc('cat-f'));
    expect(await save('cat-f', await editFormPayload('cat-f'))).toEqual({ success: true, version: '1.0.0' });
    expect(await save('cat-f', await editFormPayload('cat-f'))).toEqual({ success: true, version: '1.0.0' });
    expect(JSON.stringify(catalogueDoc('cat-f'))).toBe(stored); // nothing written, modified_* not stamped
  });

  it('stores one canonical form, whatever shape the client sent', async () => {
    await q.insertCatalogue('cat-c', 'C', '[]', '{}', 0, 'processing', {
      keywords: ['nz', ''] as any, reference_links: [] as any, description: '',
      data_quality: { reliability: 'low', completeness: 'high', accuracy: '' } as any,
    });
    expect(catalogueDoc('cat-c')).toMatchObject({ keywords: '["nz"]', data_quality: '{"completeness":"high","reliability":"low"}' });
    expect(catalogueDoc('cat-c').reference_links).toBeUndefined();
    expect(catalogueDoc('cat-c').description).toBeUndefined();
    await q.updateCatalogueStatus('complete', 'cat-c');

    // A real edit is stored canonically too, and bumps once.
    await q.updateCatalogueMetadata('cat-c', { keywords: ['nz', 'kermadec'] as any, notes: '' });
    expect(catalogueDoc('cat-c')).toMatchObject({ version: '1.0.1', keywords: '["nz","kermadec"]' });
    // Clearing a field is a change; an empty value is stored as null.
    await q.updateCatalogueMetadata('cat-c', { data_quality: { completeness: '', accuracy: '', reliability: '' } as any });
    expect(catalogueDoc('cat-c')).toMatchObject({ version: '1.0.2', data_quality: null });
  });
});

// ---------------------------------------------------------------------------
describe('#3 (review) :: a quality filter judges legacy rows by their Q, as the table does', () => {
  it('scores rows stored without a quality score before filtering, then keeps what the table keeps', async () => {
    const rich = {
      horizontal_uncertainty: 1, depth_uncertainty: 1, time_uncertainty: 0.1, azimuthal_gap: 40,
      used_station_count: 40, used_phase_count: 60, standard_error: 0.2, magnitude_uncertainty: 0.1,
      magnitude_station_count: 10, evaluation_mode: 'manual', evaluation_status: 'reviewed',
    };
    await releasedCatalogue('cat-l', 'L', [event('good', 'cat-l', rich), event('poor', 'cat-l'), event('stored', 'cat-l')]);
    // Simulate rows written before scores were persisted.
    for (const doc of collection(EVENTS).docs) {
      if (doc.id !== 'stored') { delete doc.quality_score; delete doc.quality_grade; }
    }
    const legacy = collection(EVENTS).docs.map((d) => ({ ...d }));
    const { applyEventFilters } = await import('@/components/event-filters');

    const result = await q.getFilteredEvents('cat-l', { minQuality: 50 });

    expect(result.events.map((e) => e.id).sort()).toEqual(applyEventFilters(legacy as any[], { minQuality: 50 }).map((e: Doc) => e.id).sort());
    expect(result.events.map((e) => e.id)).toContain('good');
    // The rows now carry the score an insert would have given them.
    for (const doc of collection(EVENTS).docs) {
      expect(doc.quality_score).toBe(calculateQualityScore(metricsFromEvent(doc)).overall);
    }
  });
});

// ---------------------------------------------------------------------------
describe('#9 (review) :: searching identifiers that contain a colon', () => {
  it('treats an unknown name: prefix as part of the text to find', async () => {
    await releasedCatalogue('cat-s', 'S', [
      event('s1', 'cat-s', { source_id: 'GeoNet:2016p858000' }),
      event('s2', 'cat-s', { event_public_id: 'smi:nz.org.geonet/2019p123456' }),
    ]);
    const ids = async (text: string) => (await q.searchEvents(text, 10)).map((r: Doc) => r.id);
    expect(await ids('2016p858000')).toEqual(['s1']);
    expect(await ids('GeoNet:2016p858000')).toEqual(['s1']);
    expect(await ids('smi:nz.org.geonet/2019p123456')).toEqual(['s2']);
    expect(await ids('id:GeoNet:2016p858000')).toEqual(['s1']);
    // A recognised field is still a filter.
    expect(await ids('mag:>=3 2016p858000')).toEqual(['s1']);
    expect(await ids('mag:>=4 2016p858000')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('GeoNet #110 / #109 hand-offs :: concurrent imports and import history', () => {
  const status = (id: string) => catalogueDoc(id).status;
  const start = (id: string, runId: string) => q.updateCatalogueStatus('processing', id, undefined, { runId });
  const finish = (id: string, s: 'complete' | 'error', runId: string) => q.updateCatalogueStatus(s, id, undefined, { runId });

  it('a superseded run cannot overwrite the latest run\'s outcome', async () => {
    await releasedCatalogue('cat-x', 'X');
    await start('cat-x', 'A');
    await start('cat-x', 'B');
    await expect(finish('cat-x', 'complete', 'A')).resolves.toBe(false);
    expect(status('cat-x')).toBe('processing');
    await finish('cat-x', 'error', 'B');
    expect(status('cat-x')).toBe('error');
    expect(catalogueDoc('cat-x').import_run_id).toBeUndefined();
  });

  it('a failure of a superseded run is not lost to the latest run\'s success', async () => {
    await releasedCatalogue('cat-x', 'X');
    await start('cat-x', 'A');
    await start('cat-x', 'B');
    await finish('cat-x', 'error', 'A'); // B still running
    await finish('cat-x', 'complete', 'B');
    expect(status('cat-x')).toBe('error');
  });

  it('a superseded run failing after the latest run finished marks the catalogue failed', async () => {
    await releasedCatalogue('cat-x', 'X');
    await start('cat-x', 'A');
    await start('cat-x', 'B');
    await finish('cat-x', 'complete', 'B');
    expect(status('cat-x')).toBe('complete');
    await finish('cat-x', 'error', 'A');
    expect(status('cat-x')).toBe('error');
  });

  it('one run on its own completes, releasing its version', async () => {
    await releasedCatalogue('cat-x', 'X', [event('x1', 'cat-x')]);
    await start('cat-x', 'A');
    await q.bulkInsertEvents([event('x2', 'cat-x')] as any);
    await finish('cat-x', 'complete', 'A');
    expect(catalogueDoc('cat-x')).toMatchObject({ status: 'complete', version: '1.1.0' });
  });

  it('extends stored bounds atomically and across the antimeridian', async () => {
    await releasedCatalogue('cat-b', 'B');
    await q.updateCatalogueGeoBounds('cat-b', -30, -29, 177, 179);
    // Two imports extend the same catalogue; neither extension may be lost.
    await Promise.all([
      q.updateCatalogueGeoBounds('cat-b', -31, -30, -179, -178, undefined, { merge: true }),
      q.updateCatalogueGeoBounds('cat-b', -40, -39, 176, 177, undefined, { merge: true }),
    ]);
    expect(catalogueDoc('cat-b')).toMatchObject({
      min_latitude: -40, max_latitude: -29, min_longitude: 176, max_longitude: -178,
    });
  });

  it('stores why fetched rows were not imported, and rejects bad counts', async () => {
    await releasedCatalogue('cat-h', 'H');
    await q.insertImportHistory('h1', 'cat-h', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z', 10, 5, 1, 1, null, {
      collided_events: 1, invalid_events: 1, excluded_events: 1, failed_events: 0,
      excluded_event_types: { duplicate: 1 },
    });
    expect(collection('import_history').docs[0]).toMatchObject({
      total_fetched: 10, collided_events: 1, invalid_events: 1, excluded_events: 1, failed_events: 0,
      excluded_event_types: { duplicate: 1 },
    });
    await expect(q.insertImportHistory('h2', 'cat-h', 'a', 'b', 1, 0, 0, 0, null, { invalid_events: -1 }))
      .rejects.toThrow(/invalid_events/);
  });
});

// ---------------------------------------------------------------------------
describe('#62 / #122 :: GET reports the version', () => {
  it('exposes version and version_updated_at on the catalogue API', async () => {
    await releasedCatalogue('cat-api', 'API');
    const body = await (await getCatalogue(new Request('http://localhost/api/catalogues/cat-api'),
      { params: Promise.resolve({ id: 'cat-api' }) })).json();
    expect(body.version).toBe('1.0.0');
    expect(body.version_state).toBeUndefined(); // bookkeeping stays internal
  });
});
