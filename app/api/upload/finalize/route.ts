/**
 * POST /api/upload/finalize
 *
 * Third and final step of the chunked upload flow.
 *
 * Body: JSON { sessionId: string }
 *
 * The handler:
 *   1. Retrieves the session metadata from MongoDB.
 *   2. Streams QuakeML chunks to a temp file, or assembles sync-parser formats
 *      into a complete file string.
 *   3. Parses QuakeML from a file stream, or runs parseFile() for sync formats.
 *   4. Stores full event data in the pending-upload store.
 *   5. Returns the same response shape as /api/upload (lightweight scalars +
 *      optional pendingUploadId), so the frontend needs no special casing.
 *   6. Deletes the upload chunks from MongoDB.
 *
 * Vercel maxDuration is set to 300 s.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireEditor } from '@/lib/auth/middleware';
import { Logger } from '@/lib/errors';
import {
  getUploadSession,
  assembleChunks,
  assembleChunksToFile,
  deleteUploadSession,
  CHUNK_SIZE,
} from '@/lib/upload-chunks';
import { parseFile, parseQuakeMLFileStream } from '@/lib/parsers';
import {
  appendPendingUploadEvents,
  createPendingUpload,
  storePendingUpload,
} from '@/lib/pending-uploads';
import { createUploadTooLargeResponse, getMaxSyncUploadParseBytes } from '@/lib/upload-limits';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300; // seconds — Vercel Pro/Enterprise

const logger = new Logger('UploadFinalizeAPI');
const MAX_FILE_SIZE = 500 * 1024 * 1024;

function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function isQuakeMLFile(fileName: string): boolean {
  return ['xml', 'qml'].includes(getExtension(fileName));
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

export async function POST(request: NextRequest) {
  let tempFilePath: string | undefined;

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
    if (estimatedSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }
    if (estimatedSize > maxParseBytes && !isQuakeMLFile(fileName)) {
      return NextResponse.json(createUploadTooLargeResponse(estimatedSize), { status: 413 });
    }

    logger.info('Finalising chunked upload', { sessionId, fileName, totalChunks });

    let pendingUploadId: string | undefined;
    let parseResult;
    let responseFileSize = fileSize ?? 0;

    if (isQuakeMLFile(fileName)) {
      tempFilePath = path.join(tmpdir(), `catalog-upload-${sessionId}-${Date.now()}.${getExtension(fileName) || 'xml'}`);

      const assembleStart = performance.now();
      const assembled = await assembleChunksToFile(sessionId, totalChunks, tempFilePath);
      responseFileSize = fileSize ?? assembled.bytesWritten;
      logger.info('Assembled chunked upload to temp file', {
        sessionId,
        fileName,
        bytesWritten: assembled.bytesWritten,
        durationMs: elapsedMs(assembleStart),
      });

      const pending = createPendingUpload();
      let nextSeq = 0;
      let persistedEvents = 0;
      const parseStart = performance.now();

      const pendingInfo = await pending;
      pendingUploadId = pendingInfo.uploadId;
      parseResult = await parseQuakeMLFileStream(tempFilePath, {
        stripQuakemlFromReturnedEvents: true,
        async onEventBatch(events) {
          nextSeq = await appendPendingUploadEvents(
            pendingInfo.uploadId,
            events,
            nextSeq,
            pendingInfo.expiresAt,
          );
          persistedEvents += events.length;
        },
      });

      if (persistedEvents === 0) {
        pendingUploadId = undefined;
      }

      logger.info('Parsed streamed QuakeML upload', {
        pendingUploadId,
        eventCount: parseResult.events.length,
        persistedEvents,
        durationMs: elapsedMs(parseStart),
      });
    } else {
      const assembleStart = performance.now();
      const content = await assembleChunks(sessionId, totalChunks);
      responseFileSize = fileSize ?? content.length;
      logger.info('Assembled chunked upload in memory', {
        sessionId,
        fileName,
        bytes: content.length,
        durationMs: elapsedMs(assembleStart),
      });

      const parseStart = performance.now();
      parseResult = parseFile(
        content,
        fileName,
        delimiter as any ?? undefined,
        dateFormat as any ?? undefined,
      );
      logger.info('Parsed chunked upload in memory', {
        sessionId,
        fileName,
        eventCount: parseResult.events.length,
        durationMs: elapsedMs(parseStart),
      });

      if (parseResult.events.length > 0) {
        const pendingStart = performance.now();
        pendingUploadId = await storePendingUpload(parseResult.events);
        logger.info('Stored pending upload from chunked finalize', {
          pendingUploadId,
          eventCount: parseResult.events.length,
          durationMs: elapsedMs(pendingStart),
        });
      }
    }

    // Streaming QuakeML already returns stripped events; this keeps the legacy
    // in-memory parser path browser-safe too.
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
      fileSize: responseFileSize,
      format: fileName.split('.').pop()?.toUpperCase() ?? 'UNKNOWN',
      ...parseResult,
      events,
      ...(pendingUploadId ? { pendingUploadId } : {}),
    });
  } catch (error) {
    logger.error('Failed to finalise chunked upload', error);
    const msg = error instanceof Error ? error.message : 'Failed to process upload';
    return NextResponse.json({ error: msg, code: 'FINALIZE_ERROR' }, { status: 500 });
  } finally {
    if (tempFilePath) {
      rm(tempFilePath, { force: true }).catch(() => {/* best-effort temp cleanup */});
    }
  }
}
