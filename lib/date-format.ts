/**
 * Dates of records (a catalogue's creation, an import, a review) in the reader's own time
 * zone, ISO-ordered so they cannot be misread: "2026-10-06", or "2026-10-06 14:05 NZDT"
 * with the time and the zone named. Event origin times are a different thing and are
 * always UTC (lib/map-format.ts formatOriginTimeUtc).
 *
 * The day-first "06/10/2026" these replace read as 10 June to month-first readers.
 */

type DateInput = string | number | Date | null | undefined;

const DATE_PARTS = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
const DATE_TIME_PARTS = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23', timeZoneName: 'short',
});

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partsOf(format: Intl.DateTimeFormat, date: Date) {
  const parts = format.formatToParts(date);
  return (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
}

/** "2026-10-06" in the reader's zone; '—' when there is no date, the raw text when unparseable. */
export function formatLocalDate(value: DateInput, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return value ? String(value) : '—';
  const get = partsOf(timeZone ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }) : DATE_PARTS, date);
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "2026-10-06 14:05 NZDT" in the reader's zone, with the zone named. */
export function formatLocalDateTime(value: DateInput, timeZone?: string): string {
  const date = toDate(value);
  if (!date) return value ? String(value) : '—';
  const format = timeZone
    ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short', timeZone })
    : DATE_TIME_PARTS;
  const get = partsOf(format, date);
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
}
