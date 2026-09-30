/**
 * The maps load a compact copy of the GNS active-fault layer. The full extract is ~20 MB
 * (pretty-printed, 8-decimal coordinates, 29 attributes per trace) and every catalogue map
 * downloaded and parsed it with faults on by default.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FAULT_DATA_URL } from '@/lib/fault-data';

const dataDir = path.join(process.cwd(), 'public', 'data');
const full = JSON.parse(fs.readFileSync(path.join(dataDir, 'nz-active-faults.geojson'), 'utf8'));
const mapFile = path.join(process.cwd(), 'public', FAULT_DATA_URL);
const compact = JSON.parse(fs.readFileSync(mapFile, 'utf8'));

it('the maps load the compact copy, under 5 MB', () => {
  expect(FAULT_DATA_URL).toBe('/data/nz-active-faults.map.geojson');
  expect(fs.statSync(mapFile).size).toBeLessThan(5_000_000);
});

it('keeps every trace and vertex, within 1 m of the source', () => {
  expect(compact.features).toHaveLength(full.features.length);
  const flatten = (c: any): number[][] => (typeof c[0] === 'number' ? [c] : c.flatMap(flatten));
  for (const index of [0, 1234, full.features.length - 1]) {
    const a = flatten(full.features[index].geometry.coordinates);
    const b = flatten(compact.features[index].geometry.coordinates);
    expect(b).toHaveLength(a.length);
    a.forEach(([lon, lat], i) => {
      expect(Math.abs(b[i][0] - lon)).toBeLessThanOrEqual(5e-6);
      expect(Math.abs(b[i][1] - lat)).toBeLessThanOrEqual(5e-6);
    });
    expect(compact.features[index].properties.name ?? null).toBe(full.features[index].properties.name ?? null);
  }
});
