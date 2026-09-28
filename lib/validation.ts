import { z } from 'zod';
import { longitudeExtent } from './geo-bounds-utils';
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
  depth: z.number().min(-5, 'Depth must be >= -5 km').max(1000, 'Depth must be <= 1000 km').nullable().optional(),
  magnitude: z.number().min(-3, 'Magnitude must be >= -3').max(10, 'Magnitude must be <= 10'),
  magnitudeType: z.string().max(10).optional(),
  region: z.string().max(255).nullable().optional(),
  location_name: z.string().max(255).nullable().optional(),
  source: z.string().max(100).optional(),
  status: z.enum(['automatic', 'reviewed', 'manual']).optional(),

  // Uncertainty fields with validation.
  // latitude_uncertainty / longitude_uncertainty are in DEGREES, matching the QuakeML
  // RealQuantity uncertainty carried on origin/latitude and origin/longitude (whose values
  // are degrees). The rest of the platform converts them with 111 km/degree — see
  // metricsFromEvent() in lib/quality-scoring.ts and calculateUncertaintyEllipse() in
  // lib/uncertainty-utils.ts — so the 10-degree cap here is a ~1100 km sanity bound.
  latitude_uncertainty: z.number().min(0).max(10).optional(),
  longitude_uncertainty: z.number().min(0).max(10).optional(),
  depth_uncertainty: z.number().min(0).max(100).optional(),
  horizontal_uncertainty: z.number().min(0).max(100).optional(),
  min_horizontal_uncertainty: z.number().min(0).max(100).optional(),
  max_horizontal_uncertainty: z.number().min(0).max(100).optional(),
  azimuth_max_horizontal_uncertainty: z.number().min(0).max(360).optional(),
  // Origin-time uncertainty in seconds. The cap must cover the pre-instrumental events this
  // schema explicitly admits (year 1000 CE onwards, see the `time` refinement above), whose
  // origin times are known only to the nearest hour or day — a 60 s cap rejected every one
  // of them (e.g. the 1855 Wairarapa M8.2). One day (86400 s) is the practical ceiling.
  time_uncertainty: z.number().min(0).max(86400).optional(),
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
  // Used phase/station counts are bounded by the *associated* counts below (a used phase or
  // station is by definition also associated), so they share those caps. The previous
  // 1000/500 caps were below what agency-reviewed solutions for large NZ events report —
  // ISC-reviewed origins for M7+ events routinely use several thousand phases from well
  // over 500 stations — and rejected them as out of range.
  used_phase_count: z.number().int().min(0).max(10000).optional(),
  used_station_count: z.number().int().min(0).max(5000).optional(),
  standard_error: z.number().min(0).max(100).optional(),
  magnitude_station_count: z.number().int().min(0).max(5000).optional(),
  minimum_distance: z.number().min(0).max(180).optional(), // degrees
  maximum_distance: z.number().min(0).max(180).optional(), // degrees
  associated_phase_count: z.number().int().min(0).max(10000).optional(),
  associated_station_count: z.number().int().min(0).max(5000).optional(),
  depth_phase_count: z.number().int().min(0).max(1000).optional(),
});
// NOTE: Cross-field checks (shallow depth+large magnitude, depth uncertainty vs depth)
// are handled as advisory warnings in lib/cross-field-validation.ts.
// They were previously .refine() hard-rejections here, which silently dropped valid events.

export type EarthquakeEvent = z.infer<typeof earthquakeEventSchema>;

// The four fields a catalogue record must carry to be usable. Used to measure completeness
// ("% of events have all required fields") independently of the optional-metadata range
// checks above, which describe metadata richness rather than required-field presence.
const requiredEventFieldsSchema = earthquakeEventSchema.pick({
  time: true,
  latitude: true,
  longitude: true,
  magnitude: true,
});

// Merge configuration schema
export const mergeConfigSchema = z.object({
  timeThreshold: z.number().min(0).max(3600), // Max 1 hour
  distanceThreshold: z.number().min(0).max(1000), // Max 1000 km
  mergeStrategy: z.enum(['priority', 'average', 'newest', 'complete', 'quality']),
  // An option name ('newest', 'geonet', 'custom', ...) or an agency name. Bounded because the
  // effective config is stored on every merged event (merge_parameters, contract C2).
  priority: z.string().max(100),
  // Custom Order (contract C10): source catalogue IDs, highest priority first. The designated
  // order decides which record is kept; remaining ties are broken by quality. Only meaningful
  // with priority 'custom'; mergeRequestSchema checks the IDs against the sources.
  priorityOrder: z.array(z.string().min(1).max(255)).max(50).optional(),
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

// Merge metadata schema — bounds the free-form metadata that is persisted with the merged
// catalogue so an oversized/arbitrary payload cannot be JSON.stringify-ed straight into the DB.
export const mergeMetadataSchema = z
  .object({
    merge_description: z.string().max(5000).optional(),
    merge_use_case: z.string().max(5000).optional(),
    merge_methodology: z.string().max(5000).optional(),
    merge_quality_assessment: z.string().max(5000).optional(),
    description: z.string().max(5000).optional(),
    data_source: z.string().max(1000).optional(),
    provider: z.string().max(255).optional(),
    geographic_region: z.string().max(255).optional(),
    data_quality: z.any().optional(),
    quality_notes: z.string().max(5000).optional(),
    keywords: z.array(z.string().max(200)).max(100).optional(),
    reference_links: z.array(z.string().max(2000)).max(100).optional(),
    notes: z.string().max(10000).optional(),
  })
  .strip() // drop unknown keys instead of persisting them
  .refine((m) => JSON.stringify(m ?? {}).length <= 50_000, {
    message: 'metadata exceeds the maximum allowed size (50KB)',
  });

export type MergeMetadata = z.infer<typeof mergeMetadataSchema>;

// Merge request schema
export const mergeRequestSchema = z.object({
  name: z.string().min(1).max(255),
  // Cap the number of source catalogues to bound the sequential DB reads (and, for the
  // persist path, the time the write transaction is held open) that a single request can trigger.
  sourceCatalogues: z.array(sourceCatalogueSchema).min(2).max(50),
  config: mergeConfigSchema,
  metadata: mergeMetadataSchema.optional(),
  exportOnly: z.boolean().optional(),
}).superRefine((request, ctx) => {
  // A Custom Order ranking must rank the catalogues being merged, each once: an unknown or
  // repeated ID would silently fall back to the quality tie-break for every group.
  const order = request.config.priorityOrder;
  if (!order) return;
  const sourceIds = new Set(request.sourceCatalogues.map((catalogue) => String(catalogue.id)));
  const seen = new Set<string>();
  order.forEach((id, index) => {
    if (!sourceIds.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'priorityOrder', index],
        message: `priorityOrder names catalogue "${id}", which is not one of the source catalogues`,
      });
    } else if (seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'priorityOrder', index],
        message: `priorityOrder lists catalogue "${id}" more than once`,
      });
    }
    seen.add(id);
  });
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
  fileType: z.enum(['csv', 'txt', 'dat', 'json', 'geojson', 'xml', 'qml']),
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
  depth: 'Number between -5 and 1000 (km)',
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
        message: 'Depth must be between -5 and 1000 km',
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
 * Resolve an event's horizontal location uncertainty in KM.
 */
export function horizontalUncertaintyKm(event: any): number | null {
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  // An uncertainty cannot be negative: a -999 / -1 missing-value sentinel is absent (as in
  // lib/uncertainty-utils), not a reported and apparently precise location.
  const uncertainty = (v: unknown): number | null => {
    const n = num(v);
    return n !== null && n >= 0 ? n : null;
  };
  // One precedence everywhere (lib/uncertainty-utils horizontalUncertaintyKm): the
  // error-ellipse semi-major axis, then the circular radius, then the marginals.
  const majorAxisKm = uncertainty(event?.max_horizontal_uncertainty);
  if (majorAxisKm !== null) return majorAxisKm;
  const km = uncertainty(event?.horizontal_uncertainty);
  if (km !== null) return km;
  const latUnc = uncertainty(event?.latitude_uncertainty);
  const lonUnc = uncertainty(event?.longitude_uncertainty);
  if (latUnc === null && lonUnc === null) return null;
  const lat = num(event?.latitude) ?? 0;
  return Math.max(
    (latUnc ?? 0) * 111,
    (lonUnc ?? 0) * 111 * Math.cos((lat * Math.PI) / 180)
  );
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

  // Completeness is reported to the user as "% of events have all required fields", so it
  // must be measured against the required fields only. Measuring it with the full
  // earthquakeEventSchema (as this did) also range-checked ~16 OPTIONAL metadata fields, so a
  // single out-of-range optional value — a historical time_uncertainty, an ISC-scale station
  // count — dropped completeness to 0% and failed the quality gate for a catalogue whose
  // required fields were all present and in range. Depth range violations are reported
  // separately by validateEventWithDetails() and detectAnomalies().
  const completeEvents = events.filter(e => requiredEventFieldsSchema.safeParse(e).success);

  // Counts events reporting ANY uncertainty. horizontal_uncertainty (km) must be included:
  // it is the only horizontal column the QuakeML/GeoNet import path writes, so omitting it
  // reported "0.0% of events have uncertainty information" for those catalogues. Tested with
  // != null rather than truthiness so a genuinely reported 0 still counts as reported.
  // Presence counts report what was PUBLISHED, separately from judging it. A reported
  // zero is a value: `e.azimuthal_gap ||` treated gap 0 as absent, and the uncertainty
  // test omitted the time and magnitude dimensions the schema supports.
  const eventsWithUncertainties = events.filter(e =>
    e.horizontal_uncertainty != null ||
    e.min_horizontal_uncertainty != null ||
    e.max_horizontal_uncertainty != null ||
    e.latitude_uncertainty != null ||
    e.longitude_uncertainty != null ||
    e.depth_uncertainty != null ||
    e.time_uncertainty != null ||
    e.magnitude_uncertainty != null
  ).length;

  const eventsWithQualityMetrics = events.filter(e =>
    e.azimuthal_gap != null || e.used_phase_count != null || e.used_station_count != null
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
  // Longitude extent is antimeridian-aware (minLon > maxLon denotes a box crossing 180),
  // so NZ offshore (Kermadec) catalogues are not reported as globe-spanning.
  const lonExtent = lons.length > 0 ? longitudeExtent(lons) : null;
  const spatialExtent = latBounds && lonExtent ? {
    minLat: latBounds.min,
    maxLat: latBounds.max,
    minLon: lonExtent.west,
    maxLon: lonExtent.east,
  } : null;

  // Completeness checks
  const completenessScore = (completeEvents.length / events.length) * 100;

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

  // Check for duplicate times. The message counts the EVENTS that share a timestamp, not
  // the distinct repeated timestamps (100 events at one instant used to read "Found 1
  // events"). The penalty is the percentage of records that are extra copies: a flat -10
  // could not tell one coincident pair in a large catalogue from a file where every row
  // repeats.
  const timeCounts = new Map<string, number>();
  events.forEach(e => {
    if (e.time) {
      const count = timeCounts.get(e.time) || 0;
      timeCounts.set(e.time, count + 1);
    }
  });
  const duplicateGroups = Array.from(timeCounts.values()).filter(count => count > 1);
  if (duplicateGroups.length > 0) {
    const eventsInGroups = duplicateGroups.reduce((sum, count) => sum + count, 0);
    const extraCopies = eventsInGroups - duplicateGroups.length;
    consistencyScore -= (100 * extraCopies) / events.length;
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Found ${eventsInGroups} events sharing ${duplicateGroups.length} duplicated timestamp${duplicateGroups.length === 1 ? '' : 's'}`,
      field: 'time',
      suggestion: `Review events with identical times - up to ${extraCopies} of them may be duplicate records`
    });
  }

  // Check for suspicious magnitude-depth relationships.
  // Threshold: depth < 5 km AND magnitude > 8. This is the same cut used by
  // validateMagnitudeDepthRelationship() in lib/cross-field-validation.ts and is the one
  // documented for the platform ("M > 8 at depth < 5 km is extremely rare"); the two sites
  // previously disagreed (>7 here, >8 there). M7-8 hypocentres shallower than 5 km do occur
  // in instrumental catalogues — commonly where depth is poorly constrained or fixed at a
  // shallow default — so the lower >7 cut penalised legitimate large shallow events.
  const suspiciousEvents = events.filter(e =>
    e.depth !== null && e.depth !== undefined && e.depth < 5 && e.magnitude > 8
  ).length;
  if (suspiciousEvents > 0) {
    consistencyScore -= 5;
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Found ${suspiciousEvents} very shallow (<5km) events with large magnitude (>8)`,
      suggestion: 'These events are rare and should be reviewed for accuracy'
    });
  }
  // The duplicate penalty alone can reach 100, so keep the score a percentage.
  consistencyScore = Math.max(0, consistencyScore);

  // Accuracy checks based on uncertainty values.
  // A missing uncertainty is NOT evidence of a precise location, so it must not be coerced to
  // 0 (which previously left a catalogue that publishes no uncertainty metadata at all on a
  // perfect accuracy of 100, out-ranking one that honestly reports its uncertainties). Score
  // the reported values on their own, and penalise the un-reported fraction by the same
  // amount as the worst reported case so that withholding uncertainties can never score
  // better than publishing them.
  const HIGH_UNCERTAINTY_PENALTY = 30;
  const HIGH_UNCERTAINTY_KM = 10;

  // Resolve each event's horizontal uncertainty in km from EITHER representation — the
  // horizontal_uncertainty column (km) or the latitude/longitude pair (degrees). Testing only
  // the degree pair, as this did, reported every QuakeML/GeoNet import as publishing no
  // location uncertainty and cost it the full 30-point penalty. See horizontalUncertaintyKm().
  const reportedUncertaintiesKm = events
    .map(e => horizontalUncertaintyKm(e))
    .filter((km): km is number => km !== null);

  const missingUncertaintyEvents = events.length - reportedUncertaintiesKm.length;
  const missingUncertaintyFraction = missingUncertaintyEvents / events.length;
  const highUncertaintyEvents = reportedUncertaintiesKm.filter(
    km => km > HIGH_UNCERTAINTY_KM
  ).length;
  // Round the combined count once. Rounding each fraction separately lets hiding
  // one poor measurement increase the score (two poor events out of seven: 91 -> 92).
  const accuracyScore = 100 - Math.round(
    HIGH_UNCERTAINTY_PENALTY * (missingUncertaintyEvents + highUncertaintyEvents) / events.length
  );

  if (missingUncertaintyFraction > 0) {
    checks.push({
      passed: false,
      severity: missingUncertaintyFraction >= 0.5 ? 'warning' : 'info',
      message: `${(missingUncertaintyFraction * 100).toFixed(1)}% of events report no horizontal location uncertainty, so their location accuracy cannot be assessed`,
      field: 'location_uncertainty',
      suggestion: 'Publish latitude/longitude (or horizontal) uncertainties so location accuracy can be assessed'
    });
  }

  if (reportedUncertaintiesKm.length > 0) {
    // Degrees were already converted to km by horizontalUncertaintyKm(). A degree of longitude
    // shortens by cos(latitude), so at NZ latitudes (~-41 deg) 0.1 deg of longitude is 8.4 km,
    // not 10 km — the original bare 0.1-degree threshold ignored that factor.
    // Proportional over ALL events, on the same scale as the missing-uncertainty penalty
    // above. The previous flat 30-point penalty fired only past a 50% majority of the
    // events that REPORTED an uncertainty, so removing two poor measurements from a
    // catalogue of ten dropped it below the majority and raised accuracy 70 -> 94: the
    // score rewarded withholding data. A bad measurement and a missing one now cost
    // exactly the same, and there is no threshold to step around.
    const highUncertaintyFraction = highUncertaintyEvents / events.length;
    if (highUncertaintyEvents > 0) {
      checks.push({
        passed: false,
        severity: highUncertaintyFraction >= 0.5 ? 'warning' : 'info',
        message: `${((highUncertaintyEvents / reportedUncertaintiesKm.length) * 100).toFixed(1)}% of events with a reported uncertainty have high location uncertainty (>${HIGH_UNCERTAINTY_KM}km)`,
        field: 'location_uncertainty',
        suggestion: 'Consider improving location accuracy with more stations or better velocity models'
      });
    }
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

  // Strictly inverted bounds are an error. Equal bounds are a single point - a valid
  // one-event catalogue - and were wrongly rejected here with a hard error.
  if (bounds.minLat > bounds.maxLat) {
    checks.push({
      passed: false,
      severity: 'error',
      message: 'Minimum latitude must not exceed maximum latitude',
      field: 'latitude_bounds'
    });
  }

  // Note: minLon > maxLon is NOT an error — it is the RFC 7946 §5.2 convention for
  // a box crossing the antimeridian (180°), which NZ offshore catalogues require.
  const latRange = bounds.maxLat - bounds.minLat;
  const lonRange = bounds.maxLon >= bounds.minLon
    ? bounds.maxLon - bounds.minLon
    : bounds.maxLon + 360 - bounds.minLon;

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
