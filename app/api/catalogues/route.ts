import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, DatabaseError, formatErrorResponse } from '@/lib/errors';
import { apiCache, generateCacheKey, catalogueCache, invalidateCacheByPrefix } from '@/lib/cache';
import { applyRateLimit, readRateLimiter, apiRateLimiter } from '@/lib/rate-limiter';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('CataloguesAPI');

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting (120 requests per minute for read operations)
    const rateLimitResult = applyRateLimit(request, readRateLimiter, 120);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.headers['Retry-After'],
        },
        {
          status: 429,
          headers: rateLimitResult.headers,
        }
      );
    }

    const cacheKey = generateCacheKey('catalogues', { all: true });

    // Try to get from cache
    const cached = catalogueCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // Fetch from database
    const catalogues = await dbQueries.getCatalogues();

    // Store in cache
    catalogueCache.set(cacheKey, catalogues);

    return NextResponse.json(catalogues);
  } catch (error) {
    logger.error('Failed to fetch catalogues', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting (30 requests per minute for write operations)
    const rateLimitResult = applyRateLimit(request, apiRateLimiter, 30);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.headers['Retry-After'],
        },
        {
          status: 429,
          headers: rateLimitResult.headers,
        }
      );
    }

    const body = await request.json();
    const { name, events, metadata } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Catalogue name is required' },
        { status: 400 }
      );
    }

    if (!events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Events array is required' },
        { status: 400 }
      );
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // Generate catalogue ID
    const catalogueId = uuidv4();

    // Calculate geographic bounds
    let minLat: number | undefined;
    let maxLat: number | undefined;
    let minLon: number | undefined;
    let maxLon: number | undefined;

    if (events.length > 0) {
      const lats = events.map(e => e.latitude).filter(lat => typeof lat === 'number');
      const lons = events.map(e => e.longitude).filter(lon => typeof lon === 'number');

      if (lats.length > 0) {
        minLat = Math.min(...lats);
        maxLat = Math.max(...lats);
      }
      if (lons.length > 0) {
        minLon = Math.min(...lons);
        maxLon = Math.max(...lons);
      }
    }

    // Insert catalogue
    await dbQueries.insertCatalogue(
      catalogueId,
      name.trim(),
      JSON.stringify([{ source: 'upload', description: 'Uploaded catalogue' }]),
      JSON.stringify({ uploadDate: new Date().toISOString() }),
      events.length,
      'complete',
      {
        ...metadata,
        min_latitude: minLat,
        max_latitude: maxLat,
        min_longitude: minLon,
        max_longitude: maxLon,
      }
    );

    // Insert events in bulk
    if (events.length > 0) {
      const eventsToInsert = events.map(event => ({
        id: event.id || uuidv4(),
        catalogue_id: catalogueId,
        source_id: event.source_id || event.eventId || event.id,
        time: event.time,
        latitude: event.latitude,
        longitude: event.longitude,
        depth: event.depth ?? null,
        magnitude: event.magnitude,
        source_events: JSON.stringify([{ source: 'upload', eventId: event.id || event.eventId }]),

        // Optional fields
        region: event.region,
        location_name: event.location_name,
        event_public_id: event.event_public_id || event.publicID,
        event_type: event.event_type || event.eventType,
        event_type_certainty: event.event_type_certainty,

        // Uncertainties
        time_uncertainty: event.time_uncertainty,
        latitude_uncertainty: event.latitude_uncertainty,
        longitude_uncertainty: event.longitude_uncertainty,
        depth_uncertainty: event.depth_uncertainty,

        // Magnitude details
        magnitude_type: event.magnitude_type || event.magnitudeType,
        magnitude_uncertainty: event.magnitude_uncertainty,
        magnitude_station_count: event.magnitude_station_count,

        // Quality metrics
        azimuthal_gap: event.azimuthal_gap || event.azimuthalGap,
        minimum_distance: event.minimum_distance,
        used_phase_count: event.used_phase_count || event.usedPhaseCount,
        used_station_count: event.used_station_count || event.usedStationCount,
        standard_error: event.standard_error,

        // Evaluation
        evaluation_mode: event.evaluation_mode,
        evaluation_status: event.evaluation_status,

        // Agency info
        author: event.author,
        agency_id: event.agency_id,

        // Additional info
        comment: event.comment,
        creation_info: event.creation_info ? JSON.stringify(event.creation_info) : null,
      }));

      await dbQueries.bulkInsertEvents(eventsToInsert);
    }

    // Invalidate cache
    invalidateCacheByPrefix('catalogues');

    logger.info('Catalogue created successfully', {
      catalogueId,
      name,
      eventCount: events.length
    });

    // Fetch the created catalogue to return
    const catalogue = await dbQueries.getCatalogueById(catalogueId);

    return NextResponse.json(catalogue, { status: 201 });

  } catch (error) {
    logger.error('Failed to create catalogue', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

