/**
 * @jest-environment node
 *
 * #114 / #130: the per-client rate-limit key.
 *
 * - TRUSTED_PROXY_HOPS used to go through Math.max(1, parseInt(...)): a typo such as
 *   "two" produced NaN, every request resolved to the single key 'unknown', and the
 *   whole site shared one bucket (50 login attempts per 15 minutes for everyone).
 * - "0" was silently treated as 1.
 * - Retry-After always reported the full window, however much of it had elapsed.
 * - The credential limiter keyed unresolvable clients as one shared 'unknown' client.
 */

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: { AUTH_RATE_LIMITS: 'auth_rate_limits' },
}));

import { getCollection } from '@/lib/mongodb';
import {
  applyRateLimit,
  getClientIp,
  parseTrustedProxyHops,
  rateLimit,
} from '@/lib/rate-limiter';
import { allowCredentialAttempt } from '@/lib/auth/login-rate-limit';

const ORIGINAL_HOPS = process.env.TRUSTED_PROXY_HOPS;

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/auth/register', { method: 'POST', headers });
}

/**
 * lib/rate-limiter.ts logs each TRUSTED_PROXY_HOPS problem once per process, so a test that
 * asserts on that log needs a module instance no other test has used: otherwise it passes
 * only when it happens to run before every other test with the same setting.
 */
function freshGetClientIp(): typeof getClientIp {
  let fresh!: typeof getClientIp;
  jest.isolateModules(() => {
    fresh = require('@/lib/rate-limiter').getClientIp;
  });
  return fresh;
}

/** In-memory stand-in for the auth_rate_limits collection (atomic $inc semantics). */
function memoryLimiterStore() {
  const buckets = new Map<string, number>();
  const collection = {
    createIndex: jest.fn(async () => 'ttl'),
    findOneAndUpdate: jest.fn(async ({ _id }: { _id: string }, update: { $inc?: { attempts: number } }) => {
      const attempts = (buckets.get(_id) ?? 0) + (update.$inc?.attempts ?? 0);
      buckets.set(_id, attempts);
      return { _id, attempts };
    }),
    updateOne: jest.fn(async ({ _id }: { _id: string }, update: { $inc?: { attempts: number }; $set?: unknown }) => {
      if (update.$inc) buckets.set(_id, (buckets.get(_id) ?? 0) + update.$inc.attempts);
      else buckets.set(_id, buckets.get(_id) ?? 0);
      return { matchedCount: 1 };
    }),
    deleteOne: jest.fn(async ({ _id }: { _id: string }) => {
      buckets.delete(_id);
      return { deletedCount: 1 };
    }),
    findOne: jest.fn(async ({ _id }: { _id: string }) => (buckets.has(_id) ? { _id, attempts: buckets.get(_id) } : null)),
  };
  (getCollection as jest.Mock).mockResolvedValue(collection);
  return collection;
}

let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (ORIGINAL_HOPS === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = ORIGINAL_HOPS;
  jest.restoreAllMocks();
});

describe('TRUSTED_PROXY_HOPS parsing', () => {
  it('accepts non-negative integers, including 0, and defaults to 1 when unset', () => {
    expect(parseTrustedProxyHops(undefined)).toEqual({ hops: 1, valid: true });
    expect(parseTrustedProxyHops('')).toEqual({ hops: 1, valid: true });
    expect(parseTrustedProxyHops('0')).toEqual({ hops: 0, valid: true });
    expect(parseTrustedProxyHops(' 2 ')).toEqual({ hops: 2, valid: true });
  });

  it('rejects garbage instead of producing NaN or silently truncating', () => {
    for (const raw of ['two', '-1', '1.5', '2x', 'NaN']) {
      expect(parseTrustedProxyHops(raw)).toEqual({ hops: 1, valid: false });
    }
  });
});

describe('getClientIp with a misconfigured TRUSTED_PROXY_HOPS', () => {
  it('keeps distinct clients distinct and logs the bad value loudly', () => {
    process.env.TRUSTED_PROXY_HOPS = 'two';
    const clientIp = freshGetClientIp();

    expect(clientIp(requestWith({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('10.0.0.1');
    expect(clientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TRUSTED_PROXY_HOPS'));
  });

  it('does not let x-real-ip stand in for every client when the setting is garbage', () => {
    process.env.TRUSTED_PROXY_HOPS = 'abc';

    const ip = getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': 'attacker-choice' }));

    expect(ip).toBe('203.0.113.9');
  });

  it('accepts 0 (no proxy) and warns that forwarded addresses can be forged', () => {
    process.env.TRUSTED_PROXY_HOPS = '0';
    const clientIp = freshGetClientIp();

    // With no proxy the only peer address a route handler can see is the one Next.js
    // writes into X-Forwarded-For when the client sent none: the rightmost entry.
    expect(clientIp(requestWith({ 'x-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('TRUSTED_PROXY_HOPS=0'));
  });
});

describe('Retry-After / X-RateLimit-Reset', () => {
  it('reports when the current window actually ends', () => {
    const limiter = rateLimit({ interval: 15 * 60 * 1000, uniqueTokenPerInterval: 10 });
    const request = requestWith({ 'x-forwarded-for': '198.51.100.20' });
    const start = 1_700_000_000_000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);

    applyRateLimit(request, limiter, 1);
    now.mockReturnValue(start + 14 * 60 * 1000 + 59 * 1000); // 14m59s into the window
    const blocked = applyRateLimit(request, limiter, 1);

    expect(blocked.success).toBe(false);
    expect(blocked.headers['Retry-After']).toBe('1');
    expect(blocked.headers['X-RateLimit-Reset']).toBe(new Date(start + 15 * 60 * 1000).toISOString());
  });
});

describe('credential limiter never pools unidentifiable clients', () => {
  it('does not share one client bucket between requests that carry no client address', async () => {
    memoryLimiterStore();

    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => allowCredentialAttempt(`user-${i}@example.test`, {}))
    );

    expect(results.every(Boolean)).toBe(true);
  });

  it('keeps logins working site-wide when TRUSTED_PROXY_HOPS is garbage', async () => {
    process.env.TRUSTED_PROXY_HOPS = 'two';
    memoryLimiterStore();

    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        allowCredentialAttempt(`user-${i}@example.test`, { 'x-forwarded-for': `198.51.100.${i}` })
      )
    );

    expect(results.every(Boolean)).toBe(true);
  });
});

describe('startup validation', () => {
  it('reports a non-integer TRUSTED_PROXY_HOPS and accepts 0', () => {
    const { validateEnvironment } = require('@/lib/env');

    process.env.TRUSTED_PROXY_HOPS = 'two';
    expect(() => validateEnvironment()).toThrow(/TRUSTED_PROXY_HOPS must be a whole number/);

    process.env.TRUSTED_PROXY_HOPS = '0';
    expect(() => validateEnvironment()).not.toThrow();
  });
});
