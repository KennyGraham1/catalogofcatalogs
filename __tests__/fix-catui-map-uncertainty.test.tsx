/**
 * #57: the catalogue map page's "With Uncertainty" stat only counted latitude_uncertainty /
 * longitude_uncertainty, which the GeoNet importer and the USGS CSV/QuakeML paths never
 * write (they populate horizontal_uncertainty / depth_uncertainty, and QuakeML's
 * OriginUncertainty error ellipse as min/max_horizontal_uncertainty instead) - so those
 * catalogues showed "With Uncertainty: 0%" even when every event carried real uncertainty
 * data. Fixed to count any reported location uncertainty field, matching the definition
 * lib/validation.ts already uses for the upload quality report.
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'cat-1' }) }));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicStub() { return null; },
}));

import CatalogueMapPage from '@/app/catalogues/[id]/map/page';

const CATALOGUE = { id: 'cat-1', name: 'Test catalogue', event_count: 5, status: 'complete', created_at: '2024-01-01T00:00:00Z' };

/** One event per uncertainty-reporting shape a real import path produces. */
const EVENTS = [
  { id: 'geonet', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4, horizontal_uncertainty: 3.2 },
  { id: 'ellipse', time: '2024-01-02T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4, min_horizontal_uncertainty: 1.1, max_horizontal_uncertainty: 4.4 },
  { id: 'latlon', time: '2024-01-03T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4, latitude_uncertainty: 0.02, longitude_uncertainty: 0.03 },
  { id: 'depth-only', time: '2024-01-04T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4, depth_uncertainty: 2.5 },
  { id: 'none', time: '2024-01-05T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4 },
];

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const originalFetch = global.fetch;
beforeEach(() => {
  (global as any).fetch = jest.fn((input: any) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return Promise.resolve(jsonResponse([CATALOGUE]));
    if (url.pathname === '/api/catalogues/cat-1/events') {
      return Promise.resolve(jsonResponse({
        data: EVENTS,
        pagination: { hasMore: false, nextCursor: null, prevCursor: null, limit: 500 },
      }));
    }
    throw new Error(`Unexpected fetch: ${url.pathname}`);
  });
});
afterEach(() => {
  cleanup();
  (global as any).fetch = originalFetch;
});

describe('#57 catalogue map page "With Uncertainty" stat', () => {
  it('counts horizontal, error-ellipse, lat/lon and depth uncertainty - not just lat/lon', async () => {
    render(<CatalogueMapPage />);
    await waitFor(() => expect(screen.getByText('With Uncertainty')).toBeInTheDocument());
    // 4 of 5: only "none" lacks every uncertainty field. Before the fix this read "2"
    // (latlon + depth-only), and a pure-GeoNet or pure-USGS catalogue would have read "0".
    const card = screen.getByText('With Uncertainty').closest('div.pb-2') as HTMLElement;
    expect(within(card).getByText('4')).toBeInTheDocument();
  });
});
