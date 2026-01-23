/**
 * API endpoint for searching catalogues by geographic region
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { apiCache } from '@/lib/cache';
import { randomUUID } from 'crypto';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

const logger = new Logger('CatalogueRegionSearchAPI');

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || randomUUID();
  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available', requestId },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;

    // Extract bounding box parameters
    const minLat = searchParams.get('minLat');
    const maxLat = searchParams.get('maxLat');
    const minLon = searchParams.get('minLon');
    const maxLon = searchParams.get('maxLon');

    // Validate required parameters
    if (!minLat || !maxLat || !minLon || !maxLon) {
      return NextResponse.json(
        { 
          error: 'Missing required parameters',
          details: 'All of minLat, maxLat, minLon, and maxLon are required',
          requestId
        },
        { status: 400 }
      );
    }

    const epsilon = 1e-6;
    const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    // Parse and validate coordinates
    const minLatNum = parseFloat(minLat);
    const maxLatNum = parseFloat(maxLat);
    const minLonNum = parseFloat(minLon);
    const maxLonNum = parseFloat(maxLon);

    if (isNaN(minLatNum) || isNaN(maxLatNum) || isNaN(minLonNum) || isNaN(maxLonNum)) {
      return NextResponse.json(
        { error: 'Invalid coordinate values. All coordinates must be valid numbers.', requestId },
        { status: 400 }
      );
    }

    // Validate coordinate ranges (allow small epsilon over/under due to rounding)
    if (minLatNum < -90 - epsilon || minLatNum > 90 + epsilon || maxLatNum < -90 - epsilon || maxLatNum > 90 + epsilon) {
      return NextResponse.json(
        { error: 'Latitude values must be between -90 and 90', requestId },
        { status: 400 }
      );
    }

    if (minLonNum < -180 - epsilon || minLonNum > 180 + epsilon || maxLonNum < -180 - epsilon || maxLonNum > 180 + epsilon) {
      return NextResponse.json(
        { error: 'Longitude values must be between -180 and 180', requestId },
        { status: 400 }
      );
    }

    const clampedMinLat = clampValue(minLatNum, -90, 90);
    const clampedMaxLat = clampValue(maxLatNum, -90, 90);
    const clampedMinLon = clampValue(minLonNum, -180, 180);
    const clampedMaxLon = clampValue(maxLonNum, -180, 180);

    if (clampedMinLat > clampedMaxLat) {
      return NextResponse.json(
        { error: 'Minimum latitude cannot be greater than maximum latitude', requestId },
        { status: 400 }
      );
    }

    const crossesDateline = clampedMinLon > clampedMaxLon;

    // Create cache key from coordinates (rounded to 2 decimal places for better cache hits)
    const cacheKey = `region:${clampedMinLat.toFixed(2)},${clampedMaxLat.toFixed(2)},${clampedMinLon.toFixed(2)},${clampedMaxLon.toFixed(2)}:${crossesDateline ? 'wrap' : 'normal'}`;

    // Check cache first
    const cachedResult = apiCache.get<any>(cacheKey);
    if (cachedResult) {
      logger.info('Returning cached region search result', { cacheKey, requestId });
      return NextResponse.json({ ...cachedResult, requestId });
    }

    logger.info('Searching catalogues by region', {
      requestId,
      minLat: clampedMinLat,
      maxLat: clampedMaxLat,
      minLon: clampedMinLon,
      maxLon: clampedMaxLon,
      crossesDateline
    });

    // Search for catalogues in the region
    const catalogues = await dbQueries.getCataloguesByRegion(
      clampedMinLat,
      clampedMaxLat,
      clampedMinLon,
      clampedMaxLon
    );

    logger.info('Region search completed', { count: catalogues.length, requestId });

    const result = {
      catalogues,
      searchRegion: {
        minLatitude: clampedMinLat,
        maxLatitude: clampedMaxLat,
        minLongitude: clampedMinLon,
        maxLongitude: clampedMaxLon
      },
      count: catalogues.length
    };

    // Cache the result
    apiCache.set(cacheKey, result);

    return NextResponse.json({ ...result, requestId });

  } catch (error) {
    logger.error('Failed to search catalogues by region', error, { requestId });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code, requestId },
      { status: errorResponse.statusCode }
    );
  }
}
