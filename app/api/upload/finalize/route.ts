/**
 * POST /api/upload/finalize
 *
 * Third and final step of the chunked upload flow.
 *
 * Body: JSON { sessionId: string }
 *
 * The handler:
 *   1. Retrieves the session metadata from MongoDB.
 *   2. Assembles all stored chunks into a complete file string.
 *   3. Runs parseFile() — identical to what /api/upload does for small files.
 *   4. Stores full QuakeML event data in the pending-upload store.
 *   5. Returns the same response shape as /api/upload (lightweight scalars +
 *      optional pendingUploadId), so the frontend needs no special casing.
 *   6. Deletes the upload chunks from MongoDB.
 *
 * Vercel maxDuration is set to 60 s (requires Pro tier; ignored on Hobby).
 * Parsing a 70 MB QuakeML file typically takes 10-30 s on a Vercel function.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireEditor } from '@/lib/auth/middleware';
import { Logger } from '@/lib/errors';
import {
  getUploadSession,
  assembleChunks,
  deleteUploadSession,
  CHUNK_SIZE,
} from '@/lib/upload-chunks';
import { parseFile } from '@/lib/parsers';
import { storePendingUpload } from '@/lib/pending-uploads';
import { createUploadTooLargeResponse, getMaxSyncUploadParseBytes } from '@/lib/upload-limits';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300; // seconds — Vercel Pro/Enterprise

const logger = new Logger('UploadFinalizeAPI');

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) return authResult;

    const body      = await request.json();
    const sessionId = body?.sessionId;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Retrieve session metadata (fileName, totalChunks, delimiter, dateFormat)
    const session = await getUploadSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Upload session not found or expired. Please restart the upload.' },
        { status: 404 },
      );
    }

    const {
      file_name: fileName,
      file_size: fileSize,
      total_chunks: totalChunks,
      delimiter,
      date_format: dateFormat,
    } = session;

    const maxParseBytes = getMaxSyncUploadParseBytes();
    const estimatedSize = fileSize ?? totalChunks * CHUNK_SIZE;
    if (estimatedSize > maxParseBytes) {
      return NextResponse.json(createUploadTooLargeResponse(estimatedSize), { status: 413 });
    }

    logger.info('Finalising chunked upload', { sessionId, fileName, totalChunks });

    // Assemble all chunks into a single UTF-8 string
    const content = await assembleChunks(sessionId, totalChunks);

    // Parse — same logic as /api/upload
    const parseResult = parseFile(
      content,
      fileName,
      delimiter as any ?? undefined,
      dateFormat as any ?? undefined,
    );

    // Persist all parsed events server-side — same strategy as /api/upload.
    // Applies to every format (CSV, JSON, GeoJSON, QuakeML).
    let pendingUploadId: string | undefined;

    if (parseResult.events.length > 0) {
      pendingUploadId = await storePendingUpload(parseResult.events);
      logger.info('Stored pending upload from chunked finalize', {
        pendingUploadId,
        eventCount: parseResult.events.length,
      });
    }

    // Strip quakeml from the browser-facing events
    const events = parseResult.events.map(({ quakeml: _q, ...rest }) => rest);

    // Delete chunks now — they are no longer needed
    deleteUploadSession(sessionId).catch(() => {/* TTL fallback */});

    logger.info('Chunked upload finalised', {
      sessionId,
      fileName,
      eventCount: parseResult.events.length,
    });

    return NextResponse.json({
      fileName,
      fileSize: fileSize ?? content.length,
      format: fileName.split('.').pop()?.toUpperCase() ?? 'UNKNOWN',
      ...parseResult,
      events,
      ...(pendingUploadId ? { pendingUploadId } : {}),
    });
  } catch (error) {
    logger.error('Failed to finalise chunked upload', error);
    const msg = error instanceof Error ? error.message : 'Failed to process upload';
    return NextResponse.json({ error: msg, code: 'FINALIZE_ERROR' }, { status: 500 });
  }
}
