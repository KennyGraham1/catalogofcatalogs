'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { BASE_LAYERS, getThemeBaseLayer, useIsDarkTheme, type BaseLayerConfig } from '@/hooks/use-map-theme';
import { MAP_PANES } from '@/lib/map-style';
import { ensureLabelsPane } from './map-panes';

/** Opacity of the place-label reference layer drawn above the events. */
export const LABELS_OPACITY = 0.9;

export interface BaseLayerControlOptions {
  /** Current site theme: picks the gray base the map starts on. */
  isDark: boolean;
  position?: L.ControlPosition;
  /** Base layers to offer; defaults to BASE_LAYERS. */
  layers?: BaseLayerConfig[];
}

export interface BaseLayerControlHandle {
  control: L.Control.Layers;
  /** Follow a site theme change: swap between the gray bases; a user-chosen other base stays. */
  setDark(isDark: boolean): void;
  /** Name of the active base layer (null before one is added). */
  activeBase(): string | null;
  /** Remove the control, every base and label layer, and the listeners. */
  remove(): void;
}

/** A Leaflet tile layer for a BASE_LAYERS entry (keeps maxNativeZoom so deep zooms upscale). */
export function createBaseTileLayer(config: BaseLayerConfig): L.TileLayer {
  return L.tileLayer(config.url, {
    attribution: config.attribution,
    maxZoom: config.maxZoom,
    maxNativeZoom: config.maxNativeZoom,
  });
}

/**
 * Add the shared base-layer switcher to an imperative Leaflet map: a collapsed layers
 * control listing BASE_LAYERS, the theme's gray base active, and - while a gray base is
 * active - its place-label layer in the click-through 'labels' pane above the data.
 * MapLayerControl wraps this for react-leaflet maps; imperative maps call it directly.
 */
export function attachBaseLayers(
  map: L.Map,
  { isDark, position = 'topright', layers = BASE_LAYERS }: BaseLayerControlOptions
): BaseLayerControlHandle {
  ensureLabelsPane(map);

  const bases = new Map<string, L.TileLayer>();
  const labels = new Map<string, L.TileLayer>();
  const themeOf = new Map<string, 'light' | 'dark' | undefined>();
  for (const config of layers) {
    bases.set(config.name, createBaseTileLayer(config));
    themeOf.set(config.name, config.theme);
    if (config.labelsUrl) {
      labels.set(config.name, L.tileLayer(config.labelsUrl, {
        pane: MAP_PANES.labels.name,
        opacity: LABELS_OPACITY,
        maxZoom: config.maxZoom,
        maxNativeZoom: config.maxNativeZoom,
      }));
    }
  }

  const control = L.control.layers(Object.fromEntries(bases), undefined, { position, collapsed: true });
  control.addTo(map);

  let active: string | null = null;
  let activeLabels: L.TileLayer | null = null;

  // The control fires 'baselayerchange' both for a click in its menu and for a base added
  // programmatically (initial add, theme swap), so labels follow every change.
  const onBaseLayerChange = (event: L.LayersControlEvent) => {
    if (!bases.has(event.name) || bases.get(event.name) !== event.layer) return;
    active = event.name;
    if (activeLabels) map.removeLayer(activeLabels);
    activeLabels = labels.get(event.name) ?? null;
    activeLabels?.addTo(map);
  };
  map.on('baselayerchange', onBaseLayerChange);

  const show = (name: string) => {
    const previous = active ? bases.get(active) : undefined;
    // Add the new base before removing the old one, so its tiles load over the old map
    // rather than over a blank background.
    bases.get(name)?.addTo(map);
    if (previous && previous !== bases.get(name)) map.removeLayer(previous);
  };

  const initial = layers.find(layer => layer.theme === (isDark ? 'dark' : 'light'))?.name
    ?? getThemeBaseLayer(isDark).name;
  if (bases.has(initial)) show(initial);
  else if (layers[0]) show(layers[0].name);

  return {
    control,
    setDark(nextDark: boolean) {
      if (!active || themeOf.get(active) === undefined) return; // a non-gray base the user chose stays
      const target = layers.find(layer => layer.theme === (nextDark ? 'dark' : 'light'));
      if (target && target.name !== active) show(target.name);
    },
    activeBase: () => active,
    remove() {
      map.off('baselayerchange', onBaseLayerChange);
      control.remove();
      bases.forEach(layer => { if (map.hasLayer(layer)) map.removeLayer(layer); });
      labels.forEach(layer => { if (map.hasLayer(layer)) map.removeLayer(layer); });
      active = null;
      activeLabels = null;
    },
  };
}

interface MapLayerControlProps {
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
}

/**
 * Base-layer switcher for react-leaflet maps: a compact 32 px layers button (collapsed
 * Leaflet control, styled in app/globals.css), the gray base that matches the site theme,
 * labels above the data, and a live swap between the gray bases when the theme changes.
 *
 * Usage:
 * ```tsx
 * <MapContainer ...>
 *   <MapLayerControl />
 * </MapContainer>
 * ```
 */
export function MapLayerControl({ position = 'topright' }: MapLayerControlProps) {
  const map = useMap();
  const isDark = useIsDarkTheme();
  const isDarkRef = useRef(isDark);
  const handleRef = useRef<BaseLayerControlHandle | null>(null);

  useEffect(() => {
    const handle = attachBaseLayers(map, { isDark: isDarkRef.current, position });
    handleRef.current = handle;
    return () => {
      handle.remove();
      handleRef.current = null;
    };
  }, [map, position]);

  useEffect(() => {
    isDarkRef.current = isDark;
    handleRef.current?.setDark(isDark);
  }, [isDark]);

  return null;
}

export default MapLayerControl;
