import { NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, DatabaseError, formatErrorResponse } from '@/lib/errors';

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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    logger.info('Updating catalogue', { id: params.id });

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Invalid catalogue name' },
        { status: 400 }
      );
    }

    await dbQueries.updateCatalogueName(name, params.id);

    logger.info('Catalogue updated successfully', { id: params.id });

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
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    logger.info('Deleting catalogue', { id: params.id });

    await dbQueries.deleteCatalogue(params.id);

    logger.info('Catalogue deleted successfully', { id: params.id });

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