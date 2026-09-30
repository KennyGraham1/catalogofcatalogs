/**
 * components/merge/ReviewQueue.tsx (contract M5): the held events of a merged catalogue,
 * each with the group's reasons and its reports; a superseded report (an older vintage of
 * the same agency's solution) is shown but cannot be published; a decision is posted and
 * the lists and the "Needs review (N)" count follow the response without a reload.
 *
 * Only global.fetch and the toast are stubbed.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

import { toast } from '@/hooks/use-toast';
import { ReviewQueue } from '@/components/merge/ReviewQueue';

const KAIKOURA_UTC = '2016-11-13T11:02:56.000Z';

const REPORTS = [
  { catalogueId: 'cat-a', source: 'GeoNet', selected: true, originalData: { time: KAIKOURA_UTC, latitude: -42.69, longitude: 173.02, depth: 15.1, magnitude: 7.8, magnitude_type: 'Mw', used_station_count: 120, azimuthal_gap: 45 } },
  { catalogueId: 'cat-b', source: 'USGS', originalData: { time: '2016-11-13T11:02:59.000Z', latitude: -42.74, longitude: 173.05, depth: 22, magnitude: 7.8, magnitude_type: 'Mww', used_station_count: 88, azimuthal_gap: 30 } },
  { catalogueId: 'cat-a', source: 'GeoNet', superseded: true, originalData: { time: '2016-11-13T11:02:50.000Z', latitude: -42.6, longitude: 173.0, depth: 12, magnitude: 7.5, magnitude_type: 'ML' } },
];

function event(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    time: KAIKOURA_UTC,
    latitude: -42.69,
    longitude: 173.02,
    depth: 15.1,
    magnitude: 7.8,
    magnitude_type: 'Mw',
    review_status: 'pending',
    review_reasons: ['Depth range 9.9 km exceeds the threshold'],
    reviewed_by: null,
    reviewed_at: null,
    review_choice: null,
    merge_strategy: 'quality',
    source_events: REPORTS,
    ...over,
  };
}

type Call = { url: URL; init?: RequestInit };
let calls: Call[] = [];
let pendingPages: Record<string, unknown>[] = [];
let resolvedPage: Record<string, unknown> = { events: [], nextCursor: null, pendingCount: 0, resolvedCount: 0 };
let postResponse: (eventId: string, body: any) => { status: number; body: unknown };

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

beforeEach(() => {
  calls = [];
  (toast as jest.Mock).mockClear();
  pendingPages = [{ events: [event('evt-1'), event('evt-2')], nextCursor: null, pendingCount: 2, resolvedCount: 1 }];
  resolvedPage = {
    events: [event('evt-0', { review_status: 'resolved', review_choice: 'report:1', reviewed_by: 'kenny', reviewed_at: '2026-09-30T01:02:03.000Z' })],
    nextCursor: null, pendingCount: 2, resolvedCount: 1,
  };
  postResponse = (eventId, body) => ({
    status: 200,
    body: {
      event: {
        ...event(eventId, {
          review_status: 'resolved',
          review_choice: body.choice === 'keep' ? 'keep' : `report:${body.choice.report}`,
          reviewed_by: 'kenny',
          reviewed_at: '2026-09-30T01:02:03.000Z',
        }),
        // The POST returns the stored row: source_events is still JSON text there.
        source_events: JSON.stringify(REPORTS),
      },
      pendingCount: 1,
    },
  });
  (global as any).fetch = jest.fn(async (input: any, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push({ url, init });
    const post = /^\/api\/catalogues\/cat-m\/review\/([^/]+)$/.exec(url.pathname);
    if (post && init?.method === 'POST') {
      const { status, body } = postResponse(post[1], JSON.parse(String(init.body)));
      return json(status, body);
    }
    if (url.pathname === '/api/catalogues/cat-m/review') {
      if (url.searchParams.get('status') === 'resolved') return json(200, resolvedPage);
      const index = url.searchParams.get('after') ? 1 : 0;
      return json(200, pendingPages[index] ?? { events: [], nextCursor: null, pendingCount: 0, resolvedCount: 0 });
    }
    throw new Error(`Unexpected fetch: ${url.pathname}${url.search}`);
  });
});

afterEach(cleanup);

const postCalls = () => calls.filter(c => c.init?.method === 'POST');
const getCalls = () => calls.filter(c => !c.init?.method);

async function renderQueue(canReview = true) {
  render(<ReviewQueue catalogueId="cat-m" canReview={canReview} catalogueNames={{ 'cat-a': 'GeoNet 2016', 'cat-b': 'USGS ComCat' }} />);
  await screen.findByText('Needs review (2)');
}

describe('listing', () => {
  it('fetches the pending page on load and shows the count, reasons, reports and UTC times', async () => {
    await renderQueue();
    expect(getCalls()).toHaveLength(1);
    expect(getCalls()[0].url.search).toBe('?status=pending&limit=50');
    expect(screen.getAllByText('Depth range 9.9 km exceeds the threshold')).toHaveLength(2);

    const card = screen.getByTestId('review-event-evt-1');
    expect(within(card).getByText('M7.8 Mw')).toBeInTheDocument();
    // Origin times in UTC with the zone, never the host zone's calendar day.
    expect(within(card).getAllByText('13/11/2016, 11:02:56 UTC').length).toBeGreaterThan(0);
    expect(within(card).queryByText(/14\/11\/2016/)).toBeNull();

    // Reports are labelled by source catalogue name; stations and gap are shown.
    const first = within(card).getByTestId('review-report-evt-1-0');
    expect(within(first).getByText('GeoNet 2016')).toBeInTheDocument();
    expect(within(first).getByText('120')).toBeInTheDocument();
    expect(within(first).getByText('45°')).toBeInTheDocument();
    expect(within(first).getByText('Provisional')).toBeInTheDocument();
    const second = within(card).getByTestId('review-report-evt-1-1');
    expect(within(second).getByText('USGS ComCat')).toBeInTheDocument();
    expect(within(second).getByText('22.0')).toBeInTheDocument();
  });

  it('greys a superseded report, badges it and offers no publish button for it', async () => {
    await renderQueue();
    const card = screen.getByTestId('review-event-evt-1');
    const superseded = within(card).getByTestId('review-report-evt-1-2');
    expect(superseded).toHaveAttribute('aria-disabled', 'true');
    expect(superseded.className).toContain('opacity-50');
    expect(within(superseded).getByText('Superseded')).toBeInTheDocument();
    expect(within(superseded).queryByRole('button', { name: 'Publish this solution' })).toBeNull();
    // The two live reports each have one.
    expect(within(card).getAllByRole('button', { name: 'Publish this solution' })).toHaveLength(2);
    expect(within(card).getByRole('button', { name: 'Keep provisional solution' })).toBeInTheDocument();
  });

  it('shows no decision buttons to a viewer', async () => {
    await renderQueue(false);
    expect(screen.queryByRole('button', { name: 'Publish this solution' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep provisional solution' })).toBeNull();
    expect(screen.getAllByText('Superseded')).toHaveLength(2);
  });

  it('loads the next page through the cursor and appends it', async () => {
    pendingPages = [
      { events: [event('evt-1')], nextCursor: `${KAIKOURA_UTC}|evt-1`, pendingCount: 2, resolvedCount: 0 },
      { events: [event('evt-2')], nextCursor: null, pendingCount: 2, resolvedCount: 0 },
    ];
    await renderQueue();
    expect(screen.queryByTestId('review-event-evt-2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByTestId('review-event-evt-2');
    expect(getCalls()[1].url.searchParams.get('after')).toBe(`${KAIKOURA_UTC}|evt-1`);
    expect(screen.getByTestId('review-event-evt-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('fetches resolved events only when the collapsed list is opened, and shows the decision', async () => {
    await renderQueue();
    expect(getCalls().some(c => c.url.searchParams.get('status') === 'resolved')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Resolved \(1\)/ }));
    const card = await screen.findByTestId('review-event-evt-0');
    expect(getCalls().filter(c => c.url.searchParams.get('status') === 'resolved')).toHaveLength(1);
    expect(within(card).getByTestId('review-decision')).toHaveTextContent('Decision: published the USGS ComCat solution');
    expect(within(card).getByTestId('review-decision')).toHaveTextContent('by kenny');
    expect(within(card).getByText('Published')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Publish this solution' })).toBeNull();
  });

  it('shows the server\'s error when the queue cannot be loaded', async () => {
    (global as any).fetch = jest.fn(async () => json(500, { error: 'Failed to load the review queue' }));
    render(<ReviewQueue catalogueId="cat-m" canReview />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the review queue');
  });
});

describe('deciding', () => {
  it('publishes a report: posts the index, drops the event, and updates the count from the response', async () => {
    await renderQueue();
    const card = screen.getByTestId('review-event-evt-1');
    const second = within(card).getByTestId('review-report-evt-1-1');
    fireEvent.click(within(second).getByRole('button', { name: 'Publish this solution' }));

    await waitFor(() => expect(screen.queryByTestId('review-event-evt-1')).toBeNull());
    expect(postCalls()).toHaveLength(1);
    expect(postCalls()[0].url.pathname).toBe('/api/catalogues/cat-m/review/evt-1');
    expect(JSON.parse(String(postCalls()[0].init?.body))).toEqual({ choice: { report: 1 } });
    expect(screen.getByText('Needs review (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resolved \(2\)/ })).toBeInTheDocument();
    expect(screen.getByTestId('review-event-evt-2')).toBeInTheDocument();
    // No reload of the list was needed.
    expect(getCalls()).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review recorded' }));
  });

  it('keeps the provisional solution with choice "keep" and moves the event into an already open resolved list', async () => {
    await renderQueue();
    fireEvent.click(screen.getByRole('button', { name: /Resolved \(1\)/ }));
    await screen.findByTestId('review-event-evt-0');

    const card = screen.getByTestId('review-event-evt-2');
    fireEvent.click(within(card).getByRole('button', { name: 'Keep provisional solution' }));
    await waitFor(() => expect(screen.getByText('Needs review (1)')).toBeInTheDocument());
    expect(JSON.parse(String(postCalls()[0].init?.body))).toEqual({ choice: 'keep' });

    const moved = screen.getByTestId('review-event-evt-2');
    expect(within(moved).getByTestId('review-decision')).toHaveTextContent('Decision: kept the provisional solution');
    expect(within(moved).queryByRole('button', { name: 'Keep provisional solution' })).toBeNull();
    // The stored row's JSON-text source_events was parsed for the table.
    expect(within(moved).getByTestId('review-report-evt-2-2')).toHaveTextContent('Superseded');
    expect(screen.getByRole('button', { name: /Resolved \(2\)/ })).toBeInTheDocument();
  });

  it('toasts the server\'s message and keeps the event when the decision is refused', async () => {
    postResponse = () => ({ status: 409, body: { error: 'Event is not pending review', code: 'NOT_PENDING' } });
    await renderQueue();
    const card = screen.getByTestId('review-event-evt-1');
    fireEvent.click(within(card).getByRole('button', { name: 'Keep provisional solution' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review failed', description: 'Event is not pending review', variant: 'destructive',
    })));
    expect(screen.getByTestId('review-event-evt-1')).toBeInTheDocument();
    expect(screen.getByText('Needs review (2)')).toBeInTheDocument();
  });
});
