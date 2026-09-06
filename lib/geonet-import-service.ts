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
import { dbQueries, MergedEvent, normalizeEventType } from './db';
import { normalizeTimestamp } from './earthquake-utils';
import { createId } from './id';
import { extractBoundsFromMergedEvents, boundsFromLatLon, unionBounds } from './geo-bounds-utils';
import pLimit from 'p-limit';
import { Builder } from 'xml2js';

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

/** Non-negative finite value, else null (mirrors lib/db.ts validateMergedEvent ranges). */
function nonNegative(value: number | null): number | null {
  return value !== null && value >= 0 ? value : null;
}

/** xml2js with explicitArray:false yields either a node or an array of nodes. */
function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
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
>;

/**
 * Extract origin quality from the QuakeML the importer already fetches for M5.0+
 * events (no extra request). Previously only strike/dip/rake was kept and every other
 * field was discarded, so every GeoNet event reached the quality scorers with all
 * inputs null. Fail-safe: any shape it does not recognise yields null.
 */
function extractOriginQualityFromQuakeML(quakeML: any): GeoNetOriginQuality | null {
  try {
    // The client strips the `q:` prefix during parsing (tagNameProcessors).
    const eventParameters = quakeML?.quakeml?.eventParameters;
    const quakeMLEvent = asArray<any>(eventParameters?.event)[0];
    if (!quakeMLEvent) return null;

    const origins = asArray<any>(quakeMLEvent.origin);
    const preferredOriginId =
      typeof quakeMLEvent.preferredOriginID === 'string' ? quakeMLEvent.preferredOriginID : undefined;
    const origin =
      (preferredOriginId && origins.find((o) => o?.publicID === preferredOriginId)) || origins[0];
    if (!origin) return null;

    const quality = origin.quality ?? {};
    const originUncertainty = asArray<any>(origin.originUncertainty)[0] ?? {};

    // Metres -> km for the two QuakeML length quantities.
    const metresToKm = (v: number | null) => (v === null ? null : v / 1000);

    const azimuthalGap = quakeMLNumber(quality.azimuthalGap);
    const fields: GeoNetOriginQuality = {
      azimuthal_gap: azimuthalGap !== null && azimuthalGap >= 0 && azimuthalGap <= 360 ? azimuthalGap : null,
      used_phase_count: nonNegative(quakeMLNumber(quality.usedPhaseCount)),
      used_station_count: nonNegative(quakeMLNumber(quality.usedStationCount)),
      standard_error: nonNegative(quakeMLNumber(quality.standardError)),
      minimum_distance: nonNegative(quakeMLNumber(quality.minimumDistance)),
      horizontal_uncertainty: nonNegative(metresToKm(quakeMLNumber(originUncertainty.horizontalUncertainty))),
      depth_uncertainty: nonNegative(metresToKm(quakeMLNumber(origin.depth?.uncertainty))),
    };

    return Object.values(fields).some((v) => v !== null) ? fields : null;
  } catch (error) {
    console.error('[extractOriginQualityFromQuakeML] Error:', error);
    return null;
  }
}

/**
 * FDSN text columns that have no dedicated MergedEvent column, kept as provenance in
 * `source_events` instead of being parsed and thrown away. `magnitudeType` records
 * GeoNet's raw MagType verbatim: for most of the NZ catalogue this is the bare letter
 * `M`, GeoNet's own SeisComP summary magnitude, which is not a QuakeML magnitude type
 * and is therefore not recognised by lib/merge.ts's magnitude classifier.
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
  return provenance;
}

/** Trim a text column to a stored value, or null when GeoNet left it blank. */
function textColumn(value: string | undefined | null): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
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
  catalogueId?: string;      // Target catalogue ID (auto-created if not provided)
  catalogueName?: string;    // Catalogue name (default: "GeoNet - Automated Import")
  userId?: string;           // User ID for tracking who created the catalogue
}

/**
 * Import result statistics
 */
export interface ImportResult {
  success: boolean;
  catalogueId: string;
  catalogueName: string;
  totalFetched: number;
  newEvents: number;
  updatedEvents: number;
  skippedEvents: number;
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
  errors: string | null;  // JSON array
  created_at: string;
}

/**
 * Extract focal mechanism from QuakeML XML
 */
function extractFocalMechanismFromXML(xml: string): any | null {
  try {
    // Look for focalMechanism elements
    const focalMechRegex = /<focalMechanism[^>]*>([\s\S]*?)<\/focalMechanism>/g;
    const focalMechMatches = Array.from(xml.matchAll(focalMechRegex));

    for (let i = 0; i < focalMechMatches.length; i++) {
      const match = focalMechMatches[i];
      const fmXML = match[1];

      // Extract nodalPlanes
      const nodalPlanesRegex = /<nodalPlanes>([\s\S]*?)<\/nodalPlanes>/;
      const nodalPlanesMatch = fmXML.match(nodalPlanesRegex);

      if (nodalPlanesMatch) {
        const nodalPlanesXML = nodalPlanesMatch[1];

        // Extract nodalPlane1
        const np1Regex = /<nodalPlane1>([\s\S]*?)<\/nodalPlane1>/;
        const np1Match = nodalPlanesXML.match(np1Regex);

        // Extract nodalPlane2
        const np2Regex = /<nodalPlane2>([\s\S]*?)<\/nodalPlane2>/;
        const np2Match = nodalPlanesXML.match(np2Regex);

        const extractPlane = (planeXML: string) => {
          const strikeMatch = planeXML.match(/<strike>[\s\S]*?<value>([^<]+)<\/value>[\s\S]*?<\/strike>/);
          const dipMatch = planeXML.match(/<dip>[\s\S]*?<value>([^<]+)<\/value>[\s\S]*?<\/dip>/);
          const rakeMatch = planeXML.match(/<rake>[\s\S]*?<value>([^<]+)<\/value>[\s\S]*?<\/rake>/);

          if (strikeMatch && dipMatch && rakeMatch) {
            return {
              strike: parseFloat(strikeMatch[1]),
              dip: parseFloat(dipMatch[1]),
              rake: parseFloat(rakeMatch[1])
            };
          }
          return null;
        };

        const nodalPlane1 = np1Match ? extractPlane(np1Match[1]) : null;
        const nodalPlane2 = np2Match ? extractPlane(np2Match[1]) : null;

        if (nodalPlane1) {
          const focalMechanism: any = { nodalPlane1 };
          if (nodalPlane2) {
            focalMechanism.nodalPlane2 = nodalPlane2;
          }
          return focalMechanism;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[extractFocalMechanismFromXML] Error:', error);
    return null;
  }
}

/**
 * GeoNet Import Service
 */
export class GeoNetImportService {
  private static readonly DEFAULT_CATALOGUE_NAME = 'GeoNet - Automated Import';
  private static readonly DEFAULT_CATALOGUE_DESCRIPTION = 'Automatically imported earthquake events from GeoNet FDSN Event Web Service';
  private static readonly FOCAL_MECHANISM_MIN_MAGNITUDE = 5.0; // Only fetch focal mechanisms for M5.0+
  private static readonly FOCAL_MECHANISM_CONCURRENCY = 5; // Max concurrent focal mechanism requests
  // MongoDB's maximum BSON document size is 16 MiB and that limit applies to the
  // COMMAND document, so neither the insertMany payload nor the `$in` array used for
  // duplicate detection may hold a whole broad import (chunked fetching removed the
  // 10,000-event ceiling upstream, so a 1960-2026 NZ import returns >1e6 events).
  // Both DB steps are therefore issued in fixed-size slices.
  private static readonly BULK_INSERT_BATCH_SIZE = 1000; // Events per insertMany call
  private static readonly SOURCE_ID_LOOKUP_BATCH_SIZE = 5000; // source_ids per $in query

  /**
   * Import events from GeoNet
   */
  async importEvents(options: ImportOptions = {}): Promise<ImportResult> {
    const startTime = new Date();
    // Two classes of problem, kept apart because they mean different things about
    // the CATALOGUE:
    // * `errors` — the STORED catalogue is not the import it claims to be: a window
    // GeoNet truncated at its result-set cap (events silently missing) or a bulk
    // insert that never reached the collection. Only these mark the catalogue `error`.
    // * `eventIssues` — per-event problems: a record that fails validation and is
    const errors: string[] = [];
    const eventIssues: string[] = [];
    // Tracked outside the try so a failure after the catalogue exists can mark it
    // `error` rather than leaving it advertising a `complete` import.
    let activeCatalogueId: string | undefined;

    console.log('[GeoNetImportService] Starting import with options:', options);

    try {
      // 1. Fetch events from GeoNet API. A window that GeoNet truncates at its
      // result-set cap is recorded in `errors`, so `success` below reports it.
      const events = await this.fetchEvents(options, errors);
      console.log(`[GeoNetImportService] Fetched ${events.length} events from GeoNet`);

      if (events.length === 0) {
        return {
          success: errors.length === 0,
          catalogueId: options.catalogueId || '',
          catalogueName: options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME,
          totalFetched: 0,
          newEvents: 0,
          updatedEvents: 0,
          skippedEvents: 0,
          errors,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
        };
      }

      // 2. Get or create catalogue
      const catalogueId = await this.getOrCreateCatalogue(
        options.catalogueId,
        options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME,
        options.userId
      );
      activeCatalogueId = catalogueId;
      console.log(`[GeoNetImportService] Using catalogue: ${catalogueId}`);

      // Mark the target catalogue in-progress for the duration of the run; the final
      // status is derived from `errors` below (matches the upload path in
      // app/api/catalogues/route.ts, which is the only other writer of this field).
      await this.setCatalogueStatus(catalogueId, 'processing');

      // 3. Process events with bulk insert optimization
      let newEvents = 0;
      let updatedEvents = 0;
      let skippedEvents = 0;

      // Performance Optimization: Use bulk processing instead of sequential inserts
      const result = await this.processEventsBulk(events, catalogueId, options.updateExisting || false);
      newEvents = result.newEvents;
      updatedEvents = result.updatedEvents;
      skippedEvents = result.skippedEvents;
      errors.push(...result.errors);
      eventIssues.push(...result.eventIssues);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // 4. Update geographic bounds and event count for the catalogue
      // Performance fix: Calculate bounds from imported events only, merge with existing
      try {
        if (newEvents > 0 || updatedEvents > 0) {
          // Get current catalogue to retrieve existing bounds
          const catalogue = await getDbQueries().getCatalogueById(catalogueId);

          // Calculate bounds from imported events only (memory efficient)
          const importedEventsBounds = this.calculateBoundsFromGeoNetEvents(events);

          if (importedEventsBounds && catalogue) {
            // Merge imported bounds with existing catalogue bounds. Use an
            // antimeridian-aware union — plain Math.min/Math.max on longitude would
            // destroy the west>east crossing convention and store a globe-spanning box.
            const hasExisting =
              catalogue.min_latitude != null && catalogue.max_latitude != null &&
              catalogue.min_longitude != null && catalogue.max_longitude != null;
            const mergedBounds = hasExisting
              ? unionBounds(importedEventsBounds, {
                  minLatitude: catalogue.min_latitude as number,
                  maxLatitude: catalogue.max_latitude as number,
                  minLongitude: catalogue.min_longitude as number,
                  maxLongitude: catalogue.max_longitude as number,
                })
              : importedEventsBounds;

            await getDbQueries().updateCatalogueGeoBounds(
              catalogueId,
              mergedBounds.minLatitude,
              mergedBounds.maxLatitude,
              mergedBounds.minLongitude,
              mergedBounds.maxLongitude
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
        totalFetched: events.length,
        newEvents,
        updatedEvents,
        skippedEvents,
        errors: reportedIssues,
      });

      // 6. Final catalogue status. `error` only for the problems that make the stored
      // catalogue wrong — a window GeoNet truncated, or a bulk insert that failed.
      // Events skipped for invalid data are a property of the SOURCE data, not of the
      // catalogue: condemning the whole catalogue for one bad record in 100,000 hid
      // otherwise successful imports behind a broken-looking status.
      await this.setCatalogueStatus(catalogueId, errors.length === 0 ? 'complete' : 'error');

      console.log(`[GeoNetImportService] Import complete: ${newEvents} new, ${updatedEvents} updated, ${skippedEvents} skipped, ${errors.length} errors, ${eventIssues.length} events skipped as invalid`);

      return {
        // `success` still reports anything the RUN could not do, skipped records
        // included, so a partial import is never announced as a clean one. Only the
        // catalogue status above distinguishes the two classes.
        success: reportedIssues.length === 0,
        catalogueId,
        catalogueName: options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME,
        totalFetched: events.length,
        newEvents,
        updatedEvents,
        skippedEvents,
        errors: reportedIssues,
        startTime,
        endTime,
        duration,
      };
    } catch (error) {
      const errorMsg = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[GeoNetImportService] ${errorMsg}`);
      errors.push(errorMsg);

      if (activeCatalogueId) {
        await this.setCatalogueStatus(activeCatalogueId, 'error');
      }

      return {
        success: false,
        catalogueId: activeCatalogueId || options.catalogueId || '',
        catalogueName: options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME,
        totalFetched: 0,
        newEvents: 0,
        updatedEvents: 0,
        skippedEvents: 0,
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
    status: 'processing' | 'complete' | 'error'
  ): Promise<void> {
    try {
      await getDbQueries().updateCatalogueStatus(status, catalogueId);
    } catch (error) {
      console.error(`[GeoNetImportService] Failed to set catalogue ${catalogueId} status to '${status}':`, error);
    }
  }

  /**
   * Fetch events from GeoNet API
   *
   * @param errors - collects window-level problems (e.g. a window GeoNet truncated at
   *   its result-set cap) so the caller can report the import as unsuccessful.
   */
  private async fetchEvents(options: ImportOptions, errors: string[]): Promise<GeoNetEventText[]> {
    // Determine time range
    let startDate: Date;
    let endDate: Date;

    if (options.hours) {
      endDate = new Date();
      startDate = new Date(endDate.getTime() - options.hours * 60 * 60 * 1000);
    } else if (options.startDate && options.endDate) {
      startDate = options.startDate;
      endDate = options.endDate;
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
        (starttime, endtime) => geonetClient.fetchEventsText({ ...params, starttime, endtime }),
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
  private calculateBoundsFromGeoNetEvents(events: GeoNetEventText[]): {
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
   * Get existing catalogue or create new one
   */
  private async getOrCreateCatalogue(catalogueId?: string, catalogueName?: string, userId?: string): Promise<string> {
    if (catalogueId) {
      // Check if catalogue exists
      const catalogue = await getDbQueries().getCatalogueById(catalogueId);
      if (catalogue) {
        return catalogueId;
      }
    }

    // Create new catalogue
    const newId = createId();
    const name = catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME;

    await getDbQueries().insertCatalogue(
      newId,
      name,
      JSON.stringify([{ source: 'GeoNet', description: GeoNetImportService.DEFAULT_CATALOGUE_DESCRIPTION }]),
      JSON.stringify({ source: 'GeoNet', importDate: new Date().toISOString() }),
      0,  // Initial event count
      // Created before a single event is processed, so it starts as 'processing';
      // importEvents() sets the final 'complete'/'error' once the run is over.
      'processing',
      userId ? { created_by: userId } : undefined
    );

    console.log(`[GeoNetImportService] Created new catalogue: ${name} (${newId})`);
    return newId;
  }

  /**
   * Process a single event (insert or update)
   * Returns: 'new', 'updated', or 'skipped'
   *
   * @deprecated This method is kept for backward compatibility but is not used in the optimized flow.
   * Use processEventsBulk() for better performance.
   */
  private async processEvent(
    event: GeoNetEventText,
    catalogueId: string,
    updateExisting: boolean
  ): Promise<'new' | 'updated' | 'skipped'> {
    // Check if event already exists
    const existingEvent = await getDbQueries().getEventBySourceId(catalogueId, event.EventID);

    if (existingEvent) {
      if (updateExisting) {
        // Update existing event
        await this.updateEvent(existingEvent.id, event);
        return 'updated';
      } else {
        // Skip existing event
        return 'skipped';
      }
    } else {
      // Insert new event
      await this.insertEvent(event, catalogueId);
      return 'new';
    }
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
    newEvents: number;
    updatedEvents: number;
    skippedEvents: number;
    /** Failures that leave the catalogue incomplete (a batch that never got written). */
    errors: string[];
    /** Per-event skips: bad source records, not a broken catalogue (see importEvents). */
    eventIssues: string[];
  }> {
    const errors: string[] = [];
    const eventIssues: string[] = [];

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
    const updateEventsList: Array<{ dbId: string; event: GeoNetEventText }> = [];
    const skippedEventsList: GeoNetEventText[] = [];

    for (const event of events) {
      const existingDbId = existingEventsMap.get(event.EventID);
      if (existingDbId) {
        if (updateExisting) {
          updateEventsList.push({ dbId: existingDbId, event });
        } else {
          skippedEventsList.push(event);
        }
      } else {
        newEventsList.push(event);
      }
    }

    console.log(`[GeoNetImportService] Found ${newEventsList.length} new, ${updateEventsList.length} to update, ${skippedEventsList.length} to skip`);

    // Step 3: Fetch focal mechanisms in parallel for significant events
    const limit = pLimit(GeoNetImportService.FOCAL_MECHANISM_CONCURRENCY);
    const focalMechanismsMap = new Map<string, string | null>();
    // Origin quality comes from the SAME QuakeML response as the focal mechanism, so
    // populating it costs no extra requests. Without it every GeoNet event reaches the
    // quality scorers with all inputs null.
    const originQualityMap = new Map<string, GeoNetOriginQuality>();

    const significantEvents = [...newEventsList, ...updateEventsList.map(u => u.event)]
      .filter(e => e.Magnitude >= GeoNetImportService.FOCAL_MECHANISM_MIN_MAGNITUDE);

    if (significantEvents.length > 0) {
      console.log(`[GeoNetImportService] Fetching focal mechanisms for ${significantEvents.length} significant events (M${GeoNetImportService.FOCAL_MECHANISM_MIN_MAGNITUDE}+) with ${GeoNetImportService.FOCAL_MECHANISM_CONCURRENCY} concurrent requests...`);

      const focalMechanismPromises = significantEvents.map(event =>
        limit(async () => {
          try {
            const quakeML = await geonetClient.fetchEventById(event.EventID);
            if (quakeML) {
              const originQuality = extractOriginQualityFromQuakeML(quakeML);
              if (originQuality) {
                originQualityMap.set(event.EventID, originQuality);
              }
              const builder = new Builder();
              const xmlString = builder.buildObject(quakeML);
              const focalMechanism = extractFocalMechanismFromXML(xmlString);
              if (focalMechanism) {
                focalMechanismsMap.set(event.EventID, JSON.stringify([focalMechanism]));
                console.log(`[GeoNetImportService] ✓ Focal mechanism for ${event.EventID} (M${event.Magnitude})`);
              }
            }
          } catch (error) {
            console.error(`[GeoNetImportService] Failed to fetch focal mechanism for ${event.EventID}:`, error);
            // Continue processing even if focal mechanism fetch fails
          }
        })
      );

      await Promise.all(focalMechanismPromises);
      console.log(`[GeoNetImportService] Fetched ${focalMechanismsMap.size} focal mechanisms and ${originQualityMap.size} origin-quality records`);
    }

    // Step 4: Bulk insert new events
    let newEventsCount = 0;
    if (newEventsList.length > 0) {
      try {
        // Validate events before insertion
        const validEvents: GeoNetEventText[] = [];
        for (const event of newEventsList) {
          if (!this.validateEvent(event)) {
            console.warn(`[GeoNetImportService] Skipping invalid event ${event.EventID}: missing or invalid required fields`);
            eventIssues.push(`Skipped event ${event.EventID}: invalid data`);
            continue;
          }
          validEvents.push(event);
        }

        // insertMany sends one command document, so the batch must stay well under
        // MongoDB's 16 MiB BSON limit; a broad chunked import can return >1e6 events.
        // Mapping per batch also keeps only one batch of converted documents alive.
        for (let i = 0; i < validEvents.length; i += GeoNetImportService.BULK_INSERT_BATCH_SIZE) {
          const eventsToInsert = validEvents
            .slice(i, i + GeoNetImportService.BULK_INSERT_BATCH_SIZE)
            .map(event => this.convertToMergedEvent(event, catalogueId, focalMechanismsMap, originQualityMap));
          // Count what MongoDB actually wrote, not what was submitted: bulkInsertEvents
          // drops in-batch source_id duplicates and lets the (catalogue_id, source_id)
          // unique index skip rows already stored, so the submitted length overstates
          // ImportResult.newEvents — the "+N this run" figure — by every de-duplicated
          // event. (The stored event_count is unaffected; it comes from a DB recount.)
          newEventsCount += await getDbQueries().bulkInsertEvents(eventsToInsert);
        }
        if (newEventsCount > 0) {
          console.log(`[GeoNetImportService] Bulk inserted ${newEventsCount} new events`);
        }
      } catch (error) {
        const errorMsg = `Bulk insert failed: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[GeoNetImportService] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Step 5: Update existing events (still sequential, but fewer operations)
    let updatedEventsCount = 0;
    for (const { dbId, event } of updateEventsList) {
      try {
        // Validate event before update
        if (!this.validateEvent(event)) {
          console.warn(`[GeoNetImportService] Skipping invalid event update ${event.EventID}: missing or invalid required fields`);
          eventIssues.push(`Skipped event update ${event.EventID}: invalid data`);
          continue;
        }
        await this.updateEvent(
          dbId,
          event,
          focalMechanismsMap.get(event.EventID) || null,
          originQualityMap.get(event.EventID) || null
        );
        updatedEventsCount++;
      } catch (error) {
        const errorMsg = `Failed to update event ${event.EventID}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[GeoNetImportService] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    return {
      newEvents: newEventsCount,
      updatedEvents: updatedEventsCount,
      skippedEvents: skippedEventsList.length,
      errors,
      eventIssues
    };
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
   * Convert GeoNet event to MergedEvent format for bulk insert
   */
  private convertToMergedEvent(
    event: GeoNetEventText,
    catalogueId: string,
    focalMechanismsMap: Map<string, string | null>,
    originQualityMap?: Map<string, GeoNetOriginQuality>
  ): Partial<MergedEvent> & {
    id: string;
    catalogue_id: string;
    time: string;
    latitude: number;
    longitude: number;
    magnitude: number;
    source_events: string;
    source_id: string;
  } {
    const eventId = createId();
    const focalMechanisms = focalMechanismsMap.get(event.EventID) || null;

    return {
      id: eventId,
      catalogue_id: catalogueId,
      source_id: event.EventID, // Critical: Include source_id for duplicate detection
      // Offset-less FDSN time forced to UTC (see normalizeGeoNetTime).
      time: normalizeGeoNetTime(event.Time) ?? event.Time,
      latitude: event.Latitude,
      longitude: event.Longitude,
      depth: event['Depth/km'],
      magnitude: event.Magnitude,
      source_events: JSON.stringify([{
        source: 'GeoNet', // Match format used in insertEvent()
        eventId: event.EventID,
        ...geonetProvenance(event),
      }]),
      magnitude_type: event.MagType || null,
      event_type: normalizeEventType(event.EventType),
      focal_mechanisms: focalMechanisms,
      author: textColumn(event.Author),
      location_name: textColumn(event.EventLocationName),
      ...(originQualityMap?.get(event.EventID) ?? {}),
    };
  }

  /**
   * Insert new event into database
   */
  private async insertEvent(event: GeoNetEventText, catalogueId: string): Promise<void> {
    const eventId = createId();

    // Fetch focal mechanism for significant events (M5.0+)
    let focalMechanisms: string | null = null;
    let originQuality: GeoNetOriginQuality | null = null;
    if (event.Magnitude >= GeoNetImportService.FOCAL_MECHANISM_MIN_MAGNITUDE) {
      try {
        console.log(`[GeoNetImportService] Fetching focal mechanism for event ${event.EventID} (M${event.Magnitude})`);
        const quakeML = await geonetClient.fetchEventById(event.EventID);

        if (quakeML) {
          // Same response also carries the origin quality metrics.
          originQuality = extractOriginQualityFromQuakeML(quakeML);

          // Convert QuakeML object back to XML string for parsing
          const builder = new Builder();
          const xmlString = builder.buildObject(quakeML);

          const focalMechanism = extractFocalMechanismFromXML(xmlString);
          if (focalMechanism) {
            focalMechanisms = JSON.stringify([focalMechanism]);
            console.log(`[GeoNetImportService] Found focal mechanism for event ${event.EventID}`);
          }
        }
      } catch (error) {
        console.error(`[GeoNetImportService] Failed to fetch focal mechanism for ${event.EventID}:`, error);
        // Continue without focal mechanism - don't fail the import
      }
    }

    await getDbQueries().insertEvent({
      id: eventId,
      catalogue_id: catalogueId,
      source_id: event.EventID,
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
      event_type: normalizeEventType(event.EventType),
      focal_mechanisms: focalMechanisms,
      author: textColumn(event.Author),
      location_name: textColumn(event.EventLocationName),
      ...(originQuality ?? {}),
    });
  }

  /**
   * Update existing event
   *
   * @param eventId - Database ID of the event to update
   * @param event - GeoNet event data
   * @param focalMechanismData - Optional pre-fetched focal mechanism data (for bulk processing)
   * @param originQualityData - Optional pre-extracted origin quality (for bulk processing)
   */
  private async updateEvent(
    eventId: string,
    event: GeoNetEventText,
    focalMechanismData: string | null = null,
    originQualityData: GeoNetOriginQuality | null = null
  ): Promise<void> {
    // Use provided focal mechanism data, or fetch if needed and not provided
    let focalMechanisms: string | null = focalMechanismData;
    let originQuality: GeoNetOriginQuality | null = originQualityData;

    if (!focalMechanisms && event.Magnitude >= GeoNetImportService.FOCAL_MECHANISM_MIN_MAGNITUDE) {
      try {
        console.log(`[GeoNetImportService] Fetching focal mechanism for event ${event.EventID} (M${event.Magnitude})`);
        const quakeML = await geonetClient.fetchEventById(event.EventID);

        if (quakeML) {
          // Same response also carries the origin quality metrics.
          originQuality = originQuality ?? extractOriginQualityFromQuakeML(quakeML);

          // Convert QuakeML object back to XML string for parsing
          const builder = new Builder();
          const xmlString = builder.buildObject(quakeML);

          const focalMechanism = extractFocalMechanismFromXML(xmlString);
          if (focalMechanism) {
            focalMechanisms = JSON.stringify([focalMechanism]);
            console.log(`[GeoNetImportService] Found focal mechanism for event ${event.EventID}`);
          }
        }
      } catch (error) {
        console.error(`[GeoNetImportService] Failed to fetch focal mechanism for ${event.EventID}:`, error);
        // Continue without focal mechanism - don't fail the update
      }
    }

    await getDbQueries().updateEvent(eventId, {
      // Offset-less FDSN time forced to UTC (see normalizeGeoNetTime).
      time: normalizeGeoNetTime(event.Time) ?? event.Time,
      latitude: event.Latitude,
      longitude: event.Longitude,
      depth: event['Depth/km'],
      magnitude: event.Magnitude,
      magnitude_type: event.MagType || null,
      event_type: normalizeEventType(event.EventType),
      focal_mechanisms: focalMechanisms,
      author: textColumn(event.Author),
      location_name: textColumn(event.EventLocationName),
      ...(originQuality ?? {}),
    });
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
      data.errors.length > 0 ? JSON.stringify(data.errors) : null
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
