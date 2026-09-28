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
import { writeAuditLog } from '@/lib/audit';
import type { RoleChangeRequest } from '@/lib/auth/types';

const logger = new Logger('RoleRequestReviewAPI');

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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
    const existing = await collection.findOne({ id: id });

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
      { id: id, status: 'pending' },
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
      // Apply the request only to the account as it was when the request was filed:
      // a role changed since then (a promotion, or a demotion for misuse) or a
      // deactivated account must not be overwritten by a stale request. The filter
      // makes the check and the write one atomic step.
      const userUpdate = await usersCollection.updateOne(
        { id: existing.user_id, role: existing.current_role, is_active: { $ne: false } },
        { $set: { role: existing.requested_role, updated_at: now } }
      );

      if (userUpdate.matchedCount === 0) {
        await collection.updateOne(
          { id: id },
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

        const current = await usersCollection.findOne({ id: existing.user_id });
        if (!current) {
          return NextResponse.json(
            { error: 'User for role request not found' },
            { status: 404 }
          );
        }

        const liveRole = String(current.role ?? 'unknown').toUpperCase();
        return NextResponse.json(
          {
            error: current.is_active === false
              ? 'This account has been deactivated, so the request cannot be approved.'
              : `The user's role has changed since this request was made (now ${liveRole}). ` +
                'Reject it; the user can submit a new request if one is still needed.',
          },
          { status: 409 }
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

    // An approval changed the role (from current_role: the update above only matched
    // an account still in that role). A rejection changed nothing, so it is logged as
    // what it was rather than as a role change.
    await writeAuditLog({
      action: status === 'approved' ? 'user.role_change' : 'role_request.reject',
      actor_id: authResult.user.id,
      actor_email: authResult.user.email ?? undefined,
      target_id: existing.user_id,
      target_type: 'user',
      metadata: {
        requestId: existing.id,
        status,
        fromRole: existing.current_role,
        ...(status === 'approved' ? { toRole: existing.requested_role } : { requestedRole: existing.requested_role }),
      },
    }, request);

    const updated = await collection.findOne({ id: id });
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
