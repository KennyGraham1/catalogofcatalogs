/** @jest-environment node */

// Event association in the merge engine.

import { groupMatchingEvents, mergeEventGroup, buildMergedEventFields } from '@/lib/merge';

const config: any = { timeThreshold: 30, distanceThreshold: 30, depthThreshold: 50, mergeStrategy: 'quality', priority: 'quality' };
const ev = (id: string, sec = 0, extra: Record<string, unknown> = {}) => ({
  id, time: new Date(Date.UTC(2024, 0, 1) + sec * 1000).toISOString(),
  latitude: 0, longitude: 0, depth: 10, magnitude: 3, source: id, catalogueId: id, ...extra,
});
const ids = (evs: any[]) => groupMatchingEvents(evs, config).map((g) => g.events.map((e: any) => e.id).sort());

describe('groupMatchingEvents association residue', () => {
  it('an unrelated earlier candidate cannot break the scan before a later valid one', () => {
    // A(M5.4,t0) and C(M5.6,t18s) merge on their own. B at t16s is 44 km away and
    // unrelated. The old loop broke on B because B's pair window (M<5.5 tier) was
    // narrower than C's, so C was never examined.
    const A = ev('A', 0, { magnitude: 5.4 });
    const B = ev('B', 16, { magnitude: 3, latitude: 0.4 }); // ~44 km north
    const C = ev('C', 18, { magnitude: 5.6 });
    expect(ids([A, C])).toEqual([['A', 'C']]);
    expect(ids([A, B, C])).toEqual(expect.arrayContaining([['A', 'C'], ['B']]));
  });

  it('a rejected provisional group does not consume a later valid partner', () => {
    // WRONG(M3,t0) provisionally groups with TRUE1(M5,t1) and fails the magnitude gate.
    // TRUE1 must remain available for TRUE2(M5,t16), its real duplicate.
    const wrong = ev('WRONG', 0, { magnitude: 3 });
    const true1 = ev('TRUE1', 1, { magnitude: 5 });
    const true2 = ev('TRUE2', 16, { magnitude: 5 });
    expect(ids([true1, true2])).toEqual([['TRUE1', 'TRUE2']]);
    expect(ids([wrong, true1, true2])).toEqual(expect.arrayContaining([['TRUE1', 'TRUE2'], ['WRONG']]));
  });

  it('two agencies sharing a raw source_id do not collide in the merged catalogue', () => {
    // GeoNet "123" and ISC "123" are different earthquakes a month apart. Under one
    // merged catalogue_id the raw id collided on the (catalogue_id, source_id) unique
    // index and the second insert was silently skipped. The merged id is agency-qualified.
    const geonet: any = { id: 'g', source_id: '123', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4, source: 'GeoNet', catalogueId: 'GeoNet' };
    const isc: any = { id: 'i', source_id: '123', time: '2024-02-01T00:00:00Z', latitude: -38, longitude: 176, depth: 30, magnitude: 5, source: 'ISC', catalogueId: 'ISC' };
    const merged = groupMatchingEvents([geonet, isc], config).map((g) => mergeEventGroup(g.events, config));
    const rows = merged.map((e) => buildMergedEventFields(e, ['source_id']));
    expect(rows.map((r) => r.source_id).sort()).toEqual(['GeoNet:123', 'ISC:123']);
    // Idempotent on re-merge: an already-qualified id is not prefixed again.
    const again = buildMergedEventFields({ ...merged[0], source_id: rows[0].source_id } as any, ['source_id']);
    expect(again.source_id).toBe(rows[0].source_id);
  });

  it('grouping a national-scale catalogue neither throws nor goes quadratic', () => {
    let s = 7; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const big = Array.from({ length: 60_000 }, (_, i) => ({
      id: 'e' + i, time: new Date(Date.UTC(2015, 0, 1) + r() * 315e9).toISOString(),
      latitude: -47 + r() * 13, longitude: 166 + r() * 13, depth: r() * 100,
      magnitude: 1 + r() * 4, source: 'A', catalogueId: 'A',
    }));
    const t0 = Date.now();
    expect(() => groupMatchingEvents(big, config)).not.toThrow();
    // Was 16 s at 20k on the previous gather and unbounded at 150k; the time-sliced
    // gather does 150k in ~37 s. 60k must clear well inside a minute.
    expect(Date.now() - t0).toBeLessThan(60_000);
  });
});
