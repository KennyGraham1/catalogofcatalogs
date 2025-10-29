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
 * Validate earthquake timestamp
 */
export function validateTimestamp(time: string): boolean {
  const date = new Date(time);
  return !isNaN(date.getTime()) && date.getTime() > 0;
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

