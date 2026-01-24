import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { eventCache, generateCacheKey } from '@/lib/cache';
import { requireViewer } from '@/lib/auth/middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

const logger = new Logger('CatalogueEventsAPI');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const catalogueId = params.id;
    const { searchParams } = new URL(request.url);

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
    if (cursor !== null || (limit && !page && !pageSize && !offset)) {
      // Cursor-based pagination (most efficient for large datasets)
      const limitNum = limit ? parseInt(limit, 10) : 100;

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 40000) {
        return NextResponse.json(
          { error: 'Invalid limit. Must be between 1 and 40000' },
          { status: 400 }
        );
      }

      const validDirection = direction === 'asc' || direction === 'desc' ? direction : 'desc';

      cacheKey = generateCacheKey('events-cursor', {
        catalogueId,
        cursor: cursor || 'start',
        limit: limitNum,
        direction: validDirection
      });

      // Try cache first
      const cached = eventCache.get(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueIdCursor(catalogueId, {
          cursor: cursor || undefined,
          limit: limitNum,
          direction: validDirection
        });
        eventCache.set(cacheKey, events);
      }
    } else if (page && pageSize) {
      // Page-based pagination
      const pageNum = parseInt(page, 10);
      const pageSizeNum = parseInt(pageSize, 10);

      if (isNaN(pageNum) || pageNum < 1) {
        return NextResponse.json(
          { error: 'Invalid page number. Must be >= 1' },
          { status: 400 }
        );
      }

      if (isNaN(pageSizeNum) || pageSizeNum < 1 || pageSizeNum > 40000) {
        return NextResponse.json(
          { error: 'Invalid page size. Must be between 1 and 40000' },
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

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 40000) {
        return NextResponse.json(
          { error: 'Invalid limit. Must be between 1 and 40000' },
          { status: 400 }
        );
      }

      if (isNaN(offsetNum) || offsetNum < 0) {
        return NextResponse.json(
          { error: 'Invalid offset. Must be >= 0' },
          { status: 400 }
        );
      }

      // Convert limit/offset to page-based
      const page = Math.floor(offsetNum / limitNum) + 1;

      cacheKey = generateCacheKey('events', { catalogueId, limit: limitNum, offset: offsetNum });

      // Try cache first
      const cached = eventCache.get(cacheKey);
      if (cached) {
        events = cached;
      } else {
        events = await dbQueries.getEventsByCatalogueId(catalogueId, {
          page,
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
