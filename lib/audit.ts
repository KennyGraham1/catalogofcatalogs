/**
 * Audit logging utility.
 * Writes structured records to the audit_logs MongoDB collection.
 * Best-effort: failures are logged to stderr but never throw.
 */

import { getCollection, COLLECTIONS } from './mongodb';

export type AuditAction =
  | 'user.login'
  | 'user.login_failed'
  | 'user.register'
  | 'user.password_change'
  | 'user.password_reset'
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.activate'
  | 'catalogue.create'
  | 'catalogue.delete'
  | 'catalogue.update'
  | 'import.geonet'
  | 'merge.create'
  | 'cache.clear';

export interface AuditEntry {
  action: AuditAction;
  actor_id?: string;
  actor_email?: string;
  target_id?: string;
  target_type?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  created_at: Date;
}

export async function writeAuditLog(entry: Omit<AuditEntry, 'created_at'>): Promise<void> {
  try {
    const collection = await getCollection(COLLECTIONS.AUDIT_LOGS);
    await collection.insertOne({ ...entry, created_at: new Date() } as any);
  } catch (err) {
    // Audit log failure must never break the calling request.
    console.error('[Audit] Failed to write audit log:', err instanceof Error ? err.message : err);
  }
}
