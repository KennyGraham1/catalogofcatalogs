'use client';

import { useCallback, useMemo, useState } from 'react';
import { sampleEarthquakeEvents } from '@/lib/earthquake-utils';
import { selectMapEvents, positionInMapWorld, type MapDetail, type MapViewport } from '@/lib/map-event-selection';

interface Event {
  id?: string | number | null;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
}

export function useMapEventSelection<T extends Event>(events: T[], detail: MapDetail) {
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const eligible = useMemo(() => sampleEarthquakeEvents(events, Infinity).sampled, [events]);
  const selection = useMemo(() => viewport ? selectMapEvents(eligible, viewport, detail)
    : { sampled: [] as T[], visibleCount: 0 }, [eligible, viewport, detail]);
  const bounds = viewport?.bounds;
  const getPosition = useCallback((event: Pick<Event, 'latitude' | 'longitude'>): [number, number] => bounds
    ? positionInMapWorld(event, bounds) : [event.latitude, event.longitude], [bounds]);
  return {
    ...selection, total: eligible.length, displayCount: selection.sampled.length,
    isSampled: selection.sampled.length < selection.visibleCount, onViewportChange: setViewport, getPosition,
  };
}
