import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import { isEventInBounds, normalizeSampleLimit, type ViewportBounds } from '@/lib/earthquake-utils';

interface UseMapViewportOptions {
  /**
   * Debounce delay for viewport updates in milliseconds
   */
  debounceDelay?: number;
  /**
   * Padding factor to extend bounds (1.1 = 5% padding on each side)
   */
  paddingFactor?: number;
}

/**
 * Hook to track map viewport bounds with debouncing for performance
 */
export function useMapViewport(options: UseMapViewportOptions = {}) {
  const { debounceDelay = 150, paddingFactor = 1.1 } = options;
  const map = useMap();
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const [zoom, setZoom] = useState<number>(map?.getZoom() ?? 6);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateBounds = useCallback(() => {
    if (!map) return;

    const mapBounds = map.getBounds();
    const center = mapBounds.getCenter();
    const latSpan = mapBounds.getNorth() - mapBounds.getSouth();
    const lngSpan = mapBounds.getEast() - mapBounds.getWest();

    // Add padding to bounds
    const paddedBounds: ViewportBounds = {
      north: center.lat + (latSpan / 2) * paddingFactor,
      south: center.lat - (latSpan / 2) * paddingFactor,
      east: center.lng + (lngSpan / 2) * paddingFactor,
      west: center.lng - (lngSpan / 2) * paddingFactor,
    };

    setBounds(previous => previous &&
      previous.north === paddedBounds.north && previous.south === paddedBounds.south &&
      previous.east === paddedBounds.east && previous.west === paddedBounds.west
      ? previous : paddedBounds);
    setZoom(map.getZoom());
  }, [map, paddingFactor]);

  const debouncedUpdateBounds = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(updateBounds, debounceDelay);
  }, [updateBounds, debounceDelay]);

  useEffect(() => {
    if (!map) return;

    // Initial bounds
    updateBounds();

    // Listen for map events
    map.on('moveend', debouncedUpdateBounds);
    map.on('zoomend', debouncedUpdateBounds);
    map.on('resize', debouncedUpdateBounds);

    return () => {
      map.off('moveend', debouncedUpdateBounds);
      map.off('zoomend', debouncedUpdateBounds);
      map.off('resize', debouncedUpdateBounds);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [map, debouncedUpdateBounds, updateBounds]);

  return { bounds, zoom };
}

/**
 * Check if a point is within viewport bounds
 */
export function isInViewport(
  lat: number,
  lng: number,
  bounds: ViewportBounds | null
): boolean {
  if (!bounds) return true; // Show all if no bounds

  return isEventInBounds({ latitude: lat, longitude: lng }, bounds);
}

/**
 * Filter events to only those within viewport bounds
 */
export function filterEventsInViewport<T extends { latitude: number; longitude: number }>(
  events: T[],
  bounds: ViewportBounds | null
): T[] {
  if (!bounds) return events;

  return events.filter(event =>
    isInViewport(event.latitude, event.longitude, bounds)
  );
}

/**
 * Component that tracks viewport and provides filtered events
 */
interface UseViewportFilteredEventsOptions<T> {
  events: T[];
  maxEvents?: number;
  enabled?: boolean;
}

export function useViewportFilteredEvents<T extends { latitude: number; longitude: number; magnitude: number }>(
  options: UseViewportFilteredEventsOptions<T>
) {
  const { events, maxEvents = 2000, enabled = true } = options;
  const { bounds, zoom } = useMapViewport();

  const inViewport = useMemo(() => enabled
    ? filterEventsInViewport(events, bounds) : events, [events, bounds, enabled]);
  const filteredEvents = useMemo(() => {
    const limit = normalizeSampleLimit(maxEvents, inViewport.length);
    return inViewport.length <= limit ? inViewport : [...inViewport]
      .sort((a, b) => b.magnitude - a.magnitude).slice(0, limit);
  }, [inViewport, maxEvents]);

  return {
    events: filteredEvents,
    bounds,
    zoom,
    totalInViewport: inViewport.length,
    totalEvents: events.length,
  };
}
