/**
 * Utility functions for earthquake data processing
 */

// Import canonical EarthquakeEvent type from central types module
import { EarthquakeEvent } from '@/types/earthquake';
import { dedupeById } from '@/lib/utils';

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
 * Get human-readable label for magnitude
 */
export function getMagnitudeLabel(magnitude: number): string {
  if (magnitude >= 7.0) return 'Major';
  if (magnitude >= 6.0) return 'Strong';
  if (magnitude >= 5.0) return 'Moderate';
  if (magnitude >= 4.0) return 'Light';
  return 'Minor';
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
 * Normalize timestamp to ISO 8601 format
 * Supports multiple input formats:
 * - ISO 8601: 2024-01-15T10:30:00.000Z, 2024-01-15T10:30:00Z, 2024-01-15 10:30:00
 * - Unix timestamp (seconds): 1705318200
 * - Unix timestamp (milliseconds): 1705318200000
 * - Common date formats: DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, YYYY/MM/DD
 */
export function normalizeTimestamp(time: string | number, dateFormat?: 'US' | 'International'): string | null {
  if (typeof time === 'number') {
    // Unix timestamp - detect if it's in seconds or milliseconds
    const timestamp = time < 10000000000 ? time * 1000 : time;
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

  // Try parsing as-is first (handles ISO 8601 and other standard formats)
  // Allow historical dates (earthquakes can be from centuries ago)
  // Minimum valid date: year 1000 CE (reasonable lower bound for historical seismology)
  const minValidDate = new Date('1000-01-01T00:00:00.000Z').getTime();

  // Offset-less ISO 8601 (date, or date+time with space or T, NO timezone) MUST be
  // treated as UTC: `new Date('2024-01-01 12:00:00')` parses as LOCAL time, silently
  // shifting UTC earthquake times by the server timezone (and non-deterministically
  // across deploy environments). Force UTC before the generic parse. Strings that
  // carry an explicit Z/offset are not matched here and fall through to new Date().
  const isoNoTz = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?)?$/
  );
  if (isoNoTz) {
    const [, y, mo, d, h = '00', mi = '00', s = '00', ms = ''] = isoNoTz;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoUtc = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${s.padStart(2, '0')}.${millis}Z`;
    const utc = new Date(isoUtc);
    if (!isNaN(utc.getTime()) && utc.getTime() >= minValidDate) {
      return utc.toISOString();
    }
  }

  let date = new Date(trimmed);
  if (!isNaN(date.getTime()) && date.getTime() >= minValidDate) {
    return date.toISOString();
  }

  let match: RegExpMatchArray | null;

  // YYYY-MM-DD HH:MM:SS format (space-separated ISO without T)
  const yyyymmddSpace = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(yyyymmddSpace);
  if (match) {
    const [, year, month, day, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // DD/MM/YYYY or MM/DD/YYYY HH:MM:SS format (ambiguous - use dateFormat hint)
  const ambiguousSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(ambiguousSlash);
  if (match) {
    const [, first, second, year, hour, minute, second_time, ms] = match;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);

    let day: string;
    let month: string;

    // Determine format based on values and hint
    if (firstNum > 12 && secondNum <= 12) {
      // Unambiguous: first must be day (DD/MM/YYYY)
      day = first;
      month = second;
    } else if (firstNum <= 12 && secondNum > 12) {
      // Unambiguous: second must be day (MM/DD/YYYY)
      month = first;
      day = second;
    } else if (firstNum <= 12 && secondNum <= 12) {
      // Ambiguous: use dateFormat hint
      if (dateFormat === 'US') {
        month = first;
        day = second;
      } else {
        // Default to International (DD/MM/YYYY)
        day = first;
        month = second;
      }
    } else {
      // Both > 12, invalid date
      return null;
    }

    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second_time.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // DD-MM-YYYY or MM-DD-YYYY HH:MM:SS format (ambiguous - use dateFormat hint)
  const ambiguousDash = /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(ambiguousDash);
  if (match) {
    const [, first, second, year, hour, minute, second_time, ms] = match;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);

    let day: string;
    let month: string;

    // Determine format based on values and hint
    if (firstNum > 12 && secondNum <= 12) {
      // Unambiguous: first must be day (DD-MM-YYYY)
      day = first;
      month = second;
    } else if (firstNum <= 12 && secondNum > 12) {
      // Unambiguous: second must be day (MM-DD-YYYY)
      month = first;
      day = second;
    } else if (firstNum <= 12 && secondNum <= 12) {
      // Ambiguous: use dateFormat hint
      if (dateFormat === 'US') {
        month = first;
        day = second;
      } else {
        // Default to International (DD-MM-YYYY)
        day = first;
        month = second;
      }
    } else {
      // Both > 12, invalid date
      return null;
    }

    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second_time.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // DD.MM.YYYY HH:MM:SS format (European with dots)
  const ddmmyyyyDot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(ddmmyyyyDot);
  if (match) {
    const [, day, month, year, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // DD.MM.YYYY format (European with dots, date only)
  const ddmmyyyyDotDateOnly = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  match = trimmed.match(ddmmyyyyDotDateOnly);
  if (match) {
    const [, day, month, year] = match;
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // YYYY/MM/DD HH:MM:SS format
  const yyyymmddSlash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(yyyymmddSlash);
  if (match) {
    const [, year, month, day, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // DD/MM/YYYY or MM/DD/YYYY format (date only - ambiguous)
  const ambiguousDateOnly = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  match = trimmed.match(ambiguousDateOnly);
  if (match) {
    const [, first, second, year] = match;
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);

    let day: string;
    let month: string;

    // Determine format based on values and hint
    if (firstNum > 12 && secondNum <= 12) {
      // Unambiguous: first must be day (DD/MM/YYYY)
      day = first;
      month = second;
    } else if (firstNum <= 12 && secondNum > 12) {
      // Unambiguous: second must be day (MM/DD/YYYY)
      month = first;
      day = second;
    } else if (firstNum <= 12 && secondNum <= 12) {
      // Ambiguous: use dateFormat hint
      if (dateFormat === 'US') {
        month = first;
        day = second;
      } else {
        // Default to International (DD/MM/YYYY)
        day = first;
        month = second;
      }
    } else {
      // Both > 12, invalid date
      return null;
    }

    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // YYYYMMDD HHMMSS format (compact seismological format)
  const compactFormat = /^(\d{4})(\d{2})(\d{2})\s+(\d{2})(\d{2})(\d{2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(compactFormat);
  if (match) {
    const [, year, month, day, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // YYYYMMDDHHMMSS format (no separator compact format)
  const compactNoSpace = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(compactNoSpace);
  if (match) {
    const [, year, month, day, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // YYYY DDD HH:MM:SS format (Julian day / day of year - used in seismology)
  const julianDayFormat = /^(\d{4})\s+(\d{1,3})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(julianDayFormat);
  if (match) {
    const [, year, dayOfYear, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    // Convert day of year to month and day
    const baseDate = new Date(parseInt(year), 0, 1); // January 1st of the year
    baseDate.setDate(parseInt(dayOfYear));
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    const isoString = `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // YYYY-DDD HH:MM:SS format (Julian day with dash)
  const julianDayDashFormat = /^(\d{4})-(\d{1,3})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(julianDayDashFormat);
  if (match) {
    const [, year, dayOfYear, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const baseDate = new Date(parseInt(year), 0, 1);
    baseDate.setDate(parseInt(dayOfYear));
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    const isoString = `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // YYYYDDDHHMMSS format (compact Julian day format)
  // Shape-identical to a 13-digit Unix millisecond epoch, which CSV imports always
  // deliver as a string (lib/parsers.ts assigns the raw cell text). The two are
  // separated by the leading year: epoch-ms values only reach a 19xx leading group
  // in 2030-03 (1.9e12 ms) and a 20xx group in 2033-05 (2.0e12 ms), so a Julian year
  // >= 1900 is unambiguous, while 1000-1899 (1.0e12-1.8e12 ms = 2001-2027) is an
  // epoch and is handled by the branch below. Day-of-year is range-checked here so
  // that an out-of-range value falls through rather than silently rolling over.
  const compactJulian = /^(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(compactJulian);
  if (match && parseInt(match[1]) >= 1900 &&
      parseInt(match[2]) >= 1 && parseInt(match[2]) <= 366) {
    const [, year, dayOfYear, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const baseDate = new Date(parseInt(year), 0, 1);
    baseDate.setDate(parseInt(dayOfYear));
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Unix epoch supplied as a string. The numeric branch at the top of this function
  // is unreachable for file imports, because parsers hand over the raw cell text, so
  // the epoch support promised above has to be honoured for digit strings as well:
  // 10 digits are seconds and 13 are milliseconds, the same split the numeric branch
  // applies. No other supported format is a bare 10- or 13-digit string once the
  // compact Julian day form above has had its (year-restricted) turn.
  if (/^\d{10}$|^\d{13}$/.test(trimmed)) {
    return normalizeTimestamp(Number(trimmed), dateFormat);
  }

  return null;
}

/**
 * Validate earthquake timestamp
 */
export function validateTimestamp(time: string | number): boolean {
  return normalizeTimestamp(time) !== null;
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
