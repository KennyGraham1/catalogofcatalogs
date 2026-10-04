/**
 * The merge page's per-field rules, flagged-group handling and Median Values strategy
 * (contracts M1 and M4), driven through the real page. Only the network, the auth and
 * catalogue contexts, the client cache and the Leaflet maps (next/dynamic) are stubbed,
 * as in fix-merge-ui-page.test.tsx.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' }, isAuthenticated: true }),
}));

const mockCatalogues = [
  { id: 'cat-a', name: 'Alpha catalogue', event_count: 3, created_at: '2024-01-03T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
  { id: 'cat-b', name: 'Bravo catalogue', event_count: 2, created_at: '2024-01-02T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
  { id: 'cat-c', name: 'Charlie catalogue', event_count: 1, created_at: '2024-01-01T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
];
jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({ catalogues: mockCatalogues, loading: false, invalidateCache: () => {} }),
}));

jest.mock('@/lib/client-cache', () => ({
  invalidateCatalogueData: () => {},
  subscribeToCatalogueInvalidation: () => () => {},
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicStub() { return null; },
}));

import MergePage from '@/app/merge/page';

const MERGED_ID = 'merged-1';
let calls: Array<{ url: string; body?: any }> = [];
let mergeResponse: () => Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

async function fakeServer(input: any, init?: any) {
  const url = new URL(String(input), 'http://localhost');
  calls.push({ url: `${url.pathname}${url.search}`, body: init?.body ? JSON.parse(init.body) : undefined });
  if (url.pathname === '/api/merge' && init?.method === 'POST') return jsonResponse(mergeResponse());
  if (url.pathname === '/api/merge/preview' && init?.method === 'POST') {
    return jsonResponse({
      duplicateGroups: [],
      statistics: { totalEventsBefore: 6, totalEventsAfter: 3, duplicateGroupsCount: 0, duplicatesRemoved: 0, suspiciousGroupsCount: 0, heldForReviewCount: 0, supersededReportsCount: 0 },
      catalogueColors: {},
    });
  }
  if (url.pathname === `/api/catalogues/${MERGED_ID}/events`) {
    return jsonResponse({ data: [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 1000 } });
  }
  return jsonResponse({ error: `unexpected request ${url.pathname}` }, 404);
}

const originalFetch = global.fetch;
const originalResizeObserver = (global as any).ResizeObserver;

beforeEach(() => {
  calls = [];
  mergeResponse = () => ({ success: true, catalogueId: MERGED_ID, eventCount: 0, originalEventCount: 0 });
  (global as any).fetch = jest.fn(fakeServer);
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  (global as any).fetch = originalFetch;
  (global as any).ResizeObserver = originalResizeObserver;
});

function openConfiguration(...names: string[]) {
  render(<MergePage />);
  for (const name of names.length > 0 ? names : ['Alpha catalogue', 'Bravo catalogue']) {
    fireEvent.click(screen.getByRole('checkbox', { name }));
  }
  fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
}

async function choose(select: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: select }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

function goToPreview() {
  fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
}

async function generatePreview() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate QC Preview' }));
  await waitFor(() => expect(calls.some(c => c.url === '/api/merge/preview')).toBe(true));
  return calls.filter(c => c.url === '/api/merge/preview').pop()!.body;
}

async function startAndConfirmMerge(confirmLabel = 'Merge catalogues') {
  // A merge always follows a QC preview of the current settings: generate one if none is shown.
  const generate = screen.queryByRole('button', { name: 'Generate QC Preview' });
  if (generate) fireEvent.click(generate);
  await waitFor(() => expect(screen.getByRole('button', { name: /Start Merge/ })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /Start Merge/ }));
  fireEvent.click(await screen.findByRole('button', { name: confirmLabel }));
  await waitFor(() => expect(calls.some(c => c.url === '/api/merge')).toBe(true));
  return calls.find(c => c.url === '/api/merge')!.body;
}

describe('M1 field rules: request payload', () => {
  it('sends neither fieldRules nor onConflict when every control is at its default', async () => {
    openConfiguration();
    expect(screen.getByRole('combobox', { name: 'Depth' })).toHaveTextContent('Follow the strategy');
    expect(screen.getByRole('combobox', { name: 'Magnitude' })).toHaveTextContent('Follow the strategy');
    expect(screen.getByRole('combobox', { name: 'Focal mechanism' })).toHaveTextContent('Combine by network authority');
    expect(screen.getByRole('radio', { name: 'Resolve with the strategy' })).toBeChecked();
    goToPreview();
    const preview = await generatePreview();
    expect(preview.config).toEqual({ timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'newest' });
  });

  it('sends only the rules that differ from the default', async () => {
    openConfiguration();
    await choose('Depth', 'Best constrained');
    goToPreview();
    const preview = await generatePreview();
    expect(preview.config.fieldRules).toEqual({ depth: { rule: 'best-constrained' } });
    expect(preview.config).not.toHaveProperty('onConflict');
  });

  it('sends every non-default rule, with the mechanism default being hierarchy', async () => {
    openConfiguration();
    await choose('Magnitude', 'Most recent solution');
    await choose('Focal mechanism', 'Follow the strategy');
    goToPreview();
    const preview = await generatePreview();
    expect(preview.config.fieldRules).toEqual({
      magnitude: { rule: 'newest' },
      mechanism: { rule: 'strategy' },
    });
  });

  it('a catalogue rule carries the chosen catalogue id, defaulting to the first selected catalogue', async () => {
    openConfiguration('Alpha catalogue', 'Bravo catalogue', 'Charlie catalogue');
    await choose('Depth', 'A chosen catalogue');
    // The picker offers only the selected catalogues and starts on the first of them.
    const picker = screen.getByRole('combobox', { name: 'Depth from catalogue' });
    expect(picker).toHaveTextContent('Alpha catalogue');
    fireEvent.click(picker);
    const options = (await screen.findAllByRole('option')).map(option => option.textContent);
    expect(options).toEqual(['Alpha catalogue', 'Bravo catalogue', 'Charlie catalogue']);
    fireEvent.click(screen.getByRole('option', { name: 'Bravo catalogue' }));

    goToPreview();
    const preview = await generatePreview();
    expect(preview.config.fieldRules).toEqual({ depth: { rule: 'catalogue', catalogueId: 'cat-b' } });

    const merge = await startAndConfirmMerge();
    expect(merge.config.fieldRules).toEqual({ depth: { rule: 'catalogue', catalogueId: 'cat-b' } });
  });

  it('falls back to a selected catalogue when the picked one is deselected', async () => {
    openConfiguration('Alpha catalogue', 'Bravo catalogue', 'Charlie catalogue');
    await choose('Focal mechanism', 'A chosen catalogue');
    await choose('Focal mechanism from catalogue', 'Charlie catalogue');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Charlie catalogue' }));
    fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
    expect(screen.getByRole('combobox', { name: 'Focal mechanism from catalogue' })).toHaveTextContent('Alpha catalogue');
    goToPreview();
    const preview = await generatePreview();
    expect(preview.config.fieldRules).toEqual({ mechanism: { rule: 'catalogue', catalogueId: 'cat-a' } });
  });

  it('describes each rule exactly as the engine applies it', async () => {
    openConfiguration();
    const depth = screen.getByRole('combobox', { name: 'Depth' });
    expect(depth).toHaveAccessibleDescription(expect.stringMatching(/Average and Median Values take the best-constrained depth/));
    expect(depth).toHaveAccessibleDescription(expect.stringMatching(/own depth uncertainty and depth type/));
    await choose('Depth', 'Network authority');
    expect(depth).toHaveAccessibleDescription(expect.stringMatching(/highest-ranked network \(Settings › Merge authority\)/));
    await choose('Magnitude', 'Magnitude type preference');
    expect(screen.getByRole('combobox', { name: 'Magnitude' }))
      .toHaveAccessibleDescription(expect.stringMatching(/Mw first; below M6.2 local ML ahead of mb, from M6.2 Ms ahead/));
    expect(screen.getByRole('combobox', { name: 'Focal mechanism' }))
      .toHaveAccessibleDescription(expect.stringMatching(/no focal mechanism, the mechanisms are combined by network authority/));
  });
});

describe('M1 onConflict: flagged duplicate groups', () => {
  it('sends onConflict only when holding for review', async () => {
    openConfiguration();
    fireEvent.click(screen.getByRole('radio', { name: 'Hold for review' }));
    expect(screen.getByRole('radio', { name: 'Hold for review' }).parentElement).toHaveTextContent(/Merge provisionally and list them for review/);
    // The detail (nothing is dropped) is in the section's tooltip.
    fireEvent.focus(within(screen.getByText('Flagged groups').parentElement!).getByRole('button', { name: 'More information' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Holding never drops an entry/);
    goToPreview();
    const preview = await generatePreview();
    expect(preview.config.onConflict).toBe('hold');
    expect(preview.config).not.toHaveProperty('fieldRules');
    const merge = await startAndConfirmMerge();
    expect(merge.config.onConflict).toBe('hold');
  });

  it('a preview is discarded when a field rule or the conflict setting changes', async () => {
    openConfiguration();
    goToPreview();
    await generatePreview();
    // The preview replaces the generate button until the configuration changes.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Generate QC Preview' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await choose('Depth', 'Quality-based');
    goToPreview();
    expect(screen.getByRole('button', { name: 'Generate QC Preview' })).toBeInTheDocument();

    await generatePreview();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Generate QC Preview' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Hold for review' }));
    goToPreview();
    expect(screen.getByRole('button', { name: 'Generate QC Preview' })).toBeInTheDocument();
  });

  it('the merge summary lists the field rules and the conflict setting', async () => {
    openConfiguration();
    await choose('Depth', 'Best constrained');
    await choose('Magnitude', 'A chosen catalogue');
    await choose('Magnitude from catalogue', 'Bravo catalogue');
    fireEvent.click(screen.getByRole('radio', { name: 'Hold for review' }));
    goToPreview();
    expect(screen.getByTestId('summary-field-rules')).toHaveTextContent(
      'Depth: Best constrained · Magnitude: A chosen catalogue (Bravo catalogue) · Focal mechanism: Combine by network authority'
    );
    expect(screen.getByTestId('summary-on-conflict')).toHaveTextContent('Hold for review');
  });
});

describe('M4 Median Values strategy', () => {
  it('is offered, described as a component-wise median, and named in the summary', async () => {
    openConfiguration();
    await choose('Merge Strategy', 'Median Values');
    const help = screen.getByText(/median of the reported epicentres/);
    expect(help).toHaveTextContent(/latitude and longitude separately/);
    expect(help).toHaveTextContent(/median origin time/);
    expect(help).toHaveTextContent(/with two entries the median is their mean/);
    expect(help).toHaveTextContent(/depth from the best-constrained solution/);
    expect(help).toHaveTextContent(/No single entry's origin details/);
    // Under the field rules: magnitude and depth are selected, as for Average Values.
    expect(screen.getByText(/^Chosen by type: Mw first/)).toBeInTheDocument();
    expect(screen.getByText('Best-constrained depth; a fixed depth only when no solution has a free depth.')).toBeInTheDocument();

    goToPreview();
    expect(screen.getAllByText('Median Values').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^median$/i)).toBeNull();
    const preview = await generatePreview();
    expect(preview.config.mergeStrategy).toBe('median');
  });
});

describe('what the published depth and magnitude will be', () => {
  it('says magnitudes are kept as reported unless a rule or strategy selects by type', async () => {
    openConfiguration();
    // Default: Source Priority, both rules following the strategy.
    expect(screen.getByText('Kept as reported, not converted to Mw, so ML, mb and Mw can mix.')).toBeInTheDocument();
    expect(screen.getByText('From the entry the strategy picks.')).toBeInTheDocument();
    await choose('Magnitude', 'Magnitude type preference');
    expect(screen.getByText(/^Chosen by type: Mw first/)).toBeInTheDocument();
    await choose('Depth', 'Network authority');
    expect(screen.queryByText(/From the entry the strategy picks|Best-constrained depth; a fixed depth/)).toBeNull();
    // Matching behaviour sits with the matching settings; the old algorithm box is gone.
    expect(screen.getByText(/Events either side of 180° are matched/)).toBeInTheDocument();
    expect(screen.queryByText('Enhanced Merge Algorithm')).toBeNull();
  });
});

describe('network-authority help text points at the settings table', () => {
  it('says the ranking comes from Settings › Merge authority', async () => {
    openConfiguration();
    await choose('Source Priority', 'GeoNet > Others');
    expect(screen.getByRole('combobox', { name: 'Source Priority' }))
      .toHaveAccessibleDescription(expect.stringMatching(/configured in Settings › Merge authority/));
    expect(document.body).not.toHaveTextContent(/built-in network-authority ranking/);
    const label = screen.getByText('Source Priority', { selector: 'label' });
    fireEvent.focus(within(label.parentElement!).getByRole('button', { name: 'More information' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/Settings › Merge authority/);
    expect(tooltip).not.toHaveTextContent(/built-in/);
  });
});

describe('M4 held rows after a saved merge', () => {
  it('links to the catalogue page when the merge held rows for review', async () => {
    mergeResponse = () => ({ success: true, catalogueId: MERGED_ID, eventCount: 0, originalEventCount: 0, heldForReviewCount: 3 });
    openConfiguration();
    fireEvent.click(screen.getByRole('radio', { name: 'Hold for review' }));
    goToPreview();
    await startAndConfirmMerge();
    const link = await screen.findByRole('link', { name: 'Review 3 held events' });
    expect(link).toHaveAttribute('href', `/catalogues/${MERGED_ID}`);
    expect(screen.getByText(/3 events were held for review/)).toBeInTheDocument();
  });

  it('shows nothing when the response reports no held rows or lacks the field', async () => {
    openConfiguration();
    goToPreview();
    await startAndConfirmMerge();
    await screen.findByText(/events in merged catalogue/);
    expect(screen.queryByRole('link', { name: /held events?/ })).toBeNull();
  });

  it('shows nothing for an export-only merge, which has no catalogue page', async () => {
    mergeResponse = () => ({ success: true, catalogueId: null, eventCount: 0, originalEventCount: 0, events: [], heldForReviewCount: 2 });
    openConfiguration();
    fireEvent.click(screen.getByRole('checkbox', { name: /Export only/ }));
    goToPreview();
    await startAndConfirmMerge('Merge for export');
    await screen.findByText(/events in merged catalogue/);
    expect(screen.queryByRole('link', { name: /held events?/ })).toBeNull();
  });
});
