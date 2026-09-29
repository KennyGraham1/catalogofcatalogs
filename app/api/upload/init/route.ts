/**
 * POST /api/upload/init
 *
 * First step of the three-step chunked upload flow used for files > 3.5 MB.
 *
 * Body: JSON
 *   { fileName: string, fileSize: number, totalChunks: number,
 *     delimiter?: string, dateFormat?: string }
 *
 * Response: JSON
 *   { sessionId: string, chunkSize: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireEditor } from '@/lib/auth/middleware';
import { Logger } from '@/lib/errors';
import {
  createUploadSession,
  CHUNK_SIZE,
  DELIMITER_NAME_TO_CHARACTER,
  isValidStoredDelimiter,
} from '@/lib/upload-chunks';
import {
  createUploadTooLargeResponse,
  getMaxSyncUploadParseBytes,
  isAllowedUploadExtension,
  isQuakeMLExtension,
} from '@/lib/upload-limits';

export const dynamic = 'force-dynamic';

const logger = new Logger('UploadInitAPI');
const MAX_FILE_SIZE = 500 * 1024 * 1024;

const DATE_FORMATS: Record<string, string> = { us: 'US', international: 'International', iso: 'ISO' };

/** 'auto' or nothing means auto-detect, as on /api/upload; a named delimiter in any case. */
function normaliseDelimiter(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'auto') return undefined;
  const name = value.toLowerCase();
  return Object.prototype.hasOwnProperty.call(DELIMITER_NAME_TO_CHARACTER, name) ? name : value;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    const body = await request.json();
    const { fileName, fileSize, totalChunks, delimiter, dateFormat } = body;

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }

    if (!isAllowedUploadExtension(fileName)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: CSV, TXT, JSON, GeoJSON, XML, QML, QuakeML' },
        { status: 400 },
      );
    }

    if (!Number.isInteger(totalChunks) || totalChunks < 1) {
      return NextResponse.json({ error: 'totalChunks must be a positive integer' }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: 'fileSize must be a positive number' }, { status: 400 });
    }
    // The chunk plan has to be consistent with the declared size. The server
    // dictates the chunk size (returned below and used by the client), so a plan
    // whose capacity exceeds the declared size by more than one chunk means the
    // two disagree — the pattern used to declare a tiny file and then stream
    // hundreds of megabytes. Finalize additionally enforces the caps against the
    // bytes actually stored.
    if (totalChunks * CHUNK_SIZE > fileSize + CHUNK_SIZE) {
      return NextResponse.json(
        {
          error: `totalChunks is inconsistent with fileSize; chunks must be at most ${CHUNK_SIZE} bytes each`,
        },
        { status: 400 },
      );
    }
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }
    const maxParseBytes = getMaxSyncUploadParseBytes();
    if (fileSize > maxParseBytes && !isQuakeMLExtension(fileName)) {
      return NextResponse.json(createUploadTooLargeResponse(fileSize), { status: 413 });
    }

    // The client sends DelimiterSelector's named option ('comma', 'tab', ...).
    // Validate it here, before it is ever stored, so an unmappable value can
    // never reach finalize's parser: passing a 5-character name straight
    // through as the delimiter character used to zero out every large
    // CSV/TXT/DAT import (findings #36/#46). See lib/upload-chunks.ts for the
    // validator and the canonical name → character map finalize maps through.
    const storedDelimiter = normaliseDelimiter(delimiter);
    if (storedDelimiter !== undefined && !isValidStoredDelimiter(storedDelimiter)) {
      return NextResponse.json(
        {
          error: `Invalid delimiter '${delimiter}'. Allowed: comma, tab, semicolon, pipe, space.`,
          code: 'INVALID_DELIMITER',
        },
        { status: 400 },
      );
    }

    // The date format is checked here too, so a value finalize could not honour is
    // refused before any chunk is sent ('auto' or nothing means detect it).
    const dateFormatName = typeof dateFormat === 'string' ? dateFormat.trim().toLowerCase() : dateFormat;
    const detectDateFormat = dateFormatName === undefined || dateFormatName === null ||
      dateFormatName === '' || dateFormatName === 'auto';
    const storedDateFormat = !detectDateFormat && typeof dateFormatName === 'string'
      ? DATE_FORMATS[dateFormatName]
      : undefined;
    if (!detectDateFormat && storedDateFormat === undefined) {
      return NextResponse.json(
        { error: `Invalid date format '${dateFormat}'. Allowed: US, International, ISO.`, code: 'INVALID_DATE_FORMAT' },
        { status: 400 },
      );
    }

    // owner_id (C9): scopes this session to the authenticated user so
    // /api/upload/chunk can refuse chunks posted by anyone else.
    const sessionId = await createUploadSession(
      fileName,
      fileSize,
      totalChunks,
      storedDelimiter as string | undefined,
      storedDateFormat,
      user.id,
    );

    logger.info('Chunked upload session created', { sessionId, fileName, fileSize, totalChunks, ownerId: user.id });

    return NextResponse.json({ sessionId, chunkSize: CHUNK_SIZE });
  } catch (error) {
    logger.error('Failed to create upload session', error);
    return NextResponse.json({ error: 'Failed to initialise upload session' }, { status: 500 });
  }
}
