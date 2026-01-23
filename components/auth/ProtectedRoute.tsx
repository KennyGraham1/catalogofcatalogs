'use client';

/**
 * Protected Route Component
 * Redirects to login if not authenticated or authorized
 */

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, usePermission, useAnyPermission, useRole, useAnyRole } from '@/lib/auth/hooks';
import { Permission, UserRole } from '@/lib/auth/types';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: Permission;
  anyPermission?: Permission[];
  role?: UserRole;
  anyRole?: UserRole[];
  redirectTo?: string;
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
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const hasPermission = permission ? usePermission(permission) : true;
  const hasAnyPermission = anyPermission ? useAnyPermission(anyPermission) : true;
  const hasRole = role ? useRole(role) : true;
  const hasAnyRole = anyRole ? useAnyRole(anyRole) : true;

  const isAuthorized = hasPermission && hasAnyPermission && hasRole && hasAnyRole;

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push(redirectTo);
      } else if (!isAuthorized) {
        router.push('/');
      }
    }
  }, [isAuthenticated, isAuthorized, isLoading, router, redirectTo]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || !isAuthorized) {
    return null;
  }

  return <>{children}</>;
}

