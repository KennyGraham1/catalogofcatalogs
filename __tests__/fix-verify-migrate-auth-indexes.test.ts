/**
 * @jest-environment node
 *
 * Integration defect found by the end-to-end verification: scripts/init-database.ts (and
 * create-indexes / ensure-indexes) now create the users.role index as 'users_role_idx', from
 * the shared DATABASE_INDEXES list in lib/event-indexes.ts, while scripts/migrate-auth-schema.ts
 * (`npm run migrate:auth`, which creates the first admin) still called
 * createIndex({ role: 1 }) under MongoDB's default name 'role_1'. MongoDB refuses a second
 * index on an existing key pattern under another name (IndexOptionsConflict, code 85), so the
 * documented setup - initialise the database, then run migrate:auth - failed before the admin
 * account was created (seen live against MongoDB 7.0).
 *
 * The fake database below enforces MongoDB's index-conflict rules, and the REAL
 * ensureDatabaseIndexes() and migrateAuthSchema() run against it (only the driver connection
 * and dotenv are stubbed).
 */
export {};

type Key = Record<string, number>;
interface Index { name: string; key: Key; unique?: boolean; expireAfterSeconds?: number }

const sameKey = (a: Key, b: Key) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));

class FakeCollection {
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
  // The rest of the surface migrate-auth-schema.ts uses (role upserts, the is_active check).
  async updateOne() { this.exists = true; return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }; }
  async countDocuments() { return 0; }
  async updateMany() { return { matchedCount: 0, modifiedCount: 0 }; }
  async findOne() { return null; }
}

const collections = new Map<string, FakeCollection>();
const fakeDb = {
  databaseName: 'fake_auth_db',
  collection: (name: string) => {
    if (!collections.has(name)) collections.set(name, new FakeCollection());
    return collections.get(name)!;
  },
};

jest.mock('@/lib/mongodb', () => ({
  COLLECTIONS: jest.requireActual('@/lib/mongodb').COLLECTIONS,
  getDb: jest.fn(async () => fakeDb),
  closeConnection: jest.fn(async () => undefined),
  getCollection: jest.fn(),
}));
// scripts/lib/db-target.ts loads .env through dotenv's config(); nothing is read here.
jest.mock('dotenv', () => ({ config: jest.fn() }));

const ORIGINAL_ARGV = [...process.argv];
const conflicts = () => Array.from(collections.values()).reduce((n, c) => n + c.conflicts, 0);
const roleIndexes = () => fakeDb.collection('users').list.filter((i) => sameKey(i.key, { role: 1 }));

/** Fresh module instances, loaded after argv is set (the script reads --yes at load time). */
async function load() {
  jest.resetModules();
  process.argv = ['node', 'migrate-auth-schema.ts', '--yes'];
  const { migrateAuthSchema } = await import('@/scripts/migrate-auth-schema');
  const { ensureDatabaseIndexes } = await import('@/lib/event-indexes');
  const quiet = () => undefined;
  return { migrateAuthSchema, initDatabaseIndexes: () => ensureDatabaseIndexes(fakeDb as any, quiet) };
}

beforeEach(() => {
  collections.clear();
  delete process.env.CREATE_ADMIN_USER;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  process.argv = [...ORIGINAL_ARGV];
  process.exitCode = undefined;
});

describe('migrate:auth after init-database (shared index names)', () => {
  it('completes without an index conflict when init-database ran first', async () => {
    const { migrateAuthSchema, initDatabaseIndexes } = await load();
    const init = await initDatabaseIndexes();
    expect(init.failed).toEqual([]);

    await migrateAuthSchema();

    expect(process.exitCode).not.toBe(1);
    expect(conflicts()).toBe(0);
    // users.role exists once, under the shared name.
    expect(roleIndexes().map((i) => i.name)).toEqual(['users_role_idx']);
  });

  it('is idempotent, and init-database afterwards still finds every index present', async () => {
    const { migrateAuthSchema, initDatabaseIndexes } = await load();
    await migrateAuthSchema();
    await migrateAuthSchema();
    const init = await initDatabaseIndexes();

    expect(process.exitCode).not.toBe(1);
    expect(init.failed).toEqual([]);
    expect(conflicts()).toBe(0);
    expect(roleIndexes()).toHaveLength(1);
    const userRoles = fakeDb.collection('user_roles').list;
    expect(userRoles.filter((i) => i.unique).map((i) => Object.keys(i.key)[0]).sort()).toEqual(['id', 'role']);
  });

  it('accepts a database migrated by the earlier script (users.role stored as role_1)', async () => {
    const users = fakeDb.collection('users');
    users.exists = true;
    users.list.push({ name: 'role_1', key: { role: 1 } });

    const { migrateAuthSchema, initDatabaseIndexes } = await load();
    await migrateAuthSchema();
    const init = await initDatabaseIndexes();

    expect(process.exitCode).not.toBe(1);
    expect(init.failed).toEqual([]);
    expect(conflicts()).toBe(0);
    expect(roleIndexes().map((i) => i.name)).toEqual(['role_1']);
  });

  it('still fails loudly when an auth index exists without the uniqueness the app relies on', async () => {
    const roles = fakeDb.collection('user_roles');
    roles.exists = true;
    roles.list.push({ name: 'role_1', key: { role: 1 } }); // not unique

    const { migrateAuthSchema } = await load();
    await migrateAuthSchema();

    expect(process.exitCode).toBe(1);
  });
});
