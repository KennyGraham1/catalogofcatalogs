import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import type { LatLngBounds, Map as LeafletMap } from 'leaflet';

interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface UseMapViewportOptions {
  /**
   * Debounce delay for viewport updates in milliseconds
   */
  debounceDelay?: number;
  /**
   * Padding factor to extend bounds (1.1 = 10% padding on each side)
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
  const [zoom, setZoom] = useState<number>(map?.getZoom() || 6);
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

    setBounds(paddedBounds);
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

    return () => {
      map.off('moveend', debouncedUpdateBounds);
      map.off('zoomend', debouncedUpdateBounds);
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

  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
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

  const filteredEvents = useMemo(() => {
    if (!enabled || !bounds) return events.slice(0, maxEvents);

    // Filter to viewport
    let inViewport = filterEventsInViewport(events, bounds);

    // If still too many, prioritize by magnitude
    if (inViewport.length > maxEvents) {
      inViewport = [...inViewport]
        .sort((a, b) => b.magnitude - a.magnitude)
        .slice(0, maxEvents);
    }

    return inViewport;
  }, [events, bounds, maxEvents, enabled]);

  return {
    events: filteredEvents,
    bounds,
    zoom,
    totalInViewport: filteredEvents.length,
    totalEvents: events.length,
  };
}
