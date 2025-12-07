/**
 * Unified export API endpoint supporting multiple formats
 * Supports: CSV, JSON, GeoJSON, KML, QuakeML
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { eventsToGeoJSON, eventsToKML, eventsToJSON } from '@/lib/exporters';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { generateExportFilename, createDownloadHeaders } from '@/lib/export-utils';
import { safeJSONParse } from '@/lib/errors';

type ExportFormat = 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const catalogueId = params.id;
    const searchParams = request.nextUrl.searchParams;
    const format = (searchParams.get('format') || 'csv').toLowerCase() as ExportFormat;

    // Validate format
    const validFormats: ExportFormat[] = ['csv', 'json', 'geojson', 'kml', 'quakeml'];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Supported formats: ${validFormats.join(', ')}` },
        { status: 400 }
      );
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // Get catalogue info
    const catalogue = await dbQueries.getCatalogueById(catalogueId);
    if (!catalogue) {
      return NextResponse.json(
        { error: 'Catalogue not found' },
        { status: 404 }
      );
    }

    // Get all events for this catalogue (without pagination)
    const eventsResult = await dbQueries.getEventsByCatalogueId(catalogueId);
    const events = Array.isArray(eventsResult) ? eventsResult : eventsResult.data;

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
    
    // Prepare metadata
    const metadata = {
      catalogueName: catalogue.name,
      description: catalogue.description || undefined,
      source: catalogue.data_source || undefined,
      provider: catalogue.provider || undefined,
      region: catalogue.geographic_region || undefined,
      timePeriodStart: minTime,
      timePeriodEnd: maxTime,
      license: catalogue.license || undefined,
      citation: catalogue.citation || undefined,
      eventCount: events.length,
    };
    
    let content: string;
    let fileExtension: string;
    
    // Generate content based on format
    switch (format) {
      case 'csv':
        content = generateCSV(events, catalogue);
        fileExtension = 'csv';
        break;
        
      case 'json':
        content = eventsToJSON(events, metadata);
        fileExtension = 'json';
        break;
        
      case 'geojson':
        content = eventsToGeoJSON(events, metadata);
        fileExtension = 'geojson';
        break;
        
      case 'kml':
        content = eventsToKML(events, metadata);
        fileExtension = 'kml';
        break;
        
      case 'quakeml':
        content = eventsToQuakeMLDocument(events, catalogue.name);
        fileExtension = 'xml';
        break;
        
      default:
        return NextResponse.json(
          { error: 'Unsupported format' },
          { status: 400 }
        );
    }
    
    // Generate filename
    const filename = generateExportFilename(
      catalogue.name,
      fileExtension,
      format === 'quakeml' ? { prefix: 'quakeml' } : undefined
    );
    
    // Return file
    return new NextResponse(content, {
      status: 200,
      headers: createDownloadHeaders(filename, fileExtension),
    });
    
  } catch (error) {
    console.error('Error exporting catalogue:', error);
    return NextResponse.json(
      { error: 'Failed to export catalogue' },
      { status: 500 }
    );
  }
}

/**
 * Generate CSV content from events
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateCSV(events: any[], catalogue: any): string {
  const metadataLines: string[] = [];
  
  // Add metadata as comments
  metadataLines.push(`# Catalogue: ${catalogue.name}`);
  if (catalogue.description) {
    metadataLines.push(`# Description: ${catalogue.description}`);
  }
  if (catalogue.data_source) {
    metadataLines.push(`# Source: ${catalogue.data_source}`);
  }
  if (catalogue.provider) {
    metadataLines.push(`# Provider: ${catalogue.provider}`);
  }
  metadataLines.push(`# Event Count: ${events.length}`);
  metadataLines.push(`# Generated: ${new Date().toISOString()}`);
  
  if (catalogue.license) {
    metadataLines.push(`# License: ${catalogue.license}`);
  }
  if (catalogue.citation) {
    metadataLines.push(`# Citation: ${catalogue.citation}`);
  }
  
  metadataLines.push('#');
  
  // Define CSV headers with all available fields
  const headers = [
    'Time',
    'Latitude',
    'Longitude',
    'Depth',
    'Magnitude',
    'MagnitudeType',
    'EventType',
    'Region',
    'Source',
    'PublicID',
    'AzimuthalGap',
    'UsedStationCount',
    'UsedPhaseCount',
    'StandardError',
    'EvaluationStatus'
  ];
  
  // Convert events to CSV rows
  const rows = events.map((event: any) => {
    const sourceEvents = safeJSONParse<Array<{ source?: string }>>(event.source_events, []);
    const source = sourceEvents[0]?.source || 'unknown';

    return [
      event.time,
      event.latitude,
      event.longitude,
      event.depth !== null ? event.depth : '',
      event.magnitude,
      event.magnitude_type || '',
      event.event_type || '',
      '', // Region - not in current schema
      source,
      event.event_public_id || '',
      event.azimuthal_gap !== null ? event.azimuthal_gap : '',
      event.used_station_count !== null ? event.used_station_count : '',
      event.used_phase_count !== null ? event.used_phase_count : '',
      event.standard_error !== null ? event.standard_error : '',
      event.evaluation_status || ''
    ].join(',');
  });
  
  return [
    ...metadataLines,
    headers.join(','),
    ...rows
  ].join('\n');
}

