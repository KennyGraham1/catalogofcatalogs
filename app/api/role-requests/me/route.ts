/**
 * Role requests for current user
 * GET /api/role-requests/me - List role requests for authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { Logger } from '@/lib/errors';
import type { RoleChangeRequest } from '@/lib/auth/types';

const logger = new Logger('RoleRequestsMeAPI');

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const collection = await getCollection<RoleChangeRequest>(COLLECTIONS.ROLE_REQUESTS);
    const requests = await collection
      .find({ user_id: authResult.user.id })
      .sort({ created_at: -1 })
      .toArray();

    const sanitized = requests.map((item) => {
      const { _id, ...rest } = item as RoleChangeRequest & { _id?: unknown };
      return rest;
    });

    return NextResponse.json({ requests: sanitized });
  } catch (error) {
    logger.error('Failed to fetch user role requests', error);
    return NextResponse.json(
      { error: 'Failed to fetch role requests' },
      { status: 500 }
    );
  }
}

