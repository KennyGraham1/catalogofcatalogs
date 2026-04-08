/**
 * Export utilities for earthquake catalogues
 * Supports GeoJSON, KML, CSV, JSON, and QuakeML formats
 */

import type { MergedEvent } from './db';

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
  // Geographic bounds
  boundingBox?: {
    minLatitude?: number | null;
    maxLatitude?: number | null;
    minLongitude?: number | null;
    maxLongitude?: number | null;
  };
  // Contact information
  contactName?: string;
  contactEmail?: string;
  contactOrganization?: string;
  // Data quality
  dataQuality?: {
    completeness?: string;
    accuracy?: string;
    reliability?: string;
  };
  qualityNotes?: string;
  // Additional metadata
  doi?: string;
  version?: string;
  keywords?: string[];
  referenceLinks?: string[];
  usageTerms?: string;
  notes?: string;
  // Merge-specific metadata
  mergeDescription?: string;
  mergeUseCase?: string;
  mergeMethodology?: string;
  mergeQualityAssessment?: string;
  // Provenance
  createdBy?: string;
  modifiedAt?: string;
  // Source catalogues (parsed from JSON string in database)
  sourceCatalogues?: unknown;
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
  // RFC 7946 §5 — emit a bbox member when all four bounds are available.
  const bb = metadata?.boundingBox;
  const hasBbox = bb != null &&
    bb.minLongitude != null && bb.minLatitude != null &&
    bb.maxLongitude != null && bb.maxLatitude != null;

  const geoJson: Record<string, unknown> = {
    type: 'FeatureCollection',
    // bbox order: [west, south, east, north] (RFC 7946)
    ...(hasBbox ? { bbox: [bb!.minLongitude, bb!.minLatitude, bb!.maxLongitude, bb!.maxLatitude] } : {}),
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
        end: metadata.timePeriodEnd,
      } : undefined,
      boundingBox: metadata?.boundingBox,
      license: metadata?.license,
      citation: metadata?.citation,
      // Contact information
      contact: (metadata?.contactName || metadata?.contactEmail || metadata?.contactOrganization) ? {
        name: metadata?.contactName,
        email: metadata?.contactEmail,
        organization: metadata?.contactOrganization,
      } : undefined,
      // Data quality
      dataQuality: metadata?.dataQuality,
      qualityNotes: metadata?.qualityNotes,
      // Additional metadata
      doi: metadata?.doi,
      version: metadata?.version,
      keywords: metadata?.keywords,
      referenceLinks: metadata?.referenceLinks,
      usageTerms: metadata?.usageTerms,
      notes: metadata?.notes,
      // Merge-specific metadata
      merge: (metadata?.mergeDescription || metadata?.mergeUseCase ||
              metadata?.mergeMethodology || metadata?.mergeQualityAssessment) ? {
        description: metadata?.mergeDescription,
        useCase: metadata?.mergeUseCase,
        methodology: metadata?.mergeMethodology,
        qualityAssessment: metadata?.mergeQualityAssessment,
      } : undefined,
      // Provenance
      provenance: (metadata?.createdBy || metadata?.modifiedAt || metadata?.sourceCatalogues) ? {
        createdBy: metadata?.createdBy,
        modifiedAt: metadata?.modifiedAt,
        sourceCatalogues: metadata?.sourceCatalogues,
      } : undefined,
    },
    features: events.map(event => ({
      type: 'Feature',
      id: event.id,
      geometry: {
        type: 'Point',
        // GeoJSON coordinates are [longitude, latitude, elevation].
        // For earthquakes, depth (km below surface) becomes negative elevation.
        // When depth is unknown (null) we emit a 2D point [lon, lat] rather than
        // implying a surface location with elevation=0 (RFC 7946 §3.1.1).
        coordinates: event.depth != null
          ? [event.longitude, event.latitude, -event.depth]
          : [event.longitude, event.latitude],
      },
      properties: {
        // Identifiers
        publicId: event.event_public_id,
        sourceId: event.source_id,
        catalogueId: event.catalogue_id,
        createdAt: event.created_at,

        // Timing
        time: event.time,

        // Location
        depth: event.depth,               // km
        depthType: event.depth_type,
        region: event.region,
        locationName: event.location_name,

        // Event classification
        eventType: event.event_type,
        eventTypeCertainty: event.event_type_certainty,

        // Magnitude
        magnitude: event.magnitude,
        magnitudeType: event.magnitude_type,
        magnitudeUncertainty: event.magnitude_uncertainty,
        magnitudeStationCount: event.magnitude_station_count,
        magnitudeMethodId: event.magnitude_method_id,
        magnitudeEvaluationMode: event.magnitude_evaluation_mode,
        magnitudeEvaluationStatus: event.magnitude_evaluation_status,

        // Location uncertainties (individual components + precomputed horizontal)
        timeUncertainty: event.time_uncertainty,
        latitudeUncertainty: event.latitude_uncertainty,
        longitudeUncertainty: event.longitude_uncertainty,
        depthUncertainty: event.depth_uncertainty,
        horizontalUncertainty: event.horizontal_uncertainty,     // km
        // Combined location uncertainty (Euclidean of lat/lon components), kept for
        // backward compatibility; prefer horizontalUncertainty when available.
        locationUncertainty: event.latitude_uncertainty != null && event.longitude_uncertainty != null
          ? Math.sqrt(
              Math.pow(event.latitude_uncertainty, 2) +
              Math.pow(event.longitude_uncertainty, 2)
            )
          : undefined,

        // Origin provenance
        earthModelId: event.earth_model_id,
        methodId: event.method_id,
        agencyId: event.agency_id,
        author: event.author,

        // Quality metrics
        azimuthalGap: event.azimuthal_gap,
        usedPhaseCount: event.used_phase_count,
        usedStationCount: event.used_station_count,
        standardError: event.standard_error,
        minimumDistance: event.minimum_distance,        // degrees
        maximumDistance: event.maximum_distance,        // degrees
        associatedPhaseCount: event.associated_phase_count,
        associatedStationCount: event.associated_station_count,
        depthPhaseCount: event.depth_phase_count,

        // Evaluation
        evaluationMode: event.evaluation_mode,
        evaluationStatus: event.evaluation_status,

        // Preferred IDs (for cross-referencing nested elements)
        preferredOriginId: event.preferred_origin_id,
        preferredMagnitudeId: event.preferred_magnitude_id,

        // Complex nested data — parsed from JSON strings stored in the database.
        // GeoJSON properties may contain any valid JSON value (RFC 7946 §3.2).
        sourceEvents: safeParseJsonField(event.source_events),
        origins: safeParseJsonField(event.origins),
        magnitudes: safeParseJsonField(event.magnitudes),
        picks: safeParseJsonField(event.picks),
        arrivals: safeParseJsonField(event.arrivals),
        focalMechanisms: safeParseJsonField(event.focal_mechanisms),
        amplitudes: safeParseJsonField(event.amplitudes),
        stationMagnitudes: safeParseJsonField(event.station_magnitudes),
        eventDescriptions: safeParseJsonField(event.event_descriptions),
        comments: safeParseJsonField(event.comments),
        creationInfo: safeParseJsonField(event.creation_info),
        originQuality: safeParseJsonField(event.origin_quality),
      },
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

  // Returns a KML icon scale (0.5–3.0) that grows with magnitude.
  const getMagnitudeScale = (magnitude: number): number =>
    Math.max(0.5, Math.min(3.0, magnitude / 3));

  let kml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  kml += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  kml += '  <Document>\n';
  kml += `    <name>${escapeXml(metadata?.catalogueName || 'Earthquake Catalogue')}</name>\n`;

  // Build comprehensive description with all metadata
  const descriptionParts: string[] = [];
  if (metadata?.description) descriptionParts.push(metadata.description);
  if (metadata?.source) descriptionParts.push(`Source: ${metadata.source}`);
  if (metadata?.provider) descriptionParts.push(`Provider: ${metadata.provider}`);
  if (metadata?.region) descriptionParts.push(`Region: ${metadata.region}`);
  if (metadata?.timePeriodStart && metadata?.timePeriodEnd) {
    descriptionParts.push(`Time Period: ${metadata.timePeriodStart} to ${metadata.timePeriodEnd}`);
  }
  if (metadata?.eventCount) descriptionParts.push(`Event Count: ${metadata.eventCount}`);
  if (metadata?.license) descriptionParts.push(`License: ${metadata.license}`);
  if (metadata?.citation) descriptionParts.push(`Citation: ${metadata.citation}`);
  if (metadata?.doi) descriptionParts.push(`DOI: ${metadata.doi}`);
  if (metadata?.version) descriptionParts.push(`Version: ${metadata.version}`);
  if (metadata?.contactName || metadata?.contactEmail || metadata?.contactOrganization) {
    const contactParts = [];
    if (metadata?.contactName) contactParts.push(metadata.contactName);
    if (metadata?.contactOrganization) contactParts.push(metadata.contactOrganization);
    if (metadata?.contactEmail) contactParts.push(metadata.contactEmail);
    descriptionParts.push(`Contact: ${contactParts.join(', ')}`);
  }
  if (metadata?.keywords && metadata.keywords.length > 0) {
    descriptionParts.push(`Keywords: ${metadata.keywords.join(', ')}`);
  }
  if (metadata?.usageTerms) descriptionParts.push(`Usage Terms: ${metadata.usageTerms}`);
  if (metadata?.qualityNotes) descriptionParts.push(`Quality Notes: ${metadata.qualityNotes}`);
  if (metadata?.dataQuality) {
    const qualityParts = [];
    if (metadata.dataQuality.completeness) qualityParts.push(`Completeness: ${metadata.dataQuality.completeness}`);
    if (metadata.dataQuality.accuracy) qualityParts.push(`Accuracy: ${metadata.dataQuality.accuracy}`);
    if (metadata.dataQuality.reliability) qualityParts.push(`Reliability: ${metadata.dataQuality.reliability}`);
    if (qualityParts.length > 0) descriptionParts.push(`Data Quality: ${qualityParts.join('; ')}`);
  }
  if (metadata?.referenceLinks && metadata.referenceLinks.length > 0) {
    descriptionParts.push(`References: ${metadata.referenceLinks.join(', ')}`);
  }
  if (metadata?.notes) descriptionParts.push(`Notes: ${metadata.notes}`);
  descriptionParts.push(`Generated: ${metadata?.generatedAt || new Date().toISOString()}`);

  if (metadata?.boundingBox) {
    const bb = metadata.boundingBox;
    const parts: string[] = [];
    if (bb.minLatitude != null) parts.push(`S: ${bb.minLatitude}`);
    if (bb.maxLatitude != null) parts.push(`N: ${bb.maxLatitude}`);
    if (bb.minLongitude != null) parts.push(`W: ${bb.minLongitude}`);
    if (bb.maxLongitude != null) parts.push(`E: ${bb.maxLongitude}`);
    if (parts.length > 0) descriptionParts.push(`Bounding Box: ${parts.join(', ')}`);
  }
  if (metadata?.mergeDescription) descriptionParts.push(`Merge Description: ${metadata.mergeDescription}`);
  if (metadata?.mergeMethodology) descriptionParts.push(`Merge Methodology: ${metadata.mergeMethodology}`);
  if (metadata?.createdBy) descriptionParts.push(`Created By: ${metadata.createdBy}`);

  if (descriptionParts.length > 0) {
    kml += `    <description><![CDATA[${descriptionParts.join('\n')}]]></description>\n`;
  }

  // Define styles for different magnitude ranges.
  // max: Infinity for the last range so all M7+ events are captured.
  const magnitudeRanges = [
    { min: 0, max: 3, name: 'mag_0_3', color: 'ff00ff00', label: 'M < 3' },
    { min: 3, max: 4, name: 'mag_3_4', color: 'ff00ffff', label: 'M 3-4' },
    { min: 4, max: 5, name: 'mag_4_5', color: 'ff0099ff', label: 'M 4-5' },
    { min: 5, max: 6, name: 'mag_5_6', color: 'ff0066ff', label: 'M 5-6' },
    { min: 6, max: 7, name: 'mag_6_7', color: 'ff0000ff', label: 'M 6-7' },
    { min: 7, max: Infinity, name: 'mag_7_plus', color: 'ff0000cc', label: 'M ≥ 7' },
  ];

  magnitudeRanges.forEach(range => {
    // Use midpoint of the range (capped at 9 for the open-ended M7+ range) to
    // determine a representative icon scale so larger-magnitude folders have bigger icons.
    const representativeMag = isFinite(range.max) ? (range.min + range.max) / 2 : range.min + 1;
    const scale = getMagnitudeScale(representativeMag).toFixed(1);

    kml += `    <Style id="${range.name}">\n`;
    kml += '      <IconStyle>\n';
    kml += `        <color>${range.color}</color>\n`;
    kml += `        <scale>${scale}</scale>\n`;
    kml += '        <Icon>\n';
    kml += '          <href>https://maps.google.com/mapfiles/kml/shapes/earthquake.png</href>\n';
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
        if (event.magnitude_uncertainty != null) {
          kml += `            <tr><td><b>Magnitude Uncertainty:</b></td><td>±${event.magnitude_uncertainty}</td></tr>\n`;
        }
        if (event.magnitude_station_count != null) {
          kml += `            <tr><td><b>Magnitude Stations:</b></td><td>${event.magnitude_station_count}</td></tr>\n`;
        }
        kml += `            <tr><td><b>Depth:</b></td><td>${event.depth != null ? event.depth.toFixed(1) + ' km' : 'Unknown'}</td></tr>\n`;
        if (event.depth_type) {
          kml += `            <tr><td><b>Depth Type:</b></td><td>${escapeXml(event.depth_type)}</td></tr>\n`;
        }
        kml += `            <tr><td><b>Location:</b></td><td>${event.latitude.toFixed(4)}°, ${event.longitude.toFixed(4)}°</td></tr>\n`;
        if (event.horizontal_uncertainty != null) {
          kml += `            <tr><td><b>Horizontal Uncertainty:</b></td><td>${event.horizontal_uncertainty} km</td></tr>\n`;
        }
        if (event.region || event.location_name) {
          kml += `            <tr><td><b>Region:</b></td><td>${escapeXml(event.region || event.location_name || '')}</td></tr>\n`;
        }
        if (event.event_type) {
          kml += `            <tr><td><b>Event Type:</b></td><td>${escapeXml(event.event_type)}</td></tr>\n`;
        }
        if (event.event_type_certainty) {
          kml += `            <tr><td><b>Type Certainty:</b></td><td>${escapeXml(event.event_type_certainty)}</td></tr>\n`;
        }
        if (event.event_public_id) {
          kml += `            <tr><td><b>Public ID:</b></td><td>${escapeXml(event.event_public_id)}</td></tr>\n`;
        }
        if (event.agency_id) {
          kml += `            <tr><td><b>Agency:</b></td><td>${escapeXml(event.agency_id)}</td></tr>\n`;
        }
        if (event.author) {
          kml += `            <tr><td><b>Author:</b></td><td>${escapeXml(event.author)}</td></tr>\n`;
        }
        if (event.earth_model_id) {
          kml += `            <tr><td><b>Earth Model:</b></td><td>${escapeXml(event.earth_model_id)}</td></tr>\n`;
        }
        if (event.method_id) {
          kml += `            <tr><td><b>Location Method:</b></td><td>${escapeXml(event.method_id)}</td></tr>\n`;
        }
        if (event.azimuthal_gap != null) {
          kml += `            <tr><td><b>Azimuthal Gap:</b></td><td>${event.azimuthal_gap.toFixed(0)}°</td></tr>\n`;
        }
        if (event.used_station_count != null) {
          kml += `            <tr><td><b>Stations Used:</b></td><td>${event.used_station_count}</td></tr>\n`;
        }
        if (event.used_phase_count != null) {
          kml += `            <tr><td><b>Phases Used:</b></td><td>${event.used_phase_count}</td></tr>\n`;
        }
        if (event.standard_error != null) {
          kml += `            <tr><td><b>RMS Error:</b></td><td>${event.standard_error.toFixed(3)} s</td></tr>\n`;
        }
        if (event.minimum_distance != null) {
          kml += `            <tr><td><b>Min Distance:</b></td><td>${event.minimum_distance}°</td></tr>\n`;
        }
        if (event.maximum_distance != null) {
          kml += `            <tr><td><b>Max Distance:</b></td><td>${event.maximum_distance}°</td></tr>\n`;
        }
        if (event.associated_phase_count != null) {
          kml += `            <tr><td><b>Associated Phases:</b></td><td>${event.associated_phase_count}</td></tr>\n`;
        }
        if (event.associated_station_count != null) {
          kml += `            <tr><td><b>Associated Stations:</b></td><td>${event.associated_station_count}</td></tr>\n`;
        }
        if (event.depth_phase_count != null) {
          kml += `            <tr><td><b>Depth Phases:</b></td><td>${event.depth_phase_count}</td></tr>\n`;
        }
        if (event.evaluation_mode) {
          kml += `            <tr><td><b>Eval Mode:</b></td><td>${escapeXml(event.evaluation_mode)}</td></tr>\n`;
        }
        if (event.evaluation_status) {
          kml += `            <tr><td><b>Eval Status:</b></td><td>${escapeXml(event.evaluation_status)}</td></tr>\n`;
        }
        // Note: complex nested fields (origins, magnitudes, picks, arrivals, focal_mechanisms,
        // amplitudes, station_magnitudes, etc.) cannot be meaningfully represented in KML
        // balloon HTML tables. Use JSON or QuakeML export for full fidelity.

        kml += `          </table>\n`;
        kml += `        ]]></description>\n`;
        kml += `        <styleUrl>#${range.name}</styleUrl>\n`;
        kml += `        <TimeStamp><when>${formattedDate}</when></TimeStamp>\n`;
        kml += '        <Point>\n';
        // altitudeMode=absolute: altitude is meters above MSL; earthquakes are below
        // surface so depth (km) becomes negative meters altitude.
        // Without this mode Google Earth clamps all points to the ground and ignores altitude.
        kml += '          <altitudeMode>absolute</altitudeMode>\n';
        const altitude = event.depth != null ? -event.depth * 1000 : 0;
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
 * Safely parse a JSON string stored in a database field.
 * Returns the parsed value, or undefined if the input is falsy or invalid JSON.
 */
function safeParseJsonField(value: string | null | undefined): unknown | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch { return undefined; }
}

/**
 * Convert events to enhanced JSON format.
 * Includes all scalar event fields and all parsed nested JSON blob fields
 * (origins, magnitudes, picks, arrivals, focal_mechanisms, amplitudes,
 * station_magnitudes, event_descriptions, comments, creation_info, source_events).
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
      boundingBox: metadata?.boundingBox,
      license: metadata?.license,
      citation: metadata?.citation,
      generated: metadata?.generatedAt || new Date().toISOString(),
      eventCount: events.length,
      // Contact information
      contact: (metadata?.contactName || metadata?.contactEmail || metadata?.contactOrganization) ? {
        name: metadata?.contactName,
        email: metadata?.contactEmail,
        organization: metadata?.contactOrganization,
      } : undefined,
      // Data quality
      dataQuality: metadata?.dataQuality,
      qualityNotes: metadata?.qualityNotes,
      // Additional metadata
      doi: metadata?.doi,
      version: metadata?.version,
      keywords: metadata?.keywords,
      referenceLinks: metadata?.referenceLinks,
      usageTerms: metadata?.usageTerms,
      notes: metadata?.notes,
      // Merge-specific metadata (present when catalogue was created by merging source catalogues)
      merge: (metadata?.mergeDescription || metadata?.mergeUseCase ||
              metadata?.mergeMethodology || metadata?.mergeQualityAssessment) ? {
        description: metadata?.mergeDescription,
        useCase: metadata?.mergeUseCase,
        methodology: metadata?.mergeMethodology,
        qualityAssessment: metadata?.mergeQualityAssessment,
      } : undefined,
      // Provenance
      provenance: (metadata?.createdBy || metadata?.modifiedAt || metadata?.sourceCatalogues) ? {
        createdBy: metadata?.createdBy,
        modifiedAt: metadata?.modifiedAt,
        sourceCatalogues: metadata?.sourceCatalogues,
      } : undefined,
    },
    events: events.map(event => ({
      // Identifiers
      id: event.id,
      publicId: event.event_public_id,
      sourceId: event.source_id,
      catalogueId: event.catalogue_id,

      // Timing
      time: event.time,
      createdAt: event.created_at,

      // Location
      location: {
        latitude: event.latitude,
        longitude: event.longitude,
        depth: event.depth,             // km
        depthType: event.depth_type,
      },

      // Event classification
      eventType: event.event_type,
      eventTypeCertainty: event.event_type_certainty,

      // Region / location description
      region: event.region,
      locationName: event.location_name,

      // Magnitude
      magnitude: {
        value: event.magnitude,
        type: event.magnitude_type,
        uncertainty: event.magnitude_uncertainty,
        stationCount: event.magnitude_station_count,
        methodId: event.magnitude_method_id,
        evaluationMode: event.magnitude_evaluation_mode,
        evaluationStatus: event.magnitude_evaluation_status,
      },

      // All location uncertainties (individual + combined horizontal)
      uncertainties: {
        time: event.time_uncertainty,
        latitude: event.latitude_uncertainty,
        longitude: event.longitude_uncertainty,
        depth: event.depth_uncertainty,
        horizontal: event.horizontal_uncertainty,  // km
      },

      // Origin provenance
      origin: {
        earthModelId: event.earth_model_id,
        methodId: event.method_id,
        agencyId: event.agency_id,
        author: event.author,
      },

      // Origin quality metrics
      quality: {
        azimuthalGap: event.azimuthal_gap,
        usedPhaseCount: event.used_phase_count,
        usedStationCount: event.used_station_count,
        standardError: event.standard_error,
        minimumDistance: event.minimum_distance,     // degrees
        maximumDistance: event.maximum_distance,     // degrees
        associatedPhaseCount: event.associated_phase_count,
        associatedStationCount: event.associated_station_count,
        depthPhaseCount: event.depth_phase_count,
      },

      // Evaluation
      evaluation: {
        mode: event.evaluation_mode,
        status: event.evaluation_status,
      },

      // Preferred IDs (for QuakeML cross-referencing within this event)
      preferredOriginId: event.preferred_origin_id,
      preferredMagnitudeId: event.preferred_magnitude_id,

      // Complex nested data — parsed from JSON strings stored in the database.
      // These are omitted (undefined) when absent, so JSON.stringify drops them.
      sourceEvents: safeParseJsonField(event.source_events),
      origins: safeParseJsonField(event.origins),
      magnitudes: safeParseJsonField(event.magnitudes),
      picks: safeParseJsonField(event.picks),
      arrivals: safeParseJsonField(event.arrivals),
      focalMechanisms: safeParseJsonField(event.focal_mechanisms),
      amplitudes: safeParseJsonField(event.amplitudes),
      stationMagnitudes: safeParseJsonField(event.station_magnitudes),
      eventDescriptions: safeParseJsonField(event.event_descriptions),
      comments: safeParseJsonField(event.comments),
      creationInfo: safeParseJsonField(event.creation_info),
      originQuality: safeParseJsonField(event.origin_quality),
    })),
  };

  return JSON.stringify(jsonData, null, 2);
}

