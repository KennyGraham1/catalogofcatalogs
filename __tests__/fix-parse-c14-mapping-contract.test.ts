/** @jest-environment node */
/**
 * Contract C14: every parse result says which source column each canonical field was
 * read from (resolvedFieldSources) and which file-level decisions were applied
 * (fileDecisions), and normalizeMappedValue turns a raw cell into exactly what the
 * parser would have stored, so the upload mapping step can normalise an explicit user
 * remap without re-deriving values from raw cells.
 */
import * as parsers from '@/lib/parsers';
import * as earthquakeUtils from '@/lib/earthquake-utils';
import { parseGeoJSON } from '@/lib/geojson-parser';

const {
  parseCSV, parseJSON, parseFile, parseQuakeML,
  normalizeMappedValue, normalizeMappedField, inferMagnitudeTypeFromColumn,
} = parsers;

const quakeml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<q:quakeml xmlns:q="http://quakeml.org/xmlns/quakeml/1.2" xmlns="http://quakeml.org/xmlns/bed/1.2">
  <eventParameters publicID="smi:test/ep">
    <event publicID="smi:nz.org.geonet/2016p858000">
      <origin publicID="smi:test/origin/1">
        <time><value>2016-11-13T11:02:56.346Z</value></time>
        <latitude><value>-42.69</value></latitude>
        <longitude><value>173.02</value></longitude>
        <depth><value>15110</value></depth>
        ${body}
      </origin>
      <magnitude publicID="smi:test/mag/1"><mag><value>7.8</value></mag><type>Mw</type></magnitude>
    </event>
  </eventParameters>
</q:quakeml>`;

describe('C14: parse results report the source of every field and the file decisions', () => {
  // US dates (03/25 settles the order), a 0-360 longitude, depths in metres, and a
  // scale-named Mw column beside a generic magnitude with its own type column.
  const CSV = [
    'datetime,lat,lon,dep,mw,mag,magtype',
    '03/25/2024 10:00:00,-29.3,182.1,12000,5.1,4.9,ML',
    '03/04/2024 10:00:00,-29.4,182.2,15000,4.2,4.0,ML',
    '03/05/2024 10:00:00,-29.5,179.9,800,4.3,4.1,ML',
  ].join('\n');

  it('parseCSV names the alias column behind each field', () => {
    const result = parseCSV(CSV);
    expect(result.success).toBe(true);
    expect(result.resolvedFieldSources).toMatchObject({
      time: 'datetime',
      latitude: 'lat',
      longitude: 'lon',
      depth: 'dep',
      magnitude: 'mw',
      magnitude_type: 'mw',
    });
  });

  it('parseCSV reports the date format, the depth unit and the wrapped longitudes', () => {
    const result = parseCSV(CSV);
    expect(result.fileDecisions).toMatchObject({
      dateFormat: 'US',
      dateFormatSource: 'detected',
      depthUnit: 'm',
      wrappedLongitudes: 2,
    });
    expect(result.fileDecisions.depthUnitReason).toMatch(/95th percentile/);
    // The values the decisions describe.
    expect(result.events.map((e) => e.time)).toEqual([
      '2024-03-25T10:00:00.000Z', '2024-03-04T10:00:00.000Z', '2024-03-05T10:00:00.000Z',
    ]);
    expect(result.events[2].depth).toBeCloseTo(0.8, 10);
  });

  it('a declared date format is reported as declared', () => {
    expect(parseCSV(CSV, ',', 'International').fileDecisions).toMatchObject({
      dateFormat: 'International',
      dateFormatSource: 'declared',
    });
  });

  it('parseJSON and parseFile report the same things for the same content', () => {
    const records = CSV.split('\n').slice(1).map((line) => {
      const [datetime, lat, lon, dep, mw, mag, magtype] = line.split(',');
      return { datetime, lat: Number(lat), lon: Number(lon), dep: Number(dep), mw: Number(mw), mag: Number(mag), magtype };
    });
    const viaJson = parseJSON(JSON.stringify(records));
    const viaFile = parseFile(JSON.stringify(records), 'catalogue.json');
    for (const result of [viaJson, viaFile]) {
      expect(result.resolvedFieldSources).toMatchObject({ time: 'datetime', longitude: 'lon', depth: 'dep', magnitude: 'mw' });
      expect(result.fileDecisions).toMatchObject({ dateFormat: 'US', depthUnit: 'm', wrappedLongitudes: 2 });
      expect(result.events.map((e) => e.time)).toEqual(parseCSV(CSV).events.map((e) => e.time));
    }
  });

  it('parseGeoJSON names geometry coordinates and properties', () => {
    const result = parseGeoJSON(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [182.72, -29.72] },
        properties: { publicid: '2021p169083', origintime: '2021-03-04T19:28:31Z', mag: 8.1, depth: 21 },
      }],
    }));
    expect(result.success).toBe(true);
    expect(result.resolvedFieldSources).toMatchObject({
      longitude: 'geometry.coordinates[0]',
      latitude: 'geometry.coordinates[1]',
      time: 'origintime',
      magnitude: 'mag',
      depth: 'properties.depth',
      eventId: 'publicid',
    });
    expect(result.fileDecisions).toMatchObject({ wrappedLongitudes: 1 });
  });

  it('parseQuakeML names the BED elements and reports depth in metres', () => {
    const result = parseQuakeML(quakeml(''));
    expect(result.success).toBe(true);
    expect(result.resolvedFieldSources).toMatchObject({
      time: 'event/origin/time/value',
      depth: 'event/origin/depth/value',
      magnitude: 'event/magnitude/mag/value',
    });
    expect(result.fileDecisions).toMatchObject({ depthUnit: 'm' });
  });

  it('a file that cannot be read still carries both members, empty', () => {
    for (const result of [parseCSV(''), parseJSON('{not json'), parseQuakeML('<x/>'), parseGeoJSON('{}')]) {
      expect(result.success).toBe(false);
      expect(result.resolvedFieldSources).toEqual({});
      expect(result.fileDecisions).toEqual({});
    }
  });
});

describe('C14: normalizeMappedValue stores what the parser would have stored', () => {
  it('is one function, importable from the browser-safe module and from lib/parsers', () => {
    expect(typeof earthquakeUtils.normalizeMappedValue).toBe('function');
    expect(parsers.normalizeMappedValue).toBe(earthquakeUtils.normalizeMappedValue);
    expect(parsers.normalizeMappedField).toBe(earthquakeUtils.normalizeMappedField);
  });

  it('reads a time with the file date format, as UTC', () => {
    expect(normalizeMappedValue('time', '03/04/2024 10:00:00', { dateFormat: 'US' })).toBe('2024-03-04T10:00:00.000Z');
    expect(normalizeMappedValue('time', '03/04/2024 10:00:00', { dateFormat: 'International' })).toBe('2024-04-03T10:00:00.000Z');
    expect(normalizeMappedValue('time', '3/4/2024 10:00', { dateFormat: 'International' })).toBe('2024-04-03T10:00:00.000Z');
    expect(normalizeMappedValue('time', '2024-01-15 10:30:00.1234567', {})).toBe('2024-01-15T10:30:00.123Z');
    expect(normalizeMappedValue('time', 'not a time', {})).toBeNull();
    expect(normalizeMappedValue('time', '', {})).toBeNull();
  });

  it('wraps 0-360 longitudes and parses numbers strictly', () => {
    expect(normalizeMappedValue('longitude', '182.1', {})).toBeCloseTo(-177.9, 10);
    expect(normalizeMappedValue('longitude', '-177.9', {})).toBe(-177.9);
    expect(normalizeMappedValue('latitude', ' -41.2 ', {})).toBe(-41.2);
    expect(normalizeMappedValue('magnitude', '4.1garbage', {})).toBeNull();
    expect(normalizeMappedValue('magnitude', '1,000', {})).toBeNull();
  });

  it('converts metre depths and length uncertainties by column name or file decision', () => {
    expect(normalizeMappedValue('depth', '800', { depthUnit: 'm' }, 'dep')).toBeCloseTo(0.8, 10);
    expect(normalizeMappedValue('depth', '800', { depthUnit: 'km' }, 'depth_m')).toBeCloseTo(0.8, 10);
    expect(normalizeMappedValue('depth', '800', {}, 'Depth (m)')).toBeCloseTo(0.8, 10);
    // A column that names kilometres wins over a metres file decision.
    expect(normalizeMappedValue('depth', '15', { depthUnit: 'm' }, 'Depth/km')).toBe(15);
    expect(normalizeMappedValue('horizontal_uncertainty', '80', { depthUnit: 'm' }, 'herr')).toBeCloseTo(0.08, 10);
    expect(normalizeMappedValue('depth_uncertainty', '50', {}, 'depth_error_m')).toBeCloseTo(0.05, 10);
    // An impossible depth is unknown, as the parser stores it.
    expect(normalizeMappedValue('depth', '1200', { depthUnit: 'km' }, 'depth')).toBeNull();
  });

  it('reads a negative sentinel in a non-negative field as missing', () => {
    expect(normalizeMappedValue('azimuthal_gap', '-1', {})).toBeNull();
    expect(normalizeMappedValue('used_station_count', '-999', {})).toBeNull();
    expect(normalizeMappedValue('standard_error', '0', {})).toBe(0);
    // Depth may be negative (above sea level) and is not a sentinel field.
    expect(normalizeMappedValue('depth', '-1.2', {})).toBe(-1.2);
  });

  it('infers the magnitude type from a scale-named column', () => {
    expect(normalizeMappedField('magnitude', '7.2', {}, 'mb')).toEqual({ value: 7.2, derived: { magnitude_type: 'mb' } });
    expect(normalizeMappedField('magnitude', '8.8', {}, 'Ms').derived).toEqual({ magnitude_type: 'Ms' });
    expect(normalizeMappedField('magnitude', '3.1', {}, 'md').derived).toEqual({ magnitude_type: 'Md' });
    expect(normalizeMappedField('magnitude', '4.0', {}, 'mag').derived).toEqual({});
    expect(inferMagnitudeTypeFromColumn('mag_ML')).toBe('ML');
    expect(inferMagnitudeTypeFromColumn('Mw_magnitude')).toBe('Mw');
    expect(inferMagnitudeTypeFromColumn('mlv')).toBe('MLv');
    expect(inferMagnitudeTypeFromColumn('mB')).toBe('mB');
    expect(inferMagnitudeTypeFromColumn('magnitude')).toBeNull();
    expect(normalizeMappedValue('magnitude_type', ' mb ', {}, 'magtype')).toBe('mb');
    expect(normalizeMappedValue('magnitude_type', '', {}, 'Md')).toBe('Md');
    expect(normalizeMappedValue('magnitude_type', '4.2', {}, 'magtype')).toBeNull();
  });

  it('passes other fields through, with a blank cell absent', () => {
    expect(normalizeMappedValue('region', 'Cook Strait', {})).toBe('Cook Strait');
    expect(normalizeMappedValue('region', '   ', {})).toBeNull();
  });

  it('agrees with the parser cell by cell for every column the parser resolved', () => {
    const result = parseCSV([
      'datetime,lat,lon,dep,herr,gap,mag',
      '03/25/2024 10:00:00,-29.3,182.1,12000,900,-1,4.9',
      '03/04/2024 10:00:00,-29.4,182.2,15000,1500,210,4.0',
      '03/05/2024 10:00:00,-29.5,179.9,800,400,95,4.1',
    ].join('\n'));
    const raw = [
      { datetime: '03/25/2024 10:00:00', lat: '-29.3', lon: '182.1', dep: '12000', herr: '900', gap: '-1', mag: '4.9' },
      { datetime: '03/04/2024 10:00:00', lat: '-29.4', lon: '182.2', dep: '15000', herr: '1500', gap: '210', mag: '4.0' },
      { datetime: '03/05/2024 10:00:00', lat: '-29.5', lon: '179.9', dep: '800', herr: '400', gap: '95', mag: '4.1' },
    ];
    const targets = ['time', 'latitude', 'longitude', 'depth', 'horizontal_uncertainty', 'azimuthal_gap', 'magnitude'];
    result.events.forEach((event, i) => {
      for (const target of targets) {
        const source = result.resolvedFieldSources[target];
        const expected = (event as any)[target] ?? null;
        const normalized = normalizeMappedValue(target, (raw[i] as any)[source], result.fileDecisions, source);
        if (typeof expected === 'number') expect(normalized).toBeCloseTo(expected, 10);
        else expect(normalized).toEqual(expected);
      }
    });
  });
});
