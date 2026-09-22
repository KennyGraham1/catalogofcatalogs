/**
 * Export utilities for earthquake catalogues
 * Supports GeoJSON, KML, CSV, JSON, and QuakeML formats
 */

import type { MergedEvent } from './db';
import { csvField, csvRow } from './export-utils';

/**
 * Target size, in characters, of one streamed chunk.
 *
 * Exports are produced as a chunk stream rather than a single string: V8 caps a JS string at
 * 536,870,888 characters (`require('buffer').constants.MAX_STRING_LENGTH` on Node 20) and a
 * national-scale catalogue exceeds that — measured at roughly 1.8 kB/event for GeoJSON, a
 * FeatureCollection passes the cap near 290,000 events and throws
 * `RangeError: Invalid string length`, which the export route could only report as an opaque 500.
 */
const STREAM_CHUNK_CHARS = 64 * 1024;

/**
 * Coalesce many small parts into ~STREAM_CHUNK_CHARS chunks so a streaming consumer gets
 * useful-sized writes without the whole document ever existing as one string.
 *
 * Generators are driven with an explicit next() loop rather than for-of/yield* throughout this
 * module: tsconfig targets ES5 with downlevelIteration off, under which for-of is only allowed
 * over arrays.
 */
function* coalesce(parts: Generator<string>): Generator<string> {
  let buffer = '';
  for (let step = parts.next(); !step.done; step = parts.next()) {
    buffer += step.value;
    if (buffer.length >= STREAM_CHUNK_CHARS) {
      yield buffer;
      buffer = '';
    }
  }
  if (buffer.length > 0) yield buffer;
}

/**
 * Concatenate a chunk stream into one string, for callers that need the whole document in
 * memory (the browser-side merge export, tests). Server routes should stream the chunks.
 */
function joinChunks(chunks: Generator<string>): string {
  let out = '';
  for (let step = chunks.next(); !step.done; step = chunks.next()) out += step.value;
  return out;
}

/**
 * Splice an array member onto a pretty-printed JSON object so the streamed bytes are
 * identical to `JSON.stringify(wholeDocument, null, 2)`.
 *
 * `head` is the document with the array member omitted; it always ends in "\n}" because it
 * always has at least one key. Each element is re-indented from its own two-space stringify
 * to the four spaces it occupies inside the parent array.
 */
function* jsonArrayMember(
  head: Record<string, unknown>,
  key: string,
  elements: Generator<unknown>
): Generator<string> {
  const headJson = JSON.stringify(head, null, 2);
  yield `${headJson.slice(0, headJson.length - 2)},\n  ${JSON.stringify(key)}: [`;

  let empty = true;
  for (let step = elements.next(); !step.done; step = elements.next()) {
    const elementJson = JSON.stringify(step.value, null, 2).split('\n').join('\n    ');
    yield `${empty ? '\n    ' : ',\n    '}${elementJson}`;
    empty = false;
  }

  yield empty ? ']\n}' : '\n  ]\n}';
}

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
  // Catalogue-level merge strategy and threshold parameters (MergedCatalogue.merge_config).
  // NOTE: this is catalogue-level only. MergedEvent carries no per-event merge strategy or
  // quality score, so neither can be exported — see the handoff note in lib/merge.ts.
  mergeConfig?: unknown;
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
  return joinChunks(eventsToGeoJSONChunks(events, metadata));
}

/**
 * Streaming form of eventsToGeoJSON(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToGeoJSONChunks(
  events: MergedEvent[],
  metadata?: ExportMetadata
): Generator<string> {
  return coalesce(
    jsonArrayMember(
      buildGeoJSONHead(events.length, metadata),
      'features',
      iterate(events, buildGeoJSONFeature)
    )
  );
}

/** Lazily map an array, so the mapped results are never all live at once. */
function* iterate<T, R>(items: T[], map: (item: T) => R): Generator<R> {
  for (const item of items) yield map(item);
}

/** The FeatureCollection document with the `features` member omitted (spliced in on stream). */
function buildGeoJSONHead(
  count: number,
  metadata?: ExportMetadata
): Record<string, unknown> {
  // No bbox. RFC 7946 §5 requires 2n values for n-dimensional geometry, and every event
  // with a known depth is emitted as a 3D point, so a 4-value bbox was non-conformant for
  // almost every catalogue. The 6-value form would need a vertical extent the head does
  // not have before streaming, and inventing one for unknown-depth events is worse than
  // omitting the optional member. The horizontal extent stays available under metadata.
  return {
    type: 'FeatureCollection',
    metadata: {
      title: metadata?.catalogueName || 'Earthquake Catalogue',
      description: metadata?.description,
      generated: metadata?.generatedAt || new Date().toISOString(),
      count,
      source: metadata?.source,
      provider: metadata?.provider,
      region: metadata?.region,
      timePeriod: metadata?.timePeriodStart || metadata?.timePeriodEnd ? {
        start: metadata?.timePeriodStart,
        end: metadata?.timePeriodEnd,
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
              metadata?.mergeMethodology || metadata?.mergeQualityAssessment ||
              metadata?.mergeConfig) ? {
        description: metadata?.mergeDescription,
        useCase: metadata?.mergeUseCase,
        methodology: metadata?.mergeMethodology,
        qualityAssessment: metadata?.mergeQualityAssessment,
        // Merge strategy and threshold parameters, catalogue-level (MergedCatalogue.merge_config).
        config: metadata?.mergeConfig,
      } : undefined,
      // Provenance
      provenance: (metadata?.createdBy || metadata?.modifiedAt || metadata?.sourceCatalogues) ? {
        createdBy: metadata?.createdBy,
        modifiedAt: metadata?.modifiedAt,
        sourceCatalogues: metadata?.sourceCatalogues,
      } : undefined,
    },
  };
}

/** One GeoJSON Feature for a single event. */
function buildGeoJSONFeature(event: MergedEvent): Record<string, unknown> {
  return {
    type: 'Feature',
    id: event.id,
    geometry: {
      type: 'Point',
      // GeoJSON coordinates are [longitude, latitude, elevation_m].
      // For earthquakes, depth (km below surface) becomes negative elevation in metres.
      // When depth is unknown (null) we emit a 2D point [lon, lat] rather than
      // implying a surface location with elevation=0 (RFC 7946 §3.1.1).
      coordinates: event.depth != null
        ? [event.longitude, event.latitude, -event.depth * 1000]
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
      locationUncertainty: event.horizontal_uncertainty,       // deprecated alias, km

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
      preferredFocalMechanismId: event.preferred_focal_mechanism_id,
      minHorizontalUncertainty: event.min_horizontal_uncertainty,
      maxHorizontalUncertainty: event.max_horizontal_uncertainty,
      azimuthMaxHorizontalUncertainty: event.azimuth_max_horizontal_uncertainty,

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
  };
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
  return joinChunks(eventsToKMLChunks(events, metadata));
}

/**
 * Streaming form of eventsToKML(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToKMLChunks(
  events: MergedEvent[],
  metadata?: ExportMetadata
): Generator<string> {
  return coalesce(kmlParts(events, metadata));
}

function* kmlParts(
  events: MergedEvent[],
  metadata?: ExportMetadata
): Generator<string> {
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

  yield '<?xml version="1.0" encoding="UTF-8"?>\n';
  yield '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
  yield '  <Document>\n';
  yield `    <name>${escapeXml(metadata?.catalogueName || 'Earthquake Catalogue')}</name>\n`;

  // Build comprehensive description with all metadata
  const descriptionParts: string[] = [];
  if (metadata?.description) descriptionParts.push(metadata.description);
  if (metadata?.source) descriptionParts.push(`Source: ${metadata.source}`);
  if (metadata?.provider) descriptionParts.push(`Provider: ${metadata.provider}`);
  if (metadata?.region) descriptionParts.push(`Region: ${metadata.region}`);
  if (metadata?.timePeriodStart || metadata?.timePeriodEnd) {
    descriptionParts.push(`Time Period: ${metadata.timePeriodStart ?? '?'} to ${metadata.timePeriodEnd ?? '?'}`);
  }
  if (metadata?.eventCount != null) descriptionParts.push(`Event Count: ${metadata.eventCount}`);
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
  if (metadata?.mergeUseCase) descriptionParts.push(`Merge Use Case: ${metadata.mergeUseCase}`);
  if (metadata?.mergeMethodology) descriptionParts.push(`Merge Methodology: ${metadata.mergeMethodology}`);
  if (metadata?.mergeQualityAssessment) descriptionParts.push(`Merge Quality Assessment: ${metadata.mergeQualityAssessment}`);
  if (metadata?.mergeConfig) descriptionParts.push(`Merge Config: ${JSON.stringify(metadata.mergeConfig)}`);
  if (metadata?.createdBy) descriptionParts.push(`Created By: ${metadata.createdBy}`);
  if (metadata?.modifiedAt) descriptionParts.push(`Modified At: ${metadata.modifiedAt}`);
  if (metadata?.sourceCatalogues) {
    descriptionParts.push(`Source Catalogues: ${JSON.stringify(metadata.sourceCatalogues)}`);
  }

  const cdata = (value: string): string => `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

  if (descriptionParts.length > 0) {
    yield `    <description>${cdata(descriptionParts.join('\n'))}</description>\n`;
  }

  // Define styles for different magnitude ranges.
  // The bands must cover the whole magnitude domain or events fall through and are silently
  // omitted from the file: min is -Infinity on the first band because lib/validation.ts admits
  // magnitudes down to -3 and negative local magnitudes are routine in NZ microseismic and
  // induced-seismicity catalogues; max is Infinity on the last so all M7+ events are captured.
  const magnitudeRanges = [
    { min: -Infinity, max: 3, name: 'mag_0_3', color: 'ff00ff00', label: 'M < 3' },
    { min: 3, max: 4, name: 'mag_3_4', color: 'ff00ffff', label: 'M 3-4' },
    { min: 4, max: 5, name: 'mag_4_5', color: 'ff0099ff', label: 'M 4-5' },
    { min: 5, max: 6, name: 'mag_5_6', color: 'ff0066ff', label: 'M 5-6' },
    { min: 6, max: 7, name: 'mag_6_7', color: 'ff0000ff', label: 'M 6-7' },
    { min: 7, max: Infinity, name: 'mag_7_plus', color: 'ff0000cc', label: 'M ≥ 7' },
  ];

  for (const range of magnitudeRanges) {
    // Use the midpoint of the range to pick a representative icon scale so larger-magnitude
    // folders have bigger icons. The two open-ended bands have no midpoint, so step one unit
    // inside their finite edge (M<3 -> 1.5, M>=7 -> 8), which is what the closed-band midpoint
    // formula produced for them before the bands were opened.
    const representativeMag = isFinite(range.min) && isFinite(range.max)
      ? (range.min + range.max) / 2
      : isFinite(range.max) ? range.max / 2 : range.min + 1;
    const scale = getMagnitudeScale(representativeMag).toFixed(1);

    yield `    <Style id="${range.name}">\n`;
    yield '      <IconStyle>\n';
    yield `        <color>${range.color}</color>\n`;
    yield `        <scale>${scale}</scale>\n`;
    yield '        <Icon>\n';
    yield '          <href>https://maps.google.com/mapfiles/kml/shapes/earthquake.png</href>\n';
    yield '        </Icon>\n';
    yield '      </IconStyle>\n';
    yield '      <LabelStyle>\n';
    yield '        <scale>0.7</scale>\n';
    yield '      </LabelStyle>\n';
    yield `      <BalloonStyle>\n`;
    yield `        <text><![CDATA[\n`;
    yield `          <h3>$[name]</h3>\n`;
    yield `          <p>$[description]</p>\n`;
    yield `        ]]></text>\n`;
    yield `      </BalloonStyle>\n`;
    yield '    </Style>\n';
  }

  // Create folders for each magnitude range
  for (const range of magnitudeRanges) {
    const rangeEvents = events.filter(e => e.magnitude >= range.min && e.magnitude < range.max);

    if (rangeEvents.length > 0) {
      yield `    <Folder>\n`;
      // escapeXml: the lowest band's label contains a literal '<', which would otherwise
      // make the whole document malformed XML and unopenable in Google Earth.
      yield `      <name>${escapeXml(range.label)} (${rangeEvents.length} events)</name>\n`;
      yield `      <open>1</open>\n`;

      for (const event of rangeEvents) {
        const eventDate = new Date(event.time);
        const formattedDate = eventDate.toISOString();

        yield '      <Placemark>\n';
        yield `        <name>M ${event.magnitude.toFixed(1)}</name>\n`;
        yield `        <description><![CDATA[\n`;
        yield `          <table>\n`;
        yield `            <tr><td><b>Time:</b></td><td>${escapeXml(formattedDate)}</td></tr>\n`;
        yield `            <tr><td><b>Magnitude:</b></td><td>${event.magnitude.toFixed(2)} ${escapeXml(event.magnitude_type || '')}</td></tr>\n`;
        if (event.magnitude_uncertainty != null) {
          yield `            <tr><td><b>Magnitude Uncertainty:</b></td><td>±${event.magnitude_uncertainty}</td></tr>\n`;
        }
        if (event.magnitude_station_count != null) {
          yield `            <tr><td><b>Magnitude Stations:</b></td><td>${event.magnitude_station_count}</td></tr>\n`;
        }
        yield `            <tr><td><b>Depth:</b></td><td>${event.depth != null ? event.depth.toFixed(1) + ' km' : 'Unknown'}</td></tr>\n`;
        if (event.depth_type) {
          yield `            <tr><td><b>Depth Type:</b></td><td>${escapeXml(event.depth_type)}</td></tr>\n`;
        }
        yield `            <tr><td><b>Location:</b></td><td>${event.latitude.toFixed(4)}°, ${event.longitude.toFixed(4)}°</td></tr>\n`;
        if (event.horizontal_uncertainty != null) {
          yield `            <tr><td><b>Horizontal Uncertainty:</b></td><td>${event.horizontal_uncertainty} km</td></tr>\n`;
        }
        if (event.region || event.location_name) {
          yield `            <tr><td><b>Region:</b></td><td>${escapeXml(event.region || event.location_name || '')}</td></tr>\n`;
        }
        if (event.event_type) {
          yield `            <tr><td><b>Event Type:</b></td><td>${escapeXml(event.event_type)}</td></tr>\n`;
        }
        if (event.event_type_certainty) {
          yield `            <tr><td><b>Type Certainty:</b></td><td>${escapeXml(event.event_type_certainty)}</td></tr>\n`;
        }
        if (event.event_public_id) {
          yield `            <tr><td><b>Public ID:</b></td><td>${escapeXml(event.event_public_id)}</td></tr>\n`;
        }
        if (event.agency_id) {
          yield `            <tr><td><b>Agency:</b></td><td>${escapeXml(event.agency_id)}</td></tr>\n`;
        }
        if (event.author) {
          yield `            <tr><td><b>Author:</b></td><td>${escapeXml(event.author)}</td></tr>\n`;
        }
        if (event.earth_model_id) {
          yield `            <tr><td><b>Earth Model:</b></td><td>${escapeXml(event.earth_model_id)}</td></tr>\n`;
        }
        if (event.method_id) {
          yield `            <tr><td><b>Location Method:</b></td><td>${escapeXml(event.method_id)}</td></tr>\n`;
        }
        if (event.azimuthal_gap != null) {
          yield `            <tr><td><b>Azimuthal Gap:</b></td><td>${event.azimuthal_gap.toFixed(0)}°</td></tr>\n`;
        }
        if (event.used_station_count != null) {
          yield `            <tr><td><b>Stations Used:</b></td><td>${event.used_station_count}</td></tr>\n`;
        }
        if (event.used_phase_count != null) {
          yield `            <tr><td><b>Phases Used:</b></td><td>${event.used_phase_count}</td></tr>\n`;
        }
        if (event.standard_error != null) {
          yield `            <tr><td><b>RMS Error:</b></td><td>${event.standard_error.toFixed(3)} s</td></tr>\n`;
        }
        if (event.minimum_distance != null) {
          yield `            <tr><td><b>Min Distance:</b></td><td>${event.minimum_distance}°</td></tr>\n`;
        }
        if (event.maximum_distance != null) {
          yield `            <tr><td><b>Max Distance:</b></td><td>${event.maximum_distance}°</td></tr>\n`;
        }
        if (event.associated_phase_count != null) {
          yield `            <tr><td><b>Associated Phases:</b></td><td>${event.associated_phase_count}</td></tr>\n`;
        }
        if (event.associated_station_count != null) {
          yield `            <tr><td><b>Associated Stations:</b></td><td>${event.associated_station_count}</td></tr>\n`;
        }
        if (event.depth_phase_count != null) {
          yield `            <tr><td><b>Depth Phases:</b></td><td>${event.depth_phase_count}</td></tr>\n`;
        }
        if (event.evaluation_mode) {
          yield `            <tr><td><b>Eval Mode:</b></td><td>${escapeXml(event.evaluation_mode)}</td></tr>\n`;
        }
        if (event.evaluation_status) {
          yield `            <tr><td><b>Eval Status:</b></td><td>${escapeXml(event.evaluation_status)}</td></tr>\n`;
        }
        // Note: complex nested fields (origins, magnitudes, picks, arrivals, focal_mechanisms,
        // amplitudes, station_magnitudes, etc.) cannot be meaningfully represented in KML
        // balloon HTML tables. Use JSON or QuakeML export for full fidelity.

        yield `          </table>\n`;
        yield `        ]]></description>\n`;
        yield `        <styleUrl>#${range.name}</styleUrl>\n`;
        yield `        <TimeStamp><when>${formattedDate}</when></TimeStamp>\n`;
        yield '        <Point>\n';
        // altitudeMode=absolute: altitude is meters above MSL; earthquakes are below
        // surface so depth (km) becomes negative meters altitude.
        // Without this mode Google Earth clamps all points to the ground and ignores altitude.
        yield '          <altitudeMode>absolute</altitudeMode>\n';
        const altitude = event.depth != null ? -event.depth * 1000 : 0;
        yield `          <coordinates>${event.longitude},${event.latitude},${altitude}</coordinates>\n`;
        yield '        </Point>\n';
        yield '      </Placemark>\n';
      }

      yield '    </Folder>\n';
    }
  }

  yield '  </Document>\n';
  yield '</kml>\n';
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
  return joinChunks(eventsToJSONChunks(events, metadata));
}

/**
 * Streaming form of eventsToJSON(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToJSONChunks(
  events: MergedEvent[],
  metadata?: ExportMetadata
): Generator<string> {
  return coalesce(
    jsonArrayMember(
      { metadata: buildJSONMetadata(events.length, metadata) },
      'events',
      iterate(events, buildJSONEvent)
    )
  );
}

/** The export document's metadata member. */
function buildJSONMetadata(
  count: number,
  metadata?: ExportMetadata
): Record<string, unknown> {
  return {
    catalogueName: metadata?.catalogueName,
    description: metadata?.description,
    source: metadata?.source,
    provider: metadata?.provider,
    region: metadata?.region,
    timePeriod: metadata?.timePeriodStart || metadata?.timePeriodEnd ? {
      start: metadata?.timePeriodStart,
      end: metadata?.timePeriodEnd
    } : undefined,
    boundingBox: metadata?.boundingBox,
    license: metadata?.license,
    citation: metadata?.citation,
    generated: metadata?.generatedAt || new Date().toISOString(),
    eventCount: count,
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
            metadata?.mergeMethodology || metadata?.mergeQualityAssessment ||
            metadata?.mergeConfig) ? {
      description: metadata?.mergeDescription,
      useCase: metadata?.mergeUseCase,
      methodology: metadata?.mergeMethodology,
      qualityAssessment: metadata?.mergeQualityAssessment,
      // Merge strategy and threshold parameters, catalogue-level (MergedCatalogue.merge_config).
      config: metadata?.mergeConfig,
    } : undefined,
    // Provenance
    provenance: (metadata?.createdBy || metadata?.modifiedAt || metadata?.sourceCatalogues) ? {
      createdBy: metadata?.createdBy,
      modifiedAt: metadata?.modifiedAt,
      sourceCatalogues: metadata?.sourceCatalogues,
    } : undefined,
  };
}

/** One JSON export record for a single event. */
function buildJSONEvent(event: MergedEvent): Record<string, unknown> {
  return {
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
  };
}

/**
 * Column headers of the CSV export, in emitted order.
 * Exported so importers and tests can assert the contract without re-typing it.
 */
export const CSV_EVENT_HEADERS: readonly string[] = [
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

export interface CSVExportOptions {
  /**
   * Prepend the catalogue metadata as `#`-prefixed comment lines.
   */
  metadataComments?: boolean;

  /**
   * Neutralise text a spreadsheet would execute as a formula, by prefixing an apostrophe
   * (default true — see csvField()).
   */
  neutralizeFormulas?: boolean;
}

/**
 * Convert events to CSV.
 */
export function eventsToCSV(
  events: MergedEvent[],
  metadata?: ExportMetadata,
  options?: CSVExportOptions
): string {
  return joinChunks(eventsToCSVChunks(events, metadata, options));
}

/**
 * Streaming form of eventsToCSV(): yields the same bytes in chunks so a whole-catalogue
 * export never has to exist as a single JS string.
 */
export function eventsToCSVChunks(
  events: MergedEvent[],
  metadata?: ExportMetadata,
  options?: CSVExportOptions
): Generator<string> {
  return coalesce(csvParts(events, metadata, options));
}

function* csvParts(
  events: MergedEvent[],
  metadata?: ExportMetadata,
  options?: CSVExportOptions
): Generator<string> {
  if (options?.metadataComments) {
    for (const line of csvMetadataComments(events.length, metadata)) {
      yield `${line}\n`;
    }
  }

  yield CSV_EVENT_HEADERS.join(',');

  // Emit a nullable number/string as an empty field when null/undefined.
  const n = (v: number | string | null | undefined) => (v !== null && v !== undefined ? v : '');

  const fieldOptions = { neutralizeFormulas: options?.neutralizeFormulas !== false };

  for (const event of events) {
    const sourceEvents = safeParseJsonField(event.source_events) as Array<{ source?: string }> | undefined;
    const source = sourceEvents?.[0]?.source || 'unknown';

    yield '\n' + csvRow([
      event.id,
      event.catalogue_id,
      event.time,
      event.created_at,
      event.latitude,
      event.longitude,
      n(event.depth),
      event.magnitude,
      event.magnitude_type,
      event.event_type,
      event.event_type_certainty,
      // Region: prefer region, fall back to location_name
      event.region || event.location_name || '',
      event.location_name,
      source,
      event.source_events,
      event.source_id,
      event.event_public_id,
      // Location uncertainties
      n(event.time_uncertainty),
      n(event.latitude_uncertainty),
      n(event.longitude_uncertainty),
      n(event.depth_uncertainty),
      n(event.horizontal_uncertainty),
      n(event.magnitude_uncertainty),
      // Origin metadata
      event.depth_type,
      event.earth_model_id,
      event.method_id,
      event.agency_id,
      event.author,
      // Magnitude details
      n(event.magnitude_station_count),
      event.magnitude_method_id,
      event.magnitude_evaluation_mode,
      event.magnitude_evaluation_status,
      // Quality metrics
      n(event.azimuthal_gap),
      n(event.used_station_count),
      n(event.used_phase_count),
      n(event.standard_error),
      n(event.minimum_distance),
      n(event.maximum_distance),
      n(event.associated_phase_count),
      n(event.associated_station_count),
      n(event.depth_phase_count),
      // Evaluation metadata
      event.evaluation_mode,
      event.evaluation_status,
      event.preferred_origin_id,
      event.preferred_magnitude_id,
    ], fieldOptions);
  }
}

/**
 * Build the optional `#`-prefixed metadata prologue (see CSVExportOptions.metadataComments).
 * Each value is escaped and flattened to a single line so the prologue can never be mistaken
 * for data by a reader that does strip comments.
 */
function csvMetadataComments(eventCount: number, metadata?: ExportMetadata): string[] {
  const lines: string[] = [];
  const commentValue = (value: unknown): string => {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return csvField(str ?? '').replace(/\r?\n|\r/g, ' ');
  };
  const add = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    lines.push(`# ${label}: ${commentValue(value)}`);
  };

  add('Catalogue', metadata?.catalogueName);
  add('Description', metadata?.description);
  add('Source', metadata?.source);
  add('Provider', metadata?.provider);
  add('Region', metadata?.region);
  if (metadata?.timePeriodStart || metadata?.timePeriodEnd) {
    add('Time Period', `${metadata?.timePeriodStart ?? '?'} to ${metadata?.timePeriodEnd ?? '?'}`);
  }
  lines.push(`# Event Count: ${eventCount}`);
  lines.push(`# Generated: ${metadata?.generatedAt || new Date().toISOString()}`);

  add('License', metadata?.license);
  add('Citation', metadata?.citation);
  add('DOI', metadata?.doi);
  add('Version', metadata?.version);
  add('Contact Name', metadata?.contactName);
  add('Contact Email', metadata?.contactEmail);
  add('Contact Organization', metadata?.contactOrganization);
  if (metadata?.dataQuality) {
    add('Data Quality', metadata.dataQuality);
  }
  add('Quality Notes', metadata?.qualityNotes);
  add('Keywords', metadata?.keywords);
  add('References', metadata?.referenceLinks);
  add('Usage Terms', metadata?.usageTerms);
  add('Notes', metadata?.notes);
  // Geographic bounds
  if (metadata?.boundingBox) {
    const bb = metadata.boundingBox;
    lines.push(
      `# Bounding Box: lat [${bb.minLatitude ?? '?'}, ${bb.maxLatitude ?? '?'}], ` +
      `lon [${bb.minLongitude ?? '?'}, ${bb.maxLongitude ?? '?'}]`
    );
  }
  add('Merge Description', metadata?.mergeDescription);
  add('Merge Use Case', metadata?.mergeUseCase);
  add('Merge Methodology', metadata?.mergeMethodology);
  add('Merge Quality Assessment', metadata?.mergeQualityAssessment);
  add('Merge Config', metadata?.mergeConfig);
  add('Created By', metadata?.createdBy);
  add('Modified At', metadata?.modifiedAt);
  add('Source Catalogues', metadata?.sourceCatalogues);

  lines.push('#');
  return lines;
}
