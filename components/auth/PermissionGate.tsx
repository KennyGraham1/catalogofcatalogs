/**
 * PermissionGate Component
 * 
 * Conditionally renders children based on user permissions.
 */

'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/lib/rbac';

interface PermissionGateProps {
  children: ReactNode;
  permission?: Permission;
  role?: 'admin' | 'editor' | 'viewer';
  fallback?: ReactNode;
}

export function PermissionGate({
  children,
  permission,
  role,
  fallback = null,
}: PermissionGateProps) {
  const permissions = usePermissions();

  // Check permission
  if (permission && !permissions.hasPermission(permission)) {
    return <>{fallback}</>;
  }

  // Check role
  if (role) {
    if (role === 'admin' && !permissions.isAdmin) {
      return <>{fallback}</>;
    }
    if (role === 'editor' && !permissions.isEditor) {
      return <>{fallback}</>;
    }
    if (role === 'viewer' && !permissions.isViewer) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

/**
 * AdminOnly Component
 * 
 * Only renders children for admin users.
 */
export function AdminOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <PermissionGate role="admin" fallback={fallback}>
      {children}
    </PermissionGate>
  );
}

/**
 * EditorOnly Component
 * 
 * Only renders children for editor and admin users.
 */
export function EditorOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const permissions = usePermissions();

  if (!permissions.isEditor) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

