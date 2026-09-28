/**
 * @jest-environment node
 *
 * scripts/promote-to-admin.ts previously looked a user up with an exact-case
 * `findOne({ email })`. That fails loudly (not silently) on a case mismatch —
 * lower severity than gs#6's migrate-auth-schema.ts duplicate-admin defect —
 * but since promote-to-admin.ts is being touched for the same
 * getDb()/confirmation fixes (gs#3/gs#4), it now reuses getUserByEmail so a
 * differently-cased email promotes the right account on the first try instead
 * of requiring an exact-case retry.
 */

// No top-level static import in this file (modules under test are loaded
// dynamically); `export {}` marks it as an ES module so its declarations don't
// collide with same-named ones in other import-less test files under `tsc`.
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
}

function makeUsersCollection(seed: FakeUserDoc[]) {
  const store: FakeUserDoc[] = [...seed];
  return {
    _store: store,
    findOne: jest.fn(async (filter: any) => {
      if (filter?.email?.$regex instanceof RegExp) {
        return store.find((u) => filter.email.$regex.test(u.email)) ?? null;
      }
      if (filter?.id) return store.find((u) => u.id === filter.id) ?? null;
      return null;
    }),
    find: jest.fn(() => ({ toArray: async () => [...store] })),
    updateOne: jest.fn(async (filter: any, update: any) => {
      const doc = store.find((u) => u.id === filter.id);
      if (doc && update.$set) Object.assign(doc, update.$set);
      return { modifiedCount: doc ? 1 : 0 };
    }),
  };
}

async function setup(seedUsers: FakeUserDoc[]) {
  jest.resetModules();
  const usersCollection = makeUsersCollection(seedUsers);
  const fakeDb = { databaseName: 'fixscripts-promote-test', collection: jest.fn(() => usersCollection) };

  jest.doMock('@/lib/mongodb', () => ({
    getDb: jest.fn(async () => fakeDb),
    closeConnection: jest.fn(async () => {}),
    getCollection: jest.fn(async () => usersCollection),
    COLLECTIONS: { USERS: 'users' },
  }));
  jest.doMock('dotenv', () => ({ config: jest.fn() }));

  const { promoteToAdmin } = await import('@/scripts/promote-to-admin');
  return { promoteToAdmin, usersCollection };
}

const viewer = (email: string): FakeUserDoc => ({
  id: 'user_1', email, name: 'Viewer', password_hash: 'x', role: 'viewer',
  is_active: true, email_verified: true, created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z',
});

describe('promote-to-admin.ts (case-insensitive lookup, extends gs#6)', () => {
  afterEach(() => {
    jest.dontMock('@/lib/mongodb');
    jest.dontMock('dotenv');
  });

  it('promotes an account found by a differently-cased email argument', async () => {
    process.argv = ['node', 'promote-to-admin.ts', 'Viewer@Example.com', '--yes'];
    const { promoteToAdmin, usersCollection } = await setup([viewer('viewer@example.com')]);

    await promoteToAdmin('Viewer@Example.com');

    expect(usersCollection._store[0].role).toBe('admin');
  });

  it('refuses to promote without confirmation in a non-interactive shell', async () => {
    process.argv = ['node', 'promote-to-admin.ts', 'viewer@example.com']; // no --yes
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    try {
      const { promoteToAdmin, usersCollection } = await setup([viewer('viewer@example.com')]);
      await promoteToAdmin('viewer@example.com');
      expect(usersCollection._store[0].role).toBe('viewer'); // unchanged
      expect(process.exitCode).toBe(1);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      process.exitCode = 0;
    }
  });
});
