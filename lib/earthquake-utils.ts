/**
 * Utility functions for earthquake data processing
 */

export interface EarthquakeEvent {
  latitude: number;
  longitude: number;
  magnitude: number;
  depth?: number | null;
  time: string;
}

/**
 * Get color for earthquake markers (single color for all magnitudes)
 * Magnitude is now represented by size only, not color
 * @param _magnitude - Magnitude value (unused, kept for API compatibility)
 */
export function getMagnitudeColor(_magnitude: number): string {
  return '#3b82f6'; // blue-500 - uniform color for all earthquake events
}

/**
 * Get radius for map visualization based on magnitude
 */
export function getMagnitudeRadius(magnitude: number): number {
  return Math.max(10000, magnitude * 8000);
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
  return magnitude >= 0 && magnitude <= 10;
}

/**
 * Validate earthquake depth
 */
export function validateDepth(depth: number | null): boolean {
  if (depth === null) return true;
  return depth >= 0 && depth <= 1000; // Max depth ~700km typically
}

/**
 * Normalize timestamp to ISO 8601 format
 * Supports multiple input formats:
 * - ISO 8601: 2024-01-15T10:30:00.000Z, 2024-01-15T10:30:00Z, 2024-01-15 10:30:00
 * - Unix timestamp (seconds): 1705318200
 * - Unix timestamp (milliseconds): 1705318200000
 * - Common date formats: DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, YYYY/MM/DD
 * - Space-separated: YYYY-MM-DD HH:MM:SS, YYYY-MM-DD HH:MM:SS.sss
 * - Seismological formats: YYYYMMDD HHMMSS, YYYY DDD HH:MM:SS (Julian day)
 */
export function normalizeTimestamp(time: string | number): string | null {
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
  let date = new Date(trimmed);
  if (!isNaN(date.getTime()) && date.getTime() > 0) {
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

  // DD/MM/YYYY HH:MM:SS format (common in NZ/AU/UK)
  const ddmmyyyySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(ddmmyyyySlash);
  if (match) {
    const [, day, month, year, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // DD-MM-YYYY HH:MM:SS format
  const ddmmyyyyDash = /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(ddmmyyyyDash);
  if (match) {
    const [, day, month, year, hour, minute, second, ms] = match;
    const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
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

  // DD/MM/YYYY format (date only)
  const ddmmyyyyDateOnly = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  match = trimmed.match(ddmmyyyyDateOnly);
  if (match) {
    const [, day, month, year] = match;
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`;
    date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // MM/DD/YYYY HH:MM:SS format (US format - only when day > 12)
  const mmddyyyySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(mmddyyyySlash);
  if (match) {
    const [, month, day, year, hour, minute, second, ms] = match;
    // Only try US format if the month value is valid (1-12) and day > 12
    if (parseInt(month) <= 12 && parseInt(day) > 12) {
      const millis = ms ? ms.padEnd(3, '0').slice(0, 3) : '000';
      const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}.${millis}Z`;
      date = new Date(isoString);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
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
  const compactJulian = /^(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,6}))?$/;
  match = trimmed.match(compactJulian);
  if (match) {
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
  
  if (event.latitude === undefined || event.longitude === undefined) {
    errors.push('Latitude and longitude are required');
  } else if (!validateCoordinates(event.latitude, event.longitude)) {
    errors.push('Invalid coordinates: latitude must be -90 to 90, longitude must be -180 to 180');
  }
  
  if (event.magnitude === undefined) {
    errors.push('Magnitude is required');
  } else if (!validateMagnitude(event.magnitude)) {
    errors.push('Invalid magnitude: must be between 0 and 10');
  }
  
  if (event.depth !== undefined && event.depth !== null && !validateDepth(event.depth)) {
    errors.push('Invalid depth: must be between 0 and 1000 km');
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

