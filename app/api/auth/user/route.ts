/**
 * User Profile API Route
 * 
 * Handles getting and updating user profile information.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { getUserById, updateUserPassword, updateUserProfile, createAuditLog } from '@/lib/auth-db';

/**
 * Update profile schema
 */
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Invalid email address').optional(),
});

/**
 * Change password schema
 */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

/**
 * GET /api/auth/user
 * Get current user profile
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await getUserById(session.user.id);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Return user without password
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      email_verified: user.email_verified,
      created_at: user.created_at,
      last_login: user.last_login,
    });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    
    return NextResponse.json(
      { error: 'Failed to get user profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auth/user
 * Update current user profile
 */
export async function PATCH(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validatedFields = updateProfileSchema.safeParse(body);

    if (!validatedFields.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validatedFields.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, email } = validatedFields.data;

    if (name === undefined && email === undefined) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update user profile
    await updateUserProfile(session.user.id, { name, email });

    // Create audit log
    await createAuditLog({
      user_id: session.user.id,
      action: 'update_profile',
      resource_type: 'user',
      resource_id: session.user.id,
      details: { name, email },
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    });

    // Get updated user
    const updatedUser = await getUserById(session.user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email,
        name: updatedUser!.name,
        role: updatedUser!.role,
      },
    });
  } catch (error) {
    console.error('[Auth] Update user error:', error);
    
    return NextResponse.json(
      { error: 'Failed to update user profile' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/user/change-password
 * Change user password
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate request body
    const validatedFields = changePasswordSchema.safeParse(body);

    if (!validatedFields.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validatedFields.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = validatedFields.data;

    // Get user
    const user = await getUserById(session.user.id);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify current password
    const bcrypt = require('bcryptjs');
    const passwordsMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!passwordsMatch) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // Update password
    await updateUserPassword(session.user.id, newPassword);

    // Create audit log
    await createAuditLog({
      user_id: session.user.id,
      action: 'change_password',
      resource_type: 'user',
      resource_id: session.user.id,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}

