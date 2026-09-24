/**
 * Next.js Middleware for Route Protection + CSP Nonce
 */

import { withAuth, type NextRequestWithAuth } from 'next-auth/middleware';
import { getToken, type JWT } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { UserRole } from './lib/auth/types';

// All other security headers remain in next.config.js.
// Only CSP is generated here because it embeds the per-request nonce.
function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  // In development, keep unsafe-eval for hot reload; remove it in production.
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'unsafe-eval'`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "font-src 'self'",
    "connect-src 'self' https://api.geonet.org.nz https://*.tile.openstreetmap.org",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join('; ');
}

/**
 * Ask the server for the session as it stands NOW.
 */
async function liveSessionUser(req: NextRequest): Promise<{ role?: UserRole } | null> {
  try {
    const response = await fetch(new URL('/api/auth/session', req.nextUrl.origin), {
      headers: { cookie: req.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const session = await response.json();
    return session?.user ?? null;
  } catch {
    return null;
  }
}

async function handleRequest(req: NextRequest, token: JWT | null) {
  const path = req.nextUrl.pathname;

  const isAdminPath = path.startsWith('/admin');

  // Gated routes: re-check the session against the database rather than trusting the
  // cookie's claims (see liveSessionUser). A promotion takes effect here too, since
  // the role reported is the stored one, not the one the token was minted with.
  if (isAdminPath || path.startsWith('/profile')) {
    const user = await liveSessionUser(req);

    if (!user) {
      // Account deactivated or deleted, or the token revoked by a password change.
      const signIn = new URL('/login', req.url);
      signIn.searchParams.set('callbackUrl', `${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(signIn);
    }

    if (isAdminPath && user.role !== UserRole.ADMIN) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // Login/Register routes — redirect to home if already authenticated. The live check
  // matters here too: a cookie the server no longer honours must not bounce its owner
  // away from the only page that can give them a valid session again.
  if ((path === '/login' || path === '/register') && token) {
    if (await liveSessionUser(req)) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  // Generate a fresh nonce for every successful (non-redirect) response.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // Forward the nonce to server components via a request header so
  // layout.tsx can read it with headers().get('x-nonce').
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  const csp = buildCsp(nonce);
  // Next.js extracts its script nonce from the request CSP, not x-nonce.
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

const authenticatedMiddleware = withAuth(
  req => handleRequest(req, req.nextauth.token),
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Public routes
        if (path === '/login' || path === '/register') {
          return true;
        }

        // Protected routes require authentication
        if (path.startsWith('/admin') || path.startsWith('/profile')) {
          return !!token;
        }

        // All other routes are public
        return true;
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  // withAuth skips its configured sign-in page before invoking our callback.
  // Handle it directly so anonymous login pages get CSP and live sessions redirect.
  if (req.nextUrl.pathname === '/login') {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
    return handleRequest(req, token);
  }
  const response = await authenticatedMiddleware(req as NextRequestWithAuth, event);
  return response ?? handleRequest(req, null);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
