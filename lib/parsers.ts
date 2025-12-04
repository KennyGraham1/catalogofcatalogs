/**
 * File parsers for different earthquake catalogue formats
 *
 * Performance Optimization: Includes streaming parsers for memory-efficient
 * processing of large files (100MB+) with constant memory usage.
 */

import { validateEvent } from './earthquake-utils';
import { parseQuakeMLEvent } from './quakeml-parser';
import type { QuakeMLEvent } from './types/quakeml';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export interface ParsedEvent {
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  magnitude: number;
  magnitudeType?: string;
  region?: string;
  source?: string;
  eventId?: string;
  [key: string]: any;

  // QuakeML 1.2 extended data (when parsing QuakeML files)
  quakeml?: QuakeMLEvent;
}

export interface ParseResult {
  success: boolean;
  events: ParsedEvent[];
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
  detectedFields: string[];
}

/**
 * Parse CSV format earthquake catalogue
 */
export function parseCSV(content: string): ParseResult {
  const lines = content.split('\n').filter(line => line.trim());
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const events: ParsedEvent[] = [];

  if (lines.length === 0) {
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message: 'File is empty' }],
      warnings: [],
      detectedFields: []
    };
  }

  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const detectedFields = [...headers];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);

    if (values.length !== headers.length) {
      errors.push({
        line: i + 1,
        message: `Column count mismatch: expected ${headers.length}, got ${values.length}`
      });
      continue;
    }

    try {
      const event: any = {};
      headers.forEach((header, index) => {
        event[header] = values[index];
      });

      // Map common field names
      const mappedEvent = mapCommonFields(event);
      
      // Validate the event
      const validation = validateEvent(mappedEvent);
      if (!validation.valid) {
        errors.push({
          line: i + 1,
          message: validation.errors.join('; ')
        });
        continue;
      }

      events.push(mappedEvent);
    } catch (error) {
      errors.push({
        line: i + 1,
        message: error instanceof Error ? error.message : 'Parse error'
      });
    }
  }

  return {
    success: errors.length === 0,
    events,
    errors,
    warnings,
    detectedFields
  };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * Parse JSON format earthquake catalogue
 */
export function parseJSON(content: string): ParseResult {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const events: ParsedEvent[] = [];
  let detectedFields: string[] = [];

  try {
    const data = JSON.parse(content);

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
      // GeoJSON format
      eventArray = data.features.map((f: any) => ({
        ...f.properties,
        latitude: f.geometry?.coordinates?.[1],
        longitude: f.geometry?.coordinates?.[0],
        depth: f.geometry?.coordinates?.[2]
      }));
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
        console.log(`[Parser] Auto-detected array property: ${arrayProps[0]}`);
      } else if (arrayProps.length > 1) {
        return {
          success: false,
          events: [],
          errors: [{ line: 0, message: `Multiple array properties found: ${arrayProps.join(', ')}. Please use one of: events, data, features, earthquakes, results` }],
          warnings: [],
          detectedFields: []
        };
      } else {
        return {
          success: false,
          events: [],
          errors: [{ line: 0, message: 'Unrecognized JSON structure. Expected an array or object with events/data/features property' }],
          warnings: [],
          detectedFields: []
        };
      }
    }

    // Detect fields from first event
    if (eventArray.length > 0) {
      detectedFields = Object.keys(eventArray[0]);
    }

    // Parse each event
    eventArray.forEach((item, index) => {
      try {
        const mappedEvent = mapCommonFields(item);
        const validation = validateEvent(mappedEvent);
        
        if (!validation.valid) {
          errors.push({
            line: index + 1,
            message: validation.errors.join('; ')
          });
          return;
        }

        events.push(mappedEvent);
      } catch (error) {
        errors.push({
          line: index + 1,
          message: error instanceof Error ? error.message : 'Parse error'
        });
      }
    });

  } catch (error) {
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message: 'Invalid JSON format' }],
      warnings: [],
      detectedFields: []
    };
  }

  return {
    success: errors.length === 0,
    events,
    errors,
    warnings,
    detectedFields
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

  try {
    // Extract all event elements
    const eventRegex = /<event[^>]*publicID="[^"]*"[^>]*>[\s\S]*?<\/event>/g;
    const eventMatches = content.match(eventRegex);

    if (!eventMatches || eventMatches.length === 0) {
      return {
        success: false,
        events: [],
        errors: [{ line: 0, message: 'No events found in QuakeML file' }],
        warnings: [],
        detectedFields: []
      };
    }

    let index = 0;
    for (const eventXML of eventMatches) {
      index++;
      try {
        // Parse full QuakeML event structure
        const quakemlEvent = parseQuakeMLEvent(eventXML);

        if (!quakemlEvent) {
          errors.push({
            line: index,
            message: 'Failed to parse QuakeML event'
          });
          continue;
        }

        // Extract basic fields for the ParsedEvent interface
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
          errors.push({
            line: index,
            message: 'Event missing required origin or magnitude'
          });
          continue;
        }

        // Build basic event
        const event: ParsedEvent = {
          time: origin.time.value,
          latitude: origin.latitude.value,
          longitude: origin.longitude.value,
          depth: origin.depth ? origin.depth.value / 1000 : undefined, // Convert m to km
          magnitude: magnitude.mag.value,
          quakeml: quakemlEvent // Store full QuakeML data
        };

        // Add optional fields if available
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

        // Validate basic fields
        const validation = validateEvent(event);
        if (!validation.valid) {
          errors.push({
            line: index,
            message: validation.errors.join('; ')
          });
          continue;
        }

        // Add warnings for missing optional data
        if (!origin.depth) {
          warnings.push({
            line: index,
            message: 'Event missing depth information'
          });
        }

        if (!origin.quality) {
          warnings.push({
            line: index,
            message: 'Event missing origin quality metrics'
          });
        }

        events.push(event);
      } catch (error) {
        errors.push({
          line: index,
          message: error instanceof Error ? error.message : 'Parse error'
        });
      }
    }
  } catch (error) {
    return {
      success: false,
      events: [],
      errors: [{ line: 0, message: 'Invalid QuakeML format: ' + (error instanceof Error ? error.message : 'Unknown error') }],
      warnings: [],
      detectedFields: []
    };
  }

  return {
    success: errors.length === 0,
    events,
    errors,
    warnings,
    detectedFields: Array.from(detectedFields)
  };
}

/**
 * Map common field name variations to standard names
 */
function mapCommonFields(event: any): ParsedEvent {
  const mapped: any = { ...event };

  // Map time variations
  if (!mapped.time) {
    mapped.time = event.datetime || event.date || event.origin_time || event.origintime;
  }

  // Normalize timestamp to ISO 8601 format
  if (mapped.time) {
    const { normalizeTimestamp } = require('./earthquake-utils');
    const normalized = normalizeTimestamp(mapped.time);
    if (normalized) {
      mapped.time = normalized;
    }
  }

  // Map latitude variations
  if (mapped.lat !== undefined) mapped.latitude = parseFloat(mapped.lat);
  if (mapped.latitude !== undefined) mapped.latitude = parseFloat(mapped.latitude);

  // Map longitude variations
  if (mapped.lon !== undefined) mapped.longitude = parseFloat(mapped.lon);
  if (mapped.lng !== undefined) mapped.longitude = parseFloat(mapped.lng);
  if (mapped.longitude !== undefined) mapped.longitude = parseFloat(mapped.longitude);

  // Map depth variations
  if (mapped.dep !== undefined) mapped.depth = parseFloat(mapped.dep);
  if (mapped.depth !== undefined) mapped.depth = parseFloat(mapped.depth);

  // Map magnitude variations
  if (mapped.mag !== undefined) mapped.magnitude = parseFloat(mapped.mag);
  if (mapped.magnitude !== undefined) mapped.magnitude = parseFloat(mapped.magnitude);

  return mapped as ParsedEvent;
}

/**
 * Auto-detect file format and parse accordingly
 */
export function parseFile(content: string, filename: string): ParseResult {
  const extension = filename.split('.').pop()?.toLowerCase();

  // Explicit extension-based routing (takes precedence)
  switch (extension) {
    case 'csv':
    case 'txt':
      console.log(`[Parser] Parsing ${filename} as CSV based on extension`);
      return parseCSV(content);
    case 'json':
      console.log(`[Parser] Parsing ${filename} as JSON based on extension`);
      return parseJSON(content);
    case 'xml':
    case 'qml':
      console.log(`[Parser] Parsing ${filename} as QuakeML based on extension`);
      return parseQuakeML(content);
    default:
      // Try to auto-detect based on content
      console.log(`[Parser] Auto-detecting format for ${filename}`);
      const trimmed = content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        console.log(`[Parser] Auto-detected JSON format`);
        return parseJSON(content);
      } else if (trimmed.startsWith('<')) {
        console.log(`[Parser] Auto-detected XML/QuakeML format`);
        return parseQuakeML(content);
      } else {
        console.log(`[Parser] Defaulting to CSV format`);
        return parseCSV(content);
      }
  }
}

/**
 * Performance Optimization: Streaming CSV parser for large files
 *
 * This parser processes files line-by-line with constant memory usage,
 * allowing it to handle files of any size (100MB+) without loading
 * the entire file into memory.
 *
 * @param filePath - Path to the CSV file
 * @param onEvent - Callback function called for each parsed event
 * @param onBatch - Optional callback for batch processing (called every batchSize events)
 * @param batchSize - Number of events to accumulate before calling onBatch (default: 100)
 * @returns Promise with parsing statistics
 *
 * @example
 * ```typescript
 * const stats = await parseCSVStream('large-catalogue.csv', async (event) => {
 *   await dbQueries.insertEvent(event);
 * });
 * console.log(`Processed ${stats.totalEvents} events with ${stats.errors.length} errors`);
 * ```
 */
export async function parseCSVStream(
  filePath: string,
  onEvent?: (event: ParsedEvent, lineNumber: number) => Promise<void> | void,
  onBatch?: (events: ParsedEvent[], startLine: number, endLine: number) => Promise<void> | void,
  batchSize: number = 100
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

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity // Handle both \n and \r\n
  });

  for await (const line of rl) {
    lineNumber++;

    if (!line.trim()) {
      continue; // Skip empty lines
    }

    // Parse header
    if (lineNumber === 1) {
      headers = line.split(',').map(h => h.trim().toLowerCase());
      detectedFields = [...headers];
      batchStartLine = lineNumber + 1;
      continue;
    }

    try {
      const values = parseCSVLine(line);

      if (values.length !== headers.length) {
        errors.push({
          line: lineNumber,
          message: `Column count mismatch: expected ${headers.length}, got ${values.length}`
        });
        continue;
      }

      const event: any = {};
      headers.forEach((header, index) => {
        event[header] = values[index];
      });

      // Map common field names
      const mappedEvent = mapCommonFields(event);

      // Validate the event
      const validation = validateEvent(mappedEvent);
      if (!validation.valid) {
        errors.push({
          line: lineNumber,
          message: `Validation failed: ${validation.errors.join(', ')}`
        });
        continue;
      }

      totalEvents++;

      // Call per-event callback if provided
      if (onEvent) {
        await onEvent(mappedEvent, lineNumber);
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
 *
 * Processes newline-delimited JSON (NDJSON) files line-by-line with constant memory usage.
 * Each line should contain a single JSON object representing an event.
 *
 * @param filePath - Path to the NDJSON file
 * @param onEvent - Callback function called for each parsed event
 * @param onBatch - Optional callback for batch processing
 * @param batchSize - Number of events to accumulate before calling onBatch (default: 100)
 * @returns Promise with parsing statistics
 */
export async function parseJSONStream(
  filePath: string,
  onEvent?: (event: ParsedEvent, lineNumber: number) => Promise<void> | void,
  onBatch?: (events: ParsedEvent[], startLine: number, endLine: number) => Promise<void> | void,
  batchSize: number = 100
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

    try {
      const eventData = JSON.parse(line);
      const mappedEvent = mapCommonFields(eventData);

      // Validate the event
      const validation = validateEvent(mappedEvent);
      if (!validation.valid) {
        errors.push({
          line: lineNumber,
          message: `Validation failed: ${validation.errors.join(', ')}`
        });
        continue;
      }

      totalEvents++;

      // Call per-event callback if provided
      if (onEvent) {
        await onEvent(mappedEvent, lineNumber);
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
