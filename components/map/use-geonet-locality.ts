'use client';

import { useEffect, useState } from 'react';
import { fetchGeoNetLocality, geonetPublicIdOf, peekGeoNetLocality } from '@/lib/geonet-locality';

// No react-leaflet here: the event popup uses this hook and is imported by pages that render
// on the server. The map attribution for GeoNet's text is GeoNetLocalityAttribution in
// ./use-nz-localities.

/**
 * GeoNet's locality for a GeoNet event (lib/geonet-locality.ts) once the hover card has
 * asked for it: the cached answer at once, or the answer of a request already under way.
 * Never starts a request of its own, so a popup or panel adds no traffic to GeoNet. null
 * for any other event, or while nothing is known.
 */
export function useGeoNetLocality(event: object | null | undefined): string | null {
  const publicId = geonetPublicIdOf(event);
  const cached = publicId ? peekGeoNetLocality(publicId) : undefined;
  const [joined, setJoined] = useState<{ id: string; locality: string } | null>(null);
  useEffect(() => {
    if (!publicId || peekGeoNetLocality(publicId) !== undefined) return;
    let active = true;
    fetchGeoNetLocality(publicId, { start: false }).then((locality) => {
      if (active && locality) setJoined({ id: publicId, locality });
    });
    return () => { active = false; };
  }, [publicId]);
  if (!publicId) return null;
  if (typeof cached === 'string') return cached;
  return joined?.id === publicId ? joined.locality : null;
}
