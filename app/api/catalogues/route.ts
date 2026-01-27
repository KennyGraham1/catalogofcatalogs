import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, DatabaseError, formatErrorResponse } from '@/lib/errors';
import { apiCache, generateCacheKey, catalogueCache, invalidateCacheByPrefix } from '@/lib/cache';
import { applyRateLimit, readRateLimiter, apiRateLimiter } from '@/lib/rate-limiter';
import { requireEditor } from '@/lib/auth/middleware';
import { v4 as uuidv4 } from 'uuid';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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

// Maximum request body size (100MB for events array)
const MAX_BODY_SIZE = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Check Content-Length header for early rejection
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const parsedLength = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(parsedLength) && parsedLength > MAX_BODY_SIZE) {
        return NextResponse.json(
          {
            error: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB.`,
            code: 'BODY_TOO_LARGE',
          },
          { status: 413 }
        );
      }
    }

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

    const rawBody = await request.text();
    const rawBodySize = new TextEncoder().encode(rawBody).length;
    if (rawBodySize > MAX_BODY_SIZE) {
      return NextResponse.json(
        {
          error: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB.`,
          code: 'BODY_TOO_LARGE',
        },
        { status: 413 }
      );
    }

    let body: any;
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }
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
        { error: 'Events array is required', code: 'INVALID_EVENTS' },
        { status: 400 }
      );
    }

    // Basic validation of events - check required fields on first 100 events
    const eventsToValidate = events.slice(0, 100);
    const invalidEvents: { index: number; reason: string }[] = [];

    for (let i = 0; i < eventsToValidate.length; i++) {
      const event = eventsToValidate[i];
      const missingFields: string[] = [];

      if (!event.time) missingFields.push('time');
      if (event.latitude === undefined || event.latitude === null) missingFields.push('latitude');
      if (event.longitude === undefined || event.longitude === null) missingFields.push('longitude');
      if (event.magnitude === undefined || event.magnitude === null) missingFields.push('magnitude');

      if (missingFields.length > 0) {
        invalidEvents.push({ index: i, reason: `Missing required fields: ${missingFields.join(', ')}` });
      }
    }

    if (invalidEvents.length > 0) {
      return NextResponse.json(
        {
          error: `${invalidEvents.length} event(s) failed validation`,
          code: 'INVALID_EVENTS',
          details: invalidEvents.slice(0, 10), // Return first 10 errors
          totalInvalid: invalidEvents.length,
        },
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

    // Calculate geographic bounds in single pass (more efficient for large datasets)
    let minLat: number | undefined;
    let maxLat: number | undefined;
    let minLon: number | undefined;
    let maxLon: number | undefined;

    for (const event of events) {
      const lat = typeof event.latitude === 'number' ? event.latitude : null;
      const lon = typeof event.longitude === 'number' ? event.longitude : null;

      if (lat !== null) {
        if (minLat === undefined || lat < minLat) minLat = lat;
        if (maxLat === undefined || lat > maxLat) maxLat = lat;
      }
      if (lon !== null) {
        if (minLon === undefined || lon < minLon) minLon = lon;
        if (maxLon === undefined || lon > maxLon) maxLon = lon;
      }
    }

    // Helper to safely parse numeric values
    const safeParseNumber = (value: any): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      return isNaN(num) ? null : num;
    };

    // Insert catalogue first
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

    // Insert events in bulk with cleanup on failure
    if (events.length > 0) {
      const eventsToInsert = events.map(event => {
        // Parse required numeric fields - use 0 as fallback for required fields
        const latitude = safeParseNumber(event.latitude);
        const longitude = safeParseNumber(event.longitude);
        const magnitude = safeParseNumber(event.magnitude);

        return {
          // Always generate a unique UUID for the primary ID to avoid duplicate key errors
          // Store original IDs in source_id for reference
          id: uuidv4(),
          catalogue_id: catalogueId,
          source_id: event.source_id || event.eventId || event.id || undefined,
          time: event.time || '',
          latitude: latitude ?? 0,
          longitude: longitude ?? 0,
          magnitude: magnitude ?? 0,
          source_events: JSON.stringify([{ source: 'upload', eventId: event.id || event.eventId }]),

          // Optional fields
          depth: safeParseNumber(event.depth) ?? undefined,
          region: event.region,
          location_name: event.location_name,
          event_public_id: event.event_public_id || event.publicID,
          event_type: event.event_type || event.eventType,
          event_type_certainty: event.event_type_certainty,

          // Uncertainties (ensure numeric types)
          time_uncertainty: safeParseNumber(event.time_uncertainty) ?? undefined,
          latitude_uncertainty: safeParseNumber(event.latitude_uncertainty) ?? undefined,
          longitude_uncertainty: safeParseNumber(event.longitude_uncertainty) ?? undefined,
          depth_uncertainty: safeParseNumber(event.depth_uncertainty) ?? undefined,

          // Magnitude details
          magnitude_type: event.magnitude_type || event.magnitudeType,
          magnitude_uncertainty: safeParseNumber(event.magnitude_uncertainty) ?? undefined,
          magnitude_station_count: safeParseNumber(event.magnitude_station_count) ?? undefined,

          // Quality metrics (ensure numeric types)
          azimuthal_gap: safeParseNumber(event.azimuthal_gap || event.azimuthalGap) ?? undefined,
          minimum_distance: safeParseNumber(event.minimum_distance) ?? undefined,
          used_phase_count: safeParseNumber(event.used_phase_count || event.usedPhaseCount) ?? undefined,
          used_station_count: safeParseNumber(event.used_station_count || event.usedStationCount) ?? undefined,
          standard_error: safeParseNumber(event.standard_error) ?? undefined,

          // Evaluation
          evaluation_mode: event.evaluation_mode,
          evaluation_status: event.evaluation_status,

          // Agency info
          author: event.author,
          agency_id: event.agency_id,

          // Additional info
          comment: event.comment,
          creation_info: event.creation_info ? JSON.stringify(event.creation_info) : undefined,
        };
      });

      try {
        await dbQueries.bulkInsertEvents(eventsToInsert);
      } catch (bulkInsertError) {
        // Clean up the catalogue if bulk insert fails to prevent orphaned data
        logger.error('Bulk insert failed, cleaning up catalogue', { catalogueId, error: bulkInsertError });
        try {
          await dbQueries.deleteCatalogue(catalogueId);
        } catch (cleanupError) {
          logger.error('Failed to clean up catalogue after bulk insert failure', { catalogueId, error: cleanupError });
        }
        throw bulkInsertError;
      }
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
