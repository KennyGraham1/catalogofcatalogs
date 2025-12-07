/**
 * API endpoint to export catalogue as QuakeML 1.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, MergedEvent } from '@/lib/db';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { generateExportFilename, createDownloadHeaders } from '@/lib/export-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const catalogueId = params.id;

    // Get catalogue info
    const catalogue = await dbQueries.getCatalogueById(catalogueId);
    if (!catalogue) {
      return NextResponse.json(
        { error: 'Catalogue not found' },
        { status: 404 }
      );
    }

    // Get all events for this catalogue
    const eventsResult = await dbQueries.getEventsByCatalogueId(catalogueId);
    const events: MergedEvent[] = Array.isArray(eventsResult) ? eventsResult : eventsResult.data;

    if (events.length === 0) {
      return NextResponse.json(
        { error: 'No events found in catalogue' },
        { status: 404 }
      );
    }

    // Convert to QuakeML
    const quakemlXml = eventsToQuakeMLDocument(events, catalogue.name);

    // Generate descriptive filename with timestamp
    const filename = generateExportFilename(catalogue.name, 'xml', { prefix: 'quakeml' });

    // Return as downloadable file with improved headers
    return new NextResponse(quakemlXml, {
      status: 200,
      headers: createDownloadHeaders(filename, 'xml'),
    });
  } catch (error) {
    console.error('Error exporting QuakeML:', error);
    return NextResponse.json(
      { error: 'Failed to export QuakeML' },
      { status: 500 }
    );
  }
}
