/**
 * Map redesign S6, merge maps:
 *   - DuplicateGroupMap (merge preview › View on Map), with the real installed Leaflet under
 *     jsdom (800x500 layout box): catalogue colours, the published ring, hollow dashed
 *     superseded entries, dashed connectors to the published solution (or the computed
 *     epicentre of an averaged group), regional framing, the shared base layers;
 *   - its pure symbology (components/merge/duplicate-group-style.ts);
 *   - the preview's map card around it (MergePreviewQC);
 *   - MapComponent (merge results), which is the catalogue map's composition.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import L from 'leaflet';

const mapContainerProps: any[] = [];
const mockMap = {
  getSize: () => ({ x: 800, y: 600 }),
  getZoom: () => 6,
  getBounds: () => ({
    getNorth: () => -30, getSouth: () => -50, getWest: () => 165, getEast: () => 185,
    getCenter: () => ({ lat: -40, lng: 175 }),
  }),
  on: () => {},
  off: () => {},
  fitBounds: () => {},
  getContainer: () => document.createElement('div'),
};

jest.mock('react-leaflet', () => {
  const react = require('react');
  return {
    useMap: () => mockMap,
    MapContainer: (props: any) => {
      mapContainerProps.push(props);
      return react.createElement('div', { 'data-testid': 'map-container' }, props.children);
    },
    ScaleControl: (props: any) => react.createElement('div', { 'data-testid': 'scale-bar', 'data-position': props.position }),
    CircleMarker: (props: any) => react.createElement('button', {
      'data-testid': 'marker', 'data-lat': props.center?.[0], 'data-fill': props.pathOptions?.fillColor, onClick: props.eventHandlers?.click,
    }),
    Popup: (props: any) => react.createElement('div', { 'data-testid': 'popup' }, props.children),
  };
});
// The react-leaflet layer control renders a marker element; the imperative QC map uses the
// real attachBaseLayers.
jest.mock('@/components/map/MapLayerControl', () => {
  const react = require('react');
  return {
    ...jest.requireActual('@/components/map/MapLayerControl'),
    MapLayerControl: () => react.createElement('div', { 'data-testid': 'layer-control' }),
  };
});
// MergePreviewQC loads the map with next/dynamic: render the real one synchronously.
jest.mock('next/dynamic', () => () => require('@/components/merge/DuplicateGroupMap').DuplicateGroupMap);

import { DuplicateGroupMap } from '@/components/merge/DuplicateGroupMap';
import { MergePreviewQC } from '@/components/merge/MergePreviewQC';
import MapComponent from '@/components/merge/MapComponent';
import {
  CONNECTOR_DASH, GROUP_FIT_OPTIONS, PUBLISHED_RING_WEIGHT, SUPERSEDED_DASH, entryRole, formatSeparation,
  groupCatalogueColors, groupEntryPopupHtml, publishedReference, separationFrom,
} from '@/components/merge/duplicate-group-style';
import { FIT_BOUNDS_OPTIONS, MARKER_STYLE, OKABE_ITO } from '@/lib/map-style';
import { calculateDistance } from '@/lib/earthquake-utils';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const T0 = '2024-05-01T03:12:40.000Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

const entry = (id: string, catalogueId: string, catalogueName: string, latitude: number, longitude: number, seconds: number, extra: Record<string, unknown> = {}) => ({
  id, time: at(seconds), latitude, longitude, depth: 12, magnitude: 4.1, magnitude_type: 'ML',
  source: catalogueName, catalogueId, catalogueName, ...extra,
});

/** GeoNet publishes; an older GeoNet vintage is superseded; ISC and USGS are duplicates. */
const GROUP = {
  id: 'group-7',
  selectedEventIndex: 0,
  isSuspicious: false,
  validationWarnings: [] as string[],
  supersededEventIndexes: [1],
  events: [
    entry('a', 'cat-gn', 'GeoNet', -41.30, 174.80, 0),
    entry('b', 'cat-gn-2023', 'GeoNet 2023 archive', -41.32, 174.83, 0.8),
    entry('c', 'cat-isc', 'ISC', -41.33, 174.86, 1.4),
    entry('d', 'cat-us', 'USGS <ComCat>', -41.27, 174.76, -0.6),
  ],
};
/** What previewMerge sends: Okabe–Ito in source order. */
const SERVER_COLORS = { 'cat-gn': OKABE_ITO[0], 'cat-gn-2023': OKABE_ITO[1], 'cat-isc': OKABE_ITO[2], 'cat-us': OKABE_ITO[3] };

/** The same event averaged: no entry selected, the merge publishes a computed epicentre. */
const AVERAGED = {
  ...GROUP,
  id: 'group-8',
  selectedEventIndex: -1,
  supersededEventIndexes: [],
  computedEpicentre: { latitude: -41.31, longitude: 174.81, time: at(0.3) },
};

describe('duplicate-group symbology (pure)', () => {
  it('assigns roles and finds the published solution', () => {
    expect(GROUP.events.map((_, i) => entryRole(GROUP, i))).toEqual(['published', 'superseded', 'duplicate', 'duplicate']);
    expect(publishedReference(GROUP)).toEqual({ latitude: -41.30, longitude: 174.80, time: T0, computed: false });
    expect(publishedReference(AVERAGED)).toEqual({ ...AVERAGED.computedEpicentre, computed: true });
    expect(publishedReference({ ...AVERAGED, computedEpicentre: null })).toBeNull();
  });

  it('keeps the colours the preview assigned and falls back to Okabe–Ito by position', () => {
    expect(Array.from(groupCatalogueColors(GROUP.events, SERVER_COLORS, false).values())).toEqual(OKABE_ITO.slice(0, 4));
    expect(Array.from(groupCatalogueColors(GROUP.events, { 'cat-gn': 'red' }, false).values())).toEqual(OKABE_ITO.slice(0, 4));
  });

  it('formats the separation from the published solution with a signed time', () => {
    expect(formatSeparation({ km: 3.214, seconds: 1.44 })).toBe('3.2 km · +1.4 s');
    expect(formatSeparation({ km: 12.05, seconds: -0.6 })).toBe('12.1 km · −0.6 s');
    expect(formatSeparation({ km: 0, seconds: 0 })).toBe('0.0 km · 0.0 s');
    expect(formatSeparation({ km: 3.2, seconds: NaN })).toBe('3.2 km');
  });

  it('builds popup HTML with every value escaped', () => {
    const name = '<img src=x onerror="alert(1)">';
    const html = groupEntryPopupHtml({
      entry: { ...GROUP.events[2], catalogueName: name }, role: 'duplicate', color: OKABE_ITO[2], reference: publishedReference(GROUP),
    });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.body.textContent).toContain(name);
  });
});

describe('DuplicateGroupMap (real Leaflet)', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 500; } });
  });
  afterAll(() => {
    delete (HTMLElement.prototype as any).clientWidth;
    delete (HTMLElement.prototype as any).clientHeight;
  });
  afterEach(() => jest.restoreAllMocks());

  function renderGroup(group: any = GROUP) {
    const fitBounds = jest.spyOn(L.Map.prototype, 'fitBounds');
    const circleMarker = jest.spyOn(L, 'circleMarker');
    const polyline = jest.spyOn(L, 'polyline');
    const marker = jest.spyOn(L, 'marker');
    const utils = render(<DuplicateGroupMap group={group} catalogueColors={SERVER_COLORS} height="500px" />);
    return {
      ...utils,
      fitBounds,
      map: () => fitBounds.mock.contexts[fitBounds.mock.contexts.length - 1] as L.Map,
      circles: () => circleMarker.mock.results.map(result => result.value as L.CircleMarker),
      lines: () => polyline.mock.results.map(result => result.value as L.Polyline),
      markers: () => marker.mock.results.map(result => result.value as L.Marker),
    };
  }
  const popupOf = (layer: L.Layer) => String(layer.getPopup()!.getContent());
  const iconHtml = (m: L.Marker) => String((m.options.icon as L.DivIcon).options.html);
  const same = (a: L.LatLng, b: { latitude: number; longitude: number }) =>
    Math.abs(a.lat - b.latitude) < 1e-9 && Math.abs(a.lng - b.longitude) < 1e-9;

  it('rings the published entry in the foreground colour and draws superseded entries hollow and dashed', () => {
    const [published, superseded, isc, usgs] = renderGroup().circles();
    expect(published.options).toMatchObject({ weight: PUBLISHED_RING_WEIGHT, color: MARKER_STYLE.highlight.stroke.light, fillColor: OKABE_ITO[0] });
    expect(superseded.options).toMatchObject({ fillOpacity: 0, dashArray: SUPERSEDED_DASH, color: OKABE_ITO[1] });
    for (const [circle, color] of [[isc, OKABE_ITO[2]], [usgs, OKABE_ITO[3]]] as const) {
      expect(circle.options).toMatchObject({ fillColor: color, weight: MARKER_STYLE.weight, fillOpacity: MARKER_STYLE.fillOpacity });
      expect(circle.options.dashArray).toBeFalsy();
    }
    // The published entry is painted last (on top); the hollow superseded ring first.
    const paths = Array.from(document.querySelectorAll('path.leaflet-interactive'));
    expect(paths[paths.length - 1].getAttribute('stroke-width')).toBe(String(PUBLISHED_RING_WEIGHT));
    expect(paths[0].getAttribute('stroke-dasharray')).toBe(SUPERSEDED_DASH);
  });

  it('tags the published entry "published"', () => {
    const { markers } = renderGroup();
    const tags = markers().filter(m => iconHtml(m).includes('published'));
    expect(tags).toHaveLength(1);
    expect(same(tags[0].getLatLng(), GROUP.events[0])).toBe(true);
    expect(tags[0].options.interactive).toBe(false);
    // The other entries lie mostly east of the published one: the tag goes on its west side.
    expect(iconHtml(tags[0])).toContain('-translate-x-full');
    expect((tags[0].options.icon as L.DivIcon).options.iconAnchor).toEqual([expect.any(Number), 8]);
    expect(((tags[0].options.icon as L.DivIcon).options.iconAnchor as number[])[0]).toBeGreaterThan(0);
  });

  it('draws a thin dashed grey connector from every other entry to the published one', () => {
    const lines = renderGroup().lines();
    expect(lines).toHaveLength(GROUP.events.length - 1);
    lines.forEach((line, i) => {
      const [from, to] = line.getLatLngs() as L.LatLng[];
      expect(same(from, GROUP.events[0])).toBe(true);
      expect(same(to, GROUP.events[i + 1])).toBe(true);
      expect(line.options).toMatchObject({ weight: 1, dashArray: CONNECTOR_DASH, color: '#6B7280', interactive: false });
    });
  });

  it('frames the group at local-regional scale: 48 px padding, never past zoom 11', () => {
    const { fitBounds, map } = renderGroup();
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds.mock.calls[0][1]).toEqual(GROUP_FIT_OPTIONS);
    // Zoom 11 separates entries a few km apart (at zoom 9 they drew as one blob); the gray
    // basemap stays quiet at that scale.
    expect(GROUP_FIT_OPTIONS).toEqual({ padding: [48, 48], maxZoom: 11 });
    expect(map().getZoom()).toBeLessThanOrEqual(11);
  });

  it('gives each popup the separation in km and s from the published entry', () => {
    const [published, superseded, isc, usgs] = renderGroup().circles();
    const km = calculateDistance(-41.30, 174.80, -41.33, 174.86).toFixed(1);
    expect(popupOf(isc)).toContain('From published');
    expect(popupOf(isc)).toContain(`${km} km · +1.4 s`);
    expect(popupOf(usgs)).toContain('−0.6 s');
    expect(popupOf(superseded)).toContain('Superseded');
    expect(popupOf(published)).toContain('Published solution');
    expect(popupOf(published)).not.toContain('From published');
    expect(popupOf(published)).toContain('ML 4.1');
    expect(popupOf(published)).toContain('41.300° S, 174.800° E');
    expect(popupOf(published)).toContain('2024-05-01 03:12:40 UTC');
    // A catalogue name is text, not markup.
    expect(popupOf(usgs)).toContain('USGS &lt;ComCat&gt;');
  });

  it('keys the catalogues in the colours of their entries, and the entry symbols', () => {
    renderGroup();
    const legend = screen.getByRole('region', { name: 'Group legend' });
    const rows = Array.from(legend.querySelectorAll<HTMLElement>('li[data-catalogue-key]'));
    expect(rows.map(row => row.textContent)).toEqual(['GeoNet', 'GeoNet 2023 archive', 'ISC', 'USGS <ComCat>']);
    expect(rows.map(row => row.querySelector<HTMLElement>('[data-swatch]')!.style.backgroundColor))
      .toEqual(OKABE_ITO.slice(0, 4).map(rgb));
    const keys = legend.querySelector('[data-legend="group-roles"]')!;
    expect(Array.from(keys.querySelectorAll('[data-role-key]')).map(k => k.getAttribute('data-role-key')))
      .toEqual(['published', 'duplicate', 'superseded']);
    expect(keys.querySelector('[data-role-key="superseded"] circle')).toHaveAttribute('stroke-dasharray', SUPERSEDED_DASH);
    expect(keys.querySelector('[data-role-key="published"] circle')).toHaveAttribute('stroke-width', String(PUBLISHED_RING_WEIGHT));
  });

  it('averaged group: connectors run to the computed epicentre, marked with a cross', () => {
    const { lines, markers, circles } = renderGroup(AVERAGED);
    expect(lines()).toHaveLength(AVERAGED.events.length);
    for (const line of lines()) expect(same((line.getLatLngs() as L.LatLng[])[0], AVERAGED.computedEpicentre)).toBe(true);
    const cross = markers().find(m => iconHtml(m).includes('<svg'))!;
    expect(same(cross.getLatLng(), AVERAGED.computedEpicentre)).toBe(true);
    expect(popupOf(cross)).toContain('Computed epicentre');
    const tag = markers().find(m => iconHtml(m).includes('published'))!;
    expect(same(tag.getLatLng(), AVERAGED.computedEpicentre)).toBe(true);
    // No entry is published, so none carries the ring; each is measured from the epicentre.
    expect(circles().some(c => c.options.weight === PUBLISHED_RING_WEIGHT)).toBe(false);
    expect(popupOf(circles()[2])).toContain('From computed epicentre');
    expect(screen.getByText('computed epicentre (published)')).toBeInTheDocument();
    expect(document.querySelector('[data-role-key="published"]')).toBeNull();
  });

  it('uses the shared base layers (gray base, maxNativeZoom), a scale bar and the CSP-safe icon', () => {
    const { map, container } = renderGroup();
    const tiles: L.TileLayer[] = [];
    map().eachLayer(layer => { if (layer instanceof L.TileLayer) tiles.push(layer); });
    const base = tiles.find(layer => (layer as any)._url.includes('World_Light_Gray_Base'))!;
    expect(base.options.maxNativeZoom).toBe(16);
    expect(tiles.some(layer => (layer as any)._url.includes('World_Light_Gray_Reference'))).toBe(true);
    expect(container.querySelector('.leaflet-control-layers')).not.toBeNull();
    expect(container.querySelector('.leaflet-control-scale')).not.toBeNull();
    expect(String(L.Icon.Default.prototype.options.iconUrl)).not.toMatch(/cdnjs/);
  });

  it('follows a theme toggle without refitting the view', async () => {
    const { fitBounds, circles, map } = renderGroup();
    await act(async () => { document.documentElement.classList.add('dark'); });
    const redrawn = circles().slice(GROUP.events.length);
    expect(redrawn[0].options.color).toBe(MARKER_STYLE.highlight.stroke.dark);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    const urls: string[] = [];
    map().eachLayer(layer => { if (layer instanceof L.TileLayer) urls.push((layer as any)._url); });
    expect(urls.some(url => url.includes('World_Dark_Gray_Base'))).toBe(true);
    expect(urls.some(url => url.includes('World_Light_Gray_Base'))).toBe(false);
    await act(async () => { document.documentElement.classList.remove('dark'); });
  });

  it('shows a placeholder for an empty group', () => {
    render(<DuplicateGroupMap group={{ ...GROUP, events: [] }} catalogueColors={{}} />);
    expect(screen.getByText('No events to display')).toBeInTheDocument();
  });
});

describe('merge preview map card (MergePreviewQC)', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 500; } });
  });
  afterAll(() => {
    delete (HTMLElement.prototype as any).clientWidth;
    delete (HTMLElement.prototype as any).clientHeight;
  });

  const statistics = { totalEventsBefore: 4, totalEventsAfter: 1, duplicateGroupsCount: 1, duplicatesRemoved: 3, suspiciousGroupsCount: 0 };

  it('opens the group in a plain card whose map colours match the group card dots', () => {
    render(<MergePreviewQC previewData={{ duplicateGroups: [GROUP], statistics, catalogueColors: SERVER_COLORS }} onProceedWithMerge={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /View on Map/ }));

    const card = screen.getByRole('region', { name: 'Duplicate group map' });
    expect(card).not.toHaveClass('border-blue-500');
    expect(within(card).getByText('Group #1 on the map')).toBeInTheDocument();
    expect(within(card).getByText(/4 entries from 4 catalogues/)).toBeInTheDocument();

    // Expand the group card's table: each catalogue dot is its colour on the map.
    const groupCard = screen.getByText('Group #1').closest('.rounded-lg') as HTMLElement;
    const buttons = within(groupCard).getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    const dots = Array.from(groupCard.querySelectorAll<HTMLElement>('tbody div.rounded-full.w-3')).map(dot => dot.style.backgroundColor);
    const swatches = Array.from(card.querySelectorAll<HTMLElement>('li[data-catalogue-key] [data-swatch]')).map(s => s.style.backgroundColor);
    expect(dots).toEqual(swatches);

    fireEvent.click(within(card).getByRole('button', { name: /Close map/ }));
    expect(screen.queryByRole('region', { name: 'Duplicate group map' })).toBeNull();
  });
});

describe('merge result map (MapComponent) composes the shared chrome', () => {
  beforeEach(() => { mapContainerProps.length = 0; });

  // 2,000 merged events around central New Zealand, inside the stub map's viewport.
  const many = Array.from({ length: 2000 }, (_, i) => ({
    id: i + 1, time: at(i * 60), latitude: -40 - (i % 40) * 0.05, longitude: 172 + (i % 50) * 0.08,
    magnitude: 2 + (i % 30) / 10, depth: (i % 12) * 20, region: 'Test',
  }));

  it('has the layer button, scale bar, Style panel, legend card and status chip - no old overlays', () => {
    render(<MapComponent events={many} />);
    expect(screen.getByTestId('layer-control')).toBeInTheDocument();
    expect(screen.getByTestId('scale-bar')).toHaveAttribute('data-position', 'bottomleft');
    expect(screen.getByRole('group', { name: 'Colour by' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Depth' })).toBeChecked();
    const legend = screen.getByRole('region', { name: 'Map legend' });
    expect(legend.querySelector('[data-legend="depth"]')).not.toBeNull();
    expect(legend.querySelector('[data-legend="magnitude"]')).not.toBeNull();

    // The status chip sits bottom-left above the scale bar (not over the zoom buttons).
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^[\d,]+ of 2,000 events shown · zoom in for more$/);
    expect(status).toHaveClass('bottom-8', 'left-2');
    expect(screen.queryByText(/Displaying/)).toBeNull();
    expect(screen.queryByText(/total events/)).toBeNull();
  });

  it('frames the merged events instead of a fixed New Zealand view', () => {
    render(<MapComponent events={many.slice(0, 10)} />);
    const props = mapContainerProps[mapContainerProps.length - 1];
    expect(props.boundsOptions).toEqual(FIT_BOUNDS_OPTIONS);
    expect(props.bounds).toBeDefined();
    expect(props.center).toBeUndefined();
    expect(props.zoom).toBeUndefined();
  });
});
