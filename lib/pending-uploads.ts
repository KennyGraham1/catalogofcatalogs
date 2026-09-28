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
 *   { upload_id: string, seq: number, event: ParsedEvent, expires_at: Date,
 *     owner_id?: string }
 *
 * Indexes:
 *   { upload_id: 1, seq: 1 }  — query + sort
 *   { expires_at: 1 }         — TTL, expireAfterSeconds: 0
 *
 * Ownership (C9): every document may carry the id of the session user who
 * uploaded it. getPendingUploadEvents / iteratePendingUploadEventBatches take
 * an optional ownerId that, when given, restricts the read to that owner's
 * own documents — a token for someone else's upload then reads back exactly
 * like an expired one, closing the object-level authorization gap where any
 * editor holding a pendingUploadId could import another user's parsed data.
 */

import { getCollection, COLLECTIONS } from './mongodb';
import { createId } from './id';
import type { ParsedEvent } from '@/types/upload';

const PENDING_TTL_HOURS = 24;
const PENDING_INSERT_BATCH_SIZE = 500;
const PENDING_INSERT_MAX_BATCH_BYTES = 8 * 1024 * 1024;

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
export async function storePendingUpload(events: ParsedEvent[], ownerId?: string): Promise<string> {
  await ensureIndexes();

  const { uploadId, expiresAt } = await createPendingUpload();

  if (events.length > 0) {
    await appendPendingUploadEvents(uploadId, events, 0, expiresAt, ownerId);
  }

  return uploadId;
}

export async function createPendingUpload(): Promise<{ uploadId: string; expiresAt: Date }> {
  await ensureIndexes();

  return {
    uploadId: createId(),
    expiresAt: new Date(Date.now() + PENDING_TTL_HOURS * 60 * 60 * 1000),
  };
}

function estimatePendingDocBytes(event: ParsedEvent): number {
  try {
    return Buffer.byteLength(JSON.stringify(event), 'utf8') + 256;
  } catch {
    return PENDING_INSERT_MAX_BATCH_BYTES;
  }
}

/**
 * Append events to an existing pending upload in bounded insertMany batches.
 * Returns the next sequence number after the appended range.
 */
export async function appendPendingUploadEvents(
  uploadId: string,
  events: ParsedEvent[],
  startSeq: number,
  expiresAt = new Date(Date.now() + PENDING_TTL_HOURS * 60 * 60 * 1000),
  ownerId?: string,
): Promise<number> {
  await ensureIndexes();

  if (events.length === 0) return startSeq;

  const collection = await getCollection(COLLECTIONS.PENDING_UPLOADS);
  let batch: Array<{ upload_id: string; seq: number; event: ParsedEvent; expires_at: Date; owner_id?: string }> = [];
  let batchBytes = 0;
  let seq = startSeq;

  const flush = async () => {
    if (batch.length === 0) return;
    await collection.insertMany(batch);
    batch = [];
    batchBytes = 0;
  };

  for (const event of events) {
    const estimatedBytes = estimatePendingDocBytes(event);
    if (
      batch.length > 0 &&
      (batch.length >= PENDING_INSERT_BATCH_SIZE ||
        batchBytes + estimatedBytes > PENDING_INSERT_MAX_BATCH_BYTES)
    ) {
      await flush();
    }

    batch.push({
      upload_id: uploadId,
      seq,
      event,
      expires_at: expiresAt,
      owner_id: ownerId,
    });
    batchBytes += estimatedBytes;
    seq += 1;
  }

  await flush();
  return seq;
}

/**
 * Retrieve all events for a pending upload in their original order.
 *
 * Returns `null` when the `uploadId` is not found (e.g. already consumed or
 * expired). Callers must reject missing tokens to preserve event alignment.
 *
 * `ownerId`, when given, restricts the read to documents stored for that
 * owner (C9) — a token that exists but belongs to someone else then reads
 * back as `null`, the same as an expired one.
 */
export async function getPendingUploadEvents(
  uploadId: string,
  ownerId?: string,
): Promise<ParsedEvent[] | null> {
  const events: ParsedEvent[] = [];
  for await (const batch of iteratePendingUploadEventBatches(uploadId, 1000, ownerId)) {
    events.push(...batch);
  }

  return events.length === 0 ? null : events;
}

export async function* iteratePendingUploadEventBatches(
  uploadId: string,
  batchSize = 1000,
  ownerId?: string,
): AsyncGenerator<ParsedEvent[]> {
  await ensureIndexes();

  const collection = await getCollection(COLLECTIONS.PENDING_UPLOADS);
  const cursor = collection
    .find({
      upload_id: uploadId,
      expires_at: { $gt: new Date() },
      ...(ownerId ? { owner_id: ownerId } : {}),
    })
    .sort({ seq: 1 })
    .batchSize(batchSize);

  let batch: ParsedEvent[] = [];
  try {
    for await (const doc of cursor) {
      batch.push(doc.event as ParsedEvent);
      if (batch.length >= batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length > 0) yield batch;
  } finally {
    await cursor.close();
  }
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
