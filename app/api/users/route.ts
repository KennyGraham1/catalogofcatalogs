/**
 * User Management API Endpoint
 * GET /api/users - List all users (Admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { User, SafeUser } from '@/lib/auth/types';
import { toSafeUser } from '@/lib/auth/utils';
import { Logger } from '@/lib/errors';

const logger = new Logger('UsersAPI');

export async function GET(request: NextRequest) {
  // Require admin role
  const authResult = await requireAdmin(request);
  
  if (authResult instanceof NextResponse) {
    return authResult; // Return error response
  }

  try {
    const collection = await getCollection<User>(COLLECTIONS.USERS);
    const users = await collection.find({}).sort({ created_at: -1 }).toArray();
    
    // Convert to safe users (remove password hashes)
    const safeUsers: SafeUser[] = users.map(user => {
      const { _id, password_hash, ...userData } = user;
      return userData as SafeUser;
    });
    
    logger.info('Users list retrieved', { count: safeUsers.length });
    
    return NextResponse.json({ users: safeUsers });
  } catch (error) {
    logger.error('Failed to retrieve users', error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve users' },
      { status: 500 }
    );
  }
}

