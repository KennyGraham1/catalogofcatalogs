/**
 * Users Management API Route
 * 
 * Manage users (admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin, auditApiAction } from '@/lib/api-middleware';
import { getAllUsers, getUserStats } from '@/lib/auth-db';

/**
 * GET /api/admin/users
 * Get all users and statistics (admin only)
 */
export const GET = withAdmin(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const statsOnly = searchParams.get('stats') === 'true';

  if (statsOnly) {
    const stats = await getUserStats();
    return NextResponse.json({ stats });
  }

  const users = await getAllUsers();
  
  // Remove password hashes from response
  const sanitizedUsers = users.map(user => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    email_verified: user.email_verified,
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login: user.last_login,
  }));

  return NextResponse.json({ users: sanitizedUsers });
});

