/**
 * Audit logging utility.
 * Writes structured records to the audit_logs MongoDB collection.
 * Best-effort: failures are logged to stderr but never throw.
 */

import { randomUUID } from 'crypto';
import { getCollection, COLLECTIONS } from './mongodb';
import { resolveClientIp } from './rate-limiter';

export type AuditAction =
  | 'user.login'
  | 'user.login_failed'
  | 'user.register'
  | 'user.password_change'
  | 'user.password_reset'
  | 'user.role_change'
  | 'user.deactivate'
  | 'user.activate'
  | 'user.delete'
  | 'role_request.reject'
  | 'catalogue.create'
  | 'catalogue.delete'
  | 'catalogue.update'
  | 'import.geonet'
  | 'merge.create'
  | 'merge.review'
  | 'settings.merge_authority'
  | 'cache.clear';

export interface AuditEntry {
  /** Unique per entry: scripts/init-database.ts gives audit_logs a unique index on id. */
  id: string;
  action: AuditAction;
  actor_id?: string;
  actor_email?: string;
  target_id?: string;
  target_type?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  created_at: Date;
}

/**
 * Record an audit entry.
 *
 * Pass the incoming request (or anything with its headers) as `request` to record the
 * client address, resolved the same way as the rate limiters (lib/rate-limiter.ts). An
 * `ip` set on the entry itself takes precedence.
 */
export async function writeAuditLog(
  entry: Omit<AuditEntry, 'id' | 'created_at'>,
  request?: Pick<Request, 'headers'>
): Promise<void> {
  try {
    const ip = entry.ip ?? (request ? resolveClientIp(request) ?? undefined : undefined);
    const collection = await getCollection(COLLECTIONS.AUDIT_LOGS);
    await collection.insertOne({
      ...entry,
      ...(ip ? { ip } : {}),
      id: randomUUID(),
      created_at: new Date(),
    } as any);
  } catch (err) {
    // Audit log failure must never break the calling request.
    console.error('[Audit] Failed to write audit log:', err instanceof Error ? err.message : err);
  }
}
