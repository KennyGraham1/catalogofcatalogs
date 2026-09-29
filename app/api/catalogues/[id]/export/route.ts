/**
 * Unified export API endpoint supporting multiple formats
 * Supports: CSV, JSON, GeoJSON, KML, QuakeML
 *
 * Query parameters:
 *   format      csv (default) | json | geojson | kml | quakeml
 *   metadata    `comments` opts the CSV into its `#` metadata prologue
 *   decluster   none (default) | gardner-knopoff: tag every exported event with its cluster
 *   <filters>   the event filters of lib/event-filter-params.ts (contract C4), e.g.
 *               minMagnitude=3&startTime=2020-01-01; the export then holds only matching events
 *
 * Every format records the catalogue id and version (C3), the export timestamp (UTC), the
 * SHA-256 of the canonical exported rows, the filter and the declustering applied (C12). The
 * same values are sent as X-* response headers, so a plain CSV (which has no place for file
 * metadata) can still be tied to them; each CSV row also carries its CatalogueVersion.
 */

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, normalizeCatalogueVersion } from '@/lib/db';
import type { EventFilters, MergedCatalogue } from '@/lib/db';
import {
  computeEventRowsChecksum,
  eventsToCSVChunks,
  eventsToGeoJSONChunks,
  eventsToJSONChunks,
  eventsToKMLChunks,
} from '@/lib/exporters';
import type { DeclusterTag, ExportDeclustering, ExportMetadata, ExportableEvent } from '@/lib/exporters';
import { eventsToQuakeMLChunks } from '@/lib/quakeml-exporter';
import { generateExportFilename, createDownloadHeaders } from '@/lib/export-utils';
import { eventFiltersToSearchParams, hasEventFilters, parseEventFilterParams } from '@/lib/event-filter-params';
import { gardnerKnopoffDeclustering, getGardnerKnopoffWindow } from '@/lib/seismological-analysis';
import type { EarthquakeEvent } from '@/lib/seismological-analysis';
import { requireViewer } from '@/lib/auth/middleware';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

type ExportFormat = 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml';

const DECLUSTER_OPTIONS = ['none', 'gardner-knopoff'] as const;
type DeclusterOption = typeof DECLUSTER_OPTIONS[number];

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
    // served instead from GET /api/catalogues/{id} (see the Link header on the response), is
    // embedded in the JSON and GeoJSON exports, and its citation-critical part (version,
    // timestamp, checksum, filter, declustering) is sent in X-* headers; every CSV row also
    // carries its CatalogueVersion.
    const metadataMode = (searchParams.get('metadata') || '').toLowerCase();
    const metadataComments = metadataMode === 'comments' || metadataMode === 'true' || metadataMode === '1';

    const declusterOption = (searchParams.get('decluster') || 'none').trim().toLowerCase() as DeclusterOption;
    if (!DECLUSTER_OPTIONS.includes(declusterOption)) {
      return NextResponse.json(
        { error: `Invalid decluster: "${searchParams.get('decluster')}". Supported: ${DECLUSTER_OPTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Filtered exports (C4): the same strict parser as the filtered-events route, so a bad
    // value is a 400 naming the parameter rather than a silently different file.
    const parsedFilters = parseEventFilterParams(searchParams);
    if (!parsedFilters.ok) {
      return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
    }
    const filters = hasEventFilters(parsedFilters.filters) ? parsedFilters.filters : null;

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

    // An export records the catalogue version it holds (C3), so it must hold exactly that
    // version's rows. While an upload, GeoNet import or merge is running (status 'processing'),
    // rows change under a version that is only released when the run completes, so an export
    // taken then reported the pre-run version with a mid-run data state.
    if (catalogue.status === 'processing' || (catalogue.status as string) === 'deleting') {
      return NextResponse.json(
        {
          error: catalogue.status === 'processing'
            ? 'This catalogue is being updated (an upload, import or merge is in progress). Export it when that completes.'
            : 'This catalogue is being deleted.',
          status: catalogue.status,
        },
        { status: 409 }
      );
    }

    const events: ExportableEvent[] = filters
      ? await getAllFilteredEventsForExport(catalogueId, filters)
      : await getAllEventsForExport(catalogueId, catalogue.event_count);

    // Reading every row takes time (and several queries for a large catalogue). If the
    // catalogue's version state moved meanwhile, the rows may mix two data states, so the
    // export is refused rather than published under a version that does not describe it.
    const afterRead = await dbQueries.getCatalogueById(catalogueId);
    if (!afterRead || catalogueStateKey(afterRead) !== catalogueStateKey(catalogue)) {
      return NextResponse.json(
        {
          error: 'The catalogue changed while it was being exported. Retry the export.',
          version: afterRead ? normalizeCatalogueVersion(afterRead.version) : null,
        },
        { status: 409 }
      );
    }

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
    // produced this catalogue. The per-event strategy, parameters and quality score (C1/C2)
    // travel with each event as well (see eventLineage in lib/exporters.ts).
    let mergeConfig: unknown;
    if (catalogue.merge_config) {
      try {
        mergeConfig = typeof catalogue.merge_config === 'string'
          ? JSON.parse(catalogue.merge_config)
          : catalogue.merge_config;
      } catch { mergeConfig = undefined; }
    }

    // Preserve declared catalogue coverage when present; otherwise derive the
    // covered event range from the exported rows. The exporters render both as UTC ISO.
    const timePeriodStart = catalogue.time_period_start || minTime;
    const timePeriodEnd = catalogue.time_period_end || maxTime;

    // One timestamp for the whole export: file metadata, filename and headers agree.
    const exportedAt = new Date();
    // The platform version (C3); a catalogue stored before versioning reads as 1.0.0.
    const catalogueVersion = normalizeCatalogueVersion(catalogue.version);
    const declustering = declusterOption === 'gardner-knopoff'
      ? declusterGardnerKnopoffForExport(events)
      : { algorithm: 'none' as const };

    // Prepare comprehensive metadata — covers all MergedCatalogue scalar fields
    const metadata: ExportMetadata = {
      catalogueName: catalogue.name,
      catalogueId,
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
      generatedAt: exportedAt.toISOString(),
      // Contact information
      contactName: catalogue.contact_name || undefined,
      contactEmail: catalogue.contact_email || undefined,
      contactOrganization: catalogue.contact_organization || undefined,
      // Data quality
      dataQuality,
      qualityNotes: catalogue.quality_notes || undefined,
      // Additional metadata
      doi: catalogue.doi || undefined,
      version: catalogueVersion,
      versionUpdatedAt: catalogue.version_updated_at || catalogue.created_at || undefined,
      sourceVersion: catalogue.source_version || undefined,
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
      // Export provenance (C12)
      filter: filters ? { ...filters } : null,
      declustering,
    };
    // Computed once here, with node:crypto, over the same canonical rows the exporters would
    // hash, and handed to them so every format and the response header carry one value.
    metadata.checksum = computeEventRowsChecksum(events, metadata, nodeSha256());

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
        chunks = eventsToQuakeMLChunks(events, catalogue.name, metadata);
        fileExtension = 'xml';
        break;

      default:
        return NextResponse.json(
          { error: 'Unsupported format' },
          { status: 400 }
        );
    }

    // Generate filename: it carries the catalogue version and the export timestamp, so a
    // downloaded file still says which data state it holds.
    const filename = generateExportFilename(catalogue.name, fileExtension, {
      prefix: format === 'quakeml' ? 'quakeml' : undefined,
      suffix: filters ? 'filtered' : undefined,
      version: catalogueVersion,
      customDate: exportedAt,
    });

    const headers = new Headers(createDownloadHeaders(filename, fileExtension));
    // The full catalogue metadata is not embedded in the CSV (see the `metadata` query
    // parameter above); point at the JSON resource that carries it (RFC 8288 Link relation).
    headers.set(
      'Link',
      `</api/catalogues/${encodeURIComponent(catalogueId)}>; rel="describedby"; type="application/json"`
    );
    // The export's citation data, for every format (header values are ASCII: ids, a semantic
    // version, an ISO timestamp, hex, and a percent-encoded query string).
    headers.set('X-Catalogue-ID', asciiHeaderValue(catalogueId));
    headers.set('X-Catalogue-Version', catalogueVersion);
    headers.set('X-Export-Timestamp', metadata.generatedAt!);
    headers.set('X-Export-Event-Count', String(events.length));
    headers.set('X-Export-Rows-SHA256', metadata.checksum.value);
    headers.set('X-Export-Filter', filters ? eventFiltersToSearchParams(filters).toString() : 'none');
    headers.set('X-Export-Declustering', declustering.algorithm);

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
  // paginated code path and collecting every page. (Offset pages are stable here because
  // the caller refuses the export if the catalogue's state changed during the read.)
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

/**
 * Every event matching the filters, read page by page. A single getFilteredEvents call is
 * capped by FILTERED_EVENTS_LIMIT (it serves the interactive filter UI); an export must never
 * be silently truncated, so it keeps reading while the database reports more rows.
 *
 * Pages are anchored on the (time, id) sort key rather than on an absolute offset: each page
 * asks for rows at or before the last origin time read (endTime is inclusive) and skips only
 * the rows of that same instant already read, which come first in the newest-first, id-
 * descending order. An absolute offset shifts when rows are inserted ahead of it, repeating or
 * skipping rows, and costs a scan of every skipped row on each page.
 */
async function getAllFilteredEventsForExport(catalogueId: string, filters: EventFilters): Promise<any[]> {
  if (!dbQueries) return [];
  const pageSize = 5000;
  const allEvents: any[] = [];
  let anchorTime: string | null = null;
  let readAtAnchor = 0;
  for (;;) {
    const pageFilters: EventFilters = anchorTime === null ? filters : { ...filters, endTime: anchorTime };
    const page = await dbQueries.getFilteredEvents(catalogueId, pageFilters, {
      limit: pageSize,
      offset: anchorTime === null ? 0 : readAtAnchor,
    });
    for (const event of page.events) allEvents.push(event);
    if (!page.truncated || page.events.length === 0) break;

    const lastTime = String(page.events[page.events.length - 1].time);
    let atLastTime = 0;
    for (let i = page.events.length - 1; i >= 0 && String(page.events[i].time) === lastTime; i--) atLastTime++;
    // A page wholly inside one instant (a day-precision catalogue) extends the same anchor.
    readAtAnchor = lastTime === anchorTime ? readAtAnchor + atLastTime : atLastTime;
    anchorTime = lastTime;
  }
  return allEvents;
}

/**
 * The parts of a catalogue that change whenever its rows do: version bookkeeping (C3), the
 * event count and the modification stamp. Equal before and after the rows are read means the
 * export holds one data state.
 */
function catalogueStateKey(catalogue: MergedCatalogue): string {
  return JSON.stringify([
    catalogue.status,
    normalizeCatalogueVersion(catalogue.version),
    catalogue.version_updated_at ?? null,
    catalogue.event_count ?? null,
    catalogue.modified_at ?? null,
  ]);
}

/**
 * Gardner-Knopoff (1974) declustering of the exported events, as per-event tags (C7): the
 * cluster an event belongs to (identified by its mainshock's event id) and whether it is
 * independent (a mainshock or in no cluster). Runs lib/seismological-analysis.ts's
 * gardnerKnopoffDeclustering, the analytics engine's own implementation, so an export and
 * the analytics page decluster identically; its window parameters are recorded as computed.
 */
function declusterGardnerKnopoffForExport(events: ExportableEvent[]): ExportDeclustering {
  const input: EarthquakeEvent[] = events.map(event => ({
    id: event.id,
    time: event.time,
    latitude: event.latitude,
    longitude: event.longitude,
    depth: event.depth ?? 0,
    magnitude: event.magnitude,
  }));
  const { clusters } = gardnerKnopoffDeclustering(input);

  const tags = new Map<string, DeclusterTag>();
  clusters.forEach((members, mainshockId) => {
    const clusterId = String(mainshockId);
    members.forEach(member => {
      tags.set(String(member.id), { clusterId, isMainshock: String(member.id) === clusterId });
    });
  });
  let dependentCount = 0;
  for (const event of events) {
    const tag = tags.get(event.id);
    if (!tag) tags.set(event.id, { clusterId: null, isMainshock: true });
    else if (!tag.isMainshock) dependentCount++;
  }

  return {
    algorithm: 'gardner-knopoff',
    parameters: {
      reference: 'Gardner and Knopoff (1974); window table of van Stiphout et al. (2012), CORSSA',
      timeWindow: 'forward only: 0 <= t - t_mainshock <= T(M)',
      distance: 'epicentral (haversine) distance <= L(M)',
      processingOrder: 'largest magnitude first; each cluster mainshock is reserved before its window is searched',
      appliedTo: 'the exported events (after any filter)',
      // The windows exactly as the implementation computes them (T in days, L in km).
      windows: [2, 3, 4, 5, 6, 6.5, 7, 8].map(magnitude => {
        const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(magnitude);
        return {
          magnitude,
          timeWindowDays: Number(timeWindowDays.toPrecision(6)),
          distanceWindowKm: Number(distanceWindowKm.toPrecision(6)),
        };
      }),
    },
    summary: {
      eventCount: events.length,
      mainshockCount: events.length - dependentCount,
      dependentCount,
      clusterCount: clusters.size,
    },
    tags,
  };
}

/** A node:crypto SHA-256 behind the exporters' incremental-hasher interface. */
function nodeSha256() {
  const hash = createHash('sha256');
  return {
    update: (text: string) => hash.update(text, 'utf8'),
    digestHex: () => hash.digest('hex'),
  };
}

/** Header values must be ByteStrings; ids are ASCII in practice, but never let one throw. */
function asciiHeaderValue(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : encodeURIComponent(value);
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
