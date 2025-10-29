/**
 * Utility functions for extracting and working with geographic bounds
 */

import type { ParsedEvent } from './parsers';
import type { MergedEvent } from './db';

export interface GeographicBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/**
 * Extract geographic bounds from an array of parsed events
 */
export function extractBoundsFromEvents(events: ParsedEvent[]): GeographicBounds | null {
  if (!events || events.length === 0) {
    return null;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const event of events) {
    if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
      minLat = Math.min(minLat, event.latitude);
      maxLat = Math.max(maxLat, event.latitude);
      minLon = Math.min(minLon, event.longitude);
      maxLon = Math.max(maxLon, event.longitude);
    }
  }

  // Check if we found any valid coordinates
  if (minLat === Infinity || maxLat === -Infinity || minLon === Infinity || maxLon === -Infinity) {
    return null;
  }

  return {
    minLatitude: minLat,
    maxLatitude: maxLat,
    minLongitude: minLon,
    maxLongitude: maxLon,
  };
}

/**
 * Extract geographic bounds from an array of merged events
 */
export function extractBoundsFromMergedEvents(events: MergedEvent[]): GeographicBounds | null {
  if (!events || events.length === 0) {
    return null;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const event of events) {
    if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
      minLat = Math.min(minLat, event.latitude);
      maxLat = Math.max(maxLat, event.latitude);
      minLon = Math.min(minLon, event.longitude);
      maxLon = Math.max(maxLon, event.longitude);
    }
  }

  // Check if we found any valid coordinates
  if (minLat === Infinity || maxLat === -Infinity || minLon === Infinity || maxLon === -Infinity) {
    return null;
  }

  return {
    minLatitude: minLat,
    maxLatitude: maxLat,
    minLongitude: minLon,
    maxLongitude: maxLon,
  };
}

/**
 * Check if two bounding boxes overlap
 */
export function boundsOverlap(
  bounds1: GeographicBounds,
  bounds2: GeographicBounds
): boolean {
  return (
    bounds1.maxLatitude >= bounds2.minLatitude &&
    bounds1.minLatitude <= bounds2.maxLatitude &&
    bounds1.maxLongitude >= bounds2.minLongitude &&
    bounds1.minLongitude <= bounds2.maxLongitude
  );
}

/**
 * Check if a point is within bounds
 */
export function pointInBounds(
  latitude: number,
  longitude: number,
  bounds: GeographicBounds
): boolean {
  return (
    latitude >= bounds.minLatitude &&
    latitude <= bounds.maxLatitude &&
    longitude >= bounds.minLongitude &&
    longitude <= bounds.maxLongitude
  );
}

/**
 * Format bounds as a human-readable string
 */
export function formatBounds(bounds: GeographicBounds | null): string {
  if (!bounds) {
    return 'No geographic data';
  }

  const formatCoord = (value: number, isLat: boolean): string => {
    const abs = Math.abs(value);
    const dir = isLat
      ? value >= 0 ? 'N' : 'S'
      : value >= 0 ? 'E' : 'W';
    return `${abs.toFixed(2)}°${dir}`;
  };

  return `${formatCoord(bounds.minLatitude, true)} to ${formatCoord(bounds.maxLatitude, true)}, ${formatCoord(bounds.minLongitude, false)} to ${formatCoord(bounds.maxLongitude, false)}`;
}

/**
 * Calculate the area of a bounding box in square degrees
 */
export function calculateBoundsArea(bounds: GeographicBounds): number {
  const latDiff = bounds.maxLatitude - bounds.minLatitude;
  const lonDiff = bounds.maxLongitude - bounds.minLongitude;
  return latDiff * lonDiff;
}

/**
 * Get the center point of a bounding box
 */
export function getBoundsCenter(bounds: GeographicBounds): { latitude: number; longitude: number } {
  return {
    latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
    longitude: (bounds.minLongitude + bounds.maxLongitude) / 2,
  };
}

/**
 * Validate geographic bounds
 */
export function validateBounds(bounds: GeographicBounds): { valid: boolean; error?: string } {
  if (bounds.minLatitude < -90 || bounds.minLatitude > 90) {
    return { valid: false, error: 'Minimum latitude must be between -90 and 90' };
  }
  if (bounds.maxLatitude < -90 || bounds.maxLatitude > 90) {
    return { valid: false, error: 'Maximum latitude must be between -90 and 90' };
  }
  if (bounds.minLongitude < -180 || bounds.minLongitude > 180) {
    return { valid: false, error: 'Minimum longitude must be between -180 and 180' };
  }
  if (bounds.maxLongitude < -180 || bounds.maxLongitude > 180) {
    return { valid: false, error: 'Maximum longitude must be between -180 and 180' };
  }
  if (bounds.minLatitude > bounds.maxLatitude) {
    return { valid: false, error: 'Minimum latitude cannot be greater than maximum latitude' };
  }
  if (bounds.minLongitude > bounds.maxLongitude) {
    return { valid: false, error: 'Minimum longitude cannot be greater than maximum longitude' };
  }
  return { valid: true };
}

