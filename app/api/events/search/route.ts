import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { applyRateLimit, apiRateLimiter } from '@/lib/rate-limiter';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

// Global search API endpoint for searching events across all catalogues
export async function GET(request: NextRequest) {
  try {
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
    const limit = parseInt(searchParams.get('limit') || '20');
    const catalogueId = searchParams.get('catalogueId') || undefined;

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
        const magnitudeLabel = row.magnitude ? `M${row.magnitude}` : 'Unknown magnitude';
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
    console.error('Error searching events:', error);
    return NextResponse.json(
      { error: 'Failed to search events', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
