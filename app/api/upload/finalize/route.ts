/**
 * POST /api/upload/finalize
 *
 * Third and final step of the chunked upload flow.
 *
 * Body: JSON { sessionId: string }
 *
 * The handler:
 *   1. Retrieves the session metadata from MongoDB (only the uploader's own session).
 *   2. Streams QuakeML chunks to a temp file, or assembles sync-parser formats
 *      into a complete file string.
 *   3. Parses QuakeML from a file stream, or runs parseFile() for sync formats.
 *   4. Stores full event data in the pending-upload store.
 *   5. Returns the same response shape as /api/upload (counts, the parser's column
 *      resolution, a bounded preview and the pendingUploadId), so the frontend needs
 *      no special casing.
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
  UploadSizeLimitError,
  CHUNK_SIZE,
  DELIMITER_NAME_TO_CHARACTER,
} from '@/lib/upload-chunks';
import { parseFile, parseQuakeMLFileStream, type ParseResult } from '@/lib/parsers';
import { type Delimiter } from '@/lib/delimiter-detector';
import { type DateFormat } from '@/lib/date-format-detector';
import {
  appendPendingUploadEvents,
  createPendingUpload,
  storePendingUpload,
} from '@/lib/pending-uploads';
import {
  createUploadTooLargeResponse,
  getMaxSyncUploadParseBytes,
  getUploadFileExtension,
  isQuakeMLExtension,
} from '@/lib/upload-limits';
import type { ParsedEvent } from '@/types/upload';
import { rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

export const dynamic    = 'force-dynamic';
export const maxDuration = 300; // seconds — Vercel Pro/Enterprise

const logger = new Logger('UploadFinalizeAPI');
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Bounded response, as in /api/upload: a chunked upload is by definition larger than
// the single-request limit, so returning every parsed event here would undo chunking.
const PREVIEW_MAX_EVENTS = 1000;
const PREVIEW_MAX_BYTES = 1_500_000;
const MAX_RESPONSE_ERRORS = 200;
const MAX_RESPONSE_FAILURES = 500;

const DATE_FORMATS: Record<string, DateFormat> = {
  us: 'US',
  international: 'International',
  iso: 'ISO',
};

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

/**
 * The session stores the form's delimiter option ('comma', 'pipe', ...). parseCSV needs
 * the character: handing it the name made every line a single field and imported zero
 * events. An unmappable stored value is rejected rather than auto-detected.
 */
function resolveStoredDelimiter(value: unknown): { ok: true; delimiter?: Delimiter } | { ok: false } {
  if (value === undefined || value === null || value === '' || value === 'auto') return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  const byName = DELIMITER_NAME_TO_CHARACTER[value.toLowerCase()];
  if (byName) return { ok: true, delimiter: byName };
  if ((Object.values(DELIMITER_NAME_TO_CHARACTER) as string[]).includes(value)) {
    return { ok: true, delimiter: value as Delimiter };
  }
  return { ok: false };
}

function resolveStoredDateFormat(value: unknown): { ok: true; dateFormat?: DateFormat } | { ok: false } {
  if (value === undefined || value === null || value === '' || value === 'auto') return { ok: true };
  if (typeof value !== 'string') return { ok: false };
  const dateFormat = DATE_FORMATS[value.toLowerCase()];
  return dateFormat ? { ok: true, dateFormat } : { ok: false };
}

/**
 * An evenly spaced sample of the parsed events (QuakeML objects stripped), sized to fit
 * the byte budget, with each sample's position in the file.
 */
function buildPreview(events: ParsedEvent[]): { previewEvents: ParsedEvent[]; previewIndices: number[] } {
  if (events.length === 0) return { previewEvents: [], previewIndices: [] };
  const strip = ({ quakeml: _quakeml, ...rest }: ParsedEvent) => rest as ParsedEvent;
  const probe = events.slice(0, 50).map(strip);
  const averageBytes = Math.max(1, JSON.stringify(probe).length / probe.length);
  const count = Math.max(1, Math.min(events.length, PREVIEW_MAX_EVENTS, Math.floor(PREVIEW_MAX_BYTES / averageBytes)));
  const previewEvents: ParsedEvent[] = [];
  const previewIndices: number[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i * events.length) / count);
    previewEvents.push(strip(events[index]));
    previewIndices.push(index);
  }
  return { previewEvents, previewIndices };
}

/** The same bounded response body /api/upload returns (C15). */
function buildUploadResponse(params: {
  fileName: string;
  fileSize: number;
  extension: string;
  parseResult: ParseResult;
  pendingUploadId?: string;
}) {
  const { fileName, fileSize, extension, parseResult, pendingUploadId } = params;
  const { events, errors, warnings, validationReport, ...rest } = parseResult;
  const resolution = parseResult as ParseResult & {
    resolvedFieldSources?: Record<string, string>;
    fileDecisions?: Record<string, unknown>;
  };
  const failures = validationReport?.failures ?? [];
  const preview = buildPreview(events);

  return {
    ...rest,
    fileName,
    fileSize,
    format: (extension || 'UNKNOWN').toUpperCase(),
    eventCount: events.length,
    errors: errors.slice(0, MAX_RESPONSE_ERRORS),
    errorCount: errors.length,
    errorsTruncated: errors.length > MAX_RESPONSE_ERRORS,
    warnings: warnings.slice(0, MAX_RESPONSE_ERRORS),
    warningsTruncated: Boolean(parseResult.warningsTruncated) || warnings.length > MAX_RESPONSE_ERRORS,
    resolvedFieldSources: resolution.resolvedFieldSources ?? {},
    fileDecisions: resolution.fileDecisions ?? {},
    ...(validationReport
      ? {
          validationReport: {
            ...validationReport,
            failures: failures.slice(0, MAX_RESPONSE_FAILURES),
            failuresTruncated: failures.length > MAX_RESPONSE_FAILURES,
          },
        }
      : {}),
    ...preview,
    previewTruncated: preview.previewEvents.length < events.length,
    ...(pendingUploadId ? { pendingUploadId } : {}),
  };
}

export async function POST(request: NextRequest) {
  let tempFilePath: string | undefined;
  let uploadSessionId: string | undefined;

  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) return authResult;
    const ownerId = authResult.user.id;

    const body      = await request.json();
    const sessionId = body?.sessionId;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    uploadSessionId = sessionId;

    // Retrieve session metadata (fileName, totalChunks, delimiter, dateFormat). Only the
    // user who started the upload can finalize it (C9); anyone else sees "not found".
    const session = await getUploadSession(sessionId, ownerId);
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
      delimiter: storedDelimiter,
      date_format: storedDateFormat,
    } = session;

    const delimiterChoice = resolveStoredDelimiter(storedDelimiter);
    const dateFormatChoice = resolveStoredDateFormat(storedDateFormat);
    if (!delimiterChoice.ok || !dateFormatChoice.ok) {
      deleteUploadSession(sessionId).catch(() => {/* TTL fallback */});
      return NextResponse.json(
        {
          error: !delimiterChoice.ok
            ? `Invalid delimiter '${String(storedDelimiter)}'. Allowed: comma, tab, semicolon, pipe, space.`
            : `Invalid date format '${String(storedDateFormat)}'. Allowed: US, International, ISO.`,
          code: !delimiterChoice.ok ? 'INVALID_DELIMITER' : 'INVALID_DATE_FORMAT',
        },
        { status: 400 },
      );
    }

    const isQuakeML = isQuakeMLExtension(fileName);
    const extension = getUploadFileExtension(fileName);

    // `file_size` is whatever the client declared at /api/upload/init, so these
    // two checks are only a fast path that rejects an obviously oversized upload
    // before any chunk is read. The binding limits are the ones passed to the
    // assembly helpers below, which count the bytes actually stored.
    const maxParseBytes = getMaxSyncUploadParseBytes();
    const estimatedSize = fileSize ?? totalChunks * CHUNK_SIZE;
    if (estimatedSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }
    if (estimatedSize > maxParseBytes && !isQuakeML) {
      return NextResponse.json(createUploadTooLargeResponse(estimatedSize), { status: 413 });
    }

    // QuakeML is parsed from a file stream, so it only has to satisfy the
    // absolute cap; every other format is parsed synchronously in memory and
    // must also stay inside the synchronous-parse budget.
    const assemblyLimit = isQuakeML
      ? MAX_FILE_SIZE
      : Math.min(MAX_FILE_SIZE, maxParseBytes);

    logger.info('Finalising chunked upload', { sessionId, fileName, totalChunks });

    let pendingUploadId: string | undefined;
    let parseResult: ParseResult;
    let responseFileSize = fileSize ?? 0;

    if (isQuakeML) {
      tempFilePath = path.join(tmpdir(), `catalog-upload-${sessionId}-${Date.now()}.${extension || 'xml'}`);

      const assembleStart = performance.now();
      const assembled = await assembleChunksToFile(sessionId, totalChunks, tempFilePath, assemblyLimit);
      // Report the bytes that were actually stored, not the declared size.
      responseFileSize = assembled.bytesWritten;
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
            ownerId,
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
      const content = await assembleChunks(sessionId, totalChunks, assemblyLimit);
      // Report the bytes that were actually stored, not the declared size.
      responseFileSize = Buffer.byteLength(content, 'utf-8');
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
        delimiterChoice.delimiter,
        dateFormatChoice.dateFormat,
      );
      logger.info('Parsed chunked upload in memory', {
        sessionId,
        fileName,
        eventCount: parseResult.events.length,
        durationMs: elapsedMs(parseStart),
      });

      if (parseResult.events.length > 0) {
        const pendingStart = performance.now();
        pendingUploadId = await storePendingUpload(parseResult.events, ownerId);
        logger.info('Stored pending upload from chunked finalize', {
          pendingUploadId,
          eventCount: parseResult.events.length,
          durationMs: elapsedMs(pendingStart),
        });
      }
    }

    // Delete chunks now — they are no longer needed
    deleteUploadSession(sessionId).catch(() => {/* TTL fallback */});

    logger.info('Chunked upload finalised', {
      sessionId,
      fileName,
      eventCount: parseResult.events.length,
    });

    return NextResponse.json(buildUploadResponse({
      fileName,
      fileSize: responseFileSize,
      extension,
      parseResult,
      pendingUploadId,
    }));
  } catch (error) {
    if (error instanceof UploadSizeLimitError) {
      // The stored bytes exceeded the cap regardless of what init was told.
      // Drop the chunks now so an under-declared upload cannot sit in MongoDB
      // until its TTL expires.
      logger.warn('Rejected oversized chunked upload', {
        sessionId: uploadSessionId,
        bytesRead: error.bytesRead,
        limit: error.limit,
      });
      if (uploadSessionId) {
        deleteUploadSession(uploadSessionId).catch(() => {/* TTL fallback */});
      }
      return error.limit >= MAX_FILE_SIZE
        ? NextResponse.json(
            { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
            { status: 400 },
          )
        : NextResponse.json(createUploadTooLargeResponse(error.bytesRead), { status: 413 });
    }

    logger.error('Failed to finalise chunked upload', error);
    const msg = error instanceof Error ? error.message : 'Failed to process upload';
    return NextResponse.json({ error: msg, code: 'FINALIZE_ERROR' }, { status: 500 });
  } finally {
    if (tempFilePath) {
      rm(tempFilePath, { force: true }).catch(() => {/* best-effort temp cleanup */});
    }
  }
}
