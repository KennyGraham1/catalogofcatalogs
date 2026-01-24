/**
 * API endpoint to get catalogue statistics
 * Returns min/max dates, magnitude ranges, depth ranges, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, MergedEvent } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';

const logger = new Logger('CatalogueStatisticsAPI');

export interface CatalogueStatistics {
  catalogueId: string;
  eventCount: number;
  dateRange: {
    earliest: string;
    latest: string;
    spanDays: number;
  };
  magnitudeRange: {
    min: number;
    max: number;
    average: number;
    median: number;
  };
  depthRange: {
    min: number;
    max: number;
    average: number;
  };
  magnitudeTypes: {
    type: string;
    count: number;
  }[];
  qualityMetrics?: {
    averageAzimuthalGap?: number;
    averageStationCount?: number;
    eventsWithUncertainty: number;
    eventsWithFocalMechanism: number;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const catalogueId = params.id;
    logger.info('Fetching catalogue statistics', { catalogueId });

    // Get catalogue info
    const catalogue = await dbQueries.getCatalogueById(catalogueId);
    if (!catalogue) {
      throw new NotFoundError('Catalogue');
    }

    // Get all events for this catalogue
    const eventsResult = await dbQueries.getEventsByCatalogueId(catalogueId);
    const events: MergedEvent[] = Array.isArray(eventsResult) ? eventsResult : eventsResult.data;

    if (!events || events.length === 0) {
      return NextResponse.json({
        catalogueId,
        eventCount: 0,
        dateRange: null,
        magnitudeRange: null,
        depthRange: null,
        magnitudeTypes: [],
        qualityMetrics: null
      });
    }

    // Calculate date range
    const dates = events.map(e => new Date(e.time).getTime()).filter(d => !isNaN(d));
    const earliestDate = new Date(Math.min(...dates));
    const latestDate = new Date(Math.max(...dates));
    const spanDays = Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate magnitude statistics
    const magnitudes = events.map(e => e.magnitude).filter(m => m !== null && m !== undefined);
    const sortedMagnitudes = [...magnitudes].sort((a, b) => a - b);
    const medianMagnitude = sortedMagnitudes.length > 0
      ? sortedMagnitudes[Math.floor(sortedMagnitudes.length / 2)]
      : 0;

    // Calculate depth statistics
    const depths = events.map(e => e.depth).filter((d): d is number => d !== null && d !== undefined);

    // Count magnitude types
    const magnitudeTypeCounts = events.reduce((acc, event) => {
      const type = event.magnitude_type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const magnitudeTypes = Object.entries(magnitudeTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Calculate quality metrics
    const azimuthalGaps = events
      .map(e => e.azimuthal_gap)
      .filter((g): g is number => g !== null && g !== undefined);

    const stationCounts = events
      .map(e => e.used_station_count)
      .filter((c): c is number => c !== null && c !== undefined);

    const eventsWithUncertainty = events.filter(e =>
      e.latitude_uncertainty !== null || e.longitude_uncertainty !== null
    ).length;

    const eventsWithFocalMechanism = events.filter(e =>
      e.focal_mechanisms !== null && e.focal_mechanisms !== undefined
    ).length;

    const statistics: CatalogueStatistics = {
      catalogueId,
      eventCount: events.length,
      dateRange: {
        earliest: earliestDate.toISOString(),
        latest: latestDate.toISOString(),
        spanDays
      },
      magnitudeRange: {
        min: Math.min(...magnitudes),
        max: Math.max(...magnitudes),
        average: magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length,
        median: medianMagnitude
      },
      depthRange: depths.length > 0 ? {
        min: Math.min(...depths),
        max: Math.max(...depths),
        average: depths.reduce((a, b) => a + b, 0) / depths.length
      } : {
        min: 0,
        max: 0,
        average: 0
      },
      magnitudeTypes,
      qualityMetrics: {
        averageAzimuthalGap: azimuthalGaps.length > 0
          ? azimuthalGaps.reduce((a, b) => a + b, 0) / azimuthalGaps.length
          : undefined,
        averageStationCount: stationCounts.length > 0
          ? stationCounts.reduce((a, b) => a + b, 0) / stationCounts.length
          : undefined,
        eventsWithUncertainty,
        eventsWithFocalMechanism
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
