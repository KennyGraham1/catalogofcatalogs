import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';

const logger = new Logger('CatalogueEventsAPI');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const catalogueId = params.id;
    logger.info('Fetching events for catalogue', { catalogueId });

    const events = await dbQueries.getEventsByCatalogueId(catalogueId);

    logger.info('Events fetched successfully', { 
      catalogueId, 
      count: Array.isArray(events) ? events.length : events.data?.length || 0 
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

