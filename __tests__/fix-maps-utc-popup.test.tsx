/**
 * Map popups must show origin times in UTC with the zone named, like the repaired
 * EarthquakeCircleMap / OptimizedEventPopup / analytics event list.
 *
 * The analytics map popup formatted with toLocaleString('en-GB') and no timeZone, so a
 * viewer in NZDT (UTC+13) saw the Kaikoura mainshock (2016-11-13T11:02:56Z) as
 * 14/11/2016 00:02:56 with no zone, a different calendar day from the catalogue and from
 * the event list on the same page. The expected string is derived by hand from the instant.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';
import UnifiedEarthquakeMap from '@/components/visualize/UnifiedEarthquakeMap';
import NZEarthquakeMap from '@/components/visualize/NZEarthquakeMap';
import { MapView } from '@/components/catalogues/MapView';
import { EnhancedMapView } from '@/components/advanced-viz/EnhancedMapView';

const map = {
  getSize: () => ({ x: 800, y: 600 }),
  getZoom: () => 5,
  getBounds: () => ({
    getNorth: () => -30, getSouth: () => -50, getWest: () => 160, getEast: () => 190,
    getCenter: () => ({ lat: -40, lng: 175 }),
  }),
  on: jest.fn(),
  off: jest.fn(),
  fitBounds: jest.fn(),
  getContainer: () => document.createElement('div'),
};
jest.mock('react-leaflet', () => ({
  useMap: () => map,
  MapContainer: ({ children }: any) => <div>{children}</div>,
  ScaleControl: () => null,
  GeoJSON: () => null,
  FeatureGroup: ({ children }: any) => <div>{children}</div>,
  Polyline: () => null,
  Circle: (props: any) => <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>,
  CircleMarker: (props: any) => <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));
jest.mock('react-leaflet-draw', () => ({ EditControl: () => null }));
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn().mockResolvedValue(null) }));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({
  ...jest.requireActual('@/components/advanced-viz/UncertaintyEllipse'),
  UncertaintyEllipse: () => null,
}));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({
  ...jest.requireActual('@/components/advanced-viz/BeachBallMarker'),
  BeachBallMarker: () => null,
}));
jest.mock('@/components/advanced-viz/StationMarker', () => ({ StationMarker: () => null }));

const KAIKOURA = {
  id: 1, time: '2016-11-13T11:02:56.000Z', latitude: -42.737, longitude: 173.054,
  depth: 15.1, magnitude: 7.8, magnitude_type: 'Mw', region: 'Kaikoura',
};
/** en-GB day/month/year to the second, with the zone: by hand from the instant above. */
const EXPECTED = '13/11/2016, 11:02:56 UTC';
/** The shared event popup (OptimizedEventPopup, spec S5) writes it ISO-style, zone named. */
const EXPECTED_ISO = '2016-11-13 11:02:56 UTC';

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ faults: [], count: 0 }) })) as unknown as typeof fetch;
});

const MAPS: Array<[string, () => JSX.Element, string, string]> = [
  ['analytics map (UnifiedEarthquakeMap)', () => <UnifiedEarthquakeMap earthquakes={[KAIKOURA]} />, EXPECTED_ISO, '2016-11-14'],
  ['catalogue MapView', () => <MapView events={[KAIKOURA] as any} />, EXPECTED, '14/11/2016'],
  ['NZEarthquakeMap', () => <NZEarthquakeMap earthquakes={[KAIKOURA] as any} />, EXPECTED, '14/11/2016'],
  ['EnhancedMapView', () => <EnhancedMapView events={[KAIKOURA]} />, EXPECTED, '14/11/2016'],
];

describe.each(MAPS)('%s popup', (_name, renderMap, expected, aucklandDay) => {
  it('shows the origin time in UTC with the zone named', async () => {
    render(renderMap());
    fireEvent.click(screen.getByTestId('marker'));
    await act(async () => {});
    const popup = screen.getByTestId('popup');
    expect(popup).toHaveTextContent(expected);
    // 14/11 is the Pacific/Auckland calendar day of this instant.
    expect(popup).not.toHaveTextContent(aucklandDay);
  });
});

const FILES = [
  'components/visualize/UnifiedEarthquakeMap.tsx',
  'components/catalogues/MapView.tsx',
  'components/visualize/NZEarthquakeMap.tsx',
  'components/advanced-viz/EnhancedMapView.tsx',
];

describe.each(FILES)('%s', (file) => {
  const source = readFileSync(path.join(process.cwd(), file), 'utf8');

  it('formats no date in the host timezone', () => {
    expect(source.match(/toLocale(?:String|DateString|TimeString)\(\s*['"]en-GB['"]/g)).toBeNull();
  });

  it('does not describe the origin time as local', () => {
    expect(source).not.toContain('Event origin time in local timezone.');
  });
});
