/**
 * @jest-environment node
 *
 * The merge review database functions (contract M3), driven through the REAL lib/db.ts
 * against an in-memory MongoDB fake (the subset of filter and update semantics these code
 * paths use, as __tests__/fix-db-lifecycle.test.ts does). getEventsForReview pages the
 * held rows with a (time, id) keyset cursor and counts both states; resolveMergedEventReview
 * keeps the provisional solution (PATCH) or republishes one report wholesale through the
 * engine's rebuild (MAJOR when the solution changed), conditionally on the row still
 * being pending, with the same cache and version bookkeeping an event PATCH performs.
 */

type Doc = Record<string, any>;
const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

function compare(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}
function matchValue(value: unknown, cond: any): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, operand]) => {
      const c = compare(value, operand);
      switch (op) {
        case '$gt': return c !== null && c > 0;
        case '$lt': return c !== null && c < 0;
        case '$ne': return !matchValue(value, operand);
        case '$in': return (operand as unknown[]).some((o) => matchValue(value, o));
        case '$exists': return (value !== undefined) === Boolean(operand);
        default: throw new Error(`fake mongo: unsupported operator ${op}`);
      }
    });
  }
  return JSON.stringify(value) === JSON.stringify(cond);
}
function matches(doc: Doc, filter: Doc = {}): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return (cond as Doc[]).some((f) => matches(doc, f));
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
  return projection._id === 0 ? { ...rest } : { _id, ...rest };
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
  limit(n: number) { if (n > 0) this.docs = this.docs.slice(0, n); return this; }
  project(p: Record<string, 0 | 1>) { this.projection = p; return this; }
  async toArray() { return this.docs.map((d) => project(clone(d), this.projection)); }
}
let nextObjectId = 1;
class FakeCollection {
  docs: Doc[] = [];
  async findOne(filter: Doc = {}, options: Doc = {}) {
    const doc = this.docs.find((d) => matches(d, filter));
    return doc ? project(clone(doc), options.projection) : null;
  }
  find(filter: Doc = {}, options: Doc = {}) {
    return new FakeCursor(this.docs.filter((d) => matches(d, filter)), options.projection);
  }
  async insertOne(doc: Doc) { this.docs.push({ _id: nextObjectId++, ...clone(doc) }); return { acknowledged: true }; }
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
    applyUpdate(doc, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }
  async bulkWrite(ops: Doc[]) {
    for (const op of ops) await this.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert });
    return { ok: 1 };
  }
  async countDocuments(filter: Doc = {}) { return this.docs.filter((d) => matches(d, filter)).length; }
}
const store = new Map<string, FakeCollection>();
const collection = (name: string) => {
  if (!store.has(name)) store.set(name, new FakeCollection());
  return store.get(name)!;
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
jest.mock('@/lib/cache', () => {
  const actual = jest.requireActual('@/lib/cache');
  return { ...actual, invalidateCatalogueCache: jest.fn(), invalidateCatalogueListCaches: jest.fn() };
});

import { COLLECTIONS } from '@/lib/mongodb';
import { getEventsForReview, resolveMergedEventReview } from '@/lib/db';
import { mergeEventGroup, buildMergedEventFields, OPTIONAL_DB_FIELDS } from '@/lib/merge';
import { invalidateCatalogueCache } from '@/lib/cache';
import { AppError } from '@/lib/errors';
import { metricsFromEvent, scoreQualityMetrics } from '@/lib/quality-scoring';

const CATALOGUE = 'cat-m';
const config: any = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };

const report = (id: string, catalogue: string, extra: Record<string, unknown>): any => ({
  id, catalogueId: catalogue, source: catalogue === 'cat-gn' ? 'GeoNet' : 'ISC', time: '2024-01-01T00:00:00.000Z',
  latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 4.1, magnitude_type: 'ML', ...extra,
});
const geonet = (t: string) => report('g', 'cat-gn', {
  time: t, source_id: '2024p1', agency_id: 'WEL', depth_type: 'from location', depth_uncertainty: 2,
  used_station_count: 40, azimuthal_gap: 50, standard_error: 0.3, evaluation_status: 'reviewed',
});
const isc = (t: string) => report('i', 'cat-isc', {
  time: t, source_id: '600001', agency_id: 'ISC', latitude: -41.32, longitude: 174.82, depth: 25, magnitude: 4.0,
  magnitude_type: 'mb', magnitude_uncertainty: 0.15, magnitude_station_count: 12, depth_type: 'operator assigned',
  used_station_count: 12, azimuthal_gap: 150, evaluation_status: 'preliminary',
});

/** A merged row as the persist path writes it, held for review. */
function heldRow(id: string, t: string, status: 'pending' | 'resolved' | null = 'pending'): Doc {
  const merged = mergeEventGroup([geonet(t), isc(t.replace('00.000Z', '01.000Z'))], config);
  return {
    id, catalogue_id: CATALOGUE, created_at: '2024-02-01T00:00:00.000Z',
    ...buildMergedEventFields(merged, OPTIONAL_DB_FIELDS),
    review_status: status, review_reasons: status ? ['Ambiguous association: the closest match was kept.'] : null,
  };
}

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  collection(COLLECTIONS.CATALOGUES).docs.push({
    id: CATALOGUE, name: 'Merged', status: 'complete', version: '1.0.0', created_at: '2024-02-01T00:00:00.000Z',
    source_catalogues: JSON.stringify([{ id: 'cat-gn' }, { id: 'cat-isc' }]),
  });
  collection(COLLECTIONS.EVENTS).docs.push(
    heldRow('ev-1', '2024-01-01T00:00:00.000Z'),
    heldRow('ev-2', '2024-01-02T00:00:00.000Z'),
    heldRow('ev-3', '2024-01-03T00:00:00.000Z', 'resolved'),
    heldRow('ev-4', '2024-01-04T00:00:00.000Z', null),
  );
});

const catalogueVersion = () => collection(COLLECTIONS.CATALOGUES).docs[0].version;
const storedEvent = (id: string) => collection(COLLECTIONS.EVENTS).docs.find((d) => d.id === id)!;
const status = (promise: Promise<unknown>) =>
  promise.then(() => null, (error) => (error instanceof AppError ? error.statusCode : error));

describe('getEventsForReview', () => {
  it('lists the pending rows in (time, id) order with their provenance and both counts', async () => {
    const page = await getEventsForReview(CATALOGUE, {});
    expect(page.events.map((e) => e.id)).toEqual(['ev-1', 'ev-2']);
    expect(typeof page.events[0].source_events).toBe('string');
    expect(JSON.parse(page.events[0].source_events)).toHaveLength(2);
    expect(page.events[0]).not.toHaveProperty('_id');
    expect(page).toMatchObject({ nextCursor: null, pendingCount: 2, resolvedCount: 1 });
  });

  it('pages with a keyset cursor', async () => {
    const first = await getEventsForReview(CATALOGUE, { limit: 1 });
    expect(first.events.map((e) => e.id)).toEqual(['ev-1']);
    expect(first.nextCursor).toBe('2024-01-01T00:00:00.000Z|ev-1');
    const second = await getEventsForReview(CATALOGUE, { limit: 1, after: first.nextCursor });
    expect(second.events.map((e) => e.id)).toEqual(['ev-2']);
    expect(second.nextCursor).toBeNull();
  });

  it('lists resolved rows on request, and refuses an unknown catalogue', async () => {
    const resolved = await getEventsForReview(CATALOGUE, { status: 'resolved' });
    expect(resolved.events.map((e) => e.id)).toEqual(['ev-3']);
    expect(await status(getEventsForReview('nope', {}))).toBe(404);
    expect(await status(getEventsForReview(CATALOGUE, { limit: 0 }))).toBe(400);
  });
});

describe('resolveMergedEventReview', () => {
  it("'keep' resolves the row as it stands: a PATCH version, caches invalidated", async () => {
    const before = storedEvent('ev-1');
    const { latitude, magnitude } = before;
    const { event, pendingCount } = await resolveMergedEventReview(CATALOGUE, 'ev-1', 'keep', { userId: 'user-9' });
    expect(event).toMatchObject({ id: 'ev-1', review_status: 'resolved', review_choice: 'keep', reviewed_by: 'user-9', latitude, magnitude });
    expect(Date.parse(event.reviewed_at!)).not.toBeNaN();
    expect(pendingCount).toBe(1);
    expect(catalogueVersion()).toBe('1.0.1');
    expect(invalidateCatalogueCache).toHaveBeenCalledWith(CATALOGUE);
  });

  it('{ report } republishes that report wholesale: its solution and metadata, a MAJOR version', async () => {
    const before = storedEvent('ev-2');
    expect(JSON.parse(before.source_events)[0].selected).toBe(true); // GeoNet was provisional
    const { event } = await resolveMergedEventReview(CATALOGUE, 'ev-2', { report: 1 }, { userId: 'user-9' });
    expect([event.time, event.latitude, event.longitude, event.depth, event.magnitude])
      .toEqual(['2024-01-02T00:00:01.000Z', -41.32, 174.82, 25, 4.0]);
    // ISC's own metadata came with its value; GeoNet's did not linger.
    expect([event.magnitude_type, event.magnitude_uncertainty, event.depth_type, event.used_station_count, event.evaluation_status])
      .toEqual(['mb', 0.15, 'operator assigned', 12, 'preliminary']);
    expect(event.source_id).toBe('ISC:600001');
    const entries = JSON.parse(event.source_events);
    expect(entries.map((s: any) => [s.selected === true, s.magnitudeSelected === true, s.depthSelected === true]))
      .toEqual([[false, false, false], [true, true, true]]);
    expect(event).toMatchObject({ review_status: 'resolved', review_choice: 'report:1', reviewed_by: 'user-9', merge_strategy: 'quality' });
    expect(event.source_catalogue_ids).toEqual(before.source_catalogue_ids);
    // Q describes the row as now published, from the same routine the insert uses.
    expect(event.quality_score).toBe(scoreQualityMetrics(metricsFromEvent(event as unknown as Record<string, unknown>)).overall);
    expect(catalogueVersion()).toBe('2.0.0');
  });

  it('{ report } keeps the reasons the row was held for, as keep does', async () => {
    const reasons = storedEvent('ev-2').review_reasons;
    expect(reasons).toHaveLength(1);
    const { event } = await resolveMergedEventReview(CATALOGUE, 'ev-2', { report: 1 }, { userId: 'user-9' });
    expect(event.review_reasons).toEqual(reasons);
    expect(storedEvent('ev-2').review_reasons).toEqual(reasons);
  });

  it('{ report } is MAJOR when only the magnitude scale changes (Mw 4.1 -> ML 4.1), as an event update rates it', async () => {
    // Provisional: GeoNet's epicentre (the priority), its magnitude taken by the field rule
    // from the ISC's Mw of the same value. Publishing GeoNet's own report changes no value,
    // only the magnitude's scale and metadata.
    const iscMw = { ...isc('2024-01-05T00:00:01.000Z'), magnitude: 4.1, magnitude_type: 'Mw' };
    const merged = mergeEventGroup([geonet('2024-01-05T00:00:00.000Z'), iscMw], {
      ...config, mergeStrategy: 'priority', priority: 'geonet',
      fieldRules: { magnitude: { rule: 'catalogue', catalogueId: 'cat-isc' } },
    });
    collection(COLLECTIONS.EVENTS).docs.push({
      id: 'ev-5', catalogue_id: CATALOGUE, created_at: '2024-02-01T00:00:00.000Z',
      ...buildMergedEventFields(merged, OPTIONAL_DB_FIELDS), review_status: 'pending', review_reasons: ['x'],
    });
    const before = storedEvent('ev-5');
    expect([before.magnitude, before.magnitude_type]).toEqual([4.1, 'Mw']);
    const { event } = await resolveMergedEventReview(CATALOGUE, 'ev-5', { report: 0 }, { userId: 'user-9' });
    expect([event.time, event.latitude, event.longitude, event.depth, event.magnitude])
      .toEqual([before.time, before.latitude, before.longitude, before.depth, before.magnitude]);
    expect(event.magnitude_type).toBe('ML');
    expect(catalogueVersion()).toBe('2.0.0');
  });

  it('publishing the report already published is a PATCH', async () => {
    await resolveMergedEventReview(CATALOGUE, 'ev-1', { report: 0 }, { userId: 'user-9' });
    expect(catalogueVersion()).toBe('1.0.1');
    expect(storedEvent('ev-1').review_choice).toBe('report:0');
  });

  it('refuses a resolved row (409), an unknown row or catalogue (404), a bad or superseded report (400)', async () => {
    expect(await status(resolveMergedEventReview(CATALOGUE, 'ev-3', 'keep', { userId: 'u' }))).toBe(409);
    expect(await status(resolveMergedEventReview(CATALOGUE, 'ev-4', 'keep', { userId: 'u' }))).toBe(409);
    expect(await status(resolveMergedEventReview(CATALOGUE, 'missing', 'keep', { userId: 'u' }))).toBe(404);
    expect(await status(resolveMergedEventReview('nope', 'ev-1', 'keep', { userId: 'u' }))).toBe(404);
    expect(await status(resolveMergedEventReview(CATALOGUE, 'ev-1', { report: 7 }, { userId: 'u' }))).toBe(400);
    expect(await status(resolveMergedEventReview(CATALOGUE, 'ev-1', { report: -1 }, { userId: 'u' }))).toBe(400);

    const row = storedEvent('ev-2');
    const entries = JSON.parse(row.source_events);
    entries[0].superseded = true;
    row.source_events = JSON.stringify(entries);
    expect(await status(resolveMergedEventReview(CATALOGUE, 'ev-2', { report: 0 }, { userId: 'u' }))).toBe(400);
    // Nothing above changed the row or the catalogue.
    expect(storedEvent('ev-1').review_status).toBe('pending');
    expect(catalogueVersion()).toBe('1.0.0');
  });
});
