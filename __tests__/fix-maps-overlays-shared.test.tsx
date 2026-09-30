/**
 * Map overlays on every map: the analytics map's Style-panel "Overlays" (active faults,
 * uncertainty ellipses, focal mechanisms) extracted into components/map/MapOverlays.tsx and
 * added to EarthquakeCircleMap (catalogue › Map, dashboard Map View, merge results); a
 * compact "Active faults" switch on the region selector. The ~20 MB fault file is fetched
 * once per page load and shared by every map (lib/fault-data.ts loadFaultData).
 *
 * Focal mechanisms are a mode: on, the event circles are hidden and the plotted events'
 * beach balls drawn instead (the 300 largest, at any zoom, with a status chip when capped
 * and a notice when there are none); off, the events come back as they were.
 *
 * The merge-group map (imperative Leaflet) is covered by fix-maps-overlays-duplicate-group.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
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

jest.mock('react-leaflet', () => {
  const react = require('react');
  return {
    useMap: () => mockMap,
    MapContainer: react.forwardRef(function MapContainer({ children }: any, ref: any) {
      react.useImperativeHandle(ref, () => ({ fitBounds: jest.fn() }));
      return react.createElement('div', { 'data-testid': 'map-container' }, children);
    }),
    FeatureGroup: react.forwardRef(function FeatureGroup({ children }: any, ref: any) {
      react.useImperativeHandle(ref, () => ({ addLayer: jest.fn(), removeLayer: jest.fn() }));
      return react.createElement('div', null, children);
    }),
    ScaleControl: () => null,
    GeoJSON: (props: any) => { geoJsonRender(props); return react.createElement('div', { 'data-testid': 'faults-geojson' }); },
    Popup: ({ children }: any) => react.createElement('div', { 'data-testid': 'popup' }, children),
    CircleMarker: (props: any) => {
      markerRender(props);
      return react.createElement('button', { 'data-testid': 'marker', onClick: props.eventHandlers?.click }, 'Event');
    },
  };
});
jest.mock('react-leaflet-draw', () => ({ EditControl: () => null }));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({
  useMapColors: () => ({ isDark: mockIsDark, markerOpacity: 0.78 }),
  useIsDarkTheme: () => mockIsDark,
}));
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({
  ...jest.requireActual('@/components/advanced-viz/UncertaintyEllipse'),
  UncertaintyEllipse: (props: any) => { ellipseRender(props); return null; },
}));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({
  ...jest.requireActual('@/components/advanced-viz/BeachBallMarker'),
  BeachBallMarker: (props: any) => { beachBallRender(props); return null; },
}));

import { FAULT_DATA_URL, loadFaultData, resetFaultDataCache } from '@/lib/fault-data';
import { FAULT_ATTRIBUTION, FAULT_LEGEND_LABEL, MAP_PANES, faultPathOptions } from '@/lib/map-style';
import { getEarthquakeColor } from '@/lib/earthquake-utils';
import {
  ActiveFaultsToggle, FOCAL_MECHANISM_DESCRIPTION, FaultsOverlay, FocalMechanismLegendSection, FocalMechanismStatus,
  MAX_FOCAL_MECHANISMS, MAX_MAP_OVERLAYS, MapOverlayLegendSection, MapOverlayToggles, OVERLAY_UNAVAILABLE_REASONS,
  drawableFocalMechanism, uncertaintyOverlayNote,
} from '@/components/map/MapOverlays';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';
import { RegionSelectorMap } from '@/components/catalogues/RegionSelectorMap';
import { beachBallDiameter } from '@/components/advanced-viz/BeachBallMarker';
import { getQualityColor } from '@/lib/quality-scoring';
import { resolveEventQuality } from '@/components/events/event-quality';

const FAULTS = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[174.7, -41.35], [174.9, -41.25]]] }, properties: { name: 'Wellington' } }],
};

let fetchMock: jest.Mock;
const faultFetches = () => fetchMock.mock.calls.filter(([url]) => String(url) === FAULT_DATA_URL).length;

beforeEach(() => {
  markerRender.mockClear();
  geoJsonRender.mockClear();
  ellipseRender.mockClear();
  beachBallRender.mockClear();
  mockZoom = 5;
  mockIsDark = false;
  for (const name of Object.keys(mockPanes)) delete mockPanes[name];
  for (const name of Object.keys(mockHandlers)) delete mockHandlers[name];
  resetFaultDataCache();
  fetchMock = jest.fn(async (url: string) => {
    if (String(url) === FAULT_DATA_URL) return { ok: true, statusText: 'OK', json: async () => FAULTS };
    throw new Error(`unexpected fetch ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const legend = () => screen.getByRole('region', { name: 'Map legend' });
const overlaysSection = () => screen.getByText('Overlays', { selector: 'div' }).parentElement!;
const lastDrawn = (latitude: number) =>
  markerRender.mock.calls.map(([props]) => props).filter((props) => props.center[0] === latitude).pop();

const mechanisms = JSON.stringify([
  { publicID: 'smi:a/fm/first', nodalPlane1: { strike: 0, dip: 45, rake: 90 }, nodalPlane2: { strike: 180, dip: 45, rake: 90 } },
  { publicID: 'smi:a/fm/preferred', nodalPlane1: { strike: 30, dip: 90, rake: 0 }, nodalPlane2: { strike: 120, dip: 90, rake: 180 } },
]);
/** Summary rows as the catalogue event loader delivers them (view=summary). */
const PLAIN = [
  { id: 'p1', latitude: -41.1, longitude: 174.8, magnitude: 2.6, magnitude_type: 'ML', depth: 8, time: '2020-08-13T16:23:50Z' },
  { id: 'p2', latitude: -39.2, longitude: 176.1, magnitude: 4.4, depth: 180, time: '2021-01-01T00:00:00Z' },
];
const RICH = [
  { ...PLAIN[0], id: 'r1', horizontal_uncertainty: 3, confidence_level: 90 },
  { ...PLAIN[1], id: 'r2', max_horizontal_uncertainty: 6, min_horizontal_uncertainty: 2, azimuth_max_horizontal_uncertainty: 45,
    confidence_level: 90, focal_mechanisms: mechanisms, preferred_focal_mechanism_id: 'smi:a/fm/preferred' },
];

describe('loadFaultData: fetched once per page load, shared by every map', () => {
  it('concurrent and later callers share one request and one parsed collection', async () => {
    const [a, b] = await Promise.all([loadFaultData(), loadFaultData()]);
    const c = await loadFaultData();
    expect(faultFetches()).toBe(1);
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(a.features).toHaveLength(1);
  });

  it('a failed load resolves to an empty collection and the next caller retries', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementationOnce(async () => ({ ok: false, statusText: 'Not Found', json: async () => ({}) }));
    await expect(loadFaultData()).resolves.toEqual({ type: 'FeatureCollection', features: [] });
    expect(error).toHaveBeenCalled();
    const retried = await loadFaultData();
    expect(retried.features).toHaveLength(1);
    expect(faultFetches()).toBe(2);
  });

  it('rejects a body that is not a GeoJSON FeatureCollection', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => [{ id: 'not-faults' }] }));
    await expect(loadFaultData()).resolves.toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('shared overlay pieces (components/map/MapOverlays.tsx)', () => {
  it('the Overlays section: one switch per overlay given, disabled with its reason when the data has none', () => {
    const onChange = jest.fn();
    render(
      <MapOverlayToggles
        faults={{ checked: true, onCheckedChange: onChange }}
        uncertainty={{ checked: true, onCheckedChange: onChange, note: 'a note', unavailableReason: OVERLAY_UNAVAILABLE_REASONS.uncertainty }}
        focalMechanisms={{ checked: false, onCheckedChange: onChange }}
      />
    );
    const switches = screen.getAllByRole('switch');
    expect(switches.map((s) => s.id && document.querySelector(`label[for="${s.id}"]`)?.textContent))
      .toEqual(['Active faults', 'Uncertainty ellipses', 'Focal mechanisms']);

    const faults = screen.getByRole('switch', { name: 'Active faults' });
    expect(faults).toHaveAttribute('aria-checked', 'true');
    expect(faults).toBeEnabled();

    // No data: disabled, shown off whatever the state says, the reason replaces the note.
    const ellipses = screen.getByRole('switch', { name: 'Uncertainty ellipses' });
    expect(ellipses).toBeDisabled();
    expect(ellipses).toHaveAttribute('aria-checked', 'false');
    expect(ellipses).toHaveAccessibleDescription('No location uncertainties in this catalogue.');
    expect(screen.queryByText('a note')).toBeNull();
    fireEvent.click(ellipses);
    expect(onChange).not.toHaveBeenCalled();

    const focal = screen.getByRole('switch', { name: 'Focal mechanisms' });
    expect(focal).toBeEnabled();
    // "Focal mechanisms — show beach balls instead of event circles".
    expect(focal).toHaveAccessibleDescription(FOCAL_MECHANISM_DESCRIPTION);
    expect(FOCAL_MECHANISM_DESCRIPTION).toBe('Show beach balls instead of event circles.');
    fireEvent.click(focal);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('leaves out an overlay that is not given', () => {
    render(<MapOverlayToggles faults={{ checked: false, onCheckedChange: jest.fn() }} />);
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('the legend section: nothing while no overlay shows, then the fault line and the ellipse key', () => {
    const { container, rerender } = render(<MapOverlayLegendSection isDark={false} showFaults={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<MapOverlayLegendSection isDark={false} showFaults ellipses={[{ source: 'origin-uncertainty', confidenceLevel: 90 }]} />);
    expect(screen.getByRole('heading', { name: 'Overlays' })).toBeInTheDocument();
    expect(container.querySelector('[data-legend="faults"]')).toHaveTextContent(FAULT_LEGEND_LABEL);
    expect(container.querySelector('[data-legend="uncertainty"]')).toHaveTextContent('Error ellipse, 90% confidence');
  });

  it('the mechanisms-mode legend: compressional / dilatational key and ball sizes at their drawn diameter', () => {
    const { container } = render(<FocalMechanismLegendSection />);
    expect(screen.getByRole('heading', { name: 'Focal mechanisms' })).toBeInTheDocument();
    expect(container.querySelector('[data-quadrant="compressional"]')).toHaveTextContent('Compressional (event colour)');
    expect(container.querySelector('[data-quadrant="dilatational"]')).toHaveTextContent('Dilatational');
    const sizes = Array.from(container.querySelectorAll('[data-legend="focal-mechanism-size"] [data-magnitude] svg'))
      .map((svg) => Number(svg.getAttribute('width')));
    expect(sizes).toEqual([2, 3, 4, 5, 6].map((m) => beachBallDiameter(m)));
  });

  it('the mechanisms-mode status: a chip when capped, nothing when all are drawn, a notice when there are none', () => {
    const { rerender } = render(<FocalMechanismStatus shown={300} total={1240} catalogueHasAny />);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 300 of 1,240 focal mechanisms (largest) · zoom in for more');
    rerender(<FocalMechanismStatus shown={12} total={12} catalogueHasAny />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<FocalMechanismStatus shown={0} total={0} catalogueHasAny />);
    expect(screen.getByRole('status')).toHaveTextContent('No focal mechanisms in view');
    rerender(<FocalMechanismStatus shown={0} total={0} catalogueHasAny={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('No focal mechanisms in this catalogue');
  });

  it('FaultsOverlay draws nothing until there are traces', () => {
    const { rerender } = render(<FaultsOverlay data={null} isDark={false} />);
    rerender(<FaultsOverlay data={{ type: 'FeatureCollection', features: [] }} isDark={false} />);
    expect(geoJsonRender).not.toHaveBeenCalled();
  });

  it('FaultsOverlay: faults pane (z 380) under the events, canvas renderer in that pane, spec S4 style, GNS attribution', () => {
    const { unmount } = render(<FaultsOverlay data={FAULTS as any} isDark={false} />);
    const props = geoJsonRender.mock.calls.at(-1)![0];
    expect(props.data).toBe(FAULTS);
    expect(props.pane).toBe(MAP_PANES.faults.name);
    expect(props.interactive).toBe(false);
    expect(props.attribution).toBe(FAULT_ATTRIBUTION);
    expect(props.style()).toEqual(faultPathOptions(false, 0));
    expect(props.renderer).toBeInstanceOf(L.Canvas);
    expect(props.renderer.options.pane).toBe('faults');
    expect(mockPanes.faults.style.zIndex).toBe('380');

    // One renderer per map, reused when the overlay is switched off and on again.
    unmount();
    render(<FaultsOverlay data={FAULTS as any} isDark={false} />);
    expect(geoJsonRender.mock.calls.at(-1)![0].renderer).toBe(props.renderer);
  });

  it('FaultsOverlay: the dark tone, and the heavier line once zoomed to 9', async () => {
    render(<FaultsOverlay data={FAULTS as any} isDark />);
    expect(geoJsonRender.mock.calls.at(-1)![0].style()).toMatchObject({ color: '#FCA5A5', opacity: 0.45, weight: 1 });
    mockZoom = 9;
    await act(async () => { mockHandlers.zoomend?.forEach((fn) => fn()); });
    expect(geoJsonRender.mock.calls.at(-1)![0].style()).toMatchObject({ weight: 1.5 });
  });

  it('ellipse notes and the preferred mechanism', () => {
    expect(uncertaintyOverlayNote(false, 0)).toBeUndefined();
    expect(uncertaintyOverlayNote(true, 0)).toBe('No plotted event reports a location uncertainty.');
    expect(uncertaintyOverlayNote(true, 1200)).toBe(`Showing the ${MAX_MAP_OVERLAYS} largest of 1,200 plotted events.`);
    expect(drawableFocalMechanism(RICH[1] as { focal_mechanisms: string })!.nodalPlane1).toEqual({ strike: 30, dip: 90, rake: 0 });
    expect(drawableFocalMechanism({ focal_mechanisms: JSON.stringify([{ publicID: 'x' }]) })).toBeNull();
    expect(drawableFocalMechanism({ focal_mechanisms: null })).toBeNull();
  });

  it('the compact switch for the small maps is named "Active faults" and shows the fault line', () => {
    const onChange = jest.fn();
    const { container } = render(<ActiveFaultsToggle checked={false} onCheckedChange={onChange} isDark={false} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Active faults' }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(container.querySelector('line')).toHaveAttribute('stroke', '#7F1D1D');
    expect(container.querySelector('label')).toHaveAttribute('title', FAULT_LEGEND_LABEL);
  });
});

describe('EarthquakeCircleMap (catalogue › Map, dashboard Map View, merge results) overlays', () => {
  const renderMap = (events: any[]) =>
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={jest.fn()} />);

  it('has the Overlays section with the analytics map\'s three switches, faults on by default and drawn', async () => {
    renderMap(RICH);
    await settle();
    const section = overlaysSection();
    expect(within(section).getAllByRole('switch').map((s) => s.getAttribute('id') && document.querySelector(`label[for="${s.id}"]`)?.textContent))
      .toEqual(['Active faults', 'Uncertainty ellipses', 'Focal mechanisms']);
    expect(screen.getByRole('switch', { name: 'Active faults' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Uncertainty ellipses' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Focal mechanisms' })).toHaveAttribute('aria-checked', 'false');

    // The faults are drawn with the shared layer, and keyed in the legend.
    expect(faultFetches()).toBe(1);
    const props = geoJsonRender.mock.calls.at(-1)![0];
    expect(props.data).toEqual(FAULTS);
    expect(props.pane).toBe('faults');
    expect(props.attribution).toMatch(/GNS Science/);
    expect(legend().querySelector('[data-legend="faults"]')).toHaveTextContent(FAULT_LEGEND_LABEL);
  });

  it('switching faults off removes the traces and their legend line; back on, no second download', async () => {
    renderMap(PLAIN);
    await settle();
    expect(screen.getByTestId('faults-geojson')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Active faults' }));
    await settle();
    expect(screen.queryByTestId('faults-geojson')).toBeNull();
    expect(legend().querySelector('[data-legend="faults"]')).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Active faults' }));
    await settle();
    expect(screen.getByTestId('faults-geojson')).toBeInTheDocument();
    expect(faultFetches()).toBe(1);
  });

  it('disables the ellipse and beach-ball switches, with the reason, for a catalogue without that data', async () => {
    renderMap(PLAIN);
    await settle();
    const ellipses = screen.getByRole('switch', { name: 'Uncertainty ellipses' });
    const focal = screen.getByRole('switch', { name: 'Focal mechanisms' });
    expect(ellipses).toBeDisabled();
    expect(focal).toBeDisabled();
    expect(screen.getByText('No location uncertainties in this catalogue.')).toBeInTheDocument();
    expect(screen.getByText('No focal mechanisms in this catalogue.')).toBeInTheDocument();
    fireEvent.click(ellipses);
    fireEvent.click(focal);
    await settle();
    expect(ellipseRender).not.toHaveBeenCalled();
    expect(beachBallRender).not.toHaveBeenCalled();
  });

  it('draws ellipses in the marker colour, with the legend key and the popup row', async () => {
    renderMap(RICH);
    await settle();
    expect(screen.getByRole('switch', { name: 'Uncertainty ellipses' })).toBeEnabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Uncertainty ellipses' }));
    await settle();

    const ellipseOf = (id: string) => ellipseRender.mock.calls.map(([props]) => props).filter((p) => p.eventId === id).pop();
    expect(ellipseOf('r1').ellipse.source).toBe('horizontal-circle');
    expect(ellipseOf('r2').ellipse).toMatchObject({ source: 'origin-uncertainty', confidenceLevel: 90 });
    expect(ellipseOf('r2').color).toBe(lastDrawn(-39.2).pathOptions.fillColor);
    expect(legend().querySelector('[data-legend="uncertainty"]')).toHaveTextContent('Error ellipse, 90% confidence');

    fireEvent.click(screen.getAllByTestId('marker')[1]);
    await settle();
    const popup = screen.getByTestId('popup');
    expect(popup).toHaveTextContent('Location error');
    expect(popup).toHaveTextContent(/× .* km, 90% confidence|radius .* km, 90% confidence/);
  });
});

describe('EarthquakeCircleMap mechanisms mode: beach balls instead of event circles', () => {
  const renderMap = (events: any[]) =>
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={jest.fn()} />);
  const toggleMechanisms = () => fireEvent.click(screen.getByRole('switch', { name: 'Focal mechanisms' }));

  it('hides the event circles and draws the preferred mechanism in the event colour; off restores the events', async () => {
    renderMap(RICH);
    await settle();
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.getByRole('switch', { name: 'Focal mechanisms' })).toHaveAccessibleDescription('Show beach balls instead of event circles.');

    toggleMechanisms();
    await settle();
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
    // Only r2 has a mechanism; the preferred one, compressional quadrants in its depth colour.
    const balls = beachBallRender.mock.calls.map(([props]) => props);
    expect(new Set(balls.map((b) => b.eventId))).toEqual(new Set(['r2']));
    const ball = balls.at(-1);
    expect(ball.mechanism.nodalPlane1).toEqual({ strike: 30, dip: 90, rake: 0 });
    expect(ball.fill).toBe(getEarthquakeColor(180, false));
    expect(ball.magnitude).toBe(4.4);

    // Legend: the beach-ball key in place of the circle magnitude key; the colour key stays.
    expect(legend().querySelector('[data-legend="focal-mechanisms"]')).not.toBeNull();
    expect(legend().querySelector('[data-legend="magnitude"]')).toBeNull();
    expect(legend().querySelector('[data-legend="depth"]')).not.toBeNull();

    // A ball opens its event's popup.
    await act(async () => ball.onClick());
    expect(within(screen.getByTestId('popup')).getByText('M 4.4')).toBeInTheDocument();

    // The current colour mode colours the balls (r2's quality, scored on the fly).
    fireEvent.click(screen.getByLabelText('Quality'));
    await settle();
    expect(beachBallRender.mock.calls.at(-1)![0].fill).toBe(getQualityColor(resolveEventQuality(RICH[1]).score));

    toggleMechanisms();
    await settle();
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.getByLabelText('Quality')).toBeChecked();
    expect(legend().querySelector('[data-legend="magnitude"]')).not.toBeNull();
  });

  it('draws the 300 largest at any zoom and says so in the status chip', async () => {
    const many = Array.from({ length: 1240 }, (_, i) => ({
      id: `fm${i + 1}`, latitude: -45 + (i % 40) * 0.2, longitude: 168 + Math.floor(i / 40) * 0.3, magnitude: 1 + i * 0.004, depth: 10,
      time: '2024-01-15T20:00:00Z', focal_mechanisms: mechanisms,
    }));
    render(<EarthquakeCircleMap events={many} sampleSize={5000} onSampleSizeChange={jest.fn()} />);
    await settle();
    toggleMechanisms();
    await settle();
    const drawn = new Set(beachBallRender.mock.calls.map(([props]) => props.eventId));
    expect(drawn.size).toBe(MAX_FOCAL_MECHANISMS);
    expect(drawn).toContain('fm1240');
    expect(drawn).not.toContain('fm1');
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 300 of 1,240 focal mechanisms (largest) · zoom in for more');
  });

  it('shows a notice instead of an empty map when no plotted event has one', async () => {
    // The catalogue has a mechanism, but only on an event outside the view.
    const far = { id: 'far', latitude: 10, longitude: 0, magnitude: 5, depth: 10, time: '2024-01-01T00:00:00Z', focal_mechanisms: mechanisms };
    renderMap([...PLAIN, far]);
    await settle();
    toggleMechanisms();
    await settle();
    expect(beachBallRender).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent('No focal mechanisms in view');
  });

  it('keeps the faults and the ellipses', async () => {
    renderMap(RICH);
    await settle();
    fireEvent.click(screen.getByRole('switch', { name: 'Uncertainty ellipses' }));
    toggleMechanisms();
    await settle();
    expect(screen.getByTestId('faults-geojson')).toBeInTheDocument();
    expect(new Set(ellipseRender.mock.calls.map(([props]) => props.eventId))).toEqual(new Set(['r1', 'r2']));
    expect(legend().querySelector('[data-legend="faults"]')).not.toBeNull();
    expect(legend().querySelector('[data-legend="uncertainty"]')).not.toBeNull();
  });
});

describe('region selector: compact "Active faults" switch', () => {
  it('is off by default and adds / removes the fault traces under the drawn region', async () => {
    render(<RegionSelectorMap onRegionSelected={jest.fn()} />);
    await settle();
    const toggle = screen.getByRole('switch', { name: 'Active faults' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('faults-geojson')).toBeNull();
    expect(faultFetches()).toBe(0);

    fireEvent.click(toggle);
    await settle();
    expect(screen.getByTestId('faults-geojson')).toBeInTheDocument();
    const props = geoJsonRender.mock.calls.at(-1)![0];
    expect(props).toMatchObject({ pane: 'faults', interactive: false, attribution: FAULT_ATTRIBUTION });
    expect(props.style()).toEqual(faultPathOptions(false, 0));

    fireEvent.click(toggle);
    await settle();
    expect(screen.queryByTestId('faults-geojson')).toBeNull();
  });
});

describe('one fault download per page, however many maps draw them', () => {
  it('two event maps and the region selector share a single request', async () => {
    render(
      <>
        <EarthquakeCircleMap events={PLAIN} sampleSize="auto" onSampleSizeChange={jest.fn()} mapKey="one" />
        <EarthquakeCircleMap events={RICH} sampleSize="auto" onSampleSizeChange={jest.fn()} mapKey="two" />
        <RegionSelectorMap onRegionSelected={jest.fn()} />
      </>
    );
    fireEvent.click(screen.getByRole('switch', { name: /Active faults/, checked: false }));
    await settle();
    expect(screen.getAllByTestId('faults-geojson')).toHaveLength(3);
    expect(faultFetches()).toBe(1);
  });
});
