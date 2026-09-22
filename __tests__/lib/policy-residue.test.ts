/** @jest-environment node */

// Scientific and data conventions decided for the platform:
// and the H1/H2 handoffs.

import { reasenbergDeclustering } from '@/lib/seismological-analysis';
import { groupMatchingEvents, convertToMw } from '@/lib/merge';
import { parseCSV } from '@/lib/parsers';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { eventsToCSV } from '@/lib/exporters';
import { eventsToQuakeMLDocument } from '@/lib/quakeml-exporter';

const ev = (id: string, day: number, magnitude: number, lon = 0, depth = 10): any =>
  ({ id, time: new Date(Date.UTC(2020, 0, 1) + day * 86400000).toISOString(), latitude: 0, longitude: lon, depth, magnitude });

it('Reasenberg tests hypocentral distance, so a 600 km deeper event is not linked', () => {
  const r = reasenbergDeclustering([ev('A', 0, 5, 0, 10), ev('B', 0.5, 4, 0, 610)]);
  expect(r.mainshocks.map((e) => e.id).sort()).toEqual(['A', 'B']);
  // Same epicentres at the same depth still link.
  expect(reasenbergDeclustering([ev('A', 0, 5, 0, 10), ev('B', 0.5, 4, 0, 12)]).mainshocks).toHaveLength(1);
});

it('grouping of an equal-time chain does not depend on input order', () => {
  const cfg: any = { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };
  const m = (id: string, lon: number) => ({ id, time: '2024-01-01T00:00:00.000Z', latitude: 0, longitude: lon, depth: 10, magnitude: 3, source: id, catalogueId: id });
  const L = m('L', 0), M = m('M', 0.07), R = m('R', 0.14);
  const ids = (evs: any[]) => groupMatchingEvents(evs, cfg).map((g) => g.events.map((e: any) => e.id).sort()).sort();
  expect(ids([L, M, R])).toEqual(ids([M, L, R]));
  expect(ids([R, M, L])).toEqual(ids([L, M, R]));
});

it('Ms outside the Scordilis calibration range is an extrapolation with a wider error', () => {
  expect(convertToMw(1, 'Ms')).toMatchObject({ uncertainty: 0.5, method: expect.stringMatching(/EXTRAPOLATED/) });
  expect(convertToMw(5, 'Ms')).toMatchObject({ uncertainty: 0.2 });
});

it('a numeric field with trailing text is rejected, not truncated', () => {
  const r = parseCSV('time,latitude,longitude,magnitude\n2024-01-01T00:00:00Z,-41,174,4.1garbage', ',', 'International');
  expect(r.success).toBe(false);
  expect(r.errors[0].message).toMatch(/Magnitude must be a number/);
  const ok = parseCSV('time,latitude,longitude,magnitude\n2024-01-01T00:00:00Z,-41,174, 4.1 ', ',', 'International');
  expect(ok.events[0].magnitude).toBe(4.1);
});

it('a self-identified USGS feature is read in km without the convention warning', () => {
  const usgs = { type: 'Feature', id: 'us1', geometry: { type: 'Point', coordinates: [174.8, -41.3, 12.5] }, properties: { time: 1704067200000, mag: 3, net: 'us', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us1' } };
  const r = parseGeoJSON(JSON.stringify(usgs));
  expect(r.events[0].depth).toBe(12.5);
  expect(r.warnings.some((w) => /Third coordinate/.test(w.message))).toBe(false);
});

it('H1: a value that already begins with a guarded formula round-trips through CSV', () => {
  const base: any = { id: 'e1', catalogue_id: 'c', source_id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 3, source_events: '[]', region: "'=literal" };
  const r = parseCSV(eventsToCSV([base]));
  expect((r.events[0] as any).region).toBe("'=literal");
});

it('H2: the merge configuration is carried in the QuakeML document', () => {
  const base: any = { id: 'e1', catalogue_id: 'c', source_id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 3, source_events: '[]' };
  const xml = eventsToQuakeMLDocument([base], 'Audit', { mergeConfig: { strategy: 'average', timeThreshold: 7.5 } } as any);
  expect(xml).toContain('Merge Config: {&quot;strategy&quot;:&quot;average&quot;,&quot;timeThreshold&quot;:7.5}');
});
