/**
 * Regression tests for the two merge maps:
 *   - components/merge/MapComponent.tsx (merged-result map), rendered with react-leaflet
 *     stubbed to plain elements that expose the props each marker was drawn with;
 *   - components/merge/DuplicateGroupMap.tsx (QC duplicate map), rendered with the real
 *     installed Leaflet under jsdom, with an 800x500 layout box because jsdom does no layout.
 *
 * Origin times are UTC by definition; 2016-11-13T11:02:56Z (Kaikoura) is 14/11/2016 in
 * Pacific/Auckland, so a renderer on the host zone shows another day with no zone label.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import L from 'leaflet';

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
  // Each vector layer renders as a button carrying the props it was drawn with; clicking it
  // fires the layer's click handler as Leaflet would.
  const layer = (kind: string) => (props: any) => react.createElement('button', {
    'data-testid': 'marker',
    'data-kind': kind,
    'data-lat': props.center?.[0],
    'data-radius': props.radius,
    'data-fill': props.pathOptions?.fillColor,
    onClick: props.eventHandlers?.click,
  }, props.children);
  return {
    useMap: () => mockMap,
    MapContainer: (props: any) => react.createElement('div', null, props.children),
    ScaleControl: () => null,
    Circle: layer('Circle'),
    CircleMarker: layer('CircleMarker'),
    Popup: (props: any) => react.createElement('div', { 'data-testid': 'popup' }, props.children),
  };
});
// The react-leaflet layer control is stubbed; the QC map uses the real attachBaseLayers.
jest.mock('@/components/map/MapLayerControl', () => ({
  ...jest.requireActual('@/components/map/MapLayerControl'),
  MapLayerControl: () => null,
}));

import MapComponent from '@/components/merge/MapComponent';
import { DuplicateGroupMap } from '@/components/merge/DuplicateGroupMap';
import { getEarthquakeColor, getMagnitudePixelRadius } from '@/lib/earthquake-utils';

const KAIKOURA_UTC = '2016-11-13T11:02:56.000Z';
const EXPECTED_UTC = '2016-11-13 11:02:56 UTC';
const NZ_LOCAL_DAY = /14\/11\/2016|2016-11-14/;

/** Normalise a CSS colour the way jsdom serialises inline styles. */
function cssColor(color: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

describe('merge result map (MapComponent)', () => {
  const events = [
    { id: 1, time: KAIKOURA_UTC, latitude: -42.737, longitude: 173.054, magnitude: 7.8, magnitude_type: 'Mw', depth: 15.1, region: 'Kaikoura' },
    { id: 2, time: '2016-11-14T00:34:22.000Z', latitude: -42.4, longitude: 173.6, magnitude: 6.5, depth: null, region: 'Seaward Kaikoura' },
    { id: 3, time: '2024-01-01T00:00:00.000Z', latitude: -41.2, longitude: 174.8, magnitude: 2.4, depth: 8, region: 'Wellington' },
    { id: 4, time: '2024-01-02T00:00:00.000Z', latitude: -38.6, longitude: 176.1, magnitude: 4.2, depth: 120, region: 'Taupo' },
  ];

  const markerFor = (event: { latitude: number }) =>
    screen.getAllByTestId('marker').find(marker => marker.getAttribute('data-lat') === String(event.latitude))!;
  const openPopup = (event: { latitude: number }) => {
    fireEvent.click(markerFor(event));
    return screen.getByTestId('popup');
  };
  const popupRows = (popup: HTMLElement) =>
    Object.fromEntries(Array.from(popup.querySelectorAll('dt')).map(dt => [dt.textContent, dt.nextElementSibling?.textContent]));

  it('#99/#31 shows the popup origin time in UTC and labels it as UTC', () => {
    render(<MapComponent events={events} />);
    const popup = openPopup(events[0]);
    expect(within(popup).getByText('Mw 7.8')).toBeInTheDocument();
    expect(within(popup).getByText(EXPECTED_UTC)).toBeInTheDocument();
    expect(popup).not.toHaveTextContent(KAIKOURA_UTC);
    expect(popup).not.toHaveTextContent(NZ_LOCAL_DAY);
  });

  it('#31 shows an unknown depth as not reported in the popup, never as a bare " km"', () => {
    render(<MapComponent events={events} />);
    expect(popupRows(openPopup(events[1])).Depth).toBe('not reported');
    expect(popupRows(openPopup(events[0])).Depth).toBe('15.1 km');
  });

  it('#100 colours by depth, an unknown depth with the unknown-depth grey, and keys every drawn colour', () => {
    render(<MapComponent events={events} />);
    expect(markerFor(events[1])).toHaveAttribute('data-fill', getEarthquakeColor(null, false));
    expect(markerFor(events[2])).toHaveAttribute('data-fill', getEarthquakeColor(8, false));
    expect(markerFor(events[3])).toHaveAttribute('data-fill', getEarthquakeColor(120, false));

    const legend = screen.getByRole('region', { name: 'Map legend' });
    const keyed = [
      ...Array.from(legend.querySelectorAll<HTMLElement>('[data-depth-class]')).map(segment => segment.style.backgroundColor),
      legend.querySelector<HTMLElement>('[data-swatch="unknown depth"]')!.style.backgroundColor,
    ];
    for (const marker of screen.getAllByTestId('marker')) {
      expect(keyed).toContain(cssColor(marker.getAttribute('data-fill')!));
    }
  });

  it('#97 draws pixel-radius markers and sizes the legend circles from the same radii', () => {
    render(<MapComponent events={events} />);
    for (const event of events) {
      const marker = markerFor(event);
      expect(marker).toHaveAttribute('data-kind', 'CircleMarker');
      expect(marker).toHaveAttribute('data-radius', String(getMagnitudePixelRadius(event.magnitude)));
    }
    const key = document.querySelector('[data-legend="magnitude"]')!;
    for (const magnitude of [2, 3, 4, 5, 6]) {
      const circle = key.querySelector(`[data-magnitude="${magnitude}"] circle`)!;
      expect(Number(circle.getAttribute('r'))).toBeCloseTo(getMagnitudePixelRadius(magnitude), 5);
    }
  });

  it('gives a row without an id a stable id instead of dropping it', () => {
    const { id: _id, ...withoutId } = events[2];
    render(<MapComponent events={[withoutId, events[3]]} />);
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(within(openPopup(withoutId)).getByText('M 2.4')).toBeInTheDocument();
  });
});

describe('QC duplicate map (DuplicateGroupMap, real Leaflet)', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 500; } });
  });
  afterAll(() => {
    delete (HTMLElement.prototype as any).clientWidth;
    delete (HTMLElement.prototype as any).clientHeight;
  });
  afterEach(() => jest.restoreAllMocks());

  const event = (id: string, latitude: number, longitude: number, time = '2024-01-01T00:00:00.000Z') => ({
    id, time, latitude, longitude, magnitude: 4.5, depth: 30, source: id, catalogueId: id, catalogueName: `Catalogue ${id}`,
  });

  function renderGroup(events: ReturnType<typeof event>[]) {
    const fitBounds = jest.spyOn(L.Map.prototype, 'fitBounds');
    const circleMarker = jest.spyOn(L, 'circleMarker');
    const polyline = jest.spyOn(L, 'polyline');
    render(
      <DuplicateGroupMap
        group={{ id: 'g', selectedEventIndex: 0, isSuspicious: false, validationWarnings: [], events }}
        catalogueColors={{}}
        height="500px"
      />
    );
    const lastFit = fitBounds.mock.calls.length - 1;
    return {
      map: fitBounds.mock.contexts[lastFit] as L.Map,
      bounds: fitBounds.mock.calls[lastFit][0] as L.LatLngBounds,
      markers: circleMarker.mock.results.map(result => result.value as L.CircleMarker),
      lines: polyline.mock.results.map(result => result.value as L.Polyline),
    };
  }

  /** Angular distance from 180° longitude, in degrees, whichever world copy lng is in. */
  const fromAntimeridian = (lng: number) => Math.abs((((lng - 180) % 360) + 540) % 360 - 180);

  it('#95 keeps a pair straddling 180° together instead of 360° apart', () => {
    // 8.0 km apart by great circle (Kermadec slab latitudes).
    const { map, bounds, markers, lines } = renderGroup([event('A', -30.10, 179.95), event('B', -30.12, -179.97)]);

    expect(bounds.getEast() - bounds.getWest()).toBeLessThan(1);
    // Framed at the group's max zoom (11), not street level.
    expect(map.getZoom()).toBe(11);
    expect(fromAntimeridian(map.getCenter().lng)).toBeLessThan(0.5);

    const [a, b] = markers.map(m => m.getLatLng());
    expect(Math.abs(a.lng - b.lng)).toBeLessThan(1);
    const [from, to] = lines[0].getLatLngs() as L.LatLng[];
    expect(Math.abs(from.lng - to.lng)).toBeLessThan(1);

    // The popup still reports the stored coordinate, not the display copy.
    expect(markers[1].getPopup()!.getContent()).toContain('30.120° S, 179.970° W');
  });

  it('#95 leaves a pair on one side of 180° where it is', () => {
    const { bounds, markers } = renderGroup([event('A', -30.10, 179.95), event('B', -30.12, 179.87)]);
    expect(markers.map(m => m.getLatLng().lng)).toEqual([179.95, 179.87]);
    expect(bounds.getWest()).toBeCloseTo(179.87, 6);
    expect(bounds.getEast()).toBeCloseTo(179.95, 6);
  });

  it('#99 shows the popup origin time in UTC with the zone', () => {
    const { markers } = renderGroup([event('A', -42.737, 173.054, KAIKOURA_UTC), event('B', -42.7, 173.1, '2016-11-13T11:02:59.500Z')]);
    const popup = String(markers[0].getPopup()!.getContent());
    expect(popup).toContain(EXPECTED_UTC);
    expect(popup).not.toMatch(NZ_LOCAL_DAY);
    expect(String(markers[1].getPopup()!.getContent())).toContain('2016-11-13 11:02:59 UTC');
  });
});
