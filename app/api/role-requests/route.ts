/**
 * Role request API
 * POST /api/role-requests - Submit a role upgrade request (authenticated)
 * GET /api/role-requests - List role requests (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireAuth } from '@/lib/auth/middleware';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { Logger } from '@/lib/errors';
import { validateRoleRequestSubmission, formatZodErrors } from '@/lib/validation';
import { getUserById } from '@/lib/auth/utils';
import { RoleChangeRequest, UserRole } from '@/lib/auth/types';

const logger = new Logger('RoleRequestsAPI');

const ROLE_RANKING: Record<UserRole, number> = {
  [UserRole.GUEST]: 0,
  [UserRole.VIEWER]: 1,
  [UserRole.EDITOR]: 2,
  [UserRole.ADMIN]: 3,
};

function isRoleUpgrade(currentRole: UserRole, requestedRole: UserRole): boolean {
  return ROLE_RANKING[requestedRole] > ROLE_RANKING[currentRole];
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const validation = validateRoleRequestSubmission(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: formatZodErrors(validation.errors!)
        },
        { status: 400 }
      );
    }

    const { requestedRole, justification } = validation.data;
    const user = await getUserById(authResult.user.id);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const requested = requestedRole as UserRole;

    if (![UserRole.EDITOR, UserRole.ADMIN].includes(requested)) {
      return NextResponse.json(
        { error: 'Requested role must be editor or admin' },
        { status: 400 }
      );
    }

    if (!isRoleUpgrade(user.role, requested)) {
      return NextResponse.json(
        { error: 'Requested role must be higher than your current role' },
        { status: 400 }
      );
    }

    const collection = await getCollection<RoleChangeRequest>(COLLECTIONS.ROLE_REQUESTS);
    const pending = await collection.findOne({ user_id: user.id, status: 'pending' });

    if (pending) {
      return NextResponse.json(
        { error: 'You already have a pending role request' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const roleRequest: RoleChangeRequest = {
      id: `role_request_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
      current_role: user.role,
      requested_role: requested,
      justification: justification.trim(),
      status: 'pending',
      admin_notes: null,
      created_at: now,
      updated_at: now,
      reviewed_at: null,
      reviewed_by: null,
      reviewed_by_name: null,
    };

    await collection.insertOne(roleRequest as any);
    logger.info('Role request submitted', { userId: user.id, requestedRole: requested });

    return NextResponse.json({ request: roleRequest }, { status: 201 });
  } catch (error) {
    logger.error('Failed to submit role request', error);
    return NextResponse.json(
      { error: 'Failed to submit role request' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const filter: Record<string, string> = {};

    if (status) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status filter' },
          { status: 400 }
        );
      }
      filter.status = status;
    }

    const collection = await getCollection<RoleChangeRequest>(COLLECTIONS.ROLE_REQUESTS);
    const requests = await collection.find(filter).sort({ created_at: -1 }).toArray();

    const sanitized = requests.map((item) => {
      const { _id, ...rest } = item as RoleChangeRequest & { _id?: unknown };
      return rest;
    });

    return NextResponse.json({ requests: sanitized });
  } catch (error) {
    logger.error('Failed to fetch role requests', error);
    return NextResponse.json(
      { error: 'Failed to fetch role requests' },
      { status: 500 }
    );
  }
}

