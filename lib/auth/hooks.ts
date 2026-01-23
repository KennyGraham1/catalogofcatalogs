'use client';

/**
 * Authentication and Authorization Hooks
 * React hooks for checking permissions and roles in components
 */

import { useSession } from 'next-auth/react';
import { Permission, UserRole, ROLE_PERMISSIONS } from './types';

/**
 * Hook to get current user session
 */
export function useAuth() {
  const { data: session, status } = useSession();
  
  return {
    user: session?.user || null,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    session,
  };
}

/**
 * Hook to check if user has a specific permission
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  const rolePermissions = ROLE_PERMISSIONS[user.role];
  return rolePermissions.includes(permission);
}

/**
 * Hook to check if user has any of the specified permissions
 */
export function useAnyPermission(permissions: Permission[]): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  const rolePermissions = ROLE_PERMISSIONS[user.role];
  return permissions.some(permission => rolePermissions.includes(permission));
}

/**
 * Hook to check if user has all of the specified permissions
 */
export function useAllPermissions(permissions: Permission[]): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  const rolePermissions = ROLE_PERMISSIONS[user.role];
  return permissions.every(permission => rolePermissions.includes(permission));
}

/**
 * Hook to check if user has a specific role
 */
export function useRole(role: UserRole): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  return user.role === role;
}

/**
 * Hook to check if user has any of the specified roles
 */
export function useAnyRole(roles: UserRole[]): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  return roles.includes(user.role);
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin(): boolean {
  return useRole(UserRole.ADMIN);
}

/**
 * Hook to check if user is editor or higher
 */
export function useIsEditor(): boolean {
  return useAnyRole([UserRole.EDITOR, UserRole.ADMIN]);
}

/**
 * Hook to check if user is viewer or higher
 */
export function useIsViewer(): boolean {
  return useAnyRole([UserRole.VIEWER, UserRole.EDITOR, UserRole.ADMIN]);
}

/**
 * Hook to get all permissions for current user
 */
export function useUserPermissions(): Permission[] {
  const { user } = useAuth();
  
  if (!user) return [];
  
  return ROLE_PERMISSIONS[user.role];
}

