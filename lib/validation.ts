import { z } from 'zod';

/**
 * Validation schemas for earthquake catalogue data
 */

// Earthquake event schema
export const earthquakeEventSchema = z.object({
  id: z.string().optional(),
  time: z.string().datetime().or(z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid timestamp format'
  })),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  depth: z.number().min(0).max(1000).nullable().optional(),
  magnitude: z.number().min(0).max(10),
  magnitudeType: z.string().optional(),
  region: z.string().optional(),
  source: z.string().optional(),
  status: z.enum(['automatic', 'reviewed', 'manual']).optional(),
});

export type EarthquakeEvent = z.infer<typeof earthquakeEventSchema>;

// Merge configuration schema
export const mergeConfigSchema = z.object({
  timeThreshold: z.number().min(0).max(3600), // Max 1 hour
  distanceThreshold: z.number().min(0).max(1000), // Max 1000 km
  mergeStrategy: z.enum(['priority', 'average', 'newest', 'complete']),
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

// File upload schema
export const fileUploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().max(100 * 1024 * 1024), // Max 100MB
  fileType: z.enum(['csv', 'txt', 'json', 'xml', 'qml']),
});

export type FileUpload = z.infer<typeof fileUploadSchema>;

// Catalogue metadata schema
export const catalogueMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  created_at: z.string().datetime(),
  source_catalogues: z.string(),
  merge_config: z.string(),
  event_count: z.number().int().min(0),
  status: z.enum(['processing', 'complete', 'error']),
});

export type CatalogueMetadata = z.infer<typeof catalogueMetadataSchema>;

// Field mapping schema - includes all QuakeML 1.2 fields
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

    // QuakeML 1.2 Event metadata
    'event_public_id',
    'event_type',
    'event_type_certainty',

    // Origin uncertainties
    'time_uncertainty',
    'latitude_uncertainty',
    'longitude_uncertainty',
    'depth_uncertainty',

    // Magnitude details
    'magnitude_type',
    'magnitude_uncertainty',
    'magnitude_station_count',

    // Origin quality metrics
    'azimuthal_gap',
    'used_phase_count',
    'used_station_count',
    'standard_error',

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

