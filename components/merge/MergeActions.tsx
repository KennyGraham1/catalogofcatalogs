'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Map, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Activity, Calendar, Ruler } from 'lucide-react';
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
import { getMagnitudeColor, getMagnitudeRadius } from '@/lib/earthquake-utils';

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

interface MergeActionsProps {
  events: any[];
  onDownload: () => void;
}

export function MergeActions({ events, onDownload }: MergeActionsProps) {
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
    const headers = ['Time', 'Latitude', 'Longitude', 'Depth', 'Magnitude', 'Region'];
    const csvContent = [
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

    downloadFile(csvContent, 'merged_catalogue.csv', 'text/csv');
  };

  const downloadJSON = () => {
    const jsonContent = JSON.stringify({
      metadata: {
        title: 'Merged New Zealand Earthquake Catalogue',
        generated: new Date().toISOString(),
        eventCount: events.length,
        format: 'JSON',
        region: 'New Zealand'
      },
      events: events.map(event => ({
        time: event.time,
        location: {
          latitude: event.latitude,
          longitude: event.longitude,
          depth: event.depth
        },
        magnitude: event.magnitude,
        region: event.region || 'Unknown'
      }))
    }, null, 2);

    downloadFile(jsonContent, 'merged_catalogue.json', 'application/json');
  };

  const downloadGeoJSON = () => {
    const geoJsonContent = JSON.stringify({
      type: 'FeatureCollection',
      metadata: {
        title: 'Merged New Zealand Earthquake Catalogue',
        generated: new Date().toISOString(),
        eventCount: events.length,
        region: 'New Zealand'
      },
      features: events.map(event => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [event.longitude, event.latitude, event.depth || 0]
        },
        properties: {
          time: event.time,
          magnitude: event.magnitude,
          depth: event.depth,
          region: event.region || 'Unknown',
          id: event.id
        }
      }))
    }, null, 2);

    downloadFile(geoJsonContent, 'merged_catalogue.geojson', 'application/geo+json');
  };

  const downloadQuakeML = () => {
    const timestamp = new Date().toISOString();

    const quakeMLContent = `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">
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

    downloadFile(quakeMLContent, 'merged_catalogue.xml', 'application/xml');
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="h-[600px] w-full relative z-0">
        <MapWithNoSSR events={events} />
      </div>
    </div>
  );
}