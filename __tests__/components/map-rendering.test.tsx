import '@testing-library/jest-dom';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';
import { MapBoundsObserver } from '@/components/catalogues/MapView';
import NZEarthquakeMap from '@/components/visualize/NZEarthquakeMap';
import { EnhancedMapView } from '@/components/advanced-viz/EnhancedMapView';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import { useViewportFilteredEvents, useMapViewport } from '@/hooks/use-map-viewport';

const listeners: Record<string, Set<() => void>> = {};
let west = 170;
let east = 190;
const map = {
  getSize: () => ({ x: 800, y: 600 }),
  getZoom: () => 0,
  getBounds: () => ({
    getNorth: () => -30, getSouth: () => -50, getWest: () => west, getEast: () => east,
    getCenter: () => ({ lat: -40, lng: (west + east) / 2 }),
  }),
  on: jest.fn((name: string, callback: () => void) => { (listeners[name] ??= new Set()).add(callback); }),
  off: jest.fn((name: string, callback: () => void) => { listeners[name]?.delete(callback); }),
};
const markerRender = jest.fn();
jest.mock('react-leaflet-draw', () => ({ EditControl: () => null }));
jest.mock('@/lib/fault-data', () => ({ loadFaultData: jest.fn().mockResolvedValue(null) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({ UncertaintyEllipse: () => null }));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({ BeachBallMarker: () => null }));
jest.mock('@/components/advanced-viz/StationMarker', () => ({ StationMarker: () => null }));
jest.mock('react-leaflet', () => ({
  useMap: () => map,
  MapContainer: ({ children }: any) => <div>{children}</div>,
  Circle: (props: any) => <button data-testid="marker" onClick={props.eventHandlers?.click}>Event</button>,
  CircleMarker: (props: any) => {
    markerRender(props);
    return <button data-testid="marker" data-longitude={props.center[1]} onClick={props.eventHandlers.click}>Event</button>;
  },
  Popup: ({ children, position }: any) => <div data-testid="popup" data-longitude={position[1]}>{children}</div>,
}));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }) }));

const events = [
  { id: 'a', latitude: -41, longitude: 175, magnitude: 3, depth: 10, time: '2024-01-01' },
  { id: 'b', latitude: -41, longitude: -175, magnitude: 6, depth: 20, time: '2024-01-02' },
  { id: 'c', latitude: -41, longitude: 0, magnitude: 4, depth: 0, time: '2024-01-03' },
];

beforeEach(() => { west = 170; east = 190; markerRender.mockClear(); });

describe('map rendering regressions', () => {
  it('culls offscreen events, orders larger events on top, and anchors popups in the visible world', () => {
    const onEventClick = jest.fn();
    render(<EarthquakeMarkerLayer events={events} getColor={() => '#ff0000'} opacity={0.75} onEventClick={onEventClick} />);
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute('data-longitude', '175');
    expect(markers[1]).toHaveAttribute('data-longitude', '185');
    fireEvent.click(markers[1]);
    expect(onEventClick).toHaveBeenCalledWith(events[1], [-41, 185]);
  });

  it('opens one popup on demand without rebuilding markers and clears it when data changes', () => {
    const props = { events, sampleSize: Infinity, onSampleSizeChange: jest.fn() };
    const { rerender } = render(<EarthquakeCircleMap {...props} />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    markerRender.mockClear();
    fireEvent.click(screen.getAllByTestId('marker')[1]);
    expect(screen.getByTestId('popup')).toHaveAttribute('data-longitude', '185');
    expect(screen.getByTestId('popup')).toHaveTextContent('6.0');
    expect(markerRender).not.toHaveBeenCalled();
    rerender(<EarthquakeCircleMap {...props} events={[events[0]]} />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
  });

  it('does not color missing depth as a shallow earthquake', () => {
    render(<EarthquakeCircleMap events={[{ ...events[0], depth: null }]} sampleSize={1000} onSampleSizeChange={jest.fn()} />);
    expect(markerRender.mock.calls[0][0].pathOptions.fillColor).toBe('#6b7280');
  });

  it('selects from the new viewport after panning instead of a fixed global sample', () => {
    jest.useFakeTimers();
    try {
      render(<EarthquakeCircleMap events={events} sampleSize={1} onSampleSizeChange={jest.fn()} />);
      expect(screen.getAllByTestId('marker')).toHaveLength(1);
      expect(screen.getByTestId('marker')).toHaveAttribute('data-longitude', '185');
      west = -10; east = 10;
      act(() => {
        listeners.moveend.forEach(callback => callback());
        jest.advanceTimersByTime(150);
      });
      expect(screen.getAllByTestId('marker')).toHaveLength(1);
      expect(screen.getByTestId('marker')).toHaveAttribute('data-longitude', '0');
    } finally { jest.useRealTimers(); }
  });

  it('keeps an open popup when map detail changes without replacing catalogue data', () => {
    const props = { events, onSampleSizeChange: jest.fn() };
    const { rerender } = render(<EarthquakeCircleMap {...props} sampleSize="auto" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Automatic');
    fireEvent.click(screen.getAllByTestId('marker')[1]);
    rerender(<EarthquakeCircleMap {...props} sampleSize={1} />);
    expect(screen.getByTestId('popup')).toHaveTextContent('6.0');
  });

  it('reopens repeated clicks and clears selection when the map identity changes', () => {
    const { result, rerender } = renderHook(({ mapKey }) => useEventMapPopup(events, mapKey), { initialProps: { mapKey: 'one' } });
    act(() => result.current.onEventClick(events[0], [-41, 175]));
    const sequence = result.current.activePopup!.seq;
    act(() => result.current.onEventClick(events[0], [-41, 175]));
    expect(result.current.activePopup!.seq).toBeGreaterThan(sequence);
    rerender({ mapKey: 'two' });
    expect(result.current.activePopup).toBeNull();
  });

  it.each(['regional', 'advanced'])('mounts popup details only for the clicked event in the %s map', async variant => {
    const numericEvents = events.map((event, id) => ({ ...event, id }));
    const { rerender } = render(variant === 'regional'
      ? <NZEarthquakeMap earthquakes={numericEvents} />
      : <EnhancedMapView events={numericEvents} />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('marker')[0]);
    expect(screen.getAllByTestId('popup')).toHaveLength(1);
    rerender(variant === 'regional' ? <NZEarthquakeMap earthquakes={[]} /> : <EnhancedMapView events={[]} />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    await act(async () => {});
  });

  it('subscribes to bounds inside the mounted map and debounces notifications', () => {
    jest.useFakeTimers();
    try {
      const onBoundsChange = jest.fn();
      const { unmount } = render(<MapBoundsObserver onBoundsChange={onBoundsChange} />);
      expect(onBoundsChange).toHaveBeenCalledTimes(1);
      act(() => {
        listeners.moveend.forEach(callback => callback());
        listeners.moveend.forEach(callback => callback());
        jest.advanceTimersByTime(300);
      });
      expect(onBoundsChange).toHaveBeenCalledTimes(2);
      unmount();
      expect(listeners.moveend.size).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('reports total visible events before applying a display cap', () => {
    const { result } = renderHook(() => useViewportFilteredEvents({ events, maxEvents: 1 }));
    expect(result.current.events).toEqual([events[1]]);
    expect(result.current.totalInViewport).toBe(2);
    expect(result.current.zoom).toBe(0);
  });

  it('debounces move/zoom/resize, retains equal bounds, and cleans up pending callbacks', () => {
    jest.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() => useMapViewport());
      const initial = result.current.bounds;
      act(() => {
        for (const name of ['moveend', 'zoomend', 'resize']) listeners[name]?.forEach(callback => callback());
        jest.advanceTimersByTime(150);
      });
      expect(result.current.bounds).toBe(initial);
      west = -10; east = 10;
      act(() => {
        listeners.moveend.forEach(callback => callback());
        jest.advanceTimersByTime(150);
      });
      expect(result.current.bounds!.west).toBe(-11);
      act(() => listeners.moveend.forEach(callback => callback()));
      unmount();
      expect(jest.getTimerCount()).toBe(0);
      for (const name of ['moveend', 'zoomend', 'resize']) expect(listeners[name].size).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});
