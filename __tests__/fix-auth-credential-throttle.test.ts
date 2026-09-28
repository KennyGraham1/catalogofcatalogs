/**
 * @jest-environment node
 *
 * #126: the credential limiter must throttle guessing without letting anyone lock an
 * account's owner out.
 *
 * The audit #7 repair counted every attempt (successes included) against a hard
 * per-account limit of 10 that nothing ever reset, before the password was checked.
 * Ten requests from anywhere therefore locked the real owner out, even with the correct
 * password, and ten more after each 15-minute boundary kept them out.
 *
 * These tests run the real authorize() and the real limiter; the user store, bcrypt and
 * the auth_rate_limits collection are in-memory fakes.
 */

jest.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: (opts: unknown) => opts }));
jest.mock('@/lib/auth/utils', () => ({
  getUserByEmail: jest.fn(),
  verifyPassword: jest.fn(),
  updateLastLogin: jest.fn(async () => {}),
  toSafeUser: jest.fn((user: Record<string, unknown>) => user),
  getSessionUserState: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => {}) }));
jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: { AUTH_RATE_LIMITS: 'auth_rate_limits' },
}));

import type { authOptions as AuthOptions } from '@/lib/auth/config';
import type * as Limiter from '@/lib/auth/login-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;

// Fresh module instances per test: the limiter keeps process state (TTL-index
// readiness, the in-memory fallback store) that must not leak between tests.
let authOptions: typeof AuthOptions;
let beginCredentialAttempt: typeof Limiter.beginCredentialAttempt;
let rememberCredentialClient: typeof Limiter.rememberCredentialClient;
let auth: { getUserByEmail: jest.Mock; verifyPassword: jest.Mock };
let getCollection: jest.Mock;

type Doc = { attempts?: number; expires_at?: Date };

/** In-memory auth_rate_limits collection implementing the operations the limiter uses. */
function fakeLimiterCollection() {
  const docs = new Map<string, Doc>();
  const collection = {
    docs,
    createIndex: jest.fn(async () => 'expires_at_1'),
    findOneAndUpdate: jest.fn(async (filter: { _id: string }, update: { $inc?: { attempts: number }; $setOnInsert?: Doc }) => {
      const doc = docs.get(filter._id) ?? { ...(update.$setOnInsert ?? {}) };
      doc.attempts = (doc.attempts ?? 0) + (update.$inc?.attempts ?? 0);
      docs.set(filter._id, doc);
      return { _id: filter._id, ...doc };
    }),
    updateOne: jest.fn(async (
      filter: { _id: string; attempts?: { $gt: number } },
      update: { $inc?: { attempts: number }; $set?: Doc },
      options?: { upsert?: boolean },
    ) => {
      const doc = docs.get(filter._id);
      if (!doc) {
        if (options?.upsert) docs.set(filter._id, { ...(update.$set ?? {}) });
        return { matchedCount: 0 };
      }
      if (filter.attempts && !((doc.attempts ?? 0) > filter.attempts.$gt)) return { matchedCount: 0 };
      if (update.$inc) doc.attempts = (doc.attempts ?? 0) + update.$inc.attempts;
      if (update.$set) Object.assign(doc, update.$set);
      return { matchedCount: 1 };
    }),
    deleteOne: jest.fn(async (filter: { _id: string }) => ({ deletedCount: docs.delete(filter._id) ? 1 : 0 })),
    findOne: jest.fn(async (filter: { _id: string; expires_at?: { $gt: Date } }) => {
      const doc = docs.get(filter._id);
      if (!doc) return null;
      if (filter.expires_at && !(doc.expires_at && doc.expires_at > filter.expires_at.$gt)) return null;
      return { _id: filter._id, ...doc };
    }),
  };
  getCollection.mockResolvedValue(collection);
  return collection;
}

const users: Record<string, { id: string; email: string; name: string; role: string; is_active: boolean; password_hash: string }> = {};
function addUser(email: string, password: string) {
  users[email] = { id: `id-${email}`, email, name: email, role: 'admin', is_active: true, password_hash: `hash:${password}` };
}

function signIn(email: string, password: string, ip: string) {
  return (authOptions.providers[0] as any).authorize({ email, password }, { headers: { 'x-forwarded-for': ip } });
}

async function outcome(email: string, password: string, ip: string): Promise<'ok' | 'throttled' | 'invalid'> {
  try {
    await signIn(email, password, ip);
    return 'ok';
  } catch (error) {
    return /Too many|TooManyAttempts/.test((error as Error).message) ? 'throttled' : 'invalid';
  }
}

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.isolateModules(() => {
    ({ authOptions } = require('@/lib/auth/config'));
    ({ beginCredentialAttempt, rememberCredentialClient } = require('@/lib/auth/login-rate-limit'));
    auth = require('@/lib/auth/utils');
    ({ getCollection } = require('@/lib/mongodb'));
  });
  // Pin the clock one minute into a window so no test straddles a window boundary.
  const start = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS + 60_000;
  jest.spyOn(Date, 'now').mockReturnValue(start);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  auth.getUserByEmail.mockImplementation(async (email: string) => users[email] ?? null);
  auth.verifyPassword.mockImplementation(async (password: string, hash: string) => hash === `hash:${password}`);
});

afterEach(() => jest.restoreAllMocks());

describe('#126 no victim lockout', () => {
  it("lets the owner sign in with the right password after other clients' failures", async () => {
    fakeLimiterCollection();
    addUser('admin@gns.example', 'correct horse');

    // The finding's attacker: 10+ wrong guesses from one address...
    for (let i = 0; i < 30; i++) await outcome(' ADMIN@gns.example ', 'guess', '203.0.113.66');
    // ...plus ten more from each of five other addresses.
    for (let host = 1; host <= 5; host++) {
      for (let i = 0; i < 10; i++) await outcome('admin@gns.example', 'guess', `203.0.113.${host}`);
    }

    expect(await outcome('admin@gns.example', 'correct horse', '198.51.100.7')).toBe('ok');
  });

  it('does not count successful sign-ins', async () => {
    fakeLimiterCollection();
    addUser('busy@example.test', 'pw-busy');

    for (let i = 0; i < 30; i++) {
      expect(await outcome('busy@example.test', 'pw-busy', '198.51.100.8')).toBe('ok');
    }
  });
});

describe('#126 hard limits', () => {
  it('stops one client after ten failures on one account, before lookup and bcrypt, and resets on success', async () => {
    fakeLimiterCollection();
    addUser('pair@example.test', 'pw-pair');

    for (let i = 0; i < 9; i++) expect(await outcome('pair@example.test', 'wrong', '198.51.100.9')).toBe('invalid');
    expect(await outcome('pair@example.test', 'pw-pair', '198.51.100.9')).toBe('ok');

    // The success reset this client's count for the account: ten fresh failures.
    for (let i = 0; i < 10; i++) expect(await outcome('pair@example.test', 'wrong', '198.51.100.9')).toBe('invalid');
    auth.getUserByEmail.mockClear();
    auth.verifyPassword.mockClear();

    expect(await outcome('pair@example.test', 'pw-pair', '198.51.100.9')).toBe('throttled');
    expect(auth.getUserByEmail).not.toHaveBeenCalled();
    expect(auth.verifyPassword).not.toHaveBeenCalled();
    // Other clients are unaffected.
    expect(await outcome('pair@example.test', 'pw-pair', '198.51.100.10')).toBe('ok');
  });

  it('caps one client at fifty failures across accounts (password spraying)', async () => {
    fakeLimiterCollection();

    const results = [];
    for (let i = 0; i < 60; i++) results.push(await outcome(`spray-${i}@example.test`, 'Winter2026!', '198.51.100.11'));

    expect(results.filter(r => r === 'throttled')).toHaveLength(10);
  });
});

describe('#126 account-wide threshold: logged step-up, never a lock on known clients', () => {
  it('above 100 failures only clients that signed in before may keep trying', async () => {
    fakeLimiterCollection();
    addUser('target@example.test', 'pw-target');
    expect(await outcome('target@example.test', 'pw-target', '198.51.100.12')).toBe('ok');

    // 100 failures spread over ten addresses (ten each, the pair limit).
    for (let host = 0; host < 10; host++) {
      for (let i = 0; i < 10; i++) expect(await outcome('target@example.test', 'guess', `203.0.113.${100 + host}`)).toBe('invalid');
    }

    // From here on, a client with no successful sign-in to this account is refused...
    expect(await outcome('target@example.test', 'guess', '203.0.113.200')).toBe('throttled');
    expect(await outcome('target@example.test', 'pw-target', '192.0.2.1')).toBe('throttled');
    // ...while the owner's known client still gets in.
    expect(await outcome('target@example.test', 'pw-target', '198.51.100.12')).toBe('ok');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('target@example.test');
  });

  it('a completed password reset makes that client known', async () => {
    fakeLimiterCollection();
    for (let host = 0; host < 10; host++) {
      for (let i = 0; i < 10; i++) await beginCredentialAttempt('reset@example.test', { 'x-forwarded-for': `203.0.113.${host}` });
    }
    expect(await beginCredentialAttempt('reset@example.test', { 'x-forwarded-for': '192.0.2.50' })).toBeNull();

    await rememberCredentialClient('reset@example.test', { 'x-forwarded-for': '192.0.2.50' });

    expect(await beginCredentialAttempt('reset@example.test', { 'x-forwarded-for': '192.0.2.50' })).not.toBeNull();
  });
});

describe('#126 store failures are bounded, not a site-wide lockout', () => {
  it('keeps signing users in, still enforcing the limits, when the shared store is down', async () => {
    getCollection.mockRejectedValue(new Error('auth_rate_limits unavailable'));
    addUser('outage@example.test', 'pw-outage');

    expect(await outcome('outage@example.test', 'pw-outage', '198.51.100.13')).toBe('ok');
    for (let i = 0; i < 10; i++) expect(await outcome('outage@example.test', 'wrong', '198.51.100.14')).toBe('invalid');
    expect(await outcome('outage@example.test', 'wrong', '198.51.100.14')).toBe('throttled');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('limiter'), expect.anything());
  });

  it('does not refuse sign-in when the TTL index cannot be created', async () => {
    const collection = fakeLimiterCollection();
    collection.createIndex.mockRejectedValue(new Error('not authorized to create index'));
    addUser('noindex@example.test', 'pw-noindex');

    expect(await outcome('noindex@example.test', 'pw-noindex', '198.51.100.15')).toBe('ok');
  });
});
