/**
 * UI audit 2026-10-05, catalogue data states and the catalogue, dashboard and landing pages.
 *
 *  - Finding 4: a failed /api/catalogues request is not presented as an empty inventory. The
 *    shared CatalogueProvider reports loading / loaded / empty / failed / stale, with the
 *    error, retry() and the last-success time; the list, dashboard and landing page show a
 *    failure with Retry and never turn unknown totals into 0.
 *  - Finding 3: the catalogue detail header stacks, and dashboard processing rows keep their
 *    status inside the card (the name group can shrink).
 *  - Finding 7: the search-help and back controls are named by purpose.
 *  - Finding 9: the landing page leads guests to browsing, and offers upload only to roles
 *    that can use it.
 *  - Finding 12: one h1 per page; catalogue names in the list link to their detail pages.
 *  - Finding 5: the geographic search trigger is one native button with aria-expanded.
 *
 * The real provider runs over a stubbed global.fetch; only auth, navigation and the map are
 * stubbed.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/',
  useParams: () => ({ id: 'cat-1' }),
  useSearchParams: () => new URLSearchParams(),
}));

let mockRole: string | null = null;
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({
    user: mockRole ? { role: mockRole, name: 'Test user', email: 'test@example.org' } : null,
    isAuthenticated: !!mockRole,
    isLoading: false,
    session: null,
  }),
  usePermission: () => mockRole === 'editor' || mockRole === 'admin' || mockRole === 'viewer',
}));

jest.mock('@/components/catalogues/RegionSelectorMap', () => ({
  RegionSelectorMap: () => <div data-testid="region-map-stub" />,
}));

import { CatalogueProvider, useCatalogues } from '@/contexts/CatalogueContext';
import { deriveCatalogueLoadStatus, hasCatalogueData } from '@/contexts/catalogue-load-status';
import { clearAllCache } from '@/hooks/use-cached-fetch';
import CataloguesPage from '@/app/catalogues/page';
import CatalogueDetailPage from '@/app/catalogues/[id]/page';
import DashboardPage from '@/app/dashboard/page';
import Home from '@/app/page';
import { ProcessingStatus } from '@/components/dashboard/ProcessingStatus';
import { GeographicSearchPanel } from '@/components/catalogues/GeographicSearchPanel';

const LONG_NAME = 'Kaikōura earthquake sequence 2016';
const now = new Date().toISOString();
const ROWS = [
  {
    id: 'cat-1', name: LONG_NAME, event_count: 120, status: 'complete', created_at: now,
    source_catalogues: JSON.stringify([{ source: 'GeoNet' }]), merge_config: '{}',
  },
  {
    id: 'cat-2', name: 'Canterbury sequence', event_count: 80, status: 'processing', created_at: now,
    source_catalogues: JSON.stringify([{ source: 'upload' }]), merge_config: '{}',
  },
];

type Reply = () => Promise<Response>;
const ok = (body: unknown): Reply => () =>
  Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => body } as unknown as Response);
const http500: Reply = () =>
  Promise.resolve({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: 'Internal error' }) } as unknown as Response);
const offline: Reply = () => Promise.reject(new TypeError('Failed to fetch'));

/** What /api/catalogues answers next; other URLs answer the event and export routes. */
let catalogueReply: Reply = ok(ROWS);
const originalFetch = global.fetch;

beforeEach(() => {
  mockRole = null;
  mockPush.mockClear();
  catalogueReply = ok(ROWS);
  clearAllCache();
  (global as any).fetch = jest.fn((input: unknown) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return catalogueReply();
    if (url.pathname === '/api/catalogues/cat-1/events') {
      return ok({ data: [], pagination: { hasMore: false, nextCursor: null, prevCursor: null, limit: 500 } })();
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url.pathname}`));
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  (global as any).fetch = originalFetch;
  // React reports invalid nesting (a link in a button, a button in a heading's button...)
  // through console.error; none of these pages may produce it.
  const nesting = (console.error as jest.Mock).mock.calls
    .map((args) => args.map(String).join(' '))
    .filter((text) => /validateDOMNesting|cannot be a descendant of|cannot contain a nested/.test(text));
  (console.error as jest.Mock).mockRestore?.();
  expect(nesting).toEqual([]);
});

function withProvider(ui: React.ReactElement) {
  return render(<CatalogueProvider autoRefreshInterval={0}>{ui}</CatalogueProvider>);
}

type Ctx = ReturnType<typeof useCatalogues>;
function renderProbe() {
  const ref: { current: Ctx | null } = { current: null };
  function Probe() {
    ref.current = useCatalogues();
    return null;
  }
  withProvider(<Probe />);
  return ref;
}

/** Text of every figure rendered as a statistic. */
function statValues(container: HTMLElement = document.body): string[] {
  return Array.from(container.querySelectorAll('[data-stat-value]')).map((el) => el.textContent ?? '');
}

describe('CatalogueProvider load states (finding 4)', () => {
  it('starts as loading', () => {
    catalogueReply = () => new Promise(() => {});
    const ctx = renderProbe();
    expect(ctx.current!.status).toBe('loading');
    expect(ctx.current!.loading).toBe(true);
    expect(ctx.current!.lastSuccessAt).toBeNull();
  });

  it('reports HTTP 500 as failed, not as an empty list', async () => {
    catalogueReply = http500;
    const ctx = renderProbe();
    await waitFor(() => expect(ctx.current!.status).toBe('failed'));
    expect(ctx.current!.error).toBe('The server returned an error (HTTP 500).');
    // The status is reported as data, so a 401 can offer sign-in without parsing the message.
    expect(ctx.current!.errorStatus).toBe(500);
    expect(ctx.current!.catalogues).toEqual([]);
    expect(ctx.current!.lastSuccessAt).toBeNull();
    expect(ctx.current!.lastUpdated).toBeNull();
    expect(ctx.current!.loading).toBe(false);
    expect(hasCatalogueData(ctx.current!.status)).toBe(false);
  });

  it('describes an unreachable server plainly', async () => {
    catalogueReply = offline;
    const ctx = renderProbe();
    await waitFor(() => expect(ctx.current!.status).toBe('failed'));
    expect(ctx.current!.error).toBe('The server could not be reached. Check your connection.');
    expect(ctx.current!.errorStatus).toBeNull();
  });

  it('reports a successful empty response as empty', async () => {
    catalogueReply = ok([]);
    const ctx = renderProbe();
    await waitFor(() => expect(ctx.current!.status).toBe('empty'));
    expect(ctx.current!.error).toBeNull();
    expect(ctx.current!.lastSuccessAt).toBeInstanceOf(Date);
    expect(hasCatalogueData(ctx.current!.status)).toBe(true);
  });

  it('keeps the earlier list, totals and success time as stale after a failed refresh', async () => {
    const ctx = renderProbe();
    await waitFor(() => expect(ctx.current!.status).toBe('loaded'));
    const firstSuccess = ctx.current!.lastSuccessAt;
    expect(ctx.current!.stats.totalCatalogues).toBe(2);

    catalogueReply = http500;
    await act(async () => {
      await ctx.current!.refreshCatalogues();
    });

    expect(ctx.current!.status).toBe('stale');
    expect(ctx.current!.catalogues.map((c) => c.id)).toEqual(['cat-1', 'cat-2']);
    expect(ctx.current!.stats.totalCatalogues).toBe(2);
    expect(ctx.current!.lastSuccessAt).toBe(firstSuccess);
    expect(ctx.current!.lastUpdated).toBe(firstSuccess);
    expect(ctx.current!.error).toMatch(/HTTP 500/);
  });

  it('retry() recovers from a failure', async () => {
    catalogueReply = http500;
    const ctx = renderProbe();
    await waitFor(() => expect(ctx.current!.status).toBe('failed'));

    catalogueReply = ok(ROWS);
    let pending: Promise<void>;
    act(() => {
      pending = ctx.current!.retry();
    });
    // While the retry runs there is still no data to show, so the state is loading.
    expect(ctx.current!.status).toBe('loading');
    await act(async () => {
      await pending;
    });
    expect(ctx.current!.status).toBe('loaded');
    expect(ctx.current!.error).toBeNull();
    expect(ctx.current!.catalogues).toHaveLength(2);
  });

  it('marks a refresh over shown data as refreshing, and stays stale until it succeeds', async () => {
    const ctx = renderProbe();
    await waitFor(() => expect(ctx.current!.status).toBe('loaded'));
    catalogueReply = http500;
    await act(async () => {
      await ctx.current!.retry();
    });
    expect(ctx.current!.status).toBe('stale');

    let release!: () => void;
    catalogueReply = () => new Promise<Response>((resolve) => {
      release = () => { ok(ROWS.slice(0, 1))().then(resolve); };
    });
    let pending: Promise<void>;
    act(() => {
      pending = ctx.current!.retry();
    });
    expect(ctx.current!.refreshing).toBe(true);
    expect(ctx.current!.status).toBe('stale');
    await act(async () => {
      release();
      await pending;
    });
    expect(ctx.current!.status).toBe('loaded');
    expect(ctx.current!.refreshing).toBe(false);
  });

  it('ignores a slower, superseded response', async () => {
    const ctx = renderProbe();
    await waitFor(() => expect(ctx.current!.status).toBe('loaded'));

    let releaseSlow!: () => void;
    catalogueReply = () => new Promise<Response>((resolve) => {
      releaseSlow = () => resolve({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    });
    let slow: Promise<void>;
    act(() => {
      slow = ctx.current!.refreshCatalogues();
    });
    catalogueReply = ok(ROWS.slice(0, 1));
    await act(async () => {
      await ctx.current!.refreshCatalogues();
    });
    await act(async () => {
      releaseSlow();
      await slow;
    });
    expect(ctx.current!.status).toBe('loaded');
    expect(ctx.current!.catalogues).toHaveLength(1);
  });

  it('derives every state from the raw request state', () => {
    const at = new Date();
    expect(deriveCatalogueLoadStatus({ inFlight: true, lastSuccessAt: null, lastAttemptFailed: false, count: 0 })).toBe('loading');
    expect(deriveCatalogueLoadStatus({ inFlight: false, lastSuccessAt: null, lastAttemptFailed: true, count: 0 })).toBe('failed');
    expect(deriveCatalogueLoadStatus({ inFlight: true, lastSuccessAt: null, lastAttemptFailed: true, count: 0 })).toBe('loading');
    expect(deriveCatalogueLoadStatus({ inFlight: false, lastSuccessAt: at, lastAttemptFailed: false, count: 0 })).toBe('empty');
    expect(deriveCatalogueLoadStatus({ inFlight: false, lastSuccessAt: at, lastAttemptFailed: false, count: 3 })).toBe('loaded');
    expect(deriveCatalogueLoadStatus({ inFlight: true, lastSuccessAt: at, lastAttemptFailed: true, count: 3 })).toBe('stale');
  });
});

describe('catalogue list page', () => {
  it('shows a failure with Retry instead of "no catalogues", and recovers on Retry', async () => {
    catalogueReply = http500;
    withProvider(<CataloguesPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Catalogues could not be loaded');
    expect(alert).toHaveTextContent('This does not mean that no catalogues exist.');
    expect(alert).toHaveTextContent('HTTP 500');
    expect(screen.queryByText(/No catalogues/)).not.toBeInTheDocument();

    catalogueReply = ok(ROWS);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: LONG_NAME })).toHaveAttribute('href', '/catalogues/cat-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the empty state for a successful empty list, without a failure', async () => {
    catalogueReply = ok([]);
    withProvider(<CataloguesPage />);
    expect(await screen.findByText('No catalogues yet')).toBeInTheDocument();
    expect(screen.queryByText('Catalogues could not be loaded')).not.toBeInTheDocument();
    // A visitor without Editor access is not sent to an import page they cannot use.
    expect(screen.queryByRole('button', { name: 'Import from GeoNet' })).not.toBeInTheDocument();
  });

  it('offers the import action on an empty list to editors', async () => {
    mockRole = 'editor';
    catalogueReply = ok([]);
    withProvider(<CataloguesPage />);
    expect(await screen.findByRole('button', { name: 'Import from GeoNet' })).toBeInTheDocument();
  });

  it('keeps the loaded rows with a stale notice when a refresh fails', async () => {
    withProvider(<CataloguesPage />);
    await screen.findByRole('link', { name: LONG_NAME });

    catalogueReply = http500;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    const stale = await waitFor(() => {
      const el = document.querySelector('[data-catalogue-load-state="stale"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(stale).toHaveAttribute('role', 'status');
    expect(stale).toHaveTextContent('Showing earlier catalogue data');
    expect(stale).toHaveTextContent('The latest refresh failed');
    expect(within(stale).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: LONG_NAME })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Canterbury sequence' })).toBeInTheDocument();
  });

  it('names the search-help control and links each catalogue name to its detail page', async () => {
    withProvider(<CataloguesPage />);
    const link = await screen.findByRole('link', { name: LONG_NAME });

    expect(screen.getByRole('button', { name: 'Search help' })).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/catalogues/cat-1');
    expect(screen.getByRole('link', { name: 'Canterbury sequence' })).toHaveAttribute('href', '/catalogues/cat-2');
    // No interactive element nested in another.
    expect(link.closest('button')).toBeNull();
    expect(link.parentElement!.closest('a')).toBeNull();
    expect(document.querySelectorAll('a a, a button, button a, button button')).toHaveLength(0);
    // Row actions are still there.
    expect(screen.getByRole('button', { name: `View ${LONG_NAME} on map` })).toBeInTheDocument();
  });

  it('has one h1', async () => {
    withProvider(<CataloguesPage />);
    await screen.findByRole('link', { name: LONG_NAME });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Catalogues');
  });
});

describe('dashboard page', () => {
  it('shows a failure with Retry, and unavailable totals instead of zeros', async () => {
    catalogueReply = http500;
    withProvider(<DashboardPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Catalogues could not be loaded');
    const values = statValues();
    expect(values).toHaveLength(4);
    for (const value of values) {
      expect(value).not.toMatch(/\b0\b/);
      expect(value).toContain('—');
      expect(value).toContain('Unavailable');
    }
    expect(screen.queryByText('No catalogues yet')).not.toBeInTheDocument();
    expect(screen.getByText('Recent catalogues are unavailable')).toBeInTheDocument();
    expect(screen.getByText('Processing status is unavailable')).toBeInTheDocument();

    catalogueReply = ok(ROWS);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(statValues()[0]).toBe('2'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows real zeros and empty states for a successful empty list', async () => {
    catalogueReply = ok([]);
    withProvider(<DashboardPage />);
    await waitFor(() => expect(statValues()[0]).toBe('0'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('No catalogues yet').length).toBeGreaterThan(0);
  });

  it('keeps figures with a stale notice when a refresh fails', async () => {
    withProvider(<DashboardPage />);
    await waitFor(() => expect(statValues()[0]).toBe('2'));
    catalogueReply = http500;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalogue data' }));
    await waitFor(() => expect(document.querySelector('[data-catalogue-load-state="stale"]')).not.toBeNull());
    expect(statValues()[0]).toBe('2');
  });

  it('has one h1, h2 sections and h3 statistic titles', async () => {
    withProvider(<DashboardPage />);
    await waitFor(() => expect(statValues()[0]).toBe('2'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Recent Catalogues' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Processing Status' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Total Catalogues' })).toBeInTheDocument();
  });
});

describe('dashboard processing status (finding 3)', () => {
  it('lets a long name shrink and truncate while the status stays visible', async () => {
    withProvider(<ProcessingStatus />);
    const name = await screen.findByTitle(LONG_NAME);
    const group = name.closest('[data-testid="processing-status-name"]') as HTMLElement;
    expect(group).toHaveClass('min-w-0');
    expect(group).toHaveClass('flex-1');
    expect(name).toHaveClass('truncate');
    const status = within(group.parentElement as HTMLElement).getByText('Complete');
    expect(status).toHaveClass('shrink-0');
  });
});

describe('landing page', () => {
  it('shows a failure with Retry and unavailable totals instead of zeros', async () => {
    catalogueReply = http500;
    withProvider(<Home />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Catalogue and event totals are unavailable');
    const values = statValues();
    // Catalogues, Earthquake Events, Coverage.
    expect(values.slice(0, 2).every((v) => v.includes('—') && !/\b0\b/.test(v))).toBe(true);
    expect(values[2]).toBe('New Zealand');

    catalogueReply = ok(ROWS);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(statValues()[0]).toBe('2'));
  });

  it('shows real zeros for a successful empty list', async () => {
    catalogueReply = ok([]);
    withProvider(<Home />);
    await waitFor(() => expect(statValues().slice(0, 2)).toEqual(['0', '0']));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leads a guest to browsing, and explains that uploading needs Editor access', async () => {
    withProvider(<Home />);
    await waitFor(() => expect(statValues()[0]).toBe('2'));
    const browse = screen.getAllByRole('link', { name: 'Browse catalogues' });
    expect(browse[0]).toHaveAttribute('href', '/catalogues');
    expect(screen.queryByRole('link', { name: /Upload a catalogue/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get Started' })).not.toBeInTheDocument();
    expect(screen.getByText(/Uploading catalogues requires an account with Editor access/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to upload' })).toHaveAttribute('href', '/login?callbackUrl=%2Fupload');
  });

  it('tells a Viewer that Editor access is required and where to request it', async () => {
    mockRole = 'viewer';
    withProvider(<Home />);
    await waitFor(() => expect(statValues()[0]).toBe('2'));
    expect(screen.queryByRole('link', { name: /Upload a catalogue/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Your account has Viewer access/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request Editor access' })).toHaveAttribute('href', '/profile#request-access');
  });

  it('offers the upload entry to editors', async () => {
    mockRole = 'editor';
    withProvider(<Home />);
    await waitFor(() => expect(statValues()[0]).toBe('2'));
    expect(screen.getAllByRole('link', { name: /Upload a catalogue/ })[0]).toHaveAttribute('href', '/upload');
    expect(screen.queryByText(/requires an account with Editor access/)).not.toBeInTheDocument();
  });

  it('has one h1', async () => {
    withProvider(<Home />);
    await waitFor(() => expect(statValues()[0]).toBe('2'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('catalogue detail page', () => {
  it('names the back control, stacks the header and has one h1 with the full name', async () => {
    render(<CatalogueDetailPage />);
    const heading = await screen.findByRole('heading', { level: 1, name: LONG_NAME });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const back = screen.getByRole('link', { name: 'Back to catalogues' });
    expect(back).toHaveAttribute('href', '/catalogues');

    // Title group and actions stack below md and may shrink; badges wrap.
    const header = back.parentElement!.parentElement as HTMLElement;
    expect(header).toHaveClass('flex-col', 'md:flex-row');
    expect(heading.querySelector('span')).toHaveClass('min-w-0', 'break-words');
    expect(screen.getByTitle('Catalogue version').parentElement).toHaveClass('flex-wrap');
    expect(screen.getByRole('link', { name: 'View Map' })).toHaveAttribute('href', '/catalogues/cat-1/map');
  });

  it('explains a failed catalogue request with Retry rather than "not found"', async () => {
    catalogueReply = http500;
    render(<CatalogueDetailPage />);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Catalogue could not be loaded' });
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText('Catalogue not found')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to catalogues' })).toHaveAttribute('href', '/catalogues');
  });
});

describe('geographic search panel (finding 5)', () => {
  it('is one native button inside the heading, with aria-expanded and a focus ring', () => {
    render(<GeographicSearchPanel onSearch={jest.fn()} onClear={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Geographic Region Search' });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger.closest('h2')).not.toBeNull();
    expect(trigger.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
    expect(trigger.className).toMatch(/focus-visible:ring-2/);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls');
    expect(screen.getByRole('tab', { name: 'Interactive Map' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Manual Entry' })).toBeInTheDocument();
    // The tab list grows rather than clipping a wrapped label at 320 px.
    expect(screen.getByRole('tablist')).toHaveClass('h-auto');
    expect(screen.getByRole('button', { name: 'Clear region' })).toBeInTheDocument();
  });
});
