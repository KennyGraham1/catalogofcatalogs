/**
 * Regression tests for contexts/CatalogueContext.tsx (gc#0, gc#3).
 *
 * gc#0: invalidateCache() must perform a real refetch that reflects server-side
 * mutations, and must also clear the hooks/use-cached-fetch caches used by other
 * pages (analytics, catalogue detail, map) so THEY see the new list too — not just
 * the context's own state. It must also be reachable from outside the context tree
 * (upload/import/edit flows import invalidateCatalogueData() directly).
 *
 * gc#3: dashboard stats must classify catalogues with the shared C6 helper instead
 * of "source_catalogues is non-empty" (true for every creation path), and must not
 * add a merge output's events on top of its sources.
 */
import React from 'react';
import { render, renderHook, waitFor, act } from '@testing-library/react';
import { CatalogueProvider, useCatalogues } from '@/contexts/CatalogueContext';
import { useCachedFetch, clearAllCache } from '@/hooks/use-cached-fetch';
import { invalidateCatalogueData } from '@/lib/client-cache';

type Row = { id: string; name: string; event_count: number; source_catalogues: string; merge_config?: string; created_at: string };

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

function Probe({ onReady }: { onReady: (ctx: ReturnType<typeof useCatalogues>) => void }) {
  const ctx = useCatalogues();
  onReady(ctx);
  return null;
}

describe('CatalogueProvider.invalidateCache (gc#0)', () => {
  it('refetches and reflects a server-side change (merge/delete) instead of the pre-mutation list', async () => {
    serverList = [
      { id: 'A', name: 'GeoNet 2024', event_count: 100, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
      { id: 'B', name: 'ISC 2024', event_count: 100, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
    ];

    let latest: ReturnType<typeof useCatalogues> | null = null;
    render(
      <CatalogueProvider autoRefreshInterval={0}>
        <Probe onReady={(ctx) => { latest = ctx; }} />
      </CatalogueProvider>
    );
    await waitFor(() => expect(latest!.loading).toBe(false));
    expect(latest!.catalogues.map((c) => c.name)).toEqual(['GeoNet 2024', 'ISC 2024']);

    // Server state changes underneath the mounted provider (e.g. another tab merged
    // A and B into a new catalogue M).
    serverList = [
      { id: 'M', name: 'Merged NZ', event_count: 150, source_catalogues: '[{"id":"A","name":"GeoNet 2024","events":100,"source":"upload"},{"id":"B","name":"ISC 2024","events":100,"source":"upload"}]', created_at: new Date().toISOString() },
    ];

    await act(async () => {
      latest!.invalidateCache();
    });

    await waitFor(() => expect(latest!.catalogues.map((c) => c.name)).toEqual(['Merged NZ']));
  });

  it('also clears hooks/use-cached-fetch caches used by other pages (analytics/detail/map)', async () => {
    serverList = [
      { id: 'A', name: 'GeoNet 2024', event_count: 100, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
    ];

    let latest: ReturnType<typeof useCatalogues> | null = null;
    render(
      <CatalogueProvider autoRefreshInterval={0}>
        <Probe onReady={(ctx) => { latest = ctx; }} />
      </CatalogueProvider>
    );
    await waitFor(() => expect(latest!.loading).toBe(false));

    // A page-level useCachedFetch of the same list (the pattern analytics used before it
    // read the shared list from CatalogueContext) must also see the change.
    const analytics = renderHook(() => useCachedFetch<Row[]>('/api/catalogues', { cacheTime: 10 * 60 * 1000 }));
    await waitFor(() => expect(analytics.result.current.data).not.toBeNull());
    expect(analytics.result.current.data!.map((c) => c.name)).toEqual(['GeoNet 2024']);

    serverList = [
      { id: 'A', name: 'GeoNet 2024', event_count: 100, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
      { id: 'C', name: 'New Catalogue', event_count: 50, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
    ];

    await act(async () => {
      latest!.invalidateCache();
    });
    await waitFor(() => expect(latest!.catalogues.length).toBe(2));

    // A remounted analytics page must see the new catalogue, not the pre-invalidation
    // 10-minute-old cache entry.
    const analyticsAfter = renderHook(() => useCachedFetch<Row[]>('/api/catalogues', { cacheTime: 10 * 60 * 1000 }));
    await waitFor(() => expect(analyticsAfter.result.current.data!.map((c) => c.name)).toEqual(['GeoNet 2024', 'New Catalogue']));
  });

  it('is reachable from outside the provider tree via lib/client-cache.ts, for flows with no reason to use the context (upload, import, edit)', async () => {
    serverList = [
      { id: 'A', name: 'GeoNet 2024', event_count: 100, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
    ];

    let latest: ReturnType<typeof useCatalogues> | null = null;
    render(
      <CatalogueProvider autoRefreshInterval={0}>
        <Probe onReady={(ctx) => { latest = ctx; }} />
      </CatalogueProvider>
    );
    await waitFor(() => expect(latest!.loading).toBe(false));

    serverList = [
      { id: 'A', name: 'GeoNet 2024', event_count: 100, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
      { id: 'U2', name: 'Freshly Uploaded', event_count: 20, source_catalogues: '[{"source":"upload"}]', created_at: new Date().toISOString() },
    ];

    // Simulates app/upload/page.tsx calling invalidateCatalogueData() directly after
    // a successful upload, without going through useCatalogues().
    await act(async () => {
      invalidateCatalogueData();
    });

    await waitFor(() => expect(latest!.catalogues.map((c) => c.name)).toEqual(['GeoNet 2024', 'Freshly Uploaded']));
  });
});

describe('CatalogueProvider dashboard stats (gc#3)', () => {
  it('classifies uploads and imports as not-merged, and does not inflate totalEvents with the merge copy', async () => {
    // Values written by the three creation paths: upload app/api/catalogues/route.ts,
    // GeoNet lib/geonet-import-service.ts:641, merge lib/merge.ts:445.
    serverList = [
      { id: 'U1', name: 'Upload 1', event_count: 1000, source_catalogues: JSON.stringify([{ source: 'upload', description: 'Uploaded catalogue' }]), created_at: new Date().toISOString() },
      { id: 'G1', name: 'GeoNet import', event_count: 800, source_catalogues: JSON.stringify([{ source: 'GeoNet', description: 'GeoNet' }]), created_at: new Date().toISOString() },
      { id: 'M1', name: 'Merged', event_count: 1500, source_catalogues: JSON.stringify([{ id: 'U1', name: 'Upload 1', events: 1000, source: 'upload' }, { id: 'G1', name: 'GeoNet import', events: 800, source: 'GeoNet' }]), created_at: new Date().toISOString() },
    ];

    let latest: ReturnType<typeof useCatalogues> | null = null;
    render(
      <CatalogueProvider autoRefreshInterval={0}>
        <Probe onReady={(ctx) => { latest = ctx; }} />
      </CatalogueProvider>
    );
    await waitFor(() => expect(latest!.loading).toBe(false));

    expect(latest!.stats.totalCatalogues).toBe(3);
    // Only the real merge counts as merged: 1, not 3 (the pre-fix "non-empty
    // source_catalogues" test counted all three, i.e. 100% "merged").
    expect(latest!.stats.mergedCatalogues).toBe(1);
    // 1000 + 800 distinct source events; the 1500-event merge copy is excluded
    // rather than added on top (pre-fix this was 3300).
    expect(latest!.stats.totalEvents).toBe(1800);
  });

  it('does not count a still-processing upload as merged (0 source catalogues is not "more than one")', async () => {
    serverList = [
      { id: 'P1', name: 'Processing upload', event_count: 0, source_catalogues: JSON.stringify([{ source: 'upload' }]), created_at: new Date().toISOString() },
    ];

    let latest: ReturnType<typeof useCatalogues> | null = null;
    render(
      <CatalogueProvider autoRefreshInterval={0}>
        <Probe onReady={(ctx) => { latest = ctx; }} />
      </CatalogueProvider>
    );
    await waitFor(() => expect(latest!.loading).toBe(false));
    expect(latest!.stats.mergedCatalogues).toBe(0);
  });
});
