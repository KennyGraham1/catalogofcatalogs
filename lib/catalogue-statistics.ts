/**
 * Catalogue statistics: the answer of GET /api/catalogues/[id]/statistics, shown by the
 * "Catalogue Statistics" popover.
 *
 * Computing them (dbQueries.getCatalogueEventStatistics) reads every event of the
 * catalogue. MongoDB has to load each whole document to do that, so a national
 * catalogue that keeps its picks and arrivals means tens of GB per computation. The
 * answer is therefore kept in three layers, cheapest first:
 *
 *  1. this process's statisticsCache, keyed by the catalogue's cache generation;
 *  2. the catalogue_statistics collection: one document per catalogue holding the
 *     answer and the catalogue's SHARED cache generation (the database counter) at the
 *     time it was computed. The process-local part of the generation is left out on
 *     purpose: it restarts at zero with the process and differs between server
 *     instances, so a document keyed by it would never be found again. The document is
 *     served only while the shared generation, the catalogue version and the document
 *     format all still match;
 *  3. the aggregation itself. Its answer is stored in both layers above, and
 *     concurrent requests for the same generation share one run.
 *
 * Every committed catalogue write advances the shared generation (lib/db.ts
 * publishCatalogueWrites), which retires the stored answer, and asks
 * lib/catalogue-statistics-refresh.ts to compute the new one in the background, so the
 * next open of the popover usually finds it stored.
 *
 * Why a stale answer is never served: the generation is read BEFORE the aggregation,
 * and a write bumps it only AFTER it has committed. An aggregation that missed a write
 * therefore started before that write's bump, and its answer carries a generation the
 * bump has already left behind.
 */

import { dbQueries, type CatalogueEventStatistics, type MergedCatalogue } from './db';
import { catalogueScope, generateCacheKey, getCacheGenerationParts, statisticsCache } from './cache';
import { Logger } from './errors';

const logger = new Logger('CatalogueStatistics');

/**
 * The nullable members are genuinely absent, not merely unset: an empty catalogue is
 * answered with every range null, and the aggregation's $min/$max/$avg yield null
 * whenever no event carries the field (all times unparseable, no magnitudes at all).
 * They are typed that way so a consumer is forced to guard instead of dereferencing a
 * value the endpoint never promised.
 */
export interface CatalogueStatistics {
  catalogueId: string;
  /** Catalogue version (MAJOR.MINOR.PATCH, contract C3). */
  version: string;
  eventCount: number;
  dateRange: {
    earliest: string;
    latest: string;
    spanDays: number;
  } | null;
  magnitudeRange: {
    min: number;
    max: number;
    average: number;
    median: number;
  } | null;
  depthRange: {
    min: number;
    max: number;
    average: number;
  } | null;
  magnitudeTypes: {
    type: string;
    count: number;
  }[];
  qualityMetrics: {
    averageAzimuthalGap?: number;
    averageStationCount?: number;
    /** Events reporting any location uncertainty (horizontal in any form, or depth). */
    eventsWithUncertainty: number;
    eventsWithHorizontalUncertainty: number;
    eventsWithDepthUncertainty: number;
    eventsWithFocalMechanism: number;
    /** Events carrying a stored quality score Q; rows stored before scores were persisted do not. */
    eventsWithQualityScore: number;
    /** Mean stored Q over the scored events (0-100), absent when none is scored. */
    averageQualityScore?: number;
    /** Stored quality grades, best first (A+ .. F); only grades that occur. */
    gradeDistribution: Array<{ grade: string; count: number }>;
  } | null;
}

/**
 * Shape of the stored `statistics`. Raise it whenever CatalogueStatistics or the way it
 * is computed changes: documents of another format are recomputed instead of served.
 */
export const CATALOGUE_STATISTICS_FORMAT = 1;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** The catalogue fields the statistics depend on, besides its events. */
export type CatalogueForStatistics = Pick<MergedCatalogue, 'version'> & Partial<Pick<MergedCatalogue, 'status'>>;

function versionOf(catalogue: CatalogueForStatistics): string {
  return catalogue.version ?? '1.0.0';
}

function queries() {
  if (!dbQueries) throw new Error('Database not available');
  return dbQueries;
}

/** The endpoint's answer for the aggregated statistics of a catalogue's events. */
export function buildCatalogueStatistics(
  catalogueId: string,
  version: string,
  stats: CatalogueEventStatistics
): CatalogueStatistics {
  if (stats.eventCount === 0) {
    return {
      catalogueId,
      version,
      eventCount: 0,
      dateRange: null,
      magnitudeRange: null,
      depthRange: null,
      magnitudeTypes: [],
      qualityMetrics: null
    };
  }

  // Times are stored as normalised ISO-8601 UTC strings, so the lexicographic
  // min/max the aggregation returns is also the chronological one.
  const earliestMs = stats.earliestTime ? Date.parse(stats.earliestTime) : NaN;
  const latestMs = stats.latestTime ? Date.parse(stats.latestTime) : NaN;
  const dateRange = Number.isFinite(earliestMs) && Number.isFinite(latestMs)
    ? {
        earliest: new Date(earliestMs).toISOString(),
        latest: new Date(latestMs).toISOString(),
        spanDays: Math.ceil((latestMs - earliestMs) / MS_PER_DAY)
      }
    : null;

  // $min/$max/$avg skip events with no magnitude, so a catalogue whose events all
  // lack one leaves every magnitude statistic null. Report that as "no magnitude
  // range" rather than casting the nulls into numbers a consumer would dereference.
  const magnitudeRange =
    stats.minMagnitude != null &&
    stats.maxMagnitude != null &&
    stats.averageMagnitude != null &&
    stats.medianMagnitude != null
      ? {
          min: stats.minMagnitude,
          max: stats.maxMagnitude,
          average: stats.averageMagnitude,
          median: stats.medianMagnitude
        }
      : null;

  return {
    catalogueId,
    version,
    eventCount: stats.eventCount,
    dateRange,
    magnitudeRange,
    // No event with a depth means no depth range, as for magnitudes. The old
    // {min: 0, max: 0, average: 0} placeholder was indistinguishable from a
    // catalogue whose events are all genuinely at 0 km (the datum, a common fixed
    // depth).
    depthRange:
      stats.minDepth != null && stats.maxDepth != null && stats.averageDepth != null
        ? {
            min: stats.minDepth,
            max: stats.maxDepth,
            average: stats.averageDepth
          }
        : null,
    magnitudeTypes: stats.magnitudeTypes,
    qualityMetrics: {
      averageAzimuthalGap: stats.averageAzimuthalGap ?? undefined,
      averageStationCount: stats.averageStationCount ?? undefined,
      eventsWithUncertainty: stats.eventsWithUncertainty,
      eventsWithHorizontalUncertainty: stats.eventsWithHorizontalUncertainty ?? 0,
      eventsWithDepthUncertainty: stats.eventsWithDepthUncertainty ?? 0,
      eventsWithFocalMechanism: stats.eventsWithFocalMechanism,
      eventsWithQualityScore: stats.qualityScoreCount ?? 0,
      averageQualityScore: stats.averageQualityScore ?? undefined,
      gradeDistribution: stats.qualityGrades ?? []
    }
  };
}

/** Runs the aggregation. No cache is read or written. */
export async function computeCatalogueStatistics(catalogueId: string, version: string): Promise<CatalogueStatistics> {
  // Aggregated in MongoDB. Reducing in Node meant loading every event (~1.3 kB each)
  // into memory, and Math.min(...magnitudes) threw RangeError (HTTP 500) once a
  // catalogue passed ~125,000 events, which several of the New Zealand catalogues do.
  const statistics = buildCatalogueStatistics(catalogueId, version, await queries().getCatalogueEventStatistics(catalogueId));
  logger.info('Catalogue statistics calculated', { catalogueId, eventCount: statistics.eventCount });
  return statistics;
}

async function readStored(catalogueId: string, generation: number, version: string): Promise<CatalogueStatistics | null> {
  try {
    const stored = await queries().getStoredCatalogueStatistics(catalogueId);
    if (
      stored &&
      stored.generation === generation &&
      stored.version === version &&
      stored.format === CATALOGUE_STATISTICS_FORMAT
    ) {
      return stored.statistics;
    }
  } catch (error) {
    // The stored copy is an optimisation: when it cannot be read, compute.
    logger.warn('Stored catalogue statistics could not be read; computing them', {
      catalogueId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

async function store(catalogueId: string, generation: number, version: string, statistics: CatalogueStatistics): Promise<void> {
  try {
    await queries().storeCatalogueStatistics({
      catalogue_id: catalogueId,
      generation,
      version,
      format: CATALOGUE_STATISTICS_FORMAT,
      computed_at: new Date().toISOString(),
      // Exactly what the endpoint sends: JSON drops the undefined members, which BSON
      // would otherwise store as null and a reader would then see as present.
      statistics: JSON.parse(JSON.stringify(statistics)) as CatalogueStatistics,
    });
  } catch (error) {
    logger.warn('Catalogue statistics could not be stored', {
      catalogueId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const inFlight = new Map<string, Promise<CatalogueStatistics>>();

async function loadOrCompute(catalogueId: string, version: string, shared: number | null): Promise<CatalogueStatistics> {
  if (shared !== null) {
    const stored = await readStored(catalogueId, shared, version);
    if (stored) return stored;
  }
  const statistics = await computeCatalogueStatistics(catalogueId, version);
  if (shared !== null) await store(catalogueId, shared, version, statistics);
  return statistics;
}

/**
 * A catalogue's statistics from the cheapest layer that has them for its current
 * generation (see the top of this module). `catalogue` is the catalogue's row, read
 * before this call.
 */
export async function getCatalogueStatistics(
  catalogueId: string,
  catalogue: CatalogueForStatistics
): Promise<CatalogueStatistics> {
  const version = versionOf(catalogue);
  // Taken before the stored copy or the events are read. Null means the shared
  // generation could not be read: no layer can then tell whether what it holds is
  // current, so none is used.
  const parts = await getCacheGenerationParts(catalogueScope(catalogueId));
  if (!parts) return computeCatalogueStatistics(catalogueId, version);

  const memoryKey = generateCacheKey('catalogue-statistics', {
    catalogueId,
    generation: parts.generation,
    version: catalogue.version ?? null,
  });
  const cached = statisticsCache.get<CatalogueStatistics>(memoryKey);
  if (cached) return cached;

  // A popover opened while the background refresh (or another request) is computing
  // the same generation waits for that run instead of starting a second scan.
  let pending = inFlight.get(memoryKey);
  if (!pending) {
    pending = loadOrCompute(catalogueId, version, parts.shared)
      .then((statistics) => {
        // Cached before the run is forgotten, so no request in between misses both.
        statisticsCache.set(memoryKey, statistics);
        return statistics;
      })
      .finally(() => {
        inFlight.delete(memoryKey);
      });
    inFlight.set(memoryKey, pending);
  }
  return pending;
}

/**
 * The background refresh after a write (lib/catalogue-statistics-refresh.ts): make the
 * stored statistics current. Skipped for a catalogue that no longer exists, is being
 * deleted, or is still loading: the write that completes a load triggers another
 * refresh, and computing every batch of an upload would only be thrown away.
 */
export async function refreshCatalogueStatistics(catalogueId: string): Promise<'refreshed' | 'skipped'> {
  const catalogue = await queries().getCatalogueById(catalogueId);
  if (!catalogue || catalogue.status === 'processing' || catalogue.status === 'deleting') return 'skipped';
  await getCatalogueStatistics(catalogueId, catalogue);
  return 'refreshed';
}

/**
 * Drop the stored statistics of these catalogues, or of every catalogue. Used when a
 * write could not advance the shared generation, which would otherwise leave the stored
 * copy looking current, and by the admin cache clear.
 */
export async function discardStoredCatalogueStatistics(catalogueIds: string[] | 'all'): Promise<void> {
  if (catalogueIds !== 'all' && catalogueIds.length === 0) return;
  await queries().deleteStoredCatalogueStatistics(catalogueIds);
}
