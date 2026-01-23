import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, DatabaseError, formatErrorResponse } from '@/lib/errors';
import { apiCache } from '@/lib/cache';
import { requireEditor } from '@/lib/auth/middleware';

const logger = new Logger('CatalogueAPI');

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    logger.info('Fetching catalogue', { id: params.id });

    const catalogue = await dbQueries.getCatalogueById(params.id);

    if (!catalogue) {
      throw new NotFoundError('Catalogue');
    }

    return NextResponse.json(catalogue);
  } catch (error) {
    logger.error('Failed to fetch catalogue', error, { id: params.id });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    logger.info('Updating catalogue', { id: params.id });

    const body = await request.json();
    const { name, ...metadata } = body;

    // Validate catalogue name if provided
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json(
        { error: 'Invalid catalogue name' },
        { status: 400 }
      );
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // Update name if provided
    if (name && name.trim()) {
      await dbQueries.updateCatalogueName(name, params.id);
    }

    // Update metadata if any metadata fields are provided
    const metadataKeys = Object.keys(metadata);
    if (metadataKeys.length > 0) {
      await dbQueries.updateCatalogueMetadata(params.id, metadata);
    }

    logger.info('Catalogue updated successfully', { id: params.id });

    // Clear cache since catalogue was updated
    apiCache.clearAll();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to update catalogue', error, { id: params.id });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    logger.info('Deleting catalogue', { id: params.id });

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    await dbQueries.deleteCatalogue(params.id);

    logger.info('Catalogue deleted successfully', { id: params.id });

    // Clear cache since catalogue was deleted
    apiCache.clearAll();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete catalogue', error, { id: params.id });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}