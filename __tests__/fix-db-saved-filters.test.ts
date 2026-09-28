/**
 * @jest-environment node
 *
 * Findings #56 / #119: saved filters had no owner. Any signed-in account (and
 * registration hands out VIEWER to anyone) could overwrite or delete every user's
 * filters, the list was served without authentication, a PUT on an unknown id
 * answered 200, and the stored configuration was unbounded.
 *
 * Runs the real route handlers and the real lib/db.ts against an in-memory
 * saved_filters collection; only the session lookup is stubbed.
 */

import { NextRequest, NextResponse } from 'next/server';

type Doc = Record<string, any>;
const store: { docs: Doc[] } = { docs: [] };
const matches = (doc: Doc, filter: Doc) => Object.entries(filter).every(([k, v]) => doc[k] === v);
const savedFilters = {
  insertOne: jest.fn(async (doc: Doc) => { store.docs.push({ ...doc }); return { acknowledged: true }; }),
  find: jest.fn((filter: Doc) => {
    const rows = store.docs.filter((d) => matches(d, filter));
    const cursor = { sort: () => cursor, toArray: async () => rows.map((d) => ({ ...d })) };
    return cursor;
  }),
  findOne: jest.fn(async (filter: Doc) => store.docs.find((d) => matches(d, filter)) ?? null),
  countDocuments: jest.fn(async (filter: Doc) => store.docs.filter((d) => matches(d, filter)).length),
  updateOne: jest.fn(async (filter: Doc, update: Doc) => {
    const doc = store.docs.find((d) => matches(d, filter));
    if (doc) Object.assign(doc, update.$set);
    return { matchedCount: doc ? 1 : 0 };
  }),
  deleteOne: jest.fn(async (filter: Doc) => {
    const i = store.docs.findIndex((d) => matches(d, filter));
    if (i >= 0) store.docs.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }),
};

jest.mock('@/lib/mongodb', () => ({
  COLLECTIONS: jest.requireActual('@/lib/mongodb').COLLECTIONS,
  getCollection: jest.fn(async () => savedFilters),
  getDb: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('@/lib/auth/middleware', () => ({ requireViewer: jest.fn() }));

import { requireViewer } from '@/lib/auth/middleware';
import { GET as list, POST as create } from '@/app/api/saved-filters/route';
import { GET as getOne, PUT as update, DELETE as remove } from '@/app/api/saved-filters/[id]/route';
import { MAX_SAVED_FILTERS_PER_USER } from '@/app/api/saved-filters/validation';

const alice = { id: 'alice', email: 'alice@example.test', role: 'viewer' };
const mallory = { id: 'mallory', email: 'm@example.test', role: 'viewer' };
const admin = { id: 'root', email: 'root@example.test', role: 'admin' };
const as = (user: Doc | null) => (requireViewer as jest.Mock).mockResolvedValue(
  user ? { user } : NextResponse.json({ error: 'Authentication required' }, { status: 401 }));

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function aliceCreates(name = 'Kermadec M>=4') {
  as(alice);
  const response = await create(req('/api/saved-filters', 'POST', {
    name, description: 'deep events', filterConfig: { minMagnitude: 4, minLongitude: 177, maxLongitude: -178 },
  }));
  expect(response.status).toBe(201);
  return (await response.json()).id as string;
}

beforeEach(() => {
  store.docs = [];
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('#56 / #119 :: saved filters are personal', () => {
  it('stores the owner on create', async () => {
    const id = await aliceCreates();
    expect(store.docs).toEqual([expect.objectContaining({ id, owner_id: 'alice' })]);
  });

  it('refuses the list to anonymous callers and lists only the caller\'s own filters', async () => {
    await aliceCreates();
    as(null);
    expect((await list(req('/api/saved-filters'))).status).toBe(401);
    as(mallory);
    expect(await (await list(req('/api/saved-filters'))).json()).toEqual([]);
    as(alice);
    expect((await (await list(req('/api/saved-filters'))).json()).map((f: Doc) => f.name)).toEqual(['Kermadec M>=4']);
  });

  it('another viewer can neither read, overwrite nor delete it (404, filter unchanged)', async () => {
    const id = await aliceCreates();
    as(mallory);
    expect((await getOne(req(`/api/saved-filters/${id}`), ctx(id))).status).toBe(404);
    const put = await update(req(`/api/saved-filters/${id}`, 'PUT', { name: 'pwned', filterConfig: { minMagnitude: 9 } }), ctx(id));
    expect(put.status).toBe(404);
    expect((await remove(req(`/api/saved-filters/${id}`, 'DELETE'), ctx(id))).status).toBe(404);
    expect(store.docs[0]).toMatchObject({ name: 'Kermadec M>=4', filter_config: JSON.stringify({ minMagnitude: 4, minLongitude: 177, maxLongitude: -178 }) });
  });

  it('the owner can update and delete it', async () => {
    const id = await aliceCreates();
    as(alice);
    const put = await update(req(`/api/saved-filters/${id}`, 'PUT', { name: 'Renamed', filterConfig: { minMagnitude: 5 } }), ctx(id));
    expect(put.status).toBe(200);
    expect((await (await getOne(req(`/api/saved-filters/${id}`), ctx(id))).json()).filterConfig).toEqual({ minMagnitude: 5 });
    expect((await remove(req(`/api/saved-filters/${id}`, 'DELETE'), ctx(id))).status).toBe(200);
    expect(store.docs).toEqual([]);
  });

  it('an administrator may manage any filter, including legacy ones without an owner', async () => {
    const id = await aliceCreates();
    store.docs.push({ id: 'legacy', name: 'Old', description: null, filter_config: '{}' });
    as(admin);
    expect((await getOne(req('/api/saved-filters/legacy'), ctx('legacy'))).status).toBe(200);
    expect((await remove(req(`/api/saved-filters/${id}`, 'DELETE'), ctx(id))).status).toBe(200);
  });

  it('answers 404 for an update of a filter that does not exist', async () => {
    as(alice);
    const put = await update(req('/api/saved-filters/nope', 'PUT', { name: 'x', filterConfig: { a: 1 } }), ctx('nope'));
    expect(put.status).toBe(404);
  });

  it.each([
    [{ name: 'x', filterConfig: [1, 2] }, 'filterConfig'],
    [{ name: 'x', filterConfig: { blob: 'x'.repeat(20_000) } }, 'filterConfig'],
    [{ name: 'x', filterConfig: { a: { b: { c: { d: { e: { f: 1 } } } } } } }, 'nested'],
    [{ name: 'x'.repeat(101), filterConfig: { a: 1 } }, 'name'],
    [{ name: 'x', description: 'd'.repeat(501), filterConfig: { a: 1 } }, 'description'],
    [{ name: 'x' }, 'filterConfig'],
  ])('rejects an invalid or oversized filter (%#)', async (body, message) => {
    as(alice);
    const response = await create(req('/api/saved-filters', 'POST', body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(message);
    expect(store.docs).toEqual([]);
  });

  it('caps how many filters one user may keep', async () => {
    for (let i = 0; i < MAX_SAVED_FILTERS_PER_USER; i++) {
      store.docs.push({ id: `f${i}`, owner_id: 'alice', name: `f${i}`, filter_config: '{}' });
    }
    as(alice);
    const response = await create(req('/api/saved-filters', 'POST', { name: 'one more', filterConfig: { a: 1 } }));
    expect(response.status).toBe(409);
  });
});
