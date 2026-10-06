/**
 * Regression test for app/page.tsx (gc#3): the landing page's "Earthquake Events"
 * figure must not add a merged catalogue's events on top of its sources, and must
 * come from the shared CatalogueProvider (gc#0) rather than its own uncached fetch
 * that a mutation elsewhere never invalidated.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Home from '@/app/page';
import { CatalogueProvider } from '@/contexts/CatalogueContext';
import { clearAllCache } from '@/hooks/use-cached-fetch';

// The landing page reads the session to decide which upload entry to show; a signed-out
// visitor is enough here.
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false, session: null }),
}));

type Row = { id: string; name: string; event_count: number; source_catalogues: string; created_at: string };

let serverList: Row[] = [];
const fetchMock = jest.fn(async (_url: string) => ({
  ok: true,
  status: 200,
  json: async () => serverList.map((c) => ({ ...c })),
}));

beforeEach(() => {
  (global as any).fetch = fetchMock;
  fetchMock.mockClear();
  clearAllCache();
});

test('landing page event total excludes a merge output from the sum of its sources', async () => {
  serverList = [
    { id: 'U1', name: 'Upload 1', event_count: 1000, source_catalogues: JSON.stringify([{ source: 'upload' }]), created_at: new Date().toISOString() },
    { id: 'G1', name: 'GeoNet import', event_count: 800, source_catalogues: JSON.stringify([{ source: 'GeoNet' }]), created_at: new Date().toISOString() },
    { id: 'M1', name: 'Merged', event_count: 1500, source_catalogues: JSON.stringify([{ id: 'U1', name: 'Upload 1', events: 1000, source: 'upload' }, { id: 'G1', name: 'GeoNet import', events: 800, source: 'GeoNet' }]), created_at: new Date().toISOString() },
  ];

  render(
    <CatalogueProvider autoRefreshInterval={0}>
      <Home />
    </CatalogueProvider>
  );

  // Pre-fix this rendered 3,300 (1000 + 800 + 1500); the correct figure excludes the
  // merge copy: 1000 + 800 = 1,800.
  await waitFor(() => expect(screen.getByText('1,800')).toBeInTheDocument());
  expect(screen.getByText('Earthquake Events')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument(); // total catalogue rows, unaffected
});
