/**
 * Session Info API Endpoint
 * GET /api/auth/session - Get current session information
 *
 * This static route takes precedence over NextAuth's [...nextauth] catch-all, so it is
 * what SessionProvider/useSession poll. Its shape must match NextAuth's own endpoint:
 * next-auth's client treats ANY non-empty object as a session, so the no-session answer
 * has to be `{}`. (`{ user: null }` made every anonymous visitor "authenticated".)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const session = await getSession(request);

  // No session, or one the session callback revoked (user cleared).
  if (!session || !session.user) {
    return NextResponse.json({}, { status: 200 });
  }

  return NextResponse.json({
    user: session.user,
  });
}
