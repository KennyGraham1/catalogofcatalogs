'use client';

/**
 * Permission Gate Component
 * Conditionally render children based on user permissions
 */

import { ReactNode } from 'react';
import { usePermission, useAnyPermission, useRole, useAnyRole } from '@/lib/auth/hooks';
import { Permission, UserRole } from '@/lib/auth/types';

interface PermissionGateProps {
  children: ReactNode;
  permission?: Permission;
  anyPermission?: Permission[];
  role?: UserRole;
  anyRole?: UserRole[];
  fallback?: ReactNode;
}

/**
 * Component that renders children only if user has required permissions/roles
 */
export function PermissionGate({
  children,
  permission,
  anyPermission,
  role,
  anyRole,
  fallback = null,
}: PermissionGateProps) {
  // Always call hooks unconditionally (React rules of hooks)
  const permissionResult = usePermission(permission ?? Permission.CATALOGUE_READ);
  const anyPermissionResult = useAnyPermission(anyPermission ?? []);
  const roleResult = useRole(role ?? UserRole.VIEWER);
  const anyRoleResult = useAnyRole(anyRole ?? []);

  // Apply conditional logic after hooks are called
  const hasPermission = permission ? permissionResult : true;
  const hasAnyPermission = anyPermission && anyPermission.length > 0 ? anyPermissionResult : true;
  const hasRole = role ? roleResult : true;
  const hasAnyRole = anyRole && anyRole.length > 0 ? anyRoleResult : true;

  const isAuthorized = hasPermission && hasAnyPermission && hasRole && hasAnyRole;

  if (!isAuthorized) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}


