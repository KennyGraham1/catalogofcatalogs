'use client';

import { useEffect, useState } from 'react';
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
import { generateMergedCatalogueFilename, csvField } from '@/lib/export-utils';
import { eventsToGeoJSON, eventsToJSON, eventsToKML } from '@/lib/exporters';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
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
  // Provenance
  created_by?: string;
  modified_at?: string;
  [key: string]: any;
}

interface MergeActionsProps {
  events: any[];
  onDownload: () => void;
  catalogueMetadata?: CatalogueMetadata;
}

export function MergeActions({ events, catalogueMetadata = {} }: MergeActionsProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    if (typeof window === 'undefined') return;

    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    const meta = catalogueMetadata;
    const metadataLines: string[] = [];

    if (meta.name) metadataLines.push(`# Catalogue: ${meta.name}`);
    if (meta.description) metadataLines.push(`# Description: ${meta.description}`);
    if (meta.data_source) metadataLines.push(`# Source: ${meta.data_source}`);
    if (meta.provider) metadataLines.push(`# Provider: ${meta.provider}`);
    if (meta.geographic_region) metadataLines.push(`# Region: ${meta.geographic_region}`);
    metadataLines.push(`# Event Count: ${events.length}`);
    metadataLines.push(`# Generated: ${new Date().toISOString()}`);
    if (meta.license) metadataLines.push(`# License: ${meta.license}`);
    if (meta.citation) metadataLines.push(`# Citation: ${meta.citation}`);
    if (meta.doi) metadataLines.push(`# DOI: ${meta.doi}`);
    if (meta.version) metadataLines.push(`# Version: ${meta.version}`);
    // Contact information
    if (meta.contact_name) metadataLines.push(`# Contact Name: ${meta.contact_name}`);
    if (meta.contact_email) metadataLines.push(`# Contact Email: ${meta.contact_email}`);
    if (meta.contact_organization) metadataLines.push(`# Contact Organization: ${meta.contact_organization}`);
    // Data quality
    if (meta.data_quality) {
      try {
        const dq = typeof meta.data_quality === 'string' ? JSON.parse(meta.data_quality) : meta.data_quality;
        if (dq.completeness) metadataLines.push(`# Data Completeness: ${dq.completeness}`);
        if (dq.accuracy) metadataLines.push(`# Data Accuracy: ${dq.accuracy}`);
        if (dq.reliability) metadataLines.push(`# Data Reliability: ${dq.reliability}`);
      } catch { /* ignore parse errors */ }
    }
    if (meta.quality_notes) metadataLines.push(`# Quality Notes: ${meta.quality_notes}`);
    // Keywords
    if (meta.keywords) {
      try {
        const kw = typeof meta.keywords === 'string' ? JSON.parse(meta.keywords) : meta.keywords;
        if (Array.isArray(kw) && kw.length > 0) metadataLines.push(`# Keywords: ${kw.join(', ')}`);
      } catch { /* ignore parse errors */ }
    }
    // Reference links
    if (meta.reference_links) {
      try {
        const rl = typeof meta.reference_links === 'string' ? JSON.parse(meta.reference_links) : meta.reference_links;
        if (Array.isArray(rl) && rl.length > 0) metadataLines.push(`# References: ${rl.join(', ')}`);
      } catch { /* ignore parse errors */ }
    }
    if (meta.usage_terms) metadataLines.push(`# Usage Terms: ${meta.usage_terms}`);
    if (meta.notes) metadataLines.push(`# Notes: ${meta.notes}`);
    // Geographic bounds
    if (meta.min_latitude != null || meta.max_latitude != null ||
        meta.min_longitude != null || meta.max_longitude != null) {
      metadataLines.push(
        `# Bounding Box: lat [${meta.min_latitude ?? '?'}, ${meta.max_latitude ?? '?'}], ` +
        `lon [${meta.min_longitude ?? '?'}, ${meta.max_longitude ?? '?'}]`
      );
    }
    // Merge-specific metadata
    if (meta.merge_description) metadataLines.push(`# Merge Description: ${meta.merge_description}`);
    if (meta.merge_use_case) metadataLines.push(`# Merge Use Case: ${meta.merge_use_case}`);
    if (meta.merge_methodology) metadataLines.push(`# Merge Methodology: ${meta.merge_methodology}`);
    if (meta.merge_quality_assessment) metadataLines.push(`# Merge Quality Assessment: ${meta.merge_quality_assessment}`);
    // Provenance
    if (meta.created_by) metadataLines.push(`# Created By: ${meta.created_by}`);
    if (meta.modified_at) metadataLines.push(`# Modified At: ${meta.modified_at}`);

    metadataLines.push('#');
    // Note: complex nested fields (origins, magnitudes, picks, arrivals, focal_mechanisms,
    // amplitudes, station_magnitudes, event_descriptions, comments, creation_info, source_events)
    // cannot be represented in flat CSV format; use JSON or QuakeML export for full fidelity.

    const headers = [
      'Time',
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
    ];

    const n = (v: number | string | null | undefined) => (v !== null && v !== undefined ? v : '');

    const rows = events.map((event: any) => {
      let source = 'unknown';
      if (event.source_events) {
        try {
          const sourceEvents = JSON.parse(event.source_events) as Array<{ source?: string }>;
          source = sourceEvents[0]?.source || 'unknown';
        } catch { /* ignore */ }
      }

      return [
        csvField(event.time),
        csvField(event.latitude),
        csvField(event.longitude),
        csvField(n(event.depth)),
        csvField(event.magnitude),
        csvField(event.magnitude_type),
        csvField(event.event_type),
        csvField(event.event_type_certainty),
        csvField(event.region || event.location_name || ''),
        csvField(event.location_name),
        csvField(source),
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
      ].join(',');
    });

    const csvContent = [...metadataLines, headers.join(','), ...rows].join('\n');
    const filename = generateMergedCatalogueFilename('csv', events.length);
    downloadFile(csvContent, filename, 'text/csv');
  };

  // Build a complete ExportMetadata object from the catalogue metadata prop.
  // Handles fields that may be stored as JSON strings (keywords, reference_links, data_quality).
  const buildExportMetadata = () => {
    const meta = catalogueMetadata;

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
      eventCount: events.length,
      generatedAt: new Date().toISOString(),
      // Geographic bounds
      boundingBox: hasBounds ? {
        minLatitude: meta.min_latitude ?? null,
        maxLatitude: meta.max_latitude ?? null,
        minLongitude: meta.min_longitude ?? null,
        maxLongitude: meta.max_longitude ?? null,
      } : undefined,
      // Contact information
      contactName: meta.contact_name,
      contactEmail: meta.contact_email,
      contactOrganization: meta.contact_organization,
      // Data quality
      dataQuality,
      qualityNotes: meta.quality_notes,
      // Additional metadata
      doi: meta.doi,
      version: meta.version,
      keywords,
      referenceLinks,
      usageTerms: meta.usage_terms,
      notes: meta.notes,
      // Merge-specific metadata
      mergeDescription: meta.merge_description,
      mergeUseCase: meta.merge_use_case,
      mergeMethodology: meta.merge_methodology,
      mergeQualityAssessment: meta.merge_quality_assessment,
      // Provenance
      createdBy: meta.created_by,
      modifiedAt: meta.modified_at,
    };
  };

  const downloadJSON = () => {
    const jsonContent = eventsToJSON(events, buildExportMetadata());
    const filename = generateMergedCatalogueFilename('json', events.length);
    downloadFile(jsonContent, filename, 'application/json');
  };

  const downloadGeoJSON = () => {
    const geoJsonContent = eventsToGeoJSON(events, buildExportMetadata());
    const filename = generateMergedCatalogueFilename('geojson', events.length);
    downloadFile(geoJsonContent, filename, 'application/geo+json');
  };

  const downloadKML = () => {
    const kmlContent = eventsToKML(events, buildExportMetadata());
    const filename = generateMergedCatalogueFilename('kml', events.length);
    downloadFile(kmlContent, filename, 'application/vnd.google-earth.kml+xml');
  };

  const downloadQuakeML = () => {
    const quakeMLContent = eventsToQuakeMLDocument(
      events,
      catalogueMetadata.name || 'Merged Earthquake Catalogue',
      buildExportMetadata()
    );
    const filename = generateMergedCatalogueFilename('xml', events.length);
    downloadFile(quakeMLContent, filename, 'application/xml');
  };

  if (!isMounted) {
    return null;
  }

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
            <DropdownMenuItem onClick={downloadQuakeML}>
              <Download className="mr-2 h-4 w-4" />
              QuakeML (XML)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadCSV}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadJSON}>
              <Download className="mr-2 h-4 w-4" />
              JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadGeoJSON}>
              <Download className="mr-2 h-4 w-4" />
              GeoJSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadKML}>
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
            <MapWithNoSSR events={events} />
          </div>
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <EventTable
            events={events.map(e => ({
              id: e.id,
              time: e.time,
              latitude: e.latitude,
              longitude: e.longitude,
              depth: e.depth || 0,
              magnitude: e.magnitude,
              magnitude_type: e.magnitude_type || null,
              location_name: e.region || null,
              event_type: e.event_type || null,
              quality_score: e.quality_score || null,
              azimuthal_gap: e.azimuthal_gap || null,
              used_station_count: e.used_station_count || null,
              public_id: e.public_id || null,
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}