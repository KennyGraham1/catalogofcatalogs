/** @jest-environment node */

/**
 * Storage of merge QC summaries (lib/db.ts): one document per merged catalogue in
 * merge_qc_summaries, written with the merge's session, read back by catalogue id,
 * removed with the catalogue (and by the integrity sweep when the catalogue is gone), and
 * a unique index on catalogue_id among the indexes database setup creates. The real data
 * layer runs against an in-memory stand-in for the MongoDB collections.
 */

type Doc = Record<string, any>;

const matches = (doc: Doc, filter: Doc) =>
  Object.entries(filter).every(([key, value]) =>
    value !== null && typeof value === 'object' && Array.isArray(value.$in) ? value.$in.includes(doc[key]) : doc[key] === value
  );

class FakeCollection {
  docs: Doc[] = [];
  insertOptions: unknown[] = [];
  async insertOne(doc: Doc, options?: unknown) {
    this.insertOptions.push(options);
    this.docs.push({ _id: `oid-${this.docs.length}`, ...JSON.parse(JSON.stringify(doc)) });
    return { acknowledged: true };
  }
  async findOne(filter: Doc, options: Doc = {}) {
    const doc = this.docs.find(d => matches(d, filter));
    if (!doc) return null;
    const copy = JSON.parse(JSON.stringify(doc));
    if (options.projection?._id === 0) delete copy._id;
    return copy;
  }
  find(filter: Doc = {}) {
    const docs = this.docs.filter(d => matches(d, filter)).map(d => ({ ...d }));
    return { toArray: async () => docs };
  }
  async updateOne(filter: Doc, update: Doc) {
    const doc = this.docs.find(d => matches(d, filter));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(doc, update.$set ?? {});
    return { matchedCount: 1, modifiedCount: 1 };
  }
  async deleteOne(filter: Doc) {
    const index = this.docs.findIndex(d => matches(d, filter));
    if (index >= 0) this.docs.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  }
  async deleteMany(filter: Doc) {
    const before = this.docs.length;
    this.docs = this.docs.filter(d => !matches(d, filter));
    return { deletedCount: before - this.docs.length };
  }
  async countDocuments(filter: Doc = {}) {
    return this.docs.filter(d => matches(d, filter)).length;
  }
  async distinct(field: string) {
    return Array.from(new Set(this.docs.map(d => d[field]).filter(v => v !== undefined)));
  }
  async bulkWrite() {
    return { ok: 1 };
  }
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

import { dbQueries } from '@/lib/db';
import { COLLECTIONS } from '@/lib/mongodb';
import { DATABASE_INDEXES } from '@/lib/event-indexes';
import type { MergeQcSummary } from '@/lib/merge-qc';

const q = dbQueries!;
const QC = COLLECTIONS.MERGE_QC_SUMMARIES;

const summary = (eventsAfter: number) => ({
  version: 1,
  generatedAt: '2026-10-04T00:00:00.000Z',
  generatedBy: 'Earthquake Catalogue Platform 0.1.0',
  config: { timeThreshold: 60 },
  sourceCatalogues: [],
  totals: { entriesBefore: eventsAfter, eventsAfter, matchedGroups: 0, entriesCombined: 0, flaggedGroups: 0, keptApartEntries: 0, splits: 0, heldForReview: 0, supersededEntries: 0 },
  perCatalogue: [],
  pairwise: [],
  windowUse: { nearTimeLimit: 0, nearDistanceLimit: 0, matchedPairs: 0 },
  listedGroups: [],
  listedGroupsTotal: 0,
}) as MergeQcSummary;

beforeEach(() => store.clear());

it('is stored once per catalogue, with the session it is given, and read back by catalogue id', async () => {
  const session = { id: 'merge-session' } as any;
  await q.insertMergeQcSummary('cat-1', summary(4), session);
  expect(collection(QC).insertOptions).toEqual([{ session }]);
  const [doc] = collection(QC).docs;
  expect(doc.catalogue_id).toBe('cat-1');
  expect(doc.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const stored = await q.getMergeQcSummary('cat-1');
  expect(stored).toEqual({ catalogue_id: 'cat-1', created_at: doc.created_at, summary: summary(4) });
  await expect(q.getMergeQcSummary('cat-2')).resolves.toBeNull();
});

it('is deleted with its catalogue', async () => {
  collection(COLLECTIONS.CATALOGUES).docs.push({ id: 'cat-1', name: 'Merged', status: 'complete' }, { id: 'cat-2', name: 'Other', status: 'complete' });
  await q.insertMergeQcSummary('cat-1', summary(4));
  await q.insertMergeQcSummary('cat-2', summary(5));
  await expect(q.deleteCatalogue('cat-1')).resolves.toBe(true);
  await expect(q.getMergeQcSummary('cat-1')).resolves.toBeNull();
  expect((await q.getMergeQcSummary('cat-2'))?.summary.totals.eventsAfter).toBe(5);
});

it('is swept when its catalogue no longer exists', async () => {
  collection(COLLECTIONS.CATALOGUES).docs.push({ id: 'live', name: 'Live', status: 'complete' });
  await q.insertMergeQcSummary('live', summary(1));
  await q.insertMergeQcSummary('gone', summary(2));
  const report = await q.sweepOrphans();
  expect(report.orphanedCatalogueIds).toEqual(['gone']);
  expect(collection(QC).docs).toHaveLength(2); // a dry run by default
  await q.sweepOrphans({ apply: true });
  expect(collection(QC).docs.map(d => d.catalogue_id)).toEqual(['live']);
});

it('has a unique index on catalogue_id among the indexes database setup creates', () => {
  expect(DATABASE_INDEXES.filter(index => index.collection === 'merge_qc_summaries')).toEqual([
    { collection: 'merge_qc_summaries', name: 'merge_qc_catalogue_unique_idx', key: { catalogue_id: 1 }, options: { unique: true } },
  ]);
});
