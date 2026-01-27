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
        { error: 'Database not initialized', code: 'DB_NOT_INITIALIZED' },
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
        { error: 'Catalogue name is required', code: 'MISSING_NAME' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 255) {
      return NextResponse.json(
        { error: 'Catalogue name must be 255 characters or less', code: 'NAME_TOO_LONG' },
        { status: 400 }
      );
    }

    if (!events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Events array is required', code: 'INVALID_EVENTS' },
        { status: 400 }
      );
    }

    // Helper to safely parse numeric values
    const safeParseNumber = (value: any): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      return isNaN(num) ? null : num;
    };

    // Comprehensive validation of ALL events - check required fields and value ranges
    // Partition events into valid and invalid arrays for partial import support
    const invalidEvents: { index: number; reason: string }[] = [];
    const validEvents: { event: typeof events[0]; index: number }[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const errors: string[] = [];

      // Check required field presence
      if (!event.time || (typeof event.time === 'string' && event.time.trim() === '')) {
        errors.push('time is required');
      } else {
        // Validate timestamp format
        const date = new Date(event.time);
        if (isNaN(date.getTime())) {
          errors.push('time is not a valid timestamp');
        }
      }

      const latitude = safeParseNumber(event.latitude);
      const longitude = safeParseNumber(event.longitude);
      const magnitude = safeParseNumber(event.magnitude);
      const depth = safeParseNumber(event.depth);

      if (latitude === null) {
        errors.push('latitude is required and must be a number');
      } else if (latitude < -90 || latitude > 90) {
        errors.push(`latitude ${latitude} must be between -90 and 90`);
      }

      if (longitude === null) {
        errors.push('longitude is required and must be a number');
      } else if (longitude < -180 || longitude > 180) {
        errors.push(`longitude ${longitude} must be between -180 and 180`);
      }

      if (magnitude === null) {
        errors.push('magnitude is required and must be a number');
      } else if (magnitude < -3 || magnitude > 10) {
        errors.push(`magnitude ${magnitude} must be between -3 and 10`);
      }

      // Depth is optional but must be valid if present
      if (depth !== null && (depth < 0 || depth > 1000)) {
        errors.push(`depth ${depth} must be between 0 and 1000 km`);
      }

      if (errors.length > 0) {
        invalidEvents.push({ index: i, reason: errors.join('; ') });
      } else {
        // Event passed validation - add to valid events array
        validEvents.push({ event, index: i });
      }
    }

    // If ALL events are invalid, reject the entire request
    if (validEvents.length === 0) {
      return NextResponse.json(
        {
          error: `All ${invalidEvents.length} event(s) failed validation. No events could be imported.`,
          code: 'ALL_EVENTS_INVALID',
          details: invalidEvents.slice(0, 100), // Return first 100 errors for debugging
          totalInvalid: invalidEvents.length,
          message: 'All events must have valid time, latitude (-90 to 90), longitude (-180 to 180), and magnitude (-3 to 10)',
        },
        { status: 400 }
      );
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized', code: 'DB_NOT_INITIALIZED' },
        { status: 500 }
      );
    }

    // Generate catalogue ID
    const catalogueId = uuidv4();

    // Calculate geographic bounds from VALID events only (more efficient for large datasets)
    let minLat: number | undefined;
    let maxLat: number | undefined;
    let minLon: number | undefined;
    let maxLon: number | undefined;

    for (const { event } of validEvents) {
      const lat = safeParseNumber(event.latitude);
      const lon = safeParseNumber(event.longitude);

      if (lat !== null) {
        if (minLat === undefined || lat < minLat) minLat = lat;
        if (maxLat === undefined || lat > maxLat) maxLat = lat;
      }
      if (lon !== null) {
        if (minLon === undefined || lon < minLon) minLon = lon;
        if (maxLon === undefined || lon > maxLon) maxLon = lon;
      }
    }

    // Prepare ONLY VALID events for insertion
    const eventsToInsert = validEvents.map(({ event }) => {
      // Parse required numeric fields - already validated above, so these are guaranteed to be valid
      const latitude = safeParseNumber(event.latitude)!;
      const longitude = safeParseNumber(event.longitude)!;
      const magnitude = safeParseNumber(event.magnitude)!;

      return {
        // Always generate a unique UUID for the primary ID to avoid duplicate key errors
        // Store original IDs in source_id for reference
        id: uuidv4(),
        catalogue_id: catalogueId,
        source_id: event.source_id || event.eventId || event.id || undefined,
        time: event.time, // Already validated to be a valid timestamp above
        latitude,
        longitude,
        magnitude,
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

    // Calculate validation statistics for the response
    const totalSubmitted = events.length;
    const successfullyImported = validEvents.length;
    const failedValidation = invalidEvents.length;
    const successRate = totalSubmitted > 0
      ? Math.round((successfullyImported / totalSubmitted) * 10000) / 100
      : 0;
    const isPartialImport = failedValidation > 0;

    // Use transaction to ensure atomic insertion of catalogue and events
    // If any operation fails, the entire transaction is rolled back
    // Note: dbQueries is guaranteed non-null after check at line 229
    const db = dbQueries!;
    await db.transaction(async (session) => {
      // Insert catalogue with ACTUAL imported event count (not total submitted)
      await db.insertCatalogue(
        catalogueId,
        trimmedName,
        JSON.stringify([{ source: 'upload', description: isPartialImport ? 'Uploaded catalogue (partial import)' : 'Uploaded catalogue' }]),
        JSON.stringify({
          uploadDate: new Date().toISOString(),
          partialImport: isPartialImport,
          validationSummary: {
            totalSubmitted,
            successfullyImported,
            failedValidation,
            successRate,
          }
        }),
        successfullyImported, // Use count of VALID events, not total
        'complete',
        {
          ...metadata,
          min_latitude: minLat,
          max_latitude: maxLat,
          min_longitude: minLon,
          max_longitude: maxLon,
        },
        session
      );

      // Insert only valid events in bulk
      if (eventsToInsert.length > 0) {
        await db.bulkInsertEvents(eventsToInsert, session);
      }
    });

    // Invalidate cache only after successful insertion
    invalidateCacheByPrefix('catalogues');

    // Log with both success and failure counts
    logger.info('Catalogue created successfully', {
      catalogueId,
      name,
      eventCount: successfullyImported,
      totalSubmitted,
      failedValidation,
      isPartialImport,
    });

    // Fetch the created catalogue to return
    const catalogue = await dbQueries.getCatalogueById(catalogueId);

    // Build comprehensive validation report
    const validationReport = {
      totalSubmitted,
      successfullyImported,
      failedValidation,
      successRate,
      // Limit invalid events details to first 100 for performance
      invalidEvents: invalidEvents.slice(0, 100),
      hasMoreInvalidEvents: invalidEvents.length > 100,
    };

    // Build response message
    const importMessage = isPartialImport
      ? `Imported ${successfullyImported.toLocaleString()} of ${totalSubmitted.toLocaleString()} events. ${failedValidation.toLocaleString()} event${failedValidation === 1 ? '' : 's'} failed validation.`
      : `Successfully imported all ${successfullyImported.toLocaleString()} events.`;

    // Return response with catalogue properties spread at top level for backward compatibility
    // Also include validationReport and partialImport metadata for clients that support it
    return NextResponse.json(
      {
        ...catalogue,
        validationReport,
        importMessage,
        partialImport: isPartialImport,
      },
      { status: 201 }
    );

  } catch (error) {
    logger.error('Failed to create catalogue', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
