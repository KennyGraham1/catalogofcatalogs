import { join } from 'path';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

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

  // QuakeML 1.2 Event metadata
  event_public_id?: string | null;
  event_type?: string | null;
  event_type_certainty?: string | null;

  // Origin uncertainties
  time_uncertainty?: number | null;
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;

  // Magnitude details
  magnitude_type?: string | null;
  magnitude_uncertainty?: number | null;
  magnitude_station_count?: number | null;

  // Origin quality metrics
  azimuthal_gap?: number | null;
  used_phase_count?: number | null;
  used_station_count?: number | null;
  standard_error?: number | null;

  // Evaluation metadata
  evaluation_mode?: string | null;
  evaluation_status?: string | null;

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

  getCatalogues: (params?: PaginationParams) => Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>>;

  getCatalogueById: (id: string) => Promise<MergedCatalogue | undefined>;

  getEventsByCatalogueId: (catalogueId: string, params?: PaginationParams) => Promise<MergedEvent[] | PaginatedResult<MergedEvent>>;

  updateCatalogueStatus: (status: string, id: string) => Promise<void>;

  updateCatalogueName: (name: string, id: string) => Promise<void>;

  updateCatalogueEventCount: (id: string, eventCount: number) => Promise<void>;

  updateCatalogueGeoBounds: (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number) => Promise<void>;

  updateCatalogueMetadata: (id: string, metadata: Partial<MergedCatalogue>) => Promise<void>;

  getCataloguesByRegion: (minLat: number, maxLat: number, minLon: number, maxLon: number) => Promise<MergedCatalogue[]>;

  deleteCatalogue: (id: string) => Promise<void>;

  getFilteredEvents: (catalogueId: string, filters: EventFilters) => Promise<MergedEvent[]>;

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

// Only initialize database on the server side
let db: sqlite3.Database | null = null;
let dbQueries: DbQueries | null = null;

if (typeof window === 'undefined') {
  db = new sqlite3.Database(join(process.cwd(), 'merged_catalogues.db'));

  // Convert callback-based methods to promises
  const dbRun = promisify(db.run.bind(db)) as (sql: string, params?: any[]) => Promise<void>;
  const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;
  const dbGet = promisify(db.get.bind(db)) as (sql: string, params?: any[]) => Promise<any>;
  
  // Initialize database schema
  db.serialize(() => {
    db!.run(`
      CREATE TABLE IF NOT EXISTS merged_catalogues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_catalogues TEXT NOT NULL,
        merge_config TEXT NOT NULL,
        event_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'processing',
        min_latitude REAL,
        max_latitude REAL,
        min_longitude REAL,
        max_longitude REAL
      )
    `);

    db!.run(`
      CREATE TABLE IF NOT EXISTS merged_events (
        id TEXT PRIMARY KEY,
        catalogue_id TEXT NOT NULL,
        source_id TEXT,
        time DATETIME NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        depth REAL,
        magnitude REAL NOT NULL,
        source_events TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- QuakeML 1.2 Event metadata
        event_public_id TEXT,
        event_type TEXT,
        event_type_certainty TEXT,

        -- Origin uncertainties
        time_uncertainty REAL,
        latitude_uncertainty REAL,
        longitude_uncertainty REAL,
        depth_uncertainty REAL,

        -- Magnitude details
        magnitude_type TEXT,
        magnitude_uncertainty REAL,
        magnitude_station_count INTEGER,

        -- Origin quality metrics
        azimuthal_gap REAL,
        used_phase_count INTEGER,
        used_station_count INTEGER,
        standard_error REAL,

        -- Evaluation metadata
        evaluation_mode TEXT,
        evaluation_status TEXT,

        -- Complex nested data as JSON
        origin_quality TEXT,
        origins TEXT,
        magnitudes TEXT,
        picks TEXT,
        arrivals TEXT,
        focal_mechanisms TEXT,
        amplitudes TEXT,
        station_magnitudes TEXT,
        event_descriptions TEXT,
        comments TEXT,
        creation_info TEXT,

        FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
      )
    `);

    db!.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_catalogue_id ON merged_events(catalogue_id)`);
    db!.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_source_id ON merged_events(source_id)`);
    db!.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_time ON merged_events(time)`);
    db!.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_event_type ON merged_events(event_type)`);
    db!.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_magnitude_type ON merged_events(magnitude_type)`);
    db!.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_evaluation_status ON merged_events(evaluation_status)`);
    db!.run(`CREATE INDEX IF NOT EXISTS idx_merged_events_azimuthal_gap ON merged_events(azimuthal_gap)`);

    // Create mapping templates table
    db!.run(`
      CREATE TABLE IF NOT EXISTS mapping_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        mappings TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db!.run(`CREATE INDEX IF NOT EXISTS idx_mapping_templates_name ON mapping_templates(name)`);

    // Create import history table
    db!.run(`
      CREATE TABLE IF NOT EXISTS import_history (
        id TEXT PRIMARY KEY,
        catalogue_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        total_fetched INTEGER NOT NULL,
        new_events INTEGER NOT NULL,
        updated_events INTEGER NOT NULL,
        skipped_events INTEGER NOT NULL,
        errors TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
      )
    `);

    db!.run(`CREATE INDEX IF NOT EXISTS idx_import_history_catalogue_id ON import_history(catalogue_id)`);
    db!.run(`CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON import_history(created_at)`);
  });

  // Initialize queries with proper typing and validation
  dbQueries = {
    insertCatalogue: async (id: string, name: string, sourceCatalogues: string, mergeConfig: string, eventCount: number, status: string, metadata?: Partial<MergedCatalogue>): Promise<void> => {
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

      // Build SQL with optional metadata fields
      const baseFields = ['id', 'name', 'source_catalogues', 'merge_config', 'event_count', 'status'];
      const baseValues: any[] = [id, name, sourceCatalogues, mergeConfig, eventCount, status];

      const metadataFields = [
        'description', 'data_source', 'provider', 'geographic_region',
        'time_period_start', 'time_period_end', 'data_quality', 'quality_notes',
        'contact_name', 'contact_email', 'contact_organization',
        'license', 'usage_terms', 'citation', 'doi', 'version',
        'keywords', 'reference_links', 'notes',
        'merge_description', 'merge_use_case', 'merge_methodology', 'merge_quality_assessment',
        'created_by', 'modified_at', 'modified_by'
      ];

      if (metadata) {
        for (const field of metadataFields) {
          if (metadata[field as keyof MergedCatalogue] !== undefined) {
            baseFields.push(field);
            baseValues.push(metadata[field as keyof MergedCatalogue]);
          }
        }
      }

      const placeholders = baseFields.map(() => '?').join(', ');
      const sql = `INSERT INTO merged_catalogues (${baseFields.join(', ')}) VALUES (${placeholders})`;

      await dbRun(sql, baseValues);
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

      // Validate magnitude
      if (event.magnitude < 0 || event.magnitude > 10) {
        throw new Error(`Invalid magnitude: ${event.magnitude}. Must be between 0 and 10`);
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

      // Build dynamic SQL based on provided fields
      const fields: string[] = [
        'id', 'catalogue_id', 'source_id', 'time', 'latitude', 'longitude', 'depth', 'magnitude', 'source_events'
      ];
      const values: any[] = [
        event.id,
        event.catalogue_id,
        event.source_id ?? null,
        event.time,
        event.latitude,
        event.longitude,
        event.depth ?? null,
        event.magnitude,
        event.source_events
      ];

      // Add QuakeML fields if provided
      const optionalFields: Array<keyof MergedEvent> = [
        'event_public_id', 'event_type', 'event_type_certainty',
        'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty', 'depth_uncertainty',
        'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count',
        'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
        'evaluation_mode', 'evaluation_status',
        'origin_quality', 'origins', 'magnitudes', 'picks', 'arrivals',
        'focal_mechanisms', 'amplitudes', 'station_magnitudes',
        'event_descriptions', 'comments', 'creation_info'
      ];

      for (const field of optionalFields) {
        if (event[field] !== undefined) {
          fields.push(field);
          values.push(event[field]);
        }
      }

      const placeholders = fields.map(() => '?').join(', ');
      const sql = `INSERT INTO merged_events (${fields.join(', ')}) VALUES (${placeholders})`;

      await dbRun(sql, values);
    },

    getCatalogues: async (params?: PaginationParams): Promise<MergedCatalogue[] | PaginatedResult<MergedCatalogue>> => {
      if (!params || (!params.page && !params.pageSize)) {
        // Return all catalogues if no pagination params
        return dbAll(`SELECT * FROM merged_catalogues ORDER BY created_at DESC`) as Promise<MergedCatalogue[]>;
      }

      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await dbGet(`SELECT COUNT(*) as count FROM merged_catalogues`) as { count: number };
      const totalItems = countResult.count;
      const totalPages = Math.ceil(totalItems / pageSize);

      // Get paginated data
      const data = await dbAll(
        `SELECT * FROM merged_catalogues ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [pageSize, offset]
      ) as MergedCatalogue[];

      return {
        data,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages
        }
      };
    },

    getCatalogueById: async (id: string): Promise<MergedCatalogue | undefined> => {
      return dbGet(`SELECT * FROM merged_catalogues WHERE id = ?`, [id]) as Promise<MergedCatalogue | undefined>;
    },

    getEventsByCatalogueId: async (catalogueId: string, params?: PaginationParams): Promise<MergedEvent[] | PaginatedResult<MergedEvent>> => {
      if (!params || (!params.page && !params.pageSize)) {
        // Return all events if no pagination params
        return dbAll(`SELECT * FROM merged_events WHERE catalogue_id = ?`, [catalogueId]) as Promise<MergedEvent[]>;
      }

      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await dbGet(
        `SELECT COUNT(*) as count FROM merged_events WHERE catalogue_id = ?`,
        [catalogueId]
      ) as { count: number };
      const totalItems = countResult.count;
      const totalPages = Math.ceil(totalItems / pageSize);

      // Get paginated data
      const data = await dbAll(
        `SELECT * FROM merged_events WHERE catalogue_id = ? ORDER BY time DESC LIMIT ? OFFSET ?`,
        [catalogueId, pageSize, offset]
      ) as MergedEvent[];

      return {
        data,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages
        }
      };
    },

    updateCatalogueStatus: async (status: string, id: string): Promise<void> => {
      await dbRun(`UPDATE merged_catalogues SET status = ? WHERE id = ?`, [status, id]);
    },

    updateCatalogueName: async (name: string, id: string): Promise<void> => {
      if (!name || !name.trim()) {
        throw new Error('Catalogue name cannot be empty');
      }
      await dbRun(`UPDATE merged_catalogues SET name = ? WHERE id = ?`, [name, id]);
    },

    updateCatalogueEventCount: async (id: string, eventCount: number): Promise<void> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }
      if (eventCount < 0) {
        throw new Error('Event count cannot be negative');
      }
      await dbRun(`UPDATE merged_catalogues SET event_count = ? WHERE id = ?`, [eventCount, id]);
    },

    updateCatalogueGeoBounds: async (id: string, minLat: number, maxLat: number, minLon: number, maxLon: number): Promise<void> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }
      // Validate bounds
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

      await dbRun(
        `UPDATE merged_catalogues SET min_latitude = ?, max_latitude = ?, min_longitude = ?, max_longitude = ? WHERE id = ?`,
        [minLat, maxLat, minLon, maxLon, id]
      );
    },

    updateCatalogueMetadata: async (id: string, metadata: Partial<MergedCatalogue>): Promise<void> => {
      if (!id) {
        throw new Error('Catalogue ID is required');
      }

      // Build dynamic UPDATE query based on provided metadata fields
      const allowedFields = [
        'description', 'data_source', 'provider', 'geographic_region',
        'time_period_start', 'time_period_end', 'data_quality', 'quality_notes',
        'contact_name', 'contact_email', 'contact_organization',
        'license', 'usage_terms', 'citation', 'doi', 'version',
        'keywords', 'reference_links', 'notes',
        'merge_description', 'merge_use_case', 'merge_methodology', 'merge_quality_assessment',
        'created_by', 'modified_at', 'modified_by'
      ];

      const updates: string[] = [];
      const values: any[] = [];

      for (const [key, value] of Object.entries(metadata)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updates.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return; // No valid fields to update
      }

      values.push(id); // Add id for WHERE clause
      const sql = `UPDATE merged_catalogues SET ${updates.join(', ')} WHERE id = ?`;

      await dbRun(sql, values);
    },

    getCataloguesByRegion: async (minLat: number, maxLat: number, minLon: number, maxLon: number): Promise<MergedCatalogue[]> => {
      // Validate bounds
      if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
        throw new Error('Latitude must be between -90 and 90');
      }
      if (minLon < -180 || minLon > 180 || maxLon < -180 || maxLon > 180) {
        throw new Error('Longitude must be between -180 and 180');
      }

      // Find catalogues that overlap with the search region
      // A catalogue overlaps if:
      // - Its max_latitude >= search min_latitude AND
      // - Its min_latitude <= search max_latitude AND
      // - Its max_longitude >= search min_longitude AND
      // - Its min_longitude <= search max_longitude
      const catalogues = await dbAll(
        `SELECT * FROM merged_catalogues
         WHERE min_latitude IS NOT NULL
         AND max_latitude IS NOT NULL
         AND min_longitude IS NOT NULL
         AND max_longitude IS NOT NULL
         AND max_latitude >= ?
         AND min_latitude <= ?
         AND max_longitude >= ?
         AND min_longitude <= ?
         ORDER BY created_at DESC`,
        [minLat, maxLat, minLon, maxLon]
      );

      return catalogues as MergedCatalogue[];
    },

    deleteCatalogue: async (id: string): Promise<void> => {
      await dbRun(`DELETE FROM merged_catalogues WHERE id = ?`, [id]);
    },

    getFilteredEvents: async (catalogueId: string, filters: EventFilters): Promise<MergedEvent[]> => {
      const conditions: string[] = ['catalogue_id = ?'];
      const params: any[] = [catalogueId];

      // Build WHERE clause based on filters
      if (filters.minMagnitude !== undefined) {
        conditions.push('magnitude >= ?');
        params.push(filters.minMagnitude);
      }
      if (filters.maxMagnitude !== undefined) {
        conditions.push('magnitude <= ?');
        params.push(filters.maxMagnitude);
      }
      if (filters.minDepth !== undefined) {
        conditions.push('depth >= ?');
        params.push(filters.minDepth);
      }
      if (filters.maxDepth !== undefined) {
        conditions.push('depth <= ?');
        params.push(filters.maxDepth);
      }
      if (filters.startTime) {
        conditions.push('time >= ?');
        params.push(filters.startTime);
      }
      if (filters.endTime) {
        conditions.push('time <= ?');
        params.push(filters.endTime);
      }
      if (filters.eventType) {
        conditions.push('event_type = ?');
        params.push(filters.eventType);
      }
      if (filters.magnitudeType) {
        conditions.push('magnitude_type = ?');
        params.push(filters.magnitudeType);
      }
      if (filters.evaluationStatus) {
        conditions.push('evaluation_status = ?');
        params.push(filters.evaluationStatus);
      }
      if (filters.evaluationMode) {
        conditions.push('evaluation_mode = ?');
        params.push(filters.evaluationMode);
      }
      if (filters.maxAzimuthalGap !== undefined) {
        conditions.push('azimuthal_gap <= ?');
        params.push(filters.maxAzimuthalGap);
      }
      if (filters.minUsedPhaseCount !== undefined) {
        conditions.push('used_phase_count >= ?');
        params.push(filters.minUsedPhaseCount);
      }
      if (filters.minUsedStationCount !== undefined) {
        conditions.push('used_station_count >= ?');
        params.push(filters.minUsedStationCount);
      }
      if (filters.maxStandardError !== undefined) {
        conditions.push('standard_error <= ?');
        params.push(filters.maxStandardError);
      }
      // Geographic bounds filtering
      if (filters.minLatitude !== undefined) {
        conditions.push('latitude >= ?');
        params.push(filters.minLatitude);
      }
      if (filters.maxLatitude !== undefined) {
        conditions.push('latitude <= ?');
        params.push(filters.maxLatitude);
      }
      if (filters.minLongitude !== undefined) {
        conditions.push('longitude >= ?');
        params.push(filters.minLongitude);
      }
      if (filters.maxLongitude !== undefined) {
        conditions.push('longitude <= ?');
        params.push(filters.maxLongitude);
      }

      const whereClause = conditions.join(' AND ');
      const query = `SELECT * FROM merged_events WHERE ${whereClause} ORDER BY time DESC`;

      return await dbAll(query, params) as MergedEvent[];
    },

    // Mapping template methods
    insertMappingTemplate: async (id: string, name: string, description: string | null, mappings: string): Promise<void> => {
      if (!id || !name || !mappings) {
        throw new Error('Missing required fields for mapping template');
      }

      await dbRun(
        `INSERT INTO mapping_templates (id, name, description, mappings) VALUES (?, ?, ?, ?)`,
        [id, name, description, mappings]
      );
    },

    getMappingTemplates: async (): Promise<MappingTemplate[]> => {
      return await dbAll(`SELECT * FROM mapping_templates ORDER BY created_at DESC`) as MappingTemplate[];
    },

    getMappingTemplateById: async (id: string): Promise<MappingTemplate | undefined> => {
      return await dbGet(`SELECT * FROM mapping_templates WHERE id = ?`, [id]) as MappingTemplate | undefined;
    },

    updateMappingTemplate: async (id: string, name: string, description: string | null, mappings: string): Promise<void> => {
      if (!id || !name || !mappings) {
        throw new Error('Missing required fields for mapping template');
      }

      await dbRun(
        `UPDATE mapping_templates SET name = ?, description = ?, mappings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [name, description, mappings, id]
      );
    },

    deleteMappingTemplate: async (id: string): Promise<void> => {
      if (!id) {
        throw new Error('Missing template ID');
      }

      await dbRun(`DELETE FROM mapping_templates WHERE id = ?`, [id]);
    },

    // GeoNet import methods
    getEventBySourceId: async (catalogueId: string, sourceId: string): Promise<MergedEvent | undefined> => {
      if (!catalogueId || !sourceId) {
        throw new Error('Missing catalogue ID or source ID');
      }

      const event = await dbGet(
        `SELECT * FROM merged_events WHERE catalogue_id = ? AND source_id = ?`,
        [catalogueId, sourceId]
      );

      return event as MergedEvent | undefined;
    },

    updateEvent: async (id: string, updates: Partial<MergedEvent>): Promise<void> => {
      if (!id) {
        throw new Error('Missing event ID');
      }

      const fields: string[] = [];
      const values: any[] = [];

      // Build dynamic UPDATE query based on provided fields
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fields.length === 0) {
        return; // Nothing to update
      }

      values.push(id);
      await dbRun(
        `UPDATE merged_events SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
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

      await dbRun(
        `INSERT INTO import_history (id, catalogue_id, start_time, end_time, total_fetched, new_events, updated_events, skipped_events, errors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, catalogueId, startTime, endTime, totalFetched, newEvents, updatedEvents, skippedEvents, errors]
      );
    },

    getImportHistory: async (catalogueId: string, limit: number = 10): Promise<ImportHistory[]> => {
      if (!catalogueId) {
        throw new Error('Missing catalogue ID');
      }

      const history = await dbAll(
        `SELECT * FROM import_history WHERE catalogue_id = ? ORDER BY created_at DESC LIMIT ?`,
        [catalogueId, limit]
      );

      return history as ImportHistory[];
    },

    searchEvents: async (query: string, limit: number, catalogueId?: string): Promise<any[]> => {
      if (!query || query.trim().length < 2) {
        return [];
      }

      const searchTerm = `%${query.trim()}%`;

      let sql = `
        SELECT
          e.id,
          e.catalogue_id,
          e.event_public_id as public_id,
          e.time,
          e.latitude,
          e.longitude,
          e.depth,
          e.magnitude,
          e.magnitude_type,
          e.event_type,
          c.name as catalogue_name
        FROM merged_events e
        LEFT JOIN merged_catalogues c ON e.catalogue_id = c.id
        WHERE (
          e.event_public_id LIKE ? OR
          e.event_type LIKE ? OR
          CAST(e.magnitude AS TEXT) LIKE ? OR
          e.id LIKE ?
        )
      `;

      const params: any[] = [searchTerm, searchTerm, searchTerm, searchTerm];

      if (catalogueId) {
        sql += ' AND e.catalogue_id = ?';
        params.push(catalogueId);
      }

      sql += ' ORDER BY e.time DESC LIMIT ?';
      params.push(limit);

      const results = await dbAll(sql, params);
      return results;
    }
  };
}

export { db as default, dbQueries };