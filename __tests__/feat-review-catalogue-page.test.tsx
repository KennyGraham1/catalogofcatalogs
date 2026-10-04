/**
 * app/catalogues/[id]/page.tsx shows the merge review queue (contract M5) only for a merged
 * catalogue (one whose source_catalogues references other catalogues), and lets editors and
 * administrators decide while viewers only look. The queue itself is covered by
 * feat-review-queue.test.tsx; here it is a stub that records its props.
 */
import '@testing-library/jest-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cat-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));

let role = 'editor';
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role } }),
  usePermission: () => true,
}));

jest.mock('@/components/merge/ReviewQueue', () => ({
  ReviewQueue: (props: { catalogueId: string; canReview: boolean; catalogueNames?: Record<string, string> }) => (
    <div data-testid="review-queue-stub" data-catalogue={props.catalogueId} data-can-review={String(props.canReview)}>
      {JSON.stringify(props.catalogueNames ?? null)}
    </div>
  ),
}));

import CatalogueDetailPage from '@/app/catalogues/[id]/page';
import { clearAllCache } from '@/hooks/use-cached-fetch';

const MERGED = {
  id: 'cat-1', name: 'Merged catalogue', event_count: 1, status: 'complete', created_at: '2024-01-01T00:00:00Z',
  source_catalogues: JSON.stringify([
    { id: 'cat-a', name: 'GeoNet 2016', events: 10, source: 'GeoNet' },
    { id: 'cat-b', name: 'USGS ComCat', events: 8, source: 'USGS' },
  ]),
  merge_config: '{"mergeStrategy":"quality","onConflict":"hold"}',
};
const UPLOADED = {
  ...MERGED, name: 'Uploaded catalogue',
  source_catalogues: JSON.stringify([{ source: 'upload', filename: 'events.csv', format: 'csv' }]),
  merge_config: '{}',
};
const EVENTS = [
  { id: 'e1', time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4.0, quality_score: 95, quality_grade: 'A+' },
];

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body }) as unknown as Response;

const originalFetch = global.fetch;

function stubFetch(catalogue: Record<string, unknown>) {
  (global as any).fetch = jest.fn((input: any) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/catalogues') return Promise.resolve(jsonResponse([catalogue]));
    if (url.pathname === '/api/catalogues/cat-1/events') {
      return Promise.resolve(jsonResponse({ data: EVENTS, pagination: { hasMore: false, nextCursor: null, prevCursor: null, limit: 500 } }));
    }
    // The merge QC summary card (feat-merge-qc-summary.test.tsx): no stored summary here.
    if (url.pathname === '/api/catalogues/cat-1/merge-qc') {
      return Promise.resolve({ ok: false, status: 404, headers: { get: () => null }, json: async () => ({ error: 'Not found' }) } as unknown as Response);
    }
    throw new Error(`Unexpected fetch: ${url.pathname}${url.search}`);
  });
}

beforeEach(() => {
  clearAllCache();
  role = 'editor';
});

afterEach(() => {
  cleanup();
  (global as any).fetch = originalFetch;
});

async function renderPage(catalogue: Record<string, unknown>) {
  stubFetch(catalogue);
  render(<CatalogueDetailPage />);
  await screen.findByText(String(catalogue.name));
  await waitFor(() => expect(screen.getByText('Events')).toBeInTheDocument());
}

it('shows the review queue for a merged catalogue, with the source catalogue names, and lets an editor decide', async () => {
  await renderPage(MERGED);
  const stub = screen.getByTestId('review-queue-stub');
  expect(stub).toHaveAttribute('data-catalogue', 'cat-1');
  expect(stub).toHaveAttribute('data-can-review', 'true');
  expect(JSON.parse(stub.textContent || 'null')).toEqual({ 'cat-a': 'GeoNet 2016', 'cat-b': 'USGS ComCat' });
});

it('lets an administrator decide but not a viewer', async () => {
  role = 'admin';
  await renderPage(MERGED);
  expect(screen.getByTestId('review-queue-stub')).toHaveAttribute('data-can-review', 'true');
  cleanup();
  clearAllCache();

  role = 'viewer';
  await renderPage(MERGED);
  expect(screen.getByTestId('review-queue-stub')).toHaveAttribute('data-can-review', 'false');
});

it('shows no queue for an uploaded catalogue, whose source_catalogues references no other catalogue', async () => {
  await renderPage(UPLOADED);
  expect(screen.queryByTestId('review-queue-stub')).toBeNull();
});

it('shows no queue when source_catalogues is absent or unreadable', async () => {
  await renderPage({ ...MERGED, source_catalogues: undefined });
  expect(screen.queryByTestId('review-queue-stub')).toBeNull();
  cleanup();
  clearAllCache();
  await renderPage({ ...MERGED, source_catalogues: '{broken' });
  expect(screen.queryByTestId('review-queue-stub')).toBeNull();
});
