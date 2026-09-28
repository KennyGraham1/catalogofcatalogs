/**
 * API endpoint to get filtered events from a catalogue
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { parseEventFilterParams } from '@/lib/event-filter-params';
import { formatErrorResponse } from '@/lib/errors';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

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

    const catalogueId = id;
    const { searchParams } = new URL(request.url);

    // One strict parser for every filter (shared with filtered exports): a value that
    // does not parse completely, or lies outside its range, is a 400 naming the
    // parameter. parseFloat used to read '4,7' as 4 and 'M4' as NaN, which returned
    // 200 with silently wrong or empty results.
    const parsed = parseEventFilterParams(searchParams);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const filters = parsed.filters;

    // Get filtered events
    const { events, truncated, limit } = await dbQueries.getFilteredEvents(catalogueId, filters);

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
      truncated,
      limit,
      filters
    });
  } catch (error) {
    console.error('Error filtering events:', error);
    const errorResponse = formatErrorResponse(error);
    // Validation failures from the query builder keep their 400; anything else is
    // reported without leaking internals.
    if (errorResponse.statusCode === 400) {
      return NextResponse.json({ error: errorResponse.error }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to filter events' },
      { status: 500 }
    );
  }
}
