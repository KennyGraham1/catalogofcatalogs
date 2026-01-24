import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { getUserByEmail } from '@/lib/auth/utils';
import { Logger } from '@/lib/errors';
import { sendEmailNotification } from '@/lib/notifications';
import type { PasswordResetToken } from '@/lib/auth/types';

const logger = new Logger('ForgotPasswordAPI');
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);
    if (!user || !user.is_active) {
      return NextResponse.json({
        message: 'If an account exists for that email, a reset link has been sent.'
      });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    const collection = await getCollection<PasswordResetToken>(COLLECTIONS.PASSWORD_RESET_TOKENS);
    await collection.deleteMany({ user_id: user.id });

    const resetToken: PasswordResetToken = {
      id: `reset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      user_id: user.id,
      token_hash: tokenHash,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      used_at: null,
    };

    await collection.insertOne(resetToken as any);

    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    await sendEmailNotification({
      to: user.email,
      subject: 'Reset your password',
      message: `We received a request to reset your password. Use the link below to set a new password:\n\n${resetLink}\n\nThis link expires in 1 hour. If you did not request a reset, you can ignore this email.`,
    });

    return NextResponse.json({
      message: 'If an account exists for that email, a reset link has been sent.'
    });
  } catch (error) {
    logger.error('Failed to create password reset token', error);
    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    );
  }
}
