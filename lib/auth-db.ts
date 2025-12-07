/**
 * Authentication Database Utilities
 *
 * This file contains database operations for user authentication,
 * sessions, API keys, and audit logging.
 *
 * Migrated from SQLite to MongoDB.
 */

import { getCollection, COLLECTIONS } from './mongodb';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

/**
 * User interface
 */
export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: 'admin' | 'editor' | 'viewer';
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

/**
 * Session interface
 */
export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * API Key interface
 */
export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Audit Log interface
 */
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Helper function to convert MongoDB document to plain object
 */
function toPlainObject<T>(doc: any): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest as T;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const collection = await getCollection(COLLECTIONS.USERS);
  const doc = await collection.findOne({ email });
  return toPlainObject<User>(doc);
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  const collection = await getCollection(COLLECTIONS.USERS);
  const doc = await collection.findOne({ id });
  return toPlainObject<User>(doc);
}

/**
 * Create a new user
 */
export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
  role?: 'admin' | 'editor' | 'viewer';
}): Promise<User> {
  const collection = await getCollection(COLLECTIONS.USERS);

  // Hash password
  const password_hash = await bcrypt.hash(data.password, 10);

  // Generate user ID
  const id = nanoid();
  const now = new Date().toISOString();

  const user: User = {
    id,
    email: data.email,
    password_hash,
    name: data.name || null,
    role: data.role || 'viewer',
    is_active: true,
    email_verified: false,
    created_at: now,
    updated_at: now,
    last_login: null,
  };

  await collection.insertOne(user as any);
  return user;
}

/**
 * Update user's last login time
 */
export async function updateLastLogin(userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);
  await collection.updateOne(
    { id: userId },
    { $set: { last_login: new Date().toISOString() } }
  );
}

/**
 * Update user password
 */
export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);

  // Hash new password
  const password_hash = await bcrypt.hash(newPassword, 10);

  await collection.updateOne(
    { id: userId },
    { $set: { password_hash, updated_at: new Date().toISOString() } }
  );
}

/**
 * Update user profile (name, email)
 */
export async function updateUserProfile(userId: string, updates: { name?: string; email?: string }): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);

  const updateFields: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) {
    updateFields.name = updates.name;
  }

  if (updates.email !== undefined) {
    updateFields.email = updates.email;
  }

  await collection.updateOne(
    { id: userId },
    { $set: updateFields }
  );
}

/**
 * Create audit log entry
 */
export async function createAuditLog(data: {
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: any;
  ip_address?: string;
  user_agent?: string;
}): Promise<void> {
  const collection = await getCollection(COLLECTIONS.AUDIT_LOGS);

  const id = nanoid();
  const details = data.details ? JSON.stringify(data.details) : null;

  await collection.insertOne({
    id,
    user_id: data.user_id || null,
    action: data.action,
    resource_type: data.resource_type,
    resource_id: data.resource_id || null,
    details,
    ip_address: data.ip_address || null,
    user_agent: data.user_agent || null,
    created_at: new Date().toISOString(),
  } as any);
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(): Promise<User[]> {
  const collection = await getCollection(COLLECTIONS.USERS);
  const docs = await collection.find({}).sort({ created_at: -1 }).toArray();
  return docs.map(doc => toPlainObject<User>(doc)!);
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(userId: string, role: 'admin' | 'editor' | 'viewer'): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);
  await collection.updateOne(
    { id: userId },
    { $set: { role, updated_at: new Date().toISOString() } }
  );
}

/**
 * Deactivate user (admin only)
 */
export async function deactivateUser(userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);
  await collection.updateOne(
    { id: userId },
    { $set: { is_active: false, updated_at: new Date().toISOString() } }
  );
}

/**
 * Activate user (admin only)
 */
export async function activateUser(userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);
  await collection.updateOne(
    { id: userId },
    { $set: { is_active: true, updated_at: new Date().toISOString() } }
  );
}

/**
 * Delete user (admin only)
 * Note: This will cascade delete sessions and API keys
 */
export async function deleteUser(userId: string): Promise<void> {
  const usersCollection = await getCollection(COLLECTIONS.USERS);
  const sessionsCollection = await getCollection(COLLECTIONS.SESSIONS);
  const apiKeysCollection = await getCollection(COLLECTIONS.API_KEYS);

  // Delete related sessions and API keys first
  await sessionsCollection.deleteMany({ user_id: userId });
  await apiKeysCollection.deleteMany({ user_id: userId });
  await usersCollection.deleteOne({ id: userId });
}

/**
 * Verify user email
 */
export async function verifyUserEmail(userId: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.USERS);
  await collection.updateOne(
    { id: userId },
    { $set: { email_verified: true, updated_at: new Date().toISOString() } }
  );
}

/**
 * Get user statistics
 */
export async function getUserStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  admins: number;
  editors: number;
  viewers: number;
}> {
  const collection = await getCollection(COLLECTIONS.USERS);

  const [total, active, inactive, admins, editors, viewers] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ is_active: true }),
    collection.countDocuments({ is_active: false }),
    collection.countDocuments({ role: 'admin' }),
    collection.countDocuments({ role: 'editor' }),
    collection.countDocuments({ role: 'viewer' }),
  ]);

  return { total, active, inactive, admins, editors, viewers };
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
  const collection = await getCollection(COLLECTIONS.AUDIT_LOGS);
  const docs = await collection
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return docs.map(doc => toPlainObject<AuditLog>(doc)!);
}

/**
 * Get all audit logs (admin only)
 */
export async function getAllAuditLogs(limit: number = 100): Promise<AuditLog[]> {
  const collection = await getCollection(COLLECTIONS.AUDIT_LOGS);
  const docs = await collection
    .find({})
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return docs.map(doc => toPlainObject<AuditLog>(doc)!);
}

/**
 * Create API key
 */
export async function createApiKey(data: {
  user_id: string;
  name: string;
  scopes?: string[];
  expires_at?: string;
}): Promise<{ apiKey: ApiKey; plainKey: string }> {
  const collection = await getCollection(COLLECTIONS.API_KEYS);

  // Generate API key
  const plainKey = `eck_${nanoid(32)}`; // eck = earthquake catalogue key
  const keyPrefix = plainKey.substring(0, 12);

  // Hash the key
  const key_hash = await bcrypt.hash(plainKey, 10);

  const id = nanoid();
  const scopes = data.scopes ? data.scopes.join(',') : 'read';
  const now = new Date().toISOString();

  const apiKey: ApiKey = {
    id,
    user_id: data.user_id,
    name: data.name,
    key_hash,
    key_prefix: keyPrefix,
    scopes,
    is_active: true,
    expires_at: data.expires_at || null,
    last_used_at: null,
    created_at: now,
  };

  await collection.insertOne(apiKey as any);
  return { apiKey, plainKey };
}

/**
 * Get API keys for a user
 */
export async function getUserApiKeys(userId: string): Promise<ApiKey[]> {
  const collection = await getCollection(COLLECTIONS.API_KEYS);
  const docs = await collection
    .find({ user_id: userId })
    .sort({ created_at: -1 })
    .toArray();
  return docs.map(doc => toPlainObject<ApiKey>(doc)!);
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  const collection = await getCollection(COLLECTIONS.API_KEYS);
  const doc = await collection.findOne({ id });
  return toPlainObject<ApiKey>(doc);
}

/**
 * Validate API key
 */
export async function validateApiKey(plainKey: string): Promise<{ valid: boolean; apiKey?: ApiKey; user?: User }> {
  const collection = await getCollection(COLLECTIONS.API_KEYS);

  // Extract key prefix
  const keyPrefix = plainKey.substring(0, 12);

  // Find API key by prefix
  const doc = await collection.findOne({ key_prefix: keyPrefix, is_active: true });
  const apiKey = toPlainObject<ApiKey>(doc);

  if (!apiKey) {
    return { valid: false };
  }

  // Check if expired
  if (apiKey.expires_at) {
    const expiresAt = new Date(apiKey.expires_at);
    if (expiresAt < new Date()) {
      return { valid: false };
    }
  }

  // Verify key hash
  const isValid = await bcrypt.compare(plainKey, apiKey.key_hash);

  if (!isValid) {
    return { valid: false };
  }

  // Update last used timestamp
  await collection.updateOne(
    { id: apiKey.id },
    { $set: { last_used_at: new Date().toISOString() } }
  );

  // Get user
  const user = await getUserById(apiKey.user_id);

  if (!user || !user.is_active) {
    return { valid: false };
  }

  return { valid: true, apiKey, user };
}

/**
 * Revoke API key
 */
export async function revokeApiKey(id: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.API_KEYS);
  await collection.updateOne(
    { id },
    { $set: { is_active: false } }
  );
}

/**
 * Delete API key
 */
export async function deleteApiKey(id: string): Promise<void> {
  const collection = await getCollection(COLLECTIONS.API_KEYS);
  await collection.deleteOne({ id });
}
