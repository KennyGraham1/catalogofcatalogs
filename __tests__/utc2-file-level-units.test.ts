/**
 * Regression tests for the two "one file, two unit systems" defects fixed in cluster utc2:
 *
 *  1. parseJSONStream took neither the file-level depth-unit decision nor the file's date
 *     format, so an NDJSON catalogue in metres was rejected/nulled record by record while
 *     the identical content as a JSON array was converted, and DD/MM/YYYY strings were
 *     re-read by V8 as MM/DD/YYYY.
 *  2. inferMomentTensorScale decided the dyne.cm -> N.m conversion PER ROW and only for
 *     rows carrying a scalar moment Mo, so a GeoNet CMT file with some Mo blank stored
 *     some tensors in N.m and the rest 1e13 too small.
 *
 * Every expected number below is derived by hand: 1 dyne.cm = 1e-7 N.m, and GeoNet's CMT
 * components are on a 1e20 dyne.cm scale, so a component multiplies by 1e20 * 1e-7 = 1e13
 * and Mo multiplies by 1e-7.
 */
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { parseJSONStream, parseCSV, parseJSON } from '@/lib/parsers';

const writeNdjson = (records: object[]): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'utc2-ndjson-'));
  const file = path.join(dir, 'catalogue.ndjson');
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  return file;
};

describe('parseJSONStream decides depth unit once per file', () => {
  it('converts an NDJSON catalogue reported in metres, as parseJSON does', async () => {
    // 95th percentile of [3500, 12000, 40000] is 12000, which is impossible in km, so the
    // column is metres and every value is divided by 1000 - including the 3500 m row that
    // a per-row ">1000 means metres" rule would have left as 3500 "km".
    const file = writeNdjson([
      { time: '2016-11-13T11:02:56Z', latitude: -42.737, longitude: 173.054, magnitude: 7.8, depth: 40000 },
      { time: '2016-11-13T11:32:10Z', latitude: -42.5, longitude: 173.4, magnitude: 6.0, depth: 12000 },
      { time: '2016-11-13T12:00:00Z', latitude: -42.4, longitude: 173.6, magnitude: 4.1, depth: 3500 },
    ]);

    const seen: any[] = [];
    const result = await parseJSONStream(file, (event) => { seen.push(event); });

    expect(result.errors).toEqual([]);
    expect(seen.map((e) => e.depth)).toEqual([40, 12, 3.5]);
    expect(result.warnings.some((w) => /metres/.test(w.message))).toBe(true);
  });

  it('leaves a kilometre catalogue alone', async () => {
    const file = writeNdjson([
      { time: '2016-11-13T11:02:56Z', latitude: -42.737, longitude: 173.054, magnitude: 7.8, depth: 15.1 },
      { time: '2016-11-13T11:32:10Z', latitude: -42.5, longitude: 173.4, magnitude: 6.0, depth: 8.4 },
    ]);

    const seen: any[] = [];
    const result = await parseJSONStream(file, (event) => { seen.push(event); });

    expect(result.errors).toEqual([]);
    expect(seen.map((e) => e.depth)).toEqual([15.1, 8.4]);
    expect(result.warnings.some((w) => /metres/.test(w.message))).toBe(false);
  });

  it('reads DD/MM/YYYY with the format detected for the file, not V8 defaults', async () => {
    // "13/11/2016" can only be DD/MM, which fixes the file's format; "03/04/2016" is then
    // 3 April 2016. Left to `new Date()` it becomes 4 March 2016 in the host's timezone.
    const file = writeNdjson([
      { time: '13/11/2016 11:02:56', latitude: -42.737, longitude: 173.054, magnitude: 7.8, depth: 15.1 },
      { time: '03/04/2016 05:06:07', latitude: -42.5, longitude: 173.4, magnitude: 6.0, depth: 8.4 },
    ]);

    const seen: any[] = [];
    await parseJSONStream(file, (event) => { seen.push(event); });

    expect(seen).toHaveLength(2);
    const ambiguous = new Date(seen[1].time);
    expect(ambiguous.getUTCFullYear()).toBe(2016);
    expect(ambiguous.getUTCMonth()).toBe(3); // April, 0-based - not 2 (March)
    expect(ambiguous.getUTCDate()).toBe(3);
    expect(ambiguous.getUTCHours()).toBe(5);
  });

  it('honours an explicitly supplied date format', async () => {
    const file = writeNdjson([
      { time: '03/04/2016 05:06:07', latitude: -42.5, longitude: 173.4, magnitude: 6.0, depth: 8.4 },
    ]);

    const seen: any[] = [];
    await parseJSONStream(file, (event) => { seen.push(event); }, undefined, 100, 'US');

    const parsed = new Date(seen[0].time);
    expect(parsed.getUTCMonth()).toBe(2); // March, from MM/DD/YYYY
    expect(parsed.getUTCDate()).toBe(4);
  });
});

describe('moment-tensor scale is decided once per file', () => {
  // Components on the GeoNet 1e20 dyne.cm scale; max|Mij| = 4.0, and Mo = 4.0e20 dyne.cm
  // gives Mo/max|Mij| = 1e20, the CGS signature. The second row omits Mo entirely.
  const CMT_HEADER = 'time,latitude,longitude,magnitude,depth,Mxx,Mxy,Mxz,Myy,Myz,Mzz,Mo';
  const CMT_ROWS = [
    '2016-11-13T11:02:56Z,-42.737,173.054,7.8,15.1,-3.0,1.0,2.0,4.0,-1.0,-1.0,4.0e20',
    '2016-11-13T11:32:10Z,-42.5,173.4,6.0,8.4,-3.0,1.0,2.0,4.0,-1.0,-1.0,',
  ];

  // Mrr=Mzz, Mtt=Mxx, Mpp=Myy, Mrt=Mxz, Mrp=-Myz, Mtp=-Mxy, each times 1e13.
  const EXPECTED_TENSOR = {
    Mrr: -1e13,
    Mtt: -3e13,
    Mpp: 4e13,
    Mrt: 2e13,
    Mrp: 1e13,
    Mtp: -1e13,
  };

  const tensorOf = (event: any) => {
    const fm = JSON.parse(event.focal_mechanisms as string)[0];
    const t = fm.momentTensor.tensor;
    return {
      Mrr: t.Mrr.value, Mtt: t.Mtt.value, Mpp: t.Mpp.value,
      Mrt: t.Mrt.value, Mrp: t.Mrp.value, Mtp: t.Mtp.value,
    };
  };

  it('parseCSV converts the Mo-less row with the rest of the file', () => {
    const result = parseCSV([CMT_HEADER, ...CMT_ROWS].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(2);
    expect(tensorOf(result.events[0])).toEqual(EXPECTED_TENSOR);
    // Before the fix this row kept raw 1e20 dyne.cm values - 1e13 times too small.
    expect(tensorOf(result.events[1])).toEqual(EXPECTED_TENSOR);

    const withMo = JSON.parse(result.events[0].focal_mechanisms as string)[0];
    expect(withMo.momentTensor.scalarMoment.value).toBeCloseTo(4.0e13, 0); // 4.0e20 dyne.cm
  });

  it('parseJSON makes the same decision for the same content as an array', () => {
    const rows = [
      { time: '2016-11-13T11:02:56Z', latitude: -42.737, longitude: 173.054, magnitude: 7.8, depth: 15.1,
        Mxx: -3.0, Mxy: 1.0, Mxz: 2.0, Myy: 4.0, Myz: -1.0, Mzz: -1.0, Mo: 4.0e20 },
      { time: '2016-11-13T11:32:10Z', latitude: -42.5, longitude: 173.4, magnitude: 6.0, depth: 8.4,
        Mxx: -3.0, Mxy: 1.0, Mxz: 2.0, Myy: 4.0, Myz: -1.0, Mzz: -1.0 },
    ];
    const result = parseJSON(JSON.stringify(rows));

    expect(result.errors).toEqual([]);
    expect(tensorOf(result.events[0])).toEqual(EXPECTED_TENSOR);
    expect(tensorOf(result.events[1])).toEqual(EXPECTED_TENSOR);
  });

  it('leaves a file already in N.m untouched', () => {
    // Mo/max|Mij| = 3.5e18 / 2.0e18 = 1.75, nowhere near 1e20, so no conversion.
    const csv = [
      CMT_HEADER,
      '2016-11-13T11:02:56Z,-42.737,173.054,7.8,15.1,-1.0e18,5.0e17,1.0e18,2.0e18,-5.0e17,-1.0e18,3.5e18',
      '2016-11-13T11:32:10Z,-42.5,173.4,6.0,8.4,-1.0e18,5.0e17,1.0e18,2.0e18,-5.0e17,-1.0e18,',
    ].join('\n');
    const result = parseCSV(csv);

    expect(result.errors).toEqual([]);
    expect(tensorOf(result.events[0])).toEqual({
      Mrr: -1.0e18, Mtt: -1.0e18, Mpp: 2.0e18, Mrt: 1.0e18, Mrp: 5.0e17, Mtp: -5.0e17,
    });
    expect(tensorOf(result.events[1])).toEqual({
      Mrr: -1.0e18, Mtt: -1.0e18, Mpp: 2.0e18, Mrt: 1.0e18, Mrp: 5.0e17, Mtp: -5.0e17,
    });
  });

  it('a file with no moment-tensor columns is unaffected', () => {
    const result = parseCSV([
      'time,latitude,longitude,magnitude,depth',
      '2016-11-13T11:02:56Z,-42.737,173.054,7.8,15.1',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect((result.events[0] as any).focal_mechanisms).toBeUndefined();
  });
});
