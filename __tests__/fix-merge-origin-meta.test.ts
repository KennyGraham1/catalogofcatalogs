/** @jest-environment node */

/**
 * Finding #21 (H5): fields that describe ONE origin solution — QuakeML 1.2 BED Origin
 * (time uncertainty, method, earth model, evaluation mode/status), OriginQuality (gap,
 * phase/station counts, standard error, distances) and CreationInfo (agency, author) — are
 * published only with the origin they describe. The field union used to fill them from
 * whichever report scored highest, and the averaged record kept the best-quality report's
 * values on an epicentre no agency located.
 */

import { mergeEventGroup, buildMergedEventFields } from '@/lib/merge';
import { metricsFromEvent, scoreQualityMetrics } from '@/lib/quality-scoring';

// The optional columns the merge writes (lib/merge.ts executeMergeOperation).
const STORED_FIELDS = [
  'source_id', 'region', 'location_name',
  'event_public_id', 'event_type', 'event_type_certainty', 'source_event_type',
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
  'depth_uncertainty', 'horizontal_uncertainty',
  'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'azimuth_max_horizontal_uncertainty',
  'confidence_level',
  'depth_type', 'earth_model_id', 'method_id', 'agency_id', 'author',
  'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count',
  'magnitude_method_id', 'magnitude_evaluation_mode', 'magnitude_evaluation_status',
  'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
  'minimum_distance', 'maximum_distance',
  'associated_phase_count', 'associated_station_count', 'depth_phase_count',
  'evaluation_mode', 'evaluation_status',
  'preferred_origin_id', 'preferred_magnitude_id', 'preferred_focal_mechanism_id',
  'origin_quality', 'origins', 'magnitudes', 'picks', 'arrivals',
  'focal_mechanisms', 'amplitudes', 'station_magnitudes',
  'event_descriptions', 'comments', 'creation_info',
];

/** Every field that describes the ISC origin below. */
const ORIGIN_FIELDS = [
  'time_uncertainty', 'earth_model_id', 'method_id', 'agency_id', 'author',
  'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
  'minimum_distance', 'maximum_distance', 'associated_phase_count', 'associated_station_count',
  'depth_phase_count', 'evaluation_mode', 'evaluation_status',
  'origin_quality', 'arrivals', 'preferred_origin_id', 'creation_info',
];

/** A GeoNet FDSN-text row as the built-in importer stores it: no solution metadata at all. */
const geonet: any = {
  id: 'gn', source: 'GeoNet', catalogueId: 'cat-gn', source_id: '2016p000001',
  time: '2016-11-13T11:02:56.000Z', latitude: -41.0, longitude: 174.0, depth: 20,
  magnitude: 4.4, magnitude_type: 'M', event_type: 'earthquake',
};

/** An ISC QuakeML row: its own origin, fully described. */
const isc: any = {
  id: 'isc', source: 'ISC', catalogueId: 'cat-isc', source_id: '600001',
  time: '2016-11-13T11:02:57.500Z', latitude: -41.2, longitude: 174.3, depth: 33,
  magnitude: 4.6, magnitude_type: 'mb',
  agency_id: 'ISC', author: 'ISC', method_id: 'smi:ISC/method/iscloc', earth_model_id: 'ak135',
  azimuthal_gap: 250, used_phase_count: 14, used_station_count: 9, standard_error: 1.4,
  minimum_distance: 2.1, maximum_distance: 95, associated_phase_count: 30, associated_station_count: 12,
  depth_phase_count: 2, evaluation_mode: 'manual', evaluation_status: 'reviewed', time_uncertainty: 1.2,
  origin_quality: JSON.stringify({ azimuthalGap: 250, usedStationCount: 9 }),
  arrivals: JSON.stringify([{ publicID: 'smi:ISC/arrid=1', pickID: 'smi:ISC/pickid=1', timeResidual: 0.8 }]),
  preferred_origin_id: 'smi:ISC/origid=1',
  origins: JSON.stringify([{ publicID: 'smi:ISC/origid=1', time: { value: '2016-11-13T11:02:57.500Z' }, latitude: { value: -41.2 }, longitude: { value: 174.3 } }]),
  creation_info: JSON.stringify({ agencyID: 'ISC', creationTime: '2017-01-10T00:00:00Z' }),
};

const config = (extra: Record<string, unknown>): any => ({ timeThreshold: 60, distanceThreshold: 50, ...extra });

function storedRow(strategy: Record<string, unknown>, events: any[] = [geonet, isc]) {
  return buildMergedEventFields(mergeEventGroup(events, config(strategy)) as any, STORED_FIELDS) as Record<string, any>;
}

describe('#21 a published origin never carries another agency\'s origin metadata', () => {
  it('keeps GeoNet\'s origin free of ISC\'s agency, method, quality and status (priority GeoNet)', () => {
    const row = storedRow({ mergeStrategy: 'priority', priority: 'geonet' });
    // Precondition: GeoNet's solution is the one published.
    expect([row.time, row.latitude, row.longitude, row.depth]).toEqual([geonet.time, -41.0, 174.0, 20]);
    for (const field of ORIGIN_FIELDS) {
      expect({ field, value: row[field] }).toEqual({ field, value: null });
    }
    // ISC's solution is still kept whole, as a supplementary origin and in the provenance.
    expect(row.origins).toBe(isc.origins);
    const members = JSON.parse(row.source_events);
    expect(members.find((m: any) => m.source === 'ISC').originalData.agency_id).toBe('ISC');
  });

  it('scores the published row, not the metadata it would have borrowed', () => {
    const row = storedRow({ mergeStrategy: 'priority', priority: 'geonet' });
    const published = buildMergedEventFields(mergeEventGroup([geonet], config({ mergeStrategy: 'priority', priority: 'geonet' })) as any, STORED_FIELDS);
    expect(row.quality_score).toBe(scoreQualityMetrics(metricsFromEvent(published)).overall);
    expect(row.quality_score).toBeLessThan(scoreQualityMetrics(metricsFromEvent(isc)).overall);
  });

  it('keeps an origin\'s own metadata when that origin is the one published', () => {
    const row = storedRow({ mergeStrategy: 'priority', priority: 'isc' });
    expect([row.latitude, row.longitude]).toEqual([-41.2, 174.3]);
    for (const field of ORIGIN_FIELDS) {
      expect({ field, value: row[field] }).toEqual({ field, value: isc[field] });
    }
  });

  it('clears every origin field on an averaged record, whose epicentre no agency located', () => {
    const row = storedRow({ mergeStrategy: 'average', priority: 'newest' });
    // The averaged epicentre matches neither report, and the time is GeoNet's (earliest).
    expect(row.latitude).not.toBe(geonet.latitude);
    expect(row.latitude).not.toBe(isc.latitude);
    expect(row.time).toBe(geonet.time);
    for (const field of ORIGIN_FIELDS) {
      expect({ field, value: row[field] }).toEqual({ field, value: null });
    }
    // No report's solution was published whole, so none is marked selected (C2).
    expect(JSON.parse(row.source_events).some((m: any) => m.selected)).toBe(false);
  });

  it('does not re-derive them from the base event\'s parsed QuakeML either (export-only path)', () => {
    // First export-only merge of parsed QuakeML: the best-quality report carries its origin
    // in memory. Its time uncertainty, agency, quality and status describe THAT origin.
    const withQuakeml: any = {
      ...isc,
      quakeml: {
        publicID: 'smi:ISC/evid=1',
        preferredOriginID: 'smi:ISC/origid=1',
        origins: [{
          publicID: 'smi:ISC/origid=1',
          time: { value: isc.time, uncertainty: 1.2 },
          latitude: { value: -41.2, uncertainty: 0.05 },
          longitude: { value: 174.3, uncertainty: 0.06 },
          depth: { value: 33000, uncertainty: 5000 },
          depthType: 'from location',
          quality: { usedStationCount: 9, azimuthalGap: 250, standardError: 1.4 },
          uncertainty: { horizontalUncertainty: 9000, confidenceLevel: 90 },
          creationInfo: { agencyID: 'ISC', author: 'ISC' },
          evaluationMode: 'manual',
          evaluationStatus: 'reviewed',
        }],
      },
    };
    const row = storedRow({ mergeStrategy: 'average', priority: 'newest' }, [geonet, withQuakeml]);
    for (const field of [...ORIGIN_FIELDS, 'confidence_level', 'horizontal_uncertainty', 'latitude_uncertainty']) {
      expect({ field, value: row[field] }).toEqual({ field, value: null });
    }
  });
});
