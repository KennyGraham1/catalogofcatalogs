/**
 * File parsers for different earthquake catalogue formats
 *
 * Performance Optimization: Includes streaming parsers for memory-efficient
 * processing of large files (100MB+) with constant memory usage.
 */

import { validateEvent, normalizeTimestamp } from './earthquake-utils';
import { summarizeValidationFailures, validateEventWithDetails, type FieldMappingTrace, type ValidationEventContext, type ValidationFailureDetail, type ValidationFailureReport } from './validation';
import { validateEventCrossFields } from './cross-field-validation';
import { parseQuakeMLEvent } from './quakeml-parser';
import { quakemlEventToDbFields } from './quakeml-to-db';
import * as sax from 'sax';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { detectDelimiter, parseLine, parseWithDelimiter, stripHeaderCommentMarker, endsInsideQuotedField, type Delimiter } from './delimiter-detector';
import { stripSpreadsheetFormulaGuard } from './export-utils';
import { parseGeoJSON } from './geojson-parser';
import { detectDateFormat, type DateFormat } from './date-format-detector';
import { FIELD_ALIASES } from './field-definitions';
import type { ParsedEvent } from '@/types/upload';
import type { QuakeMLEvent } from './types/quakeml';

// Re-export ParsedEvent for consumers of this module
export type { ParsedEvent } from '@/types/upload';

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
}

const MAX_PARSE_WARNINGS = 200;
const LARGE_QUAKEML_STREAM_THRESHOLD = 5 * 1024 * 1024;
const STREAM_PARSE_EVENT_BATCH_SIZE = 500;

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
 */
function escapeBareAmpersands(content: string): string {
  if (content.indexOf('&') === -1) return content;
  // CDATA sections and comments are literal text: leave their ampersands alone.
  return content
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/&(?!(?:[A-Za-z][A-Za-z0-9._-]*|#[0-9]+|#x[0-9A-Fa-f]+);)/g, '&amp;')))
    .join('');
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
  validationAccumulator: ValidationAccumulator
): { event?: ParsedEvent; error?: { line: number; message: string }; warnings: string[] } {
  const warnings: string[] = [];

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

  const event: ParsedEvent = {
    time: origin.time.value,
    latitude: origin.latitude.value,
    longitude: origin.longitude.value,
    depth: origin.depth ? origin.depth.value / 1000 : undefined,
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
  appendCrossFieldFailures(validationAccumulator, event, context);

  return { event, warnings };
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
    appendParserFailure(validationAccumulator, { line: 0 }, 'File is empty');
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message: 'File is empty' }],
      warnings: [],
      detectedFields: [],
      validationReport: summarizeValidationFailures(validationAccumulator.failures, {
        totalEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
      })
    };
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
  let rows: string[][];
  try {
    ({ headers, rows } = parseWithDelimiter(content, actualDelimiter));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to tokenize delimited content';
    appendParserFailure(validationAccumulator, { line: 0 }, message);
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message }],
      warnings,
      detectedFields: [],
      validationReport: summarizeValidationFailures(validationAccumulator.failures, {
        totalEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
      })
    };
  }
  const detectedFields = [...headers];

  // Auto-detect date format if not specified
  let actualDateFormat = dateFormat;
  if (!actualDateFormat || actualDateFormat === 'Unknown') {
    // Find time column
    const timeAliases = new Set([
      'time', 'datetime', 'date', 'origin_time', 'origintime', 'timestamp', 'ot', 'otime', 'origin',
    ]);
    const timeColumnIndex = headers.findIndex((h) => timeAliases.has(h.toLowerCase()));

    if (timeColumnIndex >= 0) {
      // Extract date strings from time column
      const dateStrings = rows
        .map(row => row[timeColumnIndex])
        .filter(val => val && val.trim().length > 0)
        .slice(0, 50); // Sample first 50 dates

      if (dateStrings.length > 0) {
        const detection = detectDateFormat(dateStrings);
        actualDateFormat = detection.format;

        if (detection.confidence < 0.5) {
          warnings.push({
            line: 0,
            message: `Low confidence date format detection (${Math.round(detection.confidence * 100)}%). ${detection.reasoning}`
          });
        } else if (detection.format !== 'ISO' && detection.format !== 'Unknown') {
          warnings.push({
            line: 0,
            message: `Detected ${detection.format} date format. ${detection.reasoning}`
          });
        }
      }
    }
  }

  if (headers.length === 0) {
    appendParserFailure(validationAccumulator, { line: 0 }, 'No headers found in file');
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message: 'No headers found in file' }],
      warnings: [],
      detectedFields: [],
      validationReport: summarizeValidationFailures(validationAccumulator.failures, {
        totalEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
      })
    };
  }

  // Decide the depth unit ONCE for the whole file (see inferDepthUnit)
  const depthColumn = findSourceKeyForTarget(headers, 'depth');
  // lastIndexOf: duplicate header names collapse to one key, and the LAST column wins
  const depthColumnIndex = depthColumn === null ? -1 : headers.lastIndexOf(depthColumn);
  const depthUnit = inferDepthUnit(
    depthColumn,
    depthColumnIndex < 0
      ? []
      : rows.reduce<number[]>((acc, row) => {
          const v = safeParseFloat(row[depthColumnIndex]);
          if (v !== null) acc.push(v);
          return acc;
        }, [])
  );
  if (depthUnit.divisor !== 1) {
    warnings.push({
      line: 0,
      message: `Depth interpreted as metres and converted to kilometres (${depthUnit.reason}). ` +
               'Depth and horizontal uncertainty were divided by 1000 with it.'
    });
  }

  // Decide the moment-tensor unit ONCE for the whole file (see inferMomentTensorScaleForFile).
  // headers are lower-cased above, so the column lookup is too.
  const momentTensorIndices = MOMENT_TENSOR_COMPONENT_KEYS.map((key) => headers.indexOf(key.toLowerCase()));
  const headerRow = Object.fromEntries(headers.map((h) => [h, '']));
  const scalarMomentIndex = scalarMomentKeysFor(headerRow).reduce<number>(
    (found, key) => (found >= 0 ? found : headers.indexOf(key.toLowerCase())),
    -1
  );
  const momentTensorScale = momentTensorIndices.every((index) => index < 0)
    ? MOMENT_TENSOR_SCALE_SI
    : inferMomentTensorScaleForFile(rows.length, (i) => ({
        components: momentTensorIndices.map((index) => (index < 0 ? null : safeParseFloat(rows[i][index]))),
        Mo: scalarMomentIndex < 0 ? null : safeParseFloat(rows[i][scalarMomentIndex]),
      }));

  // Parse data rows
  for (let i = 0; i < rows.length; i++) {
    const values = rows[i];
    const lineNumber = i + 2; // +2 because line 1 is header, and i is 0-based
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
      const mappedEvent = mapCommonFields(event, actualDateFormat, true, momentTensorScale);
      normalizeOptionalDepth(mappedEvent as Record<string, unknown>, depthUnit);
      const mappingReport = (mappedEvent as any)._mappingReport as FieldMappingTrace[] | undefined;
      const context: ValidationEventContext = {
        line: lineNumber,
        eventIndex: i,
        eventId: (mappedEvent.eventId || mappedEvent.id || null) as string | null,
        rawEvent: event,
        mappingReport,
      };

      // Validate the event
      const validation = validateEventWithDetails(mappedEvent, context);
      if (!validation.valid) {
        const errorMessages = validation.failures
          .filter(failure => failure.severity === 'error')
          .map(failure => failure.message);
        errors.push({
          line: lineNumber,
          message: errorMessages.join('; ')
        });
        validationAccumulator.invalidEvents += 1;
        validationAccumulator.failures.push(...validation.failures);
        continue;
      }

      validationAccumulator.validEvents += 1;
      validationAccumulator.failures.push(...validation.failures);
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
    })
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

  try {
    const data = JSON.parse(content);

    // Check if this is GeoJSON format
    if (data.type === 'FeatureCollection' || data.type === 'Feature') {
      debugLog('[Parser] Detected GeoJSON format, using specialized parser');
      return parseGeoJSON(content);
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
      return parseGeoJSON(content);
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
        const message = `Multiple array properties found: ${arrayProps.join(', ')}. Please use one of: events, data, features, earthquakes, results`;
        appendParserFailure(validationAccumulator, { line: 0 }, message);
        return {
          success: false,
          events: [],
          errors: [{ line: 0, message }],
          warnings: [],
          detectedFields: [],
          validationReport: summarizeValidationFailures(validationAccumulator.failures, {
            totalEvents: 0,
            validEvents: 0,
            invalidEvents: 0,
          })
        };
      } else {
        const message = 'Unrecognized JSON structure. Expected an array or object with events/data/features property';
        appendParserFailure(validationAccumulator, { line: 0 }, message);
        return {
          success: false,
          events: [],
          errors: [{ line: 0, message }],
          warnings: [],
          detectedFields: [],
          validationReport: summarizeValidationFailures(validationAccumulator.failures, {
            totalEvents: 0,
            validEvents: 0,
            invalidEvents: 0,
          })
        };
      }
    }

    // Detect fields from first event
    if (eventArray.length > 0) {
      detectedFields = Object.keys(eventArray[0]);
    }

    // Decide the depth unit ONCE for the whole file (see inferDepthUnit)
    const depthKey = findSourceKeyForTarget(detectedFields, 'depth');
    const depthUnit = inferDepthUnit(
      depthKey,
      depthKey === null
        ? []
        : eventArray.reduce<number[]>((acc, item) => {
            const v = safeParseFloat(item?.[depthKey]);
            if (v !== null) acc.push(v);
            return acc;
          }, [])
    );
    if (depthUnit.divisor !== 1) {
      warnings.push({
        line: 0,
        message: `Depth interpreted as metres and converted to kilometres (${depthUnit.reason}). ` +
                 'Depth and horizontal uncertainty were divided by 1000 with it.'
      });
    }

    // Decide the moment-tensor unit ONCE for the whole file (see inferMomentTensorScaleForFile)
    const momentTensorScale = inferMomentTensorScaleForFile(eventArray.length, (i) => {
      const item = eventArray[i];
      if (item === null || typeof item !== 'object') return null;
      return {
        components: MOMENT_TENSOR_COMPONENT_KEYS.map((key) => readRowNumber(item, [key])),
        Mo: readRowNumber(item, scalarMomentKeysFor(item)),
      };
    });

    // Parse each event
    eventArray.forEach((item, index) => {
      try {
        const mappedEvent = mapCommonFields(item, dateFormat, true, momentTensorScale);
        normalizeOptionalDepth(mappedEvent as Record<string, unknown>, depthUnit);
        const mappingReport = (mappedEvent as any)._mappingReport as FieldMappingTrace[] | undefined;
        const context: ValidationEventContext = {
          line: index + 1,
          eventIndex: index,
          eventId: (mappedEvent.eventId || mappedEvent.id || null) as string | null,
          rawEvent: item,
          mappingReport,
        };
        validationAccumulator.totalEvents += 1;
        const validation = validateEventWithDetails(mappedEvent, context);

        if (!validation.valid) {
          const errorMessages = validation.failures
            .filter(failure => failure.severity === 'error')
            .map(failure => failure.message);
          errors.push({
            line: index + 1,
            message: errorMessages.join('; ')
          });
          validationAccumulator.invalidEvents += 1;
          validationAccumulator.failures.push(...validation.failures);
          return;
        }

        validationAccumulator.validEvents += 1;
        validationAccumulator.failures.push(...validation.failures);
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

  } catch (error) {
    const message = 'Invalid JSON format';
    appendParserFailure(validationAccumulator, { line: 0 }, message);
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message }],
      warnings: [],
      detectedFields: [],
      validationReport: summarizeValidationFailures(validationAccumulator.failures, {
        totalEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
      })
    };
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
    })
  };
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
      appendParserFailure(validationAccumulator, { line: 0 }, 'No events found in QuakeML file');
      return {
        success: false,
        events: [],
        errors: [{ line: 0, message: 'No events found in QuakeML file' }],
        warnings: [],
        detectedFields: [],
        validationReport: summarizeValidationFailures(validationAccumulator.failures, {
          totalEvents: 0,
          validEvents: 0,
          invalidEvents: 0,
        })
      };
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
          validationAccumulator
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
    appendParserFailure(validationAccumulator, { line: 0 }, message);
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message }],
      warnings: [],
      detectedFields: [],
      validationReport: summarizeValidationFailures(validationAccumulator.failures, {
        totalEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
      })
    };
  }

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
    })
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
            validationAccumulator
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

    fileStream.pipe(parser);
  });

  if (index === 0) {
    appendParserFailure(validationAccumulator, { line: 0 }, 'No events found in QuakeML file');
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message: 'No events found in QuakeML file' }],
      warnings: [],
      detectedFields: [],
      validationReport: summarizeValidationFailures(validationAccumulator.failures, {
        totalEvents: 0,
        validEvents: 0,
        invalidEvents: 0,
      })
    };
  }

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
    })
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

  const strike1 = get(['strike1', 'Strike1']);
  const dip1    = get(['dip1',    'Dip1']);
  const rake1   = get(['rake1',   'Rake1']);
  const strike2 = get(['strike2', 'Strike2']);
  const dip2    = get(['dip2',    'Dip2']);
  const rake2   = get(['rake2',   'Rake2']);

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

/**
 * Synthesize a timestamp from separate date/time component columns
 * Supports common variations: year/month/day/hour/minute/second, yr/mo/dy/hr/mn/sc, etc.
 * @param event - The event object with potential date/time component fields
 * @returns ISO 8601 formatted timestamp string, or null if components are missing
 */
function synthesizeTimestamp(event: any): string | null {
  // Define possible field name variations for each component (case-insensitive matching)
  const yearFields = ['year', 'yr', 'yyyy', 'yy'];
  const monthFields = ['month', 'mon', 'mo', 'mm'];
  const dayFields = ['day', 'dy', 'dd', 'dom'];
  const hourFields = ['hour', 'hr', 'hh', 'hours'];
  const minuteFields = ['minute', 'min', 'mn', 'minutes'];
  const secondFields = ['second', 'sec', 'ss', 'seconds'];

  // Helper to find a field value by checking multiple possible names
  const findField = (fieldNames: string[]): number | null => {
    for (const name of fieldNames) {
      // Check exact match and case-insensitive match
      for (const key of Object.keys(event)) {
        if (key.toLowerCase() === name.toLowerCase()) {
          const value = event[key];
          if (value !== undefined && value !== null && value !== '' && !isNaN(Number(value))) {
            return Number(value);
          }
        }
      }
    }
    return null;
  };

  // Extract date/time components
  const year = findField(yearFields);
  const month = findField(monthFields);
  const day = findField(dayFields);
  const hour = findField(hourFields);
  const minute = findField(minuteFields);
  const second = findField(secondFields);

  // Require at least year, month, and day to synthesize a timestamp
  if (year === null || month === null || day === null) {
    return null;
  }

  // Default time components to 0 if not present
  const h = hour ?? 0;
  const m = minute ?? 0;
  const s = second ?? 0;

  // Assemble on the calendar, then add the seconds as a duration, so a fractional
  // second rounds and carries correctly: 59.9999 s is 60.000 s, i.e. the next minute,
  // not "59.100" from padding "1000" ms to three characters.
  if (![year, month, day, h, m, s].every(Number.isFinite)) return null;
  // Each component must be a valid calendar value: Date.UTC would otherwise roll
  // month 13 into the next year and map years 0-99 to 1900-1999.
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
      !Number.isInteger(h) || !Number.isInteger(m) ||
      month < 1 || month > 12 || day < 1 || day > 31 || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s >= 61) {
    return null;
  }
  const base = new Date(Date.UTC(2000, month - 1, day, h, m, 0, 0));
  base.setUTCFullYear(year);
  // A day beyond the month's length (31 April) would have rolled over silently.
  if (base.getUTCMonth() !== month - 1 || base.getUTCDate() !== day) return null;
  const instant = base.getTime() + Math.round(s * 1000);
  if (!Number.isFinite(instant)) return null;
  const iso = new Date(instant).toISOString();
  // Years before 1000 or after 9999 render in expanded form; keep the plain form.
  return iso.startsWith('+') || iso.startsWith('-') ? null : iso;
}

/**
 * Fields that should be parsed as numbers
 */
const NUMERIC_FIELDS = new Set([
  'latitude', 'longitude', 'depth', 'magnitude',
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
  'depth_uncertainty', 'horizontal_uncertainty', 'magnitude_uncertainty',
  'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'azimuth_max_horizontal_uncertainty',
  'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
  'minimum_distance', 'maximum_distance', 'associated_phase_count',
  'associated_station_count', 'depth_phase_count', 'magnitude_station_count'
]);

/**
 * Pre-computed alias lookup map for O(1) field matching
 * Maps lowercase alias -> { targetField, isExact }
 */
let aliasLookupCache: Map<string, { targetField: string; isExact: boolean }> | null = null;

function getAliasLookup(): Map<string, { targetField: string; isExact: boolean }> {
  if (aliasLookupCache) return aliasLookupCache;

  aliasLookupCache = new Map();
  for (const [targetField, aliases] of Object.entries(FIELD_ALIASES)) {
    // Add exact matches (case-sensitive, stored as-is and lowercase)
    for (const exact of aliases.exactMatches) {
      aliasLookupCache.set(exact, { targetField, isExact: true });
      aliasLookupCache.set(exact.toLowerCase(), { targetField, isExact: false });
    }
    // Add aliases (case-insensitive, stored lowercase)
    for (const alias of aliases.aliases) {
      const key = alias.toLowerCase();
      if (!aliasLookupCache.has(key)) {
        aliasLookupCache.set(key, { targetField, isExact: false });
      }
    }
  }
  return aliasLookupCache;
}

/**
 * Safely parse a numeric value, returning null for invalid values
 */
function safeParseFloat(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  if (str === '' || str.toLowerCase() === 'nan' || str.toLowerCase() === 'null') return null;
  // A numeric field holds a numeric literal. parseFloat's prefix tolerance turned
  // "4.1garbage" into 4.1 without a trace; a value that is not a number is
  // treated as absent so the row is rejected or flagged rather than silently altered.
  // Thousands separators and a trailing '%' or unit are NOT accepted: the column's
  // unit is decided per file (see inferDepthUnit), not per cell.
  if (!STRICT_NUMERIC_LITERAL.test(str)) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

const STRICT_NUMERIC_LITERAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

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
function findSourceKeyForTarget(keys: string[], targetField: string): string | null {
  const aliasLookup = getAliasLookup();
  for (const key of keys) {
    const lookup = aliasLookup.get(key) ?? aliasLookup.get(key.toLowerCase());
    if (lookup?.targetField === targetField) return key;
  }
  return null;
}

/**
 * Decide ONCE per file whether a depth column is reported in metres or kilometres.
 */
function inferDepthUnit(sourceColumn: string | null, values: number[]): DepthUnitDecision {
  const name = (sourceColumn ?? '').toLowerCase().replace(/[\s)\]]+$/, '');
  if (name) {
    if (/(?:^|[^a-z])(?:km|kilomet(?:re|er)s?)$/.test(name)) {
      return { divisor: 1, unit: 'km', reason: `column "${sourceColumn}" names kilometres` };
    }
    if (/(?:^|[^a-z])(?:m|met(?:re|er)s?)$/.test(name)) {
      return { divisor: 1000, unit: 'm', reason: `column "${sourceColumn}" names metres` };
    }
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

/**
 * Apply the file-level depth unit to an already-mapped event.
 */
function normalizeOptionalDepth(
  event: Record<string, unknown>,
  depthUnit: DepthUnitDecision = DEPTH_UNIT_KM
): void {
  if (depthUnit.divisor !== 1) {
    for (const key of ['depth_uncertainty', 'horizontal_uncertainty', 'min_horizontal_uncertainty', 'max_horizontal_uncertainty']) {
      const raw = safeParseFloat(event[key]);
      if (raw !== null) event[key] = raw / depthUnit.divisor;
    }
  }

  if (event.depth === undefined || event.depth === null || event.depth === '') return;

  const depth = safeParseFloat(event.depth);
  if (depth === null) {
    event.depth = null;
    return;
  }

  const depthKm = depth / depthUnit.divisor;
  // Null out impossible depths; allow -5 to 0 for above-sea-level events
  event.depth = depthKm < -5 || depthKm > 1000 ? null : depthKm;
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
 * Resolve a DD/MM/YYYY vs MM/DD/YYYY string using the date format detected for the FILE.
 */
function applyDateFormatHint(raw: string, hint?: 'US' | 'International'): string {
  if (!hint) return raw;

  // A trailing zone designator (Z, +13:00, -0500) does not change which field is the
  // day: with it the string used to skip this hint and fall to new Date(), which read
  // 03/04/2024 as March 4 under a declared International format.
  const match = raw.trim().match(
    /^(\d{1,2})([\/-])(\d{1,2})\2(\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i
  );
  if (!match) return raw;

  const [, first, , second, year, hour = '00', minute = '00', secs = '00', frac = '', zoneRaw = ''] = match;
  const zone = zoneRaw === '' || /^z$/i.test(zoneRaw)
    ? 'Z'
    : zoneRaw.length === 3 ? `${zoneRaw}:00`
    : zoneRaw.length === 5 ? `${zoneRaw.slice(0, 3)}:${zoneRaw.slice(3)}` : zoneRaw;
  const firstNum = parseInt(first, 10);
  const secondNum = parseInt(second, 10);

  let day: string;
  let month: string;
  if (firstNum > 12 && secondNum <= 12) {
    day = first; month = second;            // unambiguous DD/MM
  } else if (firstNum <= 12 && secondNum > 12) {
    month = first; day = second;            // unambiguous MM/DD
  } else if (firstNum <= 12 && secondNum <= 12) {
    // Ambiguous: the file-level hint decides (International/DD-MM is the default,
    // matching normalizeTimestamp's own ambiguous branch)
    if (hint === 'US') { month = first; day = second; } else { day = first; month = second; }
  } else {
    return raw;                             // both > 12: invalid, let normalizeTimestamp reject it
  }

  const millis = frac ? frac.padEnd(3, '0').slice(0, 3) : '000';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T` +
         `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${secs.padStart(2, '0')}.${millis}${zone}`;
}

/**
 * Map common field name variations to standard names using FIELD_ALIASES
 * This is the single source of truth for field mappings, shared with the UI
 * @param event - The event object to map
 * @param dateFormat - Optional date format hint for ambiguous dates
 * @param includeMappingReport - Whether to include _mappingReport in the result
 * @param momentTensorScale - Optional file-level moment-tensor unit decision
 *                            (see inferMomentTensorScaleForFile)
 */
function mapCommonFields(
  event: any,
  dateFormat?: DateFormat,
  includeMappingReport: boolean = false,
  momentTensorScale?: MomentTensorScale
): ParsedEvent {
  const mapped: any = { ...event };
  const aliasLookup = getAliasLookup();
  const mappingReport: MappingReportEntry[] = [];

  // Track which target fields have been set
  const setTargetFields = new Set<string>();

  // First pass: check for exact matches and aliases using pre-computed lookup
  for (const [sourceKey, value] of Object.entries(event)) {
    // Try exact match first, then lowercase
    let lookup = aliasLookup.get(sourceKey);
    if (!lookup) {
      lookup = aliasLookup.get(sourceKey.toLowerCase());
    }

    // A blank alias column must not claim the target ahead of a populated one
    // (`mag` empty, `magnitude` 4.1 used to reject the row).
    const claimedByBlank =
      lookup && setTargetFields.has(lookup.targetField) && NUMERIC_FIELDS.has(lookup.targetField) &&
      (mapped[lookup.targetField] === null || mapped[lookup.targetField] === undefined) &&
      value !== undefined && value !== null && String(value).trim() !== '';
    if (lookup && (!setTargetFields.has(lookup.targetField) || claimedByBlank)) {
      const { targetField, isExact } = lookup;

      // Skip if target field already has a valid value (but not for numeric fields with empty values)
      const existingValue = mapped[targetField];
      if (existingValue !== undefined && existingValue !== null && existingValue !== '' && !NUMERIC_FIELDS.has(targetField)) {
        continue;
      }

      // Parse value (with NaN handling for numeric fields)
      if (NUMERIC_FIELDS.has(targetField)) {
        const numValue = safeParseFloat(value);
        const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
        // Always set numeric fields (null if invalid) to ensure proper validation.
        // Normalize 0-360 longitude to -180..180 so valid Pacific/NZ events near 180 deg
        // are not rejected by the [-180,180] validation bound.
        mapped[targetField] =
          targetField === 'longitude' && typeof numValue === 'number' && numValue > 180 && numValue <= 360
            ? numValue - 360
            : numValue;
        setTargetFields.add(targetField);
        if (includeMappingReport && hasValue) {
          mappingReport.push({ targetField, sourceField: sourceKey, matchType: isExact ? 'exact' : 'alias' });
        }
      } else if (value !== undefined && value !== null && value !== '') {
        // For non-numeric fields, only set if value is not empty
        mapped[targetField] = value;
        setTargetFields.add(targetField);
        if (includeMappingReport) {
          mappingReport.push({ targetField, sourceField: sourceKey, matchType: isExact ? 'exact' : 'alias' });
        }
      }
    }
  }

  // Special handling for 'time' field - synthesize from split date/time columns if needed
  if (!mapped.time) {
    const synthesized = synthesizeTimestamp(event);
    if (synthesized) {
      mapped.time = synthesized;
      if (includeMappingReport) {
        mappingReport.push({ targetField: 'time', sourceField: 'year+month+day+hour+minute+second', matchType: 'synthesized' });
      }
    }
  }

  // Normalize timestamp to ISO 8601 format with date format hint
  if (mapped.time) {
    const formatHint = dateFormat === 'US' ? 'US' : dateFormat === 'International' ? 'International' : undefined;
    // Resolve the day/month order here: normalizeTimestamp's own hint-aware branches sit
    // below a generic new Date() fallback that silently wins for these strings.
    const hinted = typeof mapped.time === 'string' ? applyDateFormatHint(mapped.time, formatHint) : mapped.time;
    const normalized = normalizeTimestamp(hinted, formatHint);
    if (normalized) {
      mapped.time = normalized;
    }
  }

  // Magnitude columns are resolved from the RAW row, independent of column order:
  // a scale-named Mw column wins, then the file's generic magnitude (with its stated
  // type), then a scale-named ML column. Every other value present is kept as an
  // alternative in `magnitudes`, so nothing the file reported is discarded.
  {
    const pickRaw = (keys: string[]): unknown => {
      for (const k of keys) {
        const v = event[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      }
      return undefined;
    };
    const genericKeys = ['magnitude', 'Magnitude', 'MAGNITUDE', 'Mag', 'MAG', 'mag', 'm', 'M', 'mpref', 'prefmag', 'pref_magnitude'];
    const mwRaw = pickRaw(['Mw', 'MW', 'mw']);
    const mlRaw = pickRaw(['ML', 'ml']);
    const genericRaw = pickRaw(genericKeys);
    const mw = mwRaw === undefined ? null : safeParseFloat(mwRaw);
    const ml = mlRaw === undefined ? null : safeParseFloat(mlRaw);
    const generic = genericRaw === undefined ? null : safeParseFloat(genericRaw);
    const explicitType = typeof mapped.magnitude_type === 'string' && mapped.magnitude_type.trim() !== ''
      ? String(mapped.magnitude_type).trim()
      : null;

    if (mw !== null || ml !== null) {
      const candidates: Array<{ value: number; type: string; source: string }> = [];
      if (mw !== null) candidates.push({ value: mw, type: 'Mw', source: 'Mw' });
      if (generic !== null) candidates.push({ value: generic, type: explicitType ?? 'unknown', source: 'magnitude' });
      if (ml !== null) candidates.push({ value: ml, type: 'ML', source: 'ML' });
      const selected = candidates[0];
      const alternatives = candidates
        .slice(1)
        .filter((c) => !(c.value === selected.value && c.type.toLowerCase() === selected.type.toLowerCase()))
        .filter((c) => c.type !== 'unknown' || c.value !== selected.value)
        .map((c) => ({ type: c.type, mag: { value: c.value } }));
      mapped.magnitude = selected.value;
      mapped.magnitude_type = selected.type === 'unknown' ? (explicitType ?? undefined) : selected.type;
      if (mapped.magnitude_type === undefined) delete mapped.magnitude_type;
      if (alternatives.length > 0 && !mapped.magnitudes) mapped.magnitudes = JSON.stringify(alternatives);
      if (includeMappingReport) mappingReport.push({ targetField: 'magnitude', sourceField: selected.source, matchType: 'exact' });
    }
  }

  // Assemble focal mechanism from flat nodal-plane / moment-tensor columns if present
  if (!mapped.focal_mechanisms) {
    const fm = assembleFocalMechanismFromRow(event, momentTensorScale);
    if (fm) {
      mapped.focal_mechanisms = JSON.stringify([fm]);
      if (includeMappingReport) {
        mappingReport.push({ targetField: 'focal_mechanisms', sourceField: 'strike1/dip1/rake1/Mxx/...', matchType: 'synthesized' });
      }
    }
  }

  // Attach mapping report if requested
  if (includeMappingReport && mappingReport.length > 0) {
    mapped._mappingReport = mappingReport;
  }

  return mapped as ParsedEvent;
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
      return parseGeoJSON(content);
    case 'xml':
    case 'qml':
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

  for await (const physicalLine of rl) {
    lineNumber++;

    if (!pendingRecord && !physicalLine.trim()) {
      continue; // Skip empty lines
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
    if (recordLine === 1) {
      // Auto-detect delimiter from header if not specified
      if (!delimiter) {
        const detection = detectDelimiter(line);
        actualDelimiter = detection.delimiter;
        if (detection.confidence < 0.5) {
          warnings.push({
            line: 1,
            message: `Low confidence delimiter detection (${Math.round(detection.confidence * 100)}%). Using: ${actualDelimiter === '\t' ? 'tab' : actualDelimiter}`
          });
        }
      }

      try {
        headers = parseLine(line, actualDelimiter).map((h, index) =>
          (index === 0 ? stripHeaderCommentMarker(h) : h).trim().toLowerCase()
        );
      } catch (error) {
        errors.push({
          line: 1,
          message: `Parse error: ${error instanceof Error ? error.message : String(error)}`
        });
        headers = [];
      }
      detectedFields = [...headers];
      depthUnit = inferDepthUnit(findSourceKeyForTarget(headers, 'depth'), []);
      batchStartLine = lineNumber + 1;
      continue;
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
      const mappedEvent = mapCommonFields(event, dateFormat);
      normalizeOptionalDepth(mappedEvent as Record<string, unknown>, depthUnit);

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
  let actualDateFormat = dateFormat;

  const makeFileLevelDecisions = () => {
    decisionsMade = true;
    const sample = pending.filter((rec) => rec.data !== null && typeof rec.data === 'object');
    const keys = sample.length > 0 ? Object.keys(sample[0].data) : [];

    const depthKey = findSourceKeyForTarget(keys, 'depth');
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
      warnings.push({
        line: 0,
        message: `Depth interpreted as metres and converted to kilometres (${depthUnit.reason}). ` +
                 'Depth and horizontal uncertainty were divided by 1000 with it.'
      });
    }

    if (!actualDateFormat || actualDateFormat === 'Unknown') {
      const timeKey = findSourceKeyForTarget(keys, 'time');
      if (timeKey !== null) {
        const dateStrings = sample
          .map((rec) => rec.data[timeKey])
          .filter((v) => typeof v === 'string' && v.trim().length > 0)
          .slice(0, 50); // Sample first 50 dates, as parseCSV does
        if (dateStrings.length > 0) {
          const detection = detectDateFormat(dateStrings);
          actualDateFormat = detection.format;
          if (detection.confidence < 0.5) {
            warnings.push({
              line: 0,
              message: `Low confidence date format detection (${Math.round(detection.confidence * 100)}%). ${detection.reasoning}`
            });
          } else if (detection.format !== 'ISO' && detection.format !== 'Unknown') {
            warnings.push({
              line: 0,
              message: `Detected ${detection.format} date format. ${detection.reasoning}`
            });
          }
        }
      }
    }
  };

  const processRecord = async (eventData: any, line: number) => {
    try {
      const mappedEvent = mapCommonFields(eventData, actualDateFormat);
      normalizeOptionalDepth(mappedEvent as Record<string, unknown>, depthUnit);

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
      eventData = JSON.parse(line);
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
