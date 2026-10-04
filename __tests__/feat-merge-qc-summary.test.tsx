/**
 * The merge QC summary (lib/merge-qc.ts MergeQcSummary) in its three places, against mocked
 * server responses:
 *   - MergeQcSummaryView: totals, per-catalogue table, pairwise differences (median ± robust
 *     σ, 5-95 % range, by magnitude-type pair), the systematic-offset and window-use notes,
 *     and the JSON / CSV downloads (server route for a saved catalogue, else built here);
 *   - MergeQcCard on a merged catalogue's page: collapsible, hidden on 404;
 *   - the merge page: one merge action (the footer's Start Merge), enabled only by a QC
 *     preview of the current settings, and the summary the merge route returns.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { qcListedGroupsCsv, type MergeQcSummary } from '@/lib/merge-qc';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cat-m' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' }, isAuthenticated: true }),
  usePermission: () => true,
}));
const mockCatalogues = [
  { id: 'cat-gn', name: 'Synthetic GeoNet-like', event_count: 4443, created_at: '2024-01-03T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
  { id: 'cat-b', name: 'Synthetic Agency B catalogue', event_count: 3000, created_at: '2024-01-02T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
];
jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({ catalogues: mockCatalogues, loading: false, invalidateCache: () => {} }),
}));
jest.mock('@/lib/client-cache', () => ({
  invalidateCatalogueData: () => {},
  subscribeToCatalogueInvalidation: () => () => {},
}));
// The QC panel and the result map load through next/dynamic (Leaflet); the page tests only
// need the wizard around them.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicStub() { return null; },
}));
jest.mock('@/components/merge/ReviewQueue', () => ({
  ReviewQueue: () => <div data-testid="review-queue-stub" />,
}));

import { MergeQcSummaryView } from '@/components/merge/MergeQcSummaryView';
import { MergeQcCard } from '@/components/merge/MergeQcCard';
import { listedGroupsCsv, magnitudeOffsetNotes, windowUseNotes } from '@/components/merge/qc-format';
import MergePage from '@/app/merge/page';
import CatalogueDetailPage from '@/app/catalogues/[id]/page';
import { clearAllCache } from '@/hooks/use-cached-fetch';

const A = { id: 'cat-gn', name: 'Synthetic GeoNet-like' };
const B = { id: 'cat-b', name: 'Synthetic Agency B catalogue' };

const SUMMARY: MergeQcSummary = {
  version: 1,
  generatedAt: '2026-10-04T09:15:00.000Z',
  generatedBy: 'Earthquake Catalogue Platform 1.4.0',
  config: { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', onConflict: 'hold' },
  sourceCatalogues: [A, B],
  totals: {
    entriesBefore: 7443, eventsAfter: 5400, matchedGroups: 1950, entriesCombined: 2043, flaggedGroups: 3,
    keptApartEntries: 4, splits: 2, heldForReview: 3, supersededEntries: 12,
  },
  perCatalogue: [
    { ...A, entries: 4443, matched: 1950, unique: 2493, published: 900, superseded: 12 },
    { ...B, entries: 3000, matched: 1890, unique: 1110, published: 1050, superseded: 0 },
  ],
  pairwise: [{
    catalogueA: A,
    catalogueB: B,
    pairs: 1915,
    originTime: { n: 1915, median: 0.42, robustSigma: 0.31, p05: -0.1, p95: 0.9 },
    epicentre: { n: 1915, median: 3.2, p90: 8.1, p95: 10.4, max: 24.9 },
    depth: { n: 1200, median: -1.5, robustSigma: 2.2, p05: -6, p95: 3.1 },
    magnitude: { n: 1915, median: 0.14, robustSigma: 0.22, p05: -0.21, p95: 0.5 },
    magnitudeByType: [
      { typeA: 'ML', typeB: 'ML', stats: { n: 1890, median: 0.15, robustSigma: 0.21, p05: -0.2, p95: 0.48 } },
      // Too few pairs for a note, however large the offset.
      { typeA: 'mb', typeB: 'mw', stats: { n: 25, median: -0.3, robustSigma: 0.2, p05: -0.6, p95: 0 } },
    ],
  }],
  windowUse: { nearTimeLimit: 120, nearDistanceLimit: 15, matchedPairs: 1890 },
  listedGroups: [{
    id: 'evt-1',
    kinds: ['flagged', 'held'],
    reasons: ['Large magnitude range: 0.9', 'Ambiguous match'],
    publishedIndex: 1,
    splitKey: null,
    entries: [
      { catalogueId: A.id, catalogueName: A.name, sourceId: '2022p301234', time: '2022-04-23T02:16:39.120Z', latitude: -41.2, longitude: 174.8, depth: 12.3, magnitude: 3.4, magnitudeType: 'ML', qualityScore: 64 },
      { catalogueId: B.id, catalogueName: B.name, sourceId: '=HYPERLINK("x")', time: '2022-04-23T02:16:40Z', latitude: -41.25, longitude: 174.85, depth: null, magnitude: 4.3, magnitudeType: 'ML', qualityScore: 82 },
    ],
  }],
  listedGroupsTotal: 1,
};

// ── Download capture ───────────────────────────────────────────────────────────────────

let downloads: Array<{ blob: Blob; filename: string }> = [];
let pendingBlobs: Blob[] = [];
const originalCreateObjectURL = (window.URL as any).createObjectURL;
const originalRevokeObjectURL = (window.URL as any).revokeObjectURL;
const originalFetch = global.fetch;
const originalResizeObserver = (global as any).ResizeObserver;
let anchorClick: jest.SpyInstance;

const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  downloads = [];
  pendingBlobs = [];
  clearAllCache();
  (window.URL as any).createObjectURL = jest.fn((blob: Blob) => { pendingBlobs.push(blob); return 'blob:qc-test'; });
  (window.URL as any).revokeObjectURL = jest.fn();
  anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ blob: pendingBlobs.shift()!, filename: this.download });
  });
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  anchorClick.mockRestore();
  (window.URL as any).createObjectURL = originalCreateObjectURL;
  (window.URL as any).revokeObjectURL = originalRevokeObjectURL;
  (global as any).fetch = originalFetch;
  (global as any).ResizeObserver = originalResizeObserver;
});

// ── MergeQcSummaryView ─────────────────────────────────────────────────────────────────

describe('MergeQcSummaryView', () => {
  it('shows the totals, with Held for review when the merge held groups', () => {
    render(<MergeQcSummaryView summary={SUMMARY} />);
    const tile = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;
    expect(within(tile('Entries before')).getByText('7,443')).toBeInTheDocument();
    expect(within(tile('Events after')).getByText('5,400')).toBeInTheDocument();
    expect(within(tile('Matched groups')).getByText('1,950')).toBeInTheDocument();
    expect(within(tile('Entries combined')).getByText('2,043')).toBeInTheDocument();
    expect(within(tile('Flagged groups')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Held for review')).getByText('3')).toBeInTheDocument();
    // Only flags are coloured.
    expect(tile('Entries before').className).not.toMatch(/amber|red|green|blue|purple|orange/);
    expect(tile('Flagged groups').className).toMatch(/amber/);
    expect(screen.getByText(/4 entries were matched but kept apart \(2 failed groups\)/)).toBeInTheDocument();
    expect(screen.getByText(/12 superseded entries/)).toBeInTheDocument();
  });

  it('tabulates each catalogue: entries, matched with %, only here, published, superseded', () => {
    render(<MergeQcSummaryView summary={SUMMARY} />);
    const table = screen.getByRole('table', { name: 'Matching per source catalogue' });
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'Catalogue', 'Entries', 'Matched', 'Only in this catalogue', 'Published from it', 'Superseded',
    ]);
    const row = within(table).getByRole('rowheader', { name: B.name }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['3,000', '1,890 (63.0 %)', '1,110', '1,050', '0']);
  });

  it('gives the pairwise differences as median ± robust σ and the 5-95 % range, by magnitude type', () => {
    render(<MergeQcSummaryView summary={SUMMARY} />);
    const table = screen.getByRole('table', { name: `${B.name} minus ${A.name}: differences between matched solutions` });
    const cells = (label: string) => within(within(table).getByRole('rowheader', { name: label }).closest('tr')!)
      .getAllByRole('cell').map(cell => cell.textContent);
    expect(cells('Origin time (s)')).toEqual(['1,915', '+0.42 ± 0.31', '−0.10 to +0.90']);
    expect(cells('Epicentral separation (km)')).toEqual(['1,915', '3.2', '95 % within 10.4; max 24.9']);
    expect(cells('Depth (km), computed depths only')).toEqual(['1,200', '−1.5 ± 2.2', '−6.0 to +3.1']);
    expect(cells('Magnitude, all types')).toEqual(['1,915', '+0.14 ± 0.22', '−0.21 to +0.50']);
    expect(cells('Magnitude, ML − ML')).toEqual(['1,890', '+0.15 ± 0.21', '−0.20 to +0.48']);
    expect(cells('Magnitude, Mw − mb')).toEqual(['25', '−0.30 ± 0.20', '−0.60 to 0.00']);
  });

  it('notes a likely systematic magnitude offset in plain language', () => {
    render(<MergeQcSummaryView summary={SUMMARY} />);
    const notes = screen.getByTestId('magnitude-offset-notes');
    expect(within(notes).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Synthetic Agency B catalogue ML is 0.15 higher than Synthetic GeoNet-like ML (median of 1,890 pairs)',
    ]);
  });

  it('applies the offset thresholds: |median| ≥ 0.1 over n ≥ 30, overall when no type pairs', () => {
    const pair = SUMMARY.pairwise[0];
    const stats = (median: number, n: number) => ({ n, median, robustSigma: 0.2, p05: -0.5, p95: 0.5 });
    const notes = (magnitudeByType: typeof pair.magnitudeByType, magnitude = pair.magnitude) =>
      magnitudeOffsetNotes({ pairwise: [{ ...pair, magnitude, magnitudeByType }] });
    expect(notes([{ typeA: 'ML', typeB: 'ML', stats: stats(0.09, 500) }])).toEqual([]);
    expect(notes([{ typeA: 'ML', typeB: 'ML', stats: stats(0.1, 30) }])).toHaveLength(1);
    expect(notes([{ typeA: 'ML', typeB: 'ML', stats: stats(-0.25, 29) }])).toEqual([]);
    expect(notes([{ typeA: 'ML', typeB: 'MLv', stats: stats(-0.25, 40) }])).toEqual([
      'Synthetic Agency B catalogue MLv is 0.25 lower than Synthetic GeoNet-like ML (median of 40 pairs)',
    ]);
    expect(notes([], stats(0.2, 100))).toEqual([
      'Synthetic Agency B catalogue magnitudes are 0.20 higher than Synthetic GeoNet-like magnitudes (median of 100 pairs, all magnitude types)',
    ]);
  });

  it('says how many matched pairs came close to the window edges', () => {
    render(<MergeQcSummaryView summary={SUMMARY} />);
    expect(within(screen.getByTestId('window-use-notes')).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      '120 of 1,890 matched pairs used more than 80 % of the time window: results are sensitive to the thresholds',
      '15 of 1,890 matched pairs used more than 80 % of the distance window',
    ]);
    expect(windowUseNotes({ nearTimeLimit: 0, nearDistanceLimit: 0, matchedPairs: 10 })).toEqual([
      'None of the 10 matched pairs used more than 80 % of the time or distance window.',
    ]);
  });

  it('downloads the summary as JSON', async () => {
    render(<MergeQcSummaryView summary={SUMMARY} fileBaseName="NZ merge" />);
    fireEvent.click(screen.getByRole('button', { name: /Summary \(JSON\)/ }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('nz_merge_merge_qc_20261004_091500.json');
    expect(JSON.parse(await readBlob(downloads[0].blob))).toEqual(SUMMARY);
  });

  it('builds the group CSV here when no saved catalogue serves it', async () => {
    (global as any).fetch = jest.fn();
    render(<MergeQcSummaryView summary={SUMMARY} fileBaseName="NZ merge" />);
    fireEvent.click(screen.getByRole('button', { name: /Flagged, kept-apart and held groups \(CSV\)/ }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(downloads[0].filename).toBe('nz_merge_merge_qc_groups_20261004_091500.csv');
    // The same file the merge-qc CSV route serves (one builder, lib/merge-qc.ts).
    const csv = await readBlob(downloads[0].blob);
    expect(csv).toBe(qcListedGroupsCsv(SUMMARY));
    expect(csv.trimEnd().split('\n')).toEqual([
      'Group ID,Kinds,Reasons,Published,Catalogue,Source ID,Origin time (UTC),Latitude,Longitude,Depth (km),Magnitude,Magnitude type,Quality score',
      'evt-1,flagged; held,Large magnitude range: 0.9 | Ambiguous match,no,Synthetic GeoNet-like,2022p301234,2022-04-23T02:16:39.120Z,-41.2,174.8,12.3,3.4,ML,64',
      // A source id a spreadsheet would run as a formula is neutralised; null depth stays empty.
      'evt-1,flagged; held,Large magnitude range: 0.9 | Ambiguous match,yes,Synthetic Agency B catalogue,"\'=HYPERLINK(""x"")",2022-04-23T02:16:40.000Z,-41.25,174.85,,4.3,ML,82',
    ]);
    expect(listedGroupsCsv([])).toBe(qcListedGroupsCsv({ listedGroups: [] }));
  });

  it('uses the merge-qc CSV route for a saved catalogue, and falls back when it fails', async () => {
    const SERVER_CSV = 'group_id,kinds\nevt-1,flagged\n';
    (global as any).fetch = jest.fn(async (input: any) => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-disposition' ? 'attachment; filename="merged_qc_groups.csv"' : 'text/csv') },
      blob: async () => new Blob([SERVER_CSV], { type: 'text/csv' }),
      url: String(input),
    }));
    render(<MergeQcSummaryView summary={SUMMARY} catalogueId="cat-m" />);
    const button = screen.getByRole('button', { name: /Flagged, kept-apart and held groups \(CSV\)/ });
    fireEvent.click(button);
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/catalogues/cat-m/merge-qc?format=csv');
    expect(downloads[0].filename).toBe('merged_qc_groups.csv');
    expect(await readBlob(downloads[0].blob)).toBe(SERVER_CSV);

    (global as any).fetch = jest.fn(async () => jsonResponse({ error: 'boom' }, 500));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(await readBlob(downloads[1].blob)).toBe(qcListedGroupsCsv(SUMMARY));
  });

  it('has nothing to download as CSV when no group was listed', () => {
    render(<MergeQcSummaryView summary={{ ...SUMMARY, listedGroups: [], listedGroupsTotal: 0 }} />);
    expect(screen.getByRole('button', { name: /groups \(CSV\)/ })).toBeDisabled();
    expect(screen.getByText(/No group was flagged, kept apart or held/)).toBeInTheDocument();
  });

  it('says when the listed groups were capped', () => {
    render(<MergeQcSummaryView summary={{ ...SUMMARY, listedGroupsTotal: 7123 }} />);
    expect(screen.getByText('The CSV lists the 1 most severe of 7,123 groups, one row per entry.')).toBeInTheDocument();
  });
});

// ── MergeQcCard and the catalogue page ─────────────────────────────────────────────────

describe('Merge QC summary card on the catalogue page', () => {
  function stubQcRoute(response: () => unknown) {
    (global as any).fetch = jest.fn(async (input: any) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/catalogues/cat-m/merge-qc') return response();
      return jsonResponse({ error: 'unexpected' }, 404);
    });
  }

  it('renders nothing when the catalogue has no summary (404)', async () => {
    stubQcRoute(() => jsonResponse({ error: 'Not found' }, 404));
    const { container } = render(<MergeQcCard catalogueId="cat-m" />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a collapsed card that opens onto the summary', async () => {
    stubQcRoute(() => jsonResponse(SUMMARY));
    render(<MergeQcCard catalogueId="cat-m" catalogueName="NZ merged" />);
    const card = await screen.findByTestId('merge-qc-card');
    expect(within(card).getByText('Merge QC summary')).toBeInTheDocument();
    expect(within(card).getByText(/7,443 entries from 2 catalogues merged into 5,400 events; 1,950 matched, 3 flagged\./)).toBeInTheDocument();
    expect(within(card).getByText(/Generated 2026-10-04 09:15:00 UTC/)).toBeInTheDocument();
    expect(screen.queryByTestId('merge-qc-summary')).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: /Show summary/ }));
    expect(await screen.findByTestId('merge-qc-summary')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Matching per source catalogue' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Hide summary/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('reports a failure other than 404 and can retry', async () => {
    let status = 500;
    stubQcRoute(() => (status === 500 ? jsonResponse({ error: 'boom' }, 500) : jsonResponse(SUMMARY)));
    render(<MergeQcCard catalogueId="cat-m" />);
    expect(await screen.findByText(/The merge QC summary could not be loaded/)).toBeInTheDocument();
    status = 200;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /Show summary/ })).toBeInTheDocument();
  });

  describe('in the catalogue page', () => {
    const MERGED = {
      id: 'cat-m', name: 'Merged catalogue', event_count: 1, status: 'complete', created_at: '2024-01-01T00:00:00Z',
      source_catalogues: JSON.stringify([{ id: A.id, name: A.name }, { id: B.id, name: B.name }]),
      merge_config: '{"mergeStrategy":"quality"}',
    };
    const EVENTS = [{ id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.0, quality_score: 95, quality_grade: 'A+' }];

    function stubPage(catalogue: Record<string, unknown>, qcStatus: 200 | 404) {
      (global as any).fetch = jest.fn(async (input: any) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === '/api/catalogues') return jsonResponse([catalogue]);
        if (url.pathname === '/api/catalogues/cat-m/events') {
          return jsonResponse({ data: EVENTS, pagination: { hasMore: false, nextCursor: null, prevCursor: null, limit: 500 } });
        }
        if (url.pathname === '/api/catalogues/cat-m/merge-qc') {
          return qcStatus === 200 ? jsonResponse(SUMMARY) : jsonResponse({ error: 'Not found' }, 404);
        }
        return jsonResponse({ error: `unexpected ${url.pathname}` }, 404);
      });
    }

    const qcCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([input]) => String(input).includes('/merge-qc'));

    it('shows the card for a merged catalogue with a summary', async () => {
      stubPage(MERGED, 200);
      render(<CatalogueDetailPage />);
      expect(await screen.findByTestId('merge-qc-card')).toBeInTheDocument();
    });

    it('shows nothing when the route answers 404', async () => {
      stubPage(MERGED, 404);
      render(<CatalogueDetailPage />);
      await screen.findByText('Merged catalogue');
      await waitFor(() => expect(qcCalls()).toHaveLength(1));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.queryByTestId('merge-qc-card')).toBeNull();
      expect(screen.queryByText('Merge QC summary')).toBeNull();
    });

    it('does not ask for a summary of a catalogue that was not merged', async () => {
      stubPage({ ...MERGED, name: 'Uploaded catalogue', source_catalogues: JSON.stringify([{ source: 'upload', filename: 'e.csv' }]) }, 200);
      render(<CatalogueDetailPage />);
      await screen.findByText('Uploaded catalogue');
      await waitFor(() => expect(screen.getByText('Events')).toBeInTheDocument());
      expect(qcCalls()).toHaveLength(0);
      expect(screen.queryByTestId('merge-qc-card')).toBeNull();
    });
  });
});

// ── The merge page ─────────────────────────────────────────────────────────────────────

describe('merge page: one merge action, after a QC preview', () => {
  let calls: Array<{ url: string; body?: any }> = [];

  beforeEach(() => {
    calls = [];
    (global as any).fetch = jest.fn(async (input: any, init?: any) => {
      const url = new URL(String(input), 'http://localhost');
      calls.push({ url: `${url.pathname}${url.search}`, body: init?.body ? JSON.parse(init.body) : undefined });
      if (url.pathname === '/api/merge/preview' && init?.method === 'POST') {
        return jsonResponse({
          duplicateGroups: [], matchedListed: 0, matchedTotal: 1950,
          statistics: {
            totalEventsBefore: 7443, totalEventsAfter: 5400, duplicateGroupsCount: 1950, duplicatesRemoved: 2043,
            suspiciousGroupsCount: 3, heldForReviewCount: 0, supersededReportsCount: 12, separatedReportsCount: 4,
          },
          catalogueColors: {},
          qc: SUMMARY,
        });
      }
      if (url.pathname === '/api/merge' && init?.method === 'POST') {
        return jsonResponse({ success: true, catalogueId: 'merged-1', eventCount: 0, originalEventCount: 7443, heldForReviewCount: 3, qc: SUMMARY });
      }
      if (url.pathname === '/api/catalogues/merged-1/events') {
        return jsonResponse({ data: [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 1000 } });
      }
      return jsonResponse({ error: `unexpected request ${url.pathname}` }, 404);
    });
  });

  function openPreviewStep() {
    render(<MergePage />);
    for (const name of [A.name, B.name]) fireEvent.click(screen.getByRole('checkbox', { name }));
    fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
    fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
  }

  const startMerge = () => screen.getByRole('button', { name: /Start Merge/ });

  it('keeps Start Merge disabled, with a hint, until a preview of the current settings exists', async () => {
    openPreviewStep();
    expect(startMerge()).toBeDisabled();
    expect(startMerge()).toHaveAccessibleDescription('Generate the QC preview first');
    expect(screen.getAllByRole('button', { name: /Merge/ }).map(button => button.textContent)).not.toContain('Proceed with Merge');

    fireEvent.click(screen.getByRole('button', { name: 'Generate QC Preview' }));
    await waitFor(() => expect(startMerge()).toBeEnabled());
    expect(screen.queryByText('Generate the QC preview first')).toBeNull();
    expect(startMerge()).not.toHaveAccessibleDescription();

    // A changed setting invalidates the preview: the merge needs a new one.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time window in seconds' }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
    expect(startMerge()).toBeDisabled();
    expect(screen.getByText('Generate the QC preview first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate QC Preview' })).toBeInTheDocument();
  });

  it('a changed selection invalidates the preview too', async () => {
    openPreviewStep();
    fireEvent.click(screen.getByRole('button', { name: 'Generate QC Preview' }));
    await waitFor(() => expect(startMerge()).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('checkbox', { name: B.name }));
    fireEvent.click(screen.getByRole('checkbox', { name: B.name }));
    fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
    fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
    expect(startMerge()).toBeDisabled();
  });

  it('confirms with the previewed counts and shows the merge QC summary afterwards, held alert kept', async () => {
    openPreviewStep();
    fireEvent.click(screen.getByRole('button', { name: 'Generate QC Preview' }));
    await waitFor(() => expect(startMerge()).toBeEnabled());
    fireEvent.click(startMerge());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('(5,400 events, as in the QC preview).');
    expect(dialog).toHaveTextContent("3 flagged groups are published with the strategy's solution.");
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge catalogues' }));

    const summary = await screen.findByTestId('completed-merge-qc');
    expect(within(summary).getByText('Merge QC summary')).toBeInTheDocument();
    expect(within(summary).getByText('Kept with the merged catalogue and shown on its page.')).toBeInTheDocument();
    expect(within(summary).getByTestId('magnitude-offset-notes')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Review 3 held events' })).toHaveAttribute('href', '/catalogues/merged-1');
    expect(screen.getByText(/3 events were held for review/)).toBeInTheDocument();

    // The saved catalogue serves the CSV.
    fireEvent.click(within(summary).getByRole('button', { name: /groups \(CSV\)/ }));
    await waitFor(() => expect(calls.map(call => call.url)).toContain('/api/catalogues/merged-1/merge-qc?format=csv'));
  });
});
