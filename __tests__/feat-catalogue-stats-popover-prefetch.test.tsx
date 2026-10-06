/**
 * The catalogue statistics popover shows what the catalogue list already knows (event
 * count, creation date, geographic bounds) the moment it opens, marks the rest as
 * loading, and requests the statistics as soon as the pointer rests on its trigger or
 * the trigger takes focus, with one request in flight per catalogue.
 */

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  CatalogueStatsPopover,
  STATISTICS_PREFETCH_DELAY_MS,
} from '@/components/catalogues/CatalogueStatsPopover';
import { formatLocalDate } from '@/lib/date-format';

const catalogue = {
  event_count: 218_345,
  created_at: '2026-03-04T05:06:07.000Z',
  min_latitude: -47.5,
  max_latitude: -34.25,
  min_longitude: 165.75,
  max_longitude: -177.5, // crosses the antimeridian
};

const statistics = {
  catalogueId: 'nz',
  version: '1.0.0',
  eventCount: 218_346,
  dateRange: { earliest: '2016-11-13T11:02:56.000Z', latest: '2024-12-31T12:30:00.000Z', spanDays: 2970 },
  magnitudeRange: { min: 1.2, max: 7.8, average: 2.61, median: 2.5 },
  depthRange: { min: 0, max: 600, average: 25.4 },
  magnitudeTypes: [{ type: 'ML', count: 200_000 }],
  qualityMetrics: {
    eventsWithUncertainty: 100_000, eventsWithHorizontalUncertainty: 100_000, eventsWithDepthUncertainty: 90_000,
    eventsWithFocalMechanism: 0, eventsWithQualityScore: 0, gradeDistribution: [],
  },
};

const originalFetch = global.fetch;
let resolveFetch: (() => void) | null;
let fetchMock: jest.Mock;

beforeEach(() => {
  resolveFetch = null;
  // Answers only when the test says so, so the loading state can be inspected.
  fetchMock = jest.fn(() => new Promise((resolve) => {
    resolveFetch = () => resolve({ ok: true, json: async () => statistics });
  }));
  global.fetch = fetchMock as any;
});
afterEach(async () => {
  // Settle whatever is still in flight so the next test starts with none.
  await act(async () => { resolveFetch?.(); });
  global.fetch = originalFetch;
});

const trigger = () => screen.getByRole('button', { name: /View statistics for New Zealand/ });
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

it('shows the event count, creation date and bounds at once, and marks the rest as loading', async () => {
  render(<CatalogueStatsPopover catalogueId="nz" catalogueName="New Zealand" catalogue={catalogue} />);
  fireEvent.click(trigger());

  const overview = screen.getByTestId('catalogue-stats-overview');
  expect(within(overview).getByText('218,345')).toBeInTheDocument();
  expect(within(overview).getByText(formatLocalDate(catalogue.created_at))).toBeInTheDocument();
  expect(within(overview).getByText('47.50°S to 34.25°S')).toBeInTheDocument();
  expect(within(overview).getByText('165.75°E to 177.50°W')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Loading statistics');
  expect(screen.queryByText('Time Period')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => { resolveFetch!(); });
  expect(await screen.findByText('Time Period')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  // The live count replaces the list's once it has arrived.
  expect(within(overview).getByText('218,346')).toBeInTheDocument();
});

it('says when the catalogue has no recorded bounds', () => {
  render(
    <CatalogueStatsPopover
      catalogueId="nz"
      catalogueName="New Zealand"
      catalogue={{ ...catalogue, min_latitude: null, max_latitude: null, min_longitude: null, max_longitude: null }}
    />
  );
  fireEvent.click(trigger());
  expect(within(screen.getByTestId('catalogue-stats-overview')).getByText('Not recorded')).toBeInTheDocument();
});

it('requests the statistics when the pointer rests on the trigger, and opening then reuses that request', async () => {
  render(<CatalogueStatsPopover catalogueId="nz" catalogueName="New Zealand" catalogue={catalogue} />);
  fireEvent.pointerEnter(trigger());
  expect(fetchMock).not.toHaveBeenCalled();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith('/api/catalogues/nz/statistics');

  await act(async () => { resolveFetch!(); });
  fireEvent.click(trigger());
  expect(screen.getByText('Time Period')).toBeInTheDocument(); // already there on open
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('requests the statistics when the trigger takes keyboard focus', async () => {
  render(<CatalogueStatsPopover catalogueId="nz" catalogueName="New Zealand" catalogue={catalogue} />);
  fireEvent.focus(trigger());
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});

it('requests nothing when the pointer only passes over the trigger', async () => {
  render(<CatalogueStatsPopover catalogueId="nz" catalogueName="New Zealand" catalogue={catalogue} />);
  fireEvent.pointerEnter(trigger());
  fireEvent.pointerLeave(trigger());
  await wait(STATISTICS_PREFETCH_DELAY_MS * 3);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps one request in flight per catalogue, however many triggers ask', async () => {
  render(
    <>
      <CatalogueStatsPopover catalogueId="nz" catalogueName="New Zealand" catalogue={catalogue} />
      <CatalogueStatsPopover catalogueId="nz" catalogueName="New Zealand again" catalogue={catalogue} />
    </>
  );
  const [first, second] = screen.getAllByRole('button', { name: /View statistics for New Zealand/ });
  fireEvent.pointerEnter(first);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(first);
  fireEvent.focus(second);
  await wait(STATISTICS_PREFETCH_DELAY_MS * 3);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await act(async () => { resolveFetch!(); });
  expect(await screen.findByText('Time Period')).toBeInTheDocument();
});

it('asks again on the next open when a request failed', async () => {
  fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }));
  render(<CatalogueStatsPopover catalogueId="nz" catalogueName="New Zealand" catalogue={catalogue} />);
  fireEvent.click(trigger());
  expect(await screen.findByText('Failed to load statistics')).toBeInTheDocument();
  // The known values stay on show.
  expect(within(screen.getByTestId('catalogue-stats-overview')).getByText('218,345')).toBeInTheDocument();

  fireEvent.click(trigger()); // close
  fireEvent.click(trigger()); // open again
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => { resolveFetch!(); });
  expect(await screen.findByText('Time Period')).toBeInTheDocument();
});
