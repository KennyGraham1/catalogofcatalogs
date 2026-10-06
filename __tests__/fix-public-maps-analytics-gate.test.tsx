/**
 * Maps are public, analytics is not: a signed-out visitor on the Analytics page still loads
 * the summary view (which needs a session) - never the public map view - and is asked to
 * sign in, returning to the page.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SessionContext } from 'next-auth/react';
import { CatalogueProvider } from '@/contexts/CatalogueContext';
import AnalyticsPage from '@/app/analytics/page';

jest.mock('next/navigation', () => ({ usePathname: () => '/analytics' }));
jest.mock('next/dynamic', () => () => function MockMap({ earthquakes }: { earthquakes: unknown[] }) {
  return <div data-testid="map">{earthquakes.length} events on map</div>;
});
jest.mock('@/hooks/use-seismological-worker', () => ({
  useSeismologicalAnalyses: () => ({
    grAnalysis: { data: null, error: null }, completeness: { data: null, error: null },
    temporalAnalysis: { data: null, error: null }, timeSeriesAnalysis: { data: null, error: null },
    momentAnalysis: { data: null, error: null }, anyLoading: false,
  }),
}));
jest.mock('@/components/charts', () => Object.fromEntries([
  'MagnitudeDistributionChart', 'DepthDistributionChart', 'RegionDistributionChart', 'CatalogueDistributionChart',
  'MagnitudeDepthScatter', 'MagnitudeTimeScatter', 'EventTimelineChart', 'GutenbergRichterChart', 'CompletenessChart',
  'TemporalSeriesChart', 'MomentReleaseChart', 'CumulativeReleaseChart', 'GoodnessOfFitChart', 'BValueStabilityChart',
  'MFDComparisonChart',
].map(name => [name, () => null])));

const CATALOGUE_A = { id: 'a', name: 'Catalogue A', event_count: 2 };
const ROWS = [3, 4].map((magnitude, i) => ({ id: `e${i}`, time: '2024-01-01T00:00:00Z', magnitude, depth: 10, latitude: -41, longitude: 175 }));
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

const originalFetch = global.fetch;
const originalResizeObserver = global.ResizeObserver;
let views: Array<string | null> = [];

beforeEach(() => {
  views = [];
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
  global.fetch = jest.fn(async (input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return reply(200, [CATALOGUE_A]);
    views.push(url.searchParams.get('view'));
    // The server as deployed: the map view is public, the summary view needs a session.
    return url.searchParams.get('view') === 'map'
      ? reply(200, { data: ROWS, pagination: { hasMore: false, nextCursor: null } })
      : reply(401, { error: 'Authentication required' });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  global.ResizeObserver = originalResizeObserver;
});

it('still requires sign-in for analytics: a guest loads the summary view and is offered Sign in', async () => {
  const guest = { data: null, status: 'unauthenticated' as const, update: async () => null };
  render(
    <SessionContext.Provider value={guest}>
      <CatalogueProvider autoRefreshInterval={0}><AnalyticsPage /></CatalogueProvider>
    </SessionContext.Provider>
  );
  fireEvent.click(await screen.findByRole('combobox', { name: 'Catalogue to analyse' }));
  fireEvent.click(await screen.findByRole('option', { name: /Catalogue A/ }));
  expect(await screen.findByRole('heading', { level: 2, name: 'Sign in to view analytics' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fanalytics');
  expect(screen.queryByTestId('map')).toBeNull();
  expect(views.length).toBeGreaterThan(0);
  expect(views.every(view => view === 'summary')).toBe(true);
});
