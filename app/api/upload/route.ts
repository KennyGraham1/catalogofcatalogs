import { NextRequest, NextResponse } from 'next/server';
import { parseFile, type ParseResult } from '@/lib/parsers';
import { type Delimiter } from '@/lib/delimiter-detector';
import { type DateFormat } from '@/lib/date-format-detector';
import { requireEditor } from '@/lib/auth/middleware';
import { Logger } from '@/lib/errors';
import { storePendingUpload } from '@/lib/pending-uploads';
import {
  createUploadTooLargeResponse,
  getMaxSyncUploadParseBytes,
  getUploadFileExtension,
  isAllowedUploadExtension,
} from '@/lib/upload-limits';
import { DELIMITER_NAME_TO_CHARACTER } from '@/lib/upload-chunks';
import type { ParsedEvent } from '@/types/upload';

const logger = new Logger('UploadAPI');
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const maxDuration = 120;

// The response carries a bounded sample, never every event: parsed events are several
// times larger than their source (raw columns plus canonical fields), and the whole set
// already sits in the pending-upload store the catalogue is created from. These caps keep
// the response far below Vercel's 4.5 MB function payload limit.
const PREVIEW_MAX_EVENTS = 1000;
const PREVIEW_MAX_BYTES = 1_500_000;
const MAX_RESPONSE_ERRORS = 200;
const MAX_RESPONSE_FAILURES = 500;

const DATE_FORMATS: Record<string, DateFormat> = {
  us: 'US',
  international: 'International',
  iso: 'ISO',
};

/**
 * The form's delimiter option ('comma', 'tab', ...) or the character itself; 'auto' and
 * empty mean auto-detect. Anything else is rejected rather than silently auto-detected.
 */
function resolveDelimiter(value: string | null): { ok: true; delimiter?: Delimiter } | { ok: false } {
  if (value === null || value === '' || value.toLowerCase() === 'auto') return { ok: true };
  const byName = DELIMITER_NAME_TO_CHARACTER[value.toLowerCase()];
  if (byName) return { ok: true, delimiter: byName };
  if ((Object.values(DELIMITER_NAME_TO_CHARACTER) as string[]).includes(value)) {
    return { ok: true, delimiter: value as Delimiter };
  }
  return { ok: false };
}

function resolveDateFormat(value: string | null): { ok: true; dateFormat?: DateFormat } | { ok: false } {
  if (value === null || value === '' || value.toLowerCase() === 'auto') return { ok: true };
  const dateFormat = DATE_FORMATS[value.toLowerCase()];
  return dateFormat ? { ok: true, dateFormat } : { ok: false };
}

/** A failure's offending value, shortened when it is long (it is shown, not reprocessed). */
function boundFailureValue<T extends { value?: unknown }>(failure: T): T {
  if (failure.value === undefined || failure.value === null) return failure;
  const text = typeof failure.value === 'string' ? failure.value : JSON.stringify(failure.value);
  return text !== undefined && text.length > 200 ? { ...failure, value: `${text.slice(0, 200)}…` } : failure;
}

// Structures a preview never needs (the checks and the schema step read scalar fields)
// and that can be many kilobytes per event: QuakeML picks, arrivals and so on.
const PREVIEW_OMITTED_FIELDS = new Set([
  'quakeml', 'picks', 'arrivals', 'amplitudes', 'station_magnitudes', 'origins', 'focal_mechanisms',
]);
/** Any other value longer than this (serialised) is left out of a preview event. */
const PREVIEW_MAX_FIELD_CHARS = 2000;

function previewEventOf(event: ParsedEvent): ParsedEvent {
  const preview: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (PREVIEW_OMITTED_FIELDS.has(key)) continue;
    const size = typeof value === 'string' ? value.length
      : value !== null && typeof value === 'object' ? JSON.stringify(value).length : 0;
    if (size > PREVIEW_MAX_FIELD_CHARS) continue;
    preview[key] = value;
  }
  return preview as ParsedEvent;
}

/**
 * An evenly spaced sample of the parsed events, each stripped to what a preview needs,
 * with its position in the file. The sample stops at the byte budget, counted on each
 * event actually included, so no event shape can push the response past it.
 */
function buildPreview(events: ParsedEvent[]): { previewEvents: ParsedEvent[]; previewIndices: number[] } {
  const previewEvents: ParsedEvent[] = [];
  const previewIndices: number[] = [];
  const count = Math.min(events.length, PREVIEW_MAX_EVENTS);
  let bytes = 0;
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i * events.length) / count);
    const preview = previewEventOf(events[index]);
    const size = Buffer.byteLength(JSON.stringify(preview), 'utf8') + 1;
    if (bytes + size > PREVIEW_MAX_BYTES) break;
    bytes += size;
    previewEvents.push(preview);
    previewIndices.push(index);
  }
  return { previewEvents, previewIndices };
}

/** The upload response body: counts, mapping resolution and a bounded preview (C15). */
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
    format: extension.toUpperCase(),
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
            failures: failures.slice(0, MAX_RESPONSE_FAILURES).map(boundFailureValue),
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
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const delimiterParam = formData.get('delimiter') as string | null;
    const dateFormatParam = formData.get('dateFormat') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    const maxParseBytes = getMaxSyncUploadParseBytes();
    if (file.size > maxParseBytes) {
      return NextResponse.json(createUploadTooLargeResponse(file.size), { status: 413 });
    }

    // Validate file type by extension and MIME type
    const extension = getUploadFileExtension(file.name);

    if (!isAllowedUploadExtension(file.name)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: CSV, TXT, JSON, GeoJSON, XML, QML, QuakeML' },
        { status: 400 }
      );
    }

    // Secondary MIME type check — browsers set this from the OS file-type registry.
    // We accept a broad set to avoid false rejections from misconfigured systems,
    // but block clearly wrong types (images, executables, etc.).
    const allowedMimeTypes = new Set([
      'text/csv', 'text/plain', 'text/tab-separated-values',
      'application/csv', 'application/json', 'application/geo+json',
      'application/xml', 'text/xml', 'application/vnd.quakeml+xml',
      'application/octet-stream', // many systems use this as a generic fallback
      '', // some clients omit the MIME type entirely
    ]);
    const mimeBase = (file.type || '').split(';')[0].trim().toLowerCase();
    if (mimeBase && !allowedMimeTypes.has(mimeBase)) {
      return NextResponse.json(
        { error: `File MIME type '${mimeBase}' is not permitted.` },
        { status: 400 }
      );
    }

    // An explicit delimiter or date format that cannot be honoured is an error, not a
    // silent fallback to auto-detection.
    const delimiterChoice = resolveDelimiter(delimiterParam);
    if (!delimiterChoice.ok) {
      return NextResponse.json(
        { error: `Invalid delimiter '${delimiterParam}'. Allowed: comma, tab, semicolon, pipe, space.`, code: 'INVALID_DELIMITER' },
        { status: 400 }
      );
    }
    const dateFormatChoice = resolveDateFormat(dateFormatParam);
    if (!dateFormatChoice.ok) {
      return NextResponse.json(
        { error: `Invalid date format '${dateFormatParam}'. Allowed: US, International, ISO.`, code: 'INVALID_DATE_FORMAT' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Parse the file — full ParsedEvent objects are in memory here, including
    // the quakeml: QuakeMLEvent field for QuakeML files.
    const parseResult = parseFile(content, file.name, delimiterChoice.delimiter, dateFormatChoice.dateFormat);

    // ── Pending upload store ────────────────────────────────────────────────
    //
    // All parsed events are persisted in MongoDB under a pendingUploadId
    // (TTL: 24 hours), owned by the uploading user (C9). The browser receives
    // counts, the parser's column resolution and a bounded preview; the
    // catalogue is always created from the pending store, so no data is ever
    // discarded and nothing large travels back through the browser.
    // ───────────────────────────────────────────────────────────────────────

    let pendingUploadId: string | undefined;

    if (parseResult.events.length > 0) {
      pendingUploadId = await storePendingUpload(parseResult.events, authResult.user.id);
      logger.info('Stored pending upload', {
        pendingUploadId,
        eventCount: parseResult.events.length,
      });
    }

    return NextResponse.json(buildUploadResponse({
      fileName: file.name,
      fileSize: file.size,
      extension,
      parseResult,
      pendingUploadId,
    }));

  } catch (error) {
    logger.error('Upload error', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to process file';

    return NextResponse.json(
      { error: errorMessage, code: 'UPLOAD_ERROR' },
      { status: 500 }
    );
  }
}
