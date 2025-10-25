/**
 * API endpoint to export catalogue as QuakeML 1.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
    const events = await dbQueries.getEventsByCatalogueId(catalogueId);
    
    if (events.length === 0) {
      return NextResponse.json(
        { error: 'No events found in catalogue' },
        { status: 404 }
      );
    }
    
    // Convert to QuakeML
    const quakemlXml = eventsToQuakeMLDocument(events, catalogue.name);
    
    // Return as downloadable file
    return new NextResponse(quakemlXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="${catalogue.name.replace(/[^a-z0-9]/gi, '_')}_quakeml.xml"`,
      },
    });
  } catch (error) {
    console.error('Error exporting QuakeML:', error);
    return NextResponse.json(
      { error: 'Failed to export QuakeML' },
      { status: 500 }
    );
  }
}

