/**
 * Unified export API endpoint supporting multiple formats
 * Supports: CSV, JSON, GeoJSON, KML, QuakeML
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import {
  eventsToCSVChunks,
  eventsToGeoJSONChunks,
  eventsToJSONChunks,
  eventsToKMLChunks,
} from '@/lib/exporters';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { generateExportFilename, createDownloadHeaders } from '@/lib/export-utils';
import { requireViewer } from '@/lib/auth/middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

type ExportFormat = 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    // Require Viewer role or higher
    const authResult = await requireViewer(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const catalogueId = id;
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

    // `metadata=comments` opts the CSV export into the `#`-prefixed metadata prologue.
    // The default is a plain RFC 4180 file, because RFC 4180 has no comment convention: with a
    // prologue, line 1 becomes the header record for pandas.read_csv, R's read.csv, ZMAP and
    // this platform's own parseCSV, and none of them can read the file back. The metadata is
    // served instead from GET /api/catalogues/{id} (see the Link header on the response) and
    // is embedded in the JSON and GeoJSON exports.
    const metadataMode = (searchParams.get('metadata') || '').toLowerCase();
    const metadataComments = metadataMode === 'comments' || metadataMode === 'true' || metadataMode === '1';

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

    const events = await getAllEventsForExport(catalogueId, catalogue.event_count);

    // An empty catalogue is valid — export an empty file rather than a 404

    // Calculate time period in a single linear pass. Math.min(...times) pushes one argument
    // per event onto the call stack and throws RangeError: Maximum call stack size exceeded
    // above roughly 1.3e5 arguments — i.e. exactly on the national-scale catalogues this
    // endpoint exists to serve, where it surfaced as an opaque 500.
    let minTime: string | undefined;
    let maxTime: string | undefined;
    let minEpoch = Infinity;
    let maxEpoch = -Infinity;
    for (const event of events) {
      const epoch = new Date(event.time).getTime();
      if (!Number.isFinite(epoch)) continue;
      if (epoch < minEpoch) minEpoch = epoch;
      if (epoch > maxEpoch) maxEpoch = epoch;
    }
    if (Number.isFinite(minEpoch)) {
      minTime = new Date(minEpoch).toISOString();
      maxTime = new Date(maxEpoch).toISOString();
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

    // Parse merge_config so the exported file records which merge strategy and thresholds
    // produced this catalogue. This is catalogue-level provenance only: MergedEvent stores no
    // per-event merge strategy or quality score, so neither can appear in the export.
    let mergeConfig: unknown;
    if (catalogue.merge_config) {
      try {
        mergeConfig = typeof catalogue.merge_config === 'string'
          ? JSON.parse(catalogue.merge_config)
          : catalogue.merge_config;
      } catch { mergeConfig = undefined; }
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
      mergeConfig,
      // Provenance
      createdBy: catalogue.created_by || undefined,
      modifiedAt: catalogue.modified_at || undefined,
      sourceCatalogues,
    };

    let chunks: Generator<string>;
    let fileExtension: string;

    // Generate content based on format. Every exporter yields chunks rather than one string:
    // V8 caps a JS string at 536,870,888 characters, which a national-scale catalogue exceeds
    // (~1.8 kB/event for GeoJSON, so ~290k events), and the resulting
    // "RangeError: Invalid string length" could only be reported as a generic 500.
    switch (format) {
      case 'csv':
        chunks = eventsToCSVChunks(events, metadata, { metadataComments });
        fileExtension = 'csv';
        break;

      case 'json':
        chunks = eventsToJSONChunks(events, metadata);
        fileExtension = 'json';
        break;

      case 'geojson':
        chunks = eventsToGeoJSONChunks(events, metadata);
        fileExtension = 'geojson';
        break;

      case 'kml':
        chunks = eventsToKMLChunks(events, metadata);
        fileExtension = 'kml';
        break;

      case 'quakeml':
        // lib/quakeml-exporter has no chunked form yet, so this one is still built whole.
        chunks = singleChunk(eventsToQuakeMLDocument(events, catalogue.name, metadata));
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

    const headers = new Headers(createDownloadHeaders(filename, fileExtension));
    // The full catalogue metadata is not embedded in the CSV (see the `metadata` query
    // parameter above); point at the JSON resource that carries it (RFC 8288 Link relation).
    headers.set(
      'Link',
      `</api/catalogues/${encodeURIComponent(catalogueId)}>; rel="describedby"; type="application/json"`
    );

    // Return file
    return new NextResponse(toByteStream(chunks), {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('Error exporting catalogue:', error);
    return NextResponse.json(
      { error: 'Failed to export catalogue' },
      { status: 500 }
    );
  }
}

async function getAllEventsForExport(catalogueId: string, expectedCount?: number): Promise<any[]> {
  if (!dbQueries) return [];

  const firstResult = await dbQueries.getEventsByCatalogueId(catalogueId);
  const firstEvents = Array.isArray(firstResult) ? firstResult : firstResult.data;

  // getEventsByCatalogueId() may be capped by UNPAGINATED_EVENTS_LIMIT. When
  // catalogue metadata indicates rows are missing, bypass that cap by using the
  // paginated code path and collecting every page.
  if (expectedCount == null || firstEvents.length >= expectedCount) {
    return firstEvents;
  }

  const pageSize = 5000;
  const allEvents: any[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const pageResult = await dbQueries.getEventsByCatalogueId(catalogueId, { page, pageSize });
    if (Array.isArray(pageResult)) {
      return pageResult;
    }

    // Appended one at a time: allEvents.push(...page) is an argument spread, which throws
    // RangeError above ~131,000 arguments if the page size is ever raised.
    for (const pageEvent of pageResult.data) allEvents.push(pageEvent);
    totalPages = pageResult.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return allEvents;
}

/** Wrap a single already-built document as a one-chunk stream. */
function* singleChunk(content: string): Generator<string> {
  yield content;
}

/**
 * Adapt a chunk generator to the ReadableStream the response body needs, pulling one chunk
 * per demand so the whole document is never resident as a single string or buffer.
 */
function toByteStream(chunks: Generator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const step = chunks.next();
      if (step.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(step.value));
    },
    cancel() {
      // Client aborted the download — let the generator release the events it holds.
      chunks.return(undefined);
    },
  });
}
