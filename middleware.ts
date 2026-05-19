/**
 * Next.js Middleware for Route Protection + CSP Nonce
 *
 * Responsibilities:
 *  1. Generate a per-request CSP nonce and forward it to server components
 *     via the `x-nonce` request header.
 *  2. Set the Content-Security-Policy response header using that nonce so
 *     `unsafe-inline` is no longer required for scripts.
 *  3. Enforce authentication / role-based access control.
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
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
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "font-src 'self'",
    "connect-src 'self' https://api.geonet.org.nz https://*.tile.openstreetmap.org",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join('; ');
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Admin-only routes
    if (path.startsWith('/admin')) {
      if (token?.role !== UserRole.ADMIN) {
        return NextResponse.redirect(new URL('/', req.url));
      }
    }

    // Login/Register routes — redirect to home if already authenticated
    if ((path === '/login' || path === '/register') && token) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    // Generate a fresh nonce for every successful (non-redirect) response.
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

    // Forward the nonce to server components via a request header so
    // layout.tsx can read it with headers().get('x-nonce').
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', buildCsp(nonce));
    return response;
  },
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

