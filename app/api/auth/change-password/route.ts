import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getUserById, hashPassword, verifyPassword } from '@/lib/auth/utils';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
// User type import removed - using untyped collection
import { AppError } from '@/lib/errors';

/**
 * POST /api/auth/change-password
 * Change the current user's password
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Get user from database
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password in database
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const result = await usersCollection.updateOne(
      { id: user.id },
      {
        $set: {
          password_hash: newPasswordHash,
          updated_at: new Date().toISOString(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      throw new AppError('Failed to update password', 500);
    }

    return NextResponse.json({
      message: 'Password changed successfully',
    });

  } catch (error) {
    console.error('Change password error:', error);

    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
