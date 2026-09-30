/**
 * API endpoint to get catalogue statistics
 * Returns min/max dates, magnitude ranges, depth ranges, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';
import { catalogueScope, generateCacheKey, getCacheGeneration, statisticsCache } from '@/lib/cache';

const logger = new Logger('CatalogueStatisticsAPI');

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

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const authResult = await requireViewer(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const catalogueId = id;
    logger.info('Fetching catalogue statistics', { catalogueId });

    // Get catalogue info
    const catalogue = await dbQueries.getCatalogueById(catalogueId);
    if (!catalogue) {
      throw new NotFoundError('Catalogue');
    }

    // The statistics scan every event, which for a large catalogue that keeps its picks
    // means reading hundreds of MB per request; opening the popover twice paid it twice.
    // The result is cached under the catalogue's cache generation (taken before the read,
    // and bumped by every catalogue or event write), so a change is never served stale.
    // A null generation means it could not be read; the cache is then bypassed.
    const generation = await getCacheGeneration(catalogueScope(catalogueId));
    const cacheKey = generateCacheKey('catalogue-statistics', { catalogueId, generation, version: catalogue.version ?? null });
    if (generation !== null) {
      const cached = statisticsCache.get<CatalogueStatistics>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    // Aggregate the statistics in MongoDB. Reducing them in Node meant loading
    // every event (~1.3 kB each) into memory, and Math.min(...magnitudes) threw
    // RangeError — HTTP 500 — once a catalogue passed ~125,000 events, which
    // several of the New Zealand catalogues do.
    const stats = await dbQueries.getCatalogueEventStatistics(catalogueId);

    if (stats.eventCount === 0) {
      const empty: CatalogueStatistics = {
        catalogueId,
        version: catalogue.version ?? '1.0.0',
        eventCount: 0,
        dateRange: null,
        magnitudeRange: null,
        depthRange: null,
        magnitudeTypes: [],
        qualityMetrics: null
      };
      return NextResponse.json(empty);
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

    const statistics: CatalogueStatistics = {
      catalogueId,
      version: catalogue.version ?? '1.0.0',
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

    logger.info('Catalogue statistics calculated', {
      catalogueId,
      eventCount: statistics.eventCount
    });

    if (generation !== null) statisticsCache.set(cacheKey, statistics);
    return NextResponse.json(statistics);
  } catch (error) {
    logger.error('Failed to fetch catalogue statistics', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
