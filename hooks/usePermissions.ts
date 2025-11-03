/**
 * usePermissions Hook
 * 
 * React hook for checking user permissions in components.
 */

'use client';

import { useSession } from 'next-auth/react';
import { useMemo } from 'react';
import { Permission, roleHasPermission } from '@/lib/rbac';

export function usePermissions() {
  const { data: session } = useSession();

  const permissions = useMemo(() => {
    if (!session?.user) {
      return {
        hasPermission: () => false,
        isAdmin: false,
        isEditor: false,
        isViewer: false,
        canViewCatalogues: false,
        canCreateCatalogues: false,
        canEditCatalogues: false,
        canDeleteCatalogues: false,
        canImportData: false,
        canExportData: false,
        canMergeCatalogues: false,
        canManageUsers: false,
        canViewAuditLogs: false,
      };
    }

    const role = session.user.role;

    return {
      hasPermission: (permission: Permission) => roleHasPermission(role, permission),
      isAdmin: role === 'admin',
      isEditor: role === 'editor' || role === 'admin',
      isViewer: role === 'viewer',
      canViewCatalogues: roleHasPermission(role, Permission.VIEW_CATALOGUES),
      canCreateCatalogues: roleHasPermission(role, Permission.CREATE_CATALOGUES),
      canEditCatalogues: roleHasPermission(role, Permission.EDIT_CATALOGUES),
      canDeleteCatalogues: roleHasPermission(role, Permission.DELETE_CATALOGUES),
      canImportData: roleHasPermission(role, Permission.IMPORT_DATA),
      canExportData: roleHasPermission(role, Permission.EXPORT_DATA),
      canMergeCatalogues: roleHasPermission(role, Permission.MERGE_CATALOGUES),
      canManageUsers: roleHasPermission(role, Permission.MANAGE_USERS),
      canViewAuditLogs: roleHasPermission(role, Permission.VIEW_AUDIT_LOGS),
    };
  }, [session]);

  return permissions;
}

/**
 * useAuth Hook
 * 
 * Simplified hook for checking authentication status.
 */
export function useAuth() {
  const { data: session, status } = useSession();

  return {
    user: session?.user,
    isAuthenticated: !!session?.user,
    isLoading: status === 'loading',
    session,
  };
}

