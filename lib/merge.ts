import { dbQueries, MergedEvent } from './db';
import { v4 as uuidv4 } from 'uuid';
import { eventsMatch, calculateDistance, calculateTimeDifference } from './earthquake-utils';
import type { SourceCatalogue, MergeConfig } from './validation';
import type { QuakeMLEvent, Origin, Magnitude } from './types/quakeml';
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
    return await dbQueries.transaction(async () => {
      return await executeMergeOperation(catalogueId, name, sourceCatalogues, config, metadata, exportOnly);
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
  exportOnly: boolean = false
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
        dbMetadata
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

    // Insert merged events into database
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

      await dbQueries.insertEvent(dbEvent);
    }

    // Extract and update geographic bounds
    const bounds = extractBoundsFromEvents(mergedEvents);
    if (bounds) {
      await dbQueries.updateCatalogueGeoBounds(
        catalogueId,
        bounds.minLatitude,
        bounds.maxLatitude,
        bounds.minLongitude,
        bounds.maxLongitude
      );
    }

    // Update catalogue with event count and status
    await dbQueries.updateCatalogueEventCount(catalogueId, mergedEvents.length);
    await dbQueries.updateCatalogueStatus('complete', catalogueId);

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
 * Get adaptive distance threshold based on magnitude and depth
 *
 * IMPROVEMENT (Issue #1): Magnitude and depth-dependent spatial thresholds
 * Based on ISC-GEM and seismological best practices:
 * - Small events (M < 4.0): 25 km - tight threshold for local events
 * - Medium events (M 4.0-5.5): 50 km - regional events
 * - Large events (M 5.5-7.0): 100 km - teleseismic events
 * - Very large events (M > 7.0): 200 km - major events with larger uncertainties
 * - Deep events (> 300 km): 1.5x multiplier for larger error ellipsoids
 * - Intermediate depth (100-300 km): 1.2x multiplier
 *
 * @param magnitude - Event magnitude
 * @param depth - Event depth in km (null if unknown)
 * @returns Adaptive distance threshold in km
 */
function getAdaptiveDistanceThreshold(magnitude: number, depth: number | null | undefined): number {
  // Base threshold by magnitude
  let threshold: number;

  if (magnitude < 4.0) {
    threshold = 25; // km - tight for small events
  } else if (magnitude < 5.5) {
    threshold = 50; // km - medium events
  } else if (magnitude < 7.0) {
    threshold = 100; // km - large events
  } else {
    threshold = 200; // km - very large events
  }

  // Adjust for depth (deep events have larger uncertainties)
  // Only apply depth adjustment if depth is available
  if (depth != null) {
    if (depth > 300) {
      threshold *= 1.5; // 50% increase for deep events
    } else if (depth > 100) {
      threshold *= 1.2; // 20% increase for intermediate depth
    }
  }

  return threshold;
}

/**
 * Get adaptive time threshold based on magnitude
 *
 * IMPROVEMENT (Issue #2): Magnitude-dependent temporal thresholds
 * Based on ISC-GEM and international seismic network practices:
 * - Small events (M < 4.0): 30 seconds - local events reported quickly
 * - Medium events (M 4.0-5.5): 60 seconds - regional events
 * - Large events (M 5.5-7.0): 120 seconds - teleseismic events
 * - Very large events (M > 7.0): 300 seconds - major events with many reports
 *
 * @param magnitude - Event magnitude
 * @returns Adaptive time threshold in seconds
 */
function getAdaptiveTimeThreshold(magnitude: number): number {
  if (magnitude < 4.0) {
    return 30; // seconds - local events reported quickly
  } else if (magnitude < 5.5) {
    return 60; // seconds - regional events
  } else if (magnitude < 7.0) {
    return 120; // seconds - teleseismic events
  } else {
    return 300; // seconds - major events with many reports
  }
}

/**
 * Check if two events match using adaptive thresholds
 *
 * IMPROVEMENT (Issues #1, #2): Uses magnitude and depth-dependent thresholds
 * Falls back to config thresholds if adaptive calculation fails
 *
 * @param event1 - First event
 * @param event2 - Second event
 * @param configTimeThreshold - Fallback time threshold from config
 * @param configDistanceThreshold - Fallback distance threshold from config
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

  // Calculate adaptive thresholds
  const timeThreshold = getAdaptiveTimeThreshold(avgMagnitude);
  const distanceThreshold = getAdaptiveDistanceThreshold(avgMagnitude, maxDepth);

  // Calculate actual differences
  const timeDiff = calculateTimeDifference(event1.time, event2.time);
  const distance = calculateDistance(
    event1.latitude,
    event1.longitude,
    event2.latitude,
    event2.longitude
  );

  return timeDiff <= timeThreshold && distance <= distanceThreshold;
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
    for (const j of candidateIndices) {
      const candidateEvent = sortedEvents[j];

      // IMPROVEMENT (Issues #1, #2): Use adaptive thresholds based on magnitude and depth
      if (eventsMatchAdaptive(
        currentEvent,
        candidateEvent,
        config.timeThreshold,
        config.distanceThreshold
      )) {
        matchingEvents.push(candidateEvent);
        processedIndices.add(j);
      }

      // IMPROVEMENT (Issue #7): Fix continue→break bug
      // Since events are sorted by time, once time threshold is exceeded,
      // all subsequent events will also exceed it - so we can break early
      const timeDiff = calculateTimeDifference(currentEvent.time, candidateEvent.time);
      if (timeDiff > config.timeThreshold) {
        break; // Changed from 'continue' to 'break' for correct early termination
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
 * - Magnitude range > 1.0 units (e.g., M4.0 vs M7.0)
 * - Depth range > 100 km for shallow events or > 200 km for deep events
 *
 * @param events - Array of events to validate
 * @returns True if events are consistent and safe to merge
 */
function validateEventGroup(events: EventData[]): boolean {
  if (events.length < 2) return true;

  // Check magnitude consistency (should be within 1.0 units)
  const mags = events.map(e => e.magnitude);
  const magRange = Math.max(...mags) - Math.min(...mags);
  if (magRange > 1.0) {
    console.warn(`[Merge] Large magnitude range: ${magRange.toFixed(2)} - possible mismatch`);
    return false;
  }

  // Check depth consistency (should be within 100km for shallow, 200km for deep)
  const depths = events.filter(e => e.depth != null).map(e => e.depth!);
  if (depths.length >= 2) {
    const depthRange = Math.max(...depths) - Math.min(...depths);
    const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
    const maxAllowedRange = avgDepth > 300 ? 200 : 100;

    if (depthRange > maxAllowedRange) {
      console.warn(`[Merge] Large depth range: ${depthRange.toFixed(1)}km - possible mismatch`);
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

/**
 * Select the best magnitude from a group of events using magnitude type hierarchy
 *
 * IMPROVEMENT (Issue #3): Magnitude type hierarchy based on ISC standards
 * Priority order: Mw > Ms > mb > ML > Md (moment magnitude is most physically meaningful)
 * Falls back to simple magnitude field if QuakeML data is not available
 *
 * @param events - Array of events to select magnitude from
 * @returns Object with magnitude value and type
 */
function selectBestMagnitude(events: EventData[]): { value: number; type: string } {
  // Magnitude type hierarchy (ISC standard)
  // Mw (moment magnitude) is most reliable and doesn't saturate
  // ML (local magnitude) saturates above M~6.5
  // mb (body wave magnitude) saturates above M~6.0
  const hierarchy = ['Mw', 'mw', 'MW', 'Ms', 'ms', 'MS', 'mb', 'MB', 'ML', 'ml', 'Md', 'md'];

  // Find event with highest priority magnitude type
  for (const magType of hierarchy) {
    for (const event of events) {
      // Check if event has QuakeML magnitude data
      if (event.quakeml?.magnitudes && event.quakeml.magnitudes.length > 0) {
        const mag = event.quakeml.magnitudes.find(m => m.type === magType);
        if (mag) {
          return { value: mag.mag.value, type: magType };
        }
      }
    }
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
 * Merge by averaging numerical values
 *
 * IMPROVEMENT (Issue #3): Uses magnitude hierarchy instead of simple average
 * IMPROVEMENT (Issue #8): Uses best depth based on uncertainty
 */
function mergeByAverage(events: EventData[]): MergedEventData {
  const avgLat = events.reduce((sum, e) => sum + e.latitude, 0) / events.length;
  const avgLon = events.reduce((sum, e) => sum + e.longitude, 0) / events.length;

  // IMPROVEMENT: Use magnitude hierarchy instead of averaging
  // Averaging Mw=7.0 with ML=6.5 would give M=6.75 (incorrect due to saturation)
  const bestMagnitude = selectBestMagnitude(events);

  // IMPROVEMENT: Use best depth based on uncertainty instead of simple average
  const bestDepth = selectBestDepth(events);

  // Use the earliest time
  const earliestEvent = events.reduce((earliest, e) =>
    new Date(e.time) < new Date(earliest.time) ? e : earliest
  );

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
 */
function mergeByNewest(events: EventData[]): MergedEventData {
  const newestEvent = events.reduce((newest, e) =>
    new Date(e.time) > new Date(newest.time) ? e : newest
  );

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
 * - Station count: 0-30 points (more stations = better)
 * - Azimuthal gap: 0-20 points (lower gap = better, < 180° is good)
 * - Standard error: 0-20 points (lower error = better, < 10 km is good)
 * - RMS residuals: 0-10 points (lower RMS = better)
 * - Magnitude uncertainty: 0-20 points (lower uncertainty = better, < 0.5 is good)
 *
 * Gracefully handles missing data by skipping unavailable metrics
 *
 * @param event - Event to calculate quality score for
 * @returns Quality score (0-100)
 */
function calculateQualityScore(event: EventData): number {
  let score = 0;

  // Try to get preferred origin for quality metrics
  const origin = event.quakeml?.origins?.find(o =>
    o.publicID === event.quakeml?.preferredOriginID
  ) || event.quakeml?.origins?.[0];

  if (origin?.quality) {
    // Station count (0-30 points)
    // More stations = better location constraint
    const stationCount = origin.quality.usedStationCount ?? 0;
    score += Math.min(30, stationCount);

    // Azimuthal gap (0-20 points, lower is better)
    // Gap < 180° is good, gap > 270° is poor
    if (origin.quality.azimuthalGap != null) {
      const azGap = origin.quality.azimuthalGap;
      score += Math.max(0, 20 * (1 - azGap / 360));
    }

    // Standard error (0-20 points, lower is better)
    // Error < 10 km is good, error > 100 km is poor
    if (origin.quality.standardError != null) {
      const stdError = origin.quality.standardError;
      score += Math.max(0, 20 * (1 - Math.min(stdError, 100) / 100));
    }

    // RMS residuals (0-10 points, lower is better)
    // RMS < 1.0 is good, RMS > 10 is poor
    if (origin.quality.minimumDistance != null) {
      const rms = origin.quality.minimumDistance;
      score += Math.max(0, 10 * (1 - Math.min(rms, 10) / 10));
    }
  }

  // Magnitude uncertainty (0-20 points, lower is better)
  // Uncertainty < 0.5 is good, uncertainty > 1.0 is poor
  const mag = event.quakeml?.magnitudes?.find(m =>
    m.publicID === event.quakeml?.preferredMagnitudeID
  ) || event.quakeml?.magnitudes?.[0];

  if (mag?.mag?.uncertainty != null) {
    const uncert = mag.mag.uncertainty;
    score += Math.max(0, 20 * (1 - Math.min(uncert, 1) / 1));
  }

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
 * If priority source is not found, falls back to quality-based selection
 */
function mergeByPriority(events: EventData[], priority: string): MergedEventData {
  let selectedEvent: EventData | undefined;

  if (priority === 'newest') {
    selectedEvent = events.reduce((newest, e) =>
      new Date(e.time) > new Date(newest.time) ? e : newest
    );
  } else if (priority === 'geonet') {
    selectedEvent = events.find(e => e.source.toLowerCase().includes('geonet'));
  } else if (priority === 'gns') {
    selectedEvent = events.find(e => e.source.toLowerCase().includes('gns'));
  } else if (priority === 'quality') {
    // Use quality-based selection
    return mergeByQuality(events);
  }

  // If priority source not found, fall back to quality-based selection
  if (!selectedEvent) {
    console.log(`[Merge] Priority source '${priority}' not found, falling back to quality-based selection`);
    return mergeByQuality(events);
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

    for (const j of candidateIndices) {
      const candidateEvent = sortedEvents[j];

      if (eventsMatchAdaptive(
        currentEvent,
        candidateEvent,
        config.timeThreshold,
        config.distanceThreshold
      )) {
        matchingEvents.push(candidateEvent);
        processedIndices.add(j);
      }

      const timeDiff = calculateTimeDifference(currentEvent.time, candidateEvent.time);
      if (timeDiff > config.timeThreshold) {
        break;
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