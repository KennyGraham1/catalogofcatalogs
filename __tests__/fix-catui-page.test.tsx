/**
 * app/catalogues/[id]/page.tsx, driven through the real page, EventTable, EventFilters and
 * the real client-side event loader (only global.fetch, auth and the download plumbing are
 * stubbed):
 *
 *  - #65/#135: the "With Quality Score" card becomes a catalogue-level aggregate (mean Q and
 *    a grade distribution) instead of a count that was always 0.
 *  - C3: the catalogue version is shown.
 *  - FEATURE: minQuality/uncertainty filters (C4) in the event filter UI actually narrow the
 *    table.
 *  - FEATURE (C12): "Export filtered events" sends the active filters as query parameters to
 *    /api/catalogues/[id]/export.
 */
import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cat-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' } }),
  usePermission: () => true,
}));

import CatalogueDetailPage from '@/app/catalogues/[id]/page';
import { clearAllCache } from '@/hooks/use-cached-fetch';

const CATALOGUE = {
  id: 'cat-1', name: 'Test catalogue', event_count: 5, status: 'complete',
  created_at: '2024-01-01T00:00:00Z', version: '2.3.1',
};

/** Stored scores chosen so mean Q and the grade distribution are hand-verifiable. */
const EVENTS = [
  { id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.0, quality_score: 95, quality_grade: 'A+' },
  { id: 'e2', time: '2024-01-02T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.1, quality_score: 85, quality_grade: 'A' },
  { id: 'e3', time: '2024-01-03T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.2, quality_score: 70, quality_grade: 'B' },
  { id: 'e4', time: '2024-01-04T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.3, quality_score: 50, quality_grade: 'C' },
  { id: 'e5', time: '2024-01-05T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.4, quality_score: 20, quality_grade: 'F' },
];

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

let exportRequests: string[] = [];
const originalFetch = global.fetch;
const originalCreateObjectURL = (window.URL as any).createObjectURL;
const originalRevokeObjectURL = (window.URL as any).revokeObjectURL;
let anchorClick: jest.SpyInstance;

beforeEach(() => {
  clearAllCache();
  exportRequests = [];
  (global as any).fetch = jest.fn((input: any) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return Promise.resolve(jsonResponse([CATALOGUE]));
    if (url.pathname === '/api/catalogues/cat-1/events') {
      return Promise.resolve(jsonResponse({
        data: EVENTS,
        pagination: { hasMore: false, nextCursor: null, prevCursor: null, limit: 500 },
      }));
    }
    if (url.pathname === '/api/catalogues/cat-1/export') {
      exportRequests.push(url.search);
      return Promise.resolve({
        ok: true, status: 200, headers: { get: () => null },
        blob: async () => new Blob(['id,time'], { type: 'text/csv' }),
      } as unknown as Response);
    }
    throw new Error(`Unexpected fetch: ${url.pathname}${url.search}`);
  });
  (window.URL as any).createObjectURL = jest.fn(() => 'blob:test');
  (window.URL as any).revokeObjectURL = jest.fn();
  anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  anchorClick.mockRestore();
  (global as any).fetch = originalFetch;
  (window.URL as any).createObjectURL = originalCreateObjectURL;
  (window.URL as any).revokeObjectURL = originalRevokeObjectURL;
});

async function renderPage() {
  render(<CatalogueDetailPage />);
  await screen.findByText('Test catalogue');
  // Statistics cards only render once event loading completes ("complete" gate in the page).
  await waitFor(() => expect(screen.getByText('Mean Quality (Q)')).toBeInTheDocument());
}

describe('#65/#135 catalogue-level quality aggregate', () => {
  it('shows mean Q and a per-grade distribution, not a count of "has a score"', async () => {
    await renderPage();
    // (95+85+70+50+20)/5 = 64.
    const meanCard = screen.getByText('Mean Quality (Q)').closest('div')!.parentElement!;
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.queryByText('With Quality Score')).toBeNull();
    for (const [grade, count] of [['A+', '1'], ['A', '1'], ['B', '1'], ['C', '1'], ['F', '1']]) {
      expect(screen.getByText(`${grade}: ${count}`)).toBeInTheDocument();
    }
  });
});

describe('C3 catalogue version', () => {
  it('shows the stored version in the header', async () => {
    await renderPage();
    expect(screen.getByTitle('Catalogue version')).toHaveTextContent('v2.3.1');
  });
});

describe('FEATURE: minQuality filter narrows the event table', () => {
  it('applying "Minimum Quality Score" hides events below the threshold', async () => {
    await renderPage();
    expect(screen.getByText(/5 earthquake events in this catalogue/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(await screen.findByLabelText(/Minimum Quality Score/i), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    // e1(95), e2(85), e3(70) pass; e4(50) and e5(20) do not.
    await waitFor(() => expect(screen.getByText(/3 of 5 earthquake events match/)).toBeInTheDocument());
    expect(screen.queryByText('50 C')).toBeNull();
    expect(screen.queryByText('20 F')).toBeNull();
    expect(screen.getByText('95 A+')).toBeInTheDocument();
  });
});

describe('FEATURE (C12): Export filtered events', () => {
  it('is hidden with no active filters, and sends the active filters to the export route once one is set', async () => {
    await renderPage();
    expect(screen.queryByRole('button', { name: /Export filtered events/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(await screen.findByLabelText(/Minimum Quality Score/i), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    const exportButton = await screen.findByRole('button', { name: /Export filtered events/i });
    fireEvent.click(exportButton);

    await waitFor(() => expect(exportRequests.length).toBe(1));
    const params = new URLSearchParams(exportRequests[0]);
    expect(params.get('minQuality')).toBe('60');
    expect(params.get('format')).toBe('csv');
  });
});
