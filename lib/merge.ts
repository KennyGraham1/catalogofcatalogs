import { dbQueries, MergedEvent, MergedCatalogue } from './db';
import type { ClientSession } from './mongodb';
import { createId } from './id';
import { calculateDistance, calculateTimeDifference } from './earthquake-utils';
import { horizontalUncertaintyKm, type SourceCatalogue, type MergeConfig } from './validation';
import type { QuakeMLEvent, FocalMechanism, Origin } from './types/quakeml';
import { extractBoundsFromEvents, NZ_NATIONAL_BOUNDS } from './geo-bounds-utils';
import { metricsFromEvent, scoreQualityMetrics } from './quality-scoring';

/** Rows per keyset page when reading a source catalogue for a merge. */
const MERGE_INPUT_PAGE_SIZE = 10000;

/**
 * Every event of one source catalogue, complete even when API responses have an
 * unpaginated cap.
 *
 * Pages are read with the (time, id) keyset cursor, not skip/offset: an event inserted
 * while the merge is reading (e.g. a GeoNet import into a source catalogue) sorts to the
 * front of a newest-first order and shifted every later offset page by one, so the last
 * row of a page was read twice and the new rows never. A keyset page resumes strictly
 * after the last row it returned, so no stored row is read twice or skipped.
 */
async function loadCompleteCatalogueEvents(
  catalogueId: string,
  pageSize: number = MERGE_INPUT_PAGE_SIZE
): Promise<MergedEvent[]> {
  if (!dbQueries) throw new Error('Database not initialized');
  const db = dbQueries;
  if (typeof db.getEventsByCatalogueIdCursor === 'function') {
    const events: MergedEvent[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const page = await db.getEventsByCatalogueIdCursor(catalogueId, {
        limit: pageSize,
        direction: 'desc',
        cursor,
      });
      for (const event of page.data as unknown as MergedEvent[]) {
        // Belt and braces: the keyset cannot repeat a row, but a merge must never
        // double-count one if an adapter's cursor is looser than MongoDB's.
        if (typeof event.id === 'string') {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
        }
        events.push(event);
      }
      if (!page.pagination.hasMore || !page.pagination.nextCursor || page.data.length === 0) return events;
      cursor = page.pagination.nextCursor;
    }
  }

  // Adapters without a keyset read (tests, alternate stores) page by offset.
  const events: MergedEvent[] = [];
  while (true) {
    const result = await db.getEventsByCatalogueId(catalogueId, {
      offset: events.length,
      pageSize,
    });
    // The database interface also permits complete arrays (e.g. alternate adapters).
    if (Array.isArray(result)) return result;
    for (const event of result.data) events.push(event);
    if (events.length >= result.pagination.totalItems) return events;
    if (result.data.length === 0) throw new Error('Catalogue changed while loading merge inputs; please retry');
  }
}

/**
 * The stored catalogue document behind a merge source, for its explicit agency metadata
 * (provider, data source, import source). Best-effort: a missing document or an adapter
 * without the lookup just means the agency is identified from the event rows instead.
 */
async function loadSourceCatalogueDocument(catalogueId: string): Promise<MergedCatalogue | null> {
  const db = dbQueries;
  if (!db || typeof db.getCatalogueById !== 'function') return null;
  try {
    return (await db.getCatalogueById(catalogueId)) ?? null;
  } catch {
    return null;
  }
}

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

/**
 * One contributing report in a merged event's provenance (the `source_events` column).
 * The optional flags say which report each published quantity came from (contract C2):
 * `selected` marks the report whose solution (origin time and epicentre) was published;
 * no report carries it when the epicentre was averaged. `magnitudeSelected` and
 * `depthSelected` mark where the averaged strategy took its magnitude and depth, and
 * `locationWeight` is that report's normalised share of the averaged epicentre.
 */
interface SourceEventEntry {
  catalogueId: string | number;
  source: string;
  originalData: EventData;
  selected?: true;
  magnitudeSelected?: true;
  depthSelected?: true;
  locationWeight?: number;
}

interface MergedEventData extends EventData {
  sourceEvents: SourceEventEntry[];
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

/** Server-side context of a merge request. */
interface MergeOptions {
  /** The session user's id, recorded as the merged catalogue's creator. */
  createdBy?: string | null;
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
  exportOnly: boolean = false,
  options: MergeOptions = {}
) {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }

  const catalogueId = createId();

  // If export-only mode, don't use transactions
  if (exportOnly) {
    return await executeMergeOperation(catalogueId, name, sourceCatalogues, config, metadata, exportOnly, undefined, options);
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
        session,
        options
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

  // A merged catalogue combines agencies whose source_id spaces are independent, so a
  // raw source_id is not unique under one catalogue_id: GeoNet "123" and ISC "123" are
  // different earthquakes, and the (catalogue_id, source_id) unique index silently
  // dropped the second. Qualify by the winning agency; the un-prefixed id survives in
  // source_events for provenance. Leave an already-qualified id alone (re-merge).
  // The qualifying agency is the one the id CAME FROM: for `average` the record's
  // `source` is 'merged', so the base event's source is remembered separately.
  const rawSourceId = fields.source_id;
  const idAgency = (event as { _sourceIdAgency?: string })._sourceIdAgency ?? event.source;
  if (typeof rawSourceId === 'string' && rawSourceId && idAgency && idAgency !== 'merged') {
    const prefix = `${idAgency}:`;
    // Already qualified by ANY agency in this record's provenance (re-merge): leave it.
    const knownAgencies = new Set<string>([idAgency]);
    for (const s of event.sourceEvents ?? []) if (s && typeof s.source === 'string') knownAgencies.add(s.source);
    const alreadyQualified = Array.from(knownAgencies).some((agency) => rawSourceId.startsWith(`${agency}:`));
    if (!alreadyQualified && !rawSourceId.startsWith(prefix)) fields.source_id = prefix + rawSourceId;
  }

  // An averaged record publishes an epicentre (and an earliest origin time) that no single
  // agency solution produced, so nothing that describes one origin solution may be
  // re-derived from the base event's QuakeML: its preferred origin describes a different
  // hypocentre (finding #21).
  const averagedOrigin = (event as { _averagedOrigin?: boolean })._averagedOrigin === true;

  if (quakeml) {
    fields.event_public_id = quakeml.publicID;
    fields.event_type = quakeml.type;
    fields.event_type_certainty = quakeml.typeCertainty;

    if (preferredOrigin && !averagedOrigin) {
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
      const ou = preferredOrigin.uncertainty;
      if (ou?.minHorizontalUncertainty != null) fields.min_horizontal_uncertainty = ou.minHorizontalUncertainty / 1000;
      if (ou?.maxHorizontalUncertainty != null) fields.max_horizontal_uncertainty = ou.maxHorizontalUncertainty / 1000;
      if (ou?.azimuthMaxHorizontalUncertainty != null) fields.azimuth_max_horizontal_uncertainty = ou.azimuthMaxHorizontalUncertainty;
      // The confidence the ellipse above is quoted at belongs to the same origin (C16).
      if (ou?.confidenceLevel != null) fields.confidence_level = ou.confidenceLevel;

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

    // Re-derive magnitude metadata from the base event's QuakeML only when the merge did
    // not already resolve it: for a multi-source merge the hierarchy picked one specific
    // measurement, and its metadata must travel with it rather than be replaced by
    // whatever the base event happened to prefer.
    if (preferredMagnitude && !(event as { _magnitudeResolved?: boolean })._magnitudeResolved) {
      fields.magnitude_type = preferredMagnitude.type;
      fields.magnitude_uncertainty = preferredMagnitude.mag.uncertainty;
      fields.magnitude_station_count = preferredMagnitude.stationCount;
      fields.magnitude_method_id = preferredMagnitude.methodID;
      fields.magnitude_evaluation_mode = preferredMagnitude.evaluationMode;
      fields.magnitude_evaluation_status = preferredMagnitude.evaluationStatus;
    }

    // Complex nested data as JSON strings. Every origin is kept as a supplementary solution;
    // the standalone arrivals and the event creationInfo describe the base event's own
    // solution, so an averaged record does not inherit them.
    if (quakeml.origins?.length) fields.origins = JSON.stringify(quakeml.origins);
    if (quakeml.magnitudes?.length) fields.magnitudes = JSON.stringify(quakeml.magnitudes);
    if (quakeml.picks?.length) fields.picks = JSON.stringify(quakeml.picks);
    if (!averagedOrigin && (quakeml as any).arrivals?.length) fields.arrivals = JSON.stringify((quakeml as any).arrivals);
    if (quakeml.focalMechanisms?.length) fields.focal_mechanisms = JSON.stringify(quakeml.focalMechanisms);
    if (quakeml.amplitudes?.length) fields.amplitudes = JSON.stringify(quakeml.amplitudes);
    if (quakeml.stationMagnitudes?.length) fields.station_magnitudes = JSON.stringify(quakeml.stationMagnitudes);
    if (quakeml.description?.length) fields.event_descriptions = JSON.stringify(quakeml.description);
    if (quakeml.comment?.length) fields.comments = JSON.stringify(quakeml.comment);
    if (!averagedOrigin && quakeml.creationInfo) fields.creation_info = JSON.stringify(quakeml.creationInfo);
  }

  // Null-normalise every optional field so consumers never see `undefined`.
  for (const field of optionalFields) {
    if (fields[field] === undefined) {
      fields[field] = null;
    }
  }

  // Merged-event provenance (contract C2), on every row whatever the caller's field list:
  // how the row was produced and from which catalogues. mergeEventGroup sets these.
  const provenance = event as {
    merge_strategy?: string;
    merge_parameters?: string;
    source_catalogue_ids?: string[];
  };
  fields.merge_strategy = provenance.merge_strategy ?? null;
  fields.merge_parameters = provenance.merge_parameters ?? null;
  fields.source_catalogue_ids = Array.isArray(provenance.source_catalogue_ids)
    ? provenance.source_catalogue_ids
    : null;

  // Quality index Q of the PUBLISHED row (contracts C1/C2), from the same routine and default
  // weights the database uses on insert. A score inherited from a contributing row would
  // describe that row, not this one, so it is always recomputed here.
  const quality = scoreQualityMetrics(metricsFromEvent(fields));
  fields.quality_score = quality.overall;
  fields.quality_grade = quality.grade;

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
  session?: ClientSession,
  options: MergeOptions = {}
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

      // The creator is server-attested (the session user), never client metadata.
      await dbQueries.insertCatalogue(
        catalogueId,
        name,
        JSON.stringify(sourceCatalogues),
        JSON.stringify(config),
        0,
        'processing',
        dbMetadata,
        session,
        { createdBy: options.createdBy ?? null }
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
      const eventsArray = await loadCompleteCatalogueEvents(catalogueIdStr);
      const catalogueAgency = catalogueAgencyOf(catalogue, await loadSourceCatalogueDocument(catalogueIdStr));

      // A loop, not push(...spread): spreading a whole source catalogue as function
      // arguments throws RangeError past the V8 argument limit (~131k), so a
      // national-scale source could not be merged at all.
      const source = catalogue.source || catalogue.name || 'unknown';
      for (const e of eventsArray) {
        allEvents.push({ ...e, source, catalogueId: catalogueIdStr, _catalogueAgency: catalogueAgency } as EventData);
      }
    }

    // Perform the merge
    const mergedEvents = performMerge(allEvents, config);

    // Optional MergedEvent fields — declared once to avoid per-event allocation.
    const OPTIONAL_DB_FIELDS: ReadonlyArray<string> = [
      'source_id', 'region', 'location_name',
      'event_public_id', 'event_type', 'event_type_certainty', 'source_event_type',
      'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
      'depth_uncertainty', 'horizontal_uncertainty',
      'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'azimuth_max_horizontal_uncertainty',
      'confidence_level',
      'depth_type', 'earth_model_id', 'method_id',
      'agency_id', 'author',
      'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count',
      'magnitude_method_id', 'magnitude_evaluation_mode', 'magnitude_evaluation_status',
      'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
      'minimum_distance', 'maximum_distance',
      'associated_phase_count', 'associated_station_count', 'depth_phase_count',
      'evaluation_mode', 'evaluation_status',
      'preferred_origin_id', 'preferred_magnitude_id', 'preferred_focal_mechanism_id',
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
    // This is much faster than individual inserts and only triggers cache invalidation once.
    //
    // Record what MongoDB actually WROTE, not what was submitted: bulkInsertEvents drops rows
    // repeating a source_id within the batch and skips rows colliding with the
    // (catalogue_id, source_id) unique index. Persisting mergedEvents.length instead would
    // make every deduplicated row a phantom event in the merged catalogue's event_count.
    let insertedEventCount = 0;
    if (dbEvents.length > 0) {
      insertedEventCount = await dbQueries.bulkInsertEvents(dbEvents, session);
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
    await dbQueries.updateCatalogueEventCount(catalogueId, insertedEventCount, session);
    await dbQueries.updateCatalogueStatus('complete', catalogueId, session);

    return {
      success: true,
      catalogueId,
      eventCount: insertedEventCount,
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

  // A node whose extent has collapsed to a point (many events at one location)
  // cannot be split by position: quartering it put every event into all four
  // children, so a query returned each record 4^depth times.
  if (maxLat - minLat <= 0 && maxLon - minLon <= 0) {
    return;
  }

  // Create 4 child nodes (quadtree-style split). Each event goes to exactly ONE
  // child: below the midpoint to the lower quadrant, at or above it to the upper.
  const childBounds: BoundingBox[] = [
    { minLat, maxLat: midLat, minLon, maxLon: midLon },       // SW
    { minLat, maxLat: midLat, minLon: midLon, maxLon },       // SE
    { minLat: midLat, maxLat, minLon, maxLon: midLon },       // NW
    { minLat: midLat, maxLat, minLon: midLon, maxLon },       // NE
  ];
  const childIndexLists: number[][] = [[], [], [], []];
  for (const i of node.eventIndices) {
    const e = events[i];
    const upperLat = e.latitude >= midLat ? 1 : 0;
    const upperLon = e.longitude >= midLon ? 1 : 0;
    childIndexLists[upperLat * 2 + upperLon].push(i);
  }

  childBounds.forEach((bounds, k) => {
    const childIndices = childIndexLists[k];
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
  });

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
  // Leaves are disjoint by construction; the de-duplication guards any index
  // built by an older layout that stored an event in more than one leaf.
  return results.length > 1 ? Array.from(new Set(results)) : results;
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
    for (const index of node.eventIndices) results.push(index);
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
 */
function getGridKey(lat: number, lon: number, cellSize: number): string {
  // Storage keys live in [-180, 180): +180 is the same meridian as -180 and must
  // share its cell, otherwise a +180 event sits in a cell no neighbourhood query
  // ever visits and its -180 twin is never paired.
  const normalizedLon = normalizeLongitude(lon);
  const latCell = Math.floor(lat / cellSize);
  const lonCell = Math.floor((normalizedLon >= 180 ? -180 : normalizedLon) / cellSize);
  return `${latCell},${lonCell}`;
}

/**
 * Get all grid cells within distance threshold of a point.
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
 */
// Upper bounds of the adaptive multipliers, used to size the spatial candidate
// neighbourhood so it always covers the widest threshold eventsMatchAdaptive can accept.
const MAX_DISTANCE_MULTIPLIER = 4.0;
const MAX_DEPTH_MULTIPLIER = 1.5;
/** Largest value getTimeMultiplier can return (M >= 7). Keep in sync with that function. */
const MAX_TIME_MULTIPLIER = 3.0;
/** Beyond this latitude the longitude cell neighbourhood is not used as a filter. */
const POLAR_LATITUDE_DEG = 80;

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
 * How far apart two reports are in origin time and epicentre, measured against the
 * matching windows the pair is judged by (the configured windows widened for the pair's
 * magnitude and depth).
 */
interface PairSeparation {
  /** |Δt| in seconds. */
  timeDiff: number;
  /** Great-circle epicentral distance in km. */
  distance: number;
  /** The pair's adaptive time window (s) and distance window (km). */
  timeWindow: number;
  distanceWindow: number;
  /** Inside both windows: the pair is a duplicate candidate. */
  matches: boolean;
  /**
   * Normalised space-time separation |Δt|/τ + d/δ. Each term is in [0, 1] for a matching
   * pair, so time and distance count equally whatever the window sizes; this is the
   * distance association ranks candidates by (Infinity when it cannot be measured).
   */
  cost: number;
}

function pairSeparation(
  event1: EventData,
  event2: EventData,
  configTimeThreshold: number,
  configDistanceThreshold: number
): PairSeparation {
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

  // Calculate actual differences (from the pre-computed timestamps when grouping set them).
  const timeDiff =
    typeof event1._timestamp === 'number' && typeof event2._timestamp === 'number'
      ? Math.abs(event1._timestamp - event2._timestamp) / 1000
      : calculateTimeDifference(event1.time, event2.time);
  const distance = calculateDistance(
    event1.latitude,
    event1.longitude,
    event2.latitude,
    event2.longitude
  );

  // A zero-width window admits only an exact coincidence, which then costs nothing.
  const share = (value: number, window: number) => (window > 0 ? value / window : value > 0 ? Infinity : 0);
  const cost = share(timeDiff, effectiveTimeThreshold) + share(distance, effectiveDistanceThreshold);

  return {
    timeDiff,
    distance,
    timeWindow: effectiveTimeThreshold,
    distanceWindow: effectiveDistanceThreshold,
    matches: timeDiff <= effectiveTimeThreshold && distance <= effectiveDistanceThreshold,
    cost: Number.isFinite(cost) ? cost : Infinity,
  };
}

/**
 * Check if two events match using adaptive thresholds
 */
function eventsMatchAdaptive(
  event1: EventData,
  event2: EventData,
  configTimeThreshold: number,
  configDistanceThreshold: number
): boolean {
  return pairSeparation(event1, event2, configTimeThreshold, configDistanceThreshold).matches;
}

/** Total order on numbers that tolerates Infinity (a - b would give NaN for two of them). */
function compareNumbers(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Origin time of an event in ms, using the pre-computed value when there is one. */
function eventTimestamp(e: EventData): number {
  return typeof e._timestamp === 'number' ? e._timestamp : new Date(e.time).getTime();
}

/**
 * The same-source rule's identity: the source CATALOGUE. Each catalogue is deduplicated
 * internally, so two of its records inside one window are two earthquakes. Two catalogues
 * that merely share a display name (two imports both called "GeoNet - Automated Import")
 * are different sources whose common events must still pair; keying on the name kept such
 * duplicates apart. Records without a catalogue id (direct callers) fall back to the label.
 */
function sourceKey(e: EventData): string {
  const id = e.catalogueId;
  return id != null && id !== '' ? `catalogue:${String(id)}` : `source:${String(e.source ?? '')}`;
}

/** A fixed record order — origin time, then source, then id — for every deterministic tie-break. */
function compareRecordOrder(a: EventData, b: EventData): number {
  const ta = eventTimestamp(a);
  const tb = eventTimestamp(b);
  const fa = Number.isFinite(ta);
  const fb = Number.isFinite(tb);
  if (fa && fb && ta !== tb) return ta - tb;
  if (fa !== fb) return fa ? -1 : 1;
  return sourceKey(a).localeCompare(sourceKey(b)) || String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

/**
 * How far apart two reports' magnitudes are, used ONLY to break ties between candidates
 * that are equally close in time and space ("magnitude is not part of the matching test").
 * Differences on the common Mw scale rank ahead of raw differences between scales that
 * cannot be homogenised; with no usable magnitude the pair ranks last.
 */
function magnitudeTieKey(a: EventData, b: EventData): number {
  const mwA = mwForOrdering(a);
  const mwB = mwForOrdering(b);
  if (mwA != null && mwB != null) return Math.abs(mwA - mwB);
  if (Number.isFinite(a.magnitude) && Number.isFinite(b.magnitude)) return 100 + Math.abs(a.magnitude - b.magnitude);
  return Infinity;
}

/**
 * IMPROVEMENT (Issue #9): Re-group events from a failed validation group.
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
      // Component still invalid — split it into the largest self-consistent sub-groups
      // instead of discarding every pairing in it.
      result.push(...splitInconsistentGroup(group, config));
    }
  }

  return result;
}

/**
 * Mw-equivalent of an event's magnitude, or null when it has no usable magnitude or no
 * magnitude type convertToMw understands. Used only to ORDER candidates, never to accept
 * one — the gate still has the final say.
 */
function mwForOrdering(e: EventData): number | null {
  if (e.magnitude == null || !Number.isFinite(e.magnitude)) return null;
  return convertToMw(e.magnitude, e.magnitude_type)?.value ?? null;
}

/**
 * Split a matched-but-inconsistent group into the largest sub-groups that each pass
 * validateEventGroup.
 */
function splitInconsistentGroup(events: EventData[], config: MergeConfig): EventData[][] {
  // Seeds are taken in record order (earliest report first), never in whatever order the
  // component search happened to visit them.
  const remaining = events.slice().sort(compareRecordOrder);
  const result: EventData[][] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const subGroup: EventData[] = [seed];

    // Candidates are tried nearest first in the space-time separation the matching window
    // itself measures (|Δt|/τ + d/δ); magnitude agreement only breaks exact ties. Ranking by
    // magnitude closeness paired an agency's report with a distant, late report of equal
    // magnitude and left its obvious 1 s / 0.4 km duplicate standing as a second earthquake
    // (finding #26). Snapshot the order before growing; accepted candidates leave
    // `remaining` so they are not re-seeded on a later pass.
    const ordered = remaining
      .map(candidate => ({
        candidate,
        cost: pairSeparation(seed, candidate, config.timeThreshold, config.distanceThreshold).cost,
        tie: magnitudeTieKey(seed, candidate),
      }))
      .sort((a, b) =>
        compareNumbers(a.cost, b.cost) || compareNumbers(a.tie, b.tie) || compareRecordOrder(a.candidate, b.candidate)
      )
      .map(entry => entry.candidate);

    for (const candidate of ordered) {
      const matchesAll = subGroup.every(member =>
        eventsMatchAdaptive(member, candidate, config.timeThreshold, config.distanceThreshold)
      );
      if (!matchesAll) continue;
      // Speculative check — do not log a conflict for a trial that we simply decline.
      if (!validateEventGroup([...subGroup, candidate], false)) continue;

      subGroup.push(candidate);
      remaining.splice(remaining.indexOf(candidate), 1);
    }

    result.push(subGroup);
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
  // True when a member of this group lost an alternative pairing that was nearly as close
  // as the one kept (AMBIGUITY_FACTOR): another report inside its matching window that the
  // one-to-one rule assigned elsewhere. The closest pairing was kept; the preview flags the
  // group for review because time and distance alone barely separate the two choices.
  ambiguous: boolean;
}

/** A pair of reports from different catalogues that fall inside each other's window. */
interface CandidateEdge {
  a: number;
  b: number;
  cost: number;
  tie: number;
}

/**
 * A pairing is a close call when the best alternative a report lost is within twice the
 * normalised separation of the pairing it kept, plus a tenth of a window: on origin time
 * and epicentre alone the two cannot be told apart with confidence, so the preview flags
 * the group for review. A clearly worse alternative (the dense-sequence norm) is not flagged.
 */
const AMBIGUITY_FACTOR = 2;
const AMBIGUITY_MARGIN = 0.1;

/**
 * Upper bound on association rounds. A round only follows one in which a cluster failed
 * the consistency gate (its members may then pair elsewhere), and each such round
 * exhausts at least one pairing, so this is a safety net rather than a working limit.
 */
const MAX_ASSOCIATION_ROUNDS = 10;

/**
 * Every pair of reports from different catalogues that match (eventsMatchAdaptive), with
 * its normalised space-time separation. `sorted` is in record (time) order, so each
 * report's candidates are the contiguous slice after it inside the widest window any
 * pair can earn.
 */
function gatherCandidateEdges(sorted: EventData[], keys: string[], config: MergeConfig): CandidateEdge[] {
  const edges: CandidateEdge[] = [];
  const spatialIndex = createSpatialIndex(sorted, config.distanceThreshold);

  // Size the candidate neighbourhood to cover the widest effective distance threshold
  // ANY pair can be accepted at — the GLOBAL max multipliers, not just this report's.
  // A small/shallow report would otherwise miss a large/deep duplicate that
  // eventsMatchAdaptive (which uses the pair's avg magnitude / max depth) accepts.
  // Also widen the longitude reach by 1/cos(lat): the grid cell is keyed to the tighter
  // latitude axis, so one cell spans fewer km E-W than N-S. Use the MAXIMUM |latitude| in
  // the set (not the average) so the neighbourhood is conservative for the highest-latitude
  // events too — an event poleward of the average needs more E-W cells, and under-sizing
  // here would silently drop its true duplicates.
  const maxAbsLatDeg = sorted.reduce((max, e) => Math.max(max, Math.abs(e.latitude)), 0);
  // cos(latitude) is clamped at POLAR_LATITUDE_DEG; reports beyond it bypass the cell
  // test entirely (see `polar` below) so the clamp cannot drop a valid pair.
  const lonCoverageFactor = 1 / Math.max(Math.cos((maxAbsLatDeg * Math.PI) / 180), Math.cos((POLAR_LATITUDE_DEG * Math.PI) / 180));
  const distCells = Math.max(
    1,
    Math.ceil(MAX_DISTANCE_MULTIPLIER * MAX_DEPTH_MULTIPLIER * lonCoverageFactor)
  );
  // The pair distance window uses the pair's AVERAGE magnitude and MAX depth, so one report
  // alone cannot bound it; the global multipliers are the ceiling for the reach box.
  const reachKm = config.distanceThreshold * MAX_DISTANCE_MULTIPLIER * MAX_DEPTH_MULTIPLIER;
  const reachLatDeg = reachKm / 111;
  const maxTimeWindowMs = config.timeThreshold * MAX_TIME_MULTIPLIER * 1000;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    // Past the latitude where the neighbourhood cell count was clamped, a fixed
    // longitude box cannot bound the reach (39 km at 89N spans 20 degrees); there
    // the exact haversine test in pairSeparation is the only spatial filter.
    const polar = Math.abs(current.latitude) + reachLatDeg >= POLAR_LATITUDE_DEG;
    // cos is taken at the poleward edge of the reach, where a degree of longitude is
    // shortest, so the box is a superset of the great-circle window at every latitude.
    const reachLonDeg = polar
      ? 180
      : reachKm / (111 * Math.cos(((Math.abs(current.latitude) + reachLatDeg) * Math.PI) / 180));
    // Cells are consulted only as a membership test so the antimeridian/polar coverage
    // logic stays authoritative. The cell set is built only once a candidate passes the
    // time and box tests: on a sparse catalogue most reports never get that far.
    let nearbyCellSet: Set<string> | null = null;
    const timeCeiling = current._timestamp + maxTimeWindowMs;
    for (let j = i + 1; j < sorted.length; j++) {
      const c = sorted[j];
      if (c._timestamp > timeCeiling) break;
      // One catalogue never contributes two reports of one earthquake (the same-source
      // rule), so its own records are not candidates for each other. Gathering them
      // turned a dense single-agency swarm into quadratic work for nothing.
      if (keys[j] === keys[i]) continue;
      if (Math.abs(c.latitude - current.latitude) > reachLatDeg) continue;
      // Longitude difference on the shorter arc, so a seam pair (+180/-180) is kept.
      const dLon = Math.abs(((c.longitude - current.longitude + 540) % 360) - 180);
      if (dLon > reachLonDeg) continue;
      if (!polar) {
        if (nearbyCellSet === null) {
          nearbyCellSet = new Set(getNearbyCells(current.latitude, current.longitude, spatialIndex.cellSize, distCells));
        }
        if (!nearbyCellSet.has(getGridKey(c.latitude, c.longitude, spatialIndex.cellSize))) continue;
      }
      const pair = pairSeparation(current, c, config.timeThreshold, config.distanceThreshold);
      if (!pair.matches) continue;
      edges.push({ a: i, b: j, cost: pair.cost, tie: magnitudeTieKey(current, c) });
    }
  }
  return edges;
}

/**
 * One round of best-first association over the eligible edges: take candidate pairs in
 * order of increasing normalised space-time separation and join their clusters when
 *  - no catalogue would contribute two reports (the same-source rule, as a hard
 *    one-to-one constraint rather than a gate that rejects a group after the fact), and
 *  - some member of the joined cluster lies inside the matching window of every other
 *    member (a common centre), so reports linked only through a chain of intermediate
 *    reports are not fused.
 * A report is therefore claimed by its CLOSEST counterpart in each other catalogue, not by
 * whichever earlier report happened to reach it first (finding #20). A report whose
 * best refused alternative was nearly as close as the pairing it kept is marked
 * contested (AMBIGUITY_FACTOR). Returns the clusters of two or more.
 */
function associateBestFirst(
  sorted: EventData[],
  keys: string[],
  edges: CandidateEdge[],
  order: number[],
  eligible: (edge: CandidateEdge) => boolean,
  contested: Uint8Array,
  config: MergeConfig
): number[][] {
  // Union-find over report indices; -1 marks a root.
  const parent = new Int32Array(sorted.length).fill(-1);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== -1) root = parent[root];
    // Path compression.
    let node = x;
    while (node !== root) {
      const next = parent[node];
      parent[node] = root;
      node = next;
    }
    return root;
  };
  const members = new Map<number, number[]>();
  const memberKeys = new Map<number, Set<string>>();
  const matchCache = new Map<string, boolean>();
  const pairMatches = (x: number, y: number): boolean => {
    const cacheKey = x < y ? `${x},${y}` : `${y},${x}`;
    let result = matchCache.get(cacheKey);
    if (result === undefined) {
      result = eventsMatchAdaptive(sorted[x], sorted[y], config.timeThreshold, config.distanceThreshold);
      matchCache.set(cacheKey, result);
    }
    return result;
  };
  const hasCommonCentre = (cluster: number[]): boolean =>
    cluster.some(centre => cluster.every(other => other === centre || pairMatches(centre, other)));
  // Separation of the first (closest) pairing each report joined, and of the closest
  // pairing it was refused; compared once every edge has been offered.
  const joinedCost = new Map<number, number>();
  const refusedCost = new Map<number, number>();

  for (const index of order) {
    const edge = edges[index];
    if (!eligible(edge)) continue;
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra === rb) continue;
    const ma = members.get(ra) ?? [ra];
    const mb = members.get(rb) ?? [rb];
    const ka = memberKeys.get(ra) ?? new Set([keys[ra]]);
    const kb = memberKeys.get(rb) ?? new Set([keys[rb]]);
    let sharesSource = false;
    kb.forEach(key => { if (ka.has(key)) sharesSource = true; });
    const joined = ma.concat(mb);
    if (sharesSource || (joined.length > 2 && !hasCommonCentre(joined))) {
      for (const x of [edge.a, edge.b]) {
        if (!refusedCost.has(x)) refusedCost.set(x, edge.cost);
      }
      continue;
    }
    for (const x of [edge.a, edge.b]) {
      if (!joinedCost.has(x)) joinedCost.set(x, edge.cost);
    }
    parent[rb] = ra;
    members.set(ra, joined);
    const unionKeys = new Set(ka);
    kb.forEach(key => unionKeys.add(key));
    memberKeys.set(ra, unionKeys);
    members.delete(rb);
    memberKeys.delete(rb);
  }

  // Edges arrive in increasing separation, so these are each report's closest joined and
  // closest refused pairings.
  refusedCost.forEach((refused, x) => {
    const kept = joinedCost.get(x);
    if (kept !== undefined && refused <= AMBIGUITY_FACTOR * kept + AMBIGUITY_MARGIN) contested[x] = 1;
  });

  return Array.from(members.values())
    .filter(cluster => cluster.length > 1)
    .map(cluster => cluster.slice().sort((x, y) => x - y));
}

/**
 * Core matching + grouping shared by BOTH the persist path (performMerge) and the
 * preview path (performMergeWithGroups). Extracting it guarantees the QC preview and
 * the saved catalogue group events identically.
 *
 * Association is one-to-one and best-match: candidate pairs (reports from different
 * catalogues inside each other's adaptive window) are joined in order of increasing
 * normalised space-time separation |Δt|/τ + d/δ, with magnitude agreement only as a tie-
 * breaker, and a group never holds two reports from one catalogue. The earlier anchor
 * sweep let the first report in time claim every other-catalogue report in its window,
 * so in an aftershock sequence another agency's report of the NEXT event was attached to
 * the earlier one — deleting one real earthquake and duplicating the other (finding #20).
 * Each resulting cluster must still pass validateEventGroup; one that fails is split by
 * the salvage (regroupFailedEvents), and reports the salvage leaves alone may pair with
 * other unassigned reports in a further round. The result does not depend on input order.
 */
function groupMatchingEvents(events: EventData[], config: MergeConfig): MatchGroup[] {
  // Pre-compute timestamps once to avoid repeated date parsing; record order (time, then
  // source, then id) makes every tie-break below independent of the order of the input.
  const sorted = events
    .map(e => ({ ...e, _timestamp: new Date(e.time).getTime() }))
    .sort(compareRecordOrder);
  const n = sorted.length;
  if (n === 0) return [];
  const keys = sorted.map(sourceKey);

  const edges = gatherCandidateEdges(sorted, keys, config);
  const order = edges.map((_, index) => index).sort((x, y) => {
    const ex = edges[x];
    const ey = edges[y];
    return compareNumbers(ex.cost, ey.cost) || compareNumbers(ex.tie, ey.tie) || ex.a - ey.a || ex.b - ey.b;
  });

  const indexOf = new Map<EventData, number>(sorted.map((e, i) => [e, i] as [EventData, number]));
  const contested = new Uint8Array(n);
  const assigned = new Uint8Array(n);
  // Pairs a salvage has already explored: never re-offered, so rounds always progress.
  const exhausted = new Set<number>();
  const pairKey = (x: number, y: number) => (x < y ? x * n + y : y * n + x);
  const found: Array<{ members: number[]; regrouped: boolean }> = [];
  const eligible = (edge: CandidateEdge) =>
    !assigned[edge.a] && !assigned[edge.b] && !exhausted.has(pairKey(edge.a, edge.b));
  let pending = order;

  for (let round = 0; round < MAX_ASSOCIATION_ROUNDS; round++) {
    // Each round only revisits the pairings still open, so a dense sequence whose best
    // matches keep failing the gate does not rescan every candidate pair.
    if (round > 0) pending = pending.filter(index => eligible(edges[index]));
    const clusters = associateBestFirst(
      sorted,
      keys,
      edges,
      pending,
      eligible,
      contested,
      config
    );
    let anyFailed = false;
    for (const cluster of clusters) {
      const clusterEvents = cluster.map(i => sorted[i]);
      if (validateEventGroup(clusterEvents)) {
        found.push({ members: cluster, regrouped: false });
        cluster.forEach(i => { assigned[i] = 1; });
        continue;
      }
      anyFailed = true;
      for (let p = 0; p < cluster.length; p++) {
        for (let q = p + 1; q < cluster.length; q++) exhausted.add(pairKey(cluster[p], cluster[q]));
      }
      // Salvage valid sub-groups instead of one big (or all-singleton) group. Members the
      // salvage leaves on their own are not consumed: they may still pair with another
      // unassigned report in the next round.
      for (const subGroup of regroupFailedEvents(clusterEvents, config)) {
        if (subGroup.length < 2) continue;
        const subMembers = subGroup.map(e => indexOf.get(e)!).sort((x, y) => x - y);
        found.push({ members: subMembers, regrouped: true });
        subMembers.forEach(i => { assigned[i] = 1; });
      }
    }
    // Without a failed cluster, every unassigned report has already been offered every
    // pairing it could make.
    if (!anyFailed) break;
  }

  for (let i = 0; i < n; i++) {
    if (!assigned[i]) found.push({ members: [i], regrouped: false });
  }
  // Output in record order of each group's earliest report, as the sweep produced it.
  found.sort((g, h) => g.members[0] - h.members[0]);

  return found.map(({ members, regrouped }) => ({
    events: members.map(i => sorted[i]),
    regrouped,
    ambiguous: members.length > 1 && members.some(i => contested[i] === 1),
  }));
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
 * Maximum magnitude range a group may span, as a function of its mean magnitude.
 */
function magnitudeRangeThreshold(avgMag: number): number {
  if (avgMag < 4.0) return 0.5;
  if (avgMag < 5.5) return 0.8;
  if (avgMag < 7.0) return 1.2;
  return 1.5;
}

/**
 * Verdict of the magnitude-consistency gate, plus every statistic the QC preview needs to
 * explain it. Shared by validateEventGroup (which enforces it) and performMergeWithGroups
 * (which reports it), so the panel can never describe a group differently from the gate.
 */
type MagnitudeGateFailure = 'raw-range' | 'within-scale-range' | 'mw-range';

interface MagnitudeConsistency {
  /** Count of usable magnitudes (present AND finite). */
  count: number;
  /** Mean of the usable RAW magnitudes; NaN when there are none. */
  rawMean: number;
  /** Max - min of the usable RAW magnitudes; NaN when there are none. */
  rawRange: number;
  /** Tier threshold selected by the RAW mean (never by a converted mean). */
  threshold: number;
  /** Widest raw spread inside a single magnitude-type category, if any category has 2+. */
  worstScale: { category: MagnitudeType; range: number } | null;
  /**
   * Spread of the CONVERTIBLE members on the common (Mw) scale; null unless 2+ scales.
   * `threshold` is the tier widened in quadrature by the conversion uncertainty of the two
   * extreme members, and is the value the Mw comparison is actually judged against.
   */
  mw: { range: number; mean: number; count: number; threshold: number } | null;
  /** True when every usable magnitude carries a type convertToMw understands. */
  fullyConvertible: boolean;
  /** Gate verdict for the magnitude check alone. */
  ok: boolean;
  /** Accepted, but only because the members agree once put on the common scale. */
  rescuedByMw: boolean;
  /** Which check rejected the group, or null when it passed. */
  failure: MagnitudeGateFailure | null;
  /** Human-readable statement of the failure (or of the rescue), for the QC log/panel. */
  reason: string | null;
}

/**
 * Decide whether a candidate group's magnitudes can describe ONE earthquake.
 *
 * Three checks, all against the tier the RAW mean selects, so converting cannot buy a looser
 * tier: (1) raw spread within each scale, since same-scale values are already like-for-like;
 * (2) raw spread overall, waived only when the group mixes scales and all convert;
 * (3) spread on the common scale, widened in quadrature by the conversion uncertainties
 * convertToMw reports (Scordilis 2006: Mw = 0.67*Ms + 2.07, Mw = 0.85*mb + 1.03).
 */
function assessMagnitudeConsistency(events: EventData[]): MagnitudeConsistency {
  const raw: number[] = [];
  const byCategory = new Map<MagnitudeType, number[]>();
  const mwPoints: { value: number; sigma: number }[] = [];
  let unconvertible = 0;

  for (const e of events) {
    const value = e.magnitude;
    if (value == null || !Number.isFinite(value)) continue; // absent or NaN/Inf: no information
    raw.push(value);

    const category = getMagnitudeTypeCategory(e.magnitude_type);
    const converted = category ? convertToMw(value, e.magnitude_type) : null;
    if (!category || !converted) {
      unconvertible++;
      continue;
    }
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(value);
    else byCategory.set(category, [value]);
    mwPoints.push({ value: converted.value, sigma: converted.uncertainty ?? 0 });
  }

  if (raw.length === 0) {
    return {
      count: 0, rawMean: NaN, rawRange: NaN, threshold: NaN, worstScale: null, mw: null,
      fullyConvertible: false, ok: true, rescuedByMw: false, failure: null, reason: null,
    };
  }

  const rawMean = raw.reduce((a, b) => a + b, 0) / raw.length;
  const rawRange = Math.max(...raw) - Math.min(...raw);
  const threshold = magnitudeRangeThreshold(rawMean);

  let worstScale: { category: MagnitudeType; range: number } | null = null;
  for (const [category, values] of Array.from(byCategory.entries())) {
    if (values.length < 2) continue;
    const range = Math.max(...values) - Math.min(...values);
    if (!worstScale || range > worstScale.range) worstScale = { category, range };
  }

  // At least two DISTINCT scales are needed before a common-scale comparison says anything
  // a single-scale raw comparison did not already say.
  let mw: { range: number; mean: number; count: number; threshold: number } | null = null;
  if (byCategory.size >= 2 && mwPoints.length >= 2) {
    let lo = mwPoints[0];
    let hi = mwPoints[0];
    let sum = 0;
    for (const point of mwPoints) {
      // Ties are broken toward the LARGER conversion uncertainty so the chosen extremes -
      // and therefore the widened threshold - do not depend on the order members arrive in.
      if (point.value < lo.value || (point.value === lo.value && point.sigma > lo.sigma)) lo = point;
      if (point.value > hi.value || (point.value === hi.value && point.sigma > hi.sigma)) hi = point;
      sum += point.value;
    }
    const conversionSigma = Math.sqrt(lo.sigma * lo.sigma + hi.sigma * hi.sigma);
    mw = {
      range: hi.value - lo.value,
      mean: sum / mwPoints.length,
      count: mwPoints.length,
      threshold: Math.sqrt(threshold * threshold + conversionSigma * conversionSigma),
    };
  }

  const fullyConvertible = unconvertible === 0;
  const rawOk = rawRange <= threshold;
  const withinScaleOk = worstScale == null || worstScale.range <= threshold;
  const mwOk = mw == null || mw.range <= mw.threshold;
  const rawWaived = mw != null && fullyConvertible;

  let failure: MagnitudeGateFailure | null = null;
  let reason: string | null = null;
  if (!rawWaived && !rawOk) {
    failure = 'raw-range';
    reason = `Large magnitude range: ${rawRange.toFixed(2)} units (threshold: ${threshold})`;
  } else if (!withinScaleOk) {
    failure = 'within-scale-range';
    reason =
      `Large magnitude range within a single scale (${worstScale!.category}): ` +
      `${worstScale!.range.toFixed(2)} units (threshold: ${threshold})`;
  } else if (!mwOk) {
    failure = 'mw-range';
    reason =
      `Magnitude reports disagree once converted to a common scale: ` +
      `${mw!.range.toFixed(2)} units of Mw (threshold: ${mw!.threshold.toFixed(2)}, ` +
      `tier ${threshold} widened by conversion uncertainty)`;
  }

  const ok = failure == null;
  const rescuedByMw = ok && !rawOk;
  if (rescuedByMw) {
    reason =
      `Large raw magnitude range: ${rawRange.toFixed(2)} units (threshold: ${threshold}); ` +
      `accepted — Mw-equivalent range is ${mw!.range.toFixed(2)} units across mixed magnitude scales`;
  }

  return {
    count: raw.length, rawMean, rawRange, threshold, worstScale, mw,
    fullyConvertible, ok, rescuedByMw, failure, reason,
  };
}

/**
 * Validate that a group of events makes physical sense to merge
 */
function validateEventGroup(events: EventData[], logConflicts: boolean = true): boolean {
  if (events.length < 2) return true;

  // Trial validations (the greedy split in splitInconsistentGroup) pass logConflicts=false:
  // a rejected trial sub-group is not a real over-match and must not appear in the QC
  // conflict report, which would otherwise fill with O(n^2) phantom conflicts per group.
  const logConflict: MergeConflictLog['log'] = logConflicts
    ? mergeConflictLog.log.bind(mergeConflictLog)
    : () => {};

  const eventIds = events.map(e => e.id || 'unknown');
  const sources = events.map(e => e.source);
  const avgLat = events.reduce((sum, e) => sum + e.latitude, 0) / events.length;
  const avgLon = averageLongitudes(events.map(e => e.longitude));
  const avgTime = events[0]?.time;

  // Magnitude consistency. assessMagnitudeConsistency drops absent AND non-finite
  // magnitudes, so a stray NaN can no longer make every comparison false and silently
  // disable the whole magnitude gate for the group.
  const magnitude = assessMagnitudeConsistency(events);

  // NaN when the group carries no usable magnitude at all. Every threshold comparison below
  // then takes its wider branch — the same thing that happened before when a NaN magnitude
  // made avgMag NaN — but the depth, spatial-spread, group-size and network checks still
  // RUN. Returning early here (as the all-null case used to) would have exempted a group
  // from every consistency check it can still be judged on just because nobody reported a
  // magnitude for it.
  const avgMag = magnitude.rawMean;

  if (!magnitude.ok) {
    const mags = events
      .map(e => e.magnitude)
      .filter((m): m is number => m != null && Number.isFinite(m));
    logConflict(
      'magnitude_range',
      'warning',
      `${magnitude.reason} - possible mismatch`,
      {
        eventIds,
        sources,
        values: {
          magnitudes: mags,
          avgMagnitude: avgMag,
          ...(magnitude.worstScale
            ? {
                worstWithinScale: magnitude.worstScale.category,
                worstWithinScaleRange: magnitude.worstScale.range,
              }
            : {}),
          ...(magnitude.mw ? { mwRange: magnitude.mw.range, avgMw: magnitude.mw.mean } : {}),
        },
        threshold: magnitude.threshold,
        // Report the quantity that actually failed, so the QC panel is not left comparing a
        // passing raw range against the threshold that a different check rejected.
        actualValue:
          magnitude.failure === 'within-scale-range'
            ? magnitude.worstScale!.range
            : magnitude.failure === 'mw-range'
              ? magnitude.mw!.range
              : magnitude.rawRange,
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
      logConflict(
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
    logConflict(
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
      logConflict(
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
  // (e.g. foreshock/aftershock pair), so we should not merge them. The source is the
  // CATALOGUE (sourceKey), not its display name: two catalogues that share a name are
  // still two sources.
  const sourceCounts = new Map<string, { label: string; count: number }>();
  for (const e of events) {
    const key = sourceKey(e);
    const entry = sourceCounts.get(key);
    if (entry) entry.count++;
    else sourceCounts.set(key, { label: String(e.source ?? key), count: 1 });
  }
  const duplicateSources = Array.from(sourceCounts.values()).filter(({ count }) => count > 1);
  if (duplicateSources.length > 0) {
    logConflict(
      'network_mismatch',
      'warning',
      `Same network appears multiple times in group: ${duplicateSources.map(({ label }) => label).join(', ')} — likely distinct events`,
      {
        eventIds,
        sources,
        values: { duplicateSources: Object.fromEntries(duplicateSources.map(({ label, count }) => [label, count])) },
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
    logConflict(
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
 * Optional scalar fields from EventData that are eligible for field-level union: they
 * describe the EVENT (where it is, what kind of event it is), not one agency's solution.
 */
const UNION_SCALAR_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'region',
  'location_name',
  // source_id / event_public_id are IDENTITY, not description: a record without one
  // must not borrow another agency's, or it collides with that agency's real event.
  'event_type',
  'event_type_certainty',
] as const;

/**
 * Fields that describe ONE origin solution — QuakeML 1.2 BED Origin (time uncertainty,
 * method, earth model, evaluation mode/status), its OriginQuality (gap, phase and station
 * counts, standard error, station distances) and its CreationInfo (agency, author) — plus
 * the serialised forms of that same solution (its quality blob, its arrivals, the pointer
 * to it and the record's creation info). They are published only with the origin they
 * describe: the union never fills them from another report (finding #21), and a record
 * whose epicentre was averaged carries none of them. Grafting them let a GeoNet origin
 * leave the merge stamped agency ISC, method iscloc, gap 250°, 9 stations and 'reviewed'.
 */
const ORIGIN_META_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'time_uncertainty',
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
  'origin_quality',
  'arrivals',
  'preferred_origin_id',
  'creation_info',
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
// source whose coordinates differ from the merged (possibly averaged) location. The
// ellipse's confidence level (C16) qualifies the same ellipse, so it travels with it.
const LOCATION_META_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'latitude_uncertainty',
  'longitude_uncertainty',
  'horizontal_uncertainty',
  'min_horizontal_uncertainty',
  'max_horizontal_uncertainty',
  'azimuth_max_horizontal_uncertainty',
  'confidence_level',
] as const;

// Depth-metadata fields that must travel with the DEPTH VALUE. depth_type states how THAT
// solution's depth was determined (free, operator assigned, constrained by depth phases…)
// and depth_uncertainty is that solution's error estimate, so neither may be inherited from
// a source that reported a different depth — mergeByAverage in particular selects the depth
// from the best-constrained event, which is not necessarily the record it spreads.
const DEPTH_META_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'depth_uncertainty',
  'depth_type',
] as const;

/**
 * Optional JSON-blob fields: arrays of rich objects serialised as strings. These are
 * supplementary products (every origin and magnitude an agency computed, phase picks,
 * amplitudes, descriptions, comments) kept alongside the published solution, so when
 * the base record carries none, the highest-quality source that does fills them in.
 * Focal mechanisms are united across every source separately (see unionFocalMechanisms).
 */
const UNION_BLOB_FIELDS: ReadonlyArray<keyof MergedEvent> = [
  'origins',
  'magnitudes',
  'picks',
  'amplitudes',
  'station_magnitudes',
  'event_descriptions',
  'comments',
] as const;

/**
 * Apply a field-level union over a group of source events onto the already-
 * selected merged base event.
 */
function unionMergeFields(base: MergedEventData, events: EventData[]): MergedEventData {
  if (events.length <= 1) return base;

  // Sort sources by descending quality so better data fills gaps first; a fixed record
  // order breaks ties so the donor never depends on input order.
  const ranked = events
    .map(e => ({ event: e, score: calculateQualityScore(e) }))
    .sort((a, b) => b.score - a.score || compareRecordOrder(a.event, b.event))
    .map(s => s.event);

  const result: MergedEventData = { ...base };

  // Event-level scalar fields: first non-null value across ranked sources wins. The
  // agency's raw event type (C8) comes from whichever report supplied the event type.
  for (const field of UNION_SCALAR_FIELDS) {
    if (result[field] != null) continue; // base already has it
    const donor = ranked.find(src => src[field] != null);
    if (!donor) continue;
    (result as any)[field] = donor[field];
    if (field === 'event_type') (result as any).source_event_type = donor.source_event_type ?? null;
  }

  // ORIGIN_META_FIELDS are deliberately absent here: they already come from the published
  // report through the strategy's spread, and no other report's solution may fill a gap.

  // Supplementary JSON blobs: first source that carries the field wins.
  for (const field of UNION_BLOB_FIELDS) {
    if (result[field] != null) continue;
    for (const src of ranked) {
      if (src[field] != null) {
        (result as any)[field] = src[field];
        break;
      }
    }
  }

  // Magnitude metadata: fill ONLY from a source reporting the SAME magnitude measurement —
  // matching value AND type. Matching value alone is unsafe: a different, higher-quality
  // source that merely happens to report the same numeric value (e.g. an Mw 5.0 vs the
  // base's untyped 5.0) would otherwise graft its type onto the base's value and mislabel
  // it. When the base has no type, only a same-value untyped source can enrich it.
  const resultMagType = (result.magnitude_type ?? null) as string | null;
  const magSource = result.magnitude != null
    ? ranked.find(
        src =>
          src.magnitude != null &&
          src.magnitude === result.magnitude &&
          ((src.magnitude_type ?? null) as string | null) === resultMagType
      )
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

  // Depth metadata: fill ONLY from a source reporting the SAME depth value, for the same
  // reason as the magnitude/location blocks above — an uncertainty or a "operator assigned"
  // depth type belongs to the solution that produced it, not to whichever depth was selected.
  const depthSource = result.depth != null
    ? ranked.find(src => src.depth != null && src.depth === result.depth)
    : undefined;
  if (depthSource) {
    for (const field of DEPTH_META_FIELDS) {
      if (result[field] == null && (depthSource as any)[field] != null) {
        (result as any)[field] = (depthSource as any)[field];
      }
    }
  }

  // Focal mechanisms: every mechanism any source stored is kept, ordered by the documented
  // authority hierarchy, and the best becomes the preferred one (finding #30).
  const mechanisms = unionFocalMechanisms(events);
  if (mechanisms.length > 0) {
    const preferredId = mechanisms[0].publicID ?? null;
    (result as any).focal_mechanisms = JSON.stringify(mechanisms);
    result.preferred_focal_mechanism_id = preferredId;
    if (result.quakeml) {
      result.quakeml = {
        ...result.quakeml,
        focalMechanisms: mechanisms,
        preferredFocalMechanismID: preferredId ?? undefined,
      };
    }
  }

  return result;
}

/**
 * Strip transient/redundant fields from an event before it is stored inside
 * the `source_events` JSON column: the parsed QuakeML object and every `_`-prefixed
 * working value the merge attaches (timestamps, catalogue agency, …).
 */
function toSourceEventData(e: EventData): EventData {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(e)) {
    if (key === 'quakeml' || key.startsWith('_')) continue;
    rest[key] = value;
  }
  return rest as EventData;
}

/**
 * Build the `sourceEvents` provenance array shared by every merge strategy. Centralised so
 * the field that must stay consistent across all strategies cannot drift between them.
 * `selectedIndex` is the member whose solution (origin time and epicentre) was published;
 * pass a negative index when none was (an averaged epicentre).
 */
function buildSourceEvents(events: EventData[], selectedIndex: number = -1): MergedEventData['sourceEvents'] {
  return events.map((e, index) => ({
    catalogueId: e.catalogueId ?? e.id ?? 'unknown',
    source: e.source,
    originalData: toSourceEventData(e),
    ...(index === selectedIndex ? { selected: true as const } : {}),
  }));
}

/** Strategy names a merged event may record (contract C2); anything else runs as 'priority'. */
const MERGE_STRATEGY_NAMES = new Set(['quality', 'priority', 'newest', 'complete', 'average']);

function mergeStrategyName(config: MergeConfig): string {
  return MERGE_STRATEGY_NAMES.has(config.mergeStrategy) ? config.mergeStrategy : 'priority';
}

const mergeParameterCache = new WeakMap<object, string>();

/**
 * The effective merge configuration, as the JSON stored on every merged event
 * (`merge_parameters`, contract C2). Computed once per configuration object.
 */
function describeMergeParameters(config: MergeConfig): string {
  const cached = mergeParameterCache.get(config);
  if (cached !== undefined) return cached;
  const strategy = mergeStrategyName(config);
  const customOrder = strategy === 'priority' && config.priority === 'custom' && Array.isArray(config.priorityOrder);
  const description = JSON.stringify({
    mergeStrategy: strategy,
    timeThresholdSeconds: config.timeThreshold,
    distanceThresholdKm: config.distanceThreshold,
    priority: config.priority,
    ...(customOrder ? { priorityOrder: config.priorityOrder } : {}),
    // The configured windows are always widened by magnitude and depth (eventsMatchAdaptive).
    adaptiveWindows: true,
    association: 'one-to-one, best match on normalised time and distance',
  });
  mergeParameterCache.set(config, description);
  return description;
}

/**
 * Stamp a merged event with its provenance (contract C2): the strategy, the effective
 * configuration and the distinct contributing catalogues in source_events order. Always
 * overwrites, because a re-merged input row carries the provenance of its own merge.
 */
function withMergeProvenance(merged: MergedEventData, config: MergeConfig): MergedEventData {
  const catalogueIds: string[] = [];
  for (const entry of merged.sourceEvents) {
    const id = entry.originalData?.catalogueId;
    if (id == null || id === '') continue;
    const text = String(id);
    if (!catalogueIds.includes(text)) catalogueIds.push(text);
  }
  merged.merge_strategy = mergeStrategyName(config);
  merged.merge_parameters = describeMergeParameters(config);
  merged.source_catalogue_ids = catalogueIds;
  return merged;
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
    // A lone report is published as it stands, whatever the strategy.
    return withMergeProvenance({
      ...events[0],
      sourceEvents: buildSourceEvents([events[0]], 0)
    }, config);
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
      mergedEvent = mergeByPriority(events, config.priority, config.priorityOrder);
      break;
  }

  // Apply field-level union: fill optional fields the base event lacks
  // from other sources in the group.
  return withMergeProvenance(unionMergeFields(mergedEvent, events), config);
}

// ============================================================================
// FOCAL MECHANISM MERGING
// ============================================================================

/**
 * Focal mechanism authority for moment-tensor solutions, in the order the white paper
 * recommends (publication/merge_strategies.tex §Focal mechanism, after the ISC-GEM
 * protocol): GCMT > USGS/NEIC broadband CMT or W-phase > GEOFON/GFZ > GeoNet CMT > INGV CMT.
 * Mechanisms without a moment tensor rank below every moment tensor (see
 * focalMechanismTier). The previous table put GeoNet above USGS/NEIC.
 */
const FOCAL_MECHANISM_HIERARCHY: Array<{ patterns: string[]; priority: number; description: string; agency: AgencyKey }> = [
  { patterns: ['gcmt', 'globalcmt', 'cmt'], priority: 1, description: 'Global CMT', agency: 'gcmt' },
  { patterns: ['usgs', 'neic'], priority: 2, description: 'USGS/NEIC CMT or W-phase', agency: 'usgs' },
  { patterns: ['geofon', 'gfz'], priority: 3, description: 'GEOFON/GFZ moment tensor', agency: 'geofon' },
  { patterns: ['geonet', 'gns'], priority: 4, description: 'GeoNet CMT', agency: 'geonet' },
  { patterns: ['ingv'], priority: 5, description: 'INGV CMT', agency: 'ingv' },
];
/** A moment tensor from an agency the hierarchy does not name. */
const OTHER_MOMENT_TENSOR_TIER = 6;
/** First-motion solution from at least 20 station polarities, not automatic. */
const FIRST_MOTION_TIER = 7;
/** Automated or sparsely constrained first-motion solution. */
const AUTOMATIC_FIRST_MOTION_TIER = 8;

/**
 * Get focal mechanism priority for a source, identified by whole words of its name
 * ('GeoNet CMT' is GeoNet, not the Global CMT).
 */
function getFocalMechanismPriority(source: string | undefined): number {
  if (!source) return 999;
  const agency = agencyFromName(source);
  const entry = agency ? FOCAL_MECHANISM_HIERARCHY.find(h => h.agency === agency) : undefined;
  return entry ? entry.priority : 100; // Unknown source
}

/**
 * Calculate quality score for a focal mechanism
 * Based on:
 * - Number of station polarities used
 * - Misfit value (lower is better)
 * - Presence of moment tensor
 * - Variance reduction (higher is better)
 */
function calculateFocalMechanismQuality(fm: FocalMechanism): number {
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
 * Every focal mechanism a report carries: the parsed QuakeML when present, otherwise the
 * stored `focal_mechanisms` JSON column. Stored rows never carry parsed QuakeML (uploads
 * strip it), so reading only the former made mechanism selection dead code on every real
 * merge and kept whichever single list the base row happened to hold.
 */
function focalMechanismsOf(event: EventData): { list: FocalMechanism[]; preferredId: string | null } {
  let list: unknown = event.quakeml?.focalMechanisms;
  let preferredId: unknown = event.quakeml?.preferredFocalMechanismID;
  if (!Array.isArray(list) || list.length === 0) {
    list = undefined;
    const column = (event as { focal_mechanisms?: unknown }).focal_mechanisms;
    if (typeof column === 'string' && column) {
      try {
        list = JSON.parse(column);
      } catch {
        list = undefined; // unparseable column: no mechanisms
      }
    } else if (Array.isArray(column)) {
      list = column;
    }
    preferredId = event.preferred_focal_mechanism_id;
  }
  const mechanisms = Array.isArray(list)
    ? (list as unknown[]).filter((fm): fm is FocalMechanism => fm != null && typeof fm === 'object')
    : [];
  return { list: mechanisms, preferredId: typeof preferredId === 'string' && preferredId ? preferredId : null };
}

/**
 * Authority tier of one mechanism (lower is better). The agency is the mechanism's own
 * creationInfo agency when it names one, else the agency of the report it came with.
 */
function focalMechanismTier(fm: FocalMechanism, reportAgency: AgencyKey | null): number {
  const agency = agencyFromCode(fm.creationInfo?.agencyID) ?? agencyFromName(fm.creationInfo?.agencyID) ?? reportAgency;
  // The Global CMT project publishes centroid moment tensors only.
  if (agency === 'gcmt') return 1;
  if (fm.momentTensor) {
    const entry = FOCAL_MECHANISM_HIERARCHY.find(h => h.agency === agency);
    return entry ? entry.priority : OTHER_MOMENT_TENSOR_TIER;
  }
  const polarities = typeof fm.stationPolarityCount === 'number' ? fm.stationPolarityCount : 0;
  return polarities >= 20 && fm.evaluationMode !== 'automatic' ? FIRST_MOTION_TIER : AUTOMATIC_FIRST_MOTION_TIER;
}

interface RankedFocalMechanism {
  fm: FocalMechanism;
  source: string;
  tier: number;
  quality: number;
}

/**
 * Every focal mechanism across a group, each once (by publicID), ranked best first:
 * authority tier, then variance reduction (higher), station polarity count (more) and
 * misfit (lower), as the white paper ranks within a tier; then the reporting agency's own
 * preference, then report order.
 */
function rankFocalMechanisms(events: EventData[]): RankedFocalMechanism[] {
  const entries: Array<RankedFocalMechanism & { preferred: boolean; order: number }> = [];
  const seen = new Set<string>();
  const ordered = events.slice().sort(compareRecordOrder);
  for (const event of ordered) {
    const { list, preferredId } = focalMechanismsOf(event);
    if (list.length === 0) continue;
    const reportAgency = resolveAgency(event);
    // A dangling preferred id (it names no stored mechanism) falls back to the first one.
    const preferredStored = preferredId != null && list.some(fm => fm.publicID === preferredId);
    for (const fm of list) {
      const id = typeof fm.publicID === 'string' ? fm.publicID : '';
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      entries.push({
        fm,
        source: event.source,
        tier: focalMechanismTier(fm, reportAgency),
        quality: calculateFocalMechanismQuality(fm),
        preferred: preferredStored ? id === preferredId : fm === list[0],
        order: entries.length,
      });
    }
  }
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  entries.sort((a, b) =>
    a.tier - b.tier ||
    num(b.fm.momentTensor?.varianceReduction, -1) - num(a.fm.momentTensor?.varianceReduction, -1) ||
    num(b.fm.stationPolarityCount, -1) - num(a.fm.stationPolarityCount, -1) ||
    num(a.fm.misfit, Infinity) - num(b.fm.misfit, Infinity) ||
    Number(b.preferred) - Number(a.preferred) ||
    a.order - b.order
  );
  return entries.map(({ fm, source, tier, quality }) => ({ fm, source, tier, quality }));
}

/**
 * Every mechanism of a group, best first, with its original publicID. The first becomes
 * the merged record's preferred mechanism.
 */
function unionFocalMechanisms(events: EventData[]): FocalMechanism[] {
  return rankFocalMechanisms(events).map(entry => entry.fm);
}

/**
 * Select the best focal mechanism from a group of events
 */
function selectBestFocalMechanism(events: EventData[]): FocalMechanism | null {
  return rankFocalMechanisms(events)[0]?.fm ?? null;
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
  bestFocalMechanism: FocalMechanism | null;
  allFocalMechanisms: Array<{
    focalMechanism: FocalMechanism;
    source: string;
    quality: number;
  }>;
} {
  const ranked = rankFocalMechanisms(events);
  return {
    bestFocalMechanism: ranked[0]?.fm ?? null,
    allFocalMechanisms: ranked.map(({ fm, source, quality }) => ({ focalMechanism: fm, source, quality })),
  };
}

// ============================================================================
// MAGNITUDE CONVERSION
// ============================================================================

/**
 * Magnitude type enumeration for conversion functions
 */
// 'mB' (broadband body-wave) and 'mbLg' (Lg-phase regional) are distinct scales that ISC
// reports separately from short-period mb. They share mb's priority tier but have no
// calibrated Mw relation here, so they are never converted.
type MagnitudeType = 'Mw' | 'Ms' | 'mb' | 'mB' | 'mbLg' | 'ML' | 'Md';

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
 */
function convertMstoMw(ms: number): MagnitudeConversionResult {
  let mw: number;
  let method: string;

  // Scordilis (2006) is calibrated for 3.0 <= Ms <= 6.1 and 6.2 <= Ms <= 8.2. Outside
  // those ranges the relation is an extrapolation: report it as such with a wider
  // uncertainty so the merge gate does not treat Ms 1.0 -> "Mw 2.74" as a precise
  // measurement.
  const outOfRange = ms < 3.0 || ms > 8.2;
  if (ms < 6.2) {
    mw = 0.67 * ms + 2.07;
    method = outOfRange
      ? 'Scordilis (2006): Mw = 0.67*Ms + 2.07 (EXTRAPOLATED below calibrated Ms 3.0)'
      : 'Scordilis (2006): Mw = 0.67*Ms + 2.07 (3.0 <= Ms <= 6.1)';
  } else {
    mw = 0.99 * ms + 0.08;
    method = outOfRange
      ? 'Scordilis (2006): Mw = 0.99*Ms + 0.08 (EXTRAPOLATED above calibrated Ms 8.2)'
      : 'Scordilis (2006): Mw = 0.99*Ms + 0.08 (6.2 <= Ms <= 8.2)';
  }

  return {
    value: Math.round(mw * 100) / 100,
    uncertainty: outOfRange ? 0.5 : 0.2,
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
  const trimmed = magType.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('mw')) return 'Mw';
  if (lower.startsWith('ms')) return 'Ms';
  // Body-wave family. Case matters here: ISC's broadband 'mB' is not short-period 'mb',
  // and 'mb_Lg'/'mbLg' is the regional Lg-phase scale. Lowercasing merged all three into
  // one Scordilis relation calibrated only on short-period mb.
  if (/^mb[_ ]?lg/.test(lower)) return 'mbLg';
  // Only the mixed-case 'mB' spelling denotes ISC's broadband body-wave scale; an
  // all-caps 'MB' is the ordinary short-period mb written in upper case.
  if (trimmed.startsWith('mB')) return 'mB';
  if (lower.startsWith('mb')) return 'mb';
  if (lower.startsWith('ml')) return 'ML';
  if (lower === 'md' || lower === 'mc') return 'Md';
  // GeoNet's bare 'M' is the SeisComP summary magnitude that the FDSN service reports for
  // most of the New Zealand catalogue: essentially the local magnitude MLv for small and
  // moderate events. It is the ML family here, as in lib/seismological-analysis.ts;
  // unclassified, it scored no type points and could never join the cross-scale
  // comparison, so the commonest NZ pairing (GeoNet M against ISC mb) split (finding #22).
  if (lower === 'm') return 'ML';

  return null;
}

/**
 * Moment-magnitude PROXIES: Mw-scale values an agency derived from another measurement —
 * SeisComP/GeoNet Mw(mB) from the broadband body-wave magnitude, Mwp (and Mwpd) from the
 * P-wave displacement — rather than from a moment-tensor inversion. They are on the Mw
 * scale but carry that conversion's scatter, so they are not exact Mw and rank below it.
 */
function isMwProxy(magType: string | undefined): boolean {
  if (!magType) return false;
  const lower = magType.trim().toLowerCase();
  return lower.startsWith('mw') && (lower.includes('(') || /^mwp(d)?$/.test(lower));
}

/** Typical scatter of an agency's Mw proxy about moment-tensor Mw. */
const MW_PROXY_UNCERTAINTY = 0.3;

/**
 * Convert any magnitude type to Mw (moment magnitude)
 */
function convertToMw(value: number, magType: string | undefined): MagnitudeConversionResult | null {
  const category = getMagnitudeTypeCategory(magType);

  if (!category) {
    return null;
  }

  switch (category) {
    case 'Mw':
      if (isMwProxy(magType)) {
        return {
          value,
          uncertainty: MW_PROXY_UNCERTAINTY,
          method: `Agency Mw proxy (${magType!.trim()}): on the Mw scale but derived from another measurement, not a moment tensor`,
          isExact: false,
        };
      }
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
    case 'mB':
    case 'mbLg':
      // No calibrated relation to Mw in this codebase; the short-period Scordilis
      // formula does not apply. Leave these to raw same-scale comparison.
      return null;
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
 */
const MAGNITUDE_HIERARCHY: Array<{ priority: number; patterns: string[] }> = [
  // Priority 1: Moment magnitude from a moment tensor (best)
  { priority: 1, patterns: ['mw', 'mww', 'mwc', 'mwb', 'mwr'] },
  // Priority 1.5: Mw proxies (Mwp, Mw(mB), ...): Mw scale, conversion scatter (isMwProxy)
  { priority: 1.5, patterns: ['mwp', 'mwpd', 'mw(mb)', 'mw(mwp)'] },
  // Priority 2: Surface wave magnitude
  { priority: 2, patterns: ['ms', 'ms_20', 'ms_bb'] },
  // Priority 3: Body wave magnitude
  { priority: 3, patterns: ['mb', 'mbb', 'mb_lg'] },
  // Priority 4: Local/Richter magnitude (GeoNet's bare 'M' is this family)
  { priority: 4, patterns: ['ml', 'mlv', 'mlr', 'm'] },
  // Priority 5: Duration/Coda magnitude (least reliable)
  { priority: 5, patterns: ['md', 'mc'] },
];

/**
 * Magnitude at which the non-Mw preference changes. Below it (local and regional events,
 * most of the New Zealand catalogue) the local magnitude is the best-calibrated non-Mw
 * scale and short-period mb, measured teleseismically on a few stations, is poorer; from
 * it upward mb saturates (from about 5.5-6) before ML (about 6.5-7) and Ms (about 8), so
 * Ms then leads. 5.5 is also the lower bound the ISC-GEM hierarchy was built for.
 */
const LARGE_EVENT_MAGNITUDE = 5.5;

// ============================================================================
// AGENCY IDENTITY
// ============================================================================

/**
 * Seismological agencies the merge recognises for network authority, the GeoNet/GNS
 * priority options and focal-mechanism authority.
 */
type AgencyKey = 'geonet' | 'gcmt' | 'isc' | 'usgs' | 'emsc' | 'jma' | 'geofon' | 'iris' | 'ingv' | 'ign' | 'bgr';

/**
 * Agency codes as agencies write them in QuakeML creationInfo/agencyID (stored as
 * agency_id) and as FDSN network codes: 'WEL' is GeoNet's ISC code, 'NZ' its FDSN network,
 * 'US' the USGS, 'HRV' the Harvard/Global CMT project, 'ROM' INGV and 'MDD' IGN. A code is
 * matched as a whole, so short codes such as 'nz' and 'us' are never looked for inside
 * words — they are identity only where an agency code is expected.
 */
const AGENCY_CODES: ReadonlyMap<string, AgencyKey> = new Map<string, AgencyKey>([
  ['wel', 'geonet'], ['nz', 'geonet'], ['gns', 'geonet'], ['geonet', 'geonet'],
  ['gcmt', 'gcmt'], ['hrv', 'gcmt'], ['globalcmt', 'gcmt'],
  ['isc', 'isc'], ['iscgem', 'isc'], ['isc-gem', 'isc'],
  ['us', 'usgs'], ['usgs', 'usgs'], ['neic', 'usgs'],
  ['emsc', 'emsc'], ['csem', 'emsc'],
  ['jma', 'jma'],
  ['gfz', 'geofon'], ['geofon', 'geofon'],
  ['iris', 'iris'],
  ['ingv', 'ingv'], ['rom', 'ingv'],
  ['ign', 'ign'], ['mdd', 'ign'],
  ['bgr', 'bgr'],
]);

/**
 * Whole words that name an agency in free text (catalogue names, provider fields). Region
 * words are deliberately absent: "Merged NZ Catalogue", "USGS ComCat NZ region" and
 * "ISC bulletin (NZ)" are not GeoNet, and matching substrings made 'Franz Josef' ISC
 * ('franz' has no 'isc', but 'San Francisco' did) and 'Tonga campaigns' GNS.
 */
const AGENCY_NAME_TOKENS: ReadonlyMap<string, AgencyKey> = new Map<string, AgencyKey>([
  ['geonet', 'geonet'], ['gns', 'geonet'],
  ['gcmt', 'gcmt'], ['globalcmt', 'gcmt'],
  ['isc', 'isc'], ['iscgem', 'isc'],
  ['usgs', 'usgs'], ['neic', 'usgs'], ['anss', 'usgs'], ['comcat', 'usgs'],
  ['emsc', 'emsc'], ['csem', 'emsc'],
  ['jma', 'jma'],
  ['geofon', 'geofon'], ['gfz', 'geofon'],
  ['iris', 'iris'],
  ['ingv', 'ingv'],
  ['ign', 'ign'],
  ['bgr', 'bgr'],
]);

/**
 * Product words that identify an agency only when no agency name appears beside them:
 * a catalogue called "CMT" is the Global CMT, but "GeoNet CMT" is GeoNet's.
 */
const GENERIC_AGENCY_TOKENS: ReadonlyMap<string, AgencyKey> = new Map<string, AgencyKey>([
  ['cmt', 'gcmt'],
]);

/** Lower-case alphanumeric words of a free-text name. */
function nameTokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * The agency a free-text name identifies by whole words, or null when it names none —
 * or more than one ("GeoNet vs USGS comparison" identifies neither).
 */
function agencyFromName(text: unknown): AgencyKey | null {
  if (typeof text !== 'string' || !text) return null;
  const named = new Set<AgencyKey>();
  const generic = new Set<AgencyKey>();
  for (const token of nameTokens(text)) {
    const agency = AGENCY_NAME_TOKENS.get(token);
    if (agency) named.add(agency);
    const product = GENERIC_AGENCY_TOKENS.get(token);
    if (product) generic.add(product);
  }
  if (named.size > 0) return named.size === 1 ? Array.from(named)[0] : null;
  return generic.size === 1 ? Array.from(generic)[0] : null;
}

/** The agency an agency code names ('WEL(GNS_Primary)' is GeoNet), or null. */
function agencyFromCode(code: unknown): AgencyKey | null {
  if (typeof code !== 'string') return null;
  const bare = code.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, '');
  return AGENCY_CODES.get(bare) ?? null;
}

/** Preferred origin of an event's in-memory QuakeML, if it carries one. */
function preferredQuakemlOrigin(e: EventData): Origin | undefined {
  const quakeml = e.quakeml;
  if (!quakeml?.origins?.length) return undefined;
  return quakeml.origins.find(o => o.publicID === quakeml.preferredOriginID) ?? quakeml.origins[0];
}

/**
 * The single source named by an import catalogue's source_catalogues record (the GeoNet
 * importer writes [{ source: 'GeoNet', ... }]); null for merged catalogues, whose record
 * lists several source catalogues.
 */
function importSourceOf(doc: MergedCatalogue): string | null {
  for (const raw of [doc.source_catalogues, doc.merge_config]) {
    if (typeof raw !== 'string' || !raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      if (entries.length !== 1) continue;
      const entry = entries[0] as { id?: unknown; source?: unknown } | null;
      if (entry && typeof entry.source === 'string' && entry.id === undefined) return entry.source;
    } catch {
      // not JSON: no import source recorded
    }
  }
  return null;
}

/**
 * Agency of a whole source catalogue, from explicit catalogue metadata first (provider,
 * data source, the importer's source record), then from whole words of its name. Used
 * only when an event carries no agency code of its own.
 */
function catalogueAgencyOf(catalogue: SourceCatalogue, doc: MergedCatalogue | null): AgencyKey | null {
  const candidates: unknown[] = doc
    ? [doc.provider, doc.data_source, importSourceOf(doc), doc.name]
    : [];
  candidates.push(catalogue.source, catalogue.name);
  for (const candidate of candidates) {
    const agency = agencyFromName(candidate);
    if (agency) return agency;
  }
  return null;
}

/**
 * The agency that produced an event's solution: its own agency code (QuakeML
 * creationInfo/agencyID), then its catalogue's explicit agency, then whole words of the
 * source label. Never a substring of a display name.
 */
function resolveAgency(e: EventData, sourceLabel: string | undefined = e.source): AgencyKey | null {
  return (
    agencyFromCode(e.agency_id) ??
    agencyFromCode(preferredQuakemlOrigin(e)?.creationInfo?.agencyID) ??
    ((e._catalogueAgency as AgencyKey | null | undefined) ?? null) ??
    agencyFromName(sourceLabel)
  );
}

/**
 * Network authority hierarchy for prioritizing seismic data sources. `patterns` are
 * whole words of a source name (or agency codes); `agency` ties an entry to the agency
 * resolveAgency identifies.
 */
interface NetworkAuthority {
  patterns: string[];
  priority: number;
  region?: string;
  description: string;
  agency?: AgencyKey;
}

/**
 * Default network hierarchy (can be overridden by user configuration)
 * This is a global hierarchy suitable for most use cases
 */
const DEFAULT_NETWORK_HIERARCHY: NetworkAuthority[] = [
  // New Zealand authoritative networks
  { patterns: ['geonet', 'gns'], priority: 1, region: 'NZ', description: 'GeoNet (NZ authoritative)', agency: 'geonet' },
  // Global centroid moment tensor
  { patterns: ['gcmt', 'cmt', 'globalcmt'], priority: 2, description: 'Global CMT', agency: 'gcmt' },
  // International Seismological Centre
  { patterns: ['isc', 'iscgem'], priority: 3, description: 'ISC/ISC-GEM', agency: 'isc' },
  // USGS National Earthquake Information Center
  { patterns: ['usgs', 'neic', 'anss', 'comcat'], priority: 4, description: 'USGS/NEIC', agency: 'usgs' },
  // European-Mediterranean Seismological Centre
  { patterns: ['emsc', 'csem'], priority: 5, description: 'EMSC', agency: 'emsc' },
  // Japan Meteorological Agency
  { patterns: ['jma'], priority: 6, region: 'JP', description: 'JMA', agency: 'jma' },
  // Geofon
  { patterns: ['geofon', 'gfz'], priority: 7, description: 'GEOFON/GFZ', agency: 'geofon' },
  // IRIS
  { patterns: ['iris'], priority: 8, description: 'IRIS', agency: 'iris' },
  // Other regional networks
  { patterns: ['ingv'], priority: 9, region: 'IT', description: 'INGV (Italy)', agency: 'ingv' },
  { patterns: ['ign'], priority: 10, region: 'ES', description: 'IGN (Spain)', agency: 'ign' },
];

/**
 * Regional network priority overrides
 * When events are within these regions, use region-specific priorities
 */
interface RegionalPriority {
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  hierarchy: Array<{ patterns: string[]; priority: number; agency?: AgencyKey }>;
}

const REGIONAL_PRIORITIES: Record<string, RegionalPriority> = {
  NZ: {
    // The national extent the rest of the platform uses (lib/geo-bounds-utils
    // NZ_NATIONAL_BOUNDS): the Kermadec Islands, the Chatham Rise and the subantarctic
    // islands are GeoNet's area of responsibility too, and the old -50..-34 box ranked a
    // Kermadec event by the global table. minLon > maxLon marks the antimeridian crossing.
    bounds: {
      minLat: NZ_NATIONAL_BOUNDS.minLatitude,
      maxLat: NZ_NATIONAL_BOUNDS.maxLatitude,
      minLon: NZ_NATIONAL_BOUNDS.minLongitude,
      maxLon: NZ_NATIONAL_BOUNDS.maxLongitude,
    },
    hierarchy: [
      { patterns: ['geonet', 'gns'], priority: 1, agency: 'geonet' },
      { patterns: ['gcmt', 'cmt'], priority: 2, agency: 'gcmt' },
      { patterns: ['isc'], priority: 3, agency: 'isc' },
      { patterns: ['usgs', 'neic'], priority: 4, agency: 'usgs' },
    ],
  },
  JP: {
    bounds: { minLat: 24, maxLat: 46, minLon: 122, maxLon: 154 },
    hierarchy: [
      { patterns: ['jma'], priority: 1, agency: 'jma' },
      { patterns: ['gcmt', 'cmt'], priority: 2, agency: 'gcmt' },
      { patterns: ['isc'], priority: 3, agency: 'isc' },
      { patterns: ['usgs', 'neic'], priority: 4, agency: 'usgs' },
    ],
  },
};

/** Longitude containment that supports antimeridian-crossing regions (minLon > maxLon). */
function inRegionBounds(bounds: RegionalPriority['bounds'], latitude: number, longitude: number): boolean {
  const inLon =
    bounds.minLon <= bounds.maxLon
      ? longitude >= bounds.minLon && longitude <= bounds.maxLon
      : longitude >= bounds.minLon || longitude <= bounds.maxLon;
  return latitude >= bounds.minLat && latitude <= bounds.maxLat && inLon;
}

/**
 * Get network priority for a source name
 * Lower priority = more authoritative (1 is best)
 *
 * The agency is identified from the event's agency code or its catalogue's explicit
 * agency when an event is given, otherwise from whole words of the source name.
 *
 * @param source - Source name to check
 * @param event - Optional event for agency identity and regional priority detection
 * @param customHierarchy - Optional custom hierarchy to use
 * @returns Priority value (lower = better)
 */
function getNetworkPriority(
  source: string | undefined,
  event?: EventData,
  customHierarchy?: NetworkAuthority[]
): number {
  const agency = event ? resolveAgency(event, source) : agencyFromName(source);
  if (!source && !agency) return 999;
  const words = new Set(source ? nameTokens(source) : []);
  const matches = (entry: { patterns: string[]; agency?: AgencyKey }) =>
    agency != null && entry.agency != null
      ? entry.agency === agency
      : entry.patterns.some(p => words.has(p.toLowerCase()));

  // Check for regional priority override
  if (event && Number.isFinite(event.latitude) && Number.isFinite(event.longitude)) {
    for (const regionConfig of Object.values(REGIONAL_PRIORITIES)) {
      if (!inRegionBounds(regionConfig.bounds, event.latitude, event.longitude)) continue;
      const entry = regionConfig.hierarchy.find(matches);
      if (entry) return entry.priority;
    }
  }

  const entry = (customHierarchy || DEFAULT_NETWORK_HIERARCHY).find(matches);
  return entry ? entry.priority : 100; // Unknown network
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

  // Sort by network priority (lower = better), then quality (higher = better), then a
  // fixed record order so the choice never depends on the order the catalogues were read.
  scored.sort((a, b) => {
    if (a.networkPriority !== b.networkPriority) {
      return a.networkPriority - b.networkPriority;
    }
    return b.qualityScore - a.qualityScore || compareRecordOrder(a.event, b.event);
  });

  return scored[0].event;
}

/**
 * Get magnitude priority (lower = better)
 *
 * Without a reference magnitude this is the static type hierarchy (Mw, Mw proxies, Ms,
 * mb, ML, Md). With one — the size of the earthquake being described — the non-Mw scales
 * are ranked by which is not saturated and best calibrated at that size (finding #25):
 * below LARGE_EVENT_MAGNITUDE the local magnitude ML leads, then the body-wave scales,
 * then Ms; from it upward Ms leads, then broadband mB, then ML, then short-period mb.
 * Publishing a raw mb 3.26 ahead of the ML 3.8 of the same M3.8 earthquake (the static
 * order) biased the merged magnitude half a unit low, although both convert to Mw 3.80.
 */
function getMagnitudePriority(magType: string | undefined, referenceMagnitude?: number | null): number {
  if (!magType) return 999;
  const category = getMagnitudeTypeCategory(magType);

  if (typeof referenceMagnitude === 'number' && Number.isFinite(referenceMagnitude)) {
    const large = referenceMagnitude >= LARGE_EVENT_MAGNITUDE;
    switch (category) {
      case 'Mw': return isMwProxy(magType) ? 1.5 : 1;
      case 'ML': return large ? 3 : 2;
      case 'mB': return large ? 2.5 : 3;
      case 'mb':
      case 'mbLg': return large ? 4 : 3;
      case 'Ms': return large ? 2 : 4;
      case 'Md': return 5;
      default: return 100; // Genuinely unknown type
    }
  }

  const lowerType = magType.trim().toLowerCase();

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
  switch (category) {
    case 'Mw': return isMwProxy(magType) ? 1.5 : 1;
    case 'Ms': return 2;
    case 'mb':
    case 'mB':
    case 'mbLg': return 3;
    case 'ML': return 4;
    case 'Md': return 5;
    default: return 100; // Genuinely unknown type
  }
}

/**
 * Select the best magnitude from a group of events using magnitude type hierarchy
 */
/** The measurement the hierarchy selected, with the metadata that belongs to IT. */
interface SelectedMagnitude {
  value: number;
  type: string;
  /** publicID of the QuakeML entry the value came from; null for a scalar column. */
  publicID: string | null;
  uncertainty: number | null;
  stationCount: number | null;
  methodID: string | null;
  evaluationMode: string | null;
  evaluationStatus: string | null;
  /** Index (into the events passed) of the report the measurement came from. */
  sourceIndex: number | null;
}

/** Median of a non-empty list. */
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function selectBestMagnitude(events: EventData[]): SelectedMagnitude {
  // Collect all magnitude candidates with their priorities
  const candidates: Array<{
    value: number;
    type: string;
    uncertainty: number;
    rejected: boolean;
    /** The reporting agency's own preferred measurement. */
    preferred: boolean;
    order: number;
    meta: Omit<SelectedMagnitude, 'value' | 'type'>;
  }> = [];

  events.forEach((event, sourceIndex) => {
    // Track the (value|type) pairs already added for this event so a top-level magnitude
    // that duplicates a QuakeML entry is not double-counted.
    const seen = new Set<string>();

    // The full magnitude list is available either as parsed QuakeML (first export-only
    // merge) or, after storage, ONLY as the `magnitudes` JSON column - upload strips the
    // parsed object. Reading just the former made a stored alternative Mw 5.9 invisible
    // and the selector fell back to the preferred ML 5.4. Use whichever is present.
    let magnitudeList: Array<{ mag?: { value?: number | null; uncertainty?: number | null }; type?: string }> | undefined =
      event.quakeml?.magnitudes;
    let preferredId: unknown = event.quakeml?.preferredMagnitudeID;
    if ((!magnitudeList || magnitudeList.length === 0) && typeof (event as { magnitudes?: unknown }).magnitudes === 'string') {
      preferredId = event.preferred_magnitude_id;
      try {
        const parsed = JSON.parse((event as { magnitudes?: string }).magnitudes as string);
        if (Array.isArray(parsed)) magnitudeList = parsed;
      } catch {
        // unparseable column; fall through to the scalar
      }
    }

    if (magnitudeList && magnitudeList.length > 0) {
      // The column is user-supplied text (CSV/JSON pass-through), not guaranteed to be
      // QuakeML-shaped: only finite numeric values with string types are candidates.
      const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      for (const mag of magnitudeList) {
        if (!mag || typeof mag !== 'object') continue;
        const value = finite(mag.mag?.value);
        // Same physical range the insert validator enforces; a stray 99 in the blob
        // must not be selected and then fail the whole batch on insert.
        if (value === null || value < -3 || value > 10) continue;
        const type = typeof mag.type === 'string' && mag.type ? mag.type : 'unknown';
        seen.add(`${value}|${type.toLowerCase()}`);
        const m = mag as { publicID?: unknown; stationCount?: unknown; methodID?: unknown; evaluationMode?: unknown; evaluationStatus?: unknown };
        const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
        candidates.push({
          value,
          type,
          uncertainty: finite(mag.mag?.uncertainty) ?? 999,
          rejected: str(m.evaluationStatus)?.toLowerCase() === 'rejected',
          preferred: typeof preferredId === 'string' && preferredId !== '' && m.publicID === preferredId,
          order: candidates.length,
          meta: {
            publicID: str(m.publicID),
            uncertainty: finite(mag.mag?.uncertainty),
            stationCount: finite(m.stationCount),
            methodID: str(m.methodID),
            evaluationMode: str(m.evaluationMode),
            evaluationStatus: str(m.evaluationStatus),
            sourceIndex,
          },
        });
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
          uncertainty: event.magnitude_uncertainty ?? 999,
          rejected: String(event.magnitude_evaluation_status ?? '').toLowerCase() === 'rejected',
          // The scalar column IS the agency's preferred magnitude.
          preferred: true,
          order: candidates.length,
          meta: {
            publicID: null,
            uncertainty: event.magnitude_uncertainty ?? null,
            stationCount: event.magnitude_station_count ?? null,
            methodID: event.magnitude_method_id ?? null,
            evaluationMode: event.magnitude_evaluation_mode ?? null,
            evaluationStatus: event.magnitude_evaluation_status ?? null,
            sourceIndex,
          },
        });
      }
    }
  });

  // An agency that marked a magnitude 'rejected' has withdrawn it (QuakeML
  // evaluationStatus): never publish one while any other measurement is available.
  const usable = candidates.some(c => !c.rejected) ? candidates.filter(c => !c.rejected) : candidates;

  // The size the type preference is judged at: the median of the candidates on the common
  // (Mw) scale where they convert, otherwise their raw values.
  const sizes = usable.map(c => convertToMw(c.value, c.type === 'unknown' ? undefined : c.type)?.value ?? c.value);
  const referenceMagnitude = sizes.length > 0 ? median(sizes) : null;
  const priorityOf = (c: (typeof usable)[number]) =>
    getMagnitudePriority(c.type === 'unknown' ? undefined : c.type, referenceMagnitude);

  // Sort by priority (lower = better), then by uncertainty (lower = better), then the
  // reporting agency's own preference, then report order.
  const ranked = usable
    .map(c => ({ c, priority: priorityOf(c) }))
    .sort((a, b) =>
      a.priority - b.priority ||
      a.c.uncertainty - b.c.uncertainty ||
      Number(b.c.preferred) - Number(a.c.preferred) ||
      a.c.order - b.c.order
    );

  if (ranked.length > 0) {
    const best = ranked[0].c;
    return { value: best.value, type: best.type, ...best.meta };
  }

  // Fallback: use simple magnitude field from first event with magnitude
  const index = events.findIndex(e => e.magnitude != null);
  return {
    value: index >= 0 ? events[index].magnitude || 0 : 0,
    type: 'unknown',
    publicID: null,
    uncertainty: null, stationCount: null, methodID: null, evaluationMode: null, evaluationStatus: null,
    sourceIndex: index >= 0 ? index : null,
  };
}

/**
 * Whether a report's depth was FIXED rather than solved for: QuakeML depthType 'operator
 * assigned' (or a legacy free-text label such as 'fixed'). A fixed depth carries no depth
 * information, and the 0 km "uncertainty" many bulletins write beside it only records the
 * fixing.
 */
function isFixedDepth(e: EventData, origin?: Origin): boolean {
  const type = origin?.depthType ?? e.depth_type;
  if (typeof type !== 'string') return false;
  const lower = type.trim().toLowerCase();
  return lower === 'operator assigned' || /\bfix/.test(lower);
}

/**
 * The best-constrained depth of a group and the report it came from.
 *
 * Fixed depths are used only when no report solved for depth (publication/
 * merge_strategies.tex §Depth fixing and §Depth selection: lowest priority, reported only
 * when no free-depth solution exists; the record then carries that report's depth_type).
 * A non-positive uncertainty is treated as absent, not as perfect: a fixed 5 km written
 * with uncertainty 0 used to set the comparison band to 0-5 km and exclude every free
 * solution (finding #27).
 */
function selectBestDepthCandidate(events: EventData[]): { depth: number; index: number } | null {
  const candidates: Array<{
    index: number;
    depth: number;
    uncertainty: number | null;
    stationCount: number;
    depthPhaseCount: number;
    fixed: boolean;
  }> = [];

  events.forEach((e, index) => {
    if (e.depth == null || !Number.isFinite(e.depth)) return;
    const origin = preferredQuakemlOrigin(e);
    // Normalise to KILOMETRES. QuakeML BED gives Origin/depth/uncertainty in metres
    // (see lib/quakeml-to-db.ts, which divides by 1000 on the way into the DB), while the
    // stored depth_uncertainty column is already km. Comparing the raw metre value against
    // a "5 km" threshold ranked a 3000 m (3 km) real uncertainty below a missing one.
    const raw = origin?.depth?.uncertainty != null ? origin.depth.uncertainty / 1000 : e.depth_uncertainty;
    candidates.push({
      index,
      depth: e.depth,
      uncertainty: typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null,
      stationCount: origin?.quality?.usedStationCount ?? e.used_station_count ?? 0,
      depthPhaseCount: origin?.quality?.depthPhaseCount ?? e.depth_phase_count ?? 0,
      fixed: isFixedDepth(e, origin),
    });
  });
  if (candidates.length === 0) return null;

  const free = candidates.filter(c => !c.fixed);
  const pool = free.length > 0 ? free : candidates;
  // Identical evidence is settled by record order, never by input order.
  const earlier = (a: (typeof pool)[number], b: (typeof pool)[number]) =>
    compareRecordOrder(events[a.index], events[b.index]) <= 0 ? a : b;

  const measured = pool.filter(c => c.uncertainty != null);
  let best: (typeof pool)[number];
  if (measured.length > 0) {
    // Depth uncertainties within 5 km of each other are not meaningfully different, so treat
    // every candidate in that band as equally well constrained and prefer station coverage
    // among them. Selecting the band from the group minimum (rather than comparing pairs) is
    // what makes this a well-defined total order: a pairwise "difference > 5 km" comparator is
    // not transitive, so Array.sort could return a different winner for a different input order.
    const minUncertainty = Math.min(...measured.map(c => c.uncertainty!));
    const comparable = measured.filter(c => c.uncertainty! <= minUncertainty + 5);
    best = comparable.reduce((b, c) => {
      if (c.stationCount !== b.stationCount) return c.stationCount > b.stationCount ? c : b;
      if (c.uncertainty !== b.uncertainty) return c.uncertainty! < b.uncertainty! ? c : b;
      return earlier(b, c);
    });
  } else {
    // No formal depth uncertainty anywhere: the solution with the most depth-sensitive
    // phases (pP, sP, ...), then the widest station coverage (merge_strategies.tex).
    best = pool.reduce((b, c) => {
      if (c.depthPhaseCount !== b.depthPhaseCount) return c.depthPhaseCount > b.depthPhaseCount ? c : b;
      if (c.stationCount !== b.stationCount) return c.stationCount > b.stationCount ? c : b;
      return earlier(b, c);
    });
  }
  return { depth: best.depth, index: best.index };
}

/**
 * Select the best depth from a group of events based on uncertainty
 */
function selectBestDepth(events: EventData[]): number | null {
  return selectBestDepthCandidate(events)?.depth ?? null;
}

/**
 * Average longitudes correctly, handling International Date Line crossing
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
 * A report's horizontal location uncertainty in km, or null when it states none: the
 * parsed QuakeML origin's error ellipse or circle (metres) when present, otherwise the
 * stored columns through the platform's single resolver (lib/validation
 * horizontalUncertaintyKm: ellipse semi-major axis, then circular radius, then the lat/lon
 * marginals with the cos(latitude) the old geometric-mean ×111 left out). An ellipse-only
 * origin used to count as undocumented. Non-positive values are not measurements.
 */
function locationUncertaintyKm(event: EventData): number | null {
  const positive = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const origin = preferredQuakemlOrigin(event);
  if (origin) {
    const metres = positive(origin.uncertainty?.maxHorizontalUncertainty) ?? positive(origin.uncertainty?.horizontalUncertainty);
    if (metres != null) return metres / 1000;
    const latDeg = positive(origin.latitude?.uncertainty);
    const lonDeg = positive(origin.longitude?.uncertainty);
    if (latDeg != null || lonDeg != null) {
      const cosLat = Math.cos(((Number.isFinite(event.latitude) ? event.latitude : 0) * Math.PI) / 180);
      return Math.max((latDeg ?? 0) * 111, (lonDeg ?? 0) * 111 * cosLat);
    }
  }
  return positive(horizontalUncertaintyKm(event));
}

/**
 * Inverse-variance location weight 1/σ² of an event (σ in km, clamped to 0.1-100 km), or
 * null when the event reports no usable horizontal uncertainty.
 *
 * The missing case used to return 1.0 — the weight of a σ = 1 km solution — so an
 * undocumented location outweighed every documented one worse than 1 km (a GeoNet σ = 3 km
 * epicentre was pulled 90% of the way to an undocumented CSV row). See weightedLocationAverage
 * for how a group with a missing σ is averaged instead.
 */
function getLocationWeight(event: EventData): number | null {
  const sigmaKm = locationUncertaintyKm(event);
  if (sigmaKm == null) return null;

  // Clamp uncertainty to reasonable range (0.1 km to 100 km)
  const clampedUncertainty = Math.max(0.1, Math.min(sigmaKm, 100));
  // Inverse-VARIANCE weighting: the minimum-variance unbiased combination of
  // independent location estimates is sum(x_i / s_i^2) / sum(1 / s_i^2). The
  // earlier 1/s weight under-weighted well-constrained solutions relative to
  // poorly constrained ones by a factor of s.
  return 1.0 / (clampedUncertainty * clampedUncertainty);
}

/** An averaged epicentre and the normalised weight each report contributed to it. */
interface LocationAverage {
  latitude: number;
  longitude: number;
  /** Normalised weights (summing to 1), in the order of the events passed. */
  weights: number[];
  /** True when every report stated σ and the weights are 1/σ²; false for equal weights. */
  inverseVariance: boolean;
}

/**
 * The averaged epicentre of a group.
 *
 * Inverse-variance weights need a σ for EVERY solution. When any report states none, the
 * group is averaged with equal weights instead: inventing a σ for the missing report is
 * exactly the placeholder the specification rules out (publication/main.tex §Catalogue
 * Merge: a solution without a comparable quantified uncertainty is not given a placeholder
 * value), any imputed value would decide the result, and with equal weights the epicentre
 * no longer depends on which report happened to arrive with an uncertainty column — the
 * same GeoNet solution imported through the FDSN service and through quakesearch CSV
 * gives the same merged location.
 */
function locationAverage(events: EventData[]): LocationAverage {
  if (events.length === 0) {
    return { latitude: 0, longitude: 0, weights: [], inverseVariance: false };
  }
  if (events.length === 1) {
    return { latitude: events[0].latitude, longitude: events[0].longitude, weights: [1], inverseVariance: false };
  }

  const inverse = events.map(e => getLocationWeight(e));
  const inverseVariance = inverse.every(w => w != null && w > 0);
  const raw = inverseVariance ? (inverse as number[]) : events.map(() => 1);
  const total = raw.reduce((sum, w) => sum + w, 0);
  const weights = raw.map(w => w / total);

  // Weighted latitude average
  const latitude = events.reduce((sum, e, i) => sum + e.latitude * weights[i], 0);

  // Weighted longitude average (with date line handling)
  const lons = events.map(e => e.longitude);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  let longitude: number;
  if (maxLon - minLon < 180) {
    // No date line crossing - simple weighted average
    longitude = events.reduce((sum, e, i) => sum + e.longitude * weights[i], 0);
  } else {
    // Date line crossing - use Cartesian method with weights
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < events.length; i++) {
      const radians = events[i].longitude * Math.PI / 180;
      sumX += Math.cos(radians) * weights[i];
      sumY += Math.sin(radians) * weights[i];
    }
    longitude = Math.atan2(sumY, sumX) * 180 / Math.PI;
  }

  return { latitude, longitude, weights, inverseVariance };
}

/**
 * Calculate uncertainty-weighted average location
 *
 * Uses inverse-variance weighting when every event reports a horizontal uncertainty
 * (lower uncertainty contributes more), and equal weights otherwise (see locationAverage).
 *
 * @param events - Array of events to average
 * @returns Object with weighted average latitude and longitude
 */
function weightedLocationAverage(events: EventData[]): { latitude: number; longitude: number } {
  const { latitude, longitude } = locationAverage(events);
  return { latitude, longitude };
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
  // Uncertainty-weighted location averaging (equal weights when any report lacks σ)
  const location = locationAverage(events);

  // IMPROVEMENT: Use magnitude hierarchy instead of averaging
  // Averaging Mw=7.0 with ML=6.5 would give M=6.75 (incorrect due to saturation)
  const bestMagnitude = selectBestMagnitude(events);

  // IMPROVEMENT: Use best depth based on uncertainty instead of simple average
  const depthChoice = selectBestDepthCandidate(events);

  // Use the earliest time - use pre-computed _timestamp if available for performance
  const earliestEvent = events.reduce((earliest, e) => (compareRecordOrder(e, earliest) < 0 ? e : earliest));

  // Spread the highest-quality source event so that its identity (source_id,
  // event_public_id), event-level fields and supplementary products are kept. The averaged
  // location, best-hierarchy magnitude, best-uncertainty depth and earliest time then
  // overwrite the fields that were actually computed, and everything that described the
  // spread event's OWN solution is cleared below.
  const bestQualityEvent = events
    .map(e => ({ event: e, score: calculateQualityScore(e) }))
    .reduce((best, curr) => curr.score > best.score ? curr : best)
    .event;

  const merged: MergedEventData = {
    ...bestQualityEvent,
    time: earliestEvent.time,
    latitude: location.latitude,
    longitude: location.longitude,
    depth: depthChoice?.depth ?? null,
    magnitude: bestMagnitude.value,
    source: 'merged',
    // No report's solution was published as a whole, so none is `selected` (C2).
    sourceEvents: buildSourceEvents(events)
  };
  // The source_id kept from the base event is qualified by ITS agency, not by 'merged'.
  (merged as { _sourceIdAgency?: string })._sourceIdAgency = bestQualityEvent.source;

  // The spread above carries bestQualityEvent's OWN magnitude, location, depth and origin
  // metadata. Every one of those quantities has just been replaced by something that event
  // did not report — a hierarchy-selected magnitude that may come from another source, a
  // weighted-average epicentre that matches no source, the best-constrained depth and the
  // earliest origin time — so leaving the metadata in place would mislabel the merged
  // record (e.g. "Mw 5.9 ± 0.08 from 40 stations" when the Mw 5.9 came from a 12-station
  // solution, or another agency's time uncertainty, method, gap and station count on an
  // epicentre no agency located).
  if (events.length > 1) {
    for (const field of MAGNITUDE_META_FIELDS) (merged as any)[field] = null;
    for (const field of LOCATION_META_FIELDS) (merged as any)[field] = null;
    for (const field of DEPTH_META_FIELDS) (merged as any)[field] = null;
    for (const field of ORIGIN_META_FIELDS) (merged as any)[field] = null;
    (merged as { _averagedOrigin?: boolean })._averagedOrigin = true;

    // Provenance: which report each published quantity came from, and each report's share
    // of the averaged epicentre (inverse-variance, or equal when a report stated no σ).
    location.weights.forEach((weight, index) => {
      merged.sourceEvents[index].locationWeight = Math.round(weight * 1e6) / 1e6;
    });
    if (bestMagnitude.sourceIndex != null) merged.sourceEvents[bestMagnitude.sourceIndex].magnitudeSelected = true;
    if (depthChoice) merged.sourceEvents[depthChoice.index].depthSelected = true;
  }

  // Set after the clear: the selected magnitude's OWN metadata, from the measurement the
  // hierarchy actually chose. Nulling these lost real data; and copying them from the
  // base event stamped a different measurement's ±0.30 / 4 stations onto a selection
  // that came from a ±0.05 / 12-station solution with the same value.
  merged.magnitude_type = bestMagnitude.type !== 'unknown' ? bestMagnitude.type : null;
  merged.magnitude_uncertainty = bestMagnitude.uncertainty;
  merged.magnitude_station_count = bestMagnitude.stationCount;
  merged.magnitude_method_id = bestMagnitude.methodID;
  merged.magnitude_evaluation_mode = bestMagnitude.evaluationMode;
  merged.magnitude_evaluation_status = bestMagnitude.evaluationStatus;
  // The preferred-magnitude pointer follows the selected measurement: left pointing at
  // the base's own preferred entry, the exporter rewrote THAT entry (an ML) with the
  // selected Mw value and emitted the real Mw entry beside it.
  merged.preferred_magnitude_id = bestMagnitude.publicID;
  (merged as { _magnitudeResolved?: boolean })._magnitudeResolved = true;

  return merged;
}

/** Parse an ISO time, or null. */
function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Parse a JSON column that may already be an object. */
function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * When a report's solution was determined, in ms since the epoch: the creation time of the
 * origin it publishes (QuakeML Origin/creationInfo/creationTime, from the parsed QuakeML or
 * the stored `origins` column), else the latest of the event record's creation and
 * modification times (`creation_info`). Null when the report does not say. The platform's
 * own created_at is deliberately not used: it records when the file was uploaded, not
 * when the agency computed the solution.
 */
function determinationTime(e: EventData): number | null {
  let origin: { creationInfo?: { creationTime?: string } } | undefined = preferredQuakemlOrigin(e);
  if (!origin) {
    const stored = parseJsonColumn(e.origins);
    if (Array.isArray(stored) && stored.length > 0) {
      const list = stored.filter((o): o is Record<string, any> => o != null && typeof o === 'object');
      origin =
        list.find(o => typeof e.preferred_origin_id === 'string' && o.publicID === e.preferred_origin_id) ??
        list.find(o => o.latitude?.value === e.latitude && o.longitude?.value === e.longitude) ??
        (list.length === 1 ? list[0] : undefined);
    }
  }
  const originTime = parseTime(origin?.creationInfo?.creationTime);
  if (originTime != null) return originTime;

  const info = (e.quakeml?.creationInfo ?? parseJsonColumn(e.creation_info)) as
    | { creationTime?: unknown; modificationTime?: unknown }
    | null
    | undefined;
  const times = [parseTime(info?.creationTime), parseTime(info?.modificationTime)].filter(
    (t): t is number => t != null
  );
  return times.length > 0 ? Math.max(...times) : null;
}

/** Review stage of a solution: later analyses supersede earlier ones. */
const EVALUATION_STATUS_RANK: Readonly<Record<string, number>> = {
  final: 4,
  reviewed: 3,
  confirmed: 2,
  preliminary: 1,
  rejected: 0,
};

/** Rank of a report's evaluation status, or null when it reports none (or an unknown one). */
function evaluationStatusRank(e: EventData): number | null {
  const status = e.evaluation_status ?? preferredQuakemlOrigin(e)?.evaluationStatus;
  if (typeof status !== 'string') return null;
  const rank = EVALUATION_STATUS_RANK[status.trim().toLowerCase()];
  return rank === undefined ? null : rank;
}

/**
 * Reports ranked most recently determined first — the 'newest' strategy, specified as
 * "the most recently determined solution is retained, where later analyses supersede
 * earlier ones" (publication/main.tex §Catalogue Merge). Reports of one earthquake differ
 * in ORIGIN time only by location and velocity-model scatter, so the latest origin time
 * (what 'newest' used to pick) says nothing about which analysis is newer (finding #23).
 *
 * Each step is used only when every report in the group provides its evidence, so a
 * report is never preferred merely because another one is silent:
 *  1. determination time (see determinationTime), latest first;
 *  2. evaluation status, final > reviewed > confirmed > preliminary > rejected;
 *  3. the quality ranking (rankByQuality: common quality metrics, network authority when
 *     a report has none, then a fixed record order).
 * A report its agency marked 'rejected' never wins while another report is available.
 */
function rankByNewest(events: EventData[]): EventData[] {
  const times = events.map(determinationTime);
  const statuses = events.map(evaluationStatusRank);
  const allTimed = times.every(t => t != null);
  const allStatused = statuses.every(s => s != null);
  const qualityPosition = new Map(rankByQuality(events).map((e, i) => [e, i] as [EventData, number]));
  const indexOf = new Map(events.map((e, i) => [e, i] as [EventData, number]));

  return events.slice().sort((a, b) => {
    const ia = indexOf.get(a)!;
    const ib = indexOf.get(b)!;
    const rejectedA = statuses[ia] === 0;
    const rejectedB = statuses[ib] === 0;
    if (rejectedA !== rejectedB) return rejectedA ? 1 : -1;
    if (allTimed && times[ia] !== times[ib]) return times[ib]! - times[ia]!;
    if (allStatused && statuses[ia] !== statuses[ib]) return statuses[ib]! - statuses[ia]!;
    return qualityPosition.get(a)! - qualityPosition.get(b)!;
  });
}

/**
 * Merge by keeping the most recently determined solution (see rankByNewest).
 */
function mergeByNewest(events: EventData[]): MergedEventData {
  const newestEvent = rankByNewest(events)[0];

  return {
    ...newestEvent,
    sourceEvents: buildSourceEvents(events, events.indexOf(newestEvent))
  };
}

/**
 * Merge by selecting the most complete event (most non-null fields)
 * Considers both basic fields and QuakeML extended data
 */
function mergeByCompleteness(events: EventData[]): MergedEventData {
  // Score each event once to avoid re-computing the accumulator's score on every
  // reduce iteration (which was O(n²) field-count traversals). Working values the merge
  // attaches (`_`-prefixed) are not data and are not counted.
  const scoreEvent = (e: EventData): number => {
    let score = Object.entries(e).filter(([key, v]) => v != null && !key.startsWith('_')).length;
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
    .reduce((best, curr) =>
      curr.score !== best.score
        ? (curr.score > best.score ? curr : best)
        : (compareRecordOrder(curr.event, best.event) < 0 ? curr : best)
    )
    .event;

  return {
    ...mostComplete,
    sourceEvents: buildSourceEvents(events, events.indexOf(mostComplete))
  };
}

/** The quality metrics the merge-time score reads, as one report states them. */
interface QualityEvidence {
  stationCount: number | null;
  azimuthalGap: number | null;
  standardError: number | null;
  magnitudeUncertainty: number | null;
  evaluationStatus: string | null;
  magnitudeType: string | null;
  magnitude: number | null;
}

type QualityTerm = 'stations' | 'gap' | 'rms' | 'magnitudeUncertainty' | 'magnitudeType' | 'status';
const QUALITY_TERMS: ReadonlyArray<QualityTerm> = ['stations', 'gap', 'rms', 'magnitudeUncertainty', 'magnitudeType', 'status'];
/**
 * The terms that are evidence of how well a SOLUTION is constrained or reviewed. A
 * magnitude-type label on its own is not: it says which scale was measured.
 */
const SOLUTION_EVIDENCE_TERMS: ReadonlyArray<QualityTerm> = ['stations', 'gap', 'rms', 'magnitudeUncertainty', 'status'];

/**
 * Resolve every metric from the parsed QuakeML when it is present, and otherwise from the
 * FLAT MergedEvent columns that lib/quakeml-to-db.ts extracts.
 */
function qualityEvidence(event: EventData): QualityEvidence {
  const origin = preferredQuakemlOrigin(event);
  // Preferred magnitude, when parsed QuakeML is attached to the event.
  const mag = event.quakeml?.magnitudes?.find(m =>
    m.publicID === event.quakeml?.preferredMagnitudeID
  ) || event.quakeml?.magnitudes?.[0];
  const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
  return {
    stationCount: finite(origin?.quality?.usedStationCount ?? event.used_station_count),
    azimuthalGap: finite(origin?.quality?.azimuthalGap ?? event.azimuthal_gap),
    standardError: finite(origin?.quality?.standardError ?? event.standard_error),
    magnitudeUncertainty: finite(mag?.mag?.uncertainty ?? event.magnitude_uncertainty),
    evaluationStatus: text(
      origin?.evaluationStatus ?? mag?.evaluationStatus ?? event.evaluation_status ?? event.magnitude_evaluation_status
    ),
    magnitudeType: text(mag?.type ?? event.magnitude_type),
    magnitude: finite(mag?.mag?.value ?? event.magnitude),
  };
}

/** Whether a report states the metric a term scores. */
function reportsTerm(evidence: QualityEvidence, term: QualityTerm): boolean {
  switch (term) {
    case 'stations': return evidence.stationCount != null && evidence.stationCount > 0;
    case 'gap': return evidence.azimuthalGap != null && evidence.azimuthalGap >= 0;
    case 'rms': return evidence.standardError != null && evidence.standardError >= 0;
    case 'magnitudeUncertainty': return evidence.magnitudeUncertainty != null && evidence.magnitudeUncertainty >= 0;
    case 'magnitudeType': return getMagnitudeTypeCategory(evidence.magnitudeType ?? undefined) != null;
    case 'status': return evidence.evaluationStatus != null;
  }
}

/** Points for a magnitude type's rank (getMagnitudePriority): Mw 15 ... Md 3, unknown 0. */
function magnitudeTypePoints(priority: number): number {
  if (priority <= 1) return 15;
  if (priority <= 1.5) return 13;
  if (priority <= 2) return 12;
  if (priority <= 2.5) return 10;
  if (priority <= 3) return 9;
  if (priority <= 4) return 6;
  if (priority <= 5) return 3;
  return 0;
}

/**
 * Points one term earns (0 when the metric is absent). The magnitude-type preference is
 * judged at `referenceMagnitude`, the size of the earthquake (see getMagnitudePriority).
 */
function qualityTermPoints(evidence: QualityEvidence, term: QualityTerm, referenceMagnitude: number | null): number {
  switch (term) {
    case 'stations': {
      // Station count (0-25 points, logarithmic scale)
      // 6 stations = 50%, 15 stations = 80%, 30+ stations = 100%
      // Using logarithmic scale because quality improvement diminishes with more stations
      const stationCount = evidence.stationCount ?? 0;
      // log2(6) ≈ 2.58, log2(30) ≈ 4.9
      return stationCount > 0 ? Math.min(25, 25 * (Math.log2(stationCount + 1) / Math.log2(32))) : 0;
    }
    case 'gap': {
      // Azimuthal gap (0-20 points, lower is better)
      // Gap < 120° = excellent (full score), gap > 270° = poor
      // ISC-GEM considers < 180° as acceptable
      const gap = evidence.azimuthalGap;
      if (gap == null) return 0;
      if (gap <= 120) return 20;
      if (gap <= 180) return 15;
      if (gap <= 270) return 10 * (1 - (gap - 180) / 90);
      return 0; // > 270° = 0 points
    }
    case 'rms': {
      // Standard error / RMS residual (0-15 points, lower is better)
      // RMS < 0.3s = excellent, RMS > 1.0s = poor (based on ISC standards)
      const rms = evidence.standardError;
      if (rms == null) return 0;
      if (rms <= 0.3) return 15;
      if (rms <= 0.5) return 12;
      if (rms <= 1.0) return 8;
      if (rms <= 2.0) return 4;
      return 0; // > 2.0s = 0 points
    }
    case 'magnitudeUncertainty': {
      // Magnitude uncertainty (0-15 points, lower is better)
      // Uncertainty < 0.1 = excellent, > 0.3 = poor
      const unc = evidence.magnitudeUncertainty;
      if (unc == null) return 0;
      if (unc <= 0.1) return 15;
      if (unc <= 0.2) return 12;
      if (unc <= 0.3) return 8;
      if (unc <= 0.5) return 4;
      return 0; // > 0.5 = 0 points
    }
    case 'magnitudeType':
      // Magnitude type preference (0-15 points): Mw first, then the scale that is best
      // calibrated and unsaturated at this size — the same family classifier and order
      // the magnitude selection uses (getMagnitudePriority), so GeoNet's bare 'M' is the
      // ML family and a local event's ML is not out-scored by a raw teleseismic mb.
      return evidence.magnitudeType
        ? magnitudeTypePoints(getMagnitudePriority(evidence.magnitudeType, referenceMagnitude))
        : 0;
    case 'status': {
      // Evaluation status (0-10 points)
      // final/reviewed > confirmed > preliminary; rejected/unknown = 0 points
      const status = evidence.evaluationStatus?.toLowerCase();
      if (status === 'final' || status === 'reviewed') return 10;
      if (status === 'confirmed') return 6;
      if (status === 'preliminary') return 2;
      return 0;
    }
  }
}

/**
 * Calculate quality score for an event based on available quality metrics
 */
function calculateQualityScore(event: EventData): number {
  const evidence = qualityEvidence(event);
  // Every event is scored on the same fixed 100-point budget (25+20+15+15+15+10), never
  // against only the metrics it happens to report. A record with NO quality metadata used
  // to take a separate 25-point "basic completeness" branch, which outranked a documented
  // event scoring below 25 on the real scale - so stripping metadata raised a source's rank.
  // Now an event that reports nothing scores 0: absence of evidence earns no points, and
  // having a depth, magnitude and time is the admission ticket, not a quality signal.
  // Comparing two reports, though, is rankByQuality's job: it only compares the metrics
  // both report.
  return QUALITY_TERMS.reduce((score, term) => score + qualityTermPoints(evidence, term, evidence.magnitude), 0);
}

/**
 * Reports ranked best-constrained first — the 'quality' strategy (finding gi#0).
 *
 * Reports are compared only on the quality metrics that EVERY report in the group states.
 * Scoring a missing metric as 0 made the winner depend on how the data arrived: GeoNet's
 * FDSN importer stores no station count, gap, RMS or status for M<5 events, so its
 * solution scored 0 and lost to any report with a recognised magnitude label, while the
 * same solution uploaded from a quakesearch CSV won. When some report states no quality
 * evidence at all, nothing about the solutions can be compared, and network authority
 * (getNetworkPriority, regional overrides included) decides instead. Remaining ties go to
 * authority, then to the report with more of the core record populated, then to a fixed
 * record order — never to input order.
 */
function rankByQuality(events: EventData[]): EventData[] {
  const evidence = events.map(qualityEvidence);
  const comparable = evidence.every(ev => SOLUTION_EVIDENCE_TERMS.some(term => reportsTerm(ev, term)));
  const common = comparable ? QUALITY_TERMS.filter(term => evidence.every(ev => reportsTerm(ev, term))) : [];
  const sizes = evidence
    .map((ev, i) => mwForOrdering(events[i]) ?? ev.magnitude)
    .filter((m): m is number => m != null && Number.isFinite(m));
  const reference = sizes.length > 0 ? median(sizes) : null;
  const scores = evidence.map(ev => common.reduce((sum, term) => sum + qualityTermPoints(ev, term, reference), 0));
  const authority = events.map(e => getNetworkPriority(e.source, e));
  const populated = events.map(e => [e.depth, e.magnitude, e.magnitude_type].filter(v => v != null).length);

  return events
    .map((event, index) => index)
    .sort((a, b) =>
      scores[b] - scores[a] ||
      authority[a] - authority[b] ||
      populated[b] - populated[a] ||
      compareRecordOrder(events[a], events[b])
    )
    .map(index => events[index]);
}

/**
 * Merge by selecting event with best quality metrics
 */
function mergeByQuality(events: EventData[]): MergedEventData {
  const bestEvent = rankByQuality(events)[0];

  return {
    ...bestEvent,
    sourceEvents: buildSourceEvents(events, events.indexOf(bestEvent))
  };
}

/**
 * Custom Order (contract C10): the report from the highest-ranked catalogue in
 * `priorityOrder` (catalogue IDs, highest priority first) is kept. Reports from catalogues
 * the ranking does not list come after every listed one; remaining ties are broken by
 * quality (rankByQuality).
 */
function selectByPriorityOrder(events: EventData[], priorityOrder?: string[]): EventData {
  const order = Array.isArray(priorityOrder) ? priorityOrder.map(String) : [];
  const rankOf = (e: EventData) => {
    const position = order.indexOf(String(e.catalogueId ?? ''));
    return position >= 0 ? position : order.length;
  };
  const best = Math.min(...events.map(rankOf));
  const tied = events.filter(e => rankOf(e) === best);
  return tied.length === 1 ? tied[0] : rankByQuality(tied)[0];
}

/**
 * "<Agency> > Others" (the 'geonet' and 'gns' options, or any agency name): keep the report
 * that agency produced. The agency is recognised by its agency code or the catalogue's own
 * metadata (resolveAgency) and otherwise by whole words of the catalogue name — never by a
 * substring, which made 'Merged NZ Catalogue' and 'USGS ComCat NZ region' GeoNet. A
 * priority that names no known agency matches catalogue names word for word. Among several
 * such reports the best quality wins; with none, network authority decides, then quality.
 */
function selectByAgencyPreference(events: EventData[], priority: string): EventData {
  const agency = agencyFromName(priority) ?? agencyFromCode(priority);
  let preferred: EventData[];
  if (agency) {
    preferred = events.filter(e => resolveAgency(e) === agency);
  } else {
    const wanted = nameTokens(priority);
    preferred = wanted.length === 0 ? [] : events.filter(e => {
      const words = new Set(nameTokens(String(e.source ?? '')));
      return wanted.every(word => words.has(word));
    });
  }
  if (preferred.length === 1) return preferred[0];
  if (preferred.length > 1) return rankByQuality(preferred)[0];
  return selectByNetworkAuthority(events);
}

/**
 * Merge by priority (based on source)
 */
function mergeByPriority(events: EventData[], priority: string, priorityOrder?: string[]): MergedEventData {
  let selectedEvent: EventData;

  if (priority === 'newest') {
    selectedEvent = rankByNewest(events)[0];
  } else if (priority === 'quality') {
    // Use quality-based selection
    selectedEvent = rankByQuality(events)[0];
  } else if (priority === 'authority') {
    // Use network authority hierarchy with regional awareness
    selectedEvent = selectByNetworkAuthority(events);
  } else if (priority === 'custom') {
    selectedEvent = selectByPriorityOrder(events, priorityOrder);
  } else {
    selectedEvent = selectByAgencyPreference(events, String(priority ?? ''));
  }

  return {
    ...selectedEvent,
    sourceEvents: buildSourceEvents(events, events.indexOf(selectedEvent))
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
    const eventsArray = await loadCompleteCatalogueEvents(catalogueIdStr);
    // The same agency identity the persist path uses, so preview and merge select alike.
    const catalogueAgency = catalogueAgencyOf(catalogue, await loadSourceCatalogueDocument(catalogueIdStr));

    // Assign color to catalogue
    catalogueColors[catalogueIdStr] = colors[i % colors.length];

    // A loop, not push(...spread): the spread hits the engine's argument limit at
    // ~125k events.
    const previewSource = catalogue.source || catalogue.name || 'unknown';
    for (const e of eventsArray) {
      allEvents.push({
        ...e,
        source: previewSource,
        catalogueId: catalogueIdStr,
        catalogueName: catalogue.name,
        _catalogueAgency: catalogueAgency,
      } as EventData);
    }
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

    // Contested association (see MatchGroup.ambiguous): the closest pairing was kept, but a
    // reviewer should confirm it — dense sequences are where fixed windows mislead.
    if (matchGroup.ambiguous) {
      validationWarnings.push(
        'Ambiguous association: a report in this group was nearly as close, in time and distance, to ' +
        'another event that could not join it (a second report from a catalogue already in the group, ' +
        'or one too far from the rest); the closest match was kept.'
      );
    }

    const isSuspicious =
      matchGroup.regrouped ||
      matchGroup.ambiguous ||
      (matchingEvents.length > 1 && !validateEventGroup(matchingEvents));

    if (matchingEvents.length > 1) {
      // Report EXACTLY what the gate decided: same helper, same filtered statistics, same
      // thresholds. The preview used to recompute the mean and range over the unfiltered
      // magnitude list, so a single null member coerced to 0 through Math.min/reduce and the
      // panel quoted a fabricated range (and a threshold from a fabricated mean) for a group
      // the merge had accepted without complaint.
      const magnitude = assessMagnitudeConsistency(matchingEvents);
      if (magnitude.reason) {
        // reason is set both when the gate rejected the group and when it accepted only
        // because the members agree on the common (Mw) scale — say which.
        validationWarnings.push(magnitude.reason);
      }

      const depths = matchingEvents.filter(e => e.depth != null).map(e => e.depth!);
      if (depths.length > 1) {
        const depthRange = Math.max(...depths) - Math.min(...depths);
        const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
        // Same filtered mean the gate uses; a group with no usable magnitude keeps the
        // strictest tier rather than inventing a mean from nulls.
        const avgMagPreview = magnitude.count > 0 ? magnitude.rawMean : 0;
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

    // The report whose solution the merge publishes is the one it marks `selected` in the
    // provenance (C2); source events are in group order. An averaged epicentre publishes
    // no single report's solution, so no member is selected (-1).
    const mergedEvent = mergeEventGroup(matchingEvents, config);
    const selectedEventIndex = mergedEvent.sourceEvents.findIndex(entry => entry.selected === true);

    return {
      id: `group-${i}`,
      events: matchingEvents,
      selectedEventIndex,
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
  loadCompleteCatalogueEvents,
  unionMergeFields,
  UNION_SCALAR_FIELDS,
  UNION_BLOB_FIELDS,
  ORIGIN_META_FIELDS,
  LOCATION_META_FIELDS,
  regroupFailedEvents,
  pairSeparation,
  sourceKey,
  rankByQuality,
  rankByNewest,
  determinationTime,
  selectByPriorityOrder,
  locationAverage,
  selectBestDepthCandidate,
  unionFocalMechanisms,
  isMwProxy,
  // Agency identity
  agencyFromName,
  agencyFromCode,
  resolveAgency,
  catalogueAgencyOf,
  inRegionBounds,
  buildMergedEventFields,
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
