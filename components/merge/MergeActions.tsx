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
import { generateMergedCatalogueFilename } from '@/lib/export-utils';
import { eventsToGeoJSON, eventsToJSON, eventsToKML } from '@/lib/exporters';
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
  merge_description?: string;
  merge_methodology?: string;
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
    // Build metadata header comments
    const metadataLines: string[] = [];
    metadataLines.push('# Earthquake Catalogue Export');
    metadataLines.push(`# Export Date: ${new Date().toISOString()}`);
    metadataLines.push(`# Event Count: ${events.length}`);

    if (catalogueMetadata.name) {
      metadataLines.push(`# Catalogue: ${catalogueMetadata.name}`);
    }
    if (catalogueMetadata.description) {
      metadataLines.push(`# Description: ${catalogueMetadata.description}`);
    }
    if (catalogueMetadata.data_source) {
      metadataLines.push(`# Source: ${catalogueMetadata.data_source}`);
    }
    if (catalogueMetadata.provider) {
      metadataLines.push(`# Provider: ${catalogueMetadata.provider}`);
    }
    if (catalogueMetadata.geographic_region) {
      metadataLines.push(`# Region: ${catalogueMetadata.geographic_region}`);
    }
    if (catalogueMetadata.time_period_start || catalogueMetadata.time_period_end) {
      const start = catalogueMetadata.time_period_start || 'N/A';
      const end = catalogueMetadata.time_period_end || 'N/A';
      metadataLines.push(`# Time Period: ${start} to ${end}`);
    }
    if (catalogueMetadata.license) {
      metadataLines.push(`# License: ${catalogueMetadata.license}`);
    }
    if (catalogueMetadata.citation) {
      metadataLines.push(`# Citation: ${catalogueMetadata.citation}`);
    }
    if (catalogueMetadata.merge_description) {
      metadataLines.push(`# Merge Description: ${catalogueMetadata.merge_description}`);
    }
    if (catalogueMetadata.merge_methodology) {
      metadataLines.push(`# Merge Methodology: ${catalogueMetadata.merge_methodology}`);
    }

    metadataLines.push('#');

    const headers = ['Time', 'Latitude', 'Longitude', 'Depth', 'Magnitude', 'Region'];
    const csvContent = [
      ...metadataLines,
      headers.join(','),
      ...events.map(event => [
        event.time,
        event.latitude,
        event.longitude,
        event.depth || '',
        event.magnitude,
        event.region || ''
      ].join(','))
    ].join('\n');

    const filename = generateMergedCatalogueFilename('csv', events.length);
    downloadFile(csvContent, filename, 'text/csv');
  };

  const downloadJSON = () => {
    // Prepare metadata for export
    const metadata = {
      catalogueName: catalogueMetadata.name || 'Merged Earthquake Catalogue',
      description: catalogueMetadata.description,
      source: catalogueMetadata.data_source,
      provider: catalogueMetadata.provider,
      region: catalogueMetadata.geographic_region || 'New Zealand',
      timePeriodStart: catalogueMetadata.time_period_start,
      timePeriodEnd: catalogueMetadata.time_period_end,
      license: catalogueMetadata.license,
      citation: catalogueMetadata.citation,
      eventCount: events.length,
      generatedAt: new Date().toISOString(),
    };

    const jsonContent = eventsToJSON(events, metadata);
    const filename = generateMergedCatalogueFilename('json', events.length);
    downloadFile(jsonContent, filename, 'application/json');
  };

  const downloadGeoJSON = () => {
    // Prepare metadata for export
    const metadata = {
      catalogueName: catalogueMetadata.name || 'Merged Earthquake Catalogue',
      description: catalogueMetadata.description,
      source: catalogueMetadata.data_source,
      provider: catalogueMetadata.provider,
      region: catalogueMetadata.geographic_region || 'New Zealand',
      timePeriodStart: catalogueMetadata.time_period_start,
      timePeriodEnd: catalogueMetadata.time_period_end,
      license: catalogueMetadata.license,
      citation: catalogueMetadata.citation,
      eventCount: events.length,
      generatedAt: new Date().toISOString(),
    };

    const geoJsonContent = eventsToGeoJSON(events, metadata);
    const filename = generateMergedCatalogueFilename('geojson', events.length);
    downloadFile(geoJsonContent, filename, 'application/geo+json');
  };

  const downloadKML = () => {
    // Prepare metadata for export
    const metadata = {
      catalogueName: catalogueMetadata.name || 'Merged Earthquake Catalogue',
      description: catalogueMetadata.description,
      source: catalogueMetadata.data_source,
      provider: catalogueMetadata.provider,
      region: catalogueMetadata.geographic_region || 'New Zealand',
      timePeriodStart: catalogueMetadata.time_period_start,
      timePeriodEnd: catalogueMetadata.time_period_end,
      license: catalogueMetadata.license,
      citation: catalogueMetadata.citation,
      eventCount: events.length,
      generatedAt: new Date().toISOString(),
    };

    const kmlContent = eventsToKML(events, metadata);
    const filename = generateMergedCatalogueFilename('kml', events.length);
    downloadFile(kmlContent, filename, 'application/vnd.google-earth.kml+xml');
  };

  const downloadQuakeML = () => {
    const timestamp = new Date().toISOString();

    // Build metadata comments
    let metadataComments = '';
    if (catalogueMetadata.name) {
      metadataComments += `<!-- Catalogue: ${catalogueMetadata.name} -->\n`;
    }
    if (catalogueMetadata.description) {
      metadataComments += `<!-- Description: ${catalogueMetadata.description} -->\n`;
    }
    if (catalogueMetadata.data_source) {
      metadataComments += `<!-- Source: ${catalogueMetadata.data_source} -->\n`;
    }
    if (catalogueMetadata.provider) {
      metadataComments += `<!-- Provider: ${catalogueMetadata.provider} -->\n`;
    }
    if (catalogueMetadata.license) {
      metadataComments += `<!-- License: ${catalogueMetadata.license} -->\n`;
    }
    if (catalogueMetadata.citation) {
      metadataComments += `<!-- Citation: ${catalogueMetadata.citation} -->\n`;
    }

    const quakeMLContent = `<?xml version="1.0" encoding="UTF-8"?>
${metadataComments}<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">
  <eventParameters publicID="quakeml:nz.geonet/merged_catalogue">
    <creationInfo>
      <creationTime>${timestamp}</creationTime>
      <agencyID>NZ.MERGED</agencyID>
      <author>Earthquake Catalogue Management System</author>
    </creationInfo>
${events.map((event, index) => `    <event publicID="quakeml:nz.geonet/event/${event.id || index}">
      <preferredOriginID>quakeml:nz.geonet/origin/${event.id || index}</preferredOriginID>
      <preferredMagnitudeID>quakeml:nz.geonet/magnitude/${event.id || index}</preferredMagnitudeID>
      <type>earthquake</type>
      <description>
        <text>${event.region || 'New Zealand'}</text>
        <type>region name</type>
      </description>
      <origin publicID="quakeml:nz.geonet/origin/${event.id || index}">
        <time>
          <value>${event.time}</value>
        </time>
        <latitude>
          <value>${event.latitude}</value>
        </latitude>
        <longitude>
          <value>${event.longitude}</value>
        </longitude>
        <depth>
          <value>${(event.depth || 0) * 1000}</value>
          <uncertainty>0</uncertainty>
        </depth>
        <creationInfo>
          <creationTime>${timestamp}</creationTime>
        </creationInfo>
      </origin>
      <magnitude publicID="quakeml:nz.geonet/magnitude/${event.id || index}">
        <mag>
          <value>${event.magnitude}</value>
        </mag>
        <type>ML</type>
        <creationInfo>
          <creationTime>${timestamp}</creationTime>
        </creationInfo>
      </magnitude>
    </event>`).join('\n')}
  </eventParameters>
</q:quakeml>`;

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