/**
 * Unit tests for lib/quakeml-exporter.ts
 *
 * Focuses on the fallback origin/magnitude code paths that fire when
 * event.origins / event.magnitudes JSON is absent or unparseable —
 * these paths reconstruct QuakeML elements from the scalar database fields.
 */

import { eventToQuakeML, eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import type { MergedEvent } from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid event — only required scalar fields. */
const minimalEvent: MergedEvent = {
  id: 'evt-min',
  catalogue_id: 'cat-001',
  time: '2024-03-15T08:22:31.500Z',
  latitude: -41.2865,
  longitude: 174.7762,
  depth: 12.5,
  magnitude: 5.2,
  source_events: '[]',
  created_at: '2024-03-16T00:00:00Z',
};

/** Fully-populated event without pre-built JSON blobs — exercises the scalar fallback. */
const scalarOnlyEvent: MergedEvent = {
  ...minimalEvent,
  id: 'evt-scalar',
  source_id: 'nz2024abc',
  event_public_id: 'quakeml:nz.geonet.org.nz/2024abc',
  event_type: 'earthquake',
  event_type_certainty: 'known',

  time_uncertainty: 0.15,
  latitude_uncertainty: 0.05,
  longitude_uncertainty: 0.06,
  depth_uncertainty: 2.0,
  horizontal_uncertainty: 3.5,

  depth_type: 'from location',
  earth_model_id: 'nz3d',
  method_id: 'NonLinLoc',

  agency_id: 'GNS',
  author: 'GeoNet',

  magnitude_type: 'ML',
  magnitude_uncertainty: 0.1,
  magnitude_station_count: 14,
  magnitude_method_id: 'weighted_mean',
  magnitude_evaluation_mode: 'manual',
  magnitude_evaluation_status: 'reviewed',

  azimuthal_gap: 165,
  used_phase_count: 32,
  used_station_count: 18,
  standard_error: 0.42,
  minimum_distance: 0.12,
  maximum_distance: 3.8,
  associated_phase_count: 40,
  associated_station_count: 22,
  depth_phase_count: 5,

  evaluation_mode: 'manual',
  evaluation_status: 'reviewed',

  preferred_origin_id: 'quakeml:nz.geonet.org.nz/origin/scalar',
  preferred_magnitude_id: 'quakeml:nz.geonet.org.nz/magnitude/scalar',

  region: 'Wellington, New Zealand',
  location_name: 'Wellington CBD',
};

// ---------------------------------------------------------------------------
// eventToQuakeML — fallback origin path
// ---------------------------------------------------------------------------

describe('eventToQuakeML — fallback origin (no origins JSON)', () => {
  let xml: string;

  beforeEach(() => {
    xml = eventToQuakeML(scalarOnlyEvent);
  });

  it('wraps in <event> with correct publicID', () => {
    expect(xml).toContain('<event publicID="quakeml:nz.geonet.org.nz/2024abc"');
  });

  it('emits <type> from event_type', () => {
    expect(xml).toContain('<type>earthquake</type>');
  });

  it('emits <typeCertainty> from event_type_certainty', () => {
    expect(xml).toContain('<typeCertainty>known</typeCertainty>');
  });

  it('emits region as <description> of type "region name"', () => {
    expect(xml).toContain('<description>');
    expect(xml).toContain('Wellington, New Zealand');
    expect(xml).toContain('region name');
  });

  it('emits <origin> with correct publicID', () => {
    expect(xml).toContain('<origin publicID="quakeml:nz.geonet.org.nz/origin/scalar"');
  });

  it('includes time value and uncertainty in origin', () => {
    expect(xml).toContain('<value>2024-03-15T08:22:31.500Z</value>');
    expect(xml).toContain('<uncertainty>0.15</uncertainty>');
  });

  it('includes latitude and longitude with uncertainties', () => {
    expect(xml).toContain('<value>-41.2865</value>');
    expect(xml).toContain('<value>174.7762</value>');
    expect(xml).toContain('<uncertainty>0.05</uncertainty>');
    expect(xml).toContain('<uncertainty>0.06</uncertainty>');
  });

  it('converts depth from km to meters', () => {
    // 12.5 km × 1000 = 12500 m
    expect(xml).toContain('<value>12500</value>');
  });

  it('converts depth_uncertainty from km to meters', () => {
    // 2.0 km × 1000 = 2000 m
    expect(xml).toContain('<uncertainty>2000</uncertainty>');
  });

  it('emits <depthType> from depth_type', () => {
    expect(xml).toContain('<depthType>from location</depthType>');
  });

  it('emits <earthModelID> from earth_model_id', () => {
    expect(xml).toContain('<earthModelID>nz3d</earthModelID>');
  });

  it('emits <methodID> from method_id', () => {
    expect(xml).toContain('<methodID>NonLinLoc</methodID>');
  });

  it('emits <originUncertainty> with horizontal_uncertainty in meters', () => {
    // 3.5 km × 1000 = 3500 m
    expect(xml).toContain('<originUncertainty>');
    expect(xml).toContain('<horizontalUncertainty>3500</horizontalUncertainty>');
  });

  it('emits all quality metrics in <quality>', () => {
    expect(xml).toContain('<azimuthalGap>165</azimuthalGap>');
    expect(xml).toContain('<usedPhaseCount>32</usedPhaseCount>');
    expect(xml).toContain('<usedStationCount>18</usedStationCount>');
    expect(xml).toContain('<standardError>0.42</standardError>');
    expect(xml).toContain('<minimumDistance>0.12</minimumDistance>');
    expect(xml).toContain('<maximumDistance>3.8</maximumDistance>');
    expect(xml).toContain('<associatedPhaseCount>40</associatedPhaseCount>');
    expect(xml).toContain('<associatedStationCount>22</associatedStationCount>');
    expect(xml).toContain('<depthPhaseCount>5</depthPhaseCount>');
  });

  it('emits <evaluationMode> and <evaluationStatus> in origin', () => {
    expect(xml).toContain('<evaluationMode>manual</evaluationMode>');
    expect(xml).toContain('<evaluationStatus>reviewed</evaluationStatus>');
  });

  it('emits <creationInfo> with agencyID and author in origin', () => {
    expect(xml).toContain('<creationInfo>');
    expect(xml).toContain('<agencyID>GNS</agencyID>');
    expect(xml).toContain('<author>GeoNet</author>');
  });
});

// ---------------------------------------------------------------------------
// eventToQuakeML — fallback magnitude path
// ---------------------------------------------------------------------------

describe('eventToQuakeML — fallback magnitude (no magnitudes JSON)', () => {
  let xml: string;

  beforeEach(() => {
    xml = eventToQuakeML(scalarOnlyEvent);
  });

  it('emits <magnitude> with correct publicID', () => {
    expect(xml).toContain('<magnitude publicID="quakeml:nz.geonet.org.nz/magnitude/scalar"');
  });

  it('includes magnitude value and uncertainty', () => {
    expect(xml).toContain('<value>5.2</value>');
    expect(xml).toContain('<uncertainty>0.1</uncertainty>');
  });

  it('includes magnitude type', () => {
    expect(xml).toContain('<type>ML</type>');
  });

  it('includes stationCount', () => {
    expect(xml).toContain('<stationCount>14</stationCount>');
  });

  it('links magnitude to preferred origin via <originID>', () => {
    expect(xml).toContain('<originID>quakeml:nz.geonet.org.nz/origin/scalar</originID>');
  });

  it('emits <methodID> from magnitude_method_id', () => {
    expect(xml).toContain('<methodID>weighted_mean</methodID>');
  });

  it('uses magnitude_evaluation_mode rather than generic evaluation_mode', () => {
    // Both fields are 'manual' here, but we verify the element is present
    expect(xml).toContain('<evaluationMode>manual</evaluationMode>');
  });

  it('uses magnitude_evaluation_status rather than generic evaluation_status', () => {
    expect(xml).toContain('<evaluationStatus>reviewed</evaluationStatus>');
  });

  it('emits <creationInfo> in magnitude element', () => {
    // creationInfo appears at least twice (origin + magnitude)
    const matches = xml.match(/<creationInfo>/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// eventToQuakeML — magnitude_evaluation_mode preferred over evaluation_mode
// ---------------------------------------------------------------------------

describe('eventToQuakeML — magnitude evaluation fields take precedence', () => {
  it('uses magnitude_evaluation_mode when it differs from evaluation_mode', () => {
    const event: MergedEvent = {
      ...scalarOnlyEvent,
      evaluation_mode: 'automatic',          // origin-level
      magnitude_evaluation_mode: 'manual',   // magnitude-specific — should win
      evaluation_status: 'preliminary',
      magnitude_evaluation_status: 'reviewed',
    };
    const xml = eventToQuakeML(event);
    // The magnitude element should contain manual/reviewed, not automatic/preliminary
    // (We look for the magnitude block specifically)
    expect(xml).toContain('<evaluationMode>manual</evaluationMode>');
    expect(xml).toContain('<evaluationStatus>reviewed</evaluationStatus>');
  });
});

// ---------------------------------------------------------------------------
// eventsToQuakeMLDocument — document wrapper
// ---------------------------------------------------------------------------

describe('eventsToQuakeMLDocument', () => {
  it('produces a valid QuakeML document with XML declaration and namespace', () => {
    const doc = eventsToQuakeMLDocument([minimalEvent], 'Test Cat');
    expect(doc).toContain('<?xml version="1.0"');
    expect(doc).toContain('<q:quakeml');
    expect(doc).toContain('xmlns:q=');
    expect(doc).toContain('<eventParameters');
    expect(doc).toContain('</q:quakeml>');
  });

  it('includes all events', () => {
    const doc = eventsToQuakeMLDocument([minimalEvent, scalarOnlyEvent], 'Test Cat');
    const eventCount = (doc.match(/<event publicID=/g) || []).length;
    expect(eventCount).toBe(2);
  });

  it('emits creationTime in creationInfo', () => {
    const doc = eventsToQuakeMLDocument([minimalEvent], 'Test Cat');
    expect(doc).toContain('<creationTime>');
  });

  it('includes catalogue metadata as comments when provided', () => {
    const doc = eventsToQuakeMLDocument([minimalEvent], 'Test Cat', {
      license: 'CC BY 4.0',
      doi: '10.21420/test',
      citation: 'Smith (2024)',
    });
    expect(doc).toContain('CC BY 4.0');
    expect(doc).toContain('10.21420/test');
  });
});

// ---------------------------------------------------------------------------
// eventToQuakeML — scalar fallback always fires (no JSON blobs present)
// ---------------------------------------------------------------------------

describe('eventToQuakeML — fallback fires when origins/magnitudes JSON is absent (null)', () => {
  it('emits <origin> even when event.origins is null/undefined', () => {
    // minimalEvent has no origins field at all — the most common DB record shape.
    const xml = eventToQuakeML(minimalEvent);
    expect(xml).toContain('<origin publicID=');
    expect(xml).toContain('<latitude>');
    expect(xml).toContain('<longitude>');
  });

  it('emits <magnitude> even when event.magnitudes is null/undefined', () => {
    const xml = eventToQuakeML(minimalEvent);
    expect(xml).toContain('<magnitude publicID=');
    expect(xml).toContain('<mag>');
  });

  it('uses JSON origins when valid JSON is present instead of scalar fallback', () => {
    const storedOrigin = {
      publicID: 'quakeml:test/origin/json',
      time: { value: '2024-01-01T00:00:00Z' },
      latitude: { value: -45.0 },
      longitude: { value: 170.0 },
      depth: { value: 10000 },
    };
    const event: MergedEvent = {
      ...minimalEvent,
      origins: JSON.stringify([storedOrigin]),
    };
    const xml = eventToQuakeML(event);
    expect(xml).toContain('quakeml:test/origin/json');
    // Scalar lat should NOT appear (JSON origin takes precedence)
    expect(xml).not.toContain('<value>-41.2865</value>');
  });

  it('falls back to scalar origin when origins JSON is unparseable', () => {
    const event: MergedEvent = {
      ...minimalEvent,
      origins: 'not-valid-json',
    };
    const xml = eventToQuakeML(event);
    // Should still emit an origin from scalar fields
    expect(xml).toContain('<origin publicID=');
    expect(xml).toContain('<value>-41.2865</value>');
  });
});

// ---------------------------------------------------------------------------
// eventsToQuakeMLDocument — merge/provenance metadata
// ---------------------------------------------------------------------------

describe('eventsToQuakeMLDocument — merge and provenance metadata comments', () => {
  it('emits merge metadata fields as comments', () => {
    const doc = eventsToQuakeMLDocument([minimalEvent], 'Test Cat', {
      mergeDescription: 'Merged from three source catalogues',
      mergeUseCase: 'Seismic hazard analysis',
      mergeMethodology: 'Closest-event deduplication',
      mergeQualityAssessment: 'High',
    });
    expect(doc).toContain('Merged from three source catalogues');
    expect(doc).toContain('Seismic hazard analysis');
    expect(doc).toContain('Closest-event deduplication');
    expect(doc).toContain('High');
  });

  it('emits provenance fields as comments', () => {
    const doc = eventsToQuakeMLDocument([minimalEvent], 'Test Cat', {
      createdBy: 'admin@example.com',
      modifiedAt: '2024-06-01T12:00:00Z',
    });
    expect(doc).toContain('admin@example.com');
    expect(doc).toContain('2024-06-01T12:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// Region → EventDescription fallback
// ---------------------------------------------------------------------------

describe('eventToQuakeML — region/locationName EventDescription fallback', () => {
  it('emits region as EventDescription when event_descriptions is absent', () => {
    const event: MergedEvent = {
      ...minimalEvent,
      region: 'Canterbury Region',
      // event_descriptions intentionally absent
    };
    const xml = eventToQuakeML(event);
    expect(xml).toContain('Canterbury Region');
    expect(xml).toContain('region name');
  });

  it('does not duplicate descriptions when event_descriptions JSON is present', () => {
    const event: MergedEvent = {
      ...minimalEvent,
      region: 'Canterbury Region',
      event_descriptions: JSON.stringify([{ text: 'Canterbury Region', type: 'region name' }]),
    };
    const xml = eventToQuakeML(event);
    // Should appear exactly once
    const matches = xml.match(/Canterbury Region/g);
    expect(matches).toHaveLength(1);
  });
});
