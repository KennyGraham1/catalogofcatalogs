/**
 * @jest-environment node
 *
 * gs#6: scripts/migrate-auth-schema.ts checked for an existing admin with an
 * EXACT-case `findOne({ email: adminEmail })` and inserted ADMIN_EMAIL verbatim,
 * while createUser always stores trim().toLowerCase() and login matches
 * case-insensitively. Running the migration with ADMIN_EMAIL="Admin@Org.nz"
 * against a self-registered "admin@org.nz" viewer created a second, differently
 * cased admin row instead of recognising the account already existed.
 *
 * The fix routes admin bootstrapping through the app's own createUser /
 * getUserByEmail (lib/auth/utils.ts) instead of a hand-rolled query, so it is
 * exactly as case-insensitive as login. This drives the REAL
 * migrateAuthSchema(), createUser and getUserByEmail against an in-memory fake
 * users collection (only the MongoDB driver is faked).
 */

// This file has no top-level static import (every module under test is loaded
// dynamically after mocks/env are set up); `export {}` marks it as an ES module
// so TS scopes its declarations to this file instead of the global script scope
// shared with other import-less files (avoids cross-file "duplicate function"
// name collisions under `tsc`).
export {};

interface FakeUserDoc {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  jwt_version?: number;
}

function makeUsersCollection(seed: FakeUserDoc[]) {
  const store: FakeUserDoc[] = [...seed];
  return {
    _store: store,
    findOne: jest.fn(async (filter: any) => {
      if (filter?.email?.$regex instanceof RegExp) {
        return store.find((u) => filter.email.$regex.test(u.email)) ?? null;
      }
      if (filter?.email) return store.find((u) => u.email === filter.email) ?? null;
      if (filter?.id) return store.find((u) => u.id === filter.id) ?? null;
      return null;
    }),
    insertOne: jest.fn(async (doc: FakeUserDoc) => {
      store.push(doc);
      return { insertedId: doc.id };
    }),
    find: jest.fn(() => ({ toArray: async () => [...store] })),
    // The migration checks existing indexes by key pattern before creating any.
    indexes: jest.fn(async () => [{ name: '_id_', key: { _id: 1 } }]),
    createIndex: jest.fn(async () => 'idx'),
    countDocuments: jest.fn(async (filter: any) => {
      if (filter?.is_active?.$exists === false) {
        return store.filter((u) => !('is_active' in u)).length;
      }
      return store.length;
    }),
    updateMany: jest.fn(async (filter: any, update: any) => {
      const matched = filter?.is_active?.$exists === false
        ? store.filter((u) => !('is_active' in u))
        : store;
      for (const doc of matched) Object.assign(doc, update.$set);
      return { matchedCount: matched.length, modifiedCount: matched.length };
    }),
  };
}

function makeUserRolesCollection() {
  const store: any[] = [];
  return {
    _store: store,
    updateOne: jest.fn(async (filter: any, update: any, opts?: any) => {
      const existing = store.find((r) => r.role === filter.role);
      if (existing) {
        Object.assign(existing, update.$set);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
      if (opts?.upsert) {
        store.push({ ...update.$set });
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }),
    indexes: jest.fn(async () => [{ name: '_id_', key: { _id: 1 } }]),
    createIndex: jest.fn(async () => 'idx'),
  };
}

async function setup(seedUsers: FakeUserDoc[]) {
  jest.resetModules();
  const usersCollection = makeUsersCollection(seedUsers);
  const userRolesCollection = makeUserRolesCollection();
  const fakeDb = {
    databaseName: 'fixscripts-auth-test',
    collection: jest.fn((name: string) => (name === 'users' ? usersCollection : userRolesCollection)),
  };

  jest.doMock('@/lib/mongodb', () => ({
    getDb: jest.fn(async () => fakeDb),
    closeConnection: jest.fn(async () => {}),
    getCollection: jest.fn(async (name: string) => (name === 'users' ? usersCollection : userRolesCollection)),
    COLLECTIONS: { USERS: 'users', USER_ROLES: 'user_roles', SESSIONS: 'sessions' },
  }));
  jest.doMock('dotenv', () => ({ config: jest.fn() }));

  const { migrateAuthSchema } = await import('@/scripts/migrate-auth-schema');
  return { migrateAuthSchema, usersCollection };
}

function makeExistingViewer(email: string, id = 'user_existing'): FakeUserDoc {
  return {
    id,
    email, // createUser always stores this already trim().toLowerCase()'d
    name: 'Existing Viewer',
    password_hash: '$2b$10$abcdefghijklmnopqrstuv', // unused by this test
    role: 'viewer',
    is_active: true,
    email_verified: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };
}

describe('gs#6 migrate-auth-schema.ts admin bootstrap is case-insensitive', () => {
  const ORIGINAL_ENV = { ...process.env };
  const ORIGINAL_ARGV = [...process.argv];

  beforeEach(() => {
    process.env.CREATE_ADMIN_USER = 'true';
    process.env.ADMIN_PASSWORD = 'temporary-strong-pw-123';
    process.env.ADMIN_NAME = 'Admin';
    process.argv = ['node', 'migrate-auth-schema.ts', '--yes'];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.argv = [...ORIGINAL_ARGV];
    jest.dontMock('@/lib/mongodb');
    jest.dontMock('dotenv');
  });

  it('does NOT create a duplicate admin when an existing account differs only in case (the core defect)', async () => {
    process.env.ADMIN_EMAIL = 'Admin@Org.nz';
    const { migrateAuthSchema, usersCollection } = await setup([makeExistingViewer('admin@org.nz')]);

    await migrateAuthSchema();

    // The old exact-case findOne({ email: 'Admin@Org.nz' }) found nothing against
    // the stored 'admin@org.nz' row and inserted a SECOND admin row. There must
    // be exactly one user for this address, and its role must be untouched
    // (still viewer) -- this script creates an account, it does not silently
    // promote one that already exists under a different case.
    const matches = usersCollection._store.filter((u: FakeUserDoc) => u.email.toLowerCase() === 'admin@org.nz');
    expect(matches).toHaveLength(1);
    expect(matches[0].role).toBe('viewer');
  });

  it('creates the admin (normalised to lower-case) when no account exists yet', async () => {
    process.env.ADMIN_EMAIL = 'Admin@Org.nz';
    const { migrateAuthSchema, usersCollection } = await setup([]);

    await migrateAuthSchema();

    expect(usersCollection._store).toHaveLength(1);
    expect(usersCollection._store[0].email).toBe('admin@org.nz'); // createUser's trim().toLowerCase()
    expect(usersCollection._store[0].role).toBe('admin');
    // A real bcrypt hash was produced (createUser was actually used), not a
    // hand-rolled insert.
    expect(usersCollection._store[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('is also insulated from a mismatch the other way around (existing admin, differently-cased ADMIN_EMAIL)', async () => {
    process.env.ADMIN_EMAIL = 'admin@org.nz';
    const { migrateAuthSchema, usersCollection } = await setup([{ ...makeExistingViewer('admin@org.nz'), role: 'admin' }]);

    await migrateAuthSchema();

    expect(usersCollection._store).toHaveLength(1);
  });
});

describe('migrate-auth-schema.ts step 5: backfill users missing is_active (idempotent, dry-run by default)', () => {
  const ORIGINAL_ENV = { ...process.env };
  const ORIGINAL_ARGV = [...process.argv];

  beforeEach(() => {
    process.env.CREATE_ADMIN_USER = 'false'; // isolate this step from admin creation
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.argv = [...ORIGINAL_ARGV];
    jest.dontMock('@/lib/mongodb');
    jest.dontMock('dotenv');
  });

  const legacyUserMissingActive = (id: string): FakeUserDoc => {
    const u = makeExistingViewer(`${id}@example.com`, id);
    return { ...u, is_active: undefined as unknown as boolean }; // simulate the field being wholly absent
  };
  const stripUndefined = (u: FakeUserDoc) => JSON.parse(JSON.stringify(u));

  it('dry run (default): reports the count but does not write', async () => {
    process.argv = ['node', 'migrate-auth-schema.ts', '--yes'];
    const seed = [stripUndefined(legacyUserMissingActive('u1')), makeExistingViewer('u2@example.com', 'u2')];
    const { migrateAuthSchema, usersCollection } = await setup(seed);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await migrateAuthSchema();
    const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    logSpy.mockRestore();

    expect(logged).toMatch(/1 user\(s\) are missing is_active/);
    expect('is_active' in usersCollection._store[0]).toBe(false); // still absent -- dry run
  });

  it('--write sets is_active: true on exactly the users missing it, and leaves explicit values alone', async () => {
    process.argv = ['node', 'migrate-auth-schema.ts', '--yes', '--write'];
    const seed = [
      stripUndefined(legacyUserMissingActive('u1')),
      { ...makeExistingViewer('u2@example.com', 'u2'), is_active: false }, // explicit false -- must stay false
      makeExistingViewer('u3@example.com', 'u3'), // explicit true already
    ];
    const { migrateAuthSchema, usersCollection } = await setup(seed);

    await migrateAuthSchema();

    const byId = (id: string) => {
      const u = usersCollection._store.find((doc: FakeUserDoc) => doc.id === id);
      expect(u).toBeDefined();
      return u as FakeUserDoc;
    };
    expect(byId('u1').is_active).toBe(true); // backfilled
    expect(byId('u2').is_active).toBe(false); // untouched -- an explicit deactivation is not overridden
    expect(byId('u3').is_active).toBe(true); // untouched, already true
  });

  it('is idempotent: a second --write run finds nothing left to do', async () => {
    process.argv = ['node', 'migrate-auth-schema.ts', '--yes', '--write'];
    const seed = [stripUndefined(legacyUserMissingActive('u1'))];
    const { migrateAuthSchema, usersCollection } = await setup(seed);

    await migrateAuthSchema();
    expect(usersCollection._store[0].is_active).toBe(true);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await migrateAuthSchema();
    const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    logSpy.mockRestore();

    expect(logged).toMatch(/No users are missing is_active/);
  });
});
