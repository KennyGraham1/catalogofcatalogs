/**
 * API endpoint for searching catalogues by geographic region
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { apiCache } from '@/lib/cache';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

const logger = new Logger('CatalogueRegionSearchAPI');

export async function GET(request: NextRequest) {
  try {
    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
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
          details: 'All of minLat, maxLat, minLon, and maxLon are required'
        },
        { status: 400 }
      );
    }

    // Parse and validate coordinates
    const minLatNum = parseFloat(minLat);
    const maxLatNum = parseFloat(maxLat);
    const minLonNum = parseFloat(minLon);
    const maxLonNum = parseFloat(maxLon);

    if (isNaN(minLatNum) || isNaN(maxLatNum) || isNaN(minLonNum) || isNaN(maxLonNum)) {
      return NextResponse.json(
        { error: 'Invalid coordinate values. All coordinates must be valid numbers.' },
        { status: 400 }
      );
    }

    // Validate coordinate ranges
    if (minLatNum < -90 || minLatNum > 90 || maxLatNum < -90 || maxLatNum > 90) {
      return NextResponse.json(
        { error: 'Latitude values must be between -90 and 90' },
        { status: 400 }
      );
    }

    if (minLonNum < -180 || minLonNum > 180 || maxLonNum < -180 || maxLonNum > 180) {
      return NextResponse.json(
        { error: 'Longitude values must be between -180 and 180' },
        { status: 400 }
      );
    }

    if (minLatNum > maxLatNum) {
      return NextResponse.json(
        { error: 'Minimum latitude cannot be greater than maximum latitude' },
        { status: 400 }
      );
    }

    if (minLonNum > maxLonNum) {
      return NextResponse.json(
        { error: 'Minimum longitude cannot be greater than maximum longitude' },
        { status: 400 }
      );
    }

    // Create cache key from coordinates (rounded to 2 decimal places for better cache hits)
    const cacheKey = `region:${minLatNum.toFixed(2)},${maxLatNum.toFixed(2)},${minLonNum.toFixed(2)},${maxLonNum.toFixed(2)}`;

    // Check cache first
    const cachedResult = apiCache.get<any>(cacheKey);
    if (cachedResult) {
      logger.info('Returning cached region search result', { cacheKey });
      return NextResponse.json(cachedResult);
    }

    logger.info('Searching catalogues by region', {
      minLat: minLatNum,
      maxLat: maxLatNum,
      minLon: minLonNum,
      maxLon: maxLonNum
    });

    // Search for catalogues in the region
    const catalogues = await dbQueries.getCataloguesByRegion(
      minLatNum,
      maxLatNum,
      minLonNum,
      maxLonNum
    );

    logger.info('Region search completed', { count: catalogues.length });

    const result = {
      catalogues,
      searchRegion: {
        minLatitude: minLatNum,
        maxLatitude: maxLatNum,
        minLongitude: minLonNum,
        maxLongitude: maxLonNum
      },
      count: catalogues.length
    };

    // Cache the result
    apiCache.set(cacheKey, result);

    return NextResponse.json(result);

  } catch (error) {
    logger.error('Failed to search catalogues by region', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

