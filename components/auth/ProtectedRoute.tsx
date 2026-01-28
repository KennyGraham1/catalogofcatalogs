'use client';

/**
 * Protected Route Component
 * Redirects to login if not authenticated or authorized
 */

import { ReactNode } from 'react';
import { useAuth, usePermission, useAnyPermission, useRole, useAnyRole } from '@/lib/auth/hooks';
import { Permission, UserRole } from '@/lib/auth/types';
import { AuthGateCard } from '@/components/auth/AuthGateCard';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: Permission;
  anyPermission?: Permission[];
  role?: UserRole;
  anyRole?: UserRole[];
  redirectTo?: string;
  title?: string;
  description?: string;
}

/**
 * Component that protects routes and redirects unauthorized users
 */
export function ProtectedRoute({
  children,
  permission,
  anyPermission,
  role,
  anyRole,
  redirectTo = '/login',
  title,
  description,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

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

  if (isLoading) {
    return (
      <AuthGateCard title="Checking access" description="Verifying your session..." />
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthGateCard
        title={title}
        description={description ?? 'Please log in to access this page.'}
        action={{ label: 'Log in', href: redirectTo }}
        secondaryAction={{ label: 'Back to Home', href: '/' }}
      />
    );
  }

  if (!isAuthorized) {
    return (
      <AuthGateCard
        title={title ?? 'Access restricted'}
        description={description ?? 'Your account does not have permission to view this page.'}
        requiredRole={role}
        requiredPermission={permission}
        action={{ label: 'Back to Dashboard', href: '/dashboard' }}
      />
    );
  }

  return <>{children}</>;
}

