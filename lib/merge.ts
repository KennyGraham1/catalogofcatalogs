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

        // Add origin uncertainties
        if (preferredOrigin) {
          dbEvent.time_uncertainty = preferredOrigin.time.uncertainty;
          dbEvent.latitude_uncertainty = preferredOrigin.latitude.uncertainty;
          dbEvent.longitude_uncertainty = preferredOrigin.longitude.uncertainty;
          dbEvent.depth_uncertainty = preferredOrigin.depth?.uncertainty;

          // Add origin quality metrics
          if (preferredOrigin.quality) {
            dbEvent.azimuthal_gap = preferredOrigin.quality.azimuthalGap;
            dbEvent.used_phase_count = preferredOrigin.quality.usedPhaseCount;
            dbEvent.used_station_count = preferredOrigin.quality.usedStationCount;
            dbEvent.standard_error = preferredOrigin.quality.standardError;
          }

          // Add evaluation metadata
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
 * Core merge algorithm - matches events across catalogues
 */
function performMerge(
  events: EventData[],
  config: MergeConfig
): MergedEventData[] {
  const mergedEvents: MergedEventData[] = [];
  const processedIndices = new Set<number>();

  // Sort events by time for efficient processing
  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  for (let i = 0; i < sortedEvents.length; i++) {
    if (processedIndices.has(i)) continue;

    const currentEvent = sortedEvents[i];
    const matchingEvents: EventData[] = [currentEvent];
    processedIndices.add(i);

    // Find all matching events
    for (let j = i + 1; j < sortedEvents.length; j++) {
      if (processedIndices.has(j)) continue;

      const candidateEvent = sortedEvents[j];

      // Check if events match based on time and distance thresholds
      if (eventsMatch(
        currentEvent,
        candidateEvent,
        config.timeThreshold,
        config.distanceThreshold
      )) {
        matchingEvents.push(candidateEvent);
        processedIndices.add(j);
      }

      // Optimization: if time difference exceeds threshold, stop searching
      const timeDiff = calculateTimeDifference(currentEvent.time, candidateEvent.time);
      if (timeDiff > config.timeThreshold) {
        break;
      }
    }

    // Merge the matching events based on strategy
    const mergedEvent = mergeEventGroup(matchingEvents, config);
    mergedEvents.push(mergedEvent);
  }

  return mergedEvents;
}

/**
 * Merge a group of matching events based on the selected strategy
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
    case 'priority':
    default:
      mergedEvent = mergeByPriority(events, config.priority);
      break;
  }

  return mergedEvent;
}

/**
 * Merge by averaging numerical values
 */
function mergeByAverage(events: EventData[]): MergedEventData {
  const avgLat = events.reduce((sum, e) => sum + e.latitude, 0) / events.length;
  const avgLon = events.reduce((sum, e) => sum + e.longitude, 0) / events.length;
  const avgMag = events.reduce((sum, e) => sum + e.magnitude, 0) / events.length;

  const depths = events.filter(e => e.depth != null).map(e => e.depth!);
  const avgDepth = depths.length > 0
    ? depths.reduce((sum, d) => sum + d, 0) / depths.length
    : null;

  // Use the earliest time
  const earliestEvent = events.reduce((earliest, e) =>
    new Date(e.time) < new Date(earliest.time) ? e : earliest
  );

  return {
    time: earliestEvent.time,
    latitude: avgLat,
    longitude: avgLon,
    depth: avgDepth,
    magnitude: avgMag,
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
 * Merge by priority (based on source)
 */
function mergeByPriority(events: EventData[], priority: string): MergedEventData {
  let selectedEvent: EventData;

  if (priority === 'newest') {
    selectedEvent = events.reduce((newest, e) =>
      new Date(e.time) > new Date(newest.time) ? e : newest
    );
  } else if (priority === 'geonet') {
    selectedEvent = events.find(e => e.source.toLowerCase().includes('geonet')) || events[0];
  } else if (priority === 'gns') {
    selectedEvent = events.find(e => e.source.toLowerCase().includes('gns')) || events[0];
  } else {
    // Default to first event
    selectedEvent = events[0];
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