import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { eventCache, generateCacheKey } from '@/lib/cache';
import { requireViewer } from '@/lib/auth/middleware';
import { decodeEventCursor } from '@/lib/event-cursor';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

const logger = new Logger('CatalogueEventsAPI');
const MAX_EVENTS_REQUEST_LIMIT = Number.parseInt(process.env.MAX_EVENTS_REQUEST_LIMIT || '0', 10);
const HARD_LIMIT = 10000;

function exceedsConfiguredLimit(value: number): boolean {
  return Number.isFinite(MAX_EVENTS_REQUEST_LIMIT) && MAX_EVENTS_REQUEST_LIMIT > 0 && value > MAX_EVENTS_REQUEST_LIMIT;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const authResult = await requireViewer(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const catalogueId = id;
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');
    if (view && view !== 'summary') {
      return NextResponse.json({ error: 'Invalid event view' }, { status: 400 });
    }
    const summary = view === 'summary';

    // Parse pagination parameters
    const page = searchParams.get('page');
    const pageSize = searchParams.get('pageSize');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    // Performance Optimization: Cursor-based pagination parameters
    const cursor = searchParams.get('cursor');
    const direction = searchParams.get('direction') as 'asc' | 'desc' | null;

    logger.info('Fetching events for catalogue', {
      catalogueId,
      page,
      pageSize,
      limit,
      offset,
      cursor,
      direction
    });

    // Determine pagination strategy
    let events;
    let cacheKey: string;

    // Performance Optimization: Prefer cursor-based pagination for better performance
    if (summary || cursor !== null || (limit && !page && !pageSize && !offset)) {
      // Cursor-based pagination (most efficient for large datasets)
      const rawLimit = limit ? parseInt(limit, 10) : 100;
      const limitNum = Math.min(rawLimit, HARD_LIMIT,
        summary && MAX_EVENTS_REQUEST_LIMIT > 0 ? MAX_EVENTS_REQUEST_LIMIT : HARD_LIMIT);

      if (isNaN(rawLimit) || rawLimit < 1) {
        return NextResponse.json(
          { error: 'Invalid limit. Must be >= 1' },
          { status: 400 }
        );
      }
      if (exceedsConfiguredLimit(limitNum)) {
        return NextResponse.json(
          { error: `Invalid limit. Must be between 1 and ${MAX_EVENTS_REQUEST_LIMIT}` },
          { status: 400 }
        );
      }

      const validDirection = direction === 'asc' || direction === 'desc' ? direction : 'desc';
      if (cursor) decodeEventCursor(cursor);

      cacheKey = generateCacheKey('events-cursor', {
        catalogueId,
        cursor: cursor || 'start',
        limit: limitNum,
        direction: validDirection,
        summary
      });

      // Try cache first
      const cached = eventCache.get(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueIdCursor(catalogueId, {
          cursor: cursor || undefined,
          limit: limitNum,
          direction: validDirection,
          summary
        });
        eventCache.set(cacheKey, events);
      }
    } else if (page && pageSize) {
      // Page-based pagination
      const pageNum = parseInt(page, 10);
      const rawPageSize = parseInt(pageSize, 10);
      const pageSizeNum = Math.min(rawPageSize, HARD_LIMIT);

      if (isNaN(pageNum) || pageNum < 1) {
        return NextResponse.json(
          { error: 'Invalid page number. Must be >= 1' },
          { status: 400 }
        );
      }

      if (isNaN(rawPageSize) || rawPageSize < 1) {
        return NextResponse.json(
          { error: 'Invalid page size. Must be >= 1' },
          { status: 400 }
        );
      }

      if (exceedsConfiguredLimit(pageSizeNum)) {
        return NextResponse.json(
          { error: `Invalid page size. Must be between 1 and ${MAX_EVENTS_REQUEST_LIMIT}` },
          { status: 400 }
        );
      }

      cacheKey = generateCacheKey('events', { catalogueId, page: pageNum, pageSize: pageSizeNum });

      // Try cache first
      const cached = eventCache.get(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueId(catalogueId, {
          page: pageNum,
          pageSize: pageSizeNum
        });
        eventCache.set(cacheKey, events);
      }
    } else if (limit || offset) {
      // Limit/offset pagination
      const limitNum = limit ? parseInt(limit, 10) : 100;
      const offsetNum = offset ? parseInt(offset, 10) : 0;

      if (isNaN(limitNum) || limitNum < 1 || exceedsConfiguredLimit(limitNum)) {
        return NextResponse.json(
          {
            error: MAX_EVENTS_REQUEST_LIMIT > 0
              ? `Invalid limit. Must be between 1 and ${MAX_EVENTS_REQUEST_LIMIT}`
              : 'Invalid limit. Must be >= 1'
          },
          { status: 400 }
        );
      }

      if (isNaN(offsetNum) || offsetNum < 0) {
        return NextResponse.json(
          { error: 'Invalid offset. Must be >= 0' },
          { status: 400 }
        );
      }

      cacheKey = generateCacheKey('events', { catalogueId, limit: limitNum, offset: offsetNum });

      // Try cache first
      const cached = eventCache.get(cacheKey);
      if (cached) {
        events = cached;
      } else {
        // Pass the offset through as an absolute skip. Converting it to a page
        // number first (Math.floor(offset / limit) + 1) rounded it down to a
        // multiple of the limit, so e.g. limit=100&offset=150 returned rows
        // 100-199 instead of the documented 150-249 — half the window duplicated
        // from the previous page and half never returned.
        events = await dbQueries.getEventsByCatalogueId(catalogueId, {
          offset: offsetNum,
          pageSize: limitNum
        });
        eventCache.set(cacheKey, events);
      }
    } else {
      // No pagination - return all events (backward compatibility)
      cacheKey = generateCacheKey('events', { catalogueId, all: true });

      // Try cache first
      const cached = eventCache.get(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueId(catalogueId);
        eventCache.set(cacheKey, events);
      }
    }

    logger.info('Events fetched successfully', {
      catalogueId,
      count: Array.isArray(events) ? events.length : (events && typeof events === 'object' && 'data' in events ? (events as { data?: unknown[] }).data?.length : 0) || 0
    });

    return NextResponse.json(events);
  } catch (error) {
    logger.error('Failed to fetch catalogue events', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
