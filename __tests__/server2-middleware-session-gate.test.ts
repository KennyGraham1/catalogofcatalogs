/**
 * @jest-environment node
 *
 * Regression tests for the edge route gate in middleware.ts (cluster: server2).
 *
 * next-auth/middleware authorises with getToken(), which only decrypts the session
 * cookie — it does not run callbacks.jwt, so the role and liveness claims in
 * `req.nextauth.token` are the ones minted at sign-in and stay valid for the whole 24 h
 * token lifetime. The gate must therefore re-read the session from the server
 * (/api/auth/session runs getServerSession -> callbacks.jwt -> database) instead of
 * trusting the cookie.
 */

// Capture the function middleware.ts hands to withAuth so it can be driven directly.
// The captured value is stashed on globalThis because a jest.mock factory is hoisted
// above every const in this file.
jest.mock('next-auth/middleware', () => ({
  withAuth: (middleware: unknown, options: unknown) => {
    (globalThis as Record<string, unknown>).__capturedWithAuth = { middleware, options };
    return middleware;
  },
}));

import { NextRequest } from 'next/server';
import { UserRole } from '@/lib/auth/types';
import '@/middleware';

type Captured = {
  middleware: (req: unknown, event?: unknown) => Promise<Response | undefined>;
  options: {
    callbacks: { authorized: (params: { token: unknown; req: NextRequest }) => boolean };
  };
};

const captured = (globalThis as Record<string, unknown>).__capturedWithAuth as Captured;

const SESSION_COOKIE = 'next-auth.session-token=abc123';

function request(path: string, token: unknown) {
  const req = new NextRequest(`http://localhost${path}`, {
    headers: { cookie: SESSION_COOKIE },
  });
  return Object.assign(req, { nextauth: { token } });
}

/** Make /api/auth/session answer with this session body. */
function serverSession(body: unknown, ok = true) {
  const fetchMock = jest.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
  globalThis.fetch = fetchMock;
  return fetchMock as unknown as jest.Mock;
}

const adminToken = { id: 'u1', role: UserRole.ADMIN, jwtVersion: 0 };
const viewerToken = { id: 'u2', role: UserRole.VIEWER, jwtVersion: 0 };

const originalFetch = globalThis.fetch;
// Redirects are built on NEXTAUTH_URL (the public URL); pin it so the expected locations
// do not depend on the developer's local environment file.
const originalNextAuthUrl = process.env.NEXTAUTH_URL;
beforeAll(() => { process.env.NEXTAUTH_URL = 'http://localhost'; });
afterAll(() => { process.env.NEXTAUTH_URL = originalNextAuthUrl; });

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('server2 :: /admin gate re-reads the session', () => {
  it('redirects a demoted admin whose cookie still says admin', async () => {
    // Token minted while the account was an admin; the account is now a viewer.
    serverSession({ user: { id: 'u1', role: UserRole.VIEWER } });

    const response = await captured.middleware(request('/admin/users', adminToken));

    expect(response!.status).toBe(307);
    expect(response!.headers.get('location')).toBe('http://localhost/');
  });

  it('redirects to the sign-in page when the session has been revoked', async () => {
    // Deactivated/deleted account, or a jwt_version bump: getServerSession -> no user.
    serverSession({ user: null });

    const response = await captured.middleware(request('/admin/users', adminToken));

    expect(response!.status).toBe(307);
    expect(response!.headers.get('location')).toBe(
      'http://localhost/login?callbackUrl=%2Fadmin%2Fusers'
    );
  });

  it('lets a still-current admin through and forwards the session cookie', async () => {
    const fetchMock = serverSession({ user: { id: 'u1', role: UserRole.ADMIN } });

    const response = await captured.middleware(request('/admin/users', adminToken));

    // Not a redirect: the CSP-carrying NextResponse.next() response.
    expect(response!.status).toBe(200);
    expect(response!.headers.get('Content-Security-Policy')).toContain("default-src 'self'");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('http://localhost/api/auth/session');
    expect((init.headers as Record<string, string>).cookie).toBe(SESSION_COOKIE);
  });

  it('admits a user promoted to admin since their token was minted', async () => {
    serverSession({ user: { id: 'u2', role: UserRole.ADMIN } });

    const response = await captured.middleware(request('/admin', viewerToken));

    expect(response!.status).toBe(200);
  });

  it('fails closed when the session cannot be checked', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    const response = await captured.middleware(request('/admin', adminToken));

    expect(response!.status).toBe(307);
    expect(response!.headers.get('location')).toContain('/login');
  });
});

describe('server2 :: /profile gate', () => {
  it('redirects a revoked session away from /profile', async () => {
    serverSession({ user: null });

    const response = await captured.middleware(request('/profile', viewerToken));

    expect(response!.status).toBe(307);
    expect(response!.headers.get('location')).toContain('/login');
  });

  it('lets a live non-admin session reach /profile', async () => {
    serverSession({ user: { id: 'u2', role: UserRole.VIEWER } });

    const response = await captured.middleware(request('/profile', viewerToken));

    expect(response!.status).toBe(200);
  });
});

describe('server2 :: sign-in page is not blocked by a dead cookie', () => {
  it('keeps a revoked session on /login instead of bouncing it home', async () => {
    serverSession({ user: null });

    const response = await captured.middleware(request('/login', adminToken));

    expect(response!.status).toBe(200);
  });

  it('still redirects a live session away from /login', async () => {
    serverSession({ user: { id: 'u1', role: UserRole.ADMIN } });

    const response = await captured.middleware(request('/login', adminToken));

    expect(response!.status).toBe(307);
    expect(response!.headers.get('location')).toBe('http://localhost/');
  });

  it('does not query the session for an anonymous visitor on a public page', async () => {
    const fetchMock = serverSession({ user: null });

    const response = await captured.middleware(request('/', null));

    expect(response!.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('server2 :: authorized callback still gates on the presence of a token', () => {
  const authorized = captured.options.callbacks.authorized;

  it('requires a token for /admin and /profile, and nothing for public paths', () => {
    const req = (path: string) => new NextRequest(`http://localhost${path}`);

    expect(authorized({ token: null, req: req('/admin') })).toBe(false);
    expect(authorized({ token: null, req: req('/profile') })).toBe(false);
    expect(authorized({ token: adminToken, req: req('/admin') })).toBe(true);
    expect(authorized({ token: null, req: req('/login') })).toBe(true);
    expect(authorized({ token: null, req: req('/catalogues') })).toBe(true);
  });
});

describe('signed-in visit to /login or /register (remaining issues, 2026-10-06)', () => {
  const live = () => serverSession({ user: { id: 'u2', role: UserRole.VIEWER } });

  it('goes to the safe callback the sign-in link carried, not always home', async () => {
    live();
    const response = await captured.middleware(request('/login?callbackUrl=%2Fmerge', viewerToken));
    expect(response!.status).toBe(307);
    expect(response!.headers.get('location')).toBe('http://localhost/merge');
    live();
    const register = await captured.middleware(request('/register?callbackUrl=%2Fcatalogues%2Fabc%2Fmap%3Ftab%3Devents', viewerToken));
    expect(register!.headers.get('location')).toBe('http://localhost/catalogues/abc/map?tab=events');
  });

  it('never follows an off-site or auth-page callback', async () => {
    for (const callback of ['https://evil.example/x', '//evil.example', '/login?callbackUrl=%2Fmerge', '/register']) {
      live();
      const response = await captured.middleware(request(`/login?callbackUrl=${encodeURIComponent(callback)}`, viewerToken));
      expect(response!.headers.get('location')).toBe('http://localhost/');
    }
  });

  // `next start` hands middleware its own bind name in the URL, Host and X-Forwarded-Host
  // (measured: localhost:3110 while the browser was on 127.0.0.1:3110).
  const boundRequest = (headers: Record<string, string> = {}) => Object.assign(
    new NextRequest('http://localhost:3110/login?callbackUrl=%2Fsettings', { headers: { cookie: SESSION_COOKIE, host: 'localhost:3110', ...headers } }),
    { nextauth: { token: viewerToken } },
  );

  it('redirects on the public origin (NEXTAUTH_URL), not the server bind name', async () => {
    process.env.NEXTAUTH_URL = 'http://127.0.0.1:3110';
    try {
      live();
      const response = await captured.middleware(boundRequest());
      expect(response!.headers.get('location')).toBe('http://127.0.0.1:3110/settings');
    } finally {
      process.env.NEXTAUTH_URL = 'http://localhost';
    }
  });

  it('without NEXTAUTH_URL, uses the forwarded host', async () => {
    delete process.env.NEXTAUTH_URL;
    try {
      live();
      const response = await captured.middleware(boundRequest({ 'x-forwarded-host': 'catalogues.example.org', 'x-forwarded-proto': 'https' }));
      expect(response!.headers.get('location')).toBe('https://catalogues.example.org/settings');
    } finally {
      process.env.NEXTAUTH_URL = 'http://localhost';
    }
  });
});
