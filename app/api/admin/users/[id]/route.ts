/**
 * User Management API Route
 * 
 * Manage individual users (admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdmin, auditApiAction, ApiError } from '@/lib/api-middleware';
import {
  getUserById,
  updateUserRole,
  activateUser,
  deactivateUser,
  deleteUser,
} from '@/lib/auth-db';

const updateUserSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/admin/users/[id]
 * Get user by ID (admin only)
 */
export const GET = withAdmin(async (
  request: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) => {
  const targetUser = await getUserById(params.id);

  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  // Remove password hash
  const { password_hash, ...sanitizedUser } = targetUser;

  return NextResponse.json({ user: sanitizedUser });
});

/**
 * PATCH /api/admin/users/[id]
 * Update user (admin only)
 */
export const PATCH = withAdmin(async (
  request: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) => {
  const body = await request.json();
  const validatedFields = updateUserSchema.safeParse(body);

  if (!validatedFields.success) {
    throw new ApiError(400, 'Validation failed', validatedFields.error.flatten().fieldErrors);
  }

  const { role, is_active } = validatedFields.data;

  // Check if user exists
  const targetUser = await getUserById(params.id);
  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  // Update role if provided
  if (role !== undefined) {
    await updateUserRole(params.id, role);
    await auditApiAction(request, 'update_user_role', 'user', params.id, { role });
  }

  // Update active status if provided
  if (is_active !== undefined) {
    if (is_active) {
      await activateUser(params.id);
    } else {
      await deactivateUser(params.id);
    }
    await auditApiAction(request, 'update_user_status', 'user', params.id, { is_active });
  }

  // Get updated user
  const updatedUser = await getUserById(params.id);
  const { password_hash, ...sanitizedUser } = updatedUser!;

  return NextResponse.json({ user: sanitizedUser });
});

/**
 * DELETE /api/admin/users/[id]
 * Delete user (admin only)
 */
export const DELETE = withAdmin(async (
  request: NextRequest,
  user: any,
  { params }: { params: { id: string } }
) => {
  // Prevent self-deletion
  if (params.id === user.id) {
    throw new ApiError(400, 'Cannot delete your own account');
  }

  // Check if user exists
  const targetUser = await getUserById(params.id);
  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  await deleteUser(params.id);
  await auditApiAction(request, 'delete_user', 'user', params.id, {
    email: targetUser.email,
  });

  return NextResponse.json({ success: true });
});

