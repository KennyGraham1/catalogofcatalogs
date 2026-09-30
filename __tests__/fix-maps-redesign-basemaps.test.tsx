/**
 * Map redesign S1: basemaps. CARTO's keyless tiles now carry an "API KEY REQUIRED"
 * watermark, so the themed defaults are Esri's gray canvas; their place labels are drawn
 * in a click-through pane above the data while a gray base is active, and a theme toggle
 * swaps between the gray bases but leaves a user-chosen base alone. Uses the real
 * installed Leaflet under jsdom (tiles are <img> elements jsdom never fetches).
 */
import '@testing-library/jest-dom';
import { act, renderHook } from '@testing-library/react';

// react-leaflet ships ESM that Jest does not transform; attachBaseLayers is plain Leaflet.
jest.mock('react-leaflet', () => ({ useMap: jest.fn() }));

import L from 'leaflet';
import {
  BASE_LAYERS, DARK_GRAY_BASE, LIGHT_GRAY_BASE, getDefaultBaseLayer, getThemeBaseLayer, useMapTheme,
} from '@/hooks/use-map-theme';
import { attachBaseLayers, LABELS_OPACITY } from '@/components/map/MapLayerControl';
import { ensureLeafletDefaultIcon } from '@/components/map/leaflet-default-icon';

describe('BASE_LAYERS', () => {
  it('offers the five bases in menu order', () => {
    expect(BASE_LAYERS.map(layer => layer.name)).toEqual([
      'Light gray', 'Dark gray', 'Ocean (bathymetry)', 'Satellite', 'Streets (OpenStreetMap)',
    ]);
  });

  it('has no CARTO (watermarked) or OpenTopoMap (rate-limited) layer', () => {
    for (const layer of BASE_LAYERS) {
      expect(layer.url).not.toMatch(/cartocdn|opentopomap/i);
      expect(layer.labelsUrl ?? '').not.toMatch(/cartocdn|opentopomap/i);
    }
  });

  it('maps each theme to its Esri gray canvas base, with the matching label layer', () => {
    expect(getDefaultBaseLayer(false)).toBe(LIGHT_GRAY_BASE);
    expect(getDefaultBaseLayer(true)).toBe(DARK_GRAY_BASE);
    expect(getThemeBaseLayer(false).url).toContain('/Canvas/World_Light_Gray_Base/');
    expect(getThemeBaseLayer(true).url).toContain('/Canvas/World_Dark_Gray_Base/');
    expect(getThemeBaseLayer(false).labelsUrl).toContain('/Canvas/World_Light_Gray_Reference/');
    expect(getThemeBaseLayer(true).labelsUrl).toContain('/Canvas/World_Dark_Gray_Reference/');
    expect(getThemeBaseLayer(false)).toMatchObject({ maxNativeZoom: 16, maxZoom: 19 });
    expect(BASE_LAYERS.find(layer => layer.name === 'Ocean (bathymetry)')).toMatchObject({ maxNativeZoom: 13 });
  });

  it('useMapTheme().tileLayerUrl follows the site theme', async () => {
    document.documentElement.classList.remove('dark');
    const { result } = renderHook(() => useMapTheme());
    expect(result.current.tileLayerUrl).toBe(getThemeBaseLayer(false).url);
    await act(async () => { document.documentElement.classList.add('dark'); });
    expect(result.current.isDark).toBe(true);
    expect(result.current.tileLayerUrl).toBe(getThemeBaseLayer(true).url);
    document.documentElement.classList.remove('dark');
  });
});

describe('attachBaseLayers (the MapLayerControl core)', () => {
  let container: HTMLDivElement;
  let map: L.Map;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 500; } });
  });
  afterAll(() => {
    delete (HTMLElement.prototype as any).clientWidth;
    delete (HTMLElement.prototype as any).clientHeight;
  });
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    map = L.map(container, { center: [-41, 174], zoom: 5 });
  });
  afterEach(() => {
    map.remove();
    container.remove();
  });

  const tileUrls = (pane: HTMLElement) => Array.from(pane.querySelectorAll('img')).map(img => img.getAttribute('src') ?? '');

  it('starts on the theme gray base with its labels in a click-through pane above the events', () => {
    const handle = attachBaseLayers(map, { isDark: false });
    expect(handle.activeBase()).toBe(LIGHT_GRAY_BASE);
    const labels = map.getPane('labels')!;
    expect(labels.style.zIndex).toBe('650');
    expect(labels.style.pointerEvents).toBe('none');
    expect(Number(map.getPane('overlayPane')!.style.zIndex || 400)).toBeLessThan(650);
    expect(tileUrls(labels).length).toBeGreaterThan(0);
    expect(tileUrls(labels).every(src => src.includes('World_Light_Gray_Reference'))).toBe(true);
    expect(tileUrls(map.getPane('tilePane')!).some(src => src.includes('World_Light_Gray_Base'))).toBe(true);
    const labelLayer = Object.values((map as any)._layers).find((layer: any) => layer.options?.pane === 'labels') as L.TileLayer;
    expect(labelLayer.options.opacity).toBe(LABELS_OPACITY);
    expect(LABELS_OPACITY).toBe(0.9);
    handle.remove();
  });

  it('a theme toggle swaps gray bases and their labels', () => {
    const handle = attachBaseLayers(map, { isDark: false });
    handle.setDark(true);
    expect(handle.activeBase()).toBe(DARK_GRAY_BASE);
    const labels = tileUrls(map.getPane('labels')!);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every(src => src.includes('World_Dark_Gray_Reference'))).toBe(true);
    handle.setDark(false);
    expect(handle.activeBase()).toBe(LIGHT_GRAY_BASE);
    handle.remove();
  });

  it('a base the user picked stays through a theme toggle, and non-gray bases have no label layer', () => {
    const handle = attachBaseLayers(map, { isDark: true });
    // What a click on "Satellite" in the layer menu does.
    const satellite = (handle.control as any)._layers.find((entry: any) => entry.name === 'Satellite').layer as L.TileLayer;
    const current = (handle.control as any)._layers.find((entry: any) => entry.name === DARK_GRAY_BASE).layer as L.TileLayer;
    map.addLayer(satellite);
    map.removeLayer(current);
    expect(handle.activeBase()).toBe('Satellite');
    expect(tileUrls(map.getPane('labels')!)).toEqual([]);
    handle.setDark(false);
    expect(handle.activeBase()).toBe('Satellite');
    handle.remove();
  });

  it('remove() takes the control, bases and labels off the map', () => {
    const handle = attachBaseLayers(map, { isDark: false });
    handle.remove();
    expect(container.querySelector('.leaflet-control-layers')).toBeNull();
    expect(tileUrls(map.getPane('tilePane')!)).toEqual([]);
    expect(tileUrls(map.getPane('labels')!)).toEqual([]);
  });
});

describe('default marker icon (S6)', () => {
  it('points at bundled images, not the cdnjs URLs the CSP blocks', () => {
    ensureLeafletDefaultIcon();
    const options = L.Icon.Default.prototype.options;
    for (const url of [options.iconUrl, options.iconRetinaUrl, options.shadowUrl]) {
      expect(url).toBeTruthy();
      expect(url).not.toMatch(/cdnjs|^https?:/);
    }
  });
});
