/**
 * Post-fix review, Analysis page items, driven through the real AnalyticsPage with its
 * real filtering (stubbed boundaries only: the analysis hook, which records what it is
 * asked for, the map, the charts, and the Radix slider/select):
 *
 *  a  the magnitude filter's UPPER bound truncated the G-R/Mc fit set (b 1.34 for 1.0);
 *  4  the time series get the analysed period: the time filter's window, or the
 *     catalogue's declared time period; without one, partial bins are not scaled;
 *  5  a coarse reporting step is labelled with its own half-step;
 *  6  the page's magnitude filter uses the engine's tolerant comparison;
 *  7  on the G-R tab the type table and mixed-scale warning describe the events fitted.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AnalyticsPage from '@/app/analytics/page';

type Row = Record<string, unknown> & { id: string; magnitude: number };

let mockCatalogues: Record<string, unknown>[] = [];
let mockRows: Record<string, Row[]> = {};
const mockAnalysesCalls: any[][] = [];
let mockGr: any = null;
let mockMc: any = null;
const mockChartProps: Record<string, any> = {};

// The page reads the shared catalogue list (CatalogueProvider), here loaded.
jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({
    catalogues: mockCatalogues, status: 'loaded', loading: false, error: null, refreshing: false,
    lastSuccessAt: null, retry: async () => {}, refreshCatalogues: async () => {},
  }),
}));
jest.mock('next/dynamic', () => () => function MockMap({ earthquakes }: any) {
  return <div data-testid="map">{earthquakes.length} events on map</div>;
});
jest.mock('@/hooks/use-seismological-worker', () => ({
  useSeismologicalAnalyses: (...args: any[]) => {
    mockAnalysesCalls.push(args);
    return {
      grAnalysis: { data: mockGr, error: null }, completeness: { data: mockMc, error: null },
      temporalAnalysis: { data: null, error: null }, timeSeriesAnalysis: { data: null, error: null },
      momentAnalysis: { data: null, error: null }, anyLoading: false,
    };
  },
}));
jest.mock('@/components/charts', () => Object.fromEntries([
  'MagnitudeDistributionChart', 'DepthDistributionChart', 'RegionDistributionChart', 'CatalogueDistributionChart',
  'MagnitudeDepthScatter', 'MagnitudeTimeScatter', 'EventTimelineChart', 'GutenbergRichterChart', 'CompletenessChart',
  'TemporalSeriesChart', 'MomentReleaseChart', 'CumulativeReleaseChart', 'GoodnessOfFitChart', 'BValueStabilityChart', 'MFDComparisonChart',
].map(name => [name, (props: any) => { mockChartProps[name] = props; return null; }])));
jest.mock('@/components/ui/slider', () => ({
  Slider: ({ min, max, value, onValueChange }: any) => (
    <input aria-label={`slider ${min}..${max}`} value={value.join(',')}
      onChange={(e: any) => onValueChange(e.target.value.split(',').map(Number))} />
  ),
}));
jest.mock('@/components/ui/select', () => {
  const React = require('react');
  const Ctx = React.createContext(null);
  return {
    Select: ({ value, onValueChange, children }: any) =>
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>,
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => {
      const ctx: any = React.useContext(Ctx);
      return <select value={ctx.value} onChange={(e: any) => ctx.onValueChange(e.target.value)}>{children}</select>;
    },
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  };
});

const originalFetch = global.fetch;
const originalResizeObserver = global.ResizeObserver;
const DAY = 86400_000;

beforeEach(() => {
  mockAnalysesCalls.length = 0;
  mockGr = null;
  mockMc = null;
  for (const key of Object.keys(mockChartProps)) delete mockChartProps[key];
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as any;
  Element.prototype.scrollIntoView = () => {};
  global.fetch = jest.fn().mockImplementation(async (url: string) => {
    const id = decodeURIComponent(url.split('/api/catalogues/')[1].split('/')[0]);
    return { ok: true, json: async () => ({ data: mockRows[id] ?? [], pagination: { hasMore: false, nextCursor: null } }) };
  });
});
afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  global.ResizeObserver = originalResizeObserver;
});

/** An event `daysAgo` days before now, so relative time filters keep it. */
function row(id: string, magnitude: number, extra: Record<string, unknown> = {}, daysAgo = 10): Row {
  return {
    id, time: new Date(Date.now() - daysAgo * DAY).toISOString(), magnitude,
    depth: 10, latitude: -41, longitude: 175, region: 'Wellington', ...extra,
  };
}

async function openCatalogue(expectedOnMap: number) {
  render(<AnalyticsPage />);
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name: /Catalogue A/ }));
  await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent(`${expectedOnMap} events on map`));
}

function openTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
}

function selectOffering(option: RegExp): HTMLSelectElement {
  const select = screen.getAllByRole('combobox').find(el => within(el).queryByRole('option', { name: option }));
  if (!select) throw new Error(`no select offers ${option}`);
  return select as HTMLSelectElement;
}

const lastCall = () => mockAnalysesCalls[mockAnalysesCalls.length - 1];

const forty = () => Array.from({ length: 40 }, (_, i) => row(`e${i}`, Number((1.0 + i * 0.1).toFixed(1))));

describe('a: the magnitude filter bounds stay out of the G-R and Mc fits', () => {
  beforeEach(() => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 40 }];
    mockRows = { a: forty() };
  });

  it('fits the whole upper tail when an upper bound is set, and says so', async () => {
    await openCatalogue(40);
    fireEvent.change(screen.getByLabelText(/slider .*\.\.10$/), { target: { value: '-3,3' } });
    // M1.0 ... M3.0 are displayed.
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('21 events on map'));
    const [displayed, , options] = lastCall();
    expect(displayed).toHaveLength(21);
    expect(options.fitEvents).toHaveLength(40); // the upper tail stays in the fit set
    expect(options.minMagnitude).toBeUndefined();
    openTab(/G-R/);
    expect(await screen.findByText(/upper bound \(M ≤ 3\.0\) is not applied/)).toBeInTheDocument();
  });
});

describe('6: the page filter keeps what the fit counts', () => {
  it('keeps a magnitude one ulp below the cut-off (2.3 - 0.1 at M2.2)', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 3 }];
    mockRows = { a: [row('low', 2.3 - 0.1), row('at', 2.2), row('below', 2.1)] };
    await openCatalogue(3);
    fireEvent.change(screen.getByLabelText(/slider .*\.\.10$/), { target: { value: '2.2,10' } });
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('2 events on map'));
  });
});

describe('7: the G-R tab describes the events actually fitted', () => {
  it('shows only the types at or above the cut-off on the G-R tab, all of them on the Mc tab', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 60 }];
    mockRows = { a: [
      ...Array.from({ length: 30 }, (_, i) => row(`ml${i}`, 1.0 + (i % 10) / 10, { magnitude_type: 'ML' })),
      ...Array.from({ length: 30 }, (_, i) => row(`mb${i}`, 2.0 + (i % 30) / 10, { magnitude_type: 'mb' })),
    ] };
    mockGr = {
      bValue: 1.0, aValue: 4, completeness: 2.0, mcSource: 'cutoff', rSquared: 0.97, bUncertainty: 0.18,
      eventsAboveMc: 30, magnitudeResolution: 0.1, binningCorrection: 0.05, dataPoints: [], fittedLine: [],
    };
    mockMc = {
      mc: 1.2, method: 'MAXC', requestedMethod: 'MAXC', maxcCorrection: 0.2, confidence: 0.9, eventsAboveMc: 54,
      binWidth: 0.1, magnitudeDistribution: [],
    };
    await openCatalogue(60);
    fireEvent.change(screen.getByLabelText(/slider .*\.\.10$/), { target: { value: '2,10' } });
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('30 events on map'));
    openTab(/G-R/);
    const table = await screen.findByRole('region', { name: 'Magnitude types of the analysed events' });
    expect(table).toHaveTextContent('in the G-R fit sample (M ≥ 2.0) (30 events)');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['mb']);
    // A single scale is fitted, so no mixed-scale warning on the G-R tab...
    expect(screen.queryByText(/Mixed magnitude scales/)).not.toBeInTheDocument();
    // ...while Mc is estimated from both.
    openTab(/^Mc$/);
    expect(await screen.findByText(/Mixed magnitude scales/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Magnitude types of the analysed events' }))
      .toHaveTextContent('in the Mc estimation sample (60 events)');
  });
});

describe('5: a coarse reporting step is labelled with its own half-step', () => {
  it('states ΔM/2 = 0.25 for magnitudes reported to 0.5', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 60 }];
    mockRows = { a: Array.from({ length: 60 }, (_, i) => row(`e${i}`, 3 + (i % 6) * 0.5)) };
    mockGr = {
      bValue: 1.0, aValue: 4, completeness: 3.0, mcSource: 'MAXC', requestedMcMethod: 'MAXC', maxcCorrection: 0.2,
      rSquared: 0.97, bUncertainty: 0.13, eventsAboveMc: 60, magnitudeResolution: 0.5, binningCorrection: 0.25,
      dataPoints: [], fittedLine: [],
    };
    await openCatalogue(60);
    openTab(/G-R/);
    expect(await screen.findByText('ΔM/2 = 0.250 (magnitudes reported to 0.5)')).toBeInTheDocument();
  });
});

describe('4: the time series get the analysed period', () => {
  it('passes the time filter window, and the Timeline scales partial bins only then', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 3 }];
    mockRows = { a: [row('a', 3, {}, 20), row('b', 3, {}, 100), row('c', 3, {}, 200)] };
    await openCatalogue(3);
    expect(lastCall()[2].period).toBeUndefined();
    openTab(/Timeline/);
    await waitFor(() => expect(mockChartProps.EventTimelineChart?.partialBins).toBe('mark'));

    // The time filter is in the Map tab's Filters card.
    openTab(/Map/);
    fireEvent.change(selectOffering(/Last Year/), { target: { value: 'year' } });
    await waitFor(() => expect(lastCall()[2].period).toBeDefined());
    openTab(/Timeline/);
    const { start, end } = lastCall()[2].period;
    // One calendar year before now, up to now.
    expect((Date.parse(end) - Date.parse(start)) / DAY).toBeGreaterThanOrEqual(365);
    expect((Date.parse(end) - Date.parse(start)) / DAY).toBeLessThanOrEqual(366);
    await waitFor(() => expect(mockChartProps.EventTimelineChart.partialBins).toBe('scale'));
  });

  it("uses the catalogue's declared time period, a date-only end covering that whole day", async () => {
    mockCatalogues = [{
      id: 'a', name: 'Catalogue A', event_count: 2,
      time_period_start: '2020-01-01T00:00:00Z', time_period_end: '2020-12-31T00:00:00Z',
    }];
    mockRows = { a: [
      { ...row('a', 3), time: '2020-03-01T00:00:00Z' },
      { ...row('b', 3), time: '2020-06-01T00:00:00Z' },
    ] };
    await openCatalogue(2);
    await waitFor(() => expect(lastCall()[2].period).toEqual({
      start: '2020-01-01T00:00:00.000Z', end: '2021-01-01T00:00:00.000Z',
    }));
  });
});
