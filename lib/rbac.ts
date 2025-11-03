/**
 * Role-Based Access Control (RBAC) Utilities
 * 
 * Defines permissions and access control for different user roles.
 */

import { getSession } from './auth';

/**
 * User roles
 */
export enum Role {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

/**
 * Permissions for different actions
 */
export enum Permission {
  // Catalogue permissions
  VIEW_CATALOGUES = 'view_catalogues',
  CREATE_CATALOGUES = 'create_catalogues',
  EDIT_CATALOGUES = 'edit_catalogues',
  DELETE_CATALOGUES = 'delete_catalogues',
  
  // Event permissions
  VIEW_EVENTS = 'view_events',
  EDIT_EVENTS = 'edit_events',
  
  // Import/Export permissions
  IMPORT_DATA = 'import_data',
  EXPORT_DATA = 'export_data',
  
  // Merge permissions
  MERGE_CATALOGUES = 'merge_catalogues',
  
  // Admin permissions
  MANAGE_USERS = 'manage_users',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  MANAGE_API_KEYS = 'manage_api_keys',
  
  // Settings permissions
  MANAGE_SETTINGS = 'manage_settings',
}

/**
 * Role-Permission mapping
 */
const rolePermissions: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    // Admins have all permissions
    Permission.VIEW_CATALOGUES,
    Permission.CREATE_CATALOGUES,
    Permission.EDIT_CATALOGUES,
    Permission.DELETE_CATALOGUES,
    Permission.VIEW_EVENTS,
    Permission.EDIT_EVENTS,
    Permission.IMPORT_DATA,
    Permission.EXPORT_DATA,
    Permission.MERGE_CATALOGUES,
    Permission.MANAGE_USERS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.MANAGE_API_KEYS,
    Permission.MANAGE_SETTINGS,
  ],
  [Role.EDITOR]: [
    // Editors can create, edit, and manage catalogues
    Permission.VIEW_CATALOGUES,
    Permission.CREATE_CATALOGUES,
    Permission.EDIT_CATALOGUES,
    Permission.VIEW_EVENTS,
    Permission.EDIT_EVENTS,
    Permission.IMPORT_DATA,
    Permission.EXPORT_DATA,
    Permission.MERGE_CATALOGUES,
  ],
  [Role.VIEWER]: [
    // Viewers can only view and export
    Permission.VIEW_CATALOGUES,
    Permission.VIEW_EVENTS,
    Permission.EXPORT_DATA,
  ],
};

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: string, permission: Permission): boolean {
  const roleEnum = role as Role;
  const permissions = rolePermissions[roleEnum];
  return permissions ? permissions.includes(permission) : false;
}

/**
 * Check if the current user has a specific permission
 */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const session = await getSession();

  if (!session?.user) {
    return false;
  }

  return roleHasPermission((session.user as any).role, permission);
}

/**
 * Require a specific permission
 * Throws an error if the user doesn't have the permission
 */
export async function requirePermission(permission: Permission): Promise<void> {
  const allowed = await hasPermission(permission);
  
  if (!allowed) {
    throw new Error('Forbidden: Insufficient permissions');
  }
}

/**
 * Check if user can perform an action on a resource
 * This can be extended to include resource-level permissions
 */
export async function canPerformAction(
  permission: Permission,
  resourceOwnerId?: string
): Promise<boolean> {
  const session = await getSession();

  if (!session?.user) {
    return false;
  }

  const user = session.user as any;

  // Check if user has the permission
  const hasRequiredPermission = roleHasPermission(user.role, permission);

  if (!hasRequiredPermission) {
    return false;
  }

  // If resource owner is specified, check ownership
  // Admins can access all resources
  if (resourceOwnerId && user.role !== Role.ADMIN) {
    return user.id === resourceOwnerId;
  }

  return true;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): Permission[] {
  const roleEnum = role as Role;
  return rolePermissions[roleEnum] || [];
}

/**
 * Check if a role can access a specific route
 */
export function canAccessRoute(role: string, route: string): boolean {
  // Admin routes
  if (route.startsWith('/admin')) {
    return role === Role.ADMIN;
  }

  // Settings routes (all authenticated users)
  if (route.startsWith('/settings')) {
    return true;
  }

  // Dashboard and catalogue routes (all authenticated users)
  if (route.startsWith('/dashboard') || route.startsWith('/catalogues')) {
    return true;
  }

  // Default: allow access
  return true;
}

