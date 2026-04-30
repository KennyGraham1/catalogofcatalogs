/**
 * Unified export API endpoint supporting multiple formats
 * Supports: CSV, JSON, GeoJSON, KML, QuakeML
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { eventsToGeoJSON, eventsToKML, eventsToJSON } from '@/lib/exporters';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { generateExportFilename, createDownloadHeaders, csvField } from '@/lib/export-utils';
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

    // An empty catalogue is valid — export an empty file rather than a 404

    // Calculate time period (guard against empty array)
    let minTime: string | undefined;
    let maxTime: string | undefined;
    if (events.length > 0) {
      const times = events.map((e) => new Date(e.time).getTime());
      minTime = new Date(Math.min(...times)).toISOString();
      maxTime = new Date(Math.max(...times)).toISOString();
    }

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

    // Parse source_catalogues for provenance metadata
    let sourceCatalogues: unknown;
    if (catalogue.source_catalogues) {
      try {
        sourceCatalogues = typeof catalogue.source_catalogues === 'string'
          ? JSON.parse(catalogue.source_catalogues)
          : catalogue.source_catalogues;
      } catch { sourceCatalogues = undefined; }
    }

    // Preserve declared catalogue coverage when present; otherwise derive the
    // covered event range from the exported rows.
    const timePeriodStart = catalogue.time_period_start || minTime;
    const timePeriodEnd = catalogue.time_period_end || maxTime;

    // Prepare comprehensive metadata — covers all MergedCatalogue scalar fields
    const metadata = {
      catalogueName: catalogue.name,
      description: catalogue.description || undefined,
      source: catalogue.data_source || undefined,
      provider: catalogue.provider || undefined,
      region: catalogue.geographic_region || undefined,
      timePeriodStart,
      timePeriodEnd,
      // Geographic bounds
      boundingBox: (catalogue.min_latitude != null || catalogue.max_latitude != null ||
                    catalogue.min_longitude != null || catalogue.max_longitude != null) ? {
        minLatitude: catalogue.min_latitude ?? null,
        maxLatitude: catalogue.max_latitude ?? null,
        minLongitude: catalogue.min_longitude ?? null,
        maxLongitude: catalogue.max_longitude ?? null,
      } : undefined,
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
      // Merge-specific metadata
      mergeDescription: catalogue.merge_description || undefined,
      mergeUseCase: catalogue.merge_use_case || undefined,
      mergeMethodology: catalogue.merge_methodology || undefined,
      mergeQualityAssessment: catalogue.merge_quality_assessment || undefined,
      // Provenance
      createdBy: catalogue.created_by || undefined,
      modifiedAt: catalogue.modified_at || undefined,
      sourceCatalogues,
    };

    let content: string;
    let fileExtension: string;

    // Generate content based on format
    switch (format) {
      case 'csv':
        content = generateCSV(events, metadata);
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
function generateCSV(events: any[], metadata: any): string {
  const metadataLines: string[] = [];
  const commentValue = (value: unknown): string => {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return csvField(str ?? '').replace(/\r?\n|\r/g, ' ');
  };
  const addMetadataLine = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    metadataLines.push(`# ${label}: ${commentValue(value)}`);
  };

  // Add metadata as comments
  addMetadataLine('Catalogue', metadata.catalogueName);
  addMetadataLine('Description', metadata.description);
  addMetadataLine('Source', metadata.source);
  addMetadataLine('Provider', metadata.provider);
  addMetadataLine('Region', metadata.region);
  if (metadata.timePeriodStart || metadata.timePeriodEnd) {
    addMetadataLine('Time Period', `${metadata.timePeriodStart ?? '?'} to ${metadata.timePeriodEnd ?? '?'}`);
  }
  metadataLines.push(`# Event Count: ${events.length}`);
  metadataLines.push(`# Generated: ${new Date().toISOString()}`);

  addMetadataLine('License', metadata.license);
  addMetadataLine('Citation', metadata.citation);
  addMetadataLine('DOI', metadata.doi);
  addMetadataLine('Version', metadata.version);
  addMetadataLine('Contact Name', metadata.contactName);
  addMetadataLine('Contact Email', metadata.contactEmail);
  addMetadataLine('Contact Organization', metadata.contactOrganization);
  if (metadata.dataQuality) {
    addMetadataLine('Data Quality', metadata.dataQuality);
  }
  addMetadataLine('Quality Notes', metadata.qualityNotes);
  addMetadataLine('Keywords', metadata.keywords);
  addMetadataLine('References', metadata.referenceLinks);
  addMetadataLine('Usage Terms', metadata.usageTerms);
  addMetadataLine('Notes', metadata.notes);
  // Geographic bounds
  if (metadata.boundingBox) {
    const bb = metadata.boundingBox;
    metadataLines.push(
      `# Bounding Box: lat [${bb.minLatitude ?? '?'}, ${bb.maxLatitude ?? '?'}], ` +
      `lon [${bb.minLongitude ?? '?'}, ${bb.maxLongitude ?? '?'}]`
    );
  }
  addMetadataLine('Merge Description', metadata.mergeDescription);
  addMetadataLine('Merge Use Case', metadata.mergeUseCase);
  addMetadataLine('Merge Methodology', metadata.mergeMethodology);
  addMetadataLine('Merge Quality Assessment', metadata.mergeQualityAssessment);
  addMetadataLine('Created By', metadata.createdBy);
  addMetadataLine('Modified At', metadata.modifiedAt);
  addMetadataLine('Source Catalogues', metadata.sourceCatalogues);

  metadataLines.push('#');
  // Note: complex nested fields (origins, magnitudes, picks, arrivals, focal_mechanisms,
  // amplitudes, station_magnitudes, event_descriptions, comments, creation_info, source_events)
  // cannot be represented in flat CSV format; use JSON or QuakeML export for full fidelity.

  // Define CSV headers — all scalar event fields
  const headers = [
    'ID',
    'CatalogueID',
    'Time',
    'CreatedAt',
    'Latitude',
    'Longitude',
    'Depth',
    'Magnitude',
    'MagnitudeType',
    'EventType',
    'EventTypeCertainty',
    'Region',
    'LocationName',
    'Source',
    'SourceEventsJSON',
    'SourceID',
    'PublicID',
    // Location uncertainties
    'TimeUncertainty',
    'LatitudeUncertainty',
    'LongitudeUncertainty',
    'DepthUncertainty',
    'HorizontalUncertainty',
    'MagnitudeUncertainty',
    // Origin metadata
    'DepthType',
    'EarthModelID',
    'MethodID',
    'AgencyID',
    'Author',
    // Magnitude details
    'MagnitudeStationCount',
    'MagnitudeMethodID',
    'MagnitudeEvaluationMode',
    'MagnitudeEvaluationStatus',
    // Quality metrics
    'AzimuthalGap',
    'UsedStationCount',
    'UsedPhaseCount',
    'StandardError',
    'MinimumDistance',
    'MaximumDistance',
    'AssociatedPhaseCount',
    'AssociatedStationCount',
    'DepthPhaseCount',
    // Evaluation metadata
    'EvaluationMode',
    'EvaluationStatus',
    'PreferredOriginID',
    'PreferredMagnitudeID',
  ];

  // Helper: emit a nullable number/string as empty string when null/undefined
  const n = (v: number | string | null | undefined) => (v !== null && v !== undefined ? v : '');

  // Convert events to CSV rows
  const rows = events.map((event: any) => {
    const sourceEvents = safeJSONParse<Array<{ source?: string }>>(event.source_events, []);
    const source = sourceEvents[0]?.source || 'unknown';

    return [
      csvField(event.id),
      csvField(event.catalogue_id),
      csvField(event.time),
      csvField(event.created_at),
      csvField(event.latitude),
      csvField(event.longitude),
      csvField(n(event.depth)),
      csvField(event.magnitude),
      csvField(event.magnitude_type),
      csvField(event.event_type),
      csvField(event.event_type_certainty),
      // Region: prefer region, fall back to location_name
      csvField(event.region || event.location_name || ''),
      csvField(event.location_name),
      csvField(source),
      csvField(event.source_events),
      csvField(event.source_id),
      csvField(event.event_public_id),
      // Location uncertainties
      csvField(n(event.time_uncertainty)),
      csvField(n(event.latitude_uncertainty)),
      csvField(n(event.longitude_uncertainty)),
      csvField(n(event.depth_uncertainty)),
      csvField(n(event.horizontal_uncertainty)),
      csvField(n(event.magnitude_uncertainty)),
      // Origin metadata
      csvField(event.depth_type),
      csvField(event.earth_model_id),
      csvField(event.method_id),
      csvField(event.agency_id),
      csvField(event.author),
      // Magnitude details
      csvField(n(event.magnitude_station_count)),
      csvField(event.magnitude_method_id),
      csvField(event.magnitude_evaluation_mode),
      csvField(event.magnitude_evaluation_status),
      // Quality metrics
      csvField(n(event.azimuthal_gap)),
      csvField(n(event.used_station_count)),
      csvField(n(event.used_phase_count)),
      csvField(n(event.standard_error)),
      csvField(n(event.minimum_distance)),
      csvField(n(event.maximum_distance)),
      csvField(n(event.associated_phase_count)),
      csvField(n(event.associated_station_count)),
      csvField(n(event.depth_phase_count)),
      // Evaluation metadata
      csvField(event.evaluation_mode),
      csvField(event.evaluation_status),
      csvField(event.preferred_origin_id),
      csvField(event.preferred_magnitude_id),
    ].join(',');
  });

  return [
    ...metadataLines,
    headers.join(','),
    ...rows
  ].join('\n');
}
