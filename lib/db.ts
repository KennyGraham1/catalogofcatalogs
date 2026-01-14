/**
 * MongoDB Database Module
 *
 * Provides database operations for the earthquake catalogue application.
 */

import { getDb, getCollection, COLLECTIONS } from './mongodb';
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
export type TransactionCallback<T> = () => Promise<T>;

// Database query interface with proper typing
export interface DbQueries {
  insertCatalogue: (
    id: string,
    name: string,
    sourceCatalogues: string,
    mergeConfig: string,
    eventCount: number,
    status: string,
    metadata?: Partial<MergedCatalogue>
  ) => Promise<void>;

  insertEvent: (event: Partial<MergedEvent> & {
    id: string;
    catalogue_id: string;
    time: string;
    latitude: number;
    longitude: number;
    magnitude: number;
    source_events: string;
  }) => Promise<void>;

  // Performance Optimization: Bulk insert for importing large datasets
  bulkInsertEvents: (events: Array<Partial<MergedEvent> & {
    id: string;
    catalogue_id: string;
    time: string;
    latitude: number;
    longitude: number;
    magnitude: number;
    source_events: string;
  }>) => Promise<void>;

  getCatalogues: (params?: PaginationParams) => Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>>;

  getCatalogueById: (id: string) => Promise<MergedCatalogue | undefined>;

  getEventsByCatalogueId: (catalogueId: string, params?: PaginationParams) => Promise<MergedEvent[] | PaginatedResult<MergedEvent>>;

  // Performance Optimization: Cursor-based pagination for better performance on large datasets
  getEventsByCatalogueIdCursor: (catalogueId: string, params?: CursorPaginationParams) => Promise<CursorPaginatedResult<MergedEvent>>;

  updateCatalogueStatus: (status: string, id: string) => Promise<void>;

  updateCatalogueName: (name: string, id: string) => Promise<void>;

  updateCatalogueEventCount: (id: string, eventCount: number) => Promise<void>;

  updateCatalogueGeoBounds: (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number) => Promise<void>;

  updateCatalogueMetadata: (id: string, metadata: Partial<MergedCatalogue>) => Promise<void>;

  getCataloguesByRegion: (minLat: number, maxLat: number, minLon: number, maxLon: number) => Promise<MergedCatalogue[]>;

  deleteCatalogue: (id: string) => Promise<void>;

  getFilteredEvents: (catalogueId: string, filters: EventFilters) => Promise<MergedEvent[]>;

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
      metadata?: Partial<MergedCatalogue>
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

      await collection.insertOne(doc);
    },

    insertEvent: async (event: Partial<MergedEvent> & {
      id: string;
      catalogue_id: string;
      time: string;
      latitude: number;
      longitude: number;
      magnitude: number;
      source_events: string;
    }): Promise<void> => {
      // Validate coordinates
      if (event.latitude < -90 || event.latitude > 90) {
        throw new Error(`Invalid latitude: ${event.latitude}. Must be between -90 and 90`);
      }
      if (event.longitude < -180 || event.longitude > 180) {
        throw new Error(`Invalid longitude: ${event.longitude}. Must be between -180 and 180`);
      }

      // Validate magnitude (allow negative for microquakes)
      if (event.magnitude < -3 || event.magnitude > 10) {
        throw new Error(`Invalid magnitude: ${event.magnitude}. Must be between -3 and 10`);
      }

      // Validate depth
      if (event.depth !== null && event.depth !== undefined && (event.depth < 0 || event.depth > 1000)) {
        throw new Error(`Invalid depth: ${event.depth}. Must be between 0 and 1000 km`);
      }

      // Validate timestamp
      const date = new Date(event.time);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid timestamp: ${event.time}`);
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);

      const doc: any = {
        ...event,
        created_at: new Date().toISOString(),
      };

      await collection.insertOne(doc);

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
    }>): Promise<void> => {
      if (!events || events.length === 0) {
        return;
      }

      // Validate all events first
      for (const event of events) {
        if (event.latitude < -90 || event.latitude > 90) {
          throw new Error(`Invalid latitude: ${event.latitude}. Must be between -90 and 90`);
        }
        if (event.longitude < -180 || event.longitude > 180) {
          throw new Error(`Invalid longitude: ${event.longitude}. Must be between -180 and 180`);
        }
        if (event.magnitude < -3 || event.magnitude > 10) {
          throw new Error(`Invalid magnitude: ${event.magnitude}. Must be between -3 and 10`);
        }
        if (event.depth !== null && event.depth !== undefined && (event.depth < 0 || event.depth > 1000)) {
          throw new Error(`Invalid depth: ${event.depth}. Must be between 0 and 1000 km`);
        }
        const date = new Date(event.time);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid timestamp: ${event.time}`);
        }
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const now = new Date().toISOString();

      const docs = events.map(event => ({
        ...event,
        created_at: now,
      })) as any[];

      await collection.insertMany(docs);

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

      // Performance optimization: Always use a limit to prevent loading massive datasets
      // Default to 50000 events max if no pagination specified (for backward compatibility)
      const DEFAULT_MAX_EVENTS = 50000;

      if (!params || (!params.page && !params.pageSize)) {
        // Return all events but with a safety limit
        const docs = await collection
          .find({ catalogue_id: catalogueId })
          .sort({ time: -1 })
          .limit(DEFAULT_MAX_EVENTS)
          .toArray();
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

      if (limit < 1 || limit > 1000) {
        throw new Error('Limit must be between 1 and 1000');
      }

      const collection = await getCollection(COLLECTIONS.EVENTS);
      const sortDir = direction === 'desc' ? -1 : 1;

      let query: any = { catalogue_id: catalogueId };

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

    updateCatalogueStatus: async (status: string, id: string): Promise<void> => {
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      await collection.updateOne({ id }, { $set: { status } });
    },

    updateCatalogueName: async (name: string, id: string): Promise<void> => {
      if (!name || !name.trim()) {
        throw new Error('Catalogue name cannot be empty');
      }
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      await collection.updateOne({ id }, { $set: { name } });
    },

    updateCatalogueEventCount: async (id: string, eventCount: number): Promise<void> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }
      if (eventCount < 0) {
        throw new Error('Event count cannot be negative');
      }
      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      await collection.updateOne({ id }, { $set: { event_count: eventCount } });
    },

    updateCatalogueGeoBounds: async (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number): Promise<void> => {
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
      await collection.updateOne({ id }, {
        $set: {
          min_latitude: minLat,
          max_latitude: maxLat,
          min_longitude: minLon,
          max_longitude: maxLon
        }
      });
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

      const collection = await getCollection(COLLECTIONS.CATALOGUES);
      const docs = await collection.find({
        min_latitude: { $ne: null },
        max_latitude: { $ne: null },
        min_longitude: { $ne: null },
        max_longitude: { $ne: null },
        $and: [
          { max_latitude: { $gte: minLat } },
          { min_latitude: { $lte: maxLat } },
          { max_longitude: { $gte: minLon } },
          { min_longitude: { $lte: maxLon } }
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

    getFilteredEvents: async (catalogueId: string, filters: EventFilters): Promise<MergedEvent[]> => {
      const collection = await getCollection(COLLECTIONS.EVENTS);

      const query: any = { catalogue_id: catalogueId };

      if (filters.minMagnitude !== undefined) query.magnitude = { ...query.magnitude, $gte: filters.minMagnitude };
      if (filters.maxMagnitude !== undefined) query.magnitude = { ...query.magnitude, $lte: filters.maxMagnitude };
      if (filters.minDepth !== undefined) query.depth = { ...query.depth, $gte: filters.minDepth };
      if (filters.maxDepth !== undefined) query.depth = { ...query.depth, $lte: filters.maxDepth };
      if (filters.startTime) query.time = { ...query.time, $gte: filters.startTime };
      if (filters.endTime) query.time = { ...query.time, $lte: filters.endTime };
      if (filters.eventType) query.event_type = filters.eventType;
      if (filters.magnitudeType) query.magnitude_type = filters.magnitudeType;
      if (filters.evaluationStatus) query.evaluation_status = filters.evaluationStatus;
      if (filters.evaluationMode) query.evaluation_mode = filters.evaluationMode;
      if (filters.maxAzimuthalGap !== undefined) query.azimuthal_gap = { $lte: filters.maxAzimuthalGap };
      if (filters.minUsedPhaseCount !== undefined) query.used_phase_count = { $gte: filters.minUsedPhaseCount };
      if (filters.minUsedStationCount !== undefined) query.used_station_count = { $gte: filters.minUsedStationCount };
      if (filters.maxStandardError !== undefined) query.standard_error = { $lte: filters.maxStandardError };
      if (filters.minLatitude !== undefined) query.latitude = { ...query.latitude, $gte: filters.minLatitude };
      if (filters.maxLatitude !== undefined) query.latitude = { ...query.latitude, $lte: filters.maxLatitude };
      if (filters.minLongitude !== undefined) query.longitude = { ...query.longitude, $gte: filters.minLongitude };
      if (filters.maxLongitude !== undefined) query.longitude = { ...query.longitude, $lte: filters.maxLongitude };

      const docs = await collection.find(query).sort({ time: -1 }).toArray();
      return toPlainArray<MergedEvent>(docs);
    },

    // Transaction support using MongoDB sessions
    transaction: async <T>(callback: TransactionCallback<T>): Promise<T> => {
      // MongoDB handles transactions differently - for now, just execute the callback
      // For full transaction support, we'd need to use MongoDB sessions
      try {
        const result = await callback();
        return result;
      } catch (error) {
        console.error('[Database] Transaction error:', error);
        throw error;
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

      const searchQuery: any = {
        $or: [
          { event_public_id: { $regex: searchTerm, $options: 'i' } },
          { event_type: { $regex: searchTerm, $options: 'i' } },
          { id: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      if (catalogueId) {
        searchQuery.catalogue_id = catalogueId;
      }

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