import { dbQueries, MergedEvent } from './db';
import type { ClientSession } from './mongodb';
import { v4 as uuidv4 } from 'uuid';
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
      id: uuidv4(),
      type,
      severity,
      message,
      details,
      timestamp: new Date().toISOString(),
    };

    this.conflicts.push(conflict);

    // Also log to console based on severity
    if (severity === 'error') {
      console.error(`[MergeConflict] ${type}: ${message}`, details);
    } else if (severity === 'warning') {
      console.warn(`[MergeConflict] ${type}: ${message}`);
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

  const catalogueId = uuidv4();

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

    // If export-only mode, return events without saving to database
    if (exportOnly) {
      return {
        success: true,
        catalogueId: null,
        eventCount: mergedEvents.length,
        originalEventCount: allEvents.length,
        events: mergedEvents.map(e => ({
          id: e.id || uuidv4(),
          time: e.time,
          latitude: e.latitude,
          longitude: e.longitude,
          depth: e.depth,
          magnitude: e.magnitude,
          source: e.source,
          sourceEvents: e.sourceEvents
        }))
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
      // Extract QuakeML data if available
      const quakeml = event.quakeml;
      const preferredOrigin = quakeml?.origins?.find(o => o.publicID === quakeml.preferredOriginID) || quakeml?.origins?.[0];
      const preferredMagnitude = quakeml?.magnitudes?.find(m => m.publicID === quakeml.preferredMagnitudeID) || quakeml?.magnitudes?.[0];

      // Build event object with all available QuakeML fields
      const dbEvent: Partial<MergedEvent> & {
        id: string;
        catalogue_id: string;
        time: string;
        latitude: number;
        longitude: number;
        magnitude: number;
        source_events: string;
      } = {
        id: uuidv4(),
        catalogue_id: catalogueId,
        time: event.time,
        latitude: event.latitude,
        longitude: event.longitude,
        depth: event.depth ?? null,
        magnitude: event.magnitude,
        source_events: JSON.stringify(event.sourceEvents)
      };

      // Add QuakeML metadata if available
      if (quakeml) {
        dbEvent.event_public_id = quakeml.publicID;
        dbEvent.event_type = quakeml.type;
        dbEvent.event_type_certainty = quakeml.typeCertainty;

        // Add origin data
        if (preferredOrigin) {
          // Origin uncertainties
          dbEvent.time_uncertainty = preferredOrigin.time.uncertainty;
          dbEvent.latitude_uncertainty = preferredOrigin.latitude.uncertainty;
          dbEvent.longitude_uncertainty = preferredOrigin.longitude.uncertainty;
          dbEvent.depth_uncertainty = preferredOrigin.depth?.uncertainty;

          // Horizontal uncertainty from originUncertainty
          if (preferredOrigin.uncertainty?.horizontalUncertainty) {
            dbEvent.horizontal_uncertainty = preferredOrigin.uncertainty.horizontalUncertainty;
          }

          // Origin metadata (QuakeML/GeoNet/ISC fields)
          dbEvent.depth_type = preferredOrigin.depthType;
          dbEvent.earth_model_id = preferredOrigin.earthModelID;
          dbEvent.method_id = preferredOrigin.methodID;
          dbEvent.region = preferredOrigin.region;

          // Agency/Author from creationInfo
          if (preferredOrigin.creationInfo) {
            dbEvent.agency_id = preferredOrigin.creationInfo.agencyID;
            dbEvent.author = preferredOrigin.creationInfo.author;
          }

          // Origin quality metrics
          if (preferredOrigin.quality) {
            dbEvent.azimuthal_gap = preferredOrigin.quality.azimuthalGap;
            dbEvent.used_phase_count = preferredOrigin.quality.usedPhaseCount;
            dbEvent.used_station_count = preferredOrigin.quality.usedStationCount;
            dbEvent.standard_error = preferredOrigin.quality.standardError;
            dbEvent.minimum_distance = preferredOrigin.quality.minimumDistance;
            dbEvent.maximum_distance = preferredOrigin.quality.maximumDistance;
            dbEvent.associated_phase_count = preferredOrigin.quality.associatedPhaseCount;
            dbEvent.associated_station_count = preferredOrigin.quality.associatedStationCount;
            dbEvent.depth_phase_count = preferredOrigin.quality.depthPhaseCount;
          }

          // Evaluation metadata
          dbEvent.evaluation_mode = preferredOrigin.evaluationMode;
          dbEvent.evaluation_status = preferredOrigin.evaluationStatus;

          // Store full origin quality as JSON
          if (preferredOrigin.quality) {
            dbEvent.origin_quality = JSON.stringify(preferredOrigin.quality);
          }
        }

        // Add magnitude details
        if (preferredMagnitude) {
          dbEvent.magnitude_type = preferredMagnitude.type;
          dbEvent.magnitude_uncertainty = preferredMagnitude.mag.uncertainty;
          dbEvent.magnitude_station_count = preferredMagnitude.stationCount;
          dbEvent.magnitude_method_id = preferredMagnitude.methodID;
          dbEvent.magnitude_evaluation_mode = preferredMagnitude.evaluationMode;
          dbEvent.magnitude_evaluation_status = preferredMagnitude.evaluationStatus;
        }

        // Store complex nested data as JSON
        if (quakeml.origins && quakeml.origins.length > 0) {
          dbEvent.origins = JSON.stringify(quakeml.origins);
        }
        if (quakeml.magnitudes && quakeml.magnitudes.length > 0) {
          dbEvent.magnitudes = JSON.stringify(quakeml.magnitudes);
        }
        if (quakeml.picks && quakeml.picks.length > 0) {
          dbEvent.picks = JSON.stringify(quakeml.picks);
        }
        if ((quakeml as any).arrivals && (quakeml as any).arrivals.length > 0) {
          dbEvent.arrivals = JSON.stringify((quakeml as any).arrivals);
        }
        if (quakeml.focalMechanisms && quakeml.focalMechanisms.length > 0) {
          dbEvent.focal_mechanisms = JSON.stringify(quakeml.focalMechanisms);
        }
        if (quakeml.amplitudes && quakeml.amplitudes.length > 0) {
          dbEvent.amplitudes = JSON.stringify(quakeml.amplitudes);
        }
        if (quakeml.stationMagnitudes && quakeml.stationMagnitudes.length > 0) {
          dbEvent.station_magnitudes = JSON.stringify(quakeml.stationMagnitudes);
        }
        if (quakeml.description && quakeml.description.length > 0) {
          dbEvent.event_descriptions = JSON.stringify(quakeml.description);
        }
        if (quakeml.comment && quakeml.comment.length > 0) {
          dbEvent.comments = JSON.stringify(quakeml.comment);
        }
        if (quakeml.creationInfo) {
          dbEvent.creation_info = JSON.stringify(quakeml.creationInfo);
        }
      }

      dbEvents.push(dbEvent);
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
    // Only update status if not in export-only mode
    if (!exportOnly) {
      await dbQueries.updateCatalogueStatus('error', catalogueId);
    }
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
    const childIndices = node.eventIndices.filter(i => {
      const e = events[i];
      return e.latitude >= bounds.minLat && e.latitude < bounds.maxLat &&
             e.longitude >= bounds.minLon && e.longitude < bounds.maxLon;
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
 * Get all grid cells within distance threshold of a point
 * Returns the center cell and all 8 neighboring cells
 *
 * IMPROVEMENT (Issue #5): Handles International Date Line wrapping
 * Ensures longitude cells wrap correctly at ±180°
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param cellSize - Cell size in degrees
 * @returns Array of grid cell keys
 */
function getNearbyCells(lat: number, lon: number, cellSize: number): string[] {
  const normalizedLon = normalizeLongitude(lon);
  const centerLatCell = Math.floor(lat / cellSize);
  const centerLonCell = Math.floor(normalizedLon / cellSize);

  const cells: string[] = [];

  // Include center cell and all 8 neighbors
  for (let latOffset = -1; latOffset <= 1; latOffset++) {
    for (let lonOffset = -1; lonOffset <= 1; lonOffset++) {
      const latCell = centerLatCell + latOffset;
      let lonCell = centerLonCell + lonOffset;

      // Handle date line wrapping
      // If the longitude cell goes beyond ±180°, wrap it around
      const lonDegrees = lonCell * cellSize;
      if (lonDegrees > 180) {
        lonCell -= Math.floor(360 / cellSize);
      } else if (lonDegrees < -180) {
        lonCell += Math.floor(360 / cellSize);
      }

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
function getDistanceMultiplier(magnitude: number): number {
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
  if (depth == null) {
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
  // Use average magnitude for threshold calculation
  const avgMagnitude = (event1.magnitude + event2.magnitude) / 2;

  // Use maximum depth for conservative threshold (if both have depth)
  let maxDepth: number | null = null;
  if (event1.depth != null && event2.depth != null) {
    maxDepth = Math.max(event1.depth, event2.depth);
  } else if (event1.depth != null) {
    maxDepth = event1.depth;
  } else if (event2.depth != null) {
    maxDepth = event2.depth;
  }

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
 * Core merge algorithm - matches events across catalogues
 *
 * Performance Optimization: Uses spatial indexing to reduce complexity from O(n²) to O(n log n)
 * for large datasets. The spatial grid limits the search space to nearby events only.
 *
 * IMPROVEMENTS:
 * - Issue #10: Pre-compute timestamps for efficient sorting
 * - Issue #1, #2: Use adaptive thresholds for matching
 * - Issue #7: Fix continue→break bug in time threshold check
 */
function performMerge(
  events: EventData[],
  config: MergeConfig
): MergedEventData[] {
  const mergedEvents: MergedEventData[] = [];
  const processedIndices = new Set<number>();

  // IMPROVEMENT (Issue #10): Pre-compute timestamps for efficient sorting
  // Avoids repeated date parsing during sort (O(n log n) operations)
  const eventsWithTimestamps = events.map(e => ({
    ...e,
    _timestamp: new Date(e.time).getTime()
  }));

  // Sort events by pre-computed timestamp
  const sortedEvents = eventsWithTimestamps.sort((a, b) => a._timestamp - b._timestamp);

  // Performance Optimization: Create spatial index for fast geographic lookups
  // This reduces the number of distance calculations from O(n²) to O(n log n)
  const spatialIndex = createSpatialIndex(sortedEvents, config.distanceThreshold);
  console.log(`[Merge] Created spatial index with ${spatialIndex.grid.size} grid cells (cell size: ${spatialIndex.cellSize.toFixed(4)}°)`);

  for (let i = 0; i < sortedEvents.length; i++) {
    if (processedIndices.has(i)) continue;

    const currentEvent = sortedEvents[i];
    const matchingEvents: EventData[] = [currentEvent];
    processedIndices.add(i);

    // Performance Optimization: Only search events in nearby grid cells
    const nearbyCells = getNearbyCells(
      currentEvent.latitude,
      currentEvent.longitude,
      spatialIndex.cellSize
    );

    const candidateIndices = new Set<number>();
    for (const cellKey of nearbyCells) {
      const cellIndices = spatialIndex.grid.get(cellKey) || [];
      cellIndices.forEach(idx => {
        if (idx > i && !processedIndices.has(idx)) {
          candidateIndices.add(idx);
        }
      });
    }

    // Find all matching events within the candidate set
    // Sort candidates by timestamp for efficient early termination
    // (spatial grid returns unsorted indices)
    const candidateArray = Array.from(candidateIndices).sort(
      (a, b) => sortedEvents[a]._timestamp - sortedEvents[b]._timestamp
    );

    for (let k = 0; k < candidateArray.length; k++) {
      const j = candidateArray[k];
      const candidateEvent = sortedEvents[j];

      // Early termination: since candidates are now sorted by time,
      // if time difference exceeds threshold, all remaining candidates will too
      const timeDiff = Math.abs(currentEvent._timestamp - candidateEvent._timestamp) / 1000; // Convert ms to seconds
      if (timeDiff > config.timeThreshold * getTimeMultiplier(currentEvent.magnitude)) {
        break; // Safe to break since candidates are time-sorted
      }

      // Use adaptive thresholds based on magnitude and depth
      if (eventsMatchAdaptive(
        currentEvent,
        candidateEvent,
        config.timeThreshold,
        config.distanceThreshold
      )) {
        matchingEvents.push(candidateEvent);
        processedIndices.add(j);
      }
    }

    // IMPROVEMENT (Issue #9): Validate event group before merging
    if (matchingEvents.length > 1 && !validateEventGroup(matchingEvents)) {
      console.warn(`[Merge] Skipping suspicious event group with ${matchingEvents.length} events - validation failed`);
      // Process events individually instead of merging
      matchingEvents.forEach(event => {
        const singleEvent = mergeEventGroup([event], config);
        mergedEvents.push(singleEvent);
      });
      continue;
    }

    // Merge the matching events based on strategy
    const mergedEvent = mergeEventGroup(matchingEvents, config);
    mergedEvents.push(mergedEvent);
  }

  console.log(`[Merge] Processed ${sortedEvents.length} events into ${mergedEvents.length} merged events`);
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
  const avgLon = events.reduce((sum, e) => sum + e.longitude, 0) / events.length;
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
    const lonSpread = Math.max(...lons) - Math.min(...lons);

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

  return true;
}

/**
 * Merge a group of matching events based on the selected strategy
 *
 * IMPROVEMENT (Issue #6): Added 'quality' strategy for quality-based selection
 */
function mergeEventGroup(
  events: EventData[],
  config: MergeConfig
): MergedEventData {
  if (events.length === 1) {
    return {
      ...events[0],
      sourceEvents: [{
        catalogueId: events[0].id || 'unknown',
        source: events[0].source,
        originalData: events[0]
      }]
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

  return mergedEvent;
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
const FOCAL_MECHANISM_HIERARCHY: Array<{ patterns: string[]; priority: number; description: string }> = [
  { patterns: ['gcmt', 'globalcmt', 'cmt'], priority: 1, description: 'Global CMT' },
  { patterns: ['geonet', 'gns'], priority: 2, description: 'Regional CMT' },
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
  let maxScore = 0;

  // Station polarity count (0-25 points)
  if (fm.stationPolarityCount != null) {
    maxScore += 25;
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
    maxScore += 20;
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
    maxScore += 30;
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
    maxScore += 15;
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
    maxScore += 10;
    if (fm.evaluationStatus === 'final' || fm.evaluationStatus === 'reviewed') {
      score += 10;
    } else if (fm.evaluationStatus === 'confirmed') {
      score += 7;
    } else if (fm.evaluationStatus === 'preliminary') {
      score += 3;
    }
  }

  // Normalize to 0-100
  return maxScore > 0 ? (score / maxScore) * 100 : 50;
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

    // Get preferred focal mechanism or first one
    const preferredId = event.quakeml.preferredFocalMechanismID;
    const fm = preferredId
      ? event.quakeml.focalMechanisms.find(f => f.publicID === preferredId)
      : event.quakeml.focalMechanisms[0];

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
 * Convert ML (local magnitude) to Mw (moment magnitude)
 *
 * Based on empirical relationships from:
 * - Hanks & Kanamori (1979) for general relationship
 * - Regional calibrations for specific areas
 *
 * General relationship: Mw = 0.67 * ML + 1.17 (for ML < 6.5)
 * Uncertainty: ~0.3 magnitude units
 *
 * @param ml - Local magnitude value
 * @returns Converted Mw value with uncertainty
 */
function convertMLtoMw(ml: number): MagnitudeConversionResult {
  // Scordilis (2006) relationship for global data
  // Mw = 0.67(±0.05) * ML + 1.17(±0.26) for 3.0 ≤ ML ≤ 6.5
  const mw = 0.67 * ml + 1.17;
  return {
    value: Math.round(mw * 100) / 100,
    uncertainty: 0.3,
    method: 'Scordilis (2006): Mw = 0.67*ML + 1.17',
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
  // Mw = 0.85(±0.04) * mb + 1.03(±0.23) for 3.5 ≤ mb ≤ 6.2
  const mw = 0.85 * mb + 1.03;
  return {
    value: Math.round(mw * 100) / 100,
    uncertainty: mb >= 6.0 ? 0.5 : 0.3, // Higher uncertainty near saturation
    method: 'Scordilis (2006): Mw = 0.85*mb + 1.03',
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
  if (lower === 'mb' || lower.startsWith('mb_') || lower === 'mbb') return 'mb';
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
    bounds: { minLat: -48, maxLat: -34, minLon: 165, maxLon: 180 },
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
      if (
        event.latitude >= bounds.minLat &&
        event.latitude <= bounds.maxLat &&
        event.longitude >= bounds.minLon &&
        event.longitude <= bounds.maxLon
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

  // Get first event for regional context
  const referenceEvent = events[0];

  // Score events by network priority and quality
  const scored = events.map(e => ({
    event: e,
    networkPriority: getNetworkPriority(e.source, referenceEvent, customHierarchy),
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

  for (const group of MAGNITUDE_HIERARCHY) {
    if (group.patterns.includes(lowerType)) {
      return group.priority;
    }
  }
  return 100; // Unknown type
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
    if (event.quakeml?.magnitudes && event.quakeml.magnitudes.length > 0) {
      for (const mag of event.quakeml.magnitudes) {
        if (mag.mag?.value != null) {
          candidates.push({
            value: mag.mag.value,
            type: mag.type || 'unknown',
            priority: getMagnitudePriority(mag.type),
            uncertainty: mag.mag.uncertainty ?? 999,
          });
        }
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

  if (origin?.uncertainty?.horizontalUncertainty != null) {
    horizontalUncertainty = origin.uncertainty.horizontalUncertainty;
  } else if (origin?.latitude?.uncertainty != null && origin?.longitude?.uncertainty != null) {
    // Combine lat/lon uncertainties (geometric mean)
    horizontalUncertainty = Math.sqrt(
      origin.latitude.uncertainty * origin.longitude.uncertainty
    );
  }

  // Also check for top-level event uncertainty fields (from CSV/simple formats)
  if (horizontalUncertainty == null) {
    if (event.horizontal_uncertainty != null) {
      horizontalUncertainty = event.horizontal_uncertainty;
    } else if (event.latitude_uncertainty != null && event.longitude_uncertainty != null) {
      horizontalUncertainty = Math.sqrt(
        event.latitude_uncertainty * event.longitude_uncertainty
      );
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

  return {
    time: earliestEvent.time,
    latitude: avgLat,
    longitude: avgLon,
    depth: bestDepth,
    magnitude: bestMagnitude.value,
    source: 'merged',
    sourceEvents: events.map(e => ({
      catalogueId: e.id || 'unknown',
      source: e.source,
      originalData: e
    }))
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
    sourceEvents: events.map(e => ({
      catalogueId: e.id || 'unknown',
      source: e.source,
      originalData: e
    }))
  };
}

/**
 * Merge by selecting the most complete event (most non-null fields)
 * Considers both basic fields and QuakeML extended data
 */
function mergeByCompleteness(events: EventData[]): MergedEventData {
  const mostComplete = events.reduce((best, e) => {
    // Count basic fields
    const eFieldCount = Object.values(e).filter(v => v != null).length;
    const bestFieldCount = Object.values(best).filter(v => v != null).length;

    // Add bonus for QuakeML data
    let eScore = eFieldCount;
    let bestScore = bestFieldCount;

    if (e.quakeml) {
      // Add points for having QuakeML data
      eScore += 10;

      // Add points for each type of detailed data
      if (e.quakeml.origins && e.quakeml.origins.length > 0) eScore += 5;
      if (e.quakeml.magnitudes && e.quakeml.magnitudes.length > 0) eScore += 5;
      if (e.quakeml.picks && e.quakeml.picks.length > 0) eScore += 3;
      if ((e.quakeml as any).arrivals && (e.quakeml as any).arrivals.length > 0) eScore += 3;
      if (e.quakeml.focalMechanisms && e.quakeml.focalMechanisms.length > 0) eScore += 2;
      if (e.quakeml.amplitudes && e.quakeml.amplitudes.length > 0) eScore += 2;

      // Add points for quality metrics
      const preferredOrigin = e.quakeml.origins?.find(o => o.publicID === e.quakeml?.preferredOriginID) || e.quakeml.origins?.[0];
      if (preferredOrigin?.quality) eScore += 3;
      if (preferredOrigin?.uncertainty) eScore += 2;
    }

    if (best.quakeml) {
      bestScore += 10;
      if (best.quakeml.origins && best.quakeml.origins.length > 0) bestScore += 5;
      if (best.quakeml.magnitudes && best.quakeml.magnitudes.length > 0) bestScore += 5;
      if (best.quakeml.picks && best.quakeml.picks.length > 0) bestScore += 3;
      if ((best.quakeml as any).arrivals && (best.quakeml as any).arrivals.length > 0) bestScore += 3;
      if (best.quakeml.focalMechanisms && best.quakeml.focalMechanisms.length > 0) bestScore += 2;
      if (best.quakeml.amplitudes && best.quakeml.amplitudes.length > 0) bestScore += 2;

      const preferredOrigin = best.quakeml.origins?.find(o => o.publicID === best.quakeml?.preferredOriginID) || best.quakeml.origins?.[0];
      if (preferredOrigin?.quality) bestScore += 3;
      if (preferredOrigin?.uncertainty) bestScore += 2;
    }

    return eScore > bestScore ? e : best;
  });

  return {
    ...mostComplete,
    sourceEvents: events.map(e => ({
      catalogueId: e.id || 'unknown',
      source: e.source,
      originalData: e
    }))
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

  // Normalize score to 0-100 if we have quality data
  // If no quality data available, return 0 (will fall back to other criteria)
  if (maxPossibleScore === 0) {
    // No quality metrics available - use fallback scoring based on basic completeness
    let basicScore = 0;
    if (event.depth != null) basicScore += 10;
    if (event.magnitude != null) basicScore += 10;
    if (event.time != null) basicScore += 5;
    return basicScore;
  }

  return (score / maxPossibleScore) * 100;
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
  const bestEvent = events.reduce((best, e) => {
    const eScore = calculateQualityScore(e);
    const bestScore = calculateQualityScore(best);
    return eScore > bestScore ? e : best;
  });

  return {
    ...bestEvent,
    sourceEvents: events.map(e => ({
      catalogueId: e.id || 'unknown',
      source: e.source,
      originalData: e
    }))
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
    selectedEvent = events.reduce((newest, e) =>
      new Date(e.time) > new Date(newest.time) ? e : newest
    );
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
    sourceEvents: events.map(e => ({
      catalogueId: e.id || 'unknown',
      source: e.source,
      originalData: e
    }))
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

  // Identify suspicious matches
  const suspiciousGroups = duplicateGroups.filter(group => {
    if (group.events.length < 2) return false;
    return !validateEventGroup(group.events);
  });

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
  const groups: Array<{
    id: string;
    events: EventData[];
    selectedEventIndex: number;
    isSuspicious: boolean;
    validationWarnings: string[];
  }> = [];
  const processedIndices = new Set<number>();

  // Pre-compute timestamps for efficient sorting
  const eventsWithTimestamps = events.map(e => ({
    ...e,
    _timestamp: new Date(e.time).getTime()
  }));

  // Sort events by pre-computed timestamp
  const sortedEvents = eventsWithTimestamps.sort((a, b) => a._timestamp - b._timestamp);

  // Create spatial index
  const spatialIndex = createSpatialIndex(sortedEvents, config.distanceThreshold);

  for (let i = 0; i < sortedEvents.length; i++) {
    if (processedIndices.has(i)) continue;

    const currentEvent = sortedEvents[i];
    const matchingEvents: EventData[] = [currentEvent];
    processedIndices.add(i);

    // Find matching events
    const nearbyCells = getNearbyCells(
      currentEvent.latitude,
      currentEvent.longitude,
      spatialIndex.cellSize
    );

    const candidateIndices = new Set<number>();
    for (const cellKey of nearbyCells) {
      const cellIndices = spatialIndex.grid.get(cellKey) || [];
      cellIndices.forEach(idx => {
        if (idx > i && !processedIndices.has(idx)) {
          candidateIndices.add(idx);
        }
      });
    }

    // Sort candidates by timestamp for efficient early termination
    // (spatial grid returns unsorted indices)
    const candidateArray = Array.from(candidateIndices).sort(
      (a, b) => sortedEvents[a]._timestamp - sortedEvents[b]._timestamp
    );

    for (let k = 0; k < candidateArray.length; k++) {
      const j = candidateArray[k];
      const candidateEvent = sortedEvents[j];

      // Early termination: since candidates are now sorted by time,
      // if time difference exceeds threshold, all remaining candidates will too
      const timeDiff = Math.abs(currentEvent._timestamp - candidateEvent._timestamp) / 1000; // Convert ms to seconds
      if (timeDiff > config.timeThreshold * getTimeMultiplier(currentEvent.magnitude)) {
        break; // Safe to break since candidates are time-sorted
      }

      if (eventsMatchAdaptive(
        currentEvent,
        candidateEvent,
        config.timeThreshold,
        config.distanceThreshold
      )) {
        matchingEvents.push(candidateEvent);
        processedIndices.add(j);
      }
    }

    // Validate group and collect warnings
    const isSuspicious = matchingEvents.length > 1 && !validateEventGroup(matchingEvents);
    const validationWarnings: string[] = [];

    if (matchingEvents.length > 1) {
      // Check magnitude consistency
      const magnitudes = matchingEvents.map(e => e.magnitude);
      const magRange = Math.max(...magnitudes) - Math.min(...magnitudes);
      if (magRange > 1.0) {
        validationWarnings.push(`Large magnitude range: ${magRange.toFixed(2)} units`);
      }

      // Check depth consistency
      const depths = matchingEvents.filter(e => e.depth != null).map(e => e.depth!);
      if (depths.length > 1) {
        const depthRange = Math.max(...depths) - Math.min(...depths);
        const maxDepth = Math.max(...depths);
        const threshold = maxDepth > 300 ? 200 : 100;
        if (depthRange > threshold) {
          validationWarnings.push(`Large depth range: ${depthRange.toFixed(1)} km`);
        }
      }
    }

    // Determine which event would be selected
    const mergedEvent = mergeEventGroup(matchingEvents, config);
    const selectedEventIndex = matchingEvents.findIndex(e =>
      e.time === mergedEvent.time &&
      e.latitude === mergedEvent.latitude &&
      e.longitude === mergedEvent.longitude
    );

    groups.push({
      id: `group-${i}`,
      events: matchingEvents,
      selectedEventIndex: selectedEventIndex >= 0 ? selectedEventIndex : 0,
      isSuspicious,
      validationWarnings,
    });
  }

  return groups;
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
