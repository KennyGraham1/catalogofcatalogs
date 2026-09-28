/** @jest-environment node */
/**
 * #39: a calendar date and a time of day in separate columns (the ISC bulletin layout
 * DATE,TIME) make one origin time. Both names are aliases of `time`, so whichever
 * claimed the field used to shadow the other: every row was rejected, or a date with
 * hour/minute/second columns was silently stored at midnight.
 */
import { parseCSV, parseJSON } from '@/lib/parsers';

const row = (head: string, cells: string) => `${head}\n${cells}`;

describe('#39: separate date and time-of-day columns are combined', () => {
  it('date,time with fractional seconds', () => {
    const result = parseCSV(row('date,time,latitude,longitude,depth,mag', '2024-01-15,12:34:56.7,-41.2,174.7,10,4.1'));
    expect(result.success).toBe(true);
    expect(result.events[0].time).toBe('2024-01-15T12:34:56.700Z');
    expect(result.resolvedFieldSources.time).toBe('date+time');
  });

  it('in either column order and with capitalised headers', () => {
    expect(parseCSV(row('time,date,latitude,longitude,depth,mag', '12:34:56.7,2024-01-15,-41.2,174.7,10,4.1')).events[0].time)
      .toBe('2024-01-15T12:34:56.700Z');
    expect(parseCSV(row('Date,Time,Latitude,Longitude,Depth,Mag', '2024-01-15,12:34:56,-41.2,174.7,10,4.1')).events[0].time)
      .toBe('2024-01-15T12:34:56.000Z');
  });

  it('the ISC bulletin header', () => {
    const result = parseCSV(row('EVENTID,AUTHOR,DATE,TIME,LAT,LON,DEPTH,MAG', '600123456,ISC,2016/11/13,11:02:56.34,-42.69,173.02,15.1,7.8'));
    expect(result.success).toBe(true);
    expect(result.events[0].time).toBe('2016-11-13T11:02:56.340Z');
  });

  it('a DD/MM date column follows the file-level day/month order', () => {
    const csv = [
      'date,time,latitude,longitude,depth,mag',
      '13/01/2024,12:00:00,-41.2,174.7,10,4.1',
      '03/04/2024,06:30:00,-41.2,174.7,10,4.1',
    ].join('\n');
    expect(parseCSV(csv).events.map((e) => e.time)).toEqual(['2024-01-13T12:00:00.000Z', '2024-04-03T06:30:00.000Z']);
  });

  it('a date with hour/minute/second columns keeps its time of day', () => {
    const result = parseCSV(row('date,hour,minute,second,latitude,longitude,depth,mag', '2024-01-15,12,34,56.7,-41.2,174.7,10,4.1'));
    expect(result.success).toBe(true);
    expect(result.events[0].time).toBe('2024-01-15T12:34:56.700Z');
    expect(result.resolvedFieldSources.time).toBe('date+hour+minute+second');
  });

  it('a time of day with year/month/day columns', () => {
    const result = parseCSV(row('year,month,day,time,latitude,longitude,depth,mag', '2024,1,15,12:34:56,-41.2,174.7,10,4.1'));
    expect(result.events[0].time).toBe('2024-01-15T12:34:56.000Z');
  });

  it('on the JSON path too', () => {
    const result = parseJSON(JSON.stringify([{ date: '2024-01-15', time: '12:34:56', latitude: -41.2, longitude: 174.7, magnitude: 4.1 }]));
    expect(result.events[0].time).toBe('2024-01-15T12:34:56.000Z');
  });

  it('leaves a single time column and a date-only column as they were', () => {
    expect(parseCSV(row('time,latitude,longitude,depth,mag', '2024-01-15T12:34:56.7Z,-41.2,174.7,10,4.1')).events[0].time)
      .toBe('2024-01-15T12:34:56.700Z');
    expect(parseCSV(row('date,latitude,longitude,depth,mag', '2024-01-15,-41.2,174.7,10,4.1')).events[0].time)
      .toBe('2024-01-15T00:00:00.000Z');
    // A full date-time in `time` is not combined with a date column beside it.
    expect(parseCSV(row('date,time,latitude,longitude,depth,mag', '2024-01-14,2024-01-15T12:34:56Z,-41.2,174.7,10,4.1')).events[0].time)
      .toBe('2024-01-15T12:34:56.000Z');
  });
});
