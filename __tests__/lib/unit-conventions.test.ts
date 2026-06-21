/**
 * Regression tests for unit-convention correctness (audit root cause B).
 *
 * Canonical DB units: depth, depth_uncertainty, horizontal_uncertainty in km;
 * latitude/longitude_uncertainty and minimum/maximum_distance in degrees;
 * time_uncertainty in seconds. QuakeML BED carries depth and both length
 * uncertainties in metres, so import must convert m -> km and export km -> m.
 *
 * These tests also cover the previously-absent format round-trip checks
 * (QuakeML parse<->export, GeoJSON export->import) flagged by the audit.
 */

import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';
import { eventsToGeoJSON } from '@/lib/exporters';
import { parseQuakeML } from '@/lib/parsers';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { calculateQualityScore, type QualityMetrics } from '@/lib/quality-scoring';
import { assessEventQuality } from '@/lib/integrated-quality-assessment';
import type { MergedEvent } from '@/lib/db';

const baseEvent: MergedEvent = {
  id: 'evt-1',
  catalogue_id: 'cat-1',
  time: '2024-03-15T08:22:31.500Z',
  latitude: -41.2865,
  longitude: 174.7762,
  depth: 12.5, // km
  magnitude: 5.2,
  source_events: '[]',
  created_at: '2024-03-16T00:00:00Z',
  depth_uncertainty: 2.0, // km
  horizontal_uncertainty: 3.5, // km
};

describe('QuakeML uncertainty unit round-trip (m <-> km)', () => {
  const xml = eventsToQuakeMLDocument([baseEvent], 'roundtrip-test');

  it('exports depth and length uncertainties in metres', () => {
    expect(xml).toContain('<value>12500</value>'); // 12.5 km -> 12500 m
    expect(xml).toContain('<uncertainty>2000</uncertainty>'); // 2.0 km -> 2000 m
    expect(xml).toContain('<horizontalUncertainty>3500</horizontalUncertainty>'); // 3.5 km -> 3500 m
  });

  it('re-imports the same km values (no 1000x inflation)', () => {
    const result = parseQuakeML(xml);
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    const ev = result.events[0] as any;
    expect(ev.depth).toBeCloseTo(12.5, 6);
    expect(ev.depth_uncertainty).toBeCloseTo(2.0, 6);
    expect(ev.horizontal_uncertainty).toBeCloseTo(3.5, 6);
  });
});

describe('GeoJSON depth round-trip and producer disambiguation', () => {
  it('app export (RFC 7946 negative metres) re-imports as positive km', () => {
    const geojson = eventsToGeoJSON([baseEvent]);
    const parsed = parseGeoJSON(geojson);
    expect(parsed.success).toBe(true);
    const ev = parsed.events[0] as any;
    expect(ev.depth).toBeCloseTo(12.5, 6);
    expect(ev.longitude).toBeCloseTo(174.7762, 6);
    expect(ev.latitude).toBeCloseTo(-41.2865, 6);
  });

  it('USGS/GeoNet style positive-km depth in the third coordinate is kept as km', () => {
    const fc = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [174.8, -41.3, 35] },
          properties: { mag: 4.1, time: '2024-01-01T00:00:00Z' },
        },
      ],
    });
    const ev = parseGeoJSON(fc).events[0] as any;
    expect(ev.depth).toBe(35);
  });

  it('deep event encoded as elevation-in-metres is converted to km', () => {
    const fc = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [178.5, -30.0, -600000] },
          properties: { mag: 6.0, time: '2024-01-01T00:00:00Z' },
        },
      ],
    });
    const ev = parseGeoJSON(fc).events[0] as any;
    expect(ev.depth).toBeCloseTo(600, 6);
  });
});

describe('Quality location score no longer saturates on km horizontal uncertainty', () => {
  const mk = (h: number): QualityMetrics => ({
    horizontalUncertainty: h, // km
    depthUncertainty: null,
    timeUncertainty: null,
    azimuthalGap: null,
    usedStationCount: null,
    usedPhaseCount: null,
    standardError: null,
    magnitudeUncertainty: null,
    magnitudeStationCount: null,
    evaluationMode: null,
    evaluationStatus: null,
  });

  it('discriminates between 2 km and 8 km (4 points/km, not saturated at 40)', () => {
    const s2 = calculateQualityScore(mk(2)).components.location.score;
    const s8 = calculateQualityScore(mk(8)).components.location.score;
    // With the old `* 444` factor both saturated to the -40 cap and were equal.
    expect(s2).toBeGreaterThan(s8);
    expect(s2 - s8).toBeCloseTo((8 - 2) * 4, 6);
  });
});

describe('GeoNet QS minimum_distance is interpreted in degrees and converted to km', () => {
  it('a 5 deg (~556 km) nearest-station distance is not scored Excellent', () => {
    const event = {
      latitude: -41.3,
      longitude: 174.8,
      azimuthal_gap: 50, // score 6
      used_station_count: 35, // score 6
      standard_error: 0.1, // rms score 6
      latitude_uncertainty: 0.005, // -> ~0.56 km horiz, score 6
      longitude_uncertainty: 0.005,
      depth_uncertainty: 1.0, // km, score 6
      minimum_distance: 5, // DEGREES (~556 km) -> should score very poor
    };
    const r = assessEventQuality(event);
    const md = r.geonetQS.criteriaBreakdown.minimumDistance;
    expect(md.value).toBeCloseTo(5 * 111.19, 1); // converted to km
    expect(md.score).toBeLessThanOrEqual(2); // not the Excellent (6) it used to be
    expect(r.geonetQS.limitingFactor).toBe('Minimum Distance');
  });
});
