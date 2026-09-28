/** @jest-environment node */

/**
 * Findings #22 and gi#0: GeoNet's bare 'M' magnitude, and a 'quality' merge whose winner
 * depended on how the data arrived.
 *
 * - #22: GeoNet's FDSN service reports the SeisComP summary magnitude as a bare 'M' for most
 *   of the NZ catalogue; it is the local-magnitude (ML) family, as lib/seismological-analysis
 *   treats it. Unclassified, it could never join the cross-scale comparison, so GeoNet 'M'
 *   against ISC 'mb' — the commonest NZ duplicate pairing — split.
 * - gi#0: the built-in importer stores no station count, gap, RMS or status for M<5 events.
 *   Scored as zero, that GeoNet solution lost to any report with a recognised magnitude
 *   label, while the SAME solution uploaded from quakesearch CSV won. Reports are now
 *   compared only on metrics every one of them reports, and network authority decides when
 *   a report has no quality evidence at all.
 */

import {
  getMagnitudeTypeCategory,
  convertToMw,
  validateEventGroup,
  groupMatchingEvents,
  mergeEventGroup,
  calculateQualityScore,
} from '@/lib/merge';

const QUALITY: any = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };

describe('#22 GeoNet\'s bare "M" is the local-magnitude family', () => {
  it('classifies and converts it like ML', () => {
    expect(getMagnitudeTypeCategory('M')).toBe('ML');
    expect(getMagnitudeTypeCategory(' m ')).toBe('ML');
    expect(convertToMw(3.8, 'M')?.value).toBe(3.8);
  });

  it('merges GeoNet M 3.8 with ISC mb 3.26 (both Mw 3.80) instead of splitting them', () => {
    // Scordilis (2006): Mw = 0.85 * 3.26 + 1.03 = 3.80; ML ~ Mw. Raw range 0.54 > the 0.5
    // tier, so without the common-scale comparison the pair was rejected.
    const gn: any = { id: 'gn', source: 'GeoNet', catalogueId: 'gn', time: '2020-01-01T00:00:00Z', latitude: -41.0, longitude: 174.0, depth: 12, magnitude: 3.8, magnitude_type: 'M' };
    const isc: any = { id: 'isc', source: 'ISC', catalogueId: 'isc', time: '2020-01-01T00:00:02Z', latitude: -41.018, longitude: 174.0, depth: 12, magnitude: 3.26, magnitude_type: 'mb' };
    expect(validateEventGroup([gn, isc], false)).toBe(true);
    expect(groupMatchingEvents([gn, isc], QUALITY).map(g => g.events.map((e: any) => e.id))).toEqual([['gn', 'isc']]);
  });

  it('scores a local event\'s ML (or M) at least as high as a raw mb', () => {
    const at = (magnitude_type: string): any => ({ id: magnitude_type, time: '2020-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 12, magnitude: 3.8, magnitude_type });
    expect(calculateQualityScore(at('ML'))).toBeGreaterThan(calculateQualityScore(at('mb')));
    expect(calculateQualityScore(at('M'))).toBe(calculateQualityScore(at('ML')));
  });
});

describe('gi#0 the quality strategy keeps the same solution whatever the ingestion path', () => {
  // GeoNet 2020p000123: M 4.3 ('M') at -39.6427 / 176.3389, 48.3 km deep.
  const geonetImporter: any = {
    id: 'gn-fdsn', source: 'GeoNet - Automated Import', catalogueId: 'cat-fdsn', source_id: '2020p000123',
    time: '2020-01-01T10:00:00.000Z', latitude: -39.6427, longitude: 176.3389, depth: 48.3,
    magnitude: 4.3, magnitude_type: 'M',
  };
  const geonetQuakesearch: any = {
    ...geonetImporter, id: 'gn-csv', source: 'GeoNet quakesearch', catalogueId: 'cat-csv',
    used_station_count: 38, azimuthal_gap: 72, magnitude_uncertainty: 0.2, evaluation_status: 'reviewed',
  };
  // ISC reports only mb 4.6, ~11 km east-south-east, with no quality metrics.
  const isc: any = {
    id: 'isc', source: 'ISC', catalogueId: 'cat-isc', source_id: '616000123',
    time: '2020-01-01T10:00:01.500Z', latitude: -39.70, longitude: 176.45, depth: 33,
    magnitude: 4.6, magnitude_type: 'mb',
  };

  const kept = (events: any[]) => {
    const groups = groupMatchingEvents(events, QUALITY);
    expect(groups).toHaveLength(1);
    return mergeEventGroup(groups[0].events, QUALITY);
  };

  it('keeps the GeoNet solution when GeoNet came through the FDSN importer', () => {
    // No report in the pair states any quality metric, so nothing about the two solutions can
    // be compared; the NZ regional authority (GeoNet) decides. This used to keep ISC (0 vs 9).
    const merged = kept([geonetImporter, isc]);
    expect([merged.latitude, merged.longitude, merged.depth, merged.magnitude]).toEqual([-39.6427, 176.3389, 48.3, 4.3]);
  });

  it('keeps the same GeoNet solution when it came from quakesearch CSV', () => {
    const merged = kept([geonetQuakesearch, isc]);
    expect([merged.latitude, merged.longitude, merged.depth, merged.magnitude]).toEqual([-39.6427, 176.3389, 48.3, 4.3]);
  });

  it('does not let a metadata-free temporary-network ML row outrank GeoNet on its label', () => {
    const tempNetwork: any = {
      id: 'x9', source: 'SAHKE (X9)', catalogueId: 'cat-x9', time: '2020-01-01T10:00:00.800Z',
      latitude: -39.645, longitude: 176.34, depth: 45, magnitude: 2.9, magnitude_type: 'ML',
    };
    // Magnitudes 4.3 vs 2.9 fail the gate, so exercise the choice directly.
    const merged = mergeEventGroup([tempNetwork, geonetImporter], QUALITY);
    expect(merged.id).toBe('gn-fdsn');
  });

  it('compares reports on the metrics both state, whatever order they arrive in', () => {
    const gn: any = { ...geonetImporter, id: 'gn', used_station_count: 45, azimuthal_gap: 60, evaluation_status: 'reviewed' };
    const iscQuakeml: any = { ...isc, used_station_count: 8, azimuthal_gap: 200, standard_error: 1.4, evaluation_status: 'preliminary' };
    expect(mergeEventGroup([gn, iscQuakeml], QUALITY).id).toBe('gn');
    expect(mergeEventGroup([iscQuakeml, gn], QUALITY).id).toBe('gn');
  });
});
