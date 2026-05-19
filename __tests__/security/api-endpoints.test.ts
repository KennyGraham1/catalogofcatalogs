/**
 * @jest-environment node
 *
 * API Endpoint Security Tests
 *
 * These tests make real calls into the Next.js route handlers (not just stubs)
 * to verify authentication enforcement, rate limiting, and request validation.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Auth middleware — requireEditor / requireAdmin
// ---------------------------------------------------------------------------

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(),
  requireAdmin: jest.fn(),
  requireViewer: jest.fn(),
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: {
    USERS: 'users',
    CATALOGUES: 'merged_catalogues',
    EVENTS: 'merged_events',
    AUDIT_LOGS: 'audit_logs',
    PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  },
  isConnected: jest.fn().mockResolvedValue(true),
  getDb: jest.fn(),
}));

jest.mock('@/lib/db', () => ({ dbQueries: null }));

import { requireEditor, requireAdmin } from '@/lib/auth/middleware';
import { NextResponse } from 'next/server';

function mockUnauthenticated() {
  (requireEditor as jest.Mock).mockResolvedValue(
    NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  );
  (requireAdmin as jest.Mock).mockResolvedValue(
    NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  );
}

function mockAuthenticated(role = 'editor') {
  const user = { id: 'u1', email: 'test@example.com', role };
  (requireEditor as jest.Mock).mockResolvedValue({ session: { user }, user });
  (requireAdmin as jest.Mock).mockResolvedValue({ session: { user }, user });
}

function makeRequest(url: string, options: Omit<RequestInit, 'signal'> & { signal?: AbortSignal } = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options as any);
}

describe('POST /api/catalogues — authentication gate', () => {
  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();
    const { POST } = await import('@/app/api/catalogues/route');
    const req = makeRequest('http://localhost:3000/api/catalogues', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', events: [] }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    mockAuthenticated();
    const { POST } = await import('@/app/api/catalogues/route');
    const req = makeRequest('http://localhost:3000/api/catalogues', {
      method: 'POST',
      body: JSON.stringify({ events: [] }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('MISSING_NAME');
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    mockAuthenticated();
    const { POST } = await import('@/app/api/catalogues/route');
    const req = makeRequest('http://localhost:3000/api/catalogues', {
      method: 'POST',
      body: JSON.stringify({ name: 'a'.repeat(256), events: [] }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('NAME_TOO_LONG');
  });
});

describe('GET /api/cache/stats — admin-only', () => {
  it('returns 401 when not authenticated', async () => {
    mockUnauthenticated();
    const { GET } = await import('@/app/api/cache/stats/route');
    const req = makeRequest('http://localhost:3000/api/cache/stats');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('Rate limiter — auth endpoints', () => {
  it('enforces a 10-request limit on auth endpoints within the window', () => {
    const { rateLimit, getClientIp } = require('@/lib/rate-limiter');
    const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 10 });
    const fakeReq = { headers: { get: () => '1.2.3.4' } } as any;

    for (let i = 0; i < 10; i++) {
      const result = limiter.check(10, getClientIp(fakeReq));
      expect(result.success).toBe(true);
    }
    // 11th request must be blocked
    const blocked = limiter.check(10, getClientIp(fakeReq));
    expect(blocked.success).toBe(false);
  });
});

describe('IP extraction — x-forwarded-for spoofing', () => {
  const { getClientIp } = require('@/lib/rate-limiter');

  it('uses the rightmost hop (set by trusted proxy) not the leftmost (client-controlled)', () => {
    const req = { headers: { get: (h: string) => h === 'x-forwarded-for' ? 'evil-spoof, 10.0.0.1, 203.0.113.5' : null } } as any;
    // With TRUSTED_PROXY_HOPS=1 (default), the trusted IP is the rightmost
    const ip = getClientIp(req);
    expect(ip).toBe('203.0.113.5');
    expect(ip).not.toBe('evil-spoof');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = {
      headers: {
        get: (h: string) => {
          if (h === 'x-real-ip') return '198.51.100.1';
          return null;
        },
      },
    } as any;
    expect(getClientIp(req)).toBe('198.51.100.1');
  });

  it('returns unknown when no IP header is present', () => {
    const req = { headers: { get: () => null } } as any;
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('Request size limits', () => {
  it('returns 413 when content-length exceeds 100MB', async () => {
    mockAuthenticated();
    const { POST } = await import('@/app/api/catalogues/route');
    const req = makeRequest('http://localhost:3000/api/catalogues', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(101 * 1024 * 1024),
      },
      body: JSON.stringify({ name: 'x', events: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });
});
