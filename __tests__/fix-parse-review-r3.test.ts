/** @jest-environment node */
/**
 * Regression tests for the post-fix parser review (R3).
 */
import { execFileSync } from 'node:child_process';
import { parseCSV, parseJSON, parseQuakeML, parseFile } from '@/lib/parsers';
import { parseGeoJSON } from '@/lib/geojson-parser';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { inferMagnitudeTypeFromColumn, lengthUnitFromColumnName, normalizeMappedField, normalizeTimestamp } from '@/lib/earthquake-utils';
import { resolveHeaderAlias } from '@/lib/field-definitions';

const elapsed = (fn: () => unknown) => {
  const start = Date.now();
  fn();
  return Date.now() - start;
};

describe('#1 header names cannot make parsing quadratic', () => {
  it('scale and unit inference stay linear on pathological names', () => {
    for (const name of ['_'.repeat(20000) + 'x', 'mag' + '_'.repeat(20000) + 'x', ' '.repeat(20000) + 'x']) {
      expect(elapsed(() => inferMagnitudeTypeFromColumn(name))).toBeLessThan(50);
      expect(elapsed(() => lengthUnitFromColumnName(name))).toBeLessThan(50);
    }
    for (const name of ['x' + ' ('.repeat(10000), '(' + ' '.repeat(20000) + 'x', 'a' + '('.repeat(20000), 'depth' + ' ['.repeat(10000) + ']']) {
      expect(elapsed(() => resolveHeaderAlias(name))).toBeLessThan(50);
    }
    // Short names are still read.
    expect(inferMagnitudeTypeFromColumn('mag_Ms')).toBe('Ms');
    expect(lengthUnitFromColumnName('Depth (m)')).toBe('m');
  });

  it('a CSV with a 10,000-character header parses in milliseconds', () => {
    const header = 'time,latitude,longitude,depth,magnitude,' + '_'.repeat(10000) + 'x';
    const rows = Array.from({ length: 40 }, (_, i) => `2024-01-15T10:30:${String(i).padStart(2, '0')}Z,-41.2,174.7,10,4.5,1`);
    let events = 0;
    expect(elapsed(() => { events = parseCSV([header, ...rows].join('\n')).events.length; })).toBeLessThan(1000);
    expect(events).toBe(40);
  });
});

describe('#2 header resolution is not cached for the life of the process', () => {
  it('unique keys from several uploads are released after each parse', () => {
    // A fresh process with an exposed collector measures what the parser keeps.
    const script = `
      const { parseJSON } = require('./lib/parsers');
      console.log = () => {}; console.warn = () => {};
      const heap = () => { global.gc(); global.gc(); return process.memoryUsage().heapUsed / 1e6; };
      const upload = (b) => parseJSON(JSON.stringify(Array.from({ length: 30000 }, (_, i) => ({
        time: '2024-01-15T10:30:00Z', latitude: -41.2, longitude: 174.7, depth: 10, magnitude: 4.5,
        ['note_' + b + '_' + i + '_abcdefghij']: 1, ['extra_' + b + '_' + i + '_klmnopqrst']: 2,
      })))).events.length;
      upload(-1);
      const before = heap();
      for (let b = 0; b < 3; b++) upload(b);
      process.stdout.write(JSON.stringify({ retainedMB: heap() - before }));
    `;
    const stdout = execFileSync(process.execPath, ['--expose-gc', '--import', 'tsx', '-e', script], { encoding: 'utf8', maxBuffer: 1 << 24 });
    const { retainedMB } = JSON.parse(stdout.slice(stdout.indexOf('{"retainedMB"')));
    // 180,000 unique keys used to stay cached (about 50 MB here); now nothing grows.
    expect(retainedMB).toBeLessThan(10);
  }, 120000);
});

describe('#3 12-hour clocks and asctime/ctime times', () => {
  it('US spreadsheet date-times with AM/PM', () => {
    const result = parseCSV('DateTime,Latitude,Longitude,Depth,Magnitude\n1/15/2024 10:30:00 AM,-41.29,174.78,25.3,4.5\n3/4/2024 1:05:07 PM,-37.5,178.9,10,5.1');
    expect(result.events.map((e) => e.time)).toEqual(['2024-01-15T10:30:00.000Z', '2024-03-04T13:05:07.000Z']);
  });

  it('a separate time column with AM/PM', () => {
    const result = parseCSV('Date,Time,Lat,Lon,Depth,Mag\n2024-01-15,10:30:00 AM,-41.2,174.7,25,4.5\n2024-01-15,1:05:07 PM,-41.2,174.7,25,4.5');
    expect(result.events.map((e) => e.time)).toEqual(['2024-01-15T10:30:00.000Z', '2024-01-15T13:05:07.000Z']);
  });

  it('12 AM is midnight, 12 PM is noon, and 13 PM is not a time', () => {
    expect(normalizeTimestamp('1/2/2024 12:00:00 AM', 'US')).toBe('2024-01-02T00:00:00.000Z');
    expect(normalizeTimestamp('1/2/2024 12:30 PM', 'US')).toBe('2024-01-02T12:30:00.000Z');
    expect(normalizeTimestamp('Jan 15 2024 10:30:00 PM')).toBe('2024-01-15T22:30:00.000Z');
    expect(normalizeTimestamp('1/2/2024 13:00 PM', 'US')).toBeNull();
    expect(normalizeTimestamp('1/2/2024 0:30 AM', 'US')).toBeNull();
  });

  it('asctime/ctime and Unix date, read as UTC; a named local zone is not', () => {
    expect(normalizeTimestamp('Mon Jan 15 10:30:00 2024')).toBe('2024-01-15T10:30:00.000Z');
    expect(normalizeTimestamp('Mon Jan 15 10:30:00 UTC 2024')).toBe('2024-01-15T10:30:00.000Z');
    expect(normalizeTimestamp('Mon Jan  5 10:30:00 2024')).toBe('2024-01-05T10:30:00.000Z');
    expect(normalizeTimestamp('Mon Jan 15 10:30:00 NZDT 2024')).toBeNull();
    expect(parseCSV('time,latitude,longitude,depth,magnitude\nMon Jan 15 10:30:00 UTC 2024,-41.2,174.7,25,4.5').events[0].time)
      .toBe('2024-01-15T10:30:00.000Z');
  });
});

describe('#4 a date without a time of day is completed, or reported', () => {
  it('a compact date beside a compact HHMMSS column', () => {
    const result = parseCSV('date,hhmmss,latitude,longitude,depth,magnitude\n20240115,103000,-41.2,174.7,25,4.5\n20240116,235959,-41.2,174.7,25,4.6');
    expect(result.events.map((e) => e.time)).toEqual(['2024-01-15T10:30:00.000Z', '2024-01-16T23:59:59.000Z']);
    expect(result.resolvedFieldSources.time).toBe('date+hhmmss');
    expect(result.fileDecisions.dateOnlyTimes).toBeUndefined();
  });

  it('a DD/MM date beside a time column the alias table does not know', () => {
    const result = parseCSV('date,origin_hms,latitude,longitude,depth,magnitude\n15/01/2024,10:30:00,-41.2,174.7,25,4.5');
    expect(result.events[0].time).toBe('2024-01-15T10:30:00.000Z');
  });

  it('a date with no time of day anywhere is stored at midnight with a warning', () => {
    const result = parseCSV('date,latitude,longitude,depth,magnitude\n2024-01-15,-41.2,174.7,25,4.5\n2024-01-16,-41.2,174.7,25,4.6');
    expect(result.events.map((e) => e.time)).toEqual(['2024-01-15T00:00:00.000Z', '2024-01-16T00:00:00.000Z']);
    expect(result.fileDecisions.dateOnlyTimes).toBe(2);
    expect(result.warnings.some((w) => /2 origin time\(s\) have a date but no time of day/.test(w.message))).toBe(true);
  });

  it('an unrelated numeric column is not taken for the time of day', () => {
    // 'station_id' values are not all valid clock readings (987654).
    const result = parseCSV('date,station_id,latitude,longitude,depth,magnitude\n2024-01-15,123456,-41.2,174.7,25,4.5\n2024-01-16,987654,-41.2,174.7,25,4.6');
    expect(result.events.map((e) => e.time)).toEqual(['2024-01-15T00:00:00.000Z', '2024-01-16T00:00:00.000Z']);
  });
});

describe('#5 a units line after a commented header', () => {
  it.each([
    '#time,latitude,longitude,depth,magnitude\n#UTC,deg,deg,km,ML\n2024-01-15T10:30:00Z,-41.2,174.7,25,4.5\n2024-01-16T10:30:00Z,-41.3,174.8,26,4.6',
    '# time, latitude, longitude, depth, magnitude\n# (UTC), (deg), (deg), (km), (ML)\n2024-01-15T10:30:00Z,-41.2,174.7,25,4.5\n2024-01-16T10:30:00Z,-41.3,174.8,26,4.6',
  ])('the header is the commented line that names fields', (csv) => {
    const result = parseCSV(csv);
    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.detectedFields).toEqual(['time', 'latitude', 'longitude', 'depth', 'magnitude']);
  });

  it('FDSN event text still reads its #EventID header', () => {
    const result = parseFile('#EventID | Time | Latitude | Longitude | Depth/km | Magnitude\nus1 | 2024-01-15T10:30:00 | -41.2 | 174.7 | 25 | 4.5', 'events.txt');
    expect(result.success).toBe(true);
    expect(result.events[0].id).toBe('us1');
  });
});

describe('#6 two-digit years only when the order is certain', () => {
  it('a YY/MM/DD-compatible file is not read, and says why', () => {
    const result = parseCSV('date,time,latitude,longitude,depth,magnitude\n20/05/17,10:30:00,-41.2,174.7,25,4.5\n13/02/28,10:30:00,-41.2,174.7,25,4.5\n05/03/25,10:30:00,-41.2,174.7,25,4.5');
    expect(result.events).toHaveLength(0);
    expect(result.warnings.some((w) => /3 date\(s\) with a two-digit year were not read/.test(w.message) && /YY\/MM\/DD/.test(w.message))).toBe(true);
  });

  it('a file whose dates rule out every order but DD/MM/YY is read, stating order and pivot', () => {
    const result = parseCSV('date,time,lat,lon,depth,mag\n15/01/95,10:30:00,-41.29,174.78,25.3,4.5\n03/04/24,00:05:07,-37.5,178.9,10,5.1');
    expect(result.events.map((e) => e.time)).toEqual(['1995-01-15T10:30:00.000Z', '2024-04-03T00:05:07.000Z']);
    expect(result.fileDecisions.twoDigitYears).toBe(true);
    const message = result.warnings.find((w) => /two-digit year were read as DD\/MM\/YY/.test(w.message))?.message ?? '';
    expect(message).toMatch(/latest year with those digits that is not in the future \(00–\d\d as 20\d\d–20\d\d/);
  });

  it('a declared format reads them in that order', () => {
    const csv = 'time,latitude,longitude,depth,magnitude\n05/03/24 10:00:00,-41.2,174.7,25,4.5';
    expect(parseCSV(csv, ',', 'US').events[0].time).toBe('2024-05-03T10:00:00.000Z');
    expect(parseCSV(csv, ',', 'International').events[0].time).toBe('2024-03-05T10:00:00.000Z');
    expect(parseCSV(csv).events).toHaveLength(0);
    // The mapping step reads them the same way under the file's decision.
    expect(normalizeMappedField('time', '05/03/24 10:00:00', { dateFormat: 'US', twoDigitYears: true }).value).toBe('2024-05-03T10:00:00.000Z');
  });
});

describe('#8 _raw keeps only cells the event no longer holds as written', () => {
  it('a plain file carries no _raw', () => {
    const result = parseCSV('time,latitude,longitude,depth,magnitude\n2024-01-15 10:30:00,-41.2,174.7,25,4.5\n2024-01-16T10:30:00Z,-41.3,174.8,26,4.6');
    expect(result.events.every((e) => !('_raw' in e))).toBe(true);
  });

  it('converted, wrapped, nulled and re-sourced cells are kept as written', () => {
    const csv = [
      'time,latitude,longitude,depth,magnitude,mw,azimuthal_gap',
      '2024-01-15T10:30:00Z,-29.3,182.1,12000,4.9,5.1,-1',
      '2024-01-16T10:30:00Z,-29.4,179.9,15000,4.0,4.2,120',
      '2024-01-17T10:30:00Z,-29.5,179.8,800,4.1,4.3,95',
    ].join('\n');
    const [first, second] = parseCSV(csv).events as any[];
    expect(first._raw).toEqual({ longitude: '182.1', depth: '12000', magnitude: '4.9', azimuthal_gap: '-1' });
    expect(second._raw).toEqual({ depth: '15000', magnitude: '4.0' });
    // Nothing of it reaches a stored event.
    expect(parsedEventToDbFields(first)).not.toHaveProperty('_raw');
  });
});

describe('#9 a CSV mB column keeps its case', () => {
  it('broadband mB is not relabelled mb', () => {
    const event: any = parseCSV('time,latitude,longitude,depth,mB,Ms\n2024-01-15T10:30:00Z,-41.2,174.7,25,6.1,6.4').events[0];
    expect([event.magnitude, event.magnitude_type]).toEqual([6.4, 'Ms']);
    expect(JSON.parse(event.magnitudes)).toEqual([{ type: 'mB', mag: { value: 6.1 } }]);
  });
});

describe('#10 the negative-depth hint reads the whole column, without sentinels', () => {
  it('one -999 among positive depths is not called a convention', () => {
    const result = parseCSV('time,latitude,longitude,depth,magnitude\n2024-01-15T10:30:00Z,-41.2,174.7,10,4.5\n2024-01-16T10:30:00Z,-41.2,174.7,20,4.5\n2024-01-17T10:30:00Z,-41.2,174.7,-999,4.5');
    const warning = result.warnings.find((w) => /outside -5 to 1000 km/.test(w.message))?.message ?? '';
    expect(warning).not.toMatch(/negative downward/);
  });

  it('a negative-down file still gets the hint', () => {
    const csv = ['time,latitude,longitude,depth,magnitude']
      .concat([-2, -4, -8, -12, -20, -35].map((d, i) => `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z,-41,174,${d},4`))
      .join('\n');
    expect(parseCSV(csv).warnings.some((w) => /negative downward/.test(w.message))).toBe(true);
  });
});

describe('#11 QuakeML and GeoJSON times are stored as UTC instants', () => {
  it('a zone-less QuakeML time is normalised in the parse result', () => {
    const xml = `<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2"><eventParameters publicID="smi:x">
      <event publicID="smi:x/e1"><origin publicID="smi:x/o1"><time><value>2024-01-15T10:30:00.1234567</value></time>
      <latitude><value>-41</value></latitude><longitude><value>174</value></longitude></origin>
      <magnitude publicID="smi:x/m1"><mag><value>4</value></mag></magnitude></event></eventParameters></q:quakeml>`;
    expect(parseQuakeML(xml).events[0].time).toBe('2024-01-15T10:30:00.123Z');
  });

  it('GeoJSON string times use the declared or detected day/month order', () => {
    const collection = (times: string[]) => JSON.stringify({
      type: 'FeatureCollection',
      features: times.map((time) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [174, -41] }, properties: { time, mag: 4 } })),
    });
    expect(parseGeoJSON(collection(['2024-01-15 10:30:00'])).events[0].time).toBe('2024-01-15T10:30:00.000Z');
    expect(parseGeoJSON(collection(['03/04/2024 10:00:00']), 'US').events[0].time).toBe('2024-03-04T10:00:00.000Z');
    const detected = parseGeoJSON(collection(['03/25/2024 10:00:00', '03/04/2024 10:00:00']));
    expect(detected.events.map((e) => e.time)).toEqual(['2024-03-25T10:00:00.000Z', '2024-03-04T10:00:00.000Z']);
    expect(detected.fileDecisions.dateFormat).toBe('US');
    // Through parseFile and parseJSON the declared format reaches the GeoJSON parser too.
    expect(parseFile(collection(['03/04/2024 10:00:00']), 'events.geojson', undefined, 'US').events[0].time).toBe('2024-03-04T10:00:00.000Z');
    expect(parseJSON(collection(['03/04/2024 10:00:00']), 'US').events[0].time).toBe('2024-03-04T10:00:00.000Z');
  });
});

describe('#12 a JSON YYYYMMDD number is a date', () => {
  it('20240115 is 15 January 2024, and epochs are unchanged', () => {
    expect(normalizeTimestamp(20240115)).toBe('2024-01-15T00:00:00.000Z');
    expect(normalizeTimestamp(1705314600)).toBe('2024-01-15T10:30:00.000Z');
    expect(normalizeTimestamp(20241350)).toBe('1970-08-23T06:35:50.000Z'); // month 13 is not a date: epoch seconds
    const result = parseJSON(JSON.stringify([{ date: 20240115, latitude: -41.2, longitude: 174.7, depth: 25, magnitude: 4.5 }]));
    expect(result.events[0].time).toBe('2024-01-15T00:00:00.000Z');
  });
});

describe('#13 stored quality metrics do not bring back sentinels', () => {
  it('a gap the parser read as missing stays missing', () => {
    const base = { time: '2024-01-15T10:30:00Z', latitude: -41, longitude: 174, magnitude: 4 };
    expect(parsedEventToDbFields({ ...base, azimuthal_gap: null, azimuthalGap: -1 } as any).azimuthal_gap).toBeUndefined();
    expect(parsedEventToDbFields({ ...base, azimuthalGap: -1, usedStationCount: -999 } as any)).not.toHaveProperty('used_station_count');
    expect(parsedEventToDbFields({ ...base, azimuthalGap: 45, usedPhaseCount: '12' } as any)).toMatchObject({ azimuthal_gap: 45, used_phase_count: 12 });
    const parsed = parseJSON(JSON.stringify([{ ...base, azimuthalGap: -1 }])).events[0];
    expect(parsedEventToDbFields(parsed).azimuthal_gap).toBeUndefined();
  });
});

describe('repeated header names', () => {
  it('yyyy mm dd hh mm ss keeps month and minute apart', () => {
    const result = parseCSV('yyyy mm dd hh mm ss lat lon depth mag\n2024 1 15 10 5 0.0 -41.2 174.7 25 4.5\n2024 1 15 10 30 0.0 -41.2 174.7 25 4.5');
    expect(result.errors).toEqual([]);
    expect(result.events.map((e) => e.time)).toEqual(['2024-01-15T10:05:00.000Z', '2024-01-15T10:30:00.000Z']);
    expect(result.detectedFields).toEqual(['yyyy', 'mm', 'dd', 'hh', 'mm_2', 'ss', 'lat', 'lon', 'depth', 'mag']);
  });
});
