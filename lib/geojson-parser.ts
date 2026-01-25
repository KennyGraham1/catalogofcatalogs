/**
 * GeoJSON parser for earthquake catalogue data
 * Supports GeoJSON FeatureCollection and Feature formats
 */

import { summarizeValidationFailures, validateEventWithDetails, type ValidationEventContext, type ValidationFailureDetail } from './validation';
import { validateEventCrossFields } from './cross-field-validation';
import type { ParsedEvent, ParseResult } from './parsers';

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
  const validationAccumulator = createValidationAccumulator();

  try {
    const data = JSON.parse(content);

    // Validate GeoJSON structure
    if (!data.type) {
      const message = 'Invalid GeoJSON: missing "type" field';
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

    let features: GeoJSONFeature[] = [];

    if (data.type === 'FeatureCollection') {
      if (!Array.isArray(data.features)) {
        const message = 'Invalid GeoJSON FeatureCollection: "features" must be an array';
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
      features = data.features;
    } else if (data.type === 'Feature') {
      features = [data];
    } else {
      const message = `Unsupported GeoJSON type: ${data.type}. Expected "FeatureCollection" or "Feature"`;
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

    // Parse each feature
    features.forEach((feature, index) => {
      try {
        validationAccumulator.totalEvents += 1;
        const event = parseGeoJSONFeature(
          feature,
          index + 1,
          errors,
          warnings,
          detectedFields,
          validationAccumulator
        );
        if (event) {
          events.push(event);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse feature';
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
    detectedFields: Array.from(detectedFields),
    validationReport: summarizeValidationFailures(validationAccumulator.failures, {
      totalEvents: validationAccumulator.totalEvents,
      validEvents: validationAccumulator.validEvents,
      invalidEvents: validationAccumulator.invalidEvents,
    })
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
  detectedFields: Set<string>,
  validationAccumulator: ValidationAccumulator
): ParsedEvent | null {
  // Validate feature structure
  if (!feature.geometry || feature.geometry.type !== 'Point') {
    validationAccumulator.invalidEvents += 1;
    errors.push({
      line: lineNumber,
      message: 'Feature must have a Point geometry'
    });
    appendParserFailure(validationAccumulator, { line: lineNumber, eventIndex: lineNumber - 1 }, 'Feature must have a Point geometry');
    return null;
  }

  if (!Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length < 2) {
    validationAccumulator.invalidEvents += 1;
    errors.push({
      line: lineNumber,
      message: 'Point geometry must have at least [longitude, latitude] coordinates'
    });
    appendParserFailure(
      validationAccumulator,
      { line: lineNumber, eventIndex: lineNumber - 1 },
      'Point geometry must have at least [longitude, latitude] coordinates'
    );
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
  const context: ValidationEventContext = {
    line: lineNumber,
    eventIndex: lineNumber - 1,
    eventId: (event.eventId || event.id || null) as string | null,
    rawEvent: event,
  };
  const validation = validateEventWithDetails(event, context);
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
    return null;
  }

  validationAccumulator.validEvents += 1;
  validationAccumulator.failures.push(...validation.failures);
  appendCrossFieldFailures(validationAccumulator, event, context);
  return event;
}
