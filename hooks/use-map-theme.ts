/**
 * Map theme: the basemaps every map offers (BASE_LAYERS, the single source) and hooks that
 * follow the site's light/dark theme.
 *
 * CARTO's keyless basemaps now return an "API KEY REQUIRED" watermark, so the themed
 * defaults are Esri's keyless World Light/Dark Gray Canvas. Their place-name reference
 * layers (LABEL_LAYERS) are drawn in a separate pane ABOVE the data - see
 * components/map/MapLayerControl.tsx.
 */

import { useEffect, useMemo, useState } from 'react';
import { MARKER_STYLE } from '@/lib/map-style';

export interface MapThemeConfig {
  /** Tile URL template of the gray base for the current theme (maps without a layer control). */
  tileLayerUrl: string;
  attribution: string;
  isDark: boolean;
  /** The full BASE_LAYERS entry behind tileLayerUrl. */
  baseLayer: BaseLayerConfig;
}

/**
 * Base layer configuration for map layer control
 */
export interface BaseLayerConfig {
  /** Name shown in the layer menu (also the layer's identity). */
  name: string;
  url: string;
  attribution: string;
  /** Deepest zoom the map may show over this layer (tiles are upscaled past maxNativeZoom). */
  maxZoom?: number;
  /** Deepest zoom the tile service actually has tiles for. */
  maxNativeZoom?: number;
  /** Set on the two gray canvas bases: the theme they belong to and their label layer. */
  theme?: 'light' | 'dark';
  labelsUrl?: string;
  /**
   * The base's open-ocean colour, painted behind its tiles (attachBaseLayers). At a
   * fractional zoom tiles sit at sub-pixel offsets, and any hairline between them then
   * shows this colour rather than a light seam; tiles still loading show it too.
   */
  background?: string;
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_CANVAS_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

export const LIGHT_GRAY_BASE = 'Light gray';
export const DARK_GRAY_BASE = 'Dark gray';

/**
 * All base layers, in layer-menu order. The first two follow the site theme.
 */
export const BASE_LAYERS: BaseLayerConfig[] = [
  {
    name: LIGHT_GRAY_BASE,
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_CANVAS_ATTRIBUTION,
    maxZoom: 19,
    maxNativeZoom: 16,
    theme: 'light',
    labelsUrl: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    background: '#d0cfd4',
  },
  {
    name: DARK_GRAY_BASE,
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_CANVAS_ATTRIBUTION,
    maxZoom: 19,
    maxNativeZoom: 16,
    theme: 'dark',
    labelsUrl: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    background: '#222327',
  },
  {
    // Bathymetry: trenches and the Hikurangi margin read here.
    name: 'Ocean (bathymetry)',
    url: `${ESRI}/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, and Esri',
    maxZoom: 19,
    maxNativeZoom: 13,
    // Bathymetry shading varies; a mid-depth blue.
    background: '#8fb3dc',
  },
  {
    name: 'Satellite',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
    background: '#0e3f52',
  },
  {
    name: 'Streets (OpenStreetMap)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    background: '#aad3df',
  },
];

/** The gray base that belongs to a theme. */
export function getThemeBaseLayer(isDark: boolean): BaseLayerConfig {
  return BASE_LAYERS.find(layer => layer.theme === (isDark ? 'dark' : 'light'))!;
}

/**
 * Get the default base layer name based on dark mode
 */
export function getDefaultBaseLayer(isDark: boolean): string {
  return getThemeBaseLayer(isDark).name;
}

/** True for the two theme-following gray bases. */
export function isThemeBaseLayer(name: string | null | undefined): boolean {
  return BASE_LAYERS.some(layer => layer.name === name && layer.theme !== undefined);
}

/** Read the site theme (next-themes toggles `dark` on <html>). */
function documentIsDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/**
 * Whether the site is in dark mode, updated live when the theme is toggled. Initialised
 * from the document so a client-only map mounts with the right basemap and palette.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(documentIsDark);

  useEffect(() => {
    const check = () => setIsDark(documentIsDark());
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/**
 * Hook to get map theme configuration based on current theme: the gray base for maps
 * that draw a single TileLayer instead of MapLayerControl.
 */
export function useMapTheme(): MapThemeConfig {
  const isDark = useIsDarkTheme();
  return useMemo(() => {
    const baseLayer = getThemeBaseLayer(isDark);
    return { tileLayerUrl: baseLayer.url, attribution: baseLayer.attribution, isDark, baseLayer };
  }, [isDark]);
}

/**
 * Get color adjustments for map elements based on theme
 */
export function useMapColors() {
  const isDark = useIsDarkTheme();

  // Memoize so the returned object keeps a stable identity between renders. Map
  // components depend on this in marker useMemo() deps; a fresh object each render
  // would rebuild every plotted marker on every parent re-render.
  return useMemo(() => ({
    isDark,

    /** Event marker fill opacity (lib/map-style.ts MARKER_STYLE). */
    markerOpacity: MARKER_STYLE.fillOpacity,
    lineOpacity: isDark ? 0.8 : 0.6,

    // Fault line colors (adjusted for dark mode)
    faultColors: {
      alpine: isDark ? '#FF6B6B' : '#FF0000',
      subduction: isDark ? '#C92A2A' : '#8B0000',
      wellington: isDark ? '#FF8C42' : '#FF4500',
    },

    // Station marker colors
    stationColor: isDark ? '#4DABF7' : '#1E88E5',

    // Uncertainty ellipse color
    uncertaintyColor: isDark ? '#FFA94D' : '#FF9800',
  }), [isDark]);
}
