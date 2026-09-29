/**
 * @jest-environment node
 *
 * Security-review follow-up: GET /api/faults/nearby counted its lookups on the shared
 * readRateLimiter, the instance GET /api/catalogues also uses (with a limit of 120), so
 * 31 catalogue-list reads in a minute left the first fault lookup refused with 429. The
 * route now has a limiter of its own, keyed by the signed-in user.
 *
 * Real route and limiters; the session check and the GNS WFS are stubbed.
 */

import { NextRequest } from 'next/server';

jest.mock('@/lib/auth/middleware', () => ({
  requireViewer: jest.fn(async (request: Request) => {
    const id = request.headers.get('x-test-user') ?? 'viewer-1';
    return { session: {}, user: { id, role: 'viewer' } };
  }),
}));

import { applyRateLimit, readRateLimiter } from '@/lib/rate-limiter';
import { GET as faultsNearby } from '@/app/api/faults/nearby/route';

beforeEach(() => {
  // An empty AF250 answer: no network.
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ type: 'FeatureCollection', numberMatched: 0, features: [] }),
  })) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

function lookup(ip: string, user?: string) {
  const headers: Record<string, string> = { 'x-forwarded-for': ip };
  if (user) headers['x-test-user'] = user;
  return faultsNearby(new NextRequest('http://localhost/api/faults/nearby?lat=-41.29&lon=174.77&radius=50&limit=3', { headers }));
}

it('is not refused because the same client listed catalogues', async () => {
  // What 31 GET /api/catalogues requests in a minute do to the shared limiter.
  const listing = () => new Request('http://localhost/api/catalogues', { headers: { 'x-forwarded-for': '203.0.113.7' } });
  for (let i = 0; i < 31; i++) expect(applyRateLimit(listing(), readRateLimiter, 120).success).toBe(true);

  expect((await lookup('203.0.113.7', 'reader')).status).toBe(200);
});

it('counts lookups per signed-in user, whatever address they come from', async () => {
  for (let i = 0; i < 30; i++) expect((await lookup(`198.51.100.${i}`, 'busy-user')).status).toBe(200);

  const refused = await lookup('198.51.100.200', 'busy-user');
  expect(refused.status).toBe(429);
  expect(refused.headers.get('Retry-After')).toBeTruthy();
  // Another user from the same address is unaffected.
  expect((await lookup('198.51.100.200', 'other-user')).status).toBe(200);
});
