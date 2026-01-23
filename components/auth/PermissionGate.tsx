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
  const hasPermission = permission ? usePermission(permission) : true;
  const hasAnyPermission = anyPermission ? useAnyPermission(anyPermission) : true;
  const hasRole = role ? useRole(role) : true;
  const hasAnyRole = anyRole ? useAnyRole(anyRole) : true;

  const isAuthorized = hasPermission && hasAnyPermission && hasRole && hasAnyRole;

  if (!isAuthorized) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

