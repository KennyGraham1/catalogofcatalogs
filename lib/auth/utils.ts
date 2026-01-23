/**
 * Authentication Utilities
 * Helper functions for password hashing, session management, and role checking
 */

import * as bcrypt from 'bcryptjs';
import { getCollection, COLLECTIONS } from '../mongodb';
import { User, SafeUser, UserRole, Permission, ROLE_PERMISSIONS, Session } from './types';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Convert User to SafeUser (remove sensitive fields)
 */
export function toSafeUser(user: User): SafeUser {
  const { password_hash, ...safeUser } = user;
  return safeUser as SafeUser;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const collection = await getCollection(COLLECTIONS.USERS);
  const user = await collection.findOne({ email });
  
  if (!user) return null;
  
  const { _id, ...userData } = user as unknown as User & { _id?: unknown };
  return userData;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const collection = await getCollection(COLLECTIONS.USERS);
  const user = await collection.findOne({ id: userId });
  
  if (!user) return null;
  
  const { _id, ...userData } = user as unknown as User & { _id?: unknown };
  return userData;
}

/**
 * Create a new user
 */
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: UserRole = UserRole.VIEWER
): Promise<SafeUser> {
  const collection = await getCollection(COLLECTIONS.USERS);
  
  // Check if user already exists
  const existing = await collection.findOne({ email });
  if (existing) {
    throw new Error('User with this email already exists');
  }
  
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  
  const user: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email,
    name,
    password_hash: passwordHash,
    role,
    is_active: true,
    email_verified: false,
    created_at: now,
    updated_at: now,
  };
  
  await collection.insertOne(user as any);
  
  return toSafeUser(user);
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);
  await collection.updateOne(
    { id: userId },
    { 
      $set: { 
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } 
    }
  );
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role];
  return rolePermissions.includes(permission);
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission));
}

/**
 * Check if user has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * Create a session for a user
 */
export async function createSession(
  userId: string,
  token: string,
  expiresAt: Date,
  ipAddress?: string,
  userAgent?: string
): Promise<Session> {
  const collection = await getCollection(COLLECTIONS.SESSIONS);
  
  const session: Session = {
    id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
    created_at: new Date().toISOString(),
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  };
  
  await collection.insertOne(session as any);
  
  return session;
}

/**
 * Get session by token
 */
export async function getSessionByToken(token: string): Promise<Session | null> {
  const collection = await getCollection(COLLECTIONS.SESSIONS);
  const session = await collection.findOne({ token });
  
  if (!session) return null;
  
  const { _id, ...sessionData } = session as unknown as Session & { _id?: unknown };
  return sessionData;
}

/**
 * Delete session by token
 */
export async function deleteSession(token: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.SESSIONS);
  await collection.deleteOne({ token });
}

/**
 * Delete all sessions for a user
 */
export async function deleteUserSessions(userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.SESSIONS);
  await collection.deleteMany({ user_id: userId });
}
