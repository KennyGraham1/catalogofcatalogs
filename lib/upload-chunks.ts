/**
 * Chunked Upload Storage
 */

import { Binary } from 'mongodb';
import { getCollection, COLLECTIONS } from './mongodb';
import { createId } from './id';
import { createWriteStream } from 'fs';
import { once } from 'events';
import type { Delimiter } from './delimiter-detector';

// 3 MB per chunk — well under Vercel's 4.5 MB body limit.
export const CHUNK_SIZE = 3 * 1024 * 1024;

// Large-file threshold: use chunked upload when the file exceeds this.
// Set to 3.5 MB so we stay under the Vercel limit even with form overhead.
export const LARGE_FILE_THRESHOLD = 3.5 * 1024 * 1024;

const CHUNK_TTL_HOURS = 1;

/**
 * Raised when the bytes actually stored for a session exceed the caller's cap.
 *
 * The `file_size` recorded at /api/upload/init is declared by the client, so it
 * cannot be used to enforce an upload limit. Assembly counts the real bytes and
 * aborts as soon as the cap is passed, so neither the heap nor /tmp grows beyond
 * it.
 */
export class UploadSizeLimitError extends Error {
  readonly bytesRead: number;
  readonly limit: number;

  constructor(bytesRead: number, limit: number) {
    super(`Upload exceeds the maximum of ${limit} bytes (read at least ${bytesRead} bytes)`);
    this.name = 'UploadSizeLimitError';
    this.bytesRead = bytesRead;
    this.limit = limit;
  }
}

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

// ── Delimiter storage ───────────────────────────────────────────────────────
//
// DelimiterSelector (components/upload/DelimiterSelector.tsx) sends one of the
// named options below; /api/upload/route.ts (the direct, non-chunked path)
// already maps those names to the literal character parseCSV expects. The
// chunked path used to store whatever it was given and hand it straight to
// parseFile with an `as any` cast, so a name like 'comma' was compared
// character-by-character against every delimiter and never matched —
// finding #36/#46. isValidStoredDelimiter lets /api/upload/init reject
// anything unmappable before it is ever stored, and DELIMITER_NAME_TO_CHARACTER
// is exported so finalize can perform the same name → character mapping
// /api/upload/route.ts already does instead of re-declaring its own copy.

export const DELIMITER_NAME_TO_CHARACTER: Readonly<Record<string, Delimiter>> = {
  comma: ',',
  tab: '\t',
  semicolon: ';',
  pipe: '|',
  space: ' ',
};

const VALID_DELIMITER_CHARACTERS = new Set<string>(Object.values(DELIMITER_NAME_TO_CHARACTER));

/**
 * True when `value` is safe to persist as a chunked-upload session's
 * delimiter: one of DelimiterSelector's named options, or — defensively, for
 * any non-UI caller — one of the literal characters directly. Anything else
 * (an empty string, a stray 5-character value, etc.) is rejected by the
 * caller rather than stored, since nothing downstream could map it back to a
 * real delimiter character.
 */
export function isValidStoredDelimiter(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (Object.prototype.hasOwnProperty.call(DELIMITER_NAME_TO_CHARACTER, value) ||
      VALID_DELIMITER_CHARACTERS.has(value))
  );
}

// ── Session management ────────────────────────────────────────────────────────

export interface UploadSession {
  session_id: string;
  file_name: string;
  file_size?: number;
  total_chunks: number;
  delimiter?: string;
  date_format?: string;
  owner_id?: string;
  expires_at: Date;
}

/**
 * Create a new chunked-upload session.
 * Returns the sessionId the client must include in every subsequent request.
 *
 * `ownerId` (the authenticated session user id, C9) is stored on the sentinel
 * so later requests can be scoped to the user who started the upload — see
 * getUploadSession below and /api/upload/chunk, which refuses to store a
 * chunk against another user's session.
 */
export async function createUploadSession(
  fileName: string,
  fileSize: number,
  totalChunks: number,
  delimiter?: string,
  dateFormat?: string,
  ownerId?: string,
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
    owner_id:     ownerId,
    data:         new Binary(Buffer.alloc(0)), // empty — metadata only
    expires_at:   expiresAt,
  });

  return sessionId;
}

/**
 * Retrieve session metadata.
 * Returns null if the session does not exist or has expired.
 *
 * When `ownerId` is given, the lookup is scoped to sessions owned by that
 * user: a session created by someone else is treated exactly like a missing
 * one (C9). Omitting `ownerId` keeps the old, unscoped behaviour for callers
 * that intentionally look up across owners.
 */
export async function getUploadSession(sessionId: string, ownerId?: string): Promise<UploadSession | null> {
  await ensureIndexes();
  const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  const doc = await col.findOne({
    session_id: sessionId,
    chunk_index: -1,
    ...(ownerId ? { owner_id: ownerId } : {}),
  });
  if (!doc) return null;
  return {
    session_id:   doc.session_id,
    file_name:    doc.file_name,
    file_size:    doc.file_size,
    total_chunks: doc.total_chunks,
    delimiter:    doc.delimiter,
    date_format:  doc.date_format,
    owner_id:     doc.owner_id,
    expires_at:   doc.expires_at,
  };
}

// ── Chunk storage ─────────────────────────────────────────────────────────────

/**
 * Store one chunk.
 * chunkIndex is 0-based. data is a Buffer containing the raw bytes for this chunk.
 *
 * Every document for the session (the sentinel and every chunk stored so
 * far) has its expires_at pushed forward at the same time. Without this, the
 * one-hour TTL is fixed at /api/upload/init and a slow upload — large
 * QuakeML files are allowed up to 500 MB — can have its sentinel swept away
 * by mongod's TTL monitor while chunks are still arriving, which surfaces to
 * the user as "Upload session not found or expired" after up to an hour of
 * uploading (finding #53).
 */
export async function storeChunk(
  sessionId: string,
  chunkIndex: number,
  data: Buffer,
): Promise<void> {
  await ensureIndexes();
  const col       = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  const expiresAt = new Date(Date.now() + CHUNK_TTL_HOURS * 60 * 60 * 1000);

  await Promise.all([
    col.updateMany({ session_id: sessionId }, { $set: { expires_at: expiresAt } }),
    col.replaceOne(
      { session_id: sessionId, chunk_index: chunkIndex },
      {
        session_id:  sessionId,
        chunk_index: chunkIndex,
        data:        new Binary(data),
        expires_at:  expiresAt,
      },
      { upsert: true },
    ),
  ]);
}

/**
 * Count how many data chunks (chunk_index ≥ 0) have been received for a session.
 */
export async function countReceivedChunks(sessionId: string): Promise<number> {
  const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  return col.countDocuments({ session_id: sessionId, chunk_index: { $gte: 0 } });
}

// A single reusable decoder: with the default `ignoreBOM: false`, TextDecoder
// strips a leading UTF-8 BOM the same way WHATWG "UTF-8 decode" (what
// File.text() uses on the direct, non-chunked upload path) does. Buffer's own
// toString('utf-8') does not strip it, so a BOM-prefixed JSON/GeoJSON file
// parsed 0 events above the 3.5 MB chunking threshold and below it (finding
// #48). Module-level and reused: decode() resets its state on every call
// when `stream` is not passed, so there is nothing to reset between uses.
const utf8Decoder = new TextDecoder('utf-8');

/**
 * Reassemble all chunks in order and return the complete file content as a string.
 * Throws if any chunk is missing.
 *
 * `maxBytes`, when given, is enforced against the bytes actually stored: the walk
 * stops and throws UploadSizeLimitError as soon as the running total passes the
 * cap, so an upload that under-declared its size at init cannot be concatenated
 * into memory.
 */
export async function assembleChunks(
  sessionId: string,
  totalChunks: number,
  maxBytes?: number,
): Promise<string> {
  const col = await getCollection(COLLECTIONS.UPLOAD_CHUNKS);
  const cursor = col
    .find({ session_id: sessionId, chunk_index: { $gte: 0 } })
    .sort({ chunk_index: 1 });

  const buffers: Buffer[] = [];
  let bytesRead = 0;
  let expectedIndex = 0;

  for await (const doc of cursor) {
    // Every chunk must be the exact integer index expected next. Without
    // this, a stray non-integer chunk_index (e.g. 1.5, which the chunk route
    // used to accept and which sorts between 1 and 2) can stand in for a
    // genuinely missing chunk while the length check below still matches
    // totalChunks, corrupting or truncating a row at the chunk boundary with
    // no error at all (finding #52).
    if (doc.chunk_index !== expectedIndex) {
      throw new Error(
        `Incomplete upload: expected chunk ${expectedIndex}, found ${doc.chunk_index}`
      );
    }

    const bin = doc.data as Binary;
    const buffer = Buffer.isBuffer(bin.buffer) ? bin.buffer : Buffer.from(bin.buffer);
    bytesRead += buffer.length;

    if (maxBytes !== undefined && bytesRead > maxBytes) {
      throw new UploadSizeLimitError(bytesRead, maxBytes);
    }

    buffers.push(buffer);
    expectedIndex += 1;
  }

  if (expectedIndex !== totalChunks) {
    throw new Error(
      `Incomplete upload: expected ${totalChunks} chunks, found ${expectedIndex}`
    );
  }

  return utf8Decoder.decode(Buffer.concat(buffers));
}

/**
 * Reassemble chunks directly into a file on disk.
 */
export async function assembleChunksToFile(
  sessionId: string,
  totalChunks: number,
  outputPath: string,
  maxBytes?: number,
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

      // Cap on the real byte count, not on the size the client declared at init.
      if (maxBytes !== undefined && bytesWritten > maxBytes) {
        throw new UploadSizeLimitError(bytesWritten, maxBytes);
      }

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
