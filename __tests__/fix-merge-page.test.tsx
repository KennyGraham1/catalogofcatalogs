/**
 * The merge page (app/merge/page.tsx) after the merge-core fixes (cluster B1):
 *  - 'newest' now keeps the most recently DETERMINED solution (findings #23/#134), so the page
 *    must not describe it as "the most recently updated event data" or imply origin time;
 *  - a saved merge clears every client cache of catalogue data (contract C5).
 * Only the network, the auth/catalogue contexts, the Leaflet maps and the client cache module
 * are stubbed.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' }, isAuthenticated: true }),
}));

const mockCatalogues = [
  { id: 'cat-a', name: 'Alpha catalogue', event_count: 3, created_at: '2024-01-03T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
  { id: 'cat-b', name: 'Bravo catalogue', event_count: 2, created_at: '2024-01-02T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
];
jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({ catalogues: mockCatalogues, loading: false, invalidateCache: () => {} }),
}));

const mockInvalidate = jest.fn();
jest.mock('@/lib/client-cache', () => ({
  invalidateCatalogueData: () => mockInvalidate(),
  subscribeToCatalogueInvalidation: () => () => {},
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicStub() { return null; },
}));

import MergePage from '@/app/merge/page';

let calls: Array<{ url: string; body?: any }> = [];
let exportOnlyResult = false;

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

async function fakeServer(input: any, init?: any) {
  const url = new URL(String(input), 'http://localhost');
  calls.push({ url: `${url.pathname}${url.search}`, body: init?.body ? JSON.parse(init.body) : undefined });
  if (url.pathname === '/api/merge' && init?.method === 'POST') {
    return jsonResponse(exportOnlyResult
      ? { success: true, catalogueId: null, eventCount: 0, originalEventCount: 0, events: [] }
      : { success: true, catalogueId: 'merged-1', eventCount: 0, originalEventCount: 0 });
  }
  if (url.pathname === '/api/catalogues/merged-1/events') {
    return jsonResponse({ data: [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 1000 } });
  }
  return jsonResponse({ error: `unexpected request ${url.pathname}` }, 404);
}

const originalFetch = global.fetch;
const originalResizeObserver = (global as any).ResizeObserver;

beforeEach(() => {
  calls = [];
  exportOnlyResult = false;
  mockInvalidate.mockClear();
  (global as any).fetch = jest.fn(fakeServer);
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  (global as any).fetch = originalFetch;
  (global as any).ResizeObserver = originalResizeObserver;
});

function openConfiguration() {
  render(<MergePage />);
  for (const name of ['Alpha catalogue', 'Bravo catalogue']) fireEvent.click(screen.getByRole('checkbox', { name }));
  fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
}

async function choose(select: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: select }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

describe('"newest" is described as the most recently determined solution', () => {
  it('explains the Most Recent Solution strategy by determination time, not update or origin time', async () => {
    openConfiguration();
    await choose('Merge Strategy', 'Most Recent Solution');
    const help = screen.getByText(/Keeps the most recently determined solution/);
    expect(help).toHaveTextContent(/creation time/);
    expect(help).toHaveTextContent(/reviewed or final solutions win over preliminary ones/);
    expect(document.body).not.toHaveTextContent(/most recently updated event data/i);
  });

  it('explains the Most Recent Solution source priority the same way', async () => {
    openConfiguration();
    // Source Priority with its default option (Most Recent Solution).
    expect(screen.getByRole('combobox', { name: 'Source Priority' }))
      .toHaveAccessibleDescription(expect.stringMatching(/most recently determined solution is kept/i));
  });

  it('names the strategy in the merge summary by its label', async () => {
    openConfiguration();
    await choose('Merge Strategy', 'Most Recent Solution');
    fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
    expect(await screen.findAllByText('Most Recent Solution')).not.toHaveLength(0);
    // The raw option value used to be shown (CSS-capitalised to "Newest").
    expect(screen.queryByText(/^newest$/i)).toBeNull();
  });
});

describe('C5: a saved merge invalidates the client catalogue caches', () => {
  async function merge(confirmLabel: string) {
    fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start Merge/ }));
    fireEvent.click(await screen.findByRole('button', { name: confirmLabel }));
    await waitFor(() => expect(calls.some(c => c.url === '/api/merge')).toBe(true));
  }

  it('calls invalidateCatalogueData after a saved merge', async () => {
    openConfiguration();
    await merge('Merge catalogues');
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledTimes(1));
  });

  it('does not after an export-only merge, which saves nothing', async () => {
    exportOnlyResult = true;
    openConfiguration();
    fireEvent.click(screen.getByRole('checkbox', { name: /Export only/ }));
    await merge('Merge for export');
    await screen.findByText(/Merge Complete|events in merged catalogue/);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
