/**
 * UI audit, 5 October 2026: the Analytics page's findings.
 *
 *  1   Magnitude and depth ranges show a thumb for each bound, with exact inputs, and
 *      moving the MAXIMUM changes the filtered sample (a track click could change the
 *      hidden upper bound before).
 *  3   The selected-catalogue header stacks; the selector is full width below md.
 *  4   Loading, empty, failed and stale catalogue lists are told apart; a failure says
 *      what failed and offers Retry; unavailable counts are never shown as 0.
 *  7   Filter thumbs and selectors are named by the visible labels of their purpose.
 *  9   An HTTP 401 on the events offers Sign in, with a callback to this page, not Retry.
 *  12  One h1 in every state; sections are h2.
 *
 * The real Slider, NumericRangeInputs, Select and CatalogueProvider run here (fetch is
 * stubbed); the map, the charts and the analysis workers are stubbed boundaries.
 */
import '@testing-library/jest-dom';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SessionContext } from 'next-auth/react';
import { Slider } from '@/components/ui/slider';
import { NumericRangeInputs } from '@/components/ui/numeric-range-inputs';
import { CatalogueProvider } from '@/contexts/CatalogueContext';
import { invalidateCatalogueData } from '@/lib/client-cache';
import AnalyticsPage from '@/app/analytics/page';

jest.mock('next/navigation', () => ({ usePathname: () => '/analytics' }));
let mockMapMounts = 0;
jest.mock('next/dynamic', () => () => function MockMap({ earthquakes }: { earthquakes: unknown[] }) {
  // Counts mounts: reloading the events passes through the loading screen, remounting it.
  require('react').useEffect(() => { mockMapMounts++; }, []);
  return <div data-testid="map">{earthquakes.length} events on map</div>;
});
jest.mock('@/hooks/use-seismological-worker', () => ({
  useSeismologicalAnalyses: () => ({
    grAnalysis: { data: null, error: null }, completeness: { data: null, error: null },
    temporalAnalysis: { data: null, error: null }, timeSeriesAnalysis: { data: null, error: null },
    momentAnalysis: { data: null, error: null }, anyLoading: false,
  }),
}));
jest.mock('@/components/charts', () => Object.fromEntries([
  'MagnitudeDistributionChart', 'DepthDistributionChart', 'RegionDistributionChart', 'CatalogueDistributionChart',
  'MagnitudeDepthScatter', 'MagnitudeTimeScatter', 'EventTimelineChart', 'GutenbergRichterChart', 'CompletenessChart',
  'TemporalSeriesChart', 'MomentReleaseChart', 'CumulativeReleaseChart', 'GoodnessOfFitChart', 'BValueStabilityChart',
  'MFDComparisonChart',
].map(name => [name, () => null])));

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Reply => ({ ok: true, status: 200, json: async () => body });
const failed = (status: number): Reply => ({ ok: false, status, json: async () => ({ error: 'refused' }) });

const CATALOGUE_A = { id: 'a', name: 'Catalogue A', event_count: 6 };
// Magnitudes 2-7, depths 5-300 km.
const ROWS = [2, 3, 4, 5, 6, 7].map((magnitude, i) => ({
  id: `e${i}`, time: '2024-01-01T00:00:00Z', magnitude, depth: [5, 10, 20, 50, 100, 300][i],
  latitude: -41, longitude: 175, region: 'Wellington',
}));

let listReply: () => Promise<Reply> | Reply;
let eventsReply: () => Promise<Reply> | Reply;

const originalFetch = global.fetch;
const originalResizeObserver = global.ResizeObserver;

beforeEach(() => {
  listReply = () => ok([CATALOGUE_A]);
  eventsReply = () => ok({ data: ROWS, pagination: { hasMore: false, nextCursor: null } });
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
  global.fetch = jest.fn(async (url: string) => (url === '/api/catalogues' ? listReply() : eventsReply())) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  global.ResizeObserver = originalResizeObserver;
});

const guestSession = { data: null, status: 'unauthenticated' as const, update: async () => null };

function renderPage(session?: typeof guestSession) {
  const page = <CatalogueProvider autoRefreshInterval={0}><AnalyticsPage /></CatalogueProvider>;
  return render(session ? <SessionContext.Provider value={session}>{page}</SessionContext.Provider> : page);
}

async function openCatalogueA() {
  renderPage();
  fireEvent.click(await screen.findByRole('combobox', { name: 'Catalogue to analyse' }));
  fireEvent.click(await screen.findByRole('option', { name: /Catalogue A/ }));
  await screen.findByText('6 of 6 events');
}

function expectOnePageTitle() {
  const titles = screen.getAllByRole('heading', { level: 1 });
  expect(titles).toHaveLength(1);
  expect(titles[0]).toHaveTextContent('Visualization & Analytics');
}

// ---------------------------------------------------------------------------------
// The shared Slider
// ---------------------------------------------------------------------------------
describe('Slider: one named thumb per value', () => {
  it('names each thumb of a range labelled by a visible label, with its own value text', () => {
    render(<>
      <span id="mag-label">Magnitude</span>
      <Slider aria-labelledby="mag-label" min={-3} max={10} step={0.1} value={[2, 10]} onValueChange={() => {}}
        getAriaValueText={(value, index) => `M ${value.toFixed(1)}${index === 1 && value === 10 ? ', no upper bound' : ''}`} />
    </>);
    const min = screen.getByRole('slider', { name: 'Minimum Magnitude' });
    const max = screen.getByRole('slider', { name: 'Maximum Magnitude' });
    expect(min).toHaveAttribute('aria-valuenow', '2');
    expect(max).toHaveAttribute('aria-valuenow', '10');
    expect(min).toHaveAttribute('aria-valuetext', 'M 2.0');
    expect(max).toHaveAttribute('aria-valuetext', 'M 10.0, no upper bound');
  });

  it('names a range from aria-label, or from thumbLabels when given', () => {
    render(<>
      <Slider aria-label="depth" value={[0, 100]} max={700} onValueChange={() => {}} />
      <Slider thumbLabels={['Shallowest depth', 'Deepest depth']} value={[0, 100]} max={700} onValueChange={() => {}} />
    </>);
    expect(screen.getByRole('slider', { name: 'Minimum depth' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Maximum depth' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Shallowest depth' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Deepest depth' })).toBeInTheDocument();
  });

  it('gives a single thumb the aria-valuetext passed, and never shares one text across a range', () => {
    render(<>
      <Slider aria-label="Time window in seconds" aria-valuetext="30 seconds" value={[30]} max={300} onValueChange={() => {}} />
      <Slider aria-label="magnitude" aria-valuetext="shared text" value={[1, 5]} max={10} onValueChange={() => {}} />
    </>);
    expect(screen.getByRole('slider', { name: 'Time window in seconds' })).toHaveAttribute('aria-valuetext', '30 seconds');
    expect(screen.getByRole('slider', { name: 'Minimum magnitude' })).not.toHaveAttribute('aria-valuetext');
    expect(screen.getByRole('slider', { name: 'Maximum magnitude' })).not.toHaveAttribute('aria-valuetext');
  });

  it('works uncontrolled: both thumbs render and the value text follows the keyboard', () => {
    const onValueChange = jest.fn();
    render(<Slider aria-label="magnitude" defaultValue={[2, 8]} min={0} max={10} step={1}
      onValueChange={onValueChange} getAriaValueText={value => `M ${value}`} />);
    const max = screen.getByRole('slider', { name: 'Maximum magnitude' });
    act(() => max.focus());
    fireEvent.keyDown(max, { key: 'ArrowLeft' });
    expect(onValueChange).toHaveBeenLastCalledWith([2, 7]);
    expect(max).toHaveAttribute('aria-valuenow', '7');
    expect(max).toHaveAttribute('aria-valuetext', 'M 7');
  });

  it('works controlled, draws a value passed out of order sorted, and cannot be keyed into an inverted range', () => {
    function Controlled() {
      const [value, setValue] = useState([8, 2]);
      return <>
        <Slider aria-label="magnitude" value={value} min={0} max={10} step={1} onValueChange={setValue} />
        <output>{value.join(',')}</output>
      </>;
    }
    render(<Controlled />);
    const min = screen.getByRole('slider', { name: 'Minimum magnitude' });
    expect(min).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByRole('slider', { name: 'Maximum magnitude' })).toHaveAttribute('aria-valuenow', '8');
    // Push the minimum ten steps up, past the maximum: the values stay in order.
    act(() => min.focus());
    fireEvent.keyDown(min, { key: 'PageUp' });
    const [low, high] = screen.getByRole('status').textContent!.split(',').map(Number);
    expect(low).toBeLessThanOrEqual(high);
  });
});

// ---------------------------------------------------------------------------------
// NumericRangeInputs
// ---------------------------------------------------------------------------------
describe('NumericRangeInputs: exact bounds that cannot invert', () => {
  function setup(value = [2, 5]) {
    const onValueChange = jest.fn();
    const utils = render(<NumericRangeInputs label="depth" unit="km" value={value} min={-5} max={700} step={5} onValueChange={onValueChange} />);
    return { onValueChange, ...utils };
  }
  const type = (input: HTMLElement, text: string, key = 'Enter') => {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key });
  };

  it('names the inputs by bound and unit', () => {
    setup();
    expect(screen.getByLabelText('Minimum depth (km)')).toHaveValue(2);
    expect(screen.getByLabelText('Maximum depth (km)')).toHaveValue(5);
  });

  it('applies an exact value on Enter and keeps focus in the input', () => {
    const { onValueChange } = setup();
    const max = screen.getByLabelText('Maximum depth (km)');
    max.focus();
    type(max, '33');
    expect(onValueChange).toHaveBeenLastCalledWith([2, 33]);
    expect(max).toHaveFocus();
  });

  it('clamps a maximum below the minimum to the minimum, and a minimum above the maximum to the maximum', () => {
    const { onValueChange } = setup();
    type(screen.getByLabelText('Maximum depth (km)'), '1');
    expect(onValueChange).toHaveBeenLastCalledWith([2, 2]);
    type(screen.getByLabelText('Minimum depth (km)'), '40');
    expect(onValueChange).toHaveBeenLastCalledWith([5, 5]);
  });

  it('clamps to the ends of the range', () => {
    const { onValueChange } = setup();
    type(screen.getByLabelText('Maximum depth (km)'), '9999');
    expect(onValueChange).toHaveBeenLastCalledWith([2, 700]);
    type(screen.getByLabelText('Minimum depth (km)'), '-50');
    expect(onValueChange).toHaveBeenLastCalledWith([-5, 5]);
  });

  it('restores the current value for text that is not a number, and on Escape', () => {
    const { onValueChange } = setup();
    const min = screen.getByLabelText('Minimum depth (km)');
    type(min, '');
    expect(min).toHaveValue(2);
    fireEvent.change(min, { target: { value: '4' } });
    fireEvent.keyDown(min, { key: 'Escape' });
    expect(min).toHaveValue(2);
    fireEvent.blur(min);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('follows a value changed elsewhere', () => {
    const { rerender, onValueChange } = setup();
    rerender(<NumericRangeInputs label="depth" unit="km" value={[10, 300]} min={-5} max={700} step={5} onValueChange={onValueChange} />);
    expect(screen.getByLabelText('Minimum depth (km)')).toHaveValue(10);
    expect(screen.getByLabelText('Maximum depth (km)')).toHaveValue(300);
  });
});

// ---------------------------------------------------------------------------------
// The Analytics page
// ---------------------------------------------------------------------------------
describe('Analytics filters (findings 1 and 7)', () => {
  it('shows two named thumbs for magnitude and depth, and named minimum-quality and gap thumbs', async () => {
    await openCatalogueA();
    expect(screen.getAllByRole('slider')).toHaveLength(6);
    expect(screen.getByRole('slider', { name: 'Minimum Magnitude' })).toHaveAttribute('aria-valuetext', 'M -3.0, no lower bound');
    expect(screen.getByRole('slider', { name: 'Maximum Magnitude' })).toHaveAttribute('aria-valuetext', 'M 10.0, no upper bound');
    expect(screen.getByRole('slider', { name: 'Minimum Depth (km)' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Maximum Depth (km)' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Minimum quality (Q)' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Maximum azimuthal gap (°)' })).toBeInTheDocument();
    // Exact bound inputs beside the ranges.
    expect(screen.getByLabelText('Maximum magnitude')).toHaveValue(10);
    expect(screen.getByLabelText('Maximum depth (km)')).toHaveValue(700);
  });

  it('filters the sample when the maximum magnitude thumb moves', async () => {
    await openCatalogueA();
    const max = screen.getByRole('slider', { name: 'Maximum Magnitude' });
    act(() => max.focus());
    // Four page steps of 1.0: M <= 6.0 drops the M7 event.
    for (let i = 0; i < 4; i++) fireEvent.keyDown(max, { key: 'PageDown' });
    expect(max).toHaveAttribute('aria-valuenow', '6');
    expect(screen.getByLabelText('Maximum magnitude')).toHaveValue(6);
    expect(await screen.findByText('5 of 6 events')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveTextContent('5 events on map');
  });

  it('filters the sample when an exact maximum is typed, and moves the thumb to it', async () => {
    await openCatalogueA();
    const input = screen.getByLabelText('Maximum magnitude');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('3 of 6 events')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Maximum Magnitude' })).toHaveAttribute('aria-valuenow', '4');

    const depth = screen.getByLabelText('Maximum depth (km)');
    fireEvent.change(depth, { target: { value: '12' } });
    fireEvent.keyDown(depth, { key: 'Enter' });
    // M <= 4 and depth <= 12 km: the M2 (5 km) and M3 (10 km) events.
    expect(await screen.findByText('2 of 6 events')).toBeInTheDocument();
  });

  it('names the selectors by purpose, not by their current value', async () => {
    renderPage();
    expect(await screen.findByRole('combobox', { name: 'Catalogue to analyse' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Catalogue to analyse' }));
    fireEvent.click(await screen.findByRole('option', { name: /Catalogue A/ }));
    await screen.findByText('6 of 6 events');
    // The selected-catalogue header's selector, and the time filter.
    expect(screen.getByRole('combobox', { name: 'Catalogue to analyse' })).toHaveTextContent('Catalogue A');
    expect(screen.getByRole('combobox', { name: 'Time Period' })).toHaveTextContent('All Time');
  });
});

describe('Catalogue list states (finding 4)', () => {
  it('shows loading, not an empty inventory, before the list arrives', async () => {
    let resolve!: (reply: Reply) => void;
    listReply = () => new Promise<Reply>(r => { resolve = r; });
    renderPage();
    expect(await screen.findByText('Loading catalogues...')).toBeInTheDocument();
    expect(screen.queryByText(/No catalogues available/i)).not.toBeInTheDocument();
    expectOnePageTitle();
    await act(async () => resolve(ok([CATALOGUE_A])));
    expect(await screen.findByRole('combobox', { name: 'Catalogue to analyse' })).toBeInTheDocument();
  });

  it('explains a failed list, offers Retry, and shows no counts; Retry loads the list', async () => {
    listReply = () => failed(500);
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The catalogue list could not be loaded');
    expect(alert).toHaveTextContent('HTTP 500');
    expect(alert).toHaveTextContent('This does not mean there are no catalogues');
    expect(screen.queryByText(/No catalogues available/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/event records/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
    expectOnePageTitle();
    expect(screen.getByRole('heading', { level: 2, name: 'The catalogue list could not be loaded' })).toBeInTheDocument();

    listReply = () => ok([CATALOGUE_A]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('combobox', { name: 'Catalogue to analyse' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the list is empty only when it loaded empty', async () => {
    listReply = () => ok([]);
    renderPage();
    expect(await screen.findByRole('heading', { level: 2, name: 'No catalogues available' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectOnePageTitle();
  });

  it('keeps a previously loaded list on a failed refresh, marked stale, with Try again', async () => {
    await openCatalogueA();
    // A later refresh of the shared list fails.
    listReply = () => failed(503);
    await act(async () => { invalidateCatalogueData(); });
    const notice = (await screen.findByText(/The catalogue list may be out of date/)).closest('[role="status"]') as HTMLElement;
    expect(notice).toHaveTextContent('HTTP 503');
    expect(notice).toHaveTextContent(/from the last successful load, at \d\d:\d\d \S+ on \d{4}-\d\d-\d\d/);
    // The analysis in progress is kept: same events, no reload.
    expect(screen.getByText('6 of 6 events')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Catalogue to analyse' })).toHaveTextContent('Catalogue A');

    // A successful refresh with the same content clears the notice and does not
    // restart the catalogue's event loading (the provider hands over a new array).
    const mountsBefore = mockMapMounts;
    listReply = () => ok([CATALOGUE_A]);
    fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/The catalogue list may be out of date/)).not.toBeInTheDocument());
    expect(screen.getByText('6 of 6 events')).toBeInTheDocument();
    expect(mockMapMounts).toBe(mountsBefore);
  });

  it('never shows an unknown event count as 0', async () => {
    listReply = () => ok([{ id: 'a', name: 'Catalogue A', event_count: null }]);
    renderPage();
    expect(await screen.findByRole('button', { name: /Load All Catalogues \(event record count unavailable\)/ })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Available Catalogues Summary' });
    expect(within(summary).queryByText('0')).not.toBeInTheDocument();
    expect(within(summary).getAllByText('(unavailable)').length).toBeGreaterThan(0);
  });
});

describe('Event loading failures (findings 4 and 9)', () => {
  it('offers Sign in with a callback to this page when the events need an account', async () => {
    eventsReply = () => failed(401);
    renderPage();
    fireEvent.click(await screen.findByRole('combobox', { name: 'Catalogue to analyse' }));
    fireEvent.click(await screen.findByRole('option', { name: /Catalogue A/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Sign in to view analytics' })).toBeInTheDocument();
    expect(screen.getByText(/needs an account/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fanalytics');
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expectOnePageTitle();
  });

  it('tells a guest before they choose a catalogue that analytics needs an account', async () => {
    renderPage(guestSession);
    const note = (await screen.findByText(/Viewing analytics needs an account/)).closest('[role="note"]') as HTMLElement;
    expect(within(note).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?callbackUrl=%2Fanalytics');
  });

  it('explains any other failure and retries it', async () => {
    eventsReply = () => failed(500);
    renderPage();
    fireEvent.click(await screen.findByRole('combobox', { name: 'Catalogue to analyse' }));
    fireEvent.click(await screen.findByRole('option', { name: /Catalogue A/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The events could not be loaded');
    expect(alert).toHaveTextContent('Failed to load Catalogue A (HTTP 500)');
    expectOnePageTitle();

    eventsReply = () => ok({ data: ROWS, pagination: { hasMore: false, nextCursor: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading events' }));
    expect(await screen.findByText('6 of 6 events')).toBeInTheDocument();
  });
});

describe('Headings (finding 12)', () => {
  it('has one h1 on the selection screen and the analysis view, with h2 sections', async () => {
    renderPage();
    await screen.findByRole('combobox', { name: 'Catalogue to analyse' });
    expectOnePageTitle();
    expect(screen.getByRole('heading', { level: 2, name: 'Select a Catalogue to Analyze' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Available Catalogues Summary' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Catalogue to analyse' }));
    fireEvent.click(await screen.findByRole('option', { name: /Catalogue A/ }));
    await screen.findByText('6 of 6 events');
    expectOnePageTitle();
    expect(screen.getByRole('heading', { level: 2, name: 'Summary of the loaded events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Total Events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Filters/ })).toBeInTheDocument();
  });
});
