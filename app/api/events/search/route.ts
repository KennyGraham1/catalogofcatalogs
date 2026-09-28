import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, MAX_SEARCH_RESULTS } from '@/lib/db';
import { formatErrorResponse } from '@/lib/errors';
import { applyRateLimit, apiRateLimiter } from '@/lib/rate-limiter';
import { requireViewer } from '@/lib/auth/middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

// Global search API endpoint for searching events across all catalogues
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Apply rate limiting (60 requests per minute for search operations)
    const rateLimitResult = applyRateLimit(request, apiRateLimiter, 60);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Too many search requests. Please try again later.',
          retryAfter: rateLimitResult.headers['Retry-After'],
        },
        {
          status: 429,
          headers: rateLimitResult.headers,
        }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const catalogueId = searchParams.get('catalogueId') || undefined;

    // The result count is bounded. The driver reads limit(0) as "no limit", and a huge
    // or unparsed value did the same: one request could load every matching event.
    // A whole number of at least 1 is required; anything above the cap is capped.
    const rawLimit = (searchParams.get('limit') ?? '').trim();
    const requestedLimit = rawLimit === '' ? 20 : Number(rawLimit);
    if ((rawLimit !== '' && !/^\d+$/.test(rawLimit)) || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
      return NextResponse.json(
        { error: 'Invalid limit: must be a whole number of at least 1' },
        { status: 400 }
      );
    }
    const limit = Math.min(requestedLimit, MAX_SEARCH_RESULTS);

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // Use the new searchEvents method
    const results = await dbQueries.searchEvents(query, limit, catalogueId);

    // Format results for display
    const formattedResults = results.map((row: any) => ({
      id: row.id,
      catalogueId: row.catalogue_id,
      catalogueName: row.catalogue_name,
      publicId: row.public_id,
      time: row.time,
      latitude: row.latitude,
      longitude: row.longitude,
      depth: row.depth,
      magnitude: row.magnitude,
      magnitudeType: row.magnitude_type,
      eventType: row.event_type,
      region: row.region || null,
      locationName: row.location_name || row.region || null,
      // Create a display label for the search result
      label: (() => {
        // M0.0 is a magnitude; only a missing one is unknown.
        const magnitudeLabel = row.magnitude != null ? `M${row.magnitude}` : 'Unknown magnitude';
        const locationLabel = row.location_name || row.region;
        const dateLabel = new Date(row.time).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        if (locationLabel) {
          return `${magnitudeLabel} ${locationLabel} - ${dateLabel}`;
        }
        return `${magnitudeLabel} ${row.event_type || 'Unknown type'} - ${dateLabel}`;
      })(),
      description: `${row.public_id || row.id} • ${row.event_type || 'Unknown type'} • ${row.catalogue_name || 'Unknown catalogue'}`,
    }));

    return NextResponse.json({
      results: formattedResults,
      count: formattedResults.length,
      query: query.trim(),
    });
  } catch (error) {
    // An unparseable filter token (e.g. mag:abc, date:2024-13-01) is the caller's
    // error: answer 400 with the reason rather than ignoring the token.
    const errorResponse = formatErrorResponse(error);
    if (errorResponse.statusCode === 400) {
      return NextResponse.json({ error: errorResponse.error }, { status: 400 });
    }
    console.error('Error searching events:', error);
    return NextResponse.json(
      { error: 'Failed to search events', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
