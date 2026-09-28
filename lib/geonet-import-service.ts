/**
 * GeoNet Import Service
 *
 * Handles importing earthquake data from GeoNet API into the database.
 * Supports duplicate detection, event updates, and comprehensive field mapping.
 *
 * Performance Optimization: Uses parallel processing for focal mechanism fetching
 * and bulk database inserts for 10-20x faster imports.
 */

import { geonetClient, GeoNetEventText } from './geonet-client';
import { fetchTimeWindowChunked } from './geonet-chunking';
import {
  dbQueries,
  MergedCatalogue,
  MergedEvent,
  normalizeEventType,
  validateMergedEvent,
  optionalFieldInRange,
} from './db';
import { normalizeTimestamp } from './earthquake-utils';
import { createId } from './id';
import { boundsFromLatLon } from './geo-bounds-utils';
import { parseQuakeMLEvent } from './quakeml-parser';
import { normalizeRake } from './focal-mechanism-utils';
import type { QuakeMLEvent, FocalMechanism as QuakeMLFocalMechanism, NodalPlane } from './types/quakeml';
import pLimit from 'p-limit';

/**
 * Helper to ensure dbQueries is available
 */
function getDbQueries() {
  if (!dbQueries) {
    throw new Error('Database not available');
  }
  return dbQueries;
}

/**
 * Normalize a GeoNet origin time to an explicit-UTC ISO 8601 string.
 */
function normalizeGeoNetTime(time: string): string | null {
  return normalizeTimestamp(time);
}

/** Coerce a QuakeML text/number node to a finite number, or null. */
function quakeMLNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * A value inside the DB validator's range for the field, else null: an out-of-range
 * enrichment value (a 150 km horizontal uncertainty) is dropped on its own instead
 * of taking the event (insert path) or the catalogue status (update path) with it.
 */
function inRange(field: string, value: number | null): number | null {
  return value !== null && optionalFieldInRange(field, value) ? value : null;
}

/**
 * GeoNet's QuakeML resource identifier for an event (e.g. smi:nz.org.geonet/2016p858000),
 * the form its own QuakeML and a QuakeML upload of the same event carry.
 */
export function geonetEventPublicId(eventId: string): string {
  return `smi:nz.org.geonet/${eventId.trim()}`;
}

/**
 * GeoNet event types for records the agency itself says are not a separate, located
 * seismic event: a second record of an earthquake already catalogued under another
 * EventID, an analyst-rejected false event, and an event whose location could not be
 * determined. Stored as ordinary events they are counted twice or at a meaningless
 * hypocentre in rates, b-values and declustering, so they are not imported.
 */
export const EXCLUDED_GEONET_EVENT_TYPES: ReadonlySet<string> = new Set([
  'duplicate',
  'not existing',
  'not locatable',
]);

/**
 * SeisComP event types (GeoNet runs SeisComP) that QuakeML 1.2 BED lacks, mapped the
 * way SeisComP's own SC3ML-to-QuakeML 1.2 conversion maps them. normalizeEventType
 * alone turned them into null, the value for "no type reported", so an event GeoNet
 * flagged as outside its network looked like an ordinary unlabelled earthquake. The
 * raw type is kept verbatim in source_event_type.
 */
const SEISCOMP_EVENT_TYPE_TO_QUAKEML: Readonly<Record<string, string>> = {
  'not locatable': 'other event',
  'outside of network interest': 'other event',
  'duplicate': 'other event',
  'induced earthquake': 'induced or triggered event',
  'meteor impact': 'meteorite',
};

/** A GeoNet EventType as a QuakeML 1.2 BED event type, or null when there is none. */
export function geonetEventTypeToQuakeML(raw: unknown): string | null {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return normalizeEventType(SEISCOMP_EVENT_TYPE_TO_QUAKEML[key] ?? raw);
}

/** The excluded GeoNet type of a record (see EXCLUDED_GEONET_EVENT_TYPES), else null. */
function excludedEventType(raw: unknown): string | null {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return EXCLUDED_GEONET_EVENT_TYPES.has(key) ? key : null;
}

/**
 * True for a catalogue this importer created (getOrCreateCatalogue stamps its
 * merge_config). Only those receive further imports: rows are matched on the bare
 * GeoNet EventID, so GeoNet events imported into an upload or a merge would sit
 * beside that catalogue's own copies of the same earthquakes and mix provenance.
 * components/import/ImportForm.tsx applies the same test to list the targets.
 */
export function isGeoNetImportCatalogue(
  catalogue: Pick<MergedCatalogue, 'merge_config'> | null | undefined
): boolean {
  if (!catalogue?.merge_config) return false;
  try {
    const config = JSON.parse(catalogue.merge_config);
    return !!config && typeof config === 'object' && config.source === 'GeoNet';
  } catch {
    return false;
  }
}

/**
 * Origin-quality fields lifted from a GeoNet QuakeML event.
 *
 * Units follow the conventions the rest of the repo stores and reads (lib/db.ts
 * MergedEvent, lib/integrated-quality-assessment.ts): azimuthal gap and minimum
 * distance in degrees, standard error (RMS travel-time residual) in seconds, station
 * and phase counts as integers, uncertainties in km. QuakeML 1.2 expresses depth and
 * origin-uncertainty lengths in METRES, so those two are converted (/1000).
 */
type GeoNetOriginQuality = Pick<
  MergedEvent,
  | 'azimuthal_gap'
  | 'used_phase_count'
  | 'used_station_count'
  | 'standard_error'
  | 'minimum_distance'
  | 'horizontal_uncertainty'
  | 'depth_uncertainty'
> & {
  /** OriginUncertainty.confidenceLevel, percent (contract C16). */
  confidence_level: number | null;
};

/** What the QuakeML fetched for an M5.0+ event adds to its FDSN text row. */
interface GeoNetEnrichment {
  /** Every focal mechanism (preferred first) and the agency's preferred one. */
  focal: { focal_mechanisms: string; preferred_focal_mechanism_id: string | null } | null;
  originQuality: GeoNetOriginQuality | null;
}

/**
 * The single <event> of a GeoNet eventid query, parsed by lib/quakeml-parser, the
 * reader the QuakeML upload path uses, so both paths store the same thing.
 */
function parseGeoNetQuakeMLEvent(xml: string): QuakeMLEvent | null {
  // `\b` keeps <eventParameters> from matching.
  const open = xml.search(/<(?:[\w.-]+:)?event\b/);
  if (open < 0) return null;
  let end = -1;
  const closeTag = /<\/(?:[\w.-]+:)?event\s*>/g;
  for (let match = closeTag.exec(xml); match; match = closeTag.exec(xml)) {
    end = match.index + match[0].length;
  }
  if (end <= open) return null;
  return parseQuakeMLEvent(xml.slice(open, end));
}

/**
 * Origin quality of the preferred origin (the first origin when none is preferred).
 * Previously only strike/dip/rake was kept and every other field was discarded, so
 * every GeoNet event reached the quality scorers with all inputs null. Fail-safe: any
 * shape it does not recognise yields null.
 */
function originQualityFromQuakeML(quakeml: QuakeMLEvent): GeoNetOriginQuality | null {
  const origins = quakeml.origins ?? [];
  const origin =
    (quakeml.preferredOriginID && origins.find((o) => o.publicID === quakeml.preferredOriginID)) || origins[0];
  if (!origin) return null;

  const quality = origin.quality ?? {};
  const uncertainty = origin.uncertainty ?? {};

  // Metres -> km for the two QuakeML length quantities.
  const metresToKm = (v: number | null) => (v === null ? null : v / 1000);
  const confidence = quakeMLNumber(uncertainty.confidenceLevel);

  const fields: GeoNetOriginQuality = {
    azimuthal_gap: inRange('azimuthal_gap', quakeMLNumber(quality.azimuthalGap)),
    used_phase_count: inRange('used_phase_count', quakeMLNumber(quality.usedPhaseCount)),
    used_station_count: inRange('used_station_count', quakeMLNumber(quality.usedStationCount)),
    standard_error: inRange('standard_error', quakeMLNumber(quality.standardError)),
    minimum_distance: inRange('minimum_distance', quakeMLNumber(quality.minimumDistance)),
    horizontal_uncertainty: inRange('horizontal_uncertainty', metresToKm(quakeMLNumber(uncertainty.horizontalUncertainty))),
    depth_uncertainty: inRange('depth_uncertainty', metresToKm(quakeMLNumber(origin.depth?.uncertainty))),
    confidence_level: confidence !== null && confidence >= 0 && confidence <= 100
      ? inRange('confidence_level', confidence)
      : null,
  };

  return Object.values(fields).some((v) => v !== null) ? fields : null;
}

/** A nodal plane with its rake in (-180, 180]; sources also write rakes on 0-360. */
function normalizePlaneRake(plane: NodalPlane | undefined): NodalPlane | undefined {
  if (!plane || !Number.isFinite(plane.rake?.value)) return plane;
  return { ...plane, rake: { ...plane.rake, value: normalizeRake(plane.rake.value) } };
}

/**
 * Every focal mechanism of the event with its publicID, nodal planes (preferredPlane
 * included), principal axes and moment tensor, in the QuakeML shape the upload path
 * stores. The old extractor rebuilt XML from the xml2js object, which turned the
 * nodalPlanes/@preferredPlane attribute into a child element it never read, and it
 * kept only strike/dip/rake of the first mechanism in document order, whatever
 * preferredFocalMechanismID named.
 */
function focalMechanismFields(quakeml: QuakeMLEvent): GeoNetEnrichment['focal'] {
  const mechanisms = (quakeml.focalMechanisms ?? []).map((fm): QuakeMLFocalMechanism => {
    if (!fm.nodalPlanes) return fm;
    const nodalPlanes = { ...fm.nodalPlanes };
    if (nodalPlanes.nodalPlane1) nodalPlanes.nodalPlane1 = normalizePlaneRake(nodalPlanes.nodalPlane1);
    if (nodalPlanes.nodalPlane2) nodalPlanes.nodalPlane2 = normalizePlaneRake(nodalPlanes.nodalPlane2);
    return { ...fm, nodalPlanes };
  });
  if (mechanisms.length === 0) return null;

  const preferredId = quakeml.preferredFocalMechanismID ?? null;
  const preferred = preferredId ? mechanisms.find((m) => m.publicID === preferredId) : undefined;
  // QuakeML gives the order of an event's mechanisms no meaning. The preferred one goes
  // first so a reader that takes the first entry (without preferred_focal_mechanism_id)
  // still shows the agency's choice.
  const ordered = preferred ? [preferred, ...mechanisms.filter((m) => m !== preferred)] : mechanisms;
  return { focal_mechanisms: JSON.stringify(ordered), preferred_focal_mechanism_id: preferredId };
}

/** Stored and incoming values are the same (null and absent both mean "no value"). */
function sameStoredValue(stored: unknown, incoming: unknown): boolean {
  const storedEmpty = stored === null || stored === undefined;
  const incomingEmpty = incoming === null || incoming === undefined;
  if (storedEmpty || incomingEmpty) return storedEmpty && incomingEmpty;
  return stored === incoming;
}

/** The fields of `desired` whose values differ from the stored event. */
function changedFields(stored: object, desired: Record<string, unknown>): Record<string, unknown> {
  const current = stored as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    // Absent means "not known this run" (e.g. a failed QuakeML lookup): keep what is stored.
    if (value === undefined) continue;
    if (!sameStoredValue(current[key], value)) patch[key] = value;
  }
  return patch;
}

/**
 * FDSN text columns that have no dedicated MergedEvent column, kept as provenance in
 * `source_events` instead of being parsed and thrown away. `magnitudeType` records
 * GeoNet's raw MagType verbatim: for most of the NZ catalogue this is the bare letter
 * `M`, GeoNet's own SeisComP summary magnitude, which is not a QuakeML magnitude type
 * and is therefore not recognised by lib/merge.ts's magnitude classifier. `eventType`
 * is GeoNet's own classification, which merged rows carry through source_events.
 */
function geonetProvenance(event: GeoNetEventText): Record<string, string> {
  const provenance: Record<string, string> = {};
  const add = (key: string, value: string | undefined | null) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) provenance[key] = trimmed;
  };
  add('author', event.Author);
  add('catalog', event.Catalog);
  add('contributor', event.Contributor);
  add('contributorId', event.ContributorID);
  add('magnitudeType', event.MagType);
  add('magnitudeAuthor', event.MagAuthor);
  add('locationName', event.EventLocationName);
  add('eventType', event.EventType);
  return provenance;
}

/** Trim a text column to a stored value, or null when GeoNet left it blank. */
function textColumn(value: string | undefined | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
}

/**
 * The target catalogue cannot receive this import: it does not exist (404), was not
 * created by the GeoNet importer (400), or another import into it is running (409).
 * Thrown before anything is fetched or written.
 */
export class GeoNetImportTargetError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = 'GeoNetImportTargetError';
  }
}

/**
 * Import configuration options
 */
export interface ImportOptions {
  // Time range
  startDate?: Date;
  endDate?: Date;
  hours?: number;  // Fetch last N hours (alternative to date range)

  // Filters
  minMagnitude?: number;
  maxMagnitude?: number;
  minDepth?: number;
  maxDepth?: number;

  // Geographic bounds
  minLatitude?: number;
  maxLatitude?: number;
  minLongitude?: number;
  maxLongitude?: number;

  // Behavior
  updateExisting?: boolean;  // Update existing events if data has changed
  catalogueId?: string;      // Existing GeoNet import catalogue to add to (a new one is created if not provided)
  catalogueName?: string;    // Name for a new catalogue (default: "GeoNet - Automated Import")
  userId?: string;           // User ID for tracking who created the catalogue
}

/**
 * Import result statistics
 *
 * Every row GeoNet returned lands in exactly one bucket, so
 * totalFetched = newEvents + updatedEvents + skippedEvents + collidedEvents
 *              + invalidEvents + excludedEvents + failedEvents.
 */
export interface ImportResult {
  success: boolean;
  catalogueId: string;
  catalogueName: string;
  /** Data rows GeoNet returned, usable or not. */
  totalFetched: number;
  newEvents: number;
  /** Stored events rewritten because GeoNet's data for them changed. */
  updatedEvents: number;
  /** Events already in the catalogue left as stored: not asked to update, or unchanged. */
  skippedEvents: number;
  /**
   * Rows submitted for insert that the database did not write because their GeoNet
   * EventID was repeated in the fetch or stored meanwhile by a concurrent import.
   */
  collidedEvents: number;
  /** Rows GeoNet returned unusable, or that fail validation. */
  invalidEvents: number;
  /** Rows GeoNet flags as duplicate, not existing or not locatable; not imported. */
  excludedEvents: number;
  /** excludedEvents by GeoNet event type. */
  excludedEventTypes: Record<string, number>;
  /** Rows not written because a database write failed. */
  failedEvents: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
  duration: number;  // milliseconds
}

/**
 * Import history record
 */
export interface ImportHistory {
  id: string;
  catalogue_id: string;
  start_time: string;
  end_time: string;
  total_fetched: number;
  new_events: number;
  updated_events: number;
  skipped_events: number;
  // Why fetched rows were not stored (#109); absent on records written before them.
  collided_events?: number;
  invalid_events?: number;
  excluded_events?: number;
  failed_events?: number;
  excluded_event_types?: Record<string, number>;
  errors: string | null;  // JSON array
  created_at: string;
}

/** Row counts of one run; each fetched row is counted in exactly one of them. */
interface ImportCounts {
  newEvents: number;
  updatedEvents: number;
  skippedEvents: number;
  collidedEvents: number;
  invalidEvents: number;
  excludedEvents: number;
  failedEvents: number;
}

const zeroCounts = (): ImportCounts => ({
  newEvents: 0,
  updatedEvents: 0,
  skippedEvents: 0,
  collidedEvents: 0,
  invalidEvents: 0,
  excludedEvents: 0,
  failedEvents: 0,
});

/** A stored-row shape for a GeoNet event (MergedEvent plus the C8/C16 columns). */
type GeoNetEventRow = Partial<MergedEvent> & {
  id: string;
  catalogue_id: string;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  source_events: string;
  source_id: string;
  source_event_type?: string | null;
  confidence_level?: number | null;
};

/**
 * GeoNet Import Service
 */
export class GeoNetImportService {
  private static readonly DEFAULT_CATALOGUE_NAME = 'GeoNet - Automated Import';
  private static readonly DEFAULT_CATALOGUE_DESCRIPTION = 'Automatically imported earthquake events from GeoNet FDSN Event Web Service';
  private static readonly FOCAL_MECHANISM_MIN_MAGNITUDE = 5.0; // Only fetch focal mechanisms for M5.0+
  private static readonly FOCAL_MECHANISM_CONCURRENCY = 5; // Max concurrent focal mechanism requests
  private static readonly UPDATE_CONCURRENCY = 10; // Max concurrent stored-event reads/updates
  // MongoDB's maximum BSON document size is 16 MiB and that limit applies to the
  // COMMAND document, so neither the insertMany payload nor the `$in` array used for
  // duplicate detection may hold a whole broad import (chunked fetching removed the
  // 10,000-event ceiling upstream, so a 1960-2026 NZ import returns >1e6 events).
  // Both DB steps are therefore issued in fixed-size slices.
  private static readonly BULK_INSERT_BATCH_SIZE = 1000; // Events per insertMany call
  private static readonly SOURCE_ID_LOOKUP_BATCH_SIZE = 5000; // source_ids per $in query

  /** Catalogues with an import running in this process (see importEvents). */
  private static readonly activeImports = new Set<string>();

  /**
   * Import events from GeoNet
   *
   * @throws GeoNetImportTargetError when options.catalogueId names a catalogue that
   *   cannot receive the import; nothing is fetched or written in that case.
   */
  async importEvents(options: ImportOptions = {}): Promise<ImportResult> {
    const targetId = options.catalogueId;
    if (targetId) {
      // A second run into a catalogue this process is already importing into is
      // refused up front (a double submission would only repeat the work). Runs in
      // different server processes stay correct without this: each claims the
      // catalogue's status with its own run token and extends the bounds atomically
      // (lib/db.ts updateCatalogueStatus / updateCatalogueGeoBounds).
      if (GeoNetImportService.activeImports.has(targetId)) {
        throw new GeoNetImportTargetError(
          `A GeoNet import into catalogue ${targetId} is already running. Try again when it has finished.`,
          409
        );
      }
      GeoNetImportService.activeImports.add(targetId);
    }
    try {
      const target = targetId ? await this.resolveTargetCatalogue(targetId) : null;
      return await this.runImport(options, target);
    } finally {
      if (targetId) GeoNetImportService.activeImports.delete(targetId);
    }
  }

  /**
   * The existing catalogue an import was asked to add to. An unknown id used to fall
   * through to creating a brand-new catalogue, so a request for "add to X" quietly
   * produced another copy instead.
   */
  private async resolveTargetCatalogue(catalogueId: string): Promise<MergedCatalogue> {
    const catalogue = await getDbQueries().getCatalogueById(catalogueId);
    if (!catalogue) {
      throw new GeoNetImportTargetError(`Catalogue ${catalogueId} was not found.`, 404);
    }
    if (!isGeoNetImportCatalogue(catalogue)) {
      throw new GeoNetImportTargetError(
        `Catalogue "${catalogue.name}" was not created by the GeoNet importer, so GeoNet events cannot be added to it. ` +
        'Choose a GeoNet import catalogue or create a new one.',
        400
      );
    }
    return catalogue;
  }

  private async runImport(options: ImportOptions, target: MergedCatalogue | null): Promise<ImportResult> {
    const startTime = new Date();
    // Two classes of problem, kept apart because they mean different things about
    // the CATALOGUE:
    // * `errors` — the STORED catalogue is not the import it claims to be: a window
    // GeoNet truncated at its result-set cap (events silently missing) or a bulk
    // insert that never reached the collection. Only these mark the catalogue `error`.
    // * `eventIssues` — per-event problems: a record that fails validation and is
    // skipped. They are reported, and they make `success` false, but the catalogue
    // itself is still what it claims to be.
    const errors: string[] = [];
    const eventIssues: string[] = [];
    // Rows GeoNet returned that its text parser could not use.
    const fetchDiagnostics = { unusableRows: 0 };
    const catalogueName = target?.name || options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME;
    // Tracked outside the try so a failure after the catalogue exists can mark it
    // `error` rather than leaving it advertising a `complete` import.
    let activeCatalogueId: string | undefined = target?.id;
    let catalogueTouched = false;
    // Tracked outside the try for the same reason: a failure AFTER the writes (e.g. the
    // import-history insert) must report what was committed, not zeros.
    let fetchedCount = 0;
    let committed: ImportCounts = zeroCounts();
    let excludedEventTypes: Record<string, number> = {};
    // Claims the catalogue's status for this run: another run into the same catalogue,
    // even in another server process, then cannot overwrite this run's outcome (and a
    // failure of either is never lost). See lib/db.ts updateCatalogueStatus.
    const runId = createId();

    console.log('[GeoNetImportService] Starting import with options:', options);

    try {
      // 1. Fetch events from GeoNet API. A window that GeoNet truncates at its
      // result-set cap is recorded in `errors`, so `success` below reports it.
      const events = await this.fetchEvents(options, errors, eventIssues, fetchDiagnostics);
      fetchedCount = events.length + fetchDiagnostics.unusableRows;
      committed = { ...zeroCounts(), invalidEvents: fetchDiagnostics.unusableRows };
      console.log(`[GeoNetImportService] Fetched ${events.length} events from GeoNet`);

      if (events.length === 0) {
        // Rows GeoNet returned but that could not be used are reported here too, as
        // on every other path: dropping them made a failed window look like a clean,
        // empty one.
        const reportedIssues = [...errors, ...eventIssues];
        const endTime = new Date();
        if (target) {
          // A run into an existing catalogue is recorded even when it brought nothing.
          await this.saveImportHistory({
            catalogueId: target.id,
            startTime,
            endTime,
            totalFetched: fetchedCount,
            newEvents: 0,
            updatedEvents: 0,
            skippedEvents: 0,
            errors: reportedIssues,
            counts: committed,
            excludedEventTypes,
          });
        }
        return {
          success: reportedIssues.length === 0,
          catalogueId: target?.id || '',
          catalogueName,
          totalFetched: fetchedCount,
          ...committed,
          excludedEventTypes,
          errors: reportedIssues,
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
        };
      }

      // 2. Get or create catalogue
      const catalogueId = await this.getOrCreateCatalogue(target, catalogueName, options.userId);
      activeCatalogueId = catalogueId;
      catalogueTouched = true;
      console.log(`[GeoNetImportService] Using catalogue: ${catalogueId}`);

      // Mark the target catalogue in-progress for the duration of the run; the final
      // status is derived from `errors` below (matches the upload path in
      // app/api/catalogues/route.ts, which is the only other writer of this field).
      await this.setCatalogueStatus(catalogueId, 'processing', runId);

      // 3. Process events with bulk insert optimization
      const result = await this.processEventsBulk(events, catalogueId, options.updateExisting || false);
      committed = { ...result.counts, invalidEvents: result.counts.invalidEvents + fetchDiagnostics.unusableRows };
      excludedEventTypes = result.excludedEventTypes;
      errors.push(...result.errors);
      eventIssues.push(...result.eventIssues);
      const { newEvents, updatedEvents, skippedEvents } = committed;

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // 4. Update geographic bounds and event count for the catalogue
      // Performance fix: Calculate bounds from imported events only, merge with existing
      try {
        if (newEvents > 0 || updatedEvents > 0) {
          // Calculate bounds from imported events only (memory efficient)
          // Bounds from the rows that were actually stored. Computing them from the raw
          // fetch let a rejected invalid-timestamp event at [80, 0] stretch a one-event
          // NZ catalogue's extent to latitude [-41, 80] and longitude [0, 174].
          const importedEventsBounds = this.calculateBoundsFromGeoNetEvents(result.persisted);

          if (importedEventsBounds) {
            // Extend the stored bounds in the database, atomically and antimeridian-aware
            // (plain Math.min/Math.max on longitude would destroy the west>east crossing
            // convention). Reading, merging and writing back here let two imports into
            // one catalogue each write union(own, old), losing the other's extension.
            await getDbQueries().updateCatalogueGeoBounds(
              catalogueId,
              importedEventsBounds.minLatitude,
              importedEventsBounds.maxLatitude,
              importedEventsBounds.minLongitude,
              importedEventsBounds.maxLongitude,
              undefined,
              { merge: true }
            );
            console.log(`[GeoNetImportService] Updated geographic bounds for catalogue ${catalogueId}`);
          }
        }

        // Recount from the DB rather than a running tally, which drifts under
        // concurrent imports or partial-insert failures. Deliberately OUTSIDE the
        // `newEvents > 0` guard: a run whose inserts all failed must still write the
        // true count instead of leaving a stale one on a catalogue it just touched.
        const actualCount = await getDbQueries().countEventsByCatalogue(catalogueId);
        await getDbQueries().updateCatalogueEventCount(catalogueId, actualCount);
        console.log(`[GeoNetImportService] Updated event count for catalogue ${catalogueId}: ${actualCount} (+${newEvents} this run)`);
      } catch (error) {
        console.error(`[GeoNetImportService] Failed to update catalogue metadata:`, error);
        // Don't fail the import if metadata update fails
      }

      // Everything the caller and the import history are told about, in one list.
      const reportedIssues = [...errors, ...eventIssues];

      // 5. Save import history
      await this.saveImportHistory({
        catalogueId,
        startTime,
        endTime,
        totalFetched: fetchedCount,
        newEvents,
        updatedEvents,
        skippedEvents,
        errors: reportedIssues,
        counts: committed,
        excludedEventTypes,
      });

      // 6. Final catalogue status. `error` only for the problems that make the stored
      // catalogue wrong — a window GeoNet truncated, or a bulk insert that failed.
      // Events skipped for invalid data are a property of the SOURCE data, not of the
      // catalogue: condemning the whole catalogue for one bad record in 100,000 hid
      // otherwise successful imports behind a broken-looking status.
      await this.setCatalogueStatus(catalogueId, errors.length === 0 ? 'complete' : 'error', runId);

      console.log(
        `[GeoNetImportService] Import complete: ${newEvents} new, ${updatedEvents} updated, ${skippedEvents} unchanged, ` +
        `${committed.collidedEvents} collided, ${committed.invalidEvents} invalid, ${committed.excludedEvents} excluded, ` +
        `${committed.failedEvents} failed, ${errors.length} errors`
      );

      return {
        // `success` still reports anything the RUN could not do, skipped records
        // included, so a partial import is never announced as a clean one. Only the
        // catalogue status above distinguishes the two classes.
        success: reportedIssues.length === 0,
        catalogueId,
        catalogueName,
        totalFetched: fetchedCount,
        ...committed,
        excludedEventTypes,
        errors: reportedIssues,
        startTime,
        endTime,
        duration,
      };
    } catch (error) {
      const errorMsg = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[GeoNetImportService] ${errorMsg}`);
      errors.push(errorMsg);

      if (activeCatalogueId && catalogueTouched) {
        await this.setCatalogueStatus(activeCatalogueId, 'error', runId);
      }

      return {
        success: false,
        catalogueId: activeCatalogueId || '',
        catalogueName,
        totalFetched: fetchedCount,
        ...committed,
        excludedEventTypes,
        errors: [...errors, ...eventIssues],
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
      };
    }
  }

  /**
   * Set the catalogue's status, never failing the import because of it.
   */
  private async setCatalogueStatus(
    catalogueId: string,
    status: 'processing' | 'complete' | 'error',
    runId?: string
  ): Promise<void> {
    try {
      await getDbQueries().updateCatalogueStatus(status, catalogueId, undefined, runId ? { runId } : undefined);
    } catch (error) {
      console.error(`[GeoNetImportService] Failed to set catalogue ${catalogueId} status to '${status}':`, error);
    }
  }

  /**
   * Fetch events from GeoNet API
   *
   * @param errors - collects window-level problems (e.g. a window GeoNet truncated at
   *   its result-set cap) so the caller can report the import as unsuccessful.
   * @param diagnostics - counts the rows GeoNet returned that could not be parsed.
   */
  private async fetchEvents(
    options: ImportOptions,
    errors: string[],
    eventIssues: string[] = [],
    diagnostics: { unusableRows: number } = { unusableRows: 0 }
  ): Promise<GeoNetEventText[]> {
    // Determine time range
    let startDate: Date;
    let endDate: Date;

    if (options.hours) {
      endDate = new Date();
      startDate = new Date(endDate.getTime() - options.hours * 60 * 60 * 1000);
    } else if (options.startDate) {
      // A start with no end means "since then". It used to fall through to the
      // 24-hour default and quietly import a different window.
      startDate = options.startDate;
      endDate = options.endDate ?? new Date();
    } else if (options.endDate) {
      throw new Error('An import window with an end date needs a start date as well');
    } else {
      // Default: last 24 hours
      endDate = new Date();
      startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }

    // Non-time query parameters (the time window is supplied per chunk below).
    const baseParams = {
      minmagnitude: options.minMagnitude,
      maxmagnitude: options.maxMagnitude,
      mindepth: options.minDepth,
      maxdepth: options.maxDepth,
      minlatitude: options.minLatitude,
      maxlatitude: options.maxLatitude,
      minlongitude: options.minLongitude,
      maxlongitude: options.maxLongitude,
      orderby: 'time' as const,
    };

    // GeoNet's FDSN event service caps a result set at 10,000 events and returns
    // HTTP 413 for any query that would exceed it, so broad imports must be split
    // into smaller time windows (NZ produces well over 10k located events/year).
    const runChunked = (params: typeof baseParams) =>
      fetchTimeWindowChunked(
        async (starttime, endtime) => {
          const events = await geonetClient.fetchEventsText({ ...params, starttime, endtime });
          const skippedRows = typeof geonetClient.getLastFetchDiagnostics === 'function'
            ? geonetClient.getLastFetchDiagnostics().skippedRows
            : 0;
          // A row GeoNet could not express is a property of the SOURCE record, like a
          // row that fails validation: reported, but not a reason to mark the whole
          // catalogue `error`.
          if (skippedRows > 0) {
            diagnostics.unusableRows += skippedRows;
            eventIssues.push(
              `GeoNet returned ${skippedRows} unusable row(s) for ${starttime}..${endtime}; those events were not imported.`
            );
          }
          return events;
        },
        (ev) => ev.EventID,
        startDate,
        endDate,
        {
          onSplit: (s, e) =>
            console.warn(
              `[GeoNetImport] 10k-event cap hit for ${s.toISOString()}..${e.toISOString()}; subdividing time window.`
            ),
          // A window still at the cap that cannot be subdivided any further is a
          // TRUNCATED window: the events beyond the cap are simply not returned. That
          // must reach ImportResult.errors, otherwise a short import reports success.
          onTruncate: (s, e, count) =>
            errors.push(
              `GeoNet returned its result-set cap (${count} events) for ${s.toISOString()}..${e.toISOString()} ` +
              `and the window could not be subdivided further; this window is truncated and the import is incomplete.`
            ),
        }
      );

    // FDSN requires minlongitude <= maxlongitude. An antimeridian-crossing bbox
    // (minLon > maxLon, RFC 7946 5.2) must be issued as two queries and merged,
    // otherwise GeoNet returns nothing for NZ offshore (Kermadec) regions.
    const minLon = baseParams.minlongitude;
    const maxLon = baseParams.maxlongitude;
    if (minLon != null && maxLon != null && minLon > maxLon) {
      const [west, east] = await Promise.all([
        runChunked({ ...baseParams, minlongitude: minLon, maxlongitude: 180 }),
        runChunked({ ...baseParams, minlongitude: -180, maxlongitude: maxLon }),
      ]);
      const seen = new Set<string>();
      const merged: GeoNetEventText[] = [];
      for (const ev of [...west, ...east]) {
        if (ev.EventID) {
          if (seen.has(ev.EventID)) continue;
          seen.add(ev.EventID);
        }
        merged.push(ev);
      }
      return merged;
    }
    return runChunked(baseParams);
  }

  /**
   * Calculate geographic bounds from GeoNet events (memory efficient)
   * This avoids loading all events from database just to calculate bounds
   */
  private calculateBoundsFromGeoNetEvents(events: Array<Pick<GeoNetEventText, 'Latitude' | 'Longitude'>>): {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  } | null {
    if (events.length === 0) {
      return null;
    }

    // Antimeridian-aware (NZ Kermadec events straddle 180): a tight crossing box
    // uses minLongitude > maxLongitude rather than a globe-spanning naive min/max.
    return boundsFromLatLon(events.map((e) => ({ lat: e.Latitude, lon: e.Longitude })));
  }

  /**
   * The resolved target catalogue, or a new catalogue.
   */
  private async getOrCreateCatalogue(target: MergedCatalogue | null, catalogueName?: string, userId?: string): Promise<string> {
    if (target) {
      return target.id;
    }

    // Create new catalogue
    const newId = createId();
    const name = catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME;

    await getDbQueries().insertCatalogue(
      newId,
      name,
      JSON.stringify([{ source: 'GeoNet', description: GeoNetImportService.DEFAULT_CATALOGUE_DESCRIPTION }]),
      // isGeoNetImportCatalogue recognises the importer's catalogues by this stamp.
      JSON.stringify({ source: 'GeoNet', importDate: new Date().toISOString() }),
      0,  // Initial event count
      // Created before a single event is processed, so it starts as 'processing';
      // importEvents() sets the final 'complete'/'error' once the run is over.
      'processing',
      undefined,
      undefined,
      // The creator is taken only from this trusted argument (the session user the
      // route passes), never from metadata.
      { createdBy: userId ?? null }
    );

    console.log(`[GeoNetImportService] Created new catalogue: ${name} (${newId})`);
    return newId;
  }

  /**
   * Process a single event (insert or update)
   * Returns: 'new', 'updated', 'skipped' or 'excluded'
   *
   * @deprecated This method is kept for backward compatibility but is not used in the optimized flow.
   * Use processEventsBulk() for better performance.
   */
  private async processEvent(
    event: GeoNetEventText,
    catalogueId: string,
    updateExisting: boolean
  ): Promise<'new' | 'updated' | 'skipped' | 'excluded'> {
    // Check if event already exists
    const existingEvent = await getDbQueries().getEventBySourceId(catalogueId, event.EventID);

    if (existingEvent) {
      if (!updateExisting) return 'skipped';
      // Counted as updated only when GeoNet's data actually differs.
      return (await this.updateEvent(existingEvent, event)) ? 'updated' : 'skipped';
    }
    if (excludedEventType(event.EventType)) return 'excluded';
    // Insert new event
    await this.insertEvent(event, catalogueId);
    return 'new';
  }

  /**
   * Performance Optimization: Process events in bulk with parallel focal mechanism fetching
   *
   * This method provides 10-20x performance improvement over sequential processing by:
   * 1. Fetching focal mechanisms in parallel (max 5 concurrent requests)
   * 2. Using bulk database inserts instead of individual inserts
   * 3. Batching update operations
   */
  private async processEventsBulk(
    events: GeoNetEventText[],
    catalogueId: string,
    updateExisting: boolean
  ): Promise<{
    /** Where each row went; see ImportResult (unusable rows are added by the caller). */
    counts: ImportCounts;
    excludedEventTypes: Record<string, number>;
    /** Failures that leave the catalogue incomplete (a batch that never got written). */
    errors: string[];
    /** Per-event skips: bad source records, not a broken catalogue (see importEvents). */
    eventIssues: string[];
    /** Coordinates of rows actually inserted or updated; rejected rows cannot shape bounds. */
    persisted: Array<Pick<GeoNetEventText, 'Latitude' | 'Longitude'>>;
  }> {
    const errors: string[] = [];
    const eventIssues: string[] = [];
    const persisted: Array<Pick<GeoNetEventText, 'Latitude' | 'Longitude'>> = [];
    const counts = zeroCounts();
    const excludedEventTypes: Record<string, number> = {};

    // Step 1: Check which events already exist (bulk query - fixes N+1 problem)
    console.log(`[GeoNetImportService] Checking for existing events...`);
    const eventIds = events.map(e => e.EventID);

    // Use bulk queries instead of sequential queries for much better performance.
    // The ids go into a MongoDB `$in`, which lives inside the command document and is
    // therefore bound by the 16 MiB BSON limit, so query in slices and merge.
    const existingEventsMap = new Map<string, string>();
    for (let i = 0; i < eventIds.length; i += GeoNetImportService.SOURCE_ID_LOOKUP_BATCH_SIZE) {
      const idSlice = eventIds.slice(i, i + GeoNetImportService.SOURCE_ID_LOOKUP_BATCH_SIZE);
      const found = await getDbQueries().getEventsBySourceIds(catalogueId, idSlice);
      // forEach rather than for..of: the repo's tsconfig target predates
      // downlevelIteration, so a Map cannot be spread or iterated directly.
      found.forEach((dbId, sourceId) => existingEventsMap.set(sourceId, dbId));
    }

    // Step 2: Separate new events from existing ones
    const newEventsList: GeoNetEventText[] = [];
    const updateCandidates: Array<{ dbId: string; event: GeoNetEventText }> = [];

    for (const event of events) {
      const existingDbId = existingEventsMap.get(event.EventID);
      if (existingDbId) {
        // A stored event GeoNet has since re-typed (e.g. to 'duplicate') is still
        // updated, so the flag reaches the stored row instead of leaving it an earthquake.
        if (updateExisting) {
          updateCandidates.push({ dbId: existingDbId, event });
        } else {
          counts.skippedEvents++;
        }
        continue;
      }
      const excluded = excludedEventType(event.EventType);
      if (excluded) {
        counts.excludedEvents++;
        excludedEventTypes[excluded] = (excludedEventTypes[excluded] ?? 0) + 1;
        continue;
      }
      newEventsList.push(event);
    }

    console.log(
      `[GeoNetImportService] Found ${newEventsList.length} new, ${updateCandidates.length} to check for updates, ` +
      `${counts.skippedEvents} to skip, ${counts.excludedEvents} excluded by GeoNet event type`
    );

    // Step 3: Fetch QuakeML enrichment in parallel for significant events. Origin
    // quality comes from the SAME response as the focal mechanisms, so populating it
    // costs no extra requests. Without it every GeoNet event reaches the quality
    // scorers with all inputs null.
    const limit = pLimit(GeoNetImportService.FOCAL_MECHANISM_CONCURRENCY);
    const enrichmentMap = new Map<string, GeoNetEnrichment>();

    const significantEvents = [...newEventsList, ...updateCandidates.map(u => u.event)]
      .filter(e => e.Magnitude >= GeoNetImportService.FOCAL_MECHANISM_MIN_MAGNITUDE);

    if (significantEvents.length > 0) {
      console.log(`[GeoNetImportService] Fetching focal mechanisms for ${significantEvents.length} significant events (M${GeoNetImportService.FOCAL_MECHANISM_MIN_MAGNITUDE}+) with ${GeoNetImportService.FOCAL_MECHANISM_CONCURRENCY} concurrent requests...`);

      const enrichmentPromises = significantEvents.map(event =>
        limit(async () => {
          try {
            const enrichment = await this.fetchEnrichment(event.EventID);
            if (enrichment) {
              enrichmentMap.set(event.EventID, enrichment);
              if (enrichment.focal) {
                console.log(`[GeoNetImportService] ✓ Focal mechanism for ${event.EventID} (M${event.Magnitude})`);
              }
            }
          } catch (error) {
            console.error(`[GeoNetImportService] Failed to fetch focal mechanism for ${event.EventID}:`, error);
            // Continue processing even if focal mechanism fetch fails
          }
        })
      );

      await Promise.all(enrichmentPromises);
      console.log(`[GeoNetImportService] Fetched QuakeML enrichment for ${enrichmentMap.size} events`);
    }

    // Step 4: Bulk insert new events
    // Validate events before insertion
    const validEvents: GeoNetEventText[] = [];
    for (const event of newEventsList) {
      if (!this.validateEvent(event)) {
        console.warn(`[GeoNetImportService] Skipping invalid event ${event.EventID}: missing or invalid required fields`);
        eventIssues.push(`Skipped event ${event.EventID}: invalid data`);
        counts.invalidEvents++;
        continue;
      }
      validEvents.push(event);
    }

    // insertMany sends one command document, so the batch must stay well under
    // MongoDB's 16 MiB BSON limit; a broad chunked import can return >1e6 events.
    // Mapping per batch also keeps only one batch of converted documents alive.
    for (let i = 0; i < validEvents.length; i += GeoNetImportService.BULK_INSERT_BATCH_SIZE) {
      const eventsToInsert: GeoNetEventRow[] = [];
      const batchSources: GeoNetEventText[] = [];
      for (const event of validEvents.slice(i, i + GeoNetImportService.BULK_INSERT_BATCH_SIZE)) {
        const doc = this.convertToMergedEvent(event, catalogueId, enrichmentMap.get(event.EventID));
        // Apply the DB's own validator per document. validateEvent above checks only
        // the summary fields; a row failing a DB range check (e.g. depth > 1000 km)
        // used to reject its whole batch inside bulkInsertEvents, and the catch below
        // then abandoned every later batch - one bad row lost thousands of good ones.
        try {
          validateMergedEvent(doc);
        } catch (validationError) {
          const reason = validationError instanceof Error ? validationError.message : String(validationError);
          console.warn(`[GeoNetImportService] Skipping event ${event.EventID}: ${reason}`);
          eventIssues.push(`Skipped event ${event.EventID}: ${reason}`);
          counts.invalidEvents++;
          continue;
        }
        eventsToInsert.push(doc);
        batchSources.push(event);
      }
      if (eventsToInsert.length === 0) continue;
      // Count what MongoDB actually wrote, not what was submitted: bulkInsertEvents
      // drops in-batch source_id duplicates and lets the (catalogue_id, source_id)
      // unique index skip rows already stored, so the submitted length overstates
      // ImportResult.newEvents — the "+N this run" figure — by every de-duplicated
      // event. (The stored event_count is unaffected; it comes from a DB recount.)
      const recoverStoredCoordinates = async () => {
        const stored = await getDbQueries().getEventCoordinatesByIds(
          catalogueId, eventsToInsert.map(event => event.id)
        );
        for (const event of stored) {
          persisted.push({ Latitude: event.latitude, Longitude: event.longitude });
        }
        return stored.length;
      };
      let insertedCount: number;
      try {
        insertedCount = await getDbQueries().bulkInsertEvents(eventsToInsert);
      } catch (error) {
        // An unordered write may have committed rows before a later error.
        // Recover this batch's writes without counting another import's rows.
        let recovered = 0;
        try {
          recovered = await recoverStoredCoordinates();
        } catch (recoveryError) {
          console.error('[GeoNetImportService] Could not recover partial batch writes:', recoveryError);
        }
        counts.newEvents += recovered;
        // The rest of this batch and every later batch never reached the collection.
        const notAttempted = validEvents.length - Math.min(i + GeoNetImportService.BULK_INSERT_BATCH_SIZE, validEvents.length);
        counts.failedEvents += eventsToInsert.length - recovered + notAttempted;
        const errorMsg = `Bulk insert failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[GeoNetImportService] ${errorMsg}`);
        errors.push(errorMsg);
        break;
      }
      counts.newEvents += insertedCount;
      // Submitted but not written: a repeated EventID or a unique-index collision.
      counts.collidedEvents += eventsToInsert.length - insertedCount;
      if (insertedCount === eventsToInsert.length) {
        // Normal full batches need no additional query.
        persisted.push(...batchSources);
      } else if (insertedCount > 0) {
        // The count alone cannot identify which duplicates were skipped.
        // Query generated IDs, not source IDs that may identify older versions.
        try {
          await recoverStoredCoordinates();
        } catch (recoveryError) {
          // The rows are stored; only their exact coordinates are unknown. The
          // submitted coordinates are the same events', so the bounds stay right.
          console.error('[GeoNetImportService] Could not read back the stored coordinates:', recoveryError);
          persisted.push(...batchSources);
        }
      }
    }
    if (counts.newEvents > 0) {
      console.log(`[GeoNetImportService] Bulk inserted ${counts.newEvents} new events`);
    }

    // Step 5: Update existing events whose GeoNet data has changed. Each stored row is
    // read and compared, so a re-import of unchanged events writes (and reports)
    // nothing; every existing event used to be rewritten and counted as "updated".
    const updateLimit = pLimit(GeoNetImportService.UPDATE_CONCURRENCY);
    await Promise.all(updateCandidates.map(({ dbId, event }) => updateLimit(async () => {
      if (!this.validateEvent(event)) {
        console.warn(`[GeoNetImportService] Skipping invalid event update ${event.EventID}: missing or invalid required fields`);
        eventIssues.push(`Skipped event update ${event.EventID}: invalid data`);
        counts.invalidEvents++;
        return;
      }
      const desired = this.convertToMergedEvent(event, catalogueId, enrichmentMap.get(event.EventID));
      try {
        // The same validator the insert path applies, so a range failure is a bad
        // source record here too, not a failed write that condemns the catalogue.
        validateMergedEvent(desired);
      } catch (validationError) {
        const reason = validationError instanceof Error ? validationError.message : String(validationError);
        eventIssues.push(`Skipped event update ${event.EventID}: ${reason}`);
        counts.invalidEvents++;
        return;
      }
      try {
        const stored = await getDbQueries().getEventBySourceId(catalogueId, event.EventID);
        if (!stored) {
          eventIssues.push(`Event ${event.EventID} was removed from the catalogue before it could be updated.`);
          counts.failedEvents++;
          return;
        }
        if (await this.writeChangedFields(dbId, stored, desired)) {
          counts.updatedEvents++;
          persisted.push(event);
        } else {
          counts.skippedEvents++;
        }
      } catch (error) {
        const errorMsg = `Failed to update event ${event.EventID}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[GeoNetImportService] ${errorMsg}`);
        errors.push(errorMsg);
        counts.failedEvents++;
      }
    })));

    return {
      counts,
      excludedEventTypes,
      errors,
      eventIssues,
      persisted,
    };
  }

  /**
   * Origin quality and focal mechanisms from the QuakeML GeoNet serves for one event,
   * or null when it has neither.
   */
  private async fetchEnrichment(eventId: string): Promise<GeoNetEnrichment | null> {
    const xml = await geonetClient.fetchEventQuakeMLText(eventId);
    if (!xml) return null;
    const quakeml = parseGeoNetQuakeMLEvent(xml);
    if (!quakeml) return null;
    const enrichment: GeoNetEnrichment = {
      focal: focalMechanismFields(quakeml),
      originQuality: originQualityFromQuakeML(quakeml),
    };
    return enrichment.focal || enrichment.originQuality ? enrichment : null;
  }

  /**
   * Write the fields of `desired` that differ from the stored event. Returns whether
   * anything was written. Enrichment fields absent from `desired` (not fetched, or the
   * lookup failed) are left as stored rather than erased.
   */
  private async writeChangedFields(dbId: string, stored: MergedEvent, desired: GeoNetEventRow): Promise<boolean> {
    // Identity is not GeoNet data: id and catalogue_id are the stored row's own.
    const { id: _id, catalogue_id: _catalogueId, ...fields } = desired;
    const patch = changedFields(stored, fields);
    if (Object.keys(patch).length === 0) return false;
    await getDbQueries().updateEvent(dbId, patch as Partial<MergedEvent>);
    return true;
  }

  /**
   * Validate that an event has all required fields with valid values
   */
  private validateEvent(event: GeoNetEventText): boolean {
    // Check required string fields
    if (!event.EventID || typeof event.EventID !== 'string' || event.EventID.trim() === '') {
      return false;
    }
    if (!event.Time || typeof event.Time !== 'string' || event.Time.trim() === '') {
      return false;
    }

    // Validate time is parseable by the same normalizer that stores it, so an event
    // whose time cannot be pinned to UTC is rejected rather than stored raw.
    if (normalizeGeoNetTime(event.Time) === null) {
      console.warn(`[GeoNetImportService] Invalid time for event ${event.EventID}: ${event.Time}`);
      return false;
    }

    // Check required numeric fields are valid numbers
    if (typeof event.Latitude !== 'number' || isNaN(event.Latitude)) {
      return false;
    }
    if (typeof event.Longitude !== 'number' || isNaN(event.Longitude)) {
      return false;
    }
    if (typeof event.Magnitude !== 'number' || isNaN(event.Magnitude)) {
      return false;
    }

    // Validate coordinate ranges
    if (event.Latitude < -90 || event.Latitude > 90) {
      console.warn(`[GeoNetImportService] Invalid latitude for event ${event.EventID}: ${event.Latitude}`);
      return false;
    }
    if (event.Longitude < -180 || event.Longitude > 180) {
      console.warn(`[GeoNetImportService] Invalid longitude for event ${event.EventID}: ${event.Longitude}`);
      return false;
    }

    return true;
  }

  /**
   * Convert GeoNet event to MergedEvent format. The one row builder for the bulk
   * insert, the single-event insert and the update, so no path can store a GeoNet
   * event differently from another.
   */
  private convertToMergedEvent(
    event: GeoNetEventText,
    catalogueId: string,
    enrichment?: GeoNetEnrichment | null
  ): GeoNetEventRow {
    return {
      id: createId(),
      catalogue_id: catalogueId,
      // The bare GeoNet EventID: duplicate detection matches on it.
      source_id: event.EventID,
      // GeoNet's own QuakeML identifier, so QuakeML export, event search and
      // cross-referencing with GeoNet/ObsPy see the GeoNet ID, not an internal one.
      event_public_id: geonetEventPublicId(event.EventID),
      // Offset-less FDSN time forced to UTC (see normalizeGeoNetTime).
      time: normalizeGeoNetTime(event.Time) ?? event.Time,
      latitude: event.Latitude,
      longitude: event.Longitude,
      depth: event['Depth/km'],
      magnitude: event.Magnitude,
      source_events: JSON.stringify([{
        source: 'GeoNet',
        eventId: event.EventID,
        ...geonetProvenance(event),
      }]),
      magnitude_type: event.MagType || null,
      event_type: geonetEventTypeToQuakeML(event.EventType),
      // GeoNet's own classification, verbatim (contract C8): event_type holds only
      // QuakeML types, so 'outside of network interest' there reads 'other event'.
      source_event_type: textColumn(event.EventType),
      author: textColumn(event.Author),
      location_name: textColumn(event.EventLocationName),
      ...(enrichment?.focal ?? {}),
      ...(enrichment?.originQuality ?? {}),
    };
  }

  /**
   * Fetch enrichment for a significant event on the single-event paths; a failed
   * lookup yields null and never fails the event.
   */
  private async enrichmentForSingleEvent(event: GeoNetEventText): Promise<GeoNetEnrichment | null> {
    if (event.Magnitude < GeoNetImportService.FOCAL_MECHANISM_MIN_MAGNITUDE) return null;
    try {
      console.log(`[GeoNetImportService] Fetching focal mechanism for event ${event.EventID} (M${event.Magnitude})`);
      return await this.fetchEnrichment(event.EventID);
    } catch (error) {
      console.error(`[GeoNetImportService] Failed to fetch focal mechanism for ${event.EventID}:`, error);
      return null;
    }
  }

  /**
   * Insert new event into database
   */
  private async insertEvent(event: GeoNetEventText, catalogueId: string): Promise<void> {
    const enrichment = await this.enrichmentForSingleEvent(event);
    await getDbQueries().insertEvent(this.convertToMergedEvent(event, catalogueId, enrichment));
  }

  /**
   * Update existing event with GeoNet's current data, writing only what changed.
   *
   * @param existing - The stored event
   * @param event - GeoNet event data
   * @param enrichment - Result of a batch enrichment attempt; undefined fetches it here
   * @returns whether anything was written
   */
  private async updateEvent(
    existing: MergedEvent,
    event: GeoNetEventText,
    enrichment?: GeoNetEnrichment | null
  ): Promise<boolean> {
    const resolved = enrichment === undefined ? await this.enrichmentForSingleEvent(event) : enrichment;
    return this.writeChangedFields(existing.id, existing, this.convertToMergedEvent(event, existing.catalogue_id, resolved));
  }

  /**
   * Save import history
   */
  private async saveImportHistory(data: {
    catalogueId: string;
    startTime: Date;
    endTime: Date;
    totalFetched: number;
    newEvents: number;
    updatedEvents: number;
    skippedEvents: number;
    errors: string[];
    /** Why fetched rows were not stored (#109), so the history adds up. */
    counts?: ImportCounts;
    excludedEventTypes?: Record<string, number>;
  }): Promise<void> {
    const historyId = createId();

    await getDbQueries().insertImportHistory(
      historyId,
      data.catalogueId,
      data.startTime.toISOString(),
      data.endTime.toISOString(),
      data.totalFetched,
      data.newEvents,
      data.updatedEvents,
      data.skippedEvents,
      data.errors.length > 0 ? JSON.stringify(data.errors) : null,
      data.counts
        ? {
            collided_events: data.counts.collidedEvents,
            invalid_events: data.counts.invalidEvents,
            excluded_events: data.counts.excludedEvents,
            failed_events: data.counts.failedEvents,
            excluded_event_types: data.excludedEventTypes ?? {},
          }
        : undefined
    );
  }

  /**
   * Get import history for a catalogue
   */
  async getImportHistory(catalogueId: string, limit: number = 10): Promise<ImportHistory[]> {
    return await getDbQueries().getImportHistory(catalogueId, limit);
  }

  /**
   * Get last import time for a catalogue
   */
  async getLastImportTime(catalogueId: string): Promise<Date | null> {
    const history = await this.getImportHistory(catalogueId, 1);
    if (history.length > 0) {
      return new Date(history[0].end_time);
    }
    return null;
  }
}

/**
 * Default import service instance
 */
export const geonetImportService = new GeoNetImportService();
