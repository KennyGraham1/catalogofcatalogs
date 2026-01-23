/**
 * Authentication and Authorization Types
 * Defines user roles, permissions, and session types for RBAC
 */

/**
 * User roles in the system
 */
export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  GUEST = 'guest',
}

/**
 * Permission types for different operations
 */
export enum Permission {
  // Catalogue permissions
  CATALOGUE_CREATE = 'catalogue:create',
  CATALOGUE_READ = 'catalogue:read',
  CATALOGUE_UPDATE = 'catalogue:update',
  CATALOGUE_DELETE = 'catalogue:delete',
  CATALOGUE_EXPORT = 'catalogue:export',
  
  // Import permissions
  IMPORT_GEONET = 'import:geonet',
  IMPORT_FILE = 'import:file',
  
  // Merge permissions
  MERGE_CATALOGUES = 'merge:catalogues',
  
  // User management permissions
  USER_READ = 'user:read',
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_MANAGE_ROLES = 'user:manage_roles',
  
  // System permissions
  SYSTEM_SETTINGS = 'system:settings',
  SYSTEM_AUDIT = 'system:audit',
}

/**
 * Role-based permission mapping
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    // Full access to everything
    Permission.CATALOGUE_CREATE,
    Permission.CATALOGUE_READ,
    Permission.CATALOGUE_UPDATE,
    Permission.CATALOGUE_DELETE,
    Permission.CATALOGUE_EXPORT,
    Permission.IMPORT_GEONET,
    Permission.IMPORT_FILE,
    Permission.MERGE_CATALOGUES,
    Permission.USER_READ,
    Permission.USER_CREATE,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.USER_MANAGE_ROLES,
    Permission.SYSTEM_SETTINGS,
    Permission.SYSTEM_AUDIT,
  ],
  [UserRole.EDITOR]: [
    // Can create, modify, and export catalogues
    Permission.CATALOGUE_CREATE,
    Permission.CATALOGUE_READ,
    Permission.CATALOGUE_UPDATE,
    Permission.CATALOGUE_DELETE,
    Permission.CATALOGUE_EXPORT,
    Permission.IMPORT_GEONET,
    Permission.IMPORT_FILE,
    Permission.MERGE_CATALOGUES,
  ],
  [UserRole.VIEWER]: [
    // Read-only access with export capabilities
    Permission.CATALOGUE_READ,
    Permission.CATALOGUE_EXPORT,
  ],
  [UserRole.GUEST]: [
    // Limited read-only access (public catalogues only)
    Permission.CATALOGUE_READ,
  ],
};

/**
 * User document in MongoDB
 */
export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string | null;
}

/**
 * Session document in MongoDB
 */
export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

/**
 * User role definition document
 */
export interface UserRoleDefinition {
  id: string;
  role: UserRole;
  name: string;
  description: string;
  permissions: Permission[];
  created_at: string;
  updated_at: string;
}

/**
 * User data returned to client (without sensitive fields)
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  last_login?: string | null;
}

/**
 * Session data with user information
 */
export interface SessionWithUser extends Session {
  user: SafeUser;
}

