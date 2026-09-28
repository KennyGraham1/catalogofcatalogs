/**
 * @jest-environment node
 *
 * Smoke test: confirms jest.mock('@/lib/mongodb', ...) also intercepts a
 * *relative*, *dynamic* import('../../lib/mongodb') from scripts/lib/db-target.ts
 * (Jest's module registry keys by resolved file path, not by the import
 * specifier string, so the alias and the relative path should hit the same
 * mock). This is load-bearing for every scripts/*.ts test that goes through
 * resolveDbTarget() — if this assumption were wrong, every one of those tests
 * would silently try to hit a real database instead of the fake.
 */

const fakeDb = { databaseName: 'smoke-test-db', collection: jest.fn() };
const getDb = jest.fn(async () => fakeDb);
const closeConnection = jest.fn(async () => {});

jest.mock('@/lib/mongodb', () => ({ getDb, closeConnection }));
jest.mock('dotenv', () => ({ config: jest.fn() }));

import { resolveDbTarget } from '@/scripts/lib/db-target';

describe('dynamic import interception smoke test', () => {
  it('resolveDbTarget() gets the mocked Db, not a real connection', async () => {
    const target = await resolveDbTarget();
    expect(getDb).toHaveBeenCalledTimes(1);
    expect(target.db).toBe(fakeDb);
    expect(target.db.databaseName).toBe('smoke-test-db');
    await target.close();
    expect(closeConnection).toHaveBeenCalledTimes(1);
  });
});
