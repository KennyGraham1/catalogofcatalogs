import { dbQueries, MergedEvent } from './db';
import type { ClientSession } from './mongodb';
import { createId } from './id';
import { calculateDistance, calculateTimeDifference } from './earthquake-utils';
import type { SourceCatalogue, MergeConfig } from './validation';
import type { QuakeMLEvent } from './types/quakeml';
import { extractBoundsFromEvents } from './geo-bounds-utils';

interface EventData {
  id?: string;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  magnitude: number;
  source: string;
  [key: string]: any;

  // QuakeML extended data
  quakeml?: QuakeMLEvent;
}

interface MergedEventData extends EventData {
  sourceEvents: Array<{
    catalogueId: string | number;
    source: string;
    originalData: EventData;
  }>;
}

// ============================================================================
// MERGE CONFLICT LOGGING
// ============================================================================

/**
 * Types of merge conflicts that can be detected
 */
export type MergeConflictType =
  | 'magnitude_range'      // Magnitude values differ too much
  | 'depth_range'          // Depth values differ too much
  | 'spatial_spread'       // Events spread over too large an area
  | 'group_size'           // Too many events matched together
  | 'time_inconsistency'   // Time values differ unexpectedly
  | 'network_mismatch'     // Different networks report very different values
  | 'validation_failed';   // General validation failure

/**
 * Severity levels for merge conflicts
 */
export type MergeConflictSeverity = 'info' | 'warning' | 'error';

/**
 * A merge conflict record for QC review
 */
export interface MergeConflict {
  id: string;
  type: MergeConflictType;
  severity: MergeConflictSeverity;
  message: string;
  details: {
    eventIds: string[];
    sources: string[];
    values?: Record<string, any>;
    threshold?: number;
    actualValue?: number;
    location?: { lat: number; lon: number };
    time?: string;
  };
  timestamp: string;
}

/**
 * Merge conflict log - accumulates conflicts during merge operation
 */
class MergeConflictLog {
  private conflicts: MergeConflict[] = [];
  private enabled: boolean = true;

  /**
   * Enable or disable conflict logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Log a merge conflict
   */
  log(
    type: MergeConflictType,
    severity: MergeConflictSeverity,
    message: string,
    details: MergeConflict['details']
  ): void {
    if (!this.enabled) return;

    const conflict: MergeConflict = {
      id: createId(),
      type,
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
    };

    this.conflicts.push(conflict);

    // Also log to console based on severity. Conflicts are always retained in
    // this.conflicts (and returned in the merge result), so console output is
    // supplementary and is suppressed during tests to keep the output clean.
    if (process.env.NODE_ENV !== 'test') {
      if (severity === 'error') {
        console.error(`[MergeConflict] ${type}: ${message}`, details);
      } else if (severity === 'warning') {
        console.warn(`[MergeConflict] ${type}: ${message}`);
      }
    }
  }

  /**
   * Get all logged conflicts
   */
  getConflicts(): MergeConflict[] {
    return [...this.conflicts];
  }

  /**
   * Get conflicts by type
   */
  getConflictsByType(type: MergeConflictType): MergeConflict[] {
    return this.conflicts.filter(c => c.type === type);
  }

  /**
   * Get conflicts by severity
   */
  getConflictsBySeverity(severity: MergeConflictSeverity): MergeConflict[] {
    return this.conflicts.filter(c => c.severity === severity);
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    total: number;
    byType: Record<MergeConflictType, number>;
    bySeverity: Record<MergeConflictSeverity, number>;
  } {
    const byType: Partial<Record<MergeConflictType, number>> = {};
    const bySeverity: Partial<Record<MergeConflictSeverity, number>> = {};

    for (const conflict of this.conflicts) {
      byType[conflict.type] = (byType[conflict.type] || 0) + 1;
      bySeverity[conflict.severity] = (bySeverity[conflict.severity] || 0) + 1;
    }

    return {
      total: this.conflicts.length,
      byType: byType as Record<MergeConflictType, number>,
      bySeverity: bySeverity as Record<MergeConflictSeverity, number>,
    };
  }

  /**
   * Clear all logged conflicts
   */
  clear(): void {
    this.conflicts = [];
  }

  /**
   * Export conflicts as JSON
   */
  toJSON(): string {
    return JSON.stringify({
      conflicts: this.conflicts,
      summary: this.getSummary(),
    }, null, 2);
  }
}

// Global conflict log instance
const mergeConflictLog = new MergeConflictLog();

/**
 * Get the global merge conflict log
 */
export function getMergeConflictLog(): MergeConflictLog {
  return mergeConflictLog;
}

/**
 * Merge multiple earthquake catalogues based on spatial and temporal matching
 * Uses database transactions to ensure atomicity
 */
export async function mergeCatalogues(
  name: string,
  sourceCatalogues: SourceCatalogue[],
  config: MergeConfig,
  metadata?: any,
  exportOnly: boolean = false
) {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }

  const catalogueId = createId();

  // If export-only mode, don't use transactions
  if (exportOnly) {
    return await executeMergeOperation(catalogueId, name, sourceCatalogues, config, metadata, exportOnly);
  }

  // Use transaction for database writes
  try {
    return await dbQueries.transaction(async (session) => {
      return await executeMergeOperation(
        catalogueId,
        name,
        sourceCatalogues,
        config,
        metadata,
        exportOnly,
        session
      );
    });
  } catch (error) {
    console.error('[Merge] Transaction failed, changes rolled back:', error);
    throw error;
  }
}

/**
 * Extract all event fields from a MergedEventData object for storage or export.
 *
 * Produces a flat record with the same shape as a MergedEvent database row
 * (minus catalogue_id and id, which are caller-supplied).  Used by both the
 * DB-save path and the export-only path so they always return identical field sets.
 * Every optional field is null-normalised so consumers never see `undefined`.
 */
function buildMergedEventFields(
  event: MergedEventData,
  optionalFields: ReadonlyArray<string>
): Record<string, unknown> {
  const quakeml = event.quakeml;
  const preferredOrigin = quakeml?.origins?.find(o => o.publicID === quakeml.preferredOriginID) || quakeml?.origins?.[0];
  const preferredMagnitude = quakeml?.magnitudes?.find(m => m.publicID === quakeml.preferredMagnitudeID) || quakeml?.magnitudes?.[0];

  const fields: Record<string, unknown> = {
    time: event.time,
    latitude: event.latitude,
    longitude: event.longitude,
    depth: event.depth ?? null,
    magnitude: event.magnitude,
    source_events: JSON.stringify(event.sourceEvents),
  };

  // Copy flat optional fields from the event object first.
  // When merging events that were previously saved to (or fetched from) the DB,
  // the raw QuakeMLEvent is NOT stored — only the extracted flat columns are
  // (e.g. latitude_uncertainty, agency_id).  In that case event.quakeml is
  // always undefined, so without this copy the quakeml block below is never
  // reached and every optional field is wiped to null.  The quakeml block below
  // may override individual fields with re-extracted values when the in-memory
  // QuakeMLEvent is available (i.e. on first export-only merge before any DB write).
  for (const field of optionalFields) {
    const val = (event as any)[field];
    if (val !== undefined && val !== null) {
      fields[field] = val;
    }
  }

  if (quakeml) {
    fields.event_public_id = quakeml.publicID;
    fields.event_type = quakeml.type;
    fields.event_type_certainty = quakeml.typeCertainty;

    if (preferredOrigin) {
      // Uncertainties. QuakeML BED: depth.uncertainty and horizontalUncertainty are in metres;
      // DB stores lengths in km (see lib/quakeml-to-db.ts), angular uncertainties in degrees, time in seconds.
      fields.time_uncertainty = preferredOrigin.time.uncertainty;
      fields.latitude_uncertainty = preferredOrigin.latitude.uncertainty;
      fields.longitude_uncertainty = preferredOrigin.longitude.uncertainty;
      fields.depth_uncertainty = preferredOrigin.depth?.uncertainty != null
        ? preferredOrigin.depth.uncertainty / 1000
        : undefined;
      if (preferredOrigin.uncertainty?.horizontalUncertainty) {
        fields.horizontal_uncertainty = preferredOrigin.uncertainty.horizontalUncertainty / 1000;
      }

      // Origin metadata
      fields.depth_type = preferredOrigin.depthType;
      fields.earth_model_id = preferredOrigin.earthModelID;
      fields.method_id = preferredOrigin.methodID;
      fields.region = preferredOrigin.region;

      if (preferredOrigin.creationInfo) {
        fields.agency_id = preferredOrigin.creationInfo.agencyID;
        fields.author = preferredOrigin.creationInfo.author;
      }

      // Quality metrics
      if (preferredOrigin.quality) {
        fields.azimuthal_gap = preferredOrigin.quality.azimuthalGap;
        fields.used_phase_count = preferredOrigin.quality.usedPhaseCount;
        fields.used_station_count = preferredOrigin.quality.usedStationCount;
        fields.standard_error = preferredOrigin.quality.standardError;
        fields.minimum_distance = preferredOrigin.quality.minimumDistance;
        fields.maximum_distance = preferredOrigin.quality.maximumDistance;
        fields.associated_phase_count = preferredOrigin.quality.associatedPhaseCount;
        fields.associated_station_count = preferredOrigin.quality.associatedStationCount;
        fields.depth_phase_count = preferredOrigin.quality.depthPhaseCount;
        fields.origin_quality = JSON.stringify(preferredOrigin.quality);
      }

      fields.evaluation_mode = preferredOrigin.evaluationMode;
      fields.evaluation_status = preferredOrigin.evaluationStatus;
    }

    if (preferredMagnitude) {
      fields.magnitude_type = preferredMagnitude.type;
      fields.magnitude_uncertainty = preferredMagnitude.mag.uncertainty;
      fields.magnitude_station_count = preferredMagnitude.stationCount;
      fields.magnitude_method_id = preferredMagnitude.methodID;
      fields.magnitude_evaluation_mode = preferredMagnitude.evaluationMode;
      fields.magnitude_evaluation_status = preferredMagnitude.evaluationStatus;
    }

    // Complex nested data as JSON strings
    if (quakeml.origins?.length) fields.origins = JSON.stringify(quakeml.origins);
    if (quakeml.magnitudes?.length) fields.magnitudes = JSON.stringify(quakeml.magnitudes);
    if (quakeml.picks?.length) fields.picks = JSON.stringify(quakeml.picks);
    if ((quakeml as any).arrivals?.length) fields.arrivals = JSON.stringify((quakeml as any).arrivals);
    if (quakeml.focalMechanisms?.length) fields.focal_mechanisms = JSON.stringify(quakeml.focalMechanisms);
    if (quakeml.amplitudes?.length) fields.amplitudes = JSON.stringify(quakeml.amplitudes);
    if (quakeml.stationMagnitudes?.length) fields.station_magnitudes = JSON.stringify(quakeml.stationMagnitudes);
    if (quakeml.description?.length) fields.event_descriptions = JSON.stringify(quakeml.description);
    if (quakeml.comment?.length) fields.comments = JSON.stringify(quakeml.comment);
    if (quakeml.creationInfo) fields.creation_info = JSON.stringify(quakeml.creationInfo);
  }

  // Null-normalise every optional field so consumers never see `undefined`.
  for (const field of optionalFields) {
    if (fields[field] === undefined) {
      fields[field] = null;
    }
  }

  return fields;
}

/**
 * Internal merge operation implementation
 * Performs the actual merge logic with database writes
 */
async function executeMergeOperation(
  catalogueId: string,
  name: string,
  sourceCatalogues: SourceCatalogue[],
  config: MergeConfig,
  metadata?: any,
  exportOnly: boolean = false,
  session?: ClientSession
) {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }

  // Reset the conflict log so getMergeConflictLog() always reflects this operation only.
  // (Node.js is single-threaded for JS execution, so this is safe for sequential requests;
  //  concurrent async merge calls would still interleave — avoid that at the call site.)
  mergeConflictLog.clear();

  try {
    // Insert the merged catalogue record (skip if export-only mode)
    if (!exportOnly) {
      // Prepare metadata for database
      const dbMetadata: any = {};

      if (metadata) {
        // Map merge metadata fields
        if (metadata.merge_description) dbMetadata.merge_description = metadata.merge_description;
        if (metadata.merge_use_case) dbMetadata.merge_use_case = metadata.merge_use_case;
        if (metadata.merge_methodology) dbMetadata.merge_methodology = metadata.merge_methodology;
        if (metadata.merge_quality_assessment) dbMetadata.merge_quality_assessment = metadata.merge_quality_assessment;

        // Map other metadata fields if present
        if (metadata.description) dbMetadata.description = metadata.description;
        if (metadata.data_source) dbMetadata.data_source = metadata.data_source;
        if (metadata.provider) dbMetadata.provider = metadata.provider;
        if (metadata.geographic_region) dbMetadata.geographic_region = metadata.geographic_region;
        if (metadata.data_quality) dbMetadata.data_quality = JSON.stringify(metadata.data_quality);
        if (metadata.quality_notes) dbMetadata.quality_notes = metadata.quality_notes;
        if (metadata.keywords) dbMetadata.keywords = JSON.stringify(metadata.keywords);
        if (metadata.reference_links) dbMetadata.reference_links = JSON.stringify(metadata.reference_links);
        if (metadata.notes) dbMetadata.notes = metadata.notes;
      }

      await dbQueries.insertCatalogue(
        catalogueId,
        name,
        JSON.stringify(sourceCatalogues),
        JSON.stringify(config),
        0,
        'processing',
        dbMetadata,
        session
      );
    }

    // Fetch events from all source catalogues
    const allEvents: EventData[] = [];

    // Fetch events from each source catalogue
    for (const catalogue of sourceCatalogues) {
      if (!dbQueries) {
        throw new Error('Database not initialized');
      }

      const catalogueIdStr = String(catalogue.id);
      const events = await dbQueries.getEventsByCatalogueId(catalogueIdStr);
      const eventsArray = Array.isArray(events) ? events : events.data || [];

      allEvents.push(...eventsArray.map(e => ({
        ...e,
        source: catalogue.source || catalogue.name || 'unknown',
        catalogueId: catalogueIdStr,
      } as EventData)));
    }

    // Perform the merge
    const mergedEvents = performMerge(allEvents, config);

    // Optional MergedEvent fields — declared once to avoid per-event allocation.
    const OPTIONAL_DB_FIELDS: ReadonlyArray<string> = [
      'source_id', 'region', 'location_name',
      'event_public_id', 'event_type', 'event_type_certainty',
      'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
      'depth_uncertainty', 'horizontal_uncertainty',
      'depth_type', 'earth_model_id', 'method_id',
      'agency_id', 'author',
      'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count',
      'magnitude_method_id', 'magnitude_evaluation_mode', 'magnitude_evaluation_status',
      'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
      'minimum_distance', 'maximum_distance',
      'associated_phase_count', 'associated_station_count', 'depth_phase_count',
      'evaluation_mode', 'evaluation_status',
      'preferred_origin_id', 'preferred_magnitude_id',
      'origin_quality', 'origins', 'magnitudes', 'picks', 'arrivals',
      'focal_mechanisms', 'amplitudes', 'station_magnitudes',
      'event_descriptions', 'comments', 'creation_info',
    ];

    // If export-only mode, return full event records without saving to database.
    // Uses the same field extraction as the DB save path so exports contain all
    // available QuakeML/rich fields — not just the 7-field minimal shape.
    if (exportOnly) {
      return {
        success: true,
        catalogueId: null,
        eventCount: mergedEvents.length,
        originalEventCount: allEvents.length,
        events: mergedEvents.map(e => ({
          id: e.id || createId(),
          ...buildMergedEventFields(e, OPTIONAL_DB_FIELDS),
        })),
      };
    }

    // Build all events for bulk insert (Performance Optimization)
    // This avoids calling insertEvent individually for each event,
    // which was causing repeated cache invalidation calls (N calls for N events).
    // Using bulkInsertEvents inserts all events at once and only invalidates cache once.
    const dbEvents: Array<Partial<MergedEvent> & {
      id: string;
      catalogue_id: string;
      time: string;
      latitude: number;
      longitude: number;
      magnitude: number;
      source_events: string;
    }> = [];

    for (const event of mergedEvents) {
      dbEvents.push({
        id: createId(),
        catalogue_id: catalogueId,
        ...buildMergedEventFields(event, OPTIONAL_DB_FIELDS),
      } as any);
    }

    // Bulk insert all events at once (Performance Optimization)
    // This is much faster than individual inserts and only triggers cache invalidation once
    if (dbEvents.length > 0) {
      await dbQueries.bulkInsertEvents(dbEvents, session);
    }

    // Extract and update geographic bounds
    const bounds = extractBoundsFromEvents(mergedEvents);
    if (bounds) {
      await dbQueries.updateCatalogueGeoBounds(
        catalogueId,
        bounds.minLatitude,
        bounds.maxLatitude,
        bounds.minLongitude,
        bounds.maxLongitude,
        session
      );
    }

    // Update catalogue with event count and status
    await dbQueries.updateCatalogueEventCount(catalogueId, mergedEvents.length, session);
    await dbQueries.updateCatalogueStatus('complete', catalogueId, session);

    return {
      success: true,
      catalogueId,
      eventCount: mergedEvents.length,
      originalEventCount: allEvents.length
    };
  } catch (error) {
    // In the transactional (non-export) path this runs INSIDE the open transaction, and the
    // catalogue row was inserted in that same uncommitted transaction. A non-session
    // updateCatalogueStatus here would match zero rows (a silent no-op) and could itself
    // throw and mask the original error, and the subsequent re-throw rolls the whole
    // transaction back anyway — so a failed merge correctly leaves no partial catalogue.
    // Just propagate the original error.
    throw error;
  }
}

/**
 * Performance Optimization: Spatial index for fast geographic lookups
 *
 * Creates a grid-based spatial index to reduce the search space from O(n²) to O(n log n).
 * Each grid cell is approximately distanceThreshold x distanceThreshold in size.
 */
interface SpatialIndex {
  grid: Map<string, number[]>; // grid key -> event indices
  cellSize: number; // degrees
}

/**
 * Normalize longitude to [-180, 180] range
 * Handles International Date Line wrapping
 *
 * @param lon - Longitude in degrees
 * @returns Normalized longitude in [-180, 180]
 */
function normalizeLongitude(lon: number): number {
  // Normalize to [-180, 180]
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

/**
 * Create a spatial index for events
 * Grid cell size is calculated based on distance threshold (converted to degrees)
 *
 * IMPROVEMENT (Issue #4): Latitude-aware cell sizing for better performance at high latitudes
 * Uses more accurate conversion factor and adjusts for latitude compression
 *
 * @param events - Array of earthquake events to index
 * @param distanceThresholdKm - Distance threshold in kilometers
 * @returns Spatial index with grid and cell size
 */
function createSpatialIndex(events: EventData[], distanceThresholdKm: number): SpatialIndex {
  // Guard against empty events array to prevent NaN
  if (events.length === 0) {
    return { grid: new Map(), cellSize: 0.5 }; // Default cell size of 0.5 degrees (~55km)
  }

  // Calculate average latitude for better cell size estimation
  const avgLat = events.reduce((sum, e) => sum + Math.abs(e.latitude), 0) / events.length;

  // Adjust for latitude: degrees longitude = degrees latitude * cos(latitude)
  // At equator: 1° ≈ 111.32 km
  // At 60° latitude: 1° longitude ≈ 55.66 km
  const latFactor = Math.cos(avgLat * Math.PI / 180);
  const kmPerDegreeLat = 111.32; // More accurate constant than 111
  const kmPerDegreeLon = 111.32 * latFactor;

  // Use smaller of lat/lon cell sizes for conservative indexing
  const cellSizeLat = distanceThresholdKm / kmPerDegreeLat;
  const cellSizeLon = distanceThresholdKm / kmPerDegreeLon;
  const cellSize = Math.max(0.05, Math.min(cellSizeLat, cellSizeLon));

  const grid = new Map<string, number[]>();

  events.forEach((event, index) => {
    const gridKey = getGridKey(event.latitude, event.longitude, cellSize);
    const cell = grid.get(gridKey) || [];
    cell.push(index);
    grid.set(gridKey, cell);
  });

  return { grid, cellSize };
}

// ============================================================================
// HIERARCHICAL SPATIAL INDEX (R-TREE-LIKE)
// ============================================================================

/**
 * Bounding box for spatial queries
 */
interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Node in the hierarchical spatial index
 */
interface HierarchicalNode {
  bounds: BoundingBox;
  eventIndices: number[];
  children: HierarchicalNode[];
  level: number;
}

/**
 * Hierarchical spatial index for very large catalogues
 * Provides R-tree-like performance without external dependencies
 */
interface HierarchicalSpatialIndex {
  root: HierarchicalNode;
  maxEventsPerNode: number;
  maxDepth: number;
  totalEvents: number;
}

/**
 * Check if two bounding boxes intersect
 */
function boxesIntersect(a: BoundingBox, b: BoundingBox): boolean {
  // Handle date line crossing for longitude
  const aSpansDateLine = a.minLon > a.maxLon;
  const bSpansDateLine = b.minLon > b.maxLon;

  // Latitude check is straightforward
  if (a.maxLat < b.minLat || a.minLat > b.maxLat) {
    return false;
  }

  // Longitude check with date line handling
  if (!aSpansDateLine && !bSpansDateLine) {
    // Neither spans date line
    return !(a.maxLon < b.minLon || a.minLon > b.maxLon);
  } else if (aSpansDateLine && bSpansDateLine) {
    // Both span date line - they must intersect
    return true;
  } else {
    // One spans date line
    const spanning = aSpansDateLine ? a : b;
    const normal = aSpansDateLine ? b : a;
    return normal.maxLon >= spanning.minLon || normal.minLon <= spanning.maxLon;
  }
}

/**
 * Create a bounding box that contains a point with a given radius
 */
function createSearchBox(lat: number, lon: number, radiusKm: number): BoundingBox {
  const kmPerDegreeLat = 111.32;
  const kmPerDegreeLon = 111.32 * Math.cos(lat * Math.PI / 180);

  const latDelta = radiusKm / kmPerDegreeLat;
  const lonDelta = radiusKm / Math.max(kmPerDegreeLon, 0.01); // Avoid division by zero near poles

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: normalizeLongitude(lon - lonDelta),
    maxLon: normalizeLongitude(lon + lonDelta),
  };
}

/**
 * Create a hierarchical spatial index for efficient range queries
 *
 * This provides R-tree-like performance for very large catalogues:
 * - O(log n) query time instead of O(n) for grid-based index
 * - Better handling of clustered data
 * - Efficient for range queries with varying radii
 *
 * @param events - Array of events to index
 * @param maxEventsPerNode - Maximum events before splitting (default: 100)
 * @param maxDepth - Maximum tree depth (default: 10)
 */
function createHierarchicalIndex(
  events: EventData[],
  maxEventsPerNode: number = 100,
  maxDepth: number = 10
): HierarchicalSpatialIndex {
  if (events.length === 0) {
    return {
      root: {
        bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 },
        eventIndices: [],
        children: [],
        level: 0,
      },
      maxEventsPerNode,
      maxDepth,
      totalEvents: 0,
    };
  }

  // Calculate global bounds
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const event of events) {
    minLat = Math.min(minLat, event.latitude);
    maxLat = Math.max(maxLat, event.latitude);
    minLon = Math.min(minLon, event.longitude);
    maxLon = Math.max(maxLon, event.longitude);
  }

  const root: HierarchicalNode = {
    bounds: { minLat, maxLat, minLon, maxLon },
    eventIndices: events.map((_, i) => i),
    children: [],
    level: 0,
  };

  // Recursively split nodes that exceed the threshold
  splitNode(root, events, maxEventsPerNode, maxDepth);

  return { root, maxEventsPerNode, maxDepth, totalEvents: events.length };
}

/**
 * Recursively split a node if it has too many events
 */
function splitNode(
  node: HierarchicalNode,
  events: EventData[],
  maxEventsPerNode: number,
  maxDepth: number
): void {
  // Don't split if under threshold or at max depth
  if (node.eventIndices.length <= maxEventsPerNode || node.level >= maxDepth) {
    return;
  }

  const { minLat, maxLat, minLon, maxLon } = node.bounds;
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;

  // Create 4 child nodes (quadtree-style split)
  const childBounds: BoundingBox[] = [
    { minLat, maxLat: midLat, minLon, maxLon: midLon },       // SW
    { minLat, maxLat: midLat, minLon: midLon, maxLon },       // SE
    { minLat: midLat, maxLat, minLon, maxLon: midLon },       // NW
    { minLat: midLat, maxLat, minLon: midLon, maxLon },       // NE
  ];

  for (const bounds of childBounds) {
    // Use half-open intervals [min, mid) for the lower quadrants and [mid, max] for the
    // upper quadrants.  The strict `< bounds.maxLat/Lon` check previously dropped events
    // whose coordinate exactly equalled the node's maximum boundary — they were assigned
    // to no child and silently lost when eventIndices was cleared below.
    // The fix: when a child's upper bound matches the *parent's* upper bound, use `<=`
    // (inclusive) so those boundary events are captured by the upper-bound child.
    const childIndices = node.eventIndices.filter(i => {
      const e = events[i];
      const latOk = e.latitude >= bounds.minLat &&
        (bounds.maxLat === maxLat ? e.latitude <= bounds.maxLat : e.latitude < bounds.maxLat);
      const lonOk = e.longitude >= bounds.minLon &&
        (bounds.maxLon === maxLon ? e.longitude <= bounds.maxLon : e.longitude < bounds.maxLon);
      return latOk && lonOk;
    });

    if (childIndices.length > 0) {
      const child: HierarchicalNode = {
        bounds,
        eventIndices: childIndices,
        children: [],
        level: node.level + 1,
      };
      node.children.push(child);
      splitNode(child, events, maxEventsPerNode, maxDepth);
    }
  }

  // Clear event indices from non-leaf nodes to save memory
  if (node.children.length > 0) {
    node.eventIndices = [];
  }
}

/**
 * Query the hierarchical index for events within a bounding box
 */
function queryHierarchicalIndex(
  index: HierarchicalSpatialIndex,
  searchBox: BoundingBox
): number[] {
  const results: number[] = [];
  queryNode(index.root, searchBox, results);
  return results;
}

/**
 * Recursively query a node and its children
 */
function queryNode(
  node: HierarchicalNode,
  searchBox: BoundingBox,
  results: number[]
): void {
  if (!boxesIntersect(node.bounds, searchBox)) {
    return;
  }

  // If leaf node, add all event indices
  if (node.children.length === 0) {
    results.push(...node.eventIndices);
    return;
  }

  // Otherwise, recurse into children
  for (const child of node.children) {
    queryNode(child, searchBox, results);
  }
}

/**
 * Get statistics about the hierarchical index
 */
function getHierarchicalIndexStats(index: HierarchicalSpatialIndex): {
  totalNodes: number;
  leafNodes: number;
  maxDepth: number;
  avgEventsPerLeaf: number;
} {
  let totalNodes = 0;
  let leafNodes = 0;
  let maxDepth = 0;
  let totalEventsInLeaves = 0;

  function traverse(node: HierarchicalNode): void {
    totalNodes++;
    maxDepth = Math.max(maxDepth, node.level);

    if (node.children.length === 0) {
      leafNodes++;
      totalEventsInLeaves += node.eventIndices.length;
    } else {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(index.root);

  return {
    totalNodes,
    leafNodes,
    maxDepth,
    avgEventsPerLeaf: leafNodes > 0 ? totalEventsInLeaves / leafNodes : 0,
  };
}

/**
 * Get grid cell key for a coordinate
 *
 * IMPROVEMENT (Issue #5): Handles International Date Line wrapping
 * Normalizes longitude to [-180, 180] before calculating cell key
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param cellSize - Cell size in degrees
 * @returns Grid cell key as "latCell,lonCell"
 */
function getGridKey(lat: number, lon: number, cellSize: number): string {
  const normalizedLon = normalizeLongitude(lon);
  const latCell = Math.floor(lat / cellSize);
  const lonCell = Math.floor(normalizedLon / cellSize);
  return `${latCell},${lonCell}`;
}

/**
 * Get all grid cells within distance threshold of a point.
 *
 * IMPROVEMENT (Issue #5): Handles International Date Line wrapping.
 * IMPROVEMENT (Issue #1): Accepts radiusCells so callers can widen the search
 * neighbourhood for large/deep events whose adaptive threshold exceeds one cell width.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param cellSize - Cell size in degrees
 * @param radiusCells - How many cells to extend in each direction (default 1 → 3×3 grid)
 * @returns Array of grid cell keys
 */
function getNearbyCells(lat: number, lon: number, cellSize: number, radiusCells: number = 1): string[] {
  const normalizedLon = normalizeLongitude(lon);
  const centerLatCell = Math.floor(lat / cellSize);
  const centerLonCell = Math.floor(normalizedLon / cellSize);

  // Storage keys are getGridKey(lon) = floor(normalizeLongitude(lon) / cellSize) for
  // normLon in [-180, 180), so valid longitude-cell indices live in [minLonCell, maxLonCell].
  const minLonCell = Math.floor(-180 / cellSize);
  const maxLonCell = Math.floor((180 - 1e-9) / cellSize);
  const lonCellCount = maxLonCell - minLonCell + 1; // # of storage lon cells over the full circle

  // Collect the longitude-cell indices, wrapping across the ±180 antimeridian in
  // storage-cell-index space (not by an integer 360/cellSize step, which is wrong
  // whenever cellSize does not divide 360° evenly).
  const lonKeys = new Set<number>();
  for (let lonOffset = -radiusCells; lonOffset <= radiusCells; lonOffset++) {
    let lonCell = centerLonCell + lonOffset;
    while (lonCell > maxLonCell) lonCell -= lonCellCount;
    while (lonCell < minLonCell) lonCell += lonCellCount;
    lonKeys.add(lonCell);
  }

  // The discrete cell-index wrap above can skip the narrow "remainder" cell that
  // straddles ±180 (its width is 360° mod cellSize, often << cellSize). When the
  // neighbourhood reaches the seam, over-include both seam-edge cells; the exact
  // distance re-check in eventsMatchAdaptive discards any false candidates. This is
  // the fix for trans-antimeridian NZ duplicates (Kermadec/Chatham near ±180).
  if (centerLonCell - radiusCells <= minLonCell || centerLonCell + radiusCells >= maxLonCell) {
    lonKeys.add(minLonCell);
    lonKeys.add(maxLonCell);
  }

  const cells: string[] = [];
  const lonKeyList = Array.from(lonKeys);
  for (let latOffset = -radiusCells; latOffset <= radiusCells; latOffset++) {
    const latCell = centerLatCell + latOffset;
    for (const lonCell of lonKeyList) {
      cells.push(`${latCell},${lonCell}`);
    }
  }

  return cells;
}

/**
 * Get magnitude-based multiplier for distance threshold
 *
 * Based on ISC-GEM and seismological best practices:
 * - Small events (M < 4.0): 1.0x - use config value as-is
 * - Medium events (M 4.0-5.5): 1.5x - regional events need more tolerance
 * - Large events (M 5.5-7.0): 2.5x - teleseismic events
 * - Very large events (M > 7.0): 4.0x - major events with larger uncertainties
 *
 * @param magnitude - Event magnitude
 * @returns Multiplier to apply to config distance threshold
 */
// Upper bounds of the adaptive multipliers, used to size the spatial candidate
// neighbourhood so it always covers the widest threshold eventsMatchAdaptive can accept.
const MAX_DISTANCE_MULTIPLIER = 4.0;
const MAX_DEPTH_MULTIPLIER = 1.5;

function getDistanceMultiplier(magnitude: number): number {
  // Guard non-finite magnitude (null coerces to 0, undefined to NaN): fall back to the
  // base threshold rather than the max else-branch, which would over-widen matching.
  if (!Number.isFinite(magnitude)) {
    return 1.0;
  }
  if (magnitude < 4.0) {
    return 1.0; // Use config value as-is for small events
  } else if (magnitude < 5.5) {
    return 1.5; // 50% increase for medium events
  } else if (magnitude < 7.0) {
    return 2.5; // 150% increase for large events
  } else {
    return 4.0; // 300% increase for very large events
  }
}

/**
 * Get depth-based multiplier for distance threshold
 *
 * Deep events have larger location uncertainties:
 * - Shallow (< 100 km): 1.0x
 * - Intermediate (100-300 km): 1.2x
 * - Deep (> 300 km): 1.5x
 *
 * @param depth - Event depth in km (null if unknown)
 * @returns Multiplier to apply to distance threshold
 */
function getDepthMultiplier(depth: number | null | undefined): number {
  if (depth == null || !Number.isFinite(depth)) {
    return 1.0; // No adjustment if depth unknown
  }
  if (depth > 300) {
    return 1.5; // 50% increase for deep events
  } else if (depth > 100) {
    return 1.2; // 20% increase for intermediate depth
  }
  return 1.0;
}

/**
 * Get magnitude-based multiplier for time threshold
 *
 * Based on ISC-GEM and international seismic network practices:
 * - Small events (M < 4.0): 1.0x - local events reported quickly
 * - Medium events (M 4.0-5.5): 1.5x - regional events
 * - Large events (M 5.5-7.0): 2.0x - teleseismic events
 * - Very large events (M > 7.0): 3.0x - major events with many reports
 *
 * @param magnitude - Event magnitude
 * @returns Multiplier to apply to config time threshold
 */
function getTimeMultiplier(magnitude: number): number {
  if (!Number.isFinite(magnitude)) {
    return 1.0; // Base threshold for unknown magnitude (avoid the max else-branch)
  }
  if (magnitude < 4.0) {
    return 1.0; // Use config value as-is for small events
  } else if (magnitude < 5.5) {
    return 1.5; // 50% increase for medium events
  } else if (magnitude < 7.0) {
    return 2.0; // 100% increase for large events
  } else {
    return 3.0; // 200% increase for very large events
  }
}

/**
 * Check if two events match using adaptive thresholds
 *
 * Uses user-configured thresholds as baselines and applies magnitude/depth-based
 * multipliers for larger events. This ensures:
 * 1. User configuration is always respected as the minimum threshold
 * 2. Larger events get appropriately larger thresholds based on seismological practice
 *
 * @param event1 - First event
 * @param event2 - Second event
 * @param configTimeThreshold - Base time threshold from config (seconds)
 * @param configDistanceThreshold - Base distance threshold from config (km)
 * @returns True if events match
 */
function eventsMatchAdaptive(
  event1: EventData,
  event2: EventData,
  configTimeThreshold: number,
  configDistanceThreshold: number
): boolean {
  // Use average magnitude for threshold calculation. Only average over finite
  // magnitudes: at runtime `magnitude` can be null (coerces to 0) or undefined
  // (coerces to NaN), either of which would corrupt the adaptive widening — a null
  // paired with a real M7 would deflate the average to 3.5 and defeat the widening,
  // while an undefined would poison it to NaN. Falling back to the known magnitude
  // (or 0 when neither is known) keeps the threshold conservative and finite.
  const finiteMags = [event1.magnitude, event2.magnitude].filter(m => Number.isFinite(m));
  const avgMagnitude = finiteMags.length > 0
    ? finiteMags.reduce((sum, m) => sum + m, 0) / finiteMags.length
    : 0;

  // Use maximum depth for conservative threshold (if both have finite depth)
  const finiteDepths = [event1.depth, event2.depth].filter(
    (d): d is number => d != null && Number.isFinite(d)
  );
  const maxDepth: number | null = finiteDepths.length > 0 ? Math.max(...finiteDepths) : null;

  // Calculate adaptive thresholds using config values as baselines
  // Apply magnitude and depth multipliers
  const timeMultiplier = getTimeMultiplier(avgMagnitude);
  const distanceMultiplier = getDistanceMultiplier(avgMagnitude);
  const depthMultiplier = getDepthMultiplier(maxDepth);

  const effectiveTimeThreshold = configTimeThreshold * timeMultiplier;
  const effectiveDistanceThreshold = configDistanceThreshold * distanceMultiplier * depthMultiplier;

  // Calculate actual differences
  const timeDiff = calculateTimeDifference(event1.time, event2.time);
  const distance = calculateDistance(
    event1.latitude,
    event1.longitude,
    event2.latitude,
    event2.longitude
  );

  return timeDiff <= effectiveTimeThreshold && distance <= effectiveDistanceThreshold;
}

/**
 * IMPROVEMENT (Issue #9): Re-group events from a failed validation group.
 *
 * When a group fails validateEventGroup (e.g. one outlier pushes the magnitude range
 * over threshold), the previous behaviour turned every event into a singleton, losing
 * valid cross-catalogue duplicates that happened to share the group with the outlier.
 *
 * This function runs a one-level greedy pairwise match strictly within the failed group:
 * - Two events in the group are paired if eventsMatchAdaptive returns true.
 * - Each resulting sub-group is validated; if it passes it is kept as a merge group.
 * - Sub-groups that still fail validation, and any unmatched events, become singletons.
 *
 * @param events - Events from the failed group (already known to co-locate)
 * @param config - Merge configuration
 * @returns Array of sub-groups (each sub-group is an array of 1+ events to merge together)
 */
function regroupFailedEvents(events: EventData[], config: MergeConfig): EventData[][] {
  const n = events.length;

  // Build an adjacency list: edge[i] contains all j>i where events match.
  // This avoids the transitivity problem of a greedy left-to-right sweep: A may
  // match B and B may match C without A matching C; each must be seeded as its
  // own group anchor so the correct pairings are found regardless of order.
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (eventsMatchAdaptive(events[i], events[j], config.timeThreshold, config.distanceThreshold)) {
        adj[i].add(j);
        adj[j].add(i);
      }
    }
  }

  // Connected-components via BFS — each component is a maximally connected sub-group.
  const visited = new Set<number>();
  const result: EventData[][] = [];

  for (let start = 0; start < n; start++) {
    if (visited.has(start)) continue;

    const component: number[] = [];
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const neighbour of Array.from(adj[cur])) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    const group = component.map(i => events[i]);
    if (group.length === 1 || validateEventGroup(group)) {
      result.push(group);
    } else {
      // Sub-group still invalid — emit each as a singleton rather than recursing
      for (const e of group) {
        result.push([e]);
      }
    }
  }

  return result;
}

/**
 * A group of events that will be merged into a single output event.
 */
interface MatchGroup {
  events: EventData[];
  // True when this group is the product of splitting a parent group that failed
  // validateEventGroup (via regroupFailedEvents). Surfaced by the preview so the QC
  // panel can flag salvaged/separated clusters.
  regrouped: boolean;
}

/**
 * Core matching + grouping shared by BOTH the persist path (performMerge) and the
 * preview path (performMergeWithGroups). Extracting it guarantees the QC preview and
 * the saved catalogue group events identically — previously the two were copy-pasted
 * and had silently diverged (only the persist path split validation-failing groups).
 *
 * Algorithm: pre-compute timestamps, sort by time, build a spatial index, then for each
 * unprocessed event gather nearby candidates, apply adaptive time/distance matching, and
 * route any group that fails validateEventGroup through regroupFailedEvents (splitting it
 * into valid sub-groups + singletons).
 *
 * Performance: spatial indexing keeps this ~O(n log n) instead of O(n²).
 */
function groupMatchingEvents(events: EventData[], config: MergeConfig): MatchGroup[] {
  const groups: MatchGroup[] = [];
  const processedIndices = new Set<number>();

  // Pre-compute timestamps once to avoid repeated date parsing during sort.
  const eventsWithTimestamps = events.map(e => ({
    ...e,
    _timestamp: new Date(e.time).getTime(),
  }));
  const sortedEvents = eventsWithTimestamps.sort((a, b) => a._timestamp - b._timestamp);

  const spatialIndex = createSpatialIndex(sortedEvents, config.distanceThreshold);

  // Size the candidate neighbourhood to cover the widest effective distance threshold
  // ANY pair can be accepted at — the GLOBAL max multipliers, not just the anchor's.
  // A small/shallow anchor processed first would otherwise miss a large/deep duplicate
  // that eventsMatchAdaptive (which uses the pair's avg magnitude / max depth) accepts.
  // Also widen the longitude reach by 1/cos(lat): the grid cell is keyed to the tighter
  // latitude axis, so one cell spans fewer km E-W than N-S. Computed once for the index.
  const avgLatDeg = sortedEvents.length
    ? sortedEvents.reduce((sum, e) => sum + Math.abs(e.latitude), 0) / sortedEvents.length
    : 0;
  const lonCoverageFactor = 1 / Math.max(Math.cos((avgLatDeg * Math.PI) / 180), 0.1);
  const distCells = Math.max(
    1,
    Math.ceil(MAX_DISTANCE_MULTIPLIER * MAX_DEPTH_MULTIPLIER * lonCoverageFactor)
  );

  for (let i = 0; i < sortedEvents.length; i++) {
    if (processedIndices.has(i)) continue;

    const currentEvent = sortedEvents[i];
    const matchingEvents: EventData[] = [currentEvent];
    processedIndices.add(i);

    const nearbyCells = getNearbyCells(
      currentEvent.latitude,
      currentEvent.longitude,
      spatialIndex.cellSize,
      distCells
    );

    const candidateIndices = new Set<number>();
    for (const cellKey of nearbyCells) {
      const cellIndices = spatialIndex.grid.get(cellKey) || [];
      for (const idx of cellIndices) {
        if (idx > i && !processedIndices.has(idx)) {
          candidateIndices.add(idx);
        }
      }
    }

    // Sort candidates by timestamp so the early-termination break below is safe.
    const candidateArray = Array.from(candidateIndices).sort(
      (a, b) => sortedEvents[a]._timestamp - sortedEvents[b]._timestamp
    );

    for (let k = 0; k < candidateArray.length; k++) {
      const j = candidateArray[k];
      const candidateEvent = sortedEvents[j];

      // Early termination uses max magnitude (coerced finite) so we never break before
      // eventsMatchAdaptive (which uses the average) would accept a higher-magnitude candidate.
      const timeDiff = Math.abs(currentEvent._timestamp - candidateEvent._timestamp) / 1000;
      const maxMagnitude = Math.max(
        Number.isFinite(currentEvent.magnitude) ? currentEvent.magnitude : 0,
        Number.isFinite(candidateEvent.magnitude) ? candidateEvent.magnitude : 0
      );
      if (timeDiff > config.timeThreshold * getTimeMultiplier(maxMagnitude)) {
        break; // Safe: candidates are time-sorted, so all remaining also exceed threshold
      }

      if (
        eventsMatchAdaptive(currentEvent, candidateEvent, config.timeThreshold, config.distanceThreshold)
      ) {
        matchingEvents.push(candidateEvent);
        processedIndices.add(j);
      }
    }

    // Validate before merging; on failure salvage valid sub-groups instead of one big
    // (or all-singleton) group. Done here so preview and persist behave identically.
    if (matchingEvents.length > 1 && !validateEventGroup(matchingEvents)) {
      for (const subGroup of regroupFailedEvents(matchingEvents, config)) {
        groups.push({ events: subGroup, regrouped: true });
      }
    } else {
      groups.push({ events: matchingEvents, regrouped: false });
    }
  }

  return groups;
}

/**
 * Core merge algorithm - matches events across catalogues and merges each group.
 * Delegates grouping to groupMatchingEvents (shared with the preview path).
 */
function performMerge(
  events: EventData[],
  config: MergeConfig
): MergedEventData[] {
  const mergedEvents = groupMatchingEvents(events, config).map(g =>
    mergeEventGroup(g.events, config)
  );
  console.log(`[Merge] Processed ${events.length} events into ${mergedEvents.length} merged events`);
  return mergedEvents;
}

/**
 * Validate that a group of events makes physical sense to merge
 *
 * IMPROVEMENT (Issue #9): Validation of merged results
 * Checks for suspicious matches that may indicate matching errors:
 * - Magnitude range > threshold (varies by magnitude level)
 * - Depth range > threshold (varies by depth level)
 * - Time consistency check
 * - Location spread check for large groups
 *
 * Based on ISC-GEM and international seismic network practices:
 * - Small events (M < 4): stricter thresholds (likely local network)
 * - Large events (M ≥ 6): looser thresholds (teleseismic reporting variations)
 *
 * @param events - Array of events to validate
 * @returns True if events are consistent and safe to merge
 */
function validateEventGroup(events: EventData[]): boolean {
  if (events.length < 2) return true;

  const eventIds = events.map(e => e.id || 'unknown');
  const sources = events.map(e => e.source);
  const avgLat = events.reduce((sum, e) => sum + e.latitude, 0) / events.length;
  const avgLon = averageLongitudes(events.map(e => e.longitude));
  const avgTime = events[0]?.time;

  // Get magnitude range and average
  const mags = events.map(e => e.magnitude).filter(m => m != null);
  if (mags.length === 0) return true;

  const avgMag = mags.reduce((a, b) => a + b, 0) / mags.length;
  const magRange = Math.max(...mags) - Math.min(...mags);

  // Magnitude consistency threshold varies by event size
  // Small events: networks should agree within 0.5 units
  // Medium events: 0.8 units (regional network differences)
  // Large events: 1.2 units (teleseismic saturation effects)
  // Very large: 1.5 units (Mw/Ms/mb can differ significantly)
  let maxMagRange: number;
  if (avgMag < 4.0) {
    maxMagRange = 0.5;
  } else if (avgMag < 5.5) {
    maxMagRange = 0.8;
  } else if (avgMag < 7.0) {
    maxMagRange = 1.2;
  } else {
    maxMagRange = 1.5;
  }

  if (magRange > maxMagRange) {
    mergeConflictLog.log(
      'magnitude_range',
      'warning',
      `Large magnitude range: ${magRange.toFixed(2)} (threshold: ${maxMagRange}) - possible mismatch`,
      {
        eventIds,
        sources,
        values: { magnitudes: mags, avgMagnitude: avgMag },
        threshold: maxMagRange,
        actualValue: magRange,
        location: { lat: avgLat, lon: avgLon },
        time: avgTime,
      }
    );
    return false;
  }

  // Check depth consistency
  const depths = events.filter(e => e.depth != null).map(e => e.depth!);
  if (depths.length >= 2) {
    const depthRange = Math.max(...depths) - Math.min(...depths);
    const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;

    // Depth threshold varies by depth level and magnitude
    // Shallow (< 70 km): stricter threshold (better constrained)
    // Intermediate (70-300 km): moderate threshold
    // Deep (> 300 km): looser threshold (harder to constrain)
    // Large events also get more tolerance
    let maxDepthRange: number;
    if (avgDepth < 70) {
      maxDepthRange = avgMag < 5 ? 30 : 50;
    } else if (avgDepth < 300) {
      maxDepthRange = avgMag < 5 ? 50 : 100;
    } else {
      maxDepthRange = avgMag < 5 ? 100 : 150;
    }

    if (depthRange > maxDepthRange) {
      mergeConflictLog.log(
        'depth_range',
        'warning',
        `Large depth range: ${depthRange.toFixed(1)}km (threshold: ${maxDepthRange}km) - possible mismatch`,
        {
          eventIds,
          sources,
          values: { depths, avgDepth },
          threshold: maxDepthRange,
          actualValue: depthRange,
          location: { lat: avgLat, lon: avgLon },
          time: avgTime,
        }
      );
      return false;
    }
  }

  // Check for suspiciously large groups (likely matching error)
  // Same event should not be reported by more than ~10 different networks
  if (events.length > 15) {
    mergeConflictLog.log(
      'group_size',
      'error',
      `Suspiciously large event group: ${events.length} events - possible over-matching`,
      {
        eventIds,
        sources,
        values: { groupSize: events.length },
        threshold: 15,
        actualValue: events.length,
        location: { lat: avgLat, lon: avgLon },
        time: avgTime,
      }
    );
    return false;
  }

  // Check spatial spread for groups > 3 events
  // If events are spread over a large area, they might be different earthquakes
  if (events.length > 3) {
    const lats = events.map(e => e.latitude);
    const lons = events.map(e => e.longitude);
    const latSpread = Math.max(...lats) - Math.min(...lats);
    // Handle date line crossing: raw spread > 180° means events cluster near ±180°
    // and the true angular gap is the complement (e.g. 178° and -178° are only 4° apart).
    const rawLonSpread = Math.max(...lons) - Math.min(...lons);
    const lonSpread = rawLonSpread > 180 ? 360 - rawLonSpread : rawLonSpread;

    // Convert to approximate km (rough estimate)
    const spreadKm = Math.sqrt(
      Math.pow(latSpread * 111, 2) +
      Math.pow(lonSpread * 111 * Math.cos((Math.min(...lats) + Math.max(...lats)) / 2 * Math.PI / 180), 2)
    );

    // Max spread based on magnitude (larger events have larger location uncertainties)
    const maxSpread = avgMag < 5 ? 100 : avgMag < 6 ? 150 : 200;

    if (spreadKm > maxSpread) {
      mergeConflictLog.log(
        'spatial_spread',
        'warning',
        `Large spatial spread: ${spreadKm.toFixed(1)}km (threshold: ${maxSpread}km) - possible mismatch`,
        {
          eventIds,
          sources,
          values: { latSpread, lonSpread, spreadKm },
          threshold: maxSpread,
          actualValue: spreadKm,
          location: { lat: avgLat, lon: avgLon },
          time: avgTime,
        }
      );
      return false;
    }
  }

  // IMPROVEMENT (Issue #7): network_mismatch — same source appearing more than once in a
  // group means the same network reported two events for the same physical earthquake.
  // Most likely these are two distinct earthquakes that happen to be close in time/space
  // (e.g. foreshock/aftershock pair), so we should not merge them.
  const sourceCounts = new Map<string, number>();
  for (const e of events) {
    sourceCounts.set(e.source, (sourceCounts.get(e.source) ?? 0) + 1);
  }
  const duplicateSources = Array.from(sourceCounts.entries()).filter(([, count]) => count > 1);
  if (duplicateSources.length > 0) {
    mergeConflictLog.log(
      'network_mismatch',
      'warning',
      `Same network appears multiple times in group: ${duplicateSources.map(([s]) => s).join(', ')} — likely distinct events`,
      {
        eventIds,
        sources,
        values: { duplicateSources: Object.fromEntries(duplicateSources) },
        location: { lat: avgLat, lon: avgLon },
        time: avgTime,
      }
    );
    return false;
  }

  // IMPROVEMENT (Issue #7): time_inconsistency — informational flag when the time spread
  // within an otherwise valid group is unusually large.  The hard gate is in
  // eventsMatchAdaptive; this is a softer QC note for reviewers.
  const timestamps = events.map(e => (e as any)._timestamp ?? new Date(e.time).getTime());
  const timeSpreadSec = (Math.max(...timestamps) - Math.min(...timestamps)) / 1000;
  const timeConsistencyThreshold = avgMag < 5 ? 30 : 60; // seconds
  if (timeSpreadSec > timeConsistencyThreshold) {
    mergeConflictLog.log(
      'time_inconsistency',
      'info',
      `Wide time spread within group: ${timeSpreadSec.toFixed(1)}s (informational threshold: ${timeConsistencyThreshold}s)`,
      {
        eventIds,
        sources,
        values: { timeSpreadSec },
        threshold: timeConsistencyThreshold,
        actualValue: timeSpreadSec,
        location: { lat: avgLat, lon: avgLon },
        time: avgTime,
      }
    );
    // Do not return false — time was already validated by eventsMatchAdaptive;
    // this is logged for QC review only.
  }

  return true;
}

// ============================================================================
// FIELD-LEVEL UNION MERGE
// ============================================================================

/**
 * Optional scalar fields from EventData that are eligible for field-level union.
 *
 * These are fields that (a) are not computed by the merge algorithm itself and
 * (b) have a clear "present beats absent" semantics — i.e. any non-null value
 * from any source is better than null on the merged record.
 *
 * Fields deliberately excluded:
 *   - time / latitude / longitude / depth / magnitude — overwritten by strategy
 *   - source / id / catalogue_id — identity fields, not inherited
 *   - quakeml — complex object; handled separately via JSON blob fields
 *   - _timestamp — internal performance cache, not persisted
 */
const UNION_SCALAR_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'region',
  'location_name',
  'source_id',
  'event_public_id',
  'event_type',
  'event_type_certainty',
  'time_uncertainty',
  'depth_uncertainty',
  'depth_type',
  'earth_model_id',
  'method_id',
  'agency_id',
  'author',
  'azimuthal_gap',
  'used_phase_count',
  'used_station_count',
  'standard_error',
  'minimum_distance',
  'maximum_distance',
  'associated_phase_count',
  'associated_station_count',
  'depth_phase_count',
  'evaluation_mode',
  'evaluation_status',
] as const;

// Magnitude-metadata fields that must travel atomically with the magnitude VALUE — never
// grafted independently from a different (e.g. higher-quality) source, which would mislabel
// the merged magnitude (an ML value stamped 'Mw', a mismatched uncertainty/station count).
const MAGNITUDE_META_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'magnitude_type',
  'magnitude_uncertainty',
  'magnitude_station_count',
  'magnitude_method_id',
  'magnitude_evaluation_mode',
  'magnitude_evaluation_status',
] as const;

// Location-uncertainty fields that must travel with the LOCATION — not grafted from a
// source whose coordinates differ from the merged (possibly averaged) location.
const LOCATION_META_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'latitude_uncertainty',
  'longitude_uncertainty',
  'horizontal_uncertainty',
] as const;

/**
 * Optional JSON-blob fields: arrays of rich objects serialised as strings.
 * For these, the highest-quality source that carries the field wins, but if
 * the primary donor lacks the field entirely another source can fill it in.
 */
const UNION_BLOB_FIELDS: ReadonlyArray<keyof MergedEvent> = [
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
  'origin_quality',
] as const;

/**
 * Apply a field-level union over a group of source events onto the already-
 * selected merged base event.
 *
 * Strategy:
 *   - For each optional scalar field: use the first non-null value found,
 *     ranked by descending quality score (so better sources fill gaps first).
 *   - For each JSON-blob field: same — take the first source that carries it.
 *   - Fields that are already non-null on the base event are not overwritten.
 *
 * This means the merged record can carry `picks` from ISC even when the
 * selected (highest-quality) base event came from GeoNet which had none.
 *
 * @param base   - Already-merged event from the strategy function
 * @param events - All source events in the group, in any order
 * @returns New event object with union-filled optional fields
 */
function unionMergeFields(base: MergedEventData, events: EventData[]): MergedEventData {
  if (events.length <= 1) return base;

  // Sort sources by descending quality so better data fills gaps first.
  const ranked = events
    .map(e => ({ event: e, score: calculateQualityScore(e) }))
    .sort((a, b) => b.score - a.score)
    .map(s => s.event);

  const result: MergedEventData = { ...base };

  // Scalar fields: first non-null value across ranked sources wins.
  for (const field of UNION_SCALAR_FIELDS) {
    if (result[field] != null) continue; // base already has it
    for (const src of ranked) {
      if (src[field] != null) {
        (result as any)[field] = src[field];
        break;
      }
    }
  }

  // JSON-blob fields: first source that carries the field wins.
  // We also promote from the source event's quakeml when the field is absent
  // on the top-level event object (quakeml blobs are serialised in executeMergeOperation).
  for (const field of UNION_BLOB_FIELDS) {
    if (result[field] != null) continue;
    for (const src of ranked) {
      if (src[field] != null) {
        (result as any)[field] = src[field];
        break;
      }
    }
  }

  // Magnitude metadata: fill ONLY from the source event that actually supplied the merged
  // magnitude value, so we never label the merged magnitude with a type/uncertainty from a
  // different source (an ML value must not become 'Mw').
  const magSource = result.magnitude != null
    ? ranked.find(src => src.magnitude != null && src.magnitude === result.magnitude)
    : undefined;
  if (magSource) {
    for (const field of MAGNITUDE_META_FIELDS) {
      if (result[field] == null && (magSource as any)[field] != null) {
        (result as any)[field] = (magSource as any)[field];
      }
    }
  }

  // Location uncertainties: fill ONLY from the source whose coordinates match the merged
  // location. For averaged locations no source matches, so these correctly stay unset
  // rather than being attributed to a point no single source reported.
  const locSource = ranked.find(
    src => src.latitude === result.latitude && src.longitude === result.longitude
  );
  if (locSource) {
    for (const field of LOCATION_META_FIELDS) {
      if (result[field] == null && (locSource as any)[field] != null) {
        (result as any)[field] = (locSource as any)[field];
      }
    }
  }

  // Focal mechanism: choose the single best mechanism across ALL sources by SOURCE
  // AUTHORITY (GCMT > regional CMT > ...) then focal-mechanism quality — not the base
  // event's general quality score. This also replaces an inferior mechanism already on
  // the base when a higher-authority one exists elsewhere in the group (previously the
  // promotion was skipped entirely whenever the base carried any mechanism, discarding a
  // superior GCMT, and even the empty-base case picked by overall event quality).
  const bestFm = selectBestFocalMechanism(events);
  if (bestFm) {
    // Preserve every mechanism across the group (lose none), but order the authority-
    // selected best first and mark it preferred so downstream consumers use it.
    const allFms: import('./types/quakeml').FocalMechanism[] = [];
    for (const src of events) {
      if (src.quakeml?.focalMechanisms?.length) {
        allFms.push(...src.quakeml.focalMechanisms);
      }
    }
    const orderedFms = [bestFm, ...allFms.filter(fm => fm !== bestFm)];
    (result as any).quakeml = {
      ...(result.quakeml ?? {}),
      focalMechanisms: orderedFms,
      preferredFocalMechanismID: bestFm.publicID,
    };
  }

  return result;
}

/**
 * Strip transient/redundant fields from an event before it is stored inside
 * the `source_events` JSON column.
 *
 * - `_timestamp` is an internal performance cache added during the sort sweep;
 *   it must not be persisted.
 * - `quakeml` is the full parsed QuakeML object.  Its fields are already
 *   serialised individually into `origins`, `picks`, `magnitudes`, etc., so
 *   embedding it again inside every source-event entry would be massive
 *   redundancy that bloats the `source_events` blob for no benefit.
 */
function toSourceEventData(e: EventData): EventData {
  const { _timestamp, quakeml, ...rest } = e as any;
  return rest as EventData;
}

/**
 * Build the `sourceEvents` provenance array shared by every merge strategy. Centralised so
 * the field that must stay consistent across all strategies cannot drift between them.
 */
function buildSourceEvents(events: EventData[]): MergedEventData['sourceEvents'] {
  return events.map(e => ({
    catalogueId: e.catalogueId ?? e.id ?? 'unknown',
    source: e.source,
    originalData: toSourceEventData(e),
  }));
}

/**
 * Merge a group of matching events based on the selected strategy.
 * After the strategy selects the base record, a field-level union pass
 * fills in any optional fields that the base event lacks from other sources.
 */
function mergeEventGroup(
  events: EventData[],
  config: MergeConfig
): MergedEventData {
  if (events.length === 1) {
    return {
      ...events[0],
      sourceEvents: buildSourceEvents([events[0]])
    };
  }

  let mergedEvent: MergedEventData;

  switch (config.mergeStrategy) {
    case 'average':
      mergedEvent = mergeByAverage(events);
      break;
    case 'newest':
      mergedEvent = mergeByNewest(events);
      break;
    case 'complete':
      mergedEvent = mergeByCompleteness(events);
      break;
    case 'quality':
      mergedEvent = mergeByQuality(events);
      break;
    case 'priority':
    default:
      mergedEvent = mergeByPriority(events, config.priority);
      break;
  }

  // Apply field-level union: fill optional fields the base event lacks
  // from other sources in the group.
  return unionMergeFields(mergedEvent, events);
}

// ============================================================================
// FOCAL MECHANISM MERGING
// ============================================================================

/**
 * Focal mechanism source priority hierarchy
 * Based on reliability and methodology:
 * 1. GCMT/CMT - Gold standard for moment tensors
 * 2. Regional CMT solutions (e.g., GeoNet CMT)
 * 3. First motion solutions with many polarities
 * 4. Automated solutions
 */
// NOTE: iteration order matters. More specific / regional patterns must be tested BEFORE
// the generic 'cmt' catch-all so a regional source like 'GeoNet CMT' is classified as
// Regional CMT (priority 2), not Global CMT (priority 1) — the substring 'cmt' would
// otherwise match it first.
const FOCAL_MECHANISM_HIERARCHY: Array<{ patterns: string[]; priority: number; description: string }> = [
  { patterns: ['geonet', 'gns'], priority: 2, description: 'Regional CMT' },
  { patterns: ['gcmt', 'globalcmt', 'cmt'], priority: 1, description: 'Global CMT' },
  { patterns: ['usgs', 'neic'], priority: 3, description: 'USGS/NEIC' },
  { patterns: ['isc'], priority: 4, description: 'ISC' },
];

/**
 * Get focal mechanism priority for a source
 */
function getFocalMechanismPriority(source: string | undefined): number {
  if (!source) return 999;
  const lowerSource = source.toLowerCase();

  for (const { patterns, priority } of FOCAL_MECHANISM_HIERARCHY) {
    if (patterns.some(p => lowerSource.includes(p))) {
      return priority;
    }
  }
  return 100; // Unknown source
}

/**
 * Calculate quality score for a focal mechanism
 * Based on:
 * - Number of station polarities used
 * - Misfit value (lower is better)
 * - Presence of moment tensor
 * - Variance reduction (higher is better)
 */
function calculateFocalMechanismQuality(fm: import('./types/quakeml').FocalMechanism): number {
  let score = 0;

  // Station polarity count (0-25 points)
  if (fm.stationPolarityCount != null) {
    if (fm.stationPolarityCount >= 50) {
      score += 25;
    } else if (fm.stationPolarityCount >= 30) {
      score += 20;
    } else if (fm.stationPolarityCount >= 15) {
      score += 15;
    } else if (fm.stationPolarityCount >= 8) {
      score += 10;
    } else {
      score += 5;
    }
  }

  // Misfit (0-20 points, lower is better)
  if (fm.misfit != null) {
    if (fm.misfit <= 0.1) {
      score += 20;
    } else if (fm.misfit <= 0.2) {
      score += 15;
    } else if (fm.misfit <= 0.3) {
      score += 10;
    } else if (fm.misfit <= 0.5) {
      score += 5;
    }
  }

  // Moment tensor presence (0-30 points)
  if (fm.momentTensor) {
    score += 15; // Base points for having moment tensor

    // Variance reduction (0-15 additional points)
    if (fm.momentTensor.varianceReduction != null) {
      if (fm.momentTensor.varianceReduction >= 0.8) {
        score += 15;
      } else if (fm.momentTensor.varianceReduction >= 0.6) {
        score += 10;
      } else if (fm.momentTensor.varianceReduction >= 0.4) {
        score += 5;
      }
    }
  }

  // Azimuthal gap (0-15 points, lower is better)
  if (fm.azimuthalGap != null) {
    if (fm.azimuthalGap <= 90) {
      score += 15;
    } else if (fm.azimuthalGap <= 120) {
      score += 12;
    } else if (fm.azimuthalGap <= 180) {
      score += 8;
    } else if (fm.azimuthalGap <= 270) {
      score += 4;
    }
  }

  // Evaluation status (0-10 points)
  if (fm.evaluationStatus) {
    if (fm.evaluationStatus === 'final' || fm.evaluationStatus === 'reviewed') {
      score += 10;
    } else if (fm.evaluationStatus === 'confirmed') {
      score += 7;
    } else if (fm.evaluationStatus === 'preliminary') {
      score += 3;
    }
  }

  // Normalize against the FIXED maximum budget (25 + 20 + 30 + 15 + 10 = 100) rather than
  // only the metrics that happen to be present. Otherwise a mechanism reporting a single
  // favourable field and nothing else would score ~100% and outrank an information-rich,
  // better-constrained solution. `score` is already on a 0–100 scale.
  return score;
}

/**
 * Select the best focal mechanism from a group of events
 *
 * Priority order:
 * 1. Source authority (GCMT > regional CMT > others)
 * 2. Quality score (station count, misfit, variance reduction)
 * 3. Presence of moment tensor
 *
 * @param events - Array of events to select focal mechanism from
 * @returns Best focal mechanism or null if none available
 */
function selectBestFocalMechanism(
  events: EventData[]
): import('./types/quakeml').FocalMechanism | null {
  const focalMechanisms: Array<{
    fm: import('./types/quakeml').FocalMechanism;
    source: string;
    priority: number;
    quality: number;
  }> = [];

  for (const event of events) {
    if (!event.quakeml?.focalMechanisms) continue;

    // Get preferred focal mechanism, falling back to the first one when the preferred
    // ID is missing OR dangling (does not resolve to any mechanism). Previously a stale
    // preferredFocalMechanismID caused find() to return undefined and the whole event's
    // mechanism to be dropped even though a valid mechanism existed.
    const preferredId = event.quakeml.preferredFocalMechanismID;
    const fm =
      (preferredId
        ? event.quakeml.focalMechanisms.find(f => f.publicID === preferredId)
        : undefined) ?? event.quakeml.focalMechanisms[0];

    if (fm) {
      focalMechanisms.push({
        fm,
        source: event.source,
        priority: getFocalMechanismPriority(event.source),
        quality: calculateFocalMechanismQuality(fm),
      });
    }
  }

  if (focalMechanisms.length === 0) {
    return null;
  }

  // Sort by priority (lower = better), then by quality (higher = better)
  focalMechanisms.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.quality - a.quality;
  });

  return focalMechanisms[0].fm;
}

/**
 * Merge focal mechanisms from multiple events
 *
 * This function collects all focal mechanisms from source events and
 * selects the best one based on source authority and quality metrics.
 *
 * @param events - Array of events to merge focal mechanisms from
 * @returns Merged focal mechanism data
 */
function mergeFocalMechanisms(events: EventData[]): {
  bestFocalMechanism: import('./types/quakeml').FocalMechanism | null;
  allFocalMechanisms: Array<{
    focalMechanism: import('./types/quakeml').FocalMechanism;
    source: string;
    quality: number;
  }>;
} {
  const allFocalMechanisms: Array<{
    focalMechanism: import('./types/quakeml').FocalMechanism;
    source: string;
    quality: number;
  }> = [];

  for (const event of events) {
    if (!event.quakeml?.focalMechanisms) continue;

    for (const fm of event.quakeml.focalMechanisms) {
      allFocalMechanisms.push({
        focalMechanism: fm,
        source: event.source,
        quality: calculateFocalMechanismQuality(fm),
      });
    }
  }

  return {
    bestFocalMechanism: selectBestFocalMechanism(events),
    allFocalMechanisms,
  };
}

// ============================================================================
// MAGNITUDE CONVERSION
// ============================================================================

/**
 * Magnitude type enumeration for conversion functions
 */
type MagnitudeType = 'Mw' | 'Ms' | 'mb' | 'ML' | 'Md';

/**
 * Magnitude conversion result
 */
interface MagnitudeConversionResult {
  value: number;
  uncertainty: number;
  method: string;
  isExact: boolean;
}

/**
 * Convert ML (local magnitude) to Mw (moment magnitude) — APPROXIMATE.
 *
 * Uses the generic linear relation Mw = 0.67*ML + 1.17 with ~0.3 m.u. scatter.
 *
 * IMPORTANT: this is NOT from Scordilis (2006). That study calibrated Ms->Mw and
 * mb->Mw only — it does not provide an ML->Mw relation — so the previous
 * attribution was incorrect. There is no single universal ML->Mw conversion; for
 * moderate events ML ~= Mw, and a regional calibration (e.g. an NZ-specific
 * GeoNet / Ristau et al. relation) should be preferred where available. Converted
 * values are approximate and flagged isExact: false.
 *
 * @param ml - Local magnitude value
 * @returns Converted Mw value with uncertainty
 */
function convertMLtoMw(ml: number): MagnitudeConversionResult {
  // There is no universal ML->Mw relation; for moderate events ML ≈ Mw, so use identity
  // as the generic approximation. The previous 0.67*ML+1.17 reused the Scordilis Ms->Mw
  // slope and systematically deflated Mw by up to ~0.8 units across the moderate range
  // (crossover at ML≈3.55), which is the wrong direction. Above ~6.5 ML saturates and
  // true Mw exceeds ML, so widen the uncertainty there. Prefer a regional NZ/GeoNet
  // (e.g. Ristau et al.) calibration where available.
  const saturating = ml > 6.5;
  return {
    value: Math.round(ml * 100) / 100,
    uncertainty: saturating ? 0.5 : 0.3,
    method: saturating
      ? 'Approximate ML≈Mw (ML saturates above ~6.5; Mw likely underestimated — prefer a regional relation)'
      : 'Approximate ML≈Mw (generic; prefer a regional NZ/GeoNet calibration)',
    isExact: false,
  };
}

/**
 * Convert mb (body wave magnitude) to Mw (moment magnitude)
 *
 * Based on Scordilis (2006) empirical relationships:
 * - For mb < 6.2: Mw = 0.85 * mb + 1.03
 * - For mb ≥ 6.2: mb saturates, use Ms or direct Mw
 *
 * @param mb - Body wave magnitude value
 * @returns Converted Mw value with uncertainty
 */
function convertMbtoMw(mb: number): MagnitudeConversionResult {
  // Scordilis (2006) relationship
  // Mw = 0.85(±0.04) * mb + 1.03(±0.23), calibrated for 3.5 ≤ mb ≤ 6.2
  const mw = 0.85 * mb + 1.03;
  // Above ~6.2 mb saturates and the linear relation underestimates Mw; below 3.5 it is
  // uncalibrated. Flag out-of-range inputs with a larger uncertainty instead of reporting
  // a falsely precise value.
  const outOfRange = mb < 3.5 || mb > 6.2;
  return {
    value: Math.round(mw * 100) / 100,
    uncertainty: outOfRange ? 0.6 : mb >= 6.0 ? 0.5 : 0.3,
    method: outOfRange
      ? 'Scordilis (2006): Mw = 0.85*mb + 1.03 (EXTRAPOLATED beyond calibrated 3.5–6.2 range; mb saturates)'
      : 'Scordilis (2006): Mw = 0.85*mb + 1.03',
    isExact: false,
  };
}

/**
 * Convert Ms (surface wave magnitude) to Mw (moment magnitude)
 *
 * Based on Scordilis (2006) empirical relationships:
 * - For Ms < 6.2: Mw = 0.67 * Ms + 2.07
 * - For Ms ≥ 6.2: Mw = 0.99 * Ms + 0.08
 *
 * @param ms - Surface wave magnitude value
 * @returns Converted Mw value with uncertainty
 */
function convertMstoMw(ms: number): MagnitudeConversionResult {
  let mw: number;
  let method: string;

  if (ms < 6.2) {
    // Scordilis (2006) for smaller events
    mw = 0.67 * ms + 2.07;
    method = 'Scordilis (2006): Mw = 0.67*Ms + 2.07 (Ms < 6.2)';
  } else {
    // Scordilis (2006) for larger events
    mw = 0.99 * ms + 0.08;
    method = 'Scordilis (2006): Mw = 0.99*Ms + 0.08 (Ms ≥ 6.2)';
  }

  return {
    value: Math.round(mw * 100) / 100,
    uncertainty: 0.2, // Ms to Mw is more reliable
    method,
    isExact: false,
  };
}

/**
 * Convert Md (duration magnitude) to ML (local magnitude)
 *
 * Md to ML conversion is highly region-dependent.
 * Using a general approximation: ML ≈ Md (with high uncertainty)
 *
 * @param md - Duration magnitude value
 * @returns Converted ML value with uncertainty
 */
function convertMdtoML(md: number): MagnitudeConversionResult {
  // General approximation - Md and ML are often similar for small events
  // but relationship varies significantly by region
  return {
    value: md,
    uncertainty: 0.5, // High uncertainty
    method: 'Approximate: ML ≈ Md (region-dependent)',
    isExact: false,
  };
}

/**
 * Get the magnitude type from a magnitude type string
 */
function getMagnitudeTypeCategory(magType: string | undefined): MagnitudeType | null {
  if (!magType) return null;
  const lower = magType.toLowerCase();

  if (lower.startsWith('mw')) return 'Mw';
  if (lower.startsWith('ms')) return 'Ms';
  if (lower.startsWith('mb')) return 'mb'; // mb, mb_lg, mbb, mblg, mB, ...
  if (lower.startsWith('ml')) return 'ML';
  if (lower === 'md' || lower === 'mc') return 'Md';

  return null;
}

/**
 * Convert any magnitude type to Mw (moment magnitude)
 *
 * This is the primary conversion function that routes to specific
 * conversion functions based on the input magnitude type.
 *
 * @param value - Magnitude value
 * @param magType - Magnitude type string (e.g., 'ML', 'mb', 'Ms')
 * @returns Converted Mw value with uncertainty, or null if conversion not possible
 */
function convertToMw(value: number, magType: string | undefined): MagnitudeConversionResult | null {
  const category = getMagnitudeTypeCategory(magType);

  if (!category) {
    return null;
  }

  switch (category) {
    case 'Mw':
      // Already Mw, return as-is
      return {
        value,
        uncertainty: 0,
        method: 'No conversion needed (already Mw)',
        isExact: true,
      };
    case 'Ms':
      return convertMstoMw(value);
    case 'mb':
      return convertMbtoMw(value);
    case 'ML':
      return convertMLtoMw(value);
    case 'Md':
      // Convert Md -> ML -> Mw
      const mlResult = convertMdtoML(value);
      const mwResult = convertMLtoMw(mlResult.value);
      return {
        value: mwResult.value,
        uncertainty: Math.sqrt(mlResult.uncertainty ** 2 + mwResult.uncertainty ** 2),
        method: `${mlResult.method} → ${mwResult.method}`,
        isExact: false,
      };
    default:
      return null;
  }
}

/**
 * Compare two magnitudes by converting both to Mw
 *
 * This allows comparison of magnitudes of different types by
 * converting them to a common scale (Mw).
 *
 * @param mag1 - First magnitude value
 * @param type1 - First magnitude type
 * @param mag2 - Second magnitude value
 * @param type2 - Second magnitude type
 * @returns Difference in Mw (mag1 - mag2), or null if conversion fails
 */
function compareMagnitudes(
  mag1: number,
  type1: string | undefined,
  mag2: number,
  type2: string | undefined
): { difference: number; uncertainty: number } | null {
  const mw1 = convertToMw(mag1, type1);
  const mw2 = convertToMw(mag2, type2);

  if (!mw1 || !mw2) {
    return null;
  }

  return {
    difference: mw1.value - mw2.value,
    uncertainty: Math.sqrt(mw1.uncertainty ** 2 + mw2.uncertainty ** 2),
  };
}

/**
 * Check if two magnitudes are equivalent within uncertainty
 *
 * @param mag1 - First magnitude value
 * @param type1 - First magnitude type
 * @param mag2 - Second magnitude value
 * @param type2 - Second magnitude type
 * @param tolerance - Additional tolerance beyond conversion uncertainty (default: 0.3)
 * @returns True if magnitudes are equivalent within uncertainty
 */
function magnitudesEquivalent(
  mag1: number,
  type1: string | undefined,
  mag2: number,
  type2: string | undefined,
  tolerance: number = 0.3
): boolean {
  const comparison = compareMagnitudes(mag1, type1, mag2, type2);

  if (!comparison) {
    // Fall back to direct comparison if conversion fails
    return Math.abs(mag1 - mag2) <= tolerance;
  }

  // Check if difference is within combined uncertainty + tolerance
  return Math.abs(comparison.difference) <= comparison.uncertainty + tolerance;
}

/**
 * Magnitude type hierarchy groups for case-insensitive matching
 * Based on ISC-GEM standards and IASPEI recommendations
 *
 * Priority order (most to least preferred):
 * 1. Mw variants (moment magnitude) - most reliable, doesn't saturate
 * 2. Ms variants (surface wave) - good for large shallow events
 * 3. mb variants (body wave) - saturates above M~6.0
 * 4. ML variants (local/Richter) - saturates above M~6.5
 * 5. Md/Mc variants (duration/coda) - least reliable
 */
const MAGNITUDE_HIERARCHY: Array<{ priority: number; patterns: string[] }> = [
  // Priority 1: Moment magnitude variants (best)
  { priority: 1, patterns: ['mw', 'mww', 'mwc', 'mwb', 'mwr', 'mwp'] },
  // Priority 2: Surface wave magnitude
  { priority: 2, patterns: ['ms', 'ms_20', 'ms_bb'] },
  // Priority 3: Body wave magnitude
  { priority: 3, patterns: ['mb', 'mbb', 'mb_lg'] },
  // Priority 4: Local/Richter magnitude
  { priority: 4, patterns: ['ml', 'mlv', 'mlr'] },
  // Priority 5: Duration/Coda magnitude (least reliable)
  { priority: 5, patterns: ['md', 'mc'] },
];

/**
 * Network authority hierarchy for prioritizing seismic data sources
 *
 * Different regions have authoritative networks that should be preferred:
 * - New Zealand: GeoNet > GNS > ISC > USGS
 * - Global: GCMT > ISC > USGS > EMSC
 * - USA: USGS > ISC
 * - Europe: EMSC > ISC > USGS
 * - Japan: JMA > ISC > USGS
 *
 * Priority is 1-based (lower = higher priority)
 */
interface NetworkAuthority {
  patterns: string[];
  priority: number;
  region?: string;
  description: string;
}

/**
 * Default network hierarchy (can be overridden by user configuration)
 * This is a global hierarchy suitable for most use cases
 */
const DEFAULT_NETWORK_HIERARCHY: NetworkAuthority[] = [
  // New Zealand authoritative networks
  { patterns: ['geonet', 'gns', 'nz'], priority: 1, region: 'NZ', description: 'GeoNet (NZ authoritative)' },
  // Global centroid moment tensor
  { patterns: ['gcmt', 'cmt', 'globalcmt'], priority: 2, description: 'Global CMT' },
  // International Seismological Centre
  { patterns: ['isc', 'isc-gem'], priority: 3, description: 'ISC/ISC-GEM' },
  // USGS National Earthquake Information Center
  { patterns: ['usgs', 'neic', 'anss'], priority: 4, description: 'USGS/NEIC' },
  // European-Mediterranean Seismological Centre
  { patterns: ['emsc', 'csem'], priority: 5, description: 'EMSC' },
  // Japan Meteorological Agency
  { patterns: ['jma', 'japan'], priority: 6, region: 'JP', description: 'JMA' },
  // Geofon
  { patterns: ['geofon', 'gfz'], priority: 7, description: 'GEOFON/GFZ' },
  // IRIS
  { patterns: ['iris'], priority: 8, description: 'IRIS' },
  // Other regional networks
  { patterns: ['ingv'], priority: 9, region: 'IT', description: 'INGV (Italy)' },
  { patterns: ['ign'], priority: 10, region: 'ES', description: 'IGN (Spain)' },
];

/**
 * Regional network priority overrides
 * When events are within these regions, use region-specific priorities
 */
interface RegionalPriority {
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  hierarchy: Array<{ patterns: string[]; priority: number }>;
}

const REGIONAL_PRIORITIES: Record<string, RegionalPriority> = {
  NZ: {
    // minLon > maxLon marks a region that crosses the ±180 antimeridian, so NZ territory
    // (Chatham Islands ~ -176.5, Kermadec arc) is detected as region NZ, not the global default.
    bounds: { minLat: -50, maxLat: -34, minLon: 165, maxLon: -175 },
    hierarchy: [
      { patterns: ['geonet', 'gns', 'nz'], priority: 1 },
      { patterns: ['gcmt', 'cmt'], priority: 2 },
      { patterns: ['isc'], priority: 3 },
      { patterns: ['usgs', 'neic'], priority: 4 },
    ],
  },
  JP: {
    bounds: { minLat: 24, maxLat: 46, minLon: 122, maxLon: 154 },
    hierarchy: [
      { patterns: ['jma', 'japan'], priority: 1 },
      { patterns: ['gcmt', 'cmt'], priority: 2 },
      { patterns: ['isc'], priority: 3 },
      { patterns: ['usgs', 'neic'], priority: 4 },
    ],
  },
};

/**
 * Get network priority for a source name
 * Lower priority = more authoritative (1 is best)
 *
 * @param source - Source name to check
 * @param event - Optional event for regional priority detection
 * @param customHierarchy - Optional custom hierarchy to use
 * @returns Priority value (lower = better)
 */
function getNetworkPriority(
  source: string | undefined,
  event?: EventData,
  customHierarchy?: NetworkAuthority[]
): number {
  if (!source) return 999;

  const lowerSource = source.toLowerCase();
  const hierarchy = customHierarchy || DEFAULT_NETWORK_HIERARCHY;

  // Check for regional priority override
  if (event) {
    for (const [, regionConfig] of Object.entries(REGIONAL_PRIORITIES)) {
      const { bounds, hierarchy: regionalHierarchy } = regionConfig;
      // Longitude containment supports antimeridian-crossing regions (minLon > maxLon),
      // so e.g. the NZ region includes both 165..180 and -180..-175.
      const inLon =
        bounds.minLon <= bounds.maxLon
          ? event.longitude >= bounds.minLon && event.longitude <= bounds.maxLon
          : event.longitude >= bounds.minLon || event.longitude <= bounds.maxLon;
      if (
        event.latitude >= bounds.minLat &&
        event.latitude <= bounds.maxLat &&
        inLon
      ) {
        // Use regional hierarchy
        for (const { patterns, priority } of regionalHierarchy) {
          if (patterns.some(p => lowerSource.includes(p))) {
            return priority;
          }
        }
      }
    }
  }

  // Use default hierarchy
  for (const { patterns, priority } of hierarchy) {
    if (patterns.some(p => lowerSource.includes(p))) {
      return priority;
    }
  }

  return 100; // Unknown network
}

/**
 * Select best event from group based on network authority
 * Falls back to quality score if networks have same priority
 *
 * @param events - Array of events to select from
 * @param customHierarchy - Optional custom hierarchy
 * @returns Best event based on network authority
 */
function selectByNetworkAuthority(
  events: EventData[],
  customHierarchy?: NetworkAuthority[]
): EventData {
  if (events.length === 0) {
    throw new Error('Cannot select from empty event array');
  }
  if (events.length === 1) {
    return events[0];
  }

  // Score events by network priority and quality.
  // Each event uses its own location as the regional reference so that events
  // on region boundaries get the correct hierarchy (e.g. an event just inside
  // NZ bounds is ranked by the NZ hierarchy, not by its neighbour's region).
  const scored = events.map(e => ({
    event: e,
    networkPriority: getNetworkPriority(e.source, e, customHierarchy),
    qualityScore: calculateQualityScore(e),
  }));

  // Sort by network priority (lower = better), then quality (higher = better)
  scored.sort((a, b) => {
    if (a.networkPriority !== b.networkPriority) {
      return a.networkPriority - b.networkPriority;
    }
    return b.qualityScore - a.qualityScore;
  });

  return scored[0].event;
}

/**
 * Get magnitude priority (lower = better)
 */
function getMagnitudePriority(magType: string | undefined): number {
  if (!magType) return 999;
  const lowerType = magType.toLowerCase();

  // Fast path: exact match against the explicit variant whitelist.
  for (const group of MAGNITUDE_HIERARCHY) {
    if (group.patterns.includes(lowerType)) {
      return group.priority;
    }
  }

  // Fall back to prefix-based category classification so valid-but-unlisted labels
  // (e.g. 'Mw(mB)', 'MLc', 'mbLg', 'Ms20') map to the correct tier instead of collapsing
  // to 'unknown' (which would rank a real Mw below a coda Md). Keeps this consistent with
  // getMagnitudeTypeCategory used by the conversion path.
  switch (getMagnitudeTypeCategory(magType)) {
    case 'Mw': return 1;
    case 'Ms': return 2;
    case 'mb': return 3;
    case 'ML': return 4;
    case 'Md': return 5;
    default: return 100; // Genuinely unknown type
  }
}

/**
 * Select the best magnitude from a group of events using magnitude type hierarchy
 *
 * IMPROVEMENT (Issue #3): Magnitude type hierarchy based on ISC-GEM standards
 * Priority order: Mw > Ms > mb > ML > Md (moment magnitude is most physically meaningful)
 * Falls back to simple magnitude field if QuakeML data is not available
 *
 * Also considers magnitude uncertainty - prefers lower uncertainty within same priority tier
 *
 * @param events - Array of events to select magnitude from
 * @returns Object with magnitude value and type
 */
function selectBestMagnitude(events: EventData[]): { value: number; type: string } {
  // Collect all magnitude candidates with their priorities
  const candidates: Array<{
    value: number;
    type: string;
    priority: number;
    uncertainty: number;
  }> = [];

  for (const event of events) {
    // Track the (value|type) pairs already added for this event so a top-level magnitude
    // that duplicates a QuakeML entry is not double-counted.
    const seen = new Set<string>();

    if (event.quakeml?.magnitudes && event.quakeml.magnitudes.length > 0) {
      for (const mag of event.quakeml.magnitudes) {
        if (mag.mag?.value != null) {
          const type = mag.type || 'unknown';
          seen.add(`${mag.mag.value}|${type.toLowerCase()}`);
          candidates.push({
            value: mag.mag.value,
            type,
            priority: getMagnitudePriority(mag.type),
            uncertainty: mag.mag.uncertainty ?? 999,
          });
        }
      }
    }

    // Always consider the top-level magnitude/magnitude_type too (CSV/simple imports, or
    // events without a QuakeML magnitudes array). Previously these were ignored whenever
    // ANY event in the group carried QuakeML magnitudes, which could drop a better Mw for
    // a worse mb/ML.
    if (event.magnitude != null && Number.isFinite(event.magnitude)) {
      const type = event.magnitude_type || 'unknown';
      const key = `${event.magnitude}|${type.toLowerCase()}`;
      if (!seen.has(key)) {
        candidates.push({
          value: event.magnitude,
          type,
          priority: getMagnitudePriority(event.magnitude_type),
          uncertainty: event.magnitude_uncertainty ?? 999,
        });
      }
    }
  }

  // Sort by priority (lower = better), then by uncertainty (lower = better)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.uncertainty - b.uncertainty;
  });

  if (candidates.length > 0) {
    return { value: candidates[0].value, type: candidates[0].type };
  }

  // Fallback: use simple magnitude field from first event with magnitude
  const eventWithMag = events.find(e => e.magnitude != null);
  return {
    value: eventWithMag?.magnitude || 0,
    type: 'unknown'
  };
}

/**
 * Select the best depth from a group of events based on uncertainty
 *
 * IMPROVEMENT (Issue #8): Depth uncertainty consideration
 * Prefers depths with lower uncertainty and more station coverage
 * Falls back to simple depth value if uncertainty data is not available
 *
 * @param events - Array of events to select depth from
 * @returns Best depth value or null if no depth available
 */
function selectBestDepth(events: EventData[]): number | null {
  const depthCandidates = events
    .filter(e => e.depth != null)
    .map(e => {
      // Try to get origin data for uncertainty information
      const origin = e.quakeml?.origins?.find(o =>
        o.publicID === e.quakeml?.preferredOriginID
      ) || e.quakeml?.origins?.[0];

      return {
        depth: e.depth!,
        // Use uncertainty if available, otherwise use large default value
        uncertainty: origin?.depth?.uncertainty ?? 999,
        // Use station count if available, otherwise use 0
        stationCount: origin?.quality?.usedStationCount ?? 0
      };
    })
    .sort((a, b) => {
      // Prefer lower uncertainty (difference > 5 km is significant)
      if (Math.abs(a.uncertainty - b.uncertainty) > 5) {
        return a.uncertainty - b.uncertainty;
      }
      // Then prefer more stations
      return b.stationCount - a.stationCount;
    });

  return depthCandidates.length > 0 ? depthCandidates[0].depth : null;
}

/**
 * Average longitudes correctly, handling International Date Line crossing
 *
 * Simple averaging fails when events cross the date line:
 * e.g., avg(179, -179) = 0 (wrong! should be ±180)
 *
 * Solution: Convert to Cartesian coordinates, average, convert back
 *
 * @param lons - Array of longitudes in degrees
 * @returns Average longitude in degrees [-180, 180]
 */
function averageLongitudes(lons: number[]): number {
  if (lons.length === 0) return 0;
  if (lons.length === 1) return lons[0];

  // Check if we're crossing the date line (large spread in raw values)
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // If spread is less than 180°, simple average works fine
  if (maxLon - minLon < 180) {
    return lons.reduce((sum, lon) => sum + lon, 0) / lons.length;
  }

  // Date line crossing: use Cartesian method
  // Convert each longitude to a unit vector on the circle
  let sumX = 0;
  let sumY = 0;

  for (const lon of lons) {
    const radians = lon * Math.PI / 180;
    sumX += Math.cos(radians);
    sumY += Math.sin(radians);
  }

  // Average the vectors and convert back to angle
  const avgX = sumX / lons.length;
  const avgY = sumY / lons.length;

  // atan2 returns angle in radians [-π, π]
  const avgRadians = Math.atan2(avgY, avgX);
  return avgRadians * 180 / Math.PI;
}

/**
 * Get location uncertainty weight for an event
 *
 * Weight is inversely proportional to uncertainty:
 * - Lower uncertainty = higher weight
 * - Missing uncertainty data = weight of 1 (neutral)
 *
 * @param event - Event to get weight for
 * @returns Weight value (higher = more reliable location)
 */
function getLocationWeight(event: EventData): number {
  // Try to get uncertainty from QuakeML origin data
  const origin = event.quakeml?.origins?.find(o =>
    o.publicID === event.quakeml?.preferredOriginID
  ) || event.quakeml?.origins?.[0];

  // Get horizontal uncertainty (prefer combined, fall back to lat/lon)
  let horizontalUncertainty: number | null = null;

  // Normalize everything to KILOMETRES before weighting: QuakeML horizontalUncertainty
  // is in metres, and lat/lon uncertainties are in degrees (~111 km/deg). Mixing units
  // here gave identical-quality events wildly different merge weights.
  if (origin?.uncertainty?.horizontalUncertainty != null) {
    horizontalUncertainty = origin.uncertainty.horizontalUncertainty / 1000; // m -> km
  } else if (origin?.latitude?.uncertainty != null && origin?.longitude?.uncertainty != null) {
    // Geometric mean of lat/lon uncertainty (degrees) converted to km
    horizontalUncertainty = Math.sqrt(
      origin.latitude.uncertainty * origin.longitude.uncertainty
    ) * 111;
  }

  // Also check for top-level event uncertainty fields (from CSV/simple formats)
  if (horizontalUncertainty == null) {
    if (event.horizontal_uncertainty != null) {
      horizontalUncertainty = event.horizontal_uncertainty;
    } else if (event.latitude_uncertainty != null && event.longitude_uncertainty != null) {
      // degrees -> km
      horizontalUncertainty = Math.sqrt(
        event.latitude_uncertainty * event.longitude_uncertainty
      ) * 111;
    }
  }

  // If no uncertainty data, return neutral weight
  if (horizontalUncertainty == null || horizontalUncertainty <= 0) {
    return 1.0;
  }

  // Weight = 1 / uncertainty (with minimum to prevent extreme weights)
  // Clamp uncertainty to reasonable range (0.1 km to 100 km)
  const clampedUncertainty = Math.max(0.1, Math.min(horizontalUncertainty, 100));
  return 1.0 / clampedUncertainty;
}

/**
 * Calculate uncertainty-weighted average location
 *
 * Uses inverse-variance weighting: events with lower location uncertainty
 * contribute more to the final average location.
 *
 * @param events - Array of events to average
 * @returns Object with weighted average latitude and longitude
 */
function weightedLocationAverage(events: EventData[]): { latitude: number; longitude: number } {
  if (events.length === 0) {
    return { latitude: 0, longitude: 0 };
  }
  if (events.length === 1) {
    return { latitude: events[0].latitude, longitude: events[0].longitude };
  }

  // Calculate weights for each event
  const weights = events.map(e => getLocationWeight(e));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // If all weights are zero (shouldn't happen), fall back to simple average
  if (totalWeight === 0) {
    return {
      latitude: events.reduce((sum, e) => sum + e.latitude, 0) / events.length,
      longitude: averageLongitudes(events.map(e => e.longitude)),
    };
  }

  // Weighted latitude average
  const weightedLat = events.reduce((sum, e, i) => sum + e.latitude * weights[i], 0) / totalWeight;

  // Weighted longitude average (with date line handling)
  // Check for date line crossing
  const lons = events.map(e => e.longitude);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  let weightedLon: number;
  if (maxLon - minLon < 180) {
    // No date line crossing - simple weighted average
    weightedLon = events.reduce((sum, e, i) => sum + e.longitude * weights[i], 0) / totalWeight;
  } else {
    // Date line crossing - use Cartesian method with weights
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < events.length; i++) {
      const radians = events[i].longitude * Math.PI / 180;
      sumX += Math.cos(radians) * weights[i];
      sumY += Math.sin(radians) * weights[i];
    }
    weightedLon = Math.atan2(sumY / totalWeight, sumX / totalWeight) * 180 / Math.PI;
  }

  return { latitude: weightedLat, longitude: weightedLon };
}

/**
 * Merge by averaging numerical values
 *
 * IMPROVEMENT (Issue #3): Uses magnitude hierarchy instead of simple average
 * IMPROVEMENT (Issue #8): Uses best depth based on uncertainty
 * IMPROVEMENT: Date line crossing handled correctly for longitude averaging
 * IMPROVEMENT: Uses uncertainty-weighted location averaging
 */
function mergeByAverage(events: EventData[]): MergedEventData {
  // Use uncertainty-weighted location averaging
  const { latitude: avgLat, longitude: avgLon } = weightedLocationAverage(events);

  // IMPROVEMENT: Use magnitude hierarchy instead of averaging
  // Averaging Mw=7.0 with ML=6.5 would give M=6.75 (incorrect due to saturation)
  const bestMagnitude = selectBestMagnitude(events);

  // IMPROVEMENT: Use best depth based on uncertainty instead of simple average
  const bestDepth = selectBestDepth(events);

  // Use the earliest time - use pre-computed _timestamp if available for performance
  const earliestEvent = events.reduce((earliest, e) => {
    const eTime = e._timestamp ?? new Date(e.time).getTime();
    const earliestTime = earliest._timestamp ?? new Date(earliest.time).getTime();
    return eTime < earliestTime ? e : earliest;
  });

  // Spread the highest-quality source event so that QuakeML data, focal mechanisms,
  // agency fields, and all other metadata are preserved on the merged record.
  // The averaged location, best-hierarchy magnitude, best-uncertainty depth, and
  // earliest time then overwrite only the fields that were actually computed.
  const bestQualityEvent = events
    .map(e => ({ event: e, score: calculateQualityScore(e) }))
    .reduce((best, curr) => curr.score > best.score ? curr : best)
    .event;

  return {
    ...bestQualityEvent,
    time: earliestEvent.time,
    latitude: avgLat,
    longitude: avgLon,
    depth: bestDepth,
    magnitude: bestMagnitude.value,
    magnitude_type: bestMagnitude.type !== 'unknown' ? bestMagnitude.type : bestQualityEvent.magnitude_type,
    source: 'merged',
    sourceEvents: buildSourceEvents(events)
  };
}

/**
 * Merge by selecting the newest event
 * Uses pre-computed _timestamp if available for performance
 */
function mergeByNewest(events: EventData[]): MergedEventData {
  const newestEvent = events.reduce((newest, e) => {
    const eTime = e._timestamp ?? new Date(e.time).getTime();
    const newestTime = newest._timestamp ?? new Date(newest.time).getTime();
    return eTime > newestTime ? e : newest;
  });

  return {
    ...newestEvent,
    sourceEvents: buildSourceEvents(events)
  };
}

/**
 * Merge by selecting the most complete event (most non-null fields)
 * Considers both basic fields and QuakeML extended data
 */
function mergeByCompleteness(events: EventData[]): MergedEventData {
  // Score each event once to avoid re-computing the accumulator's score on every
  // reduce iteration (which was O(n²) field-count traversals).
  const scoreEvent = (e: EventData): number => {
    let score = Object.values(e).filter(v => v != null).length;
    if (e.quakeml) {
      score += 10;
      if (e.quakeml.origins && e.quakeml.origins.length > 0) score += 5;
      if (e.quakeml.magnitudes && e.quakeml.magnitudes.length > 0) score += 5;
      if (e.quakeml.picks && e.quakeml.picks.length > 0) score += 3;
      if ((e.quakeml as any).arrivals && (e.quakeml as any).arrivals.length > 0) score += 3;
      if (e.quakeml.focalMechanisms && e.quakeml.focalMechanisms.length > 0) score += 2;
      if (e.quakeml.amplitudes && e.quakeml.amplitudes.length > 0) score += 2;
      const preferredOrigin = e.quakeml.origins?.find(o => o.publicID === e.quakeml?.preferredOriginID) || e.quakeml.origins?.[0];
      if (preferredOrigin?.quality) score += 3;
      if (preferredOrigin?.uncertainty) score += 2;
    }
    return score;
  };

  const mostComplete = events
    .map(e => ({ event: e, score: scoreEvent(e) }))
    .reduce((best, curr) => curr.score > best.score ? curr : best)
    .event;

  return {
    ...mostComplete,
    sourceEvents: buildSourceEvents(events)
  };
}

/**
 * Calculate quality score for an event based on available quality metrics
 *
 * IMPROVEMENT (Issue #6): Quality-based prioritization
 * Scoring system (0-100 points):
 * - Station count: 0-25 points (more stations = better, logarithmic scale)
 * - Azimuthal gap: 0-20 points (lower gap = better, < 180° is good)
 * - Standard error/RMS: 0-15 points (lower error = better)
 * - Magnitude uncertainty: 0-15 points (lower uncertainty = better)
 * - Magnitude type: 0-15 points (Mw > Ms > mb > ML preference)
 * - Evaluation status: 0-10 points (reviewed/final > preliminary)
 *
 * Gracefully handles missing data by skipping unavailable metrics
 *
 * @param event - Event to calculate quality score for
 * @returns Quality score (0-100)
 */
function calculateQualityScore(event: EventData): number {
  let score = 0;
  let maxPossibleScore = 0;

  // Try to get preferred origin for quality metrics
  const origin = event.quakeml?.origins?.find(o =>
    o.publicID === event.quakeml?.preferredOriginID
  ) || event.quakeml?.origins?.[0];

  if (origin?.quality) {
    // Station count (0-25 points, logarithmic scale)
    // 6 stations = 50%, 15 stations = 80%, 30+ stations = 100%
    // Using logarithmic scale because quality improvement diminishes with more stations
    const stationCount = origin.quality.usedStationCount ?? 0;
    if (stationCount > 0) {
      maxPossibleScore += 25;
      // log2(6) ≈ 2.58, log2(30) ≈ 4.9
      const stationScore = Math.min(25, 25 * (Math.log2(stationCount + 1) / Math.log2(32)));
      score += stationScore;
    }

    // Azimuthal gap (0-20 points, lower is better)
    // Gap < 120° = excellent (full score), gap > 270° = poor
    // ISC-GEM considers < 180° as acceptable
    if (origin.quality.azimuthalGap != null) {
      maxPossibleScore += 20;
      const azGap = origin.quality.azimuthalGap;
      if (azGap <= 120) {
        score += 20;
      } else if (azGap <= 180) {
        score += 15;
      } else if (azGap <= 270) {
        score += 10 * (1 - (azGap - 180) / 90);
      }
      // > 270° = 0 points
    }

    // Standard error / RMS residual (0-15 points, lower is better)
    // RMS < 0.3s = excellent, RMS > 1.0s = poor (based on ISC standards)
    if (origin.quality.standardError != null) {
      maxPossibleScore += 15;
      const stdError = origin.quality.standardError;
      if (stdError <= 0.3) {
        score += 15;
      } else if (stdError <= 0.5) {
        score += 12;
      } else if (stdError <= 1.0) {
        score += 8;
      } else if (stdError <= 2.0) {
        score += 4;
      }
      // > 2.0s = 0 points
    }
  }

  // Magnitude metrics
  const mag = event.quakeml?.magnitudes?.find(m =>
    m.publicID === event.quakeml?.preferredMagnitudeID
  ) || event.quakeml?.magnitudes?.[0];

  // Magnitude uncertainty (0-15 points, lower is better)
  // Uncertainty < 0.1 = excellent, > 0.3 = poor
  if (mag?.mag?.uncertainty != null) {
    maxPossibleScore += 15;
    const uncert = mag.mag.uncertainty;
    if (uncert <= 0.1) {
      score += 15;
    } else if (uncert <= 0.2) {
      score += 12;
    } else if (uncert <= 0.3) {
      score += 8;
    } else if (uncert <= 0.5) {
      score += 4;
    }
    // > 0.5 = 0 points
  }

  // Magnitude type preference (0-15 points)
  // Based on ISC-GEM hierarchy: Mw > Ms > mb > ML > Md
  // Mw (moment magnitude) is most reliable and physically meaningful
  if (mag?.type) {
    maxPossibleScore += 15;
    const magType = mag.type.toLowerCase();
    if (magType === 'mw' || magType === 'mww' || magType === 'mwc' || magType === 'mwb') {
      score += 15; // Moment magnitude variants
    } else if (magType === 'ms' || magType === 'ms_20') {
      score += 12; // Surface wave magnitude
    } else if (magType === 'mb' || magType === 'mbb') {
      score += 9; // Body wave magnitude
    } else if (magType === 'ml' || magType === 'mlv') {
      score += 6; // Local magnitude
    } else if (magType === 'md' || magType === 'mc') {
      score += 3; // Duration/coda magnitude
    }
    // Unknown types = 0 points
  }

  // Evaluation status (0-10 points)
  // final/reviewed > confirmed > preliminary
  if (origin?.evaluationStatus || mag?.evaluationStatus) {
    maxPossibleScore += 10;
    const status = (origin?.evaluationStatus || mag?.evaluationStatus || '').toLowerCase();
    if (status === 'final' || status === 'reviewed') {
      score += 10;
    } else if (status === 'confirmed') {
      score += 6;
    } else if (status === 'preliminary') {
      score += 2;
    }
    // rejected/unknown = 0 points
  }

  // If no quality metrics at all were available, fall back to basic completeness scoring.
  if (maxPossibleScore === 0) {
    let basicScore = 0;
    if (event.depth != null) basicScore += 10;
    if (event.magnitude != null) basicScore += 10;
    if (event.time != null) basicScore += 5;
    return basicScore;
  }

  // Normalize against the FIXED 100-point budget (25+20+15+15+15+10), NOT just the metrics
  // that happen to be present. Otherwise an event reporting a single favourable metric and
  // nothing else scores ~100% and outranks a fully-documented, better-constrained event.
  // `score` is already on a 0–100 scale; maxPossibleScore is used only for the fallback above.
  return score;
}

/**
 * Merge by selecting event with best quality metrics
 *
 * IMPROVEMENT (Issue #6): Quality-based selection
 * Selects event with highest quality score based on:
 * - Number of stations used
 * - Azimuthal gap
 * - Location standard error
 * - RMS residuals
 * - Magnitude uncertainty
 *
 * Falls back to first event if no quality data is available
 *
 * @param events - Array of events to merge
 * @returns Merged event with best quality
 */
function mergeByQuality(events: EventData[]): MergedEventData {
  // Pre-score all events once to avoid O(n²) recalculation of the accumulator
  // on every iteration of a plain reduce.
  const bestEvent = events
    .map(e => ({ event: e, score: calculateQualityScore(e) }))
    .reduce((best, curr) => curr.score > best.score ? curr : best)
    .event;

  return {
    ...bestEvent,
    sourceEvents: buildSourceEvents(events)
  };
}

/**
 * Merge by priority (based on source)
 *
 * IMPROVEMENT (Issue #6): Enhanced with quality fallback
 * IMPROVEMENT: Network authority hierarchy for automatic prioritization
 *
 * Priority modes:
 * - 'newest': Select newest event
 * - 'geonet', 'gns', 'usgs', etc.: Select from specific network
 * - 'quality': Use quality-based selection
 * - 'authority': Use network authority hierarchy with regional awareness
 * - Any other value: Try to match network pattern, fall back to authority
 */
function mergeByPriority(events: EventData[], priority: string): MergedEventData {
  let selectedEvent: EventData | undefined;

  if (priority === 'newest') {
    selectedEvent = events.reduce((newest, e) => {
      const eTime = (e as any)._timestamp ?? new Date(e.time).getTime();
      const newestTime = (newest as any)._timestamp ?? new Date(newest.time).getTime();
      return eTime > newestTime ? e : newest;
    });
  } else if (priority === 'quality') {
    // Use quality-based selection
    return mergeByQuality(events);
  } else if (priority === 'authority') {
    // Use network authority hierarchy with regional awareness
    selectedEvent = selectByNetworkAuthority(events);
  } else {
    // Try to find event from specified network
    const lowerPriority = priority.toLowerCase();
    selectedEvent = events.find(e => e.source.toLowerCase().includes(lowerPriority));

    // If not found, use network authority hierarchy
    if (!selectedEvent) {
      console.log(`[Merge] Priority source '${priority}' not found, using network authority hierarchy`);
      selectedEvent = selectByNetworkAuthority(events);
    }
  }

  return {
    ...selectedEvent,
    sourceEvents: buildSourceEvents(events)
  };
}

/**
 * Preview merge operation without saving to database
 * Returns duplicate groups for QC visualization
 */
export async function previewMerge(
  sourceCatalogues: SourceCatalogue[],
  config: MergeConfig
) {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }

  // Fetch events from all source catalogues
  const allEvents: EventData[] = [];
  const catalogueColors: Record<string, string> = {};
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  for (let i = 0; i < sourceCatalogues.length; i++) {
    const catalogue = sourceCatalogues[i];
    const catalogueIdStr = String(catalogue.id);
    const events = await dbQueries.getEventsByCatalogueId(catalogueIdStr);
    const eventsArray = Array.isArray(events) ? events : events.data || [];

    // Assign color to catalogue
    catalogueColors[catalogueIdStr] = colors[i % colors.length];

    allEvents.push(...eventsArray.map(e => ({
      ...e,
      source: catalogue.source || catalogue.name || 'unknown',
      catalogueId: catalogueIdStr,
      catalogueName: catalogue.name,
    } as EventData)));
  }

  console.log(`[Preview] Loaded ${allEvents.length} events from ${sourceCatalogues.length} catalogues`);

  // Perform merge to get duplicate groups
  const duplicateGroups = performMergeWithGroups(allEvents, config);

  // Calculate statistics
  const totalEventsBefore = allEvents.length;
  const duplicateGroupsCount = duplicateGroups.filter(g => g.events.length > 1).length;
  const totalEventsAfter = duplicateGroups.length;
  const duplicatesRemoved = totalEventsBefore - totalEventsAfter;

  // Identify suspicious matches — use the flag already set by performMergeWithGroups
  // to avoid calling validateEventGroup a second time (which would double-log conflicts).
  const suspiciousGroups = duplicateGroups.filter(group => group.isSuspicious);

  return {
    duplicateGroups: duplicateGroups.map(group => ({
      id: group.id,
      events: group.events.map(e => ({
        id: e.id,
        time: e.time,
        latitude: e.latitude,
        longitude: e.longitude,
        depth: e.depth,
        magnitude: e.magnitude,
        source: e.source,
        catalogueId: e.catalogueId,
        catalogueName: (e as any).catalogueName,
        // Quality metrics
        magnitude_type: e.magnitude_type,
        magnitude_uncertainty: e.magnitude_uncertainty,
        used_station_count: e.used_station_count,
        azimuthal_gap: e.azimuthal_gap,
        standard_error: e.standard_error,
        depth_uncertainty: e.depth_uncertainty,
      })),
      selectedEventIndex: group.selectedEventIndex,
      isSuspicious: group.isSuspicious,
      validationWarnings: group.validationWarnings,
    })),
    statistics: {
      totalEventsBefore,
      totalEventsAfter,
      duplicateGroupsCount,
      duplicatesRemoved,
      suspiciousGroupsCount: suspiciousGroups.length,
    },
    catalogueColors,
  };
}

/**
 * Perform merge and return duplicate groups with metadata
 */
function performMergeWithGroups(
  events: EventData[],
  config: MergeConfig
): Array<{
  id: string;
  events: EventData[];
  selectedEventIndex: number;
  isSuspicious: boolean;
  validationWarnings: string[];
}> {
  // Use the SAME grouping the persist path uses so the preview stats, groups, and
  // selected representative match exactly what mergeCatalogues will write. Each match
  // group corresponds 1:1 to a merged output event.
  const matchGroups = groupMatchingEvents(events, config);

  return matchGroups.map((matchGroup, i) => {
    const matchingEvents = matchGroup.events;
    const validationWarnings: string[] = [];

    // A regrouped group was salvaged from a larger cluster that failed consistency
    // validation (the same split the persist path performs). Flag it for the reviewer.
    if (matchGroup.regrouped) {
      validationWarnings.push(
        'Salvaged from a larger matched cluster that failed consistency validation and was split.'
      );
    }

    const isSuspicious =
      matchGroup.regrouped ||
      (matchingEvents.length > 1 && !validateEventGroup(matchingEvents));

    if (matchingEvents.length > 1) {
      // Use the same graduated thresholds as validateEventGroup so the preview
      // warnings are consistent with what actually gates the merge.
      const magnitudes = matchingEvents.map(e => e.magnitude);
      const avgMagPreview = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
      const magRange = Math.max(...magnitudes) - Math.min(...magnitudes);
      const maxMagRange = avgMagPreview < 4.0 ? 0.5
        : avgMagPreview < 5.5 ? 0.8
        : avgMagPreview < 7.0 ? 1.2
        : 1.5;
      if (magRange > maxMagRange) {
        validationWarnings.push(`Large magnitude range: ${magRange.toFixed(2)} units (threshold: ${maxMagRange})`);
      }

      const depths = matchingEvents.filter(e => e.depth != null).map(e => e.depth!);
      if (depths.length > 1) {
        const depthRange = Math.max(...depths) - Math.min(...depths);
        const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
        const maxDepthRange = avgDepth < 70
          ? (avgMagPreview < 5 ? 30 : 50)
          : avgDepth < 300
            ? (avgMagPreview < 5 ? 50 : 100)
            : (avgMagPreview < 5 ? 100 : 150);
        if (depthRange > maxDepthRange) {
          validationWarnings.push(`Large depth range: ${depthRange.toFixed(1)} km (threshold: ${maxDepthRange} km)`);
        }
      }
    }

    // Determine which event would be selected.
    // For 'average' the merged location is interpolated and won't match any source event
    // exactly — identify the contributing event by time alone (mergeByAverage uses the
    // earliest event's timestamp). For all other strategies a single source event is
    // selected wholesale, so all three fields must agree.
    const mergedEvent = mergeEventGroup(matchingEvents, config);
    let selectedEventIndex: number;
    if (config.mergeStrategy === 'average') {
      selectedEventIndex = matchingEvents.findIndex(e => e.time === mergedEvent.time);
    } else {
      selectedEventIndex = matchingEvents.findIndex(e =>
        e.time === mergedEvent.time &&
        e.latitude === mergedEvent.latitude &&
        e.longitude === mergedEvent.longitude
      );
    }

    return {
      id: `group-${i}`,
      events: matchingEvents,
      selectedEventIndex: selectedEventIndex >= 0 ? selectedEventIndex : 0,
      isSuspicious,
      validationWarnings,
    };
  });
}

export async function getMergedCatalogues() {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }
  return dbQueries.getCatalogues();
}

export async function getMergedCatalogue(id: string) {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }
  return dbQueries.getCatalogueById(id);
}

export async function getMergedEvents(catalogueId: string) {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }
  return dbQueries.getEventsByCatalogueId(catalogueId);
}

// Export internal functions for testing
export {
  unionMergeFields,
  UNION_SCALAR_FIELDS,
  UNION_BLOB_FIELDS,
  regroupFailedEvents,
  groupMatchingEvents,
  performMergeWithGroups,
  mergeEventGroup,
  normalizeLongitude,
  getDistanceMultiplier,
  getDepthMultiplier,
  getTimeMultiplier,
  eventsMatchAdaptive,
  validateEventGroup,
  selectBestMagnitude,
  selectBestDepth,
  averageLongitudes,
  calculateQualityScore,
  getMagnitudePriority,
  createSpatialIndex,
  getGridKey,
  getNearbyCells,
  mergeByQuality,
  mergeByPriority,
  mergeByAverage,
  mergeByNewest,
  mergeByCompleteness,
  MAGNITUDE_HIERARCHY,
  getLocationWeight,
  weightedLocationAverage,
  // Network authority hierarchy
  DEFAULT_NETWORK_HIERARCHY,
  REGIONAL_PRIORITIES,
  getNetworkPriority,
  selectByNetworkAuthority,
  // Hierarchical spatial index (R-tree-like)
  boxesIntersect,
  createSearchBox,
  createHierarchicalIndex,
  queryHierarchicalIndex,
  getHierarchicalIndexStats,
  // Focal mechanism merging
  FOCAL_MECHANISM_HIERARCHY,
  getFocalMechanismPriority,
  calculateFocalMechanismQuality,
  selectBestFocalMechanism,
  mergeFocalMechanisms,
  // Magnitude conversion
  convertMLtoMw,
  convertMbtoMw,
  convertMstoMw,
  convertMdtoML,
  convertToMw,
  compareMagnitudes,
  magnitudesEquivalent,
  getMagnitudeTypeCategory,
};

// Export types
export type { NetworkAuthority, RegionalPriority, BoundingBox, HierarchicalSpatialIndex, MagnitudeConversionResult };
