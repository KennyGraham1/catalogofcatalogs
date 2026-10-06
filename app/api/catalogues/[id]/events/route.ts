import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, toEventMapRow, type CursorPaginatedResult, type EventSummary } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse } from '@/lib/errors';
import { catalogueScope, eventCache, generateCacheKey, getCacheGeneration } from '@/lib/cache';
import { requireViewer } from '@/lib/auth/middleware';
import { decodeEventCursor } from '@/lib/event-cursor';
import { GUEST_MAP_RATE_LIMIT, applyRateLimit, guestMapRateLimiter } from '@/lib/rate-limiter';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

const logger = new Logger('CatalogueEventsAPI');
const MAX_EVENTS_REQUEST_LIMIT = Number.parseInt(process.env.MAX_EVENTS_REQUEST_LIMIT || '0', 10);
const HARD_LIMIT = 10000;

function exceedsConfiguredLimit(value: number): boolean {
  return Number.isFinite(MAX_EVENTS_REQUEST_LIMIT) && MAX_EVENTS_REQUEST_LIMIT > 0 && value > MAX_EVENTS_REQUEST_LIMIT;
}

/**
 * Events of one catalogue, in three views:
 * - full records (no `view`) and `view=summary` need a viewer session;
 * - `view=map` (EVENT_MAP_PROJECTION's fields only) is public, like the catalogue list,
 *   for a catalogue the list shows. Signed-out clients are rate-limited per address
 *   (GUEST_MAP_RATE_LIMIT); signed-in viewers are not.
 * Summary and map pages use the same cursor pagination and caps.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');
  const mapView = view === 'map';

  const authResult = await requireViewer(request);
  const signedIn = !(authResult instanceof NextResponse);
  if (!signedIn && !mapView) return authResult;

  if (!signedIn) {
    const rateLimit = applyRateLimit(request, guestMapRateLimiter, GUEST_MAP_RATE_LIMIT.requests);
    if (!rateLimit.success) {
      return NextResponse.json(
        {
          error: 'Too many map requests from your network. Wait a few minutes and try again, or sign in to load maps without this limit.',
          retryAfter: rateLimit.headers['Retry-After'],
        },
        { status: 429, headers: rateLimit.headers }
      );
    }
  }

  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const catalogueId = id;
    if (view && view !== 'summary' && view !== 'map') {
      return NextResponse.json({ error: 'Invalid event view' }, { status: 400 });
    }
    // The public view only covers catalogues the public list shows (getCatalogueById
    // applies the list's filter): a catalogue being deleted is not mapped.
    if (mapView && !(await dbQueries.getCatalogueById(catalogueId))) {
      throw new NotFoundError('Catalogue');
    }
    // Map pages are summary pages (same query, caps and cache entries) cut to the map's
    // fields just before they are sent.
    const summary = view === 'summary' || mapView;

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

    // Cached pages are keyed by the catalogue's cache generation, taken before the
    // database is read: any write to the catalogue (in this or another server
    // instance) moves it on, so a page read before the write is never served after
    // it. A null generation means it could not be read; the cache is then bypassed.
    const generation = await getCacheGeneration(catalogueScope(catalogueId));
    const cachedPage = (key: string) => (generation === null ? null : eventCache.get(key));
    const cachePage = (key: string, value: unknown) => {
      if (generation !== null) eventCache.set(key, value);
    };

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
        summary,
        generation
      });

      // Try cache first
      const cached = cachedPage(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueIdCursor(catalogueId, {
          cursor: cursor || undefined,
          limit: limitNum,
          direction: validDirection,
          summary
        });
        cachePage(cacheKey, events);
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

      cacheKey = generateCacheKey('events', { catalogueId, page: pageNum, pageSize: pageSizeNum, generation });

      // Try cache first
      const cached = cachedPage(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueId(catalogueId, {
          page: pageNum,
          pageSize: pageSizeNum
        });
        cachePage(cacheKey, events);
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

      cacheKey = generateCacheKey('events', { catalogueId, limit: limitNum, offset: offsetNum, generation });

      // Try cache first
      const cached = cachedPage(cacheKey);
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
        cachePage(cacheKey, events);
      }
    } else {
      // No pagination - return all events (backward compatibility)
      cacheKey = generateCacheKey('events', { catalogueId, all: true, generation });

      // Try cache first
      const cached = cachedPage(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueId(catalogueId);
        cachePage(cacheKey, events);
      }
    }

    logger.info('Events fetched successfully', {
      catalogueId,
      count: Array.isArray(events) ? events.length : (events && typeof events === 'object' && 'data' in events ? (events as { data?: unknown[] }).data?.length : 0) || 0
    });

    if (mapView) {
      const summaryPage = events as CursorPaginatedResult<EventSummary>;
      return NextResponse.json({ ...summaryPage, data: summaryPage.data.map(toEventMapRow) });
    }
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
