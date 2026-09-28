/**
 * MongoDB Database Module
 *
 * Provides database operations for the earthquake catalogue application.
 */

// Check Node.js version on server startup
import './check-node-version';

import { getDb, getCollection, COLLECTIONS, withTransaction, ClientSession } from './mongodb';
import { Db, WithId, Document } from 'mongodb';
import {
  CATALOGUE_LIST_SCOPE,
  catalogueScope,
  invalidateCatalogueCache,
  invalidateCatalogueListCaches,
  registerCacheGenerationSource,
} from './cache';
import {
  QUALITY_INPUT_RANGES,
  metricsFromEvent,
  scoreQualityMetrics,
  scoreToGrade,
  type QualityGrade,
} from './quality-scoring';
import { normalizeTimestamp } from './earthquake-utils';
import { boundsOverlap, unionBounds, type GeographicBounds } from './geo-bounds-utils';
import { decodeEventCursor, encodeEventCursor } from './event-cursor';
import {
  EVALUATION_MODES,
  EVALUATION_STATUSES,
  NON_BED_EVENT_TYPES,
  QUAKEML_EVENT_TYPES,
  type EventFilters,
} from './event-filter-params';
import { AppError, ValidationError } from './errors';

export interface MergedCatalogue {
  id: string;
  name: string;
  created_at: string;
  source_catalogues: string;
  merge_config: string;
  event_count: number;
  // 'deleting' marks a catalogue whose deletion has begun: it is hidden from every
  // read and refuses new events (see deleteCatalogue).
  status: 'processing' | 'complete' | 'error' | 'deleting';

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
  /**
   * Platform-managed catalogue version, MAJOR.MINOR.PATCH (paper §Versioning; contract
   * C3). Starts at 1.0.0 and is bumped by the mutation functions below: MAJOR when
   * existing events' parameters change, MINOR when events or fields are added, PATCH
   * for catalogue metadata corrections. Never client-writable. Reads of catalogues
   * stored before versioning report 1.0.0.
   */
  version?: string | null;
  /** When `version` last changed (ISO 8601 UTC); legacy catalogues report created_at. */
  version_updated_at?: string | null;
  /**
   * The depositor's own release label for the source data (e.g. "2024.1"), kept apart
   * from the platform version. Also where a pre-versioning free-text `version` label
   * is reported.
   */
  source_version?: string | null;
  keywords?: string | null; // JSON array
  reference_links?: string | null; // JSON array
  notes?: string | null;

  // Merge-specific metadata
  merge_description?: string | null;
  merge_use_case?: string | null;
  merge_methodology?: string | null;
  merge_quality_assessment?: string | null;

  // Provenance tracking. Server-set only: created_by by the creating flow
  // (insertCatalogue options), modified_at / modified_by by updateCatalogueMetadata.
  created_by?: string | null;
  modified_at?: string | null;
  modified_by?: string | null;

  /** Set when deletion began (status 'deleting'); lets the integrity sweep finish a stuck deletion. */
  deleting_at?: string | null;
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
  // OriginUncertainty.confidenceLevel: the confidence (percent, 0-100) the error
  // ellipse above is quoted at.
  confidence_level?: number | null;

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

  /**
   * Event quality index Q (integer 0-100, paper Eq. 1) and its letter grade, computed
   * with lib/quality-scoring.ts on insert unless the row already carries a finite
   * score, and recomputed when an update changes a field Q reads (contract C1).
   * Rows stored before this was persisted lack both until
   * scripts/backfill-quality-scores.ts is run.
   */
  quality_score?: number | null;
  quality_grade?: QualityGrade | null;

  /** The agency's raw event type (e.g. GeoNet "outside of network interest"), beside the normalised event_type (C8). */
  source_event_type?: string | null;

  // Merged-event provenance (contract C2). source_events (above) marks the member
  // whose solution was published with `selected: true`.
  merge_strategy?: MergeStrategyName | null;
  /** JSON string of the effective merge configuration. */
  merge_parameters?: string | null;
  /** Distinct contributing catalogue IDs, in source_events order. */
  source_catalogue_ids?: string[] | null;

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
  // The merge configuration is identical on every row of a merged catalogue; summary
  // pages keep the per-event lineage (merge_strategy, source_catalogue_ids) instead.
  merge_parameters: 0,
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
    session?: ClientSession,
    options?: InsertCatalogueOptions
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

  // The catalogue mutations resolve to whether a live catalogue with that id existed
  // (updateCatalogueStatus: whether this call set or recorded the status).
  updateCatalogueStatus: (status: string, id: string, session?: ClientSession, options?: CatalogueStatusOptions) => Promise<boolean>;

  updateCatalogueName: (name: string, id: string) => Promise<boolean>;

  updateCatalogueEventCount: (id: string, eventCount: number, session?: ClientSession) => Promise<boolean>;
  countEventsByCatalogue: (id: string) => Promise<number>;

  updateCatalogueGeoBounds: (
    id: string, minLat: number, maxLat: number, minLon: number, maxLon: number,
    session?: ClientSession, options?: GeoBoundsUpdateOptions
  ) => Promise<boolean>;

  // Resolves to null when no live catalogue has this id.
  updateCatalogueMetadata: (
    id: string,
    metadata: Partial<MergedCatalogue>,
    options?: UpdateCatalogueMetadataOptions
  ) => Promise<CatalogueUpdateResult | null>;

  getCataloguesByRegion: (minLat: number, maxLat: number, minLon: number, maxLon: number) => Promise<MergedCatalogue[]>;

  deleteCatalogue: (id: string) => Promise<boolean>;

  // Events and import history whose catalogue no longer exists (finding #63).
  sweepOrphans: (options?: OrphanSweepOptions) => Promise<OrphanSweepReport>;

  getFilteredEvents: (catalogueId: string, filters: EventFilters, options?: FilteredEventsOptions) => Promise<FilteredEventsResult>;

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
    errors: string | null,
    breakdown?: ImportHistoryBreakdown
  ) => Promise<void>;
  getImportHistory: (catalogueId: string, limit: number) => Promise<ImportHistory[]>;

  // Search method
  searchEvents: (query: string, limit: number, catalogueId?: string) => Promise<any[]>;

  // Saved filter methods. `ownerId` scopes the operation to that owner's filters;
  // omitting it (admin override) addresses any filter.
  insertSavedFilter: (id: string, name: string, description: string | null, filterConfig: string, ownerId?: string) => Promise<void>;
  getSavedFilters: (ownerId?: string) => Promise<SavedFilter[]>;
  countSavedFilters: (ownerId: string) => Promise<number>;
  getSavedFilterById: (id: string, ownerId?: string) => Promise<SavedFilter | undefined>;
  // Resolve to whether a filter matched.
  updateSavedFilter: (id: string, name: string, description: string | null, filterConfig: string, ownerId?: string) => Promise<boolean>;
  deleteSavedFilter: (id: string, ownerId?: string) => Promise<boolean>;
}

// Import history interface
export interface ImportHistory extends ImportHistoryBreakdown {
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
  /** Session user who saved it. Filters saved before ownership existed have none and are visible to admins only. */
  owner_id?: string | null;
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
export const ALLOWED_EVALUATION_STATUS = new Set<string>(EVALUATION_STATUSES);

export const ALLOWED_EVALUATION_MODE = new Set<string>(EVALUATION_MODES);

/**
 * QuakeML 1.2 BED OriginDepthType, in the schema's canonical spelling. The enumeration
 * is case-sensitive ('... broad-band P waveforms'), and every ingest path lower-cases
 * the value before looking it up, so lookups go through normalizeDepthType, which
 * accepts any case and returns the canonical form that is stored and exported.
 */
export const QUAKEML_DEPTH_TYPES = [
  'from location',
  'from moment tensor inversion',
  'from modeling of broad-band P waveforms',
  'constrained by depth phases',
  'constrained by direct phases',
  'constrained by depth and direct phases',
  'operator assigned',
  'other',
] as const;

const CANONICAL_DEPTH_TYPE = new Map<string, string>(
  QUAKEML_DEPTH_TYPES.map((value) => [value.toLowerCase(), value])
);

/** The canonical BED spelling of a depth type given in any case, or null if it is not one. */
export function normalizeDepthType(raw: unknown): string | null {
  if (raw == null) return null;
  return CANONICAL_DEPTH_TYPE.get(String(raw).trim().toLowerCase()) ?? null;
}

/**
 * Iterates the canonical spellings; `has` matches case-insensitively. Upload code
 * checks `ALLOWED_DEPTH_TYPE.has(value.toLowerCase())`, which a plain Set of the
 * canonical spellings would answer false for 'from modeling of broad-band p waveforms',
 * silently dropping a valid value. The stored value is canonicalised on insert.
 */
export const ALLOWED_DEPTH_TYPE: Set<string> = (() => {
  const set = new Set<string>(QUAKEML_DEPTH_TYPES);
  set.has = (value: string) => normalizeDepthType(value) !== null;
  return set;
})();

/** Merge strategies whose name a merged event records in merge_strategy (C2). */
export type MergeStrategyName = 'quality' | 'priority' | 'newest' | 'complete' | 'average';
export const ALLOWED_MERGE_STRATEGY = new Set<string>(['quality', 'priority', 'newest', 'complete', 'average']);

const QUALITY_GRADES: ReadonlyArray<QualityGrade> = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];

/**
 * Event types accepted on ingest: the 44 QuakeML 1.2 BED values plus the documented
 * volcano-seismology extensions in NON_BED_EVENT_TYPES (lib/event-filter-params.ts),
 * which the QuakeML exporter maps onto BED types. Stored lower-case.
 */
export const ALLOWED_EVENT_TYPE = new Set<string>([...QUAKEML_EVENT_TYPES, ...NON_BED_EVENT_TYPES]);
export { QUAKEML_EVENT_TYPES, NON_BED_EVENT_TYPES };

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
  // QuakeML OriginUncertainty.confidenceLevel of the error ellipse, in percent (C16).
  ['confidence_level', 0, 100, false],
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
  if (fields.depth_type != null && normalizeDepthType(fields.depth_type) === null) {
    throw new Error(`[Event ${label}] Invalid depth_type: ${String(fields.depth_type)}`);
  }
  validateDerivedAndProvenanceFields(fields, label);
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
  if (event.depth_type != null && normalizeDepthType(event.depth_type) === null) {
    throw new Error(
      `[Event ${event.id}] Invalid depth_type: "${event.depth_type}". ` +
      `Allowed: ${QUAKEML_DEPTH_TYPES.join(', ')}`
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
  validateDerivedAndProvenanceFields(event, event.id);
}

/**
 * Quality score (C1), raw agency event type (C8) and merge provenance (C2): accepted
 * on insert and update, but only in the shapes their consumers read.
 */
function validateDerivedAndProvenanceFields(fields: Record<string, unknown>, label: string): void {
  const score = fields.quality_score;
  if (score != null && !(typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100)) {
    throw new Error(`[Event ${label}] Invalid quality_score: ${String(score)}. Must be a number between 0 and 100`);
  }
  const grade = fields.quality_grade;
  if (grade != null && !QUALITY_GRADES.includes(grade as QualityGrade)) {
    throw new Error(`[Event ${label}] Invalid quality_grade: ${String(grade)}. Allowed: ${QUALITY_GRADES.join(', ')}`);
  }
  const rawType = fields.source_event_type;
  if (rawType != null && !(typeof rawType === 'string' && rawType.length <= 200)) {
    throw new Error(`[Event ${label}] Invalid source_event_type: must be a string of at most 200 characters`);
  }
  const strategy = fields.merge_strategy;
  if (strategy != null && !(typeof strategy === 'string' && ALLOWED_MERGE_STRATEGY.has(strategy))) {
    throw new Error(
      `[Event ${label}] Invalid merge_strategy: "${String(strategy)}". Allowed: ${Array.from(ALLOWED_MERGE_STRATEGY).join(', ')}`
    );
  }
  const parameters = fields.merge_parameters;
  if (parameters != null) {
    let parsed = false;
    if (typeof parameters === 'string' && parameters.length <= 20000) {
      try { JSON.parse(parameters); parsed = true; } catch { parsed = false; }
    }
    if (!parsed) {
      throw new Error(`[Event ${label}] Invalid merge_parameters: must be a JSON string of at most 20000 characters`);
    }
  }
  const sourceIds = fields.source_catalogue_ids;
  if (sourceIds != null && !(
    Array.isArray(sourceIds) && sourceIds.length <= 1000 &&
    sourceIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)
  )) {
    throw new Error(`[Event ${label}] Invalid source_catalogue_ids: must be an array of catalogue ID strings`);
  }
}

// Event filters are defined with their parser (contract C4) and re-exported here for
// the existing importers of lib/db.
export type { EventFilters };

/** Kilometres per degree of latitude, as the quality score converts lat/lon marginals. */
const KM_PER_DEGREE = 111;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The MongoDB predicate for one catalogue's events under `filters` (contract C4).
 * Exported so a caller that pages or streams (filtered exports) applies exactly the
 * predicate the filtered-events endpoint applies.
 *
 * Filters normally come from parseEventFilterParams, which already rejects bad input;
 * a non-finite number is still refused here, because NaN reaches MongoDB as a double
 * that matches nothing and turns a caller's bug into a silently empty result.
 */
export function buildEventFilterQuery(catalogueId: string, filters: EventFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { catalogue_id: catalogueId };
  const orGroups: Array<Array<Record<string, unknown>>> = [];

  const num = (name: keyof EventFilters): number | undefined => {
    const value = filters[name];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(`Invalid filter ${name}: ${String(value)}`);
    }
    return value;
  };
  const range = (field: string, lo?: number | string, hi?: number | string) => {
    if (lo === undefined && hi === undefined) return;
    const predicate: Record<string, unknown> = {};
    if (lo !== undefined) predicate.$gte = lo;
    if (hi !== undefined) predicate.$lte = hi;
    query[field] = predicate;
  };
  // A maximum on a non-negative quantity (uncertainty, gap, RMS) matches only a
  // reported, valid value: a -999 "missing" sentinel must not pass as tiny.
  const nonNegativeMax = (field: string, max?: number) => {
    if (max !== undefined) query[field] = { $gte: 0, $lte: max };
  };

  range('magnitude', num('minMagnitude'), num('maxMagnitude'));
  range('depth', num('minDepth'), num('maxDepth'));
  range('time', filters.startTime || undefined, filters.endTime || undefined);
  if (filters.eventType) query.event_type = filters.eventType;
  // Agencies disagree on the case of magnitude types (ML/Ml, Mw/MW), so match the
  // exact type case-insensitively rather than by byte equality.
  if (filters.magnitudeType) {
    query.magnitude_type = new RegExp(`^${escapeRegExp(filters.magnitudeType)}$`, 'i');
  }
  if (filters.evaluationStatus) query.evaluation_status = filters.evaluationStatus;
  if (filters.evaluationMode) query.evaluation_mode = filters.evaluationMode;
  nonNegativeMax('azimuthal_gap', num('maxAzimuthalGap'));
  const minPhases = num('minUsedPhaseCount');
  if (minPhases !== undefined) query.used_phase_count = { $gte: minPhases };
  const minStations = num('minUsedStationCount');
  if (minStations !== undefined) query.used_station_count = { $gte: minStations };
  nonNegativeMax('standard_error', num('maxStandardError'));
  nonNegativeMax('depth_uncertainty', num('maxDepthUncertainty'));
  nonNegativeMax('time_uncertainty', num('maxTimeUncertainty'));
  nonNegativeMax('magnitude_uncertainty', num('maxMagnitudeUncertainty'));
  const minQuality = num('minQuality');
  // Rows stored before quality scores were persisted carry none and so cannot be
  // shown to meet a threshold; scripts/backfill-quality-scores.ts scores them.
  if (minQuality !== undefined) query.quality_score = { $gte: minQuality };

  // Horizontal uncertainty in km, taken the way the quality score takes it
  // (lib/quality-scoring.ts metricsFromEvent): the error-ellipse semi-major axis,
  // else the circular horizontal uncertainty, else the larger lat/lon marginal
  // (degrees) converted to km at the event's latitude.
  const maxHorizontal = num('maxHorizontalUncertainty');
  if (maxHorizontal !== undefined) {
    orGroups.push([
      { max_horizontal_uncertainty: { $gte: 0, $lte: maxHorizontal } },
      { max_horizontal_uncertainty: null, horizontal_uncertainty: { $gte: 0, $lte: maxHorizontal } },
      {
        max_horizontal_uncertainty: null,
        horizontal_uncertainty: null,
        latitude_uncertainty: { $gte: 0 },
        longitude_uncertainty: { $gte: 0 },
        $expr: {
          $lte: [
            {
              $max: [
                { $multiply: ['$latitude_uncertainty', KM_PER_DEGREE] },
                {
                  $multiply: [
                    '$longitude_uncertainty',
                    KM_PER_DEGREE,
                    { $cos: { $degreesToRadians: { $ifNull: ['$latitude', 0] } } },
                  ],
                },
              ],
            },
            maxHorizontal,
          ],
        },
      },
    ]);
  }

  range('latitude', num('minLatitude'), num('maxLatitude'));
  // Longitude: minLongitude > maxLongitude denotes a box crossing the
  // antimeridian (180°), the same RFC 7946 §5.2 convention the catalogue
  // bounds use. No document can satisfy {$gte: 179, $lte: -179}, so that
  // case has to be split into the two arcs either side of the dateline —
  // otherwise a Kermadec-arc filter silently returns zero events.
  // +180 and -180 are one meridian: a box that touches either spelling of the
  // seam must match documents stored with the other, so those get an extra arm.
  const minLongitude = num('minLongitude');
  const maxLongitude = num('maxLongitude');
  const lonArms: Array<Record<string, unknown>> = [];
  if (minLongitude !== undefined && maxLongitude !== undefined && minLongitude > maxLongitude) {
    lonArms.push({ longitude: { $gte: minLongitude } }, { longitude: { $lte: maxLongitude } });
  } else if (minLongitude !== undefined || maxLongitude !== undefined) {
    const lonRange: Record<string, number> = {};
    if (minLongitude !== undefined) lonRange.$gte = minLongitude;
    if (maxLongitude !== undefined) lonRange.$lte = maxLongitude;
    lonArms.push({ longitude: lonRange });
  }
  if (lonArms.length > 0) {
    // A crossing range's two arms already reach both 180 and -180; only a plain
    // range that stops at one spelling of the seam needs the other added.
    const crossing = lonArms.length === 2;
    if (!crossing && minLongitude === -180) lonArms.push({ longitude: 180 });
    if (!crossing && maxLongitude === 180) lonArms.push({ longitude: -180 });
    if (lonArms.length === 1) {
      query.longitude = lonArms[0].longitude;
    } else {
      orGroups.push(lonArms);
    }
  }

  // Each alternative set must hold on its own; a second top-level $or would
  // overwrite the first, so more than one group goes under $and.
  if (orGroups.length === 1) {
    query.$or = orGroups[0];
  } else if (orGroups.length > 1) {
    query.$and = orGroups.map((arms) => ({ $or: arms }));
  }

  return query;
}

/** Optional paging for getFilteredEvents (e.g. a filtered export reading page by page). */
export interface FilteredEventsOptions {
  /** Maximum rows to return; overrides FILTERED_EVENTS_LIMIT. */
  limit?: number;
  /** Rows to skip, in the same newest-first order. */
  offset?: number;
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
  /** Events reporting any location uncertainty: horizontal (circular, ellipse or lat/lon marginals) or depth. */
  eventsWithUncertainty: number;
  /** Events reporting a horizontal location uncertainty in any form. */
  eventsWithHorizontalUncertainty: number;
  /** Events reporting a depth uncertainty. */
  eventsWithDepthUncertainty: number;
  eventsWithFocalMechanism: number;
  /** Events carrying a stored quality score (rows stored before scores were persisted do not). */
  qualityScoreCount: number;
  /** Mean stored quality score Q, or null when no event carries one. */
  averageQualityScore: number | null;
  /** Stored quality grades, best first; only grades that occur. */
  qualityGrades: Array<{ grade: QualityGrade; count: number }>;
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

/** Most results one event search may return (GET /api/events/search). */
export const MAX_SEARCH_RESULTS = 100;
const SEARCH_RESULT_PROJECTION = {
  _id: 0, id: 1, catalogue_id: 1, event_public_id: 1, time: 1, latitude: 1, longitude: 1,
  depth: 1, magnitude: 1, magnitude_type: 1, event_type: 1, region: 1, location_name: 1,
};

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

// ============================================================================
// WRITE BOOKKEEPING: cache coherence, catalogue versions, event quality scores
// ============================================================================

/** A catalogue whose deletion has begun is invisible to reads and closed to writes. */
const LIVE_CATALOGUE = { status: { $ne: 'deleting' } } as const;

/**
 * Catalogues written inside dbQueries.transaction, keyed by session. Their caches are
 * invalidated once the transaction has ended: invalidating before the commit would
 * let a reader re-cache the pre-commit state under the new cache generation.
 * The value is true for a catalogue-level change (see publishCatalogueWrites).
 */
const pendingTransactionWrites = new WeakMap<ClientSession, Map<string, boolean>>();

let sharedGenerationWarningLogged = false;

async function readSharedCacheGeneration(scope: string): Promise<number> {
  const collection = await getCollection(COLLECTIONS.CACHE_GENERATIONS);
  const doc = await collection.findOne({ _id: scope } as Document, { projection: { generation: 1 } });
  return typeof doc?.generation === 'number' ? doc.generation : 0;
}

async function bumpSharedCacheGenerations(scopes: string[]): Promise<void> {
  if (scopes.length === 0) return;
  const collection = await getCollection(COLLECTIONS.CACHE_GENERATIONS);
  const updated_at = new Date().toISOString();
  await collection.bulkWrite(
    scopes.map((scope) => ({
      updateOne: {
        filter: { _id: scope } as Document,
        update: { $inc: { generation: 1 }, $set: { updated_at } },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}

// Every server instance reads the shared generation, so an API cache in one instance
// stops serving data another instance has since changed (lib/cache.ts).
if (typeof window === 'undefined' && typeof registerCacheGenerationSource === 'function') {
  registerCacheGenerationSource(readSharedCacheGeneration);
}

/**
 * Make every cache stop serving data read before a committed write. `true` marks a
 * catalogue-level change (the catalogue row: its name, metadata, status, count,
 * bounds or version), which also stales the catalogue list and region searches;
 * `false` an event-level change, which stales that catalogue's events and statistics.
 *
 * Best-effort by design: the write has already committed, so a cache failure is
 * logged, never thrown back at the caller as if the write had failed.
 */
async function publishCatalogueWrites(writes: Map<string, boolean>): Promise<void> {
  const scopes: string[] = [];
  let listsChanged = false;
  try {
    writes.forEach((catalogueLevel, catalogueId) => {
      invalidateCatalogueCache(catalogueId);
      scopes.push(catalogueScope(catalogueId));
      listsChanged = listsChanged || catalogueLevel;
    });
    if (listsChanged) {
      invalidateCatalogueListCaches();
      scopes.push(CATALOGUE_LIST_SCOPE);
    }
  } catch (error) {
    console.warn('[Database] Cache invalidation failed:', error instanceof Error ? error.message : error);
  }
  try {
    await bumpSharedCacheGenerations(scopes);
  } catch (error) {
    if (!sharedGenerationWarningLogged) {
      sharedGenerationWarningLogged = true;
      console.warn('[Database] Could not advance the shared cache generation; other server instances may serve cached data until it expires:',
        error instanceof Error ? error.message : error);
    }
  }
}

/**
 * For writes made outside this module (maintenance scripts writing the collections
 * directly): make every server instance's caches stop serving these catalogues' data
 * read before the write. `catalogueLevel` as for publishCatalogueWrites.
 */
export async function markCatalogueDataChanged(catalogueIds: string[], catalogueLevel = false): Promise<void> {
  await publishCatalogueWrites(new Map(catalogueIds.map((id) => [id, catalogueLevel] as [string, boolean])));
}

async function afterCatalogueWrite(catalogueId: string, catalogueLevel: boolean, session?: ClientSession): Promise<void> {
  const pending = session ? pendingTransactionWrites.get(session) : undefined;
  if (pending) {
    pending.set(catalogueId, (pending.get(catalogueId) ?? false) || catalogueLevel);
    return;
  }
  await publishCatalogueWrites(new Map([[catalogueId, catalogueLevel]]));
}

// ---------------------------------------------------------------------------
// Catalogue versions (contract C3; paper §Versioning)
// ---------------------------------------------------------------------------

export type CatalogueVersionLevel = 'major' | 'minor' | 'patch';
const VERSION_RANK: Record<CatalogueVersionLevel, number> = { patch: 1, minor: 2, major: 3 };
const LEVEL_BY_RANK: Record<number, CatalogueVersionLevel> = { 1: 'patch', 2: 'minor', 3: 'major' };
const SEMANTIC_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_CAS_ATTEMPTS = 8;

export const INITIAL_CATALOGUE_VERSION = '1.0.0';

/** A stored version, or 1.0.0 for a catalogue stored before versioning. */
export function normalizeCatalogueVersion(value: unknown): string {
  return typeof value === 'string' && SEMANTIC_VERSION.test(value) ? value : INITIAL_CATALOGUE_VERSION;
}

/** The next version after a change of the given level (semantic versioning). */
export function bumpCatalogueVersion(version: unknown, level: CatalogueVersionLevel): string {
  const [major, minor, patch] = normalizeCatalogueVersion(version).split('.').map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

interface CatalogueVersionState {
  status?: string;
  version?: unknown;
  /** 'initial' until the first load of the catalogue completes; absent means released. */
  version_state?: string;
  /** Highest change rank recorded while an operation ('processing') is in progress. */
  version_pending_level?: number | null;
  source_version?: unknown;
}

const VERSION_STATE_PROJECTION: Record<string, 0 | 1> = {
  _id: 0, status: 1, version: 1, version_state: 1, version_pending_level: 1, source_version: 1,
};

/** Stamped on every edit, so they never make an edit a change by themselves. */
const CHANGE_BOOKKEEPING_FIELDS = new Set(['modified_at', 'modified_by']);

/** A free-text label stored in `version` before versioning, to be kept as source_version. */
function legacyVersionLabel(doc: { version?: unknown; source_version?: unknown }): string | null {
  const value = doc.version;
  if (typeof value !== 'string' || !value.trim() || SEMANTIC_VERSION.test(value)) return null;
  return doc.source_version == null ? value.trim() : null;
}

/** Compare-and-set filter: matches only while the version state read is unchanged. */
function versionStateFilter(id: string, doc: CatalogueVersionState): Record<string, unknown> {
  return {
    id,
    status: doc.status ?? null,
    version: doc.version ?? null,
    version_pending_level: doc.version_pending_level ?? null,
  };
}

/** $set/$unset that release one new version for `level` and anything pending. */
function versionReleaseUpdate(doc: CatalogueVersionState, level: CatalogueVersionLevel | null, now: string) {
  const pending = LEVEL_BY_RANK[doc.version_pending_level ?? 0] ?? null;
  const effective = [level, pending].reduce<CatalogueVersionLevel | null>(
    (best, l) => (l && (!best || VERSION_RANK[l] > VERSION_RANK[best]) ? l : best), null);
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (doc.version_pending_level != null) unset.version_pending_level = '';
  if (effective) {
    set.version = bumpCatalogueVersion(doc.version, effective);
    set.version_updated_at = now;
    const label = legacyVersionLabel(doc);
    if (label) set.source_version = label;
  }
  return { set, unset };
}

function updateDocument(set: Record<string, unknown>, unset?: Record<string, ''>, extra?: Record<string, unknown>) {
  const update: Record<string, unknown> = { ...(extra ?? {}) };
  if (Object.keys(set).length > 0) update.$set = set;
  if (unset && Object.keys(unset).length > 0) update.$unset = unset;
  return update;
}

/**
 * Apply `fields` to a live catalogue and account for the change in its version, in one
 * atomic update (compare-and-set on the version state, retried on contention):
 *  - a catalogue still in its first load takes no bump: its content IS version 1.0.0;
 *  - a catalogue with an operation in progress (status 'processing': an upload, GeoNet
 *    import or merge) records the change level, and the operation releases a single
 *    version for everything it changed when it completes (updateCatalogueStatus);
 *  - otherwise the change is released at once as a new version.
 * Resolves to the catalogue's version afterwards, or null when no live catalogue has
 * this id.
 */
async function applyCatalogueChange(
  id: string,
  level: CatalogueVersionLevel,
  fields: Record<string, unknown>,
  session?: ClientSession
): Promise<{ version: string; released: boolean } | null> {
  const catalogues = await getCollection(COLLECTIONS.CATALOGUES);
  const options = session ? { session } : undefined;
  const now = new Date().toISOString();
  const projection: Record<string, 0 | 1> = { ...VERSION_STATE_PROJECTION };
  for (const field of Object.keys(fields)) projection[field] = 1;
  for (let attempt = 0; attempt < VERSION_CAS_ATTEMPTS; attempt++) {
    const doc = await catalogues.findOne(
      { id, ...LIVE_CATALOGUE },
      { projection, ...(options ?? {}) }
    ) as (CatalogueVersionState & Record<string, unknown>) | null;
    if (!doc) return null;

    let filter: Record<string, unknown>;
    let update: Record<string, unknown>;
    let version = normalizeCatalogueVersion(doc.version);
    let released = false;
    // An edit form re-sends every field; saving it unchanged edits nothing, so it
    // neither writes nor bumps the version (nor restamps modified_at).
    const changed = Object.keys(fields).filter(
      (field) => !CHANGE_BOOKKEEPING_FIELDS.has(field) && !sameStoredValue(doc[field], fields[field])
    );
    if (Object.keys(fields).length > 0 && changed.length === 0) return { version, released };
    if (doc.version_state === 'initial') {
      filter = { id, version_state: 'initial', ...LIVE_CATALOGUE };
      update = updateDocument(fields);
    } else if (doc.status === 'processing') {
      filter = { id, status: 'processing' };
      update = updateDocument(fields, undefined, { $max: { version_pending_level: VERSION_RANK[level] } });
    } else {
      const release = versionReleaseUpdate(doc, level, now);
      filter = versionStateFilter(id, doc);
      update = updateDocument({ ...fields, ...release.set }, release.unset);
      version = (release.set.version as string | undefined) ?? version;
      released = release.set.version !== undefined;
    }
    if (Object.keys(update).length === 0) return { version, released };
    const result = await catalogues.updateOne(filter, update, options);
    if (result.matchedCount > 0) return { version, released };
  }
  throw new Error(`Catalogue ${id} kept changing concurrently; its update was not applied`);
}

/**
 * Account for a change of catalogue content made by an event write. Never throws: the
 * event write has committed, and failing the import over version bookkeeping would be
 * worse than a missed bump, which is logged.
 */
async function recordCatalogueContentChange(
  catalogueId: string,
  level: CatalogueVersionLevel,
  session?: ClientSession
): Promise<boolean> {
  try {
    const result = await applyCatalogueChange(catalogueId, level, {}, session);
    return Boolean(result?.released);
  } catch (error) {
    console.error(`[Database] Could not record a ${level} version change for catalogue ${catalogueId}:`,
      error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Event fields that describe or trace an event without being part of its solution.
 * Correcting one is a PATCH-level change; every other stored field is a solution
 * parameter, and changing one is MAJOR (paper §Versioning).
 */
const DESCRIPTIVE_EVENT_FIELDS = new Set([
  'region', 'location_name', 'event_descriptions', 'comments', 'creation_info',
  'agency_id', 'author', 'event_public_id', 'source_id', 'source_event_type',
  'source_events', 'merge_strategy', 'merge_parameters', 'source_catalogue_ids',
]);
/** Derived or bookkeeping fields: they follow other changes and never decide a bump. */
const DERIVED_EVENT_FIELDS = new Set(['quality_score', 'quality_grade', 'created_at', 'catalogue_id', 'id']);

function sameStoredValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if ((a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/** Version level of an event update, from the stored values it replaces; null if nothing changes. */
export function classifyEventUpdate(
  before: Record<string, unknown>,
  updates: Record<string, unknown>
): CatalogueVersionLevel | null {
  let level: CatalogueVersionLevel | null = null;
  const raise = (candidate: CatalogueVersionLevel) => {
    if (!level || VERSION_RANK[candidate] > VERSION_RANK[level]) level = candidate;
  };
  for (const [field, value] of Object.entries(updates)) {
    if (DERIVED_EVENT_FIELDS.has(field)) continue;
    const previous = before[field];
    if (sameStoredValue(previous, value)) continue;
    if (previous == null) raise('minor'); // a field added to an existing event
    else if (DESCRIPTIVE_EVENT_FIELDS.has(field)) raise('patch'); // a description corrected
    else raise('major'); // a solution parameter changed
  }
  return level;
}

// ---------------------------------------------------------------------------
// Event quality score (contract C1)
// ---------------------------------------------------------------------------

/** Every stored field the quality score reads (lib/quality-scoring.ts metricsFromEvent). */
const QUALITY_INPUT_FIELDS: ReadonlyArray<string> = [
  ...Object.keys(QUALITY_INPUT_RANGES), 'latitude', 'evaluation_mode', 'evaluation_status',
];

/**
 * quality_score and quality_grade for a row: a finite score the row already carries
 * (e.g. computed by the merge from the published solution) is kept, rounded to the
 * stored integer; otherwise Q is computed from the row with the default weights.
 * The grade is always derived from the stored score, so the two cannot disagree.
 */
export function eventQualityFields(row: Record<string, unknown>): { quality_score: number; quality_grade: QualityGrade } {
  const given = row.quality_score;
  const score = typeof given === 'number' && Number.isFinite(given)
    ? Math.round(given)
    : scoreQualityMetrics(metricsFromEvent(row)).overall;
  return { quality_score: score, quality_grade: scoreToGrade(score) };
}

/** Canonical depth type and quality fields for a row about to be inserted. */
function prepareEventRow<T extends Record<string, unknown>>(event: T): T {
  const row: Record<string, unknown> = { ...event };
  if (row.depth_type != null) {
    // An unknown value is left in place for validateMergedEvent to reject.
    const canonical = normalizeDepthType(row.depth_type);
    if (canonical) row.depth_type = canonical;
  }
  Object.assign(row, eventQualityFields(row));
  return row as T;
}

// ---------------------------------------------------------------------------
// Catalogue writability (finding #63)
// ---------------------------------------------------------------------------

function catalogueNotWritable(catalogueId: string): AppError {
  return new AppError(
    `Catalogue ${catalogueId} does not exist or is being deleted; its events cannot be written`,
    409,
    'CATALOGUE_NOT_WRITABLE'
  );
}

/**
 * Whether events may be written to a catalogue: it must exist and not be deleting.
 * 'unknown' when the check itself failed; a failed check never blocks ingestion on
 * its own, since the check after the insert and the integrity sweep
 * (scripts/check-database-integrity.ts --sweep-orphans) remain as the backstop.
 */
async function catalogueWriteState(catalogueId: string, session?: ClientSession): Promise<'writable' | 'refused' | 'unknown'> {
  let doc: Document | null;
  try {
    const catalogues = await getCollection(COLLECTIONS.CATALOGUES);
    doc = await catalogues.findOne({ id: catalogueId }, { projection: { _id: 0, status: 1 }, ...(session ? { session } : {}) });
  } catch (error) {
    console.warn(`[Database] Could not check that catalogue ${catalogueId} accepts events:`,
      error instanceof Error ? error.message : error);
    return 'unknown';
  }
  return doc && doc.status !== 'deleting' ? 'writable' : 'refused';
}

/**
 * Insert event rows for one or more catalogues, refusing catalogues that do not
 * exist or are being deleted. A catalogue deleted while the rows were in flight
 * (checked again after the insert) gets them removed again, so a DELETE racing an
 * import cannot leave events pointing at a catalogue that no longer exists.
 */
async function insertEventRows(
  docs: Array<Record<string, unknown>>,
  session: ClientSession | undefined,
  insert: () => Promise<number>
): Promise<number> {
  const catalogueIds = Array.from(new Set(docs.map((d) => String(d.catalogue_id))));
  for (const catalogueId of catalogueIds) {
    if (await catalogueWriteState(catalogueId, session) === 'refused') {
      throw catalogueNotWritable(catalogueId);
    }
  }

  let insertedCount = 0;
  let insertError: unknown = null;
  try {
    insertedCount = await insert();
  } catch (error) {
    insertError = error;
  }

  let refusedCatalogue: string | null = null;
  try {
    for (const catalogueId of catalogueIds) {
      if (await catalogueWriteState(catalogueId, session) !== 'refused') continue;
      refusedCatalogue = catalogueId;
      const ids = docs.filter((d) => String(d.catalogue_id) === catalogueId).map((d) => d.id);
      try {
        const events = await getCollection(COLLECTIONS.EVENTS);
        await events.deleteMany({ catalogue_id: catalogueId, id: { $in: ids } }, session ? { session } : undefined);
      } catch (error) {
        console.error(`[Database] Rows written to deleted catalogue ${catalogueId} could not be removed; the integrity sweep will remove them:`,
          error instanceof Error ? error.message : error);
      }
    }
  } finally {
    // Unordered writes can commit some rows before throwing a nonduplicate error.
    // Those rows must not leave a previously cached page unchanged.
    for (const catalogueId of catalogueIds) {
      await afterCatalogueWrite(catalogueId, false, session);
    }
  }

  if (insertError) throw insertError;
  if (refusedCatalogue) throw catalogueNotWritable(refusedCatalogue);

  // Events added to a released catalogue are a MINOR change; during a catalogue's
  // first load they are part of 1.0.0 and record nothing.
  if (insertedCount > 0) {
    for (const catalogueId of catalogueIds) {
      if (await recordCatalogueContentChange(catalogueId, 'minor', session)) {
        await afterCatalogueWrite(catalogueId, true, session);
      }
    }
  }
  return insertedCount;
}

// ---------------------------------------------------------------------------
// Catalogue rows
// ---------------------------------------------------------------------------

/** Descriptive catalogue metadata a client may set on create and edit. */
const CATALOGUE_METADATA_FIELDS = [
  'description', 'data_source', 'provider', 'geographic_region',
  'time_period_start', 'time_period_end', 'data_quality', 'quality_notes',
  'contact_name', 'contact_email', 'contact_organization',
  'license', 'usage_terms', 'citation', 'doi', 'source_version',
  'keywords', 'reference_links', 'notes',
  'merge_description', 'merge_use_case', 'merge_methodology', 'merge_quality_assessment',
] as const;
/** Written once, by the creating upload, and not editable afterwards. */
const CATALOGUE_CREATION_ONLY_FIELDS = ['validation_summary', 'validation_report', 'validation_timestamp'] as const;

/**
 * Coverage bounds are stored as ISO 8601 UTC ('...Z'), like every origin time on the
 * platform (contract C11). A value without a zone designator is read as UTC — the
 * same convention normalizeTimestamp applies to origin times — rather than stored
 * verbatim, where exports printed '2024-01-01T00:00' beside UTC event times and
 * JavaScript readers took it as local time. An empty value clears the bound.
 */
function normalizeTimePeriodFields(fields: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of ['time_period_start', 'time_period_end'] as const) {
    const raw = fields[key];
    if (raw === undefined) continue;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      out[key] = null;
      continue;
    }
    const normalized = typeof raw === 'string' ? normalizeTimestamp(raw) : null;
    if (!normalized) {
      throw new ValidationError(`Invalid ${key}: "${String(raw)}" is not a date/time`);
    }
    out[key] = normalized;
  }
  if (out.time_period_start && out.time_period_end && out.time_period_start > out.time_period_end) {
    throw new ValidationError('time_period_start must not be after time_period_end');
  }
  return out;
}

/**
 * A catalogue as the API reports it: the version bookkeeping fields stay internal,
 * and a catalogue stored before versioning reports 1.0.0 (with any free-text label it
 * had in `version` reported as source_version).
 */
function toCatalogue(doc: Document | null | undefined): MergedCatalogue | undefined {
  if (!doc) return undefined;
  const { _id, version_state, version_pending_level, ...rest } = doc as Record<string, unknown>;
  const legacyLabel = legacyVersionLabel(rest);
  const catalogue: Record<string, unknown> = {
    ...rest,
    version: normalizeCatalogueVersion(rest.version),
    version_updated_at: rest.version_updated_at ?? rest.created_at ?? null,
  };
  if (legacyLabel) catalogue.source_version = legacyLabel;
  return catalogue as unknown as MergedCatalogue;
}

export interface InsertCatalogueOptions {
  /**
   * Server-attested creator (the session user's id). Provenance is never taken from
   * the client-supplied `metadata`, which the upload route passes through.
   */
  createdBy?: string | null;
}

export interface UpdateCatalogueMetadataOptions {
  /** New catalogue name, applied in the same update (and the same version bump). */
  name?: string;
  /** Session user making the change; stored as modified_by. */
  modifiedBy?: string | null;
}

export interface CatalogueUpdateResult {
  /** The catalogue's version after the update. */
  version: string;
}

export interface CatalogueStatusOptions {
  /**
   * Token of the import run changing the status. 'processing' claims the catalogue
   * for the run; 'complete' / 'error' are applied only by the run that last claimed
   * it, and a failure of a superseded run is kept (the catalogue ends in 'error').
   */
  runId?: string;
}

export interface GeoBoundsUpdateOptions {
  /**
   * Extend the stored bounds to cover the given ones (antimeridian-aware union),
   * atomically, instead of replacing them: two imports extending one catalogue used to
   * read, merge and write back, and the later write dropped the other's extension.
   */
  merge?: boolean;
}

/** Per-reason counts of fetched rows an import did not store (GeoNet #109). */
export interface ImportHistoryBreakdown {
  /** Rows already stored, or repeated within the fetch. */
  collided_events?: number;
  /** Rows that could not be parsed or failed validation. */
  invalid_events?: number;
  /** Rows of an event type the importer excludes. */
  excluded_events?: number;
  /** Rows whose write failed. */
  failed_events?: number;
  /** Excluded rows by the source's event type. */
  excluded_event_types?: Record<string, number>;
}

export interface OrphanSweepOptions {
  /** Delete what is found. The default only reports it. */
  apply?: boolean;
  /** A catalogue left in 'deleting' longer than this is a stuck deletion (default 15 min). */
  staleDeletionMs?: number;
}

export interface OrphanSweepReport {
  /** Catalogue IDs that events or import history refer to but no live catalogue has. */
  orphanedCatalogueIds: string[];
  orphanedEvents: number;
  orphanedImportHistory: number;
  /** Catalogues stuck in 'deleting' past the cutoff, whose deletion the sweep finishes. */
  staleDeletions: string[];
  applied: boolean;
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
      session?: ClientSession,
      options?: InsertCatalogueOptions
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
      const now = new Date().toISOString();

      const doc: any = {
        id,
        name,
        source_catalogues: sourceCatalogues,
        merge_config: mergeConfig,
        event_count: eventCount,
        status,
        created_at: now,
        // Every catalogue starts at 1.0.0. One created 'processing' is still being
        // loaded: everything written until that load completes is part of 1.0.0, so
        // its events do not count as additions (see applyCatalogueChange).
        version: INITIAL_CATALOGUE_VERSION,
        version_updated_at: now,
        version_state: status === 'processing' ? 'initial' : 'released',
      };

      // Add metadata fields if provided. Provenance (created_by, modified_*) and the
      // version are server-managed and never taken from here: the upload route passes
      // the client's metadata object through.
      if (metadata) {
        const source = metadata as Record<string, unknown>;
        for (const field of [...CATALOGUE_METADATA_FIELDS, ...CATALOGUE_CREATION_ONLY_FIELDS]) {
          if (source[field] !== undefined) {
            doc[field] = source[field];
          }
        }
        Object.assign(doc, normalizeTimePeriodFields(source));
        // The upload form's free-text "Version" is the depositor's own release label.
        if (doc.source_version === undefined && typeof source.version === 'string' && source.version.trim()) {
          doc.source_version = source.version.trim();
        }
      }
      if (options?.createdBy) {
        doc.created_by = options.createdBy;
      }

      await collection.insertOne(doc, session ? { session } : undefined);
      await afterCatalogueWrite(id, true, session);
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
      const row = prepareEventRow(event);
      validateMergedEvent(row);

      const collection = await getCollection(COLLECTIONS.EVENTS);

      const doc: any = {
        ...row,
        created_at: new Date().toISOString(),
      };

      const options = session ? { session } : undefined;
      await insertEventRows([doc], session, async () => {
        await collection.insertOne(doc, options);
        return 1;
      });
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

      // Canonicalise and score every row, then validate all of them before touching
      // the database — fail fast on the first invalid record so no partial batch is
      // ever written.
      const rows = events.map((event) => prepareEventRow(event));
      for (const row of rows) {
        validateMergedEvent(row);
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const now = new Date().toISOString();

      // De-duplicate within this batch by source_id (a single feed window or file can
      // repeat the same record) so one call never inserts the same event twice.
      const seenSourceIds = new Set<string>();
      const deduped = rows.filter((e) => {
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
      return insertEventRows(docs, session, async () => {
        try {
          const result = await collection.insertMany(docs, { ...(session ? { session } : {}), ordered: false });
          return result.insertedCount;
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
          return e.result?.insertedCount ?? e.insertedCount ?? 0;
        }
      });
    },

    getCatalogues: async (params?: PaginationParams): Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);

      if (!params || (!params.page && !params.pageSize && params.offset === undefined)) {
        const docs = await collection.find({ ...LIVE_CATALOGUE }).sort({ created_at: -1 }).toArray();
        return docs.map((doc) => toCatalogue(doc)!);
      }

      const pageSize = params.pageSize || 10;
      const { skip, page } = resolveSkip(params, pageSize);

      const [docs, totalItems] = await Promise.all([
        collection.find({ ...LIVE_CATALOGUE }).sort({ created_at: -1 }).skip(skip).limit(pageSize).toArray(),
        collection.countDocuments({ ...LIVE_CATALOGUE })
      ]);

      return {
        data: docs.map((doc) => toCatalogue(doc)!),
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
      const doc = await collection.findOne({ id, ...LIVE_CATALOGUE });
      return toCatalogue(doc);
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

    updateCatalogueStatus: async (
      status: string,
      id: string,
      session?: ClientSession,
      statusOptions?: CatalogueStatusOptions
    ): Promise<boolean> => {
      if (!['processing', 'complete', 'error'].includes(status)) {
        throw new Error('Invalid status value');
      }
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const options = session ? { session } : undefined;
      const runId = statusOptions?.runId;

      if (status === 'processing') {
        // Never resurrect a catalogue whose deletion has begun. A run claims the
        // catalogue with its token; a failure another run reported before it started
        // was that run's final status and is not carried into this one.
        const set: Record<string, unknown> = { status };
        if (runId !== undefined) {
          set.import_run_id = runId;
          set.import_failed = false;
        }
        const result = await collection.updateOne({ id, ...LIVE_CATALOGUE }, { $set: set }, options);
        await afterCatalogueWrite(id, true, session);
        return result.matchedCount > 0;
      }

      // Completing (or failing) an operation releases it: a catalogue's first load
      // becomes version 1.0.0, and an operation on a released catalogue publishes one
      // new version for the highest change level it recorded.
      //
      // With a run token, two runs into one catalogue (possibly in different server
      // processes) cannot overwrite each other's outcome: only the run that last
      // claimed the catalogue sets its final status, and a failure is never lost — a
      // run that fails after another has taken over marks the catalogue failed, which
      // the latest run's completion then reports as 'error'.
      const now = new Date().toISOString();
      for (let attempt = 0; attempt < VERSION_CAS_ATTEMPTS; attempt++) {
        const doc = await collection.findOne(
          { id, ...LIVE_CATALOGUE },
          { projection: { ...VERSION_STATE_PROJECTION, import_run_id: 1, import_failed: 1 }, ...(options ?? {}) }
        ) as (CatalogueVersionState & { import_run_id?: string | null; import_failed?: boolean | null }) | null;
        if (!doc) return false;

        let finalStatus = status;
        const runFilter: Record<string, unknown> = {};
        let unset: Record<string, ''> = {};
        if (runId !== undefined) {
          runFilter.import_run_id = doc.import_run_id ?? null;
          runFilter.import_failed = doc.import_failed ?? null;
          if (doc.import_run_id !== runId) {
            // Superseded by a later run. Its success says nothing about that run.
            if (status === 'complete') return false;
            if (doc.status === 'processing') {
              const marked = await collection.updateOne(
                { id, ...runFilter, status: 'processing' },
                { $set: { import_failed: true } },
                options
              );
              if (marked.matchedCount > 0) return true;
              continue;
            }
            // No run in progress any more: the failure is the catalogue's status now.
          } else {
            if (status === 'complete' && doc.import_failed) finalStatus = 'error';
            unset = { import_run_id: '', import_failed: '' };
          }
        }

        const set: Record<string, unknown> = { status: finalStatus };
        if (doc.version_state === 'initial') {
          set.version_state = 'released';
          set.version = normalizeCatalogueVersion(doc.version);
          set.version_updated_at = now;
          if (doc.version_pending_level != null) unset.version_pending_level = '';
        } else {
          const release = versionReleaseUpdate(doc, null, now);
          Object.assign(set, release.set);
          Object.assign(unset, release.unset);
        }
        const result = await collection.updateOne(
          { ...versionStateFilter(id, doc), ...runFilter },
          updateDocument(set, unset),
          options
        );
        if (result.matchedCount > 0) {
          await afterCatalogueWrite(id, true, session);
          return true;
        }
      }
      throw new Error(`Catalogue ${id} kept changing concurrently; its status was not updated`);
    },

    updateCatalogueName: async (name: string, id: string): Promise<boolean> => {
      if (!name || !name.trim()) {
        throw new Error('Catalogue name cannot be empty');
      }
      const result = await applyCatalogueChange(id, 'patch', { name, modified_at: new Date().toISOString() });
      if (result) await afterCatalogueWrite(id, true);
      return result !== null;
    },

    updateCatalogueEventCount: async (id: string, eventCount: number, session?: ClientSession): Promise<boolean> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }
      if (eventCount < 0) {
        throw new Error('Event count cannot be negative');
      }
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const options = session ? { session } : undefined;
      // Derived from the events, so it moves no version: the event writes did.
      const result = await collection.updateOne({ id, ...LIVE_CATALOGUE }, { $set: { event_count: eventCount } }, options);
      await afterCatalogueWrite(id, true, session);
      return result.matchedCount > 0;
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
      // An uncertainty counts only as a reported, non-negative number: a -999 "missing"
      // sentinel is not an uncertainty.
      const hasUncertainty = (field: string) => ({ $and: [{ $isNumber: field }, { $gte: [field, 0] }] });
      // Every form a location uncertainty is stored in. QuakeML OriginUncertainty and
      // the USGS/ISC error columns arrive as horizontal_uncertainty / the error-ellipse
      // axes and depth_uncertainty; counting only the lat/lon marginals reported 0%
      // for GeoNet and ComCat catalogues whose events are mostly constrained.
      const horizontalUncertainty = {
        $or: [
          hasUncertainty('$horizontal_uncertainty'),
          hasUncertainty('$min_horizontal_uncertainty'),
          hasUncertainty('$max_horizontal_uncertainty'),
          hasUncertainty('$latitude_uncertainty'),
          hasUncertainty('$longitude_uncertainty'),
        ],
      };
      const depthUncertainty = hasUncertainty('$depth_uncertainty');
      const count = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });

      type OverallRow = Omit<CatalogueEventStatistics, 'magnitudeTypes' | 'medianMagnitude' | 'qualityGrades'>;
      type FacetResult = {
        overall: OverallRow[];
        magnitudeTypes: Array<{ _id: unknown; count: number }>;
        qualityGrades?: Array<{ _id: unknown; count: number }>;
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
                eventsWithUncertainty: count({ $or: [horizontalUncertainty, depthUncertainty] }),
                eventsWithHorizontalUncertainty: count(horizontalUncertainty),
                eventsWithDepthUncertainty: count(depthUncertainty),
                eventsWithFocalMechanism: {
                  $sum: { $cond: [isPresent('$focal_mechanisms'), 1, 0] },
                },
                qualityScoreCount: count({ $isNumber: '$quality_score' }),
                averageQualityScore: { $avg: '$quality_score' },
              },
            }],
            magnitudeTypes: [
              { $group: { _id: '$magnitude_type', count: { $sum: 1 } } },
            ],
            qualityGrades: [
              { $match: { quality_grade: { $in: QUALITY_GRADES } } },
              { $group: { _id: '$quality_grade', count: { $sum: 1 } } },
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
          eventsWithHorizontalUncertainty: 0,
          eventsWithDepthUncertainty: 0,
          eventsWithFocalMechanism: 0,
          qualityScoreCount: 0,
          averageQualityScore: null,
          qualityGrades: [],
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

      // Grades best first (A+ .. F), whatever order the aggregation groups them in.
      const gradeCounts = new Map<string, number>();
      for (const row of facets.qualityGrades ?? []) {
        if (typeof row._id === 'string') gradeCounts.set(row._id, row.count);
      }
      const qualityGrades = QUALITY_GRADES
        .filter((grade) => gradeCounts.has(grade))
        .map((grade) => ({ grade, count: gradeCounts.get(grade)! }));

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
        eventsWithHorizontalUncertainty: overall.eventsWithHorizontalUncertainty ?? 0,
        eventsWithDepthUncertainty: overall.eventsWithDepthUncertainty ?? 0,
        eventsWithFocalMechanism: overall.eventsWithFocalMechanism,
        qualityScoreCount: overall.qualityScoreCount ?? 0,
        averageQualityScore: overall.averageQualityScore ?? null,
        qualityGrades,
      };
    },

    updateCatalogueGeoBounds: async (
      id: string, minLat: number, maxLat: number, minLon: number, maxLon: number,
      session?: ClientSession, boundsOptions?: GeoBoundsUpdateOptions
    ): Promise<boolean> => {
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

      if (boundsOptions?.merge) {
        // Union with the stored extent as a compare-and-set on the stored values, so
        // concurrent extensions compose instead of the last writer dropping the other.
        const given: GeographicBounds = { minLatitude: minLat, maxLatitude: maxLat, minLongitude: minLon, maxLongitude: maxLon };
        for (let attempt = 0; attempt < VERSION_CAS_ATTEMPTS; attempt++) {
          const doc = await collection.findOne(
            { id, ...LIVE_CATALOGUE },
            { projection: { _id: 0, min_latitude: 1, max_latitude: 1, min_longitude: 1, max_longitude: 1 }, ...(options ?? {}) }
          );
          if (!doc) return false;
          const stored = {
            min_latitude: doc.min_latitude ?? null, max_latitude: doc.max_latitude ?? null,
            min_longitude: doc.min_longitude ?? null, max_longitude: doc.max_longitude ?? null,
          };
          const hasStored = Object.values(stored).every((v) => typeof v === 'number' && Number.isFinite(v));
          const merged = hasStored
            ? unionBounds(given, {
                minLatitude: stored.min_latitude, maxLatitude: stored.max_latitude,
                minLongitude: stored.min_longitude, maxLongitude: stored.max_longitude,
              })
            : given;
          const result = await collection.updateOne({ id, ...LIVE_CATALOGUE, ...stored }, {
            $set: {
              min_latitude: merged.minLatitude,
              max_latitude: merged.maxLatitude,
              min_longitude: merged.minLongitude,
              max_longitude: merged.maxLongitude,
            }
          }, options);
          if (result.matchedCount > 0) {
            await afterCatalogueWrite(id, true, session);
            return true;
          }
        }
        throw new Error(`Catalogue ${id} kept changing concurrently; its bounds were not extended`);
      }

      // Derived from the events, so it moves no version: the event writes did.
      const result = await collection.updateOne({ id, ...LIVE_CATALOGUE }, {
        $set: {
          min_latitude: minLat,
          max_latitude: maxLat,
          min_longitude: minLon,
          max_longitude: maxLon
        }
      }, options);
      await afterCatalogueWrite(id, true, session);
      return result.matchedCount > 0;
    },

    updateCatalogueMetadata: async (
      id: string,
      metadata: Partial<MergedCatalogue>,
      options?: UpdateCatalogueMetadataOptions
    ): Promise<CatalogueUpdateResult | null> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }

      // Only descriptive metadata is client-writable. Provenance (created_by,
      // modified_at, modified_by) is set here by the server, and the version is
      // managed by the mutation functions: accepting either from the request let an
      // editor forge who created a catalogue and when, which every export repeats.
      const source = metadata as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      for (const field of CATALOGUE_METADATA_FIELDS) {
        if (source[field] !== undefined) {
          updates[field] = source[field];
        }
      }
      Object.assign(updates, normalizeTimePeriodFields(source));
      if (options?.name !== undefined) {
        if (!options.name.trim()) {
          throw new ValidationError('Catalogue name cannot be empty');
        }
        updates.name = options.name;
      }

      if (Object.keys(updates).length === 0) {
        const collection = await getCollection(COLLECTIONS.CATALOGUES);
        const existing = await collection.findOne({ id, ...LIVE_CATALOGUE }, { projection: { _id: 0, version: 1 } });
        return existing ? { version: normalizeCatalogueVersion(existing.version) } : null;
      }

      updates.modified_at = new Date().toISOString();
      if (options?.modifiedBy) updates.modified_by = options.modifiedBy;

      // A metadata correction does not touch event parameters: PATCH level.
      const result = await applyCatalogueChange(id, 'patch', updates);
      if (!result) return null;
      await afterCatalogueWrite(id, true);
      return { version: result.version };
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
        ...LIVE_CATALOGUE,
      }).sort({ created_at: -1 }).toArray();

      const queryBounds: GeographicBounds = {
        minLatitude: minLat, maxLatitude: maxLat,
        minLongitude: minLon, maxLongitude: maxLon,
      };
      const matched = docs.map((doc) => toCatalogue(doc)!).filter(c =>
        c.min_latitude != null && c.max_latitude != null &&
        c.min_longitude != null && c.max_longitude != null &&
        boundsOverlap(queryBounds, {
          minLatitude: c.min_latitude, maxLatitude: c.max_latitude,
          minLongitude: c.min_longitude, maxLongitude: c.max_longitude,
        })
      );

      return matched;
    },

    // Deletion is ordered so that no failure point, and no import racing it, leaves
    // events pointing at a catalogue that no longer exists:
    //  1. mark the catalogue 'deleting': it vanishes from every read at once, and event
    //     writes refuse it (a batch already in flight removes its own rows again, see
    //     insertEventRows);
    //  2. delete its events, then its import history;
    //  3. delete the catalogue row last.
    // A failure part-way leaves a hidden 'deleting' catalogue, not a visible empty one;
    // repeating the DELETE, or the integrity sweep, finishes the job. Resolves to
    // false when no catalogue has this id.
    deleteCatalogue: async (id: string): Promise<boolean> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const eventsCollection = await getCollection(COLLECTIONS.EVENTS);
      const historyCollection = await getCollection(COLLECTIONS.IMPORT_HISTORY);

      const marked = await collection.updateOne(
        { id },
        { $set: { status: 'deleting', deleting_at: new Date().toISOString() } }
      );
      if (marked.matchedCount === 0) return false;
      await afterCatalogueWrite(id, true);

      await eventsCollection.deleteMany({ catalogue_id: id });
      await historyCollection.deleteMany({ catalogue_id: id });
      await collection.deleteOne({ id, status: 'deleting' });

      // Readers between the mark and the event deletion may have cached a partial view.
      await afterCatalogueWrite(id, true);
      return true;
    },

    sweepOrphans: async (options: OrphanSweepOptions = {}): Promise<OrphanSweepReport> => {
      const catalogues = await getCollection(COLLECTIONS.CATALOGUES);
      const events = await getCollection(COLLECTIONS.EVENTS);
      const history = await getCollection(COLLECTIONS.IMPORT_HISTORY);
      const cutoff = new Date(Date.now() - (options.staleDeletionMs ?? 15 * 60 * 1000)).toISOString();

      // Referencing IDs first, catalogue rows second: a catalogue row is always written
      // before its events, so an ID seen in the events has its row visible by the time
      // the rows are read, and a catalogue being created right now is never mistaken
      // for an orphan.
      const referenced = Array.from(new Set([
        ...(await events.distinct('catalogue_id')),
        ...(await history.distinct('catalogue_id')),
      ].map(String)));
      const rows = await catalogues
        .find({}, { projection: { _id: 0, id: 1, status: 1, deleting_at: 1 } })
        .toArray();
      const live = new Set<string>();
      const deletingNow = new Set<string>();
      const staleDeletions: string[] = [];
      for (const row of rows) {
        if (row.status !== 'deleting') live.add(row.id);
        // A deletion without a start time predates deleting_at and counts as stale.
        else if (!row.deleting_at || row.deleting_at < cutoff) staleDeletions.push(row.id);
        else deletingNow.add(row.id); // still in the hands of the request deleting it
      }
      const orphanedCatalogueIds = referenced
        .filter((id) => !live.has(id) && !deletingNow.has(id))
        .sort();

      const filter = { catalogue_id: { $in: orphanedCatalogueIds } };
      const [orphanedEvents, orphanedImportHistory] = orphanedCatalogueIds.length === 0
        ? [0, 0]
        : await Promise.all([events.countDocuments(filter), history.countDocuments(filter)]);

      if (options.apply && orphanedCatalogueIds.length > 0) {
        await events.deleteMany(filter);
        await history.deleteMany(filter);
      }
      if (options.apply && staleDeletions.length > 0) {
        await catalogues.deleteMany({ id: { $in: staleDeletions }, status: 'deleting' });
      }
      if (options.apply) {
        for (const id of Array.from(new Set([...orphanedCatalogueIds, ...staleDeletions]))) {
          await afterCatalogueWrite(id, true);
        }
      }

      return {
        orphanedCatalogueIds,
        orphanedEvents,
        orphanedImportHistory,
        staleDeletions: staleDeletions.sort(),
        applied: Boolean(options.apply),
      };
    },

    getFilteredEvents: async (
      catalogueId: string,
      filters: EventFilters,
      options?: FilteredEventsOptions
    ): Promise<FilteredEventsResult> => {
      const query = buildEventFilterQuery(catalogueId, filters);
      const collection = await getCollection(COLLECTIONS.EVENTS);

      const requestedLimit = options?.limit;
      if (requestedLimit !== undefined && (!Number.isInteger(requestedLimit) || requestedLimit < 1)) {
        throw new ValidationError('Filtered events limit must be a positive integer');
      }
      const offset = options?.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0) {
        throw new ValidationError('Filtered events offset must be a non-negative integer');
      }
      const cap = requestedLimit ?? FILTERED_EVENTS_LIMIT;

      let cursor = collection.find(query).sort(EVENT_TIME_SORT_DESC);
      if (offset > 0) cursor = cursor.skip(offset);

      let docs: WithId<Document>[];
      let truncated = false;
      if (cap) {
        // One extra row tells whether more match than were returned.
        docs = await cursor.limit(cap + 1).toArray();
        truncated = docs.length > cap;
        if (truncated) docs = docs.slice(0, cap);
      } else {
        docs = await cursor.toArray();
      }

      return {
        events: toPlainArray<MergedEvent>(docs),
        truncated,
        // 0 means "no server-side cap" for this call.
        limit: cap || 0,
      };
    },

    // Transaction support using MongoDB sessions
    transaction: async <T>(callback: TransactionCallback<T>): Promise<T> => {
      // Use proper MongoDB transactions with session management
      // This provides ACID guarantees for multi-document operations
      const attempt: { writes?: Map<string, boolean> } = {};
      try {
        return await withTransaction(async (session: ClientSession) => {
          // withTransaction may run the callback again after a transient error; only
          // the attempt that commits counts, so each attempt starts a fresh record.
          const writes = new Map<string, boolean>();
          attempt.writes = writes;
          pendingTransactionWrites.set(session, writes);
          try {
            return await callback(session);
          } catch (error) {
            console.error('[Database] Transaction error:', error);
            throw error;
          }
        });
      } finally {
        // Published once the outcome is known: after a commit the caches must drop
        // what they read before it; after an abort this is only an extra refresh.
        if (attempt.writes && attempt.writes.size > 0) await publishCatalogueWrites(attempt.writes);
      }
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

    // Saved filter methods. Saved filters are personal: every lookup and write is
    // scoped to the owner it is given. Only an administrator's request omits the owner.
    insertSavedFilter: async (id: string, name: string, description: string | null, filterConfig: string, ownerId?: string): Promise<void> => {
      if (!id || !name || !filterConfig) {
        throw new Error('Missing required fields for saved filter');
      }

      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      await collection.insertOne({
        id,
        name,
        description,
        filter_config: filterConfig,
        owner_id: ownerId ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as any);
    },

    getSavedFilters: async (ownerId?: string): Promise<SavedFilter[]> => {
      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      const docs = await collection.find(ownerId !== undefined ? { owner_id: ownerId } : {}).sort({ created_at: -1 }).toArray();
      return toPlainArray<SavedFilter>(docs);
    },

    countSavedFilters: async (ownerId: string): Promise<number> => {
      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      return collection.countDocuments({ owner_id: ownerId });
    },

    getSavedFilterById: async (id: string, ownerId?: string): Promise<SavedFilter | undefined> => {
      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      const doc = await collection.findOne(ownerId !== undefined ? { id, owner_id: ownerId } : { id });
      return toPlainObject<SavedFilter>(doc);
    },

    updateSavedFilter: async (id: string, name: string, description: string | null, filterConfig: string, ownerId?: string): Promise<boolean> => {
      if (!id || !name || !filterConfig) {
        throw new Error('Missing required fields for saved filter');
      }

      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      const result = await collection.updateOne(ownerId !== undefined ? { id, owner_id: ownerId } : { id }, {
        $set: { name, description, filter_config: filterConfig, updated_at: new Date().toISOString() }
      });
      return result.matchedCount > 0;
    },

    deleteSavedFilter: async (id: string, ownerId?: string): Promise<boolean> => {
      if (!id) {
        throw new Error('Missing filter ID');
      }

      const collection = await getCollection(COLLECTIONS.SAVED_FILTERS);
      const result = await collection.deleteOne(ownerId !== undefined ? { id, owner_id: ownerId } : { id });
      return result.deletedCount > 0;
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

      if (updateFields.depth_type != null) {
        const canonical = normalizeDepthType(updateFields.depth_type);
        if (canonical) updateFields.depth_type = canonical;
      }

      // Changed fields obey the same contract as inserts. An update used to $set a
      // 1001 km depth the insert validator rejects, and report success.
      validateOptionalRanges(updateFields, id);
      validateCoreFieldUpdates(updateFields, id);

      const collection = await getCollection(COLLECTIONS.EVENTS);
      // The stored values of the fields being changed (to classify the change for the
      // catalogue version) and of everything the quality score reads.
      const projection: Record<string, 0 | 1> = { _id: 0, catalogue_id: 1 };
      for (const field of [...Object.keys(updateFields), ...QUALITY_INPUT_FIELDS]) projection[field] = 1;
      const before = await collection.findOne({ id }, { projection });

      // Q follows the fields it is computed from (contract C1). A score supplied with
      // the update is kept; otherwise it is recomputed from the updated row whenever
      // one of its inputs changes.
      const touchesQualityInput = Object.keys(updateFields).some((field) => QUALITY_INPUT_FIELDS.includes(field));
      if (typeof updateFields.quality_score === 'number' && Number.isFinite(updateFields.quality_score)) {
        Object.assign(updateFields, eventQualityFields(updateFields));
      } else if (touchesQualityInput) {
        Object.assign(updateFields, eventQualityFields({ ...(before ?? {}), ...updateFields, quality_score: undefined }));
      }

      const result = await collection.updateOne({ id }, { $set: updateFields });

      // Insert paths invalidate the catalogue's event/statistics caches; update did not,
      // so the events API kept serving the pre-update magnitude after a re-import.
      const catalogueId = (updateFields.catalogue_id as string | undefined) ?? before?.catalogue_id;
      if (!catalogueId) return;
      await afterCatalogueWrite(String(catalogueId), false);

      // Changing an existing event's solution is a MAJOR change of the catalogue,
      // filling in a missing field MINOR, correcting a description PATCH.
      const level = before && result.matchedCount !== 0 ? classifyEventUpdate(before, updateFields) : null;
      if (level && await recordCatalogueContentChange(String(catalogueId), level)) {
        await afterCatalogueWrite(String(catalogueId), true);
      }
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
      errors: string | null,
      breakdown?: ImportHistoryBreakdown
    ): Promise<void> => {
      if (!id || !catalogueId || !startTime || !endTime) {
        throw new Error('Missing required import history fields');
      }

      // Why fetched rows were not stored, so the history adds up (fetched = new +
      // updated + unchanged + the reasons below). Only counts are kept.
      const extra: Record<string, unknown> = {};
      if (breakdown) {
        for (const field of ['collided_events', 'invalid_events', 'excluded_events', 'failed_events'] as const) {
          const value = breakdown[field];
          if (value === undefined) continue;
          if (!Number.isInteger(value) || value < 0) {
            throw new Error(`Invalid import history ${field}: ${String(value)}`);
          }
          extra[field] = value;
        }
        const types = breakdown.excluded_event_types;
        if (types !== undefined) {
          const entries = Object.entries(types);
          if (entries.length > 100 || entries.some(([type, n]) => type.length > 200 || !Number.isInteger(n) || n < 0)) {
            throw new Error('Invalid import history excluded_event_types');
          }
          extra.excluded_event_types = types;
        }
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
        ...extra,
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
      // A search returns at most MAX_SEARCH_RESULTS rows. The driver reads limit(0) as
      // "no limit", so an unchecked limit let one request pull every matching event,
      // with its origin/pick/arrival blobs, into memory.
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_RESULTS) {
        throw new ValidationError(`Search limit must be a whole number between 1 and ${MAX_SEARCH_RESULTS}`);
      }
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

      // source_id is the agency's own event ID (a GeoNet EventID such as 2016p858000):
      // depending on the ingest path it is stored there, in event_public_id, or both.
      const textFields = [
        'event_public_id',
        'source_id',
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

      // Signed: negative local magnitudes (GeoNet microseismicity) and negative depths
      // (hypocentres above the datum, down to -5 km) are valid data. A token that does
      // not parse is an error: dropping it silently returned results the user had
      // asked to exclude.
      const applyNumericFilter = (field: 'magnitude' | 'depth', token: string, value: string) => {
        const rangeMatch = value.match(/^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
          updateMin(field, parseFloat(rangeMatch[1]), true);
          updateMax(field, parseFloat(rangeMatch[2]), true);
          return;
        }

        const compMatch = value.match(/^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/);
        if (!compMatch) {
          throw new ValidationError(`Invalid ${token} filter "${value}". Use e.g. ${token}:>=4, ${token}:-0.5..2`);
        }

        const op = compMatch[1] || '=';
        const num = parseFloat(compMatch[2]);

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

      // A date token names a UTC period (a year, month or day) and may carry a
      // comparison: date:2024-03, date:2023..2024-06-30, date:>2024-01-01 (after that
      // day), date:>=2024 (from 2024), date:<2020 (before 2020), date:<=2020-05.
      const parseDateRange = (value: string): { start?: string; end?: string } | null => {
        const normalized = value.trim().replace(/\//g, '-');
        const parseSingleDate = (dateValue: string): { start: Date; end: Date } | null => {
          const parts = dateValue.split('-').map((part) => part.trim());
          if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
          if (parts[0].length !== 4) return null;
          const year = parseInt(parts[0], 10);

          if (parts.length === 1) {
            const start = new Date(Date.UTC(year, 0, 1));
            const end = new Date(Date.UTC(year + 1, 0, 1));
            return { start, end };
          }

          const month = parseInt(parts[1], 10);
          if (month < 1 || month > 12) return null;

          if (parts.length === 2) {
            const start = new Date(Date.UTC(year, month - 1, 1));
            const end = new Date(Date.UTC(year, month, 1));
            return { start, end };
          }

          const day = parseInt(parts[2], 10);
          const start = new Date(Date.UTC(year, month - 1, day));
          // Date.UTC rolls 2024-02-30 over into March; such a day does not exist.
          if (day < 1 || start.getUTCMonth() !== month - 1) return null;
          const end = new Date(Date.UTC(year, month - 1, day + 1));
          return { start, end };
        };

        const comparison = normalized.match(/^(>=|<=|>|<|=)\s*(.+)$/);
        if (comparison) {
          const period = parseSingleDate(comparison[2].trim());
          if (!period) return null;
          switch (comparison[1]) {
            case '>': return { start: period.end.toISOString() };
            case '>=': return { start: period.start.toISOString() };
            case '<': return { end: period.start.toISOString() };
            case '<=': return { end: period.end.toISOString() };
            default: return { start: period.start.toISOString(), end: period.end.toISOString() };
          }
        }

        const rangeParts = normalized.split('..').map(part => part.trim());
        if (rangeParts.length === 2) {
          const startRange = parseSingleDate(rangeParts[0]);
          const endRange = parseSingleDate(rangeParts[1]);
          if (!startRange || !endRange || startRange.start > endRange.end) return null;
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
              { event_public_id: regex },
              { source_id: regex }
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
          applyNumericFilter('magnitude', token.field, tokenValue);
          continue;
        }

        if (token.field === 'depth') {
          applyNumericFilter('depth', token.field, tokenValue);
          continue;
        }

        if (token.field === 'date' || token.field === 'time') {
          const dateRange = parseDateRange(tokenValue);
          if (!dateRange) {
            throw new ValidationError(
              `Invalid ${token.field} filter "${tokenValue}". Use e.g. date:2024, date:2024-03-01..2024-03-31, date:>=2024-01`
            );
          }
          const timeCondition: Record<string, string> = {};
          if (dateRange.start) timeCondition.$gte = dateRange.start;
          if (dateRange.end) timeCondition.$lt = dateRange.end;
          andConditions.push({ time: timeCondition });
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
            .find({ name: { $regex: regex }, ...LIVE_CATALOGUE }, { projection: { _id: 0, id: 1 } })
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
        // Only the fields the result carries: full documents hold the origin, pick
        // and arrival JSON, which the search never returns.
        .find(searchQuery, { projection: SEARCH_RESULT_PROJECTION })
        // `id` breaks ties on the non-unique `time`, so which events survive the
        // limit is reproducible rather than plan-dependent.
        .sort(EVENT_TIME_SORT_DESC)
        .limit(limit)
        .toArray() as any[];

      // Get catalogue names for the events
      const catalogueIds = Array.from(new Set(events.map((e: any) => e.catalogue_id)));
      const catalogues = await cataloguesCollection
        .find({ id: { $in: catalogueIds }, ...LIVE_CATALOGUE }, { projection: { _id: 0, id: 1, name: 1 } })
        .toArray() as any[];

      const catalogueMap = new Map(catalogues.map((c: any) => [c.id, c.name]));

      // An event whose catalogue is gone (or going) is an orphan awaiting the
      // integrity sweep; it must not surface as a link to a missing catalogue.
      return events.filter((e: any) => catalogueMap.has(e.catalogue_id)).map((e: any) => ({
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
