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

/**
 * All of New Zealand: the main islands, the Chatham Islands (to ~176 W), the Kermadec
 * Islands (29.2-31.4 S, to ~179 W), the offshore strip east of 179 E (Hikurangi margin,
 * Bounty and Antipodes Islands) and the Auckland and Campbell Islands (to ~52.6 S).
 * It crosses the antimeridian, so the west edge (165 E) is greater than the east edge
 * (175 W). The box that stopped at 179 E and 34 S dropped every catalogue lying wholly
 * in the Kermadecs, on the Chatham Rise or off East Cape from region searches.
 */
export const NZ_NATIONAL_BOUNDS: Readonly<GeographicBounds> = Object.freeze({
  minLatitude: -53,
  maxLatitude: -28,
  minLongitude: 165,
  maxLongitude: -175,
});

/** True when the box crosses the antimeridian (west edge east of the east edge). */
export function crossesDateline(bounds: GeographicBounds): boolean {
  return bounds.minLongitude > bounds.maxLongitude;
}

/**
 * The box's [west, east] longitudes in the continuous frame a map draws in: a box that
 * crosses 180 gets an east edge past 180 (165..-175 becomes 165..185), so a rectangle
 * or fitBounds spans the box itself rather than running the other way round the globe.
 */
export function unwrappedLongitudeRange(bounds: GeographicBounds): { west: number; east: number } {
  return {
    west: bounds.minLongitude,
    east: crossesDateline(bounds) ? bounds.maxLongitude + 360 : bounds.maxLongitude,
  };
}

/**
 * Compute the tightest longitudinal interval covering all the given longitudes,
 * accounting for the antimeridian. Returns [west, east]; west > east means the
 * interval crosses 180°.
 */
// NOTE: for antipodal or evenly-spaced longitudes the "largest gap" is ambiguous, so the
// covering arc (and thus the box) may be the wider of two equally-valid options. This is an
// inherent property of minimum-arc on a circle and is acceptable for a bounding box.
function computeLongitudinalBounds(longitudes: number[]): { west: number; east: number } {
  // A longitude is a degenerate (zero-width) interval, so the interval version of
  // the largest-gap search below covers the point case too.
  return smallestCoveringArc(longitudes.map((lon) => [lon, lon] as [number, number]));
}

/**
 * Smallest [west, east] arc covering a set of normal (west <= east) longitude
 * intervals, all within [-180, 180]. Returns west > east when the covering arc
 * crosses the antimeridian, and the full [-180, 180] when the intervals already
 * cover the whole circle.
 */
function smallestCoveringArc(intervals: Array<[number, number]>): { west: number; east: number } {
  const finite = intervals.filter(
    ([start, end]) => Number.isFinite(start) && Number.isFinite(end)
  );
  if (finite.length === 0) return { west: NaN, east: NaN };

  const sorted = [...finite].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }

  let largestGap = -Infinity;
  let gapWestIdx = -1; // index of the merged interval on the WEST side of the largest gap
  for (let i = 0; i < merged.length - 1; i++) {
    const gap = merged[i + 1][0] - merged[i][1];
    if (gap > largestGap) {
      largestGap = gap;
      gapWestIdx = i;
    }
  }
  const first = merged[0];
  const last = merged[merged.length - 1];
  // Wrap gap: from the easternmost end, across the antimeridian, to the westernmost start.
  const wrapGap = first[0] + 360 - last[1];
  if (wrapGap >= largestGap) {
    // No gap at all anywhere on the circle -> the intervals cover the full globe.
    if (wrapGap <= 0) return { west: -180, east: 180 };
    // Largest gap straddles 180° -> the data does NOT cross it; plain min/max is tightest.
    return { west: first[0], east: last[1] };
  }
  // Largest gap is interior -> covering arc crosses the dateline.
  // West edge = start of the interval east of the gap; east edge = end of the one west of it.
  return { west: merged[gapWestIdx + 1][0], east: merged[gapWestIdx][1] };
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
 * Min/max of a numeric series, ignoring non-finite values. Returns null when
 * nothing finite is left.
 */
export function finiteExtent(values: number[]): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? null : { min, max };
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
  const minLatitude = combineLatitude(a.minLatitude, b.minLatitude, Math.min);
  const maxLatitude = combineLatitude(a.maxLatitude, b.maxLatitude, Math.max);

  // Union the two arcs exactly: split each into normal intervals at the antimeridian
  // and take the smallest arc covering all of them. (Sampling the circle in 1° steps
  // instead, as this once did, mistook the sampling step for a real hole in the
  // coverage: a near-global box unioned with a small one came back as a 359° box
  // crossing the dateline, i.e. *smaller* than one of its own inputs.)
  const { west, east } = smallestCoveringArc([
    ...lonIntervals(a.minLongitude, a.maxLongitude),
    ...lonIntervals(b.minLongitude, b.maxLongitude),
  ]);
  return { minLatitude, maxLatitude, minLongitude: west, maxLongitude: east };
}

/** Combine two latitudes with min/max, ignoring a non-finite one. */
function combineLatitude(x: number, y: number, pick: (p: number, q: number) => number): number {
  if (!Number.isFinite(x)) return y;
  if (!Number.isFinite(y)) return x;
  return pick(x, y);
}

/**
 * Decompose a [west, east] longitude range into one or two normal (west <= east)
 * intervals, splitting at the antimeridian when the range crosses it.
 *
 * A range with a non-finite edge describes no arc at all, so it contributes no
 * interval: the crossing test (west <= east) is false for NaN, which would
 * otherwise emit a spurious [-180, east] / [west, 180] half-interval and widen
 * every union built from it.
 */
function lonIntervals(west: number, east: number): Array<[number, number]> {
  if (!Number.isFinite(west) || !Number.isFinite(east)) return [];
  if (west <= east) return [[west, east]];
  return [[west, 180], [-180, east]];
}

/**
 * lonIntervals for MEMBERSHIP tests. +180 and -180 are the same meridian, so an
 * interval that touches one spelling of the seam must also contain the other, or
 * a stored longitude of exactly 180 is invisible to a viewport that starts at
 * -180. Not used for unions, where a degenerate seam interval would re-express
 * a plain 170..180 box as a crossing one.
 */
function lonIntervalsForMembership(west: number, east: number): Array<[number, number]> {
  const intervals = lonIntervals(west, east);
  const touchesSeam = intervals.some(([a, b]) => a === -180 || b === 180);
  if (touchesSeam) {
    if (!intervals.some(([a]) => a === -180)) intervals.push([-180, -180]);
    if (!intervals.some(([, b]) => b === 180)) intervals.push([180, 180]);
  }
  return intervals;
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

  for (const [a0, a1] of lonIntervalsForMembership(bounds1.minLongitude, bounds1.maxLongitude)) {
    for (const [b0, b1] of lonIntervalsForMembership(bounds2.minLongitude, bounds2.maxLongitude)) {
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
  return lonIntervalsForMembership(bounds.minLongitude, bounds.maxLongitude).some(([a, b]) => longitude >= a && longitude <= b);
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

