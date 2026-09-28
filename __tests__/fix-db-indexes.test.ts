/**
 * @jest-environment node
 *
 * Finding #61: init-database, create-indexes and ensure-indexes created the same key
 * patterns under different names. MongoDB refuses a second index on an existing key
 * pattern under another name (IndexOptionsConflict, code 85), so the documented
 * init-database -> create-indexes sequence exited 1 and ensure-indexes aborted before
 * its later indexes. All three now apply one shared list (lib/event-indexes.ts) and
 * skip an index whose key pattern already exists.
 *
 * The fake database below enforces MongoDB's conflict rules, and the real scripts are
 * run against it (connection, dotenv and process.exit stubbed).
 */

jest.mock('dotenv/config', () => ({}));

type Key = Record<string, number>;
interface Index { name: string; key: Key; unique?: boolean; expireAfterSeconds?: number; partialFilterExpression?: object }

const sameKey = (a: Key, b: Key) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));

class FakeIndexedCollection {
  list: Index[] = [];
  exists = false;
  conflicts = 0;
  async indexes() {
    if (!this.exists) throw Object.assign(new Error('ns does not exist'), { code: 26 });
    return [{ name: '_id_', key: { _id: 1 } }, ...this.list.map((i) => ({ ...i }))];
  }
  async createIndex(key: Key, options: Partial<Index> = {}) {
    this.exists = true;
    const name = options.name ?? Object.entries(key).map(([k, v]) => `${k}_${v}`).join('_');
    const byName = this.list.find((i) => i.name === name);
    const byKey = this.list.find((i) => sameKey(i.key, key));
    if (byName && !sameKey(byName.key, key)) {
      this.conflicts++;
      throw Object.assign(new Error(`An existing index has the same name as the requested index: ${name}`), { code: 86 });
    }
    if (byKey && byKey.name !== name) {
      this.conflicts++;
      throw Object.assign(new Error(`Index already exists with a different name: ${byKey.name}`), { code: 85 });
    }
    if (!byName) this.list.push({ name, key, ...options });
    return name;
  }
}

const collections = new Map<string, FakeIndexedCollection>();
const fakeDb = {
  databaseName: 'fake_db',
  collection: (name: string) => {
    if (!collections.has(name)) collections.set(name, new FakeIndexedCollection());
    return collections.get(name)!;
  },
  createCollection: async (name: string) => {
    const c = fakeDb.collection(name);
    if (c.exists) throw Object.assign(new Error('Collection already exists'), { code: 48 });
    c.exists = true;
  },
};

jest.mock('@/lib/mongodb', () => ({
  COLLECTIONS: jest.requireActual('@/lib/mongodb').COLLECTIONS,
  getDb: jest.fn(async () => fakeDb),
  closeConnection: jest.fn(async () => undefined),
  getCollection: jest.fn(),
}));
// The scripts' '../lib/mongodb' resolves to the same file, so this mock covers them too.

import { DATABASE_INDEXES, ensureDatabaseIndexes } from '@/lib/event-indexes';
import { COLLECTIONS } from '@/lib/mongodb';

/** Run a script module as `npx tsx` would, and resolve to the exit code it chose. */
async function runScript(path: string): Promise<number> {
  let exit!: (code: number) => void;
  const exited = new Promise<number>((resolve) => { exit = resolve; });
  const spy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => { exit(code ?? 0); }) as never);
  try {
    jest.isolateModules(() => { require(path); });
    return await exited;
  } finally {
    spy.mockRestore();
  }
}

/** The indexes the pre-fix scripts/init-database.ts created, names and all. */
function seedLegacyInitDatabaseIndexes() {
  const add = (collection: string, name: string, key: Key, extra: Partial<Index> = {}) => {
    const c = fakeDb.collection(collection);
    c.exists = true;
    c.list.push({ name, key, ...extra });
  };
  add(COLLECTIONS.EVENTS, 'idx_id', { id: 1 }, { unique: true });
  add(COLLECTIONS.EVENTS, 'idx_catalogue_time', { catalogue_id: 1, time: -1 });
  add(COLLECTIONS.EVENTS, 'catalogue_time_id_idx', { catalogue_id: 1, time: -1, id: -1 });
  add(COLLECTIONS.EVENTS, 'idx_catalogue_magnitude', { catalogue_id: 1, magnitude: -1 });
  add(COLLECTIONS.CATALOGUES, 'idx_id', { id: 1 }, { unique: true });
  add(COLLECTIONS.USERS, 'idx_email', { email: 1 }, { unique: true });
  add(COLLECTIONS.SESSIONS, 'idx_user_id', { user_id: 1 });
  add(COLLECTIONS.PASSWORD_RESET_TOKENS, 'idx_token_hash', { token_hash: 1 }, { unique: true });
  add(COLLECTIONS.PASSWORD_RESET_TOKENS, 'idx_expires_at', { expires_at: 1 }, { expireAfterSeconds: 0 });
  add(COLLECTIONS.AUDIT_LOGS, 'idx_id', { id: 1 }, { unique: true });
}
/** The indexes the pre-fix scripts/create-indexes.ts created under its own names. */
function seedLegacyCreateIndexesIndexes() {
  const add = (collection: string, name: string, key: Key, extra: Partial<Index> = {}) => {
    const c = fakeDb.collection(collection);
    c.exists = true;
    c.list.push({ name, key, ...extra });
  };
  add(COLLECTIONS.EVENTS, 'idx_events_magnitude', { catalogue_id: 1, magnitude: 1 });
  add(COLLECTIONS.EVENTS, 'idx_events_location', { catalogue_id: 1, latitude: 1, longitude: 1 });
  add(COLLECTIONS.CATALOGUES, 'idx_catalogues_created_at', { created_at: -1 });
  add(COLLECTIONS.USERS, 'idx_users_email', { email: 1 }, { unique: true });
  add(COLLECTIONS.PASSWORD_RESET_TOKENS, 'idx_reset_tokens_hash', { token_hash: 1 }, { unique: true });
}

const conflicts = () => Array.from(collections.values()).reduce((n, c) => n + c.conflicts, 0);

beforeEach(() => {
  collections.clear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('#61 :: one shared index list', () => {
  it('names each index once and never repeats a key pattern within a collection', () => {
    const byCollection = new Map<string, typeof DATABASE_INDEXES[number][]>();
    for (const def of DATABASE_INDEXES) {
      byCollection.set(def.collection, [...(byCollection.get(def.collection) ?? []), def]);
    }
    byCollection.forEach((defs) => {
      expect(new Set(defs.map((d) => d.name)).size).toBe(defs.length);
      expect(new Set(defs.map((d) => JSON.stringify(Object.entries(d.key)))).size).toBe(defs.length);
    });
  });

  it('indexes audit logs by the fields entries carry (actor_id, target_id, created_at), not user_id', () => {
    const audit = DATABASE_INDEXES.filter((d) => d.collection === COLLECTIONS.AUDIT_LOGS).map((d) => Object.keys(d.key));
    expect(audit).toEqual(expect.arrayContaining([['created_at'], ['actor_id', 'created_at'], ['target_id', 'created_at']]));
    expect(audit.flat()).not.toContain('user_id');
  });

  it('builds a fresh database without conflicts, and a second run creates nothing', async () => {
    const first = await ensureDatabaseIndexes(fakeDb as any, () => undefined);
    expect(first.failed).toEqual([]);
    expect(first.created).toHaveLength(DATABASE_INDEXES.length);
    const second = await ensureDatabaseIndexes(fakeDb as any, () => undefined);
    expect(second).toMatchObject({ created: [], failed: [] });
    expect(conflicts()).toBe(0);
  });

  it('accepts indexes an earlier script created under another name instead of failing', async () => {
    seedLegacyInitDatabaseIndexes();
    seedLegacyCreateIndexesIndexes();
    const report = await ensureDatabaseIndexes(fakeDb as any, () => undefined);
    expect(report.failed).toEqual([]);
    expect(conflicts()).toBe(0);
    expect(report.existing).toEqual(expect.arrayContaining([
      `${COLLECTIONS.EVENTS}.catalogue_magnitude_idx`, // as idx_events_magnitude
      `${COLLECTIONS.CATALOGUES}.catalogues_created_at_idx`, // as idx_catalogues_created_at
      `${COLLECTIONS.USERS}.idx_email`,
    ]));
  });

  it('reports an existing index that lacks the uniqueness or TTL the application needs', async () => {
    const users = fakeDb.collection(COLLECTIONS.USERS);
    users.exists = true;
    users.list.push({ name: 'email_1', key: { email: 1 } }); // not unique
    const tokens = fakeDb.collection(COLLECTIONS.PASSWORD_RESET_TOKENS);
    tokens.exists = true;
    tokens.list.push({ name: 'expires_at_1', key: { expires_at: 1 } }); // no TTL
    const report = await ensureDatabaseIndexes(fakeDb as any, () => undefined);
    expect(report.failed.map((f) => f.index)).toEqual([
      `${COLLECTIONS.USERS}.idx_email`,
      `${COLLECTIONS.PASSWORD_RESET_TOKENS}.idx_expires_at`,
    ]);
  });

  it.each([
    [['../scripts/init-database', '../scripts/create-indexes', '../scripts/ensure-indexes']],
    [['../scripts/create-indexes', '../scripts/init-database']],
    [['../scripts/ensure-indexes', '../scripts/create-indexes', '../scripts/init-database']],
  ])('the three scripts succeed in any order: %j', async (order) => {
    seedLegacyInitDatabaseIndexes(); // a database set up by the old init-database
    for (const script of order) {
      if (script.endsWith('ensure-indexes')) {
        // Exported for programmatic use; run it the same way the CLI does.
        const { ensureIndexes } = jest.requireActual(script) as { ensureIndexes: () => Promise<unknown> };
        await expect(ensureIndexes()).resolves.toBeDefined();
      } else {
        expect(await runScript(script)).toBe(0);
      }
    }
    expect(conflicts()).toBe(0);
  });
});
