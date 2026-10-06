/**
 * Record dates (a catalogue's creation, an import, a review) are shown ISO-ordered in the
 * reader's zone: the day-first "06/10/2026" read as 10 June to month-first readers.
 */
import fs from 'fs';
import path from 'path';
import { formatLocalDate, formatLocalDateTime, formatLocalTime } from '@/lib/date-format';
import { formatOriginDateUtc } from '@/lib/map-format';

describe('record dates', () => {
  const instant = '2026-10-05T23:30:00Z';

  it('give the calendar day in the reader\'s zone, ISO-ordered', () => {
    expect(formatLocalDate(instant, 'UTC')).toBe('2026-10-05');
    // In New Zealand it is already the next day (NZDT, UTC+13).
    expect(formatLocalDate(instant, 'Pacific/Auckland')).toBe('2026-10-06');
  });

  it('give the date and time with the zone named', () => {
    expect(formatLocalDateTime(instant, 'UTC')).toBe('2026-10-05 23:30 UTC');
    expect(formatLocalDateTime(instant, 'Pacific/Auckland')).toMatch(/^2026-10-06 12:30 (NZDT|GMT\+13)$/);
  });

  it('show a dash for no date and the raw text for an unparseable one', () => {
    expect(formatLocalDate(null)).toBe('—');
    expect(formatLocalDateTime(undefined)).toBe('—');
    expect(formatLocalDate('not a date')).toBe('not a date');
    expect(formatLocalTime(null)).toBe('—');
  });

  it('give the time alone with the zone named (the dashboard\'s Last Updated)', () => {
    expect(formatLocalTime(instant, 'UTC')).toBe('23:30 UTC');
    expect(formatLocalTime(instant, 'Pacific/Auckland')).toMatch(/^12:30 (NZDT|GMT\+13)$/);
  });
});

describe('event dates', () => {
  it('are the UTC calendar day, named as UTC', () => {
    // 00:02 NZDT on 14 November is still 13 November in UTC.
    expect(formatOriginDateUtc('2016-11-13T11:02:56Z')).toBe('2016-11-13 UTC');
    expect(formatOriginDateUtc('not a time')).toBe('not a time');
  });
});

describe('no numeric day-first dates are left in the UI', () => {
  // toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', ... }) printed "06/10/2026".
  const roots = ['app', 'components'].map((dir) => path.join(__dirname, '..', dir));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  roots.forEach(walk);

  it('in app/ or components/', () => {
    const numericDayFirst = /toLocale(Date)?String\(\s*'en-GB'\s*,\s*\{[^}]*month:\s*'2-digit'/s;
    const offenders = files
      .filter((file) => numericDayFirst.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(path.join(__dirname, '..'), file));
    expect(files.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
