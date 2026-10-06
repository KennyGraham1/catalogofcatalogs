/**
 * A2 items 7b and 7c, on the real dashboard widgets over a stubbed catalogue context.
 *  - 7b: the Last Updated card states the provider's own auto-refresh cadence.
 *  - 7c: the merged-catalogue test is the shared rule of lib/catalogue-source-type.ts
 *    (contract C6), so a merge recognised by its merge_config is merged on every widget,
 *    as in the provider's own stats.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, within } from '@testing-library/react';
import { StatisticsCards } from '@/components/dashboard/StatisticsCards';
import { RecentCatalogues } from '@/components/dashboard/RecentCatalogues';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';

let mockInterval: number | undefined;
const now = Date.now();
const mockCatalogues = [
  {
    id: 'upload', name: 'ISC upload', created_at: new Date(now - 86400_000).toISOString(), status: 'complete', event_count: 2000,
    source_catalogues: JSON.stringify([{ source: 'upload', description: 'Uploaded catalogue' }]), merge_config: '{}',
  },
  {
    // A merge whose source list is unreadable: only its merge_config says it is one.
    id: 'merged', name: 'Legacy merge', created_at: new Date(now - 3600_000).toISOString(), status: 'complete', event_count: 1500,
    source_catalogues: 'not json', merge_config: JSON.stringify({ mergeStrategy: 'quality', timeThresholdSeconds: 60 }),
  },
];

jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({
    catalogues: mockCatalogues, loading: false, error: null, refreshCatalogues: jest.fn(), invalidateCache: jest.fn(),
    lastUpdated: new Date(now), autoRefreshInterval: mockInterval,
    stats: { totalCatalogues: 2, totalEvents: 2000, mergedCatalogues: 1, recentlyAdded: 2 },
    // The load-state fields of the provider (a successful load).
    status: 'loaded', refreshing: false, retry: jest.fn(), lastSuccessAt: new Date(now),
  }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

afterEach(cleanup);

it.each([
  [21600000, 'Auto-refresh every 6 h; the icon refreshes now'],
  [1800000, 'Auto-refresh every 30 min; the icon refreshes now'],
  [0, 'Auto-refresh off; use the refresh icon'],
])('states an interval of %s ms as "%s"', (interval, text) => {
  mockInterval = interval;
  render(<StatisticsCards />);
  expect(screen.getByText(text)).toBeInTheDocument();
});

it('counts a merge recognised by its merge_config as merged on every widget', () => {
  mockInterval = 21600000;
  render(<><StatisticsCards /><RecentCatalogues /><ActivityFeed /></>);
  const card = screen.getByText('Merged Catalogues').closest('.rounded-lg') as HTMLElement;
  expect(within(card).getByText('1')).toBeInTheDocument();
  expect(within(card).getByText('50% of total')).toBeInTheDocument();
  expect(screen.getByText('2,000')).toBeInTheDocument(); // the merge's copies are not added
  expect(screen.getAllByText('Merged')).toHaveLength(1);
  expect(screen.getByText('Catalogues merged')).toBeInTheDocument();
  // Its source list cannot be read, so the feed does not claim a count of sources.
  expect(screen.getByText('Legacy merge created by merging catalogues')).toBeInTheDocument();
  expect(screen.getByText('Catalogue created')).toBeInTheDocument();
});
