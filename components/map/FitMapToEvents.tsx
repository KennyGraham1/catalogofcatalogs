'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { FIT_BOUNDS_OPTIONS } from '@/lib/map-style';
import { boundsKey, type LatLngBoundsTuple } from '@/lib/map-view';

/** DOM events on the map container that mean the user has taken over the view. */
const USER_VIEW_EVENTS = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const;

/**
 * Keep the view framing the events while they stream in: refits (padding 24 px, maxZoom
 * 9) whenever `bounds` changes extent, and whenever the map container is resized, until the
 * user pans, zooms or uses the keyboard on the map - after that the view is theirs. The
 * resize refit matters because a map is often created before its card reaches full height:
 * Leaflet keeps the zoom it computed for the small container, so a catalogue that arrived in
 * one batch stayed framed too wide. The bounds it mounts with are assumed to be the ones the
 * map was created with, so there is no refit on mount:
 *
 * ```tsx
 * const bounds = useMemo(() => eventsFitBounds(events), [events]);
 * <MapContainer bounds={bounds} boundsOptions={FIT_BOUNDS_OPTIONS} ...>
 *   <FitMapToEvents bounds={bounds} />
 * ```
 */
export function FitMapToEvents({ bounds }: { bounds: LatLngBoundsTuple }) {
  const map = useMap();
  const key = boundsKey(bounds);
  const lastKey = useRef(key);
  const userMoved = useRef(false);
  const latestBounds = useRef(bounds);
  latestBounds.current = bounds;

  useEffect(() => {
    const container = map.getContainer();
    const mark = () => { userMoved.current = true; };
    USER_VIEW_EVENTS.forEach(name => container.addEventListener(name, mark, { passive: true }));
    return () => USER_VIEW_EVENTS.forEach(name => container.removeEventListener(name, mark));
  }, [map]);

  useEffect(() => {
    const refit = () => {
      if (!userMoved.current) map.fitBounds(latestBounds.current, FIT_BOUNDS_OPTIONS);
    };
    map.on('resize', refit);
    return () => { map.off('resize', refit); };
  }, [map]);

  useEffect(() => {
    if (key === lastKey.current || userMoved.current) return;
    lastKey.current = key;
    map.fitBounds(bounds, FIT_BOUNDS_OPTIONS);
  }, [map, key, bounds]);

  return null;
}
