/**
 * API Middleware Utilities
 * 
 * Helper functions for protecting API routes with authentication and authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from './auth';
import { Permission, hasPermission } from './rbac';
import { createAuditLog } from './auth-db';

/**
 * API Error Response
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Require authentication for an API route
 * Returns the authenticated user or throws an error
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session?.user) {
    throw new ApiError(401, 'Unauthorized: Authentication required');
  }

  return session.user;
}

/**
 * Require a specific permission for an API route
 * Returns the authenticated user or throws an error
 */
export async function requirePermission(permission: Permission) {
  const user = await requireAuth();
  const allowed = await hasPermission(permission);

  if (!allowed) {
    throw new ApiError(403, 'Forbidden: Insufficient permissions');
  }

  return user;
}

/**
 * Require admin role for an API route
 * Returns the authenticated user or throws an error
 */
export async function requireAdmin() {
  const user = await requireAuth();

  if ((user as any).role !== 'admin') {
    throw new ApiError(403, 'Forbidden: Admin access required');
  }

  return user;
}

/**
 * Require editor or admin role for an API route
 * Returns the authenticated user or throws an error
 */
export async function requireEditor() {
  const user = await requireAuth();

  if ((user as any).role !== 'admin' && (user as any).role !== 'editor') {
    throw new ApiError(403, 'Forbidden: Editor or Admin access required');
  }

  return user;
}

/**
 * API route handler wrapper with error handling
 */
export function withErrorHandler(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (request: NextRequest, context?: any) => {
    try {
      return await handler(request, context);
    } catch (error) {
      console.error('[API Error]:', error);

      if (error instanceof ApiError) {
        return NextResponse.json(
          {
            error: error.message,
            details: error.details,
          },
          { status: error.statusCode }
        );
      }

      // Handle validation errors
      if (error instanceof Error && error.message.includes('Validation')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }

      // Generic error
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

/**
 * API route handler wrapper with authentication
 */
export function withAuth(
  handler: (request: NextRequest, user: any, context?: any) => Promise<NextResponse>
) {
  return withErrorHandler(async (request: NextRequest, context?: any) => {
    const user = await requireAuth();
    return await handler(request, user, context);
  });
}

/**
 * API route handler wrapper with permission check
 */
export function withPermission(
  permission: Permission,
  handler: (request: NextRequest, user: any, context?: any) => Promise<NextResponse>
) {
  return withErrorHandler(async (request: NextRequest, context?: any) => {
    const user = await requirePermission(permission);
    return await handler(request, user, context);
  });
}

/**
 * API route handler wrapper with admin check
 */
export function withAdmin(
  handler: (request: NextRequest, user: any, context?: any) => Promise<NextResponse>
) {
  return withErrorHandler(async (request: NextRequest, context?: any) => {
    const user = await requireAdmin();
    return await handler(request, user, context);
  });
}

/**
 * Create audit log for API action
 */
export async function auditApiAction(
  request: NextRequest,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: any
) {
  try {
    const session = await getSession();

    await createAuditLog({
      user_id: (session?.user as any)?.id,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    });
  } catch (error) {
    console.error('[Audit Log Error]:', error);
    // Don't throw - audit logging should not break the API
  }
}

/**
 * Get client IP address from request
 */
export function getClientIp(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    undefined
  );
}

/**
 * Get user agent from request
 */
export function getUserAgent(request: NextRequest): string | undefined {
  return request.headers.get('user-agent') || undefined;
}

