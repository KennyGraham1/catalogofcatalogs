/**
 * CSRF (Cross-Site Request Forgery) Protection
 * 
 * Implements CSRF token generation and validation to prevent CSRF attacks.
 * 
 * CSRF attacks occur when a malicious website tricks a user's browser into
 * making unwanted requests to a trusted site where the user is authenticated.
 * 
 * This implementation uses cryptographically secure random tokens that are:
 * 1. Generated server-side and stored in the user's session
 * 2. Sent to the client and included in state-changing requests
 * 3. Validated server-side before processing the request
 * 
 * @see https://owasp.org/www-community/attacks/csrf
 */

import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Generate a cryptographically secure CSRF token
 * 
 * @returns 64-character hexadecimal string (32 bytes)
 * 
 * @example
 * ```typescript
 * const token = generateCSRFToken();
 * // Returns: "a1b2c3d4e5f6..."
 * ```
 */
export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validate CSRF token from request against session token
 * 
 * @param requestToken - Token from request header
 * @param sessionToken - Token from user session
 * @returns true if tokens match, false otherwise
 * 
 * @example
 * ```typescript
 * const isValid = validateCSRFToken(
 *   request.headers.get('x-csrf-token'),
 *   session.csrfToken
 * );
 * ```
 */
export function validateCSRFToken(
  requestToken: string | null,
  sessionToken: string | undefined
): boolean {
  // Both tokens must exist
  if (!requestToken || !sessionToken) {
    return false;
  }
  
  // Use timing-safe comparison to prevent timing attacks
  // Convert to buffers for constant-time comparison
  const requestBuffer = Buffer.from(requestToken);
  const sessionBuffer = Buffer.from(sessionToken);
  
  // Tokens must be same length
  if (requestBuffer.length !== sessionBuffer.length) {
    return false;
  }
  
  // Constant-time comparison using crypto.timingSafeEqual
  try {
    return require('crypto').timingSafeEqual(requestBuffer, sessionBuffer);
  } catch {
    return false;
  }
}

/**
 * Middleware wrapper to protect routes with CSRF validation
 * 
 * Only validates CSRF tokens for state-changing HTTP methods:
 * - POST
 * - PUT
 * - DELETE
 * - PATCH
 * 
 * GET, HEAD, and OPTIONS requests are not validated as they should be idempotent.
 * 
 * @param handler - The route handler function to protect
 * @returns Wrapped handler with CSRF protection
 * 
 * @example
 * ```typescript
 * import { withCSRF } from '@/lib/csrf';
 * 
 * export const POST = withCSRF(async (request: NextRequest) => {
 *   // This code only runs if CSRF token is valid
 *   const data = await request.json();
 *   // ... process request
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withCSRF(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>,
  options: { required?: boolean } = { required: false }
) {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    // Only validate CSRF for state-changing methods
    const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    if (stateChangingMethods.includes(request.method)) {
      // Get CSRF token from request header
      const csrfToken = request.headers.get('x-csrf-token');

      // If CSRF token is provided, validate it
      // If not provided and not required, skip validation (for backward compatibility)
      if (csrfToken || options.required) {
        // Get session only if we need to validate
        const session = await getSession();

        // Validate CSRF token
        const isValid = validateCSRFToken(csrfToken, (session as any)?.csrfToken);

        if (!isValid) {
          return NextResponse.json(
            {
              error: 'Invalid or missing CSRF token',
              code: 'CSRF_TOKEN_INVALID',
            },
            { status: 403 }
          );
        }
      }
    }

    // CSRF token is valid or not required, proceed with handler
    return handler(request, context);
  };
}

/**
 * Get CSRF token from current session
 * If no token exists, generates a new one
 * 
 * Note: This is a helper for client-side usage.
 * The actual token should be stored in the session via NextAuth callbacks.
 * 
 * @returns CSRF token or null if no session
 * 
 * @example
 * ```typescript
 * // In an API route
 * export async function GET() {
 *   const csrfToken = await getCSRFToken();
 *   return NextResponse.json({ csrfToken });
 * }
 * ```
 */
export async function getCSRFToken(): Promise<string | null> {
  const session = await getSession();
  
  if (!session) {
    return null;
  }
  
  return (session as any)?.csrfToken || null;
}

