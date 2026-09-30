/**
 * Size and depth legends must describe the markers actually drawn.
 *
 * Size: getMagnitudePixelRadius is continuous and exponential (r = 2.2 * 1.5^(M-1) px,
 * clamped to 2.2-28), so every legend circle must be drawn at exactly the radius a marker
 * of that magnitude gets. The old stepped legends drew 16 and 20 px swatches for M6/M7+
 * markers that were really 20 and 24 px, so an M6.3 marker matched the 'M7+' swatch. Two
 * legacy maps drew metre-radius Circles, which no fixed legend can describe at every zoom.
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
  fitBounds: jest.fn(),
  getContainer: () => document.createElement('div'),
};
const markerRender = jest.fn();
let mockIsDark = false;
jest.mock('react-leaflet', () => ({
  useMap: () => map,
  MapContainer: ({ children }: any) => <div>{children}</div>,
  ScaleControl: () => null,
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
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({
  ...jest.requireActual('@/components/advanced-viz/UncertaintyEllipse'),
  UncertaintyEllipse: () => null,
}));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({
  ...jest.requireActual('@/components/advanced-viz/BeachBallMarker'),
  BeachBallMarker: () => null,
}));
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
  // The review's example: an M6.3 marker now sits between the M6 and M7+ swatches.
  const m6 = rows.find(({ label }) => label === 'M6')!;
  const m7 = rows.find(({ label }) => label === 'M7+')!;
  expect(2 * getMagnitudePixelRadius(6.3)).toBeGreaterThan(diameter(m6.swatch)!);
  expect(2 * getMagnitudePixelRadius(6.3)).toBeLessThan(diameter(m7.swatch)!);
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
  const lastDrawn = (latitude: number) =>
    markerRender.mock.calls.map(([props]) => props).filter((p) => p.center[0] === latitude).pop();

  it.each([false, true])('magnitude key circles are drawn at the markers\' true radius (dark mode %s)', (isDark) => {
    mockIsDark = isDark;
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={jest.fn()} />);
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-legend="magnitude"] [data-magnitude]'));
    expect(items.map((item) => item.textContent)).toEqual(['M2', 'M3', 'M4', 'M5', 'M6']);
    for (const item of items) {
      const magnitude = Number(item.dataset.magnitude);
      expect({ magnitude, r: Number(item.querySelector('circle')!.getAttribute('r')) })
        .toEqual({ magnitude, r: getMagnitudePixelRadius(magnitude) });
    }
    for (const event of events) {
      expect({ id: event.id, radius: lastDrawn(event.latitude).radius }).toEqual({ id: event.id, radius: getMagnitudePixelRadius(event.magnitude) });
    }
  });

  it.each([false, true])('depth bar keys every marker colour with a class containing its depth (dark mode %s)', (isDark) => {
    mockIsDark = isDark;
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={jest.fn()} />);
    const segments = Array.from(document.querySelectorAll<HTMLElement>('[data-legend="depth"] [data-depth-class]'))
      .map((segment) => ({ color: segment.style.backgroundColor, label: segment.dataset.depthClass! }));
    expect(segments.map(({ label }) => label)).toEqual(['< 15 km', '15–40 km', '40–70 km', '70–150 km', '150–300 km', '≥ 300 km']);
    for (const event of events) {
      const fill = lastDrawn(event.latitude).pathOptions.fillColor;
      expect({ depth: event.depth, fill }).toEqual({ depth: event.depth, fill: getEarthquakeColor(event.depth, isDark) });
      if (event.depth === null) {
        const unknown = document.querySelector<HTMLElement>('[data-legend="depth"] [data-swatch="unknown depth"]')!;
        expect(unknown.style.backgroundColor).toBe(rgb(fill));
        continue;
      }
      const row = segments.find(({ color }) => color === rgb(fill));
      const [min, max] = labelRange(row!.label)!;
      expect({ depth: event.depth, label: row!.label, inside: event.depth >= min && event.depth < max })
        .toEqual({ depth: event.depth, label: row!.label, inside: true });
    }
    // Boundaries under the bar and the standard classes, with their limits, beneath it.
    const legend = document.querySelector('[data-legend="depth"]')!;
    expect(legend).toHaveTextContent('shallow < 70 · intermediate 70–300 · deep ≥ 300 km');
    expect(legend).toHaveTextContent(/0\s*15\s*40\s*70\s*150\s*300\s*km/);
  });
});

describe('analytics map (UnifiedEarthquakeMap)', () => {
  const lastDrawn = (latitude: number) =>
    markerRender.mock.calls.map(([props]) => props).filter((p) => p.center[0] === latitude).pop();

  it('magnitude key circles are drawn at the markers\' true radius', () => {
    render(<UnifiedEarthquakeMap earthquakes={events as any} />);
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-legend="magnitude"] [data-magnitude]'));
    expect(items.map((item) => item.textContent)).toEqual(['M2', 'M3', 'M4', 'M5', 'M6']);
    for (const item of items) {
      const magnitude = Number(item.dataset.magnitude);
      expect({ magnitude, r: Number(item.querySelector('circle')!.getAttribute('r')) })
        .toEqual({ magnitude, r: getMagnitudePixelRadius(magnitude) });
    }
    for (const event of events) {
      expect({ id: event.id, radius: lastDrawn(event.latitude).radius }).toEqual({ id: event.id, radius: getMagnitudePixelRadius(event.magnitude) });
    }
  });

  it.each([false, true])('depth (the default) keys every marker colour with a class containing its depth (dark mode %s)', async (isDark) => {
    mockIsDark = isDark;
    render(<UnifiedEarthquakeMap earthquakes={events as any} />);
    await act(async () => {});
    expect(screen.getByLabelText('Depth')).toBeChecked();
    const segments = Array.from(document.querySelectorAll<HTMLElement>('[data-legend="depth"] [data-depth-class]'))
      .map((segment) => ({ color: segment.style.backgroundColor, label: segment.dataset.depthClass! }));
    expect(segments.map(({ label }) => label)).toEqual(['< 15 km', '15–40 km', '40–70 km', '70–150 km', '150–300 km', '≥ 300 km']);
    for (const event of events) {
      const fill = lastDrawn(event.latitude).pathOptions.fillColor;
      expect({ depth: event.depth, fill }).toEqual({ depth: event.depth, fill: getEarthquakeColor(event.depth, isDark) });
      if (event.depth === null) {
        const unknown = document.querySelector<HTMLElement>('[data-legend="depth"] [data-swatch="unknown depth"]')!;
        expect(unknown.style.backgroundColor).toBe(rgb(fill));
        continue;
      }
      const row = segments.find(({ color }) => color === rgb(fill));
      const [min, max] = labelRange(row!.label)!;
      expect({ depth: event.depth, label: row!.label, inside: event.depth >= min && event.depth < max })
        .toEqual({ depth: event.depth, label: row!.label, inside: true });
    }
    expect(document.querySelector('[data-legend="depth"]')).toHaveTextContent('shallow < 70 · intermediate 70–300 · deep ≥ 300 km');
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
