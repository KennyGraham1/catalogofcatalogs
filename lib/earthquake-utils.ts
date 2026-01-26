/**
 * Utility functions for earthquake data processing
 */

// Import canonical EarthquakeEvent type from central types module
import { EarthquakeEvent } from '@/types/earthquake';

// Re-export for backwards compatibility with existing imports
export type { EarthquakeEvent } from '@/types/earthquake';

/**
 * Minimal event interface for sampling functions
 * Allows any event type with the required fields for sampling
 */
interface SampleableEvent {
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
export function getEarthquakeColor(depth: number, isDark: boolean = false): string {
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
 *
 * Uses a fixed lookup table with linear progression (+3km increment) for each
 * magnitude increment, starting from a base radius of 3,000 meters.
 * This provides consistent visual representation and improved maintainability.
 *
 * Magnitude-to-radius mapping (values in meters):
 *   Magnitude 0.0-1.9: 3,000m radius (base size)
 *   Magnitude 2.0-2.9: 6,000m radius
 *   Magnitude 3.0-3.9: 9,000m radius
 *   Magnitude 4.0-4.9: 12,000m radius
 *   Magnitude 5.0-5.9: 15,000m radius
 *   Magnitude 6.0-6.9: 18,000m radius
 *   Magnitude 7.0+: 21,000m radius (capped)
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
 *
 * @param time - The timestamp to normalize
 * @param dateFormat - Optional date format hint ('US' or 'International') for ambiguous dates
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

/**
 * Sample earthquake events intelligently for map rendering performance.
 * Uses stratified sampling to maintain representativeness across:
 * - Magnitude distribution (prioritizing larger events)
 * - Geographic spread (sampling across the spatial distribution)
 * - Temporal distribution (sampling across time periods)
 *
 * @param events - Array of earthquake events to sample
 * @param maxSamples - Maximum number of events to return (default: 1000)
 * @returns Object containing sampled events and metadata
 */
export function sampleEarthquakeEvents<T extends SampleableEvent>(
  events: T[],
  maxSamples: number = 1000
): {
  sampled: T[];
  total: number;
  displayCount: number;
  isSampled: boolean;
} {
  const total = events.length;

  // If we have fewer events than the limit, return all
  if (total <= maxSamples) {
    return {
      sampled: events,
      total,
      displayCount: total,
      isSampled: false,
    };
  }

  // Stratified sampling strategy
  const sampledEvents: T[] = [];
  const samplingRatio = maxSamples / total;

  // Sort events by magnitude (descending) to prioritize larger events
  const sortedByMagnitude = [...events].sort((a, b) => b.magnitude - a.magnitude);

  // Step 1: Always include the largest events (top 10% or 100, whichever is smaller)
  const topEventCount = Math.min(Math.floor(maxSamples * 0.1), 100);
  const topEvents = sortedByMagnitude.slice(0, topEventCount);
  sampledEvents.push(...topEvents);

  // Step 2: Sample remaining events using stratified approach
  const remainingEvents = sortedByMagnitude.slice(topEventCount);
  const remainingSamples = maxSamples - topEventCount;

  // Divide into magnitude bins for stratified sampling
  const magnitudeBins = createMagnitudeBins(remainingEvents);
  const eventsPerBin = Math.floor(remainingSamples / magnitudeBins.length);

  for (const bin of magnitudeBins) {
    // Sample events from this bin
    const binSample = stratifiedSampleBin(bin, eventsPerBin);
    sampledEvents.push(...binSample);
  }

  // If we still have room, add more random samples to reach the target
  if (sampledEvents.length < maxSamples) {
    const usedIds = new Set(sampledEvents.map((e, idx) => idx));
    const remaining = events.filter((_, idx) => !usedIds.has(idx));
    const additionalCount = maxSamples - sampledEvents.length;
    const additionalSamples = randomSample(remaining, additionalCount);
    sampledEvents.push(...additionalSamples);
  }

  // Shuffle the final result to avoid clustering by magnitude
  const shuffled = shuffleArray(sampledEvents.slice(0, maxSamples));

  return {
    sampled: shuffled,
    total,
    displayCount: shuffled.length,
    isSampled: true,
  };
}

/**
 * Create magnitude bins for stratified sampling
 */
function createMagnitudeBins<T extends SampleableEvent>(events: T[]): T[][] {
  const bins: T[][] = [[], [], [], [], []]; // 5 bins for magnitude ranges

  for (const event of events) {
    const mag = event.magnitude;
    if (mag >= 6.0) bins[0].push(event); // Major
    else if (mag >= 5.0) bins[1].push(event); // Moderate
    else if (mag >= 4.0) bins[2].push(event); // Light
    else if (mag >= 3.0) bins[3].push(event); // Minor
    else bins[4].push(event); // Micro
  }

  return bins.filter(bin => bin.length > 0);
}

/**
 * Sample events from a bin using geographic and temporal distribution
 */
function stratifiedSampleBin<T extends SampleableEvent>(
  bin: T[],
  targetCount: number
): T[] {
  if (bin.length <= targetCount) {
    return bin;
  }

  // Sort by time to ensure temporal distribution
  const sorted = [...bin].sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  // Use systematic sampling with a random start for even distribution
  const step = bin.length / targetCount;
  const start = Math.random() * step;
  const samples: T[] = [];

  for (let i = 0; i < targetCount; i++) {
    const index = Math.floor(start + i * step);
    if (index < sorted.length) {
      samples.push(sorted[index]);
    }
  }

  return samples;
}

/**
 * Random sample without replacement
 */
function randomSample<T>(array: T[], count: number): T[] {
  const shuffled = shuffleArray([...array]);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
 *
 * @param events - Array of earthquake events to sample
 * @param maxSamples - Maximum number of events to return
 * @param viewport - Optional viewport bounds to prioritize visible events
 * @returns Object containing sampled events and metadata
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
  const total = events.length;

  // If we have fewer events than the limit, return all
  if (total <= maxSamples) {
    return {
      sampled: events,
      total,
      displayCount: total,
      isSampled: false,
      inViewport: total,
    };
  }

  // Separate events into viewport and outside viewport
  let inViewportEvents: T[] = [];
  let outsideViewportEvents: T[] = [];

  if (viewport) {
    for (const event of events) {
      if (
        event.latitude >= viewport.south &&
        event.latitude <= viewport.north &&
        event.longitude >= viewport.west &&
        event.longitude <= viewport.east
      ) {
        inViewportEvents.push(event);
      } else {
        outsideViewportEvents.push(event);
      }
    }
  } else {
    // No viewport, treat all as in-viewport
    inViewportEvents = events;
  }

  const sampledEvents: T[] = [];

  // Step 1: Prioritize in-viewport events (up to 80% of max samples)
  const viewportAllocation = Math.floor(maxSamples * 0.8);
  if (inViewportEvents.length <= viewportAllocation) {
    // All in-viewport events fit, add them all
    sampledEvents.push(...inViewportEvents);
  } else {
    // Need to sample in-viewport events
    // Prioritize by magnitude (larger events first)
    const sortedViewport = [...inViewportEvents].sort((a, b) => b.magnitude - a.magnitude);

    // Always include top 20% by magnitude
    const topCount = Math.floor(viewportAllocation * 0.2);
    sampledEvents.push(...sortedViewport.slice(0, topCount));

    // Stratified sample the rest
    const remainingViewport = sortedViewport.slice(topCount);
    const remainingSlots = viewportAllocation - topCount;
    const viewportSample = stratifiedSampleBin(remainingViewport, remainingSlots);
    sampledEvents.push(...viewportSample);
  }

  // Step 2: Fill remaining slots with outside-viewport events (for context)
  const remainingSlots = maxSamples - sampledEvents.length;
  if (remainingSlots > 0 && outsideViewportEvents.length > 0) {
    // Prioritize larger events from outside viewport
    const sortedOutside = [...outsideViewportEvents].sort((a, b) => b.magnitude - a.magnitude);
    const outsideSample = sortedOutside.slice(0, remainingSlots);
    sampledEvents.push(...outsideSample);
  }

  return {
    sampled: sampledEvents,
    total,
    displayCount: sampledEvents.length,
    isSampled: true,
    inViewport: inViewportEvents.length,
  };
}

/**
 * Efficiently check if an event is within bounds
 */
export function isEventInBounds<T extends { latitude: number; longitude: number }>(
  event: T,
  bounds: ViewportBounds
): boolean {
  return (
    event.latitude >= bounds.south &&
    event.latitude <= bounds.north &&
    event.longitude >= bounds.west &&
    event.longitude <= bounds.east
  );
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
 * Query events from spatial index within bounds
 */
export function queryEventsInBounds<T extends { latitude: number; longitude: number; id: string | number }>(
  grid: Map<string, T[]>,
  bounds: ViewportBounds,
  cellSize: number = 1
): T[] {
  const results: T[] = [];

  const minCellX = Math.floor(bounds.west / cellSize);
  const maxCellX = Math.floor(bounds.east / cellSize);
  const minCellY = Math.floor(bounds.south / cellSize);
  const maxCellY = Math.floor(bounds.north / cellSize);

  for (let x = minCellX; x <= maxCellX; x++) {
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

