import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, DatabaseError, formatErrorResponse } from '@/lib/errors';
import { apiCache } from '@/lib/cache';
import { getSession } from '@/lib/auth';
import { auditApiAction } from '@/lib/api-middleware';
import { withCSRF } from '@/lib/csrf';

const logger = new Logger('CatalogueAPI');

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
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

export const PATCH = withCSRF(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  try {
    logger.info('Updating catalogue', { id: params.id });

    // Get authenticated user
    const session = await getSession();
    const userId = session?.user?.id;

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
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

    await dbQueries.updateCatalogueName(name, params.id);

    // Update modified_by and modified_at if user is authenticated
    if (userId) {
      await dbQueries.updateCatalogueMetadata(params.id, {
        modified_by: userId,
        modified_at: new Date().toISOString(),
      });

      // Create audit log
      await auditApiAction(request as any, 'update_catalogue', 'catalogue', params.id, {
        name,
      });
    }

    logger.info('Catalogue updated successfully', { id: params.id, userId });

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
});

export const DELETE = withCSRF(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  try {
    logger.info('Deleting catalogue', { id: params.id });

    // Get authenticated user
    const session = await getSession();
    const userId = session?.user?.id;

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    await dbQueries.deleteCatalogue(params.id);

    // Create audit log if user is authenticated
    if (userId) {
      await auditApiAction(request as any, 'delete_catalogue', 'catalogue', params.id);
    }

    logger.info('Catalogue deleted successfully', { id: params.id, userId });

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
});