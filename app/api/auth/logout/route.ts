/**
 * Logout API Route
 * 
 * Handles custom logout logic and audit logging.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAuditLog } from '@/lib/auth-db';

/**
 * POST /api/auth/logout
 * Log out the current user
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (session?.user) {
      // Create audit log for logout
      await createAuditLog({
        user_id: session.user.id,
        action: 'logout',
        resource_type: 'session',
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        user_agent: request.headers.get('user-agent') || undefined,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}

