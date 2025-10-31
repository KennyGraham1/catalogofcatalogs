import { NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';

const logger = new Logger('CataloguesAPI');

export async function GET() {
  try {
    // logger.info('Fetching all catalogues');
    
    const catalogues = await dbQueries.getCatalogues();
    
    // logger.info('Catalogues fetched successfully', { count: catalogues.length });
    
    return NextResponse.json(catalogues);
  } catch (error) {
    logger.error('Failed to fetch catalogues', error);
    const errorResponse = formatErrorResponse(error);
    
    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

