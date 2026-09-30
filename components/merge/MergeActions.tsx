'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Map, ChevronDown, List } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { generateMergedCatalogueFilename } from '@/lib/export-utils';
import { eventsToCSV, eventsToGeoJSON, eventsToJSON, eventsToKML } from '@/lib/exporters';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { getApiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { EventTable } from '@/components/events/EventTable';

const MapWithNoSSR = dynamic(
  () => import('./MapComponent'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[600px] w-full bg-muted/20 flex items-center justify-center">
        <span>Loading map...</span>
      </div>
    )
  }
);

interface CatalogueMetadata {
  name?: string;
  description?: string;
  data_source?: string;
  provider?: string;
  geographic_region?: string;
  time_period_start?: string;
  time_period_end?: string;
  license?: string;
  citation?: string;
  // Contact
  contact_name?: string;
  contact_email?: string;
  contact_organization?: string;
  // Data quality
  data_quality?: { completeness?: string; accuracy?: string; reliability?: string } | string;
  quality_notes?: string;
  // Additional
  doi?: string;
  version?: string;
  keywords?: string[] | string;
  reference_links?: string[] | string;
  usage_terms?: string;
  notes?: string;
  // Geographic bounds
  min_latitude?: number | null;
  max_latitude?: number | null;
  min_longitude?: number | null;
  max_longitude?: number | null;
  // Merge-specific
  merge_description?: string;
  merge_use_case?: string;
  merge_methodology?: string;
  merge_quality_assessment?: string;
  // Merge strategy/thresholds/priority and the catalogues read, as stored on a saved merged
  // catalogue (MergedCatalogue.merge_config / source_catalogues); may arrive as JSON strings.
  merge_config?: Record<string, unknown> | string;
  source_catalogues?: unknown[] | string;
  // Provenance
  created_by?: string;
  modified_at?: string;
  [key: string]: any;
}

interface MergeActionsProps {
  events: any[];
  onDownload?: () => void;
  catalogueMetadata?: CatalogueMetadata;
  /**
   * Id of the saved merged catalogue. When set, downloads come from the server export route
   * (GET /api/catalogues/{id}/export), which reads every stored event even when
   * UNPAGINATED_EVENTS_LIMIT caps plain reads, streams the file, and embeds the saved
   * catalogue's merge_config and source_catalogues; `events` is then only what the map and
   * table show. An export-only merge saves nothing, so without an id the files are built in
   * the browser from `events`, which is then the complete merge result.
   */
  catalogueId?: string | null;
}

type ExportFormat = 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml';

/** The filename the export route suggests in its Content-Disposition header, if any. */
function suggestedFilename(response: Response): string | null {
  const match = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Build a complete ExportMetadata object from catalogue metadata.
 * Handles fields that may arrive as JSON strings (keywords, reference_links, data_quality).
 * Pure function — no side effects, safe to call outside React's render cycle.
 */
function buildExportMetadata(meta: CatalogueMetadata, eventCount: number) {
  let dataQuality: { completeness?: string; accuracy?: string; reliability?: string } | undefined;
  if (meta.data_quality) {
    try {
      dataQuality = typeof meta.data_quality === 'string'
        ? JSON.parse(meta.data_quality)
        : meta.data_quality;
    } catch { /* ignore */ }
  }

  let keywords: string[] | undefined;
  if (meta.keywords) {
    try {
      const kw = typeof meta.keywords === 'string' ? JSON.parse(meta.keywords) : meta.keywords;
      if (Array.isArray(kw)) keywords = kw;
    } catch { /* ignore */ }
  }

  let referenceLinks: string[] | undefined;
  if (meta.reference_links) {
    try {
      const rl = typeof meta.reference_links === 'string' ? JSON.parse(meta.reference_links) : meta.reference_links;
      if (Array.isArray(rl)) referenceLinks = rl;
    } catch { /* ignore */ }
  }

  // The merge configuration and source catalogue list make the file reproducible. The server
  // export route embeds both for a saved catalogue; an export-only merge is never saved, so
  // this download is its only record of how it was produced.
  let mergeConfig: unknown;
  if (meta.merge_config) {
    try {
      mergeConfig = typeof meta.merge_config === 'string' ? JSON.parse(meta.merge_config) : meta.merge_config;
    } catch { /* ignore */ }
  }

  let sourceCatalogues: unknown;
  if (meta.source_catalogues) {
    try {
      sourceCatalogues = typeof meta.source_catalogues === 'string'
        ? JSON.parse(meta.source_catalogues)
        : meta.source_catalogues;
    } catch { /* ignore */ }
  }

  const hasBounds = meta.min_latitude != null || meta.max_latitude != null ||
                    meta.min_longitude != null || meta.max_longitude != null;

  return {
    catalogueName: meta.name || 'Merged Earthquake Catalogue',
    description: meta.description,
    source: meta.data_source,
    provider: meta.provider,
    region: meta.geographic_region,
    timePeriodStart: meta.time_period_start,
    timePeriodEnd: meta.time_period_end,
    license: meta.license,
    citation: meta.citation,
    eventCount,
    generatedAt: new Date().toISOString(),
    boundingBox: hasBounds ? {
      minLatitude: meta.min_latitude ?? null,
      maxLatitude: meta.max_latitude ?? null,
      minLongitude: meta.min_longitude ?? null,
      maxLongitude: meta.max_longitude ?? null,
    } : undefined,
    contactName: meta.contact_name,
    contactEmail: meta.contact_email,
    contactOrganization: meta.contact_organization,
    dataQuality,
    qualityNotes: meta.quality_notes,
    doi: meta.doi,
    version: meta.version,
    keywords,
    referenceLinks,
    usageTerms: meta.usage_terms,
    notes: meta.notes,
    mergeDescription: meta.merge_description,
    mergeUseCase: meta.merge_use_case,
    mergeMethodology: meta.merge_methodology,
    mergeQualityAssessment: meta.merge_quality_assessment,
    mergeConfig,
    createdBy: meta.created_by,
    modifiedAt: meta.modified_at,
    sourceCatalogues,
  };
}

export function MergeActions({ events, catalogueMetadata = {}, catalogueId }: MergeActionsProps) {
  const exportMetadata = useMemo(
    () => buildExportMetadata(catalogueMetadata, events.length),
    [catalogueMetadata, events.length]
  );
  // Source catalogue names by id, so the map's "Source catalogue" colour mode and its popups
  // name catalogues rather than showing their ids.
  const catalogueNames = useMemo(() => {
    const names: Record<string, string> = {};
    const list = exportMetadata.sourceCatalogues;
    if (Array.isArray(list)) {
      for (const entry of list as Array<{ id?: unknown; name?: unknown }>) {
        if (entry && entry.id != null && typeof entry.name === 'string' && entry.name) names[String(entry.id)] = entry.name;
      }
    }
    return names;
  }, [exportMetadata.sourceCatalogues]);

  const saveBlob = (blob: Blob, filename: string) => {
    if (typeof window === 'undefined') return;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    saveBlob(new Blob([content], { type: mimeType }), filename);
  };

  // A saved merge is exported by the server (see `catalogueId`), so the file holds every
  // stored event rather than whatever subset this page holds in memory.
  const downloadFromServer = async (id: string, format: ExportFormat) => {
    try {
      const response = await fetch(`/api/catalogues/${encodeURIComponent(id)}/export?format=${format}`);
      if (!response.ok) {
        const errorInfo = await getApiError(response, 'Export failed');
        throw new Error(errorInfo.message);
      }
      const blob = await response.blob();
      saveBlob(
        blob,
        suggestedFilename(response) ?? generateMergedCatalogueFilename(format === 'quakeml' ? 'xml' : format)
      );
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export the merged catalogue',
        variant: 'destructive',
      });
    }
  };

  const handleExport = (format: ExportFormat, buildInBrowser: () => void) => {
    if (catalogueId) {
      void downloadFromServer(catalogueId, format);
    } else {
      buildInBrowser();
    }
  };

  const downloadCSV = () => {
    // Uses the shared exporter so the browser-side merge download and the server export
    // (GET /api/catalogues/{id}/export?format=csv) emit the SAME dialect. The default is
    // plain RFC 4180 — header as record 1, no `#` prologue — because RFC 4180 defines no
    // comment convention and a prologue breaks pandas.read_csv, R's read.csv, ZMAP and this
    // platform's own parseCSV. The catalogue metadata is still carried by the JSON, GeoJSON
    // and QuakeML downloads below.
    const csvContent = eventsToCSV(events, exportMetadata);
    const filename = generateMergedCatalogueFilename('csv', events.length);
    downloadFile(csvContent, filename, 'text/csv');
  };

  const downloadJSON = () => {
    const jsonContent = eventsToJSON(events, exportMetadata);
    const filename = generateMergedCatalogueFilename('json', events.length);
    downloadFile(jsonContent, filename, 'application/json');
  };

  const downloadGeoJSON = () => {
    const geoJsonContent = eventsToGeoJSON(events, exportMetadata);
    const filename = generateMergedCatalogueFilename('geojson', events.length);
    downloadFile(geoJsonContent, filename, 'application/geo+json');
  };

  const downloadKML = () => {
    const kmlContent = eventsToKML(events, exportMetadata);
    const filename = generateMergedCatalogueFilename('kml', events.length);
    downloadFile(kmlContent, filename, 'application/vnd.google-earth.kml+xml');
  };

  const downloadQuakeML = () => {
    const quakeMLContent = eventsToQuakeMLDocument(
      events,
      catalogueMetadata.name || 'Merged Earthquake Catalogue',
      exportMetadata
    );
    const filename = generateMergedCatalogueFilename('xml', events.length);
    downloadFile(quakeMLContent, filename, 'application/xml');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center relative z-10">
        <div className="text-sm text-muted-foreground">
          {events.length} events in merged catalogue
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export Catalogue
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-50">
            <DropdownMenuLabel>Export Format</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport('quakeml', downloadQuakeML)}>
              <Download className="mr-2 h-4 w-4" />
              QuakeML (XML)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv', downloadCSV)}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('json', downloadJSON)}>
              <Download className="mr-2 h-4 w-4" />
              JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('geojson', downloadGeoJSON)}>
              <Download className="mr-2 h-4 w-4" />
              GeoJSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('kml', downloadKML)}>
              <Download className="mr-2 h-4 w-4" />
              KML (Google Earth)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs defaultValue="map" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="map">
            <Map className="mr-2 h-4 w-4" />
            Map View
          </TabsTrigger>
          <TabsTrigger value="table">
            <List className="mr-2 h-4 w-4" />
            Table View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-4">
          <div className="h-[600px] w-full relative z-0">
            <MapWithNoSSR events={events} catalogueNames={catalogueNames} />
          </div>
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <EventTable
            events={events.map(e => ({
              id: e.id,
              time: e.time,
              latitude: e.latitude,
              longitude: e.longitude,
              // Unknown depth stays unknown: EventTable shows '—' and sorts it last, where a 0
              // would read (and sort) as a surface event.
              depth: e.depth ?? null,
              magnitude: e.magnitude,
              magnitude_type: e.magnitude_type ?? null,
              location_name: e.location_name ?? e.region ?? null,
              event_type: e.event_type ?? null,
              quality_score: e.quality_score ?? null,
              azimuthal_gap: e.azimuthal_gap ?? null,
              used_station_count: e.used_station_count ?? null,
              public_id: e.event_public_id ?? e.public_id ?? null,
              horizontal_uncertainty: e.horizontal_uncertainty ?? null,
              depth_type: e.depth_type ?? null,
              agency_id: e.agency_id ?? null,
              author: e.author ?? null,
              evaluation_mode: e.evaluation_mode ?? null,
              evaluation_status: e.evaluation_status ?? null,
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}