/**
 * API endpoint to get catalogue statistics
 * Returns min/max dates, magnitude ranges, depth ranges, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';

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
    eventsWithUncertainty: number;
    eventsWithFocalMechanism: number;
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

    // Aggregate the statistics in MongoDB. Reducing them in Node meant loading
    // every event (~1.3 kB each) into memory, and Math.min(...magnitudes) threw
    // RangeError — HTTP 500 — once a catalogue passed ~125,000 events, which
    // several of the New Zealand catalogues do.
    const stats = await dbQueries.getCatalogueEventStatistics(catalogueId);

    if (stats.eventCount === 0) {
      const empty: CatalogueStatistics = {
        catalogueId,
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
      eventCount: stats.eventCount,
      dateRange,
      magnitudeRange,
      // No depth on any event keeps the historical all-zero placeholder rather
      // than nulls, so existing clients render the same thing as before.
      depthRange:
        stats.minDepth != null && stats.maxDepth != null && stats.averageDepth != null
          ? {
              min: stats.minDepth,
              max: stats.maxDepth,
              average: stats.averageDepth
            }
          : {
              min: 0,
              max: 0,
              average: 0
            },
      magnitudeTypes: stats.magnitudeTypes,
      qualityMetrics: {
        averageAzimuthalGap: stats.averageAzimuthalGap ?? undefined,
        averageStationCount: stats.averageStationCount ?? undefined,
        eventsWithUncertainty: stats.eventsWithUncertainty,
        eventsWithFocalMechanism: stats.eventsWithFocalMechanism
      }
    };

    logger.info('Catalogue statistics calculated', {
      catalogueId,
      eventCount: statistics.eventCount
    });

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
