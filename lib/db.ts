/**
 * MongoDB Database Module
 *
 * Provides database operations for the earthquake catalogue application.
 */

// Check Node.js version on server startup
import './check-node-version';

import { getDb, getCollection, COLLECTIONS, withTransaction, ClientSession } from './mongodb';
import { Db, WithId, Document } from 'mongodb';
import { invalidateCatalogueCache } from './cache';

export interface MergedCatalogue {
  id: string;
  name: string;
  created_at: string;
  source_catalogues: string;
  merge_config: string;
  event_count: number;
  status: 'processing' | 'complete' | 'error';

  // Geographic bounds
  min_latitude?: number | null;
  max_latitude?: number | null;
  min_longitude?: number | null;
  max_longitude?: number | null;

  // Basic metadata
  description?: string | null;
  data_source?: string | null;
  provider?: string | null;
  geographic_region?: string | null;

  // Time period coverage
  time_period_start?: string | null;
  time_period_end?: string | null;

  // Quality and completeness
  data_quality?: string | null; // JSON: {completeness, accuracy, reliability}
  quality_notes?: string | null;

  // Validation reporting
  validation_summary?: string | null; // JSON summary from upload validation
  validation_report?: string | null; // JSON report (may be truncated)
  validation_timestamp?: string | null;

  // Contact and attribution
  contact_name?: string | null;
  contact_email?: string | null;
  contact_organization?: string | null;

  // License and usage
  license?: string | null;
  usage_terms?: string | null;
  citation?: string | null;

  // Additional metadata
  doi?: string | null;
  version?: string | null;
  keywords?: string | null; // JSON array
  reference_links?: string | null; // JSON array
  notes?: string | null;

  // Merge-specific metadata
  merge_description?: string | null;
  merge_use_case?: string | null;
  merge_methodology?: string | null;
  merge_quality_assessment?: string | null;

  // Provenance tracking
  created_by?: string | null;
  modified_at?: string | null;
  modified_by?: string | null;
}

export interface MergedEvent {
  id: string;
  catalogue_id: string;
  source_id?: string | null;  // Original event ID from source (e.g., GeoNet event ID)
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
  source_events: string;
  created_at: string;

  // Location information
  region?: string | null;  // Geographic region or location name
  location_name?: string | null;  // Specific location description

  // QuakeML 1.2 Event metadata
  event_public_id?: string | null;
  event_type?: string | null;
  event_type_certainty?: string | null;

  // Origin uncertainties
  time_uncertainty?: number | null;
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;
  horizontal_uncertainty?: number | null;  // Horizontal location uncertainty (km)

  // Origin metadata (QuakeML/GeoNet/ISC)
  depth_type?: string | null;  // How depth was determined (from location, constrained by depth phases, etc.)
  earth_model_id?: string | null;  // Velocity model used for location (e.g., "nz3d", "iasp91")
  method_id?: string | null;  // Location method used

  // Agency/Author information (ISC/QuakeML)
  agency_id?: string | null;  // Contributing agency (e.g., "GNS", "ISC", "USGS")
  author?: string | null;  // Author of the solution

  // Magnitude details
  magnitude_type?: string | null;
  magnitude_uncertainty?: number | null;
  magnitude_station_count?: number | null;
  magnitude_method_id?: string | null;  // Method used for magnitude calculation
  magnitude_evaluation_mode?: string | null;  // Manual/automatic for magnitude
  magnitude_evaluation_status?: string | null;  // Status of magnitude determination

  // Origin quality metrics
  azimuthal_gap?: number | null;
  used_phase_count?: number | null;
  used_station_count?: number | null;
  standard_error?: number | null;
  minimum_distance?: number | null;  // Distance to nearest station (degrees)
  maximum_distance?: number | null;  // Distance to farthest station (degrees)
  associated_phase_count?: number | null;  // Total phases associated with event
  associated_station_count?: number | null;  // Total stations associated
  depth_phase_count?: number | null;  // Number of depth phases used

  // Evaluation metadata
  evaluation_mode?: string | null;
  evaluation_status?: string | null;

  // Preferred IDs for QuakeML export
  preferred_origin_id?: string | null;
  preferred_magnitude_id?: string | null;

  // Complex nested data as JSON strings
  origin_quality?: string | null;
  origins?: string | null;
  magnitudes?: string | null;
  picks?: string | null;
  arrivals?: string | null;
  focal_mechanisms?: string | null;
  amplitudes?: string | null;
  station_magnitudes?: string | null;
  event_descriptions?: string | null;
  comments?: string | null;
  creation_info?: string | null;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/**
 * Cursor-based pagination parameters
 * Performance Optimization: More efficient than offset-based pagination for large datasets
 */
export interface CursorPaginationParams {
  /**
   * Cursor value (typically the ID or timestamp of the last item from previous page)
   */
  cursor?: string;

  /**
   * Number of items to return
   */
  limit?: number;

  /**
   * Sort direction: 'asc' or 'desc'
   * Default: 'desc' (newest first)
   */
  direction?: 'asc' | 'desc';
}

/**
 * Cursor-based paginated result
 */
export interface CursorPaginatedResult<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    prevCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

// Transaction callback type
export type TransactionCallback<T> = (session: ClientSession) => Promise<T>;

// Database query interface with proper typing
export interface DbQueries {
  insertCatalogue: (
    id: string,
    name: string,
    sourceCatalogues: string,
    mergeConfig: string,
    eventCount: number,
    status: string,
    metadata?: Partial<MergedCatalogue>,
    session?: ClientSession
  ) => Promise<void>;

  insertEvent: (event: Partial<MergedEvent> & {
    id: string;
    catalogue_id: string;
    time: string;
    latitude: number;
    longitude: number;
    magnitude: number;
    source_events: string;
  }, session?: ClientSession) => Promise<void>;

  // Performance Optimization: Bulk insert for importing large datasets
  bulkInsertEvents: (events: Array<Partial<MergedEvent> & {
    id: string;
    catalogue_id: string;
    time: string;
    latitude: number;
    longitude: number;
    magnitude: number;
    source_events: string;
  }>, session?: ClientSession) => Promise<void>;

  getCatalogues: (params?: PaginationParams) => Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>>;

  getCatalogueById: (id: string) => Promise<MergedCatalogue | undefined>;

  getEventsByCatalogueId: (catalogueId: string, params?: PaginationParams) => Promise<MergedEvent[] | PaginatedResult<MergedEvent>>;

  // Performance Optimization: Cursor-based pagination for better performance on large datasets
  getEventsByCatalogueIdCursor: (catalogueId: string, params?: CursorPaginationParams) => Promise<CursorPaginatedResult<MergedEvent>>;

  updateCatalogueStatus: (status: string, id: string, session?: ClientSession) => Promise<void>;

  updateCatalogueName: (name: string, id: string) => Promise<void>;

  updateCatalogueEventCount: (id: string, eventCount: number, session?: ClientSession) => Promise<void>;

  updateCatalogueGeoBounds: (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number, session?: ClientSession) => Promise<void>;

  updateCatalogueMetadata: (id: string, metadata: Partial<MergedCatalogue>) => Promise<void>;

  getCataloguesByRegion: (minLat: number, maxLat: number, minLon: number, maxLon: number) => Promise<MergedCatalogue[]>;

  deleteCatalogue: (id: string) => Promise<void>;

  getFilteredEvents: (catalogueId: string, filters: EventFilters) => Promise<FilteredEventsResult>;

  // Transaction support
  transaction: <T>(callback: TransactionCallback<T>) => Promise<T>;

  // Mapping template methods
  insertMappingTemplate: (id: string, name: string, description: string | null, mappings: string) => Promise<void>;
  getMappingTemplates: () => Promise<MappingTemplate[]>;
  getMappingTemplateById: (id: string) => Promise<MappingTemplate | undefined>;
  updateMappingTemplate: (id: string, name: string, description: string | null, mappings: string) => Promise<void>;
  deleteMappingTemplate: (id: string) => Promise<void>;

  // GeoNet import methods
  getEventBySourceId: (catalogueId: string, sourceId: string) => Promise<MergedEvent | undefined>;
  // Performance Optimization: Bulk query for efficient duplicate detection
  getEventsBySourceIds: (catalogueId: string, sourceIds: string[]) => Promise<Map<string, string>>;
  updateEvent: (id: string, updates: Partial<MergedEvent>) => Promise<void>;
  insertImportHistory: (
    id: string,
    catalogueId: string,
    startTime: string,
    endTime: string,
    totalFetched: number,
    newEvents: number,
    updatedEvents: number,
    skippedEvents: number,
    errors: string | null
  ) => Promise<void>;
  getImportHistory: (catalogueId: string, limit: number) => Promise<ImportHistory[]>;

  // Search method
  searchEvents: (query: string, limit: number, catalogueId?: string) => Promise<any[]>;

  // Saved filter methods
  insertSavedFilter: (id: string, name: string, description: string | null, filterConfig: string) => Promise<void>;
  getSavedFilters: () => Promise<SavedFilter[]>;
  getSavedFilterById: (id: string) => Promise<SavedFilter | undefined>;
  updateSavedFilter: (id: string, name: string, description: string | null, filterConfig: string) => Promise<void>;
  deleteSavedFilter: (id: string) => Promise<void>;
}

// Import history interface
export interface ImportHistory {
  id: string;
  catalogue_id: string;
  start_time: string;
  end_time: string;
  total_fetched: number;
  new_events: number;
  updated_events: number;
  skipped_events: number;
  errors: string | null;
  created_at: string;
}

// Mapping template interface
export interface MappingTemplate {
  id: string;
  name: string;
  description: string | null;
  mappings: string;
  created_at: string;
  updated_at: string;
}

// Saved filter interface
export interface SavedFilter {
  id: string;
  name: string;
  description: string | null;
  filter_config: string; // JSON string
  created_at: string;
  updated_at: string;
}

// ============================================================================
// EVENT VALIDATION
// ============================================================================

/**
 * Allowed values for QuakeML enumerated string fields.
 * Sources: QuakeML 1.2 schema, ISC-GEM, FDSN standards.
 * Exported so upload pipelines and tests can reuse the same constraints.
 */
export const ALLOWED_EVALUATION_STATUS = new Set([
  'preliminary', 'confirmed', 'reviewed', 'final', 'rejected',
]);

export const ALLOWED_EVALUATION_MODE = new Set(['manual', 'automatic']);

export const ALLOWED_DEPTH_TYPE = new Set([
  'from location', 'from moment tensor inversion',
  'from modeling of broad-band P waveforms',
  'constrained by depth phases', 'constrained by direct phases',
  'constrained by S-P time differences',
  'operator assigned', 'other',
]);

export const ALLOWED_EVENT_TYPE = new Set([
  'not existing', 'not reported', 'earthquake', 'anthropogenic event',
  'collapse', 'cavity collapse', 'mine collapse', 'building collapse',
  'explosion', 'accidental explosion', 'chemical explosion',
  'controlled explosion', 'experimental explosion', 'industrial explosion',
  'mining explosion', 'quarry blast', 'road cut', 'blasting levee',
  'nuclear explosion', 'induced or triggered event', 'rock burst',
  'reservoir loading', 'fluid injection', 'fluid extraction',
  'crash', 'plane crash', 'train crash', 'boat crash',
  'other event', 'atmospheric event', 'sonic boom', 'sonic blast',
  'acoustic noise', 'thunder', 'avalanche', 'snow avalanche',
  'debris avalanche', 'hydroacoustic event', 'ice quake', 'slide',
  'landslide', 'rockslide', 'volcanic eruption', 'tremor',
  'volcanic tremor', 'tectonic', 'volcanic', 'meteorite',
]);

export const ALLOWED_EVENT_TYPE_CERTAINTY = new Set(['suspected', 'known']);

/**
 * Validate a single MergedEvent record: required fields (coordinates, magnitude,
 * timestamp, depth) plus optional enum and numeric-range fields.
 *
 * Throws an Error with a descriptive message on the first violation found.
 * Call this before any insert operation to guarantee data integrity.
 */
export function validateMergedEvent(event: Partial<MergedEvent> & {
  id: string;
  catalogue_id: string;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  source_events: string;
}): void {
  // --- Required scalar fields ------------------------------------------------
  if (event.latitude < -90 || event.latitude > 90) {
    throw new Error(`[Event ${event.id}] Invalid latitude: ${event.latitude}. Must be between -90 and 90`);
  }
  if (event.longitude < -180 || event.longitude > 180) {
    throw new Error(`[Event ${event.id}] Invalid longitude: ${event.longitude}. Must be between -180 and 180`);
  }
  if (event.magnitude < -3 || event.magnitude > 10) {
    throw new Error(`[Event ${event.id}] Invalid magnitude: ${event.magnitude}. Must be between -3 and 10`);
  }
  if (event.depth !== null && event.depth !== undefined && (event.depth < -5 || event.depth > 1000)) {
    throw new Error(`[Event ${event.id}] Invalid depth: ${event.depth}. Must be between -5 and 1000 km`);
  }
  const parsedTime = new Date(event.time);
  if (isNaN(parsedTime.getTime())) {
    throw new Error(`[Event ${event.id}] Invalid timestamp: ${event.time}`);
  }

  // --- Optional enum fields --------------------------------------------------
  if (event.evaluation_status != null &&
      !ALLOWED_EVALUATION_STATUS.has(event.evaluation_status.toLowerCase())) {
    throw new Error(
      `[Event ${event.id}] Invalid evaluation_status: "${event.evaluation_status}". ` +
      `Allowed: ${Array.from(ALLOWED_EVALUATION_STATUS).join(', ')}`
    );
  }
  if (event.evaluation_mode != null &&
      !ALLOWED_EVALUATION_MODE.has(event.evaluation_mode.toLowerCase())) {
    throw new Error(
      `[Event ${event.id}] Invalid evaluation_mode: "${event.evaluation_mode}". ` +
      `Allowed: ${Array.from(ALLOWED_EVALUATION_MODE).join(', ')}`
    );
  }
  if (event.magnitude_evaluation_status != null &&
      !ALLOWED_EVALUATION_STATUS.has(event.magnitude_evaluation_status.toLowerCase())) {
    throw new Error(
      `[Event ${event.id}] Invalid magnitude_evaluation_status: "${event.magnitude_evaluation_status}". ` +
      `Allowed: ${Array.from(ALLOWED_EVALUATION_STATUS).join(', ')}`
    );
  }
  if (event.magnitude_evaluation_mode != null &&
      !ALLOWED_EVALUATION_MODE.has(event.magnitude_evaluation_mode.toLowerCase())) {
    throw new Error(
      `[Event ${event.id}] Invalid magnitude_evaluation_mode: "${event.magnitude_evaluation_mode}". ` +
      `Allowed: ${Array.from(ALLOWED_EVALUATION_MODE).join(', ')}`
    );
  }
  if (event.depth_type != null &&
      !ALLOWED_DEPTH_TYPE.has(event.depth_type.toLowerCase())) {
    throw new Error(
      `[Event ${event.id}] Invalid depth_type: "${event.depth_type}". ` +
      `Allowed: ${Array.from(ALLOWED_DEPTH_TYPE).join(', ')}`
    );
  }
  if (event.event_type != null &&
      !ALLOWED_EVENT_TYPE.has(event.event_type.toLowerCase())) {
    throw new Error(
      `[Event ${event.id}] Invalid event_type: "${event.event_type}". ` +
      `Allowed: ${Array.from(ALLOWED_EVENT_TYPE).join(', ')}`
    );
  }
  if (event.event_type_certainty != null &&
      !ALLOWED_EVENT_TYPE_CERTAINTY.has(event.event_type_certainty.toLowerCase())) {
    throw new Error(
      `[Event ${event.id}] Invalid event_type_certainty: "${event.event_type_certainty}". ` +
      `Allowed: ${Array.from(ALLOWED_EVENT_TYPE_CERTAINTY).join(', ')}`
    );
  }

  // --- Optional numeric range fields -----------------------------------------
  if (event.azimuthal_gap != null && (event.azimuthal_gap < 0 || event.azimuthal_gap > 360)) {
    throw new Error(`[Event ${event.id}] Invalid azimuthal_gap: ${event.azimuthal_gap}. Must be between 0 and 360`);
  }
  if (event.magnitude_uncertainty != null && event.magnitude_uncertainty < 0) {
    throw new Error(`[Event ${event.id}] Invalid magnitude_uncertainty: ${event.magnitude_uncertainty}. Must be >= 0`);
  }
  if (event.time_uncertainty != null && event.time_uncertainty < 0) {
    throw new Error(`[Event ${event.id}] Invalid time_uncertainty: ${event.time_uncertainty}. Must be >= 0`);
  }
  if (event.latitude_uncertainty != null && event.latitude_uncertainty < 0) {
    throw new Error(`[Event ${event.id}] Invalid latitude_uncertainty: ${event.latitude_uncertainty}. Must be >= 0`);
  }
  if (event.longitude_uncertainty != null && event.longitude_uncertainty < 0) {
    throw new Error(`[Event ${event.id}] Invalid longitude_uncertainty: ${event.longitude_uncertainty}. Must be >= 0`);
  }
  if (event.depth_uncertainty != null && event.depth_uncertainty < 0) {
    throw new Error(`[Event ${event.id}] Invalid depth_uncertainty: ${event.depth_uncertainty}. Must be >= 0`);
  }
  if (event.horizontal_uncertainty != null && event.horizontal_uncertainty < 0) {
    throw new Error(`[Event ${event.id}] Invalid horizontal_uncertainty: ${event.horizontal_uncertainty}. Must be >= 0`);
  }
  if (event.used_station_count != null && event.used_station_count < 0) {
    throw new Error(`[Event ${event.id}] Invalid used_station_count: ${event.used_station_count}. Must be >= 0`);
  }
  if (event.used_phase_count != null && event.used_phase_count < 0) {
    throw new Error(`[Event ${event.id}] Invalid used_phase_count: ${event.used_phase_count}. Must be >= 0`);
  }
  if (event.standard_error != null && event.standard_error < 0) {
    throw new Error(`[Event ${event.id}] Invalid standard_error: ${event.standard_error}. Must be >= 0`);
  }
  if (event.minimum_distance != null && event.minimum_distance < 0) {
    throw new Error(`[Event ${event.id}] Invalid minimum_distance: ${event.minimum_distance}. Must be >= 0`);
  }
  if (event.maximum_distance != null && event.maximum_distance < 0) {
    throw new Error(`[Event ${event.id}] Invalid maximum_distance: ${event.maximum_distance}. Must be >= 0`);
  }
  if (event.maximum_distance != null &&
      event.minimum_distance != null &&
      event.maximum_distance < event.minimum_distance) {
    throw new Error(
      `[Event ${event.id}] maximum_distance (${event.maximum_distance}) must be >= minimum_distance (${event.minimum_distance})`
    );
  }
}

// Event filter interface
export interface EventFilters {
  minMagnitude?: number;
  maxMagnitude?: number;
  minDepth?: number;
  maxDepth?: number;
  startTime?: string;
  endTime?: string;
  eventType?: string;
  magnitudeType?: string;
  evaluationStatus?: string;
  evaluationMode?: string;
  maxAzimuthalGap?: number;
  minUsedPhaseCount?: number;
  minUsedStationCount?: number;
  maxStandardError?: number;
  // Geographic bounds
  minLatitude?: number;
  maxLatitude?: number;
  minLongitude?: number;
  maxLongitude?: number;
}

export interface FilteredEventsResult {
  events: MergedEvent[];
  truncated: boolean;
  limit: number;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

const UNPAGINATED_EVENTS_LIMIT = parseOptionalPositiveInt(process.env.UNPAGINATED_EVENTS_LIMIT);
const FILTERED_EVENTS_LIMIT = parseOptionalPositiveInt(process.env.FILTERED_EVENTS_LIMIT);

// Helper function to convert MongoDB document to plain object (remove _id)
function toPlainObject<T>(doc: WithId<Document> | null): T | undefined {
  if (!doc) return undefined;
  const { _id, ...rest } = doc;
  return rest as T;
}

function toPlainArray<T>(docs: WithId<Document>[]): T[] {
  return docs.map(doc => {
    const { _id, ...rest } = doc;
    return rest as T;
  });
}

// Database queries object - initialized lazily
let dbQueries: DbQueries | null = null;

// Initialize dbQueries only on server side
if (typeof window === 'undefined') {
  dbQueries = {
    insertCatalogue: async (
      id: string,
      name: string,
      sourceCatalogues: string,
      mergeConfig: string,
      eventCount: number,
      status: string,
      metadata?: Partial<MergedCatalogue>,
      session?: ClientSession
    ): Promise<void> => {
      // Validate inputs
      if (!id || !name || !sourceCatalogues || !mergeConfig) {
        throw new Error('Missing required fields for catalogue');
      }
      if (eventCount < 0) {
        throw new Error('Event count cannot be negative');
      }
      if (!['processing', 'complete', 'error'].includes(status)) {
        throw new Error('Invalid status value');
      }

      const collection = await getCollection(COLLECTIONS.CATALOGUES);

      const doc: any = {
        id,
        name,
        source_catalogues: sourceCatalogues,
        merge_config: mergeConfig,
        event_count: eventCount,
        status,
        created_at: new Date().toISOString(),
      };

      // Add metadata fields if provided
      if (metadata) {
        const metadataFields = [
          'description', 'data_source', 'provider', 'geographic_region',
          'time_period_start', 'time_period_end', 'data_quality', 'quality_notes',
          'validation_summary', 'validation_report', 'validation_timestamp',
          'contact_name', 'contact_email', 'contact_organization',
          'license', 'usage_terms', 'citation', 'doi', 'version',
          'keywords', 'reference_links', 'notes',
          'merge_description', 'merge_use_case', 'merge_methodology', 'merge_quality_assessment',
          'created_by', 'modified_at', 'modified_by'
        ];

        for (const field of metadataFields) {
          if (metadata[field as keyof MergedCatalogue] !== undefined) {
            doc[field] = metadata[field as keyof MergedCatalogue];
          }
        }
      }

      const options = session ? { session } : undefined;
      await collection.insertOne(doc, options);
    },

    insertEvent: async (event: Partial<MergedEvent> & {
      id: string;
      catalogue_id: string;
      time: string;
      latitude: number;
      longitude: number;
      magnitude: number;
      source_events: string;
    }, session?: ClientSession): Promise<void> => {
      validateMergedEvent(event);

      const collection = await getCollection(COLLECTIONS.EVENTS);

      const doc: any = {
        ...event,
        created_at: new Date().toISOString(),
      };

      const options = session ? { session } : undefined;
      await collection.insertOne(doc, options);

      // Performance Optimization: Invalidate caches after insert
      invalidateCatalogueCache(event.catalogue_id);
    },

    /**
     * Performance Optimization: Bulk insert events using MongoDB insertMany
     * This is much faster than individual inserts for large datasets
     */
    bulkInsertEvents: async (events: Array<Partial<MergedEvent> & {
      id: string;
      catalogue_id: string;
      time: string;
      latitude: number;
      longitude: number;
      magnitude: number;
      source_events: string;
    }>, session?: ClientSession): Promise<void> => {
      if (!events || events.length === 0) {
        return;
      }

      // Validate all events before touching the database — fail fast on the
      // first invalid record so no partial batch is ever written.
      for (const event of events) {
        validateMergedEvent(event);
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const now = new Date().toISOString();

      const docs = events.map(event => ({
        ...event,
        created_at: now,
      })) as any[];

      const options = session ? { session } : undefined;
      await collection.insertMany(docs, options);

      // Invalidate caches
      const catalogueIds = new Set(events.map(e => e.catalogue_id));
      catalogueIds.forEach(id => invalidateCatalogueCache(id));
    },

    getCatalogues: async (params?: PaginationParams): Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);

      if (!params || (!params.page && !params.pageSize)) {
        const docs = await collection.find({}).sort({ created_at: -1 }).toArray();
        return toPlainArray<MergedCatalogue>(docs);
      }

      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const skip = (page - 1) * pageSize;

      const [docs, totalItems] = await Promise.all([
        collection.find({}).sort({ created_at: -1 }).skip(skip).limit(pageSize).toArray(),
        collection.countDocuments({})
      ]);

      return {
        data: toPlainArray<MergedCatalogue>(docs),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize)
        }
      };
    },

    getCatalogueById: async (id: string): Promise<MergedCatalogue | undefined> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const doc = await collection.findOne({ id });
      return toPlainObject<MergedCatalogue>(doc);
    },

    getEventsByCatalogueId: async (catalogueId: string, params?: PaginationParams): Promise<MergedEvent[] | PaginatedResult<MergedEvent>> => {
      const collection = await getCollection(COLLECTIONS.EVENTS);

      if (!params || (!params.page && !params.pageSize)) {
        let query = collection
          .find({ catalogue_id: catalogueId })
          .sort({ time: -1 });

        // Optional cap for deployments that want to bound unpaginated payloads.
        // If UNPAGINATED_EVENTS_LIMIT is unset, return all matching events.
        if (UNPAGINATED_EVENTS_LIMIT) {
          query = query.limit(UNPAGINATED_EVENTS_LIMIT);
        }

        const docs = await query.toArray();
        return toPlainArray<MergedEvent>(docs);
      }

      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const skip = (page - 1) * pageSize;

      const [docs, totalItems] = await Promise.all([
        collection.find({ catalogue_id: catalogueId }).sort({ time: -1 }).skip(skip).limit(pageSize).toArray(),
        collection.countDocuments({ catalogue_id: catalogueId })
      ]);

      return {
        data: toPlainArray<MergedEvent>(docs),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize)
        }
      };
    },

    /**
     * Get events by catalogue ID using cursor-based pagination
     */
    getEventsByCatalogueIdCursor: async (
      catalogueId: string,
      params?: CursorPaginationParams
    ): Promise<CursorPaginatedResult<MergedEvent>> => {
      const limit = params?.limit || 100;
      const direction = params?.direction || 'desc';
      const cursor = params?.cursor;

      if (limit < 1 || limit > 40000) {
        throw new Error('Limit must be between 1 and 40000');
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const sortDir = direction === 'desc' ? -1 : 1;

      const query: Record<string, unknown> = { catalogue_id: catalogueId };

      if (cursor) {
        const [cursorTime, cursorId] = cursor.split(':');
        if (direction === 'desc') {
          query.$or = [
            { time: { $lt: cursorTime } },
            { time: cursorTime, id: { $lt: cursorId } }
          ];
        } else {
          query.$or = [
            { time: { $gt: cursorTime } },
            { time: cursorTime, id: { $gt: cursorId } }
          ];
        }
      }

      const docs = await collection
        .find(query)
        .sort({ time: sortDir, id: sortDir })
        .limit(limit + 1)
        .toArray();

      const hasMore = docs.length > limit;
      const data = toPlainArray<MergedEvent>(hasMore ? docs.slice(0, limit) : docs);

      let nextCursor: string | null = null;
      let prevCursor: string | null = null;

      if (data.length > 0) {
        const lastItem = data[data.length - 1];
        const firstItem = data[0];
        if (hasMore) {
          nextCursor = `${lastItem.time}:${lastItem.id}`;
        }
        if (cursor) {
          prevCursor = `${firstItem.time}:${firstItem.id}`;
        }
      }

      return {
        data,
        pagination: { nextCursor, prevCursor, hasMore, limit }
      };
    },

    updateCatalogueStatus: async (status: string, id: string, session?: ClientSession): Promise<void> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const options = session ? { session } : undefined;
      await collection.updateOne({ id }, { $set: { status } }, options);
    },

    updateCatalogueName: async (name: string, id: string): Promise<void> => {
      if (!name || !name.trim()) {
        throw new Error('Catalogue name cannot be empty');
      }
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      await collection.updateOne({ id }, { $set: { name } });
    },

    updateCatalogueEventCount: async (id: string, eventCount: number, session?: ClientSession): Promise<void> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }
      if (eventCount < 0) {
        throw new Error('Event count cannot be negative');
      }
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const options = session ? { session } : undefined;
      await collection.updateOne({ id }, { $set: { event_count: eventCount } }, options);
    },

    updateCatalogueGeoBounds: async (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number, session?: ClientSession): Promise<void> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }
      if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
        throw new Error('Latitude must be between -90 and 90');
      }
      if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) {
        throw new Error('Longitude must be between -180 and 180');
      }
      if (minLat > maxLat) {
        throw new Error('Minimum latitude cannot be greater than maximum latitude');
      }
      if (minLon > maxLon) {
        throw new Error('Minimum longitude cannot be greater than maximum longitude');
      }

      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const options = session ? { session } : undefined;
      await collection.updateOne({ id }, {
        $set: {
          min_latitude: minLat,
          max_latitude: maxLat,
          min_longitude: minLon,
          max_longitude: maxLon
        }
      }, options);
    },

    updateCatalogueMetadata: async (id: string, metadata: Partial<MergedCatalogue>): Promise<void> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }

      const allowedFields = [
        'description', 'data_source', 'provider', 'geographic_region',
        'time_period_start', 'time_period_end', 'data_quality', 'quality_notes',
        'contact_name', 'contact_email', 'contact_organization',
        'license', 'usage_terms', 'citation', 'doi', 'version',
        'keywords', 'reference_links', 'notes',
        'merge_description', 'merge_use_case', 'merge_methodology', 'merge_quality_assessment',
        'created_by', 'modified_at', 'modified_by'
      ];

      const updates: any = {};
      for (const [key, value] of Object.entries(metadata)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updates[key] = value;
        }
      }

      if (Object.keys(updates).length === 0) {
        return;
      }

      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      await collection.updateOne({ id }, { $set: updates });
    },

    getCataloguesByRegion: async (minLat: number, maxLat: number, minLon: number, maxLon: number): Promise<MergedCatalogue[]> => {
      if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
        throw new Error('Latitude must be between -90 and 90');
      }
      if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) {
        throw new Error('Longitude must be between -180 and 180');
      }

      const crossesDateline = minLon > maxLon;

      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const docs = await collection.find({
        min_latitude: { $ne: null },
        max_latitude: { $ne: null },
        min_longitude: { $ne: null },
        max_longitude: { $ne: null },
        $and: [
          { max_latitude: { $gte: minLat } },
          { min_latitude: { $lte: maxLat } },
          crossesDateline
            ? {
              $or: [
                { max_longitude: { $gte: minLon } },
                { min_longitude: { $lte: maxLon } }
              ]
            }
            : {
              $and: [
                { max_longitude: { $gte: minLon } },
                { min_longitude: { $lte: maxLon } }
              ]
            }
        ]
      }).sort({ created_at: -1 }).toArray();

      return toPlainArray<MergedCatalogue>(docs);
    },

    deleteCatalogue: async (id: string): Promise<void> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const eventsCollection = await getCollection(COLLECTIONS.EVENTS);

      // Delete associated events first
      await eventsCollection.deleteMany({ catalogue_id: id });
      await collection.deleteOne({ id });
    },

    getFilteredEvents: async (catalogueId: string, filters: EventFilters): Promise<FilteredEventsResult> => {
      const collection = await getCollection(COLLECTIONS.EVENTS);

      const query: Record<string, unknown> = { catalogue_id: catalogueId };

      if (filters.minMagnitude !== undefined) query.magnitude = { ...(query.magnitude as object), $gte: filters.minMagnitude };
      if (filters.maxMagnitude !== undefined) query.magnitude = { ...(query.magnitude as object), $lte: filters.maxMagnitude };
      if (filters.minDepth !== undefined) query.depth = { ...(query.depth as object), $gte: filters.minDepth };
      if (filters.maxDepth !== undefined) query.depth = { ...(query.depth as object), $lte: filters.maxDepth };
      if (filters.startTime) query.time = { ...(query.time as object), $gte: filters.startTime };
      if (filters.endTime) query.time = { ...(query.time as object), $lte: filters.endTime };
      if (filters.eventType) query.event_type = filters.eventType;
      if (filters.magnitudeType) query.magnitude_type = filters.magnitudeType;
      if (filters.evaluationStatus) query.evaluation_status = filters.evaluationStatus;
      if (filters.evaluationMode) query.evaluation_mode = filters.evaluationMode;
      if (filters.maxAzimuthalGap !== undefined) query.azimuthal_gap = { $lte: filters.maxAzimuthalGap };
      if (filters.minUsedPhaseCount !== undefined) query.used_phase_count = { $gte: filters.minUsedPhaseCount };
      if (filters.minUsedStationCount !== undefined) query.used_station_count = { $gte: filters.minUsedStationCount };
      if (filters.maxStandardError !== undefined) query.standard_error = { $lte: filters.maxStandardError };
      if (filters.minLatitude !== undefined) query.latitude = { ...(query.latitude as object), $gte: filters.minLatitude };
      if (filters.maxLatitude !== undefined) query.latitude = { ...(query.latitude as object), $lte: filters.maxLatitude };
      if (filters.minLongitude !== undefined) query.longitude = { ...(query.longitude as object), $gte: filters.minLongitude };
      if (filters.maxLongitude !== undefined) query.longitude = { ...(query.longitude as object), $lte: filters.maxLongitude };

      let docs: WithId<Document>[];
      let truncated = false;

      if (FILTERED_EVENTS_LIMIT) {
        docs = await collection.find(query).sort({ time: -1 }).limit(FILTERED_EVENTS_LIMIT + 1).toArray();
        truncated = docs.length > FILTERED_EVENTS_LIMIT;
      } else {
        docs = await collection.find(query).sort({ time: -1 }).toArray();
      }

      const limitedDocs = truncated && FILTERED_EVENTS_LIMIT ? docs.slice(0, FILTERED_EVENTS_LIMIT) : docs;

      return {
        events: toPlainArray<MergedEvent>(limitedDocs),
        truncated,
        // 0 means "no configured server-side cap" for this endpoint.
        limit: FILTERED_EVENTS_LIMIT || 0,
      };
    },

    // Transaction support using MongoDB sessions
    transaction: async <T>(callback: TransactionCallback<T>): Promise<T> => {
      // Use proper MongoDB transactions with session management
      // This provides ACID guarantees for multi-document operations
      return withTransaction(async (session: ClientSession) => {
        try {
          return await callback(session);
        } catch (error) {
          console.error('[Database] Transaction error:', error);
          throw error;
        }
      });
    },

    // Mapping template methods
    insertMappingTemplate: async (id: string, name: string, description: string | null, mappings: string): Promise<void> => {
      if (!id || !name || !mappings) {
        throw new Error('Missing required fields for mapping template');
      }

      const collection = await getCollection(COLLECTIONS.MAPPING_TEMPLATES);
      await collection.insertOne({
        id,
        name,
        description,
        mappings,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as any);
    },

    getMappingTemplates: async (): Promise<MappingTemplate[]> => {
      const collection = await getCollection(COLLECTIONS.MAPPING_TEMPLATES);
      const docs = await collection.find({}).sort({ created_at: -1 }).toArray();
      return toPlainArray<MappingTemplate>(docs);
    },

    getMappingTemplateById: async (id: string): Promise<MappingTemplate | undefined> => {
      const collection = await getCollection(COLLECTIONS.MAPPING_TEMPLATES);
      const doc = await collection.findOne({ id });
      return toPlainObject<MappingTemplate>(doc);
    },

    updateMappingTemplate: async (id: string, name: string, description: string | null, mappings: string): Promise<void> => {
      if (!id || !name || !mappings) {
        throw new Error('Missing required fields for mapping template');
      }

      const collection = await getCollection(COLLECTIONS.MAPPING_TEMPLATES);
      await collection.updateOne({ id }, {
        $set: { name, description, mappings, updated_at: new Date().toISOString() }
      });
    },

    deleteMappingTemplate: async (id: string): Promise<void> => {
      if (!id) {
        throw new Error('Missing template ID');
      }

      const collection = await getCollection(COLLECTIONS.MAPPING_TEMPLATES);
      await collection.deleteOne({ id });
    },

    // Saved filter methods
    insertSavedFilter: async (id: string, name: string, description: string | null, filterConfig: string): Promise<void> => {
      if (!id || !name || !filterConfig) {
        throw new Error('Missing required fields for saved filter');
      }

      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      await collection.insertOne({
        id,
        name,
        description,
        filter_config: filterConfig,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as any);
    },

    getSavedFilters: async (): Promise<SavedFilter[]> => {
      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      const docs = await collection.find({}).sort({ created_at: -1 }).toArray();
      return toPlainArray<SavedFilter>(docs);
    },

    getSavedFilterById: async (id: string): Promise<SavedFilter | undefined> => {
      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      const doc = await collection.findOne({ id });
      return toPlainObject<SavedFilter>(doc);
    },

    updateSavedFilter: async (id: string, name: string, description: string | null, filterConfig: string): Promise<void> => {
      if (!id || !name || !filterConfig) {
        throw new Error('Missing required fields for saved filter');
      }

      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      await collection.updateOne({ id }, {
        $set: { name, description, filter_config: filterConfig, updated_at: new Date().toISOString() }
      });
    },

    deleteSavedFilter: async (id: string): Promise<void> => {
      if (!id) {
        throw new Error('Missing filter ID');
      }

      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      await collection.deleteOne({ id });
    },

    // GeoNet import methods
    getEventBySourceId: async (catalogueId: string, sourceId: string): Promise<MergedEvent | undefined> => {
      if (!catalogueId || !sourceId) {
        throw new Error('Missing catalogue ID or source ID');
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const doc = await collection.findOne({ catalogue_id: catalogueId, source_id: sourceId });
      return toPlainObject<MergedEvent>(doc);
    },

    // Performance Optimization: Bulk query for efficient duplicate detection
    getEventsBySourceIds: async (catalogueId: string, sourceIds: string[]): Promise<Map<string, string>> => {
      if (!catalogueId) {
        throw new Error('Missing catalogue ID');
      }
      if (!sourceIds || sourceIds.length === 0) {
        return new Map();
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const docs = await collection.find({
        catalogue_id: catalogueId,
        source_id: { $in: sourceIds }
      }).project({ source_id: 1, id: 1 }).toArray();

      // Return map of source_id -> database id
      const result = new Map<string, string>();
      for (const doc of docs) {
        if (doc.source_id && doc.id) {
          result.set(doc.source_id, doc.id);
        }
      }
      return result;
    },

    updateEvent: async (id: string, updates: Partial<MergedEvent>): Promise<void> => {
      if (!id) {
        throw new Error('Missing event ID');
      }

      const updateFields: any = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          updateFields[key] = value;
        }
      });

      if (Object.keys(updateFields).length === 0) {
        return;
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      await collection.updateOne({ id }, { $set: updateFields });
    },

    insertImportHistory: async (
      id: string,
      catalogueId: string,
      startTime: string,
      endTime: string,
      totalFetched: number,
      newEvents: number,
      updatedEvents: number,
      skippedEvents: number,
      errors: string | null
    ): Promise<void> => {
      if (!id || !catalogueId || !startTime || !endTime) {
        throw new Error('Missing required import history fields');
      }

      const collection = await getCollection(COLLECTIONS.IMPORT_HISTORY);
      await collection.insertOne({
        id,
        catalogue_id: catalogueId,
        start_time: startTime,
        end_time: endTime,
        total_fetched: totalFetched,
        new_events: newEvents,
        updated_events: updatedEvents,
        skipped_events: skippedEvents,
        errors,
        created_at: new Date().toISOString()
      } as any);
    },

    getImportHistory: async (catalogueId: string, limit: number = 10): Promise<ImportHistory[]> => {
      if (!catalogueId) {
        throw new Error('Missing catalogue ID');
      }

      const collection = await getCollection(COLLECTIONS.IMPORT_HISTORY);
      const docs = await collection
        .find({ catalogue_id: catalogueId })
        .sort({ created_at: -1 })
        .limit(limit)
        .toArray();

      return toPlainArray<ImportHistory>(docs);
    },

    searchEvents: async (query: string, limit: number, catalogueId?: string): Promise<any[]> => {
      if (!query || query.trim().length < 2) {
        return [];
      }

      const searchTerm = query.trim();
      const eventsCollection = await getCollection(COLLECTIONS.EVENTS);
      const cataloguesCollection = await getCollection(COLLECTIONS.CATALOGUES);

      const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const tokenRegex = /(\w+):("(?:[^"\\]|\\.)*"|\S+)/g;
      const tokens: Array<{ field: string; value: string }> = [];
      const normalizedQuery = searchTerm.replace(tokenRegex, ' ');
      let match: RegExpExecArray | null;

      tokenRegex.lastIndex = 0;
      while ((match = tokenRegex.exec(searchTerm)) !== null) {
        const rawValue = match[2];
        const value = rawValue.startsWith('"') && rawValue.endsWith('"')
          ? rawValue.slice(1, -1)
          : rawValue;
        tokens.push({ field: match[1].toLowerCase(), value });
      }

      const terms = normalizedQuery.split(/\s+/).filter(Boolean);
      const andConditions: any[] = [];

      if (catalogueId) {
        andConditions.push({ catalogue_id: catalogueId });
      }

      const textFields = [
        'event_public_id',
        'event_type',
        'id',
        'region',
        'location_name',
        'magnitude_type',
        'agency_id',
        'author'
      ];

      for (const term of terms) {
        const regex = new RegExp(escapeRegex(term), 'i');
        andConditions.push({
          $or: textFields.map((field) => ({ [field]: regex }))
        });
      }

      const numericFilter = {
        magnitude: {
          min: undefined as number | undefined,
          max: undefined as number | undefined,
          minInclusive: true,
          maxInclusive: true,
        },
        depth: {
          min: undefined as number | undefined,
          max: undefined as number | undefined,
          minInclusive: true,
          maxInclusive: true,
        }
      };

      const updateMin = (field: 'magnitude' | 'depth', value: number, inclusive: boolean) => {
        const filter = numericFilter[field];
        if (filter.min === undefined || value > filter.min) {
          filter.min = value;
          filter.minInclusive = inclusive;
        } else if (value === filter.min) {
          filter.minInclusive = filter.minInclusive && inclusive;
        }
      };

      const updateMax = (field: 'magnitude' | 'depth', value: number, inclusive: boolean) => {
        const filter = numericFilter[field];
        if (filter.max === undefined || value < filter.max) {
          filter.max = value;
          filter.maxInclusive = inclusive;
        } else if (value === filter.max) {
          filter.maxInclusive = filter.maxInclusive && inclusive;
        }
      };

      const applyNumericFilter = (field: 'magnitude' | 'depth', value: string) => {
        const rangeMatch = value.match(/^(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
          const minValue = parseFloat(rangeMatch[1]);
          const maxValue = parseFloat(rangeMatch[2]);
          if (!Number.isNaN(minValue)) {
            updateMin(field, minValue, true);
          }
          if (!Number.isNaN(maxValue)) {
            updateMax(field, maxValue, true);
          }
          return;
        }

        const compMatch = value.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)$/);
        if (!compMatch) return;

        const op = compMatch[1] || '=';
        const num = parseFloat(compMatch[2]);
        if (Number.isNaN(num)) return;

        if (op === '>') {
          updateMin(field, num, false);
        } else if (op === '>=') {
          updateMin(field, num, true);
        } else if (op === '<') {
          updateMax(field, num, false);
        } else if (op === '<=') {
          updateMax(field, num, true);
        } else {
          updateMin(field, num, true);
          updateMax(field, num, true);
        }
      };

      const parseDateRange = (value: string): { start: string; end: string } | null => {
        const normalized = value.trim().replace(/\//g, '-');
        const rangeParts = normalized.split('..').map(part => part.trim()).filter(Boolean);
        const parseSingleDate = (dateValue: string): { start: Date; end: Date } | null => {
          const parts = dateValue.split('-').map((part) => part.trim());
          if (!parts[0] || parts[0].length !== 4) return null;
          const year = parseInt(parts[0], 10);
          if (Number.isNaN(year)) return null;

          if (parts.length === 1) {
            const start = new Date(Date.UTC(year, 0, 1));
            const end = new Date(Date.UTC(year + 1, 0, 1));
            return { start, end };
          }

          const month = parseInt(parts[1], 10);
          if (Number.isNaN(month) || month < 1 || month > 12) return null;

          if (parts.length === 2) {
            const start = new Date(Date.UTC(year, month - 1, 1));
            const end = new Date(Date.UTC(year, month, 1));
            return { start, end };
          }

          const day = parseInt(parts[2], 10);
          if (Number.isNaN(day) || day < 1 || day > 31) return null;
          const start = new Date(Date.UTC(year, month - 1, day));
          const end = new Date(Date.UTC(year, month - 1, day + 1));
          return { start, end };
        };

        if (rangeParts.length === 2) {
          const startRange = parseSingleDate(rangeParts[0]);
          const endRange = parseSingleDate(rangeParts[1]);
          if (!startRange || !endRange) return null;
          return {
            start: startRange.start.toISOString(),
            end: endRange.end.toISOString()
          };
        }

        const single = parseSingleDate(normalized);
        if (!single) return null;
        return {
          start: single.start.toISOString(),
          end: single.end.toISOString()
        };
      };

      const catalogueFilters: string[] = [];

      for (const token of tokens) {
        const tokenValue = token.value.trim();
        if (!tokenValue) continue;

        if (token.field === 'id') {
          const regex = new RegExp(escapeRegex(tokenValue), 'i');
          andConditions.push({
            $or: [
              { id: regex },
              { event_public_id: regex }
            ]
          });
          continue;
        }

        if (token.field === 'public') {
          const regex = new RegExp(escapeRegex(tokenValue), 'i');
          andConditions.push({ event_public_id: regex });
          continue;
        }

        if (token.field === 'type' || token.field === 'event') {
          const regex = new RegExp(escapeRegex(tokenValue), 'i');
          andConditions.push({ event_type: regex });
          continue;
        }

        if (token.field === 'region' || token.field === 'loc' || token.field === 'location') {
          const regex = new RegExp(escapeRegex(tokenValue), 'i');
          andConditions.push({
            $or: [
              { region: regex },
              { location_name: regex }
            ]
          });
          continue;
        }

        if (token.field === 'mag' || token.field === 'magnitude') {
          applyNumericFilter('magnitude', tokenValue);
          continue;
        }

        if (token.field === 'depth') {
          applyNumericFilter('depth', tokenValue);
          continue;
        }

        if (token.field === 'date' || token.field === 'time') {
          const dateRange = parseDateRange(tokenValue);
          if (dateRange) {
            andConditions.push({
              time: {
                $gte: dateRange.start,
                $lt: dateRange.end
              }
            });
          }
          continue;
        }

        if (token.field === 'catalogue' || token.field === 'source') {
          catalogueFilters.push(tokenValue);
        }
      }

      if (catalogueFilters.length > 0) {
        let matchedCatalogueIds: string[] | null = null;
        for (const filter of catalogueFilters) {
          const regex = new RegExp(escapeRegex(filter), 'i');
          const matches = await cataloguesCollection
            .find({ name: { $regex: regex } })
            .toArray() as any[];
          const ids = matches.map((c: any) => c.id);
          if (!matchedCatalogueIds) {
            matchedCatalogueIds = ids;
          } else {
            matchedCatalogueIds = matchedCatalogueIds.filter((id) => ids.includes(id));
          }
        }
        if (!matchedCatalogueIds || matchedCatalogueIds.length === 0) {
          return [];
        }
        andConditions.push({ catalogue_id: { $in: matchedCatalogueIds } });
      }

      const buildNumericQuery = (field: 'magnitude' | 'depth') => {
        const filter = numericFilter[field];
        if (filter.min === undefined && filter.max === undefined) return null;
        if (filter.min !== undefined && filter.max !== undefined && filter.min > filter.max) {
          return { invalid: true } as const;
        }
        const query: Record<string, number> = {};
        if (filter.min !== undefined) {
          query[filter.minInclusive ? '$gte' : '$gt'] = filter.min;
        }
        if (filter.max !== undefined) {
          query[filter.maxInclusive ? '$lte' : '$lt'] = filter.max;
        }
        return query;
      };

      const magnitudeQuery = buildNumericQuery('magnitude');
      if (magnitudeQuery && 'invalid' in magnitudeQuery) {
        return [];
      }
      if (magnitudeQuery) {
        andConditions.push({ magnitude: magnitudeQuery });
      }

      const depthQuery = buildNumericQuery('depth');
      if (depthQuery && 'invalid' in depthQuery) {
        return [];
      }
      if (depthQuery) {
        andConditions.push({ depth: depthQuery });
      }

      if (andConditions.length === 0) {
        return [];
      }

      const searchQuery = { $and: andConditions };

      const events = await eventsCollection
        .find(searchQuery)
        .sort({ time: -1 })
        .limit(limit)
        .toArray() as any[];

      // Get catalogue names for the events
      const catalogueIds = Array.from(new Set(events.map((e: any) => e.catalogue_id)));
      const catalogues = await cataloguesCollection
        .find({ id: { $in: catalogueIds } })
        .toArray() as any[];

      const catalogueMap = new Map(catalogues.map((c: any) => [c.id, c.name]));

      return events.map((e: any) => ({
        id: e.id,
        catalogue_id: e.catalogue_id,
        public_id: e.event_public_id,
        time: e.time,
        latitude: e.latitude,
        longitude: e.longitude,
        depth: e.depth,
        magnitude: e.magnitude,
        magnitude_type: e.magnitude_type,
        event_type: e.event_type,
        region: e.region || null,
        location_name: e.location_name || null,
        catalogue_name: catalogueMap.get(e.catalogue_id) || null
      }));
    }
  };
}

/**
 * Get the MongoDB database instance (for advanced operations)
 */
export async function getDbInstance(): Promise<Db> {
  return getDb();
}

export { dbQueries };
