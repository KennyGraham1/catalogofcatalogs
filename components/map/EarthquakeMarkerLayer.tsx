'use client';

import { memo, useMemo } from 'react';
import { CircleMarker } from 'react-leaflet';
import { useMapViewport } from '@/hooks/use-map-viewport';
import { getMagnitudePixelRadius, isEventInBounds } from '@/lib/earthquake-utils';
import { positionInMapWorld } from '@/lib/map-event-selection';

interface MarkerEvent {
  id?: string | number | null;
  latitude: number;
  longitude: number;
  magnitude: number;
}

interface Props<T extends MarkerEvent> {
  events: T[];
  getColor: (event: T) => string;
  opacity: number;
  onEventClick: (event: T, position: [number, number]) => void;
}

/** Keep marker reconciliation out of popup/control updates and cull offscreen paths. */
export const EarthquakeMarkerLayer = memo(function EarthquakeMarkerLayer<T extends MarkerEvent>({
  events, getColor, opacity, onEventClick,
}: Props<T>) {
  const { bounds } = useMapViewport();
  const ordered = useMemo(() => [...events].sort((a, b) => a.magnitude - b.magnitude), [events]);
  return useMemo(() => {
    if (!bounds) return null;
    return ordered.filter(event => isEventInBounds(event, bounds)).map((event, index) => {
      // Draw in the world copy the user is viewing (NZ commonly straddles 180°).
      const position = positionInMapWorld(event, bounds);
      const color = getColor(event);
      return <CircleMarker
        key={event.id ?? index}
        center={position}
        radius={getMagnitudePixelRadius(event.magnitude)}
        pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight: 1 }}
        eventHandlers={{ click: () => onEventClick(event, position) }}
      />;
    });
  }, [ordered, bounds, getColor, opacity, onEventClick]);
}) as <T extends MarkerEvent>(props: Props<T>) => React.ReactNode;
