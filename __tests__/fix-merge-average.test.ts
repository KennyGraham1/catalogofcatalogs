/** @jest-environment node */

/**
 * The 'average' strategy (cluster B1):
 *  - #24 / #133 / gi#1: a solution with no stated horizontal uncertainty was weighted 1.0,
 *    which in 1/σ² units (σ in km) is a σ = 1 km solution, so it outweighed every documented
 *    location worse than 1 km. Inverse-variance weights need a σ for every solution; a group
 *    where any report lacks one is averaged with equal weights (no placeholder σ).
 *  - #27: a fixed ("operator assigned") depth reported with uncertainty 0 set the comparison
 *    band to 0-5 km and beat every free depth. Fixed depths are used only when no report
 *    solved for depth, and a non-positive uncertainty counts as absent.
 *  - #25: rejected magnitudes were eligible, Mw proxies counted as exact Mw, and a raw mb was
 *    published over the ML of the same local earthquake.
 */

import {
  mergeEventGroup,
  mergeByAverage,
  selectBestDepth,
  selectBestMagnitude,
  convertToMw,
  weightedLocationAverage,
  buildMergedEventFields,
} from '@/lib/merge';
import { calculateDistance } from '@/lib/earthquake-utils';

const AVERAGE: any = { timeThreshold: 60, distanceThreshold: 50, mergeStrategy: 'average', priority: 'newest' };

const ev = (id: string, extra: Record<string, unknown>): any => ({
  id, source: id, catalogueId: id, time: '2020-01-01T00:00:00.000Z',
  latitude: -41, longitude: 174, depth: 12, magnitude: 4.0, magnitude_type: 'ML', ...extra,
});

describe('#24 / #133 / gi#1 a missing σ is not the σ of a 1 km solution', () => {
  it('averages a documented and an undocumented solution with equal weights', () => {
    // GeoNet σ = 3 km at (-41.00, 174.00); a CSV row 0.08° away with no σ. The 1 km reading
    // put the result (-41.072, 174.072): 10 km from GeoNet and 1.1 km from the CSV row.
    const geonet = ev('gn', { latitude: -41.0, longitude: 174.0, horizontal_uncertainty: 3 });
    const csv = ev('csv', { latitude: -41.08, longitude: 174.08, time: '2020-01-01T00:00:01.000Z' });
    const merged = mergeByAverage([geonet, csv]);
    expect(merged.latitude).toBeCloseTo(-41.04, 10);
    expect(merged.longitude).toBeCloseTo(174.04, 10);
    expect(merged.sourceEvents.map(s => s.locationWeight)).toEqual([0.5, 0.5]);
  });

  it('gives the same epicentre whichever report happened to arrive with an uncertainty', () => {
    // gi#1: GeoNet σh 2.5 km, ISC 20 km east with no σ. The GeoNet solution imported through
    // the FDSN service (σ present) and through quakesearch CSV (σ absent) must merge alike.
    const lat = -39.6427;
    const eastLon = 176.3389 + 20 / (111.19 * Math.cos((lat * Math.PI) / 180));
    const isc = ev('isc', { latitude: lat, longitude: eastLon, time: '2020-01-01T00:00:01.500Z' });
    const viaFdsn = ev('gn', { latitude: lat, longitude: 176.3389, horizontal_uncertainty: 2.5 });
    const viaCsv = ev('gn', { latitude: lat, longitude: 176.3389 });
    const a = weightedLocationAverage([viaFdsn, isc]);
    const b = weightedLocationAverage([viaCsv, isc]);
    expect(a.latitude).toBeCloseTo(b.latitude, 10);
    expect(a.longitude).toBeCloseTo(b.longitude, 10);
    // Half-way (about 10 km), not 17 km towards the undocumented report.
    expect(calculateDistance(lat, 176.3389, a.latitude, a.longitude)).toBeCloseTo(10, 0);
  });

  it('keeps inverse-variance weights when every report states σ, including an error ellipse', () => {
    // A: ellipse only, semi-major axis 2 km (1/4); B: circle 4 km (1/16) -> 0.8 : 0.2. An
    // ellipse-only origin used to count as undocumented.
    const a = ev('a', { latitude: -41.0, longitude: 174.0, max_horizontal_uncertainty: 2, min_horizontal_uncertainty: 1 });
    const b = ev('b', { latitude: -41.1, longitude: 174.1, horizontal_uncertainty: 4, time: '2020-01-01T00:00:01.000Z' });
    const merged = mergeByAverage([a, b]);
    expect(merged.latitude).toBeCloseTo(-41.0 * 0.8 + -41.1 * 0.2, 10);
    expect(merged.sourceEvents.map(s => s.locationWeight)).toEqual([0.8, 0.2]);
  });

  it('converts lat/lon marginals with cos(latitude)', () => {
    // At 60°S a 0.1° longitude marginal is 111 * 0.1 * 0.5 = 5.55 km, not 11.1 km (and not
    // the old geometric mean). A (0.02° lat -> 2.22 km, 0.1° lon -> 5.55 km): σ = 5.55 km.
    // B: σ = 5.55 km circle. Equal σ -> equal weights.
    const a = ev('a', { latitude: -60, longitude: 170, latitude_uncertainty: 0.02, longitude_uncertainty: 0.1 });
    const b = ev('b', { latitude: -60.1, longitude: 170.1, horizontal_uncertainty: 111 * 0.1 * Math.cos(Math.PI / 3) });
    expect(weightedLocationAverage([a, b]).latitude).toBeCloseTo(-60.05, 8);
  });
});

describe('#27 fixed depths only when no report solved for depth', () => {
  const fixed = ev('fixed', { depth: 5, depth_uncertainty: 0, depth_type: 'operator assigned', used_station_count: 10 });
  const free = ev('free', { depth: 22, depth_uncertainty: 6, depth_type: 'from location', used_station_count: 60, time: '2020-01-01T00:00:01.000Z' });

  it('prefers a free depth to a fixed one reported with zero uncertainty', () => {
    expect(selectBestDepth([fixed, free])).toBe(22);
    expect(selectBestDepth([free, fixed])).toBe(22);
  });

  it('prefers a free depth to an NEIC-style fixed 10 km with a small uncertainty', () => {
    const neic = ev('neic', { depth: 10, depth_uncertainty: 1.9, depth_type: 'operator assigned' });
    const freeDeep = ev('free', { depth: 27, depth_uncertainty: 7.5, depth_type: 'from location' });
    expect(selectBestDepth([neic, freeDeep])).toBe(27);
  });

  it('reads the depth type from a parsed QuakeML origin too', () => {
    const origin = (id: string, depthM: number, uncertaintyM: number, depthType: string) => ({
      publicID: id, depth: { value: depthM, uncertainty: uncertaintyM }, depthType,
    });
    const qFixed = ev('qf', { depth: 12, quakeml: { preferredOriginID: 'o1', origins: [origin('o1', 12000, 0, 'operator assigned')] } });
    const qFree = ev('qr', { depth: 31, quakeml: { preferredOriginID: 'o2', origins: [origin('o2', 31000, 7000, 'from location')] } });
    expect(selectBestDepth([qFixed, qFree])).toBe(31);
  });

  it('uses the fixed depth, with its depth type, when nobody solved for depth', () => {
    const fixedA = ev('fa', { depth: 10, depth_uncertainty: 0, depth_type: 'operator assigned', used_station_count: 12 });
    const fixedB = ev('fb', { depth: 33, depth_type: 'operator assigned', used_station_count: 40, time: '2020-01-01T00:00:01.000Z' });
    const merged = mergeEventGroup([fixedA, fixedB], AVERAGE);
    expect(merged.depth).toBe(33); // more stations; neither uncertainty is a measurement
    expect(merged.depth_type).toBe('operator assigned');
  });

  it('publishes the free depth with its own depth type and uncertainty, and records its source', () => {
    const merged = mergeEventGroup([fixed, free], AVERAGE);
    expect([merged.depth, merged.depth_type, merged.depth_uncertainty]).toEqual([22, 'from location', 6]);
    expect(merged.sourceEvents.find(s => s.depthSelected)?.originalData.id).toBe('free');
  });
});

describe('#25 magnitude selection for the averaged record', () => {
  it('publishes GeoNet\'s ML 3.8 over ISC\'s raw mb 3.26 for a local event', () => {
    // Both are Mw 3.80 on the common scale; the raw mb is 0.54 low. Below M5.5 the local
    // magnitude is the better-calibrated non-Mw scale and short-period mb the poorer.
    const gn = ev('gn', { magnitude: 3.8, magnitude_type: 'ML' });
    const isc = ev('isc', { magnitude: 3.26, magnitude_type: 'mb', time: '2020-01-01T00:00:02.000Z' });
    const merged = mergeEventGroup([gn, isc], AVERAGE);
    expect([merged.magnitude, merged.magnitude_type]).toEqual([3.8, 'ML']);
    // The record says which report the magnitude came from.
    expect(merged.sourceEvents.find(s => s.magnitudeSelected)?.originalData.id).toBe('gn');
  });

  it('never publishes a magnitude its agency rejected', () => {
    const gn = ev('gn', {
      magnitude: 4.2, magnitude_type: 'M', preferred_magnitude_id: 'm1',
      magnitudes: JSON.stringify([
        { publicID: 'm1', type: 'M', mag: { value: 4.2 }, evaluationStatus: 'reviewed' },
        { publicID: 'm2', type: 'ML', mag: { value: 4.2 } },
        { publicID: 'm3', type: 'Mw(mB)', mag: { value: 4.8 }, evaluationStatus: 'rejected' },
      ]),
    });
    const usgs = ev('us', { magnitude: 4.3, magnitude_type: 'mb', time: '2020-01-01T00:00:02.000Z' });
    const merged: any = mergeEventGroup([gn, usgs], AVERAGE);
    expect(merged.magnitude).toBe(4.2);
    expect(merged.magnitude_evaluation_status).not.toBe('rejected');
    // The agency's own preferred measurement wins the tie with the equal-valued ML.
    expect(merged.preferred_magnitude_id).toBe('m1');
    expect(merged.magnitude_type).toBe('M');
  });

  it('treats an agency Mw proxy as a proxy with conversion scatter, below a moment-tensor Mw', () => {
    expect(convertToMw(5.1, 'Mw(mB)')).toMatchObject({ value: 5.1, isExact: false, uncertainty: 0.3 });
    expect(convertToMw(5.1, 'Mwp')).toMatchObject({ isExact: false });
    expect(convertToMw(5.1, 'Mww')).toMatchObject({ isExact: true, uncertainty: 0 });
    const best = selectBestMagnitude([
      ev('proxy', { magnitude: 5.3, magnitude_type: 'Mw(mB)' }),
      ev('mt', { magnitude: 5.1, magnitude_type: 'Mww' }),
    ]);
    expect([best.value, best.type]).toEqual([5.1, 'Mww']);
  });

  it('prefers Ms for a large event, where mb and ML saturate', () => {
    const best = selectBestMagnitude([
      ev('mb', { magnitude: 6.0, magnitude_type: 'mb' }),
      ev('ml', { magnitude: 6.6, magnitude_type: 'ML' }),
      ev('ms', { magnitude: 6.9, magnitude_type: 'Ms' }),
    ]);
    expect([best.value, best.type]).toEqual([6.9, 'Ms']);
  });

  it('stores the selected type with its own metadata on the merged row', () => {
    const gn = ev('gn', { magnitude: 3.8, magnitude_type: 'ML', magnitude_uncertainty: 0.1, magnitude_station_count: 22 });
    const isc = ev('isc', { magnitude: 3.26, magnitude_type: 'mb', magnitude_uncertainty: 0.2, magnitude_station_count: 7, time: '2020-01-01T00:00:02.000Z' });
    const row: any = buildMergedEventFields(mergeEventGroup([gn, isc], AVERAGE), ['magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count']);
    expect([row.magnitude, row.magnitude_type, row.magnitude_uncertainty, row.magnitude_station_count]).toEqual([3.8, 'ML', 0.1, 22]);
  });
});
