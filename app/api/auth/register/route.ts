/**
 * User Registration API Endpoint
 * POST /api/auth/register - Register a new user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/auth/utils';
import { UserRole } from '@/lib/auth/types';
import { Logger } from '@/lib/errors';
import { applyRateLimit, authRateLimiter } from '@/lib/rate-limiter';
import { writeAuditLog } from '@/lib/audit';

const logger = new Logger('RegisterAPI');

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
    const { email, password, name } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Create user with default Viewer role
    // Admins can upgrade roles later
    const user = await createUser(email, password, name, UserRole.VIEWER);

    logger.info('User registered successfully', { userId: user.id, email: user.email });
    await writeAuditLog({
      action: 'user.register',
      actor_id: user.id,
      actor_email: user.email,
      target_id: user.id,
      target_type: 'user',
      metadata: { role: user.role },
    }, request);

    return NextResponse.json(
      {
        message: 'User registered successfully',
        user,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Registration failed', error);

    // This answer does reveal that an account exists. Kept deliberately: email delivery
    // is optional (EMAIL_WEBHOOK_URL), so a uniform "check your inbox" reply would leave
    // deployments without it unable to tell people why they cannot register. Probing
    // is limited per client (authRateLimiter), and probing a new address creates a
    // real, audit-logged account. Sign-in and password reset no longer reveal it.
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Sign in, or reset your password if you have forgotten it.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}

