/**
 * Size and depth legends must describe the markers actually drawn.
 *
 * Size: getMagnitudePixelRadius gives radii [3, 3, 4, 5, 6, 8, 10, 12] px by floor(M),
 * so M6 markers are 20 px across and M7+ 24 px. The legends drew 16 and 20 px swatches
 * for them (the M5 and M6 sizes), so an M6.3 marker matched the 'M7+' swatch. Two legacy
 * maps drew metre-radius Circles, which no fixed legend can describe at every zoom.
 *
 * Depth: markers take getEarthquakeColor(depth, isDark), but the analytics legend was
 * hard-coded to the light palette, had no entry for unknown depth, and called 100-200 km
 * 'Deep' and >= 200 km 'V. Deep'. The standard classes are shallow 0-70 km, intermediate
 * 70-300 km and deep >= 300 km, so a 150 km Hikurangi slab event is intermediate.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';
import UnifiedEarthquakeMap from '@/components/visualize/UnifiedEarthquakeMap';
import NZEarthquakeMap from '@/components/visualize/NZEarthquakeMap';
import { MapView } from '@/components/catalogues/MapView';
import { EnhancedMapView } from '@/components/advanced-viz/EnhancedMapView';
import { getEarthquakeColor, getMagnitudePixelRadius } from '@/lib/earthquake-utils';

const map = {
  getSize: () => ({ x: 800, y: 600 }),
  getZoom: () => 5,
  getBounds: () => ({
    getNorth: () => -30, getSouth: () => -50, getWest: () => 160, getEast: () => 190,
    getCenter: () => ({ lat: -40, lng: 175 }),
  }),
  on: jest.fn(),
  off: jest.fn(),
};
const markerRender = jest.fn();
let mockIsDark = false;
jest.mock('react-leaflet', () => ({
  useMap: () => map,
  MapContainer: ({ children }: any) => <div>{children}</div>,
  GeoJSON: () => null,
  FeatureGroup: ({ children }: any) => <div>{children}</div>,
  Polyline: () => null,
  Circle: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
  CircleMarker: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));
jest.mock('react-leaflet-draw', () => ({ EditControl: () => null }));
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn().mockResolvedValue(null) }));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: mockIsDark, markerOpacity: 0.75 }) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({ UncertaintyEllipse: () => null }));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({ BeachBallMarker: () => null }));
jest.mock('@/components/advanced-viz/StationMarker', () => ({ StationMarker: () => null }));

/** One event per depth band and magnitude tier; latitude identifies the marker. */
const events = [
  { id: 1, latitude: -41.1, longitude: 174.8, magnitude: 2.4, depth: 5, time: '2024-01-15T20:00:00Z' },
  { id: 2, latitude: -41.2, longitude: 174.8, magnitude: 4.2, depth: 20, time: '2024-01-15T20:00:00Z' },
  { id: 3, latitude: -41.3, longitude: 174.8, magnitude: 5.5, depth: 50, time: '2024-01-15T20:00:00Z' },
  { id: 4, latitude: -41.4, longitude: 174.8, magnitude: 6.3, depth: 150, time: '2024-01-15T20:00:00Z' },
  { id: 5, latitude: -41.5, longitude: 174.8, magnitude: 7.8, depth: 250, time: '2024-01-15T20:00:00Z' },
  { id: 6, latitude: -41.6, longitude: 174.8, magnitude: 3.1, depth: null, time: '2024-01-15T20:00:00Z' },
];

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const legendCard = (heading: RegExp) =>
  screen.getByRole('heading', { name: heading }).closest('[class*="bottom-4"]') as HTMLElement;

/** The swatch grid that follows the legend heading, as [swatch, label] rows. */
function legendSection(heading: RegExp) {
  const grid = screen.getByRole('heading', { name: heading }).parentElement!.nextElementSibling as HTMLElement;
  return Array.from(grid.querySelectorAll<HTMLElement>('.rounded-full')).map((swatch) => ({
    swatch,
    label: swatch.nextElementSibling?.textContent?.trim() ?? '',
  }));
}

/** Rendered diameter in CSS px: inline size, else the Tailwind w-N class (N x 4 px). */
function diameter(swatch: HTMLElement): number | null {
  if (swatch.style.width) return parseFloat(swatch.style.width);
  const tailwind = swatch.className.match(/(?:^|\s)w-(\d+(?:\.\d+)?)(?:\s|$)/);
  return tailwind ? Number(tailwind[1]) * 4 : null;
}

function expectSizeLegendMatchesMarkers(heading: RegExp) {
  const rows = legendSection(heading);
  expect(rows.map(({ label }) => label)).toEqual(['M2', 'M4', 'M6', 'M7+']);
  for (const { swatch, label } of rows) {
    const magnitude = Number(label.replace(/[^\d.]/g, ''));
    expect({ label, diameter: diameter(swatch) }).toEqual({ label, diameter: 2 * getMagnitudePixelRadius(magnitude) });
  }
  // Every marker is a screen-pixel circle of the size the legend shows for its tier.
  for (const event of events) {
    const drawn = markerRender.mock.calls.map(([props]) => props).filter((p) => p.center[0] === event.latitude).pop();
    expect({ id: event.id, radius: drawn.radius }).toEqual({ id: event.id, radius: getMagnitudePixelRadius(event.magnitude) });
  }
  // The review's example: an M6.3 marker is the M6 swatch's size, not the M7+ one's.
  const m6 = rows.find(({ label }) => label === 'M6')!;
  expect(diameter(m6.swatch)).toBe(2 * getMagnitudePixelRadius(6.3));
}

/** [min, max) of a label such as '< 15 km', '15–40 km' or '≥ 200 km (V. Deep)'. */
function labelRange(label: string): [number, number] | null {
  const m = label.match(/^(?:(<|≥)\s*(\d+)|(\d+)\s*[-–]\s*(\d+))\s*km/);
  if (!m) return null;
  if (m[1] === '<') return [-Infinity, Number(m[2])];
  if (m[1] === '≥') return [Number(m[2]), Infinity];
  return [Number(m[3]), Number(m[4])];
}

/** Standard depth classes (ISC/USGS usage): shallow 0-70, intermediate 70-300, deep >= 300 km. */
function expectStandardClassNames(label: string) {
  const range = labelRange(label);
  if (!range) return;
  const [min, max] = range;
  if (/shallow/i.test(label)) expect({ label, consistent: max <= 70 }).toEqual({ label, consistent: true });
  if (/intermediate/i.test(label)) expect({ label, consistent: min >= 70 && max <= 300 }).toEqual({ label, consistent: true });
  if (/deep/i.test(label)) expect({ label, consistent: min >= 300 }).toEqual({ label, consistent: true });
}

function expectDepthLegendMatchesMarkers(heading: RegExp, isDark: boolean) {
  const rows = legendSection(heading).map(({ swatch, label }) => ({ color: swatch.style.backgroundColor, label }));
  for (const event of events) {
    const drawn = markerRender.mock.calls.map(([props]) => props).filter((p) => p.center[0] === event.latitude).pop();
    // Markers use the shared depth palette for the current theme...
    expect({ depth: event.depth, color: drawn.pathOptions.fillColor }).toEqual({ depth: event.depth, color: getEarthquakeColor(event.depth, isDark) });
    // ...and the legend keys that colour with a range containing the depth.
    const row = rows.find(({ color }) => color === rgb(drawn.pathOptions.fillColor));
    expect({ depth: event.depth, keyed: row?.label ?? null }).toEqual({ depth: event.depth, keyed: expect.any(String) });
    if (event.depth === null) {
      expect(row!.label).toMatch(/unknown/i);
    } else {
      const [min, max] = labelRange(row!.label)!;
      expect({ depth: event.depth, label: row!.label, inside: event.depth >= min && event.depth < max })
        .toEqual({ depth: event.depth, label: row!.label, inside: true });
    }
  }
  for (const { label } of rows) expectStandardClassNames(label);
  const card = legendCard(heading);
  expect(card).toHaveTextContent('Shallow < 70 km');
  expect(card).toHaveTextContent('intermediate 70–300 km');
  expect(card).toHaveTextContent('deep ≥ 300 km');
}

beforeEach(() => {
  markerRender.mockClear();
  mockIsDark = false;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ faults: [], count: 0 }) })) as unknown as typeof fetch;
});

describe('catalogue and dashboard map (EarthquakeCircleMap)', () => {
  it.each([false, true])('size and depth legends match the markers (dark mode %s)', (isDark) => {
    mockIsDark = isDark;
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={jest.fn()} />);
    expectSizeLegendMatchesMarkers(/^magnitude/i);
    expectDepthLegendMatchesMarkers(/^depth/i, isDark);
  });
});

describe('analytics map (UnifiedEarthquakeMap)', () => {
  it('magnitude mode: the size legend matches the markers', () => {
    render(<UnifiedEarthquakeMap earthquakes={events as any} />);
    expectSizeLegendMatchesMarkers(/^magnitude/i);
  });

  it.each([false, true])('depth mode: the legend matches the markers (dark mode %s)', async (isDark) => {
    mockIsDark = isDark;
    render(<UnifiedEarthquakeMap earthquakes={events as any} />);
    fireEvent.click(screen.getByLabelText('Depth'));
    await act(async () => {});
    expectDepthLegendMatchesMarkers(/^depth/i, isDark);
  });
});

describe('legacy maps', () => {
  it('catalogue MapView, magnitude and depth modes', async () => {
    mockIsDark = true;
    render(<MapView events={events as any} />);
    expectSizeLegendMatchesMarkers(/^magnitude/i);
    fireEvent.click(screen.getByLabelText('Depth'));
    await act(async () => {});
    expectDepthLegendMatchesMarkers(/^depth/i, true);
  });

  it('NZEarthquakeMap, magnitude and depth modes', async () => {
    mockIsDark = true;
    render(<NZEarthquakeMap earthquakes={events as any} />);
    expectSizeLegendMatchesMarkers(/^magnitude/i);
    fireEvent.click(screen.getByLabelText('Depth'));
    await act(async () => {});
    expectDepthLegendMatchesMarkers(/^depth/i, true);
  });

  it('EnhancedMapView keys its depth-coloured, magnitude-sized markers', async () => {
    mockIsDark = true;
    render(<EnhancedMapView events={events as any} />);
    await act(async () => {});
    expectSizeLegendMatchesMarkers(/^magnitude/i);
    expectDepthLegendMatchesMarkers(/^depth/i, true);
  });
});
