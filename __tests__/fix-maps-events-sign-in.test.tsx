/**
 * Maps are public. A signed-out visitor's catalogue map and dashboard map load the map view
 * of the events (view=map, no session needed) and draw the markers, with a plain note that
 * the event table, full event records, analytics and exports need an account - and no
 * sign-in alert over the map. A signed-in user loads the summary view exactly as before.
 *
 * A refusal for want of a session (HTTP 401) can then only come from a signed-in session
 * the server no longer honours: it still says so and offers Sign in, returning to this map,
 * never a bare "HTTP 401" over an empty map that reads as a broken map.
 */
import '@testing-library/jest-dom';
import type { ReactElement } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { SessionContext } from 'next-auth/react';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'cat-1' }), usePathname: () => '/dashboard' }));
// The page's next/dynamic map is the real EarthquakeCircleMap; Leaflet itself is stubbed.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicMap(props: Record<string, unknown>) {
    const { EarthquakeCircleMap } = require('@/components/map/EarthquakeCircleMap');
    return <EarthquakeCircleMap {...props} />;
  },
}));
const mockMap = {
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
jest.mock('react-leaflet', () => ({
  useMap: () => mockMap,
  MapContainer: ({ children }: { children: unknown }) => <div data-testid="leaflet-map">{children as never}</div>,
  ScaleControl: () => null,
  GeoJSON: () => null,
  Popup: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  CircleMarker: () => <span data-testid="marker" />,
}));
jest.mock('@/components/map/MapLayerControl', () => ({ MapLayerControl: () => null }));
jest.mock('@/hooks/use-map-theme', () => ({ useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }) }));
jest.mock('@/lib/fault-data', () => ({
  ...jest.requireActual('@/lib/fault-data'),
  loadFaultData: jest.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
}));

const CATALOGUE = { id: 'cat-1', name: 'Test catalogue', event_count: 3, status: 'complete', created_at: '2024-01-01T00:00:00Z' };
const ROWS = [3.1, 4.2, 5.3].map((magnitude, i) => ({
  id: `e${i}`, time: `2024-01-0${i + 1}T00:00:00Z`, latitude: -41 - i * 0.5, longitude: 174 + i, depth: 10 + i, magnitude,
}));

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): Reply => ({ ok: status < 400, status, json: async () => body });
const eventPage = reply(200, { data: ROWS, pagination: { hasMore: false, nextCursor: null } });

const originalFetch = global.fetch;
const originalResizeObserver = global.ResizeObserver;
let eventRequests: URLSearchParams[] = [];

/** Serve the catalogue list, and the events by view: map always, summary with `summaryStatus`. */
function serve({ summaryStatus = 200, mapReply = eventPage }: { summaryStatus?: number; mapReply?: Reply } = {}) {
  eventRequests = [];
  global.fetch = jest.fn(async (input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return reply(200, [CATALOGUE]);
    if (url.pathname === `/api/catalogues/${CATALOGUE.id}/events`) {
      eventRequests.push(url.searchParams);
      if (url.searchParams.get('view') === 'map') return mapReply;
      return summaryStatus === 200 ? eventPage : reply(summaryStatus, { error: 'Authentication required' });
    }
    return reply(404, {}); // fault traces, place names: the maps carry on without them
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  global.fetch = originalFetch;
  global.ResizeObserver = originalResizeObserver;
});

const update = async () => null;
const SESSIONS = {
  guest: { data: null, status: 'unauthenticated' as const, update },
  signedIn: { data: { user: { id: 'u1', role: 'viewer' }, expires: '2999-01-01T00:00:00Z' }, status: 'authenticated' as const, update },
  loading: { data: null, status: 'loading' as const, update },
};

function renderWithSession(ui: ReactElement, session?: keyof typeof SESSIONS) {
  return render(session ? <SessionContext.Provider value={SESSIONS[session] as never}>{ui}</SessionContext.Provider> : ui);
}

async function renderMapPage(session?: keyof typeof SESSIONS) {
  const { default: CatalogueMapPage } = await import('@/app/catalogues/[id]/map/page');
  return renderWithSession(<CatalogueMapPage />, session);
}

const views = () => eventRequests.map(params => params.get('view'));

describe('catalogue map page', () => {
  it('draws the markers for a signed-out visitor from the map view, with no sign-in alert', async () => {
    serve({ summaryStatus: 401 });
    await renderMapPage('guest');
    expect(await screen.findAllByTestId('marker', undefined, { timeout: 5000 })).toHaveLength(ROWS.length);
    expect(views()).toEqual(['map']);
    expect(screen.queryByText(/session has ended/)).toBeNull();
    expect(screen.queryByText(/Sign in to view this catalogue's events/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Total Events').parentElement?.parentElement).toHaveTextContent('3');
  });

  it('tells a signed-out visitor plainly what needs an account, with Sign in returning to this map', async () => {
    serve();
    await renderMapPage('guest');
    const note = (await screen.findByText(/You are viewing the public map\./)).closest('[role="note"]') as HTMLElement;
    expect(note).toHaveTextContent('The event table, full event records, analytics and exports need an account.');
    expect(note).not.toHaveTextContent(/report/i);
    expect(within(note).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fcatalogues%2Fcat-1%2Fmap');
  });

  it('loads the summary view for a signed-in user, as before, with no guest note', async () => {
    serve();
    await renderMapPage('signedIn');
    expect(await screen.findAllByTestId('marker', undefined, { timeout: 5000 })).toHaveLength(ROWS.length);
    expect(views()).toEqual(['summary']);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('waits for the session before loading events', async () => {
    serve();
    await renderMapPage('loading');
    expect(await screen.findByText('Test catalogue · 3 events')).toBeInTheDocument();
    await act(() => new Promise(resolve => setTimeout(resolve, 50)));
    expect(screen.getByText('Loading catalogue events...')).toBeInTheDocument();
    expect(eventRequests).toHaveLength(0);
  });

  it('asks the user to sign in again, returning to this map, when a signed-in session is refused', async () => {
    serve({ summaryStatus: 401 });
    await renderMapPage('signedIn');
    expect(await screen.findByText(/Your session has ended, so this catalogue's events could not be loaded\. Sign in again to continue\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fcatalogues%2Fcat-1%2Fmap');
    expect(screen.queryByText(/HTTP 401/)).toBeNull();
    expect(views()).toEqual(['summary']);
  });

  it('keeps the retry for other failures', async () => {
    serve({ summaryStatus: 500 });
    await renderMapPage();
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading events' })).toBeInTheDocument();
  });

  it('explains a rate-limited map load and offers a retry', async () => {
    serve({ mapReply: reply(429, { error: 'Too many map requests from your network. Wait a few minutes and try again, or sign in to load maps without this limit.' }) });
    await renderMapPage('guest');
    expect(await screen.findByText(/Too many map requests from your network\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry loading events' })).toBeInTheDocument();
  });
});

describe('dashboard map', () => {
  async function renderDashboardMap(session: keyof typeof SESSIONS) {
    const { CatalogueMap } = await import('@/components/dashboard/CatalogueMap');
    return renderWithSession(<CatalogueMap />, session);
  }

  it('draws the markers for a signed-out visitor from the map view, saying what needs an account', async () => {
    serve({ summaryStatus: 401 });
    await renderDashboardMap('guest');
    expect(await screen.findAllByTestId('marker', undefined, { timeout: 5000 })).toHaveLength(ROWS.length);
    expect(views()).toEqual(['map']);
    expect(screen.queryByText('The map could not be loaded')).toBeNull();
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Public map. The event table, full event records, analytics and exports need an account.');
    expect(within(note).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fdashboard');
  });

  it('loads the summary view for a signed-in user, with no guest note', async () => {
    serve();
    await renderDashboardMap('signedIn');
    expect(await screen.findAllByTestId('marker', undefined, { timeout: 5000 })).toHaveLength(ROWS.length);
    expect(views()).toEqual(['summary']);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('offers Sign in, not Retry, when a signed-in session is refused', async () => {
    serve({ summaryStatus: 401 });
    await renderDashboardMap('signedIn');
    expect(await screen.findByText('Your session has ended, so the events could not be loaded. Sign in again to continue.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fdashboard');
    expect(screen.queryByRole('button', { name: 'Retry loading events' })).toBeNull();
  });
});
