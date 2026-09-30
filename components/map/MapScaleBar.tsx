'use client';

import { ScaleControl } from 'react-leaflet';

/** Scale bar options every map uses (spec S3): metric only, at most 120 px wide. */
export const MAP_SCALE_OPTIONS = Object.freeze({ position: 'bottomleft' as const, metric: true, imperial: false, maxWidth: 120 });

/**
 * Metric scale bar, bottom-left (styled in app/globals.css). Render inside <MapContainer>.
 * Imperative maps: `L.control.scale(MAP_SCALE_OPTIONS).addTo(map)`.
 */
export function MapScaleBar() {
  return <ScaleControl {...MAP_SCALE_OPTIONS} />;
}
