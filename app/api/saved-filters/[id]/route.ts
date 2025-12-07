import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';

const logger = new Logger('SavedFilterAPI');

/**
 * GET /api/saved-filters/[id]
 * Returns a specific saved filter
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const filter = await dbQueries.getSavedFilterById(params.id);

    if (!filter) {
      return NextResponse.json(
        { error: 'Saved filter not found' },
        { status: 404 }
      );
    }

    // Parse the filter config JSON
    const filterConfig = JSON.parse(filter.filter_config);

    return NextResponse.json({
      ...filter,
      filterConfig,
    });
  } catch (error) {
    logger.error('Failed to fetch saved filter', error);
    const errorResponse = formatErrorResponse(error);
    
    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

/**
 * PUT /api/saved-filters/[id]
 * Update a saved filter
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    const body = await request.json();
    const { name, description, filterConfig } = body;

    if (!name || !filterConfig) {
      return NextResponse.json(
        { error: 'Missing required fields: name and filterConfig' },
        { status: 400 }
      );
    }

    const filterConfigString = JSON.stringify(filterConfig);

    await dbQueries.updateSavedFilter(params.id, name, description || null, filterConfigString);

    logger.info('Saved filter updated', { id: params.id, name });

    return NextResponse.json({ id: params.id, name, description, filterConfig });
  } catch (error) {
    logger.error('Failed to update saved filter', error);
    const errorResponse = formatErrorResponse(error);
    
    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

/**
 * DELETE /api/saved-filters/[id]
 * Delete a saved filter
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!dbQueries) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    await dbQueries.deleteSavedFilter(params.id);

    logger.info('Saved filter deleted', { id: params.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete saved filter', error);
    const errorResponse = formatErrorResponse(error);
    
    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

