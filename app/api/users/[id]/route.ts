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

/**
 * Admins who can sign in. Login refuses any account whose is_active is not true
 * (lib/auth/config.ts), so only these count towards keeping an administrator.
 */
const ACTIVE_ADMIN = { role: UserRole.ADMIN, is_active: true };

function isActiveAdmin(user: Record<string, unknown>): boolean {
  return user.role === UserRole.ADMIN && user.is_active === true;
}

/** Whether writing `fields` could take admin rights away from an account. */
function mayRemoveAdmin(fields: Record<string, unknown>): boolean {
  return (fields.role !== undefined && fields.role !== UserRole.ADMIN) || fields.is_active === false;
}

/** Matches the account only while its role and active state are still as `user` read them. */
function asRead(id: string, user: Record<string, unknown>) {
  return { id, role: user.role, is_active: user.is_active === true ? true : { $ne: true } };
}

const LAST_ADMIN_ERROR = 'At least one active administrator must remain. Promote another user to admin first.';
const CHANGED_ERROR = 'This account was changed by someone else in the meantime. Reload and try again.';

async function changedOrGone(collection: UsersCollection, id: string): Promise<NextResponse> {
  return (await collection.findOne({ id }))
    ? NextResponse.json({ error: CHANGED_ERROR }, { status: 409 })
    : NextResponse.json({ error: 'User not found' }, { status: 404 });
}

/**
 * Called after a write that took admin rights away from `id`: if that left no active
 * admin, undo it and refuse.
 *
 * Such writes are made only against the state that was read (asRead), so no removal
 * is decided on a stale read, and each is counted after it lands. Whatever the
 * interleaving of concurrent removals, the last to count sees the others' writes, so
 * once all have finished an active admin remains. (A transaction would not be enough:
 * two snapshot transactions demoting different admins do not conflict.)
 *
 * The undo restores role and is_active only while they still hold the values written:
 * a later change to them has its own checks and stands. Unrelated writes in between,
 * such as a sign-in updating last_login, do not stop it.
 */
async function undoIfNoAdminLeft(
  collection: UsersCollection,
  id: string,
  written: Record<string, unknown>,
  before: Record<string, unknown>
): Promise<NextResponse | null> {
  if (await collection.countDocuments(ACTIVE_ADMIN) > 0) return null;
  const fields = ['role', 'is_active'].filter(field => written[field] !== undefined);
  const undone = await collection.updateOne(
    { id, ...Object.fromEntries(fields.map(field => [field, written[field]])) },
    { $set: { ...Object.fromEntries(fields.map(field => [field, before[field]])), updated_at: new Date().toISOString() } }
  );
  if (undone.matchedCount === 0 && await collection.countDocuments(ACTIVE_ADMIN) === 0) {
    logger.error('No active administrator remains; restore one with scripts/promote-to-admin.ts', { userId: id });
  }
  return NextResponse.json({ error: LAST_ADMIN_ERROR }, { status: 409 });
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

    // A write that could take admin rights away is made only while the account is as
    // read, so the check below cannot be passed on a stale read (e.g. the account was
    // promoted to admin in the meantime). Other writes need no such condition.
    const guarded = mayRemoveAdmin(updateFields);
    const result = await collection.updateOne(
      guarded ? asRead(id, before) : { id: id },
      { $set: updateFields }
    );
    if (result.matchedCount === 0) {
      return changedOrGone(collection, id);
    }

    if (guarded && isActiveAdmin(before)) {
      const refused = await undoIfNoAdminLeft(collection, id, updateFields, before);
      if (refused) return refused;
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
    if (!target) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete only the account as read. An active admin is first deactivated, the guarded
    // way, so that deleting cannot remove the last one - not even two admins deleting
    // each other at the same moment.
    let deletable: Record<string, unknown> = asRead(id, target);
    if (isActiveAdmin(target)) {
      const deactivation = { is_active: false, updated_at: new Date().toISOString() };
      const deactivated = await collection.updateOne(asRead(id, target), { $set: deactivation });
      if (deactivated.matchedCount === 0) return changedOrGone(collection, id);
      const refused = await undoIfNoAdminLeft(collection, id, deactivation, target);
      if (refused) return refused;
      deletable = { id, role: UserRole.ADMIN, is_active: false };
    }

    const result = await collection.deleteOne(deletable);
    if (result.deletedCount === 0) {
      return changedOrGone(collection, id);
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
