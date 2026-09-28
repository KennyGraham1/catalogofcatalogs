/**
 * User Management API Endpoint
 * GET /api/users/[id] - Get user by ID (Admin only)
 * PATCH /api/users/[id] - Update user (Admin only)
 * DELETE /api/users/[id] - Delete user (Admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { RoleChangeRequest, UserRole } from '@/lib/auth/types';
import { Logger } from '@/lib/errors';
import { writeAuditLog } from '@/lib/audit';

const logger = new Logger('UserAPI');

interface Actor { id: string; name?: string | null; email?: string | null }

type UsersCollection = Awaited<ReturnType<typeof getCollection>>;

/** Documents without the flag count as active (see getSessionUserState). */
const ACTIVE_ADMIN = { role: UserRole.ADMIN, is_active: { $ne: false } };

function isActiveAdmin(user: Record<string, unknown>): boolean {
  return user.role === UserRole.ADMIN && user.is_active !== false;
}

const LAST_ADMIN_ERROR = 'At least one active administrator must remain. Promote another user to admin first.';
const CHANGED_ERROR = 'This account was changed by someone else in the meantime. Reload and try again.';

/**
 * Take admin rights away from `id` without ever leaving the system with no active
 * admin, even when two admins demote, deactivate or delete each other at once.
 *
 * The update applies only if the account is still the active admin that was read,
 * then the remaining active admins are counted and the update is reverted if none are
 * left. Whatever the interleaving, the last request to finish its count sees the
 * others' updates, so the invariant holds once all have finished. (A transaction would
 * not be enough: two snapshot transactions demoting different admins do not conflict.)
 * `revert` restores the fields as read, and applies only while our write is the latest.
 */
async function revokeAdmin(
  collection: UsersCollection,
  id: string,
  changes: Record<string, unknown> & { updated_at: string },
  revert: Record<string, unknown>
): Promise<NextResponse | null> {
  const result = await collection.updateOne({ id, ...ACTIVE_ADMIN }, { $set: changes });
  if (result.matchedCount === 0) {
    return (await collection.findOne({ id }))
      ? NextResponse.json({ error: CHANGED_ERROR }, { status: 409 })
      : NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (await collection.countDocuments(ACTIVE_ADMIN) === 0) {
    await collection.updateOne({ id, updated_at: changes.updated_at }, { $set: revert });
    return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 409 });
  }
  return null;
}

/**
 * Close the user's pending role requests. Called when an admin changes the role
 * directly or deletes the account: approving such a request later would apply a
 * role decided against an account state that no longer exists. Best effort - the
 * approval itself also refuses requests whose starting role no longer matches.
 */
async function closePendingRoleRequests(userId: string, note: string, actor: Actor) {
  try {
    const now = new Date().toISOString();
    const requests = await getCollection<RoleChangeRequest>(COLLECTIONS.ROLE_REQUESTS);
    await requests.updateMany(
      { user_id: userId, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          admin_notes: note,
          updated_at: now,
          reviewed_at: now,
          reviewed_by: actor.id,
          reviewed_by_name: actor.name || actor.email || 'Admin',
        },
      }
    );
  } catch (error) {
    logger.warn('Failed to close pending role requests', {
      userId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const authResult = await requireAdmin(request);
  
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const collection = await getCollection(COLLECTIONS.USERS);
    const user = await collection.findOne({ id: id });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const userData = { ...(user as Record<string, unknown>) };
    delete userData._id;
    delete userData.password_hash;

    return NextResponse.json({ user: userData });
  } catch (error) {
    logger.error('Failed to retrieve user', error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve user' },
      { status: 500 }
    );
  }
}

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
    const { role, is_active, name } = body;
    
    const collection = await getCollection(COLLECTIONS.USERS);
    
    // Build update object
    const updateFields: any = {
      updated_at: new Date().toISOString(),
    };
    
    if (role !== undefined) {
      // Validate role
      if (!Object.values(UserRole).includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
      updateFields.role = role;
    }
    
    if (is_active !== undefined) {
      // Must be stored as a real boolean: a string such as "false" is truthy at
      // the login check (lib/auth/config.ts) and in getSessionUserState, so a
      // malformed request would silently fail to deactivate the account.
      if (typeof is_active !== 'boolean') {
        return NextResponse.json(
          { error: 'is_active must be a boolean' },
          { status: 400 }
        );
      }
      updateFields.is_active = is_active;
    }
    
    if (name !== undefined) {
      updateFields.name = name;
    }

    // An admin cannot demote or deactivate themselves (the admin UI already disables
    // this): as the last admin that would leave nobody able to manage users.
    if (authResult.user.id === id) {
      if (updateFields.role !== undefined && updateFields.role !== UserRole.ADMIN) {
        return NextResponse.json(
          { error: 'You cannot change your own role' },
          { status: 400 }
        );
      }
      if (updateFields.is_active === false) {
        return NextResponse.json(
          { error: 'You cannot deactivate your own account' },
          { status: 400 }
        );
      }
    }

    const before = await collection.findOne({ id: id });
    if (!before) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const removesAdmin = isActiveAdmin(before) && (
      (updateFields.role !== undefined && updateFields.role !== UserRole.ADMIN) ||
      updateFields.is_active === false
    );

    if (removesAdmin) {
      const revert: Record<string, unknown> = { updated_at: before.updated_at };
      for (const field of Object.keys(updateFields)) {
        if (field !== 'updated_at') revert[field] = before[field] ?? (field === 'is_active' ? true : null);
      }
      const refused = await revokeAdmin(collection, id, updateFields, revert);
      if (refused) return refused;
    } else {
      const result = await collection.updateOne(
        { id: id },
        { $set: updateFields }
      );
      
      if (result.matchedCount === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
    }
    
    logger.info('User updated', { userId: id, actorId: authResult.user.id, updates: updateFields });

    const actor = {
      actor_id: authResult.user.id,
      actor_email: authResult.user.email ?? undefined,
      target_id: id,
      target_type: 'user',
    };

    if (updateFields.role !== undefined && updateFields.role !== before.role) {
      await writeAuditLog({
        action: 'user.role_change',
        ...actor,
        metadata: { fromRole: before.role, toRole: updateFields.role },
      }, request);
      await closePendingRoleRequests(
        id,
        `Closed automatically: an administrator changed this account's role to ${String(updateFields.role).toUpperCase()}.`,
        authResult.user
      );
    }

    // Documents without the flag count as active (see getSessionUserState).
    const wasActive = before.is_active !== false;
    if (updateFields.is_active !== undefined && updateFields.is_active !== wasActive) {
      await writeAuditLog({
        action: updateFields.is_active ? 'user.activate' : 'user.deactivate',
        ...actor,
        metadata: { role: updateFields.role ?? before.role },
      }, request);
    }
    
    // Fetch updated user
    const updatedUser = await collection.findOne({ id: id });
    const updatedUserData = { ...(updatedUser as Record<string, unknown>) };
    delete updatedUserData._id;
    delete updatedUserData.password_hash;

    return NextResponse.json({ user: updatedUserData });
  } catch (error) {
    logger.error('Failed to update user', error);
    
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const authResult = await requireAdmin(request);
  
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const collection = await getCollection(COLLECTIONS.USERS);
    
    // Prevent deleting yourself
    if (authResult.user.id === id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }
    
    const target = await collection.findOne({ id: id });
    if (target && isActiveAdmin(target)) {
      // Deactivate first, guarded like a demotion, so the last active admin cannot be
      // deleted - not even by two admins deleting each other at the same moment.
      const refused = await revokeAdmin(
        collection,
        id,
        { is_active: false, updated_at: new Date().toISOString() },
        { is_active: target.is_active ?? true, updated_at: target.updated_at }
      );
      if (refused) return refused;
    }

    const result = target ? await collection.deleteOne({ id: id }) : { deletedCount: 0 };
    
    if (!target || result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    logger.info('User deleted', { userId: id, actorId: authResult.user.id });
    await writeAuditLog({
      action: 'user.delete',
      actor_id: authResult.user.id,
      actor_email: authResult.user.email ?? undefined,
      target_id: id,
      target_type: 'user',
      metadata: { email: target.email, name: target.name, role: target.role },
    }, request);
    await closePendingRoleRequests(id, 'Closed automatically: the account was deleted.', authResult.user);
    
    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete user', error);
    
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
