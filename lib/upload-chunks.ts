/**
 * Chunked Upload Storage
 *
 * Vercel Serverless Functions have a hard 4.5 MB request-body limit. Files
 * larger than that (e.g. 70 MB QuakeML catalogues) are rejected at the
 * platform level before any Next.js code runs, producing:
 *   FUNCTION_PAYLOAD_TOO_LARGE
 *
 * Architecture — three-step chunked upload:
 *   1. POST /api/upload/init        → { sessionId, chunkSize }
 *   2. POST /api/upload/chunk  × N  → { received: true }   (one per chunk)
 *   3. POST /api/upload/finalize    → same shape as /api/upload response
 *
 * Each chunk is ≤ CHUNK_SIZE bytes so it fits comfortably inside Vercel's
 * 4.5 MB limit (headers + boundary add ~1 KB of overhead).
 *
 * Chunks are stored as raw binary documents in MongoDB with a 1-hour TTL.
 * The finalize handler reassembles them in order. Stream-capable formats are
 * written to /tmp and parsed from disk; sync-parser formats still assemble into
 * memory. Parsed events are stored in the pending-upload store, then chunks are
 * deleted.
 *
 * Collection: upload_chunks
 *   { session_id, chunk_index, total_chunks, file_name, data: Binary,
 *     delimiter?, date_format?, expires_at }
 */

import { Binary } from 'mongodb';
import { getCollection, COLLECTIONS } from './mongodb';
import { createId } from './id';
import { createWriteStream } from 'fs';
import { once } from 'events';

// 3 MB per chunk — well under Vercel's 4.5 MB body limit.
export const CHUNK_SIZE = 3 * 1024 * 1024;

// Large-file threshold: use chunked upload when the file exceeds this.
// Set to 3.5 MB so we stay under the Vercel limit even with form overhead.
export const LARGE_FILE_THRESHOLD = 3.5 * 1024 * 1024;

const CHUNK_TTL_HOURS = 1;

let indexesEnsured = false;

async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  await Promise.all([
    col.createIndex({ session_id: 1, chunk_index: 1 }, { unique: true }),
    col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]);
  indexesEnsured = true;
}

// ── Session management ────────────────────────────────────────────────────────

export interface UploadSession {
  session_id: string;
  file_name: string;
  file_size?: number;
  total_chunks: number;
  delimiter?: string;
  date_format?: string;
  expires_at: Date;
}

/**
 * Create a new chunked-upload session.
 * Returns the sessionId the client must include in every subsequent request.
 */
export async function createUploadSession(
  fileName: string,
  fileSize: number,
  totalChunks: number,
  delimiter?: string,
  dateFormat?: string,
): Promise<string> {
  await ensureIndexes();

  const sessionId  = createId();
  const expiresAt  = new Date(Date.now() + CHUNK_TTL_HOURS * 60 * 60 * 1000);
  const col        = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);

  // Session metadata stored as chunk_index = -1 sentinel document.
  await col.insertOne({
    session_id:   sessionId,
    chunk_index:  -1,           // sentinel: session metadata
    total_chunks: totalChunks,
    file_name:    fileName,
    file_size:    fileSize,
    delimiter,
    date_format:  dateFormat,
    data:         new Binary(Buffer.alloc(0)), // empty — metadata only
    expires_at:   expiresAt,
  });

  return sessionId;
}

/**
 * Retrieve session metadata.
 * Returns null if the session does not exist or has expired.
 */
export async function getUploadSession(sessionId: string): Promise<UploadSession | null> {
  await ensureIndexes();
  const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  const doc = await col.findOne({ session_id: sessionId, chunk_index: -1 });
  if (!doc) return null;
  return {
    session_id:   doc.session_id,
    file_name:    doc.file_name,
    file_size:    doc.file_size,
    total_chunks: doc.total_chunks,
    delimiter:    doc.delimiter,
    date_format:  doc.date_format,
    expires_at:   doc.expires_at,
  };
}

// ── Chunk storage ─────────────────────────────────────────────────────────────

/**
 * Store one chunk.
 * chunkIndex is 0-based. data is a Buffer containing the raw bytes for this chunk.
 */
export async function storeChunk(
  sessionId: string,
  chunkIndex: number,
  data: Buffer,
): Promise<void> {
  await ensureIndexes();
  const col       = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  const expiresAt = new Date(Date.now() + CHUNK_TTL_HOURS * 60 * 60 * 1000);

  await col.replaceOne(
    { session_id: sessionId, chunk_index: chunkIndex },
    {
      session_id:  sessionId,
      chunk_index: chunkIndex,
      data:        new Binary(data),
      expires_at:  expiresAt,
    },
    { upsert: true },
  );
}

/**
 * Count how many data chunks (chunk_index ≥ 0) have been received for a session.
 */
export async function countReceivedChunks(sessionId: string): Promise<number> {
  const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  return col.countDocuments({ session_id: sessionId, chunk_index: { $gte: 0 } });
}

/**
 * Reassemble all chunks in order and return the complete file content as a string.
 * Throws if any chunk is missing.
 */
export async function assembleChunks(
  sessionId: string,
  totalChunks: number,
): Promise<string> {
  const col  = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  const docs = await col
    .find({ session_id: sessionId, chunk_index: { $gte: 0 } })
    .sort({ chunk_index: 1 })
    .toArray();

  if (docs.length !== totalChunks) {
    throw new Error(
      `Incomplete upload: expected ${totalChunks} chunks, found ${docs.length}`
    );
  }

  const buffers: Buffer[] = docs.map(doc => {
    const bin = doc.data as Binary;
    return Buffer.isBuffer(bin.buffer) ? bin.buffer : Buffer.from(bin.buffer);
  });

  return Buffer.concat(buffers).toString('utf-8');
}

/**
 * Reassemble chunks directly into a file on disk.
 *
 * This is the large-file path used by finalize handlers that can parse from a
 * stream. It avoids loading every chunk into an array, avoids Buffer.concat(),
 * and avoids materialising a second full UTF-8 string copy of the upload.
 */
export async function assembleChunksToFile(
  sessionId: string,
  totalChunks: number,
  outputPath: string,
): Promise<{ bytesWritten: number }> {
  const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  const cursor = col
    .find({ session_id: sessionId, chunk_index: { $gte: 0 } })
    .sort({ chunk_index: 1 });

  const stream = createWriteStream(outputPath, { flags: 'w' });
  let expectedIndex = 0;
  let bytesWritten = 0;

  try {
    for await (const doc of cursor) {
      if (doc.chunk_index !== expectedIndex) {
        throw new Error(
          `Incomplete upload: expected chunk ${expectedIndex}, found ${doc.chunk_index}`
        );
      }

      const bin = doc.data as Binary;
      const buffer = Buffer.isBuffer(bin.buffer) ? bin.buffer : Buffer.from(bin.buffer);
      bytesWritten += buffer.length;

      if (!stream.write(buffer)) {
        await once(stream, 'drain');
      }

      expectedIndex += 1;
    }

    if (expectedIndex !== totalChunks) {
      throw new Error(
        `Incomplete upload: expected ${totalChunks} chunks, found ${expectedIndex}`
      );
    }
  } catch (error) {
    stream.destroy();
    throw error;
  }

  stream.end();
  await once(stream, 'finish');

  return { bytesWritten };
}

/**
 * Delete all documents (session metadata + chunks) for a session.
 * Called after successful finalization.
 */
export async function deleteUploadSession(sessionId: string): Promise<void> {
  try {
    const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
    await col.deleteMany({ session_id: sessionId });
  } catch {
    // Best-effort; TTL will clean up automatically.
  }
}
