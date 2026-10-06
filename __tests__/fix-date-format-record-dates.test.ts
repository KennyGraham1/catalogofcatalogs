/**
 * Record dates (a catalogue's creation, an import, a review) are shown ISO-ordered in the
 * reader's zone: the day-first "06/10/2026" read as 10 June to month-first readers.
 */
import { formatLocalDate, formatLocalDateTime } from '@/lib/date-format';

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
  });
});
