/**
 * File parsers for different earthquake catalogue formats
 */

import { validateEvent } from './earthquake-utils';
import { parseQuakeMLEvent } from './quakeml-parser';
import type { QuakeMLEvent } from './types/quakeml';

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
      eventArray = data;
    } else if (data.events && Array.isArray(data.events)) {
      eventArray = data.events;
    } else if (data.features && Array.isArray(data.features)) {
      // GeoJSON format
      eventArray = data.features.map((f: any) => ({
        ...f.properties,
        latitude: f.geometry?.coordinates?.[1],
        longitude: f.geometry?.coordinates?.[0],
        depth: f.geometry?.coordinates?.[2]
      }));
    } else {
      return {
        success: false,
        events: [],
        errors: [{ line: 0, message: 'Unrecognized JSON structure' }],
        warnings: [],
        detectedFields: []
      };
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

  switch (extension) {
    case 'csv':
    case 'txt':
      return parseCSV(content);
    case 'json':
      return parseJSON(content);
    case 'xml':
    case 'qml':
      return parseQuakeML(content);
    default:
      // Try to auto-detect
      const trimmed = content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return parseJSON(content);
      } else if (trimmed.startsWith('<')) {
        return parseQuakeML(content);
      } else {
        return parseCSV(content);
      }
  }
}

