/**
 * Map redesign on the Analytics page map (components/visualize/UnifiedEarthquakeMap.tsx):
 * the catalogue map's chrome (Style panel, legend card, status chip, scale bar, shared
 * popup, fit to data), depth as the default colour with no 'Magnitude' colour mode (size
 * encodes magnitude), and the three overlays restyled: active faults (spec S4: thin, own
 * pane under the events, legend line naming the source), uncertainty ellipses (thin, in
 * the event's own colour, confidence level in the legend) and focal-mechanism beach balls
 * (depth-coloured compressional quadrants, sized by magnitude, only at zoom >= 6 or when
 * <= 300 are plotted).
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import L from 'leaflet';

const markerRender = jest.fn();
const geoJsonRender = jest.fn();
const ellipseRender = jest.fn();
const beachBallRender = jest.fn();
let mockZoom = 5;
let mockIsDark = false;
const mockPanes: Record<string, { style: Record<string, string> }> = {};
const mockHandlers: Record<string, Set<() => void>> = {};
const mockMap = {
  getSize: () => ({ x: 800, y: 600 }),
  getZoom: () => mockZoom,
  getBounds: () => ({
    getNorth: () => -30, getSouth: () => -50, getWest: () => 160, getEast: () => 190,
    getCenter: () => ({ lat: -40, lng: 175 }),
  }),
  on: jest.fn((name: string, fn: () => void) => { (mockHandlers[name] ??= new Set()).add(fn); }),
  off: jest.fn((name: string, fn: () => void) => { mockHandlers[name]?.delete(fn); }),
  fitBounds: jest.fn(),
  getContainer: () => document.createElement('div'),
  getPane: (name: string) => mockPanes[name],
  createPane: (name: string) => (mockPanes[name] = { style: {} }),
};
const mockUseMap = jest.fn(() => mockMap);
jest.mock('react-leaflet', () => ({
  useMap: () => mockUseMap(),
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  ScaleControl: () => <div data-testid="scale-bar" />,
  GeoJSON: (props: any) => { geoJsonRender(props); return null; },
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  CircleMarker: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
}));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: mockIsDark, markerOpacity: 0.78 }) }));
const mockFaultData = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[174, -41], [175, -40]]] }, properties: { name: 'Wellington' } }],
};
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn(async () => mockFaultData) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({
  ...jest.requireActual('@/components/advanced-viz/UncertaintyEllipse'),
  UncertaintyEllipse: (props: any) => { ellipseRender(props); return null; },
}));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({
  ...jest.requireActual('@/components/advanced-viz/BeachBallMarker'),
  BeachBallMarker: (props: any) => { beachBallRender(props); return null; },
}));

import UnifiedEarthquakeMap, {
  BEACH_BALL_MAX_UNZOOMED, BEACH_BALL_MIN_ZOOM, MAX_MAP_OVERLAYS, normalizeColorMode,
} from '@/components/visualize/UnifiedEarthquakeMap';
import { getEarthquakeColor, getMagnitudeColor, getMagnitudePixelRadius } from '@/lib/earthquake-utils';
import { getQualityColor } from '@/lib/quality-scoring';
import { FAULT_LEGEND_LABEL, MAP_PANES, faultPathOptions } from '@/lib/map-style';

const { BeachBallMarker: RealBeachBallMarker, BEACH_BALL_STYLE, beachBallDiameter } =
  jest.requireActual('@/components/advanced-viz/BeachBallMarker');
const { UncertaintyEllipse: RealUncertaintyEllipse, UNCERTAINTY_PANE, summarizeEllipseConfidence } =
  jest.requireActual('@/components/advanced-viz/UncertaintyEllipse');

beforeEach(() => {
  markerRender.mockClear();
  geoJsonRender.mockClear();
  ellipseRender.mockClear();
  beachBallRender.mockClear();
  mockUseMap.mockImplementation(() => mockMap);
  mockZoom = 5;
  mockIsDark = false;
  for (const name of Object.keys(mockPanes)) delete mockPanes[name];
  for (const name of Object.keys(mockHandlers)) delete mockHandlers[name];
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ faults: [], count: 0 }) })) as unknown as typeof fetch;
});

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const lastDrawn = (latitude: number) =>
  markerRender.mock.calls.map(([props]) => props).filter((props) => props.center[0] === latitude).pop();

const mechanisms = JSON.stringify([
  { publicID: 'smi:a/fm/1', nodalPlane1: { strike: 30, dip: 60, rake: 90 }, nodalPlane2: { strike: 210, dip: 30, rake: 90 } },
]);
const EVENTS = [
  { id: 'a', latitude: -41.1, longitude: 174.8, magnitude: 2.6, magnitude_type: 'ML', depth: 8, time: '2020-08-13T16:23:50Z',
    horizontal_uncertainty: 3, confidence_level: 90, quality_score: 80, quality_grade: 'B+', focal_mechanisms: mechanisms },
  { id: 'b', latitude: -39.2, longitude: 176.1, magnitude: 5.4, depth: 180, time: '2021-01-01T00:00:00Z',
    horizontal_uncertainty: 6, confidence_level: 90, quality_score: 40, quality_grade: 'D', focal_mechanisms: mechanisms },
];
/** `count` events, each with a mechanism, magnitudes 1..count (largest last). */
const manyMechanisms = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `fm${i + 1}`, latitude: -41 + i * 0.01, longitude: 174 + i * 0.01, magnitude: 1 + i * 0.01, depth: 10,
  time: '2024-01-15T20:00:00Z', focal_mechanisms: mechanisms,
}));
const legend = () => screen.getByRole('region', { name: 'Map legend' });
const toggle = (name: string) => fireEvent.click(screen.getByRole('switch', { name }));

describe('colour modes', () => {
  it('offers Depth, Quality, Azimuthal gap and Source catalogue - no Magnitude colour mode', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} />);
    await act(async () => {});
    const radios = within(screen.getByRole('group', { name: 'Colour by' })).getAllByRole('radio')
      .map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent);
    expect(radios).toEqual(['Depth', 'Quality', 'Azimuthal gap', 'Source catalogue']);
    expect(screen.queryByLabelText(/^magnitude$/i)).toBeNull();
    // Depth by default: markers carry their depth colours, not one uniform blue.
    expect(screen.getByLabelText('Depth')).toBeChecked();
    expect(lastDrawn(-41.1).pathOptions.fillColor).toBe(getEarthquakeColor(8, false));
    expect(lastDrawn(-39.2).pathOptions.fillColor).toBe(getEarthquakeColor(180, false));
    expect(lastDrawn(-41.1).pathOptions.fillColor).not.toBe(getMagnitudeColor(2.6));
    // ...and size by magnitude.
    expect(lastDrawn(-39.2).radius).toBe(getMagnitudePixelRadius(5.4));
  });

  it('a saved "magnitude" colour mode falls back to depth', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} colorBy={'magnitude' as any} />);
    await act(async () => {});
    expect(screen.getByLabelText('Depth')).toBeChecked();
    expect(within(legend()).getByRole('heading', { name: 'Depth' })).toBeInTheDocument();
    expect(normalizeColorMode('magnitude')).toBe('depth');
    expect(normalizeColorMode(undefined)).toBe('depth');
    expect(normalizeColorMode('bogus')).toBe('depth');
    expect(normalizeColorMode('quality')).toBe('quality');
  });
});

describe('map chrome shared with the catalogue map', () => {
  it('one Style panel, one legend card, a scale bar, the shared popup, framed on the events', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} />);
    await act(async () => {});
    expect(screen.getAllByRole('region', { name: 'Style options' })).toHaveLength(1);
    expect(screen.getAllByRole('region', { name: 'Map legend' })).toHaveLength(1);
    expect(screen.getByTestId('scale-bar')).toBeInTheDocument();
    expect(screen.queryByText('Map Options')).toBeNull();
    expect(screen.queryByText(/Displaying/)).toBeNull();
    // Everything is drawn, so no status chip; FitMapToEvents does not refit the creation bounds.
    expect(screen.queryByRole('status')).toBeNull();
    expect(mockMap.fitBounds).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByTestId('marker')[0]);
    await act(async () => {});
    const popup = screen.getByTestId('popup');
    expect(within(popup).getByText('ML 2.6')).toBeInTheDocument();
    expect(popup).toHaveTextContent('2020-08-13 16:23:50 UTC');
    expect(popup).toHaveTextContent('41.100° S, 174.800° E');
    expect(popup).toHaveTextContent('Q 80 (B+)');
  });

  it('keeps the Style panel and the legend in their separate corners (panel height-capped above the legend)', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} />);
    await act(async () => {});
    const panel = screen.getByRole('region', { name: 'Style options' }).parentElement!;
    const card = legend();
    // Panel: top-right under the layer button, <= 55% of the map minus the chrome; legend:
    // bottom-right, <= 45% - so the two can never meet (MapStylePanel / MapLegend contract).
    expect(panel.className).toMatch(/\btop-12\b/);
    expect(panel.className).toContain('max-h-[calc(55%-80px)]');
    expect(card.className).toMatch(/\bbottom-6\b/);
    expect(card.className).toContain('max-h-[45%]');
    expect(panel.contains(card) || card.contains(panel)).toBe(false);
  });
});

describe('active faults (spec S4)', () => {
  it('draws the traces thin and quiet in their own pane under the events, non-interactive', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} />);
    await act(async () => {});
    const props = geoJsonRender.mock.calls.at(-1)![0];
    expect(props.data).toBe(mockFaultData);
    expect(props.pane).toBe(MAP_PANES.faults.name);
    expect(props.interactive).toBe(false);
    expect(props.attribution).toMatch(/GNS Science/);
    expect(props.style()).toEqual(faultPathOptions(false, 0));
    expect(props.style()).toMatchObject({ color: '#7F1D1D', opacity: 0.55, weight: 1, interactive: false });
    // Pane 380: above the tiles (200), below Leaflet's overlay (400) and marker (600) panes.
    expect(mockPanes.faults.style.zIndex).toBe('380');
  });

  it('dark theme and zoom >= 9 use the dark tone and the heavier line', async () => {
    mockIsDark = true;
    mockZoom = 9;
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} />);
    await act(async () => {});
    const style = geoJsonRender.mock.calls.at(-1)![0].style();
    expect(style).toMatchObject({ color: '#FCA5A5', opacity: 0.45, weight: 1.5 });
  });

  it('the legend shows the fault line (with its source) while faults are on, and drops it when they are off', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} />);
    await act(async () => {});
    const key = legend().querySelector('[data-legend="faults"]');
    expect(key).not.toBeNull();
    expect(key).toHaveTextContent(FAULT_LEGEND_LABEL);
    expect(key!.querySelector('line')!.getAttribute('stroke')).toBe('#7F1D1D');

    toggle('Active faults');
    await act(async () => {});
    expect(legend().querySelector('[data-legend="faults"]')).toBeNull();
    geoJsonRender.mockClear();
    await act(async () => {});
    expect(geoJsonRender).not.toHaveBeenCalled();
  });
});

describe('focal-mechanism beach balls', () => {
  it('say when they are drawn, before being switched on', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} showFocalMechanisms />);
    await act(async () => {});
    expect(screen.getByText(`Drawn at zoom ≥ ${BEACH_BALL_MIN_ZOOM}, or when ≤ ${BEACH_BALL_MAX_UNZOOMED} are plotted.`)).toBeInTheDocument();
  });

  it('are held back at national zoom when more than 300 are plotted, and drawn once zoomed in', async () => {
    const many = manyMechanisms(BEACH_BALL_MAX_UNZOOMED + 1);
    render(<UnifiedEarthquakeMap earthquakes={many} showFocalMechanisms />);
    toggle('Focal mechanisms');
    await act(async () => {});
    expect(beachBallRender).not.toHaveBeenCalled();
    expect(screen.getByText('301 plotted events have one: zoom in to draw them.')).toBeInTheDocument();
    expect(legend().querySelector('[data-legend="focal-mechanisms"]')).toBeNull();

    mockZoom = BEACH_BALL_MIN_ZOOM;
    await act(async () => { mockHandlers.zoomend?.forEach((fn) => fn()); });
    const drawn = new Set(beachBallRender.mock.calls.map(([props]) => props.eventId));
    expect(drawn.size).toBe(MAX_MAP_OVERLAYS);
    expect(drawn).toContain('fm301'); // the largest magnitudes are kept
    expect(drawn).not.toContain('fm1');
    expect(screen.getByText('Showing the 150 largest of 301 plotted events.')).toBeInTheDocument();
    expect(legend().querySelector('[data-legend="focal-mechanisms"]')).not.toBeNull();
  });

  it('are drawn at national zoom when at most 300 are plotted', async () => {
    render(<UnifiedEarthquakeMap earthquakes={manyMechanisms(BEACH_BALL_MAX_UNZOOMED)} showFocalMechanisms />);
    toggle('Focal mechanisms');
    await act(async () => {});
    expect(new Set(beachBallRender.mock.calls.map(([props]) => props.eventId)).size).toBe(MAX_MAP_OVERLAYS);
  });

  it('take the depth colour in depth mode and dark grey otherwise, are sized by magnitude and open the popup', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} showFocalMechanisms />);
    toggle('Focal mechanisms');
    await act(async () => {});
    const byId = () => Object.fromEntries(beachBallRender.mock.calls.map(([props]) => [props.eventId, props]));
    expect(byId().a.fill).toBe(getEarthquakeColor(8, false));
    expect(byId().b.fill).toBe(getEarthquakeColor(180, false));
    expect(byId().b.magnitude).toBe(5.4);

    fireEvent.click(screen.getByLabelText('Quality'));
    await act(async () => {});
    expect(byId().a.fill).toBe(BEACH_BALL_STYLE.neutralFill);

    await act(async () => byId().b.onClick());
    expect(within(screen.getByTestId('popup')).getByText('M 5.4')).toBeInTheDocument();
  });
});

describe('uncertainty ellipses', () => {
  it('are drawn in each event\'s own marker colour, and the legend states the confidence level', async () => {
    render(<UnifiedEarthquakeMap earthquakes={EVENTS} />);
    toggle('Uncertainty ellipses');
    await act(async () => {});
    const colorOf = (id: string) => ellipseRender.mock.calls.map(([props]) => props).filter((p) => p.eventId === id).pop()!.color;
    expect(colorOf('a')).toBe(lastDrawn(-41.1).pathOptions.fillColor);
    expect(colorOf('b')).toBe(getEarthquakeColor(180, false));
    expect(legend().querySelector('[data-legend="uncertainty"]')).toHaveTextContent('Error ellipse, 90% confidence');

    fireEvent.click(screen.getByLabelText('Quality'));
    await act(async () => {});
    expect(colorOf('b')).toBe(getQualityColor(40));

    // The popup states the drawn error (the ellipse sits under the events, so it has no hover).
    fireEvent.click(screen.getAllByTestId('marker')[0]);
    await act(async () => {});
    const popup = screen.getByTestId('popup');
    expect(popup).toHaveTextContent('Location error');
    expect(popup).toHaveTextContent('90% confidence');
  });

  it('legend summary: one level, a range, unrecorded, and approximate extents', () => {
    expect(summarizeEllipseConfidence([{ source: 'origin-uncertainty', confidenceLevel: 90 }]))
      .toEqual({ reported: 'Error ellipse, 90% confidence', approximate: false });
    expect(summarizeEllipseConfidence([
      { source: 'origin-uncertainty', confidenceLevel: 68 }, { source: 'horizontal-circle', confidenceLevel: 90 },
    ]).reported).toBe('Error ellipse, 68–90% confidence');
    expect(summarizeEllipseConfidence([{ source: 'horizontal-circle' }]).reported).toBe('Error ellipse, confidence not recorded');
    expect(summarizeEllipseConfidence([{ source: 'latlon-marginals' }])).toEqual({ reported: null, approximate: true });
  });
});

describe('overlay components on real Leaflet layers', () => {
  const stubMap = () => {
    const layers: any[] = [];
    const panes: Record<string, any> = {};
    const map: any = {
      addLayer: (layer: any) => { layers.push(layer); return map; },
      removeLayer: jest.fn(),
      getPane: (name: string) => panes[name],
      createPane: (name: string) => (panes[name] = { style: {} }),
    };
    return { map, layers, panes };
  };

  it('beach-ball diameter grows with magnitude, always covers the marker, clamped to 18-48 px', () => {
    const sizes = [2, 3, 4, 5, 6].map((m) => beachBallDiameter(m));
    expect(sizes).toEqual([19, 22, 27, 34, 45]);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    for (const m of [2, 3, 4, 5, 6]) expect(beachBallDiameter(m)).toBeGreaterThanOrEqual(2 * getMagnitudePixelRadius(m));
    expect(beachBallDiameter(-1)).toBe(18);
    expect(beachBallDiameter(9)).toBe(48);
  });

  it('a beach ball: white dilatational, the given compressional fill, sized, clickable, large on top', () => {
    const { map, layers } = stubMap();
    mockUseMap.mockImplementation(() => map);
    const onClick = jest.fn();
    const mechanism = JSON.parse(mechanisms)[0];
    render(<>
      <RealBeachBallMarker position={[-41, 174]} mechanism={mechanism} eventId="x" magnitude={5} fill="#C5407E" onClick={onClick} />
      <RealBeachBallMarker position={[-41, 174]} mechanism={mechanism} eventId="y" magnitude={3} />
    </>);
    const [big, small] = layers as L.Marker[];
    const icon = big.options.icon!.options;
    expect(icon.iconSize).toEqual([34, 34]);
    const svg = decodeURIComponent(String(icon.iconUrl).replace('data:image/svg+xml,', ''));
    expect(svg).toContain('fill="#C5407E"');
    expect(svg).toContain(`fill="${BEACH_BALL_STYLE.background}"`);
    expect(big.options.interactive).toBe(true);
    expect(small.options.interactive).toBe(false);
    expect(big.options.zIndexOffset!).toBeGreaterThan(small.options.zIndexOffset!);
    big.fire('click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('an ellipse: own pane under the events, thin line in the given colour, faint fill, restyled in place', () => {
    const { map, layers, panes } = stubMap();
    mockUseMap.mockImplementation(() => map);
    const ellipse = { center: [-41, 174], semiMajorAxis: 5000, semiMinorAxis: 3000, rotation: 30, displayWeight: 0.8, source: 'origin-uncertainty', confidenceLevel: 90 };
    const { rerender } = render(<RealUncertaintyEllipse ellipse={ellipse} eventId="e" color="#FCA636" />);
    expect(panes[UNCERTAINTY_PANE.name].style.zIndex).toBe('390');
    const layer = layers[0] as L.Polygon;
    expect(layer.options).toMatchObject({ pane: 'uncertainty', interactive: false, color: '#FCA636', weight: 1, fillColor: '#FCA636', fillOpacity: 0.08 });
    expect(layer.options.dashArray).toBeUndefined();

    rerender(<RealUncertaintyEllipse ellipse={{ ...ellipse }} eventId="e" color="#0F766E" />);
    expect(layers).toHaveLength(1); // same geometry: restyled, not rebuilt
    expect(layer.options.color).toBe('#0F766E');

    render(<RealUncertaintyEllipse ellipse={{ ...ellipse, source: 'latlon-marginals' }} eventId="m" color="#FCA636" />);
    expect((layers[1] as L.Polygon).options.dashArray).toBe('3 3');
  });
});
