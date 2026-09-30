/**
 * @jest-environment node
 *
 * Security-review follow-up to #126: the password reset is how an owner gets back in
 * while failed sign-ins from elsewhere are holding unknown browsers back, so it must not
 * be defeatable.
 *
 * - forgot-password deleted every outstanding reset token on each request, so anyone
 *   who knew the address could invalidate the owner's link by asking again, every few
 *   seconds if need be; it was also throttled per client address only.
 * - Completing a reset must let that browser sign in (a known-device cookie).
 *
 * Real forgot-password, reset-password and sign-in code against an in-memory MongoDB
 * stand-in; bcrypt is replaced by a fast fake and outbound email is captured.
 */

jest.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: (opts: unknown) => opts }));
const mockEmails: Array<{ to: string; message: string }> = [];
jest.mock('@/lib/notifications', () => ({
  sendEmailNotification: jest.fn(async (message: { to: string; message: string }) => { mockEmails.push(message); }),
  createUserNotification: jest.fn(async () => ({})),
}));
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => {}) }));
jest.mock('bcryptjs', () => ({
  hash: async (password: string) => `hash:${password}`,
  compare: async (password: string, hash: string) => hash === `hash:${password}`,
}));
jest.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }));
jest.mock('next/headers', () => ({ cookies: async () => ({ set: () => {} }) }));

type Doc = Record<string, any>;
const mockDb = new Map<string, Doc[]>();

function mockMatches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if (condition instanceof RegExp) return typeof value === 'string' && condition.test(value);
      if ('$regex' in condition) return typeof value === 'string' && new RegExp(condition.$regex).test(value);
      if ('$gt' in condition) return value !== undefined && value !== null && value > condition.$gt;
      if ('$lte' in condition) return value !== undefined && value !== null && value <= condition.$lte;
      if ('$ne' in condition) return value !== condition.$ne;
      if ('$in' in condition) return condition.$in.includes(value);
      throw new Error(`fake collection: unsupported filter ${JSON.stringify(condition)}`);
    }
    if (condition === null) return value === null || value === undefined;
    return value === condition;
  });
}

function mockCollection(name: string) {
  if (!mockDb.has(name)) mockDb.set(name, []);
  const docs = mockDb.get(name)!;
  const apply = (doc: Doc, update: Doc, inserted: boolean) => {
    Object.assign(doc, update.$set ?? {});
    if (inserted) Object.assign(doc, update.$setOnInsert ?? {});
    for (const [field, by] of Object.entries(update.$inc ?? {})) doc[field] = (doc[field] ?? 0) + (by as number);
  };
  const find = (filter: Doc = {}) => {
    let result = docs.filter(d => mockMatches(d, filter));
    const cursor = {
      sort: (spec: Record<string, 1 | -1>) => {
        const [[field, direction]] = Object.entries(spec);
        result = [...result].sort((a, b) => (a[field] < b[field] ? -direction : a[field] > b[field] ? direction : 0));
        return cursor;
      },
      skip: (n: number) => { result = result.slice(n); return cursor; },
      project: () => cursor,
      toArray: async () => result.map(d => ({ ...d })),
    };
    return cursor;
  };
  return {
    createIndex: async () => 'index',
    find,
    findOne: async (filter: Doc) => { const d = docs.find(x => mockMatches(x, filter)); return d ? { ...d } : null; },
    insertOne: async (doc: Doc) => { docs.push({ ...doc }); return { acknowledged: true }; },
    updateOne: async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
      let doc = docs.find(d => mockMatches(d, filter));
      const inserted = !doc;
      if (!doc) {
        if (!options?.upsert) return { matchedCount: 0, modifiedCount: 0 };
        doc = { ...filter };
        docs.push(doc);
      }
      apply(doc, update, inserted);
      return { matchedCount: inserted ? 0 : 1, modifiedCount: 1 };
    },
    updateMany: async (filter: Doc, update: Doc) => {
      const hit = docs.filter(d => mockMatches(d, filter));
      hit.forEach(d => apply(d, update, false));
      return { matchedCount: hit.length, modifiedCount: hit.length };
    },
    findOneAndUpdate: async (filter: Doc, update: Doc) => {
      let doc = docs.find(d => mockMatches(d, filter));
      const inserted = !doc;
      if (!doc) { doc = { ...filter }; docs.push(doc); }
      apply(doc, update, inserted);
      return { ...doc };
    },
    deleteOne: async (filter: Doc) => {
      const i = docs.findIndex(d => mockMatches(d, filter));
      if (i >= 0) docs.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    deleteMany: async (filter: Doc) => {
      let n = 0;
      for (let i = docs.length - 1; i >= 0; i--) if (mockMatches(docs[i], filter)) { docs.splice(i, 1); n++; }
      return { deletedCount: n };
    },
  };
}

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(async (name: string) => mockCollection(name)),
  COLLECTIONS: {
    USERS: 'users',
    PASSWORD_RESET_TOKENS: 'password_reset_tokens',
    AUTH_RATE_LIMITS: 'auth_rate_limits',
    AUDIT_LOGS: 'audit_logs',
  },
}));

import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import { POST as forgot } from '@/app/api/auth/forgot-password/route';
import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { POST as reset } from '@/app/api/auth/reset-password/route';

const OWNER = 'seismologist@institute.example';
const GENERIC_REPLY = 'If an account exists for that email, a reset link has been sent.';
const HOUR_MS = 60 * 60 * 1000;
let clock: jest.SpyInstance;
let start: number;
let nextIp = 1;

function post(url: string, body: unknown, ip: string, cookie?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`http://app.local${url}`, { method: 'POST', body: JSON.stringify(body), headers });
}

/** Advance the clock a second, so each request's link has its own creation time. */
function tick() {
  clock.mockReturnValue((Date.now() as number) + 1000);
}

async function requestReset(email: string, ip = `203.0.113.${nextIp++}`) {
  tick();
  const res = await forgot(post('/api/auth/forgot-password', { email }, ip));
  expect(res.status).toBe(200);
  expect((await res.json()).message).toBe(GENERIC_REPLY);
}

const tokenFrom = (email: { message: string }) => /token=([0-9a-f]+)/.exec(email.message)![1];

async function signIn(password: string, ip: string, cookie?: string): Promise<string> {
  const headers: Record<string, string> = { 'x-forwarded-for': ip };
  if (cookie) headers.cookie = cookie;
  try {
    await (authOptions.providers[0] as any).authorize({ email: OWNER, password }, { headers });
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  }
}

beforeEach(async () => {
  process.env.NEXTAUTH_SECRET = 'known-device-test-secret-at-least-32-characters';
  mockDb.clear();
  mockEmails.length = 0;
  start = Math.floor(Date.now() / HOUR_MS) * HOUR_MS + 60_000;
  clock = jest.spyOn(Date, 'now').mockReturnValue(start);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await mockCollection('users').insertOne({
    id: 'u1', email: OWNER, name: 'Owner', role: 'editor', is_active: true,
    password_hash: 'hash:correct horse battery', jwt_version: 0,
  });
});

afterEach(() => jest.restoreAllMocks());

describe('forgot-password cannot be used to take the owner\'s link away', () => {
  it("keeps the owner's link working when someone asks again", async () => {
    await requestReset(OWNER, '198.51.100.77');
    const ownersLink = tokenFrom(mockEmails[0]);
    await requestReset(OWNER, '203.0.113.5'); // the attacker, seconds later

    const res = await reset(post('/api/auth/reset-password', { token: ownersLink, newPassword: 'new password 123' }, '198.51.100.77'));

    expect(res.status).toBe(200);
  });

  it('sends at most three reset emails per account per hour, whoever asks', async () => {
    for (let i = 0; i < 5; i++) await requestReset(OWNER);
    expect(mockEmails).toHaveLength(3);

    clock.mockReturnValue(start + HOUR_MS);
    await requestReset(OWNER);
    expect(mockEmails).toHaveLength(4);
  });

  it('answers requests for unknown addresses the same way', async () => {
    for (let i = 0; i < 5; i++) await requestReset('nobody@institute.example');
    expect(mockEmails).toHaveLength(0);
  });

  it('keeps only the newest three links valid', async () => {
    for (let i = 0; i < 3; i++) await requestReset(OWNER);
    clock.mockReturnValue(start + HOUR_MS);
    await requestReset(OWNER); // a fourth link while the first three are unexpired

    const [first, second] = mockEmails.map(tokenFrom);
    const oldest = await reset(post('/api/auth/reset-password', { token: first, newPassword: 'new password 123' }, '198.51.100.80'));
    const kept = await reset(post('/api/auth/reset-password', { token: second, newPassword: 'new password 123' }, '198.51.100.80'));

    expect(oldest.status).toBe(400);
    expect(kept.status).toBe(200);
  });
});

describe('a completed reset lets that browser in', () => {
  it('issues a known-device cookie that signs the owner in while unknown browsers are refused', async () => {
    // 100 failed guesses from ten addresses put the account in step-up.
    for (let host = 0; host < 10; host++) {
      for (let i = 0; i < 10; i++) expect(await signIn('guess', `203.0.113.${100 + host}`)).toBe('CredentialsSignin');
    }
    // The owner, on a browser that has never signed in to the account:
    expect(await signIn('correct horse battery', '198.51.100.77')).toBe('AccountProtected');

    await requestReset(OWNER, '198.51.100.77');
    const res = await reset(post('/api/auth/reset-password', { token: tokenFrom(mockEmails[0]), newPassword: 'new password 123' }, '198.51.100.77'));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/known-device=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    const cookie = setCookie.split(';')[0];

    // The reset alone does not lift the account's protection for unknown browsers...
    expect(await signIn('new password 123', '198.51.100.99')).toBe('AccountProtected');
    // ...but the browser that completed it is now a known device.
    expect(await signIn('new password 123', '198.51.100.77', cookie)).toBe('ok');
  });
});


describe('reset links are bound to the credentials that issued them', () => {
  it('rejects an old link after a password change and accepts a newly requested link', async () => {
    await requestReset(OWNER);
    const oldToken = tokenFrom(mockEmails[0]);
    const changed = await changePassword(post('/api/auth/change-password', {
      currentPassword: 'correct horse battery', newPassword: 'changed password 123',
    }, '198.51.100.201'));
    expect(changed.status).toBe(200);

    const stale = await reset(post('/api/auth/reset-password', {
      token: oldToken, newPassword: 'stale link password',
    }, '198.51.100.202'));
    expect(stale.status).toBe(400);
    expect((await mockCollection('users').findOne({ id: 'u1' }))?.password_hash)
      .toBe('hash:changed password 123');

    await requestReset(OWNER);
    const fresh = await reset(post('/api/auth/reset-password', {
      token: tokenFrom(mockEmails[1]), newPassword: 'fresh link password',
    }, '198.51.100.203'));
    expect(fresh.status).toBe(200);
  });
});
