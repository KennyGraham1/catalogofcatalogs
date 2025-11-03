/**
 * NextAuth.js Middleware
 * 
 * Protects routes based on authentication status.
 */

export { default } from 'next-auth/middleware';

/**
 * Matcher configuration
 * Specifies which routes the middleware should run on
 */
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/catalogues/:path*',
    '/upload/:path*',
    '/import/:path*',
    '/merge/:path*',
    '/analytics/:path*',
    '/settings/:path*',
    '/admin/:path*',
  ],
};
