/**
 * Regression tests for generic catalogue ingestion (lib/parsers.ts,
 * lib/delimiter-detector.ts).
 *
 * Every expected value below is derived from the format specification or the
 * published source metadata cited beside it, never from running the parser.
 */

import { parseCSV, parseJSON } from '@/lib/parsers';
import { tokenizeDelimited, parseWithDelimiter, stripHeaderCommentMarker } from '@/lib/delimiter-detector';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/** Jacobi eigen-decomposition of a symmetric 3x3 matrix, eigenvalues descending. */
function eigenSym3(input: number[][]): Array<{ value: number; vector: number[] }> {
  let a = input.map((r) => r.slice());
  let v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 100; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    const diag = Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]);
    if (off < 1e-14 * diag) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (a[p][q] === 0) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      const A = a.map((r) => r.slice());
      for (let k = 0; k < 3; k++) { A[p][k] = c * a[p][k] - s * a[q][k]; A[q][k] = s * a[p][k] + c * a[q][k]; }
      const B = A.map((r) => r.slice());
      for (let k = 0; k < 3; k++) { B[k][p] = c * A[k][p] - s * A[k][q]; B[k][q] = s * A[k][p] + c * A[k][q]; }
      a = B;
      const V = v.map((r) => r.slice());
      for (let k = 0; k < 3; k++) { V[k][p] = c * v[k][p] - s * v[k][q]; V[k][q] = s * v[k][p] + c * v[k][q]; }
      v = V;
    }
  }
  return [0, 1, 2]
    .map((i) => ({ value: a[i][i], vector: [v[0][i], v[1][i], v[2][i]] }))
    .sort((x, y) => y.value - x.value);
}

/**
 * Plunge/azimuth of a principal axis given in the QuakeML USE basis
 * (r = Up, t = South/colatitude, p = East): North = -t, East = p, Down = -r.
 */
function useAxisToPlungeAzimuth(vec: number[]): { plunge: number; azimuth: number } {
  let north = -vec[1];
  let east = vec[2];
  let down = -vec[0];
  if (down < 0) { north = -north; east = -east; down = -down; }
  const norm = Math.sqrt(north * north + east * east + down * down);
  let azimuth = (Math.atan2(east, north) * 180) / Math.PI;
  if (azimuth < 0) azimuth += 360;
  return { plunge: (Math.asin(down / norm) * 180) / Math.PI, azimuth };
}

const firstFocalMechanism = (event: any): any => JSON.parse(String(event.focal_mechanisms))[0];

// ───────────────────────────────────────────────────────────────────────────
// RFC 4180 quoting
// ───────────────────────────────────────────────────────────────────────────

describe('delimiter-detector — RFC 4180 quoting', () => {
  it('treats a quote that does not open a field as literal data', () => {
    // RFC 4180 s2.5 only gives meaning to quotes that enclose a whole field, so the
    // arc-second mark in a DMS locality string is text (Python csv and PapaParse agree).
    const rows = tokenizeDelimited('a,b\n41 17 30" S locality,7\n', ',');
    expect(rows[1]).toEqual(['41 17 30" S locality', '7']);
  });

  it('still opens a quoted field after leading whitespace', () => {
    const rows = tokenizeDelimited('a,b\nx, "Wellington, NZ"\n', ',');
    expect(rows[1]).toEqual(['x', 'Wellington, NZ']);
  });

  it('preserves the documented RFC 4180 behaviours', () => {
    expect(tokenizeDelimited('a,"He said ""hi""",c', ',')[0]).toEqual(['a', 'He said "hi"', 'c']);
    expect(tokenizeDelimited('name,val\n"line1\nline2",7', ',')[1]).toEqual(['line1\nline2', '7']);
    expect(tokenizeDelimited('h1,h2\n"  spaced  ",  bare  ', ',')[1]).toEqual(['  spaced  ', 'bare']);
    expect(tokenizeDelimited('a,b\r\n"x,y",z\r\n', ',')[1]).toEqual(['x,y', 'z']);
  });

  it('throws rather than silently swallowing the rest of the file on an unterminated quote', () => {
    expect(() => tokenizeDelimited('a,b\n"never closed,2\n3,4\n', ',')).toThrow(/Unterminated quoted field/);
    // Delimiter scoring must never throw: it deliberately tries the wrong delimiters.
    expect(() => tokenizeDelimited('a,b\n"never closed,2\n', ',', { strictQuotes: false })).not.toThrow();
  });

  it('parseCSV keeps every row when a cell contains a stray arc-second quote', () => {
    // 5000 data rows; row 11 carries a DMS arc-second mark in a text column.
    const lines: string[] = ['time,latitude,longitude,depth,magnitude,region'];
    for (let i = 1; i <= 5000; i++) {
      const region = i === 11 ? '41 17 30" S locality' : `region${i}`;
      lines.push(`2016-11-13T11:0${i % 6}:56Z,-42.69,173.02,15.1,4.5,${region}`);
    }
    const result = parseCSV(lines.join('\n'));
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(5000);
    expect(result.events[10].region).toBe('41 17 30" S locality');
  });

  it('parseCSV reports an unterminated quoted field instead of returning success', () => {
    const csv = [
      'time,latitude,longitude,depth,magnitude,region',
      '2016-11-13T11:02:56Z,-42.69,173.02,15.1,4.5,"open quote',
      '2016-11-14T11:02:56Z,-42.60,173.00,12.0,4.0,fine',
    ].join('\n');
    const result = parseCSV(csv);
    expect(result.success).toBe(false);
    expect(result.events).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/Unterminated quoted field/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// FDSN Event Text header
// ───────────────────────────────────────────────────────────────────────────

describe('FDSN event text format', () => {
  // FDSN Web Service Specification v1.2, format=text event response.
  const FDSN_HEADER =
    '#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName';
  const FDSN_ROW =
    '2016p858000|2016-11-13T11:02:56.346Z|-42.6925|173.0197|15.11|WEL(GNS_Primary)|GeoNet||2016p858000|MLv|7.8|WEL(GNS_Primary)|20 km SE of Hanmer Springs';

  it('strips the comment marker from the header line', () => {
    expect(stripHeaderCommentMarker('#EventID')).toBe('EventID');
    expect(stripHeaderCommentMarker('% Time')).toBe('Time');
    expect(stripHeaderCommentMarker('Latitude')).toBe('Latitude');
    expect(parseWithDelimiter(`${FDSN_HEADER}\n${FDSN_ROW}`, '|').headers[0]).toBe('eventid');
  });

  it('keeps the event identifier so provenance survives the upload', () => {
    const result = parseCSV(`${FDSN_HEADER}\n${FDSN_ROW}`, '|');
    expect(result.success).toBe(true);
    const event = result.events[0];
    expect(event.id).toBe('2016p858000');
    expect(event.depth).toBe(15.11);
    const dbFields = parsedEventToDbFields(event);
    expect(dbFields.event_public_id).toBe('2016p858000');
    expect(dbFields.source_id).toBe('2016p858000');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Date format
// ───────────────────────────────────────────────────────────────────────────

describe('date format hint reaches the timestamp normaliser', () => {
  // Row 1 is unambiguous (13 > 12), so detectDateFormat reports International (DD/MM).
  // Under DD/MM: 12/01/2020 is 12 January 2020 and 05/11/2016 is 5 November 2016.
  const INTERNATIONAL_CSV = [
    'time,latitude,longitude,depth,magnitude',
    '13/11/2016 11:02:56,-42.69,173.02,15.1,7.8',
    '12/01/2020 03:00:00,-41.20,174.77,20.0,4.5',
    '05/11/2016 12:02:56,-41.00,174.00,10.0,3.9',
  ].join('\n');

  it('reads an auto-detected DD/MM/YYYY catalogue as DD/MM, in UTC', () => {
    const result = parseCSV(INTERNATIONAL_CSV);
    expect(result.warnings.some((w) => /International date format/.test(w.message))).toBe(true);
    expect(result.events.map((e) => e.time)).toEqual([
      '2016-11-13T11:02:56.000Z',
      '2020-01-12T03:00:00.000Z',
      '2016-11-05T12:02:56.000Z',
    ]);
  });

  it('honours an explicit US hint', () => {
    // Under MM/DD: 12/01/2020 is 1 December 2020 and 05/11/2016 is 11 May 2016.
    const result = parseCSV(INTERNATIONAL_CSV, undefined, 'US');
    expect(result.events.map((e) => e.time)).toEqual([
      '2016-11-13T11:02:56.000Z', // 13 cannot be a month, so DD/MM either way
      '2020-12-01T03:00:00.000Z',
      '2016-05-11T12:02:56.000Z',
    ]);
  });

  it('covers date-only DD/MM/YYYY strings', () => {
    const csv = [
      'time,latitude,longitude,depth,magnitude',
      '13/11/2016,-42.69,173.02,15.1,7.8',
      '12/01/2020,-41.20,174.77,20.0,4.5',
    ].join('\n');
    expect(parseCSV(csv).events.map((e) => e.time)).toEqual([
      '2016-11-13T00:00:00.000Z',
      '2020-01-12T00:00:00.000Z',
    ]);
  });

  it('does not disturb ISO 8601 input', () => {
    const csv = [
      'time,latitude,longitude,depth,magnitude',
      '2016-11-13T11:02:56.346Z,-42.69,173.02,15.1,7.8',
      '2016-11-13 11:02:56,-42.69,173.02,15.1,7.8',
    ].join('\n');
    expect(parseCSV(csv).events.map((e) => e.time)).toEqual([
      '2016-11-13T11:02:56.346Z',
      '2016-11-13T11:02:56.000Z',
    ]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Depth units
// ───────────────────────────────────────────────────────────────────────────

describe('depth unit is decided once per file', () => {
  const csvWithDepths = (depths: number[], header = 'depth') =>
    [`time,latitude,longitude,${header},magnitude`]
      .concat(depths.map((d) => `2016-11-13T11:02:56Z,-42.69,173.02,${d},4.5`))
      .join('\n');

  it('converts a metres catalogue uniformly, shallow events included', () => {
    // Taupo Volcanic Zone / geothermal shape: depths in metres, many events < 1 km.
    const result = parseCSV(csvWithDepths([40000, 12000, 1500, 1000, 950, 500, 120]));
    expect(result.errors).toEqual([]);
    expect(result.events.map((e) => e.depth)).toEqual([40, 12, 1.5, 1, 0.95, 0.5, 0.12]);
    expect(result.warnings.some((w) => /interpreted as metres/.test(w.message))).toBe(true);
  });

  it('leaves a kilometre catalogue alone, even with one corrupt row', () => {
    const result = parseCSV(csvWithDepths([5, 10, 12, 15, 22, 33, 41, 55, 70, 88, 120, 250, 600, 5000]));
    const depths = result.events.map((e) => e.depth);
    expect(depths.slice(0, 13)).toEqual([5, 10, 12, 15, 22, 33, 41, 55, 70, 88, 120, 250, 600]);
    expect(depths[13]).toBeNull(); // 5000 km is not a possible hypocentre
    expect(result.warnings.some((w) => /interpreted as metres/.test(w.message))).toBe(false);
  });

  it('does not rescale a column that names kilometres', () => {
    // Depth/km is the FDSN event-text column name; the huge values are bad data,
    // not metres, and must not be silently divided by 1000.
    const result = parseCSV(csvWithDepths([12000, 15], 'depth/km'));
    expect(result.events[0].depth).toBeNull();
    expect(result.events[1].depth).toBe(15);
  });

  it('scales the depth and horizontal uncertainties with the depth', () => {
    const csv = [
      'time,latitude,longitude,depth,magnitude,deptherror,horizontalerror',
      '2016-11-13T11:02:56Z,-42.69,173.02,15110,7.8,2400,1800',
      '2016-11-14T11:02:56Z,-42.60,173.00,32000,5.0,3100,2600',
    ].join('\n');
    const result = parseCSV(csv);
    expect(result.events[0].depth).toBeCloseTo(15.11, 10);
    expect(result.events[0].depth_uncertainty).toBeCloseTo(2.4, 10);
    expect(result.events[0].horizontal_uncertainty).toBeCloseTo(1.8, 10);
  });

  it('applies the same rule on the JSON path', () => {
    const json = JSON.stringify(
      [40000, 12000, 950].map((depth) => ({
        time: '2016-11-13T11:02:56Z', latitude: -42.69, longitude: 173.02, magnitude: 4.5, depth,
      }))
    );
    expect(parseJSON(json).events.map((e) => e.depth)).toEqual([40, 12, 0.95]);
  });

  it('leaves JSON uncertainties in km when depth is already in km', () => {
    const json = JSON.stringify([{
      time: '2016-11-13T11:02:56Z', latitude: -42.69, longitude: 173.02, magnitude: 4.5,
      depth: 15.11, depth_error: 2.5, horiz_unc: 1.5,
    }]);
    const event = parseJSON(json).events[0];
    expect(event.depth).toBe(15.11);
    expect(event.depth_uncertainty).toBe(2.5);
    expect(event.horizontal_uncertainty).toBe(1.5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Moment tensor
// ───────────────────────────────────────────────────────────────────────────

describe('moment tensor from flat GeoNet CMT columns', () => {
  // Verbatim row 2103645 of GeoNet_CMT_solutions.csv (21 Aug 2003 Mw 7.1 Fiordland).
  // GeoNet moment-tensor README: Mo is in dyne.cm; Mxx..Mzz are on a 1e20 dyne.cm scale.
  const HEADER = 'PublicID,Date,Latitude,Longitude,strike1,dip1,rake1,strike2,dip2,rake2,ML,Mw,Mo,CD,NS,DC,Mxx,Mxy,Mxz,Myy,Myz,Mzz,VR,Tva,Tpl,Taz,Nva,Npl,Naz,Pva,Ppl,Paz,Method';
  const ROW = '2103645,20030821121200,-45.1929,166.8300,213,56,98,20,35,79,7.0,7.1,5.61e+26,22,5,87,-735165.31,2369692.25,-1425430.75,-4250704.50,1486940.25,4985869.50,83,5416627.50,78,149,388026.19,6,28,-5804654.00,11,298,1';

  // The row needs a parseable origin for the event to validate.
  const CSV = [
    `time,latitude,longitude,depth,magnitude,${HEADER}`,
    `2003-08-21T12:12:47Z,-45.1929,166.8300,24,7.1,${ROW}`,
  ].join('\n');

  const tensorOf = () => firstFocalMechanism(parseCSV(CSV).events[0]).momentTensor;

  it('maps NED (z = Down) to USE with the Aki & Richards signs', () => {
    // Mrr=Mzz, Mtt=Mxx, Mpp=Myy, Mrt=Mxz, Mrp=-Myz, Mtp=-Mxy, each x 1e13 (1e20 dyne.cm -> N.m)
    const t = tensorOf().tensor;
    expect(t.Mrr.value).toBeCloseTo(4985869.5e13, -8);
    expect(t.Mtt.value).toBeCloseTo(-735165.31e13, -8);
    expect(t.Mpp.value).toBeCloseTo(-4250704.5e13, -8);
    expect(t.Mrt.value).toBeCloseTo(-1425430.75e13, -8);
    expect(t.Mrp.value).toBeCloseTo(-1486940.25e13, -8);
    expect(t.Mtp.value).toBeCloseTo(-2369692.25e13, -8);
  });

  it('emits a tensor whose principal axes match the file\'s own T/N/P columns', () => {
    // Independent check of the sign convention: decomposing the emitted USE tensor must
    // reproduce Tpl/Taz = 78/149, Npl/Naz = 6/28 and Ppl/Paz = 11/298 from the same row.
    const t = tensorOf().tensor;
    const axes = eigenSym3([
      [t.Mrr.value, t.Mrt.value, t.Mrp.value],
      [t.Mrt.value, t.Mtt.value, t.Mtp.value],
      [t.Mrp.value, t.Mtp.value, t.Mpp.value],
    ]).map((e) => useAxisToPlungeAzimuth(e.vector));

    const [tAxis, nAxis, pAxis] = axes;
    expect(tAxis.plunge).toBeCloseTo(78, 0);
    expect(tAxis.azimuth).toBeCloseTo(149, -0.7);
    expect(nAxis.plunge).toBeCloseTo(6, -0.5);
    expect(nAxis.azimuth).toBeCloseTo(28, -0.7);
    expect(pAxis.plunge).toBeCloseTo(11, -0.5);
    expect(pAxis.azimuth).toBeCloseTo(298, -0.7);
  });

  it('stores the scalar moment in N.m so Hanks & Kanamori recovers the published Mw', () => {
    const mt = tensorOf();
    // 5.61e26 dyne.cm x 1e-7 = 5.61e19 N.m
    expect(mt.scalarMoment.value).toBeCloseTo(5.61e19, -13);
    // Hanks & Kanamori (1979): Mw = (log10 M0[N.m] - 9.1) / 1.5; the row publishes Mw 7.1
    const mw = (Math.log10(mt.scalarMoment.value) - 9.1) / 1.5;
    expect(mw).toBeCloseTo(7.1, 1);
    // QuakeML doubleCouple is a 0-1 fraction; the DC column is a percentage
    expect(mt.doubleCouple).toBeCloseTo(0.87, 10);
  });

  it('leaves a tensor that is already in N.m untouched', () => {
    // Same mechanism expressed directly in N.m: Mo and max|Mij| are then the same order,
    // so there is no evidence of the CGS scale and nothing may be rescaled.
    const csv = [
      'time,latitude,longitude,depth,magnitude,Mo,Mxx,Mxy,Mxz,Myy,Myz,Mzz',
      '2003-08-21T12:12:47Z,-45.1929,166.8300,24,7.1,5.61e19,-7.3516531e18,2.36969225e19,-1.42543075e19,-4.250704e19,1.48694025e19,4.9858695e19',
    ].join('\n');
    const mt = firstFocalMechanism(parseCSV(csv).events[0]).momentTensor;
    expect(mt.scalarMoment.value).toBe(5.61e19);
    expect(mt.tensor.Mrr.value).toBe(4.9858695e19);
    expect(mt.tensor.Mrt.value).toBe(-1.42543075e19);
  });
});
