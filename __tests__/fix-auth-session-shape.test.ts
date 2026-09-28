/**
 * @jest-environment node
 *
 * #113: GET /api/auth/session must answer `{}` when there is no signed-in user.
 *
 * The static app/api/auth/session route shadows NextAuth's own session endpoint, so
 * SessionProvider/useSession poll it. next-auth's client (client/_utils fetchData)
 * treats ANY non-empty object as a session: `{ user: null }` therefore made every
 * anonymous visitor, and every revoked session, look "authenticated". NextAuth's own
 * endpoint answers `{}` for exactly this reason.
 *
 * These tests drive next-auth's real client parser and the real middleware gate
 * against the real route handler; only the session source (getServerSession, which
 * would decrypt a cookie and hit the database) is stubbed.
 */

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

// Capture the callback middleware.ts hands to withAuth so the gate can be driven directly.
jest.mock('next-auth/middleware', () => ({
  withAuth: (middleware: unknown) => {
    (globalThis as Record<string, unknown>).__sessionShapeWithAuth = middleware;
    return middleware;
  },
}));

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { fetchData } from 'next-auth/client/_utils';
import { GET } from '@/app/api/auth/session/route';
import { UserRole } from '@/lib/auth/types';
import '@/middleware';

type Gate = (req: unknown) => Promise<Response | undefined>;
const gate = (globalThis as Record<string, unknown>).__sessionShapeWithAuth as Gate;

const NEXTAUTH = {
  baseUrl: 'http://localhost',
  basePath: '/api/auth',
  baseUrlServer: 'http://localhost',
  basePathServer: '/api/auth',
  _lastSync: 0,
  _session: undefined,
  _getSession: () => {},
};
const clientLogger = { error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

const originalFetch = globalThis.fetch;

/** Route every fetch (the browser client's and the middleware's) to the real handler. */
function serveSessionRoute() {
  globalThis.fetch = jest.fn(async (url: string | URL, init?: RequestInit) =>
    GET(new NextRequest(String(url), init as ConstructorParameters<typeof NextRequest>[1]))
  ) as unknown as typeof fetch;
}

function storedSession(session: unknown) {
  (getServerSession as jest.Mock).mockResolvedValue(session);
}

beforeEach(() => serveSessionRoute());
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('#113 session endpoint shape seen by the next-auth client', () => {
  it('answers {} for an anonymous visitor, which the client reads as no session', async () => {
    storedSession(null);

    const response = await GET(new NextRequest('http://localhost/api/auth/session'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});

    // SessionProvider derives status from this value: null => 'unauthenticated'.
    expect(await fetchData('session', NEXTAUTH as never, clientLogger as never)).toBeNull();
  });

  it('answers {} for a revoked session (session callback clears user)', async () => {
    // lib/auth/config.ts session callback returns the session with user undefined.
    storedSession({ expires: '2099-01-01T00:00:00.000Z', user: undefined });

    expect(await fetchData('session', NEXTAUTH as never, clientLogger as never)).toBeNull();
  });

  it('still returns the user for a live session', async () => {
    const user = { id: 'u1', email: 'a@example.test', name: 'A', role: UserRole.EDITOR };
    storedSession({ expires: '2099-01-01T00:00:00.000Z', user });

    expect(await fetchData('session', NEXTAUTH as never, clientLogger as never)).toEqual({ user });
  });
});

describe('#113 middleware gate still works against the {} shape', () => {
  const request = (path: string, token: unknown) =>
    Object.assign(
      new NextRequest(`http://localhost${path}`, { headers: { cookie: 'next-auth.session-token=abc' } }),
      { nextauth: { token } },
    );
  const adminToken = { id: 'u1', role: UserRole.ADMIN, jwtVersion: 0 };

  it('redirects /admin to sign-in when the live session has no user', async () => {
    storedSession(null);

    const response = await gate(request('/admin/users', adminToken));

    expect(response!.status).toBe(307);
    expect(response!.headers.get('location')).toBe('http://localhost/login?callbackUrl=%2Fadmin%2Fusers');
  });

  it('admits a live admin', async () => {
    storedSession({ user: { id: 'u1', role: UserRole.ADMIN } });

    const response = await gate(request('/admin/users', adminToken));

    expect(response!.status).toBe(200);
  });

  it('keeps a revoked cookie on /login instead of bouncing it home', async () => {
    storedSession({ expires: '2099-01-01T00:00:00.000Z', user: undefined });

    const response = await gate(request('/login', adminToken));

    expect(response!.status).toBe(200);
  });
});
