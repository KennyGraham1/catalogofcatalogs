/** @jest-environment jsdom */
jest.mock('leaflet/dist/leaflet.css', () => ({}));
import React from 'react';
import { render } from '@testing-library/react';
const popupHtml: string[] = [];
jest.mock('react-leaflet', () => ({ useMap: () => ({ removeLayer: () => {} }) }));
jest.mock('@/hooks/use-map-theme', () => ({ BASE_LAYERS: [], getDefaultBaseLayer: () => 'none' }));
jest.mock('leaflet', () => ({ __esModule: true, default: {
  map: () => ({ remove: () => {}, fitBounds: () => {} }),
  control: { layers: () => ({ addTo: () => {} }) },
  layerGroup: () => { const g = { addTo: () => g, clearLayers: () => {}, addLayer: () => {} }; return g; },
  divIcon: () => ({}),
  icon: () => ({}),
  marker: () => { const m = { addTo: () => m, bindPopup: (html: string) => { popupHtml.push(html); return m; }, getLatLng: () => ({ lat: -41, lng: 174 }) }; return m; },
  latLngBounds: () => ({}),
} }));
import { DuplicateGroupMap } from '@/components/merge/DuplicateGroupMap';
// Both tests read popupHtml[0]: start each from an empty list so neither depends on the order
// the tests run in (jest --randomize ran the station test first and left its popup here).
beforeEach(() => { popupHtml.length = 0; });
it('renders catalogue names as text in Leaflet popup HTML', () => {
  const name = '<form data-audit-probe="injected"><input name="password"></form>';
  render(React.createElement(DuplicateGroupMap, { group: { id: 'g', selectedEventIndex: 0, isSuspicious: false, validationWarnings: [], events: [{ id: 'e', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 4, depth: 10, source: 'A', catalogueId: 'a', catalogueName: name }] }, catalogueColors: {} }));
  const dom = new DOMParser().parseFromString(popupHtml[0], 'text/html');
  expect(dom.querySelector('form[data-audit-probe="injected"]')).toBeNull();
  expect(dom.querySelector('input[name="password"]')).toBeNull();
  expect(dom.body.textContent).toContain(name);
});

import { StationMarker } from '@/components/advanced-viz/StationMarker';
it('renders station fields as text, including names and network codes', () => {
  const payload = '<form><input name="password"></form>';
  render(<StationMarker position={[-41, 174]} stationCode={payload} stationNetwork={payload} stationName={payload} />);
  const dom = new DOMParser().parseFromString(popupHtml[0], 'text/html');
  expect(dom.querySelector('form')).toBeNull();
  expect(dom.body.textContent).toContain(payload);
});
