/**
 * Regression tests for the import-logic fixes:
 *  - UTC timestamp parsing (offset-less datetimes must NOT shift with server TZ)
 *  - RFC 4180 CSV parsing (escaped quotes, embedded newlines, preserved whitespace)
 *  - GeoNet EventType normalization (unknown types -> null, not a thrown batch abort)
 */
import { normalizeTimestamp } from '@/lib/earthquake-utils';
import { parseWithDelimiter } from '@/lib/delimiter-detector';
import { normalizeEventType } from '@/lib/db';

describe('normalizeTimestamp — offset-less timestamps are UTC (TZ-independent)', () => {
  it('space-separated datetime with no zone is treated as UTC', () => {
    expect(normalizeTimestamp('2024-01-01 12:00:00')).toBe('2024-01-01T12:00:00.000Z');
  });
  it('T-separated datetime with no zone is treated as UTC', () => {
    expect(normalizeTimestamp('2024-03-15T08:22:31')).toBe('2024-03-15T08:22:31.000Z');
  });
  it('date-only is midnight UTC', () => {
    expect(normalizeTimestamp('2024-01-01')).toBe('2024-01-01T00:00:00.000Z');
  });
  it('explicit Z is honoured', () => {
    expect(normalizeTimestamp('2024-01-01T12:00:00Z')).toBe('2024-01-01T12:00:00.000Z');
  });
  it('explicit offset is honoured (NZST +12 -> UTC)', () => {
    expect(normalizeTimestamp('2024-01-01T12:00:00+12:00')).toBe('2024-01-01T00:00:00.000Z');
  });
  it('fractional seconds preserved as UTC', () => {
    expect(normalizeTimestamp('2024-01-01 12:00:00.500')).toBe('2024-01-01T12:00:00.500Z');
  });
});

describe('parseWithDelimiter — RFC 4180', () => {
  it('un-escapes doubled quotes and preserves the literal quote', () => {
    const { headers, rows } = parseWithDelimiter('a,"He said ""hi""",c\n1,2,3', ',');
    expect(headers).toEqual(['a', 'he said "hi"', 'c']);
    expect(rows).toEqual([['1', '2', '3']]);
  });
  it('keeps embedded newlines inside quoted fields (no row tearing)', () => {
    const { headers, rows } = parseWithDelimiter('name,val\n"line1\nline2",7', ',');
    expect(headers).toEqual(['name', 'val']);
    expect(rows).toEqual([['line1\nline2', '7']]);
  });
  it('preserves whitespace inside quotes, trims unquoted tokens', () => {
    const { rows } = parseWithDelimiter('h1,h2\n"  spaced  ",  bare  ', ',');
    expect(rows[0]).toEqual(['  spaced  ', 'bare']);
  });
  it('handles CRLF and quoted embedded delimiters', () => {
    const { rows } = parseWithDelimiter('a,b\r\n"x,y",z\r\n', ',');
    expect(rows).toEqual([['x,y', 'z']]);
  });
});

describe('normalizeEventType', () => {
  it('keeps valid QuakeML types (case-insensitive)', () => {
    expect(normalizeEventType('earthquake')).toBe('earthquake');
    expect(normalizeEventType('Quarry Blast')).toBe('quarry blast');
  });
  it('maps unknown GeoNet flags to null instead of throwing', () => {
    expect(normalizeEventType('outside of network interest')).toBeNull();
    expect(normalizeEventType('duplicate')).toBeNull();
    expect(normalizeEventType('')).toBeNull();
    expect(normalizeEventType(null)).toBeNull();
    expect(normalizeEventType(undefined)).toBeNull();
  });
});

import { parseCSV } from '@/lib/parsers';

describe('longitude 0-360 normalization on CSV import', () => {
  it('normalizes lon > 180 to -180..180 so valid Pacific/NZ rows survive validation', () => {
    const csv = 'time,latitude,longitude,magnitude\n2024-01-01T00:00:00Z,-30,185,5.0';
    const r = parseCSV(csv);
    expect(r.success).toBe(true);
    expect(r.events).toHaveLength(1);
    expect((r.events[0] as any).longitude).toBeCloseTo(-175, 6); // 185 - 360
  });
  it('leaves normal longitudes unchanged', () => {
    const csv = 'time,latitude,longitude,magnitude\n2024-01-01T00:00:00Z,-41,174.5,4.0';
    const ev = parseCSV(csv).events[0] as any;
    expect(ev.longitude).toBeCloseTo(174.5, 6);
  });
});
