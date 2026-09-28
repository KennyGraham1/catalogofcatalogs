/**
 * Utility functions for earthquake data processing
 */

// Import canonical EarthquakeEvent type from central types module
import { EarthquakeEvent } from '@/types/earthquake';
import { dedupeById } from '@/lib/utils';
import type { DateFormat } from './date-format-detector';

// Re-export for backwards compatibility with existing imports
export type { EarthquakeEvent } from '@/types/earthquake';

/**
 * Minimal event interface for sampling functions
 * Allows any event type with the required fields for sampling
 */
interface SampleableEvent {
  id?: string | number | null;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
}

/**
 * Get color for earthquake markers based on depth (GeoNet style)
 * Implements a cyan-to-dark-teal gradient matching GeoNet NZ earthquake maps
 * Shallow events (< 15km) are bright cyan, deep events (>= 200km) are navy
 * @param depth - Depth in kilometers
 * @param isDark - Whether dark theme is active
 * @returns Color hex code
 */
export function getEarthquakeColor(depth: number | null | undefined, isDark: boolean = false): string {
  // Handle missing or null depth - use a neutral color
  if (depth === null || depth === undefined || isNaN(depth)) {
    return isDark ? '#9ca3af' : '#6b7280';  // gray for unknown depth
  }

  // Shallow events: bright cyan (most visible) - < 15km
  if (depth < 15) return isDark ? '#06B6D4' : '#00CED1';  // cyan-500 / medium cyan

  // Medium-shallow: teal - 15-40km
  if (depth < 40) return isDark ? '#14B8A6' : '#20B2AA';  // teal-500 / light sea green

  // Medium: darker teal - 40-100km
  if (depth < 100) return isDark ? '#0D9488' : '#008B8B';  // teal-600 / dark cyan

  // Deep: very dark teal - 100-200km
  if (depth < 200) return isDark ? '#0F766E' : '#006666';  // teal-700 / darker teal

  // Very deep: navy - >= 200km
  return isDark ? '#115E59' : '#004D4D';  // teal-800 / very dark teal
}

/**
 * Get color for earthquake markers (single color for all magnitudes)
 * Magnitude is now represented by size only, not color
 * @param _magnitude - Magnitude value (unused, kept for API compatibility)
 * @deprecated Use getEarthquakeColor() for depth-based coloring
 */
export function getMagnitudeColor(_magnitude: number): string {
  return '#3b82f6'; // blue-500 - uniform color for all earthquake events
}

/**
 * Get radius for map visualization based on magnitude
 * Returns radius in meters for Leaflet Circle component
 */
export function getMagnitudeRadius(magnitude: number): number {
  // Handle edge cases - return base radius for invalid values
  if (magnitude === null || magnitude === undefined || isNaN(magnitude)) {
    return 3000; // Default 3km for unknown magnitude
  }

  // Clamp magnitude to reasonable range (0 to 10)
  const clampedMag = Math.max(0, Math.min(10, magnitude));

  // Fixed lookup table: index corresponds to Math.floor(magnitude)
  // Linear progression: each magnitude increment adds 3km to radius
  const radii = [
    3000,  // M0: 3km (base)
    3000,  // M1: 3km (same as base for very small events)
    6000,  // M2: 6km
    9000,  // M3: 9km
    12000, // M4: 12km
    15000, // M5: 15km
    18000, // M6: 18km
    21000, // M7+: 21km (capped)
  ];

  // Get the index from floored magnitude, cap at 7 for M7+
  const index = Math.min(Math.floor(clampedMag), 7);

  return radii[index];
}

/**
 * Screen-pixel radius for CircleMarker rendering. Unlike getMagnitudeRadius (which
 * returns metres for a geographic Circle and must be reprojected on every zoom),
 * a pixel radius lets Leaflet's canvas renderer draw thousands of points cheaply and
 * keeps marker sizes legible at every zoom level. Mirrors the same magnitude tiers.
 */
export function getMagnitudePixelRadius(magnitude: number): number {
  if (magnitude === null || magnitude === undefined || isNaN(magnitude)) {
    return 3;
  }
  const clampedMag = Math.max(0, Math.min(10, magnitude));
  const radii = [3, 3, 4, 5, 6, 8, 10, 12];
  return radii[Math.min(Math.floor(clampedMag), 7)];
}

/**
 * Get human-readable label for magnitude.
 *
 * Richter-style descriptor classes: Great >= 8, Major 7-7.9, Strong 6-6.9,
 * Moderate 5-5.9, Light 4-4.9, Minor 2-3.9, Micro < 2. These are the bands
 * lib/chart-config.ts magnitudeClass uses for chart tooltips, so a map popup and a
 * chart describe the same event the same way (an Mw 8.1 is 'Great' in both).
 */
export function getMagnitudeLabel(magnitude: number): string {
  // A missing magnitude fell through every comparison and was labelled 'Minor'.
  if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) return 'Unknown';
  if (magnitude >= 8.0) return 'Great';
  if (magnitude >= 7.0) return 'Major';
  if (magnitude >= 6.0) return 'Strong';
  if (magnitude >= 5.0) return 'Moderate';
  if (magnitude >= 4.0) return 'Light';
  if (magnitude >= 2.0) return 'Minor';
  return 'Micro';
}

/**
 * Calculate distance between two points using Haversine formula
 * @param lat1 Latitude of first point in degrees
 * @param lon1 Longitude of first point in degrees
 * @param lat2 Latitude of second point in degrees
 * @param lon2 Longitude of second point in degrees
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate time difference in seconds between two timestamps
 */
export function calculateTimeDifference(time1: string, time2: string): number {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  return Math.abs(date1.getTime() - date2.getTime()) / 1000;
}

/**
 * Validate earthquake coordinates
 */
export function validateCoordinates(latitude: number, longitude: number): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/**
 * Validate earthquake magnitude
 */
export function validateMagnitude(magnitude: number): boolean {
  return magnitude >= -3 && magnitude <= 10;
}

/**
 * Validate earthquake depth
 */
export function validateDepth(depth: number | null): boolean {
  if (depth === null) return true;
  return depth >= -5 && depth <= 1000; // -5km allows above-sea-level events (volcanic, mining)
}

/**
 * Normalize timestamp to ISO 8601 format (UTC, millisecond precision).
 *
 * Origin times are UTC by definition (QuakeML 1.2, FDSN, ISO 8601), so a string
 * without a zone designator is READ AS UTC and a string with one (Z, UTC, GMT, +13:00,
 * -0500, UTC+13) is converted from that offset. Every supported shape is parsed into
 * calendar parts here and assembled with Date.UTC: nothing is handed to new Date() as
 * a string, because V8 reads offset-less and non-ISO strings as SERVER-LOCAL time,
 * which made stored origin times depend on the host's TZ. Unrecognised shapes and
 * impossible calendar values (31 February, day-of-year 366 in 2023) return null
 * rather than rolling over into a different, valid-looking date.
 *
 * Supported shapes (T or whitespace between date and time; seconds and any number of
 * fractional-second digits optional, truncated to milliseconds):
 * - ISO 8601 / year-first: 2024-01-15T10:30:00.123456789Z, 2024-01-15 10:30,
 *   2024/01/15, 2024.01.15 10:30:00
 * - Day/month-first: DD/MM/YYYY or MM/DD/YYYY (slash or dash), DD.MM.YYYY; the order
 *   is decided by a day > 12, otherwise by `dateFormat` (DD/MM when absent). Slash
 *   and dot forms also take a two-digit year: the latest year with those digits that
 *   is not after the current year ('24' -> 2024, '95' -> 1995), as an origin time
 *   cannot be in the future.
 * - Month names: 15 Jan 2024 10:30:00, 15-JAN-24, Jan 15 2024, January 15, 2024 10:30,
 *   with an optional weekday (RFC 2822 'Mon, 15 Jan 2024 10:30:00 +1300')
 * - Compact: YYYYMMDD, YYYYMMDD HHMMSS, YYYYMMDDHHMMSS, 20240115T103000Z
 * - Day of year: YYYY DDD HH:MM:SS, YYYY-DDD HH:MM:SS, YYYYDDDHHMMSS
 * - Unix epoch: numbers, or 10-digit (seconds) / 13-digit (milliseconds) strings
 */
export function normalizeTimestamp(time: string | number, dateFormat?: 'US' | 'International'): string | null {
  if (typeof time === 'number') {
    if (!Number.isFinite(time)) return null;
    // Bare epoch number of unknown unit: seconds when the MAGNITUDE is below 1e11
    // (year 1000 is -3.06e10 s; 1e11 ms is only 1973-03-03), otherwise milliseconds.
    // The sign must not decide: a negative epoch (before 1970) was compared as
    // "< 1e10" and multiplied by 1000, sending 1960 to the year -8032.
    // Producers whose unit is known (USGS GeoJSON, milliseconds) convert before
    // reaching here.
    const timestamp = Math.abs(time) < 100000000000 ? time * 1000 : time;
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    return null;
  }

  if (typeof time !== 'string') {
    return null;
  }

  const trimmed = time.trim();
  if (trimmed === '') return null;

  const zone = splitZoneDesignator(trimmed);
  const parsed = parseCalendarParts(zone.body, dateFormat);
  if (parsed === 'invalid') return null;
  if (parsed !== null) return assembleUtcTimestamp(parsed, zone.offsetMinutes);

  // Unix epoch supplied as a string. The numeric branch at the top of this function
  // is unreachable for file imports, because parsers hand over the raw cell text, so
  // the epoch support promised above has to be honoured for digit strings as well:
  // 10 digits are seconds and 13 are milliseconds, the same split the numeric branch
  // applies. No other supported format is a bare 10- or 13-digit string once the
  // compact day-of-year form has had its (year-restricted) turn.
  if (zone.offsetMinutes === 0 && zone.body === trimmed && /^\d{10}$|^\d{13}$/.test(trimmed)) {
    return normalizeTimestamp(Number(trimmed), dateFormat);
  }

  // No last-resort new Date(string): a shape none of the parsers above recognises is
  // rejected, so an origin time can never be read in the server's local time.
  return null;
}

/** Earliest origin time accepted: year 1000 CE, a reasonable lower bound for historical seismology. */
const MIN_VALID_TIME_MS = Date.UTC(1000, 0, 1);

/** Calendar parts of a timestamp, before any zone offset is applied. */
interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const MONTH_NUMBERS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const WEEKDAY_NAMES = new Set([
  'mon', 'monday', 'tue', 'tues', 'tuesday', 'wed', 'wednesday', 'thu', 'thur', 'thurs',
  'thursday', 'fri', 'friday', 'sat', 'saturday', 'sun', 'sunday',
]);

// HH:MM[:SS[.fraction]] and the separator between a date and its time of day.
const TIME_OF_DAY = '(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2})(?:[.,](\\d+))?)?';
const DATE_TIME_SEPARATOR = '(?:[Tt]|\\s+)';

// 2024-01-15, 2024/01/15, 2024.01.15 (ISO 8601 and its year-first variants)
const YEAR_FIRST = new RegExp(`^(\\d{4})([-/.])(\\d{1,2})\\2(\\d{1,2})(?:${DATE_TIME_SEPARATOR}${TIME_OF_DAY})?$`);
// DD/MM/YYYY or MM/DD/YYYY (and YY), DD-MM-YYYY or MM-DD-YYYY
const DAY_MONTH_SLASH = new RegExp(`^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4}|\\d{2})(?:${DATE_TIME_SEPARATOR}${TIME_OF_DAY})?$`);
const DAY_MONTH_DASH = new RegExp(`^(\\d{1,2})-(\\d{1,2})-(\\d{4})(?:${DATE_TIME_SEPARATOR}${TIME_OF_DAY})?$`);
// DD.MM.YYYY (and YY): the dotted form is day-first wherever it is used
const DAY_MONTH_DOT = new RegExp(`^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})(?:${DATE_TIME_SEPARATOR}${TIME_OF_DAY})?$`);
// YYYYMMDD, YYYYMMDD HHMMSS, YYYYMMDDHHMMSS, YYYYMMDDTHHMMSS (ISO 8601 basic format)
const COMPACT = /^(\d{4})(\d{2})(\d{2})(?:(?:[Tt]|\s+)?(\d{2})(\d{2})(\d{2})(?:[.,](\d+))?)?$/;
const COMPACT_DATE_WITH_TIME = new RegExp(`^(\\d{4})(\\d{2})(\\d{2})${DATE_TIME_SEPARATOR}${TIME_OF_DAY}$`);
// YYYY DDD HH:MM:SS and YYYY-DDD HH:MM:SS (day of year, common in seismology)
const DAY_OF_YEAR = /^(\d{4})(?:\s+|-)(\d{1,3})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/;
// YYYYDDDHHMMSS: shape-identical to a 13-digit Unix millisecond epoch (see below)
const COMPACT_DAY_OF_YEAR = /^(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(?:[.,](\d+))?$/;
// [Weekday,] 15 Jan 2024 [time], 15-JAN-24
const DAY_MONTHNAME_YEAR = new RegExp(
  `^(?:([A-Za-z]{3,9})\\.?,?\\s+)?(\\d{1,2})(?:\\s+|-)([A-Za-z]{3,9})\\.?(?:\\s+|-)(\\d{4}|\\d{2})(?:${DATE_TIME_SEPARATOR}${TIME_OF_DAY})?$`
);
// [Weekday,] Jan 15 2024 [time], January 15, 2024 [time]
const MONTHNAME_DAY_YEAR = new RegExp(
  `^(?:([A-Za-z]{3,9})\\.?,?\\s+)?([A-Za-z]{3,9})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?:(?:,?\\s+|[Tt])${TIME_OF_DAY})?$`
);

/**
 * Split a trailing zone designator from a timestamp: Z, UT/UTC/GMT (optionally with
 * an offset, as in 'GMT+1300 (New Zealand Daylight Time)'), or a numeric offset
 * (+13:00, +1300, +13, -05:00). A numeric offset must follow a time of day: the '-15'
 * that ends the bare date 2024-01-15 is its day, not a zone. Named local zones (EST,
 * NZDT, CST...) are not accepted: several are ambiguous, and an origin time the
 * parser cannot place exactly is rejected rather than guessed.
 */
function splitZoneDesignator(value: string): { body: string; offsetMinutes: number } {
  const match = value.match(
    /^(.*\d)\s*(?:(Z)|(UTC|GMT|UT)(?:\s*([+-])(\d{1,2})(?::?(\d{2}))?)?|([+-])(\d{2})(?::?(\d{2}))?)\s*(?:\([^()]*\))?$/i
  );
  if (!match) return { body: value, offsetMinutes: 0 };
  const [, body, zulu, named, namedSign, namedHours, namedMinutes = '0', sign, hours, minutes = '0'] = match;
  if (zulu !== undefined || (named !== undefined && namedSign === undefined)) {
    return { body: body.trim(), offsetMinutes: 0 };
  }
  const endsWithTimeOfDay = /(?:\d:\d{1,2}(?::\d{1,2}(?:[.,]\d+)?)?|[Tt\s]\d{4}(?:\d{2}(?:[.,]\d+)?)?)$/.test(body);
  if (named === undefined && !endsWithTimeOfDay) return { body: value, offsetMinutes: 0 };
  const offsetSign = (namedSign ?? sign) === '-' ? -1 : 1;
  const offsetHours = parseInt(namedHours ?? hours, 10);
  const offsetMinutesPart = parseInt(named !== undefined ? namedMinutes : minutes, 10);
  if (offsetHours > 23 || offsetMinutesPart > 59) return { body: value, offsetMinutes: NaN };
  return { body: body.trim(), offsetMinutes: offsetSign * (offsetHours * 60 + offsetMinutesPart) };
}

/**
 * Read the calendar parts of a zone-less timestamp. Returns null when no supported
 * shape matches, and 'invalid' when a shape matches but its values cannot be a date.
 */
function parseCalendarParts(body: string, dateFormat?: 'US' | 'International'): CalendarParts | 'invalid' | null {
  let m: RegExpMatchArray | null;

  if ((m = body.match(YEAR_FIRST))) {
    return withTimeOfDay(Number(m[1]), Number(m[3]), Number(m[4]), m, 5);
  }

  if ((m = body.match(DAY_MONTH_SLASH)) || (m = body.match(DAY_MONTH_DASH))) {
    const order = resolveDayMonthOrder(Number(m[1]), Number(m[2]), dateFormat);
    if (!order) return 'invalid';
    return withTimeOfDay(expandYear(m[3]), order.month, order.day, m, 4);
  }

  if ((m = body.match(DAY_MONTH_DOT))) {
    return withTimeOfDay(expandYear(m[3]), Number(m[2]), Number(m[1]), m, 4);
  }

  if ((m = body.match(COMPACT))) {
    const [, y, mo, d, h = '0', mi = '0', s = '0', fraction = ''] = m;
    return checkedParts(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s), fraction);
  }

  if ((m = body.match(COMPACT_DATE_WITH_TIME))) {
    return withTimeOfDay(Number(m[1]), Number(m[2]), Number(m[3]), m, 4);
  }

  if ((m = body.match(DAY_OF_YEAR))) {
    const [, y, doy, h, mi, s, fraction = ''] = m;
    return dayOfYearParts(Number(y), Number(doy), Number(h), Number(mi), Number(s), fraction);
  }

  // YYYYDDDHHMMSS is shape-identical to a 13-digit Unix millisecond epoch, which CSV
  // imports always deliver as a string. The two are separated by the leading year:
  // epoch-ms values only reach a 19xx leading group in 2030-03 (1.9e12 ms) and a 20xx
  // group in 2033-05 (2.0e12 ms), so a day-of-year year >= 1900 is unambiguous, while
  // 1000-1899 (1.0e12-1.8e12 ms = 2001-2027) is an epoch and is left to the caller.
  if ((m = body.match(COMPACT_DAY_OF_YEAR)) && Number(m[1]) >= 1900) {
    const [, y, doy, h, mi, s, fraction = ''] = m;
    return dayOfYearParts(Number(y), Number(doy), Number(h), Number(mi), Number(s), fraction);
  }

  if ((m = body.match(DAY_MONTHNAME_YEAR))) {
    const month = monthFromName(m[3]);
    if (month === null || !isWeekdayOrAbsent(m[1])) return null;
    return withTimeOfDay(expandYear(m[4]), month, Number(m[2]), m, 5);
  }

  if ((m = body.match(MONTHNAME_DAY_YEAR))) {
    const month = monthFromName(m[2]);
    if (month === null || !isWeekdayOrAbsent(m[1])) return null;
    return withTimeOfDay(Number(m[4]), month, Number(m[3]), m, 5);
  }

  return null;
}

/** Calendar parts from a date plus the optional TIME_OF_DAY groups starting at `index`. */
function withTimeOfDay(year: number, month: number, day: number, m: RegExpMatchArray, index: number): CalendarParts | 'invalid' {
  const hour = m[index] === undefined ? 0 : Number(m[index]);
  const minute = m[index + 1] === undefined ? 0 : Number(m[index + 1]);
  const second = m[index + 2] === undefined ? 0 : Number(m[index + 2]);
  return checkedParts(year, month, day, hour, minute, second, m[index + 3] ?? '');
}

/**
 * Validate calendar parts. Day 31 of a 30-day month, February 29 outside a leap year
 * and month 13 are rejected: Date.UTC would silently roll them into the next month.
 * Second 60 (a leap second) is accepted and carried into the next minute, as JS time
 * has no leap seconds; 24:00:00 is the end of the day (ISO 8601).
 */
function checkedParts(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number, fraction: string
): CalendarParts | 'invalid' {
  // Date.UTC maps years 0-99 to 1900-1999, and nothing before year 1000 is accepted.
  if (!Number.isInteger(year) || year < 1000) return 'invalid';
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return 'invalid';
  if (hour > 24 || minute > 59 || second > 60) return 'invalid';
  const millisecond = fraction === '' ? 0 : Number(fraction.slice(0, 3).padEnd(3, '0'));
  if (hour === 24 && (minute !== 0 || second !== 0 || millisecond !== 0)) return 'invalid';
  return { year, month, day, hour, minute, second, millisecond };
}

/** Calendar parts from a year and day-of-year, which must exist in that year. */
function dayOfYearParts(
  year: number, dayOfYear: number, hour: number, minute: number, second: number, fraction: string
): CalendarParts | 'invalid' {
  if (!Number.isInteger(year) || year < 1000) return 'invalid';
  if (dayOfYear < 1 || dayOfYear > (isLeapYear(year) ? 366 : 365)) return 'invalid';
  const date = new Date(Date.UTC(year, 0, dayOfYear));
  return checkedParts(year, date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, second, fraction);
}

/** The instant the parts name at the given zone offset, as an ISO 8601 UTC string. */
function assembleUtcTimestamp(parts: CalendarParts, offsetMinutes: number): string | null {
  if (!Number.isFinite(offsetMinutes)) return null;
  const local = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  const instant = local - offsetMinutes * 60000;
  if (!Number.isFinite(instant) || instant < MIN_VALID_TIME_MS) return null;
  const iso = new Date(instant).toISOString();
  // Years after 9999 render in expanded form (+010000-...); keep the plain form only.
  return iso.startsWith('+') || iso.startsWith('-') ? null : iso;
}

/** Decide day and month from the values, falling back to the file's format (DD/MM by default). */
function resolveDayMonthOrder(first: number, second: number, dateFormat?: 'US' | 'International'): { day: number; month: number } | null {
  if (first > 12 && second <= 12) return { day: first, month: second };   // unambiguous DD/MM
  if (first <= 12 && second > 12) return { day: second, month: first };   // unambiguous MM/DD
  if (first > 12 && second > 12) return null;                             // neither is a month
  return dateFormat === 'US' ? { day: second, month: first } : { day: first, month: second };
}

/**
 * A four-digit year as written; a two-digit year is the latest year with those digits
 * that is not after the current one (an origin time is never in the future).
 */
function expandYear(text: string): number {
  const year = Number(text);
  if (text.length !== 2) return year;
  const current = new Date().getUTCFullYear();
  return current - ((((current - year) % 100) + 100) % 100);
}

function monthFromName(name: string): number | null {
  return MONTH_NUMBERS[name.toLowerCase()] ?? null;
}

function isWeekdayOrAbsent(name: string | undefined): boolean {
  return name === undefined || WEEKDAY_NAMES.has(name.toLowerCase());
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Validate earthquake timestamp
 */
export function validateTimestamp(time: string | number): boolean {
  return normalizeTimestamp(time) !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell normalisation shared by the file parsers and the upload mapping step
// (contract C14). The parsers resolve each canonical field once, with file-level
// decisions; a column the user remaps afterwards must go through the same rules,
// or the mapping step silently undoes them. This module has no Node-only imports,
// so the browser can use it too.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File-level decisions a parser applied to every row of one file. Absent members
 * did not apply to the file (a QuakeML file has no day/month order to decide).
 */
export interface ParseFileDecisions {
  /**
   * Day/month order used for ambiguous numeric dates (03/04/2024): the caller's
   * declared format, or the one detected from the file's WHOLE time column(s).
   */
  dateFormat?: DateFormat;
  dateFormatSource?: 'declared' | 'detected';
  /**
   * Unit the file reports depth in. For 'm' the depth and its length uncertainties
   * (depth, horizontal, min/max horizontal) were divided by 1000 to kilometres.
   */
  depthUnit?: 'km' | 'm';
  depthUnitReason?: string;
  /**
   * Longitudes on the 0-360 convention (180 < lon <= 360) are always wrapped to
   * -180..180; this counts the events that were.
   */
  wrappedLongitudes?: number;
  /** Depths outside -5..1000 km that were set to unknown (the event is kept). */
  outOfRangeDepths?: number;
  /** Negative sentinel values (-1, -999 ...) in non-negative columns read as missing. */
  sentinelValues?: number;
  /**
   * Units of flat moment-tensor columns: 'N-m' as given, or 'dyne-cm' for GeoNet CMT
   * files (components in 1e20 dyne.cm, Mo in dyne.cm) converted to N.m.
   */
  momentTensorUnits?: 'N-m' | 'dyne-cm';
}

/** Canonical event fields that hold numbers (read with parseStrictNumber). */
export const NUMERIC_EVENT_FIELDS: ReadonlySet<string> = new Set([
  'latitude', 'longitude', 'depth', 'magnitude',
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
  'depth_uncertainty', 'horizontal_uncertainty', 'magnitude_uncertainty',
  'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'azimuth_max_horizontal_uncertainty',
  'confidence_level',
  'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
  'minimum_distance', 'maximum_distance', 'associated_phase_count',
  'associated_station_count', 'depth_phase_count', 'magnitude_station_count',
]);

/**
 * Lengths stored in kilometres. A file that reports depth in metres reports these in
 * metres too, so they take the depth's unit decision.
 */
export const KILOMETRE_LENGTH_FIELDS: ReadonlySet<string> = new Set([
  'depth', 'depth_uncertainty', 'horizontal_uncertainty',
  'min_horizontal_uncertainty', 'max_horizontal_uncertainty',
]);

/**
 * Optional quantities that cannot be negative (the ranges lib/db.ts EVENT_OPTIONAL_RANGES
 * enforces start at 0). Bulletins write -1, -9 or -999 in them for "not determined", so a
 * negative value is read as missing instead of as a measurement. The ellipse azimuth is
 * not here: some producers write it on -180..180.
 */
export const NON_NEGATIVE_EVENT_FIELDS: ReadonlySet<string> = new Set([
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty', 'depth_uncertainty',
  'horizontal_uncertainty', 'min_horizontal_uncertainty', 'max_horizontal_uncertainty',
  'magnitude_uncertainty', 'confidence_level', 'azimuthal_gap', 'standard_error',
  'minimum_distance', 'maximum_distance', 'used_phase_count', 'used_station_count',
  'associated_phase_count', 'associated_station_count', 'depth_phase_count', 'magnitude_station_count',
]);

const STRICT_NUMERIC_LITERAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A cell as a number, or null. A numeric field holds a numeric literal: parseFloat's
 * prefix tolerance turned "4.1garbage" into 4.1 without a trace. Thousands separators
 * and a trailing '%' or unit are not accepted; a column's unit is decided per file.
 */
export function parseStrictNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  if (str === '' || !STRICT_NUMERIC_LITERAL.test(str)) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Longitude on the 0-360 convention (180 < lon <= 360) as -180..180, so valid
 * Pacific/NZ events east of the antimeridian (Kermadec 182.7) are not rejected.
 */
export function wrapLongitude(longitude: number): number {
  return longitude > 180 && longitude <= 360 ? longitude - 360 : longitude;
}

/** The length unit a column name states ('Depth/km', 'depth_m'), or null when it states none. */
export function lengthUnitFromColumnName(column: string | null | undefined): 'km' | 'm' | null {
  const name = (column ?? '').toLowerCase().replace(/[\s)\]]+$/, '');
  if (!name) return null;
  if (/(?:^|[^a-z])(?:km|kilomet(?:re|er)s?)$/.test(name)) return 'km';
  if (/(?:^|[^a-z])(?:m|met(?:re|er)s?)$/.test(name)) return 'm';
  return null;
}

/** Canonical spellings of magnitude scale codes, by their case- and separator-free form. */
const MAGNITUDE_SCALE_CODES: Record<string, string> = {
  ml: 'ML', mlv: 'MLv', mlr: 'MLr', mw: 'Mw', mww: 'Mww', mwc: 'Mwc', mwb: 'Mwb', mwr: 'Mwr',
  mwp: 'Mwp', mi: 'Mi', mb: 'mb', mblg: 'mb_Lg', ms: 'Ms', msbb: 'Ms_BB', md: 'Md', mc: 'Mc',
  me: 'Me', mh: 'Mh', mj: 'Mj', mjma: 'Mj', mn: 'MN', mt: 'Mt',
};

/**
 * The magnitude scale a column name states ('ML', 'mb', 'mag_Ms', 'Mw_magnitude'), or
 * null for a generic magnitude column. A name whose case already distinguishes the
 * scale ('mB', broadband body-wave, as JSON keys keep it) is kept as written.
 */
export function inferMagnitudeTypeFromColumn(column: string | null | undefined): string | null {
  if (!column) return null;
  const core = column.trim()
    .replace(/^mag(?:nitude)?[\s_.(-]*/i, '')
    .replace(/[\s_.(-]*(?:mag(?:nitude)?)?\)?$/i, '');
  if (!core) return null;
  if (core === 'mB') return 'mB';
  return MAGNITUDE_SCALE_CODES[core.toLowerCase().replace(/[\s_-]/g, '')] ?? null;
}

/** A value the parser stores for one field, plus fields it derives from the same cell. */
export interface NormalizedMappedField {
  /** The stored value: an ISO 8601 UTC time, a number, or the cell; null when blank or invalid. */
  value: unknown;
  /** Companion fields, e.g. magnitude_type 'mb' from a magnitude read out of an 'mb' column. */
  derived: Record<string, unknown>;
}

/**
 * Turn one raw cell into what the parser stores for `target`, with the file's decisions:
 * - time: UTC ISO 8601 with the file's day/month order (see normalizeTimestamp)
 * - numeric fields: strict number; longitude wrapped from 0-360; depth and its length
 *   uncertainties converted to km when the column name or the file says metres; a depth
 *   outside -5..1000 km is unknown; a negative sentinel in a non-negative field is missing
 * - magnitude: also derives magnitude_type from a scale-named column (ML, Mw, mb, Ms, Md ...)
 * - magnitude_type: the cell, or the scale the source column's name states
 * - anything else: the cell as given (blank is null)
 */
export function normalizeMappedField(
  target: string,
  raw: unknown,
  decisions?: ParseFileDecisions | null,
  sourceColumn?: string
): NormalizedMappedField {
  const derived: Record<string, unknown> = {};
  const blank = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');

  if (target === 'time') {
    if (blank || (typeof raw !== 'string' && typeof raw !== 'number')) return { value: null, derived };
    const hint = decisions?.dateFormat === 'US' || decisions?.dateFormat === 'International'
      ? decisions.dateFormat
      : undefined;
    return { value: normalizeTimestamp(raw, hint), derived };
  }

  if (NUMERIC_EVENT_FIELDS.has(target)) {
    let value = parseStrictNumber(raw);
    if (value !== null) {
      if (target === 'longitude') value = wrapLongitude(value);
      if (KILOMETRE_LENGTH_FIELDS.has(target)) value = value / lengthDivisor(decisions, sourceColumn);
      if (NON_NEGATIVE_EVENT_FIELDS.has(target) && value < 0) value = null;
      if (target === 'depth' && value !== null && !validateDepth(value)) value = null;
    }
    if (target === 'magnitude') {
      const scale = inferMagnitudeTypeFromColumn(sourceColumn);
      if (scale) derived.magnitude_type = scale;
    }
    return { value, derived };
  }

  if (target === 'magnitude_type') {
    const text = blank ? '' : String(raw).trim();
    // A number is never a scale code: the column holds magnitudes, so its name is the scale.
    if (text !== '' && parseStrictNumber(text) === null) return { value: text, derived };
    return { value: inferMagnitudeTypeFromColumn(sourceColumn), derived };
  }

  return { value: blank ? null : raw, derived };
}

/** normalizeMappedField's stored value alone (contract C14). */
export function normalizeMappedValue(
  target: string,
  raw: unknown,
  decisions?: ParseFileDecisions | null,
  sourceColumn?: string
): unknown {
  return normalizeMappedField(target, raw, decisions, sourceColumn).value;
}

/** Divisor to kilometres: the unit the column name states wins, then the file's decision. */
function lengthDivisor(decisions: ParseFileDecisions | null | undefined, sourceColumn?: string): number {
  const named = lengthUnitFromColumnName(sourceColumn);
  if (named) return named === 'm' ? 1000 : 1;
  return decisions?.depthUnit === 'm' ? 1000 : 1;
}

/**
 * Check if two events match based on time and distance thresholds
 */
export function eventsMatch(
  event1: EarthquakeEvent,
  event2: EarthquakeEvent,
  timeThresholdSeconds: number,
  distanceThresholdKm: number
): boolean {
  const timeDiff = calculateTimeDifference(event1.time, event2.time);
  const distance = calculateDistance(
    event1.latitude,
    event1.longitude,
    event2.latitude,
    event2.longitude
  );

  return timeDiff <= timeThresholdSeconds && distance <= distanceThresholdKm;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(time: string): string {
  const date = new Date(time);
  return date.toISOString();
}

/**
 * Validate complete earthquake event
 */
export function validateEvent(event: Partial<EarthquakeEvent>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (event.latitude === undefined || event.latitude === null || event.longitude === undefined || event.longitude === null) {
    errors.push('Latitude and longitude are required');
  } else if (!validateCoordinates(event.latitude, event.longitude)) {
    errors.push('Invalid coordinates: latitude must be -90 to 90, longitude must be -180 to 180');
  }

  if (event.magnitude === undefined || event.magnitude === null) {
    errors.push('Magnitude is required');
  } else if (!validateMagnitude(event.magnitude)) {
    errors.push('Invalid magnitude: must be between -3 and 10');
  }

  if (event.depth !== undefined && event.depth !== null && !validateDepth(event.depth)) {
    errors.push('Invalid depth: must be between -5 and 1000 km');
  }

  if (!event.time) {
    errors.push('Timestamp is required');
  } else if (!validateTimestamp(event.time)) {
    errors.push('Invalid timestamp format');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/** Normalize a rendering budget; Infinity explicitly means all events. */
export function normalizeSampleLimit(limit: number, total: number): number {
  if (limit === Infinity) return total;
  return Number.isFinite(limit) ? Math.min(total, Math.max(0, Math.floor(limit))) : 0;
}

/** Keep only unique, plottable events before allocating the rendering budget. */
function plottableEvents<T extends SampleableEvent>(events: T[]): T[] {
  return dedupeById(events.filter(event =>
    Number.isFinite(event.latitude) && Math.abs(event.latitude) <= 90 &&
    Number.isFinite(event.longitude) && Number.isFinite(event.magnitude)
  ));
}

/**
 * Deterministic map sampling: retain the largest events, then spread the remaining
 * budget over magnitude bins and time. Selection is without replacement; repeated
 * renders of the same catalogue select the same events. Counts describe unique,
 * plottable events, including when the user selects All.
 */
export function sampleEarthquakeEvents<T extends SampleableEvent>(
  events: T[],
  maxSamples: number = 1000
): { sampled: T[]; total: number; displayCount: number; isSampled: boolean } {
  const eligible = plottableEvents(events);
  const total = eligible.length;
  const limit = normalizeSampleLimit(maxSamples, total);
  const sampled = sampleEligibleEvents(eligible, limit);
  return { sampled, total, displayCount: sampled.length, isSampled: sampled.length < total };
}

/**
 * How the rendering budget is spread over the catalogue.
 * - 'magnitude-stratified' reserves the largest events and then gives each magnitude
 * bin an equal share of the remaining budget, so a sparse M>=6 bin is retained far
 * more often than the M<3 bin. Good for maps that must show the big events; NOT a
 * representative sample of the magnitude distribution.
 * - 'proportional' keeps every event with the same probability (a systematic pass in
 */
export type SampleStrategy = 'magnitude-stratified' | 'proportional';

/** Magnitude bins used by the stratified strategy and by its reporting, largest first. */
const MAGNITUDE_BINS = ['M>=6', 'M5-6', 'M4-5', 'M3-4', 'M<3'] as const;

function magnitudeBinIndex(magnitude: number): number {
  return magnitude >= 6 ? 0 : magnitude >= 5 ? 1 :
    magnitude >= 4 ? 2 : magnitude >= 3 ? 3 : 4;
}

function sampleEligibleEvents<T extends SampleableEvent>(
  events: T[],
  limit: number,
  strategy: SampleStrategy = 'magnitude-stratified'
): T[] {
  if (limit >= events.length) return events;
  if (limit === 0) return [];
  // Equal retention probability for every event, so no magnitude is favoured.
  if (strategy === 'proportional') return sampleAcrossTime(events, limit);

  const ranked = [...events].sort((a, b) => b.magnitude - a.magnitude);
  const topCount = Math.min(Math.max(1, Math.floor(limit * 0.1)), 100);
  const sampled = ranked.slice(0, topCount);
  const bins: T[][] = MAGNITUDE_BINS.map(() => []);
  for (let i = topCount; i < ranked.length; i++) {
    const event = ranked[i];
    bins[magnitudeBinIndex(event.magnitude)].push(event);
  }

  // Redistribute unused capacity in sparse bins before selecting any events.
  const quotas = bins.map(() => 0);
  let remaining = limit - topCount;
  while (remaining > 0) {
    const available = bins.map((bin, index) => index).filter(i => quotas[i] < bins[i].length);
    const share = Math.max(1, Math.floor(remaining / available.length));
    for (const i of available) {
      const count = Math.min(share, bins[i].length - quotas[i], remaining);
      quotas[i] += count;
      remaining -= count;
    }
  }
  bins.forEach((bin, i) => {
    for (const event of sampleAcrossTime(bin, quotas[i])) sampled.push(event);
  });
  return sampled;
}

function sampleAcrossTime<T extends SampleableEvent>(events: T[], count: number): T[] {
  if (count === 0) return [];
  if (count >= events.length) return events;
  // Parse timestamps once per event, instead of twice per sort comparison.
  const ordered = events.map(event => ({ event, time: Date.parse(event.time) || 0 }))
    .sort((a, b) => a.time - b.time);
  // Include both ends of the time range; integer division of the step followed
  // by truncation would systematically lose events at the end of the catalogue.
  return Array.from({ length: count }, (_, i) =>
    ordered[count === 1 ? Math.floor(ordered.length / 2) :
      Math.round(i * (ordered.length - 1) / (count - 1))].event
  );
}

/** Per-bin outcome of a selection, so callers can state what a map actually shows. */
export interface MagnitudeBinCount {
  /** Bin label, e.g. 'M4-5'. */
  label: string;
  /** Unique, plottable events in this bin. */
  total: number;
  /** How many of them the selection retained. */
  retained: number;
}

export interface StrategySampleResult<T> {
  sampled: T[];
  total: number;
  displayCount: number;
  isSampled: boolean;
  strategy: SampleStrategy;
  /** Largest magnitude bin first; retained/total is the bin's retention rate. */
  bins: MagnitudeBinCount[];
}

/**
 * Map sampling with an explicit strategy and a per-magnitude-bin account of the
 * result. Same selection as sampleEarthquakeEvents when the default strategy is
 * used; 'proportional' instead retains every event with equal probability. The bin
 * counts exist so a figure caption can quote real retention rates rather than
 * implying the plotted events are a representative sample.
 */
export function sampleEarthquakeEventsWithStrategy<T extends SampleableEvent>(
  events: T[],
  maxSamples: number = 1000,
  strategy: SampleStrategy = 'magnitude-stratified'
): StrategySampleResult<T> {
  const eligible = plottableEvents(events);
  const total = eligible.length;
  const limit = normalizeSampleLimit(maxSamples, total);
  const sampled = sampleEligibleEvents(eligible, limit, strategy);
  const eligibleCounts = MAGNITUDE_BINS.map(() => 0);
  const retainedCounts = MAGNITUDE_BINS.map(() => 0);
  for (const event of eligible) eligibleCounts[magnitudeBinIndex(event.magnitude)]++;
  for (const event of sampled) retainedCounts[magnitudeBinIndex(event.magnitude)]++;
  return {
    sampled, total, displayCount: sampled.length,
    isSampled: sampled.length < total, strategy,
    bins: MAGNITUDE_BINS.map((label, i) => ({
      label, total: eligibleCounts[i], retained: retainedCounts[i],
    })),
  };
}

/**
 * Viewport bounds for map filtering
 */
export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Sample earthquake events with viewport awareness.
 * Prioritizes events in the current viewport while maintaining
 * representativeness across the full dataset.
 */
export function sampleEarthquakeEventsWithViewport<T extends SampleableEvent>(
  events: T[],
  maxSamples: number = 1000,
  viewport?: ViewportBounds | null
): {
  sampled: T[];
  total: number;
  displayCount: number;
  isSampled: boolean;
  inViewport: number;
} {
  const eligible = plottableEvents(events);
  const total = eligible.length;
  const limit = normalizeSampleLimit(maxSamples, total);
  const inside: T[] = [];
  const outside: T[] = [];
  for (const event of eligible) {
    (viewport && !isEventInBounds(event, viewport) ? outside : inside).push(event);
  }

  // Reserve 80% for visible events, borrowing any unused outside capacity.
  // With no viewport (or no outside events) the full budget remains available.
  const insideLimit = Math.min(inside.length,
    Math.max(Math.ceil(limit * 0.8), limit - outside.length));
  const sampled = sampleEligibleEvents(inside, insideLimit)
    .concat(sampleEligibleEvents(outside, limit - insideLimit));
  return {
    sampled, total, displayCount: sampled.length,
    isSampled: sampled.length < total, inViewport: inside.length,
  };
}

/**
 * Efficiently check if an event is within bounds
 */
export function isEventInBounds<T extends { latitude: number; longitude: number }>(
  event: T,
  bounds: ViewportBounds
): boolean {
  if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude) ||
      event.latitude < bounds.south || event.latitude > bounds.north) return false;
  const span = bounds.east - bounds.west;
  if (Math.abs(span) >= 360) return true;
  // Leaflet reports unwrapped bounds (e.g. 170..190 or 530..550); APIs may
  // instead express the same dateline crossing as 170..-170.
  const width = ((span % 360) + 360) % 360;
  const offset = (((event.longitude - bounds.west) % 360) + 360) % 360;
  // offset lands on 0 for a point exactly on the west edge or exactly 360
  // degrees east of it (the same meridian, e.g. +180 against a -180 edge).
  return offset <= width;
}

/**
 * Pre-compute event positions for faster filtering
 * Returns a Map of event ID to grid cell for spatial indexing
 */
export function createSpatialIndex<T extends { latitude: number; longitude: number; id: string | number }>(
  events: T[],
  cellSize: number = 1 // degrees
): Map<string, T[]> {
  const grid = new Map<string, T[]>();

  for (const event of events) {
    const cellX = Math.floor(event.longitude / cellSize);
    const cellY = Math.floor(event.latitude / cellSize);
    const key = `${cellX},${cellY}`;

    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key)!.push(event);
  }

  return grid;
}

/**
 * Longitude cell columns (x indices of the spatial index) covered by a viewport.
 */
function longitudeCellColumns(bounds: ViewportBounds, cellSize: number): number[] {
  const columns: number[] = [];
  const seen = new Set<number>();
  const add = (x: number) => {
    if (!seen.has(x)) {
      seen.add(x);
      columns.push(x);
    }
  };

  const span = bounds.east - bounds.west;
  if (!Number.isFinite(span) || !Number.isFinite(bounds.west) || cellSize <= 0) return columns;

  // Normalise to a west edge in [-180, 180) plus an eastward width in [0, 360),
  // then split at the antimeridian into one or two ascending intervals.
  const width = Math.abs(span) >= 360 ? 360 : ((span % 360) + 360) % 360;
  const west = Math.abs(span) >= 360 ? -180 : ((((bounds.west + 180) % 360) + 360) % 360) - 180;
  const east = west + width;
  const intervals: Array<[number, number]> =
    east <= 180 ? [[west, east]] : [[west, 180], [-180, east - 360]];

  for (const [from, to] of intervals) {
    for (let x = Math.floor(from / cellSize); x <= Math.floor(to / cellSize); x++) {
      add(x);
    }
  }
  // +180 and -180 are the same meridian but land in different cells, so a walk
  // that reaches either edge must probe both.
  const westEdgeCell = Math.floor(-180 / cellSize);
  const eastEdgeCell = Math.floor(180 / cellSize);
  if (seen.has(westEdgeCell)) add(eastEdgeCell);
  else if (seen.has(eastEdgeCell)) add(westEdgeCell);

  return columns;
}

/**
 * Query events from spatial index within bounds
 */
export function queryEventsInBounds<T extends { latitude: number; longitude: number; id: string | number }>(
  grid: Map<string, T[]>,
  bounds: ViewportBounds,
  cellSize: number = 1
): T[] {
  const results: T[] = [];

  const minCellY = Math.floor(bounds.south / cellSize);
  const maxCellY = Math.floor(bounds.north / cellSize);

  for (const x of longitudeCellColumns(bounds, cellSize)) {
    for (let y = minCellY; y <= maxCellY; y++) {
      const key = `${x},${y}`;
      const cell = grid.get(key);
      if (cell) {
        // Fine-grained bounds check for events in this cell
        for (const event of cell) {
          if (isEventInBounds(event, bounds)) {
            results.push(event);
          }
        }
      }
    }
  }

  return results;
}
