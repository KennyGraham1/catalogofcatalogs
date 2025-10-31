import { NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, formatErrorResponse } from '@/lib/errors';
import { catalogueCache, generateCacheKey } from '@/lib/cache';

const logger = new Logger('CataloguesAPI');

export async function GET() {
  try {
    const cacheKey = generateCacheKey('catalogues', { all: true });

    // Try to get from cache
    const cached = catalogueCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch from database
    const catalogues = await dbQueries.getCatalogues();

    // Store in cache
    catalogueCache.set(cacheKey, catalogues);

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

