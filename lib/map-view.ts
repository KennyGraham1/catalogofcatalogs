/**
 * Initial-view helpers shared by the event maps: fit the plotted events, antimeridian
 * aware, falling back to New Zealand for an empty catalogue. Pure (no Leaflet runtime).
 */
import { boundsFromLatLon, NZ_NATIONAL_BOUNDS, unwrappedLongitudeRange, type GeographicBounds } from './geo-bounds-utils';

/** [[south, west], [north, east]] in the continuous frame Leaflet draws in (east may exceed 180). */
export type LatLngBoundsTuple = [[number, number], [number, number]];

/** A GeographicBounds box as Leaflet bounds, unwrapping a box that crosses 180°. */
export function toLeafletBounds(bounds: GeographicBounds): LatLngBoundsTuple {
  const { west, east } = unwrappedLongitudeRange(bounds);
  return [[bounds.minLatitude, west], [bounds.maxLatitude, east]];
}

/** All of New Zealand (Kermadecs to Campbell Island), crossing 180°. */
export const NZ_FALLBACK_BOUNDS: LatLngBoundsTuple = toLeafletBounds(NZ_NATIONAL_BOUNDS);

/**
 * Bounds that frame every event with a finite position, taking the shorter way round the
 * antimeridian (NZ/Kermadec data straddles 180°); NZ when there is nothing to frame.
 */
export function eventsFitBounds(events: ReadonlyArray<{ latitude: number; longitude: number }>): LatLngBoundsTuple {
  const box = boundsFromLatLon(events.map(event => ({ lat: event.latitude, lon: event.longitude })));
  if (!box || ![box.minLatitude, box.maxLatitude, box.minLongitude, box.maxLongitude].every(Number.isFinite)) {
    return NZ_FALLBACK_BOUNDS;
  }
  return toLeafletBounds(box);
}

/** Stable string for a bounds tuple (4 dp), to detect a real change of extent. */
export function boundsKey(bounds: LatLngBoundsTuple): string {
  return bounds.flat().map(value => value.toFixed(4)).join(',');
}
