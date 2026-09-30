/**
 * Map redesign S3/S5: the shared map chrome - event popup, legend card (depth bar,
 * magnitude circles), status chip, Style panel, marker layer - and its use on the
 * catalogue map page and the dashboard map (no duplicate title / status badge; the
 * catalogue selector no longer floats over the zoom control).
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const markerRender = jest.fn();
const mockMap = {
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
  useMap: () => mockMap,
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  ScaleControl: () => null,
  CircleMarker: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));
// EarthquakeCircleMap draws the active faults by default; there is no fault file under jsdom,
// and these tests do not look at faults: a load that never settles adds no state update.
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn(() => new Promise(() => {})) }));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
let mockIsDark = false;
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: mockIsDark, markerOpacity: 0.78 }) }));

import { OptimizedEventPopup } from '@/components/map/OptimizedEventPopup';
import { DepthColorBar, MagnitudeSizeKey, MapLegend, LegendSection } from '@/components/map/MapLegend';
import { MapStatusChip } from '@/components/map/MapStatusChip';
import { MapStylePanel } from '@/components/map/MapStylePanel';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';
import { CatalogueMap } from '@/components/dashboard/CatalogueMap';
import L from 'leaflet';
import { getEarthquakeColor, getMagnitudePixelRadius } from '@/lib/earthquake-utils';
import { markerStrokeStyle } from '@/lib/map-style';

beforeEach(() => {
  markerRender.mockClear();
  mockIsDark = false;
});

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('event popup (S5)', () => {
  const EVENT = {
    id: 7, time: '2020-08-13T16:23:50.000Z', latitude: -40.379, longitude: 177.196,
    magnitude: 2.6, magnitude_type: 'ML', depth: 12, depth_uncertainty: 2.1,
    region: 'Unknown', azimuthal_gap: 45, used_station_count: 23,
    quality_score: 67, quality_grade: 'B', catalogue: 'GeoNet', source_id: '2020p612345',
  };
  const rows = () => {
    const terms = Array.from(document.querySelectorAll('dt'));
    return Object.fromEntries(terms.map(dt => [dt.textContent, dt.nextElementSibling?.textContent]));
  };

  it('leads with the magnitude and type, then the UTC time', () => {
    render(<OptimizedEventPopup event={EVENT} />);
    expect(screen.getByText('ML 2.6')).toBeInTheDocument();
    expect(screen.getByText('2020-08-13 16:23:50 UTC')).toBeInTheDocument();
  });

  it('lists the event as a definition grid, with no descriptor badge and no placeholder region', () => {
    render(<OptimizedEventPopup event={EVENT} />);
    expect(rows()).toEqual({
      Location: '40.379° S, 177.196° E',
      Depth: '12.0 ± 2.1 km',
      Quality: 'Q 67 (B)',
      'Az. gap': '45°',
      Stations: '23',
      Catalogue: 'GeoNet',
      'Event ID': '2020p612345',
    });
    const popup = document.querySelector('.event-popup')!;
    expect(popup).not.toHaveTextContent(/unknown/i);
    expect(popup).not.toHaveTextContent(/\bMinor\b/);
  });

  it('omits every optional row the event lacks and says when a depth was fixed', () => {
    render(<OptimizedEventPopup event={{ id: 1, time: '2024-01-01T00:00:00Z', latitude: 12.5, longitude: -170.25, magnitude: 4.4, depth: 10, depth_type: 'operator assigned', depth_uncertainty: 0 }} />);
    expect(screen.getByText('M 4.4')).toBeInTheDocument();
    expect(rows()).toEqual({ Location: '12.500° N, 170.250° W', Depth: '10.0 km (fixed)' });
  });

  it('shows a real region and a non-earthquake event type', () => {
    render(<OptimizedEventPopup event={{ ...EVENT, region: 'Seaward Kaikoura Range', event_type: 'quarry blast' }} />);
    expect(rows()).toMatchObject({ Region: 'Seaward Kaikoura Range', Type: 'quarry blast' });
  });

  it('prefers the quality the map coloured the marker with', () => {
    render(<OptimizedEventPopup event={{ ...EVENT, quality_score: null }} quality={{ score: 88, grade: 'A' }} />);
    expect(rows().Quality).toBe('Q 88 (A)');
  });
});

describe('legend card', () => {
  it.each([false, true])('depth bar: one segment per class in the markers\' colours, labelled boundaries (dark %s)', (isDark) => {
    render(<DepthColorBar isDark={isDark} />);
    const segments = Array.from(document.querySelectorAll<HTMLElement>('[data-depth-class]'));
    const samples = [5, 20, 50, 100, 200, 400];
    expect(segments.map(segment => segment.style.backgroundColor)).toEqual(samples.map(depth => rgb(getEarthquakeColor(depth, isDark))));
    const bar = document.querySelector('[data-legend="depth"]')!;
    expect(bar).toHaveTextContent(/^0\s*15\s*40\s*70\s*150\s*300\s*km\s*shallow < 70 · intermediate 70–300 · deep ≥ 300 km\s*unknown depth$/);
    expect(document.querySelector<HTMLElement>('[data-swatch="unknown depth"]')!.style.backgroundColor)
      .toBe(rgb(getEarthquakeColor(null, isDark)));
  });

  it('magnitude key: M2-M6 circles at the true marker radius, marker stroke, common baseline', () => {
    render(<MagnitudeSizeKey isDark={false} />);
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-magnitude]'));
    expect(items.map(item => item.textContent)).toEqual(['M2', 'M3', 'M4', 'M5', 'M6']);
    let previous = 0;
    for (const item of items) {
      const circle = item.querySelector('circle')!;
      const r = Number(circle.getAttribute('r'));
      expect(r).toBe(getMagnitudePixelRadius(Number(item.dataset.magnitude)));
      expect(r).toBeGreaterThan(previous);
      previous = r;
      expect(circle.getAttribute('stroke')).toBe(markerStrokeStyle(false).color);
    }
    expect(document.querySelector('[data-legend="magnitude"]')).toHaveClass('items-end');
  });

  it('collapses to a "Legend" chip and back', () => {
    render(<MapLegend><LegendSection title="Magnitude"><MagnitudeSizeKey isDark={false} /></LegendSection></MapLegend>);
    expect(screen.getByRole('region', { name: 'Map legend' })).toHaveClass('max-h-[45%]', 'w-[220px]');
    fireEvent.click(screen.getByRole('button', { name: 'Hide legend' }));
    expect(screen.queryByRole('heading', { name: 'Magnitude' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show legend' }));
    expect(screen.getByRole('heading', { name: 'Magnitude' })).toBeInTheDocument();
  });
});

describe('status chip', () => {
  it('says how many events are drawn, and hides when all are', () => {
    const { rerender } = render(<MapStatusChip shown={3319} total={4907} />);
    expect(screen.getByRole('status')).toHaveTextContent('3,319 of 4,907 events shown · zoom in for more');
    expect(screen.getByRole('status').querySelector('svg')).toBeNull();
    rerender(<MapStatusChip shown={4907} total={4907} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Style panel', () => {
  const widthOf = (width: number) => jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width, height: 600, top: 0, left: 0, right: width, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  afterEach(() => jest.restoreAllMocks());

  it('starts closed on maps narrower than 900 px, as a single "Style" button', () => {
    widthOf(700);
    render(<div><MapStylePanel info="Help text"><p>options</p></MapStylePanel></div>);
    expect(screen.queryByText('options')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    expect(screen.getByText('options')).toBeInTheDocument();
  });

  it('starts closed on a typical map so it covers no data on load', () => {
    widthOf(1200);
    render(<div><MapStylePanel info="Help text"><p>options</p></MapStylePanel></div>);
    expect(screen.queryByText('options')).toBeNull();
  });

  it('starts open on very wide maps; one (?) in the header reveals the explanation', () => {
    widthOf(1700);
    render(<div><MapStylePanel info="Help text"><p>options</p></MapStylePanel></div>);
    expect(screen.getByText('options')).toBeInTheDocument();
    expect(screen.queryByText('Help text')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'About style options' }));
    expect(screen.getByText('Help text')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide style options' }));
    expect(screen.queryByText('options')).toBeNull();
  });
});

describe('marker layer', () => {
  const events = [
    { id: 'a', latitude: -41, longitude: 175, magnitude: 5, depth: 10 },
    { id: 'b', latitude: -42, longitude: 176, magnitude: 3, depth: 200 },
  ];
  const fakeLayer = () => ({ setStyle: jest.fn(), bringToFront: jest.fn() });

  it('draws on a dedicated canvas renderer with the shared marker style', () => {
    render(<EarthquakeMarkerLayer events={events} getColor={e => getEarthquakeColor(e.depth, false)} isDark={false} onEventClick={jest.fn()} />);
    const drawn = markerRender.mock.calls.map(([props]) => props);
    expect(drawn.map(p => p.radius)).toEqual([getMagnitudePixelRadius(3), getMagnitudePixelRadius(5)]); // small first, large on top
    for (const props of drawn) {
      expect(props.renderer).toBeInstanceOf(L.Canvas);
      expect(props.pathOptions).toMatchObject({ fillOpacity: 0.78, weight: 0.6, color: 'rgba(17,24,39,0.55)' });
    }
    expect(drawn[0].renderer).toBe(drawn[1].renderer);
  });

  it('highlights on hover and keeps the selected marker highlighted until the selection clears', () => {
    const onEventClick = jest.fn();
    const { rerender } = render(<EarthquakeMarkerLayer events={events} getColor={() => '#FCA636'} isDark={false} selectedId={null} onEventClick={onEventClick} />);
    const handlers = markerRender.mock.calls[0][0].eventHandlers;
    const layer = fakeLayer();
    handlers.mouseover({ target: layer });
    expect(layer.setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ weight: 2, color: '#111827', fillOpacity: 0.95 }));
    handlers.mouseout({ target: layer });
    expect(layer.setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ weight: 0.6 }));

    handlers.click({ target: layer });
    expect(onEventClick).toHaveBeenCalledWith(events[1], [-42, 176]);
    expect(layer.bringToFront).toHaveBeenCalled();
    rerender(<EarthquakeMarkerLayer events={events} getColor={() => '#FCA636'} isDark={false} selectedId="b" onEventClick={onEventClick} />);
    handlers.mouseout({ target: layer });
    expect(layer.setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ weight: 2 }));
    rerender(<EarthquakeMarkerLayer events={events} getColor={() => '#FCA636'} isDark={false} selectedId={null} onEventClick={onEventClick} />);
    expect(layer.setStyle).toHaveBeenLastCalledWith(expect.objectContaining({ weight: 0.6 }));
  });
});

describe('EarthquakeCircleMap chrome', () => {
  const events = [
    { id: 1, latitude: -41.1, longitude: 174.8, magnitude: 2.6, magnitude_type: 'ML', depth: 12, time: '2020-08-13T16:23:50Z', region: 'Unknown' },
    { id: 2, latitude: -38.5, longitude: 176.1, magnitude: 4.2, depth: 180, time: '2021-01-01T00:00:00Z' },
  ];

  it('has one Style panel, one legend, no status chip when everything is drawn, and the new popup', async () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={jest.fn()} />);
    await act(async () => {});
    expect(screen.getAllByRole('region', { name: 'Map legend' })).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Colour by' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Displaying/)).toBeNull();
    fireEvent.click(screen.getAllByTestId('marker')[0]);
    const popup = screen.getByTestId('popup');
    expect(within(popup).getByText('ML 2.6')).toBeInTheDocument();
    expect(popup).not.toHaveTextContent(/unknown|Minor/i);
  });

  it('frames the events on creation instead of a fixed NZ view', () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={jest.fn()} />);
    // FitMapToEvents does not refit the bounds the map was created with.
    expect(mockMap.fitBounds).not.toHaveBeenCalled();
  });

  it('refits when the container is resized (created before its card had full height), until the user moves the map', () => {
    const container = document.createElement('div');
    const handlers: Record<string, () => void> = {};
    const on = jest.fn((name: string, fn: () => void) => { handlers[name] = fn; });
    const map = { ...mockMap, on, off: jest.fn(), fitBounds: jest.fn(), getContainer: () => container };
    const { FitMapToEvents } = jest.requireActual('@/components/map/FitMapToEvents');
    const leaflet = jest.requireMock('react-leaflet');
    const useMapSpy = jest.spyOn(leaflet, 'useMap').mockReturnValue(map);
    const bounds = [[-47.1, 166.1], [-35.7, 178.9]];
    render(<FitMapToEvents bounds={bounds} />);
    expect(map.fitBounds).not.toHaveBeenCalled();
    act(() => handlers.resize());
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, expect.anything());
    container.dispatchEvent(new Event('wheel'));
    act(() => handlers.resize());
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    useMapSpy.mockRestore();
  });
});

describe('catalogue map page and dashboard map', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('the catalogue map page names the map once and shows no status badge', async () => {
    jest.doMock('next/navigation', () => ({ useParams: () => ({ id: 'cat-1' }) }));
    jest.doMock('next/dynamic', () => ({ __esModule: true, default: () => function MapStub() { return <div data-testid="event-map" />; } }));
    const catalogue = { id: 'cat-1', name: 'Test catalogue', event_count: 4922, status: 'complete', created_at: '2024-01-01T00:00:00Z' };
    global.fetch = jest.fn(async (input: any) => {
      const url = new URL(String(input), 'http://localhost');
      const body = url.pathname === '/api/catalogues' ? [catalogue]
        : { data: [{ id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4 }], pagination: { hasMore: false, nextCursor: null, prevCursor: null, limit: 500 } };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    const { default: CatalogueMapPage } = await import('@/app/catalogues/[id]/map/page');
    render(<CatalogueMapPage />);
    await screen.findByTestId('event-map');
    expect(screen.getAllByText('Interactive Map')).toHaveLength(1);
    expect(screen.queryByText('complete')).toBeNull();
    expect(screen.getByText(/Test catalogue · 4,922 events/)).toBeInTheDocument();
  });

  it('the dashboard catalogue selector sits in the card, not over the map', async () => {
    global.fetch = jest.fn(async (input: any) => {
      const url = new URL(String(input), 'http://localhost');
      const body = url.pathname === '/api/catalogues' ? [{ id: 'a', name: 'A', event_count: 1 }]
        : [{ id: 'a-event', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4 }];
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    render(<CatalogueMap />);
    const map = (await screen.findByTestId('map-container')).parentElement!;
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Catalogue' })).toBeInTheDocument());
    const selector = screen.getByRole('combobox', { name: 'Catalogue' });
    expect(selector.closest('.absolute')).toBeNull();
    expect(map.contains(selector)).toBe(false);
    // The selector comes before the map in the document, above it.
    expect(selector.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
