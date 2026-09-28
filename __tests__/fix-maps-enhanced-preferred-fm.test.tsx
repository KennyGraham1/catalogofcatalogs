/**
 * EnhancedMapView draws the event's preferred focal mechanism (QuakeML
 * preferredFocalMechanismID, stored as preferred_focal_mechanism_id), not whichever
 * mechanism happens to be stored first. Here the first entry is a thrust (0/45/90) and
 * the preferred one a strike-slip (0/90/0).
 */
import '@testing-library/jest-dom';
import { act, render } from '@testing-library/react';
import { EnhancedMapView } from '@/components/advanced-viz/EnhancedMapView';

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
const beachBalls = jest.fn();
jest.mock('react-leaflet', () => ({
  useMap: () => map,
  MapContainer: ({ children }: any) => <div>{children}</div>,
  Polyline: () => null,
  CircleMarker: () => null,
  Popup: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }) }));
jest.mock('@/components/advanced-viz/UncertaintyEllipse', () => ({ UncertaintyEllipse: () => null }));
jest.mock('@/components/advanced-viz/StationMarker', () => ({ StationMarker: () => null }));
jest.mock('@/components/advanced-viz/BeachBallMarker', () => ({
  BeachBallMarker: (props: any) => { beachBalls(props); return null; },
}));

const mechanisms = JSON.stringify([
  { publicID: 'smi:a/fm/first', nodalPlane1: { strike: 0, dip: 45, rake: 90 }, nodalPlane2: { strike: 180, dip: 45, rake: 90 } },
  { publicID: 'smi:a/fm/preferred', nodalPlane1: { strike: 0, dip: 90, rake: 0 }, nodalPlane2: { strike: 90, dip: 90, rake: 180 } },
]);

const event = {
  id: 'e1', latitude: -41.3, longitude: 174.8, magnitude: 5.1, depth: 12, time: '2024-01-15T20:00:00Z',
  focal_mechanisms: mechanisms,
};

it('draws the mechanism named by preferred_focal_mechanism_id', async () => {
  render(<EnhancedMapView events={[{ ...event, preferred_focal_mechanism_id: 'smi:a/fm/preferred' }]} />);
  await act(async () => {});
  const drawn = beachBalls.mock.calls.map(([props]) => props).pop();
  expect(drawn.mechanism.nodalPlane1).toEqual({ strike: 0, dip: 90, rake: 0 });
});

it('falls back to the first stored mechanism when no preference is recorded', async () => {
  render(<EnhancedMapView events={[event]} />);
  await act(async () => {});
  const drawn = beachBalls.mock.calls.map(([props]) => props).pop();
  expect(drawn.mechanism.nodalPlane1).toEqual({ strike: 0, dip: 45, rake: 90 });
});
