/**
 * Locality descriptions for earthquake locations, in the form GeoNet uses:
 * "15 km north-east of Gisborne". The reference places are the official New Zealand place
 * names of the LINZ New Zealand Gazetteer (https://gazetteer.linz.govt.nz, CC BY 4.0):
 * every city, town, village and locality, plus remote islands such as Raoul Island, built
 * into public/data/nz-localities.json by scripts/build-nz-localities.mjs. Beyond
 * MAX_LOCALITY_DISTANCE_KM from every place the description is withheld (null): a global
 * catalogue event is not "2,000 km north-west of Kaitaia".
 */

export interface Locality {
  name: string;
  latitude: number;
  longitude: number;
}

/** The place list the maps load (fetched once per page). */
export const NZ_LOCALITIES_URL = '/data/nz-localities.json';

/** Credit for the place names, as the map attribution shows it (CC BY 4.0 requires it). */
export const LOCALITIES_ATTRIBUTION = 'Place names &copy; <a href="https://gazetteer.linz.govt.nz">LINZ</a> (CC BY 4.0)';

let localitiesPromise: Promise<Locality[]> | null = null;

/**
 * The Gazetteer places, fetched once per page load and shared by every map. Resolves to an
 * empty list on failure (cards then fall back to the region or the epicentre), and the
 * next call tries again.
 */
export function loadNzLocalities(): Promise<Locality[]> {
  if (!localitiesPromise) {
    const attempt: Promise<Locality[]> = Promise.resolve()
      // Called inside the chain, so a missing fetch (or one that throws) also ends in the catch.
      .then(() => fetch(NZ_LOCALITIES_URL))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load place names: ${response.status}`);
        const data = await response.json() as { places?: unknown };
        if (!Array.isArray(data.places)) throw new Error('Place-name file has no places');
        return (data.places as unknown[]).flatMap((entry) => {
          if (!Array.isArray(entry)) return [];
          const [name, latitude, longitude] = entry;
          return typeof name === 'string' && Number.isFinite(latitude) && Number.isFinite(longitude)
            ? [{ name, latitude: Number(latitude), longitude: Number(longitude) }]
            : [];
        });
      })
      .catch(() => {
        localitiesPromise = null;
        return [];
      });
    localitiesPromise = attempt;
  }
  return localitiesPromise;
}

/** Test hook: forget the shared load. */
export function resetNzLocalitiesForTests(): void {
  localitiesPromise = null;
}

/** Farthest distance (km) at which an event is described relative to a place. */
export const MAX_LOCALITY_DISTANCE_KM = 300;

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance (km) and initial bearing (degrees from north) from a to b. */
export function distanceAndBearing(
  fromLat: number, fromLon: number, toLat: number, toLon: number
): { distanceKm: number; bearing: number } {
  const φ1 = toRadians(fromLat);
  const φ2 = toRadians(toLat);
  const Δφ = φ2 - φ1;
  const Δλ = toRadians(toLon - fromLon);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distanceKm = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { distanceKm, bearing };
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;

/** Eight-point compass direction for a bearing in degrees. */
export function compassDirection(bearing: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/**
 * "15 km north-east of Gisborne", "Near Taupō" (within 3 km), or null when the event is
 * farther than MAX_LOCALITY_DISTANCE_KM from every place or its coordinates are not finite.
 * Distances round to the nearest km below 20 km and to the nearest 5 km above.
 */
export function describeLocality(
  latitude: number, longitude: number, places: ReadonlyArray<Locality>
): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || places.length === 0) return null;
  let best: { place: Locality; distanceKm: number; bearing: number } | null = null;
  for (const place of places) {
    const { distanceKm, bearing } = distanceAndBearing(place.latitude, place.longitude, latitude, longitude);
    if (!best || distanceKm < best.distanceKm) best = { place, distanceKm, bearing };
  }
  if (!best || best.distanceKm > MAX_LOCALITY_DISTANCE_KM) return null;
  if (best.distanceKm < 3) return `Near ${best.place.name}`;
  const rounded = best.distanceKm < 20 ? Math.round(best.distanceKm) : Math.round(best.distanceKm / 5) * 5;
  return `${rounded} km ${compassDirection(best.bearing)} of ${best.place.name}`;
}

/** How well the azimuthal gap constrains the epicentre (the usual 90° / 180° thresholds). */
export function azimuthalGapQuality(gap: number | null | undefined): { label: string; level: 'good' | 'fair' | 'poor' } | null {
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > 360) return null;
  if (gap <= 90) return { label: 'well constrained', level: 'good' };
  if (gap <= 180) return { label: 'moderately constrained', level: 'fair' };
  return { label: 'poorly constrained', level: 'poor' };
}
