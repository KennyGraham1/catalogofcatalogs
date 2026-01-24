/**
 * Role request review API (admin only)
 * PATCH /api/role-requests/[id] - Approve or reject a request
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { Logger } from '@/lib/errors';
import { validateRoleRequestReview, formatZodErrors } from '@/lib/validation';
import { createUserNotification, sendEmailNotification } from '@/lib/notifications';
import type { RoleChangeRequest } from '@/lib/auth/types';

const logger = new Logger('RoleRequestReviewAPI');

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const validation = validateRoleRequestReview(body);

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

    if (!validation.data) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: ['Request body is missing required fields.']
        },
        { status: 400 }
      );
    }

    const { status, adminNotes } = validation.data;
    const collection = await getCollection<RoleChangeRequest>(COLLECTIONS.ROLE_REQUESTS);
    const existing = await collection.findOne({ id: params.id });

    if (!existing) {
      return NextResponse.json(
        { error: 'Role request not found' },
        { status: 404 }
      );
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Role request has already been reviewed' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const adminName = authResult.user.name || authResult.user.email || 'Admin';
    const cleanedNotes = adminNotes?.trim() || null;

    const updateFields = {
      status,
      admin_notes: cleanedNotes,
      updated_at: now,
      reviewed_at: now,
      reviewed_by: authResult.user.id,
      reviewed_by_name: adminName,
    };

    const updateResult = await collection.updateOne(
      { id: params.id, status: 'pending' },
      { $set: updateFields }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Role request has already been reviewed' },
        { status: 409 }
      );
    }

    if (status === 'approved') {
      const usersCollection = await getCollection(COLLECTIONS.USERS);
      const userUpdate = await usersCollection.updateOne(
        { id: existing.user_id },
        { $set: { role: existing.requested_role, updated_at: now } }
      );

      if (userUpdate.matchedCount === 0) {
        await collection.updateOne(
          { id: params.id },
          {
            $set: {
              status: 'pending',
              admin_notes: null,
              updated_at: now,
              reviewed_at: null,
              reviewed_by: null,
              reviewed_by_name: null,
            }
          }
        );

        return NextResponse.json(
          { error: 'User for role request not found' },
          { status: 404 }
        );
      }
    }

    const statusLabel = status === 'approved' ? 'approved' : 'rejected';
    const notificationTitle = `Role request ${statusLabel}`;
    const notificationMessage = cleanedNotes
      ? `Your request to upgrade to ${existing.requested_role.toUpperCase()} was ${statusLabel}. Admin notes: ${cleanedNotes}`
      : `Your request to upgrade to ${existing.requested_role.toUpperCase()} was ${statusLabel}.`;

    try {
      await createUserNotification({
        userId: existing.user_id,
        type: 'role_request',
        title: notificationTitle,
        message: notificationMessage,
        metadata: {
          requestId: existing.id,
          status,
          requestedRole: existing.requested_role,
        },
      });

      await sendEmailNotification({
        to: existing.user_email,
        subject: notificationTitle,
        message: notificationMessage,
      });
    } catch (error) {
      logger.warn('Failed to send role request notification', {
        error: error instanceof Error ? error.message : error,
      });
    }

    const updated = await collection.findOne({ id: params.id });
    const sanitized = updated ? (({ _id, ...rest }) => rest)(updated as RoleChangeRequest & { _id?: unknown }) : null;

    return NextResponse.json({ request: sanitized });
  } catch (error) {
    logger.error('Failed to review role request', error);
    return NextResponse.json(
      { error: 'Failed to review role request' },
      { status: 500 }
    );
  }
}
