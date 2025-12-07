/**
 * GeoJSON parser for earthquake catalogue data
 * Supports GeoJSON FeatureCollection and Feature formats
 */

import { validateEvent } from './earthquake-utils';
import type { ParsedEvent, ParseResult } from './parsers';

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number, number?]; // [longitude, latitude, depth]
  };
  properties: Record<string, any>;
  id?: string | number;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

/**
 * Parse GeoJSON format earthquake catalogue
 * Supports both FeatureCollection and single Feature
 */
export function parseGeoJSON(content: string): ParseResult {
  const errors: Array<{ line: number; message: string }> = [];
  const warnings: Array<{ line: number; message: string }> = [];
  const events: ParsedEvent[] = [];
  const detectedFields = new Set<string>(['time', 'latitude', 'longitude', 'depth', 'magnitude']);

  try {
    const data = JSON.parse(content);

    // Validate GeoJSON structure
    if (!data.type) {
      return {
        success: false,
        events: [],
        errors: [{ line: 0, message: 'Invalid GeoJSON: missing "type" field' }],
        warnings: [],
        detectedFields: []
      };
    }

    let features: GeoJSONFeature[] = [];

    if (data.type === 'FeatureCollection') {
      if (!Array.isArray(data.features)) {
        return {
          success: false,
          events: [],
          errors: [{ line: 0, message: 'Invalid GeoJSON FeatureCollection: "features" must be an array' }],
          warnings: [],
          detectedFields: []
        };
      }
      features = data.features;
    } else if (data.type === 'Feature') {
      features = [data];
    } else {
      return {
        success: false,
        events: [],
        errors: [{ line: 0, message: `Unsupported GeoJSON type: ${data.type}. Expected "FeatureCollection" or "Feature"` }],
        warnings: [],
        detectedFields: []
      };
    }

    // Parse each feature
    features.forEach((feature, index) => {
      try {
        const event = parseGeoJSONFeature(feature, index + 1, errors, warnings, detectedFields);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        errors.push({
          line: index + 1,
          message: error instanceof Error ? error.message : 'Failed to parse feature'
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
    detectedFields: Array.from(detectedFields)
  };
}

/**
 * Parse a single GeoJSON feature into a ParsedEvent
 */
function parseGeoJSONFeature(
  feature: GeoJSONFeature,
  lineNumber: number,
  errors: Array<{ line: number; message: string }>,
  warnings: Array<{ line: number; message: string }>,
  detectedFields: Set<string>
): ParsedEvent | null {
  // Validate feature structure
  if (!feature.geometry || feature.geometry.type !== 'Point') {
    errors.push({
      line: lineNumber,
      message: 'Feature must have a Point geometry'
    });
    return null;
  }

  if (!Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length < 2) {
    errors.push({
      line: lineNumber,
      message: 'Point geometry must have at least [longitude, latitude] coordinates'
    });
    return null;
  }

  const [longitude, latitude, depth] = feature.geometry.coordinates;
  const props = feature.properties || {};

  // Build event from GeoJSON properties
  const event: ParsedEvent = {
    longitude,
    latitude,
    depth: depth !== undefined ? depth : (props.depth || props.dep || null),
    time: props.time || props.datetime || props.date || props.origin_time || props.origintime,
    magnitude: props.magnitude || props.mag || props.m,
  };

  // Add optional fields
  if (props.magnitudeType || props.magtype || props.mag_type) {
    event.magnitudeType = props.magnitudeType || props.magtype || props.mag_type;
    detectedFields.add('magnitudeType');
  }

  if (props.region || props.place || props.location_name) {
    event.region = props.region || props.place || props.location_name;
    detectedFields.add('region');
  }

  if (props.eventId || props.id || feature.id) {
    event.eventId = String(props.eventId || props.id || feature.id);
    detectedFields.add('eventId');
  }

  if (props.source || props.agency || props.agency_id) {
    event.source = props.source || props.agency || props.agency_id;
    detectedFields.add('source');
  }

  // Add all other properties to the event
  Object.keys(props).forEach(key => {
    if (!['time', 'datetime', 'date', 'magnitude', 'mag', 'm', 'depth', 'dep'].includes(key)) {
      event[key] = props[key];
      detectedFields.add(key);
    }
  });

  // Validate the event
  const validation = validateEvent(event);
  if (!validation.valid) {
    errors.push({
      line: lineNumber,
      message: validation.errors.join('; ')
    });
    return null;
  }

  return event;
}

