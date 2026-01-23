/**
 * API Authentication and Authorization Middleware
 * Protects API routes and checks user permissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import { Permission, UserRole } from './types';
import { hasPermission, hasAnyPermission } from './utils';

/**
 * Get the current session from the request
 */
export async function getSession(req: NextRequest) {
  return await getServerSession(authOptions);
}

/**
 * Require authentication for an API route
 * Returns 401 if not authenticated
 */
export async function requireAuth(req: NextRequest) {
  const session = await getSession(req);
  
  if (!session || !session.user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  
  return { session, user: session.user };
}

/**
 * Require specific permission for an API route
 * Returns 401 if not authenticated, 403 if not authorized
 */
export async function requirePermission(req: NextRequest, permission: Permission) {
  const authResult = await requireAuth(req);
  
  if (authResult instanceof NextResponse) {
    return authResult; // Return 401 response
  }
  
  const { user } = authResult;
  
  if (!hasPermission(user.role, permission)) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  
  return authResult;
}

/**
 * Require any of the specified permissions
 * Returns 401 if not authenticated, 403 if not authorized
 */
export async function requireAnyPermission(req: NextRequest, permissions: Permission[]) {
  const authResult = await requireAuth(req);
  
  if (authResult instanceof NextResponse) {
    return authResult; // Return 401 response
  }
  
  const { user } = authResult;
  
  if (!hasAnyPermission(user.role, permissions)) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  
  return authResult;
}

/**
 * Require specific role for an API route
 * Returns 401 if not authenticated, 403 if not authorized
 */
export async function requireRole(req: NextRequest, role: UserRole) {
  const authResult = await requireAuth(req);
  
  if (authResult instanceof NextResponse) {
    return authResult; // Return 401 response
  }
  
  const { user } = authResult;
  
  if (user.role !== role) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  
  return authResult;
}

/**
 * Require any of the specified roles
 * Returns 401 if not authenticated, 403 if not authorized
 */
export async function requireAnyRole(req: NextRequest, roles: UserRole[]) {
  const authResult = await requireAuth(req);
  
  if (authResult instanceof NextResponse) {
    return authResult; // Return 401 response
  }
  
  const { user } = authResult;
  
  if (!roles.includes(user.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    );
  }
  
  return authResult;
}

/**
 * Require admin role
 * Returns 401 if not authenticated, 403 if not admin
 */
export async function requireAdmin(req: NextRequest) {
  return requireRole(req, UserRole.ADMIN);
}

/**
 * Require editor or higher role (Editor or Admin)
 * Returns 401 if not authenticated, 403 if not authorized
 */
export async function requireEditor(req: NextRequest) {
  return requireAnyRole(req, [UserRole.EDITOR, UserRole.ADMIN]);
}

/**
 * Require viewer or higher role (Viewer, Editor, or Admin)
 * Returns 401 if not authenticated, 403 if not authorized
 */
export async function requireViewer(req: NextRequest) {
  return requireAnyRole(req, [UserRole.VIEWER, UserRole.EDITOR, UserRole.ADMIN]);
}

/**
 * Optional authentication - returns session if available, null otherwise
 * Does not return error responses
 */
export async function optionalAuth(req: NextRequest) {
  const session = await getSession(req);
  return session;
}

