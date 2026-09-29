/**
 * File parsers for different earthquake catalogue formats
 *
 * Performance Optimization: Includes streaming parsers for memory-efficient
 * processing of large files (100MB+) with constant memory usage.
 */

import {
  validateEvent,
  normalizeTimestamp,
  validateDepth,
  parseStrictNumber,
  wrapLongitude,
  lengthUnitFromColumnName,
  NUMERIC_EVENT_FIELDS,
  NON_NEGATIVE_EVENT_FIELDS,
  inferMagnitudeTypeFromColumn,
  type ParseFileDecisions,
} from './earthquake-utils';
import { summarizeValidationFailures, validateEventWithDetails, type FieldMappingTrace, type ValidationEventContext, type ValidationFailureDetail, type ValidationFailureReport } from './validation';
import { validateEventCrossFields } from './cross-field-validation';
import { parseQuakeMLEvent, createBareAmpersandEscaper } from './quakeml-parser';
import { quakemlEventToDbFields } from './quakeml-to-db';
import { normalizeRake } from './focal-mechanism-utils';
import * as sax from 'sax';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { Transform } from 'stream';
import { detectDelimiter, parseLine, parseWithDelimiter, stripHeaderCommentMarker, endsInsideQuotedField, isCommentLine, isHeaderLikeRecord, chooseCommentHeader, uniqueHeaderNames, type Delimiter } from './delimiter-detector';
import { stripSpreadsheetFormulaGuard } from './export-utils';
import { parseGeoJSON } from './geojson-parser';
import { decideFileDateFormat, type DateFormat, type FileDateFormatDecision } from './date-format-detector';
import { FIELD_ALIASES, resolveHeaderAlias } from './field-definitions';
import type { ParsedEvent } from '@/types/upload';
import type { QuakeMLEvent } from './types/quakeml';

// Re-export ParsedEvent for consumers of this module
export type { ParsedEvent } from '@/types/upload';
// The cell normaliser the upload mapping step uses for explicit remaps (contract C14).
// It lives in earthquake-utils because this module pulls in fs/sax, which the browser
// cannot load; it is re-exported here beside the parsers whose rules it shares.
export {
  normalizeMappedValue,
  normalizeMappedField,
  inferMagnitudeTypeFromColumn,
  type NormalizedMappedField,
  type ParseFileDecisions,
} from './earthquake-utils';

// Debug logger - only logs in development mode
const debugLog = (message: string) => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(message);
  }
};

export interface ParseResult {
  success: boolean;
  events: ParsedEvent[];
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
  detectedFields: string[];
  warningsTruncated?: boolean;
  validationReport?: ValidationFailureReport;
  /**
   * Canonical target field -> the source column/key the parser actually read it from
   * (the one used for most rows). CSV headers appear lower-cased, as the parser sees
   * them; values assembled from several columns list them joined with '+'
   * ('date+time', 'year+month+day+hour+minute+second'); GeoJSON geometry values are
   * 'geometry.coordinates[i]'; QuakeML values are BED paths ('event/origin/time/value').
   * Empty when nothing was parsed.
   */
  resolvedFieldSources: Record<string, string>;
  /** File-level decisions applied to every row (contract C14); empty when none applied. */
  fileDecisions: ParseFileDecisions;
}

const MAX_PARSE_WARNINGS = 200;
const LARGE_QUAKEML_STREAM_THRESHOLD = 5 * 1024 * 1024;
const STREAM_PARSE_EVENT_BATCH_SIZE = 500;

/** The result of a file that could not be read at all (empty, malformed, no events). */
function failedParseResult(
  message: string,
  accumulator: ValidationAccumulator,
  warnings: Array<{ line: number; message: string }> = []
): ParseResult {
  appendParserFailure(accumulator, { line: 0 }, message);
  return {
    success: false,
    events: [],
    errors: [{ line: 0, message }],
    warnings,
    detectedFields: [],
    validationReport: summarizeValidationFailures(accumulator.failures, {
      totalEvents: 0,
      validEvents: 0,
      invalidEvents: 0,
    }),
    resolvedFieldSources: {},
    fileDecisions: {},
  };
}

/**
 * Counts which source column supplied each canonical field, across a file's rows, so
 * the parse result can report the column the parser actually used (contract C14).
 */
class FieldSourceTally {
  private counts = new Map<string, Map<string, number>>();
  // Rows of a file almost always map alike: a report equal to the previous one is only
  // counted, and folded into `counts` when a different one arrives.
  private pending: FieldMappingTrace[] | null = null;
  private pendingRows = 0;

  add(report: FieldMappingTrace[] | undefined): void {
    if (!report) return;
    const pending = this.pending;
    if (pending && pending.length === report.length &&
        pending.every((entry, i) => entry.targetField === report[i].targetField && entry.sourceField === report[i].sourceField)) {
      this.pendingRows += 1;
      return;
    }
    this.flush();
    this.pending = report;
    this.pendingRows = 1;
  }

  private flush(): void {
    if (!this.pending) return;
    for (const { targetField, sourceField } of this.pending) {
      let bySource = this.counts.get(targetField);
      if (!bySource) this.counts.set(targetField, (bySource = new Map()));
      bySource.set(sourceField, (bySource.get(sourceField) ?? 0) + this.pendingRows);
    }
    this.pending = null;
    this.pendingRows = 0;
  }

  /** The most-used source per field; the first seen wins a tie. */
  resolve(): Record<string, string> {
    this.flush();
    const out: Record<string, string> = {};
    this.counts.forEach((bySource, targetField) => {
      let best: string | null = null;
      let bestCount = 0;
      bySource.forEach((count, source) => {
        if (count > bestCount) { best = source; bestCount = count; }
      });
      if (best !== null) out[targetField] = best;
    });
    return out;
  }
}

/** Per-file counts behind the file-level warnings and fileDecisions. */
interface RowAdjustmentCounts {
  wrappedLongitudes: number;
  outOfRangeDepths: number;
  firstOutOfRangeDepth: { line: number; value: unknown } | null;
  /** The depth column as a whole looks negative-downward (see looksNegativeDownward). */
  negativeDownLikely: boolean;
  sentinelValues: number;
  /** Origin times with a date but no time of day (stored at 00:00:00 UTC). */
  dateOnlyTimes: number;
}

const createRowAdjustmentCounts = (): RowAdjustmentCounts => ({
  wrappedLongitudes: 0,
  outOfRangeDepths: 0,
  firstOutOfRangeDepth: null,
  negativeDownLikely: false,
  sentinelValues: 0,
  dateOnlyTimes: 0,
});

/**
 * One warning per file for the values that were set aside, so a catalogue that loses
 * depths or uncertainties says so at the top of the report and not only per row.
 */
function appendRowAdjustmentWarnings(
  counts: RowAdjustmentCounts,
  warnings: Array<{ line: number; message: string }>
): void {
  if (counts.outOfRangeDepths > 0) {
    const first = counts.firstOutOfRangeDepth;
    let message =
      `${counts.outOfRangeDepths} depth value(s) outside -5 to 1000 km were set to unknown; the events were kept` +
      (first ? ` (first on line ${first.line}: ${String(first.value)})` : '') + '.';
    if (counts.negativeDownLikely) {
      message += ' Most depths in the file are negative: if it reports depth as negative downward ' +
        '(elevation), negate the depth column and upload it again.';
    }
    warnings.push({ line: 0, message });
  }
  if (counts.dateOnlyTimes > 0) {
    warnings.push({
      line: 0,
      message: `${counts.dateOnlyTimes} origin time(s) have a date but no time of day and were stored at ` +
        '00:00:00 UTC. If the file has a time-of-day column, map it to the time field.',
    });
  }
  if (counts.sentinelValues > 0) {
    warnings.push({
      line: 0,
      message: `${counts.sentinelValues} negative value(s) in columns that cannot be negative ` +
        '(uncertainties, counts, gap, distances) were read as "not determined" sentinels and left empty.',
    });
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function serializeOpenTag(node: any): string {
  let out = `<${node.name}`;
  for (const [key, val] of Object.entries(node.attributes || {})) {
    out += ` ${key}="${escapeXml(String(val))}"`;
  }
  out += '>';
  return out;
}

function isEventTagName(tagName: string): boolean {
  return tagName === 'event' || tagName.endsWith(':event');
}

function stripQuakeML(event: ParsedEvent): ParsedEvent {
  const { quakeml: _quakeml, ...rest } = event;
  return rest as ParsedEvent;
}

/**
 * A bare '&' (not the start of an entity or character reference) is the one
 * well-formedness error real bulletins commonly carry ("Cook Strait & Marlborough");
 * escape it so the strict parser can read the file. Every other error still fails
 * the document, as the regex path's tolerance of those is what let ghost events in.
 * CDATA sections and comments are literal text and keep their ampersands. The file
 * stream path (parseQuakeMLFileStream) runs the same escaper chunk by chunk.
 */
function escapeBareAmpersands(content: string): string {
  if (content.indexOf('&') === -1) return content;
  const escaper = createBareAmpersandEscaper();
  return escaper.push(content) + escaper.flush();
}

function extractQuakeMLEventsWithSax(rawContent: string): string[] {
  const content = escapeBareAmpersands(rawContent);
  const parser = sax.parser(true, { trim: false, normalize: false });
  const events: string[] = [];

  let insideEvent = false;
  let eventDepth = 0;
  let currentEventXML = '';

  parser.onopentag = (node: any) => {
    if (isEventTagName(node.name)) {
      insideEvent = true;
      eventDepth = 1;
      currentEventXML = serializeOpenTag(node);
      return;
    }

    if (!insideEvent) return;
    eventDepth += 1;
    currentEventXML += serializeOpenTag(node);
  };

  parser.ontext = (text: string) => {
    if (insideEvent && text.length > 0) {
      currentEventXML += escapeXml(text);
    }
  };

  parser.oncdata = (text: string) => {
    if (insideEvent) {
      currentEventXML += `<![CDATA[${text}]]>`;
    }
  };

  parser.onclosetag = (tagName: string) => {
    if (!insideEvent) return;
    currentEventXML += `</${tagName}>`;
    eventDepth -= 1;
    if (eventDepth === 0) {
      events.push(currentEventXML);
      currentEventXML = '';
      insideEvent = false;
    }
  };

  parser.onerror = (err: Error) => {
    throw err;
  };

  const chunkSize = 64 * 1024;
  for (let i = 0; i < content.length; i += chunkSize) {
    parser.write(content.slice(i, i + chunkSize));
  }
  parser.close();

  return events;
}

interface ValidationAccumulator {
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  failures: ValidationFailureDetail[];
}

const createValidationAccumulator = (): ValidationAccumulator => ({
  totalEvents: 0,
  validEvents: 0,
  invalidEvents: 0,
  failures: [],
});

const buildFailureDetail = (
  context: ValidationEventContext,
  detail: Omit<ValidationFailureDetail, 'line' | 'eventIndex' | 'eventId'>
): ValidationFailureDetail => ({
  line: context.line,
  eventIndex: context.eventIndex,
  eventId: context.eventId ?? null,
  ...detail,
});

const appendParserFailure = (
  accumulator: ValidationAccumulator,
  context: ValidationEventContext,
  message: string
) => {
  accumulator.failures.push(
    buildFailureDetail(context, {
      message,
      category: 'parser',
      severity: 'error',
    })
  );
};

const appendCrossFieldFailures = (
  accumulator: ValidationAccumulator,
  event: ParsedEvent,
  context: ValidationEventContext
) => {
  const crossField = validateEventCrossFields(event, context.eventIndex);
  crossField.checks.forEach(check => {
    accumulator.failures.push(
      buildFailureDetail(context, {
        field: check.field,
        value: check.field ? (event as any)[check.field] : undefined,
        expected: check.suggestion,
        message: check.message,
        category: 'cross_field',
        severity: check.severity,
      })
    );
  });
};

function parsedEventFromQuakeMLEvent(
  quakemlEvent: QuakeMLEvent,
  index: number,
  detectedFields: Set<string>,
  validationAccumulator: ValidationAccumulator,
  adjustments: RowAdjustmentCounts = createRowAdjustmentCounts()
): { event?: ParsedEvent; error?: { line: number; message: string }; warnings: string[] } {
  const warnings: string[] = [];

  // The 0-360 longitude convention is read the same way as on the CSV/JSON path, on
  // every origin, so the stored origins blob and the scalar longitude agree and an
  // antimeridian event (Kermadec 182.7) is kept whatever format it arrived in.
  let wrapped = false;
  for (const candidate of quakemlEvent.origins ?? []) {
    const lon = candidate.longitude?.value;
    if (typeof lon === 'number' && wrapLongitude(lon) !== lon) {
      candidate.longitude.value = wrapLongitude(lon);
      wrapped = true;
    }
  }
  if (wrapped) adjustments.wrappedLongitudes += 1;

  // Use preferred origin or first origin
  let origin = quakemlEvent.origins?.[0];
  if (quakemlEvent.preferredOriginID && quakemlEvent.origins) {
    const preferred = quakemlEvent.origins.find(o => o.publicID === quakemlEvent.preferredOriginID);
    if (preferred) origin = preferred;
  }

  // Use preferred magnitude or first magnitude
  let magnitude = quakemlEvent.magnitudes?.[0];
  if (quakemlEvent.preferredMagnitudeID && quakemlEvent.magnitudes) {
    const preferred = quakemlEvent.magnitudes.find(m => m.publicID === quakemlEvent.preferredMagnitudeID);
    if (preferred) magnitude = preferred;
  }

  if (!origin || !magnitude) {
    validationAccumulator.invalidEvents += 1;
    const message = 'Event missing required origin or magnitude';
    appendParserFailure(validationAccumulator, { line: index, eventIndex: index - 1 }, message);
    return { error: { line: index, message }, warnings };
  }

  // QuakeML BED depth is in metres. A depth outside -5..1000 km is set to unknown and
  // the event kept, exactly as on the CSV/JSON path (it used to reject the event here
  // and keep it there).
  const depthKm = origin.depth ? origin.depth.value / 1000 : undefined;
  const depthOutOfRange = depthKm !== undefined && !validateDepth(depthKm);
  const event: ParsedEvent = {
    // Stored as the UTC instant: the checks that follow read the time with new Date(),
    // which takes a zone-less xs:dateTime as server-local time.
    time: normalizeTimestamp(origin.time.value) ?? origin.time.value,
    latitude: origin.latitude.value,
    longitude: origin.longitude.value,
    depth: depthOutOfRange ? null : depthKm,
    magnitude: magnitude.mag.value,
    quakeml: quakemlEvent
  };

  const flattenedFields = quakemlEventToDbFields(quakemlEvent) as Record<string, unknown>;
  for (const [key, value] of Object.entries(flattenedFields)) {
    if (value === undefined || value === null) continue;
    (event as any)[key] = value;
  }

  if (magnitude.type) {
    event.magnitudeType = magnitude.type;
    detectedFields.add('magnitudeType');
  }

  if (quakemlEvent.description && quakemlEvent.description.length > 0) {
    event.region = quakemlEvent.description[0].text;
    detectedFields.add('region');
  }

  if (quakemlEvent.publicID) {
    event.eventId = quakemlEvent.publicID;
    detectedFields.add('eventId');
  }

  if ((event as any).magnitude_type && !event.magnitudeType) {
    event.magnitudeType = String((event as any).magnitude_type);
  }
  if ((event as any).event_public_id && !event.eventId) {
    event.eventId = String((event as any).event_public_id);
  }

  for (const key of Object.keys(event)) {
    if (key === 'quakeml') continue;
    detectedFields.add(key);
  }

  const context: ValidationEventContext = {
    line: index,
    eventIndex: index - 1,
    eventId: (event.eventId || event.id || null) as string | null,
    rawEvent: event,
  };
  const validation = validateEventWithDetails(event, context);
  if (!validation.valid) {
    const errorMessages = validation.failures
      .filter(failure => failure.severity === 'error')
      .map(failure => failure.message);
    const message = errorMessages.join('; ');
    validationAccumulator.invalidEvents += 1;
    validationAccumulator.failures.push(...validation.failures);
    return { error: { line: index, message }, warnings };
  }

  if (!origin.depth) warnings.push('Event missing depth information');
  if (!origin.quality) warnings.push('Event missing origin quality metrics');

  validationAccumulator.validEvents += 1;
  validationAccumulator.failures.push(...validation.failures);
  if (depthOutOfRange && depthKm !== undefined) {
    const rawDepth = `${origin.depth?.value} m`;
    validationAccumulator.failures.push(outOfRangeDepthFailure(context, depthKm, rawDepth));
    countOutOfRangeDepth(adjustments, index, rawDepth);
  }
  appendCrossFieldFailures(validationAccumulator, event, context);

  return { event, warnings };
}

/**
 * The validation entry for a depth that was set to unknown because it lies outside
 * -5..1000 km. The validator only sees the nulled depth, and on the CSV/JSON path it
 * reported a numeric -12 as 'Depth must be a number'.
 */
function outOfRangeDepthFailure(context: ValidationEventContext, depthKm: number, rawValue: unknown): ValidationFailureDetail {
  return buildFailureDetail(context, {
    field: 'depth',
    value: rawValue,
    expected: 'Number between -5 and 1000 (km)',
    message: `Depth ${Number(depthKm.toPrecision(6))} km is outside -5 to 1000 km; the depth was set to unknown and the event kept`,
    category: 'out_of_range',
    severity: 'warning',
  });
}

function countOutOfRangeDepth(counts: RowAdjustmentCounts, line: number, rawValue: unknown): void {
  counts.outOfRangeDepths += 1;
  if (!counts.firstOutOfRangeDepth) counts.firstOutOfRangeDepth = { line, value: rawValue };
}

/**
 * Replace the validator's 'Depth must be a number' entry for a depth that WAS a number
 * but lay outside -5..1000 km with an accurate out-of-range entry.
 */
function withOutOfRangeDepthFailure(
  failures: ValidationFailureDetail[],
  outcome: DepthOutcome,
  context: ValidationEventContext
): ValidationFailureDetail[] {
  if (outcome.status !== 'out_of_range') return failures;
  return failures
    .filter((failure) => !(failure.field === 'depth' && failure.category === 'invalid_type'))
    .concat(outOfRangeDepthFailure(context, outcome.km, outcome.raw));
}

/**
 * Parse CSV/delimited text format earthquake catalogue
 * Supports multiple delimiters: comma, tab, semicolon, pipe, space
 * Auto-detects delimiter if not specified
 * Auto-detects date format (US vs International) if not specified
 */
export function parseCSV(content: string, delimiter?: Delimiter, dateFormat?: DateFormat): ParseResult {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const events: ParsedEvent[] = [];
  const validationAccumulator = createValidationAccumulator();

  if (!content || content.trim().length === 0) {
    return failedParseResult('File is empty', validationAccumulator);
  }

  // Auto-detect delimiter if not specified
  let actualDelimiter = delimiter;
  if (!actualDelimiter) {
    const detection = detectDelimiter(content);
    actualDelimiter = detection.delimiter;

    if (detection.confidence < 0.5) {
      warnings.push({
        line: 0,
        message: `Low confidence delimiter detection (${Math.round(detection.confidence * 100)}%). Detected: ${actualDelimiter === '\t' ? 'tab' : actualDelimiter}`
      });
    }
  }

  // Parse with detected/specified delimiter. An unterminated quoted field is a hard
  // error: silently absorbing the rest of the file into one cell would report success
  // while discarding most of the catalogue.
  let headers: string[];
  let writtenHeaders: string[];
  let rows: string[][];
  let dataStartLine: number;
  try {
    ({ headers, writtenHeaders, rows, dataStartLine } = parseWithDelimiter(content, actualDelimiter));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to tokenize delimited content';
    return failedParseResult(message, validationAccumulator, warnings);
  }
  const detectedFields = [...headers];

  if (headers.length === 0) {
    return failedParseResult('No headers found in file', validationAccumulator);
  }

  // Facts about the columns, worked out once for the file: the field each name maps to,
  // the magnitude scale it states (from the name as written: 'mB' is not 'mb'), and a
  // minutes column known by its place ('yyyy mm dd hh mm ss').
  const facts = new HeaderFacts(
    new Map(headers.map((header, i) => [header, writtenHeaders[i]])),
    positionalMinuteColumn(headers)
  );

  // Decide the day/month order ONCE for the whole file, from every cell of every column
  // that maps to the origin time (a separate date column included).
  const timeColumnIndices = timeSourceKeys(headers, facts).map((key) => headers.indexOf(key));
  const dateDecision = applyDateDecision(
    decideFileDateFormat(rows.flatMap((row) => timeColumnIndices.map((index) => row[index])), dateFormat),
    warnings
  );
  const actualDateFormat = dateDecision.dateFormat ?? dateFormat;
  const rowContext: RowContext = {
    facts,
    twoDigitYears: dateDecision.twoDigitYears === true,
    timeOfDayColumn: findTimeOfDayColumn(headers, facts, (key) => {
      const index = headers.indexOf(key);
      return rows.slice(0, 50).map((row) => row[index]);
    }),
  };

  // Decide the depth unit ONCE for the whole file (see inferDepthUnit)
  const depthColumn = findSourceKeyForTarget(headers, 'depth', facts);
  const depthColumnIndex = depthColumn === null ? -1 : headers.indexOf(depthColumn);
  const depthValues = depthColumnIndex < 0
    ? []
    : rows.reduce<number[]>((acc, row) => {
        const v = safeParseFloat(row[depthColumnIndex]);
        if (v !== null) acc.push(v);
        return acc;
      }, []);
  const depthUnit = inferDepthUnit(depthColumn, depthValues);
  if (depthUnit.divisor !== 1) {
    warnings.push({ line: 0, message: metresDepthWarning(depthUnit) });
  }
  const lengthDivisors = uncertaintyDivisors(headers, depthUnit, facts);

  // Decide the moment-tensor unit ONCE for the whole file (see inferMomentTensorScaleForFile).
  // headers are lower-cased above, so the column lookup is too.
  const momentTensorIndices = MOMENT_TENSOR_COMPONENT_KEYS.map((key) => headers.indexOf(key.toLowerCase()));
  const headerRow = Object.fromEntries(headers.map((h) => [h, '']));
  const scalarMomentIndex = scalarMomentKeysFor(headerRow).reduce<number>(
    (found, key) => (found >= 0 ? found : headers.indexOf(key.toLowerCase())),
    -1
  );
  const hasMomentTensorColumns = momentTensorIndices.some((index) => index >= 0);
  const momentTensorScale = !hasMomentTensorColumns
    ? MOMENT_TENSOR_SCALE_SI
    : inferMomentTensorScaleForFile(rows.length, (i) => ({
        components: momentTensorIndices.map((index) => (index < 0 ? null : safeParseFloat(rows[i][index]))),
        Mo: scalarMomentIndex < 0 ? null : safeParseFloat(rows[i][scalarMomentIndex]),
      }));

  const sources = new FieldSourceTally();
  const adjustments = createRowAdjustmentCounts();
  adjustments.negativeDownLikely = looksNegativeDownward(depthValues, depthUnit);

  // Parse data rows
  for (let i = 0; i < rows.length; i++) {
    const values = rows[i];
    // dataStartLine counts the header and any comment lines above it
    const lineNumber = dataStartLine + i;
    validationAccumulator.totalEvents += 1;

    if (values.length !== headers.length) {
      errors.push({
        line: lineNumber,
        message: `Column count mismatch: expected ${headers.length}, got ${values.length}`
      });
      validationAccumulator.invalidEvents += 1;
      appendParserFailure(validationAccumulator, { line: lineNumber, eventIndex: i }, `Column count mismatch: expected ${headers.length}, got ${values.length}`);
      continue;
    }

    try {
      const event: any = {};
      headers.forEach((header, index) => {
        event[header] = values[index];
      });

      // Map common field names with date format hint
      const { mappedEvent, depthOutcome } = mapTabularRow(
        event, actualDateFormat, true, momentTensorScale, adjustments, rowContext, depthUnit, lengthDivisors
      );
      const mappingReport = (mappedEvent as any)._mappingReport as FieldMappingTrace[] | undefined;
      sources.add(mappingReport);
      const context: ValidationEventContext = {
        line: lineNumber,
        eventIndex: i,
        eventId: (mappedEvent.eventId || mappedEvent.id || null) as string | null,
        rawEvent: event,
        mappingReport,
      };

      // Validate the event
      const validation = validateEventWithDetails(mappedEvent, context);
      const failures = withOutOfRangeDepthFailure(validation.failures, depthOutcome, context);
      if (!validation.valid) {
        const errorMessages = failures
          .filter(failure => failure.severity === 'error')
          .map(failure => failure.message);
        errors.push({
          line: lineNumber,
          message: errorMessages.join('; ')
        });
        validationAccumulator.invalidEvents += 1;
        validationAccumulator.failures.push(...failures);
        continue;
      }

      if (depthOutcome.status === 'out_of_range') countOutOfRangeDepth(adjustments, lineNumber, depthOutcome.raw);
      validationAccumulator.validEvents += 1;
      validationAccumulator.failures.push(...failures);
      appendCrossFieldFailures(validationAccumulator, mappedEvent, context);
      delete (mappedEvent as any)._mappingReport;
      events.push(mappedEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Parse error';
      errors.push({
        line: lineNumber,
        message
      });
      validationAccumulator.invalidEvents += 1;
      appendParserFailure(validationAccumulator, { line: lineNumber, eventIndex: i }, message);
    }
  }

  appendRowAdjustmentWarnings(adjustments, warnings);

  return {
    success: errors.length === 0,
    events,
    errors,
    warnings,
    detectedFields,
    validationReport: summarizeValidationFailures(validationAccumulator.failures, {
      totalEvents: validationAccumulator.totalEvents,
      validEvents: validationAccumulator.validEvents,
      invalidEvents: validationAccumulator.invalidEvents,
    }),
    resolvedFieldSources: sources.resolve(),
    fileDecisions: tabularFileDecisions(dateDecision, depthUnit, adjustments,
      hasMomentTensorColumns ? momentTensorScale : null),
  };
}
/**
 * Parse JSON format earthquake catalogue. Automatically detects and handles GeoJSON.
 */
export function parseJSON(content: string, dateFormat?: DateFormat): ParseResult {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const events: ParsedEvent[] = [];
  let detectedFields: string[] = [];
  const validationAccumulator = createValidationAccumulator();
  const sources = new FieldSourceTally();
  const adjustments = createRowAdjustmentCounts();
  let fileDecisions: ParseFileDecisions = {};

  try {
    const data = JSON.parse(content);

    // Check if this is GeoJSON format
    if (data.type === 'FeatureCollection' || data.type === 'Feature') {
      debugLog('[Parser] Detected GeoJSON format, using specialized parser');
      return parseGeoJSON(content, dateFormat);
    }

    // Handle different JSON structures
    let eventArray: any[] = [];

    if (Array.isArray(data)) {
      // Plain array of events
      eventArray = data;
    } else if (data.events && Array.isArray(data.events)) {
      // { events: [...] } structure
      eventArray = data.events;
    } else if (data.data && Array.isArray(data.data)) {
      // { data: [...] } structure (common export format)
      eventArray = data.data;
    } else if (data.features && Array.isArray(data.features)) {
      // GeoJSON-like format without type field - use GeoJSON parser
      debugLog('[Parser] Detected features array, attempting GeoJSON parsing');
      return parseGeoJSON(content, dateFormat);
    } else if (data.earthquakes && Array.isArray(data.earthquakes)) {
      // { earthquakes: [...] } structure
      eventArray = data.earthquakes;
    } else if (data.results && Array.isArray(data.results)) {
      // { results: [...] } structure (API response format)
      eventArray = data.results;
    } else {
      // Try to find any array property in the object
      const arrayProps = Object.keys(data).filter(key => Array.isArray(data[key]));
      if (arrayProps.length === 1) {
        // If there's exactly one array property, use it
        eventArray = data[arrayProps[0]];
        debugLog(`[Parser] Auto-detected array property: ${arrayProps[0]}`);
      } else if (arrayProps.length > 1) {
        return failedParseResult(
          `Multiple array properties found: ${arrayProps.join(', ')}. Please use one of: events, data, features, earthquakes, results`,
          validationAccumulator
        );
      } else {
        return failedParseResult(
          'Unrecognized JSON structure. Expected an array or object with events/data/features property',
          validationAccumulator
        );
      }
    }

    // This platform's own JSON export nests the core fields; read it flat (see
    // flattenExportedEventRecord) so an export re-imports.
    const records: any[] = eventArray.map(flattenExportedEventRecord);

    // Detect fields from first event
    if (records.length > 0 && isPlainRecord(records[0])) {
      detectedFields = Object.keys(records[0]);
    }

    // Facts about the keys, worked out once per key for this file (JSON keys keep their case).
    const facts = new HeaderFacts(undefined, positionalMinuteColumn(detectedFields));

    // Decide the day/month order ONCE for the whole file, as parseCSV does: parseJSON is
    // the path every JSON upload takes, and without this step each record's ambiguous
    // date was read on its own (DD/MM for some, MM/DD for others).
    const timeCells: unknown[] = [];
    for (const item of records) {
      if (!isPlainRecord(item)) continue;
      for (const key of facts.shapeOf(Object.keys(item)).timeKeys) timeCells.push(item[key]);
    }
    const dateDecision = applyDateDecision(decideFileDateFormat(timeCells, dateFormat), warnings);
    const actualDateFormat = dateDecision.dateFormat ?? dateFormat;
    const rowContext: RowContext = {
      facts,
      twoDigitYears: dateDecision.twoDigitYears === true,
      timeOfDayColumn: findTimeOfDayColumn(detectedFields, facts, (key) =>
        records.slice(0, 50).map((item) => (isPlainRecord(item) ? item[key] : undefined))),
    };

    // Decide the depth unit ONCE for the whole file (see inferDepthUnit)
    const depthKey = findSourceKeyForTarget(detectedFields, 'depth', facts);
    const depthValues = depthKey === null
      ? []
      : records.reduce<number[]>((acc, item) => {
          const v = safeParseFloat(item?.[depthKey]);
          if (v !== null) acc.push(v);
          return acc;
        }, []);
    const depthUnit = inferDepthUnit(depthKey, depthValues);
    if (depthUnit.divisor !== 1) {
      warnings.push({ line: 0, message: metresDepthWarning(depthUnit) });
    }
    const lengthDivisors = uncertaintyDivisors(detectedFields, depthUnit, facts);
    adjustments.negativeDownLikely = looksNegativeDownward(depthValues, depthUnit);

    // Decide the moment-tensor unit ONCE for the whole file (see inferMomentTensorScaleForFile)
    let hasMomentTensorColumns = false;
    const momentTensorScale = inferMomentTensorScaleForFile(records.length, (i) => {
      const item = records[i];
      if (item === null || typeof item !== 'object') return null;
      const components = MOMENT_TENSOR_COMPONENT_KEYS.map((key) => readRowNumber(item, [key]));
      if (components.some((v) => v !== null)) hasMomentTensorColumns = true;
      return {
        components,
        Mo: readRowNumber(item, scalarMomentKeysFor(item)),
      };
    });

    // Parse each event
    records.forEach((item, index) => {
      try {
        const { mappedEvent, depthOutcome } = mapTabularRow(
          item, actualDateFormat, true, momentTensorScale, adjustments, rowContext, depthUnit, lengthDivisors
        );
        const mappingReport = (mappedEvent as any)._mappingReport as FieldMappingTrace[] | undefined;
        sources.add(mappingReport);
        const context: ValidationEventContext = {
          line: index + 1,
          eventIndex: index,
          eventId: (mappedEvent.eventId || mappedEvent.id || null) as string | null,
          rawEvent: item,
          mappingReport,
        };
        validationAccumulator.totalEvents += 1;
        const validation = validateEventWithDetails(mappedEvent, context);
        const failures = withOutOfRangeDepthFailure(validation.failures, depthOutcome, context);

        if (!validation.valid) {
          const errorMessages = failures
            .filter(failure => failure.severity === 'error')
            .map(failure => failure.message);
          errors.push({
            line: index + 1,
            message: errorMessages.join('; ')
          });
          validationAccumulator.invalidEvents += 1;
          validationAccumulator.failures.push(...failures);
          return;
        }

        if (depthOutcome.status === 'out_of_range') countOutOfRangeDepth(adjustments, index + 1, depthOutcome.raw);
        validationAccumulator.validEvents += 1;
        validationAccumulator.failures.push(...failures);
        appendCrossFieldFailures(validationAccumulator, mappedEvent, context);
        delete (mappedEvent as any)._mappingReport;
        events.push(mappedEvent);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Parse error';
        errors.push({
          line: index + 1,
          message
        });
        validationAccumulator.invalidEvents += 1;
        appendParserFailure(validationAccumulator, { line: index + 1, eventIndex: index }, message);
      }
    });

    appendRowAdjustmentWarnings(adjustments, warnings);
    fileDecisions = tabularFileDecisions(dateDecision, depthUnit, adjustments,
      hasMomentTensorColumns ? momentTensorScale : null);
  } catch (error) {
    return failedParseResult('Invalid JSON format', validationAccumulator);
  }

  return {
    success: errors.length === 0,
    events,
    errors,
    warnings,
    detectedFields,
    validationReport: summarizeValidationFailures(validationAccumulator.failures, {
      totalEvents: validationAccumulator.totalEvents,
      validEvents: validationAccumulator.validEvents,
      invalidEvents: validationAccumulator.invalidEvents,
    }),
    resolvedFieldSources: sources.resolve(),
    fileDecisions,
  };
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Top-level keys of this platform's JSON export, renamed to the fields the pipeline reads. */
const EXPORTED_TOP_LEVEL_FIELDS: Record<string, string> = {
  publicId: 'event_public_id',
  sourceId: 'source_id',
  eventType: 'event_type',
  eventTypeCertainty: 'event_type_certainty',
  sourceEventType: 'source_event_type',
  locationName: 'location_name',
  preferredOriginId: 'preferred_origin_id',
  preferredMagnitudeId: 'preferred_magnitude_id',
  preferredFocalMechanismId: 'preferred_focal_mechanism_id',
  confidenceLevel: 'confidence_level',
  sourceEvents: 'source_events',
  focalMechanisms: 'focal_mechanisms',
  stationMagnitudes: 'station_magnitudes',
  eventDescriptions: 'event_descriptions',
  creationInfo: 'creation_info',
  originQuality: 'origin_quality',
};

/** Members of the export's nested objects, keyed by object, then by member. */
const EXPORTED_NESTED_FIELDS: Record<string, Record<string, string>> = {
  location: { latitude: 'latitude', longitude: 'longitude', depth: 'depth', depthType: 'depth_type' },
  magnitude: {
    value: 'magnitude', type: 'magnitude_type', uncertainty: 'magnitude_uncertainty',
    stationCount: 'magnitude_station_count', methodId: 'magnitude_method_id',
    evaluationMode: 'magnitude_evaluation_mode', evaluationStatus: 'magnitude_evaluation_status',
  },
  uncertainties: {
    time: 'time_uncertainty', latitude: 'latitude_uncertainty', longitude: 'longitude_uncertainty',
    depth: 'depth_uncertainty', horizontal: 'horizontal_uncertainty',
    minHorizontal: 'min_horizontal_uncertainty', minHorizontalUncertainty: 'min_horizontal_uncertainty',
    maxHorizontal: 'max_horizontal_uncertainty', maxHorizontalUncertainty: 'max_horizontal_uncertainty',
    azimuthMaxHorizontal: 'azimuth_max_horizontal_uncertainty',
    azimuthMaxHorizontalUncertainty: 'azimuth_max_horizontal_uncertainty',
    confidenceLevel: 'confidence_level',
  },
  origin: { earthModelId: 'earth_model_id', methodId: 'method_id', agencyId: 'agency_id', author: 'author' },
  quality: {
    azimuthalGap: 'azimuthal_gap', usedPhaseCount: 'used_phase_count', usedStationCount: 'used_station_count',
    standardError: 'standard_error', minimumDistance: 'minimum_distance', maximumDistance: 'maximum_distance',
    associatedPhaseCount: 'associated_phase_count', associatedStationCount: 'associated_station_count',
    depthPhaseCount: 'depth_phase_count',
  },
  evaluation: { mode: 'evaluation_mode', status: 'evaluation_status' },
};

/**
 * This platform's own JSON export (lib/exporters.ts eventsToJSON) nests the core fields
 * (location {latitude, longitude, depth}, magnitude {value, type, ...}, uncertainties,
 * origin, quality and evaluation objects) and writes camelCase identifiers. The flat
 * alias mapping found no latitude, longitude or magnitude in it, so every exported event
 * was rejected on re-import; and a nested object left in place is worse than absent,
 * because `location` is an alias of location_name and `origin` of time. Such a record is
 * unpacked into the flat snake_case fields the rest of the pipeline reads. Any other
 * record is returned as it is.
 */
function flattenExportedEventRecord(item: unknown): unknown {
  if (!isPlainRecord(item)) return item;
  const nestedLocation = isPlainRecord(item.location) && ('latitude' in item.location || 'longitude' in item.location);
  const nestedMagnitude = isPlainRecord(item.magnitude) && 'value' in item.magnitude;
  if (!nestedLocation && !nestedMagnitude) return item;

  const flat: Record<string, unknown> = {};
  const put = (field: string, value: unknown) => {
    if (value === undefined || flat[field] !== undefined) return;
    flat[field] = value;
  };
  for (const [key, value] of Object.entries(item)) {
    if (EXPORTED_NESTED_FIELDS[key] && isPlainRecord(value)) {
      for (const [member, field] of Object.entries(EXPORTED_NESTED_FIELDS[key])) put(field, value[member]);
      continue;
    }
    // Lineage is kept as the JSON text the DB stores (the source_events column).
    const field = EXPORTED_TOP_LEVEL_FIELDS[key] ?? key;
    put(field, field === 'source_events' && value !== null && typeof value === 'object' ? JSON.stringify(value) : value);
  }
  return flat;
}

/**
 * Parse QuakeML (XML) format with full QuakeML 1.2 support
 */
export function parseQuakeML(content: string): ParseResult {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const events: ParsedEvent[] = [];
  const detectedFields = new Set<string>(['time', 'latitude', 'longitude', 'depth', 'magnitude']);
  const validationAccumulator = createValidationAccumulator();
  const adjustments = createRowAdjustmentCounts();
  let suppressedWarnings = 0;

  const addWarning = (line: number, message: string) => {
    if (warnings.length < MAX_PARSE_WARNINGS) {
      warnings.push({ line, message });
      return;
    }
    suppressedWarnings += 1;
  };

  try {
    // Always locate <event> elements with the SAX tokenizer. The regex scan this
    // replaced only ran below LARGE_QUAKEML_STREAM_THRESHOLD, and it was not an XML
    // parser: it matched <event> inside an XML comment (a comment-only document
    // produced a ghost M4.5 event), broke on a '>' inside a single-quoted attribute
    // (a valid file imported zero events), and took a </event> inside <![CDATA[ ]]>
    // as the element's end. So the same valid document parsed differently on either
    // side of a size threshold. SAX is fast enough that the threshold bought nothing.
    const eventMatches: string[] = extractQuakeMLEventsWithSax(content);

    if (eventMatches.length === 0) {
      return failedParseResult('No events found in QuakeML file', validationAccumulator);
    }

    let index = 0;
    for (const eventXML of eventMatches) {
      index++;
      validationAccumulator.totalEvents += 1;
      try {
        // Parse full QuakeML event structure
        const quakemlEvent = parseQuakeMLEvent(eventXML);

        if (!quakemlEvent) {
          validationAccumulator.invalidEvents += 1;
          errors.push({
            line: index,
            message: 'Failed to parse QuakeML event'
          });
          appendParserFailure(validationAccumulator, { line: index, eventIndex: index - 1 }, 'Failed to parse QuakeML event');
          continue;
        }

        const parsed = parsedEventFromQuakeMLEvent(
          quakemlEvent,
          index,
          detectedFields,
          validationAccumulator,
          adjustments
        );
        if (parsed.error) {
          errors.push(parsed.error);
          continue;
        }
        for (const warning of parsed.warnings) {
          addWarning(index, warning);
        }
        if (parsed.event) events.push(parsed.event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Parse error';
        errors.push({
          line: index,
          message
        });
        validationAccumulator.invalidEvents += 1;
        appendParserFailure(validationAccumulator, { line: index, eventIndex: index - 1 }, message);
      }
    }
  } catch (error) {
    const message = 'Invalid QuakeML format: ' + (error instanceof Error ? error.message : 'Unknown error');
    return failedParseResult(message, validationAccumulator);
  }

  appendRowAdjustmentWarnings(adjustments, warnings);

  return {
    success: errors.length === 0,
    events,
    errors,
    warnings,
    detectedFields: Array.from(detectedFields),
    warningsTruncated: suppressedWarnings > 0,
    validationReport: summarizeValidationFailures(validationAccumulator.failures, {
      totalEvents: validationAccumulator.totalEvents,
      validEvents: validationAccumulator.validEvents,
      invalidEvents: validationAccumulator.invalidEvents,
    }),
    resolvedFieldSources: events.length > 0 ? { ...QUAKEML_FIELD_SOURCES } : {},
    fileDecisions: quakemlFileDecisions(adjustments),
  };
}

/** Where the QuakeML parser reads each primary field: the preferred origin and magnitude. */
const QUAKEML_FIELD_SOURCES: Record<string, string> = {
  time: 'event/origin/time/value',
  latitude: 'event/origin/latitude/value',
  longitude: 'event/origin/longitude/value',
  depth: 'event/origin/depth/value',
  magnitude: 'event/magnitude/mag/value',
  magnitude_type: 'event/magnitude/type',
  event_public_id: 'event/@publicID',
};

function quakemlFileDecisions(adjustments: RowAdjustmentCounts): ParseFileDecisions {
  return {
    depthUnit: 'm',
    depthUnitReason: 'QuakeML 1.2 BED reports Origin.depth in metres',
    wrappedLongitudes: adjustments.wrappedLongitudes,
    outOfRangeDepths: adjustments.outOfRangeDepths,
  };
}


export interface ParseQuakeMLFileStreamOptions {
  /**
   * Called with full ParsedEvent objects, including the quakeml payload, before
   * they are stripped for the returned browser-facing event list.
   */
  onEventBatch?: (events: ParsedEvent[]) => Promise<void> | void;
  eventBatchSize?: number;
  stripQuakemlFromReturnedEvents?: boolean;
}

/**
 * Parse a QuakeML file from disk using a SAX file stream.
 *
 * The returned ParseResult preserves the same shape as parseFile(), but callers
 * can stream rich event batches to MongoDB while retaining only lightweight
 * events in memory for the browser response.
 */
export async function parseQuakeMLFileStream(
  filePath: string,
  options: ParseQuakeMLFileStreamOptions = {}
): Promise<ParseResult> {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const events: ParsedEvent[] = [];
  const detectedFields = new Set<string>(['time', 'latitude', 'longitude', 'depth', 'magnitude']);
  const validationAccumulator = createValidationAccumulator();
  const adjustments = createRowAdjustmentCounts();
  const eventBatchSize = options.eventBatchSize ?? STREAM_PARSE_EVENT_BATCH_SIZE;
  const stripReturnedEvents = options.stripQuakemlFromReturnedEvents ?? false;
  let suppressedWarnings = 0;
  let index = 0;
  let pendingBatch: ParsedEvent[] = [];
  let pendingWrite: Promise<void> = Promise.resolve();
  let streamError: Error | null = null;

  const addWarning = (line: number, message: string) => {
    if (warnings.length < MAX_PARSE_WARNINGS) {
      warnings.push({ line, message });
      return;
    }
    suppressedWarnings += 1;
  };

  const flushBatch = (fileStream: ReturnType<typeof createReadStream>, force = false) => {
    if (!options.onEventBatch || pendingBatch.length === 0) return;
    if (!force && pendingBatch.length < eventBatchSize) return;

    const batch = pendingBatch;
    pendingBatch = [];
    fileStream.pause();
    pendingWrite = pendingWrite
      .then(async () => {
        await options.onEventBatch?.(batch);
      })
      .catch(error => {
        streamError = error instanceof Error ? error : new Error(String(error));
        fileStream.destroy(streamError);
      })
      .finally(() => {
        if (!streamError && !fileStream.destroyed) fileStream.resume();
      });
  };

  await new Promise<void>((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false, normalize: false });
    const fileStream = createReadStream(filePath, { encoding: 'utf8' });

    let insideEvent = false;
    let eventDepth = 0;
    let currentEventXML = '';

    parser.on('opentag', (node: any) => {
      if (isEventTagName(node.name)) {
        insideEvent = true;
        eventDepth = 1;
        currentEventXML = serializeOpenTag(node);
        return;
      }

      if (!insideEvent) return;
      eventDepth += 1;
      currentEventXML += serializeOpenTag(node);
    });

    parser.on('text', (text: string) => {
      if (insideEvent && text.length > 0) {
        currentEventXML += escapeXml(text);
      }
    });

    parser.on('cdata', (text: string) => {
      if (insideEvent) {
        currentEventXML += `<![CDATA[${text}]]>`;
      }
    });

    parser.on('closetag', (tagName: string) => {
      if (!insideEvent) return;
      currentEventXML += `</${tagName}>`;
      eventDepth -= 1;

      if (eventDepth !== 0) return;

      insideEvent = false;
      index += 1;
      validationAccumulator.totalEvents += 1;

      try {
        const quakemlEvent = parseQuakeMLEvent(currentEventXML);
        if (!quakemlEvent) {
          validationAccumulator.invalidEvents += 1;
          const message = 'Failed to parse QuakeML event';
          errors.push({ line: index, message });
          appendParserFailure(validationAccumulator, { line: index, eventIndex: index - 1 }, message);
        } else {
          const parsed = parsedEventFromQuakeMLEvent(
            quakemlEvent,
            index,
            detectedFields,
            validationAccumulator,
            adjustments
          );
          if (parsed.error) {
            errors.push(parsed.error);
          } else if (parsed.event) {
            for (const warning of parsed.warnings) {
              addWarning(index, warning);
            }

            pendingBatch.push(parsed.event);
            events.push(stripReturnedEvents ? stripQuakeML(parsed.event) : parsed.event);
            flushBatch(fileStream);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Parse error';
        errors.push({ line: index, message });
        validationAccumulator.invalidEvents += 1;
        appendParserFailure(validationAccumulator, { line: index, eventIndex: index - 1 }, message);
      } finally {
        currentEventXML = '';
      }
    });

    parser.on('error', (error) => {
      streamError = error;
      reject(error);
    });

    fileStream.on('error', (error) => {
      streamError = error;
      reject(error);
    });

    // The same bare-'&' repair parseQuakeML applies (escapeBareAmpersands), done on the
    // stream, so a bulletin with "Cook Strait & Marlborough" parses whether the upload
    // is small enough for the in-memory path or chunked to this one.
    const ampersands = createBareAmpersandEscaper();
    const escaper = new Transform({
      decodeStrings: false,
      transform(chunk, _encoding, callback) {
        callback(null, ampersands.push(String(chunk)));
      },
      flush(callback) {
        callback(null, ampersands.flush());
      },
    });
    escaper.on('error', (error) => {
      streamError = error;
      reject(error);
    });

    parser.on('end', () => {
      flushBatch(fileStream, true);
      pendingWrite.then(() => {
        if (streamError) {
          reject(streamError);
          return;
        }
        resolve();
      }, reject);
    });

    fileStream.pipe(escaper).pipe(parser);
  });

  if (index === 0) {
    return failedParseResult('No events found in QuakeML file', validationAccumulator);
  }

  appendRowAdjustmentWarnings(adjustments, warnings);

  return {
    success: errors.length === 0,
    events,
    errors,
    warnings,
    detectedFields: Array.from(detectedFields),
    warningsTruncated: suppressedWarnings > 0,
    validationReport: summarizeValidationFailures(validationAccumulator.failures, {
      totalEvents: validationAccumulator.totalEvents,
      validEvents: validationAccumulator.validEvents,
      invalidEvents: validationAccumulator.invalidEvents,
    }),
    resolvedFieldSources: events.length > 0 ? { ...QUAKEML_FIELD_SOURCES } : {},
    fileDecisions: quakemlFileDecisions(adjustments),
  };
}

/** 1 dyne.cm = 1e-7 N.m (CGS -> SI). */
const DYNE_CM_TO_NEWTON_METRE = 1e-7;

/**
 * Decide the multipliers that bring a flat moment-tensor row to the newton metres that
 * QuakeML 1.2 BED requires for MomentTensor.scalarMoment and every tensor component.
 */
type MomentTensorScale = { tensor: number; scalarMoment: number };

/** Values already in the SI units QuakeML requires: no conversion. */
const MOMENT_TENSOR_SCALE_SI: MomentTensorScale = { tensor: 1, scalarMoment: 1 };
/** GeoNet CMT: components in 1e20 dyne.cm, Mo in dyne.cm. */
const MOMENT_TENSOR_SCALE_CGS: MomentTensorScale = {
  tensor: 1e20 * DYNE_CM_TO_NEWTON_METRE,
  scalarMoment: DYNE_CM_TO_NEWTON_METRE,
};

/** The NED moment-tensor component columns, in the order assembleFocalMechanismFromRow reads them. */
const MOMENT_TENSOR_COMPONENT_KEYS = ['Mxx', 'Mxy', 'Mxz', 'Myy', 'Myz', 'Mzz'];
/** Scalar-moment column spellings. */
const SCALAR_MOMENT_KEYS = ['Mo', 'MO', 'mo', 'scalar_moment', 'scalarmoment'];

/**
 * What one row says about the unit system, or 'unknown' when the row cannot say.
 *
 * On GeoNet's scale Mo / max|Mij| is ~1e20 (5.61e26 / 4.99e6 = 1.1e20 for the Mw 7.1
 * 2003 Fiordland solution), whereas for a file already in N.m the same ratio is ~1.
 * A row without a positive scalar moment, or with an all-zero tensor, carries no
 * evidence either way.
 */
function classifyMomentTensorRow(
  components: Array<number | null>,
  Mo: number | null
): 'cgs' | 'si' | 'unknown' {
  const maxAbs = components.reduce<number>(
    (acc, v) => (v === null ? acc : Math.max(acc, Math.abs(v))),
    0
  );
  if (Mo === null || Mo <= 0 || maxAbs === 0) return 'unknown';
  const ratio = Mo / maxAbs;
  return ratio >= 1e19 && ratio <= 1e21 ? 'cgs' : 'si';
}

/** Per-row fallback, used only where the whole file is not visible (the streaming parsers). */
function inferMomentTensorScale(
  components: Array<number | null>,
  Mo: number | null
): MomentTensorScale {
  return classifyMomentTensorRow(components, Mo) === 'cgs'
    ? MOMENT_TENSOR_SCALE_CGS
    : MOMENT_TENSOR_SCALE_SI;
}

/**
 * Decide the moment-tensor scale ONCE for a whole file, from the rows that carry evidence.
 */
function inferMomentTensorScaleForFile(
  rowCount: number,
  readRow: (index: number) => { components: Array<number | null>; Mo: number | null } | null
): MomentTensorScale {
  let cgs = 0;
  let si = 0;
  for (let i = 0; i < rowCount; i++) {
    const row = readRow(i);
    if (row === null) continue;
    const verdict = classifyMomentTensorRow(row.components, row.Mo);
    if (verdict === 'cgs') cgs++;
    else if (verdict === 'si') si++;
  }
  return cgs > si ? MOMENT_TENSOR_SCALE_CGS : MOMENT_TENSOR_SCALE_SI;
}

/**
 * Read a numeric column from a flat row, trying the given spellings plus their lower- and
 * upper-case forms. Shared by the moment-tensor scan and the focal-mechanism assembler so
 * both read exactly the same columns.
 */
function readRowNumber(row: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      // Same strict literal rule as every other numeric column.
      const n = safeParseFloat(v);
      if (n !== null) return n;
    }
  }
  return null;
}

/**
 * Scalar-moment column names for a row. The lower-case 'mo' spelling is a month
 * abbreviation in split date columns (yr/mo/dy), so it is only read as a moment when
 * the row carries no such date components.
 */
function scalarMomentKeysFor(row: any): string[] {
  const keys = Object.keys(row).map((k) => k.toLowerCase());
  const hasDateParts = keys.some((k) => ['year', 'yr', 'yyyy'].includes(k)) && keys.some((k) => ['day', 'dy', 'dd'].includes(k));
  return hasDateParts ? SCALAR_MOMENT_KEYS.filter((k) => k !== 'Mo' && k !== 'MO' && k !== 'mo') : SCALAR_MOMENT_KEYS;
}

/**
 * Assemble a focal_mechanisms JSON field from flat nodal-plane / moment-tensor columns.
 */
function assembleFocalMechanismFromRow(row: any, momentTensorScale?: MomentTensorScale): object | null {
  const get = (keys: string[]): number | null => readRowNumber(row, keys);
  // Rake is stored on (-180, 180], the QuakeML NodalPlane convention: sources that write
  // it on 0-360 give 270 for a pure normal fault, which is -90.
  const getRake = (keys: string[]): number | null => {
    const rake = get(keys);
    return rake === null ? null : normalizeRake(rake);
  };

  const strike1 = get(['strike1', 'Strike1']);
  const dip1    = get(['dip1',    'Dip1']);
  const rake1   = getRake(['rake1', 'Rake1']);
  const strike2 = get(['strike2', 'Strike2']);
  const dip2    = get(['dip2',    'Dip2']);
  const rake2   = getRake(['rake2', 'Rake2']);

  const Mxx = get(['Mxx']); const Mxy = get(['Mxy']); const Mxz = get(['Mxz']);
  const Myy = get(['Myy']); const Myz = get(['Myz']); const Mzz = get(['Mzz']);

  const Tva = get(['Tva']); const Tpl = get(['Tpl']); const Taz = get(['Taz']);
  const Nva = get(['Nva']); const Npl = get(['Npl']); const Naz = get(['Naz']);
  const Pva = get(['Pva']); const Ppl = get(['Ppl']); const Paz = get(['Paz']);

  const hasPlane1 = strike1 !== null || dip1 !== null || rake1 !== null;
  const hasPlane2 = strike2 !== null || dip2 !== null || rake2 !== null;
  const hasFlatFM = [strike1, dip1, rake1, strike2, dip2, rake2, Mxx, Mxy, Mxz, Myy, Myz, Mzz, Taz, Paz].some(v => v !== null);
  if (!hasFlatFM) return null;

  const rq = (v: number | null) => v !== null ? { value: v } : undefined;

  const fm: any = { publicID: String(row.PublicID ?? row.publicID ?? row.id ?? '') };

  // Nodal planes. Either plane may be present alone (QuakeML allows a lone nodalPlane2);
  // absent angles stay absent rather than becoming a measured 0.
  if (hasPlane1 || hasPlane2) {
    fm.nodalPlanes = {
      ...(hasPlane1 ? { nodalPlane1: { strike: rq(strike1), dip: rq(dip1), rake: rq(rake1) } } : {}),
      ...(hasPlane2 ? { nodalPlane2: { strike: rq(strike2), dip: rq(dip2), rake: rq(rake2) } } : {}),
    };
  }

  // Tensor scale is decided once per file; the principal-axis eigenvalues (Tva/Nva/Pva)
  // are in the same units as the tensor components in every source that supplies both,
  // so they take the same factor. Without a tensor the row carries no scale evidence and
  // the lengths are kept as given.
  const hasTensor = Mxx !== null || Mzz !== null;
  const Mo = get(scalarMomentKeysFor(row));
  const scale = hasTensor
    ? (momentTensorScale ?? inferMomentTensorScale([Mxx, Mxy, Mxz, Myy, Myz, Mzz], Mo))
    : null;
  const axisLength = (v: number | null) => (v !== null && scale ? { value: v * scale.tensor } : rq(v));

  // Principal axes (T, N, P)
  if (Taz !== null || Tpl !== null || Paz !== null || Ppl !== null) {
    fm.principalAxes = {
      tAxis: { azimuth: rq(Taz) ?? { value: 0 }, plunge: rq(Tpl) ?? { value: 0 }, length: axisLength(Tva) },
      pAxis: { azimuth: rq(Paz) ?? { value: 0 }, plunge: rq(Ppl) ?? { value: 0 }, length: axisLength(Pva) },
      ...(Naz !== null || Npl !== null
        ? { nAxis: { azimuth: rq(Naz) ?? { value: 0 }, plunge: rq(Npl) ?? { value: 0 }, length: axisLength(Nva) } }
        : {}),
    };
  }

  // Moment tensor — convert NED Cartesian (x=North, y=East, z=Down) to QuakeML USE
  // spherical. The USE basis vectors are r=Up=-z, t=South(colatitude)=-x, p=East=y, so
  //   Mrr=Mzz, Mtt=Mxx, Mpp=Myy, Mrt=Mxz, Mrp=-Myz, Mtp=-Mxy
  // (Aki & Richards 1980; GFZ NMSOP-2 IS 3.8 eq. 3 — the mapping ObsPy, GMT psmeca and
  // SeisComP use). Flipping Mrt and Mrp instead is conjugation by diag(1,1,-1), i.e. the
  // mirror-image mechanism: every principal-axis azimuth rotates by 180 degrees.
  // Verified against the GeoNet CMT CSV: decomposed as z=DOWN the tensors reproduce that
  // file's own Tpl/Taz, Npl/Naz, Ppl/Paz columns for 3690 of 3708 solutions (the rest are
  // near-vertical axes whose azimuth is ill-conditioned); as z=UP, 3690 of 3708 disagree.
  if (hasTensor && scale) {
    const DC = get(['DC', 'dc', 'double_couple', 'doublecouple']);
    const VR = get(['VR', 'vr', 'variance_reduction', 'variancereduction']);

    // QuakeML wants N.m for the tensor and the scalar moment. The scale is the FILE's
    // (see inferMomentTensorScaleForFile), so a row with no Mo is converted with the rest
    // instead of being left 1e13 too small; callers that cannot see the whole file fall
    // back to this row's own evidence.

    const tensor = {
      ...(Mzz !== null ? { Mrr: { value:  Mzz * scale.tensor } } : {}),
      ...(Mxx !== null ? { Mtt: { value:  Mxx * scale.tensor } } : {}),
      ...(Myy !== null ? { Mpp: { value:  Myy * scale.tensor } } : {}),
      ...(Mxz !== null ? { Mrt: { value:  Mxz * scale.tensor } } : {}),
      ...(Myz !== null ? { Mrp: { value: -Myz * scale.tensor } } : {}),
      ...(Mxy !== null ? { Mtp: { value: -Mxy * scale.tensor } } : {}),
    };

    fm.momentTensor = {
      derivedOriginID: '',
      tensor,
      ...(Mo !== null ? { scalarMoment: { value: Mo * scale.scalarMoment } } : {}),
      // QuakeML doubleCouple is a 0-1 fraction; the column is a percentage (87 -> 0.87)
      ...(DC !== null ? { doubleCouple: DC / 100 } : {}),
      ...(VR !== null ? { varianceReduction: VR } : {}),
    };
  }

  return fm;
}

/** Column-name spellings of split date and time components (matched case-insensitively). */
const YEAR_COMPONENT_FIELDS = ['year', 'yr', 'yyyy', 'yy'];
const MONTH_COMPONENT_FIELDS = ['month', 'mon', 'mo', 'mm'];
const DAY_COMPONENT_FIELDS = ['day', 'dy', 'dd', 'dom'];
const HOUR_COMPONENT_FIELDS = ['hour', 'hr', 'hh', 'hours'];
const MINUTE_COMPONENT_FIELDS = ['minute', 'min', 'mn', 'minutes'];
const SECOND_COMPONENT_FIELDS = ['second', 'sec', 'ss', 'seconds', 'sc'];

/** Lower-case names of the flat nodal-plane / moment-tensor columns assembleFocalMechanismFromRow reads. */
const FOCAL_MECHANISM_COLUMNS = new Set([
  'strike1', 'dip1', 'rake1', 'strike2', 'dip2', 'rake2',
  'mxx', 'mxy', 'mxz', 'myy', 'myz', 'mzz', 'taz', 'paz',
]);

/** Keys of a row that hold each split date/time component, in the order they are tried. */
interface ComponentColumns {
  year: string[];
  month: string[];
  day: string[];
  hour: string[];
  minute: string[];
  second: string[];
}

/** What a row's set of keys says, worked out once per distinct set of keys. */
interface RowShape {
  components: ComponentColumns;
  /** The row has year and day columns (so 'mo' is a month, 'mn' minutes, 'ms' milliseconds). */
  hasDateParts: boolean;
  /** The row has flat focal-mechanism columns. */
  hasFocalMechanismColumns: boolean;
  /** Keys that map to the canonical `time` field (time, date, origin_time ...). */
  timeKeys: string[];
}

type AliasLookupEntry = { targetField: string; isExact: boolean };

/**
 * Facts about the column names of ONE file, each worked out once instead of once per
 * row: the canonical field a name maps to (resolveHeaderAlias, the resolution the schema
 * step shows), the magnitude scale it states, and the shape of a row's keys. Scoped to a
 * parse, so a file with many distinct keys (JSON records with unique names) does not grow
 * a process-wide cache.
 */
class HeaderFacts {
  private readonly aliases = new Map<string, AliasLookupEntry | null>();
  private readonly scales = new Map<string, string | null>();
  private lastKeys: string[] | null = null;
  private lastShape: RowShape | null = null;

  /**
   * @param writtenNames - lower-cased CSV header -> the header as written, so a scale
   *   the case distinguishes ('mB', broadband body-wave) is read from the file's spelling.
   * @param minuteColumn - a column read as minutes by its position ('mm' after 'hh').
   */
  constructor(
    private readonly writtenNames?: ReadonlyMap<string, string>,
    readonly minuteColumn?: string
  ) {}

  /** The canonical field a column or key name maps to; `isExact` for one of the field's exact spellings. */
  lookup(name: string): AliasLookupEntry | undefined {
    let entry = this.aliases.get(name);
    if (entry === undefined) {
      const targetField = resolveHeaderAlias(name);
      entry = targetField
        ? { targetField, isExact: FIELD_ALIASES[targetField]?.exactMatches.includes(name) ?? false }
        : null;
      this.aliases.set(name, entry);
    }
    return entry ?? undefined;
  }

  /** The magnitude scale a column name states ('mb', 'Ms'), from the name as written. */
  scale(name: string): string | null {
    let scale = this.scales.get(name);
    if (scale === undefined) {
      scale = inferMagnitudeTypeFromColumn(this.writtenNames?.get(name) ?? name);
      this.scales.set(name, scale);
    }
    return scale;
  }

  /** The shape of a row with these keys (CSV rows and most JSON records repeat one set). */
  shapeOf(keys: string[]): RowShape {
    const last = this.lastKeys;
    if (last && this.lastShape && last.length === keys.length && last.every((key, i) => key === keys[i])) {
      return this.lastShape;
    }
    const lower = keys.map((key) => key.toLowerCase());
    const byName = (names: string[]) => {
      const found: string[] = [];
      for (const name of names) {
        lower.forEach((key, i) => { if (key === name && !found.includes(keys[i])) found.push(keys[i]); });
      }
      return found;
    };
    const minute = byName(MINUTE_COMPONENT_FIELDS);
    const month = byName(MONTH_COMPONENT_FIELDS);
    if (this.minuteColumn !== undefined && keys.includes(this.minuteColumn)) {
      // 'mm' right after an hour column is the minute (yyyy mm dd hh mm ss).
      minute.unshift(this.minuteColumn);
      const index = month.indexOf(this.minuteColumn);
      if (index >= 0) month.splice(index, 1);
    }
    const shape: RowShape = {
      components: {
        year: byName(YEAR_COMPONENT_FIELDS),
        month,
        day: byName(DAY_COMPONENT_FIELDS),
        hour: byName(HOUR_COMPONENT_FIELDS),
        minute,
        second: byName(SECOND_COMPONENT_FIELDS),
      },
      hasDateParts: lower.some((key) => YEAR_COMPONENT_FIELDS.includes(key)) &&
        lower.some((key) => DAY_COMPONENT_FIELDS.includes(key)),
      hasFocalMechanismColumns: lower.some((key) => FOCAL_MECHANISM_COLUMNS.has(key)),
      timeKeys: keys.filter((key) => this.lookup(key)?.targetField === 'time'),
    };
    this.lastKeys = keys;
    this.lastShape = shape;
    return shape;
  }
}

/**
 * A column that sits right after an hour column and is named 'mm' is the minutes, even
 * where 'mm' is otherwise a month ('yyyy mm dd hh mm ss'; the second 'mm' is 'mm_2' once
 * the names are made unique).
 */
function positionalMinuteColumn(headers: string[]): string | undefined {
  for (let i = 0; i + 1 < headers.length; i++) {
    if (HOUR_COMPONENT_FIELDS.includes(headers[i].toLowerCase()) && /^mm(?:_\d+)?$/i.test(headers[i + 1])) {
      return headers[i + 1];
    }
  }
  return undefined;
}

/** File-level facts every row of one parse is read with. */
interface RowContext {
  facts: HeaderFacts;
  /** Read numeric dates with a two-digit year (the file's order is declared or unambiguous). */
  twoDigitYears: boolean;
  /** A column whose values are times of day, found by its values (see findTimeOfDayColumn). */
  timeOfDayColumn?: string;
}

/** The first populated numeric column among the given keys, with the key it was read from. */
function findComponent(event: any, keys: string[]): { key: string; value: number } | null {
  for (const key of keys) {
    const value = event[key];
    if (value !== undefined && value !== null && value !== '' && !isNaN(Number(value))) {
      return { key, value: Number(value) };
    }
  }
  return null;
}

/**
 * The time of day in hour / minute / second columns, as seconds after midnight, or null
 * when the row has no hour column or a component is not a valid clock value.
 */
function readTimeOfDayColumns(event: any, components: ComponentColumns): { seconds: number; keys: string[] } | null {
  const hour = findComponent(event, components.hour);
  if (!hour) return null;
  const minute = findComponent(event, components.minute);
  const second = findComponent(event, components.second);
  const h = hour.value;
  const m = minute?.value ?? 0;
  const s = second?.value ?? 0;
  if (![h, m, s].every(Number.isFinite) || !Number.isInteger(h) || !Number.isInteger(m) ||
      h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s >= 61) {
    return null;
  }
  return {
    seconds: h * 3600 + m * 60 + s,
    keys: [hour.key, minute?.key, second?.key].filter((key): key is string => key !== undefined),
  };
}

/**
 * Synthesize a timestamp from separate date/time component columns
 * Supports common variations: year/month/day/hour/minute/second, yr/mo/dy/hr/mn/sc, etc.
 * @param event - The event object with potential date/time component fields
 * @param components - The row's component columns (see HeaderFacts.shapeOf)
 * @returns ISO 8601 formatted timestamp and the columns it was read from, or null if
 *          components are missing
 */
function synthesizeTimestamp(event: any, components: ComponentColumns): { iso: string; keys: string[] } | null {
  // Extract date/time components
  const year = findComponent(event, components.year);
  const month = findComponent(event, components.month);
  const day = findComponent(event, components.day);
  const hour = findComponent(event, components.hour);
  const minute = findComponent(event, components.minute);
  const second = findComponent(event, components.second);

  // Require at least year, month, and day to synthesize a timestamp
  if (year === null || month === null || day === null) {
    return null;
  }

  // Default time components to 0 if not present
  const y = year.value;
  const mo = month.value;
  const d = day.value;
  const h = hour?.value ?? 0;
  const m = minute?.value ?? 0;
  const s = second?.value ?? 0;

  // Assemble on the calendar, then add the seconds as a duration, so a fractional
  // second rounds and carries correctly: 59.9999 s is 60.000 s, i.e. the next minute,
  // not "59.100" from padding "1000" ms to three characters.
  if (![y, mo, d, h, m, s].every(Number.isFinite)) return null;
  // Each component must be a valid calendar value: Date.UTC would otherwise roll
  // month 13 into the next year and map years 0-99 to 1900-1999.
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d) ||
      !Number.isInteger(h) || !Number.isInteger(m) ||
      mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s >= 61) {
    return null;
  }
  const base = new Date(Date.UTC(2000, mo - 1, d, h, m, 0, 0));
  base.setUTCFullYear(y);
  // A day beyond the month's length (31 April) would have rolled over silently.
  if (base.getUTCMonth() !== mo - 1 || base.getUTCDate() !== d) return null;
  const instant = base.getTime() + Math.round(s * 1000);
  if (!Number.isFinite(instant)) return null;
  const iso = new Date(instant).toISOString();
  // Years before 1000 or after 9999 render in expanded form; keep the plain form.
  if (iso.startsWith('+') || iso.startsWith('-')) return null;
  const keys = [year, month, day, hour, minute, second]
    .filter((part): part is { key: string; value: number } => part !== null)
    .map((part) => part.key);
  return { iso, keys };
}

/** A time of day on its own: 12:34, 12:34:56.7, 1:05:07 PM, 12:34:56Z. */
const TIME_OF_DAY_ONLY = /^\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:\s*[AaPp]\.?[Mm]\.?)?(?:\s*(?:Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?))?$/i;
/** A compact time of day, HHMMSS[.f], as bulletins write it next to a YYYYMMDD date. */
const COMPACT_TIME_OF_DAY = /^(\d{2})(\d{2})(\d{2})(?:[.,](\d+))?$/;

/**
 * A cell that is a time of day and nothing else, as text normalizeTimestamp reads after
 * a date ('10:30:00', '1:05:07 PM'; compact '103000' as '10:30:00'), or null.
 */
function timeOfDayText(cell: unknown): string | null {
  const text = typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < 240000
    ? String(cell).padStart(6, '0')
    : typeof cell === 'string' ? cell.trim() : null;
  if (text === null || text.length > 32) return null;
  if (TIME_OF_DAY_ONLY.test(text)) return text;
  const m = text.match(COMPACT_TIME_OF_DAY);
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59 && Number(m[3]) <= 60) {
    return `${m[1]}:${m[2]}:${m[3]}${m[4] ? `.${m[4]}` : ''}`;
  }
  return null;
}

/** A calendar date on its own, in the shapes normalizeTimestamp reads. */
const DATE_ONLY_SHAPES = [
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/,
  /^\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2})$/,
  /^\d{8}$/,
  /^(?:[A-Za-z]{3,9}\.?,?\s+)?\d{1,2}(?:\s+|-)[A-Za-z]{3,9}\.?(?:\s+|-)(?:\d{4}|\d{2})$/,
  /^(?:[A-Za-z]{3,9}\.?,?\s+)?[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}$/,
];

const isDateOnly = (value: string): boolean => value.length <= 40 && DATE_ONLY_SHAPES.some((shape) => shape.test(value));

/** A JSON date written as the number YYYYMMDD (20240115). */
const isDateNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 18000101 && value <= 21001231;

function dateFormatHint(dateFormat?: DateFormat): 'US' | 'International' | undefined {
  return dateFormat === 'US' ? 'US' : dateFormat === 'International' ? 'International' : undefined;
}

/**
 * The column holding the time of day when the file's time column is a date only: a
 * column the alias table maps to no field, whose sampled values are all times of day
 * (HH:MM[:SS[.f]] with or without AM/PM, or compact HHMMSS), preferring a name that says
 * time ('hhmmss', 'origin_hms'). Found by its values, as its name need not be an alias.
 */
function findTimeOfDayColumn(
  keys: string[],
  facts: HeaderFacts,
  sample: (key: string) => unknown[]
): string | undefined {
  const shape = facts.shapeOf(keys);
  const componentKeys = new Set(Object.values(shape.components).flat());
  let fallback: string | undefined;
  for (const key of keys) {
    if (facts.lookup(key) !== undefined || componentKeys.has(key)) continue;
    const values = sample(key).filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
    if (values.length === 0 || !values.every((value) => timeOfDayText(value) !== null)) continue;
    if (/time|hms|clock/i.test(key)) return key;
    fallback ??= key;
  }
  return fallback;
}

/**
 * Bulletins (the ISC layout DATE,TIME, for one) carry the calendar date and the time of
 * day in separate columns. Both names are aliases of `time`, so whichever claimed the
 * field shadowed the other: a bare time of day was rejected on every row, and a date
 * with hour/minute/second columns was stored at midnight. When the value that claimed
 * `time` is only a date or only a time of day, complete it from the row's other
 * time-like column, its hour/minute/second columns, or the file's time-of-day column.
 */
function combineDateAndTimeOfDay(
  event: any,
  current: unknown,
  dateFormat: DateFormat | undefined,
  shape: RowShape,
  context: RowContext
): { value: string; sources: string[] } | null {
  const resolved = isDateNumber(current) ? String(current) : typeof current === 'string' ? current.trim() : null;
  if (resolved === null) return null;
  const clockText = timeOfDayText(resolved);
  const currentIsTime = clockText !== null && !isDateNumber(current);
  const currentIsDate = !currentIsTime && isDateOnly(resolved);
  if (!currentIsTime && !currentIsDate) return null;

  const currentKey = shape.timeKeys.find((key) => {
    const cell = event[key];
    return (typeof cell === 'string' ? cell.trim() : isDateNumber(cell) ? String(cell) : null) === resolved;
  }) ?? 'time';
  for (const key of shape.timeKeys) {
    if (key === currentKey) continue;
    const cell = event[key];
    const other = isDateNumber(cell) ? String(cell) : typeof cell === 'string' ? cell.trim() : null;
    if (other === null) continue;
    if (currentIsTime && isDateOnly(other)) return { value: `${other} ${clockText}`, sources: [key, currentKey] };
    const otherClock = currentIsDate ? timeOfDayText(other) : null;
    if (otherClock !== null) return { value: `${resolved} ${otherClock}`, sources: [currentKey, key] };
  }

  if (currentIsDate) {
    const clock = readTimeOfDayColumns(event, shape.components);
    if (clock) {
      const midnight = normalizeTimestamp(resolved, dateFormatHint(dateFormat), { twoDigitYears: context.twoDigitYears });
      if (!midnight) return null;
      // The seconds are added as a duration, so 59.9999 s carries into the next minute.
      const iso = new Date(Date.parse(midnight) + Math.round(clock.seconds * 1000)).toISOString();
      return { value: iso, sources: [currentKey, ...clock.keys] };
    }
    const column = context.timeOfDayColumn;
    const text = column === undefined ? null : timeOfDayText(event[column]);
    if (text !== null) return { value: `${resolved} ${text}`, sources: [currentKey, column!] };
  } else {
    // A time of day beside year/month/day columns.
    const date = synthesizeTimestamp(event, shape.components);
    if (date && date.keys.length === 3) {
      return { value: `${date.iso.slice(0, 10)} ${clockText}`, sources: [...date.keys, currentKey] };
    }
  }
  return null;
}

/**
 * Safely parse a numeric value, returning null for invalid values. A numeric field holds
 * a numeric literal: "4.1garbage" is absent, not 4.1 (see parseStrictNumber).
 */
function safeParseFloat(value: any): number | null {
  return parseStrictNumber(value);
}

/**
 * The length unit a file reports depths in, decided ONCE for the whole file.
 * `divisor` converts a raw value to the canonical DB unit, kilometres.
 */
interface DepthUnitDecision {
  /** Divide a raw value by this to get kilometres (1 for km, 1000 for metres). */
  divisor: number;
  unit: 'km' | 'm';
  reason: string;
}

/** Default: values are already in the canonical DB unit (km). */
const DEPTH_UNIT_KM: DepthUnitDecision = { divisor: 1, unit: 'km', reason: 'no evidence of metres' };

/**
 * Locate the source column/key that a target field (e.g. 'depth') will be mapped from.
 * Mirrors mapCommonFields' first-wins resolution so the unit decided here is the unit
 * of the column that actually ends up in the event.
 */
function findSourceKeyForTarget(keys: string[], targetField: string, facts: HeaderFacts): string | null {
  for (const key of keys) {
    if (facts.lookup(key)?.targetField === targetField) return key;
  }
  return null;
}

/** Every key that maps to the canonical `time` field (time, date, origin_time ...). */
function timeSourceKeys(keys: string[], facts: HeaderFacts): string[] {
  return keys.filter((key) => facts.lookup(key)?.targetField === 'time');
}

/** Apply the file's date decision: its warnings go to the file, the rest is returned. */
function applyDateDecision(
  decision: FileDateFormatDecision,
  warnings: Array<{ line: number; message: string }>
): Pick<ParseFileDecisions, 'dateFormat' | 'dateFormatSource' | 'twoDigitYears'> {
  for (const message of decision.warnings) warnings.push({ line: 0, message });
  return {
    ...(decision.dateFormat !== undefined ? { dateFormat: decision.dateFormat } : {}),
    ...(decision.dateFormatSource !== undefined ? { dateFormatSource: decision.dateFormatSource } : {}),
    ...(decision.twoDigitYears ? { twoDigitYears: true } : {}),
  };
}

/** fileDecisions for a CSV or JSON file (contract C14). */
function tabularFileDecisions(
  dateDecision: Pick<ParseFileDecisions, 'dateFormat' | 'dateFormatSource' | 'twoDigitYears'>,
  depthUnit: DepthUnitDecision,
  adjustments: RowAdjustmentCounts,
  momentTensorScale: MomentTensorScale | null
): ParseFileDecisions {
  return {
    ...dateDecision,
    depthUnit: depthUnit.unit,
    depthUnitReason: depthUnit.reason,
    wrappedLongitudes: adjustments.wrappedLongitudes,
    outOfRangeDepths: adjustments.outOfRangeDepths,
    sentinelValues: adjustments.sentinelValues,
    ...(adjustments.dateOnlyTimes > 0 ? { dateOnlyTimes: adjustments.dateOnlyTimes } : {}),
    ...(momentTensorScale
      ? { momentTensorUnits: momentTensorScale === MOMENT_TENSOR_SCALE_CGS ? 'dyne-cm' as const : 'N-m' as const }
      : {}),
  };
}

/**
 * Decide ONCE per file whether a depth column is reported in metres or kilometres.
 */
function inferDepthUnit(sourceColumn: string | null, values: number[]): DepthUnitDecision {
  const named = lengthUnitFromColumnName(sourceColumn);
  if (named === 'km') {
    return { divisor: 1, unit: 'km', reason: `column "${sourceColumn}" names kilometres` };
  }
  if (named === 'm') {
    return { divisor: 1000, unit: 'm', reason: `column "${sourceColumn}" names metres` };
  }

  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length > 0) {
    const p95 = finite[Math.floor(0.95 * (finite.length - 1))];
    if (p95 > 1000) {
      return {
        divisor: 1000,
        unit: 'm',
        reason: `95th percentile of the depth column is ${p95}, which is impossible in kilometres`,
      };
    }
  }

  return DEPTH_UNIT_KM;
}

/** A "not determined" depth: -9, -99, -999 ... (-99.9 ...), never a depth. */
const isDepthSentinel = (value: number): boolean => value <= -9 && /^-9+(?:\.9+)?$/.test(String(value));

/**
 * Whether a depth column looks like the negative-downward (elevation) convention: most of
 * its values are negative, some deeper than the -5 km an above-sea-level event can reach.
 * The whole column decides, without sentinels, so one -999 among positive depths is not
 * taken for a convention.
 */
function looksNegativeDownward(values: number[], depthUnit: DepthUnitDecision): boolean {
  const depths = values.filter((value) => Number.isFinite(value) && !isDepthSentinel(value));
  if (depths.length === 0) return false;
  const negative = depths.filter((value) => value < 0).length;
  return negative > depths.length / 2 && depths.some((value) => value / depthUnit.divisor < -5);
}

/** What happened to one event's depth when the file's unit was applied. */
type DepthOutcome =
  | { status: 'absent' | 'ok' }
  | { status: 'out_of_range'; km: number; raw: number };

/** The warning for a file whose depths were read in metres. */
function metresDepthWarning(depthUnit: DepthUnitDecision): string {
  return `Depth interpreted as metres and converted to kilometres (${depthUnit.reason}). ` +
    'Depth and horizontal uncertainty columns that name no unit of their own were divided by 1000 with it.';
}

/** Length uncertainties stored in km, converted with the depth unless their column names a unit. */
const LENGTH_UNCERTAINTY_FIELDS = ['depth_uncertainty', 'horizontal_uncertainty', 'min_horizontal_uncertainty', 'max_horizontal_uncertainty'];

/**
 * Per-file divisor to kilometres for each length-uncertainty column: a unit the column's
 * own name states ('Horizontal Error (m)', 'Depth Error (km)') wins, as it does for the
 * depth column and in normalizeMappedValue; otherwise the depth column's unit applies.
 */
function uncertaintyDivisors(keys: string[], depthUnit: DepthUnitDecision, facts: HeaderFacts): Record<string, number> {
  const divisors: Record<string, number> = {};
  for (const field of LENGTH_UNCERTAINTY_FIELDS) {
    const named = lengthUnitFromColumnName(findSourceKeyForTarget(keys, field, facts));
    divisors[field] = named === 'm' ? 1000 : named === 'km' ? 1 : depthUnit.divisor;
  }
  return divisors;
}

/**
 * Apply the file-level depth unit to an already-mapped event.
 */
function normalizeOptionalDepth(
  event: Record<string, unknown>,
  depthUnit: DepthUnitDecision = DEPTH_UNIT_KM,
  divisors?: Record<string, number>
): DepthOutcome {
  for (const key of LENGTH_UNCERTAINTY_FIELDS) {
    const divisor = divisors?.[key] ?? depthUnit.divisor;
    if (divisor === 1) continue;
    const raw = safeParseFloat(event[key]);
    if (raw !== null) event[key] = raw / divisor;
  }

  if (event.depth === undefined || event.depth === null || event.depth === '') return { status: 'absent' };

  const depth = safeParseFloat(event.depth);
  if (depth === null) {
    event.depth = null;
    return { status: 'absent' };
  }

  const depthKm = depth / depthUnit.divisor;
  // Null out impossible depths (-5 to 0 is allowed for above-sea-level events). The
  // event is kept, on this path and on the QuakeML and GeoJSON paths alike, and the
  // caller reports the value as out of range.
  if (!validateDepth(depthKm)) {
    event.depth = null;
    return { status: 'out_of_range', km: depthKm, raw: depth };
  }
  event.depth = depthKm;
  return { status: 'ok' };
}

/**
 * Keep, in `_raw`, the cells whose value the event no longer holds as written: a column
 * named like a canonical field that now holds a converted value (metres to km, a 0-360
 * longitude, a sentinel read as missing) or a value from another column (`magnitude`
 * beside `mw`, a date completed with its time of day). The upload schema step re-reads
 * such a cell for an explicit remap (app/api/catalogues/route.ts rawCell). A cell the
 * event still holds as written (the number a numeric string spells; a time read from its
 * own cell) is not copied: `_raw` on every row grew pending uploads by two thirds. `_raw`
 * never reaches a stored event: parsedEventToDbFields and the QuakeML mapping read named
 * fields only.
 */
function attachRewrittenCells(raw: Record<string, unknown>, mapped: Record<string, unknown>, timeFromOwnCell: boolean): void {
  let rewritten: Record<string, unknown> | null = null;
  for (const key of Object.keys(raw)) {
    const cell = raw[key];
    const stored = mapped[key];
    if (stored === cell) continue;
    if (typeof stored === 'number' && parseStrictNumber(cell) === stored) continue;
    if ((stored === null || stored === undefined) &&
        (cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === ''))) continue;
    if (key === 'time' && timeFromOwnCell && typeof stored === 'string') continue;
    (rewritten ??= {})[key] = cell;
  }
  if (rewritten) mapped._raw = rewritten;
}

/**
 * The order in which other scale-named columns stand in for the event magnitude when a
 * row has no Mw, generic or ML magnitude: the moment-magnitude variants first (the same
 * size measure as Mw: W-phase, centroid, body-wave, regional, P-wave), then the
 * surface-wave and body-wave magnitudes (Ms before the earlier-saturating mb), then local
 * and duration magnitudes. Any other scale follows, in column order.
 */
const LAST_RESORT_MAGNITUDE_ORDER = [
  'Mw', 'Mww', 'Mwc', 'Mwb', 'Mwr', 'Mwp',
  'Ms', 'Ms_BB', 'mB', 'mb', 'mb_Lg',
  'ML', 'MLv', 'MLr', 'Md', 'Mc',
];

function lastResortMagnitudeRank(type: string): number {
  const rank = LAST_RESORT_MAGNITUDE_ORDER.indexOf(type);
  return rank < 0 ? LAST_RESORT_MAGNITUDE_ORDER.length : rank;
}

/**
 * Scale-named magnitude columns of a row other than those already read as the Mw, ML or
 * generic magnitude, with the scale their name states (inferMagnitudeTypeFromColumn, from
 * the name as written) and a numeric value, in column order. A column the alias table
 * gives to another field is that field, and in a row with split date columns 'mn' and 'ms'
 * are minutes and milliseconds, not the Nuttli (MN) or surface-wave (Ms) magnitudes.
 */
function otherMagnitudeScaleColumns(
  event: any,
  keys: string[],
  consumedKeys: Array<string | undefined>,
  shape: RowShape,
  facts: HeaderFacts
): Array<{ value: number; type: string; source: string }> {
  const out: Array<{ value: number; type: string; source: string }> = [];
  for (const key of keys) {
    const type = facts.scale(key);
    if (!type || consumedKeys.includes(key)) continue;
    if (shape.hasDateParts && (key.toLowerCase() === 'mn' || key.toLowerCase() === 'ms')) continue;
    const mappedTo = facts.lookup(key)?.targetField;
    if (mappedTo !== undefined && mappedTo !== 'magnitude') continue;
    const value = safeParseFloat(event[key]);
    if (value !== null) out.push({ value, type, source: key });
  }
  return out;
}

/**
 * Mapping report entry showing how a field was mapped
 */
export interface MappingReportEntry {
  targetField: string;
  sourceField: string;
  matchType: 'exact' | 'alias' | 'synthesized';
}

/**
 * Record how a field was mapped. One entry per target: a later decision (the magnitude
 * scale column, a combined date and time) replaces the first-pass entry, so the report
 * names the column the stored value actually came from.
 */
function reportMapping(report: MappingReportEntry[] | null, entry: MappingReportEntry): void {
  if (!report) return;
  const existing = report.findIndex((e) => e.targetField === entry.targetField);
  if (existing >= 0) report[existing] = entry;
  else report.push(entry);
}

/** The first of the keys whose cell holds a value. */
function firstPopulated(event: any, keys: string[]): { key: string; value: unknown } | undefined {
  for (const key of keys) {
    const value = event[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return { key, value };
  }
  return undefined;
}

/** Other magnitudes than the selected one, without repeats of it. */
function magnitudeAlternatives(
  selected: { value: number; type: string },
  others: Array<{ value: number; type: string }>
): Array<{ type: string; mag: { value: number } }> {
  return others
    .filter((c) => !(c.value === selected.value && c.type.toLowerCase() === selected.type.toLowerCase()))
    .filter((c) => c.type !== 'unknown' || c.value !== selected.value)
    .map((c) => ({ type: c.type, mag: { value: c.value } }));
}

const GENERIC_MAGNITUDE_KEYS = ['magnitude', 'Magnitude', 'MAGNITUDE', 'Mag', 'MAG', 'mag', 'm', 'M', 'mpref', 'prefmag', 'pref_magnitude'];
const MW_MAGNITUDE_KEYS = ['Mw', 'MW', 'mw'];
const ML_MAGNITUDE_KEYS = ['ML', 'ml'];

/**
 * Map common field name variations to standard names using FIELD_ALIASES
 * This is the single source of truth for field mappings, shared with the UI
 * @param event - The event object to map
 * @param dateFormat - Optional date format hint for ambiguous dates
 * @param includeMappingReport - Whether to include _mappingReport in the result
 * @param momentTensorScale - Optional file-level moment-tensor unit decision
 *                            (see inferMomentTensorScaleForFile)
 * @param adjustments - Optional per-file counts of wrapped longitudes and sentinels
 * @param context - The file's header facts and date decisions (one per parse)
 */
function mapCommonFields(
  event: any,
  dateFormat?: DateFormat,
  includeMappingReport: boolean = false,
  momentTensorScale?: MomentTensorScale,
  adjustments?: RowAdjustmentCounts,
  context: RowContext = { facts: new HeaderFacts(), twoDigitYears: false }
): ParsedEvent {
  const { facts } = context;
  const mapped: any = { ...event };
  const report: MappingReportEntry[] | null = includeMappingReport ? [] : null;
  const keys = Object.keys(event);
  const shape = facts.shapeOf(keys);

  // Track which target fields have been set
  const setTargetFields = new Set<string>();
  // The column the alias pass read the event magnitude from, if any.
  let firstPassMagnitudeKey: string | undefined;

  // First pass: check for exact matches and aliases using pre-computed lookup
  for (const sourceKey of keys) {
    const value = event[sourceKey];
    // Exact spelling first, then lower case, then the normalised name (see HeaderFacts)
    const lookup = facts.lookup(sourceKey);
    if (!lookup) continue;
    const { targetField, isExact } = lookup;
    const numeric = NUMERIC_EVENT_FIELDS.has(targetField);
    const hasValue = value !== undefined && value !== null && String(value).trim() !== '';

    // A blank alias column must not claim the target ahead of a populated one
    // (`mag` empty, `magnitude` 4.1 used to reject the row).
    const claimedByBlank =
      setTargetFields.has(targetField) && numeric &&
      (mapped[targetField] === null || mapped[targetField] === undefined) && hasValue;
    if (setTargetFields.has(targetField) && !claimedByBlank) continue;

    if (numeric) {
      // Always set numeric fields (null if invalid) to ensure proper validation.
      let numValue = safeParseFloat(value);
      if (numValue !== null && targetField === 'longitude') {
        // 0-360 longitudes (Kermadec 182.7) are wrapped to -180..180 on every path.
        const wrapped = wrapLongitude(numValue);
        if (wrapped !== numValue && adjustments) adjustments.wrappedLongitudes += 1;
        numValue = wrapped;
      }
      if (numValue !== null && numValue < 0 && NON_NEGATIVE_EVENT_FIELDS.has(targetField)) {
        // -1 / -999 in an uncertainty, count, gap or distance means "not determined".
        numValue = null;
        if (adjustments) adjustments.sentinelValues += 1;
      }
      mapped[targetField] = numValue;
      setTargetFields.add(targetField);
      if (targetField === 'magnitude' && numValue !== null) firstPassMagnitudeKey = sourceKey;
      if (hasValue) {
        reportMapping(report, { targetField, sourceField: sourceKey, matchType: isExact ? 'exact' : 'alias' });
      }
      continue;
    }

    // mapped starts as a copy of the row, so a populated column named exactly like the
    // target (`time`) already holds the value, and wins over its aliases in any order.
    const existingValue = mapped[targetField];
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
      setTargetFields.add(targetField);
      reportMapping(report, { targetField, sourceField: targetField, matchType: 'exact' });
      continue;
    }

    // For non-numeric fields, only set if value is not empty
    if (value !== undefined && value !== null && value !== '') {
      mapped[targetField] = value;
      setTargetFields.add(targetField);
      reportMapping(report, { targetField, sourceField: sourceKey, matchType: isExact ? 'exact' : 'alias' });
    }
  }

  // A date column and a time-of-day column (or hour/minute/second columns) together
  // make the origin time.
  const combined = combineDateAndTimeOfDay(event, mapped.time, dateFormat, shape, context);
  if (combined) {
    mapped.time = combined.value;
    reportMapping(report, { targetField: 'time', sourceField: combined.sources.join('+'), matchType: 'synthesized' });
  }

  // Special handling for 'time' field - synthesize from split date/time columns if needed
  if (!mapped.time) {
    const synthesized = synthesizeTimestamp(event, shape.components);
    if (synthesized) {
      mapped.time = synthesized.iso;
      reportMapping(report, { targetField: 'time', sourceField: synthesized.keys.join('+'), matchType: 'synthesized' });
    }
  }

  // A date with no time of day is stored at midnight UTC; the file is told how many.
  if (adjustments && (isDateNumber(mapped.time) || (typeof mapped.time === 'string' && isDateOnly(mapped.time.trim())))) {
    adjustments.dateOnlyTimes += 1;
  }

  // Normalize timestamp to ISO 8601 UTC. normalizeTimestamp resolves an ambiguous
  // day/month order with the file-level hint in every shape it reads (with or without
  // seconds or a zone designator, two- or four-digit years), and reads a zone-less time
  // as UTC, never in the server's local time.
  if (mapped.time) {
    const normalized = normalizeTimestamp(mapped.time, dateFormatHint(dateFormat), { twoDigitYears: context.twoDigitYears });
    if (normalized) {
      mapped.time = normalized;
    }
  }

  // Magnitude columns are resolved from the RAW row, independent of column order:
  // a scale-named Mw column wins, then the file's generic magnitude (with its stated
  // type), then a scale-named ML column. Only a row with none of those takes another
  // scale-named column (Ms, mb ...) as its magnitude, in LAST_RESORT_MAGNITUDE_ORDER, so
  // an Ms-only or mb-only bulletin imports with its own scale. Every other value present
  // is kept as an alternative in `magnitudes`, so nothing the file reported is discarded.
  {
    const mwRaw = firstPopulated(event, MW_MAGNITUDE_KEYS);
    const mlRaw = firstPopulated(event, ML_MAGNITUDE_KEYS);
    const genericRaw = firstPopulated(event, GENERIC_MAGNITUDE_KEYS);
    const mw = mwRaw === undefined ? null : safeParseFloat(mwRaw.value);
    const ml = mlRaw === undefined ? null : safeParseFloat(mlRaw.value);
    const generic = genericRaw === undefined ? null : safeParseFloat(genericRaw.value);
    const explicitType = typeof mapped.magnitude_type === 'string' && mapped.magnitude_type.trim() !== ''
      ? String(mapped.magnitude_type).trim()
      : null;

    // Every other scale-named column (mb, mB, Ms, Md, Mwp, MLv ...) is a further
    // measurement of the same event, typed by its column name.
    const otherScales = otherMagnitudeScaleColumns(event, keys, [mwRaw?.key, mlRaw?.key, genericRaw?.key], shape, facts);

    if (mw !== null || ml !== null) {
      const candidates: Array<{ value: number; type: string; source: string }> = [];
      if (mw !== null) candidates.push({ value: mw, type: 'Mw', source: mwRaw!.key });
      if (generic !== null) candidates.push({ value: generic, type: explicitType ?? 'unknown', source: genericRaw!.key });
      if (ml !== null) candidates.push({ value: ml, type: 'ML', source: mlRaw!.key });
      candidates.push(...otherScales);
      const selected = candidates[0];
      const alternatives = magnitudeAlternatives(selected, candidates.slice(1));
      mapped.magnitude = selected.value;
      mapped.magnitude_type = selected.type === 'unknown' ? (explicitType ?? undefined) : selected.type;
      if (mapped.magnitude_type === undefined) delete mapped.magnitude_type;
      if (alternatives.length > 0 && !mapped.magnitudes) mapped.magnitudes = JSON.stringify(alternatives);
      reportMapping(report, { targetField: 'magnitude', sourceField: selected.source, matchType: 'exact' });
      if (selected.type !== 'unknown' && selected.source !== genericRaw?.key) {
        // The scale is the column's name, not a cell. A generic magnitude's type came from
        // the type column, whose first-pass entry stays the reported source.
        reportMapping(report, { targetField: 'magnitude_type', sourceField: selected.source, matchType: 'synthesized' });
      }
    } else if (typeof mapped.magnitude === 'number') {
      // The generic magnitude the alias pass found stays the event magnitude. A column
      // that reached it by a normalised name and states a scale ('m_l') gives its type.
      const scale = firstPassMagnitudeKey === undefined ? null : facts.scale(firstPassMagnitudeKey);
      if (scale && !explicitType) {
        mapped.magnitude_type = scale;
        reportMapping(report, { targetField: 'magnitude_type', sourceField: firstPassMagnitudeKey!, matchType: 'synthesized' });
      }
      const selected = { value: mapped.magnitude, type: String(mapped.magnitude_type ?? 'unknown') };
      const alternatives = magnitudeAlternatives(selected, otherScales.filter((c) => c.source !== firstPassMagnitudeKey));
      if (alternatives.length > 0 && !mapped.magnitudes) mapped.magnitudes = JSON.stringify(alternatives);
    } else if (otherScales.length > 0) {
      // No Mw, generic or ML magnitude: the best-ranked other scale stands in, typed by
      // its column name, and the rest are kept as alternatives.
      const ranked = otherScales
        .map((column, index) => ({ column, index }))
        .sort((a, b) => lastResortMagnitudeRank(a.column.type) - lastResortMagnitudeRank(b.column.type) || a.index - b.index)
        .map(({ column }) => column);
      const selected = ranked[0];
      const alternatives = magnitudeAlternatives(selected, otherScales.filter((c) => c !== selected));
      mapped.magnitude = selected.value;
      mapped.magnitude_type = selected.type;
      if (alternatives.length > 0 && !mapped.magnitudes) mapped.magnitudes = JSON.stringify(alternatives);
      reportMapping(report, { targetField: 'magnitude', sourceField: selected.source, matchType: 'exact' });
      reportMapping(report, { targetField: 'magnitude_type', sourceField: selected.source, matchType: 'synthesized' });
    }
  }

  // Assemble focal mechanism from flat nodal-plane / moment-tensor columns if present
  if (!mapped.focal_mechanisms && shape.hasFocalMechanismColumns) {
    const fm = assembleFocalMechanismFromRow(event, momentTensorScale);
    if (fm) {
      mapped.focal_mechanisms = JSON.stringify([fm]);
      reportMapping(report, { targetField: 'focal_mechanisms', sourceField: 'strike1/dip1/rake1/Mxx/...', matchType: 'synthesized' });
    }
  }

  // Attach mapping report if requested
  if (report && report.length > 0) {
    mapped._mappingReport = report;
  }

  return mapped as ParsedEvent;
}

/**
 * Map one row, apply the file's depth unit, and keep the cells the event no longer holds
 * as written (attachRewrittenCells): the per-row steps every tabular parser shares.
 */
function mapTabularRow(
  row: Record<string, unknown>,
  dateFormat: DateFormat | undefined,
  includeMappingReport: boolean,
  momentTensorScale: MomentTensorScale | undefined,
  adjustments: RowAdjustmentCounts | undefined,
  context: RowContext,
  depthUnit: DepthUnitDecision,
  lengthDivisors: Record<string, number> | undefined
): { mappedEvent: ParsedEvent; depthOutcome: DepthOutcome } {
  const mappedEvent = mapCommonFields(row, dateFormat, includeMappingReport, momentTensorScale, adjustments, context);
  const depthOutcome = normalizeOptionalDepth(mappedEvent as Record<string, unknown>, depthUnit, lengthDivisors);
  const report = (mappedEvent as any)._mappingReport as FieldMappingTrace[] | undefined;
  const timeFromOwnCell = report
    ? report.some((entry) => entry.targetField === 'time' && entry.sourceField === 'time')
    : typeof row.time === 'string' && normalizeTimestamp(row.time, dateFormatHint(dateFormat), { twoDigitYears: context.twoDigitYears }) === mappedEvent.time;
  attachRewrittenCells(row, mappedEvent as Record<string, unknown>, timeFromOwnCell);
  return { mappedEvent, depthOutcome };
}

/**
 * Auto-detect file format and parse accordingly
 * Supports optional delimiter and date format specification for text files
 */
export function parseFile(content: string, filename: string, delimiter?: Delimiter, dateFormat?: DateFormat): ParseResult {
  const extension = filename.split('.').pop()?.toLowerCase();

  // Explicit extension-based routing (takes precedence)
  switch (extension) {
    case 'csv':
    case 'txt':
    case 'dat':
      debugLog(`[Parser] Parsing ${filename} as delimited text based on extension`);
      return parseCSV(content, delimiter, dateFormat);
    case 'json':
      debugLog(`[Parser] Parsing ${filename} as JSON based on extension`);
      return parseJSON(content, dateFormat);
    case 'geojson':
      debugLog(`[Parser] Parsing ${filename} as GeoJSON based on extension`);
      return parseGeoJSON(content, dateFormat);
    case 'xml':
    case 'qml':
    case 'quakeml':
      debugLog(`[Parser] Parsing ${filename} as QuakeML based on extension`);
      return parseQuakeML(content);
    default:
      // Try to auto-detect based on content
      debugLog(`[Parser] Auto-detecting format for ${filename}`);
      const trimmed = content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        debugLog(`[Parser] Auto-detected JSON format`);
        return parseJSON(content, dateFormat);
      } else if (trimmed.startsWith('<')) {
        debugLog(`[Parser] Auto-detected XML/QuakeML format`);
        return parseQuakeML(content);
      } else {
        debugLog(`[Parser] Defaulting to delimited text format`);
        return parseCSV(content, delimiter, dateFormat);
      }
  }
}

/**
 * Performance Optimization: Streaming CSV parser for large files
 */
export async function parseCSVStream(
  filePath: string,
  onEvent?: (event: ParsedEvent, lineNumber: number) => Promise<void> | void,
  onBatch?: (events: ParsedEvent[], startLine: number, endLine: number) => Promise<void> | void,
  batchSize: number = 100,
  delimiter?: Delimiter,
  dateFormat?: DateFormat
): Promise<{
  success: boolean;
  totalEvents: number;
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
  detectedFields: string[];
}> {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  let headers: string[] = [];
  let detectedFields: string[] = [];
  let lineNumber = 0;
  let totalEvents = 0;
  let batch: ParsedEvent[] = [];
  let batchStartLine = 0;
  let actualDelimiter = delimiter || ','; // Default to comma if not specified
  // A streaming parser only ever sees one line at a time, so the depth unit can only be
  // taken from the column name (see inferDepthUnit); otherwise values stay in km and an
  // unconverted metres file fails validateEvent() loudly instead of being half-converted.
  let depthUnit: DepthUnitDecision = DEPTH_UNIT_KM;
  let lengthDivisors: Record<string, number> | undefined;
  // A declared day/month order also settles two-digit years; a stream detects none.
  let rowContext: RowContext = {
    facts: new HeaderFacts(),
    twoDigitYears: dateFormat === 'US' || dateFormat === 'International',
  };

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity // Handle both \n and \r\n
  });

  // A quoted field may continue over several physical lines (RFC 4180 2.6): buffer
  // lines until the double quotes balance, then parse the record as one unit.
  let pendingRecord = '';
  let pendingStartLine = 0;
  let pendingLines = 0;
  const MAX_RECORD_LINES = 200;
  // Leading '#' comment lines are skipped; one that names the columns is the header when
  // the first line after them is data (see parseWithDelimiter / chooseCommentHeader).
  let headerParsed = false;
  const leadingComments: string[] = [];

  for await (const physicalLine of rl) {
    lineNumber++;

    if (!pendingRecord && !physicalLine.trim()) {
      continue; // Skip empty lines
    }
    if (!headerParsed && !pendingRecord && isCommentLine(physicalLine)) {
      leadingComments.push(physicalLine);
      continue;
    }

    if (pendingRecord) {
      pendingRecord += '\n' + physicalLine;
      pendingLines++;
    } else {
      pendingRecord = physicalLine;
      pendingStartLine = lineNumber;
      pendingLines = 1;
    }
    // Continue the record only while it ends inside a quoted field by the tokenizer's
    // own rule; counting every quote mistook a literal 12" for an open field and then
    // swallowed the rest of the file.
    if (endsInsideQuotedField(pendingRecord, actualDelimiter)) {
      if (pendingLines < MAX_RECORD_LINES) continue;
      errors.push({ line: pendingStartLine, message: `Unterminated quoted field starting on line ${pendingStartLine}` });
      pendingRecord = '';
      continue;
    }
    const line = pendingRecord;
    const recordLine = pendingStartLine;
    pendingRecord = '';

    // Parse header
    if (!headerParsed) {
      headerParsed = true;
      // Auto-detect delimiter from header if not specified
      if (!delimiter) {
        const detection = detectDelimiter(line);
        actualDelimiter = detection.delimiter;
        if (detection.confidence < 0.5) {
          warnings.push({
            line: recordLine,
            message: `Low confidence delimiter detection (${Math.round(detection.confidence * 100)}%). Using: ${actualDelimiter === '\t' ? 'tab' : actualDelimiter}`
          });
        }
      }

      let cells: string[] = [];
      try {
        cells = parseLine(line, actualDelimiter);
      } catch (error) {
        errors.push({
          line: recordLine,
          message: `Parse error: ${error instanceof Error ? error.message : String(error)}`
        });
      }
      const commentHeader = leadingComments.length > 0 && !isHeaderLikeRecord(cells)
        ? chooseCommentHeader(leadingComments, actualDelimiter, cells.length)
        : null;
      const headerIsComment = commentHeader !== null;
      const written = (commentHeader ?? cells).map((h, index) => (index === 0 ? stripHeaderCommentMarker(h) : h).trim());
      headers = uniqueHeaderNames(written.map((h) => h.toLowerCase()));
      detectedFields = [...headers];
      rowContext = {
        facts: new HeaderFacts(new Map(headers.map((h, i) => [h, written[i]])), positionalMinuteColumn(headers)),
        twoDigitYears: rowContext.twoDigitYears,
      };
      depthUnit = inferDepthUnit(findSourceKeyForTarget(headers, 'depth', rowContext.facts), []);
      lengthDivisors = uncertaintyDivisors(headers, depthUnit, rowContext.facts);
      if (!headerIsComment) {
        batchStartLine = lineNumber + 1;
        continue;
      }
      // The comment was the header, so this line is the first data row.
      batchStartLine = recordLine;
    }

    try {
      // Same guard-strip as parseWithDelimiter, for parity with the buffered path.
      const values = parseLine(line, actualDelimiter).map(stripSpreadsheetFormulaGuard);

      if (values.length !== headers.length) {
        errors.push({
          line: recordLine,
          message: `Column count mismatch: expected ${headers.length}, got ${values.length}`
        });
        continue;
      }

      const event: any = {};
      headers.forEach((header, index) => {
        event[header] = values[index];
      });

      // Map common field names
      const { mappedEvent } = mapTabularRow(event, dateFormat, false, undefined, undefined, rowContext, depthUnit, lengthDivisors);

      // Validate the event
      const validation = validateEvent(mappedEvent);
      if (!validation.valid) {
        errors.push({
          line: recordLine,
          message: `Validation failed: ${validation.errors.join(', ')}`
        });
        continue;
      }

      totalEvents++;

      // Call per-event callback if provided
      if (onEvent) {
        await onEvent(mappedEvent, recordLine);
      }

      // Accumulate for batch processing
      if (onBatch) {
        batch.push(mappedEvent);

        if (batch.length >= batchSize) {
          await onBatch(batch, batchStartLine, lineNumber);
          batch = [];
          batchStartLine = lineNumber + 1;
        }
      }
    } catch (error) {
      errors.push({
        line: lineNumber,
        message: `Parse error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  // A record still open at end of input was never closed: report it instead of
  // silently discarding the row (and everything it had absorbed).
  if (pendingRecord) {
    errors.push({ line: pendingStartLine, message: `Unterminated quoted field starting on line ${pendingStartLine}: the file ended inside it` });
  }

  // Process remaining batch
  if (onBatch && batch.length > 0) {
    await onBatch(batch, batchStartLine, lineNumber);
  }

  return {
    success: errors.length === 0,
    totalEvents,
    errors,
    warnings,
    detectedFields
  };
}

/**
 * Performance Optimization: Streaming JSON parser for large NDJSON files
 */
export async function parseJSONStream(
  filePath: string,
  onEvent?: (event: ParsedEvent, lineNumber: number) => Promise<void> | void,
  onBatch?: (events: ParsedEvent[], startLine: number, endLine: number) => Promise<void> | void,
  batchSize: number = 100,
  dateFormat?: DateFormat
): Promise<{
  success: boolean;
  totalEvents: number;
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
}> {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  let lineNumber = 0;
  let totalEvents = 0;
  let batch: ParsedEvent[] = [];
  let batchStartLine = 1;

  // The depth unit and the date format are properties of the FILE, not of a record, so
  // they are decided ONCE (see inferDepthUnit) and then applied to every record - the
  // same decisions parseJSON makes for the identical content held in an array. A stream
  // cannot look at the whole file, so the first SAMPLE_RECORDS records are held back,
  // the decisions are taken from them, and the held records are then processed with the
  // rest. The buffer is bounded, so memory stays constant.
  const SAMPLE_RECORDS = 200;
  const pending: Array<{ data: any; line: number }> = [];
  let decisionsMade = false;
  let depthUnit: DepthUnitDecision = DEPTH_UNIT_KM;
  let lengthDivisors: Record<string, number> | undefined;
  let actualDateFormat = dateFormat;
  const facts = new HeaderFacts();
  let rowContext: RowContext = { facts, twoDigitYears: false };

  const makeFileLevelDecisions = () => {
    decisionsMade = true;
    const sample = pending.filter((rec) => rec.data !== null && typeof rec.data === 'object');
    const keys = sample.length > 0 ? Object.keys(sample[0].data) : [];

    const depthKey = findSourceKeyForTarget(keys, 'depth', facts);
    depthUnit = inferDepthUnit(
      depthKey,
      depthKey === null
        ? []
        : sample.reduce<number[]>((acc, rec) => {
            const v = safeParseFloat(rec.data[depthKey]);
            if (v !== null) acc.push(v);
            return acc;
          }, [])
    );
    if (depthUnit.divisor !== 1) {
      warnings.push({ line: 0, message: metresDepthWarning(depthUnit) });
    }
    lengthDivisors = uncertaintyDivisors(keys, depthUnit, facts);

    // Every held record's time cells, not the first 50 (see decideFileDateFormat).
    const timeCells: unknown[] = [];
    for (const rec of sample) {
      for (const key of timeSourceKeys(Object.keys(rec.data), facts)) timeCells.push(rec.data[key]);
    }
    const dateDecision = applyDateDecision(decideFileDateFormat(timeCells, dateFormat), warnings);
    actualDateFormat = dateDecision.dateFormat ?? dateFormat;
    rowContext = {
      facts,
      twoDigitYears: dateDecision.twoDigitYears === true,
      timeOfDayColumn: findTimeOfDayColumn(keys, facts, (key) => sample.slice(0, 50).map((rec) => rec.data[key])),
    };
  };

  const processRecord = async (eventData: any, line: number) => {
    try {
      const { mappedEvent } = mapTabularRow(eventData, actualDateFormat, false, undefined, undefined, rowContext, depthUnit, lengthDivisors);

      // Validate the event
      const validation = validateEvent(mappedEvent);
      if (!validation.valid) {
        errors.push({
          line,
          message: `Validation failed: ${validation.errors.join(', ')}`
        });
        return;
      }

      totalEvents++;

      // Call per-event callback if provided
      if (onEvent) {
        await onEvent(mappedEvent, line);
      }

      // Accumulate for batch processing
      if (onBatch) {
        batch.push(mappedEvent);

        if (batch.length >= batchSize) {
          await onBatch(batch, batchStartLine, line);
          batch = [];
          batchStartLine = line + 1;
        }
      }
    } catch (error) {
      errors.push({
        line,
        message: `Parse error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  const flushPending = async () => {
    for (const rec of pending) {
      await processRecord(rec.data, rec.line);
    }
    pending.length = 0;
  };

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    lineNumber++;

    if (!line.trim()) {
      continue; // Skip empty lines
    }

    let eventData: any;
    try {
      // Records of this platform's own JSON export are read flat, as parseJSON reads them.
      eventData = flattenExportedEventRecord(JSON.parse(line));
    } catch (error) {
      errors.push({
        line: lineNumber,
        message: `Parse error: ${error instanceof Error ? error.message : String(error)}`
      });
      continue;
    }

    if (!decisionsMade) {
      pending.push({ data: eventData, line: lineNumber });
      if (pending.length >= SAMPLE_RECORDS) {
        makeFileLevelDecisions();
        await flushPending();
      }
      continue;
    }

    await processRecord(eventData, lineNumber);
  }

  // Short file: the sample never filled, so decide from what was read and process it.
  if (!decisionsMade) {
    makeFileLevelDecisions();
    await flushPending();
  }

  // Process remaining batch
  if (onBatch && batch.length > 0) {
    await onBatch(batch, batchStartLine, lineNumber);
  }

  return {
    success: errors.length === 0,
    totalEvents,
    errors,
    warnings
  };
}
