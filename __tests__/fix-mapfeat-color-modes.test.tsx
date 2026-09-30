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
  fitBounds: jest.fn(),
  getContainer: () => document.createElement('div'),
};
const markerRender = jest.fn();
jest.mock('react-leaflet', () => ({
  useMap: () => map,
  MapContainer: ({ children }: any) => <div>{children}</div>,
  ScaleControl: () => null,
  GeoJSON: () => null,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  CircleMarker: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
}));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }) }));
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn().mockResolvedValue(null) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({
  ...jest.requireActual('@/components/advanced-viz/UncertaintyEllipse'),
  UncertaintyEllipse: () => null,
}));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({
  ...jest.requireActual('@/components/advanced-viz/BeachBallMarker'),
  BeachBallMarker: () => null,
}));

beforeEach(() => markerRender.mockClear());

/**
 * Fill colour of the marker drawn at (latitude, longitude), from the MOST RECENT render
 * (the stroke is the shared neutral outline, lib/map-style.ts markerPathOptions). CircleMarker
 * carries no event id (see components/map/EarthquakeMarkerLayer.tsx), only `center` and
 * `pathOptions`, so matching by position is the only way to identify "this event's marker"
 * from the mock's captured props — and since the same position is captured again on every
 * re-render (a colour-mode switch re-renders, it doesn't remount), the LAST matching call is
 * the current one; `.find()` would return the stale mount-time call instead. None of this
 * file's fixtures sit near the antimeridian, so positionInMapWorld leaves (lat, lon) unchanged.
 */
function colorAt(latitude: number, longitude: number) {
  const matches = markerRender.mock.calls.filter(([props]) => props.center?.[0] === latitude && props.center?.[1] === longitude);
  return matches[matches.length - 1]?.[0]?.pathOptions?.fillColor;
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

/** Rows of the new legend's source-catalogue key (components/map/MapLegend CatalogueColorKey). */
function catalogueKeyRows() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-legend="source-catalogue"] li')).map((row) => ({
    color: (row.querySelector('[data-swatch]') as HTMLElement).style.backgroundColor,
    label: row.textContent ?? '',
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

  it('switching the radio to Azimuthal gap re-colours markers and swaps in the matching legend', async () => {
    render(<UnifiedEarthquakeMap earthquakes={events} colorBy="depth" />);
    fireEvent.click(screen.getByLabelText('Azimuthal gap'));
    await act(async () => {});
    expect(colorAt(-41.2, 174.2)).toBe(getAzimuthalGapColor(200));
    expect(screen.getByRole('heading', { name: 'Azimuthal gap' })).toBeInTheDocument();
    // The gradient bar is sampled from the very function that coloured the markers.
    const bar = document.querySelector<HTMLElement>('[data-legend="azimuthal-gap"] [role="img"]')!;
    for (const gap of [0, 180, 360]) expect(bar.style.backgroundImage).toContain(getAzimuthalGapColor(gap));
    const unknown = document.querySelector<HTMLElement>('[data-legend="azimuthal-gap"] [data-swatch="unknown gap"]')!;
    expect(unknown.style.backgroundColor).toBe(domColor(colorAt(-41.3, 174.3)));
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
    const rows = catalogueKeyRows();
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
    const rows = catalogueKeyRows();
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
    expect(screen.getByRole('heading', { name: 'Depth' })).toBeInTheDocument();
    expect(document.querySelector('[data-legend="depth"]')).not.toBeNull();
  });

  it('offers only colour modes that vary with the data - magnitude is size, not colour', () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={noop} />);
    const radios = screen.getAllByRole('radio').map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent);
    expect(radios).toEqual(['Depth', 'Quality', 'Azimuthal gap', 'Source catalogue']);
  });

  it('Azimuthal Gap mode colours markers with getAzimuthalGapColor and shows the matching legend', async () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={noop} />);
    fireEvent.click(screen.getByLabelText('Azimuthal gap'));
    await act(async () => {});
    expect(colorAt(-41.1, 174.1)).toBe(getAzimuthalGapColor(30));
    expect(colorAt(-41.2, 174.2)).toBe(getAzimuthalGapColor(220));
    expect(screen.getByRole('heading', { name: 'Azimuthal gap' })).toBeInTheDocument();
    // The gradient bar is sampled from the very function that coloured the markers.
    const bar = document.querySelector<HTMLElement>('[data-legend="azimuthal-gap"] [role="img"]')!;
    for (const gap of [0, 180, 360]) expect(bar.style.backgroundImage).toContain(getAzimuthalGapColor(gap));
    expect(document.querySelector('[data-legend="azimuthal-gap"]')).toHaveTextContent(/0°.*90°.*180°.*270°.*360°/);
  });

  it('Quality mode prefers the stored quality_score/quality_grade over recomputing it', async () => {
    render(<EarthquakeCircleMap events={events} sampleSize="auto" onSampleSizeChange={noop} />);
    fireEvent.click(screen.getByLabelText('Quality'));
    await act(async () => {});
    // event 1 stores quality_score 90 directly; a correct implementation must colour it
    // getQualityColor(90) without recomputing from (mostly absent) metrics.
    expect(colorAt(-41.1, 174.1)).toBe(getQualityColor(90));
    expect(colorAt(-41.2, 174.2)).toBe(getQualityColor(40));
    // Both colours are keyed in the quality bar.
    const bands = Array.from(document.querySelectorAll<HTMLElement>('[data-quality-band]')).map((band) => band.style.backgroundColor);
    expect(bands).toEqual(expect.arrayContaining([domColor(getQualityColor(90)), domColor(getQualityColor(40))]));
  });

  it('Source Catalogue mode is offered and gives every event a colour with a legend entry', async () => {
    const merged = [
      { id: 10, latitude: -41.1, longitude: 174.1, magnitude: 4, depth: 5, time: '2024-01-01T00:00:00Z', source_catalogue_ids: ['cat-x'] },
      { id: 11, latitude: -41.2, longitude: 174.2, magnitude: 4, depth: 5, time: '2024-01-01T00:00:00Z', source_catalogue_ids: ['cat-y'] },
    ];
    render(<EarthquakeCircleMap events={merged} sampleSize="auto" onSampleSizeChange={noop} catalogueNames={{ 'cat-x': 'Catalogue X', 'cat-y': 'Catalogue Y' }} />);
    fireEvent.click(screen.getByLabelText('Source catalogue'));
    await act(async () => {});
    const rows = catalogueKeyRows();
    expect(rows.find(r => r.label === 'Catalogue X')?.color).toBe(domColor(colorAt(-41.1, 174.1)));
    expect(rows.find(r => r.label === 'Catalogue Y')?.color).toBe(domColor(colorAt(-41.2, 174.2)));
    expect(colorAt(-41.1, 174.1)).not.toBe(colorAt(-41.2, 174.2));
  });
});
