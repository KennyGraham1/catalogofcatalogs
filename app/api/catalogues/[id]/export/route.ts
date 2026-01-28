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
import { requireViewer } from '@/lib/auth/middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

type ExportFormat = 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require Viewer role or higher
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

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

    // Parse data quality if stored as JSON
    let dataQuality;
    if (catalogue.data_quality) {
      try {
        dataQuality = typeof catalogue.data_quality === 'string'
          ? JSON.parse(catalogue.data_quality)
          : catalogue.data_quality;
      } catch { dataQuality = undefined; }
    }

    // Parse keywords and reference links if stored as JSON strings
    let keywords: string[] | undefined;
    let referenceLinks: string[] | undefined;
    if (catalogue.keywords) {
      try {
        keywords = typeof catalogue.keywords === 'string'
          ? JSON.parse(catalogue.keywords)
          : catalogue.keywords;
      } catch { keywords = undefined; }
    }
    if (catalogue.reference_links) {
      try {
        referenceLinks = typeof catalogue.reference_links === 'string'
          ? JSON.parse(catalogue.reference_links)
          : catalogue.reference_links;
      } catch { referenceLinks = undefined; }
    }

    // Prepare comprehensive metadata
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
      // Contact information
      contactName: catalogue.contact_name || undefined,
      contactEmail: catalogue.contact_email || undefined,
      contactOrganization: catalogue.contact_organization || undefined,
      // Data quality
      dataQuality,
      qualityNotes: catalogue.quality_notes || undefined,
      // Additional metadata
      doi: catalogue.doi || undefined,
      version: catalogue.version || undefined,
      keywords,
      referenceLinks,
      usageTerms: catalogue.usage_terms || undefined,
      notes: catalogue.notes || undefined,
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
        content = eventsToQuakeMLDocument(events, catalogue.name, metadata);
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
  if (catalogue.geographic_region) {
    metadataLines.push(`# Region: ${catalogue.geographic_region}`);
  }
  metadataLines.push(`# Event Count: ${events.length}`);
  metadataLines.push(`# Generated: ${new Date().toISOString()}`);

  if (catalogue.license) {
    metadataLines.push(`# License: ${catalogue.license}`);
  }
  if (catalogue.citation) {
    metadataLines.push(`# Citation: ${catalogue.citation}`);
  }
  if (catalogue.doi) {
    metadataLines.push(`# DOI: ${catalogue.doi}`);
  }
  if (catalogue.version) {
    metadataLines.push(`# Version: ${catalogue.version}`);
  }
  // Contact information
  if (catalogue.contact_name) {
    metadataLines.push(`# Contact Name: ${catalogue.contact_name}`);
  }
  if (catalogue.contact_email) {
    metadataLines.push(`# Contact Email: ${catalogue.contact_email}`);
  }
  if (catalogue.contact_organization) {
    metadataLines.push(`# Contact Organization: ${catalogue.contact_organization}`);
  }
  // Data quality
  if (catalogue.data_quality) {
    try {
      const dq = typeof catalogue.data_quality === 'string'
        ? JSON.parse(catalogue.data_quality)
        : catalogue.data_quality;
      if (dq.completeness) metadataLines.push(`# Data Completeness: ${dq.completeness}`);
      if (dq.accuracy) metadataLines.push(`# Data Accuracy: ${dq.accuracy}`);
      if (dq.reliability) metadataLines.push(`# Data Reliability: ${dq.reliability}`);
    } catch { /* ignore parse errors */ }
  }
  if (catalogue.quality_notes) {
    metadataLines.push(`# Quality Notes: ${catalogue.quality_notes}`);
  }
  // Keywords
  if (catalogue.keywords) {
    try {
      const kw = typeof catalogue.keywords === 'string'
        ? JSON.parse(catalogue.keywords)
        : catalogue.keywords;
      if (Array.isArray(kw) && kw.length > 0) {
        metadataLines.push(`# Keywords: ${kw.join(', ')}`);
      }
    } catch { /* ignore parse errors */ }
  }
  // Reference links
  if (catalogue.reference_links) {
    try {
      const rl = typeof catalogue.reference_links === 'string'
        ? JSON.parse(catalogue.reference_links)
        : catalogue.reference_links;
      if (Array.isArray(rl) && rl.length > 0) {
        metadataLines.push(`# References: ${rl.join(', ')}`);
      }
    } catch { /* ignore parse errors */ }
  }
  if (catalogue.usage_terms) {
    metadataLines.push(`# Usage Terms: ${catalogue.usage_terms}`);
  }
  if (catalogue.notes) {
    metadataLines.push(`# Notes: ${catalogue.notes}`);
  }

  metadataLines.push('#');

  // Define CSV headers with all available fields including uncertainties
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
    // Uncertainty values
    'TimeUncertainty',
    'LatitudeUncertainty',
    'LongitudeUncertainty',
    'DepthUncertainty',
    'MagnitudeUncertainty',
    // Quality metrics
    'AzimuthalGap',
    'UsedStationCount',
    'UsedPhaseCount',
    'StandardError',
    // Evaluation metadata
    'EvaluationMode',
    'EvaluationStatus'
  ];

  // Convert events to CSV rows
  const rows = events.map((event: any) => {
    const sourceEvents = safeJSONParse<Array<{ source?: string }>>(event.source_events, []);
    const source = sourceEvents[0]?.source || 'unknown';

    // Use region or location_name if available
    const region = event.region || event.location_name || '';

    return [
      event.time,
      event.latitude,
      event.longitude,
      event.depth !== null ? event.depth : '',
      event.magnitude,
      event.magnitude_type || '',
      event.event_type || '',
      region,
      source,
      event.event_public_id || '',
      // Uncertainty values
      event.time_uncertainty !== null ? event.time_uncertainty : '',
      event.latitude_uncertainty !== null ? event.latitude_uncertainty : '',
      event.longitude_uncertainty !== null ? event.longitude_uncertainty : '',
      event.depth_uncertainty !== null ? event.depth_uncertainty : '',
      event.magnitude_uncertainty !== null ? event.magnitude_uncertainty : '',
      // Quality metrics
      event.azimuthal_gap !== null ? event.azimuthal_gap : '',
      event.used_station_count !== null ? event.used_station_count : '',
      event.used_phase_count !== null ? event.used_phase_count : '',
      event.standard_error !== null ? event.standard_error : '',
      // Evaluation metadata
      event.evaluation_mode || '',
      event.evaluation_status || ''
    ].join(',');
  });

  return [
    ...metadataLines,
    headers.join(','),
    ...rows
  ].join('\n');
}

