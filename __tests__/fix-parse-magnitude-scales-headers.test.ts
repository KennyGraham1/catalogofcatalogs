/** @jest-environment node */
/**
 * Follow-ups from the upload-mapping work:
 * (1) scale-named magnitude columns other than Mw/ML (mb, mB, Ms, Md, Mwp, MLv ...) are
 *     kept as typed alternatives in `magnitudes` instead of being dropped, and the
 *     preferred magnitude is still Mw, then the generic magnitude, then ML;
 * (2) headers written with spaces, capitals, separators or a bracketed unit
 *     ('Origin Time', 'Horizontal Error', 'Depth (km)') resolve as the upload detector
 *     resolves them, and a unit the header states is honoured.
 */
import { parseCSV, parseJSON } from '@/lib/parsers';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';

const alternatives = (event: any) => (event.magnitudes ? JSON.parse(event.magnitudes) : []);

describe('scale-named magnitude columns other than Mw and ML are kept as alternatives', () => {
  it('Mw stays preferred; mb and Ms are kept, typed from their column names', () => {
    const event: any = parseCSV('time,latitude,longitude,depth,mw,mb,ms\n2011-03-11T05:46:24Z,38.3,142.4,29,9.1,7.2,8.8').events[0];
    expect([event.magnitude, event.magnitude_type]).toEqual([9.1, 'Mw']);
    expect(alternatives(event)).toEqual([
      { type: 'mb', mag: { value: 7.2 } },
      { type: 'Ms', mag: { value: 8.8 } },
    ]);
    // ...and they reach the stored row.
    expect(JSON.parse(parsedEventToDbFields(event).magnitudes as string)).toHaveLength(2);
  });

  it('with a generic magnitude and no Mw or ML column', () => {
    const event: any = parseCSV('time,latitude,longitude,magnitude,magtype,md\n2024-01-01T00:00:00Z,-41,174,3.4,ML,3.1').events[0];
    expect([event.magnitude, event.magnitude_type]).toEqual([3.4, 'ML']);
    expect(alternatives(event)).toEqual([{ type: 'Md', mag: { value: 3.1 } }]);
  });

  it('JSON keys keep a case-distinguished scale (mB) and prefixed names', () => {
    const [event]: any[] = parseJSON(JSON.stringify([{
      time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174,
      ML: 5.9, mB: 6.1, MS: 6.3, mag_Mwp: 6.2, MLv: 5.8,
    }])).events;
    expect([event.magnitude, event.magnitude_type]).toEqual([5.9, 'ML']);
    expect(alternatives(event)).toEqual([
      { type: 'mB', mag: { value: 6.1 } },
      { type: 'Ms', mag: { value: 6.3 } },
      { type: 'Mwp', mag: { value: 6.2 } },
      { type: 'MLv', mag: { value: 5.8 } },
    ]);
  });

  it('the preferred order is unchanged: Mw, then the generic magnitude, then ML', () => {
    const event: any = parseCSV('time,latitude,longitude,ml,magnitude,mw,mb\n2024-01-01T00:00:00Z,-41,174,5.0,5.2,5.4,5.1').events[0];
    expect([event.magnitude, event.magnitude_type]).toEqual([5.4, 'Mw']);
    // The generic column states no scale, so its alternative is typed 'unknown' (as before).
    expect(alternatives(event)).toEqual([
      { type: 'unknown', mag: { value: 5.2 } },
      { type: 'ML', mag: { value: 5.0 } },
      { type: 'mb', mag: { value: 5.1 } },
    ]);
  });

  it('a minute column in split date columns is not the Nuttli magnitude MN', () => {
    const event: any = parseCSV('yr,mo,dy,hr,mn,sc,latitude,longitude,magnitude\n2024,1,15,10,30,5,-41,174,4.2').events[0];
    expect(event.time).toBe('2024-01-15T10:30:05.000Z');
    expect(event.magnitudes).toBeUndefined();
  });

  it('a blank or non-numeric scale cell is not an alternative', () => {
    const event: any = parseCSV('time,latitude,longitude,mw,mb,ms\n2024-01-01T00:00:00Z,-41,174,6.0,,n/a').events[0];
    expect(event.magnitudes).toBeUndefined();
  });
});

describe('another scale is the magnitude of last resort when a row has no Mw, generic or ML magnitude', () => {
  it('an Ms-only file imports with its Ms values', () => {
    const result = parseCSV('time,latitude,longitude,depth,Ms\n1929-06-16T22:47:32Z,-41.7,172.2,15,7.3\n1968-05-23T17:24:17Z,-41.7,172.0,15,7.1');
    expect(result.success).toBe(true);
    expect(result.events.map((e: any) => [e.magnitude, e.magnitude_type])).toEqual([[7.3, 'Ms'], [7.1, 'Ms']]);
    expect(result.events[0].magnitudes).toBeUndefined();
    expect(result.resolvedFieldSources).toMatchObject({ magnitude: 'ms', magnitude_type: 'ms' });
    expect(parsedEventToDbFields(result.events[0])).toMatchObject({ magnitude_type: 'Ms' });
  });

  it('an mb-only file imports with its mb values', () => {
    const result = parseCSV('time,latitude,longitude,depth,mb\n2024-01-01T00:00:00Z,-30.5,-178.1,120,5.2');
    expect(result.success).toBe(true);
    expect([result.events[0].magnitude, (result.events[0] as any).magnitude_type]).toEqual([5.2, 'mb']);
  });

  it('with mb and Ms, Ms is the magnitude and mb is kept as an alternative', () => {
    // mb saturates earlier than Ms, so the surface-wave value is the better size estimate.
    for (const csv of [
      'time,latitude,longitude,depth,mb,ms\n2024-01-01T00:00:00Z,-30.5,-178.1,33,6.1,6.8',
      'time,latitude,longitude,depth,ms,mb\n2024-01-01T00:00:00Z,-30.5,-178.1,33,6.8,6.1',
    ]) {
      const event: any = parseCSV(csv).events[0];
      expect([event.magnitude, event.magnitude_type]).toEqual([6.8, 'Ms']);
      expect(alternatives(event)).toEqual([{ type: 'mb', mag: { value: 6.1 } }]);
    }
  });

  it('follows the documented order: moment-magnitude variants first, then Ms, mB, mb, local, duration', () => {
    const [mww]: any[] = parseJSON(JSON.stringify([{ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, MS: 7.0, Mww: 7.2, mb: 6.2 }])).events;
    expect([mww.magnitude, mww.magnitude_type]).toEqual([7.2, 'Mww']);
    expect(alternatives(mww).map((a: any) => a.type)).toEqual(['Ms', 'mb']);

    const [broadband]: any[] = parseJSON(JSON.stringify([{ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, mb: 5.9, mB: 6.2 }])).events;
    expect([broadband.magnitude, broadband.magnitude_type]).toEqual([6.2, 'mB']);

    const local: any = parseCSV('time,latitude,longitude,md,mlv\n2024-01-01T00:00:00Z,-38.7,176.1,2.1,2.4').events[0];
    expect([local.magnitude, local.magnitude_type]).toEqual([2.4, 'MLv']);
    expect(alternatives(local)).toEqual([{ type: 'Md', mag: { value: 2.1 } }]);
  });

  it('a blank preferred-scale cell falls through to the next scale', () => {
    const event: any = parseCSV('time,latitude,longitude,ms,mb\n2024-01-01T00:00:00Z,-41,174,,5.4').events[0];
    expect([event.magnitude, event.magnitude_type]).toEqual([5.4, 'mb']);
  });

  it('Mw, a generic magnitude or ML still wins over any other scale', () => {
    expect((parseCSV('time,latitude,longitude,ms,ml\n2024-01-01T00:00:00Z,-41,174,6.1,5.8').events[0] as any).magnitude_type).toBe('ML');
    const generic: any = parseCSV('time,latitude,longitude,ms,mag\n2024-01-01T00:00:00Z,-41,174,6.1,5.9').events[0];
    expect(generic.magnitude).toBe(5.9);
    expect(alternatives(generic)).toEqual([{ type: 'Ms', mag: { value: 6.1 } }]);
  });
});

describe('headers are matched the way the upload detector matches them', () => {
  it('spaces, capitals and a bracketed unit', () => {
    const result = parseCSV([
      'Origin Time,Latitude,Longitude,Depth (km),Magnitude,Horizontal Error,Mag Type',
      '2016-11-13 11:02:56,-42.69,173.02,15.1,7.8,1.2,Mw',
    ].join('\n'));
    expect(result.success).toBe(true);
    const event: any = result.events[0];
    expect([event.time, event.depth, event.horizontal_uncertainty, event.magnitude_type])
      .toEqual(['2016-11-13T11:02:56.000Z', 15.1, 1.2, 'Mw']);
    expect(result.resolvedFieldSources).toMatchObject({
      time: 'origin time', depth: 'depth (km)', horizontal_uncertainty: 'horizontal error',
    });
    expect(result.fileDecisions).toMatchObject({ depthUnit: 'km' });
  });

  it('a metre unit in the header converts the depth and a metre uncertainty on its own', () => {
    const metresDepth = parseCSV('time,latitude,longitude,Depth (m),magnitude\n2024-01-01T00:00:00Z,-41,174,800,3');
    expect(metresDepth.events[0].depth).toBeCloseTo(0.8, 10);
    expect(metresDepth.fileDecisions).toMatchObject({ depthUnit: 'm' });

    // Depth in km, horizontal error in metres: only the error is converted.
    const mixed = parseCSV('time,latitude,longitude,Depth (km),magnitude,Horizontal Error (m),Depth Error (km)\n2024-01-01T00:00:00Z,-41,174,12,3,450,2.5');
    const event: any = mixed.events[0];
    expect(event.depth).toBe(12);
    expect(event.horizontal_uncertainty).toBeCloseTo(0.45, 10);
    expect(event.depth_uncertainty).toBe(2.5);
  });

  it('JSON keys with spaces', () => {
    const [event]: any[] = parseJSON(JSON.stringify([{
      'Origin Time': '2024-01-01 00:00:00', Latitude: -41, Longitude: 174, 'Depth (km)': 10, Magnitude: 3, 'Station Count': 12,
    }])).events;
    expect([event.time, event.depth, event.used_station_count]).toEqual(['2024-01-01T00:00:00.000Z', 10, 12]);
  });

  it('a unit the field is not stored in leaves the column unmapped', () => {
    // Latitude errors are stored in degrees; a km column is not silently read as degrees,
    // and a local-time column is not read as UTC.
    const result = parseCSV('Origin Time (NZST),time,latitude,longitude,magnitude,Lat Error (km)\n2024-01-01 13:00:00,2024-01-01T00:00:00Z,-41,174,3,1.5');
    const event: any = result.events[0];
    expect(event.time).toBe('2024-01-01T00:00:00.000Z');
    expect(event.latitude_uncertainty).toBeUndefined();
    expect(result.resolvedFieldSources.time).toBe('time');
  });

  it('headers the parser already resolved keep their resolution', () => {
    const result = parseCSV('datetime,lat,lon,dep,mag,Depth/km\n2024-01-01T00:00:00Z,-41,174,5,3,6');
    expect(result.resolvedFieldSources).toMatchObject({ time: 'datetime', latitude: 'lat', depth: 'dep' });
  });
});
