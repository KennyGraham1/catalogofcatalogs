/**
 * Unit tests for lib/exporters.ts
 * Verifies that every scalar event field and every parsed JSON blob field
 * is present in the exported output for each format.
 */

import { eventsToJSON, eventsToGeoJSON, eventsToKML, ExportMetadata } from '@/lib/exporters';
import type { MergedEvent } from '@/lib/db';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** A fully-populated MergedEvent with every scalar and JSON-blob field set. */
const richEvent: MergedEvent = {
  id: 'evt-full',
  catalogue_id: 'cat-001',
  source_id: 'nz2024abc',
  time: '2024-03-15T08:22:31.500Z',
  latitude: -41.2865,
  longitude: 174.7762,
  depth: 12.5,
  magnitude: 5.2,
  source_events: JSON.stringify([{ source: 'GeoNet', id: 'original-123' }]),
  created_at: '2024-03-16T00:00:00Z',

  // Location
  region: 'Wellington, New Zealand',
  location_name: 'Wellington CBD',

  // QuakeML event metadata
  event_public_id: 'quakeml:nz.geonet.org.nz/2024abc',
  event_type: 'earthquake',
  event_type_certainty: 'known',

  // Origin uncertainties
  time_uncertainty: 0.15,
  latitude_uncertainty: 0.05,
  longitude_uncertainty: 0.06,
  depth_uncertainty: 2.0,
  horizontal_uncertainty: 3.5,

  // Origin metadata
  depth_type: 'from location',
  earth_model_id: 'nz3d',
  method_id: 'NonLinLoc',

  // Agency/Author
  agency_id: 'GNS',
  author: 'GeoNet',

  // Magnitude details
  magnitude_type: 'ML',
  magnitude_uncertainty: 0.1,
  magnitude_station_count: 14,
  magnitude_method_id: 'weighted_mean',
  magnitude_evaluation_mode: 'manual',
  magnitude_evaluation_status: 'reviewed',

  // Quality metrics
  azimuthal_gap: 165,
  used_phase_count: 32,
  used_station_count: 18,
  standard_error: 0.42,
  minimum_distance: 0.12,
  maximum_distance: 3.8,
  associated_phase_count: 40,
  associated_station_count: 22,
  depth_phase_count: 5,

  // Evaluation
  evaluation_mode: 'manual',
  evaluation_status: 'reviewed',

  // Preferred IDs
  preferred_origin_id: 'quakeml:nz.geonet.org.nz/origin/2024abc',
  preferred_magnitude_id: 'quakeml:nz.geonet.org.nz/magnitude/2024abc',

  // JSON blob fields
  origin_quality: JSON.stringify({ associatedPhaseCount: 40 }),
  origins: JSON.stringify([{ publicID: 'quakeml:nz.geonet.org.nz/origin/2024abc' }]),
  magnitudes: JSON.stringify([{ publicID: 'quakeml:nz.geonet.org.nz/magnitude/2024abc', mag: { value: 5.2 } }]),
  picks: JSON.stringify([{ publicID: 'quakeml:nz.geonet.org.nz/pick/1', time: { value: '2024-03-15T08:22:31Z' } }]),
  arrivals: JSON.stringify([{ pickID: 'quakeml:nz.geonet.org.nz/pick/1', phase: 'P' }]),
  focal_mechanisms: JSON.stringify([{ publicID: 'quakeml:nz.geonet.org.nz/fm/1' }]),
  amplitudes: JSON.stringify([{ publicID: 'quakeml:nz.geonet.org.nz/amp/1' }]),
  station_magnitudes: JSON.stringify([{ publicID: 'quakeml:nz.geonet.org.nz/stmag/1' }]),
  event_descriptions: JSON.stringify([{ text: 'Wellington region', type: 'region name' }]),
  comments: JSON.stringify([{ text: 'Auto-located' }]),
  creation_info: JSON.stringify({ agencyID: 'GNS', author: 'GeoNet', creationTime: '2024-03-15T09:00:00Z' }),
};

const richMetadata: ExportMetadata = {
  catalogueName: 'NZ Test Catalogue',
  description: 'Test catalogue for unit tests',
  source: 'GeoNet',
  provider: 'GNS Science',
  region: 'New Zealand',
  timePeriodStart: '2024-01-01T00:00:00Z',
  timePeriodEnd: '2024-12-31T23:59:59Z',
  boundingBox: { minLatitude: -47, maxLatitude: -34, minLongitude: 166, maxLongitude: 178 },
  license: 'CC BY 4.0',
  citation: 'GeoNet (2024)',
  doi: '10.21420/test',
  version: '1.0',
  keywords: ['earthquake', 'New Zealand'],
  referenceLinks: ['https://www.geonet.org.nz'],
  usageTerms: 'Free to use with attribution',
  notes: 'Test notes',
  contactName: 'Jane Doe',
  contactEmail: 'jane@example.com',
  contactOrganization: 'GNS Science',
  dataQuality: { completeness: 'high', accuracy: 'high', reliability: 'high' },
  qualityNotes: 'Validated',
  mergeDescription: 'Merged from two sources',
  mergeUseCase: 'Hazard model',
  mergeMethodology: 'Duplicate removal by spatiotemporal proximity',
  mergeQualityAssessment: 'Good',
  createdBy: 'admin',
  modifiedAt: '2024-04-01T12:00:00Z',
  sourceCatalogues: [{ name: 'GeoNet', eventCount: 1000 }],
};

// ---------------------------------------------------------------------------
// eventsToJSON
// ---------------------------------------------------------------------------

describe('eventsToJSON', () => {
  let parsed: ReturnType<typeof JSON.parse>;

  beforeEach(() => {
    parsed = JSON.parse(eventsToJSON([richEvent], richMetadata));
  });

  // --- Catalogue metadata ---
  it('includes all catalogue metadata fields', () => {
    const m = parsed.metadata;
    expect(m.catalogueName).toBe('NZ Test Catalogue');
    expect(m.description).toBe('Test catalogue for unit tests');
    expect(m.source).toBe('GeoNet');
    expect(m.provider).toBe('GNS Science');
    expect(m.region).toBe('New Zealand');
    expect(m.timePeriod).toEqual({ start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' });
    expect(m.boundingBox).toEqual({ minLatitude: -47, maxLatitude: -34, minLongitude: 166, maxLongitude: 178 });
    expect(m.license).toBe('CC BY 4.0');
    expect(m.doi).toBe('10.21420/test');
    expect(m.version).toBe('1.0');
    expect(m.keywords).toEqual(['earthquake', 'New Zealand']);
    expect(m.contact.name).toBe('Jane Doe');
    expect(m.contact.email).toBe('jane@example.com');
    expect(m.dataQuality.completeness).toBe('high');
    expect(m.merge.description).toBe('Merged from two sources');
    expect(m.merge.methodology).toBe('Duplicate removal by spatiotemporal proximity');
    expect(m.provenance.createdBy).toBe('admin');
    expect(m.provenance.modifiedAt).toBe('2024-04-01T12:00:00Z');
    expect(Array.isArray(m.provenance.sourceCatalogues)).toBe(true);
  });

  // --- Core scalar fields ---
  it('exports all core scalar event fields', () => {
    const e = parsed.events[0];
    expect(e.id).toBe('evt-full');
    expect(e.publicId).toBe('quakeml:nz.geonet.org.nz/2024abc');
    expect(e.sourceId).toBe('nz2024abc');
    expect(e.catalogueId).toBe('cat-001');
    expect(e.time).toBe('2024-03-15T08:22:31.500Z');
    expect(e.createdAt).toBe('2024-03-16T00:00:00Z');
  });

  it('exports location fields including depthType', () => {
    const loc = parsed.events[0].location;
    expect(loc.latitude).toBe(-41.2865);
    expect(loc.longitude).toBe(174.7762);
    expect(loc.depth).toBe(12.5);
    expect(loc.depthType).toBe('from location');
  });

  it('exports region and locationName', () => {
    const e = parsed.events[0];
    expect(e.region).toBe('Wellington, New Zealand');
    expect(e.locationName).toBe('Wellington CBD');
  });

  it('exports event type and certainty', () => {
    const e = parsed.events[0];
    expect(e.eventType).toBe('earthquake');
    expect(e.eventTypeCertainty).toBe('known');
  });

  it('exports all magnitude sub-fields', () => {
    const mag = parsed.events[0].magnitude;
    expect(mag.value).toBe(5.2);
    expect(mag.type).toBe('ML');
    expect(mag.uncertainty).toBe(0.1);
    expect(mag.stationCount).toBe(14);
    expect(mag.methodId).toBe('weighted_mean');
    expect(mag.evaluationMode).toBe('manual');
    expect(mag.evaluationStatus).toBe('reviewed');
  });

  it('exports all uncertainty sub-fields including horizontal', () => {
    const u = parsed.events[0].uncertainties;
    expect(u.time).toBe(0.15);
    expect(u.latitude).toBe(0.05);
    expect(u.longitude).toBe(0.06);
    expect(u.depth).toBe(2.0);
    expect(u.horizontal).toBe(3.5);
  });

  it('exports origin provenance fields', () => {
    const o = parsed.events[0].origin;
    expect(o.earthModelId).toBe('nz3d');
    expect(o.methodId).toBe('NonLinLoc');
    expect(o.agencyId).toBe('GNS');
    expect(o.author).toBe('GeoNet');
  });

  it('exports all quality metric sub-fields', () => {
    const q = parsed.events[0].quality;
    expect(q.azimuthalGap).toBe(165);
    expect(q.usedPhaseCount).toBe(32);
    expect(q.usedStationCount).toBe(18);
    expect(q.standardError).toBe(0.42);
    expect(q.minimumDistance).toBe(0.12);
    expect(q.maximumDistance).toBe(3.8);
    expect(q.associatedPhaseCount).toBe(40);
    expect(q.associatedStationCount).toBe(22);
    expect(q.depthPhaseCount).toBe(5);
  });

  it('exports evaluation mode and status', () => {
    const e = parsed.events[0];
    expect(e.evaluation.mode).toBe('manual');
    expect(e.evaluation.status).toBe('reviewed');
  });

  it('exports preferred origin and magnitude IDs', () => {
    const e = parsed.events[0];
    expect(e.preferredOriginId).toBe('quakeml:nz.geonet.org.nz/origin/2024abc');
    expect(e.preferredMagnitudeId).toBe('quakeml:nz.geonet.org.nz/magnitude/2024abc');
  });

  // --- JSON blob fields (parsed) ---
  it('includes parsed sourceEvents', () => {
    expect(Array.isArray(parsed.events[0].sourceEvents)).toBe(true);
    expect(parsed.events[0].sourceEvents[0].source).toBe('GeoNet');
  });

  it('includes parsed origins array', () => {
    expect(Array.isArray(parsed.events[0].origins)).toBe(true);
  });

  it('includes parsed magnitudes array', () => {
    expect(Array.isArray(parsed.events[0].magnitudes)).toBe(true);
  });

  it('includes parsed picks array', () => {
    expect(Array.isArray(parsed.events[0].picks)).toBe(true);
  });

  it('includes parsed arrivals array', () => {
    expect(Array.isArray(parsed.events[0].arrivals)).toBe(true);
  });

  it('includes parsed focalMechanisms array', () => {
    expect(Array.isArray(parsed.events[0].focalMechanisms)).toBe(true);
  });

  it('includes parsed amplitudes array', () => {
    expect(Array.isArray(parsed.events[0].amplitudes)).toBe(true);
  });

  it('includes parsed stationMagnitudes array', () => {
    expect(Array.isArray(parsed.events[0].stationMagnitudes)).toBe(true);
  });

  it('includes parsed eventDescriptions array', () => {
    expect(Array.isArray(parsed.events[0].eventDescriptions)).toBe(true);
    expect(parsed.events[0].eventDescriptions[0].text).toBe('Wellington region');
  });

  it('includes parsed comments array', () => {
    expect(Array.isArray(parsed.events[0].comments)).toBe(true);
    expect(parsed.events[0].comments[0].text).toBe('Auto-located');
  });

  it('includes parsed creationInfo', () => {
    const ci = parsed.events[0].creationInfo;
    expect(ci.agencyID).toBe('GNS');
    expect(ci.author).toBe('GeoNet');
  });

  it('includes parsed originQuality', () => {
    expect(parsed.events[0].originQuality).toBeDefined();
  });

  it('omits undefined blob fields rather than serialising null', () => {
    const minimalEvent: MergedEvent = {
      id: 'min', catalogue_id: 'c', time: '2024-01-01T00:00:00Z',
      latitude: 0, longitude: 0, depth: null, magnitude: 3.0,
      source_events: '[]', created_at: '2024-01-01T00:00:00Z',
    };
    const out = JSON.parse(eventsToJSON([minimalEvent]));
    // Absent blob fields should not appear as null — JSON.stringify drops undefined keys
    expect(out.events[0].origins).toBeUndefined();
    expect(out.events[0].picks).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// eventsToGeoJSON
// ---------------------------------------------------------------------------

describe('eventsToGeoJSON', () => {
  let parsed: ReturnType<typeof JSON.parse>;

  beforeEach(() => {
    parsed = JSON.parse(eventsToGeoJSON([richEvent], richMetadata));
  });

  it('is a GeoJSON FeatureCollection', () => {
    expect(parsed.type).toBe('FeatureCollection');
    expect(Array.isArray(parsed.features)).toBe(true);
    expect(parsed.features).toHaveLength(1);
  });

  it('has a Point geometry with [lon, lat, -depth] coordinates', () => {
    const geom = parsed.features[0].geometry;
    expect(geom.type).toBe('Point');
    expect(geom.coordinates[0]).toBe(174.7762);   // longitude
    expect(geom.coordinates[1]).toBe(-41.2865);   // latitude
    expect(geom.coordinates[2]).toBe(-12.5);      // -depth
  });

  it('includes all core scalar properties', () => {
    const p = parsed.features[0].properties;
    expect(p.time).toBe('2024-03-15T08:22:31.500Z');
    expect(p.magnitude).toBe(5.2);
    expect(p.magnitudeType).toBe('ML');
    expect(p.depth).toBe(12.5);
    expect(p.publicId).toBe('quakeml:nz.geonet.org.nz/2024abc');
    expect(p.sourceId).toBe('nz2024abc');
    expect(p.catalogueId).toBe('cat-001');
    expect(p.createdAt).toBe('2024-03-16T00:00:00Z');
  });

  it('includes region and locationName', () => {
    const p = parsed.features[0].properties;
    expect(p.region).toBe('Wellington, New Zealand');
    expect(p.locationName).toBe('Wellington CBD');
  });

  it('includes eventType and eventTypeCertainty', () => {
    const p = parsed.features[0].properties;
    expect(p.eventType).toBe('earthquake');
    expect(p.eventTypeCertainty).toBe('known');
  });

  it('includes all uncertainty properties individually', () => {
    const p = parsed.features[0].properties;
    expect(p.timeUncertainty).toBe(0.15);
    expect(p.latitudeUncertainty).toBe(0.05);
    expect(p.longitudeUncertainty).toBe(0.06);
    expect(p.depthUncertainty).toBe(2.0);
    expect(p.horizontalUncertainty).toBe(3.5);
    // Combined locationUncertainty still present for backward compatibility
    expect(typeof p.locationUncertainty).toBe('number');
  });

  it('includes origin provenance properties', () => {
    const p = parsed.features[0].properties;
    expect(p.earthModelId).toBe('nz3d');
    expect(p.methodId).toBe('NonLinLoc');
    expect(p.agencyId).toBe('GNS');
    expect(p.author).toBe('GeoNet');
    expect(p.depthType).toBe('from location');
  });

  it('includes all quality metric properties', () => {
    const p = parsed.features[0].properties;
    expect(p.azimuthalGap).toBe(165);
    expect(p.usedPhaseCount).toBe(32);
    expect(p.usedStationCount).toBe(18);
    expect(p.standardError).toBe(0.42);
    expect(p.minimumDistance).toBe(0.12);
    expect(p.maximumDistance).toBe(3.8);
    expect(p.associatedPhaseCount).toBe(40);
    expect(p.associatedStationCount).toBe(22);
    expect(p.depthPhaseCount).toBe(5);
  });

  it('includes magnitude detail properties', () => {
    const p = parsed.features[0].properties;
    expect(p.magnitudeUncertainty).toBe(0.1);
    expect(p.magnitudeStationCount).toBe(14);
    expect(p.magnitudeMethodId).toBe('weighted_mean');
    expect(p.magnitudeEvaluationMode).toBe('manual');
    expect(p.magnitudeEvaluationStatus).toBe('reviewed');
  });

  it('includes preferred IDs', () => {
    const p = parsed.features[0].properties;
    expect(p.preferredOriginId).toBe('quakeml:nz.geonet.org.nz/origin/2024abc');
    expect(p.preferredMagnitudeId).toBe('quakeml:nz.geonet.org.nz/magnitude/2024abc');
  });

  it('includes all parsed JSON blob properties', () => {
    const p = parsed.features[0].properties;
    expect(Array.isArray(p.sourceEvents)).toBe(true);
    expect(Array.isArray(p.origins)).toBe(true);
    expect(Array.isArray(p.magnitudes)).toBe(true);
    expect(Array.isArray(p.picks)).toBe(true);
    expect(Array.isArray(p.arrivals)).toBe(true);
    expect(Array.isArray(p.focalMechanisms)).toBe(true);
    expect(Array.isArray(p.amplitudes)).toBe(true);
    expect(Array.isArray(p.stationMagnitudes)).toBe(true);
    expect(Array.isArray(p.eventDescriptions)).toBe(true);
    expect(Array.isArray(p.comments)).toBe(true);
    expect(p.creationInfo).toBeDefined();
    expect(p.originQuality).toBeDefined();
  });

  it('includes boundingBox in metadata', () => {
    expect(parsed.metadata.boundingBox).toEqual({
      minLatitude: -47, maxLatitude: -34, minLongitude: 166, maxLongitude: 178,
    });
  });

  it('includes merge metadata when provided', () => {
    expect(parsed.metadata.merge.description).toBe('Merged from two sources');
  });

  it('includes provenance metadata when provided', () => {
    expect(parsed.metadata.provenance.createdBy).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// eventsToKML
// ---------------------------------------------------------------------------

describe('eventsToKML', () => {
  let kml: string;

  beforeEach(() => {
    kml = eventsToKML([richEvent], richMetadata);
  });

  it('is valid KML with correct root element', () => {
    expect(kml).toContain('<?xml');
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<Document>');
  });

  it('includes catalogue name', () => {
    expect(kml).toContain('NZ Test Catalogue');
  });

  it('includes magnitude in Placemark name', () => {
    expect(kml).toContain('M 5.2');
  });

  it('includes depth', () => {
    expect(kml).toContain('12.5 km');
  });

  it('includes depth type', () => {
    expect(kml).toContain('from location');
  });

  it('includes event type', () => {
    expect(kml).toContain('earthquake');
  });

  it('includes event type certainty', () => {
    expect(kml).toContain('known');
  });

  it('includes public ID', () => {
    expect(kml).toContain('quakeml:nz.geonet.org.nz/2024abc');
  });

  it('includes region', () => {
    // The region string contains a comma so we check for parts
    expect(kml).toContain('Wellington');
  });

  it('includes agency and author', () => {
    expect(kml).toContain('GNS');
    expect(kml).toContain('GeoNet');
  });

  it('includes earth model and method', () => {
    expect(kml).toContain('nz3d');
    expect(kml).toContain('NonLinLoc');
  });

  it('includes horizontal uncertainty', () => {
    expect(kml).toContain('3.5 km');
  });

  it('includes magnitude uncertainty', () => {
    expect(kml).toContain('±0.1');
  });

  it('includes azimuthal gap', () => {
    expect(kml).toContain('165°');
  });

  it('includes minimum distance', () => {
    expect(kml).toContain('0.12°');
  });

  it('includes correct KML coordinate order (lon,lat,altitude_m)', () => {
    // altitude = -depth * 1000 = -12500 m
    expect(kml).toContain('174.7762,-41.2865,-12500');
  });

  it('includes TimeStamp for temporal animation', () => {
    expect(kml).toContain('<TimeStamp>');
    expect(kml).toContain('<when>2024-03-15T08:22:31.500Z</when>');
  });

  it('includes bounding box in catalogue description', () => {
    expect(kml).toContain('S: -47');
    expect(kml).toContain('N: -34');
  });

  it('includes merge description in catalogue description', () => {
    expect(kml).toContain('Merged from two sources');
  });

  it('assigns correct styleUrl based on magnitude range (M5.2 → mag_5_6)', () => {
    expect(kml).toContain('#mag_5_6');
  });

  it('has Style definitions for all magnitude ranges', () => {
    expect(kml).toContain('id="mag_0_3"');
    expect(kml).toContain('id="mag_3_4"');
    expect(kml).toContain('id="mag_4_5"');
    expect(kml).toContain('id="mag_5_6"');
    expect(kml).toContain('id="mag_6_7"');
    expect(kml).toContain('id="mag_7_plus"');
  });

  it('places events in the correct magnitude folder', () => {
    // M 5.2 should be in the 5-6 folder
    expect(kml).toContain('M 5-6');
  });
});
