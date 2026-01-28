/**
 * API endpoint to export catalogue as QuakeML 1.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, MergedEvent } from '@/lib/db';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { generateExportFilename, createDownloadHeaders } from '@/lib/export-utils';
import { requireViewer } from '@/lib/auth/middleware';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

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

    // Calculate time period
    const times = events.map((e) => new Date(e.time).getTime());
    const minTime = new Date(Math.min(...times)).toISOString();
    const maxTime = new Date(Math.max(...times)).toISOString();

    // Parse data quality, keywords, and reference links if stored as JSON strings
    let dataQuality, keywords, referenceLinks;
    try { dataQuality = catalogue.data_quality && (typeof catalogue.data_quality === 'string' ? JSON.parse(catalogue.data_quality) : catalogue.data_quality); } catch { }
    try { keywords = catalogue.keywords && (typeof catalogue.keywords === 'string' ? JSON.parse(catalogue.keywords) : catalogue.keywords); } catch { }
    try { referenceLinks = catalogue.reference_links && (typeof catalogue.reference_links === 'string' ? JSON.parse(catalogue.reference_links) : catalogue.reference_links); } catch { }

    // Convert to QuakeML with comprehensive metadata
    const quakemlXml = eventsToQuakeMLDocument(events, catalogue.name, {
      description: catalogue.description || undefined,
      source: catalogue.data_source || undefined,
      provider: catalogue.provider || undefined,
      region: catalogue.geographic_region || undefined,
      timePeriodStart: minTime,
      timePeriodEnd: maxTime,
      license: catalogue.license || undefined,
      citation: catalogue.citation || undefined,
      eventCount: events.length,
      contactName: catalogue.contact_name || undefined,
      contactEmail: catalogue.contact_email || undefined,
      contactOrganization: catalogue.contact_organization || undefined,
      dataQuality,
      qualityNotes: catalogue.quality_notes || undefined,
      doi: catalogue.doi || undefined,
      version: catalogue.version || undefined,
      keywords,
      referenceLinks,
      usageTerms: catalogue.usage_terms || undefined,
      notes: catalogue.notes || undefined,
    });

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
