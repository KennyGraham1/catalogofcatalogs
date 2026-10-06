/**
 * API endpoint to get catalogue statistics
 * Returns min/max dates, magnitude ranges, depth ranges, etc.
 *
 * The statistics are computed, cached, stored and kept ready by
 * lib/catalogue-statistics.ts; see there.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse } from '@/lib/errors';
import { requireViewer } from '@/lib/auth/middleware';
import { getCatalogueStatistics } from '@/lib/catalogue-statistics';

export type { CatalogueStatistics } from '@/lib/catalogue-statistics';

const logger = new Logger('CatalogueStatisticsAPI');

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const authResult = await requireViewer(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const catalogueId = id;
    logger.info('Fetching catalogue statistics', { catalogueId });

    // Get catalogue info
    const catalogue = await dbQueries.getCatalogueById(catalogueId);
    if (!catalogue) {
      throw new NotFoundError('Catalogue');
    }

    // From this process's cache, else the stored copy for the catalogue's current
    // generation, else the aggregation over every event (whose answer is then kept in
    // both). A write to the catalogue retires both copies.
    return NextResponse.json(await getCatalogueStatistics(catalogueId, catalogue));
  } catch (error) {
    logger.error('Failed to fetch catalogue statistics', error);
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
