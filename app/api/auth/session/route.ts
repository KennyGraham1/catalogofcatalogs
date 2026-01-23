/**
 * Session Info API Endpoint
 * GET /api/auth/session - Get current session information
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/middleware';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  
  if (!session || !session.user) {
    return NextResponse.json(
      { user: null },
      { status: 200 }
    );
  }
  
  return NextResponse.json({
    user: session.user,
  });
}

