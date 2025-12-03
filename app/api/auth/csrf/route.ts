/**
 * CSRF Token API Route
 * 
 * Provides CSRF token to authenticated clients for use in state-changing requests.
 * 
 * GET /api/auth/csrf
 * Returns the CSRF token from the current session.
 */

import { NextResponse } from 'next/server';
import { getCSRFToken } from '@/lib/csrf';

/**
 * GET /api/auth/csrf
 * Get CSRF token for the current session
 * 
 * @returns CSRF token or error if not authenticated
 */
export async function GET() {
  try {
    const csrfToken = await getCSRFToken();
    
    if (!csrfToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      csrfToken,
    });
  } catch (error) {
    console.error('[CSRF] Error getting CSRF token:', error);
    
    return NextResponse.json(
      { error: 'Failed to get CSRF token' },
      { status: 500 }
    );
  }
}

