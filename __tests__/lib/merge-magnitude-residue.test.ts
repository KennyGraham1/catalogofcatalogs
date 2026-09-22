/** @jest-environment node */

// Magnitude selection in the merge engine and the scale-aware
// seismic moment.

import { selectBestMagnitude, mergeByAverage, getMagnitudeTypeCategory, convertToMw, buildMergedEventFields } from '@/lib/merge';
import { calculateSeismicMoment } from '@/lib/seismological-analysis';

const ev = (extra: Record<string, unknown> = {}): any => ({
  id: 'e', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10,
  magnitude: 5.4, magnitude_type: 'ML', source: 'GeoNet', catalogueId: 'GeoNet', ...extra,
});

describe('stored alternative magnitudes are visible to the selector', () => {
  it('prefers a stored Mw 5.9 over the preferred ML 5.4 when only the JSON column survives', () => {
    const stored = ev({ magnitudes: JSON.stringify([
      { publicID: 'smi:local/mag/ml', type: 'ML', mag: { value: 5.4, uncertainty: 0.2 } },
      { publicID: 'smi:local/mag/mw', type: 'Mw', mag: { value: 5.9, uncertainty: 0.1 }, stationCount: 14, methodID: 'smi:local/method/mt' },
    ]) });
    const best = selectBestMagnitude([stored]);
    expect([best.value, best.type]).toEqual([5.9, 'Mw']);
  });
});

describe('the merged magnitude metadata belongs to the selected magnitude', () => {
  it('carries the Mw uncertainty, station count and method, and is not overwritten from QuakeML', () => {
    const geonet = ev({ magnitude: 5.4, magnitude_type: 'ML', magnitude_uncertainty: 0.3, magnitude_station_count: 7, magnitude_method_id: 'smi:local/method/ml' });
    const isc = ev({
      id: 'i', source: 'ISC', catalogueId: 'ISC', magnitude: 5.9, magnitude_type: 'Mw',
      magnitude_uncertainty: 0.1, magnitude_station_count: 14, magnitude_method_id: 'smi:local/method/mt',
      magnitude_evaluation_mode: 'manual', magnitude_evaluation_status: 'reviewed',
    });
    const merged: any = mergeByAverage([geonet, isc]);
    expect([merged.magnitude, merged.magnitude_type]).toEqual([5.9, 'Mw']);
    expect([merged.magnitude_uncertainty, merged.magnitude_station_count, merged.magnitude_method_id]).toEqual([0.1, 14, 'smi:local/method/mt']);
    expect([merged.magnitude_evaluation_mode, merged.magnitude_evaluation_status]).toEqual(['manual', 'reviewed']);
    // A QuakeML preferred magnitude on the merged record (from the anchor) must not re-derive them.
    const withQml = { ...merged, quakeml: { preferredMagnitudeID: 'smi:local/mag/ml', magnitudes: [{ publicID: 'smi:local/mag/ml', type: 'ML', mag: { value: 5.4, uncertainty: 0.3 }, stationCount: 7 }] } };
    const fields: any = buildMergedEventFields(withQml as any, ['magnitude_uncertainty', 'magnitude_station_count']);
    expect([fields.magnitude_uncertainty, fields.magnitude_station_count]).toEqual([0.1, 14]);
  });
});

describe('broadband body-wave and mbLg are distinct from short-period mb', () => {
  it('categorises mB and mb_Lg separately and does not apply the mb->Mw regression to them', () => {
    expect(getMagnitudeTypeCategory('mB')).toBe('mB');
    expect(getMagnitudeTypeCategory('mb_Lg')).toBe('mbLg');
    expect(getMagnitudeTypeCategory('mbLg')).toBe('mbLg');
    expect(getMagnitudeTypeCategory('mb')).toBe('mb');
    expect(convertToMw(5, 'mb')?.value).toBeCloseTo(0.85 * 5 + 1.03, 6);
    expect(convertToMw(5, 'mB')).toBeNull();
    expect(convertToMw(5, 'mbLg')).toBeNull();
  });
});

describe('seismic moment is computed on the scale the magnitude was measured in', () => {
  const e = (magnitude: number, magnitude_type: string | undefined): any => ({
    id: `${magnitude}${magnitude_type}`, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude, magnitude_type,
  });
  const m0 = (mw: number) => Math.pow(10, 1.5 * mw + 9.1);

  it('sums Mw exactly, ML under a disclosed assumption, and excludes saturating scales', () => {
    const r = calculateSeismicMoment([e(6, 'Mw'), e(5, 'ML'), e(5, 'mb'), e(6, 'Ms'), e(4, 'Md')]);
    expect(r.totalMoment / (m0(6) + m0(5))).toBeCloseTo(1, 9);
    expect([r.assumedMwCount, r.excludedCount]).toEqual([1, 3]);
  });

  it('treats an untyped magnitude as an assumed local magnitude rather than dropping it', () => {
    const r = calculateSeismicMoment([e(5, undefined), e(5, 'Mw')]);
    expect(r.totalMoment / (2 * m0(5))).toBeCloseTo(1, 9);
    expect([r.assumedMwCount, r.excludedCount]).toEqual([1, 0]);
  });

  it('refuses rather than fabricating a moment when every magnitude saturates', () => {
    expect(() => calculateSeismicMoment([e(5, 'mb'), e(6, 'Ms')])).toThrow(/No Mw or ML/);
  });
});
