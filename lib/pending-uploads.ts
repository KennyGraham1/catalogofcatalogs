/**
 * Pending Upload Store
 *
 * Preserves the complete parsed QuakeML event data server-side during the
 * two-step upload → catalogue-creation flow.
 *
 * Problem: A full QuakeMLEvent (including picks, arrivals, focal mechanisms,
 * station magnitudes, amplitudes, etc.) can be 10–100× larger than the source
 * XML file.  Sending that payload to the browser and back again would make
 * large catalogues impossible to upload.
 *
 * Solution: The upload API stores the complete parsed events here (one MongoDB
 * document per event), returns only lightweight scalar fields to the browser,
 * and includes a `pendingUploadId`.  When the browser later POSTs to
 * /api/catalogues, it includes the `pendingUploadId`; the catalogue route
 * fetches the full data directly from MongoDB and uses it for DB insertion,
 * preserving every field.  The pending documents are deleted after a successful
 * catalogue creation and expire automatically after 24 hours via a TTL index.
 *
 * Storage layout (collection: pending_uploads):
 *   { upload_id: string, seq: number, event: ParsedEvent, expires_at: Date }
 *
 * Indexes:
 *   { upload_id: 1, seq: 1 }  — query + sort
 *   { expires_at: 1 }         — TTL, expireAfterSeconds: 0
 */

import { getCollection, COLLECTIONS } from './mongodb';
import { v4 as uuidv4 } from 'uuid';
import type { ParsedEvent } from '@/types/upload';

const PENDING_TTL_HOURS = 24;

// Module-level flag so indexes are only created once per process lifetime.
let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const collection = await getCollection(COLLECTIONS.PENDING_UPLOADS);
  await Promise.all([
    collection.createIndex({ upload_id: 1, seq: 1 }),
    collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]);
  indexesEnsured = true;
}

/**
 * Store the complete set of parsed events for one upload.
 *
 * Each event is stored as a separate document so there is no risk of hitting
 * MongoDB's 16 MB per-document limit regardless of QuakeML catalogue size.
 *
 * @returns The `pendingUploadId` to embed in the upload API response.
 */
export async function storePendingUpload(events: ParsedEvent[]): Promise<string> {
  await ensureIndexes();

  const uploadId   = uuidv4();
  const expiresAt  = new Date(Date.now() + PENDING_TTL_HOURS * 60 * 60 * 1000);
  const collection = await getCollection(COLLECTIONS.PENDING_UPLOADS);

  if (events.length > 0) {
    const docs = events.map((event, seq) => ({
      upload_id:  uploadId,
      seq,
      event,            // The full ParsedEvent, including quakeml: QuakeMLEvent
      expires_at: expiresAt,
    }));
    await collection.insertMany(docs);
  }

  return uploadId;
}

/**
 * Retrieve all events for a pending upload in their original order.
 *
 * Returns `null` when the `uploadId` is not found (e.g. already consumed or
 * expired).  Callers should fall back to the scalar events supplied in the
 * request body in that case.
 */
export async function getPendingUploadEvents(
  uploadId: string,
): Promise<ParsedEvent[] | null> {
  await ensureIndexes();

  const collection = await getCollection(COLLECTIONS.PENDING_UPLOADS);
  const docs       = await collection
    .find({ upload_id: uploadId })
    .sort({ seq: 1 })
    .toArray();

  if (docs.length === 0) return null;
  return docs.map(doc => doc.event as ParsedEvent);
}

/**
 * Delete all pending documents for an upload.
 *
 * Should be called after the catalogue has been successfully created so that
 * storage is reclaimed immediately rather than waiting for the TTL to fire.
 */
export async function deletePendingUpload(uploadId: string): Promise<void> {
  // Best-effort cleanup — don't throw if this fails; the TTL will clean up.
  try {
    const collection = await getCollection(COLLECTIONS.PENDING_UPLOADS);
    await collection.deleteMany({ upload_id: uploadId });
  } catch {
    // Intentionally swallowed: the catalogue was already created successfully.
  }
}
