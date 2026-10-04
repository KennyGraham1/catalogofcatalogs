import { dbQueries, MergedEvent, MergedCatalogue } from './db';
import type { ClientSession } from './mongodb';
import { createId } from './id';
import { AppError } from './errors';
import { calculateDistance, calculateTimeDifference } from './earthquake-utils';
import type { SourceCatalogue, MergeConfig, MergeFieldRules } from './validation';
import type { QuakeMLEvent, FocalMechanism, Origin } from './types/quakeml';
import { extractBoundsFromEvents } from './geo-bounds-utils';
import { metricsFromEvent, scoreQualityMetrics } from './quality-scoring';
import { OKABE_ITO } from './map-style';
import {
  DEFAULT_MERGE_AUTHORITY,
  currentMergeAuthority,
  loadMergeAuthority,
  runWithMergeAuthority,
  type AgencyKey,
  type AuthorityEntry,
  type MergeAuthorityTable,
  type RegionalAuthority,
} from './merge-authority';
import {
  QC_PREVIEW_MAX_MATCHED,
  buildMergeQcSummary,
  type MergePreviewPayload,
  type MergeQcSummary,
  type QcEntryInput,
  type QcGroupInput,
  type QcPreviewEntry,
  type QcPreviewGroup,
} from './merge-qc';
import packageJson from '../package.json';

/** Who wrote a merge QC summary: the platform and its package version. */
export const QC_GENERATED_BY = `Earthquake Catalogue Platform ${packageJson.version}`;

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
 * Verify a source exists and is ready, and read its explicit agency metadata. A missing
 * catalogue is not an empty catalogue, and a failed metadata lookup must not silently
 * change network authority. Adapters without catalogue documents use event metadata.
 */
async function loadSourceCatalogueDocument(catalogueId: string): Promise<MergedCatalogue | null> {
  const db = dbQueries;
  if (!db || typeof db.getCatalogueById !== 'function') return null;
  const catalogue = await db.getCatalogueById(catalogueId);
  if (!catalogue) {
    throw new AppError('One or more source catalogues were not found', 404, 'CATALOGUE_NOT_FOUND');
  }
  if (catalogue.status === 'processing' || (catalogue.status as string) === 'deleting') {
    throw new AppError('A source catalogue is being updated or deleted. Retry when it is ready.', 409, 'CATALOGUE_NOT_READY');
  }
  return catalogue;
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
 * `depthSelected` mark where the averaged strategy (or a field rule) took its magnitude and
 * depth, `mechanismSelected` the report whose focal mechanism was published when one
 * report's was chosen (a mechanism field rule), and `locationWeight` is that report's
 * normalised share of the averaged epicentre. `superseded` marks an older vintage of the
 * same agency's solution (M5): kept for provenance, it takes no part in any selection.
 */
interface SourceEventEntry {
  catalogueId: string | number;
  source: string;
  originalData: EventData;
  selected?: true;
  magnitudeSelected?: true;
  depthSelected?: true;
  mechanismSelected?: true;
  superseded?: true;
  locationWeight?: number;
}

interface MergedEventData extends EventData {
  sourceEvents: SourceEventEntry[];
  /** Set by the persist path when the request holds flagged groups (onConflict 'hold'). */
  review_status?: 'pending' | 'resolved' | null;
  review_reasons?: string[] | null;
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
  | 'same_agency'          // One agency's two DIFFERENT events (distinct agency ids) in one group
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

  // The network-authority table is read once per merge and scoped to it (M6): every
  // ranking below consults the same table, and a table an administrator saves while this
  // merge runs applies to the next one.
  const authority = await loadMergeAuthority();
  return runWithMergeAuthority(authority, async () => {
    // If export-only mode, don't use transactions
    if (exportOnly) {
      return await executeMergeOperation(catalogueId, name, sourceCatalogues, config, metadata, exportOnly, undefined, options);
    }

    // Use transaction for database writes
    try {
      return await dbQueries!.transaction(async (session) => {
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
  });
}

/**
 * Optional MergedEvent columns a merged row may carry, in the order the database stores
 * them. Shared by the persist path, the export-only path and the review rebuild
 * (rebuildMergedEventForReport) so the three always produce the same field set.
 */
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
  // A depth field rule published another report's depth with that report's own type and
  // uncertainty; the base's QuakeML origin describes a different depth (M1).
  const depthResolved = (event as { _depthResolved?: boolean })._depthResolved === true;

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
      if (!depthResolved) {
        fields.depth_uncertainty = preferredOrigin.depth?.uncertainty != null
          ? preferredOrigin.depth.uncertainty / 1000
          : undefined;
      }
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
      if (!depthResolved) fields.depth_type = preferredOrigin.depthType;
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

  // Review workflow columns (contract M3), on every row so a reader can rely on their
  // presence: a group held for review carries 'pending' and the preview's warnings; every
  // other row null. The reviewer's fields are written by resolveMergedEventReview.
  const review = event as {
    review_status?: string | null;
    review_reasons?: unknown;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    review_choice?: string | null;
  };
  fields.review_status = review.review_status ?? null;
  fields.review_reasons = Array.isArray(review.review_reasons) ? review.review_reasons : null;
  fields.reviewed_by = review.reviewed_by ?? null;
  fields.reviewed_at = review.reviewed_at ?? null;
  fields.review_choice = review.review_choice ?? null;

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
      const sourceDocument = await loadSourceCatalogueDocument(catalogueIdStr);
      const eventsArray = await loadCompleteCatalogueEvents(catalogueIdStr);
      const catalogueAgency = catalogueAgencyOf(catalogue, sourceDocument);

      // A loop, not push(...spread): spreading a whole source catalogue as function
      // arguments throws RangeError past the V8 argument limit (~131k), so a
      // national-scale source could not be merged at all.
      const source = catalogue.source || catalogue.name || 'unknown';
      for (const e of eventsArray) {
        allEvents.push({ ...e, source, catalogueId: catalogueIdStr, _catalogueAgency: catalogueAgency } as EventData);
      }
    }

    // Perform the merge
    const resolvedGroups = performMerge(allEvents, config);
    const mergedEvents = resolvedGroups.map(resolved => resolved.merged);

    // If export-only mode, return full event records without saving to database.
    // Uses the same field extraction as the DB save path so exports contain all
    // available QuakeML/rich fields — not just the 7-field minimal shape.
    // Rows a 'hold' request kept back for review (M4); the merge page reports the count.
    const heldForReviewCount = mergedEvents.filter(e => e.review_status === 'pending').length;

    const eventRows = mergedEvents.map(event => ({
      ...buildMergedEventFields(event, OPTIONAL_DB_FIELDS),
      id: exportOnly ? event.id || createId() : createId(),
    } as Record<string, unknown> & { id: string }));

    // Association has already decided which reports belong together. Two separate output
    // groups can still carry the same source_id (for example, equally named CSV catalogues
    // using independent row numbers, or revisions outside the matching window). The
    // ingestion writer deduplicates those keys, so give EVERY colliding group its own
    // merge identity. Keep the agency's original ID in source_events. Use the same rule
    // for export and save, and retain this identity when a reviewer republishes a report.
    const sourceIdCounts = new Map<string, number>();
    for (const row of eventRows) {
      if (typeof row.source_id === 'string') {
        sourceIdCounts.set(row.source_id, (sourceIdCounts.get(row.source_id) ?? 0) + 1);
      }
    }
    const reservedSourceIds = new Set(sourceIdCounts.keys());
    for (const row of eventRows) {
      if (typeof row.source_id !== 'string' || sourceIdCounts.get(row.source_id)! <= 1) continue;
      while (reservedSourceIds.has(`merge-row:${row.id}`)) row.id = createId();
      row.source_id = `merge-row:${row.id}`;
      reservedSourceIds.add(row.source_id as string);
    }

    // The merge's QC summary (lib/merge-qc.ts), from the grouping these rows were written
    // from; a listed group is identified by its merged event's id.
    const qc = buildMergeQc(
      resolvedGroups.map((resolved, i) => describeResolvedGroup(resolved, eventRows[i].id, config)),
      sourceCatalogues,
      config
    );

    if (exportOnly) {
      return {
        success: true,
        catalogueId: null,
        eventCount: mergedEvents.length,
        originalEventCount: allEvents.length,
        heldForReviewCount,
        events: eventRows,
        qc,
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

    for (const event of eventRows) {
      event.catalogue_id = catalogueId;
      dbEvents.push(event as any);
    }

    // Bulk insert all events at once (Performance Optimization)
    // This is much faster than individual inserts and only triggers cache invalidation once.
    //
    // A fresh merged catalogue must retain EVERY output group. The generic ingestion
    // writer may skip duplicate keys; a short write here is data loss, so throw inside the
    // transaction and roll back instead of completing a catalogue unlike the preview.
    let insertedEventCount = 0;
    if (dbEvents.length > 0) {
      insertedEventCount = await dbQueries.bulkInsertEvents(dbEvents, session);
    }
    if (insertedEventCount !== dbEvents.length) {
      throw new Error('Could not save every merged event; the merge was rolled back');
    }

    // Kept with the catalogue, in the same transaction: a merge that rolls back leaves no
    // summary behind. Adapters without QC storage (test doubles) skip it.
    if (typeof dbQueries.insertMergeQcSummary === 'function') {
      await dbQueries.insertMergeQcSummary(catalogueId, qc, session);
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
      originalEventCount: allEvents.length,
      heldForReviewCount,
      qc,
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

/**
 * A pair's adaptive matching windows: the configured time window (s) and distance window
 * (km), widened for the pair's mean magnitude and greater depth. The windows pairSeparation
 * judges a pair by, and the ones the merge QC measures window use against.
 */
function pairMatchingWindows(
  event1: { magnitude?: number | null; depth?: number | null },
  event2: { magnitude?: number | null; depth?: number | null },
  configTimeThreshold: number,
  configDistanceThreshold: number
): { timeWindow: number; distanceWindow: number } {
  // Use average magnitude for threshold calculation. Only average over finite
  // magnitudes: at runtime `magnitude` can be null (coerces to 0) or undefined
  // (coerces to NaN), either of which would corrupt the adaptive widening — a null
  // paired with a real M7 would deflate the average to 3.5 and defeat the widening,
  // while an undefined would poison it to NaN. Falling back to the known magnitude
  // (or 0 when neither is known) keeps the threshold conservative and finite.
  const finiteMags = [event1.magnitude, event2.magnitude].filter(
    (m): m is number => typeof m === 'number' && Number.isFinite(m)
  );
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

  return {
    timeWindow: configTimeThreshold * timeMultiplier,
    distanceWindow: configDistanceThreshold * distanceMultiplier * depthMultiplier,
  };
}

function pairSeparation(
  event1: EventData,
  event2: EventData,
  configTimeThreshold: number,
  configDistanceThreshold: number
): PairSeparation {
  const { timeWindow: effectiveTimeThreshold, distanceWindow: effectiveDistanceThreshold } =
    pairMatchingWindows(event1, event2, configTimeThreshold, configDistanceThreshold);

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
  // validateEventGroup: a sub-group regroupFailedEvents salvaged, or a report the split
  // left on its own. Surfaced by the preview so the QC panel can flag them.
  regrouped: boolean;
  // Why the parent group failed validation (the gate's messages), when regrouped.
  splitReasons: string[];
  // When regrouped: a key shared by every group the same failed cluster was split into
  // (its salvaged sub-groups and the reports left on their own), so the QC can show the
  // split as one unit. A report in several failed clusters takes the last one, as for
  // splitReasons. "split-1", "split-2", ... in output order; null when not regrouped.
  splitKey: string | null;
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

  const clusters = Array.from(members.values())
    .filter(cluster => cluster.length > 1)
    .map(cluster => cluster.slice().sort((x, y) => x - y));
  // What the consistency gate (and the preview) need to know of how each entry was paired.
  for (const cluster of clusters) {
    for (const x of cluster) recordAssociation(sorted[x], config, contested[x] === 1);
  }
  return clusters;
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
  // The gate's messages for the last failed cluster each report was in. A report the split
  // leaves on its own is flagged with them: two reports the windows paired but the gate
  // refused (magnitudes irreconcilable, two different events of one agency) are exactly
  // what a reviewer should see, and published silently as unrelated events they were not.
  const splitReasons = new Map<number, string[]>();
  // The last failed cluster each report was in, numbered in the order they failed; the
  // groups that cluster was split into share a split key (MatchGroup.splitKey).
  const splitCluster = new Map<number, number>();
  let failedClusters = 0;
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
      const reasons: string[] = [];
      if (validateEventGroup(clusterEvents, true, reasons)) {
        found.push({ members: cluster, regrouped: false });
        cluster.forEach(i => { assigned[i] = 1; });
        continue;
      }
      anyFailed = true;
      const clusterNumber = failedClusters++;
      cluster.forEach(i => {
        splitReasons.set(i, reasons);
        splitCluster.set(i, clusterNumber);
      });
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
    if (!assigned[i]) found.push({ members: [i], regrouped: splitReasons.has(i) });
  }
  // Output in record order of each group's earliest report, as the sweep produced it.
  found.sort((g, h) => g.members[0] - h.members[0]);

  // Split keys are numbered in output order, so they do not depend on the order clusters
  // happened to fail in. A salvaged sub-group's members all come from one cluster; a
  // report left alone carries its last one.
  const splitKeys = new Map<number, string>();
  const splitKeyOf = (members: number[]): string | null => {
    const clusterNumber = splitCluster.get(members[0]);
    if (clusterNumber === undefined) return null;
    let key = splitKeys.get(clusterNumber);
    if (key === undefined) {
      key = `split-${splitKeys.size + 1}`;
      splitKeys.set(clusterNumber, key);
    }
    return key;
  };

  return found.map(({ members, regrouped }) => ({
    events: members.map(i => sorted[i]),
    regrouped,
    splitReasons: regrouped
      ? Array.from(new Set(members.flatMap(i => splitReasons.get(i) ?? [])))
      : [],
    splitKey: regrouped ? splitKeyOf(members) : null,
    ambiguous: members.length > 1 && members.some(i => contested[i] === 1),
  }));
}

/**
 * One association group as the merge resolves it: the row it publishes, the verdict the
 * preview shows for it (assessMatchGroup) and whose solution was published. The persist
 * path and the preview (performMergeWithGroups) resolve groups with the same function, so
 * the preview, the saved rows and the merge's QC summary all describe the same merge.
 */
interface ResolvedMatchGroup {
  group: MatchGroup;
  /** The published row; under onConflict 'hold' a flagged group's row is pending review. */
  merged: MergedEventData;
  isSuspicious: boolean;
  separated: boolean;
  validationWarnings: string[];
  heldForReview: boolean;
  /** The report whose solution was published (`selected` in the provenance); -1 when averaged. */
  selectedEventIndex: number;
  /** Superseded same-agency vintages (M5), by position in the group. */
  supersededEventIndexes: number[];
  /** The epicentre and origin time the merge computes when no single report is selected. */
  computedEpicentre: { latitude: number; longitude: number; time: string } | null;
}

/**
 * Core merge algorithm - matches events across catalogues and merges each group.
 * Delegates grouping to groupMatchingEvents (shared with the preview path). Returns each
 * group with the row it publishes (`merged`), in output order.
 */
function performMerge(
  events: EventData[],
  config: MergeConfig
): ResolvedMatchGroup[] {
  const resolved = groupMatchingEvents(events, config).map(g => resolveMatchGroup(g, config));
  console.log(`[Merge] Processed ${events.length} events into ${resolved.length} merged events`);
  return resolved;
}

/**
 * Merge one association group as the persist path publishes it. With onConflict 'hold' a
 * flagged group (assessMatchGroup: the same predicate the preview shows) is still merged by
 * the strategy - the row needs coordinates - but is marked pending review with the
 * preview's warnings, so what the reviewer sees is exactly what the preview counted.
 */
function resolveMatchGroup(group: MatchGroup, config: MergeConfig): ResolvedMatchGroup {
  const merged = mergeEventGroup(group.events, config);
  // The assessment does not log (the association already logged its verdict) and does not
  // change the row unless the group is held.
  const assessment = assessMatchGroup(group, config);
  const heldForReview = config.onConflict === 'hold' && (assessment.suspicious || assessment.separated);
  if (heldForReview) {
    merged.review_status = 'pending';
    // Within the stored column's bounds (at most 50 reasons of 500 characters, lib/db.ts):
    // one over-long gate message must not make the insert refuse the whole merge.
    merged.review_reasons = assessment.warnings
      .slice(0, 50)
      .map(reason => (reason.length > 500 ? `${reason.slice(0, 499)}…` : reason));
  }

  // The report whose solution the merge publishes is the one it marks `selected` in the
  // provenance (C2); source events are in group order. An averaged epicentre publishes
  // no single report's solution, so no member is selected (-1).
  const selectedEventIndex = merged.sourceEvents.findIndex(entry => entry.selected === true);
  const supersededEventIndexes = merged.sourceEvents
    .map((entry, index) => (entry.superseded ? index : -1))
    .filter(index => index >= 0);

  return {
    group,
    merged,
    isSuspicious: assessment.suspicious,
    separated: assessment.separated,
    validationWarnings: assessment.warnings,
    heldForReview,
    selectedEventIndex,
    supersededEventIndexes,
    computedEpicentre: selectedEventIndex < 0 && group.events.length > 1
      ? { latitude: merged.latitude, longitude: merged.longitude, time: String(merged.time) }
      : null,
  };
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

// ----------------------------------------------------------------------------
// Uncertainty-aware tolerances of the consistency gate
// ----------------------------------------------------------------------------

/**
 * Coverage factor k of the gate's uncertainty-aware tolerances: two solutions of one
 * earthquake are consistent when they differ by at most k combined standard deviations
 * (k = 3 leaves about 0.3% of genuine pairs outside, for Gaussian errors).
 */
const GATE_COVERAGE_FACTOR = 3;

/**
 * Scatter (1 sigma, magnitude units) of the difference between two agencies' magnitudes of
 * one earthquake that their reported uncertainties do not describe: different station sets,
 * attenuation corrections and magnitude definitions. Inter-agency ML differences scatter by
 * 0.2-0.3 (1 sigma) all told; the low end is taken, so the term never credits more scatter
 * than is observed.
 */
const INTER_AGENCY_MAGNITUDE_SIGMA = 0.2;

/**
 * The uncertainty-aware magnitude tolerance never exceeds this multiple of the tier (1.0
 * unit below M4), however large the reported uncertainties: many bulletins report the
 * scatter of the station magnitudes rather than the error of their mean.
 */
const MAGNITUDE_TOLERANCE_CAP = 2;

/**
 * Two solutions agree closely in origin time and epicentre when their normalised
 * separation |Δt|/τ + Δ/δ (pairSeparation) is at most a tenth of the matching window - the
 * margin the ambiguity test also treats as indistinguishable - and, wherever both state
 * them, within GATE_COVERAGE_FACTOR combined standard errors of origin time and epicentre.
 */
const CLOSE_AGREEMENT_SEPARATION = 0.1;

/**
 * How the association paired an entry, recorded for the consistency gate: the baseline
 * matching windows, and whether the entry's pairing was contested (a refused alternative
 * nearly as close as the one kept; AMBIGUITY_FACTOR). The gate widens its magnitude
 * tolerance only on this evidence, and the preview (assessMatchGroup) reads the same record,
 * so both judge a group alike. Keyed by the association's own copies of the entries, so a
 * record never outlives the merge that made it.
 */
interface AssociationEvidence {
  timeThreshold: number;
  distanceThreshold: number;
  contested: boolean;
}

const associationRecords = new WeakMap<EventData, AssociationEvidence>();

function recordAssociation(entry: EventData, config: MergeConfig, contested: boolean): void {
  associationRecords.set(entry, {
    timeThreshold: config.timeThreshold,
    distanceThreshold: config.distanceThreshold,
    contested,
  });
}

/**
 * The association evidence for a group: contested when any member's pairing was. Null when
 * a member has no record (a group assembled outside the association) or the records were
 * made under different windows; the gate then applies its fixed tiers alone.
 */
function associationEvidenceOf(events: EventData[]): AssociationEvidence | null {
  let evidence: AssociationEvidence | null = null;
  for (const e of events) {
    const record = associationRecords.get(e);
    if (!record) return null;
    if (!evidence) {
      evidence = { ...record };
    } else if (
      record.timeThreshold !== evidence.timeThreshold ||
      record.distanceThreshold !== evidence.distanceThreshold
    ) {
      return null;
    } else if (record.contested) {
      evidence.contested = true;
    }
  }
  return evidence;
}

/** A positive, finite number, else null: a zero or negative uncertainty is no measurement. */
function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** An entry's reported magnitude uncertainty (1 sigma), or null when it states none. */
function magnitudeUncertaintyOf(e: EventData): number | null {
  return positiveOrNull(reportMagnitude(e, 0).uncertainty);
}

/** An entry's reported origin-time uncertainty in seconds, or null when it states none. */
function originTimeUncertaintyOf(e: EventData): number | null {
  return positiveOrNull(preferredQuakemlOrigin(e)?.time?.uncertainty) ?? positiveOrNull(e.time_uncertainty);
}

/** Root-sum-square of two standard errors, or null unless both are stated. */
function combinedSigma(a: number | null, b: number | null): number | null {
  return a != null && b != null ? Math.sqrt(a * a + b * b) : null;
}

/**
 * Whether every pair of solutions in a group agrees closely in origin time and epicentre
 * (CLOSE_AGREEMENT_SEPARATION): inside a tenth of the pair's matching window, and within
 * GATE_COVERAGE_FACTOR combined standard errors of origin time and of epicentre wherever
 * both solutions state them.
 */
function agreesClosely(events: EventData[], evidence: AssociationEvidence): boolean {
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      const pair = pairSeparation(a, b, evidence.timeThreshold, evidence.distanceThreshold);
      if (!(pair.cost <= CLOSE_AGREEMENT_SEPARATION)) return false;
      const sigmaT = combinedSigma(originTimeUncertaintyOf(a), originTimeUncertaintyOf(b));
      if (sigmaT != null && pair.timeDiff > GATE_COVERAGE_FACTOR * sigmaT) return false;
      const sigmaH = combinedSigma(locationUncertaintyKm(a), locationUncertaintyKm(b));
      if (sigmaH != null && pair.distance > GATE_COVERAGE_FACTOR * sigmaH) return false;
    }
  }
  return true;
}

/**
 * Magnitude tolerance for two solutions with reported uncertainties sigma1 and sigma2
 * (0 when not stated). Without widening it is the tier. Widened, it is k standard deviations
 * of the difference of the two magnitudes, k * sqrt(sigma1^2 + sigma2^2 + sigma_ag^2), never
 * below the tier and never above MAGNITUDE_TOLERANCE_CAP times it.
 */
function magnitudeTolerance(tier: number, sigma1: number, sigma2: number, widen: boolean): number {
  if (!widen) return tier;
  const scatter =
    GATE_COVERAGE_FACTOR *
    Math.sqrt(sigma1 * sigma1 + sigma2 * sigma2 + INTER_AGENCY_MAGNITUDE_SIGMA * INTER_AGENCY_MAGNITUDE_SIGMA);
  return Math.min(MAGNITUDE_TOLERANCE_CAP * tier, Math.max(tier, scatter));
}

/** One magnitude in the gate: its value, its reported uncertainty and its conversion uncertainty. */
interface GateMagnitude {
  value: number;
  /** Reported measurement uncertainty (1 sigma), 0 when the entry states none. */
  sigma: number;
  /** Uncertainty of the conversion to the common scale (0 on the entry's own scale). */
  conversion: number;
}

/**
 * The lowest and highest of a set of magnitudes. Ties go to the member with the larger
 * conversion uncertainty, then the larger reported uncertainty, so the extremes - and the
 * thresholds they set - never depend on the order members arrive in.
 */
function magnitudeExtremes(points: GateMagnitude[]): { lo: GateMagnitude; hi: GateMagnitude } {
  const wider = (p: GateMagnitude, q: GateMagnitude) =>
    p.conversion > q.conversion || (p.conversion === q.conversion && p.sigma > q.sigma);
  let lo = points[0];
  let hi = points[0];
  for (const point of points) {
    if (point.value < lo.value || (point.value === lo.value && wider(point, lo))) lo = point;
    if (point.value > hi.value || (point.value === hi.value && wider(point, hi))) hi = point;
  }
  return { lo, hi };
}

/**
 * Verdict of the magnitude-consistency gate, plus every statistic the QC preview needs to
 * explain it. Shared by validateEventGroup (which enforces it) and assessMatchGroup (which
 * reports it), so the panel can never describe a group differently from the gate.
 */
type MagnitudeGateFailure = 'raw-range' | 'within-scale-range' | 'mw-range';

interface MagnitudeConsistency {
  /** Count of usable magnitudes (present AND finite). */
  count: number;
  /** Mean of the usable RAW magnitudes; NaN when there are none. */
  rawMean: number;
  /** Max - min of the usable RAW magnitudes; NaN when there are none. */
  rawRange: number;
  /** Tier selected by the RAW mean (never by a converted mean). */
  tier: number;
  /**
   * True when the tolerances were widened by the reported magnitude uncertainties: the
   * association recorded the group, no member's pairing was contested, and every pair of
   * solutions agrees closely in origin time and epicentre (agreesClosely).
   */
  widened: boolean;
  /** Threshold of the raw-range check: the tier, or the tolerance of the extreme members. */
  threshold: number;
  /**
   * The single scale whose raw spread exceeds its threshold by the most (or comes closest
   * to it), if any scale has 2+ members, with that threshold.
   */
  worstScale: { category: MagnitudeType; range: number; threshold: number } | null;
  /**
   * Spread of the CONVERTIBLE members on the common (Mw) scale; null unless 2+ scales.
   * `threshold` is the tolerance of the two extreme members widened in quadrature by their
   * conversion uncertainties, and is the value the Mw comparison is actually judged against.
   */
  mw: { range: number; mean: number; count: number; threshold: number } | null;
  /** True when every usable magnitude carries a type convertToMw understands. */
  fullyConvertible: boolean;
  /** Gate verdict for the magnitude check alone. */
  ok: boolean;
  /** Accepted, but only because the members agree once put on the common scale. */
  rescuedByMw: boolean;
  /** Accepted, but only because the tolerance was widened: the tier alone rejects the group. */
  rescuedByUncertainty: boolean;
  /** Which check rejected the group, or null when it passed. */
  failure: MagnitudeGateFailure | null;
  /** The quantity the failed check measured and the threshold it exceeded (null when it passed). */
  failedValue: number | null;
  failedThreshold: number | null;
  /** Human-readable statement of the failure (or of the rescue), for the QC log/panel. */
  reason: string | null;
}

/**
 * Decide whether a candidate group's magnitudes can describe ONE earthquake.
 *
 * Three checks, all against tolerances built on the tier the RAW mean selects, so converting
 * cannot buy a looser tier: (1) raw spread within each scale, since same-scale values are
 * already like-for-like; (2) raw spread overall, waived only when the group mixes scales and
 * all convert; (3) spread on the common scale, widened in quadrature by the conversion
 * uncertainties convertToMw reports (Scordilis 2006: Mw = 0.67*Ms + 2.07, Mw = 0.85*mb + 1.03).
 *
 * Each tolerance is the tier unless the association's evidence shows the solutions agree
 * closely in origin time and epicentre and the pairing was not contested; then it is
 * magnitudeTolerance: k standard deviations of the magnitude difference implied by the two
 * extreme members' reported uncertainties and the inter-agency scatter, between the tier and
 * twice the tier. In a contested (dense-sequence) pairing magnitude is the main thing that
 * tells neighbouring events apart, so there the tier stands. The widening applies only to
 * comparisons on one scale (within a scale, or on the common Mw scale): a raw comparison
 * across scales that cannot be homogenised hides an unknown scale offset and keeps the tier.
 */
function assessMagnitudeConsistency(
  events: EventData[],
  association: AssociationEvidence | null = null
): MagnitudeConsistency {
  const raw: GateMagnitude[] = [];
  const measured: EventData[] = [];
  const byCategory = new Map<MagnitudeType, GateMagnitude[]>();
  const mwPoints: GateMagnitude[] = [];
  let unconvertible = 0;

  for (const e of events) {
    const value = e.magnitude;
    if (value == null || !Number.isFinite(value)) continue; // absent or NaN/Inf: no information
    const sigma = magnitudeUncertaintyOf(e) ?? 0;
    raw.push({ value, sigma, conversion: 0 });
    measured.push(e);

    const category = getMagnitudeTypeCategory(e.magnitude_type);
    const converted = category ? convertToMw(value, e.magnitude_type) : null;
    if (!category || !converted) {
      unconvertible++;
      continue;
    }
    const bucket = byCategory.get(category);
    const point = { value, sigma, conversion: 0 };
    if (bucket) bucket.push(point);
    else byCategory.set(category, [point]);
    mwPoints.push({ value: converted.value, sigma, conversion: converted.uncertainty ?? 0 });
  }

  if (raw.length === 0) {
    return {
      count: 0, rawMean: NaN, rawRange: NaN, tier: NaN, widened: false, threshold: NaN, worstScale: null,
      mw: null, fullyConvertible: false, ok: true, rescuedByMw: false, rescuedByUncertainty: false,
      failure: null, failedValue: null, failedThreshold: null, reason: null,
    };
  }

  const rawMean = raw.reduce((sum, p) => sum + p.value, 0) / raw.length;
  const tier = magnitudeRangeThreshold(rawMean);
  const rawExtremes = magnitudeExtremes(raw);
  const rawRange = rawExtremes.hi.value - rawExtremes.lo.value;
  const fullyConvertible = unconvertible === 0;
  // Scales in a fixed order, so the scale a message names never depends on input order.
  const categories = Array.from(byCategory.keys()).sort();
  // At least two DISTINCT scales are needed before a common-scale comparison says anything
  // a single-scale raw comparison did not already say.
  const mixed = byCategory.size >= 2 && mwPoints.length >= 2;
  const mwExtremes = mixed ? magnitudeExtremes(mwPoints) : null;
  // The raw comparison is waived for a mixed group whose every scale converts (the common
  // scale decides instead).
  const rawWaived = mixed && fullyConvertible;
  // The uncertainty model describes two measurements of the SAME quantity, so it widens only
  // comparisons on one scale (within a scale, or on the common Mw scale). Raw values on
  // scales that cannot be homogenised differ by an unknown scale offset: the tier stands.
  const rawOnOneScale = fullyConvertible && byCategory.size === 1;

  // The three checks at the tier (widen = false) or at the uncertainty-aware tolerance.
  const judge = (widen: boolean) => {
    const threshold = magnitudeTolerance(tier, rawExtremes.lo.sigma, rawExtremes.hi.sigma, widen && rawOnOneScale);
    const scales: Array<{ category: MagnitudeType; range: number; threshold: number }> = [];
    let worstScale: (typeof scales)[number] | null = null;
    for (const category of categories) {
      const values = byCategory.get(category)!;
      if (values.length < 2) continue;
      const { lo, hi } = magnitudeExtremes(values);
      const scale = { category, range: hi.value - lo.value, threshold: magnitudeTolerance(tier, lo.sigma, hi.sigma, widen) };
      scales.push(scale);
      if (!worstScale || scale.range - scale.threshold > worstScale.range - worstScale.threshold) worstScale = scale;
    }
    let mw: { range: number; mean: number; count: number; threshold: number } | null = null;
    if (mwExtremes) {
      const { lo, hi } = mwExtremes;
      const tolerance = magnitudeTolerance(tier, lo.sigma, hi.sigma, widen);
      const conversionVariance = lo.conversion * lo.conversion + hi.conversion * hi.conversion;
      mw = {
        range: hi.value - lo.value,
        mean: mwPoints.reduce((sum, p) => sum + p.value, 0) / mwPoints.length,
        count: mwPoints.length,
        threshold: Math.sqrt(tolerance * tolerance + conversionVariance),
      };
    }
    const rawOk = rawRange <= threshold;
    let failure: MagnitudeGateFailure | null = null;
    if (!rawWaived && !rawOk) failure = 'raw-range';
    else if (worstScale && worstScale.range > worstScale.threshold) failure = 'within-scale-range';
    else if (mw && mw.range > mw.threshold) failure = 'mw-range';
    return { threshold, scales, worstScale, mw, rawOk, failure };
  };

  const atTier = judge(false);
  const widened =
    association != null && !association.contested && raw.length >= 2 && agreesClosely(measured, association);
  const verdict = widened ? judge(true) : atTier;
  const { threshold, worstScale, mw, failure } = verdict;

  // A threshold as the messages state it: the tier, or the tolerance it was widened to.
  const limit = (value: number) =>
    value > tier ? `${value.toFixed(2)}, tier ${tier} widened by the reported magnitude uncertainties` : `${tier}`;

  let reason: string | null = null;
  let failedValue: number | null = null;
  let failedThreshold: number | null = null;
  if (failure === 'raw-range') {
    failedValue = rawRange;
    failedThreshold = threshold;
    reason = `Large magnitude range: ${rawRange.toFixed(2)} units (threshold: ${limit(threshold)})`;
  } else if (failure === 'within-scale-range') {
    failedValue = worstScale!.range;
    failedThreshold = worstScale!.threshold;
    reason =
      `Large magnitude range within a single scale (${worstScale!.category}): ` +
      `${worstScale!.range.toFixed(2)} units (threshold: ${limit(worstScale!.threshold)})`;
  } else if (failure === 'mw-range') {
    failedValue = mw!.range;
    failedThreshold = mw!.threshold;
    reason =
      `Magnitudes disagree once converted to a common scale: ` +
      `${mw!.range.toFixed(2)} units of Mw (threshold: ${mw!.threshold.toFixed(2)}, ` +
      `tier ${tier} widened by ${widened ? 'the magnitude and ' : ''}conversion uncertainty)`;
  }

  const ok = failure == null;
  // Accepted although the raw values span more than the tier, because the scales convert
  // and agree on the common one: explained against the tier, the threshold the raw values
  // appear to break (the raw check being waived, its widened value is never applied).
  const rescuedByMw = ok && rawWaived && !atTier.rawOk;
  // Accepted only because the solutions agree closely and their magnitudes are uncertain
  // enough: at the tier alone the same group fails.
  const rescuedByUncertainty = ok && atTier.failure != null;
  if (rescuedByUncertainty) {
    // The check the tier failed: its quantity, its threshold at the tier, its tolerance.
    const [value, atTierLimit, tolerance] =
      atTier.failure === 'raw-range'
        ? [rawRange, atTier.threshold, threshold]
        : atTier.failure === 'within-scale-range'
          ? [
              atTier.worstScale!.range,
              atTier.worstScale!.threshold,
              verdict.scales.find(s => s.category === atTier.worstScale!.category)!.threshold,
            ]
          : [atTier.mw!.range, atTier.mw!.threshold, mw!.threshold];
    const atTierText = atTierLimit === tier ? `${tier}` : atTierLimit.toFixed(2);
    reason =
      `Magnitude range of ${value.toFixed(2)} units exceeds the tier threshold (${atTierText}); accepted — ` +
      `within ${tolerance.toFixed(2)}, the tolerance the entries' reported magnitude uncertainties allow ` +
      `for solutions this close in origin time and epicentre`;
  } else if (rescuedByMw) {
    reason =
      `Large raw magnitude range: ${rawRange.toFixed(2)} units (threshold: ${tier}); ` +
      `accepted — Mw-equivalent range is ${mw!.range.toFixed(2)} units across mixed magnitude scales`;
  }

  return {
    count: raw.length, rawMean, rawRange, tier, widened, threshold, worstScale, mw,
    fullyConvertible, ok, rescuedByMw, rescuedByUncertainty, failure, failedValue, failedThreshold, reason,
  };
}

/**
 * Maximum depth range of a group, in km, by the mean depth of its compared solutions and its
 * mean magnitude: shallow (< 70 km) depths are the best constrained, intermediate (70-300 km)
 * and deep ones less so, and larger events are allowed more. A NaN mean magnitude (no usable
 * magnitude) takes the wider branch.
 */
function depthRangeTier(avgDepth: number, avgMag: number): number {
  if (avgDepth < 70) return avgMag < 5 ? 30 : 50;
  if (avgDepth < 300) return avgMag < 5 ? 50 : 100;
  return avgMag < 5 ? 100 : 150;
}

/** Verdict of the depth-consistency gate, shared by the gate and the preview like the magnitude one. */
interface DepthConsistency {
  /** The depths compared: solved-for depths only. */
  depths: number[];
  /** Entries whose depth was fixed (operator assigned), and so not compared. */
  fixed: number;
  /** Mean and range of the compared depths; NaN with fewer than two. */
  avgDepth: number;
  range: number;
  /** Tier of the compared depths, and the threshold after widening by their uncertainties. */
  tier: number;
  threshold: number;
  ok: boolean;
  /** The rejection, or a note on why a range past the tier was accepted; null otherwise. */
  reason: string | null;
}

/**
 * Decide whether a group's depths can describe ONE earthquake.
 *
 * A fixed (operator-assigned) depth carries no depth information (isFixedDepth), so it is not
 * compared: an agency that fixes an unresolved depth at 10 km does not contradict another's
 * solved 35 km. The solved-for depths must then agree within
 *   max(tier, k * sqrt(sigma1^2 + sigma2^2)),
 * sigma the reported depth uncertainties of the shallowest and deepest solution (0 when not
 * stated), k = GATE_COVERAGE_FACTOR: two poorly constrained depths are allowed to differ by
 * what their own errors allow, and the tier remains the floor.
 */
function assessDepthConsistency(events: EventData[], avgMag: number): DepthConsistency {
  const points: Array<{ depth: number; sigma: number }> = [];
  let fixed = 0;
  let allLo = Infinity;
  let allHi = -Infinity;
  let allSum = 0;
  let allCount = 0;
  for (const e of events) {
    const depth = e.depth;
    if (depth == null || !Number.isFinite(depth)) continue;
    allLo = Math.min(allLo, depth);
    allHi = Math.max(allHi, depth);
    allSum += depth;
    allCount++;
    if (isFixedDepth(e, preferredQuakemlOrigin(e))) {
      fixed++;
      continue;
    }
    points.push({ depth, sigma: depthMetadataOf(e).depth_uncertainty ?? 0 });
  }

  // Would the tier alone, over every depth, have rejected the group? Then leaving the fixed
  // depths out is what accepted it, and the reviewer is told so.
  const fixedNote = (): string | null =>
    fixed > 0 && allCount >= 2 && allHi - allLo > depthRangeTier(allSum / allCount, avgMag)
      ? `Depth range of ${(allHi - allLo).toFixed(1)} km includes ${fixed === 1 ? 'a fixed depth' : `${fixed} fixed depths`} ` +
        `(operator assigned), which carry no depth information and are not compared`
      : null;

  if (points.length < 2) {
    return {
      depths: points.map(p => p.depth), fixed, avgDepth: NaN, range: NaN, tier: NaN, threshold: NaN,
      ok: true, reason: fixedNote(),
    };
  }

  // Ties go to the larger uncertainty, so the threshold never depends on input order.
  let lo = points[0];
  let hi = points[0];
  for (const point of points) {
    if (point.depth < lo.depth || (point.depth === lo.depth && point.sigma > lo.sigma)) lo = point;
    if (point.depth > hi.depth || (point.depth === hi.depth && point.sigma > hi.sigma)) hi = point;
  }
  const range = hi.depth - lo.depth;
  const avgDepth = points.reduce((sum, p) => sum + p.depth, 0) / points.length;
  const tier = depthRangeTier(avgDepth, avgMag);
  const threshold = Math.max(tier, GATE_COVERAGE_FACTOR * Math.sqrt(lo.sigma * lo.sigma + hi.sigma * hi.sigma));
  const ok = range <= threshold;

  let reason: string | null;
  if (!ok) {
    reason = threshold > tier
      ? `Large depth range: ${range.toFixed(1)} km (threshold: ${threshold.toFixed(1)} km, tier ${tier} km widened by the reported depth uncertainties)`
      : `Large depth range: ${range.toFixed(1)} km (threshold: ${tier} km)`;
  } else if (range > tier) {
    reason =
      `Depth range of ${range.toFixed(1)} km exceeds the tier (${tier} km); accepted — within ` +
      `${threshold.toFixed(1)} km, the tolerance the entries' reported depth uncertainties allow`;
  } else {
    reason = fixedNote();
  }

  return { depths: points.map(p => p.depth), fixed, avgDepth, range, tier, threshold, ok, reason };
}

/**
 * Validate that a group of events makes physical sense to merge
 */
function validateEventGroup(
  events: EventData[],
  logConflicts: boolean = true,
  reasons?: string[],
  // How the association paired these entries (associationEvidenceOf): what lets the
  // magnitude tolerance widen. A group assembled outside the association has none.
  association: AssociationEvidence | null = associationEvidenceOf(events)
): boolean {
  if (events.length < 2) return true;

  // Trial validations (the greedy split in splitInconsistentGroup) pass logConflicts=false:
  // a rejected trial sub-group is not a real over-match and must not appear in the QC
  // conflict report, which would otherwise fill with O(n^2) phantom conflicts per group.
  const record: MergeConflictLog['log'] = logConflicts
    ? mergeConflictLog.log.bind(mergeConflictLog)
    : () => {};
  // `reasons` collects the rejection messages (not the informational notes) so the
  // association can tell the reviewer why a matched group was split.
  const logConflict: MergeConflictLog['log'] = (type, severity, message, details) => {
    if (reasons && severity !== 'info') reasons.push(message);
    record(type, severity, message, details);
  };

  // Same-agency rule (M5; publication/merge_strategies.tex §The same-agency rule): an
  // agency deduplicates its own catalogue, so two of its reports that carry DIFFERENT
  // agency event ids are two earthquakes whatever their separation. Checked first: it is
  // the one verdict no magnitude or depth agreement can overturn.
  const sameAgency = findSameAgencyConflict(events);
  if (sameAgency) {
    const { eventIds, sources, avgLat, avgLon, avgTime } = conflictContext(events);
    logConflict(
      'same_agency',
      'warning',
      `Two different ${sameAgency.label} events in one group: ${sameAgency.ids.join(' vs ')} - split`,
      {
        eventIds,
        sources,
        values: { agency: sameAgency.agency, agencyEventIds: sameAgency.ids },
        location: { lat: avgLat, lon: avgLon },
        time: avgTime,
      }
    );
    return false;
  }

  // Vintages of one agency solution are ONE report of the earthquake, and the merge
  // publishes only the newest of them (supersedeSameAgency), so the consistency checks
  // judge the reports that take part: a preliminary ML 3.1 and the reviewed ML 3.8 of the
  // same agency event are a revision, not two earthquakes, and splitting them published the
  // event twice.
  const { active } = supersedeSameAgency(events);
  if (active.length < 2) return true;
  return validateGroupConsistency(active, logConflict, association);
}

/** The group summary every conflict record carries. */
function conflictContext(events: EventData[]) {
  return {
    eventIds: events.map(e => e.id || 'unknown'),
    sources: events.map(e => e.source),
    avgLat: events.reduce((sum, e) => sum + e.latitude, 0) / events.length,
    avgLon: averageLongitudes(events.map(e => e.longitude)),
    avgTime: events[0]?.time,
  };
}

/**
 * The physical consistency checks of validateEventGroup (magnitude, depth, group size,
 * spatial spread, a repeated source, time spread), over the reports that take part in the
 * merge.
 */
function validateGroupConsistency(
  events: EventData[],
  logConflict: MergeConflictLog['log'],
  association: AssociationEvidence | null
): boolean {
  const { eventIds, sources, avgLat, avgLon, avgTime } = conflictContext(events);

  // Magnitude consistency. assessMagnitudeConsistency drops absent AND non-finite
  // magnitudes, so a stray NaN can no longer make every comparison false and silently
  // disable the whole magnitude gate for the group.
  const magnitude = assessMagnitudeConsistency(events, association);

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
      magnitude.reason!,
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
        // Report the quantity that actually failed and the threshold it exceeded, so the QC
        // panel is not left comparing a passing raw range against a different check's limit.
        threshold: magnitude.failedThreshold!,
        actualValue: magnitude.failedValue!,
        location: { lat: avgLat, lon: avgLon },
        time: avgTime,
      }
    );
    return false;
  }

  // Depth consistency (assessDepthConsistency): fixed depths are not compared, and two
  // solved-for depths may differ by what their reported uncertainties allow.
  const depth = assessDepthConsistency(events, avgMag);
  if (!depth.ok) {
    logConflict(
      'depth_range',
      'warning',
      depth.reason!,
      {
        eventIds,
        sources,
        values: { depths: depth.depths, avgDepth: depth.avgDepth, ...(depth.fixed > 0 ? { fixedDepths: depth.fixed } : {}) },
        threshold: depth.threshold,
        actualValue: depth.range,
        location: { lat: avgLat, lon: avgLon },
        time: avgTime,
      }
    );
    return false;
  }

  // Check for suspiciously large groups (likely matching error)
  // Same event should not be reported by more than ~10 different networks
  if (events.length > 15) {
    logConflict(
      'group_size',
      'error',
      `Group of ${events.length} entries exceeds the limit of 15: the matching windows probably joined several events`,
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
        `Large spatial spread: ${spreadKm.toFixed(1)} km (threshold: ${maxSpread} km)`,
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
// SAME-AGENCY RULE (M5)
// ============================================================================

/** '?eventid=12345', '&evid=…' or the ISC's 'smi:ISC/evid=…': the id is the parameter's value. */
const EVENT_ID_PARAMETER = /(?:^|[/?&;])(?:evid|eventid|event_id)=([^&;#/]+)/i;
/** Resource identifiers and URLs whose last path segment is the event's own id. */
const EVENT_ID_RESOURCE = /^(?:smi|quakeml|https?):/i;
/** A '<source>:' qualification a previous merge put in front of a source_id. */
const MERGE_QUALIFICATION = /^[^:/]+:(?=.)/;

/**
 * An agency event id reduced to the bare id the agency assigned, so that the spellings one
 * earthquake arrives under compare equal: the GeoNet importer stores
 * 'smi:nz.org.geonet/2024p100000' where a GeoNet quakesearch CSV upload stores
 * '2024p100000'; ComCat writes 'quakeml:us.anss.org/event/us7000abcd', the ISC
 * 'smi:ISC/evid=626000001', an FDSN service '…/query?eventid=12345'; and a previous merge
 * qualifies a source_id as '<source>:<id>'. Case is kept for messages; ids are compared
 * case-insensitively. null for an empty id.
 */
function normalizeAgencyEventId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let id = raw.trim();
  const parameter = EVENT_ID_PARAMETER.exec(id);
  if (parameter) {
    id = parameter[1];
  } else {
    // Bounded: a row re-merged several times carries one qualification per merge.
    for (let depth = 0; depth < 8; depth++) {
      const scheme = EVENT_ID_RESOURCE.exec(id);
      if (scheme) {
        const path = id.slice(scheme[0].length).split(/[?#]/)[0];
        const segments = path.split('/').filter(Boolean);
        if (segments.length > 0) id = segments[segments.length - 1];
        break;
      }
      const qualification = MERGE_QUALIFICATION.exec(id);
      if (!qualification) break;
      id = id.slice(qualification[0].length);
    }
  }
  id = id.trim();
  return id ? id : null;
}

/**
 * The id an agency gave a report, normalised (normalizeAgencyEventId): its QuakeML event
 * publicID, else its source_id. The kind is kept because only two ids of the same kind can
 * show two DIFFERENT events: a publicID and a source_id may come from different id spaces
 * (a compiler's evid against the agency's own id), so unequal ids of different kinds decide
 * nothing, while equal ones of any kind are the same event.
 */
function agencyEventId(e: EventData): { kind: 'public' | 'source'; id: string } | null {
  const publicId = agencyIdOrNull(normalizeAgencyEventId(e.event_public_id));
  if (publicId) return { kind: 'public', id: publicId };
  const sourceId = agencyIdOrNull(normalizeAgencyEventId(e.source_id));
  return sourceId ? { kind: 'source', id: sourceId } : null;
}

/** A platform row id (a UUID, lib/id.ts). */
const ROW_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * null for an id this platform made up rather than one an agency assigned: the QuakeML
 * exporter names a row that has no agency id after its row id (smi:local/event/<uuid>), and a
 * re-import of that file carries it as the publicID. It says nothing about which earthquake
 * the report is, so it can neither split a group nor mark a vintage.
 */
function agencyIdOrNull(id: string | null): string | null {
  return id && !ROW_ID_PATTERN.test(id) ? id : null;
}

/**
 * Whether two unequal agency ids can show two DIFFERENT events: only ids of one kind and one
 * network namespace. ComCat gives one earthquake several network ids ('us7000abcd',
 * 'nc73912345'), and two downloads may store different ones, so ids whose leading network
 * letters differ decide nothing. GeoNet ('2024p100000') and ISC ('626000001') ids start
 * with digits and share the empty namespace.
 */
function distinctAgencyEvents(
  a: { kind: 'public' | 'source'; id: string },
  b: { kind: 'public' | 'source'; id: string }
): boolean {
  if (a.kind !== b.kind || a.id.toLowerCase() === b.id.toLowerCase()) return false;
  const namespace = (id: string) => /^[a-z]*/i.exec(id)![0].toLowerCase();
  return namespace(a.id) === namespace(b.id);
}

/** How the reviewer-facing messages name an agency (not a catalogue's label, which may say "GeoNet preliminary"). */
const AGENCY_DISPLAY_NAMES: Readonly<Record<AgencyKey, string>> = {
  geonet: 'GeoNet', gcmt: 'Global CMT', isc: 'ISC', usgs: 'USGS', emsc: 'EMSC', jma: 'JMA',
  geofon: 'GEOFON', iris: 'IRIS', ingv: 'INGV', ign: 'IGN', bgr: 'BGR',
};

/** Whether a report is itself a merged row (a re-merged merged catalogue): its own provenance lists several reports. */
function isMergedReport(e: EventData): boolean {
  if (typeof e.merge_strategy === 'string' && e.merge_strategy.trim()) return true;
  if (Array.isArray(e.sourceEvents) && e.sourceEvents.length > 1) return true;
  const stored = parseJsonColumn(e.source_events);
  return Array.isArray(stored) && stored.length > 1;
}

/**
 * The agency whose OWN catalogue a report comes from, for the same-agency rule only, or null
 * when that is not clear - and then the rule leaves the report alone. The rule rests on an
 * agency deduplicating its own catalogue, which holds only for the agency's own reports in
 * the agency's own id space, so:
 *  - a merged row is nobody's report (its identity is one member's, its solution may be
 *    computed, and its catalogue's name may name one agency: "GeoNet merged 2024");
 *  - the catalogue's agency decides, and only when the row's own agency code (agency_id, or
 *    its preferred QuakeML origin's agencyID) is absent or names the same agency: a
 *    compiler's copy of an agency's solution (an ISC bulletin row whose prime hypocentre is
 *    WEL's) carries the agency's code but the compiler's ids and creation times.
 * resolveAgency, which ranks authority and applies agency preferences, still credits such a
 * row to its author.
 */
function sameAgencyKey(e: EventData): AgencyKey | null {
  if (isMergedReport(e)) return null;
  // mergeCatalogues / previewMerge attach the catalogue's agency (catalogueAgencyOf, which
  // also reads the catalogue's source label); a report built elsewhere has only its label.
  const catalogueAgency = (e._catalogueAgency as AgencyKey | null | undefined) ?? agencyFromName(e.source);
  if (!catalogueAgency) return null;
  const ownAgency =
    agencyFromCode(e.agency_id) ?? agencyFromCode(preferredQuakemlOrigin(e)?.creationInfo?.agencyID);
  return ownAgency == null || ownAgency === catalogueAgency ? catalogueAgency : null;
}

/** The reports of each agency (sameAgencyKey), for agencies with at least two reports in the group. */
function reportsByAgency(events: EventData[]): Array<[AgencyKey, EventData[]]> {
  const byAgency = new Map<AgencyKey, EventData[]>();
  for (const e of events) {
    const agency = sameAgencyKey(e);
    if (!agency) continue;
    const members = byAgency.get(agency);
    if (members) members.push(e);
    else byAgency.set(agency, [e]);
  }
  return Array.from(byAgency.entries()).filter(([, members]) => members.length > 1);
}

/**
 * Two reports of one agency with different agency ids of the same kind, if the group holds
 * such a pair. Reports without a clear agency (sameAgencyKey) are never grouped, and a pair
 * whose ids are not comparable (one has none, or a publicID against a source_id that differ)
 * is left to the strategy like any two reports.
 */
function findSameAgencyConflict(
  events: EventData[]
): { agency: AgencyKey; label: string; ids: string[] } | null {
  for (const [agency, members] of reportsByAgency(events)) {
    const ordered = members.slice().sort(compareRecordOrder);
    for (let i = 0; i < ordered.length; i++) {
      const a = agencyEventId(ordered[i]);
      if (!a) continue;
      for (let j = i + 1; j < ordered.length; j++) {
        const b = agencyEventId(ordered[j]);
        if (!b || !distinctAgencyEvents(a, b)) continue;
        return { agency, label: AGENCY_DISPLAY_NAMES[agency] ?? agency, ids: [a.id, b.id] };
      }
    }
  }
  return null;
}

/**
 * Same-agency supersession (M5). Two reports of one agency (sameAgencyKey) that carry the
 * same agency event id (normalised, of either kind) are two vintages of one solution - a
 * preliminary and a reviewed GeoNet location, an ISC bulletin re-import: the newest
 * (rankByNewest) is the agency's current solution and the rest are superseded - kept in the
 * provenance, excluded from every selection, average, ranking and field rule. Anything less
 * certain (no clear agency, a report without an id) is not superseded: both reports stay
 * and the strategy decides between them, as for any two reports. `active` keeps the input
 * order.
 */
function supersedeSameAgency(events: EventData[]): { active: EventData[]; superseded: Set<EventData> } {
  const superseded = new Set<EventData>();
  if (events.length < 2) return { active: events, superseded };
  for (const [, members] of reportsByAgency(events)) {
    const byId = new Map<string, EventData[]>();
    for (const e of members) {
      const id = agencyEventId(e)?.id.toLowerCase();
      if (!id) continue;
      const vintages = byId.get(id);
      if (vintages) vintages.push(e);
      else byId.set(id, [e]);
    }
    for (const vintages of Array.from(byId.values())) {
      if (vintages.length < 2) continue;
      for (const older of rankByNewest(vintages).slice(1)) superseded.add(older);
    }
  }
  if (superseded.size === 0) return { active: events, superseded };
  return { active: events.filter(e => !superseded.has(e)), superseded };
}

/**
 * Re-insert the superseded reports into a provenance list built over the active reports
 * only, in the group's original order, so source_events lists every contributing report
 * (they still count towards source_catalogue_ids) with the flags the strategy set on the
 * active ones intact.
 */
function restoreSupersededReports(
  sourceEvents: SourceEventEntry[],
  events: EventData[],
  active: EventData[]
): SourceEventEntry[] {
  return events.map(e => {
    const position = active.indexOf(e);
    if (position >= 0) return sourceEvents[position];
    return {
      catalogueId: e.catalogueId ?? e.id ?? 'unknown',
      source: e.source,
      originalData: toSourceEventData(e),
      superseded: true as const,
    };
  });
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

// Location-uncertainty fields belong to one origin solution. Equal rounded coordinates
// do not justify grafting another report's uncertainties onto the published origin. The
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

/** How the focal mechanism is resolved inside unionMergeFields (contract M1). */
interface UnionMergeOptions {
  mechanism?: MergeFieldRules['mechanism'];
}

/**
 * Apply a field-level union over a group of source events onto the already-
 * selected merged base event.
 */
function unionMergeFields(
  base: MergedEventData,
  events: EventData[],
  options: UnionMergeOptions = {}
): MergedEventData {
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

  // Magnitude and location metadata already came from the selected measurement through
  // the strategy or field rule. Equal rounded magnitude/type or coordinates are common
  // between independent solutions; they do not identify the same measurement. Filling
  // gaps by numerical equality fabricated uncertainty, station counts and even mixed
  // different reports' ellipses. Computed epicentres carry no report's location metadata,
  // including when an average or median happens to coincide with a reported epicentre.

  // Depth metadata (DEPTH_META_FIELDS) is never filled from another report, not even one
  // stating the same depth value: fixed-depth conventions (10, 33 km) make equal depths
  // common between different solutions, so a free 10 km ± 2 depth was published as another
  // agency's "operator assigned", ± 0. It comes from the published report through the
  // strategy's spread, or, for an averaged record, from the report mergeByAverage took the
  // depth from.

  // Focal mechanisms. A mechanism rule (M1) of 'strategy' publishes only the base report's
  // own mechanisms, 'catalogue' only the named report's; either falls back to the hierarchy
  // when its report stored none. Under the hierarchy (the default) every mechanism any
  // source stored is kept, ordered by the documented authority hierarchy, and the best
  // becomes the preferred one (finding #30).
  const chosen = mechanismReportForRule(result, events, options.mechanism);
  let mechanisms: FocalMechanism[];
  let preferredId: string | null;
  if (chosen) {
    const own = focalMechanismsOf(chosen.report);
    mechanisms = own.list;
    preferredId = own.preferredId ?? own.list[0].publicID ?? null;
    result.sourceEvents = result.sourceEvents.map((entry, index) =>
      index === chosen.index ? { ...entry, mechanismSelected: true as const } : entry
    );
  } else {
    mechanisms = unionFocalMechanisms(events);
    preferredId = mechanisms[0]?.publicID ?? null;
  }
  if (mechanisms.length > 0) {
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
 * The report whose own focal mechanisms a mechanism rule publishes, with its index in the
 * group; null under the hierarchy, or when the rule's report stored no mechanism (fall back
 * to the hierarchy). 'strategy' means the `selected` base report, so a computed epicentre
 * (average, median), which publishes no report's solution, falls back too.
 */
function mechanismReportForRule(
  merged: MergedEventData,
  events: EventData[],
  rule: MergeFieldRules['mechanism'] | undefined
): { report: EventData; index: number } | null {
  if (!rule || rule.rule === 'hierarchy') return null;
  let index = -1;
  if (rule.rule === 'catalogue') {
    index = events.findIndex(e => String(e.catalogueId ?? '') === String(rule.catalogueId ?? ''));
  } else {
    index = merged.sourceEvents.findIndex(entry => entry.selected === true);
  }
  if (index < 0 || index >= events.length) return null;
  const report = events[index];
  return focalMechanismsOf(report).list.length > 0 ? { report, index } : null;
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
const MERGE_STRATEGY_NAMES = new Set(['quality', 'priority', 'newest', 'complete', 'average', 'median']);

function mergeStrategyName(config: MergeConfig): string {
  return MERGE_STRATEGY_NAMES.has(config.mergeStrategy) ? config.mergeStrategy : 'priority';
}

const mergeParameterCache = new WeakMap<object, { authority: string; description: string }>();

/**
 * The authority table a merge ran with, as merge_parameters records it (M6): the built-in
 * default, or an administrator's table identified by when it was saved.
 */
function describeMergeAuthority(table: MergeAuthorityTable = currentMergeAuthority()): string {
  if (table.source !== 'custom') return 'default';
  return `custom@${table.updatedAt ?? new Date(0).toISOString()}`;
}

/**
 * The effective merge configuration, as the JSON stored on every merged event
 * (`merge_parameters`, contract C2). Computed once per configuration object and
 * authority table (the table is scoped per merge, so one config object may run under two).
 */
function describeMergeParameters(config: MergeConfig): string {
  const authority = describeMergeAuthority();
  const cached = mergeParameterCache.get(config);
  if (cached !== undefined && cached.authority === authority) return cached.description;
  const strategy = mergeStrategyName(config);
  const customOrder = strategy === 'priority' && config.priority === 'custom' && Array.isArray(config.priorityOrder);
  const description = JSON.stringify({
    mergeStrategy: strategy,
    timeThresholdSeconds: config.timeThreshold,
    distanceThresholdKm: config.distanceThreshold,
    priority: config.priority,
    ...(customOrder ? { priorityOrder: config.priorityOrder } : {}),
    // Per-field rules (M1) and the hold-for-review choice (M4), as they were applied.
    ...(config.fieldRules ? { fieldRules: config.fieldRules } : {}),
    onConflict: config.onConflict ?? 'resolve',
    authority,
    // The configured windows are always widened by magnitude and depth (eventsMatchAdaptive).
    adaptiveWindows: true,
    association: 'one-to-one, best match on normalised time and distance',
  });
  mergeParameterCache.set(config, { authority, description });
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
  clearReviewColumns(merged);
  return merged;
}

/**
 * A merged row starts unreviewed. The strategies spread a base report, and a report from a
 * merged source catalogue carries that catalogue's review columns, which would otherwise
 * publish a stale 'pending' (or a reviewer's name) on the new row. The persist path marks
 * the held rows AFTER this (resolveMatchGroup).
 */
function clearReviewColumns(merged: MergedEventData): void {
  merged.review_status = null;
  merged.review_reasons = null;
  merged.reviewed_by = null;
  merged.reviewed_at = null;
  merged.review_choice = null;
}

/**
 * Merge a group of matching events based on the selected strategy.
 * Same-agency vintages are settled first (supersedeSameAgency); the strategy then selects
 * the base record from the current reports, the per-field rules (M1) re-source the depth,
 * magnitude and mechanism where the request asks, and a field-level union pass fills in
 * any optional fields that the base event lacks from other sources.
 */
function mergeEventGroup(
  events: EventData[],
  config: MergeConfig
): MergedEventData {
  const { active, superseded } = supersedeSameAgency(events);
  const merged = mergeActiveReports(active, config);
  if (superseded.size > 0) merged.sourceEvents = restoreSupersededReports(merged.sourceEvents, events, active);
  return withMergeProvenance(merged, config);
}

/** The strategy, field rules and union over the reports that take part in the merge. */
function mergeActiveReports(events: EventData[], config: MergeConfig): MergedEventData {
  if (events.length === 1) {
    // A lone report is published as it stands, whatever the strategy.
    return {
      ...events[0],
      sourceEvents: buildSourceEvents([events[0]], 0)
    };
  }

  let mergedEvent: MergedEventData;

  switch (config.mergeStrategy) {
    case 'average':
      mergedEvent = mergeByAverage(events);
      break;
    case 'median':
      mergedEvent = mergeByMedian(events);
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

  // Field rules run before the union so the union's gap-filling sees the published depth
  // and magnitude (and their metadata) as the rule set them.
  applyDepthRule(mergedEvent, events, config.fieldRules?.depth);
  applyMagnitudeRule(mergedEvent, events, config.fieldRules?.magnitude);

  // Apply field-level union: fill optional fields the base event lacks
  // from other sources in the group.
  return unionMergeFields(mergedEvent, events, { mechanism: config.fieldRules?.mechanism });
}

// ============================================================================
// PER-FIELD RESOLUTION RULES (contract M1)
// ============================================================================

/**
 * The report a rule names among the current reports, or null when the rule cannot be
 * applied to this group (no report from the named catalogue), in which case the strategy's
 * own choice stands. 'best-constrained' / 'type-preference' are not report choices and are
 * handled by their callers.
 */
function reportForFieldRule(
  rule: string,
  catalogueId: string | undefined,
  events: EventData[]
): EventData | null {
  switch (rule) {
    case 'quality':
      return rankByQuality(events)[0] ?? null;
    case 'authority':
      return selectByNetworkAuthority(events);
    case 'newest':
      return rankByNewest(events)[0] ?? null;
    case 'catalogue':
      return events.find(e => String(e.catalogueId ?? '') === String(catalogueId ?? '')) ?? null;
    default:
      return null;
  }
}

/** Set one provenance flag on exactly one report, clearing it everywhere else. */
function markSelectedReport(
  sourceEvents: SourceEventEntry[],
  index: number,
  flag: 'depthSelected' | 'magnitudeSelected'
): void {
  sourceEvents.forEach((entry, i) => {
    if (i === index) entry[flag] = true;
    else delete entry[flag];
  });
}

/**
 * The published depth's own type and uncertainty, from the report it was taken from (its
 * preferred QuakeML origin in km, else its stored columns). A non-positive uncertainty is
 * no measurement, as in the depth selection.
 */
function depthMetadataOf(report: EventData): { depth_type: string | null; depth_uncertainty: number | null } {
  const origin = preferredQuakemlOrigin(report);
  const uncertaintyKm = origin?.depth?.uncertainty != null
    ? origin.depth.uncertainty / 1000
    : report.depth_uncertainty;
  return {
    depth_type: origin?.depthType ?? report.depth_type ?? null,
    depth_uncertainty:
      typeof uncertaintyKm === 'number' && Number.isFinite(uncertaintyKm) && uncertaintyKm > 0 ? uncertaintyKm : null,
  };
}

/**
 * Depth rule: publish the named report's depth WITH its own DEPTH_META_FIELDS and mark
 * that report `depthSelected`. A report with no depth cannot supply one (the strategy's
 * choice stands). 'strategy' is the strategy's own behaviour and changes nothing.
 */
function applyDepthRule(merged: MergedEventData, events: EventData[], rule: MergeFieldRules['depth'] | undefined): void {
  if (!rule || rule.rule === 'strategy') return;
  let index: number;
  if (rule.rule === 'best-constrained') {
    const candidate = selectBestDepthCandidate(events);
    if (!candidate) return;
    index = candidate.index;
  } else {
    const report = reportForFieldRule(rule.rule, rule.catalogueId, events);
    if (!report || report.depth == null || !Number.isFinite(report.depth)) return;
    index = events.indexOf(report);
  }
  const report = events[index];
  merged.depth = report.depth;
  Object.assign(merged, depthMetadataOf(report));
  (merged as { _depthResolved?: boolean })._depthResolved = true;
  markSelectedReport(merged.sourceEvents, index, 'depthSelected');
}

/**
 * Publish one selected magnitude measurement: its value, its OWN metadata and the pointer
 * to its QuakeML entry, and mark the report it came from. Nulling the metadata lost real
 * data; copying it from the base event stamped a different measurement's ±0.30 / 4
 * stations onto a selection that came from a ±0.05 / 12-station solution.
 */
function publishSelectedMagnitude(merged: MergedEventData, selected: SelectedMagnitude): void {
  merged.magnitude = selected.value;
  merged.magnitude_type = selected.type !== 'unknown' ? selected.type : null;
  merged.magnitude_uncertainty = selected.uncertainty;
  merged.magnitude_station_count = selected.stationCount;
  merged.magnitude_method_id = selected.methodID;
  merged.magnitude_evaluation_mode = selected.evaluationMode;
  merged.magnitude_evaluation_status = selected.evaluationStatus;
  // The preferred-magnitude pointer follows the selected measurement: left pointing at
  // the base's own preferred entry, the exporter rewrote THAT entry (an ML) with the
  // selected Mw value and emitted the real Mw entry beside it.
  merged.preferred_magnitude_id = selected.publicID;
  (merged as { _magnitudeResolved?: boolean })._magnitudeResolved = true;
  if (selected.sourceIndex != null) markSelectedReport(merged.sourceEvents, selected.sourceIndex, 'magnitudeSelected');
}

/**
 * A report's own preferred magnitude as a SelectedMagnitude: its stored columns, with the
 * preferred entry of its in-memory QuakeML filling what the columns do not state.
 */
function reportMagnitude(report: EventData, index: number): SelectedMagnitude {
  const quakeml = report.quakeml;
  const preferred = quakeml?.magnitudes?.find(m => m.publicID === quakeml.preferredMagnitudeID) ?? quakeml?.magnitudes?.[0];
  const text = (column: unknown, fallback: unknown): string | null =>
    typeof column === 'string' && column ? column : typeof fallback === 'string' && fallback ? fallback : null;
  const num = (column: unknown, fallback: unknown): number | null =>
    typeof column === 'number' && Number.isFinite(column)
      ? column
      : typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : null;
  return {
    value: report.magnitude,
    type: text(report.magnitude_type, preferred?.type) ?? 'unknown',
    publicID: text(report.preferred_magnitude_id, preferred?.publicID),
    uncertainty: num(report.magnitude_uncertainty, preferred?.mag?.uncertainty),
    stationCount: num(report.magnitude_station_count, preferred?.stationCount),
    methodID: text(report.magnitude_method_id, preferred?.methodID),
    evaluationMode: text(report.magnitude_evaluation_mode, preferred?.evaluationMode),
    evaluationStatus: text(report.magnitude_evaluation_status, preferred?.evaluationStatus),
    sourceIndex: index,
  };
}

/**
 * Magnitude rule: 'type-preference' is the size-aware type hierarchy over the group
 * (selectBestMagnitude, as the averaged strategies use); the other rules publish the named
 * report's own preferred magnitude. A report without a magnitude cannot supply one.
 */
function applyMagnitudeRule(
  merged: MergedEventData,
  events: EventData[],
  rule: MergeFieldRules['magnitude'] | undefined
): void {
  if (!rule || rule.rule === 'strategy') return;
  if (rule.rule === 'type-preference') {
    publishSelectedMagnitude(merged, selectBestMagnitude(events));
    return;
  }
  const report = reportForFieldRule(rule.rule, rule.catalogueId, events);
  if (!report || report.magnitude == null || !Number.isFinite(report.magnitude)) return;
  publishSelectedMagnitude(merged, reportMagnitude(report, events.indexOf(report)));
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
 * SeisComP/GeoNet Mw(mB) from the broadband body-wave magnitude (also written Mw_mB or
 * MwmB), Mwp (and Mwpd) from the P-wave displacement — rather than from a moment-tensor
 * inversion. They are on the Mw scale but carry that conversion's scatter, so they are not
 * exact Mw and rank below it. Moment-tensor variants (Mww, Mwc, Mwb, Mwr) are not proxies.
 */
function isMwProxy(magType: string | undefined): boolean {
  if (!magType) return false;
  const lower = magType.trim().toLowerCase();
  if (!lower.startsWith('mw')) return false;
  return lower.includes('(') || /^mwp(d)?$/.test(lower) || /^mw[_\-.:]?(mb|ms|ml|md|mwp)/.test(lower);
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
 * Magnitude at which the non-Mw preference changes, since the published value is the RAW
 * value of the chosen scale and should read as close to Mw as the scales allow. Below it
 * the local magnitude leads: this module relates ML to Mw one-to-one (unsaturated to about
 * 6.5), while raw Ms under-reads Mw (Scordilis 2006: Mw = 0.67 Ms + 2.07 for Ms 3.0-6.1, so
 * Ms 5.1 is Mw 5.5) and short-period mb does too (Mw = 0.85 mb + 1.03). From 6.2 Scordilis's
 * relation is one-to-one (Mw = 0.99 Ms + 0.08, Ms 6.2-8.2), ML is approaching saturation and
 * mb has saturated, so Ms leads. Switching where both scales read Mw keeps the published
 * magnitude from stepping down when the group's size estimate crosses the switch; the
 * earlier switch at 5.5 published raw Ms up to 0.3 below Mw between M5.5 and M6.2.
 */
const LARGE_EVENT_MAGNITUDE = 6.2;

// ============================================================================
// AGENCY IDENTITY
// ============================================================================

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
 * resolveAgency identifies. The table itself lives in lib/merge-authority.ts (M6): the
 * engine reads whatever table the enclosing runWithMergeAuthority scope carries, which is
 * the administrator's saved table for mergeCatalogues / previewMerge and the built-in
 * default everywhere else.
 */
type NetworkAuthority = AuthorityEntry;

/**
 * Regional network priority overrides
 * When events are within these regions, use region-specific priorities
 */
type RegionalPriority = Omit<RegionalAuthority, 'name'>;

/** The built-in global hierarchy, kept as a named export for callers and tests. */
const DEFAULT_NETWORK_HIERARCHY: ReadonlyArray<NetworkAuthority> = DEFAULT_MERGE_AUTHORITY.hierarchy;

/** The built-in regional overrides by region name ('NZ', 'JP'), as they were once declared here. */
const REGIONAL_PRIORITIES: Record<string, RegionalPriority> = Object.fromEntries(
  DEFAULT_MERGE_AUTHORITY.regions.map(region => [region.name, region] as [string, RegionalPriority])
);

/** Longitude containment that supports antimeridian-crossing regions (minLon > maxLon). */
function inRegionBounds(bounds: RegionalPriority['bounds'], latitude: number, longitude: number): boolean {
  const inLon =
    bounds.minLon <= bounds.maxLon
      ? longitude >= bounds.minLon && longitude <= bounds.maxLon
      : longitude >= bounds.minLon || longitude <= bounds.maxLon;
  return latitude >= bounds.minLat && latitude <= bounds.maxLat && inLon;
}

/** Highest (least authoritative) priority each authority table lists, global and regional. */
const LOWEST_LISTED_PRIORITY = new WeakMap<MergeAuthorityTable, number>();

function lowestListedPriority(table: MergeAuthorityTable): number {
  let lowest = LOWEST_LISTED_PRIORITY.get(table);
  if (lowest === undefined) {
    lowest = 0;
    for (const entry of table.hierarchy) lowest = Math.max(lowest, entry.priority);
    for (const region of table.regions) {
      for (const entry of region.hierarchy) lowest = Math.max(lowest, entry.priority);
    }
    LOWEST_LISTED_PRIORITY.set(table, lowest);
  }
  return lowest;
}

/**
 * Get network priority for a source name
 * Lower priority = more authoritative (1 is best)
 *
 * The agency is identified from the event's agency code or its catalogue's explicit
 * agency when an event is given, otherwise from whole words of the source name.
 *
 * A network the table does not list ranks just below every listed one, and a report with
 * no source at all below that. Fixed ranks (100, 999) put an unlisted network ABOVE a
 * network an administrator listed at a priority past 100, which the table allows (to 1000).
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
  // The running table (M6): regional overrides first, then the global hierarchy.
  const table = currentMergeAuthority();
  const hierarchy = customHierarchy || table.hierarchy;
  const unlisted = Math.max(
    lowestListedPriority(table),
    customHierarchy ? Math.max(0, ...customHierarchy.map(entry => entry.priority)) : 0
  ) + 1;

  const agency = event ? resolveAgency(event, source) : agencyFromName(source);
  if (!source && !agency) return unlisted + 1;
  const words = new Set(source ? nameTokens(source) : []);
  const matches = (entry: { patterns: string[]; agency?: AgencyKey }) =>
    agency != null && entry.agency != null
      ? entry.agency === agency
      : entry.patterns.some(p => words.has(p.toLowerCase()));

  if (event && Number.isFinite(event.latitude) && Number.isFinite(event.longitude)) {
    for (const regionConfig of table.regions) {
      if (!inRegionBounds(regionConfig.bounds, event.latitude, event.longitude)) continue;
      const entry = regionConfig.hierarchy.find(matches);
      if (entry) return entry.priority;
    }
  }

  const entry = hierarchy.find(matches);
  return entry ? entry.priority : unlisted;
}

/**
 * Select best event from group based on network authority
 * Falls back to the quality comparison (rankByQuality) if networks have same priority
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

  // Network priority of each event. Each event uses its own location as the regional
  // reference so that events on region boundaries get the correct hierarchy (e.g. an event
  // just inside NZ bounds is ranked by the NZ hierarchy, not by its neighbour's region).
  const priorities = events.map(e => getNetworkPriority(e.source, e, customHierarchy));
  const best = Math.min(...priorities);
  const tied = events.filter((_, i) => priorities[i] === best);
  if (tied.length === 1) return tied[0];

  // Equally authoritative sources are compared the way the quality strategy compares them
  // (rankByQuality: only the metrics every one of them states, then populated fields, then a
  // fixed record order). An absolute score counted a metric one source omits as zero, so the
  // choice depended on which catalogue happened to carry more columns.
  return rankByQuality(tied)[0];
}

/**
 * Get magnitude priority (lower = better)
 *
 * Without a reference magnitude this is the static type hierarchy (Mw, Mw proxies, Ms,
 * mb, ML, Md). With one — the size of the earthquake being described — the non-Mw scales
 * are ranked by which is not saturated and best calibrated at that size (finding #25):
 * below LARGE_EVENT_MAGNITUDE (M6.2) the local magnitude ML leads, then the body-wave
 * scales, then Ms; from it upward Ms leads, then broadband mB, then ML, then short-period mb.
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
  /** publicID of the selected measurement, including a scalar's stored preferred ID. */
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
            publicID: typeof event.preferred_magnitude_id === 'string' && event.preferred_magnitude_id
              ? event.preferred_magnitude_id : null,
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
 * A report's horizontal location uncertainty in km, or null when it states none. The
 * precedence is the platform's (lib/validation horizontalUncertaintyKm): the error-ellipse
 * semi-major axis, then the circular radius, then the lat/lon marginals with cos(latitude)
 * (the old geometric-mean ×111 left it out) — from the parsed QuakeML origin (metres) when
 * present, else from the stored columns (km, degrees). For weighting, a non-positive value is
 * not a measurement and is skipped at EACH level, so a placeholder 0 radius no longer hides
 * the marginals the report does state (that resolver stops at the first field present).
 */
function locationUncertaintyKm(event: EventData): number | null {
  const positive = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  const fromMarginals = (latDeg: number | null, lonDeg: number | null): number | null => {
    if (latDeg == null && lonDeg == null) return null;
    const cosLat = Math.cos(((Number.isFinite(event.latitude) ? event.latitude : 0) * Math.PI) / 180);
    return Math.max((latDeg ?? 0) * 111, (lonDeg ?? 0) * 111 * cosLat);
  };
  const origin = preferredQuakemlOrigin(event);
  if (origin) {
    const metres = positive(origin.uncertainty?.maxHorizontalUncertainty) ?? positive(origin.uncertainty?.horizontalUncertainty);
    if (metres != null) return metres / 1000;
    const fromOrigin = fromMarginals(positive(origin.latitude?.uncertainty), positive(origin.longitude?.uncertainty));
    if (fromOrigin != null) return fromOrigin;
  }
  return (
    positive(event.max_horizontal_uncertainty) ??
    positive(event.horizontal_uncertainty) ??
    fromMarginals(positive(event.latitude_uncertainty), positive(event.longitude_uncertainty))
  );
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

  // Use the earliest time - use pre-computed _timestamp if available for performance
  const earliestEvent = events.reduce((earliest, e) => (compareRecordOrder(e, earliest) < 0 ? e : earliest));

  return mergeByComputedEpicentre(events, {
    latitude: location.latitude,
    longitude: location.longitude,
    time: earliestEvent.time,
    weights: location.weights,
  });
}

/**
 * Median of a set of longitudes, unwrapped across the date line the way averageLongitudes
 * treats them: a set that straddles ±180° is taken on the 0..360 circle first, so 179° and
 * -179° have a median of 180°, not 0°.
 */
function medianLongitude(lons: number[]): number {
  if (lons.length === 0) return 0;
  if (Math.max(...lons) - Math.min(...lons) < 180) return median(lons);
  return normalizeLongitude(median(lons.map(lon => (lon < 0 ? lon + 360 : lon))));
}

/**
 * Consensus epicentre: component-wise median latitude and longitude and the median origin
 * time (for two reports their mean). A median is insensitive to one distant outlier the
 * weighted average is pulled toward.
 */
function medianEpicentre(events: EventData[]): { latitude: number; longitude: number; time: string } {
  return {
    latitude: median(events.map(e => e.latitude)),
    longitude: medianLongitude(events.map(e => e.longitude)),
    time: new Date(median(events.map(eventTimestamp))).toISOString(),
  };
}

/**
 * The 'median' strategy: a consensus epicentre and origin time (medianEpicentre), the
 * best-constrained depth and the type-preferred magnitude, published exactly as the
 * averaged strategy publishes a computed solution (no report `selected`, the metadata of
 * one solution cleared), but with no location weights, since no report is weighted.
 */
function mergeByMedian(events: EventData[]): MergedEventData {
  return mergeByComputedEpicentre(events, { ...medianEpicentre(events), weights: null });
}

/**
 * Publish a computed solution (an averaged or a median epicentre and origin time) over a
 * group: the epicentre no agency located, the best-constrained depth, the type-preferred
 * magnitude, and the provenance of each. `weights` are each report's share of an averaged
 * epicentre, or null when the epicentre was not weighted.
 */
function mergeByComputedEpicentre(
  events: EventData[],
  solution: { latitude: number; longitude: number; time: string; weights: number[] | null }
): MergedEventData {
  // IMPROVEMENT: Use magnitude hierarchy instead of averaging
  // Averaging Mw=7.0 with ML=6.5 would give M=6.75 (incorrect due to saturation)
  const bestMagnitude = selectBestMagnitude(events);

  // IMPROVEMENT: Use best depth based on uncertainty instead of simple average
  const depthChoice = selectBestDepthCandidate(events);

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
    time: solution.time,
    latitude: solution.latitude,
    longitude: solution.longitude,
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

    // The published depth's own type and uncertainty, from the report it was taken from
    // (a non-positive uncertainty is no measurement, as in the depth selection).
    if (depthChoice) Object.assign(merged, depthMetadataOf(events[depthChoice.index]));

    // Provenance: which report each published quantity came from, and each report's share
    // of the averaged epicentre (inverse-variance, or equal when a report stated no σ).
    if (solution.weights) {
      solution.weights.forEach((weight, index) => {
        merged.sourceEvents[index].locationWeight = Math.round(weight * 1e6) / 1e6;
      });
    }
    if (depthChoice) merged.sourceEvents[depthChoice.index].depthSelected = true;
  }

  // Set after the clear: the selected magnitude's OWN metadata, from the measurement the
  // hierarchy actually chose (publishSelectedMagnitude), and the report it came from.
  publishSelectedMagnitude(merged, bestMagnitude);

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
      // Only the origin the row PUBLISHES counts: the one it names as preferred, or one with
      // exactly its origin time and epicentre. A merged row can carry other agencies'
      // origins as supplementary solutions, and one of those lent its creation time to a
      // published solution computed by someone else (e.g. ISC's 2023 relocation dating a
      // GeoNet solution on re-merge).
      const rowTime = Date.parse(e.time);
      origin =
        list.find(o => typeof e.preferred_origin_id === 'string' && o.publicID === e.preferred_origin_id) ??
        list.find(o =>
          o.latitude?.value === e.latitude &&
          o.longitude?.value === e.longitude &&
          Number.isFinite(rowTime) &&
          Date.parse(o.time?.value) === rowTime
        ) ??
        // A lone stored origin is the row's own only when the row is one agency's report,
        // not a merged record combining several.
        (list.length === 1 && contributingReports(e) <= 1 ? list[0] : undefined);
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

/** How many reports a row combines: several for a merged row, one for an agency's own. */
function contributingReports(e: EventData): number {
  if (Array.isArray(e.sourceEvents)) return e.sourceEvents.length;
  const stored = parseJsonColumn(e.source_events);
  return Array.isArray(stored) ? stored.length : 1;
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
 * Returns the QC preview payload (MergePreviewPayload, see buildMergePreview)
 */
export async function previewMerge(
  sourceCatalogues: SourceCatalogue[],
  config: MergeConfig
) {
  if (!dbQueries) {
    throw new Error('Database not initialized');
  }

  // The same authority table the persist path would run with (M6).
  const authority = await loadMergeAuthority();
  return runWithMergeAuthority(authority, () => previewMergeWithAuthority(sourceCatalogues, config));
}

async function previewMergeWithAuthority(sourceCatalogues: SourceCatalogue[], config: MergeConfig) {
  // Fetch events from all source catalogues
  const allEvents: EventData[] = [];
  const catalogueColors: Record<string, string> = {};
  // The Okabe–Ito palette the maps use for catalogues (CVD safe), so the preview's
  // catalogue dots and its duplicate-group map agree. Its 8th entry is black or white by
  // site theme, which the server cannot know, so only the first seven are assigned.
  const colors = OKABE_ITO.slice(0, 7);

  for (let i = 0; i < sourceCatalogues.length; i++) {
    const catalogue = sourceCatalogues[i];
    const catalogueIdStr = String(catalogue.id);
    const sourceDocument = await loadSourceCatalogueDocument(catalogueIdStr);
    const eventsArray = await loadCompleteCatalogueEvents(catalogueIdStr);
    // The same agency identity the persist path uses, so preview and merge select alike.
    const catalogueAgency = catalogueAgencyOf(catalogue, sourceDocument);

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

  return buildMergePreview(allEvents, sourceCatalogues, config, catalogueColors);
}

/**
 * Whether an association group needs a reviewer's eye, and why, in the words the preview
 * shows. ONE predicate for the preview and the persist path (M4), so the groups the
 * preview counts as flagged are exactly the rows a 'hold' merge marks pending: salvaged
 * from a split cluster, a contested association, a failed consistency gate, a magnitude
 * statement from the gate (a rejection, or an acceptance only on the common scale or within
 * the uncertainty-aware tolerance), or a depth range the gate rejects. The gate re-run here
 * does not log: the association already logged its verdict once.
 */
function assessMatchGroup(
  group: MatchGroup,
  _config: MergeConfig
): { suspicious: boolean; separated: boolean; warnings: string[] } {
  const matchingEvents = group.events;
  const warnings: string[] = [];

  // A regrouped group was salvaged from a larger cluster that failed consistency
  // validation (the same split the persist path performs). Flag it for the reviewer.
  if (group.regrouped) {
    const why = group.splitReasons.length > 0 ? ` Reason: ${group.splitReasons.join('; ')}.` : '';
    warnings.push(
      matchingEvents.length > 1
        ? `Salvaged from a larger matched cluster that failed consistency validation and was split.${why}`
        : `Matched with another entry but kept apart because the group failed consistency validation.${why}`
    );
  }

  // Contested association (see MatchGroup.ambiguous): the closest pairing was kept, but a
  // reviewer should confirm it — dense sequences are where fixed windows mislead.
  if (group.ambiguous) {
    warnings.push(
      'Ambiguous association: an entry in this group was nearly as close, in time and distance, to ' +
      'another event that could not join it (a second entry from a catalogue already in the group, ' +
      'or one too far from the rest); the closest match was kept.'
    );
  }

  // A report the split left on its own is `separated`, not a suspicious merge: it is
  // published alone, and "suspicious matches" keeps meaning merged groups a reviewer should
  // check. Both are flagged, and both are held under onConflict 'hold'.
  const separated = group.regrouped && matchingEvents.length === 1;
  // The association's own record of this group, read by the same helper the gate reads it with.
  const association = associationEvidenceOf(matchingEvents);
  const gateFailed = matchingEvents.length > 1 && !validateEventGroup(matchingEvents, false, undefined, association);
  let suspicious = (group.regrouped && !separated) || group.ambiguous || gateFailed;

  // The gate judges the reports that take part in the merge (superseded same-agency
  // vintages excluded, see validateEventGroup), and so do the statistics quoted here.
  const judged = matchingEvents.length > 1 ? supersedeSameAgency(matchingEvents).active : matchingEvents;
  if (judged.length > 1) {
    // Report EXACTLY what the gate decided: same helper, same filtered statistics, same
    // thresholds. The preview used to recompute the mean and range over the unfiltered
    // magnitude list, so a single null member coerced to 0 through Math.min/reduce and the
    // panel quoted a fabricated range (and a threshold from a fabricated mean) for a group
    // the merge had accepted without complaint.
    const magnitude = assessMagnitudeConsistency(judged, association);
    if (magnitude.reason) {
      // reason is set both when the gate rejected the group and when it accepted only
      // because the members agree on the common (Mw) scale or within the tolerance their
      // reported uncertainties allow — say which. Only a rejection flags the group: a
      // rescue explains why the merge went ahead.
      warnings.push(magnitude.reason);
      if (magnitude.failure) suspicious = true;
    }

    // The gate's own depth verdict, with the gate's mean magnitude (NaN when none is usable,
    // which takes the wider tier there as here; the preview used to take the strictest).
    const depth = assessDepthConsistency(judged, magnitude.rawMean);
    if (depth.reason) {
      // A rejection flags the group; a note explains why a wide range was accepted.
      warnings.push(depth.reason);
      if (!depth.ok) suspicious = true;
    }
  }

  return { suspicious, separated, warnings };
}

/** One group of a merge as the preview and the QC summary describe it. */
interface MergeGroupDetail {
  /** `group-<n>` in the preview; the merged event's id for a merge that writes rows. */
  id: string;
  events: EventData[];
  selectedEventIndex: number;
  isSuspicious: boolean;
  separated: boolean;
  validationWarnings: string[];
  /** What a 'hold' merge marks pending: the same predicate, the same reasons. */
  heldForReview: boolean;
  /** Superseded same-agency vintages (M5), so the panel can grey them out. */
  supersededEventIndexes: number[];
  /** The epicentre and origin time the merge computes and publishes when no single report
   *  is selected (average / median strategies); null when a report's solution is published. */
  computedEpicentre: { latitude: number; longitude: number; time: string } | null;
  splitKey: string | null;
  discrepancy: number;
  spread: QcPreviewGroup['spread'];
}

/**
 * Perform merge and return every group (single entries included) with its metadata.
 */
function performMergeWithGroups(
  events: EventData[],
  config: MergeConfig
): MergeGroupDetail[] {
  // Use the SAME grouping and resolution the persist path uses so the preview stats,
  // groups, and selected representative match exactly what mergeCatalogues will write.
  // Each match group corresponds 1:1 to a merged output event.
  return groupMatchingEvents(events, config).map((matchGroup, i) =>
    describeResolvedGroup(resolveMatchGroup(matchGroup, config), `group-${i}`, config)
  );
}

// ============================================================================
// MERGE QUALITY CONTROL (lib/merge-qc.ts): the preview payload and the QC summary
// ============================================================================

/** Above this many windows a disagreement is off the scale; keeps the value finite for JSON. */
const MAX_DISCREPANCY = 1000;

const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const roundTo = (value: number, step: number): number => {
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(6)) || 0;
};

function describeResolvedGroup(resolved: ResolvedMatchGroup, id: string, config: MergeConfig): MergeGroupDetail {
  const { discrepancy, spread } = groupDisagreement(resolved, config);
  return {
    id,
    events: resolved.group.events,
    selectedEventIndex: resolved.selectedEventIndex,
    isSuspicious: resolved.isSuspicious,
    separated: resolved.separated,
    validationWarnings: resolved.validationWarnings,
    heldForReview: resolved.heldForReview,
    supersededEventIndexes: resolved.supersededEventIndexes,
    computedEpicentre: resolved.computedEpicentre,
    splitKey: resolved.group.splitKey,
    discrepancy,
    spread,
  };
}

/**
 * How far a group's entries are from what the merge publishes (QcPreviewGroup.discrepancy
 * and .spread): each entry against the published solution, or against the computed
 * epicentre (with the published depth and magnitude) when the solution was averaged. The
 * discrepancy is in units of the pair's own adaptive windows (pairSeparation), the same
 * windows the matcher used. Superseded vintages take no part in the merge and are skipped.
 */
function groupDisagreement(
  resolved: ResolvedMatchGroup,
  config: MergeConfig
): { discrepancy: number; spread: QcPreviewGroup['spread'] } {
  const events = resolved.group.events;
  const spread: QcPreviewGroup['spread'] = { timeS: 0, distanceKm: 0, depthKm: null, magnitude: null };
  if (events.length < 2) return { discrepancy: 0, spread };

  const published = resolved.selectedEventIndex >= 0 ? events[resolved.selectedEventIndex] : null;
  const reference: EventData = published ?? {
    time: String(resolved.merged.time),
    latitude: resolved.merged.latitude,
    longitude: resolved.merged.longitude,
    depth: resolved.merged.depth,
    magnitude: resolved.merged.magnitude,
    source: resolved.merged.source,
  };
  const referenceDepth = finiteNumberOrNull(reference.depth);
  const referenceMagnitude = finiteNumberOrNull(reference.magnitude);
  const superseded = new Set(resolved.supersededEventIndexes);
  const share = (value: number, window: number): number =>
    !Number.isFinite(value) ? 0 : window > 0 ? value / window : value > 0 ? MAX_DISCREPANCY : 0;

  let discrepancy = 0;
  events.forEach((event, index) => {
    if (event === published || superseded.has(index)) return;
    const pair = pairSeparation(event, reference, config.timeThreshold, config.distanceThreshold);
    discrepancy = Math.max(discrepancy, share(pair.timeDiff, pair.timeWindow), share(pair.distance, pair.distanceWindow));
    if (Number.isFinite(pair.timeDiff)) spread.timeS = Math.max(spread.timeS, pair.timeDiff);
    if (Number.isFinite(pair.distance)) spread.distanceKm = Math.max(spread.distanceKm, pair.distance);
    const depth = finiteNumberOrNull(event.depth);
    if (depth !== null && referenceDepth !== null) {
      spread.depthKm = Math.max(spread.depthKm ?? 0, Math.abs(depth - referenceDepth));
    }
    const magnitude = finiteNumberOrNull(event.magnitude);
    if (magnitude !== null && referenceMagnitude !== null) {
      spread.magnitude = Math.max(spread.magnitude ?? 0, Math.abs(magnitude - referenceMagnitude));
    }
  });

  return {
    discrepancy: roundTo(Math.min(discrepancy, MAX_DISCREPANCY), 1e-4),
    spread: {
      timeS: roundTo(spread.timeS, 1e-3),
      distanceKm: roundTo(spread.distanceKm, 1e-3),
      depthKm: spread.depthKm === null ? null : roundTo(spread.depthKm, 1e-3),
      magnitude: spread.magnitude === null ? null : roundTo(spread.magnitude, 1e-3),
    },
  };
}

/** One entry of a group as buildMergeQcSummary reads it. */
function qcEntryInput(event: EventData, superseded: boolean, catalogueNames: Map<string, string>): QcEntryInput {
  const catalogueId = String(event.catalogueId ?? '');
  const sourceId = typeof event.source_id === 'string' && event.source_id !== '' ? event.source_id : null;
  const magnitudeType =
    typeof event.magnitude_type === 'string' && event.magnitude_type.trim() !== '' ? event.magnitude_type.trim() : null;
  return {
    catalogueId,
    catalogueName:
      catalogueNames.get(catalogueId) ??
      (typeof event.catalogueName === 'string' ? event.catalogueName : String(event.source ?? catalogueId)),
    sourceId,
    time: String(event.time),
    latitude: event.latitude,
    longitude: event.longitude,
    depth: finiteNumberOrNull(event.depth),
    magnitude: finiteNumberOrNull(event.magnitude),
    magnitudeType,
    qualityScore: finiteNumberOrNull(event.quality_score),
    // The rule the depth selection uses (QuakeML depthType, else the stored depth_type).
    depthFixed: isFixedDepth(event, preferredQuakemlOrigin(event)),
    superseded,
  };
}

function qcGroupInput(detail: MergeGroupDetail, catalogueNames: Map<string, string>): QcGroupInput {
  const superseded = new Set(detail.supersededEventIndexes);
  return {
    id: detail.id,
    entries: detail.events.map((event, index) => qcEntryInput(event, superseded.has(index), catalogueNames)),
    publishedIndex: detail.selectedEventIndex,
    flagged: detail.isSuspicious,
    keptApart: detail.separated,
    held: detail.heldForReview,
    reasons: detail.validationWarnings,
    splitKey: detail.splitKey,
    discrepancy: detail.discrepancy,
  };
}

/** The QC summary of a merge from its groups (every group, single entries included). */
function buildMergeQc(
  details: MergeGroupDetail[],
  sourceCatalogues: SourceCatalogue[],
  config: MergeConfig
): MergeQcSummary {
  const refs = sourceCatalogues.map(c => ({ id: String(c.id), name: c.name ?? String(c.id) }));
  const catalogueNames = new Map<string, string>();
  refs.forEach(ref => { if (!catalogueNames.has(ref.id)) catalogueNames.set(ref.id, ref.name); });
  return buildMergeQcSummary({
    // As stored in the catalogue's merge_config (JSON, so absent options are absent).
    config: JSON.parse(JSON.stringify(config)) as Record<string, unknown>,
    sourceCatalogues: refs,
    groups: details.map(detail => qcGroupInput(detail, catalogueNames)),
    pairWindows: (a, b) => pairMatchingWindows(a, b, config.timeThreshold, config.distanceThreshold),
    generatedBy: QC_GENERATED_BY,
  });
}

/** One entry as the preview lists it. */
function previewEntry(e: EventData): QcPreviewEntry {
  return {
    id: e.id,
    source_id: e.source_id,
    time: e.time,
    latitude: e.latitude,
    longitude: e.longitude,
    depth: e.depth,
    depth_type: e.depth_type,
    magnitude: e.magnitude,
    source: e.source,
    catalogueId: e.catalogueId,
    catalogueName: e.catalogueName,
    // Quality metrics
    magnitude_type: e.magnitude_type,
    magnitude_uncertainty: e.magnitude_uncertainty,
    used_station_count: e.used_station_count,
    azimuthal_gap: e.azimuthal_gap,
    standard_error: e.standard_error,
    depth_uncertainty: e.depth_uncertainty,
    quality_score: e.quality_score,
  };
}

function previewGroup(detail: MergeGroupDetail): QcPreviewGroup {
  return {
    id: detail.id,
    events: detail.events.map(previewEntry),
    selectedEventIndex: detail.selectedEventIndex,
    isSuspicious: detail.isSuspicious,
    separated: detail.separated,
    validationWarnings: detail.validationWarnings,
    heldForReview: detail.heldForReview,
    supersededEventIndexes: detail.supersededEventIndexes,
    computedEpicentre: detail.computedEpicentre,
    splitKey: detail.splitKey,
    discrepancy: detail.discrepancy,
    spread: detail.spread,
  };
}

/**
 * The merge preview (POST /api/merge/preview, MergePreviewPayload): every flagged,
 * kept-apart and held group, the QC_PREVIEW_MAX_MATCHED other matched groups with the
 * largest discrepancy, in output order, and the QC summary of the whole merge. Single
 * entries that were never matched are counted (statistics, qc) but not listed: listing
 * all of them made the payload grow with the catalogues rather than with what needs review.
 */
function buildMergePreview(
  events: EventData[],
  sourceCatalogues: SourceCatalogue[],
  config: MergeConfig,
  catalogueColors: Record<string, string>
): MergePreviewPayload {
  const groups = performMergeWithGroups(events, config);

  // Calculate statistics (over every group, listed or not)
  const totalEventsBefore = events.length;
  const duplicateGroupsCount = groups.filter(g => g.events.length > 1).length;
  const totalEventsAfter = groups.length;
  const duplicatesRemoved = totalEventsBefore - totalEventsAfter;

  // Identify suspicious matches — use the flag already set by performMergeWithGroups
  // to avoid calling validateEventGroup a second time (which would double-log conflicts).
  const suspiciousGroups = groups.filter(group => group.isSuspicious);
  const heldForReviewCount = groups.filter(group => group.heldForReview).length;
  const separatedReportsCount = groups.filter(group => group.separated).length;
  const supersededReportsCount = groups.reduce((sum, group) => sum + group.supersededEventIndexes.length, 0);

  const needsReview = (g: MergeGroupDetail) => g.isSuspicious || g.separated || g.heldForReview;
  // Matched groups that need no review, largest discrepancy first (ties in output order).
  const matched = groups
    .map((group, order) => ({ group, order }))
    .filter(({ group }) => group.events.length > 1 && !needsReview(group));
  const listedMatched = new Set(
    matched
      .slice()
      .sort((a, b) => b.group.discrepancy - a.group.discrepancy || a.order - b.order)
      .slice(0, QC_PREVIEW_MAX_MATCHED)
      .map(({ group }) => group)
  );

  return {
    duplicateGroups: groups.filter(g => needsReview(g) || listedMatched.has(g)).map(previewGroup),
    matchedListed: listedMatched.size,
    matchedTotal: matched.length,
    statistics: {
      totalEventsBefore,
      totalEventsAfter,
      duplicateGroupsCount,
      duplicatesRemoved,
      suspiciousGroupsCount: suspiciousGroups.length,
      heldForReviewCount,
      supersededReportsCount,
      separatedReportsCount,
    },
    catalogueColors,
    qc: buildMergeQc(groups, sourceCatalogues, config),
  };
}

// ============================================================================
// REVIEW REBUILD (contract M4, consumed by lib/db.ts resolveMergedEventReview)
// ============================================================================

/** The stored source_events column as entries, whether it arrives as JSON text or parsed. */
function parseStoredSourceEvents(value: unknown): SourceEventEntry[] {
  const parsed = parseJsonColumn(value);
  if (!Array.isArray(parsed)) throw new Error('Merged event has no source_events provenance');
  return parsed.filter(
    (entry): entry is SourceEventEntry => entry != null && typeof entry === 'object' && (entry as SourceEventEntry).originalData != null
  );
}

/**
 * Publish report `reportIndex` of a stored merged row wholesale, as a reviewer resolving a
 * held row chooses it: its origin time, epicentre, depth and magnitude with ALL of its own
 * metadata groups (the report is the base, so nothing is borrowed), its mechanisms per the
 * row's stored mechanism rule (merge_parameters.fieldRules) or the hierarchy, the
 * provenance flags rewritten to that report (superseded flags kept), the row's own
 * merge_strategy / merge_parameters / source_catalogue_ids, and Q recomputed. Returns the
 * same field set buildMergedEventFields produces, for a $set. The stored depth and
 * magnitude rules are deliberately not re-applied: the reviewer chose a whole report.
 */
export function rebuildMergedEventForReport(row: Record<string, unknown>, reportIndex: number): Record<string, unknown> {
  const entries = parseStoredSourceEvents(row.source_events);
  if (!Number.isInteger(reportIndex) || reportIndex < 0 || reportIndex >= entries.length) {
    throw new Error(`No entry ${reportIndex} in the merged event's provenance (${entries.length} entries)`);
  }
  if (entries[reportIndex].superseded) {
    throw new Error(`Entry ${reportIndex} is a superseded vintage of its agency's solution and cannot be published`);
  }

  const reports: EventData[] = entries.map(entry => ({
    ...entry.originalData,
    source: entry.source ?? entry.originalData.source,
    catalogueId: entry.catalogueId ?? entry.originalData.catalogueId,
  }));
  const active = reports.filter((_, index) => !entries[index].superseded);
  const report = reports[reportIndex];
  const position = active.indexOf(report);

  let mechanismRule: MergeFieldRules['mechanism'] | undefined;
  const parameters = parseJsonColumn(row.merge_parameters) as { fieldRules?: MergeFieldRules } | null;
  if (parameters && typeof parameters === 'object' && parameters.fieldRules?.mechanism) {
    mechanismRule = parameters.fieldRules.mechanism;
  }

  const base: MergedEventData = { ...report, sourceEvents: buildSourceEvents(active, position) };
  base.sourceEvents[position].magnitudeSelected = true;
  base.sourceEvents[position].depthSelected = true;
  const merged = unionMergeFields(base, active, { mechanism: mechanismRule });
  merged.sourceEvents = restoreSupersededReports(merged.sourceEvents, reports, active);

  merged.merge_strategy = typeof row.merge_strategy === 'string' ? row.merge_strategy : undefined;
  merged.merge_parameters = typeof row.merge_parameters === 'string' ? row.merge_parameters : undefined;
  merged.source_catalogue_ids = Array.isArray(row.source_catalogue_ids) ? row.source_catalogue_ids : undefined;
  // The report may carry its own catalogue's review columns; the resolver writes this row's.
  clearReviewColumns(merged);

  const fields = buildMergedEventFields(merged, OPTIONAL_DB_FIELDS);
  // A collision-disambiguated row keeps its merge identity: restoring the report's raw
  // key would recreate the collision when the held rows are resolved one by one.
  if (typeof row.id === 'string' && row.source_id === `merge-row:${row.id}`) {
    fields.source_id = row.source_id;
  }
  return fields;
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
  // Merge quality control
  pairMatchingWindows,
  buildMergePreview,
  buildMergeQc,
  isFixedDepth,
  assessMatchGroup,
  mergeEventGroup,
  supersedeSameAgency,
  normalizeAgencyEventId,
  sameAgencyKey,
  medianEpicentre,
  medianLongitude,
  OPTIONAL_DB_FIELDS,
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
  mergeByMedian,
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
export type { AgencyKey } from './merge-authority';
