import { NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse, safeJSONParse } from '@/lib/errors';

const logger = new Logger('DownloadAPI');

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    logger.info('Downloading catalogue', { id: params.id });

    const events = await dbQueries.getEventsByCatalogueId(params.id);

    if (!events || events.length === 0) {
      throw new NotFoundError('Events for catalogue');
    }

    // Convert events to CSV format
    const headers = ['Time', 'Latitude', 'Longitude', 'Magnitude', 'Depth', 'Source'];
    const csvContent = [
      headers.join(','),
      ...events.map(event => {
        const sourceEvents = safeJSONParse(event.source_events, []);
        const source = sourceEvents[0]?.source || 'unknown';

        return [
          event.time,
          event.latitude,
          event.longitude,
          event.magnitude,
          event.depth || '',
          source
        ].join(',');
      })
    ].join('\n');

    logger.info('Catalogue download successful', {
      id: params.id,
      eventCount: events.length
    });

    // Return CSV file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="catalogue-${params.id}.csv"`
      }
    });
  } catch (error) {
    logger.error('Failed to download catalogue', error, { id: params.id });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}