import { NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse, safeJSONParse } from '@/lib/errors';
import { generateExportFilename, createDownloadHeaders } from '@/lib/export-utils';

const logger = new Logger('DownloadAPI');

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    logger.info('Downloading catalogue', { id: params.id });

    // Get catalogue info for better filename
    const catalogue = await dbQueries.getCatalogueById(params.id);
    if (!catalogue) {
      throw new NotFoundError('Catalogue');
    }

    const events = await dbQueries.getEventsByCatalogueId(params.id);

    if (!events || events.length === 0) {
      throw new NotFoundError('Events for catalogue');
    }

    // Build metadata header comments
    const metadataLines: string[] = [];
    metadataLines.push('# Earthquake Catalogue Export');
    metadataLines.push(`# Export Date: ${new Date().toISOString()}`);
    metadataLines.push(`# Catalogue: ${catalogue.name}`);
    metadataLines.push(`# Event Count: ${events.length}`);

    if (catalogue.description) {
      metadataLines.push(`# Description: ${catalogue.description}`);
    }
    if (catalogue.data_source) {
      metadataLines.push(`# Source: ${catalogue.data_source}`);
    }
    if (catalogue.provider) {
      metadataLines.push(`# Provider: ${catalogue.provider}`);
    }
    if (catalogue.geographic_region) {
      metadataLines.push(`# Region: ${catalogue.geographic_region}`);
    }
    if (catalogue.time_period_start || catalogue.time_period_end) {
      const start = catalogue.time_period_start || 'N/A';
      const end = catalogue.time_period_end || 'N/A';
      metadataLines.push(`# Time Period: ${start} to ${end}`);
    }
    if (catalogue.license) {
      metadataLines.push(`# License: ${catalogue.license}`);
    }
    if (catalogue.citation) {
      metadataLines.push(`# Citation: ${catalogue.citation}`);
    }
    if (catalogue.merge_description) {
      metadataLines.push(`# Merge Description: ${catalogue.merge_description}`);
    }
    if (catalogue.merge_methodology) {
      metadataLines.push(`# Merge Methodology: ${catalogue.merge_methodology}`);
    }

    metadataLines.push('#');

    // Convert events to CSV format
    const headers = ['Time', 'Latitude', 'Longitude', 'Magnitude', 'Depth', 'Source'];
    const csvContent = [
      ...metadataLines,
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

    // Generate descriptive filename with timestamp
    const filename = generateExportFilename(catalogue.name, 'csv');

    // Return CSV file with improved headers
    return new NextResponse(csvContent, {
      headers: createDownloadHeaders(filename, 'csv')
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