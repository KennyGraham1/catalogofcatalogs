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
import { boundsOverlap, type GeographicBounds } from './geo-bounds-utils';
import { decodeEventCursor, encodeEventCursor } from './event-cursor';

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
  // QuakeML OriginUncertainty error ellipse: semi-minor / semi-major axes (km) and the
  // azimuth of the semi-major axis (degrees clockwise from north).
  min_horizontal_uncertainty?: number | null;
  max_horizontal_uncertainty?: number | null;
  azimuth_max_horizontal_uncertainty?: number | null;

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
  preferred_focal_mechanism_id?: string | null;

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
  /**
   * Absolute number of documents to skip, as the public API documents `offset`
   * ("number of items to skip"). Takes precedence over `page` when supplied:
   * deriving the skip from `page` alone rounds the caller's offset down to a
   * multiple of `pageSize` and silently returns a different window.
   */
  offset?: number;
}

/** Event list responses omit large provenance and waveform-related collections. */
/** Derived from EVENT_SUMMARY_PROJECTION so the type cannot drift from the projection. */
export type EventSummary = Omit<MergedEvent, keyof typeof EVENT_SUMMARY_PROJECTION>;
export const EVENT_SUMMARY_PROJECTION = {
  _id: 0, source_events: 0, origins: 0, magnitudes: 0, picks: 0, arrivals: 0,
  amplitudes: 0, station_magnitudes: 0, event_descriptions: 0, comments: 0, creation_info: 0,
};

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
  summary?: boolean;
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

  // Performance Optimization: Bulk insert for importing large datasets.
  // Resolves to the number of documents actually written, which can be lower
  // than events.length: rows repeating a source_id are dropped in-batch and
  // rows colliding with the (catalogue_id, source_id) unique index are skipped.
  bulkInsertEvents: (events: Array<Partial<MergedEvent> & {
    id: string;
    catalogue_id: string;
    time: string;
    latitude: number;
    longitude: number;
    magnitude: number;
    source_events: string;
  }>, session?: ClientSession) => Promise<number>;

  getCatalogues: (params?: PaginationParams) => Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>>;

  getCatalogueById: (id: string) => Promise<MergedCatalogue | undefined>;

  getEventsByCatalogueId: (catalogueId: string, params?: PaginationParams) => Promise<MergedEvent[] | PaginatedResult<MergedEvent>>;

  // Performance Optimization: Cursor-based pagination for better performance on large datasets
  getEventsByCatalogueIdCursor: (catalogueId: string, params?: CursorPaginationParams) => Promise<CursorPaginatedResult<EventSummary>>;
  getEventById: (catalogueId: string, eventId: string) => Promise<MergedEvent | undefined>;

  updateCatalogueStatus: (status: string, id: string, session?: ClientSession) => Promise<void>;

  updateCatalogueName: (name: string, id: string) => Promise<void>;

  updateCatalogueEventCount: (id: string, eventCount: number, session?: ClientSession) => Promise<void>;
  countEventsByCatalogue: (id: string) => Promise<number>;

  updateCatalogueGeoBounds: (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number, session?: ClientSession) => Promise<void>;

  updateCatalogueMetadata: (id: string, metadata: Partial<MergedCatalogue>) => Promise<void>;

  getCataloguesByRegion: (minLat: number, maxLat: number, minLon: number, maxLon: number) => Promise<MergedCatalogue[]>;

  deleteCatalogue: (id: string) => Promise<void>;

  getFilteredEvents: (catalogueId: string, filters: EventFilters) => Promise<FilteredEventsResult>;

  // Aggregated in MongoDB: a 218k-event catalogue must not be materialised in Node
  // just to take a min/max/mean.
  getCatalogueEventStatistics: (catalogueId: string) => Promise<CatalogueEventStatistics>;

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
  // Bounded recovery lookup for an import batch's generated IDs, excluding older
  // records that happen to share a source_id with a rejected insertion.
  getEventCoordinatesByIds: (catalogueId: string, eventIds: string[]) => Promise<Array<Pick<MergedEvent, 'id' | 'latitude' | 'longitude'>>>;
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
  'volcanic tremor', 'volcano-tectonic', 'tectonic', 'volcanic', 'meteorite',
]);

export const ALLOWED_EVENT_TYPE_CERTAINTY = new Set(['suspected', 'known']);

/**
 * Normalize an arbitrary source event-type string to a valid QuakeML BED type, or null.
 * Feeds like GeoNet emit non-QuakeML values ("outside of network interest", "duplicate"),
 * which would otherwise throw in validateMergedEvent and abort a whole insert batch.
 */
export function normalizeEventType(raw: unknown): string | null {
  if (raw == null) return null;
  const v = String(raw).toLowerCase().trim();
  return v && ALLOWED_EVENT_TYPE.has(v) ? v : null;
}

/**
 * Validate a single MergedEvent record: required fields (coordinates, magnitude,
 * timestamp, depth) plus optional enum and numeric-range fields.
 *
 * Throws an Error with a descriptive message on the first violation found.
 * Call this before any insert operation to guarantee data integrity.
 */
/**
 * Optional numeric ranges, mirroring earthquakeEventSchema in lib/validation.ts so the
 * two validators cannot disagree. A bare `< 0` test let Infinity and NaN through and
 * carried no upper bound, so records the schema rejects (horizontal_uncertainty
 * "Infinity", used_station_count 2.5, minimum_distance 181) were persisted anyway.
 * Shared by the insert validator and updateEvent, so an update cannot persist a value
 * an insert would reject.
 */
export const EVENT_OPTIONAL_RANGES: ReadonlyArray<[string, number, number, boolean]> = [
  // field, min, max, integer
  ['time_uncertainty', 0, 86400, false],
  ['latitude_uncertainty', 0, 10, false],
  ['longitude_uncertainty', 0, 10, false],
  ['depth_uncertainty', 0, 100, false],
  ['horizontal_uncertainty', 0, 100, false],
  ['min_horizontal_uncertainty', 0, 100, false],
  ['max_horizontal_uncertainty', 0, 100, false],
  ['azimuth_max_horizontal_uncertainty', 0, 360, false],
  ['magnitude_uncertainty', 0, 5, false],
  ['magnitude_station_count', 0, 5000, true],
  ['azimuthal_gap', 0, 360, false],
  ['used_station_count', 0, 5000, true],
  ['used_phase_count', 0, 10000, true],
  ['associated_station_count', 0, 5000, true],
  ['associated_phase_count', 0, 10000, true],
  ['depth_phase_count', 0, 1000, true],
  ['standard_error', 0, 100, false],
  ['minimum_distance', 0, 180, false],
  ['maximum_distance', 0, 180, false],
];

/** True when an optional numeric field's value is one the insert validator accepts. */
export function optionalFieldInRange(field: string, value: unknown): boolean {
  const entry = EVENT_OPTIONAL_RANGES.find(([name]) => name === field);
  if (!entry) return typeof value === 'number' && Number.isFinite(value);
  const [, min, max, integer] = entry;
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max &&
    (!integer || Number.isInteger(value));
}

function validateOptionalRanges(fields: Record<string, unknown>, label: string): void {
  for (const [field, min, max, integer] of EVENT_OPTIONAL_RANGES) {
    const value = fields[field];
    if (value == null) continue;
    const ok = optionalFieldInRange(field, value);
    if (!ok) {
      throw new Error(
        `[Event ${label}] Invalid ${field}: ${String(value)}. Must be a finite ${integer ? 'integer' : 'number'} between ${min} and ${max}`
      );
    }
  }
  // Depth and time carry the same bounds the insert validator enforces.
  const depth = fields.depth;
  if (depth != null && (typeof depth !== 'number' || !Number.isFinite(depth) || depth < -5 || depth > 1000)) {
    throw new Error(`[Event ${label}] Invalid depth: ${String(depth)}. Must be between -5 and 1000 km`);
  }
}

/** Core-field bounds an update must respect (the insert validator checks the same). */
function validateCoreFieldUpdates(fields: Record<string, unknown>, label: string): void {
  const num = (key: string) => fields[key];
  if (num('latitude') != null && !(typeof fields.latitude === 'number' && fields.latitude >= -90 && fields.latitude <= 90)) {
    throw new Error(`[Event ${label}] Invalid latitude: ${String(fields.latitude)}`);
  }
  if (num('longitude') != null && !(typeof fields.longitude === 'number' && fields.longitude >= -180 && fields.longitude <= 180)) {
    throw new Error(`[Event ${label}] Invalid longitude: ${String(fields.longitude)}`);
  }
  if (num('magnitude') != null && !(typeof fields.magnitude === 'number' && fields.magnitude >= -3 && fields.magnitude <= 10)) {
    throw new Error(`[Event ${label}] Invalid magnitude: ${String(fields.magnitude)}`);
  }
  if (fields.time != null) {
    const t = new Date(String(fields.time)).getTime();
    if (isNaN(t) || t < Date.UTC(1000, 0, 1) || t > Date.now()) {
      throw new Error(`[Event ${label}] Timestamp out of range: ${String(fields.time)}`);
    }
  }
  if (fields.event_type != null && !ALLOWED_EVENT_TYPE.has(String(fields.event_type).toLowerCase())) {
    throw new Error(`[Event ${label}] Invalid event_type: ${String(fields.event_type)}`);
  }
}

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
  // Same window the schema enforces: historical seismology back to 1000 CE, and nothing
  // in the future. The DB used to accept an origin time of 2099.
  if (parsedTime.getTime() < Date.UTC(1000, 0, 1) || parsedTime.getTime() > Date.now()) {
    throw new Error(`[Event ${event.id}] Timestamp out of range: ${event.time}. Must be between 1000-01-01 and now`);
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
  validateOptionalRanges(event, event.id);
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

/**
 * Summary statistics for one catalogue's events, computed by MongoDB rather than
 * by loading every event into Node. `null` means "no event carried that field".
 */
export interface CatalogueEventStatistics {
  eventCount: number;
  earliestTime: string | null;
  latestTime: string | null;
  magnitudeCount: number;
  minMagnitude: number | null;
  maxMagnitude: number | null;
  averageMagnitude: number | null;
  medianMagnitude: number | null;
  depthCount: number;
  minDepth: number | null;
  maxDepth: number | null;
  averageDepth: number | null;
  magnitudeTypes: Array<{ type: string; count: number }>;
  averageAzimuthalGap: number | null;
  averageStationCount: number | null;
  eventsWithUncertainty: number;
  eventsWithFocalMechanism: number;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

const UNPAGINATED_EVENTS_LIMIT = parseOptionalPositiveInt(process.env.UNPAGINATED_EVENTS_LIMIT);
const FILTERED_EVENTS_LIMIT = parseOptionalPositiveInt(process.env.FILTERED_EVENTS_LIMIT);

/**
 * Newest-first event ordering with `id` as a tiebreaker. `time` alone is not
 * unique — normalizeTimestamp maps a date-only origin time to exact midnight, so
 * a day-precision historical catalogue has whole blocks of events sharing one
 * `time` — and MongoDB gives no stable order within a tie group, so skip/limit
 * paging over `{time: -1}` alone can repeat a document on one page and drop it
 * from another (MongoDB manual, cursor.sort() "Sort Consistency"). `id` is
 * unique per event, which makes the order total. Matches the cursor path's sort.
 */
const EVENT_TIME_SORT_DESC = { time: -1, id: -1 } as const;

/**
 * Resolve the document offset for a paginated query. `offset` is absolute and
 * wins over `page`; `page` is still reported back so the response envelope keeps
 * its shape.
 */
function resolveSkip(params: PaginationParams, pageSize: number): { skip: number; page: number } {
  if (params.offset !== undefined) {
    const skip = Math.max(0, Math.trunc(params.offset));
    return { skip, page: Math.floor(skip / pageSize) + 1 };
  }
  const page = params.page || 1;
  return { skip: (page - 1) * pageSize, page };
}

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
    }>, session?: ClientSession): Promise<number> => {
      if (!events || events.length === 0) {
        return 0;
      }

      // Validate all events before touching the database — fail fast on the
      // first invalid record so no partial batch is ever written.
      for (const event of events) {
        validateMergedEvent(event);
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const now = new Date().toISOString();

      // De-duplicate within this batch by source_id (a single feed window or file can
      // repeat the same record) so one call never inserts the same event twice.
      const seenSourceIds = new Set<string>();
      const deduped = events.filter((e) => {
        const sid = (e as { source_id?: string | null }).source_id;
        if (sid == null) return true;
        if (seenSourceIds.has(sid)) return false;
        seenSourceIds.add(sid);
        return true;
      });

      const docs = deduped.map(event => ({
        ...event,
        created_at: now,
      })) as any[];

      // ordered:false so a duplicate-key (E11000) from the partial-unique
      // (catalogue_id, source_id) index skips that row rather than aborting the batch,
      // making re-imports idempotent. Any non-duplicate write error is re-thrown.
      //
      // Report the number of documents MongoDB actually wrote, not docs.length:
      // in-batch source_id duplicates were already dropped above, and E11000
      // collisions with rows already stored are skipped by the server. Callers
      // persist this as the catalogue's event_count, so counting submitted rows
      // instead would invent events that are not in the collection.
      let insertedCount = 0;
      try {
        const result = await collection.insertMany(docs, { ...(session ? { session } : {}), ordered: false });
        insertedCount = result.insertedCount;
      } catch (err) {
        const e = err as {
          code?: number;
          insertedCount?: number;
          result?: { insertedCount?: number };
          writeErrors?: Array<{ code?: number; err?: { code?: number } }>;
        };
        const writeErrors = e?.writeErrors ?? [];
        // The driver copies the FIRST write error's code to the top level, so a batch
        // with errors [11000, 121] reports code 11000 even though the second row failed
        // document validation. When per-row errors are available they are the only
        // trustworthy signal; the top-level code is a fallback for errors that carry none.
        const onlyDuplicates = writeErrors.length > 0
          ? writeErrors.every((w) => (w?.code ?? w?.err?.code) === 11000)
          : e?.code === 11000;
        if (!onlyDuplicates) throw err;
        // MongoBulkWriteError still carries the partial result for the rows that succeeded.
        insertedCount = e.result?.insertedCount ?? e.insertedCount ?? 0;
      } finally {
        // Unordered writes can commit some rows before throwing a nonduplicate
        // error. Those rows must not leave a previously cached page unchanged.
        const catalogueIds = new Set(events.map(e => e.catalogue_id));
        catalogueIds.forEach(id => invalidateCatalogueCache(id));
      }

      return insertedCount;
    },

    getCatalogues: async (params?: PaginationParams): Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);

      if (!params || (!params.page && !params.pageSize && params.offset === undefined)) {
        const docs = await collection.find({}).sort({ created_at: -1 }).toArray();
        return toPlainArray<MergedCatalogue>(docs);
      }

      const pageSize = params.pageSize || 10;
      const { skip, page } = resolveSkip(params, pageSize);

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

      if (!params || (!params.page && !params.pageSize && params.offset === undefined)) {
        let query = collection
          .find({ catalogue_id: catalogueId })
          .sort(EVENT_TIME_SORT_DESC);

        // Optional cap for deployments that want to bound unpaginated payloads.
        // If UNPAGINATED_EVENTS_LIMIT is unset, return all matching events.
        if (UNPAGINATED_EVENTS_LIMIT) {
          query = query.limit(UNPAGINATED_EVENTS_LIMIT);
        }

        const docs = await query.toArray();
        return toPlainArray<MergedEvent>(docs);
      }

      const pageSize = params.pageSize || 10;
      const { skip, page } = resolveSkip(params, pageSize);

      const [docs, totalItems] = await Promise.all([
        collection.find({ catalogue_id: catalogueId }).sort(EVENT_TIME_SORT_DESC).skip(skip).limit(pageSize).toArray(),
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
    ): Promise<CursorPaginatedResult<EventSummary>> => {
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
        const [cursorTime, cursorId] = decodeEventCursor(cursor);
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
        .find(query, params?.summary ? { projection: EVENT_SUMMARY_PROJECTION } : {})
        .sort({ time: sortDir, id: sortDir })
        .limit(limit + 1)
        .toArray();

      const hasMore = docs.length > limit;
      const data = toPlainArray<EventSummary>(hasMore ? docs.slice(0, limit) : docs);

      let nextCursor: string | null = null;
      let prevCursor: string | null = null;

      if (data.length > 0) {
        const lastItem = data[data.length - 1];
        const firstItem = data[0];
        if (hasMore) {
          nextCursor = encodeEventCursor(lastItem.time, lastItem.id);
        }
        if (cursor) {
          prevCursor = encodeEventCursor(firstItem.time, firstItem.id);
        }
      }

      return {
        data,
        pagination: { nextCursor, prevCursor, hasMore, limit }
      };
    },

    getEventById: async (catalogueId: string, eventId: string): Promise<MergedEvent | undefined> => {
      const collection = await getCollection(COLLECTIONS.EVENTS);
      return toPlainObject<MergedEvent>(await collection.findOne({ catalogue_id: catalogueId, id: eventId }));
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

    countEventsByCatalogue: async (id: string): Promise<number> => {
      const collection = await getCollection(COLLECTIONS.EVENTS);
      return collection.countDocuments({ catalogue_id: id });
    },

    // Catalogue-wide event statistics, aggregated server-side. Loading every event
    // into Node to reduce it was both a memory hazard on 200k+ event catalogues and
    // an outright failure: Math.min(...array) throws RangeError above ~125,000
    // elements on Node 20 (measured: 125,263 is the largest length that works), so
    // the statistics endpoint returned HTTP 500 for the repo's larger catalogues.
    getCatalogueEventStatistics: async (catalogueId: string): Promise<CatalogueEventStatistics> => {
      const collection = await getCollection(COLLECTIONS.EVENTS);
      const match = { catalogue_id: catalogueId };

      // "present" means the field exists and is not null — the same test the
      // previous in-Node implementation used (`!= null`).
      const isPresent = (field: string) => ({ $ne: [{ $ifNull: [field, null] }, null] });

      type OverallRow = Omit<CatalogueEventStatistics, 'magnitudeTypes' | 'medianMagnitude'>;
      type FacetResult = {
        overall: OverallRow[];
        magnitudeTypes: Array<{ _id: unknown; count: number }>;
      };

      // $min/$max/$avg all skip null and missing fields, so they reproduce the
      // "filter out null/undefined, then reduce" semantics of the old code.
      const [facets] = await collection.aggregate<FacetResult>([
        { $match: match },
        {
          $facet: {
            overall: [{
              $group: {
                _id: null,
                eventCount: { $sum: 1 },
                earliestTime: { $min: '$time' },
                latestTime: { $max: '$time' },
                magnitudeCount: { $sum: { $cond: [{ $isNumber: '$magnitude' }, 1, 0] } },
                minMagnitude: { $min: '$magnitude' },
                maxMagnitude: { $max: '$magnitude' },
                averageMagnitude: { $avg: '$magnitude' },
                depthCount: { $sum: { $cond: [{ $isNumber: '$depth' }, 1, 0] } },
                minDepth: { $min: '$depth' },
                maxDepth: { $max: '$depth' },
                averageDepth: { $avg: '$depth' },
                averageAzimuthalGap: { $avg: '$azimuthal_gap' },
                averageStationCount: { $avg: '$used_station_count' },
                eventsWithUncertainty: {
                  $sum: {
                    $cond: [
                      { $or: [isPresent('$latitude_uncertainty'), isPresent('$longitude_uncertainty')] },
                      1,
                      0,
                    ],
                  },
                },
                eventsWithFocalMechanism: {
                  $sum: { $cond: [isPresent('$focal_mechanisms'), 1, 0] },
                },
              },
            }],
            magnitudeTypes: [
              { $group: { _id: '$magnitude_type', count: { $sum: 1 } } },
            ],
          },
        },
      ], { allowDiskUse: true }).toArray();

      const overall = facets?.overall?.[0];
      if (!overall || overall.eventCount === 0) {
        return {
          eventCount: 0,
          earliestTime: null,
          latestTime: null,
          magnitudeCount: 0,
          minMagnitude: null,
          maxMagnitude: null,
          averageMagnitude: null,
          medianMagnitude: null,
          depthCount: 0,
          minDepth: null,
          maxDepth: null,
          averageDepth: null,
          magnitudeTypes: [],
          averageAzimuthalGap: null,
          averageStationCount: null,
          eventsWithUncertainty: 0,
          eventsWithFocalMechanism: 0,
        };
      }

      // Median: fetch only the middle element(s) of the sorted magnitudes. For an
      // even count the median is the mean of the two central values (the previous
      // implementation returned the upper of the two, which is not the median).
      let medianMagnitude: number | null = null;
      if (overall.magnitudeCount > 0) {
        const lowerIndex = Math.floor((overall.magnitudeCount - 1) / 2);
        const take = overall.magnitudeCount % 2 === 0 ? 2 : 1;
        const middle = await collection.aggregate<{ magnitude: number }>([
          { $match: { ...match, magnitude: { $type: 'number' } } },
          { $project: { _id: 0, magnitude: 1 } },
          { $sort: { magnitude: 1 } },
          { $skip: lowerIndex },
          { $limit: take },
        ], { allowDiskUse: true }).toArray();
        if (middle.length === take) {
          medianMagnitude = take === 2
            ? (middle[0].magnitude + middle[1].magnitude) / 2
            : middle[0].magnitude;
        }
      }

      // Blank/absent magnitude types collapse into a single "Unknown" bucket, as
      // `event.magnitude_type || 'Unknown'` did.
      const typeCounts = new Map<string, number>();
      for (const row of facets.magnitudeTypes ?? []) {
        const label = typeof row._id === 'string' && row._id.length > 0 ? row._id : 'Unknown';
        typeCounts.set(label, (typeCounts.get(label) ?? 0) + row.count);
      }
      // Most common first; the name breaks ties so the response is deterministic
      // (aggregation group order is not).
      const magnitudeTypes = Array.from(typeCounts, ([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

      return {
        eventCount: overall.eventCount,
        earliestTime: overall.earliestTime ?? null,
        latestTime: overall.latestTime ?? null,
        magnitudeCount: overall.magnitudeCount,
        minMagnitude: overall.minMagnitude ?? null,
        maxMagnitude: overall.maxMagnitude ?? null,
        averageMagnitude: overall.averageMagnitude ?? null,
        medianMagnitude,
        depthCount: overall.depthCount,
        minDepth: overall.minDepth ?? null,
        maxDepth: overall.maxDepth ?? null,
        averageDepth: overall.averageDepth ?? null,
        magnitudeTypes,
        averageAzimuthalGap: overall.averageAzimuthalGap ?? null,
        averageStationCount: overall.averageStationCount ?? null,
        eventsWithUncertainty: overall.eventsWithUncertainty,
        eventsWithFocalMechanism: overall.eventsWithFocalMechanism,
      };
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
      // NOTE: minLon > maxLon is allowed and meaningful — it denotes a bounding box
      // that crosses the antimeridian (180°), per RFC 7946 §5.2. NZ offshore
      // territory (Kermadec) crosses 180°, so rejecting it corrupted real bounds.

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

    // Region query: filter by latitude overlap in MongoDB (index-friendly), then
    // filter longitude precisely in JS. Longitude is done in JS because either the
    // query box OR a stored box may cross the antimeridian (180), which a single
    // Mongo range predicate cannot express for all four crossing combinations. The
    // catalogues collection is small (tens-to-hundreds of rows), so the post-filter
    // is cheap; if it grows very large, add a 2dsphere/geo strategy here.
    getCataloguesByRegion: async (minLat: number, maxLat: number, minLon: number, maxLon: number): Promise<MergedCatalogue[]> => {
      if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
        throw new Error('Latitude must be between -90 and 90');
      }
      if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) {
        throw new Error('Longitude must be between -180 and 180');
      }

      // Latitude overlap is index-friendly and handled in the query. Longitude
      // overlap is computed precisely in JS afterwards, because either the query
      // box OR a stored catalogue box may cross the antimeridian (180°) — a case
      // a single Mongo range predicate cannot express correctly for all four
      // crossing combinations. Catalogue counts are small, so this is cheap.
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const docs = await collection.find({
        min_latitude: { $ne: null, $lte: maxLat },
        max_latitude: { $ne: null, $gte: minLat },
        min_longitude: { $ne: null },
        max_longitude: { $ne: null },
      }).sort({ created_at: -1 }).toArray();

      const queryBounds: GeographicBounds = {
        minLatitude: minLat, maxLatitude: maxLat,
        minLongitude: minLon, maxLongitude: maxLon,
      };
      const matched = (toPlainArray<MergedCatalogue>(docs)).filter(c =>
        c.min_latitude != null && c.max_latitude != null &&
        c.min_longitude != null && c.max_longitude != null &&
        boundsOverlap(queryBounds, {
          minLatitude: c.min_latitude, maxLatitude: c.max_latitude,
          minLongitude: c.min_longitude, maxLongitude: c.max_longitude,
        })
      );

      return matched;
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
      // Longitude: minLongitude > maxLongitude denotes a box crossing the
      // antimeridian (180°), the same RFC 7946 §5.2 convention the catalogue
      // bounds use. No document can satisfy {$gte: 179, $lte: -179}, so that
      // case has to be split into the two arcs either side of the dateline —
      // otherwise a Kermadec-arc filter silently returns zero events.
      // +180 and -180 are one meridian: a box that touches either spelling of the
      // seam must match documents stored with the other, so those get an extra arm.
      const lonArms: Array<Record<string, unknown>> = [];
      if (
        filters.minLongitude !== undefined &&
        filters.maxLongitude !== undefined &&
        filters.minLongitude > filters.maxLongitude
      ) {
        lonArms.push({ longitude: { $gte: filters.minLongitude } }, { longitude: { $lte: filters.maxLongitude } });
      } else if (filters.minLongitude !== undefined || filters.maxLongitude !== undefined) {
        const range: Record<string, number> = {};
        if (filters.minLongitude !== undefined) range.$gte = filters.minLongitude;
        if (filters.maxLongitude !== undefined) range.$lte = filters.maxLongitude;
        lonArms.push({ longitude: range });
      }
      if (lonArms.length > 0) {
        // A crossing range's two arms already reach both 180 and -180; only a plain
        // range that stops at one spelling of the seam needs the other added.
        const crossing = lonArms.length === 2;
        if (!crossing && filters.minLongitude === -180) lonArms.push({ longitude: 180 });
        if (!crossing && filters.maxLongitude === 180) lonArms.push({ longitude: -180 });
        if (lonArms.length === 1) {
          query.longitude = lonArms[0].longitude;
        } else {
          query.$or = lonArms;
        }
      }

      let docs: WithId<Document>[];
      let truncated = false;

      if (FILTERED_EVENTS_LIMIT) {
        docs = await collection.find(query).sort(EVENT_TIME_SORT_DESC).limit(FILTERED_EVENTS_LIMIT + 1).toArray();
        truncated = docs.length > FILTERED_EVENTS_LIMIT;
      } else {
        docs = await collection.find(query).sort(EVENT_TIME_SORT_DESC).toArray();
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

    getEventCoordinatesByIds: async (catalogueId: string, eventIds: string[]) => {
      if (eventIds.length === 0) return [];
      const collection = await getCollection(COLLECTIONS.EVENTS);
      const docs = await collection.find({ catalogue_id: catalogueId, id: { $in: eventIds } })
        .project<Pick<MergedEvent, 'id' | 'latitude' | 'longitude'>>({ _id: 0, id: 1, latitude: 1, longitude: 1 }).toArray();
      return docs.map(({ id, latitude, longitude }) => ({ id, latitude, longitude }));
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

      // Changed fields obey the same contract as inserts. An update used to $set a
      // 1001 km depth the insert validator rejects, and report success.
      validateOptionalRanges(updateFields, id);
      validateCoreFieldUpdates(updateFields, id);

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const before = await collection.findOne({ id }, { projection: { catalogue_id: 1 } });
      await collection.updateOne({ id }, { $set: updateFields });

      // Insert paths invalidate the catalogue's event/statistics caches; update did not,
      // so the events API kept serving the pre-update magnitude after a re-import.
      const catalogueId = (updateFields.catalogue_id as string | undefined) ?? before?.catalogue_id;
      if (catalogueId) invalidateCatalogueCache(String(catalogueId));
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
        // `id` breaks ties on the non-unique `time`, so which events survive the
        // limit is reproducible rather than plan-dependent.
        .sort(EVENT_TIME_SORT_DESC)
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
