/**
 * The 'New Zealand (All)' region preset must cover the whole country.
 *
 * It was the box 47.5-34 S, 166-179 E, which leaves out the Chatham Islands (~44 S,
 * 176.5 W), the Kermadec Islands (29.2-31.4 S, 177.9-178.9 W), the Hikurangi strip
 * between 179 E and 180, and the subantarctic islands. Region search keeps a catalogue
 * only when its box overlaps the query box, so a catalogue of the 2021 Kermadec
 * sequence, a Chatham Rise deployment or East Cape aftershocks east of 179 E was
 * silently dropped. The reference coordinates below are gazetteer values.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RegionSelectorMap } from '@/components/catalogues/RegionSelectorMap';
import { GeographicSearchPanel } from '@/components/catalogues/GeographicSearchPanel';
import { boundsOverlap, pointInBounds, type GeographicBounds } from '@/lib/geo-bounds-utils';

const mockFitBounds = jest.fn();
const mockAddLayer = jest.fn();
jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    MapContainer: React.forwardRef(function MapContainer({ children }: any, ref: any) {
      React.useImperativeHandle(ref, () => ({ fitBounds: mockFitBounds }));
      return <div>{children}</div>;
    }),
    FeatureGroup: React.forwardRef(function FeatureGroup({ children }: any, ref: any) {
      React.useImperativeHandle(ref, () => ({ addLayer: mockAddLayer, removeLayer: jest.fn() }));
      return <div>{children}</div>;
    }),
  };
});
jest.mock('react-leaflet-draw', () => ({ EditControl: () => null }));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
// The panel loads the map with next/dynamic; render the real component synchronously.
jest.mock('next/dynamic', () => () => require('@/components/catalogues/RegionSelectorMap').RegionSelectorMap);
// Native controls stand in for the Radix select so a preset can be chosen.
jest.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: any) => (
    <select aria-label="Preset region" defaultValue="" onChange={(e) => onValueChange(e.target.value)}>
      <option value="" disabled>Select Region</option>
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

/** NZ territory that the national preset has to contain. */
const NZ_PLACES: Array<[string, number, number]> = [
  ['Wellington', -41.29, 174.78],
  ['Three Kings Islands', -34.15, 172.13],
  ['Stewart Island', -47.0, 167.9],
  ['Chatham Islands (Waitangi)', -43.95, -176.56],
  ['Pitt Island', -44.28, -176.2],
  ['Raoul Island (Kermadecs)', -29.27, -177.92],
  ["L'Esperance Rock (Kermadecs)", -31.35, -178.9],
  ['2021 Kermadec Mw 8.1', -29.72, -177.28],
  ['2021 East Cape Mw 7.3', -37.48, 179.49],
  ['Bounty Islands', -47.75, 179.05],
  ['Antipodes Islands', -49.68, 178.77],
  ['Auckland Islands', -50.7, 166.1],
  ['Campbell Island', -52.55, 169.15],
];

/** Catalogue footprints that lie wholly outside the old 166-179 E box. */
const OFFSHORE_CATALOGUES: Array<[string, GeographicBounds]> = [
  ['Kermadec 2021 sequence', { minLatitude: -30.2, maxLatitude: -29.0, minLongitude: -177.8, maxLongitude: -176.5 }],
  ['Chatham Rise deployment', { minLatitude: -44.3, maxLatitude: -43.5, minLongitude: -177.0, maxLongitude: -176.2 }],
  ['East Cape aftershocks east of 179 E', { minLatitude: -37.8, maxLatitude: -37.2, minLongitude: 179.3, maxLongitude: 179.8 }],
  ['East Cape aftershocks straddling 180', { minLatitude: -37.8, maxLatitude: -37.2, minLongitude: 179.49, maxLongitude: -179.8 }],
  ['Brothers volcano OBH', { minLatitude: -35.0, maxLatitude: -34.8, minLongitude: 179.0, maxLongitude: 179.2 }],
];

function expectCoversNewZealand(bounds: GeographicBounds) {
  for (const [place, lat, lon] of NZ_PLACES) {
    expect({ place, inside: pointInBounds(lat, lon, bounds) }).toEqual({ place, inside: true });
  }
  for (const [catalogue, footprint] of OFFSHORE_CATALOGUES) {
    expect({ catalogue, found: boundsOverlap(bounds, footprint) }).toEqual({ catalogue, found: true });
  }
  // Australia's Lord Howe Island and Fiji stay outside.
  expect(pointInBounds(-31.55, 159.08, bounds)).toBe(false);
  expect(pointInBounds(-18.1, 178.44, bounds)).toBe(false);
}

beforeEach(() => {
  mockFitBounds.mockClear();
  mockAddLayer.mockClear();
});

describe('RegionSelectorMap national preset', () => {
  it('selects an antimeridian-crossing box that covers every part of New Zealand', () => {
    const onRegionSelected = jest.fn();
    render(<RegionSelectorMap onRegionSelected={onRegionSelected} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset region' }), { target: { value: 'nz' } });

    expect(onRegionSelected).toHaveBeenCalledTimes(1);
    const bounds: GeographicBounds = onRegionSelected.mock.calls[0][0];
    // RFC 7946 convention: west edge greater than east edge = the box runs east across 180.
    expect(bounds.minLongitude).toBeGreaterThan(bounds.maxLongitude);
    expectCoversNewZealand(bounds);
    expect(screen.getByText('(crosses date line)')).toBeInTheDocument();
  });

  it('draws and fits the rectangle eastward across 180 rather than the long way round', () => {
    const onRegionSelected = jest.fn();
    render(<RegionSelectorMap onRegionSelected={onRegionSelected} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset region' }), { target: { value: 'nz' } });
    const bounds: GeographicBounds = onRegionSelected.mock.calls[0][0];

    const drawn = mockAddLayer.mock.calls[0][0].getBounds();
    expect(drawn.getWest()).toBe(bounds.minLongitude);
    expect(drawn.getEast()).toBe(bounds.maxLongitude + 360);
    expect(drawn.getSouth()).toBe(bounds.minLatitude);
    expect(drawn.getNorth()).toBe(bounds.maxLatitude);
    // Less than half the globe wide: the rectangle hugs New Zealand.
    expect(drawn.getEast() - drawn.getWest()).toBeLessThan(180);
    expect(mockFitBounds).toHaveBeenCalledWith(drawn, expect.anything());
  });

  it('leaves the regional presets as they were', () => {
    const onRegionSelected = jest.fn();
    render(<RegionSelectorMap onRegionSelected={onRegionSelected} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset region' }), { target: { value: 'nz-wellington' } });
    expect(onRegionSelected).toHaveBeenCalledWith({ minLatitude: -41.6, maxLatitude: -40.7, minLongitude: 174.7, maxLongitude: 175.5 });
    const drawn = mockAddLayer.mock.calls[0][0].getBounds();
    expect([drawn.getWest(), drawn.getEast()]).toEqual([174.7, 175.5]);
  });
});

describe('GeographicSearchPanel', () => {
  const openPanel = () => fireEvent.click(screen.getByText('Geographic Region Search'));

  it('searches the same national box from the map preset and from manual entry', () => {
    const fromMap = jest.fn();
    const { unmount } = render(<GeographicSearchPanel onSearch={fromMap} onClear={jest.fn()} />);
    openPanel();
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset region' }), { target: { value: 'nz' } });
    fireEvent.click(screen.getByRole('button', { name: /search region/i }));
    expect(fromMap).toHaveBeenCalledTimes(1);
    unmount();

    const fromManual = jest.fn();
    render(<GeographicSearchPanel onSearch={fromManual} onClear={jest.fn()} />);
    openPanel();
    act(() => { fireEvent.mouseDown(screen.getByRole('tab', { name: /manual entry/i }), { button: 0, ctrlKey: false }); });
    fireEvent.click(screen.getByRole('button', { name: 'New Zealand (All)' }));
    fireEvent.click(screen.getByRole('button', { name: /search region/i }));
    expect(fromManual).toHaveBeenCalledTimes(1);

    expectCoversNewZealand(fromManual.mock.calls[0][0]);
    expect(fromManual.mock.calls[0][0]).toEqual(fromMap.mock.calls[0][0]);
  });
});
