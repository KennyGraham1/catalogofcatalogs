import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, DatabaseError, formatErrorResponse } from '@/lib/errors';
import { apiCache, generateCacheKey, catalogueCache, invalidateCacheByPrefix } from '@/lib/cache';
import { applyRateLimit, readRateLimiter, apiRateLimiter } from '@/lib/rate-limiter';
import { requireEditor } from '@/lib/auth/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  deletePendingUpload,
  getPendingUploadEvents,
  iteratePendingUploadEventBatches,
} from '@/lib/pending-uploads';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { normalizeTimestamp } from '@/lib/earthquake-utils';
import type { ParsedEvent } from '@/types/upload';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const logger = new Logger('CataloguesAPI');

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting (120 requests per minute for read operations)
    const rateLimitResult = applyRateLimit(request, readRateLimiter, 120);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.headers['Retry-After'],
        },
        {
          status: 429,
          headers: rateLimitResult.headers,
        }
      );
    }

    const cacheKey = generateCacheKey('catalogues', { all: true });

    // Try to get from cache
    const cached = catalogueCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized', code: 'DB_NOT_INITIALIZED' },
        { status: 500 }
      );
    }

    // Fetch from database
    const catalogues = await dbQueries.getCatalogues();

    // Store in cache
    catalogueCache.set(cacheKey, catalogues);

    return NextResponse.json(catalogues);
  } catch (error) {
    logger.error('Failed to fetch catalogues', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

// Maximum request body size (100MB for events array)
const MAX_BODY_SIZE = 100 * 1024 * 1024;
const EVENT_INSERT_BATCH_SIZE = 500;
const EVENT_INSERT_MAX_BATCH_BYTES = 8 * 1024 * 1024;
const EVENT_INSERT_MAX_PARALLEL_BATCHES = 2;
const BATCH_INSERT_MAX_RETRIES = 4;
const BATCH_INSERT_BASE_DELAY_MS = 250;

const NUMERIC_MAPPING_FIELDS = new Set([
  'latitude', 'longitude', 'depth', 'magnitude',
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
  'depth_uncertainty', 'horizontal_uncertainty', 'magnitude_uncertainty',
  'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
  'minimum_distance', 'maximum_distance', 'associated_phase_count',
  'associated_station_count', 'depth_phase_count', 'magnitude_station_count',
]);

type InsertRow = Partial<import('@/lib/db').MergedEvent> & {
  id: string;
  catalogue_id: string;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  source_events: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRetryableBatchInsertError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as {
    code?: number;
    codeName?: string;
    errorLabels?: string[];
    message?: string;
  };

  const retryableCodes = new Set([
    6, // HostUnreachable
    7, // HostNotFound
    89, // NetworkTimeout
    91, // ShutdownInProgress
    112, // WriteConflict
    189, // PrimarySteppedDown
    262, // ExceededTimeLimit
    9001, // SocketException
    11600, // InterruptedAtShutdown
    11602, // InterruptedDueToReplStateChange
    13435, // NotPrimaryNoSecondaryOk
    13436, // NotPrimaryOrSecondary
    10107, // NotWritablePrimary
  ]);

  if (typeof err.code === 'number' && retryableCodes.has(err.code)) {
    return true;
  }

  if (err.codeName && ['WriteConflict', 'InterruptedAtShutdown', 'NotWritablePrimary'].includes(err.codeName)) {
    return true;
  }

  const labels = err.errorLabels || [];
  if (labels.includes('RetryableWriteError') || labels.includes('TransientTransactionError')) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('wiredtiger') ||
    message.includes('oldest pinned transaction id') ||
    message.includes('write conflict') ||
    message.includes('temporarily unavailable')
  );
}

function safeParseNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(num) ? null : num;
}

function applyFieldMappingsToPendingEvent(
  pendingEvent: ParsedEvent,
  fieldMappings: unknown,
): Record<string, unknown> {
  const event: Record<string, unknown> = { ...pendingEvent };
  const mappings: Record<string, string> =
    fieldMappings && typeof fieldMappings === 'object'
      ? fieldMappings as Record<string, string>
      : {};

  for (const [src, tgt] of Object.entries(mappings)) {
    if (!tgt || pendingEvent[src] === undefined) continue;

    if (tgt === 'time') {
      const normalized = normalizeTimestamp(pendingEvent[src] as string | number);
      if (normalized) {
        event.time = normalized;
      }
      continue;
    }

    if (NUMERIC_MAPPING_FIELDS.has(tgt)) {
      const parsed = safeParseNumber(pendingEvent[src]);
      if (parsed !== null) {
        event[tgt] = parsed;
      }
      continue;
    }

    event[tgt] = pendingEvent[src];
  }

  return event;
}

function validateCatalogueEvent(event: any): string[] {
  const errors: string[] = [];

  if (!event.time || (typeof event.time === 'string' && event.time.trim() === '')) {
    errors.push('time is required');
  } else {
    const normalizedTime = normalizeTimestamp(event.time);
    if (!normalizedTime) {
      errors.push('time is not a valid timestamp');
    } else {
      event.time = normalizedTime;
    }
  }

  const latitude = safeParseNumber(event.latitude);
  const longitude = safeParseNumber(event.longitude);
  const magnitude = safeParseNumber(event.magnitude);
  const depth = safeParseNumber(event.depth);

  if (latitude === null) {
    errors.push('latitude is required and must be a number');
  } else if (latitude < -90 || latitude > 90) {
    errors.push(`latitude ${latitude} must be between -90 and 90`);
  }

  if (longitude === null) {
    errors.push('longitude is required and must be a number');
  } else if (longitude < -180 || longitude > 180) {
    errors.push(`longitude ${longitude} must be between -180 and 180`);
  }

  if (magnitude === null) {
    errors.push('magnitude is required and must be a number');
  } else if (magnitude < -3 || magnitude > 10) {
    errors.push(`magnitude ${magnitude} must be between -3 and 10`);
  }

  return errors;
}

function buildInsertRow(event: any, pendingEvent: ParsedEvent | undefined, catalogueId: string): InsertRow {
  const latitude = safeParseNumber(event.latitude)!;
  const longitude = safeParseNumber(event.longitude)!;
  const magnitude = safeParseNumber(event.magnitude)!;

  const row: InsertRow = {
    id: uuidv4(),
    catalogue_id: catalogueId,
    time: event.time,
    latitude,
    longitude,
    magnitude,
    source_events: JSON.stringify([{ source: 'upload', eventId: event.id || event.eventId }]),
    depth: (() => {
      const d = safeParseNumber(event.depth);
      if (d === null || d < 0) return undefined;
      if (d > 1000) { const km = d / 1000; return km <= 1000 ? km : undefined; }
      return d;
    })(),
  };

  if (pendingEvent?.quakeml) {
    Object.assign(row, quakemlEventToDbFields(pendingEvent.quakeml));
  } else {
    const source = pendingEvent
      ? { ...pendingEvent, ...event }
      : event;
    Object.assign(row, parsedEventToDbFields(source as ParsedEvent));
  }

  return row;
}

function estimateEventInsertBytes(row: InsertRow): number {
  try {
    return Buffer.byteLength(JSON.stringify(row), 'utf8') + 256;
  } catch {
    return EVENT_INSERT_MAX_BATCH_BYTES;
  }
}

function chunkInsertRows(rows: InsertRow[]): InsertRow[][] {
  const batches: InsertRow[][] = [];
  let batch: InsertRow[] = [];
  let batchBytes = 0;

  for (const row of rows) {
    const rowBytes = estimateEventInsertBytes(row);
    if (
      batch.length > 0 &&
      (batch.length >= EVENT_INSERT_BATCH_SIZE ||
        batchBytes + rowBytes > EVENT_INSERT_MAX_BATCH_BYTES)
    ) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }

    batch.push(row);
    batchBytes += rowBytes;
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function insertBatchWithRetry(
  db: NonNullable<typeof dbQueries>,
  catalogueId: string,
  batch: InsertRow[],
  batchStart: number,
): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      await db.bulkInsertEvents(batch as Parameters<typeof db.bulkInsertEvents>[0]);
      return;
    } catch (error) {
      if (attempt >= BATCH_INSERT_MAX_RETRIES || !isRetryableBatchInsertError(error)) {
        throw error;
      }

      const delay = BATCH_INSERT_BASE_DELAY_MS * (2 ** attempt) + Math.floor(Math.random() * 100);
      logger.warn('Retrying batch event insert after transient MongoDB error', {
        catalogueId,
        batchStart,
        batchSize: batch.length,
        attempt: attempt + 1,
        delayMs: delay,
        error: getErrorMessage(error),
      });
      await sleep(delay);
      attempt += 1;
    }
  }
}

async function bulkInsertEventRows(
  db: NonNullable<typeof dbQueries>,
  catalogueId: string,
  rows: InsertRow[],
  insertedSoFar = 0,
): Promise<number> {
  const batches = chunkInsertRows(rows);
  let inserted = 0;

  for (let i = 0; i < batches.length; i += EVENT_INSERT_MAX_PARALLEL_BATCHES) {
    const window = batches.slice(i, i + EVENT_INSERT_MAX_PARALLEL_BATCHES);
    await Promise.all(window.map((batch, offset) =>
      insertBatchWithRetry(db, catalogueId, batch, insertedSoFar + inserted + offset * EVENT_INSERT_BATCH_SIZE)
    ));
    inserted += window.reduce((sum, batch) => sum + batch.length, 0);
  }

  return inserted;
}

async function createCatalogueFromPendingUploads(params: {
  ids: string[];
  trimmedName: string;
  metadata: any;
  fieldMappings: unknown;
}) {
  const { ids, trimmedName, metadata, fieldMappings } = params;

  if (!dbQueries) {
    return NextResponse.json(
      { error: 'Database not initialized', code: 'DB_NOT_INITIALIZED' },
      { status: 500 }
    );
  }

  const db = dbQueries;
  const catalogueId = uuidv4();
  const startedAt = performance.now();

  await db.insertCatalogue(
    catalogueId,
    trimmedName,
    JSON.stringify([{ source: 'upload', description: 'Uploaded catalogue' }]),
    JSON.stringify({
      uploadDate: new Date().toISOString(),
      pendingUploadIds: ids,
    }),
    0,
    'processing',
    metadata,
  );

  let totalSubmitted = 0;
  let successfullyImported = 0;
  let failedValidation = 0;
  let insertedCount = 0;
  const invalidEvents: { index: number; reason: string }[] = [];
  let minLat: number | undefined;
  let maxLat: number | undefined;
  let minLon: number | undefined;
  let maxLon: number | undefined;

  try {
    for (const id of ids) {
      let foundAny = false;

      for await (const pendingBatch of iteratePendingUploadEventBatches(id, 1000)) {
        foundAny = true;
        const rows: InsertRow[] = [];

        for (const pendingEvent of pendingBatch) {
          const index = totalSubmitted;
          totalSubmitted += 1;

          const event = applyFieldMappingsToPendingEvent(pendingEvent, fieldMappings);
          const errors = validateCatalogueEvent(event);
          if (errors.length > 0) {
            failedValidation += 1;
            if (invalidEvents.length < 100) {
              invalidEvents.push({ index, reason: errors.join('; ') });
            }
            continue;
          }

          const lat = safeParseNumber(event.latitude)!;
          const lon = safeParseNumber(event.longitude)!;
          if (minLat === undefined || lat < minLat) minLat = lat;
          if (maxLat === undefined || lat > maxLat) maxLat = lat;
          if (minLon === undefined || lon < minLon) minLon = lon;
          if (maxLon === undefined || lon > maxLon) maxLon = lon;

          rows.push(buildInsertRow(event, pendingEvent, catalogueId));
          successfullyImported += 1;
        }

        if (rows.length > 0) {
          insertedCount += await bulkInsertEventRows(db, catalogueId, rows, insertedCount);
        }
      }

      if (!foundAny) {
        logger.warn('Pending upload not found or expired', { pendingUploadId: id });
      }
    }

    if (totalSubmitted === 0) {
      await db.deleteCatalogue(catalogueId);
      return NextResponse.json(
        { error: 'Pending upload not found or expired', code: 'PENDING_UPLOAD_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (successfullyImported === 0) {
      await db.deleteCatalogue(catalogueId);
      return NextResponse.json(
        {
          error: `All ${failedValidation} event(s) failed validation. No events could be imported.`,
          code: 'ALL_EVENTS_INVALID',
          details: invalidEvents,
          totalInvalid: failedValidation,
          message: 'All events must have valid time, latitude (-90 to 90), longitude (-180 to 180), and magnitude (-3 to 10)',
        },
        { status: 400 }
      );
    }

    await db.updateCatalogueStatus('complete', catalogueId);
    await db.updateCatalogueEventCount(catalogueId, insertedCount);
    if (
      minLat !== undefined &&
      maxLat !== undefined &&
      minLon !== undefined &&
      maxLon !== undefined
    ) {
      await db.updateCatalogueGeoBounds(catalogueId, minLat, maxLat, minLon, maxLon);
    }
  } catch (error) {
    logger.error('Catalogue import failed; cleaning up partially inserted data', {
      catalogueId,
      insertedCount,
      error: getErrorMessage(error),
    });

    try {
      await db.deleteCatalogue(catalogueId);
    } catch (cleanupError) {
      logger.error('Failed to clean up partially imported catalogue', {
        catalogueId,
        cleanupError: getErrorMessage(cleanupError),
      });
      await db.updateCatalogueStatus('error', catalogueId);
      await db.updateCatalogueEventCount(catalogueId, insertedCount);
    }

    throw error;
  }

  for (const id of ids) {
    deletePendingUpload(id).catch(() => {/* TTL will clean up */});
  }

  invalidateCacheByPrefix('catalogues');

  const totalDurationMs = Math.round(performance.now() - startedAt);
  const successRate = totalSubmitted > 0
    ? Math.round((successfullyImported / totalSubmitted) * 10000) / 100
    : 0;
  const isPartialImport = failedValidation > 0;

  logger.info('Catalogue created successfully from pending uploads', {
    catalogueId,
    name: trimmedName,
    eventCount: successfullyImported,
    totalSubmitted,
    failedValidation,
    isPartialImport,
    durationMs: totalDurationMs,
  });

  const catalogue = await db.getCatalogueById(catalogueId);
  const validationReport = {
    totalSubmitted,
    successfullyImported,
    failedValidation,
    successRate,
    invalidEvents,
    hasMoreInvalidEvents: failedValidation > invalidEvents.length,
  };
  const importMessage = isPartialImport
    ? `Imported ${successfullyImported.toLocaleString()} of ${totalSubmitted.toLocaleString()} events. ${failedValidation.toLocaleString()} event${failedValidation === 1 ? '' : 's'} failed validation.`
    : `Successfully imported all ${successfullyImported.toLocaleString()} events.`;

  return NextResponse.json(
    {
      ...catalogue,
      validationReport,
      importMessage,
      partialImport: isPartialImport,
    },
    { status: 201 }
  );
}

export async function POST(request: NextRequest) {
  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Check Content-Length header for early rejection
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const parsedLength = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(parsedLength) && parsedLength > MAX_BODY_SIZE) {
        return NextResponse.json(
          {
            error: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB.`,
            code: 'BODY_TOO_LARGE',
          },
          { status: 413 }
        );
      }
    }

    // Apply rate limiting (30 requests per minute for write operations)
    const rateLimitResult = applyRateLimit(request, apiRateLimiter, 30);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.headers['Retry-After'],
        },
        {
          status: 429,
          headers: rateLimitResult.headers,
        }
      );
    }

    const rawBody = await request.text();
    const rawBodySize = new TextEncoder().encode(rawBody).length;
    if (rawBodySize > MAX_BODY_SIZE) {
      return NextResponse.json(
        {
          error: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB.`,
          code: 'BODY_TOO_LARGE',
        },
        { status: 413 }
      );
    }

    let body: any;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }
    const {
      name,
      events: bodyEvents,
      metadata,
      pendingUploadId,
      pendingUploadIds: pendingUploadIdList,
      fieldMappings,
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Catalogue name is required', code: 'MISSING_NAME' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 255) {
      return NextResponse.json(
        { error: 'Catalogue name must be 255 characters or less', code: 'NAME_TOO_LONG' },
        { status: 400 }
      );
    }

    // Helper to safely parse numeric values
    const safeParseNumber = (value: any): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      return isNaN(num) ? null : num;
    };

    // ── Pending upload retrieval ────────────────────────────────────────────
    //
    // The upload API stores the complete parsed events in MongoDB and returns
    // one pendingUploadId per file.  For multi-file uploads the page sends an
    // array (pendingUploadIds); single-file uploads may still send the legacy
    // scalar pendingUploadId.  We normalise to an ordered array, fetch each
    // token's events, and concatenate them so pendingEvents[i] aligns with
    // events[i] in the request body (both are in file-then-event order).
    let pendingEvents: ParsedEvent[] | null = null;
    const ids: string[] = Array.isArray(pendingUploadIdList)
      ? pendingUploadIdList.filter((id: unknown) => typeof id === 'string')
      : pendingUploadId && typeof pendingUploadId === 'string'
        ? [pendingUploadId]
        : [];

    if ((!bodyEvents || !Array.isArray(bodyEvents) || bodyEvents.length === 0) && ids.length > 0) {
      return createCatalogueFromPendingUploads({
        ids,
        trimmedName,
        metadata,
        fieldMappings,
      });
    }

    if (ids.length > 0) {
      try {
        const batches = await Promise.all(ids.map(id => getPendingUploadEvents(id)));
        const combined: ParsedEvent[] = [];
        for (let i = 0; i < batches.length; i++) {
          const b = batches[i];
          if (b) {
            combined.push(...b);
          } else {
            logger.warn('Pending upload not found or expired', { pendingUploadId: ids[i] });
          }
        }
        if (combined.length > 0) pendingEvents = combined;
      } catch (err) {
        logger.warn('Failed to retrieve pending uploads, falling back to scalar events', { ids, err });
      }
    }

    // ── Resolve events source ───────────────────────────────────────────────
    //
    // When the client sends pendingUploadIds but no events array, it means the
    // payload was too large to include inline.  We derive the events array from
    // pendingEvents (already fetched above) and apply any fieldMappings the
    // user configured in the UI.  This is the normal path for files > ~3 MB.
    //
    // For small files the client may still send events inline; pendingEvents
    // then supplements with extended fields (QuakeML, etc.).
    let events: any[];

    if (!bodyEvents || !Array.isArray(bodyEvents) || bodyEvents.length === 0) {
      if (!pendingEvents || pendingEvents.length === 0) {
        return NextResponse.json(
          { error: 'Events array is required', code: 'INVALID_EVENTS' },
          { status: 400 }
        );
      }
      // Build a minimal events array from pendingEvents so the rest of the
      // route (validation, bounds calculation, row construction) works
      // identically regardless of how the client sent the data.
      events = pendingEvents.map(pe => applyFieldMappingsToPendingEvent(pe, fieldMappings));
    } else {
      events = bodyEvents;
    }

    // Comprehensive validation of ALL events - check required fields and value ranges
    // Partition events into valid and invalid arrays for partial import support
    const invalidEvents: { index: number; reason: string }[] = [];
    const validEvents: { event: typeof events[0]; index: number }[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const errors: string[] = [];

      // Check required field presence
      if (!event.time || (typeof event.time === 'string' && event.time.trim() === '')) {
        errors.push('time is required');
      } else {
        const normalizedTime = normalizeTimestamp(event.time);
        if (!normalizedTime) {
          errors.push('time is not a valid timestamp');
        } else {
          event.time = normalizedTime;
        }
      }

      const latitude = safeParseNumber(event.latitude);
      const longitude = safeParseNumber(event.longitude);
      const magnitude = safeParseNumber(event.magnitude);
      let depth = safeParseNumber(event.depth);

      if (latitude === null) {
        errors.push('latitude is required and must be a number');
      } else if (latitude < -90 || latitude > 90) {
        errors.push(`latitude ${latitude} must be between -90 and 90`);
      }

      if (longitude === null) {
        errors.push('longitude is required and must be a number');
      } else if (longitude < -180 || longitude > 180) {
        errors.push(`longitude ${longitude} must be between -180 and 180`);
      }

      if (magnitude === null) {
        errors.push('magnitude is required and must be a number');
      } else if (magnitude < -3 || magnitude > 10) {
        errors.push(`magnitude ${magnitude} must be between -3 and 10`);
      }

      // Depth is optional. If out of the 0–1000 km range, try interpreting as
      // metres (divide by 1000). If still invalid, null it out — never reject
      // the whole event for a bad depth value.
      if (depth !== null) {
        if (depth < 0) {
          depth = null;
        } else if (depth > 1000) {
          const depthKm = depth / 1000;
          depth = depthKm <= 1000 ? depthKm : null;
        }
        event.depth = depth;
      }

      if (errors.length > 0) {
        invalidEvents.push({ index: i, reason: errors.join('; ') });
      } else {
        // Event passed validation - add to valid events array
        validEvents.push({ event, index: i });
      }
    }

    // If ALL events are invalid, reject the entire request
    if (validEvents.length === 0) {
      return NextResponse.json(
        {
          error: `All ${invalidEvents.length} event(s) failed validation. No events could be imported.`,
          code: 'ALL_EVENTS_INVALID',
          details: invalidEvents.slice(0, 100), // Return first 100 errors for debugging
          totalInvalid: invalidEvents.length,
          message: 'All events must have valid time, latitude (-90 to 90), longitude (-180 to 180), and magnitude (-3 to 10)',
        },
        { status: 400 }
      );
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized', code: 'DB_NOT_INITIALIZED' },
        { status: 500 }
      );
    }

    // Generate catalogue ID
    const catalogueId = uuidv4();

    // Calculate geographic bounds from VALID events only (more efficient for large datasets)
    let minLat: number | undefined;
    let maxLat: number | undefined;
    let minLon: number | undefined;
    let maxLon: number | undefined;

    for (const { event } of validEvents) {
      const lat = safeParseNumber(event.latitude);
      const lon = safeParseNumber(event.longitude);

      if (lat !== null) {
        if (minLat === undefined || lat < minLat) minLat = lat;
        if (maxLat === undefined || lat > maxLat) maxLat = lat;
      }
      if (lon !== null) {
        if (minLon === undefined || lon < minLon) minLon = lon;
        if (maxLon === undefined || lon > maxLon) maxLon = lon;
      }
    }

    // Prepare ONLY VALID events for insertion.
    //
    // pendingEvents holds the complete server-side ParsedEvent objects for all
    // formats (CSV, JSON, GeoJSON, QuakeML) when a pendingUploadId was supplied.
    // Each valid event's `.index` is its original position in the events array,
    // which is the same order as pendingEvents, so we join by position.
    const eventsToInsert = validEvents.map(({ event, index }) => {
      const pendingEvent = pendingEvents?.[index];
      return buildInsertRow(event, pendingEvent, catalogueId);
    });

    // Calculate validation statistics for the response
    const totalSubmitted = events.length;
    const successfullyImported = validEvents.length;
    const failedValidation = invalidEvents.length;
    const successRate = totalSubmitted > 0
      ? Math.round((successfullyImported / totalSubmitted) * 10000) / 100
      : 0;
    const isPartialImport = failedValidation > 0;

    // Avoid long-running multi-document transactions during large imports.
    // A single transaction spanning insertMany over many events can pin
    // WiredTiger state and fail under load. Insert in small retryable batches
    // and clean up the catalogue on failure to preserve all-or-nothing behavior.
    const db = dbQueries!;
    await db.insertCatalogue(
      catalogueId,
      trimmedName,
      JSON.stringify([{ source: 'upload', description: isPartialImport ? 'Uploaded catalogue (partial import)' : 'Uploaded catalogue' }]),
      JSON.stringify({
        uploadDate: new Date().toISOString(),
        partialImport: isPartialImport,
        validationSummary: {
          totalSubmitted,
          successfullyImported,
          failedValidation,
          successRate,
        }
      }),
      successfullyImported,
      'processing',
      {
        ...metadata,
        min_latitude: minLat,
        max_latitude: maxLat,
        min_longitude: minLon,
        max_longitude: maxLon,
      }
    );

    let insertedCount = 0;
    try {
      insertedCount = await bulkInsertEventRows(db, catalogueId, eventsToInsert as InsertRow[]);

      await db.updateCatalogueStatus('complete', catalogueId);
      await db.updateCatalogueEventCount(catalogueId, insertedCount);
      if (
        minLat !== undefined &&
        maxLat !== undefined &&
        minLon !== undefined &&
        maxLon !== undefined
      ) {
        await db.updateCatalogueGeoBounds(catalogueId, minLat, maxLat, minLon, maxLon);
      }
    } catch (error) {
      logger.error('Catalogue import failed; cleaning up partially inserted data', {
        catalogueId,
        insertedCount,
        error: getErrorMessage(error),
      });

      try {
        await db.deleteCatalogue(catalogueId);
      } catch (cleanupError) {
        logger.error('Failed to clean up partially imported catalogue', {
          catalogueId,
          cleanupError: getErrorMessage(cleanupError),
        });
        await db.updateCatalogueStatus('error', catalogueId);
        await db.updateCatalogueEventCount(catalogueId, insertedCount);
      }

      throw error;
    }

    // Clean up pending uploads now that the catalogue is saved — best-effort,
    // TTL will expire the documents automatically after 24 hours.
    for (const id of ids) {
      deletePendingUpload(id).catch(() => {/* TTL will clean up */});
    }

    // Invalidate cache only after successful insertion
    invalidateCacheByPrefix('catalogues');

    // Log with both success and failure counts
    logger.info('Catalogue created successfully', {
      catalogueId,
      name,
      eventCount: successfullyImported,
      totalSubmitted,
      failedValidation,
      isPartialImport,
    });

    // Fetch the created catalogue to return
    const catalogue = await dbQueries.getCatalogueById(catalogueId);

    // Build comprehensive validation report
    const validationReport = {
      totalSubmitted,
      successfullyImported,
      failedValidation,
      successRate,
      // Limit invalid events details to first 100 for performance
      invalidEvents: invalidEvents.slice(0, 100),
      hasMoreInvalidEvents: invalidEvents.length > 100,
    };

    // Build response message
    const importMessage = isPartialImport
      ? `Imported ${successfullyImported.toLocaleString()} of ${totalSubmitted.toLocaleString()} events. ${failedValidation.toLocaleString()} event${failedValidation === 1 ? '' : 's'} failed validation.`
      : `Successfully imported all ${successfullyImported.toLocaleString()} events.`;

    // Return response with catalogue properties spread at top level for backward compatibility
    // Also include validationReport and partialImport metadata for clients that support it
    return NextResponse.json(
      {
        ...catalogue,
        validationReport,
        importMessage,
        partialImport: isPartialImport,
      },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Failed to create catalogue', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
