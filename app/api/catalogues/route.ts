import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { dbQueries, EVENT_OPTIONAL_RANGES, normalizeDepthType, optionalFieldInRange } from '@/lib/db';
import { AppError, Logger, formatErrorResponse } from '@/lib/errors';
import {
  CATALOGUE_LIST_CACHE_PREFIX,
  CATALOGUE_LIST_SCOPE,
  catalogueCache,
  generateCacheKey,
  getCacheGeneration,
} from '@/lib/cache';
import { applyRateLimit, readRateLimiter, apiRateLimiter } from '@/lib/rate-limiter';
import { requireEditor } from '@/lib/auth/middleware';
import { writeAuditLog } from '@/lib/audit';
import { createId } from '@/lib/id';
import {
  deletePendingUpload,
  getPendingUploadEvents,
  iteratePendingUploadEventBatches,
} from '@/lib/pending-uploads';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { normalizeMappedField, normalizeTimestamp, type ParseFileDecisions } from '@/lib/earthquake-utils';
import { isMappableTargetField, REQUIRED_EVENT_FIELDS } from '@/lib/field-definitions';
import {
  ALLOWED_DEPTH_TYPE,
  ALLOWED_EVALUATION_MODE,
  ALLOWED_EVALUATION_STATUS,
  ALLOWED_EVENT_TYPE,
  ALLOWED_EVENT_TYPE_CERTAINTY,
} from '@/lib/db';
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

    // The list is cached under the shared cache generation, taken BEFORE the read, so an
    // entry written by any instance is never served after a catalogue changes. Without a
    // generation (the shared counter is unreadable) the cache is neither read nor written.
    const generation = await getCacheGeneration(CATALOGUE_LIST_SCOPE);
    const cacheKey = generation === null
      ? null
      : generateCacheKey(CATALOGUE_LIST_CACHE_PREFIX, { all: true, generation });

    // Try to get from cache
    const cached = cacheKey ? catalogueCache.get(cacheKey) : undefined;
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
    if (cacheKey) catalogueCache.set(cacheKey, catalogues);

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

type InsertRow = Partial<import('@/lib/db').MergedEvent> & {
  id: string;
  catalogue_id: string;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  source_events: string;
};

/** lib/db refuses events for a catalogue that no longer exists or is being deleted. */
function isCatalogueNotWritable(error: unknown): boolean {
  return error instanceof AppError && error.code === 'CATALOGUE_NOT_WRITABLE';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRetryableBatchInsertError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  // The catalogue is gone or being deleted: retrying cannot succeed.
  if (isCatalogueNotWritable(error)) return false;

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

// Bin width of the longitude accumulator below, in degrees.
const LONGITUDE_BIN_DEG = 0.1;

/**
 * Streaming form of longitudeExtent(): the smallest [west, east] arc covering every
 * longitude added, with the RFC 7946 §5.2 crossing convention (west > east) that
 * db.updateCatalogueGeoBounds and the region search expect.
 */
class LongitudeArcAccumulator {
  private readonly bins = new Map<number, { min: number; max: number }>();

  add(longitude: number | null | undefined): void {
    if (typeof longitude !== 'number' || !Number.isFinite(longitude)) return;

    const key = Math.floor(longitude / LONGITUDE_BIN_DEG);
    const bin = this.bins.get(key);
    if (!bin) {
      this.bins.set(key, { min: longitude, max: longitude });
      return;
    }
    if (longitude < bin.min) bin.min = longitude;
    if (longitude > bin.max) bin.max = longitude;
  }

  /** null when no finite longitude was ever added (same as longitudeExtent([])). */
  extent(): { west: number; east: number } | null {
    if (this.bins.size === 0) return null;

    // forEach rather than for..of over the Map: the repo's tsconfig target predates
    // downlevelIteration, so a Map cannot be iterated or spread directly.
    const keys: number[] = [];
    this.bins.forEach((_span, key) => keys.push(key));
    keys.sort((a, b) => a - b);
    const spans = keys.map(key => this.bins.get(key)!);

    // Largest gap between consecutive occupied bins; ties keep the westernmost gap,
    // matching the scan order in lib/geo-bounds-utils.
    let largestGap = -Infinity;
    let gapWestIdx = -1;
    for (let i = 0; i < spans.length - 1; i++) {
      const gap = spans[i + 1].min - spans[i].max;
      if (gap > largestGap) {
        largestGap = gap;
        gapWestIdx = i;
      }
    }

    const first = spans[0];
    const last = spans[spans.length - 1];
    // Wrap gap: from the easternmost longitude, across the antimeridian, back to the
    // westernmost one.
    const wrapGap = first.min + 360 - last.max;
    if (wrapGap >= largestGap) {
      // No gap anywhere on the circle -> the data covers the whole globe.
      if (wrapGap <= 0) return { west: -180, east: 180 };
      // The largest gap straddles 180° -> the data does not cross it; min/max is tightest.
      return { west: first.min, east: last.max };
    }
    // The largest gap is interior -> the covering arc crosses the antimeridian.
    return { west: spans[gapWestIdx + 1].min, east: spans[gapWestIdx].max };
  }
}

/**
 * Optional numeric fields are advisory metadata: a value the DB validator would
 * reject (out of range, non-integer count, non-finite) is DROPPED from the row, not
 * allowed to fail the upload. The ranges are the DB's own (EVENT_OPTIONAL_RANGES), so
 * nothing this leaves in place can throw inside bulkInsertEvents and take the whole
 * catalogue down with it.
 */
function dropInvalidOptionalNumericFields(row: InsertRow): number {
  let dropped = 0;
  for (const [field] of EVENT_OPTIONAL_RANGES) {
    const raw = (row as any)[field];
    if (raw === undefined) continue;
    const value = safeParseNumber(raw);
    if (value === null || !optionalFieldInRange(field, value)) {
      delete (row as any)[field];
      if (raw !== null && raw !== '') dropped++;
    } else {
      (row as any)[field] = value;
    }
  }

  const minDistance = safeParseNumber((row as any).minimum_distance);
  const maxDistance = safeParseNumber((row as any).maximum_distance);
  if (minDistance !== null && maxDistance !== null && maxDistance < minDistance) {
    delete (row as any).minimum_distance;
    delete (row as any).maximum_distance;
    dropped++;
  }
  return dropped;
}

function dropInvalidOptionalEnumFields(row: InsertRow): void {
  const enumFields: Array<[string, Set<string>]> = [
    ['evaluation_status', ALLOWED_EVALUATION_STATUS],
    ['evaluation_mode', ALLOWED_EVALUATION_MODE],
    ['magnitude_evaluation_status', ALLOWED_EVALUATION_STATUS],
    ['magnitude_evaluation_mode', ALLOWED_EVALUATION_MODE],
    ['depth_type', ALLOWED_DEPTH_TYPE],
    ['event_type', ALLOWED_EVENT_TYPE],
    ['event_type_certainty', ALLOWED_EVENT_TYPE_CERTAINTY],
  ];

  for (const [field, allowed] of enumFields) {
    const value = (row as any)[field];
    if (value == null) continue;

    // Depth types keep their QuakeML spelling ('... broad-band P waveforms'); the BED
    // enumeration is case-sensitive, so lower-casing it would store an invalid value.
    if (field === 'depth_type') {
      const canonical = normalizeDepthType(value);
      if (canonical) (row as any)[field] = canonical;
      else delete (row as any)[field];
      continue;
    }

    const normalized = String(value).toLowerCase().trim();
    if (allowed.has(normalized)) {
      (row as any)[field] = normalized;
    } else {
      delete (row as any)[field];
    }
  }
}

// ── Explicit column mapping (contract C14) ──────────────────────────────────
//
// Every stored row starts from the parser's own event: aliases resolved, the file's
// date format applied, 0-360 longitudes wrapped and depths converted with the file's
// unit decision. The schema step only sends what the user changed, per file:
//   set:   target <- source column, re-read from the raw cell through
//          normalizeMappedField with that file's decisions (exactly as the parser would)
//   unset: targets the user chose not to map, removed from the row
// Copying raw cells over the parser's values is what used to store 800 m as 800 km,
// reject every 0-360 longitude and flip every ambiguous US date.

/**
 * Raw keys parsedEventToDbFields reads as fallbacks for a canonical field. Removing or
 * re-sourcing the field must take them too, or the fallback silently brings the old
 * value back.
 */
const FIELD_FALLBACK_KEYS: Record<string, string[]> = {
  id: ['eventId'],
  event_public_id: ['publicID'],
  event_type: ['eventType'],
  magnitude_type: ['magnitudeType'],
  azimuthal_gap: ['azimuthalGap'],
  used_phase_count: ['usedPhaseCount'],
  used_station_count: ['usedStationCount'],
  confidence_level: ['confidenceLevel'],
};

const mappingTargetSchema = z.string().min(1).max(64).refine(isMappableTargetField, {
  message: 'is not a field a column can be mapped to',
});

const fileMappingSchema = z.object({
  set: z.record(mappingTargetSchema, z.string().min(1).max(256)).default({}),
  unset: z.array(mappingTargetSchema).max(100).default([]),
}).superRefine((mapping, ctx) => {
  for (const target of mapping.unset) {
    if (REQUIRED_EVENT_FIELDS.includes(target) && !(target in mapping.set)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${target} is required and cannot be left unmapped` });
    }
  }
});

// Only the two decisions normalizeMappedField reads are kept; the rest of the parser's
// decision record is informational.
const fileDecisionsSchema = z.object({
  dateFormat: z.enum(['US', 'International', 'ISO']).optional(),
  depthUnit: z.enum(['km', 'm']).optional(),
});

/** One uploaded file, in upload order: its pending token and the rows it must hold. */
const pendingUploadEntrySchema = z.object({
  id: z.string().trim().min(1).max(128),
  expectedCount: z.number().int().min(1).max(50_000_000),
  fileName: z.string().max(512).optional(),
  format: z.string().max(32).optional(),
  mapping: fileMappingSchema.optional(),
  fileDecisions: fileDecisionsSchema.optional(),
});

const pendingUploadManifestSchema = z.array(pendingUploadEntrySchema).min(1).max(50);

type FileMapping = z.infer<typeof fileMappingSchema>;

interface PendingUploadEntry {
  id: string;
  /** Rows the upload response reported for this file; absent only for legacy id lists. */
  expectedCount?: number;
  fileName?: string;
  format?: string;
  mapping?: FileMapping;
  fileDecisions?: ParseFileDecisions;
}

function numberOrNull(value: unknown): number | null {
  const num = safeParseNumber(value);
  return num !== null && Number.isFinite(num) ? num : null;
}

function sameMagnitude(
  a: { value: number | null; type?: unknown },
  b: { value: number | null; type?: unknown },
): boolean {
  return a.value !== null && b.value !== null && Math.abs(a.value - b.value) < 1e-9 &&
    String(a.type ?? '').toLowerCase() === String(b.type ?? '').toLowerCase();
}

/**
 * After an explicit change of the event magnitude, keep every value the file reported:
 * the parser's selection becomes an alternative in `magnitudes`, and an alternative
 * equal to the new selection is removed.
 */
function reconcileMagnitudeAlternatives(
  event: Record<string, unknown>,
  previous: { value: number | null; type?: unknown },
): void {
  const selected = { value: numberOrNull(event.magnitude), type: event.magnitude_type };
  let alternatives: Array<{ type?: unknown; mag?: { value?: unknown } }> = [];
  const stored = event.magnitudes;
  try {
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (Array.isArray(parsed)) alternatives = parsed;
  } catch {
    alternatives = [];
  }

  const asMagnitude = (entry: { type?: unknown; mag?: { value?: unknown } }) =>
    ({ value: numberOrNull(entry?.mag?.value), type: entry?.type });
  alternatives = alternatives.filter(entry => !sameMagnitude(asMagnitude(entry), selected));
  if (previous.value !== null && !sameMagnitude(previous, selected) &&
      !alternatives.some(entry => sameMagnitude(asMagnitude(entry), previous))) {
    alternatives.push({
      ...(typeof previous.type === 'string' && previous.type ? { type: previous.type } : {}),
      mag: { value: previous.value },
    });
  }

  if (alternatives.length > 0) event.magnitudes = JSON.stringify(alternatives);
  else delete event.magnitudes;
}

/**
 * The parser's event with the user's explicit changes applied (see the block comment
 * above). QuakeML rows carry the standard structure and are never re-mapped.
 */
function applyExplicitMapping(
  pendingEvent: ParsedEvent,
  mapping: FileMapping | undefined,
  decisions: ParseFileDecisions | undefined,
): Record<string, unknown> {
  const event: Record<string, unknown> = { ...pendingEvent };
  if (!mapping || pendingEvent.quakeml) return event;

  const removeField = (target: string) => {
    delete event[target];
    for (const key of FIELD_FALLBACK_KEYS[target] ?? []) delete event[key];
  };

  for (const target of mapping.unset) removeField(target);

  const previousMagnitude = { value: numberOrNull(pendingEvent.magnitude), type: pendingEvent.magnitude_type };
  let magnitudeTypeFromColumn: unknown;
  for (const [target, sourceColumn] of Object.entries(mapping.set)) {
    const { value, derived } = normalizeMappedField(target, pendingEvent[sourceColumn], decisions, sourceColumn);
    removeField(target);
    if (value !== null && value !== undefined) event[target] = value;
    if (target === 'magnitude') magnitudeTypeFromColumn = derived.magnitude_type;
  }

  if ('magnitude' in mapping.set) {
    // A scale-named column (mb, Ms, ML ...) states its own scale. Otherwise the type is
    // whatever the user mapped to magnitude_type; the parser's type described the
    // magnitude it had chosen, not this one, so it is not kept.
    if (magnitudeTypeFromColumn) {
      removeField('magnitude_type');
      event.magnitude_type = magnitudeTypeFromColumn;
    } else if (!('magnitude_type' in mapping.set)) {
      removeField('magnitude_type');
    }
    reconcileMagnitudeAlternatives(event, previousMagnitude);
  }

  return event;
}

/**
 * Checks and normalises the fields every stored event needs. Mutates `event.time` to
 * UTC ISO and `event.depth` to a number or nothing. Depth is optional: a value outside
 * the accepted -5..1000 km is dropped, never reinterpreted — the unit of a column is
 * decided once per file by the parser, not guessed per value here.
 */
function validateCatalogueEvent(event: any): string[] {
  const errors: string[] = [];

  if (!event.time || (typeof event.time === 'string' && event.time.trim() === '')) {
    errors.push('time is required');
  } else {
    const normalizedTime = normalizeTimestamp(event.time);
    if (!normalizedTime) {
      errors.push('time is not a valid timestamp');
    } else {
      // Same window the schema and the DB enforce; a row outside it is skipped here
      // with a reason instead of throwing inside the bulk insert.
      const instant = Date.parse(normalizedTime);
      if (instant < Date.UTC(1000, 0, 1) || instant > Date.now()) {
        errors.push(`time ${normalizedTime} is outside the accepted range (1000-01-01 to now)`);
      }
      event.time = normalizedTime;
    }
  }

  const latitude = safeParseNumber(event.latitude);
  const longitude = safeParseNumber(event.longitude);
  const magnitude = safeParseNumber(event.magnitude);

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

  if (event.depth !== undefined && event.depth !== null && event.depth !== '') {
    const depth = safeParseNumber(event.depth);
    event.depth = depth !== null && depth >= -5 && depth <= 1000 ? depth : undefined;
  }

  return errors;
}

/**
 * The lineage an imported event already carries (a re-imported export of this platform:
 * the source_events JSON of a merged or uploaded catalogue), or null when there is none
 * or it is not a list of source entries. Keeping it preserves where each event came from
 * instead of replacing it with a bare 'upload' entry.
 */
function importedLineage(value: unknown): string | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  if (!parsed.every(entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry))) return null;
  return JSON.stringify(parsed);
}

/**
 * The stored row for one validated event. `quakeml` is the event's full QuakeML
 * structure, when it came from a QuakeML file. `supplement` is the pending event an
 * inline row was joined to: the row's own values win and the parser's extended fields
 * fill the rest. Rows built from the pending store pass no supplement, so a field the
 * user unmapped stays removed.
 */
function buildInsertRow(
  event: any,
  catalogueId: string,
  options: { quakeml?: ParsedEvent['quakeml']; supplement?: ParsedEvent } = {},
): InsertRow {
  const latitude = safeParseNumber(event.latitude)!;
  const longitude = safeParseNumber(event.longitude)!;
  const magnitude = safeParseNumber(event.magnitude)!;
  const depth = safeParseNumber(event.depth);

  const row: InsertRow = {
    id: createId(),
    catalogue_id: catalogueId,
    time: event.time,
    latitude,
    longitude,
    magnitude,
    source_events: importedLineage(event.source_events) ??
      JSON.stringify([{ source: 'upload', eventId: event.id || event.eventId }]),
    depth: depth !== null && depth >= -5 && depth <= 1000 ? depth : undefined,
  };

  if (options.quakeml) {
    Object.assign(row, quakemlEventToDbFields(options.quakeml));
  } else {
    const source = options.supplement ? { ...options.supplement, ...event } : event;
    Object.assign(row, parsedEventToDbFields(source as ParsedEvent));
  }

  dropInvalidOptionalNumericFields(row);
  dropInvalidOptionalEnumFields(row);

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
): Promise<number> {
  let attempt = 0;
  while (true) {
    try {
      return await db.bulkInsertEvents(batch as Parameters<typeof db.bulkInsertEvents>[0]);
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
  submittedSoFar = 0,
): Promise<number> {
  const batches = chunkInsertRows(rows);
  let inserted = 0;
  let submitted = 0;

  for (let i = 0; i < batches.length; i += EVENT_INSERT_MAX_PARALLEL_BATCHES) {
    const window = batches.slice(i, i + EVENT_INSERT_MAX_PARALLEL_BATCHES);
    // Sum what MongoDB actually wrote, not what was handed to it: bulkInsertEvents
    // drops rows repeating a source_id within the batch and skips rows that collide
    // with the (catalogue_id, source_id) unique index. Counting submitted rows made
    // every deduplicated row a phantom event in the catalogue's event_count.
    // `submitted` stays a row offset so the retry log still points at the input.
    // A rejected batch must not start cleanup while a sibling can still commit.
    const results = await Promise.allSettled(window.map((batch, offset) =>
      insertBatchWithRetry(db, catalogueId, batch, submittedSoFar + submitted + offset * EVENT_INSERT_BATCH_SIZE)
    ));
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      inserted += result.value;
    }
    submitted += window.reduce((sum, batch) => sum + batch.length, 0);
  }

  return inserted;
}

// ── Import accounting ──────────────────────────────────────────────────────

/**
 * Running account of one import. Rows repeating a source_id within the upload are
 * skipped here, first occurrence kept, exactly as bulkInsertEvents would drop them, so
 * the counts are known BEFORE anything is written and the catalogue document can be
 * created with the numbers that will actually be stored.
 */
class ImportTally {
  totalSubmitted = 0;
  validEvents = 0;
  failedValidation = 0;
  duplicatesSkipped = 0;
  readonly invalidEvents: { index: number; reason: string; file?: string }[] = [];
  minLat: number | undefined;
  maxLat: number | undefined;
  readonly longitudeArc = new LongitudeArcAccumulator();
  private readonly seenSourceIds = new Set<string>();

  /** Validates and builds the row for one event; null when it is rejected or a duplicate. */
  accept(event: any, build: () => InsertRow, file?: string): InsertRow | null {
    const index = this.totalSubmitted;
    this.totalSubmitted += 1;

    const errors = validateCatalogueEvent(event);
    if (errors.length > 0) {
      this.failedValidation += 1;
      if (this.invalidEvents.length < 100) {
        this.invalidEvents.push({ index, reason: errors.join('; '), ...(file ? { file } : {}) });
      }
      return null;
    }

    const row = build();
    if (row.source_id) {
      if (this.seenSourceIds.has(row.source_id)) {
        this.duplicatesSkipped += 1;
        return null;
      }
      this.seenSourceIds.add(row.source_id);
    }

    this.validEvents += 1;
    if (this.minLat === undefined || row.latitude < this.minLat) this.minLat = row.latitude;
    if (this.maxLat === undefined || row.latitude > this.maxLat) this.maxLat = row.latitude;
    this.longitudeArc.add(row.longitude);
    return row;
  }

  /** Rows that will be stored: validated and not repeating an earlier source_id. */
  get expectedStored(): number {
    return this.validEvents;
  }

  report(successfullyImported: number) {
    const duplicatesSkipped = this.duplicatesSkipped + Math.max(0, this.validEvents - successfullyImported);
    const partialImport = this.failedValidation > 0 || duplicatesSkipped > 0;
    return {
      totalSubmitted: this.totalSubmitted,
      successfullyImported,
      failedValidation: this.failedValidation,
      duplicatesSkipped,
      successRate: this.totalSubmitted > 0
        ? Math.round((successfullyImported / this.totalSubmitted) * 10000) / 100
        : 0,
      partialImport,
    };
  }
}

type ImportReport = ReturnType<ImportTally['report']>;

function importMessageFor(report: ImportReport): string {
  if (!report.partialImport) {
    return `Successfully imported all ${report.successfullyImported.toLocaleString()} events.`;
  }
  return [
    `Imported ${report.successfullyImported.toLocaleString()} of ${report.totalSubmitted.toLocaleString()} events.`,
    report.failedValidation > 0
      ? `${report.failedValidation.toLocaleString()} event${report.failedValidation === 1 ? '' : 's'} failed validation.`
      : '',
    report.duplicatesSkipped > 0
      ? `${report.duplicatesSkipped.toLocaleString()} duplicate event${report.duplicatesSkipped === 1 ? '' : 's'} skipped.`
      : '',
  ].filter(Boolean).join(' ');
}

// ── Catalogue metadata ─────────────────────────────────────────────────────

/** Provenance is recorded by the server from the session, never taken from the body. */
const SERVER_OWNED_METADATA_FIELDS = ['created_by', 'modified_by', 'modified_at'];

function parseClientValidationSummary(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * The stored validation summary. The browser's parse-stage summary (per file, per
 * category) is kept as detail under `parse`; the headline counts are the server's own
 * reconciled import numbers, so the summary can never claim more valid events than the
 * catalogue holds.
 */
function buildStoredValidationSummary(clientSummary: Record<string, unknown> | null, report: ImportReport): string {
  const parseCount = (key: string): number | undefined => {
    const value = clientSummary?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  const parseInvalid = parseCount('invalidEvents') ?? 0;
  return JSON.stringify({
    ...(clientSummary ?? {}),
    generatedAt: new Date().toISOString(),
    totalEvents: parseCount('totalEvents') ?? report.totalSubmitted,
    validEvents: report.successfullyImported,
    invalidEvents: parseInvalid + report.failedValidation,
    duplicatesSkipped: report.duplicatesSkipped,
    parse: clientSummary
      ? { totalEvents: parseCount('totalEvents'), validEvents: parseCount('validEvents'), invalidEvents: parseCount('invalidEvents') }
      : null,
    import: report,
  });
}

/**
 * The client's catalogue metadata without provenance (the creator is passed to
 * insertCatalogue separately, from the session) and with the validation summary
 * replaced by the reconciled one.
 */
function buildCatalogueMetadata(metadata: unknown, report: ImportReport): Record<string, unknown> {
  const clientMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
  for (const field of SERVER_OWNED_METADATA_FIELDS) delete clientMetadata[field];
  const clientSummary = parseClientValidationSummary(clientMetadata.validation_summary);
  return {
    ...clientMetadata,
    validation_summary: buildStoredValidationSummary(clientSummary, report),
  };
}

/** Upload provenance kept in merge_config (no pending tokens: they are credentials). */
function buildUploadMergeConfig(entries: PendingUploadEntry[], report: ImportReport): string {
  return JSON.stringify({
    uploadDate: new Date().toISOString(),
    source: 'upload',
    ...(entries.length > 0
      ? {
          files: entries.map(entry => ({
            ...(entry.fileName ? { fileName: entry.fileName } : {}),
            ...(entry.format ? { format: entry.format } : {}),
            ...(entry.expectedCount !== undefined ? { eventCount: entry.expectedCount } : {}),
            ...(entry.mapping && (Object.keys(entry.mapping.set).length > 0 || entry.mapping.unset.length > 0)
              ? { fieldMapping: entry.mapping }
              : {}),
          })),
        }
      : {}),
    partialImport: report.partialImport,
    validationSummary: {
      totalSubmitted: report.totalSubmitted,
      successfullyImported: report.successfullyImported,
      failedValidation: report.failedValidation,
      duplicatesSkipped: report.duplicatesSkipped,
      successRate: report.successRate,
    },
  });
}

// ── Pending uploads ────────────────────────────────────────────────────────

/**
 * The pending uploads a request names, in file order. The upload page sends a manifest
 * (`pendingUploads`) giving each file's token and the number of rows its upload
 * reported, and optionally the user's explicit mapping and the file's decisions. The
 * older `pendingUploadIds` / `pendingUploadId` forms are still accepted, without counts.
 */
function resolvePendingUploadEntries(body: any): PendingUploadEntry[] {
  const { pendingUploads, pendingUploadId, pendingUploadIds } = body;

  if (pendingUploads !== undefined) {
    if (pendingUploadIds !== undefined || pendingUploadId !== undefined) {
      throw new AppError('Send either pendingUploads or pendingUploadIds, not both', 400, 'INVALID_PENDING_UPLOAD_IDS');
    }
    const parsed = pendingUploadManifestSchema.safeParse(pendingUploads);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AppError(
        `Invalid pendingUploads${issue?.path.length ? ` at ${issue.path.join('.')}` : ''}: ${issue?.message ?? 'invalid'}`,
        400,
        'INVALID_PENDING_UPLOADS',
      );
    }
    const entries: PendingUploadEntry[] = parsed.data;
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
      throw new AppError('Pending upload IDs must be distinct', 400, 'INVALID_PENDING_UPLOAD_IDS');
    }
    return entries;
  }

  if (
    (pendingUploadIds !== undefined && (!Array.isArray(pendingUploadIds) ||
      pendingUploadIds.some((id: unknown) => typeof id !== 'string' || !id.trim()))) ||
    (pendingUploadId !== undefined && (typeof pendingUploadId !== 'string' || !pendingUploadId.trim()))
  ) {
    throw new AppError('Pending upload IDs must be nonempty strings', 400, 'INVALID_PENDING_UPLOAD_IDS');
  }
  const ids: string[] = Array.isArray(pendingUploadIds)
    ? pendingUploadIds
    : typeof pendingUploadId === 'string'
      ? [pendingUploadId]
      : [];
  if (new Set(ids).size !== ids.length) {
    throw new AppError('Pending upload IDs must be distinct', 400, 'INVALID_PENDING_UPLOAD_IDS');
  }
  return ids.map(id => ({ id }));
}

const pendingNotFound = () =>
  new AppError('Pending upload not found or expired. Please upload the files again.', 404, 'PENDING_UPLOAD_NOT_FOUND');

const pendingMismatch = (detail: string) =>
  new AppError(`${detail} Please upload the files again.`, 409, 'PENDING_UPLOAD_MISMATCH');

/**
 * Streams every pending event of every file, in file order, through the explicit
 * mapping and the tally. With `onRows` it hands each batch of accepted rows over for
 * insertion; without, it is a dry run that only counts. Each file must hold exactly the
 * rows its upload reported; a token that is missing, expired or owned by another user
 * reads as not found.
 */
async function streamPendingUploads(
  entries: PendingUploadEntry[],
  ownerId: string,
  catalogueId: string,
  onRows?: (rows: InsertRow[]) => Promise<void>,
): Promise<ImportTally> {
  const tally = new ImportTally();

  for (const entry of entries) {
    let seq = 0;
    for await (const pendingBatch of iteratePendingUploadEventBatches(entry.id, 1000, ownerId)) {
      const rows: InsertRow[] = [];
      for (const pendingEvent of pendingBatch) {
        seq += 1;
        if (entry.expectedCount !== undefined && seq > entry.expectedCount) {
          throw pendingMismatch(`${entry.fileName ?? 'A file'} holds more events than its upload reported.`);
        }
        const event = applyExplicitMapping(pendingEvent, entry.mapping, entry.fileDecisions);
        const row = tally.accept(
          event,
          () => buildInsertRow(event, catalogueId, { quakeml: pendingEvent.quakeml }),
          entry.fileName,
        );
        if (row) rows.push(row);
      }
      if (onRows && rows.length > 0) await onRows(rows);
    }

    if (seq === 0) throw pendingNotFound();
    if (entry.expectedCount !== undefined && seq !== entry.expectedCount) {
      throw pendingMismatch(
        `${entry.fileName ?? 'A file'} holds ${seq.toLocaleString()} events but its upload reported ${entry.expectedCount.toLocaleString()}.`,
      );
    }
  }

  return tally;
}

function wrapLongitudeForComparison(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * True when an inline row and the pending event it is joined to describe the same
 * event (origin time to the millisecond, epicentre to 1e-6 degrees). A mismatch means
 * the rows and the files are out of step, and joining them would attach one file's
 * QuakeML identity and uncertainties to another file's rows.
 */
function isSameEvent(row: any, pendingEvent: ParsedEvent): boolean {
  const rowTime = typeof row?.time === 'string' || typeof row?.time === 'number' ? normalizeTimestamp(row.time) : null;
  const pendingTime = normalizeTimestamp(pendingEvent.time as string);
  if (!rowTime || !pendingTime || Date.parse(rowTime) !== Date.parse(pendingTime)) return false;
  const rowLat = safeParseNumber(row.latitude);
  const rowLon = safeParseNumber(row.longitude);
  const pendingLat = safeParseNumber(pendingEvent.latitude);
  const pendingLon = safeParseNumber(pendingEvent.longitude);
  if (rowLat === null || rowLon === null || pendingLat === null || pendingLon === null) return false;
  return Math.abs(rowLat - pendingLat) < 1e-6 &&
    Math.abs(wrapLongitudeForComparison(rowLon) - wrapLongitudeForComparison(pendingLon)) < 1e-6;
}

/**
 * Joins inline rows to the pending events of the files they came from, by (file, row
 * number within the file) — never by position in the concatenated request. Every file
 * must hold exactly its share of the rows, and each joined pair must be the same event.
 */
async function joinInlineRowsToPendingUploads(
  bodyEvents: any[],
  entries: PendingUploadEntry[],
  ownerId: string,
): Promise<Array<{ row: any; pendingEvent: ParsedEvent; file?: string }>> {
  const batches = await Promise.all(entries.map(entry => getPendingUploadEvents(entry.id, ownerId)));
  if (batches.some(batch => !batch || batch.length === 0)) throw pendingNotFound();

  const expected = entries.map((entry, i) => entry.expectedCount ?? batches[i]!.length);
  entries.forEach((entry, i) => {
    if (batches[i]!.length !== expected[i]) {
      throw pendingMismatch(
        `${entry.fileName ?? 'A file'} holds ${batches[i]!.length.toLocaleString()} events but ${expected[i].toLocaleString()} were declared.`,
      );
    }
  });
  if (expected.reduce((sum, n) => sum + n, 0) !== bodyEvents.length) {
    throw pendingMismatch('Pending upload events do not match the submitted rows.');
  }

  const joined: Array<{ row: any; pendingEvent: ParsedEvent; file?: string }> = [];
  let offset = 0;
  entries.forEach((entry, fileIndex) => {
    const pendingEvents = batches[fileIndex]!;
    for (let seq = 0; seq < pendingEvents.length; seq++) {
      const row = bodyEvents[offset + seq];
      if (!isSameEvent(row, pendingEvents[seq])) {
        throw pendingMismatch(
          `Row ${seq + 1} of ${entry.fileName ?? `file ${fileIndex + 1}`} does not match its uploaded event.`,
        );
      }
      joined.push({ row, pendingEvent: pendingEvents[seq], file: entry.fileName });
    }
    offset += pendingEvents.length;
  });
  return joined;
}

// ── Catalogue creation ─────────────────────────────────────────────────────

interface CreateCatalogueParams {
  request: NextRequest;
  user: { id: string; email?: string };
  trimmedName: string;
  metadata: unknown;
  entries: PendingUploadEntry[];
}

/** Deletes a catalogue whose import failed; marks it 'error' if even that fails. */
async function cleanUpFailedImport(
  db: NonNullable<typeof dbQueries>,
  catalogueId: string,
  insertedCount: number,
  error: unknown,
): Promise<void> {
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
}

function allEventsInvalidResponse(tally: ImportTally) {
  return NextResponse.json(
    {
      error: `All ${tally.failedValidation} event(s) failed validation. No events could be imported.`,
      code: 'ALL_EVENTS_INVALID',
      details: tally.invalidEvents,
      totalInvalid: tally.failedValidation,
      message: 'All events must have valid time, latitude (-90 to 90), longitude (-180 to 180), and magnitude (-3 to 10)',
    },
    { status: 400 }
  );
}

/**
 * Creates the catalogue document, runs `insertRows`, reconciles the stored count and
 * answers with the server's own report. The document is written before any event so an
 * import that dies part-way leaves a visible 'processing' catalogue, not orphan events.
 */
async function createCatalogue(
  params: CreateCatalogueParams,
  tally: ImportTally,
  insertRows: (db: NonNullable<typeof dbQueries>, catalogueId: string) => Promise<number>,
  catalogueId: string,
): Promise<NextResponse> {
  const { request, user, trimmedName, metadata, entries } = params;
  const db = dbQueries!;
  const startedAt = performance.now();
  const plannedReport = tally.report(tally.expectedStored);
  const lonExtent = tally.longitudeArc.extent();

  await db.insertCatalogue(
    catalogueId,
    trimmedName,
    JSON.stringify([{
      source: 'upload',
      description: plannedReport.partialImport ? 'Uploaded catalogue (partial import)' : 'Uploaded catalogue',
    }]),
    buildUploadMergeConfig(entries, plannedReport),
    tally.expectedStored,
    'processing',
    {
      ...buildCatalogueMetadata(metadata, plannedReport),
      min_latitude: tally.minLat,
      max_latitude: tally.maxLat,
      min_longitude: lonExtent?.west,
      max_longitude: lonExtent?.east,
    } as any,
    undefined,
    { createdBy: user.id },
  );

  let insertedCount = 0;
  try {
    insertedCount = await insertRows(db, catalogueId);
    // A retry may have committed rows before throwing, so the stored count is
    // authoritative, not what the insert calls returned.
    insertedCount = await db.countEventsByCatalogue(catalogueId);
    await db.updateCatalogueEventCount(catalogueId, insertedCount);
    if (tally.minLat !== undefined && tally.maxLat !== undefined && lonExtent) {
      await db.updateCatalogueGeoBounds(catalogueId, tally.minLat, tally.maxLat, lonExtent.west, lonExtent.east);
    }
    await db.updateCatalogueStatus('complete', catalogueId);
  } catch (error) {
    // A catalogue refused as deleted belongs to the request deleting it (which also
    // removes rows that raced in); cleaning up here could only undo its 'deleting' state.
    if (!isCatalogueNotWritable(error)) {
      await cleanUpFailedImport(db, catalogueId, insertedCount, error);
    }
    throw error;
  }

  // Clean up pending uploads now that the catalogue is saved — best-effort,
  // TTL will expire the documents automatically after 24 hours.
  for (const entry of entries) {
    deletePendingUpload(entry.id).catch(() => {/* TTL will clean up */});
  }

  const report = tally.report(insertedCount);
  if (insertedCount !== tally.expectedStored) {
    logger.warn('Stored event count differs from the planned import', {
      catalogueId,
      planned: tally.expectedStored,
      stored: insertedCount,
    });
  }

  logger.info('Catalogue created successfully', {
    catalogueId,
    name: trimmedName,
    eventCount: insertedCount,
    totalSubmitted: report.totalSubmitted,
    failedValidation: report.failedValidation,
    duplicatesSkipped: report.duplicatesSkipped,
    isPartialImport: report.partialImport,
    durationMs: Math.round(performance.now() - startedAt),
  });

  await writeAuditLog({
    action: 'catalogue.create',
    actor_id: user.id,
    actor_email: user.email,
    target_id: catalogueId,
    target_type: 'catalogue',
    metadata: {
      name: trimmedName,
      source: 'upload',
      files: entries.map(entry => entry.fileName ?? null),
      eventCount: insertedCount,
      totalSubmitted: report.totalSubmitted,
      failedValidation: report.failedValidation,
      duplicatesSkipped: report.duplicatesSkipped,
    },
  }, request);

  const catalogue = await db.getCatalogueById(catalogueId);
  const { partialImport, ...counts } = report;
  const validationReport = {
    ...counts,
    // Limit invalid events details to first 100 for performance
    invalidEvents: tally.invalidEvents,
    hasMoreInvalidEvents: tally.failedValidation > tally.invalidEvents.length,
  };

  // Return response with catalogue properties spread at top level for backward compatibility
  return NextResponse.json(
    {
      ...catalogue,
      validationReport,
      importMessage: importMessageFor(report),
      partialImport,
    },
    { status: 201 }
  );
}

/** The upload page's path: every event comes from the pending store (contract C15). */
async function createCatalogueFromPendingUploads(params: CreateCatalogueParams): Promise<NextResponse> {
  const { entries, user } = params;
  const catalogueId = createId();

  // Dry run first: validates every file's count and every row before anything is
  // written, and yields the exact numbers the catalogue document is created with.
  const plan = await streamPendingUploads(entries, user.id, catalogueId);
  if (plan.validEvents === 0) return allEventsInvalidResponse(plan);

  return createCatalogue(params, plan, async (db, id) => {
    let inserted = 0;
    let submitted = 0;
    const replay = await streamPendingUploads(entries, user.id, id, async rows => {
      inserted += await bulkInsertEventRows(db, id, rows, submitted);
      submitted += rows.length;
    });
    if (replay.validEvents !== plan.validEvents || replay.totalSubmitted !== plan.totalSubmitted) {
      throw pendingMismatch('The pending upload changed while the catalogue was being created.');
    }
    return inserted;
  }, catalogueId);
}

/**
 * API clients that post rows directly (optionally joined to pending uploads for the
 * extended QuakeML fields). The rows are all in memory, so they are validated and
 * counted before the catalogue document is written.
 */
async function createCatalogueFromInlineEvents(
  params: CreateCatalogueParams,
  bodyEvents: any[],
): Promise<NextResponse> {
  const { entries, user } = params;
  const catalogueId = createId();

  // Inline rows are already mapped by their sender; a per-file mapping only applies when
  // the catalogue is built from the pending uploads themselves.
  if (entries.some(entry => entry.mapping)) {
    throw new AppError(
      'pendingUploads[].mapping applies only when no events are sent inline',
      400,
      'INVALID_PENDING_UPLOADS',
    );
  }

  const joined = entries.length > 0
    ? await joinInlineRowsToPendingUploads(bodyEvents, entries, user.id)
    : bodyEvents.map(row => ({ row, pendingEvent: undefined as ParsedEvent | undefined, file: undefined }));

  const tally = new ImportTally();
  const rows: InsertRow[] = [];
  for (const { row, pendingEvent, file } of joined) {
    const event = row && typeof row === 'object' ? row : {};
    const accepted = tally.accept(
      event,
      () => buildInsertRow(event, catalogueId, { quakeml: pendingEvent?.quakeml, supplement: pendingEvent }),
      file,
    );
    if (accepted) rows.push(accepted);
  }

  if (tally.validEvents === 0) return allEventsInvalidResponse(tally);

  return createCatalogue(params, tally, (db, id) => bulkInsertEventRows(db, id, rows), catalogueId);
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 });
    }
    const { name, events: bodyEvents, metadata } = body;

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

    // The old form copied raw source cells onto the parser's normalised fields (lost
    // date formats, unwrapped 0-360 longitudes, metre depths). Explicit remaps now travel
    // per file in pendingUploads[].mapping and are normalised by the parser's rules.
    if (body.fieldMappings !== undefined) {
      return NextResponse.json(
        {
          error: 'fieldMappings is no longer supported; send each file\'s explicit mapping in pendingUploads[].mapping',
          code: 'LEGACY_FIELD_MAPPINGS',
        },
        { status: 400 }
      );
    }

    const entries = resolvePendingUploadEntries(body);

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized', code: 'DB_NOT_INITIALIZED' },
        { status: 500 }
      );
    }

    const params: CreateCatalogueParams = {
      request,
      user: { id: authResult.user.id, email: authResult.user.email },
      trimmedName,
      metadata,
      entries,
    };

    const hasInlineEvents = Array.isArray(bodyEvents) && bodyEvents.length > 0;
    if (!hasInlineEvents) {
      if (entries.length === 0) {
        return NextResponse.json(
          { error: 'Events array is required', code: 'INVALID_EVENTS' },
          { status: 400 }
        );
      }
      return await createCatalogueFromPendingUploads(params);
    }

    return await createCatalogueFromInlineEvents(params, bodyEvents);
  } catch (error) {
    logger.error('Failed to create catalogue', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
