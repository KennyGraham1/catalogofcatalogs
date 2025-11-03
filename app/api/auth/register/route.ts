/**
 * User Registration API Route
 * 
 * Handles user registration with email and password.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createUser, getUserByEmail, createAuditLog } from '@/lib/auth-db';

/**
 * Registration schema validation
 */
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
});

/**
 * POST /api/auth/register
 * Register a new user
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedFields = registerSchema.safeParse(body);

    if (!validatedFields.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validatedFields.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password, name, role } = validatedFields.data;

    // Check if user already exists
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Create user
    const user = await createUser({
      email,
      password,
      name,
      role: role || 'viewer', // Default to viewer role
    });

    // Create audit log
    await createAuditLog({
      user_id: user.id,
      action: 'register',
      resource_type: 'user',
      resource_id: user.id,
      details: { email: user.email, role: user.role },
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    });

    // Return user (without password)
    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
}

