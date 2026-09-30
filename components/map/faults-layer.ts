import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import type { FaultCollection } from '@/lib/fault-data';
import { FAULT_ATTRIBUTION, FAULT_STYLE, MAP_PANES, faultPathOptions } from '@/lib/map-style';
import { ensureMapPane } from './map-panes';

export interface FaultsLayerHandle {
  layer: L.GeoJSON;
  /** Restyle for the site theme (no rebuild of the ~10,000 traces). */
  setDark(isDark: boolean): void;
  /** Take the traces and their zoom listener off the map. */
  remove(): void;
}

/**
 * A canvas renderer in the faults pane when the browser can draw on a canvas: as SVG the
 * ~10,000 traces would be ~10,000 DOM paths. Undefined (Leaflet's default renderer) where
 * a 2D context is unavailable.
 */
function canvasFaultsRenderer(): L.Canvas | undefined {
  try {
    return document.createElement('canvas').getContext('2d')
      ? L.canvas({ padding: 0.5, pane: MAP_PANES.faults.name })
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Active-fault traces on an imperative Leaflet map (e.g. DuplicateGroupMap): the same look
 * as the react-leaflet <FaultsOverlay> (MapOverlays.tsx) - faultPathOptions in the faults
 * pane (z 380, under the events), non-interactive, the heavier line from zoom 9, and the
 * GNS Science attribution. Drawn on a canvas in that pane unless `renderer` is given.
 */
export function attachFaultsLayer(
  map: L.Map,
  data: FaultCollection,
  { isDark, renderer: givenRenderer }: { isDark: boolean; renderer?: L.Renderer },
): FaultsLayerHandle {
  ensureMapPane(map, MAP_PANES.faults);
  const ownRenderer = givenRenderer ? undefined : canvasFaultsRenderer();
  const renderer = givenRenderer ?? ownRenderer;
  let dark = isDark;
  let zoomedIn = map.getZoom() >= FAULT_STYLE.zoomThreshold;
  const style = () => faultPathOptions(dark, zoomedIn ? FAULT_STYLE.zoomThreshold : 0);

  const options: L.GeoJSONOptions & { attribution: string } = {
    pane: MAP_PANES.faults.name,
    interactive: false,
    style,
    attribution: FAULT_ATTRIBUTION,
    ...(renderer ? { renderer } : {}),
  };
  const layer = L.geoJSON(data as unknown as GeoJsonObject, options).addTo(map);

  // Restyle only when the zoom crosses the weight step, not on every zoom.
  const onZoomEnd = () => {
    const next = map.getZoom() >= FAULT_STYLE.zoomThreshold;
    if (next === zoomedIn) return;
    zoomedIn = next;
    layer.setStyle(style());
  };
  map.on('zoomend', onZoomEnd);

  return {
    layer,
    setDark(next) {
      if (next === dark) return;
      dark = next;
      layer.setStyle(style());
    },
    remove() {
      map.off('zoomend', onZoomEnd);
      layer.remove();
      ownRenderer?.remove();
    },
  };
}
