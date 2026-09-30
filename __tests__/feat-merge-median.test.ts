/** @jest-environment node */

/**
 * The 'median' (consensus) strategy (contract M4): component-wise median latitude and
 * longitude (unwrapped across the date line), median origin time (the mean of two), the
 * best-constrained depth and the type-preferred magnitude, published exactly as the
 * averaged strategy publishes a computed solution - no report `selected`, the metadata of
 * any one origin cleared - but with no location weights.
 */

import {
  mergeEventGroup,
  mergeByMedian,
  medianEpicentre,
  medianLongitude,
  buildMergedEventFields,
  performMergeWithGroups,
  OPTIONAL_DB_FIELDS,
  ORIGIN_META_FIELDS,
  LOCATION_META_FIELDS,
} from '@/lib/merge';
import { ALLOWED_MERGE_STRATEGY } from '@/lib/db';
import { validateMergeRequest } from '@/lib/validation';

const MEDIAN: any = { timeThreshold: 60, distanceThreshold: 100, mergeStrategy: 'median', priority: 'quality' };

const ev = (id: string, extra: Record<string, unknown>): any => ({
  id, source: id, catalogueId: `cat-${id}`, time: '2020-01-01T00:00:00.000Z',
  latitude: -41, longitude: 174, depth: 12, magnitude: 4.0, magnitude_type: 'ML', ...extra,
});

describe('the consensus epicentre', () => {
  // Three reports; the third is an outlier 55 km south that pulls a mean to -41.2.
  const a = ev('a', { latitude: -41.0, longitude: 174.0, horizontal_uncertainty: 2, agency_id: 'WEL' });
  const b = ev('b', { latitude: -41.1, longitude: 174.2, time: '2020-01-01T00:00:02.000Z', depth: 15, depth_uncertainty: 1 });
  const c = ev('c', { latitude: -41.5, longitude: 174.1, time: '2020-01-01T00:00:10.000Z', magnitude: 4.3, magnitude_type: 'Mw' });

  it('is the component-wise median, with the median origin time', () => {
    expect(medianEpicentre([a, b, c])).toEqual({ latitude: -41.1, longitude: 174.1, time: '2020-01-01T00:00:02.000Z' });
  });

  it('is the mean of two reports', () => {
    expect(medianEpicentre([a, b])).toEqual({ latitude: -41.05, longitude: 174.1, time: '2020-01-01T00:00:01.000Z' });
  });

  it('unwraps longitudes across the date line as the average does', () => {
    expect(medianLongitude([179, -179])).toBe(180);
    expect(medianLongitude([179.5, -179.5, 179.9])).toBeCloseTo(179.9, 10);
    expect(medianLongitude([-179.5, -179.9, 179.5])).toBeCloseTo(-179.9, 10);
    expect(medianLongitude([10, 20, 40])).toBe(20);
  });

  it('publishes a computed solution: no selected report, no weights, cleared origin metadata', () => {
    const merged: any = mergeByMedian([a, b, c]);
    expect([merged.latitude, merged.longitude, merged.time]).toEqual([-41.1, 174.1, '2020-01-01T00:00:02.000Z']);
    expect(merged.source).toBe('merged');
    expect(merged.sourceEvents.some((s: any) => s.selected)).toBe(false);
    expect(merged.sourceEvents.some((s: any) => s.locationWeight != null)).toBe(false);
    // Depth: best constrained (b states the only uncertainty); magnitude: Mw preferred.
    expect([merged.depth, merged.depth_uncertainty]).toEqual([15, 1]);
    expect(merged.sourceEvents.filter((s: any) => s.depthSelected).map((s: any) => s.originalData.id)).toEqual(['b']);
    expect([merged.magnitude, merged.magnitude_type]).toEqual([4.3, 'Mw']);
    expect(merged.sourceEvents.filter((s: any) => s.magnitudeSelected).map((s: any) => s.originalData.id)).toEqual(['c']);
    for (const field of [...ORIGIN_META_FIELDS, ...LOCATION_META_FIELDS]) expect(merged[field] ?? null).toBeNull();
  });

  it('is recorded as the strategy of the merged row and passes the database contract', () => {
    const merged: any = mergeEventGroup([a, b, c], MEDIAN);
    expect(merged.merge_strategy).toBe('median');
    expect(JSON.parse(merged.merge_parameters).mergeStrategy).toBe('median');
    const row: any = buildMergedEventFields(merged, OPTIONAL_DB_FIELDS);
    expect(row.merge_strategy).toBe('median');
    expect(row.horizontal_uncertainty).toBeNull(); // no origin's ellipse describes a median point
    expect(ALLOWED_MERGE_STRATEGY.has('median')).toBe(true);
  });

  it('the preview marks no selected report for a median group', () => {
    const groups = performMergeWithGroups([a, b], { ...MEDIAN, distanceThreshold: 50 });
    expect(groups).toHaveLength(1);
    expect(groups[0].selectedEventIndex).toBe(-1);
  });

  it('is accepted by the request schema', () => {
    const result = validateMergeRequest({
      name: 'Merged',
      sourceCatalogues: [
        { id: 'cat-a', name: 'A', events: 1, source: 'A' },
        { id: 'cat-b', name: 'B', events: 1, source: 'B' },
      ],
      config: { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'median', priority: 'quality' },
    });
    expect(result.success).toBe(true);
  });
});
