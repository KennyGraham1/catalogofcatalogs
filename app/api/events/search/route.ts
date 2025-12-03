import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { applyRateLimit, apiRateLimiter } from '@/lib/rate-limiter';

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
      // Create a display label for the search result
      label: `${row.magnitude ? `M${row.magnitude}` : 'Unknown'} ${row.event_type || 'Unknown type'} - ${new Date(row.time).toLocaleDateString()}`,
      description: `${row.public_id || row.id} • ${row.catalogue_name || 'Unknown catalogue'}`,
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

