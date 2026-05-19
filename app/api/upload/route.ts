import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/parsers';
import { type Delimiter } from '@/lib/delimiter-detector';
import { type DateFormat } from '@/lib/date-format-detector';
import { requireEditor } from '@/lib/auth/middleware';
import { Logger } from '@/lib/errors';
import { storePendingUpload } from '@/lib/pending-uploads';
import { createUploadTooLargeResponse, getMaxSyncUploadParseBytes } from '@/lib/upload-limits';

const logger = new Logger('UploadAPI');
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const maxDuration = 120;

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
    const allowedExtensions = ['csv', 'txt', 'dat', 'json', 'geojson', 'xml', 'qml'];
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!extension || !allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: CSV, TXT, JSON, GeoJSON, XML, QML' },
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

    // Parse delimiter parameter if provided
    let delimiter: Delimiter | undefined;
    if (delimiterParam) {
      const delimiterMap: Record<string, Delimiter> = {
        'comma': ',',
        'tab': '\t',
        'semicolon': ';',
        'pipe': '|',
        'space': ' '
      };
      delimiter = delimiterMap[delimiterParam.toLowerCase()];
    }

    // Parse date format parameter if provided
    let dateFormat: DateFormat | undefined;
    if (dateFormatParam) {
      const dateFormatMap: Record<string, DateFormat> = {
        'us': 'US',
        'international': 'International',
        'iso': 'ISO'
      };
      dateFormat = dateFormatMap[dateFormatParam.toLowerCase()];
    }

    // Read file content
    const content = await file.text();

    // Parse the file — full ParsedEvent objects are in memory here, including
    // the quakeml: QuakeMLEvent field for QuakeML files.
    const parseResult = parseFile(content, file.name, delimiter, dateFormat);

    // ── Pending upload store ────────────────────────────────────────────────
    //
    // All parsed events are persisted in MongoDB under a pendingUploadId
    // (TTL: 24 hours).  The browser receives only lightweight scalar fields
    // for display/mapping plus the pendingUploadId token.  When the user
    // creates the catalogue the catalogue API retrieves the full data
    // directly from MongoDB — no data is ever discarded.
    // ───────────────────────────────────────────────────────────────────────

    let pendingUploadId: string | undefined;

    if (parseResult.events.length > 0) {
      pendingUploadId = await storePendingUpload(parseResult.events);
      logger.info('Stored pending upload', {
        pendingUploadId,
        eventCount: parseResult.events.length,
      });
    }

    // Build the lightweight events for the browser response.  For QuakeML
    // files we strip the quakeml object; all other fields (scalars) are kept
    // so the UI can display and remap them normally.
    const events = parseResult.events.map(({ quakeml: _quakeml, ...rest }) => rest);

    return NextResponse.json({
      fileName: file.name,
      fileSize: file.size,
      format: extension.toUpperCase(),
      ...parseResult,
      events,
      ...(pendingUploadId ? { pendingUploadId } : {}),
    });

  } catch (error) {
    logger.error('Upload error', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to process file';

    return NextResponse.json(
      { error: errorMessage, code: 'UPLOAD_ERROR' },
      { status: 500 }
    );
  }
}
