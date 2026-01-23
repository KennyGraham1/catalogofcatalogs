/**
 * User Management API Endpoint
 * GET /api/users/[id] - Get user by ID (Admin only)
 * PATCH /api/users/[id] - Update user (Admin only)
 * DELETE /api/users/[id] - Delete user (Admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { getCollection, COLLECTIONS } from '@/lib/mongodb';
import { UserRole } from '@/lib/auth/types';
import { Logger } from '@/lib/errors';

const logger = new Logger('UserAPI');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const collection = await getCollection(COLLECTIONS.USERS);
    const user = await collection.findOne({ id: params.id });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const userData = { ...(user as Record<string, unknown>) };
    delete userData._id;
    delete userData.password_hash;

    return NextResponse.json({ user: userData });
  } catch (error) {
    logger.error('Failed to retrieve user', error);
    
    return NextResponse.json(
      { error: 'Failed to retrieve user' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const body = await request.json();
    const { role, is_active, name } = body;
    
    const collection = await getCollection(COLLECTIONS.USERS);
    
    // Build update object
    const updateFields: any = {
      updated_at: new Date().toISOString(),
    };
    
    if (role !== undefined) {
      // Validate role
      if (!Object.values(UserRole).includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
      updateFields.role = role;
    }
    
    if (is_active !== undefined) {
      updateFields.is_active = is_active;
    }
    
    if (name !== undefined) {
      updateFields.name = name;
    }
    
    const result = await collection.updateOne(
      { id: params.id },
      { $set: updateFields }
    );
    
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    logger.info('User updated', { userId: params.id, updates: updateFields });
    
    // Fetch updated user
    const updatedUser = await collection.findOne({ id: params.id });
    const updatedUserData = { ...(updatedUser as Record<string, unknown>) };
    delete updatedUserData._id;
    delete updatedUserData.password_hash;

    return NextResponse.json({ user: updatedUserData });
  } catch (error) {
    logger.error('Failed to update user', error);
    
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAdmin(request);
  
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const collection = await getCollection(COLLECTIONS.USERS);
    
    // Prevent deleting yourself
    if (authResult.user.id === params.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }
    
    const result = await collection.deleteOne({ id: params.id });
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    logger.info('User deleted', { userId: params.id });
    
    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete user', error);
    
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
