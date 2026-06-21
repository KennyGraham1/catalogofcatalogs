/**
 * Utility functions for extracting and working with geographic bounds
 */

import type { ParsedEvent } from './parsers';
import type { MergedEvent } from './db';

export interface GeographicBounds {
  minLatitude: number;
  maxLatitude: number;
  /**
   * West edge of the box. For boxes that cross the antimeridian (180°) this is
   * GREATER than maxLongitude — i.e. the box runs east from minLongitude, across
   * +180/-180, to maxLongitude (RFC 7946 §5.2 convention). New Zealand's offshore
   * territory (Kermadec/Raoul) crosses 180°, so this case is common here.
   */
  minLongitude: number;
  /** East edge of the box (see minLongitude for the dateline-crossing convention). */
  maxLongitude: number;
}

/** True when the box crosses the antimeridian (west edge east of the east edge). */
export function crossesDateline(bounds: GeographicBounds): boolean {
  return bounds.minLongitude > bounds.maxLongitude;
}

/**
 * Compute the tightest longitudinal interval covering all the given longitudes,
 * accounting for the antimeridian. Returns [west, east]; west > east means the
 * interval crosses 180°.
 *
 * Algorithm: sort the longitudes around the circle, find the largest angular gap
 * (including the wrap gap from the easternmost point back to the westernmost).
 * The covering interval is the complement of that largest gap. If the largest gap
 * is the wrap gap, the plain min/max is tightest (no crossing); otherwise the
 * tightest box crosses the dateline.
 */
// NOTE: for antipodal or evenly-spaced longitudes the "largest gap" is ambiguous, so the
// covering arc (and thus the box) may be the wider of two equally-valid options. This is an
// inherent property of minimum-arc on a circle and is acceptable for a bounding box.
function computeLongitudinalBounds(longitudes: number[]): { west: number; east: number } {
  const sorted = [...longitudes].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 1) return { west: sorted[0], east: sorted[0] };

  let largestGap = -Infinity;
  let gapStartIdx = n - 1; // index of the point on the WEST side of the largest gap
  for (let i = 0; i < n - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > largestGap) {
      largestGap = gap;
      gapStartIdx = i;
    }
  }
  // Wrap gap: from the easternmost point, across the antimeridian, to the westernmost.
  const wrapGap = sorted[0] + 360 - sorted[n - 1];
  if (wrapGap >= largestGap) {
    // Largest gap straddles 180° -> the data does NOT cross it; plain min/max is tightest.
    return { west: sorted[0], east: sorted[n - 1] };
  }
  // Largest gap is interior -> covering box crosses the dateline.
  // West edge = first point east of the gap; east edge = last point west of the gap.
  return { west: sorted[gapStartIdx + 1], east: sorted[gapStartIdx] };
}

function boundsFromCoords(coords: Array<{ lat: number; lon: number }>): GeographicBounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  const lons: number[] = [];

  for (const { lat, lon } of coords) {
    if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      lons.push(lon);
    }
  }

  if (minLat === Infinity || maxLat === -Infinity || lons.length === 0) {
    return null;
  }

  const { west, east } = computeLongitudinalBounds(lons);
  return {
    minLatitude: minLat,
    maxLatitude: maxLat,
    minLongitude: west,
    maxLongitude: east,
  };
}

/**
 * Extract geographic bounds from an array of parsed events (antimeridian-aware).
 */
export function extractBoundsFromEvents(events: ParsedEvent[]): GeographicBounds | null {
  if (!events || events.length === 0) return null;
  return boundsFromCoords(
    events.map(e => ({ lat: e.latitude as number, lon: e.longitude as number }))
  );
}

/**
 * Extract geographic bounds from an array of merged events (antimeridian-aware).
 */
export function extractBoundsFromMergedEvents(events: MergedEvent[]): GeographicBounds | null {
  if (!events || events.length === 0) return null;
  return boundsFromCoords(
    events.map(e => ({ lat: e.latitude as number, lon: e.longitude as number }))
  );
}

/**
 * Smallest [west, east] longitude arc covering all longitudes (antimeridian-aware).
 * west > east denotes a box crossing 180 degrees (RFC 7946 section 5.2).
 */
export function longitudeExtent(longitudes: number[]): { west: number; east: number } | null {
  const finite = longitudes.filter((l) => typeof l === 'number' && Number.isFinite(l));
  if (finite.length === 0) return null;
  return computeLongitudinalBounds(finite);
}

/**
 * Antimeridian-aware bounding box from raw lat/lon points.
 */
export function boundsFromLatLon(points: Array<{ lat: number; lon: number }>): GeographicBounds | null {
  if (!points || points.length === 0) return null;
  return boundsFromCoords(points);
}

/**
 * Union two bounding boxes, antimeridian-aware. Plain Math.min/Math.max on longitude
 * would destroy the west>east crossing convention and produce a globe-spanning box,
 * so the longitude union is the smallest arc covering both boxes' longitude ranges
 * (latitude is a simple min/max).
 */
export function unionBounds(a: GeographicBounds, b: GeographicBounds): GeographicBounds {
  const minLatitude = Math.min(a.minLatitude, b.minLatitude);
  const maxLatitude = Math.max(a.maxLatitude, b.maxLatitude);

  const inArc = (lon: number, x: GeographicBounds) =>
    x.minLongitude <= x.maxLongitude
      ? lon >= x.minLongitude && lon <= x.maxLongitude
      : lon >= x.minLongitude || lon <= x.maxLongitude;

  // Sample the circle (1-degree steps) plus the exact box edges; keep longitudes
  // covered by either box, then take the smallest enclosing arc of the covered set.
  const covered: number[] = [];
  for (let lon = -180; lon < 180; lon += 1) {
    if (inArc(lon, a) || inArc(lon, b)) covered.push(lon);
  }
  for (const edge of [a.minLongitude, a.maxLongitude, b.minLongitude, b.maxLongitude]) {
    covered.push(edge);
  }
  const { west, east } = computeLongitudinalBounds(covered);
  return { minLatitude, maxLatitude, minLongitude: west, maxLongitude: east };
}

/**
 * Decompose a [west, east] longitude range into one or two normal (west <= east)
 * intervals, splitting at the antimeridian when the range crosses it.
 */
function lonIntervals(west: number, east: number): Array<[number, number]> {
  if (west <= east) return [[west, east]];
  return [[west, 180], [-180, east]];
}

/**
 * Check if two bounding boxes overlap (antimeridian-aware).
 */
export function boundsOverlap(
  bounds1: GeographicBounds,
  bounds2: GeographicBounds
): boolean {
  const latOverlap =
    bounds1.maxLatitude >= bounds2.minLatitude &&
    bounds1.minLatitude <= bounds2.maxLatitude;
  if (!latOverlap) return false;

  for (const [a0, a1] of lonIntervals(bounds1.minLongitude, bounds1.maxLongitude)) {
    for (const [b0, b1] of lonIntervals(bounds2.minLongitude, bounds2.maxLongitude)) {
      if (a1 >= b0 && a0 <= b1) return true;
    }
  }
  return false;
}

/**
 * Check if a point is within bounds (antimeridian-aware).
 */
export function pointInBounds(
  latitude: number,
  longitude: number,
  bounds: GeographicBounds
): boolean {
  if (latitude < bounds.minLatitude || latitude > bounds.maxLatitude) return false;
  if (bounds.minLongitude <= bounds.maxLongitude) {
    return longitude >= bounds.minLongitude && longitude <= bounds.maxLongitude;
  }
  // Dateline-crossing box: inside if east of the west edge OR west of the east edge.
  return longitude >= bounds.minLongitude || longitude <= bounds.maxLongitude;
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
 * Calculate the area of a bounding box in square degrees (antimeridian-aware).
 */
export function calculateBoundsArea(bounds: GeographicBounds): number {
  const latDiff = bounds.maxLatitude - bounds.minLatitude;
  const lonDiff = bounds.maxLongitude >= bounds.minLongitude
    ? bounds.maxLongitude - bounds.minLongitude
    : bounds.maxLongitude + 360 - bounds.minLongitude;
  return latDiff * lonDiff;
}

/**
 * Get the center point of a bounding box (antimeridian-aware; longitude normalized to [-180, 180]).
 */
export function getBoundsCenter(bounds: GeographicBounds): { latitude: number; longitude: number } {
  const latitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  let longitude: number;
  if (bounds.maxLongitude >= bounds.minLongitude) {
    longitude = (bounds.minLongitude + bounds.maxLongitude) / 2;
  } else {
    const span = bounds.maxLongitude + 360 - bounds.minLongitude;
    longitude = bounds.minLongitude + span / 2;
    if (longitude > 180) longitude -= 360;
  }
  return { latitude, longitude };
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
  // NOTE: minLongitude > maxLongitude is intentionally allowed — it is the
  // RFC 7946 §5.2 convention for a box that crosses the antimeridian (180°).
  return { valid: true };
}

