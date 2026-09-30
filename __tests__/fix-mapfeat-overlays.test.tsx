/**
 * F2 (map features): UnifiedEarthquakeMap (the live analytics map) gains two on-demand
 * overlays described by the paper (sec:viz) but previously only prototyped in the
 * unmounted EnhancedMapView: uncertainty ellipses and focal-mechanism beach balls.
 *
 *  - Both are off by default (opt-in extras), toggled by Switches in the Style panel's
 *    "Overlays" section.
 *  - The beach-ball toggle only exists when the `showFocalMechanisms` prop is true (the
 *    analytics page passes true); with it false/omitted, no toggle renders and no beach
 *    ball is ever drawn, regardless of what the events contain.
 *  - Overlays are drawn only for the plotted events and further capped (largest
 *    magnitude first) so a big catalogue cannot stall the browser with thousands of
 *    64-point polygons or rasterised icons: 150 ellipses (a note under the switch reports
 *    the cap) and, in mechanisms mode, 300 beach balls (the status chip reports it).
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UnifiedEarthquakeMap from '@/components/visualize/UnifiedEarthquakeMap';

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
const ellipseRender = jest.fn();
const beachBallRender = jest.fn();
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
  UncertaintyEllipse: (props: any) => { ellipseRender(props); return null; },
}));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({
  ...jest.requireActual('@/components/advanced-viz/BeachBallMarker'),
  BeachBallMarker: (props: any) => { beachBallRender(props); return null; },
}));

beforeEach(() => {
  markerRender.mockClear();
  ellipseRender.mockClear();
  beachBallRender.mockClear();
});

/**
 * Matches the innermost element whose full text (its own text plus any inline markup
 * like <strong>) equals `target`, so a message split across tags can be asserted on
 * without also matching every ancestor that happens to contain the same concatenated text.
 */
function exactTextNode(target: string) {
  return (_content: string, element: Element | null) => {
    if (!element) return false;
    const hasText = (node: Element) => node.textContent === target;
    return hasText(element) && Array.from(element.children).every(child => !hasText(child));
  };
}

const mechanisms = JSON.stringify([
  { publicID: 'smi:a/fm/first', nodalPlane1: { strike: 0, dip: 45, rake: 90 }, nodalPlane2: { strike: 180, dip: 45, rake: 90 } },
  { publicID: 'smi:a/fm/preferred', nodalPlane1: { strike: 0, dip: 90, rake: 0 }, nodalPlane2: { strike: 90, dip: 90, rake: 180 } },
]);

const baseEvent = {
  id: 'e1', latitude: -41.3, longitude: 174.8, magnitude: 5.1, depth: 12, time: '2024-01-15T20:00:00Z',
  horizontal_uncertainty: 10,
  focal_mechanisms: mechanisms,
  preferred_focal_mechanism_id: 'smi:a/fm/preferred',
};

describe('uncertainty-ellipse overlay toggle', () => {
  it('is off by default: no ellipse is drawn until the user asks for it', async () => {
    render(<UnifiedEarthquakeMap earthquakes={[baseEvent]} />);
    await act(async () => {});
    expect(ellipseRender).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Uncertainty ellipses' })).toHaveAttribute('aria-checked', 'false');
  });

  it('draws an ellipse for a plotted event once switched on, using the reported circular uncertainty', async () => {
    render(<UnifiedEarthquakeMap earthquakes={[baseEvent]} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Uncertainty ellipses' }));
    await act(async () => {});
    expect(ellipseRender).toHaveBeenCalledTimes(1);
    const [{ ellipse, eventId }] = ellipseRender.mock.calls[0];
    expect(eventId).toBe('e1');
    expect(ellipse.source).toBe('horizontal-circle');
    expect(ellipse.center).toEqual([-41.3, 174.8]);
  });

  it('carries confidence_level (C16) through to the drawn ellipse when the event has it', async () => {
    render(<UnifiedEarthquakeMap earthquakes={[{ ...baseEvent, confidence_level: 90 }]} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Uncertainty ellipses' }));
    await act(async () => {});
    const [{ ellipse }] = ellipseRender.mock.calls[0];
    expect(ellipse.confidenceLevel).toBe(90);
  });

  it('draws nothing for an event with no location-uncertainty fields at all', async () => {
    const noUncertainty = { ...baseEvent, horizontal_uncertainty: null, focal_mechanisms: null };
    render(<UnifiedEarthquakeMap earthquakes={[noUncertainty]} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Uncertainty ellipses' }));
    await act(async () => {});
    expect(ellipseRender).not.toHaveBeenCalled();
  });
});

describe('focal-mechanism beach-ball overlay, gated by showFocalMechanisms', () => {
  it('offers no toggle and draws nothing when showFocalMechanisms is not passed (default false)', async () => {
    render(<UnifiedEarthquakeMap earthquakes={[baseEvent]} />);
    await act(async () => {});
    expect(screen.queryByRole('switch', { name: 'Focal mechanisms' })).toBeNull();
    expect(beachBallRender).not.toHaveBeenCalled();
  });

  it('offers the toggle when showFocalMechanisms is true, off until switched on', async () => {
    render(<UnifiedEarthquakeMap earthquakes={[baseEvent]} showFocalMechanisms />);
    await act(async () => {});
    expect(screen.getByRole('switch', { name: 'Focal mechanisms' })).toHaveAttribute('aria-checked', 'false');
    expect(beachBallRender).not.toHaveBeenCalled();
  });

  it('draws the preferred mechanism (preferred_focal_mechanism_id), not just the first stored one, once switched on', async () => {
    render(<UnifiedEarthquakeMap earthquakes={[baseEvent]} showFocalMechanisms />);
    fireEvent.click(screen.getByRole('switch', { name: 'Focal mechanisms' }));
    await act(async () => {});
    expect(beachBallRender).toHaveBeenCalledTimes(1);
    const [{ mechanism, eventId }] = beachBallRender.mock.calls[0];
    expect(eventId).toBe('e1');
    expect(mechanism.nodalPlane1).toEqual({ strike: 0, dip: 90, rake: 0 });
  });

  it('never draws a beach ball for an event with no resolvable nodal plane', async () => {
    const noPlane = { ...baseEvent, focal_mechanisms: JSON.stringify([{ publicID: 'x' }]) };
    render(<UnifiedEarthquakeMap earthquakes={[noPlane]} showFocalMechanisms />);
    fireEvent.click(screen.getByRole('switch', { name: 'Focal mechanisms' }));
    await act(async () => {});
    expect(beachBallRender).not.toHaveBeenCalled();
  });
});

describe('overlay cap (largest magnitude first) and its visible note', () => {
  // 151 events, one more than the map's ellipse cap, so exactly one — the smallest
  // magnitude — must be dropped from the ellipses (beach balls are capped at 300).
  const many = Array.from({ length: 151 }, (_, i) => ({
    id: `m${i + 1}`,
    latitude: -41 + i * 0.001,
    longitude: 174 + i * 0.001,
    magnitude: i + 1, // m151 has the largest magnitude, m1 the smallest
    depth: 10,
    time: '2024-01-15T20:00:00Z',
    horizontal_uncertainty: 5,
    focal_mechanisms: mechanisms,
  }));

  it('draws ellipses for only the cap-many largest-magnitude events and says so', async () => {
    render(<UnifiedEarthquakeMap earthquakes={many} showFocalMechanisms />);
    fireEvent.click(screen.getByRole('switch', { name: 'Uncertainty ellipses' }));
    await act(async () => {});

    // Every render of a mounted-but-not-memoized overlay re-invokes its mock, so the number
    // of DISTINCT event ids drawn (not the raw call count, which accumulates across
    // re-renders) is what corresponds to "how many overlays are on the map".
    const drawnEllipseIds = new Set(ellipseRender.mock.calls.map(([props]) => props.eventId));
    expect(drawnEllipseIds.size).toBe(150);
    expect(drawnEllipseIds).toContain('m151'); // largest magnitude: always kept
    expect(drawnEllipseIds).not.toContain('m1'); // smallest magnitude: dropped by the cap

    // The truncation note under the switch names the cap and the true total so a user
    // knows some events have no ellipse.
    expect(screen.getByText(exactTextNode('Showing the 150 largest of 151 plotted events.'))).toBeInTheDocument();
  });

  it('draws a beach ball for every one of them: mechanisms mode caps at 300, not the ellipse cap', async () => {
    render(<UnifiedEarthquakeMap earthquakes={many} showFocalMechanisms />);
    fireEvent.click(screen.getByRole('switch', { name: 'Focal mechanisms' }));
    await act(async () => {});

    const drawnBeachBallIds = new Set(beachBallRender.mock.calls.map(([props]) => props.eventId));
    expect(drawnBeachBallIds.size).toBe(151);
    expect(drawnBeachBallIds).toContain('m151');
    expect(drawnBeachBallIds).toContain('m1');
    // All drawn, so no "Showing N of M focal mechanisms" chip.
    expect(screen.queryByRole('status')).toBeNull();
  });
});
