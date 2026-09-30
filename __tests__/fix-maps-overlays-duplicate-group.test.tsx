/**
 * Merge preview › View on Map (DuplicateGroupMap, imperative Leaflet, real Leaflet under
 * jsdom): a compact "Active faults" switch in the legend, off by default, that adds the
 * shared fault traces (faultPathOptions, faults pane z 380 under the entries, GNS Science
 * attribution) through attachFaultsLayer and removes them again.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import L from 'leaflet';

// Only MapOverlays' react-leaflet pieces are imported here (never rendered): react-leaflet is ESM.
jest.mock('react-leaflet', () => ({ useMap: jest.fn(), GeoJSON: () => null, ScaleControl: () => null }));
jest.mock('@/components/map/MapLayerControl', () => ({
  ...jest.requireActual('@/components/map/MapLayerControl'),
  MapLayerControl: () => null,
}));

import { DuplicateGroupMap } from '@/components/merge/DuplicateGroupMap';
import { attachFaultsLayer } from '@/components/map/faults-layer';
import { FAULT_DATA_URL, resetFaultDataCache } from '@/lib/fault-data';
import { FAULT_ATTRIBUTION, MAP_PANES, faultPathOptions } from '@/lib/map-style';

const FAULTS = {
  type: 'FeatureCollection' as const,
  features: [{
    type: 'Feature' as const,
    geometry: { type: 'MultiLineString' as const, coordinates: [[[174.7, -41.35], [174.9, -41.25]]] },
    properties: { name: 'Wellington' },
  }],
};

const GROUP = {
  id: 'group-1',
  selectedEventIndex: 0,
  isSuspicious: false,
  validationWarnings: [] as string[],
  events: [
    { id: 'a', time: '2024-05-01T03:12:40.000Z', latitude: -41.30, longitude: 174.80, depth: 12, magnitude: 4.1, source: 'GeoNet', catalogueId: 'gn', catalogueName: 'GeoNet' },
    { id: 'b', time: '2024-05-01T03:12:41.000Z', latitude: -41.33, longitude: 174.86, depth: 14, magnitude: 4.0, source: 'ISC', catalogueId: 'isc', catalogueName: 'ISC' },
  ],
};

let fetchMock: jest.Mock;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 500; } });
});
afterAll(() => {
  delete (HTMLElement.prototype as any).clientWidth;
  delete (HTMLElement.prototype as any).clientHeight;
});
beforeEach(() => {
  // jsdom has no 2D canvas: the faults fall back to Leaflet's SVG renderer, which the
  // assertions below read (in a browser they are drawn on a canvas in the same pane).
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  resetFaultDataCache();
  fetchMock = jest.fn(async (url: string) => {
    if (String(url) === FAULT_DATA_URL) return { ok: true, json: async () => FAULTS };
    throw new Error(`unexpected fetch ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  jest.restoreAllMocks();
  document.documentElement.classList.remove('dark');
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

function renderGroup() {
  const fitBounds = jest.spyOn(L.Map.prototype, 'fitBounds');
  const geoJson = jest.spyOn(L, 'geoJSON');
  render(<DuplicateGroupMap group={GROUP} catalogueColors={{}} height="500px" />);
  return {
    map: () => fitBounds.mock.contexts[fitBounds.mock.contexts.length - 1] as L.Map,
    layers: () => geoJson.mock.results.map((result) => result.value as L.GeoJSON),
  };
}
const faultPaths = () => Array.from(document.querySelectorAll('.leaflet-faults-pane path'));

describe('DuplicateGroupMap: active faults switch', () => {
  it('is in the legend, off by default: no traces and no download', async () => {
    const { layers } = renderGroup();
    await settle();
    const legend = screen.getByRole('region', { name: 'Group legend' });
    const toggle = within(legend).getByRole('switch', { name: 'Active faults' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(layers()).toHaveLength(0);
    expect(faultPaths()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the traces under the entries with the shared style and attribution, and removes them again', async () => {
    const { map, layers } = renderGroup();
    fireEvent.click(screen.getByRole('switch', { name: 'Active faults' }));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [layer] = layers();
    expect(map().hasLayer(layer)).toBe(true);
    expect(layer.options).toMatchObject({ pane: MAP_PANES.faults.name, interactive: false, attribution: FAULT_ATTRIBUTION });
    // Framed at regional zoom (>= 9): the heavier fault line.
    expect(map().getZoom()).toBeGreaterThanOrEqual(9);
    expect((layer.options.style as () => L.PathOptions)()).toEqual(faultPathOptions(false, map().getZoom()));
    expect(map().getPane('faults')!.style.zIndex).toBe('380');
    const [path] = faultPaths();
    expect(path.getAttribute('stroke')).toBe('#7F1D1D');
    expect(path.getAttribute('stroke-opacity')).toBe('0.55');
    expect(path.classList.contains('leaflet-interactive')).toBe(false);
    expect(map().attributionControl.getContainer()!.textContent).toContain('GNS Science');

    // Theme change restyles the traces in place.
    await act(async () => { document.documentElement.classList.add('dark'); });
    await settle();
    expect(faultPaths()[0].getAttribute('stroke')).toBe('#FCA5A5');

    fireEvent.click(screen.getByRole('switch', { name: 'Active faults' }));
    await settle();
    expect(map().hasLayer(layer)).toBe(false);
    expect(faultPaths()).toHaveLength(0);
    expect(map().attributionControl.getContainer()!.textContent).not.toContain('GNS Science');

    // Back on: no second download.
    fireEvent.click(screen.getByRole('switch', { name: 'Active faults' }));
    await settle();
    expect(faultPaths()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('attachFaultsLayer', () => {
  it('draws on a canvas renderer in the faults pane when the browser has one, and removes it with the layer', () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    const canvas = jest.spyOn(L, 'canvas');
    const addLayer = jest.fn();
    const removeLayer = jest.fn();
    const layer = { addTo: jest.fn(function (this: unknown) { return this; }), remove: jest.fn(), setStyle: jest.fn() };
    jest.spyOn(L, 'geoJSON').mockReturnValue(layer as unknown as L.GeoJSON);
    const panes: Record<string, any> = {};
    const map = {
      getZoom: () => 6, on: jest.fn(), off: jest.fn(), addLayer, removeLayer, hasLayer: () => false,
      getPane: (name: string) => panes[name], createPane: (name: string) => (panes[name] = { style: {} }),
    } as unknown as L.Map;
    const handle = attachFaultsLayer(map, FAULTS, { isDark: false });
    const renderer = canvas.mock.results[0].value as L.Canvas;
    expect(renderer.options.pane).toBe('faults');
    expect((L.geoJSON as jest.Mock).mock.calls[0][1]).toMatchObject({ renderer, pane: 'faults', interactive: false });
    const rendererRemove = jest.spyOn(renderer, 'remove');
    handle.remove();
    expect(layer.remove).toHaveBeenCalled();
    expect(rendererRemove).toHaveBeenCalled();
  });

  it('switches to the heavier line only when the zoom crosses 9, and detaches cleanly', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const map = L.map(container, { center: [-41.3, 174.8], zoom: 6 });
    const handle = attachFaultsLayer(map, FAULTS, { isDark: false });
    const setStyle = jest.spyOn(handle.layer, 'setStyle');
    expect((handle.layer.options.style as () => L.PathOptions)()).toMatchObject({ weight: 1 });

    map.setZoom(7, { animate: false });
    expect(setStyle).not.toHaveBeenCalled();
    map.setZoom(10, { animate: false });
    expect(setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ weight: 1.5 }));

    handle.setDark(true);
    expect(setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ color: '#FCA5A5', weight: 1.5 }));

    handle.remove();
    expect(map.hasLayer(handle.layer)).toBe(false);
    setStyle.mockClear();
    map.setZoom(5, { animate: false });
    expect(setStyle).not.toHaveBeenCalled();
    map.remove();
    container.remove();
  });
});
