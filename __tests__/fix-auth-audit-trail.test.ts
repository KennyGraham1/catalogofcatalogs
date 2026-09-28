/**
 * @jest-environment node
 *
 * #118: registration, password changes, password resets and sign-ins must leave an
 * audit record carrying the client address.
 *
 * Before this fix writeAuditLog was called only for sign-ins, role-request reviews and
 * catalogue deletion, never set `ip`, and never set `id`, which audit_logs has a unique
 * index on, so on a database set up with scripts/init-database.ts every entry after the
 * first was rejected (and the error swallowed).
 *
 * Real route handlers, real bcrypt and the real writeAuditLog run against an in-memory
 * stand-in for MongoDB; only the session lookup is stubbed.
 */

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: {
    USERS: 'users',
    PASSWORD_RESET_TOKENS: 'password_reset_tokens',
    AUDIT_LOGS: 'audit_logs',
    AUTH_RATE_LIMITS: 'auth_rate_limits',
  },
}));

import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { getCollection } from '@/lib/mongodb';
import { authOptions } from '@/lib/auth/config';
import { hashPassword } from '@/lib/auth/utils';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { POST as resetPassword } from '@/app/api/auth/reset-password/route';

type Doc = Record<string, any>;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    const value = doc[key];
    if (condition instanceof RegExp) return typeof value === 'string' && condition.test(value);
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('$regex' in condition) return typeof value === 'string' && new RegExp(condition.$regex).test(value);
      if ('$gt' in condition) return value > condition.$gt;
      if ('$ne' in condition) return value !== condition.$ne;
      throw new Error(`fake collection: unsupported filter ${JSON.stringify(condition)}`);
    }
    return value === condition || (condition === null && value === undefined);
  });
}

function applyUpdate(doc: Doc, update: Doc) {
  if (update.$set) Object.assign(doc, update.$set);
  if (update.$setOnInsert && doc.__inserted) Object.assign(doc, update.$setOnInsert);
  for (const [field, by] of Object.entries(update.$inc ?? {})) doc[field] = (doc[field] ?? 0) + (by as number);
  delete doc.__inserted;
}

function fakeCollection(docs: Doc[] = []) {
  const upsert = (filter: Doc) => {
    const doc: Doc = { ...filter, __inserted: true };
    docs.push(doc);
    return doc;
  };
  return {
    docs,
    createIndex: jest.fn(async () => 'index'),
    findOne: jest.fn(async (filter: Doc) => {
      const doc = docs.find(d => matches(d, filter));
      return doc ? { ...doc } : null;
    }),
    insertOne: jest.fn(async (doc: Doc) => {
      docs.push({ ...doc });
      return { acknowledged: true };
    }),
    updateOne: jest.fn(async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
      let doc = docs.find(d => matches(d, filter));
      if (!doc && !options?.upsert) return { matchedCount: 0, modifiedCount: 0 };
      doc = doc ?? upsert(filter);
      applyUpdate(doc, update);
      return { matchedCount: 1, modifiedCount: 1 };
    }),
    updateMany: jest.fn(async (filter: Doc, update: Doc) => {
      const hit = docs.filter(d => matches(d, filter));
      hit.forEach(doc => applyUpdate(doc, update));
      return { matchedCount: hit.length, modifiedCount: hit.length };
    }),
    findOneAndUpdate: jest.fn(async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
      let doc = docs.find(d => matches(d, filter));
      if (!doc && !options?.upsert) return null;
      doc = doc ?? upsert(filter);
      applyUpdate(doc, update);
      return { ...doc };
    }),
    deleteOne: jest.fn(async (filter: Doc) => {
      const index = docs.findIndex(d => matches(d, filter));
      if (index >= 0) docs.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    }),
  };
}

let db: Record<string, ReturnType<typeof fakeCollection>>;
let nextIp = 1;
/** A fresh client address per request keeps the per-IP route limiter out of the way. */
function jsonPost(url: string, body: unknown, ip = `198.51.100.${nextIp++}`) {
  return {
    ip,
    request: new NextRequest(`http://localhost${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  };
}

const entries = (action: string) => db.audit_logs.docs.filter(entry => entry.action === action);

beforeEach(() => {
  db = {
    users: fakeCollection(),
    password_reset_tokens: fakeCollection(),
    audit_logs: fakeCollection(),
    auth_rate_limits: fakeCollection(),
  };
  (getCollection as jest.Mock).mockImplementation(async (name: string) => {
    if (!db[name]) throw new Error(`unexpected collection ${name}`);
    return db[name];
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

async function seedUser(email: string, password: string) {
  const doc = {
    id: `user-${email}`, email, name: email, role: 'viewer', is_active: true, email_verified: false,
    password_hash: await hashPassword(password), jwt_version: 0,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  };
  db.users.docs.push(doc);
  return doc;
}

describe('#118 credential events are audit-logged with the client address', () => {
  it('registration', async () => {
    const { request, ip } = jsonPost('/api/auth/register', { email: 'new@example.test', password: 'long-enough-1', name: 'New' });

    const res = await register(request);

    expect(res.status).toBe(201);
    const created = db.users.docs.find(doc => doc.email === 'new@example.test')!;
    expect(entries('user.register')).toEqual([
      expect.objectContaining({ actor_id: created.id, actor_email: 'new@example.test', target_id: created.id, ip }),
    ]);
  });

  it('password change', async () => {
    const account = await seedUser('change@example.test', 'old-password-1');
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: account.id, email: account.email } });
    const { request, ip } = jsonPost('/api/auth/change-password', { currentPassword: 'old-password-1', newPassword: 'new-password-1' });

    const res = await changePassword(request);

    expect(res.status).toBe(200);
    expect(entries('user.password_change')).toEqual([
      expect.objectContaining({ actor_id: account.id, target_id: account.id, ip }),
    ]);
  });

  it('password reset', async () => {
    const account = await seedUser('reset@example.test', 'old-password-1');
    db.password_reset_tokens.docs.push({
      id: 'reset-1', user_id: account.id, used_at: null, expires_at: new Date(Date.now() + 60_000),
      token_hash: createHash('sha256').update('the-token').digest('hex'),
    });
    const { request, ip } = jsonPost('/api/auth/reset-password', { token: 'the-token', newPassword: 'new-password-1' });

    const res = await resetPassword(request);

    expect(res.status).toBe(200);
    expect(entries('user.password_reset')).toEqual([
      expect.objectContaining({ target_id: account.id, ip }),
    ]);
  });

  it('sign-in success and failure', async () => {
    const account = await seedUser('login@example.test', 'right-password-1');
    const authorize = (password: string) =>
      (authOptions.providers[0] as any).options.authorize(
        { email: 'login@example.test', password },
        { headers: { 'x-forwarded-for': '203.0.113.77' } },
      );

    await expect(authorize('wrong-password-1')).rejects.toThrow();
    await expect(authorize('right-password-1')).resolves.toMatchObject({ id: account.id });

    expect(entries('user.login_failed')).toEqual([expect.objectContaining({ target_id: account.id, ip: '203.0.113.77' })]);
    expect(entries('user.login')).toEqual([expect.objectContaining({ actor_id: account.id, ip: '203.0.113.77' })]);
    // Every entry is distinct under audit_logs' unique index on id.
    const ids = db.audit_logs.docs.map(entry => entry.id);
    expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
