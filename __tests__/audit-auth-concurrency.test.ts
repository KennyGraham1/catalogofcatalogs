/** @jest-environment node */
jest.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: (opts: unknown) => opts }));
jest.mock('@/lib/auth/utils', () => Object.fromEntries(['getUserByEmail', 'getUserById', 'verifyPassword', 'hashPassword', 'updateLastLogin', 'toSafeUser', 'getSessionUserState'].map(k => [k, jest.fn()])));
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => {}) }));
jest.mock('@/lib/mongodb', () => ({ getCollection: jest.fn(), COLLECTIONS: { USERS: 'users', PASSWORD_RESET_TOKENS: 'tokens', AUTH_RATE_LIMITS: 'limits' } }));
jest.mock('@/lib/rate-limiter', () => ({ ...jest.requireActual('@/lib/rate-limiter'), applyRateLimit: jest.fn(() => ({ success: true, headers: {} })) }));
import { authOptions } from '@/lib/auth/config';
import { allowCredentialAttempt } from '@/lib/auth/login-rate-limit';
import * as auth from '@/lib/auth/utils';
import { getCollection } from '@/lib/mongodb';
import { POST } from '@/app/api/auth/reset-password/route';
import { NextRequest } from 'next/server';

const buckets = new Map<string, number>();
const limits = {
  createIndex: jest.fn(async () => 'ttl'),
  findOneAndUpdate: jest.fn(async ({ _id }: { _id: string }) => {
    const attempts = (buckets.get(_id) ?? 0) + 1;
    buckets.set(_id, attempts);
    return { attempts };
  }),
};
beforeEach(() => {
  jest.clearAllMocks();
  buckets.clear();
  (getCollection as jest.Mock).mockResolvedValue(limits);
});
it('allows only ten concurrent guesses for one normalized account before lookup and bcrypt', async () => {
  (auth.getUserByEmail as jest.Mock).mockResolvedValue({ id: 'u', is_active: true, password_hash: 'hash' });
  (auth.verifyPassword as jest.Mock).mockResolvedValue(false);
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
    (authOptions.providers[0] as any).authorize({ email: i % 2 ? ' AUDIT@example.test ' : 'audit@example.test', password: 'wrong-password' }, { headers: { 'x-forwarded-for': `198.51.100.${i}` } })
  ));
  expect(auth.getUserByEmail).toHaveBeenCalledTimes(10);
  expect(auth.verifyPassword).toHaveBeenCalledTimes(10);
  expect(results.filter(r => r.status === 'rejected' && /Too many/.test(r.reason.message))).toHaveLength(10);
  expect(Array.from(buckets.keys()).some(key => key.includes('audit@'))).toBe(false);
});
it('caps password spraying by the trusted client even when spoofed prefixes vary', async () => {
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) =>
    allowCredentialAttempt(`account-${i}@example.test`, { 'x-forwarded-for': `198.51.100.${i}, 203.0.113.7` })
  ));
  expect(results.filter(Boolean)).toHaveLength(50);
});
it('opens a fresh quota in the next window independently of TTL deletion', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(0);
  try {
    for (let i = 0; i < 10; i++) expect(await allowCredentialAttempt('a@example.test')).toBe(true);
    expect(await allowCredentialAttempt('a@example.test')).toBe(false);
    now.mockReturnValue(15 * 60 * 1000);
    expect(await allowCredentialAttempt('a@example.test')).toBe(true);
  } finally { now.mockRestore(); }
});
it('fails closed before user lookup if the shared limiter is unavailable', async () => {
  (getCollection as jest.Mock).mockRejectedValue(new Error('database unavailable'));
  await expect((authOptions.providers[0] as any).authorize({ email: 'audit@example.test', password: 'guess' }, { headers: {} })).rejects.toThrow('database unavailable');
  expect(auth.getUserByEmail).not.toHaveBeenCalled();
});
it('allows only one concurrent reset and changes password/session version in one write', async () => {
  const token = { id: 'reset-1', user_id: 'u', used_at: null as Date | null };
  const tokens = {
    findOne: jest.fn(async () => token.used_at === null ? { ...token } : null),
    updateOne: jest.fn(async (filter: any) => {
      expect(filter).toMatchObject({ id: token.id, used_at: null, expires_at: { $gt: expect.any(Date) } });
      if (token.used_at) return { matchedCount: 0 };
      token.used_at = new Date();
      return { matchedCount: 1 };
    }),
    updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
  };
  const users = { updateOne: jest.fn(async () => ({ matchedCount: 1 })) };
  (getCollection as jest.Mock).mockImplementation(async name => name === 'users' ? users : tokens);
  (auth.getUserById as jest.Mock).mockResolvedValue({ id: 'u', password_hash: 'old-hash' });
  (auth.hashPassword as jest.Mock).mockImplementation(async p => `hashed-${p}`);
  const post = (newPassword: string) => POST(new NextRequest('http://localhost/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: 'audit-token', newPassword }) }));
  const responses = await Promise.all([post('password-one'), post('password-two')]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
  expect(users.updateOne).toHaveBeenCalledTimes(1);
  expect(users.updateOne).toHaveBeenCalledWith(
    { id: 'u', password_hash: 'old-hash' },
    { $set: { password_hash: expect.stringMatching(/^hashed-password-/), updated_at: expect.any(String) }, $inc: { jwt_version: 1 } },
  );
  expect((await post('password-three')).status).toBe(400);
});
