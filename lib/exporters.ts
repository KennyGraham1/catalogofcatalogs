/**
 * Export utilities for earthquake catalogues
 * Supports GeoJSON, KML, CSV, JSON, and QuakeML formats
 */

import type { MergedEvent, Catalogue } from './db';

export interface ExportMetadata {
  catalogueName?: string;
  description?: string;
  source?: string;
  provider?: string;
  region?: string;
  timePeriodStart?: string;
  timePeriodEnd?: string;
  license?: string;
  citation?: string;
  eventCount?: number;
  generatedAt?: string;
}

/**
 * Convert events to GeoJSON FeatureCollection
 * GeoJSON is a format for encoding geographic data structures
 * https://geojson.org/
 */
export function eventsToGeoJSON(
  events: MergedEvent[],
  metadata?: ExportMetadata
): string {
  const geoJson = {
    type: 'FeatureCollection',
    metadata: {
      title: metadata?.catalogueName || 'Earthquake Catalogue',
      description: metadata?.description,
      generated: metadata?.generatedAt || new Date().toISOString(),
      count: events.length,
      source: metadata?.source,
      provider: metadata?.provider,
      region: metadata?.region,
      timePeriod: metadata?.timePeriodStart && metadata?.timePeriodEnd ? {
        start: metadata.timePeriodStart,
        end: metadata.timePeriodEnd
      } : undefined,
      license: metadata?.license,
      citation: metadata?.citation,
    },
    features: events.map(event => ({
      type: 'Feature',
      id: event.id,
      geometry: {
        type: 'Point',
        // GeoJSON coordinates are [longitude, latitude, elevation]
        // For earthquakes, we use negative depth as elevation
        coordinates: [
          event.longitude,
          event.latitude,
          event.depth !== null ? -event.depth : 0
        ]
      },
      properties: {
        // Core properties
        time: event.time,
        magnitude: event.magnitude,
        magnitudeType: event.magnitude_type,
        depth: event.depth,
        
        // Identifiers
        publicId: event.event_public_id,
        sourceId: event.source_id,
        
        // Event classification
        eventType: event.event_type,
        eventTypeCertainty: event.event_type_certainty,
        
        // Uncertainties
        timeUncertainty: event.time_uncertainty,
        locationUncertainty: event.latitude_uncertainty && event.longitude_uncertainty ? 
          Math.sqrt(
            Math.pow(event.latitude_uncertainty, 2) + 
            Math.pow(event.longitude_uncertainty, 2)
          ) : undefined,
        depthUncertainty: event.depth_uncertainty,
        magnitudeUncertainty: event.magnitude_uncertainty,
        
        // Quality metrics
        azimuthalGap: event.azimuthal_gap,
        usedPhaseCount: event.used_phase_count,
        usedStationCount: event.used_station_count,
        magnitudeStationCount: event.magnitude_station_count,
        standardError: event.standard_error,
        
        // Evaluation
        evaluationMode: event.evaluation_mode,
        evaluationStatus: event.evaluation_status,
      }
    }))
  };

  return JSON.stringify(geoJson, null, 2);
}

/**
 * Convert events to KML (Keyhole Markup Language)
 * KML is used by Google Earth and other mapping applications
 * https://developers.google.com/kml/documentation/kmlreference
 */
export function eventsToKML(
  events: MergedEvent[],
  metadata?: ExportMetadata
): string {
  const escapeXml = (str: string | null | undefined): string => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const getMagnitudeColor = (magnitude: number): string => {
    // Color scale from green (small) to red (large)
    if (magnitude < 3) return 'ff00ff00'; // Green (AABBGGRR format)
    if (magnitude < 4) return 'ff00ffff'; // Yellow
    if (magnitude < 5) return 'ff0099ff'; // Orange
    if (magnitude < 6) return 'ff0066ff'; // Red-Orange
    if (magnitude < 7) return 'ff0000ff'; // Red
    return 'ff0000cc'; // Dark Red
  };

  const getMagnitudeScale = (magnitude: number): number => {
    // Scale marker size based on magnitude
    return Math.max(0.5, Math.min(3.0, magnitude / 3));
  };

  let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  kml += '  <Document>\n';
  kml += `    <name>${escapeXml(metadata?.catalogueName || 'Earthquake Catalogue')}</name>\n`;
  
  if (metadata?.description) {
    kml += `    <description>${escapeXml(metadata.description)}</description>\n`;
  }

  // Define styles for different magnitude ranges
  const magnitudeRanges = [
    { min: 0, max: 3, name: 'mag_0_3', color: 'ff00ff00', label: 'M < 3' },
    { min: 3, max: 4, name: 'mag_3_4', color: 'ff00ffff', label: 'M 3-4' },
    { min: 4, max: 5, name: 'mag_4_5', color: 'ff0099ff', label: 'M 4-5' },
    { min: 5, max: 6, name: 'mag_5_6', color: 'ff0066ff', label: 'M 5-6' },
    { min: 6, max: 7, name: 'mag_6_7', color: 'ff0000ff', label: 'M 6-7' },
    { min: 7, max: 10, name: 'mag_7_plus', color: 'ff0000cc', label: 'M ≥ 7' },
  ];

  magnitudeRanges.forEach(range => {
    kml += `    <Style id="${range.name}">\n`;
    kml += '      <IconStyle>\n';
    kml += `        <color>${range.color}</color>\n`;
    kml += '        <scale>1.0</scale>\n';
    kml += '        <Icon>\n';
    kml += '          <href>http://maps.google.com/mapfiles/kml/shapes/earthquake.png</href>\n';
    kml += '        </Icon>\n';
    kml += '      </IconStyle>\n';
    kml += '      <LabelStyle>\n';
    kml += '        <scale>0.7</scale>\n';
    kml += '      </LabelStyle>\n';
    kml += `      <BalloonStyle>\n`;
    kml += `        <text><![CDATA[\n`;
    kml += `          <h3>$[name]</h3>\n`;
    kml += `          <p>$[description]</p>\n`;
    kml += `        ]]></text>\n`;
    kml += `      </BalloonStyle>\n`;
    kml += '    </Style>\n';
  });

  // Create folders for each magnitude range
  magnitudeRanges.forEach(range => {
    const rangeEvents = events.filter(e => e.magnitude >= range.min && e.magnitude < range.max);
    
    if (rangeEvents.length > 0) {
      kml += `    <Folder>\n`;
      kml += `      <name>${range.label} (${rangeEvents.length} events)</name>\n`;
      kml += `      <open>1</open>\n`;

      rangeEvents.forEach(event => {
        const eventDate = new Date(event.time);
        const formattedDate = eventDate.toISOString();
        
        kml += '      <Placemark>\n';
        kml += `        <name>M ${event.magnitude.toFixed(1)}</name>\n`;
        kml += `        <description><![CDATA[\n`;
        kml += `          <table>\n`;
        kml += `            <tr><td><b>Time:</b></td><td>${escapeXml(formattedDate)}</td></tr>\n`;
        kml += `            <tr><td><b>Magnitude:</b></td><td>${event.magnitude.toFixed(2)} ${escapeXml(event.magnitude_type || '')}</td></tr>\n`;
        kml += `            <tr><td><b>Depth:</b></td><td>${event.depth !== null ? event.depth.toFixed(1) + ' km' : 'Unknown'}</td></tr>\n`;
        kml += `            <tr><td><b>Location:</b></td><td>${event.latitude.toFixed(4)}°, ${event.longitude.toFixed(4)}°</td></tr>\n`;
        
        if (event.azimuthal_gap !== null) {
          kml += `            <tr><td><b>Azimuthal Gap:</b></td><td>${event.azimuthal_gap.toFixed(0)}°</td></tr>\n`;
        }
        if (event.used_station_count !== null) {
          kml += `            <tr><td><b>Stations:</b></td><td>${event.used_station_count}</td></tr>\n`;
        }
        if (event.evaluation_status) {
          kml += `            <tr><td><b>Status:</b></td><td>${escapeXml(event.evaluation_status)}</td></tr>\n`;
        }
        
        kml += `          </table>\n`;
        kml += `        ]]></description>\n`;
        kml += `        <styleUrl>#${range.name}</styleUrl>\n`;
        kml += `        <TimeStamp><when>${formattedDate}</when></TimeStamp>\n`;
        kml += '        <Point>\n';
        // KML uses longitude, latitude, altitude (meters above sea level)
        // For earthquakes, depth is negative altitude
        const altitude = event.depth !== null ? -event.depth * 1000 : 0;
        kml += `          <coordinates>${event.longitude},${event.latitude},${altitude}</coordinates>\n`;
        kml += '        </Point>\n';
        kml += '      </Placemark>\n';
      });

      kml += '    </Folder>\n';
    }
  });

  kml += '  </Document>\n';
  kml += '</kml>\n';

  return kml;
}

/**
 * Convert events to enhanced JSON format
 */
export function eventsToJSON(
  events: MergedEvent[],
  metadata?: ExportMetadata
): string {
  const jsonData = {
    metadata: {
      catalogueName: metadata?.catalogueName,
      description: metadata?.description,
      source: metadata?.source,
      provider: metadata?.provider,
      region: metadata?.region,
      timePeriod: metadata?.timePeriodStart && metadata?.timePeriodEnd ? {
        start: metadata.timePeriodStart,
        end: metadata.timePeriodEnd
      } : undefined,
      license: metadata?.license,
      citation: metadata?.citation,
      generated: metadata?.generatedAt || new Date().toISOString(),
      eventCount: events.length,
    },
    events: events.map(event => ({
      id: event.id,
      publicId: event.event_public_id,
      sourceId: event.source_id,
      time: event.time,
      location: {
        latitude: event.latitude,
        longitude: event.longitude,
        depth: event.depth,
      },
      magnitude: {
        value: event.magnitude,
        type: event.magnitude_type,
        uncertainty: event.magnitude_uncertainty,
        stationCount: event.magnitude_station_count,
      },
      uncertainties: {
        time: event.time_uncertainty,
        latitude: event.latitude_uncertainty,
        longitude: event.longitude_uncertainty,
        depth: event.depth_uncertainty,
      },
      quality: {
        azimuthalGap: event.azimuthal_gap,
        usedPhaseCount: event.used_phase_count,
        usedStationCount: event.used_station_count,
        standardError: event.standard_error,
      },
      evaluation: {
        mode: event.evaluation_mode,
        status: event.evaluation_status,
      },
      eventType: event.event_type,
      eventTypeCertainty: event.event_type_certainty,
    }))
  };

  return JSON.stringify(jsonData, null, 2);
}

