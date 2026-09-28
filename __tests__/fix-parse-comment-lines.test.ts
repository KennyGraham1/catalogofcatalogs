/** @jest-environment node */
/**
 * #42: a leading block of '#' comment lines is not the CSV header. The platform's own
 * export with metadata=comments, and bulletin CSVs that open with a comment block,
 * imported zero events; FDSN event text, whose header line is itself '#'-prefixed,
 * must keep working.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCSV, parseCSVStream } from '@/lib/parsers';
import { detectDelimiter } from '@/lib/delimiter-detector';
import { eventsToCSV } from '@/lib/exporters';

const FDSN_HEADER =
  '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName';
const FDSN_ROW =
  '2016p858000|2016-11-13T11:02:56.346Z|-42.6925|173.0197|15.11|WEL(GNS_Primary)|GeoNet||2016p858000|MLv|7.8|WEL(GNS_Primary)|20 km SE of Hanmer Springs';

describe('#42: leading comment lines are skipped', () => {
  it('a "# Label: value" prologue before the header', () => {
    const result = parseCSV('# Catalogue: Test\n# Events: 1\ntime,latitude,longitude,depth,magnitude\n2024-01-01T00:00:00Z,-41,174,5,4');
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.detectedFields).toEqual(['time', 'latitude', 'longitude', 'depth', 'magnitude']);
  });

  it('reports the physical line of a bad row after the prologue', () => {
    const result = parseCSV('# Catalogue: Test\n#\ntime,latitude,longitude,depth,magnitude\n2024-01-01T00:00:00Z,-41,174,5,4\n2024-01-02T00:00:00Z,-41,174');
    expect(result.errors).toEqual([{ line: 5, message: 'Column count mismatch: expected 5, got 3' }]);
  });

  it('the delimiter is detected from the table, not the prose', () => {
    const content = '# Catalogue: Test\n# Events: 1\ntime,latitude,longitude,depth,magnitude\n2024-01-01T00:00:00Z,-41,174,5,4';
    expect(detectDelimiter(content).delimiter).toBe(',');
  });

  it('this platform\'s own CSV export with metadata comments re-imports', () => {
    const rows: any[] = [
      { id: 'a1', catalogue_id: 'c1', time: '2024-01-01T00:00:00.000Z', latitude: -41.3, longitude: 174.8, depth: 12, magnitude: 4.2, magnitude_type: 'ML', source_events: '[]', created_at: '2024-01-02T00:00:00Z' },
      { id: 'a2', catalogue_id: 'c1', time: '2024-01-03T00:00:00.000Z', latitude: -42.1, longitude: 173.9, depth: 20, magnitude: 5.0, magnitude_type: 'Mw', source_events: '[]', created_at: '2024-01-04T00:00:00Z' },
    ];
    const exported = eventsToCSV(rows, { catalogueName: 'Round trip, with a comma' } as any, { metadataComments: true });
    expect(exported.startsWith('#')).toBe(true);
    const result = parseCSV(exported);
    expect(result.success).toBe(true);
    expect(result.events.map((e) => [e.latitude, e.longitude, e.depth, e.magnitude])).toEqual([
      [-41.3, 174.8, 12, 4.2],
      [-42.1, 173.9, 20, 5.0],
    ]);
  });

  it('FDSN event text: the #-prefixed header after a comment line is the header', () => {
    for (const text of [`${FDSN_HEADER}\n${FDSN_ROW}`, `# Query complete\n${FDSN_HEADER}\n${FDSN_ROW}`]) {
      const result = parseCSV(text);
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('2016p858000');
      expect(result.events[0].magnitude).toBe(7.8);
    }
  });

  it('an ISC-GEM style comment block whose last line is the commented header', () => {
    const text = [
      '# ISC-GEM Global Instrumental Earthquake Catalogue',
      '# Version 10.0',
      '#   date                 ,   lat   ,    lon   , depth  ,  mw  ,  eventid',
      ' 1904-04-04 10:02:34.56 ,  41.802 ,   23.108 ,  15.0  , 7.04 ,   16957879',
    ].join('\n');
    const result = parseCSV(text);
    expect(result.success).toBe(true);
    expect(result.events[0]).toMatchObject({ time: '1904-04-04T10:02:34.560Z', latitude: 41.802, longitude: 23.108, depth: 15, magnitude: 7.04 });
  });

  it('the streaming CSV parser skips the prologue as well', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-parse-csv-'));
    try {
      const prologue = path.join(dir, 'prologue.csv');
      fs.writeFileSync(prologue, '# Catalogue: Test\n#\ntime,latitude,longitude,depth,magnitude\n2024-01-01T00:00:00Z,-41,174,5,4\n');
      const seen: any[] = [];
      const result = await parseCSVStream(prologue, (event) => { seen.push(event); });
      expect(result.errors).toEqual([]);
      expect(seen).toHaveLength(1);

      const fdsn = path.join(dir, 'fdsn.txt');
      fs.writeFileSync(fdsn, `# Query complete\n${FDSN_HEADER}\n${FDSN_ROW}\n`);
      const fdsnSeen: any[] = [];
      const fdsnResult = await parseCSVStream(fdsn, (event) => { fdsnSeen.push(event); });
      expect(fdsnResult.errors).toEqual([]);
      expect(fdsnSeen.map((e) => e.id)).toEqual(['2016p858000']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
