import { z } from 'zod';
import { validateDepth, validateMagnitude, validateTimestamp } from './earthquake-utils';

/**
 * Validation schemas for earthquake catalogue data
 * Enhanced with comprehensive validation rules and cross-field validation
 */

// Enhanced earthquake event schema with comprehensive validation
// Note: Historical seismology extends back to ~1000 CE for documented earthquakes
export const earthquakeEventSchema = z.object({
  id: z.string().optional(),
  time: z.string().datetime().or(z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid timestamp format'
  })).refine((val) => {
    const date = new Date(val);
    const now = new Date();
    // Allow historical events back to year 1000 CE for historical seismology catalogues
    const minDate = new Date('1000-01-01');
    return date >= minDate && date <= now;
  }, {
    message: 'Event time must be between year 1000 CE and present'
  }),
  latitude: z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  longitude: z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
  depth: z.number().min(0, 'Depth must be >= 0 km').max(1000, 'Depth must be <= 1000 km').nullable().optional(),
  magnitude: z.number().min(-3, 'Magnitude must be >= -3').max(10, 'Magnitude must be <= 10'),
  magnitudeType: z.string().max(10).optional(),
  region: z.string().max(255).nullable().optional(),
  location_name: z.string().max(255).nullable().optional(),
  source: z.string().max(100).optional(),
  status: z.enum(['automatic', 'reviewed', 'manual']).optional(),

  // Uncertainty fields with validation
  latitude_uncertainty: z.number().min(0).max(10).optional(),
  longitude_uncertainty: z.number().min(0).max(10).optional(),
  depth_uncertainty: z.number().min(0).max(100).optional(),
  horizontal_uncertainty: z.number().min(0).max(100).optional(),
  time_uncertainty: z.number().min(0).max(60).optional(),
  magnitude_uncertainty: z.number().min(0).max(5).optional(),

  // Origin metadata (QuakeML/GeoNet/ISC)
  depth_type: z.string().max(50).optional(),
  earth_model_id: z.string().max(100).optional(),
  method_id: z.string().max(100).optional(),

  // Agency/Author information (ISC/QuakeML)
  agency_id: z.string().max(50).optional(),
  author: z.string().max(100).optional(),

  // Magnitude details
  magnitude_method_id: z.string().max(100).optional(),
  magnitude_evaluation_mode: z.string().max(50).optional(),
  magnitude_evaluation_status: z.string().max(50).optional(),

  // Quality metrics with validation
  azimuthal_gap: z.number().min(0).max(360).optional(),
  used_phase_count: z.number().int().min(0).max(1000).optional(),
  used_station_count: z.number().int().min(0).max(500).optional(),
  standard_error: z.number().min(0).max(100).optional(),
  magnitude_station_count: z.number().int().min(0).max(500).optional(),
  minimum_distance: z.number().min(0).max(180).optional(), // degrees
  maximum_distance: z.number().min(0).max(180).optional(), // degrees
  associated_phase_count: z.number().int().min(0).max(10000).optional(),
  associated_station_count: z.number().int().min(0).max(5000).optional(),
  depth_phase_count: z.number().int().min(0).max(1000).optional(),
}).refine((data) => {
  // Cross-field validation: if depth is very shallow, check magnitude is reasonable
  if (data.depth !== null && data.depth !== undefined && data.depth < 5 && data.magnitude > 8) {
    return false;
  }
  return true;
}, {
  message: 'Very shallow (<5km) events with magnitude >8 are extremely rare and may be erroneous',
  path: ['depth']
}).refine((data) => {
  // Cross-field validation: uncertainty should not exceed the value itself for depth
  if (data.depth !== null && data.depth !== undefined && data.depth_uncertainty !== undefined) {
    if (data.depth_uncertainty > data.depth * 2) {
      return false;
    }
  }
  return true;
}, {
  message: 'Depth uncertainty should not exceed twice the depth value',
  path: ['depth_uncertainty']
});

export type EarthquakeEvent = z.infer<typeof earthquakeEventSchema>;

// Merge configuration schema
export const mergeConfigSchema = z.object({
  timeThreshold: z.number().min(0).max(3600), // Max 1 hour
  distanceThreshold: z.number().min(0).max(1000), // Max 1000 km
  mergeStrategy: z.enum(['priority', 'average', 'newest', 'complete', 'quality']),
  priority: z.string(),
});

export type MergeConfig = z.infer<typeof mergeConfigSchema>;

// Source catalogue schema
export const sourceCatalogueSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1).max(255),
  events: z.number().int().min(0),
  source: z.string().min(1).max(100),
});

export type SourceCatalogue = z.infer<typeof sourceCatalogueSchema>;

// Merge request schema
export const mergeRequestSchema = z.object({
  name: z.string().min(1).max(255),
  sourceCatalogues: z.array(sourceCatalogueSchema).min(2),
  config: mergeConfigSchema,
});

export type MergeRequest = z.infer<typeof mergeRequestSchema>;

// Role change request schema
export const roleRequestSchema = z.object({
  requestedRole: z.enum(['editor', 'admin']),
  justification: z.string().trim().min(10, 'Justification must be at least 10 characters').max(1000, 'Justification must be 1000 characters or less'),
});

export type RoleRequestSubmission = z.infer<typeof roleRequestSchema>;

// Role request review schema (admin)
export const roleRequestReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  adminNotes: z.string().trim().max(1000, 'Admin notes must be 1000 characters or less').optional(),
});

export type RoleRequestReview = z.infer<typeof roleRequestReviewSchema>;

// File upload schema
export const fileUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().max(500 * 1024 * 1024), // Max 500MB
  fileType: z.enum(['csv', 'txt', 'json', 'geojson', 'xml', 'qml']),
});

export type FileUpload = z.infer<typeof fileUploadSchema>;

// Catalogue database record schema (distinct from form-level CatalogueMetadata in types/upload.ts)
export const catalogueRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  created_at: z.string().datetime(),
  source_catalogues: z.string(),
  merge_config: z.string(),
  event_count: z.number().int().min(0),
  status: z.enum(['processing', 'complete', 'error']),
});

export type CatalogueRecord = z.infer<typeof catalogueRecordSchema>;

// Field mapping schema - includes all QuakeML 1.2 fields and expanded schema fields
export const fieldMappingSchema = z.object({
  sourceField: z.string(),
  targetField: z.enum([
    // Basic required fields
    'id',
    'time',
    'latitude',
    'longitude',
    'depth',
    'magnitude',

    // Basic optional fields
    'source',
    'region',
    'location_name',

    // QuakeML 1.2 Event metadata
    'event_public_id',
    'event_type',
    'event_type_certainty',

    // Origin uncertainties
    'time_uncertainty',
    'latitude_uncertainty',
    'longitude_uncertainty',
    'depth_uncertainty',
    'horizontal_uncertainty',

    // Origin metadata (QuakeML/GeoNet/ISC)
    'depth_type',
    'earth_model_id',
    'method_id',

    // Agency/Author information (ISC/QuakeML)
    'agency_id',
    'author',

    // Magnitude details
    'magnitude_type',
    'magnitude_uncertainty',
    'magnitude_station_count',
    'magnitude_method_id',
    'magnitude_evaluation_mode',
    'magnitude_evaluation_status',

    // Origin quality metrics
    'azimuthal_gap',
    'used_phase_count',
    'used_station_count',
    'standard_error',
    'minimum_distance',
    'maximum_distance',
    'associated_phase_count',
    'associated_station_count',
    'depth_phase_count',

    // Evaluation metadata
    'evaluation_mode',
    'evaluation_status',

    // Complex nested data (JSON)
    'origin_quality',
    'origins',
    'magnitudes',
    'picks',
    'arrivals',
    'focal_mechanisms',
    'amplitudes',
    'station_magnitudes',
    'event_descriptions',
    'comments',
    'creation_info',

    // Unmapped
    'unmapped'
  ]),
  transformation: z.string().optional(), // Optional transformation function
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

// Schema mapping request
export const schemaMappingRequestSchema = z.object({
  catalogueId: z.string(),
  mappings: z.array(fieldMappingSchema),
});

export type SchemaMappingRequest = z.infer<typeof schemaMappingRequestSchema>;

// Mapping template schema
export const mappingTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  mappings: z.array(fieldMappingSchema),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type MappingTemplate = z.infer<typeof mappingTemplateSchema>;

// Validation result schema
export const validationResultSchema = z.object({
  fileName: z.string(),
  isValid: z.boolean(),
  errors: z.array(z.object({
    line: z.number().optional(),
    field: z.string().optional(),
    message: z.string(),
  })),
  warnings: z.array(z.object({
    line: z.number().optional(),
    field: z.string().optional(),
    message: z.string(),
  })),
  format: z.string(),
  eventCount: z.number().int().min(0),
  fields: z.array(z.string()),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;

export type ValidationFailureSeverity = 'error' | 'warning' | 'info';
export type ValidationFailureCategory =
  | 'missing_required'
  | 'out_of_range'
  | 'invalid_format'
  | 'invalid_type'
  | 'cross_field'
  | 'parser'
  | 'other';

export interface FieldMappingTrace {
  targetField: string;
  sourceField: string;
  matchType?: 'exact' | 'alias' | 'synthesized';
}

export interface ValidationFailureDetail {
  line?: number;
  eventIndex?: number;
  eventId?: string | null;
  field?: string;
  value?: unknown;
  expected?: string;
  message: string;
  category: ValidationFailureCategory;
  severity: ValidationFailureSeverity;
}

export interface ValidationFailureSummary {
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  failureCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  byCategory: Record<ValidationFailureCategory, number>;
  byField: Record<string, number>;
}

export interface ValidationFailureReport {
  generatedAt: string;
  summary: ValidationFailureSummary;
  failures: ValidationFailureDetail[];
}

export interface ValidationEventContext {
  line?: number;
  eventIndex?: number;
  eventId?: string | null;
  rawEvent?: Record<string, any>;
  mappingReport?: FieldMappingTrace[];
}

const VALIDATION_CATEGORIES: ValidationFailureCategory[] = [
  'missing_required',
  'out_of_range',
  'invalid_format',
  'invalid_type',
  'cross_field',
  'parser',
  'other',
];

const FIELD_EXPECTATIONS: Record<string, string> = {
  time: 'ISO 8601 timestamp or supported date format (e.g. YYYY-MM-DDTHH:mm:ssZ)',
  latitude: 'Number between -90 and 90',
  longitude: 'Number between -180 and 180',
  magnitude: 'Number between -3 and 10',
  depth: 'Number between 0 and 1000 (km)',
};

/**
 * Validate earthquake event data
 */
export function validateEarthquakeEvent(data: unknown): {
  success: boolean;
  data?: EarthquakeEvent;
  errors?: z.ZodError;
} {
  const result = earthquakeEventSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, errors: result.error };
}

/**
 * Validate merge request
 */
export function validateMergeRequest(data: unknown): {
  success: boolean;
  data?: MergeRequest;
  errors?: z.ZodError;
} {
  const result = mergeRequestSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, errors: result.error };
}

/**
 * Validate role request submission
 */
export function validateRoleRequestSubmission(data: unknown): {
  success: boolean;
  data?: RoleRequestSubmission;
  errors?: z.ZodError;
} {
  const result = roleRequestSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error };
}

/**
 * Validate role request review (admin)
 */
export function validateRoleRequestReview(data: unknown): {
  success: boolean;
  data?: RoleRequestReview;
  errors?: z.ZodError;
} {
  const result = roleRequestReviewSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error };
}

/**
 * Validate array of earthquake events
 */
export function validateEarthquakeEvents(data: unknown[]): {
  validEvents: EarthquakeEvent[];
  invalidEvents: Array<{ index: number; errors: z.ZodError }>;
} {
  const validEvents: EarthquakeEvent[] = [];
  const invalidEvents: Array<{ index: number; errors: z.ZodError }> = [];
  
  data.forEach((item, index) => {
    const result = earthquakeEventSchema.safeParse(item);
    if (result.success) {
      validEvents.push(result.data);
    } else {
      invalidEvents.push({ index, errors: result.error });
    }
  });
  
  return { validEvents, invalidEvents };
}

/**
 * Format Zod errors for display
 */
export function formatZodErrors(error: z.ZodError): string[] {
  return error.errors.map(err => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });
}

const isValuePresent = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return true;
};

const isNumericValue = (value: unknown): boolean => {
  if (!isValuePresent(value)) return false;
  return !isNaN(Number(value));
};

const getRawValueForField = (context: ValidationEventContext, field: string): unknown => {
  if (!context.rawEvent) return undefined;
  const mapping = context.mappingReport?.find(entry => entry.targetField === field);
  if (mapping && Object.prototype.hasOwnProperty.call(context.rawEvent, mapping.sourceField)) {
    return context.rawEvent[mapping.sourceField];
  }
  if (Object.prototype.hasOwnProperty.call(context.rawEvent, field)) {
    return context.rawEvent[field];
  }
  return undefined;
};

const buildFailure = (
  context: ValidationEventContext,
  detail: Omit<ValidationFailureDetail, 'line' | 'eventIndex' | 'eventId'>
): ValidationFailureDetail => ({
  line: context.line,
  eventIndex: context.eventIndex,
  eventId: context.eventId ?? null,
  ...detail,
});

export function validateEventWithDetails(
  event: Partial<EarthquakeEvent>,
  context: ValidationEventContext = {}
): { valid: boolean; failures: ValidationFailureDetail[] } {
  const failures: ValidationFailureDetail[] = [];

  const addFailure = (detail: Omit<ValidationFailureDetail, 'line' | 'eventIndex' | 'eventId'>) => {
    failures.push(buildFailure(context, detail));
  };

  const latRaw = getRawValueForField(context, 'latitude');
  const lonRaw = getRawValueForField(context, 'longitude');
  const magRaw = getRawValueForField(context, 'magnitude');
  const depthRaw = getRawValueForField(context, 'depth');
  const timeRaw = getRawValueForField(context, 'time');

  const latMissing = event.latitude === undefined || event.latitude === null;
  const lonMissing = event.longitude === undefined || event.longitude === null;

  if (latMissing) {
    const hasLatRaw = isValuePresent(latRaw);
    const isLatNumeric = isNumericValue(latRaw);
    addFailure({
      field: 'latitude',
      value: latRaw,
      expected: FIELD_EXPECTATIONS.latitude,
      message: hasLatRaw && !isLatNumeric ? 'Latitude must be a number' : 'Latitude is required',
      category: hasLatRaw && !isLatNumeric ? 'invalid_type' : 'missing_required',
      severity: 'error',
    });
  } else {
    if (typeof event.latitude !== 'number' || Number.isNaN(event.latitude)) {
      addFailure({
        field: 'latitude',
        value: latRaw ?? event.latitude,
        expected: FIELD_EXPECTATIONS.latitude,
        message: 'Latitude must be a number',
        category: 'invalid_type',
        severity: 'error',
      });
    } else if (event.latitude < -90 || event.latitude > 90) {
      addFailure({
        field: 'latitude',
        value: event.latitude,
        expected: FIELD_EXPECTATIONS.latitude,
        message: 'Latitude must be between -90 and 90',
        category: 'out_of_range',
        severity: 'error',
      });
    }
  }

  if (lonMissing) {
    const hasLonRaw = isValuePresent(lonRaw);
    const isLonNumeric = isNumericValue(lonRaw);
    addFailure({
      field: 'longitude',
      value: lonRaw,
      expected: FIELD_EXPECTATIONS.longitude,
      message: hasLonRaw && !isLonNumeric ? 'Longitude must be a number' : 'Longitude is required',
      category: hasLonRaw && !isLonNumeric ? 'invalid_type' : 'missing_required',
      severity: 'error',
    });
  } else {
    if (typeof event.longitude !== 'number' || Number.isNaN(event.longitude)) {
      addFailure({
        field: 'longitude',
        value: lonRaw ?? event.longitude,
        expected: FIELD_EXPECTATIONS.longitude,
        message: 'Longitude must be a number',
        category: 'invalid_type',
        severity: 'error',
      });
    } else if (event.longitude < -180 || event.longitude > 180) {
      addFailure({
        field: 'longitude',
        value: event.longitude,
        expected: FIELD_EXPECTATIONS.longitude,
        message: 'Longitude must be between -180 and 180',
        category: 'out_of_range',
        severity: 'error',
      });
    }
  }

  if (event.magnitude === undefined || event.magnitude === null) {
    const hasMagRaw = isValuePresent(magRaw);
    const isMagNumeric = isNumericValue(magRaw);
    addFailure({
      field: 'magnitude',
      value: magRaw,
      expected: FIELD_EXPECTATIONS.magnitude,
      message: hasMagRaw && !isMagNumeric ? 'Magnitude must be a number' : 'Magnitude is required',
      category: hasMagRaw && !isMagNumeric ? 'invalid_type' : 'missing_required',
      severity: 'error',
    });
  } else {
    if (typeof event.magnitude !== 'number' || Number.isNaN(event.magnitude)) {
      addFailure({
        field: 'magnitude',
        value: magRaw ?? event.magnitude,
        expected: FIELD_EXPECTATIONS.magnitude,
        message: 'Magnitude must be a number',
        category: 'invalid_type',
        severity: 'error',
      });
    } else if (!validateMagnitude(event.magnitude)) {
      addFailure({
        field: 'magnitude',
        value: event.magnitude,
        expected: FIELD_EXPECTATIONS.magnitude,
        message: 'Magnitude must be between -3 and 10',
        category: 'out_of_range',
        severity: 'error',
      });
    }
  }

  if (event.depth !== undefined && event.depth !== null) {
    if (typeof event.depth !== 'number' || Number.isNaN(event.depth)) {
      addFailure({
        field: 'depth',
        value: depthRaw ?? event.depth,
        expected: FIELD_EXPECTATIONS.depth,
        message: 'Depth must be a number',
        category: 'invalid_type',
        severity: 'warning',
      });
    } else if (!validateDepth(event.depth)) {
      addFailure({
        field: 'depth',
        value: event.depth,
        expected: FIELD_EXPECTATIONS.depth,
        message: 'Depth must be between 0 and 1000 km',
        category: 'out_of_range',
        severity: 'error',
      });
    }
  } else if (isValuePresent(depthRaw)) {
    addFailure({
      field: 'depth',
      value: depthRaw,
      expected: FIELD_EXPECTATIONS.depth,
      message: 'Depth must be a number',
      category: 'invalid_type',
      severity: 'warning',
    });
  }

  if (!event.time) {
    addFailure({
      field: 'time',
      value: timeRaw,
      expected: FIELD_EXPECTATIONS.time,
      message: 'Timestamp is required',
      category: 'missing_required',
      severity: 'error',
    });
  } else if (!validateTimestamp(event.time)) {
    addFailure({
      field: 'time',
      value: event.time,
      expected: FIELD_EXPECTATIONS.time,
      message: 'Invalid timestamp format',
      category: 'invalid_format',
      severity: 'error',
    });
  }

  return {
    valid: failures.filter(f => f.severity === 'error').length === 0,
    failures,
  };
}

export function summarizeValidationFailures(
  failures: ValidationFailureDetail[],
  totals: { totalEvents: number; validEvents: number; invalidEvents: number }
): ValidationFailureReport {
  const byCategory: Record<ValidationFailureCategory, number> = VALIDATION_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = 0;
      return acc;
    },
    {} as Record<ValidationFailureCategory, number>
  );

  const byField: Record<string, number> = {};

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  failures.forEach(failure => {
    byCategory[failure.category] = (byCategory[failure.category] || 0) + 1;
    if (failure.field) {
      byField[failure.field] = (byField[failure.field] || 0) + 1;
    }
    if (failure.severity === 'error') errorCount += 1;
    if (failure.severity === 'warning') warningCount += 1;
    if (failure.severity === 'info') infoCount += 1;
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: totals.totalEvents,
      validEvents: totals.validEvents,
      invalidEvents: totals.invalidEvents,
      failureCount: failures.length,
      errorCount,
      warningCount,
      infoCount,
      byCategory,
      byField,
    },
    failures,
  };
}

/**
 * Data quality check result
 */
export interface DataQualityCheck {
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  suggestion?: string;
}

/**
 * Comprehensive data quality assessment
 */
export interface DataQualityReport {
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
  completeness: number; // 0-100
  consistency: number; // 0-100
  accuracy: number; // 0-100
  checks: DataQualityCheck[];
  statistics: {
    totalEvents: number;
    validEvents: number;
    eventsWithUncertainties: number;
    eventsWithQualityMetrics: number;
    averageMagnitude: number;
    averageDepth: number;
    timeRange: { start: string; end: string } | null;
    spatialExtent: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  };
}

/**
 * Perform comprehensive data quality assessment
 */
export function assessDataQuality(events: any[]): DataQualityReport {
  const checks: DataQualityCheck[] = [];

  if (events.length === 0) {
    return {
      overallQuality: 'poor',
      completeness: 0,
      consistency: 0,
      accuracy: 0,
      checks: [{
        passed: false,
        severity: 'error',
        message: 'No events to assess',
      }],
      statistics: {
        totalEvents: 0,
        validEvents: 0,
        eventsWithUncertainties: 0,
        eventsWithQualityMetrics: 0,
        averageMagnitude: 0,
        averageDepth: 0,
        timeRange: null,
        spatialExtent: null,
      }
    };
  }

  // Calculate statistics
  const validEvents = events.filter(e => {
    const result = earthquakeEventSchema.safeParse(e);
    return result.success;
  });

  const eventsWithUncertainties = events.filter(e =>
    e.latitude_uncertainty || e.longitude_uncertainty || e.depth_uncertainty
  ).length;

  const eventsWithQualityMetrics = events.filter(e =>
    e.azimuthal_gap || e.used_phase_count || e.used_station_count
  ).length;

  const magnitudes = events.filter(e => typeof e.magnitude === 'number').map(e => e.magnitude);
  const depths = events.filter(e => typeof e.depth === 'number').map(e => e.depth);
  const times = events.filter(e => e.time).map(e => new Date(e.time)).filter(d => !isNaN(d.getTime()));
  const lats = events.filter(e => typeof e.latitude === 'number').map(e => e.latitude);
  const lons = events.filter(e => typeof e.longitude === 'number').map(e => e.longitude);

  const getMinMax = (values: number[]): { min: number; max: number } | null => {
    if (values.length === 0) return null;
    let min = values[0];
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
      const value = values[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return { min, max };
  };

  const getMinMaxDate = (dates: Date[]): { min: Date; max: Date } | null => {
    if (dates.length === 0) return null;
    let minTime = dates[0].getTime();
    let maxTime = dates[0].getTime();
    for (let i = 1; i < dates.length; i++) {
      const time = dates[i].getTime();
      if (time < minTime) minTime = time;
      if (time > maxTime) maxTime = time;
    }
    return { min: new Date(minTime), max: new Date(maxTime) };
  };

  const averageMagnitude = magnitudes.length > 0
    ? magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length
    : 0;

  const averageDepth = depths.length > 0
    ? depths.reduce((a, b) => a + b, 0) / depths.length
    : 0;

  const timeBounds = getMinMaxDate(times);
  const timeRange = timeBounds ? {
    start: timeBounds.min.toISOString(),
    end: timeBounds.max.toISOString(),
  } : null;

  const latBounds = getMinMax(lats);
  const lonBounds = getMinMax(lons);
  const spatialExtent = latBounds && lonBounds ? {
    minLat: latBounds.min,
    maxLat: latBounds.max,
    minLon: lonBounds.min,
    maxLon: lonBounds.max,
  } : null;

  // Completeness checks
  const completenessScore = (validEvents.length / events.length) * 100;

  if (completenessScore < 50) {
    checks.push({
      passed: false,
      severity: 'error',
      message: `Only ${completenessScore.toFixed(1)}% of events have all required fields`,
      suggestion: 'Review data format and ensure all required fields (time, latitude, longitude, magnitude) are present'
    });
  } else if (completenessScore < 90) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `${completenessScore.toFixed(1)}% of events have all required fields`,
      suggestion: 'Some events are missing required fields'
    });
  } else {
    checks.push({
      passed: true,
      severity: 'info',
      message: `${completenessScore.toFixed(1)}% of events have all required fields`,
    });
  }

  // Uncertainty data availability
  const uncertaintyPercentage = (eventsWithUncertainties / events.length) * 100;
  if (uncertaintyPercentage < 10) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Only ${uncertaintyPercentage.toFixed(1)}% of events have uncertainty information`,
      field: 'uncertainties',
      suggestion: 'Consider including uncertainty estimates for better quality assessment'
    });
  } else {
    checks.push({
      passed: true,
      severity: 'info',
      message: `${uncertaintyPercentage.toFixed(1)}% of events have uncertainty information`,
    });
  }

  // Quality metrics availability
  const qualityMetricsPercentage = (eventsWithQualityMetrics / events.length) * 100;
  if (qualityMetricsPercentage < 10) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Only ${qualityMetricsPercentage.toFixed(1)}% of events have quality metrics`,
      field: 'quality_metrics',
      suggestion: 'Include azimuthal gap, phase counts, and station counts for better quality assessment'
    });
  }

  // Consistency checks
  let consistencyScore = 100;

  // Check for duplicate times
  const timeCounts = new Map<string, number>();
  events.forEach(e => {
    if (e.time) {
      const count = timeCounts.get(e.time) || 0;
      timeCounts.set(e.time, count + 1);
    }
  });
  const duplicateTimes = Array.from(timeCounts.values()).filter(count => count > 1).length;
  if (duplicateTimes > 0) {
    consistencyScore -= 10;
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Found ${duplicateTimes} events with duplicate timestamps`,
      field: 'time',
      suggestion: 'Review events with identical times - they may be duplicates'
    });
  }

  // Check for suspicious magnitude-depth relationships
  const suspiciousEvents = events.filter(e =>
    e.depth !== null && e.depth !== undefined && e.depth < 5 && e.magnitude > 7
  ).length;
  if (suspiciousEvents > 0) {
    consistencyScore -= 5;
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Found ${suspiciousEvents} very shallow (<5km) events with large magnitude (>7)`,
      suggestion: 'These events are rare and should be reviewed for accuracy'
    });
  }

  // Accuracy checks based on uncertainty values
  let accuracyScore = 100;

  const highUncertaintyEvents = events.filter(e => {
    const horizUncert = Math.max(e.latitude_uncertainty || 0, e.longitude_uncertainty || 0);
    return horizUncert > 0.1; // > ~10km
  }).length;

  if (highUncertaintyEvents > events.length * 0.5) {
    accuracyScore -= 30;
    checks.push({
      passed: false,
      severity: 'warning',
      message: `${((highUncertaintyEvents / events.length) * 100).toFixed(1)}% of events have high location uncertainty (>10km)`,
      field: 'location_uncertainty',
      suggestion: 'Consider improving location accuracy with more stations or better velocity models'
    });
  }

  // Overall quality determination
  const overallScore = (completenessScore + consistencyScore + accuracyScore) / 3;
  let overallQuality: 'excellent' | 'good' | 'fair' | 'poor';

  if (overallScore >= 90) overallQuality = 'excellent';
  else if (overallScore >= 75) overallQuality = 'good';
  else if (overallScore >= 60) overallQuality = 'fair';
  else overallQuality = 'poor';

  return {
    overallQuality,
    completeness: Math.round(completenessScore),
    consistency: Math.round(consistencyScore),
    accuracy: Math.round(accuracyScore),
    checks,
    statistics: {
      totalEvents: events.length,
      validEvents: validEvents.length,
      eventsWithUncertainties,
      eventsWithQualityMetrics,
      averageMagnitude: Math.round(averageMagnitude * 10) / 10,
      averageDepth: Math.round(averageDepth * 10) / 10,
      timeRange,
      spatialExtent,
    }
  };
}

/**
 * Validate geographic bounds
 */
export function validateGeographicBounds(bounds: {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];

  if (bounds.minLat >= bounds.maxLat) {
    checks.push({
      passed: false,
      severity: 'error',
      message: 'Minimum latitude must be less than maximum latitude',
      field: 'latitude_bounds'
    });
  }

  if (bounds.minLon >= bounds.maxLon) {
    checks.push({
      passed: false,
      severity: 'error',
      message: 'Minimum longitude must be less than maximum longitude',
      field: 'longitude_bounds'
    });
  }

  const latRange = bounds.maxLat - bounds.minLat;
  const lonRange = bounds.maxLon - bounds.minLon;

  if (latRange > 180 || lonRange > 360) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: 'Geographic bounds seem unusually large',
      suggestion: 'Verify the coordinate system and bounds are correct'
    });
  }

  if (latRange < 0.01 && lonRange < 0.01) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: 'Geographic bounds are very small (<1km)',
      suggestion: 'This may indicate a single location or data entry error'
    });
  }

  return checks;
}

/**
 * Check for anomalous events
 */
export function detectAnomalies(events: any[]): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];

  if (events.length === 0) return checks;

  // Check for events with extreme magnitudes
  const extremeMagnitudes = events.filter(e => e.magnitude > 9 || e.magnitude < -1);
  if (extremeMagnitudes.length > 0) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Found ${extremeMagnitudes.length} events with extreme magnitudes (>9 or <-1)`,
      field: 'magnitude',
      suggestion: 'Review these events for data entry errors'
    });
  }

  // Check for events with extreme depths
  const extremeDepths = events.filter(e => e.depth !== null && e.depth !== undefined && e.depth > 700);
  if (extremeDepths.length > 0) {
    checks.push({
      passed: false,
      severity: 'info',
      message: `Found ${extremeDepths.length} very deep events (>700km)`,
      field: 'depth',
      suggestion: 'Deep events are rare but can occur in subduction zones'
    });
  }

  // Check for events with zero depth
  const zeroDepthEvents = events.filter(e => e.depth === 0);
  if (zeroDepthEvents.length > events.length * 0.1) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `${((zeroDepthEvents.length / events.length) * 100).toFixed(1)}% of events have zero depth`,
      field: 'depth',
      suggestion: 'Zero depth may indicate missing data rather than surface events'
    });
  }

  // Check for temporal clustering (possible duplicates)
  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  let clusteredEvents = 0;
  for (let i = 1; i < sortedEvents.length; i++) {
    const timeDiff = Math.abs(
      new Date(sortedEvents[i].time).getTime() - new Date(sortedEvents[i-1].time).getTime()
    );
    if (timeDiff < 1000) { // Less than 1 second apart
      clusteredEvents++;
    }
  }

  if (clusteredEvents > 0) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Found ${clusteredEvents} events within 1 second of another event`,
      field: 'time',
      suggestion: 'These may be duplicate entries or require review'
    });
  }

  return checks;
}
