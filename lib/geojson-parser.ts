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

  const [longitude, latitude, thirdCoord] = feature.geometry.coordinates;
  const props = feature.properties || {};

  // Features that identify as USGS/ComCat or GeoNet output follow those producers'
  // conventions (time in milliseconds, third coordinate in km).
  const knownProducer = /earthquake\.usgs\.gov|geonet\.org\.nz/i.test(String(props.url ?? props.detail ?? '')) ||
    (typeof props.net === 'string' && typeof props.mag === 'number' && typeof props.time === 'number');

  // Resolve depth (km, positive down). The GeoJSON third coordinate is ambiguous across producers:
  //   * RFC 7946 §3.1.1 (and this app's own GeoJSON exporter): elevation in METRES, positive up —
  //     so a hypocentre at depth d km is encoded as -d*1000.
  //   * USGS/ComCat & GeoNet feeds: depth in KM, positive down, with a small negative value for
  //     the rare event located above the datum.
  // An explicit properties.depth/dep (km) always wins when present.
  let depth: number | null = null;
  const propDepth = props.depth ?? props.dep;
  if (propDepth !== undefined && propDepth !== null && propDepth !== '') {
    depth = Number(propDepth);
  } else if (thirdCoord !== undefined && thirdCoord !== null) {
    const z = Number(thirdCoord);
    if (Number.isFinite(z)) {
      // Disambiguate against the depth domain this platform accepts: lib/validation.ts admits
      // -5 km <= depth <= 1000 km. So
      // z < -5     -> outside the km-depth domain; the only consistent reading is RFC 7946
      // elevation in metres (a 0.8 km hypocentre is written as -800), convert.
      // |z| > 1000 -> deeper than any earthquake (~700 km max); elevation in metres, convert.
      // otherwise  -> km depth as written. This keeps the USGS/GeoNet -5..0 km band (events
      depth = (z < -5 || Math.abs(z) > 1000) ? -z / 1000 : z;
      // Inside the km-depth band the reading is a convention, not a fact. A feature
      // that identifies itself as USGS/ComCat or GeoNet output states that convention
      // (depth in km); for anything else say so once per file so an RFC 7946
      // producer (elevation in metres) is not silently read as kilometres.
      if (!knownProducer && !(z < -5 || Math.abs(z) > 1000) && z !== 0 && !warnings.some(w => w.message.startsWith(THIRD_COORDINATE_NOTE))) {
        warnings.push({
          line: lineNumber,
          message: `${THIRD_COORDINATE_NOTE} (first seen on feature ${lineNumber}, z=${z}). Add a "depth" property in km to state the unit explicitly.`,
        });
      }
    }
  }

  // Build event from GeoJSON properties
  const event: ParsedEvent = {
    longitude,
    latitude,
    depth,
    // USGS/ComCat GeoJSON writes `time` as milliseconds since the epoch (and 0 is a
    // real instant), so a self-identified USGS/GeoNet feature converts as milliseconds;
    // any other producer's bare number is classified by magnitude (seconds below
    // 1e11), which is what Python/GeoPandas exports carry.
    time: epochToIso(firstPresent(props.time, props.datetime, props.date, props.origin_time, props.origintime), knownProducer),
    // `||` treats a magnitude of 0.0 as absent; M0.0 is a real value in microseismic
    // catalogues, so pick the first field that is genuinely present.
    magnitude: firstPresent(props.magnitude, props.mag, props.m),
  };

  // Add optional fields
  if (props.magnitudeType || props.magtype || props.mag_type || props.magType) {
    event.magnitudeType = props.magnitudeType || props.magtype || props.mag_type || props.magType;
    detectedFields.add('magnitudeType');
  }

  if (props.region || props.place || props.location_name) {
    event.region = props.region || props.place || props.location_name;
    detectedFields.add('region');
  }

  // RFC 7946 3.3 allows a number as the Feature id, and 0 is a valid one.
  const featureId = firstPresent(props.eventId, props.id, feature.id);
  if (featureId !== undefined) {
    event.eventId = String(featureId);
    detectedFields.add('eventId');
  }

  // Agency — prefer explicit agency_id, then USGS `net`, then generic aliases
  const agencyId = props.agency_id || props.net || props.agency || props.source || props.network;
  if (agencyId) {
    event.agency_id = String(agencyId);
    detectedFields.add('agency_id');
  }

  // ── USGS standard GeoJSON property names → normalised field names ─────────
  // FIELD_ALIASES knows these aliases but the GeoJSON parser doesn't call
  // mapCommonFields(), so we map the most common USGS names explicitly here.
  if (props.gap        != null) { event.azimuthal_gap           = Number(props.gap);        detectedFields.add('azimuthal_gap'); }
  if (props.dmin       != null) { event.minimum_distance        = Number(props.dmin);       detectedFields.add('minimum_distance'); }
  if (props.nst        != null) { event.used_station_count      = Number(props.nst);        detectedFields.add('used_station_count'); }
  if (props.rms        != null) { event.standard_error          = Number(props.rms);        detectedFields.add('standard_error'); }
  if (props.status)             { event.evaluation_status       = String(props.status);     detectedFields.add('evaluation_status'); }
  if (props.type)               { event.event_type              = String(props.type);       detectedFields.add('event_type'); }

  // Properties written by this platform's own GeoJSON exporter (camelCase) map back to
  // the snake_case names the DB adapter reads, so an export re-imports without loss:
  // identifiers, uncertainties, quality metrics and nested QuakeML data all used to
  // spill into the bag under names nothing downstream recognised.
  for (const [property, field] of Object.entries(OWN_EXPORT_PROPERTY_FIELDS)) {
    const value = props[property];
    if (value === undefined || value === null || value === '') continue;
    if (event[field] !== undefined) continue;
    event[field] = typeof value === 'object' ? JSON.stringify(value) : value;
    detectedFields.add(field);
  }

  // Add all other properties to the event.
  // Fields already resolved above are skipped so the properties bag cannot overwrite them.
  // The location keys matter most: in RFC 7946 §3.2 the geometry member is the authoritative
  // position of a Feature and `properties` is arbitrary application data, but exports produced
  // from a lat/lon table by GeoPandas/QGIS/ArcGIS routinely keep `latitude`/`longitude`
  // properties (often string-typed, sometimes stale). Letting those win silently relocated the
  // hypocentre, or rejected the whole feature as "Latitude must be a number".
  const geometryDerivedKeys = [
    'time', 'datetime', 'date',
    'magnitude', 'mag', 'm',
    'depth', 'dep',
    'latitude', 'lat', 'y',
    'longitude', 'lon', 'lng', 'long', 'x',
  ];
  Object.keys(props).forEach(key => {
    if (!geometryDerivedKeys.includes(key.toLowerCase())) {
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

/**
 * Property names emitted by lib/exporters.ts eventsToGeoJSON, keyed to the DB field
 * each one came from. Nested QuakeML data is re-serialised to the JSON string the DB
 * stores.
 */
const OWN_EXPORT_PROPERTY_FIELDS: Record<string, string> = {
  publicId: 'event_public_id',
  sourceId: 'source_id',
  depthType: 'depth_type',
  locationName: 'location_name',
  eventType: 'event_type',
  eventTypeCertainty: 'event_type_certainty',
  magnitudeUncertainty: 'magnitude_uncertainty',
  magnitudeStationCount: 'magnitude_station_count',
  magnitudeMethodId: 'magnitude_method_id',
  magnitudeEvaluationMode: 'magnitude_evaluation_mode',
  magnitudeEvaluationStatus: 'magnitude_evaluation_status',
  timeUncertainty: 'time_uncertainty',
  latitudeUncertainty: 'latitude_uncertainty',
  longitudeUncertainty: 'longitude_uncertainty',
  depthUncertainty: 'depth_uncertainty',
  horizontalUncertainty: 'horizontal_uncertainty',
  minHorizontalUncertainty: 'min_horizontal_uncertainty',
  maxHorizontalUncertainty: 'max_horizontal_uncertainty',
  azimuthMaxHorizontalUncertainty: 'azimuth_max_horizontal_uncertainty',
  earthModelId: 'earth_model_id',
  methodId: 'method_id',
  agencyId: 'agency_id',
  author: 'author',
  azimuthalGap: 'azimuthal_gap',
  usedPhaseCount: 'used_phase_count',
  usedStationCount: 'used_station_count',
  standardError: 'standard_error',
  minimumDistance: 'minimum_distance',
  maximumDistance: 'maximum_distance',
  associatedPhaseCount: 'associated_phase_count',
  associatedStationCount: 'associated_station_count',
  depthPhaseCount: 'depth_phase_count',
  evaluationMode: 'evaluation_mode',
  evaluationStatus: 'evaluation_status',
  preferredOriginId: 'preferred_origin_id',
  preferredMagnitudeId: 'preferred_magnitude_id',
  preferredFocalMechanismId: 'preferred_focal_mechanism_id',
  origins: 'origins',
  magnitudes: 'magnitudes',
  picks: 'picks',
  arrivals: 'arrivals',
  focalMechanisms: 'focal_mechanisms',
  amplitudes: 'amplitudes',
  stationMagnitudes: 'station_magnitudes',
  eventDescriptions: 'event_descriptions',
  comments: 'comments',
  creationInfo: 'creation_info',
  originQuality: 'origin_quality',
};

const THIRD_COORDINATE_NOTE =
  'Third coordinate between -5 and 1000 read as depth in km (USGS/GeoNet convention), not RFC 7946 elevation in metres';

/**
 * A numeric GeoJSON time: milliseconds for a known producer, otherwise seconds when
 * its magnitude is below 1e11 (the same rule as normalizeTimestamp). Strings pass through.
 */
function epochToIso(value: unknown, knownMillisecondsProducer: boolean): any {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = knownMillisecondsProducer || Math.abs(value) >= 100000000000 ? value : value * 1000;
    const date = new Date(ms);
    return isNaN(date.getTime()) ? value : date.toISOString();
  }
  return value;
}

/** First argument that is neither undefined, null, nor the empty string. */
function firstPresent(...values: unknown[]): any {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}
