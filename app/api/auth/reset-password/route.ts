import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { getUserById, hashPassword } from '@/lib/auth/utils';
import { Logger } from '@/lib/errors';
import type { PasswordResetToken } from '@/lib/auth/types';

const logger = new Logger('ResetPasswordAPI');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const collection = await getCollection<PasswordResetToken>(COLLECTIONS.PASSWORD_RESET_TOKENS);
    const tokenDoc = await collection.findOne({
      token_hash: tokenHash,
      used_at: null,
      expires_at: { $gt: new Date() },
    });

    if (!tokenDoc) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      );
    }

    const user = await getUserById(tokenDoc.user_id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const newPasswordHash = await hashPassword(newPassword);
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const updateResult = await usersCollection.updateOne(
      { id: user.id },
      {
        $set: {
          password_hash: newPasswordHash,
          updated_at: new Date().toISOString(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    const now = new Date();
    await collection.updateOne(
      { id: tokenDoc.id },
      { $set: { used_at: now } }
    );
    await collection.updateMany(
      { user_id: user.id, used_at: null },
      { $set: { used_at: now } }
    );

    return NextResponse.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Failed to reset password', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
