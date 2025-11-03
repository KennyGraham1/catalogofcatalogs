/**
 * Authentication Database Utilities
 * 
 * This file contains database operations for user authentication,
 * sessions, API keys, and audit logging.
 */

import { getDb } from './db';
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
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE email = ? LIMIT 1',
      [email],
      (err, row: User | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE id = ? LIMIT 1',
      [id],
      (err, row: User | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
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
  const db = await getDb();
  
  // Hash password
  const password_hash = await bcrypt.hash(data.password, 10);
  
  // Generate user ID
  const id = nanoid();
  
  const user = {
    id,
    email: data.email,
    password_hash,
    name: data.name || null,
    role: data.role || 'viewer',
    is_active: true,
    email_verified: false,
  };

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (id, email, password_hash, name, role, is_active, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.email, user.password_hash, user.name, user.role, user.is_active ? 1 : 0, user.email_verified ? 1 : 0],
      function(err) {
        if (err) {
          reject(err);
        } else {
          // Fetch the created user
          db.get(
            'SELECT * FROM users WHERE id = ?',
            [user.id],
            (err, row: User | undefined) => {
              if (err) {
                reject(err);
              } else {
                resolve(row as User);
              }
            }
          );
        }
      }
    );
  });
}

/**
 * Update user's last login time
 */
export async function updateLastLogin(userId: string): Promise<void> {
  const db = await getDb();
  
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Update user password
 */
export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const db = await getDb();
  
  // Hash new password
  const password_hash = await bcrypt.hash(newPassword, 10);
  
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [password_hash, userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
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
  const db = await getDb();
  
  const id = nanoid();
  const details = data.details ? JSON.stringify(data.details) : null;

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.user_id || null,
        data.action,
        data.resource_type,
        data.resource_id || null,
        details,
        data.ip_address || null,
        data.user_agent || null,
      ],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM users ORDER BY created_at DESC',
      [],
      (err, rows: User[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(userId: string, role: 'admin' | 'editor' | 'viewer'): Promise<void> {
  const db = await getDb();
  
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [role, userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Deactivate user (admin only)
 */
export async function deactivateUser(userId: string): Promise<void> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Activate user (admin only)
 */
export async function activateUser(userId: string): Promise<void> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Delete user (admin only)
 * Note: This will cascade delete sessions and API keys
 */
export async function deleteUser(userId: string): Promise<void> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM users WHERE id = ?',
      [userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Verify user email
 */
export async function verifyUserEmail(userId: string): Promise<void> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
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
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'editor' THEN 1 ELSE 0 END) as editors,
        SUM(CASE WHEN role = 'viewer' THEN 1 ELSE 0 END) as viewers
       FROM users`,
      [],
      (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            total: row.total || 0,
            active: row.active || 0,
            inactive: row.inactive || 0,
            admins: row.admins || 0,
            editors: row.editors || 0,
            viewers: row.viewers || 0,
          });
        }
      }
    );
  });
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, limit],
      (err, rows: AuditLog[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Get all audit logs (admin only)
 */
export async function getAllAuditLogs(limit: number = 100): Promise<AuditLog[]> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?',
      [limit],
      (err, rows: AuditLog[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
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
  const db = await getDb();

  // Generate API key
  const plainKey = `eck_${nanoid(32)}`; // eck = earthquake catalogue key
  const keyPrefix = plainKey.substring(0, 12);

  // Hash the key
  const key_hash = await bcrypt.hash(plainKey, 10);

  const id = nanoid();
  const scopes = data.scopes ? data.scopes.join(',') : 'read';

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes, is_active, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.user_id,
        data.name,
        key_hash,
        keyPrefix,
        scopes,
        1,
        data.expires_at || null,
      ],
      function(err) {
        if (err) {
          reject(err);
        } else {
          // Fetch the created API key
          db.get(
            'SELECT * FROM api_keys WHERE id = ?',
            [id],
            (err, row: ApiKey | undefined) => {
              if (err) {
                reject(err);
              } else {
                resolve({
                  apiKey: row as ApiKey,
                  plainKey, // Return plain key only once
                });
              }
            }
          );
        }
      }
    );
  });
}

/**
 * Get API keys for a user
 */
export async function getUserApiKeys(userId: string): Promise<ApiKey[]> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
      (err, rows: ApiKey[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Get API key by ID
 */
export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM api_keys WHERE id = ? LIMIT 1',
      [id],
      (err, row: ApiKey | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
}

/**
 * Validate API key
 */
export async function validateApiKey(plainKey: string): Promise<{ valid: boolean; apiKey?: ApiKey; user?: User }> {
  const db = await getDb();

  // Extract key prefix
  const keyPrefix = plainKey.substring(0, 12);

  // Find API key by prefix
  const apiKey: ApiKey | undefined = await new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM api_keys WHERE key_prefix = ? AND is_active = 1 LIMIT 1',
      [keyPrefix],
      (err, row: ApiKey | undefined) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

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
  await new Promise<void>((resolve, reject) => {
    db.run(
      'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [apiKey.id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

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
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE api_keys SET is_active = 0 WHERE id = ?',
      [id],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Delete API key
 */
export async function deleteApiKey(id: string): Promise<void> {
  const db = await getDb();

  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM api_keys WHERE id = ?',
      [id],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

