import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('SavedFiltersAPI');

/**
 * GET /api/saved-filters
 * Returns all saved filters
 */
export async function GET() {
  try {
    const filters = await dbQueries.getSavedFilters();
    return NextResponse.json(filters);
  } catch (error) {
    logger.error('Failed to fetch saved filters', error);
    const errorResponse = formatErrorResponse(error);
    
    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

/**
 * POST /api/saved-filters
 * Create a new saved filter
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, filterConfig } = body;

    if (!name || !filterConfig) {
      return NextResponse.json(
        { error: 'Missing required fields: name and filterConfig' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const filterConfigString = JSON.stringify(filterConfig);

    await dbQueries.insertSavedFilter(id, name, description || null, filterConfigString);

    logger.info('Saved filter created', { id, name });

    return NextResponse.json({ id, name, description, filterConfig }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create saved filter', error);
    const errorResponse = formatErrorResponse(error);
    
    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

