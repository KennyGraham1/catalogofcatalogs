/**
 * F2 (map features): two new map colour modes described by the paper (sec:viz: "colour can
 * encode focal depth, quality grade, or source catalogue") plus the azimuthal-gap ramp the
 * station-coverage panel needs. Both UnifiedEarthquakeMap (the live analytics map) and
 * EarthquakeCircleMap (the catalogue-page/dashboard map) get "Azimuthal Gap" and "Source
 * Catalogue" colour modes, and every legend swatch must come from the exact function that
 * coloured the marker of the same colour (MapLegend's whole reason to exist) — not a
 * separately hard-coded colour.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UnifiedEarthquakeMap from '@/components/visualize/UnifiedEarthquakeMap';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';
import { getAzimuthalGapColor } from '@/lib/uncertainty-utils';
import { getQualityColor } from '@/lib/quality-scoring';

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
jest.mock('react-leaflet', () => ({
  useMap: () => map,
  MapContainer: ({ children }: any) => <div>{children}</div>,
  GeoJSON: () => null,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  CircleMarker: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
}));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }) }));
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn().mockResolvedValue(null) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({ UncertaintyEllipse: () => null }));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({ BeachBallMarker: () => null }));

beforeEach(() => markerRender.mockClear());

/**
 * Colour the marker drawn at (latitude, longitude), from the MOST RECENT render. CircleMarker
 * carries no event id (see components/map/EarthquakeMarkerLayer.tsx), only `center` and
 * `pathOptions`, so matching by position is the only way to identify "this event's marker"
 * from the mock's captured props — and since the same position is captured again on every
 * re-render (a colour-mode switch re-renders, it doesn't remount), the LAST matching call is
 * the current one; `.find()` would return the stale mount-time call instead. None of this
 * file's fixtures sit near the antimeridian, so positionInMapWorld leaves (lat, lon) unchanged.
 */
function colorAt(latitude: number, longitude: number) {
  const matches = markerRender.mock.calls.filter(([props]) => props.center?.[0] === latitude && props.center?.[1] === longitude);
  return matches[matches.length - 1]?.[0]?.pathOptions?.color;
}

/** jsdom normalises an inline backgroundColor style (hex or hsl alike) to "rgb(r, g, b)" when
 *  read back from `.style`, but a colour captured straight from a React prop (colorAt above)
 *  keeps whatever string the colour function returned. Round-tripping the expected colour
 *  through a real element's style makes the two comparable regardless of source format. */
function domColor(css: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = css;
  return probe.style.backgroundColor;
}

/**
 * Every swatch (inline background-color) inside the legend Card headed `heading`, with the
 * label text beside it. Mirrors __tests__/fix-maps-quality-legend.test.tsx's helper: the
 * card also holds the magnitude-size key below the colour legend, which is harmless noise
 * for a "this colour maps to this label" lookup.
 */
function legendRows(heading: string) {
  const card = screen.getByRole('heading', { name: heading }).parentElement!.parentElement!;
  return Array.from(card.querySelectorAll<HTMLElement>('[style*="background-color"]')).map((swatch) => ({
    color: swatch.style.backgroundColor,
    label: swatch.nextElementSibling?.textContent ?? '',
  }));
}

describe('UnifiedEarthquakeMap azimuthal-gap colour mode', () => {
  const events = [
    { id: 'a', latitude: -41.1, longitude: 174.1, magnitude: 4, depth: 10, time: '2024-01-01T00:00:00Z', azimuthal_gap: 40 },
    { id: 'b', latitude: -41.2, longitude: 174.2, magnitude: 4, depth: 10, time: '2024-01-01T00:00:00Z', azimuthal_gap: 200 },
    { id: 'c', latitude: -41.3, longitude: 174.3, magnitude: 4, depth: 10, time: '2024-01-01T00:00:00Z', azimuthal_gap: null },
  ];

  it('colours every marker with getAzimuthalGapColor of its own gap', async () => {
    render(<UnifiedEarthquakeMap earthquakes={events} colorBy="azimuthal-gap" />);
    await act(async () => {});
    expect(colorAt(-41.1, 174.1)).toBe(getAzimuthalGapColor(40));
    expect(colorAt(-41.2, 174.2)).toBe(getAzimuthalGapColor(200));
    expect(colorAt(-41.3, 174.3)).toBe(getAzimuthalGapColor(null));
  });

  it('switching the radio to Azimuthal Gap re-colours markers and swaps in the matching legend', async () => {
    render(<UnifiedEarthquakeMap earthquakes={events} colorBy="depth" />);
    fireEvent.click(screen.getByLabelText('Azimuthal Gap'));
    await act(async () => {});
    expect(colorAt(-41.2, 174.2)).toBe(getAzimuthalGapColor(200));
    const rows = legendRows('Azimuthal Gap');
    // Every tick swatch in the legend is literally getAzimuthalGapColor's own output.
    for (const gap of [0, 60, 120, 180, 270, 360]) {
      expect(rows.some(row => row.color === domColor(getAzimuthalGapColor(gap)))).toBe(true);
    }
  });
});

describe('UnifiedEarthquakeMap source-catalogue colour mode', () => {
  const events = [
    { id: 'a1', latitude: -41.1, longitude: 174.1, magnitude: 4, depth: 10, time: '2024-01-01T00:00:00Z', catalogue: 'GeoNet Archive' },
    { id: 'a2', latitude: -41.2, longitude: 174.2, magnitude: 4, depth: 10, time: '2024-01-01T00:00:00Z', catalogue: 'GeoNet Archive' },
    { id: 'b1', latitude: -41.3, longitude: 174.3, magnitude: 4, depth: 10, time: '2024-01-01T00:00:00Z', catalogue: 'ISC Bulletin' },
  ];

  it('gives events from the same catalogue the same colour and different catalogues different colours', async () => {
    render(<UnifiedEarthquakeMap earthquakes={events} colorBy="source-catalogue" />);
    await act(async () => {});
    expect(colorAt(-41.1, 174.1)).toBe(colorAt(-41.2, 174.2));
    expect(colorAt(-41.1, 174.1)).not.toBe(colorAt(-41.3, 174.3));
  });

  it('legend lists each catalogue with the exact colour used on its markers', async () => {
    render(<UnifiedEarthquakeMap earthquakes={events} colorBy="source-catalogue" />);
    await act(async () => {});
    const rows = legendRows('Source Catalogue');
    expect(rows.find(r => r.label === 'GeoNet Archive')?.color).toBe(domColor(colorAt(-41.1, 174.1)));
    expect(rows.find(r => r.label === 'ISC Bulletin')?.color).toBe(domColor(colorAt(-41.3, 174.3)));
  });

  it('resolves a merged row by its selected source_events member, not the pooled catalogue field', async () => {
    const merged = [
      { id: 'm1', latitude: -41.1, longitude: 174.1, magnitude: 4, depth: 10, time: '2024-01-01T00:00:00Z',
        catalogue: 'Combined NZ Catalogue',
        source_catalogue_ids: ['cat-geonet', 'cat-isc'],
        source_events: JSON.stringify([
          { catalogueId: 'cat-geonet', source: 'GeoNet', selected: true },
          { catalogueId: 'cat-isc', source: 'ISC', selected: false },
        ]) },
    ];
    render(<UnifiedEarthquakeMap earthquakes={merged} colorBy="source-catalogue" />);
    await act(async () => {});
    const rows = legendRows('Source Catalogue');
    expect(rows.find(r => r.label === 'GeoNet')).toBeDefined();
    expect(rows.find(r => r.label === 'Combined NZ Catalogue')).toBeUndefined();
  });
});

describe('EarthquakeCircleMap colour-mode selector', () => {
  const events = [
    { id: 1, latitude: -41.1, longitude: 174.1, magnitude: 4, depth: 5, time: '2024-01-01T00:00:00Z', azimuthal_gap: 30, quality_score: 90, quality_grade: 'A' },
    { id: 2, latitude: -41.2, longitude: 174.2, magnitude: 4, depth: 250, time: '2024-01-01T00:00:00Z', azimuthal_gap: 220, quality_score: 40, quality_grade: 'F' },
  ];
  const noop = () => {};

  it('defaults to depth colouring, unchanged from before this feature (least disruptive default)', async () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={noop} />);
    await act(async () => {});
    expect(screen.getByLabelText('Depth')).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Depth (Color)' })).toBeInTheDocument();
  });

  it('Azimuthal Gap mode colours markers with getAzimuthalGapColor and shows the matching legend', async () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={noop} />);
    fireEvent.click(screen.getByLabelText('Azimuthal Gap'));
    await act(async () => {});
    expect(colorAt(-41.1, 174.1)).toBe(getAzimuthalGapColor(30));
    expect(colorAt(-41.2, 174.2)).toBe(getAzimuthalGapColor(220));
    expect(screen.getByRole('heading', { name: 'Azimuthal Gap' })).toBeInTheDocument();
  });

  it('Quality mode prefers the stored quality_score/quality_grade over recomputing it', async () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={noop} />);
    fireEvent.click(screen.getByLabelText('Quality'));
    await act(async () => {});
    // event 1 stores quality_score 90 directly; a correct implementation must colour it
    // getQualityColor(90) without recomputing from (mostly absent) metrics.
    expect(colorAt(-41.1, 174.1)).toBe(getQualityColor(90));
    expect(colorAt(-41.2, 174.2)).toBe(getQualityColor(40));
  });

  it('Source Catalogue mode is offered and gives every event a colour with a legend entry', async () => {
    const merged = [
      { id: 10, latitude: -41.1, longitude: 174.1, magnitude: 4, depth: 5, time: '2024-01-01T00:00:00Z', source_catalogue_ids: ['cat-x'] },
      { id: 11, latitude: -41.2, longitude: 174.2, magnitude: 4, depth: 5, time: '2024-01-01T00:00:00Z', source_catalogue_ids: ['cat-y'] },
    ];
    render(<EarthquakeCircleMap events={merged} sampleSize="auto" onSampleSizeChange={noop} catalogueNames={{ 'cat-x': 'Catalogue X', 'cat-y': 'Catalogue Y' }} />);
    fireEvent.click(screen.getByLabelText('Source Catalogue'));
    await act(async () => {});
    const rows = legendRows('Source Catalogue');
    expect(rows.find(r => r.label === 'Catalogue X')?.color).toBe(domColor(colorAt(-41.1, 174.1)));
    expect(rows.find(r => r.label === 'Catalogue Y')?.color).toBe(domColor(colorAt(-41.2, 174.2)));
    expect(colorAt(-41.1, 174.1)).not.toBe(colorAt(-41.2, 174.2));
  });
});
