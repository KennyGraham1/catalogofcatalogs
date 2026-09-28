/**
 * Quality-score legends must describe the colours getQualityColor actually draws.
 *
 * Markers are coloured by getQualityColor (green >= 85, lime >= 75, yellow >= 65,
 * orange >= 45, red below), whose cut-offs are the letter-grade thresholds of
 * scoreToGrade (A+ 95, A 85, B+ 75, B 65, C 45, D 35) and paper Table 2. The legends
 * were hard-coded with the older 90/80/70/60 bands, so an orange Q = 50 marker (grade C,
 * and the popup badge says C) was keyed 'D (60-69)' and a red Q = 40 (grade D) 'F (< 60)'.
 * Expected grades and ranges below are the paper's table, not read back from the code.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UnifiedEarthquakeMap from '@/components/visualize/UnifiedEarthquakeMap';
import NZEarthquakeMap from '@/components/visualize/NZEarthquakeMap';
import { MapView } from '@/components/catalogues/MapView';
import { EnhancedMapView } from '@/components/advanced-viz/EnhancedMapView';
import { QUALITY_LEGEND_BANDS } from '@/components/map/MapLegend';
import { calculateQualityScore, getQualityColor, metricsFromEvent, scoreToGrade } from '@/lib/quality-scoring';

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
  FeatureGroup: ({ children }: any) => <div>{children}</div>,
  Polyline: () => null,
  Circle: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
  CircleMarker: (props: any) => { markerRender(props); return <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>; },
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));
jest.mock('react-leaflet-draw', () => ({ EditControl: () => null }));
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn().mockResolvedValue(null) }));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({ UncertaintyEllipse: () => null }));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({ BeachBallMarker: () => null }));
jest.mock('@/components/advanced-viz/StationMarker', () => ({ StationMarker: () => null }));

/** Paper Table 2 grouped by marker colour (publication tab:quality_grades). */
const TABLE_2_BANDS = [
  { color: '#22c55e', grades: ['A+', 'A'], min: 85, max: 100 },
  { color: '#84cc16', grades: ['B+'], min: 75, max: 84 },
  { color: '#eab308', grades: ['B'], min: 65, max: 74 },
  { color: '#f97316', grades: ['C'], min: 45, max: 64 },
  { color: '#ef4444', grades: ['D', 'F'], min: 0, max: 44 },
];

/** Every band edge of both functions, plus the scores quoted in the review. */
const EDGE_SCORES = [0, 34, 35, 40, 44, 45, 50, 60, 64, 65, 70, 74, 75, 80, 84, 85, 86, 94, 95, 100];

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** The colour swatches of the legend card headed `heading`, with the label beside each. */
function legendRows(heading: string) {
  const card = screen.getByRole('heading', { name: heading }).parentElement!.parentElement!;
  return Array.from(card.querySelectorAll<HTMLElement>('[style*="background-color"]')).map((swatch) => ({
    color: swatch.style.backgroundColor,
    label: swatch.nextElementSibling?.textContent ?? '',
  }));
}

/** Whether a label such as 'C (45–64)', 'A+ / A (≥ 85)' or 'F (< 60)' covers `score`. */
function labelCovers(label: string, score: number): boolean {
  const range = label.match(/\((?:(≥|<)\s*(\d+)|(\d+)\s*[-–]\s*(\d+))\)/);
  if (!range) return false;
  if (range[1] === '<') return score < Number(range[2]);
  if (range[1] === '≥') return score >= Number(range[2]);
  return score >= Number(range[3]) && score <= Number(range[4]);
}

const labelGrades = (label: string) => label.split('(')[0].split('/').map((grade) => grade.trim());

function expectLegendMatchesMarkers(rows: Array<{ color: string; label: string }>) {
  for (const score of EDGE_SCORES) {
    const row = rows.find(({ color }) => color === rgb(getQualityColor(score)));
    expect({ score, label: row?.label }).toEqual({ score, label: expect.any(String) });
    expect({ score, grades: labelGrades(row!.label) }).toEqual({ score, grades: expect.arrayContaining([scoreToGrade(score)]) });
    expect({ score, label: row!.label, covers: labelCovers(row!.label, score) }).toEqual({ score, label: row!.label, covers: true });
  }
}

const events = [
  // Well-constrained, reviewed solution
  { id: 1, latitude: -41.3, longitude: 174.8, magnitude: 4.1, depth: 22, time: '2024-01-15T20:00:00Z',
    azimuthal_gap: 45, used_station_count: 40, used_phase_count: 80, standard_error: 0.2,
    horizontal_uncertainty: 1, magnitude_uncertainty: 0.1, magnitude_station_count: 20,
    evaluation_mode: 'manual', evaluation_status: 'reviewed' },
  // Poorly constrained automatic solution
  { id: 2, latitude: -38.5, longitude: 176.1, magnitude: 2.9, depth: 5, time: '2024-01-16T03:00:00Z',
    azimuthal_gap: 250, used_station_count: 4, used_phase_count: 6, standard_error: 1.5,
    evaluation_mode: 'automatic', evaluation_status: 'preliminary' },
  // No quality metadata at all
  { id: 3, latitude: -44.0, longitude: -176.5, magnitude: 3.5, depth: 12, time: '2024-01-17T12:00:00Z' },
];

beforeEach(() => {
  markerRender.mockClear();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ faults: [], count: 0 }) })) as unknown as typeof fetch;
});

describe('quality legend bands are derived from getQualityColor and scoreToGrade', () => {
  it('reproduces paper Table 2 grouped by marker colour', () => {
    expect(QUALITY_LEGEND_BANDS.map(({ color, grades, min, max }) => ({ color, grades, min, max }))).toEqual(TABLE_2_BANDS);
    expect(QUALITY_LEGEND_BANDS.map(({ label }) => label)).toEqual([
      'A+ / A (≥ 85)', 'B+ (75–84)', 'B (65–74)', 'C (45–64)', 'D / F (< 45)',
    ]);
  });

  it('agrees with the marker colour and the badge grade on both sides of every band edge', () => {
    for (const band of QUALITY_LEGEND_BANDS) {
      expect(getQualityColor(band.min)).toBe(band.color);
      expect(getQualityColor(band.max)).toBe(band.color);
      if (band.min > 0) expect(getQualityColor(band.min - 1)).not.toBe(band.color);
      if (band.max < 100) expect(getQualityColor(band.max + 1)).not.toBe(band.color);
      expect(band.grades).toContain(scoreToGrade(band.min));
      expect(band.grades).toContain(scoreToGrade(band.max));
    }
  });
});

describe('every map legend keys the quality colours with the real grades', () => {
  it('analytics map (UnifiedEarthquakeMap), after choosing Color By -> Quality', async () => {
    render(<UnifiedEarthquakeMap earthquakes={events} />);
    fireEvent.click(screen.getByLabelText('Quality'));
    await act(async () => {});
    const rows = legendRows('Quality Score');
    expectLegendMatchesMarkers(rows);

    // The plotted markers and the legend agree for the events actually on the map.
    for (const event of events) {
      const q = calculateQualityScore(metricsFromEvent(event)).overall;
      const drawn = markerRender.mock.calls.map(([props]) => props).filter((props) => props.center[0] === event.latitude).pop();
      expect(drawn.pathOptions.fillColor).toBe(getQualityColor(q));
      const row = rows.find(({ color }) => color === rgb(drawn.pathOptions.fillColor))!;
      expect(labelGrades(row.label)).toContain(scoreToGrade(q));
      expect(labelCovers(row.label, q)).toBe(true);
    }
  });

  it('catalogue MapView', async () => {
    render(<MapView events={events as any} />);
    fireEvent.click(screen.getByLabelText('Quality'));
    await act(async () => {});
    expectLegendMatchesMarkers(legendRows('Quality Score'));
  });

  it('regional NZEarthquakeMap', async () => {
    render(<NZEarthquakeMap earthquakes={events as any} colorBy="quality" />);
    await act(async () => {});
    expectLegendMatchesMarkers(legendRows('Quality Score'));
  });

  it('EnhancedMapView with Quality Colors switched on', async () => {
    render(<EnhancedMapView events={events} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Quality Colors' }));
    await act(async () => {});
    expectLegendMatchesMarkers(legendRows('Quality Score'));
  });
});
