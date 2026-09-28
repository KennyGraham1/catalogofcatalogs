/** @jest-environment node */
/**
 * #40: a depth outside -5..1000 km is handled the same way on every ingestion path:
 * the depth is set to unknown, the event is kept, and the report says the value was
 * OUT OF RANGE (it said 'Depth must be a number' for a numeric -12 on the CSV/JSON path,
 * and QuakeML/GeoJSON rejected the whole event instead).
 */
import { parseCSV, parseJSON, parseQuakeML } from '@/lib/parsers';
import { parseGeoJSON } from '@/lib/geojson-parser';

const csvWithDepths = (depths: number[]) =>
  ['time,latitude,longitude,depth,magnitude']
    .concat(depths.map((d, i) => `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z,-41,174,${d},4`))
    .join('\n');

const depthFailures = (result: ReturnType<typeof parseCSV>) =>
  (result.validationReport?.failures ?? []).filter((f) => f.field === 'depth');

const quakemlWithDepthMetres = (metres: number) => `<?xml version="1.0"?>
<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">
  <eventParameters publicID="smi:test/ep">
    <event publicID="smi:test/event/1">
      <origin publicID="smi:test/origin/1">
        <time><value>2024-01-01T00:00:00Z</value></time>
        <latitude><value>-41</value></latitude>
        <longitude><value>174</value></longitude>
        <depth><value>${metres}</value></depth>
      </origin>
      <magnitude publicID="smi:test/mag/1"><mag><value>4</value></mag></magnitude>
    </event>
  </eventParameters>
</q:quakeml>`;

const geojsonFeature = (properties: Record<string, unknown>, coordinates: number[] = [174, -41]) => JSON.stringify({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { time: '2024-01-01T00:00:00Z', mag: 4, ...properties } }],
});

describe('#40: out-of-range depths are nulled, reported accurately, and the event kept', () => {
  it('CSV: the value is reported as out of range, not as "must be a number"', () => {
    const result = parseCSV(csvWithDepths([5, -12, 1200]));
    expect(result.events.map((e) => e.depth)).toEqual([5, null, null]);
    const failures = depthFailures(result);
    expect(failures.map((f) => f.category)).toEqual(['out_of_range', 'out_of_range']);
    expect(failures.map((f) => f.value)).toEqual([-12, 1200]);
    expect(failures.every((f) => /outside -5 to 1000 km/.test(f.message))).toBe(true);
    expect(failures.some((f) => f.message === 'Depth must be a number')).toBe(false);
    expect(result.warnings.some((w) => /2 depth value\(s\) outside -5 to 1000 km/.test(w.message))).toBe(true);
    expect(result.fileDecisions.outOfRangeDepths).toBe(2);
  });

  it('a genuinely non-numeric depth is still "must be a number"', () => {
    const result = parseCSV(csvWithDepths([5]).replace(',5,4', ',deep,4'));
    expect(result.events[0].depth).toBeNull();
    expect(depthFailures(result).map((f) => [f.category, f.message])).toEqual([['invalid_type', 'Depth must be a number']]);
  });

  it('JSON behaves the same way', () => {
    const json = JSON.stringify([5, -12, 1200].map((depth) => ({ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 4, depth })));
    const result = parseJSON(json);
    expect(result.events.map((e) => e.depth)).toEqual([5, null, null]);
    expect(depthFailures(result).map((f) => f.category)).toEqual(['out_of_range', 'out_of_range']);
  });

  it('QuakeML keeps the event with an unknown depth instead of rejecting it', () => {
    for (const metres of [1200000, -12000]) {
      const result = parseQuakeML(quakemlWithDepthMetres(metres));
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].depth).toBeNull();
      expect(depthFailures(result).map((f) => f.category)).toEqual(['out_of_range']);
      expect(result.fileDecisions.outOfRangeDepths).toBe(1);
    }
    // In range: unchanged.
    expect(parseQuakeML(quakemlWithDepthMetres(15110)).events[0].depth).toBeCloseTo(15.11, 10);
  });

  it('GeoJSON keeps the event with an unknown depth, from a property or the third coordinate', () => {
    const fromProperty = parseGeoJSON(geojsonFeature({ depth: 1200 }));
    expect(fromProperty.events).toHaveLength(1);
    expect(fromProperty.events[0].depth).toBeNull();
    expect(depthFailures(fromProperty).map((f) => f.category)).toEqual(['out_of_range']);

    // RFC 7946 elevation of -1,200,000 m is a 1200 km depth.
    const fromCoordinate = parseGeoJSON(geojsonFeature({}, [174, -41, -1200000]));
    expect(fromCoordinate.events).toHaveLength(1);
    expect(fromCoordinate.events[0].depth).toBeNull();
    expect(fromCoordinate.warnings.some((w) => /outside -5 to 1000 km/.test(w.message))).toBe(true);
  });

  it('a negative-down catalogue is called out rather than silently losing its depths', () => {
    const result = parseCSV(csvWithDepths([-2, -4, -8, -12, -20, -35]));
    expect(result.events.map((e) => e.depth)).toEqual([-2, -4, null, null, null, null]);
    expect(result.warnings.some((w) => /negative downward/.test(w.message))).toBe(true);
  });
});
