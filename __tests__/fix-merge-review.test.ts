/** @jest-environment node */

/**
 * Follow-up fixes from the independent review of the merge engine (cluster B1):
 *  1. Depth metadata came from whichever higher-quality report stated the same depth value,
 *     so a free 10 km ± 2 depth was published as another agency's "operator assigned", ± 0.
 *  2. The size-dependent magnitude preference switched to raw Ms at M5.5, where Ms still
 *     under-reads Mw (Scordilis: Mw = 0.67 Ms + 2.07 below Ms 6.2) — a low bias of up to
 *     0.3 between M5.5 and M6.2, and a published value that dropped when an input rose.
 *  3. A zero uncertainty in a higher-precedence column hid the positive ones below it.
 *  4. A supplementary `origins` blob borrowed from another report dated the published
 *     solution with that report's creation time on re-merge.
 *  5. Equally authoritative sources were separated by an absolute quality score.
 *  6. A request listing the same source catalogue twice was accepted.
 * Expected values follow from the stated inputs and the module's published relations.
 */

import {
  mergeEventGroup,
  buildMergedEventFields,
  selectBestMagnitude,
  convertToMw,
  locationAverage,
  determinationTime,
  mergeByPriority,
} from '@/lib/merge';
import { validateMergeRequest } from '@/lib/validation';

const report = (id: string, catalogue: string, extra: Record<string, unknown> = {}): any => ({
  id, catalogueId: catalogue, source: catalogue, time: '2020-01-01T00:00:00.000Z',
  latitude: -42, longitude: 173, depth: 10, magnitude: 4, magnitude_type: 'ML', ...extra,
});

describe('1. depth metadata comes only from the report the depth was published from', () => {
  // GeoNet solved for 10 km ± 2; ISC fixed its depth at 10 km (operator assigned, ± 0) and
  // has far more quality metadata.
  const geonet = report('gx', 'geonet', {
    source: 'GeoNet', agency_id: 'WEL', depth_type: 'from location', depth_uncertainty: 2, horizontal_uncertainty: 1.5,
    magnitude: 4.1,
  });
  const isc = report('iy', 'isc', {
    source: 'ISC', agency_id: 'ISC', time: '2020-01-01T00:00:01.000Z', latitude: -42.02, longitude: 173.02,
    depth_type: 'operator assigned', depth_uncertainty: 0, horizontal_uncertainty: 4, magnitude: 4.0, magnitude_type: 'mb',
    used_station_count: 120, azimuthal_gap: 60, standard_error: 0.9, evaluation_status: 'reviewed',
  });
  const DEPTH = ['depth_type', 'depth_uncertainty'];

  it('an averaged record carries the free depth\'s own type and uncertainty', () => {
    const merged = mergeEventGroup([geonet, isc], { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'average', priority: 'quality' } as any);
    const row: any = buildMergedEventFields(merged, DEPTH);
    expect([row.depth, row.depth_type, row.depth_uncertainty]).toEqual([10, 'from location', 2]);
    expect(merged.sourceEvents.filter(s => s.depthSelected).map(s => s.originalData.id)).toEqual(['gx']);
  });

  it('a published report without a depth type does not borrow one from another agency', () => {
    const bare = { ...geonet, depth_type: undefined, depth_uncertainty: undefined };
    const row: any = buildMergedEventFields(
      mergeEventGroup([bare, isc], { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'geonet' } as any),
      DEPTH
    );
    expect([row.depth, row.depth_type, row.depth_uncertainty]).toEqual([10, null, null]);
  });
});

describe('2. magnitude preference: Ms only where it reads Mw (from M6.2)', () => {
  // Reports consistent with the module's own relations: ML = Mw; mb from Mw = 0.85 mb + 1.03;
  // Ms from Mw = 0.67 Ms + 2.07 (Ms < 6.2) or Mw = 0.99 Ms + 0.08 (Ms >= 6.2).
  const msFor = (mw: number) => {
    const low = (mw - 2.07) / 0.67;
    return low < 6.2 ? low : (mw - 0.08) / 0.99;
  };
  const publishedFor = (mw: number, types: Array<'ML' | 'mb' | 'Ms'>) => {
    const value = { ML: mw, mb: (mw - 1.03) / 0.85, Ms: msFor(mw) };
    const round = (v: number) => Math.round(v * 1000) / 1000;
    return selectBestMagnitude(types.map((type, i) => report(`r${i}`, `c${i}`, { magnitude: round(value[type]), magnitude_type: type })));
  };

  it('never publishes a value more than 0.1 below Mw between M5.0 and M7.0 (ML, mb and Ms reported)', () => {
    for (let mw = 5.0; mw <= 7.0 + 1e-9; mw += 0.01) {
      const best = publishedFor(mw, ['ML', 'mb', 'Ms']);
      expect(best.value - mw).toBeGreaterThanOrEqual(-0.1);
      expect(best.value - mw).toBeLessThanOrEqual(0.1);
    }
  });

  it('publishes ML below M6.2 and Ms from M6.2, with no large step where the choice changes', () => {
    let previous: number | null = null;
    for (let mw = 5.0; mw <= 7.0 + 1e-9; mw += 0.01) {
      const best = publishedFor(mw, ['ML', 'Ms']);
      expect(best.type).toBe(mw < 6.2 - 1e-9 ? 'ML' : 'Ms');
      if (previous !== null) {
        // A 0.01 step in true size never moves the published magnitude by more than 0.05.
        expect(Math.abs(best.value - previous)).toBeLessThanOrEqual(0.05);
      }
      previous = best.value;
    }
  });

  it('does not drop the published magnitude when a report\'s magnitude rises (M5.6 example)', () => {
    const pick = (ms: number) => selectBestMagnitude([
      report('a', 'geonet', { magnitude: 5.6, magnitude_type: 'M' }),
      report('b', 'isc-mb', { magnitude: 5.2, magnitude_type: 'mb' }),
      report('c', 'isc-ms', { magnitude: ms, magnitude_type: 'Ms' }),
    ]);
    expect([pick(5.1).value, pick(5.1).type]).toEqual([5.6, 'M']);
    expect([pick(5.2).value, pick(5.2).type]).toEqual([5.6, 'M']);
  });

  it('ranks an unparenthesised proxy spelling (Mw_mB) below a moment-tensor Mw', () => {
    expect(convertToMw(5.4, 'Mw_mB')).toMatchObject({ isExact: false, uncertainty: 0.3 });
    expect(convertToMw(5.4, 'Mwb')).toMatchObject({ isExact: true }); // body-wave moment-tensor Mw
    const best = selectBestMagnitude([
      report('proxy', 'a', { magnitude: 5.4, magnitude_type: 'Mw_mB', magnitude_uncertainty: 0.1 }),
      report('mt', 'b', { magnitude: 5.9, magnitude_type: 'Mww', magnitude_uncertainty: 0.2 }),
    ]);
    expect([best.value, best.type]).toEqual([5.9, 'Mww']);
  });
});

describe('3. a zero uncertainty does not hide a stated one', () => {
  const documented = [
    report('s1', 'c1', { latitude: -42.0, horizontal_uncertainty: 1 }),
    report('s2', 'c2', { latitude: -42.1, horizontal_uncertainty: 3 }),
  ];

  it('falls through a zero radius to the lat/lon marginals', () => {
    // 0.02° marginals at 42°S: max(2.22, 1.65) km = 2.22 km.
    const zeroRadius = report('z', 'c3', { latitude: -42.2, horizontal_uncertainty: 0, latitude_uncertainty: 0.02, longitude_uncertainty: 0.02 });
    const avg = locationAverage([...documented, zeroRadius]);
    expect(avg.inverseVariance).toBe(true);
    const w = [1, 1 / 9, 1 / (2.22 * 2.22)];
    const total = w.reduce((a, b) => a + b, 0);
    expect(avg.weights.map(x => +x.toFixed(4))).toEqual(w.map(x => +(x / total).toFixed(4)));
  });

  it('falls through a zero ellipse axis to the circular radius', () => {
    const zeroAxis = report('e', 'c3', { latitude: -42.2, max_horizontal_uncertainty: 0, horizontal_uncertainty: 2 });
    const avg = locationAverage([documented[0], zeroAxis]);
    expect(avg.inverseVariance).toBe(true);
    expect(avg.weights.map(x => +x.toFixed(4))).toEqual([0.8, 0.2]); // 1/1 : 1/4
  });
});

describe('4. a borrowed origins blob does not date the published solution', () => {
  // Stage 1: "GeoNet > Others" publishes GeoNet's CSV solution (no blobs); ISC's QuakeML origin
  // (computed 2023-05-01) is kept on the merged row as a supplementary origin.
  const geonet = report('S', 'geonet-csv', { source: 'GeoNet', agency_id: 'WEL', depth: 12, magnitude: 4.1 });
  const isc = report('D', 'isc', {
    source: 'ISC', agency_id: 'ISC', time: '2020-01-01T00:00:01.000Z', latitude: -42.03, longitude: 173.02, depth: 15,
    magnitude: 3.9, magnitude_type: 'mb', preferred_origin_id: 'smi:ISC/origid=1',
    origins: JSON.stringify([{
      publicID: 'smi:ISC/origid=1', time: { value: '2020-01-01T00:00:01Z' }, latitude: { value: -42.03 }, longitude: { value: 173.02 },
      creationInfo: { agencyID: 'ISC', creationTime: '2023-05-01T00:00:00Z' },
    }]),
  });
  const stageOne = () => {
    const merged = mergeEventGroup([geonet, isc], { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'geonet' } as any);
    return { id: 'R', catalogueId: 'merged-1', source: 'Merged', ...buildMergedEventFields(merged, ['origins', 'preferred_origin_id', 'creation_info', 'agency_id']) } as any;
  };

  it('the merged row states no determination time of its own', () => {
    const row = stageOne();
    expect(JSON.parse(row.origins)[0].creationInfo.agencyID).toBe('ISC'); // the supplementary blob is kept
    expect(determinationTime(row)).toBeNull();
  });

  it('still dates a single agency\'s row from its own lone origin', () => {
    const own = report('q', 'isc', {
      origins: JSON.stringify([{ publicID: 'o', latitude: { value: -42.001 }, creationInfo: { creationTime: '2021-02-03T00:00:00Z' } }]),
      source_events: JSON.stringify([{ source: 'upload' }]),
    });
    expect(determinationTime(own)).toBe(Date.parse('2021-02-03T00:00:00Z'));
  });

  it('dates a row from the origin with its own time and epicentre when none is marked preferred', () => {
    const row = report('h', 'isc', {
      source_events: JSON.stringify([{ source: 'A' }, { source: 'B' }]),
      origins: JSON.stringify([
        { publicID: 'other', time: { value: '2020-01-01T00:00:03Z' }, latitude: { value: -42.1 }, longitude: { value: 173.1 }, creationInfo: { creationTime: '2025-01-01T00:00:00Z' } },
        { publicID: 'own', time: { value: '2020-01-01T00:00:00Z' }, latitude: { value: -42 }, longitude: { value: 173 }, creationInfo: { creationTime: '2021-01-01T00:00:00Z' } },
      ]),
    });
    expect(determinationTime(row)).toBe(Date.parse('2021-01-01T00:00:00Z'));
  });
});

describe('5. equally authoritative sources are compared on the metrics both state', () => {
  it('breaks an authority tie the way the quality strategy does', () => {
    // Tonga (outside NZ); two ISC-family catalogues, no GeoNet report. The ISC-GEM row states
    // no quality metric, so nothing about the solutions can be compared: populated fields,
    // then record order decide, as in the quality strategy.
    const gem = report('gem', 'iscgem', { source: 'ISC-GEM', latitude: -20, longitude: -174, depth: 30, magnitude: 6.1, magnitude_type: 'Mw' });
    const bulletin = report('bul', 'isc', {
      source: 'ISC Bulletin', agency_id: 'ISC', time: '2020-01-01T00:00:02.000Z', latitude: -20.05, longitude: -174.02, depth: 35,
      magnitude: 5.8, magnitude_type: 'mb', used_station_count: 300, azimuthal_gap: 40, standard_error: 1.1, evaluation_status: 'reviewed',
    });
    const quality = mergeEventGroup([gem, bulletin], { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' } as any);
    expect(mergeByPriority([gem, bulletin], 'geonet').id).toBe(quality.id);
    expect(mergeByPriority([bulletin, gem], 'authority').id).toBe(quality.id);
  });
});

describe('6. each source catalogue is merged once', () => {
  it('rejects a request that lists a catalogue twice', () => {
    const result = validateMergeRequest({
      name: 'x',
      sourceCatalogues: [
        { id: 'a', name: 'A', events: 1, source: 'A' },
        { id: 'a', name: 'A', events: 1, source: 'A' },
      ],
      config: { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'geonet' },
    });
    expect(result.success).toBe(false);
    expect(result.errors!.issues.map(i => [i.path.join('.'), i.message])).toEqual([
      ['sourceCatalogues.1.id', 'source catalogue "a" is listed more than once'],
    ]);
  });
});
