import type { Map as LeafletMap } from 'leaflet';
import { MAP_PANES } from '@/lib/map-style';

export interface PaneSpec {
  name: string;
  zIndex: number;
  /** false makes the pane click-through (labels must never swallow a marker click). */
  interactive?: boolean;
}

/**
 * Get or create a custom Leaflet pane with a fixed z-index. Idempotent, so every layer that
 * draws into the pane can call it. Use MAP_PANES (lib/map-style.ts) for the shared panes:
 * `ensureMapPane(map, MAP_PANES.faults)`.
 */
export function ensureMapPane(map: LeafletMap, { name, zIndex, interactive = true }: PaneSpec): HTMLElement {
  const pane = map.getPane(name) ?? map.createPane(name);
  pane.style.zIndex = String(zIndex);
  if (!interactive) pane.style.pointerEvents = 'none';
  return pane;
}

/** The basemap label pane: above the events, click-through. */
export function ensureLabelsPane(map: LeafletMap): HTMLElement {
  return ensureMapPane(map, { ...MAP_PANES.labels, interactive: false });
}
