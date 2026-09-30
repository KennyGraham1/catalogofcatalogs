import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { getUserByEmail } from '@/lib/auth/utils';
import { Logger } from '@/lib/errors';
import { sendEmailNotification } from '@/lib/notifications';
import { applyRateLimit, authRateLimiter } from '@/lib/rate-limiter';
import { allowPasswordResetEmail } from '@/lib/auth/login-rate-limit';
import { normalizeEmail } from '@/lib/auth/normalize';
import type { PasswordResetToken } from '@/lib/auth/types';

const logger = new Logger('ForgotPasswordAPI');
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
/** Unused links that stay valid per account; older ones are removed as new ones are sent. */
const RESET_TOKENS_KEPT = 3;

export async function POST(request: NextRequest) {
  const rateLimitResult = applyRateLimit(request, authRateLimiter, 10);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitResult.headers }
    );
  }

  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';

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

    // A few reset emails per account per hour, however many clients ask (the route's own
    // limit is per client). Counted for every address, so the reply cannot tell whether
    // an account exists.
    const mayEmail = await allowPasswordResetEmail(email);
    const user = await getUserByEmail(email);
    // Do not log whether a user was found — that would enable log-level user enumeration.
    logger.info('Password reset requested');

    if (!mayEmail || !user || !user.is_active) {
      return NextResponse.json({
        message: 'If an account exists for that email, a reset link has been sent.'
      });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    const expiresAt = new Date(now + RESET_TOKEN_TTL_MS);

    const collection = await getCollection<PasswordResetToken>(COLLECTIONS.PASSWORD_RESET_TOKENS);

    const resetToken: PasswordResetToken = {
      id: `reset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      user_id: user.id,
      token_hash: tokenHash,
      jwt_version: user.jwt_version ?? 0,
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      used_at: null,
    };

    await collection.insertOne(resetToken as any);

    // Keep the newest few links working. Deleting every earlier one on each request let
    // anyone who knew the address invalidate the owner's link just by asking again.
    const superseded = await collection
      .find({ user_id: user.id })
      .sort({ created_at: -1, _id: -1 })
      .skip(RESET_TOKENS_KEPT)
      .project({ id: 1 })
      .toArray();
    if (superseded.length > 0) {
      await collection.deleteMany({ id: { $in: superseded.map(doc => doc.id) } });
    }

    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    logger.info('Sending password reset email', {
      toEmail: user.email,
      userId: user.id,
    });

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
