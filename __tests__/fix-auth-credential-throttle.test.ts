/**
 * @jest-environment node
 *
 * Credential throttling (#126 and its security-review follow-ups).
 *
 * The audit #7 repair counted every attempt (successes included) against a hard
 * per-account limit of 10 that nothing reset, so ten requests from anywhere locked the
 * owner out. Its replacement keyed hard limits on (account, client) but still let
 * anyone raise an account-wide count: the review showed 101 failures from one IPv6 /64
 * refusing the owner's correct password from any new address, and, because that count
 * reset every 15-minute window, 9,600 password checks per account per day.
 *
 * The rules under test (lib/auth/login-rate-limit.ts):
 * - per client (an IPv4 address, or an IPv6 /64): 50 failures per 15-minute window;
 * - per (account, client): 10 failures per window;
 * - per account: 100 CONSECUTIVE failures from clients without a known-device cookie,
 *   reset by any successful sign-in and forgotten 24 h after the last one; beyond it
 *   such clients are refused;
 * - a browser holding a signed known-device cookie for the account (issued on a
 *   successful sign-in or password reset) is exempt from the account and client limits
 *   and has its own limit of 10 failures per window.
 *
 * The real authorize() and limiter run against an in-memory auth_rate_limits
 * collection; the user store and bcrypt are fakes, and next/headers' cookie jar is
 * captured.
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
const mockCookieJar: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
jest.mock('next/headers', () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => mockCookieJar.push({ name, value, options }),
  }),
}));

import type { authOptions as AuthOptions } from '@/lib/auth/config';

const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Fresh module instances per test: the limiter keeps process state (TTL-index
// readiness, the in-memory fallback store) that must not leak between tests.
let authOptions: typeof AuthOptions;
let auth: { getUserByEmail: jest.Mock; verifyPassword: jest.Mock };
let getCollection: jest.Mock;
let clock: jest.SpyInstance;

type Doc = { attempts?: number; expires_at?: Date };

/** In-memory auth_rate_limits collection implementing the operations the limiter uses. */
function fakeLimiterCollection() {
  const docs = new Map<string, Doc>();
  const collection = {
    docs,
    createIndex: jest.fn(async () => 'expires_at_1'),
    findOneAndUpdate: jest.fn(async (
      filter: { _id: string },
      update: { $inc?: { attempts: number }; $setOnInsert?: Doc; $set?: Doc },
    ) => {
      const doc = docs.get(filter._id) ?? { ...(update.$setOnInsert ?? {}) };
      doc.attempts = (doc.attempts ?? 0) + (update.$inc?.attempts ?? 0);
      if (update.$set) Object.assign(doc, update.$set);
      docs.set(filter._id, doc);
      return { _id: filter._id, ...doc };
    }),
    updateOne: jest.fn(async (filter: { _id: string; attempts?: { $gt: number } }, update: { $inc?: { attempts: number } }) => {
      const doc = docs.get(filter._id);
      if (!doc || (filter.attempts && !((doc.attempts ?? 0) > filter.attempts.$gt))) return { matchedCount: 0 };
      if (update.$inc) doc.attempts = (doc.attempts ?? 0) + update.$inc.attempts;
      return { matchedCount: 1 };
    }),
    deleteOne: jest.fn(async (filter: { _id: string; expires_at?: { $lte: Date } }) => {
      const doc = docs.get(filter._id);
      if (!doc || (filter.expires_at && !(doc.expires_at && doc.expires_at <= filter.expires_at.$lte))) return { deletedCount: 0 };
      docs.delete(filter._id);
      return { deletedCount: 1 };
    }),
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

type Outcome = 'ok' | 'invalid' | 'throttled' | 'protected';

async function outcome(email: string, password: string, ip: string, cookie?: string): Promise<Outcome> {
  const headers: Record<string, string> = { 'x-forwarded-for': ip };
  if (cookie) headers.cookie = cookie;
  try {
    await (authOptions.providers[0] as any).authorize({ email, password }, { headers });
    return 'ok';
  } catch (error) {
    const code = (error as Error).message;
    if (code === 'TooManyAttempts') return 'throttled';
    if (code === 'AccountProtected') return 'protected';
    return 'invalid';
  }
}

/** Sign in successfully and return the known-device cookie it issued, as a Cookie header. */
async function signInForDeviceCookie(email: string, password: string, ip: string): Promise<string> {
  mockCookieJar.length = 0;
  expect(await outcome(email, password, ip)).toBe('ok');
  expect(mockCookieJar).toHaveLength(1);
  const [{ name, value, options }] = mockCookieJar;
  expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  expect(options.maxAge).toBeGreaterThanOrEqual(30 * 24 * 60 * 60);
  return `${name}=${value}`;
}

/** 100 failures for `email` from 10 addresses (the pair limit), in the current window. */
async function hundredFailures(email: string, prefix = '203.0.113') {
  for (let host = 0; host < 10; host++) {
    for (let i = 0; i < 10; i++) expect(await outcome(email, 'guess', `${prefix}.${100 + host}`)).toBe('invalid');
  }
}

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let windowStart: number;

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'known-device-test-secret-at-least-32-characters';
  jest.isolateModules(() => {
    ({ authOptions } = require('@/lib/auth/config'));
    auth = require('@/lib/auth/utils');
    ({ getCollection } = require('@/lib/mongodb'));
  });
  // Pin the clock one minute into a window so no test straddles a window boundary.
  windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS + 60_000;
  clock = jest.spyOn(Date, 'now').mockReturnValue(windowStart);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockCookieJar.length = 0;
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

describe('#126 hard limits per client', () => {
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

  it('treats one IPv6 /64 as one client', async () => {
    fakeLimiterCollection();
    addUser('v6@example.test', 'pw-v6');

    // The review's attacker rotated through addresses inside one /64.
    const results = [];
    for (let i = 1; i <= 20; i++) results.push(await outcome('v6@example.test', 'guess', `2001:db8:bad:1::${i.toString(16)}`));

    expect(results.filter(r => r === 'invalid')).toHaveLength(10);
    expect(results.filter(r => r === 'throttled')).toHaveLength(10);
    expect(auth.verifyPassword).toHaveBeenCalledTimes(10);
    // Written differently, still the same /64.
    expect(await outcome('v6@example.test', 'pw-v6', '2001:0db8:0bad:0001:ffff::1')).toBe('throttled');
    // Another /64 is another client.
    expect(await outcome('v6@example.test', 'pw-v6', '2001:db8:bad:2::1')).toBe('ok');
  });
});

describe('review: consecutive failures on an account (NIST SP 800-63B 5.2.2)', () => {
  it('allows at most 100 password checks per account per day from unknown clients', async () => {
    fakeLimiterCollection();
    addUser('victim@example.test', 'never-guessed');

    // The review's probe: ten fixed addresses, ten guesses each, every window for 24 h.
    const outcomes: Outcome[] = [];
    for (let w = 0; w < 96; w++) {
      clock.mockReturnValue(windowStart + w * WINDOW_MS);
      for (let host = 1; host <= 10; host++) {
        for (let i = 0; i < 10; i++) outcomes.push(await outcome('victim@example.test', `guess-${w}-${host}-${i}`, `203.0.113.${host}`));
      }
    }

    expect(auth.verifyPassword).toHaveBeenCalledTimes(100);
    expect(outcomes.filter(o => o === 'invalid')).toHaveLength(100);
    expect(outcomes.slice(100).every(o => o === 'protected' || o === 'throttled')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('victim@example.test');
  });

  it('does not reset the count when a window rolls over', async () => {
    fakeLimiterCollection();
    addUser('rolling@example.test', 'pw-rolling');

    for (let w = 0; w < 10; w++) {
      clock.mockReturnValue(windowStart + w * WINDOW_MS);
      for (let i = 0; i < 10; i++) expect(await outcome('rolling@example.test', 'guess', `203.0.113.${w}`)).toBe('invalid');
    }

    clock.mockReturnValue(windowStart + 10 * WINDOW_MS);
    expect(await outcome('rolling@example.test', 'pw-rolling', '198.51.100.20')).toBe('protected');
  });

  it('is reset by a successful sign-in', async () => {
    fakeLimiterCollection();
    addUser('reset-count@example.test', 'pw-count');

    for (let host = 0; host < 9; host++) {
      for (let i = 0; i < 10; i++) await outcome('reset-count@example.test', 'guess', `203.0.113.${host}`);
    }
    for (let i = 0; i < 9; i++) await outcome('reset-count@example.test', 'guess', '203.0.113.50');
    // 99 consecutive failures; the owner's success from a fresh address resets them.
    expect(await outcome('reset-count@example.test', 'pw-count', '198.51.100.21')).toBe('ok');

    clock.mockReturnValue(windowStart + WINDOW_MS);
    await hundredFailures('reset-count@example.test', '192.0.2');
    expect(auth.verifyPassword).toHaveBeenCalledTimes(99 + 1 + 100);
  });

  it('is forgotten 24 h after the last counted failure', async () => {
    fakeLimiterCollection();
    addUser('lapse@example.test', 'pw-lapse');

    await hundredFailures('lapse@example.test');
    expect(await outcome('lapse@example.test', 'pw-lapse', '198.51.100.22')).toBe('protected');

    clock.mockReturnValue(windowStart + DAY_MS + 1);
    expect(await outcome('lapse@example.test', 'pw-lapse', '198.51.100.22')).toBe('ok');
  });
});

describe('review: known-device cookie', () => {
  it("keeps the owner's browser signing in, from any address, while unknown clients are refused", async () => {
    fakeLimiterCollection();
    addUser('seismologist@institute.example', 'correct horse battery');
    // Yesterday, from the office.
    const cookie = await signInForDeviceCookie('seismologist@institute.example', 'correct horse battery', '192.0.2.10');

    await hundredFailures('seismologist@institute.example');

    // A browser that has never signed in to the account is refused...
    expect(await outcome('seismologist@institute.example', 'correct horse battery', '198.51.100.78')).toBe('protected');
    // ...but the owner's laptop, travelling (new address, known-device cookie), is not.
    expect(await outcome('seismologist@institute.example', 'correct horse battery', '198.51.100.77', cookie)).toBe('ok');
    // That success reset the count for everyone.
    expect(await outcome('seismologist@institute.example', 'correct horse battery', '198.51.100.78')).toBe('ok');
  });

  it('refuses unknown browsers while the count stands, whatever the password', async () => {
    fakeLimiterCollection();
    addUser('standing@example.test', 'pw-standing');

    await hundredFailures('standing@example.test');

    expect(await outcome('standing@example.test', 'pw-standing', '198.51.100.79')).toBe('protected');
    expect(auth.verifyPassword).toHaveBeenCalledTimes(100);
  });

  it('gives a known device a limit of its own, which does not raise the account count', async () => {
    fakeLimiterCollection();
    addUser('device@example.test', 'pw-device');
    const cookie = await signInForDeviceCookie('device@example.test', 'pw-device', '192.0.2.11');

    // Ten failures from the known browser, over ten different addresses.
    for (let i = 0; i < 10; i++) expect(await outcome('device@example.test', 'wrong', `198.51.100.${30 + i}`, cookie)).toBe('invalid');
    expect(await outcome('device@example.test', 'pw-device', '198.51.100.45', cookie)).toBe('throttled');
    // They did not count against the account: 100 more failures from elsewhere still run.
    await hundredFailures('device@example.test');
  });

  it('ignores a tampered cookie and a cookie issued for another account', async () => {
    fakeLimiterCollection();
    addUser('mine@example.test', 'pw-mine');
    addUser('theirs@example.test', 'pw-theirs');
    const theirs = await signInForDeviceCookie('theirs@example.test', 'pw-theirs', '192.0.2.12');
    const mine = await signInForDeviceCookie('mine@example.test', 'pw-mine', '192.0.2.13');
    const tampered = mine.replace(/.$/, c => (c === 'A' ? 'B' : 'A'));

    await hundredFailures('mine@example.test');

    expect(await outcome('mine@example.test', 'pw-mine', '198.51.100.90', theirs)).toBe('protected');
    expect(await outcome('mine@example.test', 'pw-mine', '198.51.100.91', tampered)).toBe('protected');
    expect(await outcome('mine@example.test', 'pw-mine', '198.51.100.92', mine)).toBe('ok');
  });
});

describe('review: spellings of one address share its limits', () => {
  it('folds compatibility variants (NFKC) and case before counting and lookup', async () => {
    fakeLimiterCollection();
    addUser('seismologist@example.test', 'pw-variant');

    // U+017F LONG S, fullwidth letters and the Kelvin sign all stand for ASCII letters.
    const variants = ['ſeismologist@example.test', 'ＳＥＩＳＭＯＬＯＧＩＳＴ@example.test', 'seismologist@example.test'];
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await outcome(variants[i % variants.length], 'guess', '198.51.100.60'));

    expect(results.filter(r => r === 'throttled')).toHaveLength(2);
    expect(auth.getUserByEmail.mock.calls.every(([email]) => email === 'seismologist@example.test')).toBe(true);
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

