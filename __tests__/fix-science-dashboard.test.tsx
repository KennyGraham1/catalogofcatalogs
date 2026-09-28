/**
 * Findings #17 and #9 (dashboard part). The dashboard statistics cards claimed an
 * auto-refresh of 30 s (the provider's interval is 6 h), called a rolling 30-day
 * count "this month", summed event_count over source AND merged catalogues as
 * "Total earthquake events" (a merged catalogue holds copies of its sources' events),
 * and counted every uploaded or imported catalogue as merged, because uploads and
 * GeoNet imports also write a (one-element) source_catalogues list. The recent
 * catalogues list and the activity feed repeated that classification.
 *
 * The real components render against a stubbed catalogue context holding the
 * reviewer's scenario: a 10,000-event GeoNet import, a 2,000-event upload, and an
 * 11,000-event catalogue merged from the two.
 */
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';

import { StatisticsCards } from '@/components/dashboard/StatisticsCards';
import { RecentCatalogues } from '@/components/dashboard/RecentCatalogues';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';

const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86400_000).toISOString();

const mockCatalogues = [
  {
    id: 'geonet', name: 'GeoNet import', created_at: iso(40), status: 'complete', event_count: 10000,
    source_catalogues: JSON.stringify([{ source: 'GeoNet', description: 'GeoNet FDSN import' }]),
    merge_config: JSON.stringify({ source: 'GeoNet' }),
  },
  {
    id: 'upload', name: 'ISC upload', created_at: iso(10), status: 'complete', event_count: 2000,
    source_catalogues: JSON.stringify([{ source: 'upload', description: 'Uploaded catalogue' }]),
    merge_config: JSON.stringify({ uploadDate: iso(10) }),
  },
  {
    id: 'merged', name: 'GeoNet + ISC', created_at: iso(5), status: 'complete', event_count: 11000,
    source_catalogues: JSON.stringify([
      { id: 'geonet', name: 'GeoNet import', events: 10000, source: 'GeoNet' },
      { id: 'upload', name: 'ISC upload', events: 2000, source: 'upload' },
    ]),
    merge_config: JSON.stringify({ timeThreshold: 60 }),
  },
];

// What the provider computes today: every catalogue with a source list is "merged".
const mockStats = { totalCatalogues: 3, totalEvents: 23000, mergedCatalogues: 3, recentlyAdded: 2 };

jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({
    catalogues: mockCatalogues, stats: mockStats, loading: false, error: null,
    refreshCatalogues: jest.fn(), invalidateCache: jest.fn(), lastUpdated: new Date(now),
    autoRefreshInterval: 21600000,
  }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('dashboard statistics cards state what they count', () => {
  it('counts event records in source catalogues, not merged copies, and does not call them earthquakes', () => {
    render(<StatisticsCards />);
    expect(screen.queryByText('Total earthquake events')).not.toBeInTheDocument();
    expect(screen.getByText('Event records')).toBeInTheDocument();
    // 10,000 + 2,000 source records; the merged catalogue's 11,000 are copies.
    expect(screen.getByText('12,000')).toBeInTheDocument();
    expect(screen.queryByText('23,000')).not.toBeInTheDocument();
    expect(screen.getByText(/11,000 more in merged catalogues/)).toBeInTheDocument();
  });

  it('counts only catalogues built by merging as merged', () => {
    render(<StatisticsCards />);
    const card = screen.getByText('Merged Catalogues').closest('.rounded-lg') as HTMLElement;
    expect(within(card).getByText('1')).toBeInTheDocument();
    expect(within(card).getByText('33% of total')).toBeInTheDocument();
    expect(screen.queryByText('100% of total')).not.toBeInTheDocument();
  });

  it('describes the recently-added window and the refresh behaviour truthfully', () => {
    render(<StatisticsCards />);
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument();
    expect(screen.getByText('+2 in the last 30 days')).toBeInTheDocument();
    expect(screen.queryByText(/Auto-refresh: 30s/)).not.toBeInTheDocument();
    // The provider's real interval, now exposed by the context (A2 item 7b).
    expect(screen.getByText(/Auto-refresh every 6 h/)).toBeInTheDocument();
  });
});

describe('recent catalogues and activity do not badge uploads or imports as merged', () => {
  it('marks only the merged catalogue in the recent list', () => {
    render(<RecentCatalogues />);
    expect(screen.getAllByText('Merged')).toHaveLength(1);
  });

  it('reports one merge and two created catalogues in the activity feed', () => {
    render(<ActivityFeed />);
    expect(screen.getAllByText('Catalogues merged')).toHaveLength(1);
    expect(screen.getAllByText('Catalogue created')).toHaveLength(2);
  });
});
