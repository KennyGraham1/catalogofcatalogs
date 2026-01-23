/**
 * Next.js Middleware for Route Protection
 * Protects pages and API routes based on authentication and roles
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { UserRole } from './lib/auth/types';

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

    // Profile route - requires authentication (handled by withAuth)
    // Login/Register routes - redirect to home if already authenticated
    if ((path === '/login' || path === '/register') && token) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    return NextResponse.next();
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
        
        // All other routes are public for now
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

