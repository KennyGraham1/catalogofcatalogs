/**
 * A2 UI: the Analytics page features the paper and docs describe.
 *
 *  1/2  Mc settings (method MBS (default) | GFT | MAXC, MAXC correction 0-0.5, offered
 *       when MAXC is chosen or used) on the G-R and Mc tabs, passed to the analyses and
 *       reported with each Mc; the b-value stability chart on the Mc tab.
 *  3/4  Temporal tab time-series panels: seismicity rate above Mc with Auto/Day/Week/
 *       Month bins, magnitude-vs-time scatter, cumulative moment / energy release.
 *  5    Analysis filters: minimum quality Q (stored score first), maximum azimuthal
 *       gap, magnitude types; the magnitude-type table of the analysed set on every tab.
 *  6    Agency-flagged records (duplicate / not existing / not locatable) excluded by
 *       default, with a count and a toggle.
 *
 * The real page runs with its real filtering. Stubbed boundaries only: the analysis
 * hook (records what the page asks for, returns canned results), the Leaflet map, the
 * ECharts charts (record their props), and the Radix slider/select (native inputs).
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AnalyticsPage from '@/app/analytics/page';

type Row = Record<string, unknown> & { id: string; magnitude: number };

let mockCatalogues: { id: string; name: string; event_count: number }[] = [];
let mockRows: Record<string, Row[]> = {};
const mockAnalysesCalls: any[][] = [];
let mockGr: any = null;
let mockMc: any = null;
let mockTemporal: any = null;
let mockTimeSeries: any = null;
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
      temporalAnalysis: { data: mockTemporal, error: null }, timeSeriesAnalysis: { data: mockTimeSeries, error: null },
      momentAnalysis: { data: null, error: null }, anyLoading: false,
    };
  },
}));
jest.mock('@/components/charts', () => Object.fromEntries([
  'MagnitudeDistributionChart', 'DepthDistributionChart', 'RegionDistributionChart', 'CatalogueDistributionChart',
  'MagnitudeDepthScatter', 'MagnitudeTimeScatter', 'EventTimelineChart', 'GutenbergRichterChart', 'CompletenessChart',
  'TemporalSeriesChart', 'MomentReleaseChart', 'CumulativeReleaseChart', 'GoodnessOfFitChart', 'BValueStabilityChart',
  'MFDComparisonChart',
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

beforeEach(() => {
  mockAnalysesCalls.length = 0;
  mockGr = null;
  mockMc = null;
  mockTemporal = null;
  mockTimeSeries = null;
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

function row(id: string, magnitude: number, extra: Record<string, unknown> = {}): Row {
  return { id, time: '2024-01-01T00:00:00Z', magnitude, depth: 10, latitude: -41, longitude: 175, region: 'Wellington', ...extra };
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

/** The native select standing in for the Radix select that offers `option`. */
function selectOffering(option: RegExp): HTMLSelectElement {
  const select = screen.getAllByRole('combobox').find(el => within(el).queryByRole('option', { name: option }));
  if (!select) throw new Error(`no select offers ${option}`);
  return select as HTMLSelectElement;
}

const lastAnalysesOptions = () => mockAnalysesCalls[mockAnalysesCalls.length - 1][2];

const sixtyMl = () => Array.from({ length: 60 }, (_, i) => row(`e${i}`, 2 + (i % 20) * 0.1, { magnitude_type: 'ML' }));

describe('Mc settings on the G-R and Mc tabs (items 1 and 2)', () => {
  beforeEach(() => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 60 }];
    mockRows = { a: sixtyMl() };
  });

  it('defaults to b-value stability and passes a changed method and correction to the analyses', async () => {
    await openCatalogue(60);
    openTab(/G-R/);
    await waitFor(() => expect(mockAnalysesCalls[mockAnalysesCalls.length - 1][1]).toBe('gutenberg-richter'));
    expect(lastAnalysesOptions()).toMatchObject({ mcMethod: 'MBS', maxcCorrection: 0.2 });
    const method = selectOffering(/b-value stability \(MBS\)/);
    expect(method.value).toBe('MBS');
    expect(within(method).getAllByRole('option').map(o => o.textContent)).toEqual([
      'b-value stability (MBS)', 'Goodness of fit (GFT)', 'Maximum curvature (MAXC)',
    ]);
    // The MAXC correction is offered only once MAXC is chosen.
    expect(screen.queryByText('MAXC correction')).not.toBeInTheDocument();
    fireEvent.change(method, { target: { value: 'GFT' } });
    await waitFor(() => expect(lastAnalysesOptions().mcMethod).toBe('GFT'));
    expect(screen.queryByText('MAXC correction')).not.toBeInTheDocument();
    fireEvent.change(selectOffering(/Maximum curvature \(MAXC\)/), { target: { value: 'MAXC' } });
    await waitFor(() => expect(lastAnalysesOptions().mcMethod).toBe('MAXC'));
    fireEvent.change(selectOffering(/^\+0\.3$/), { target: { value: '0.3' } });
    await waitFor(() => expect(lastAnalysesOptions().maxcCorrection).toBe(0.3));
    // The settings are shared: the Mc tab shows the same choices.
    openTab(/^Mc$/);
    await waitFor(() => expect(mockAnalysesCalls[mockAnalysesCalls.length - 1][1]).toBe('completeness'));
    expect(selectOffering(/Maximum curvature \(MAXC\)/).value).toBe('MAXC');
    expect(selectOffering(/^\+0\.3$/).value).toBe('0.3');
    expect(lastAnalysesOptions()).toMatchObject({ mcMethod: 'MAXC', maxcCorrection: 0.3 });
  });

  it('offers corrections from +0.0 to +0.5 only', async () => {
    await openCatalogue(60);
    openTab(/^Mc$/);
    fireEvent.change(selectOffering(/Maximum curvature \(MAXC\)/), { target: { value: 'MAXC' } });
    const options = within(await waitFor(() => selectOffering(/^\+0\.3$/))).getAllByRole('option').map(o => o.textContent);
    expect(options).toEqual(['+0.0', '+0.1', '+0.2 (default)', '+0.3', '+0.4', '+0.5']);
  });

  it('offers the MAXC correction when another method fell back to MAXC', async () => {
    mockMc = {
      mc: 2.4, method: 'MAXC', requestedMethod: 'MBS', maxcCorrection: 0.2, gftLevel: null, gftFit: null, gftCurve: [],
      mbsCurve: [], confidence: 0.4, eventsAboveMc: 24, binWidth: 0.1, magnitudeDistribution: [],
      fallbackReason: 'No cut-off had a stable b-value and no cut-off reached a 90% goodness of fit, so Mc is maximum curvature + 0.2',
    };
    await openCatalogue(60);
    openTab(/^Mc$/);
    expect(await screen.findByText(/b-value stability requested: No cut-off had a stable b-value/)).toBeInTheDocument();
    expect(selectOffering(/b-value stability \(MBS\)/).value).toBe('MBS');
    expect(screen.getByText('MAXC correction')).toBeInTheDocument();
    const mcCard = screen.getByText('Completeness Magnitude').closest('.rounded-lg') as HTMLElement;
    expect(mcCard).toHaveTextContent(/maximum curvature \+ 0\.2 \(neither b-value stability nor the goodness-of-fit test found an Mc\)/);
  });

  it('shows an MBS Mc with its b-value stability chart, and the chart under any method', async () => {
    const mbsCurve = [
      { magnitude: 2.2, b: 0.993, deltaB: 0.029, bAve: 1.046, n: 1028 },
      { magnitude: 2.3, b: 1.029, deltaB: 0.034, bAve: 1.057, n: 845 },
      { magnitude: 2.4, b: 1.048, deltaB: 0.039, bAve: null, n: 677 },
    ];
    mockMc = {
      mc: 2.3, method: 'MBS', requestedMethod: 'MBS', maxcCorrection: 0.2, mbsCurve,
      confidence: 0.172, eventsAboveMc: 845, binWidth: 0.1, magnitudeDistribution: [],
    };
    await openCatalogue(60);
    openTab(/^Mc$/);
    expect(await screen.findByText('MBS')).toBeInTheDocument();
    expect(screen.getByText(
      'Lowest cut-off where b is within its uncertainty of the mean b over the next 0.5 units (b = 1.029 ± 0.034, mean 1.057)'
    )).toBeInTheDocument();
    const mcCard = screen.getByText('Completeness Magnitude').closest('.rounded-lg') as HTMLElement;
    expect(mcCard).toHaveTextContent('M2.3 ± 0.1');
    expect(mcCard).toHaveTextContent(/Estimated by b-value stability; ± one bin width/);
    expect(screen.getByText('b-value stability')).toBeInTheDocument();
    expect(mockChartProps.BValueStabilityChart).toMatchObject({ curve: mbsCurve, mc: 2.3 });
    expect(mockChartProps.GoodnessOfFitChart).toBeUndefined();
    expect(screen.queryByText('MAXC correction')).not.toBeInTheDocument();
    cleanup();
    delete mockChartProps.BValueStabilityChart;
    mockMc = { ...mockMc, mc: 1.9, method: 'MAXC', requestedMethod: 'MAXC' };
    await openCatalogue(60);
    openTab(/^Mc$/);
    await screen.findByText('MAXC');
    // Drawn for a MAXC Mc too, marking that Mc.
    expect(mockChartProps.BValueStabilityChart).toMatchObject({ curve: mbsCurve, mc: 1.9 });
  });

  it('states how the G-R Mc was estimated', async () => {
    mockGr = {
      bValue: 1.0, aValue: 4.9, completeness: 2.3, rSquared: 0.98, bUncertainty: 0.1, eventsAboveMc: 40,
      magnitudeResolution: 0.1, binningCorrection: 0.05, dataPoints: [], fittedLine: [],
      mcSource: 'MAXC', requestedMcMethod: 'MAXC', maxcCorrection: 0.3,
    };
    await openCatalogue(60);
    openTab(/G-R/);
    expect(await screen.findByText(/Estimated by maximum curvature \+ 0\.3; ± one bin width/)).toBeInTheDocument();
    cleanup();
    mockGr = { ...mockGr, completeness: 2.0, mcSource: 'GFT', requestedMcMethod: 'GFT', gftLevel: 90 };
    await openCatalogue(60);
    openTab(/G-R/);
    expect(await screen.findByText(/Estimated by the goodness-of-fit test at the 90% level/)).toBeInTheDocument();
    cleanup();
    mockGr = { ...mockGr, completeness: 2.3, mcSource: 'MBS', requestedMcMethod: 'MBS', gftLevel: undefined };
    await openCatalogue(60);
    openTab(/G-R/);
    expect(await screen.findByText(/Estimated by b-value stability; ± one bin width/)).toBeInTheDocument();
    cleanup();
    mockGr = { ...mockGr, completeness: 2.0, mcSource: 'GFT', requestedMcMethod: 'MBS', gftLevel: 95 };
    await openCatalogue(60);
    openTab(/G-R/);
    expect(await screen.findByText(
      /Estimated by the goodness-of-fit test at the 95% level \(b-value stability found no stable cut-off\)/
    )).toBeInTheDocument();
  });

  it('shows the GFT level, R, the goodness-of-fit curve, and a fallback when it happens', async () => {
    const curve = [{ magnitude: 1.8, fit: 83.1 }, { magnitude: 1.9, fit: 91.1 }, { magnitude: 2.0, fit: 99.7 }];
    mockMc = {
      mc: 2.0, method: 'GFT', requestedMethod: 'GFT', maxcCorrection: 0.2, gftLevel: 95, gftFit: 99.68, gftCurve: curve,
      confidence: 0.8, eventsAboveMc: 48, binWidth: 0.1, magnitudeDistribution: [],
    };
    await openCatalogue(60);
    openTab(/^Mc$/);
    expect(await screen.findByText('GFT (95%)')).toBeInTheDocument();
    expect(screen.getByText(/reproduces 95% of the observed cumulative counts \(R = 99\.7%\)/)).toBeInTheDocument();
    expect(mockChartProps.GoodnessOfFitChart).toMatchObject({ curve, mc: 2.0 });
    cleanup();
    mockMc = {
      ...mockMc, mc: 2.4, method: 'MAXC', gftLevel: null, gftFit: null,
      fallbackReason: 'No cut-off reached a 90% goodness of fit, so Mc is maximum curvature + 0.2',
    };
    await openCatalogue(60);
    openTab(/^Mc$/);
    expect(await screen.findByText(/Goodness-of-fit test requested: No cut-off reached a 90% goodness of fit/)).toBeInTheDocument();
    expect(mockChartProps.GoodnessOfFitChart.mc).toBeNull();
    const mcCard = screen.getByText('Completeness Magnitude').closest('.rounded-lg') as HTMLElement;
    expect(mcCard).toHaveTextContent('M2.4 ± 0.1');
    expect(mcCard).toHaveTextContent(/maximum curvature \+ 0\.2 \(the goodness-of-fit test reached no 90% fit\)/);
  });
});

describe('Temporal tab time-series panels (items 3 and 4)', () => {
  const series = (overrides: Record<string, unknown> = {}) => ({
    interval: 'week', requestedInterval: 'auto', startDate: '2024-01-03', endDate: '2024-02-20', untimedEvents: 0,
    rate: {
      threshold: 2.3, thresholdSource: 'mc', mcMethod: 'MAXC', requestedMcMethod: 'MAXC', maxcCorrection: 0.2,
      eventCount: 40,
      bins: [{ date: '2024-01-01', count: 3, days: 7, coveredDays: 5 }, { date: '2024-01-08', count: 7, days: 7 }],
    },
    release: {
      bins: [{ date: '2024-01-01', moment: 1e13, energy: 5e8, cumulativeMoment: 1e13, cumulativeEnergy: 5e8 }],
      totalMoment: 1e13, totalEnergy: 5e8, usedCount: 58, assumedMwCount: 58, excludedCount: 2,
    },
    ...overrides,
  });

  beforeEach(() => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 60 }];
    mockRows = { a: sixtyMl() };
  });

  it('draws the rate of events above Mc, stating the threshold, method and bins', async () => {
    mockTimeSeries = series();
    await openCatalogue(60);
    openTab(/Temporal/);
    expect(await screen.findByText(/40 events at or above Mc = 2\.3 \(maximum curvature \+ 0\.2\), counted per ISO week/)).toBeInTheDocument();
    expect(mockChartProps.EventTimelineChart).toMatchObject({
      data: series().rate.bins, daysPerBin: 7, seriesName: 'Events ≥ M2.3 per week',
    });
    // The scatter plots every analysed event with the same threshold line.
    expect(mockChartProps.MagnitudeTimeScatter.data).toHaveLength(60);
    expect(mockChartProps.MagnitudeTimeScatter).toMatchObject({ threshold: 2.3, thresholdLabel: 'Mc = 2.3' });
  });

  it('passes the chosen time bins to the analysis', async () => {
    mockTimeSeries = series();
    await openCatalogue(60);
    openTab(/Temporal/);
    await screen.findByText('Seismicity Rate');
    expect(lastAnalysesOptions().rateInterval).toBe('auto');
    fireEvent.change(selectOffering(/Month \(calendar, UTC\)/), { target: { value: 'month' } });
    await waitFor(() => expect(lastAnalysesOptions().rateInterval).toBe('month'));
  });

  it('says so when every event is counted because Mc could not be estimated', async () => {
    mockTimeSeries = series({
      rate: {
        threshold: null, thresholdSource: 'none', eventCount: 30, bins: [],
        note: 'Mc needs at least 50 events to estimate and 30 were analysed, so every event is counted',
      },
    });
    await openCatalogue(60);
    openTab(/Temporal/);
    expect(await screen.findByText(/All 30 events, counted per ISO week/)).toBeInTheDocument();
    expect(screen.getByText(/every event is counted; the rate therefore also follows changes in detection/)).toBeInTheDocument();
    expect(mockChartProps.EventTimelineChart.seriesName).toBe('Events per week');
  });

  it('switches the cumulative release between moment and energy, with the eligibility counts', async () => {
    mockTimeSeries = series();
    await openCatalogue(60);
    openTab(/Temporal/);
    expect(await screen.findByText('Cumulative Seismic Moment Release')).toBeInTheDocument();
    expect(mockChartProps.CumulativeReleaseChart).toMatchObject({ quantity: 'moment', data: series().release.bins });
    expect(screen.getByText(/58 events summed, Mw as reported; 58 of them with ML, GeoNet M or no stated scale.*2 events excluded/)).toBeInTheDocument();
    fireEvent.change(selectOffering(/Radiated energy \(J\)/), { target: { value: 'energy' } });
    expect(await screen.findByText('Cumulative Radiated Energy Release')).toBeInTheDocument();
    expect(screen.getByText(/log₁₀E = 1\.5·M \+ 4\.8/)).toBeInTheDocument();
    expect(mockChartProps.CumulativeReleaseChart.quantity).toBe('energy');
  });
});

describe('analysis filters and the magnitude-type table (items 5 and 6)', () => {
  beforeEach(() => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 9 }];
    mockRows = { a: [
      row('good', 3.0, { magnitude_type: 'ML', quality_score: 80, quality_grade: 'A-', azimuthal_gap: 90 }),
      row('poor', 3.1, { magnitude_type: 'ML', quality_score: 40, azimuthal_gap: 200 }),
      // No stored score: Q is computed from its fields (nothing reported scores low).
      row('legacy', 3.2, { magnitude_type: 'Mw' }),
      row('mb', 4.0, { magnitude_type: 'mb', quality_score: 70, azimuthal_gap: 150 }),
      row('untyped', 2.5, { quality_score: 90, azimuthal_gap: 45 }),
      row('dup', 3.0, { magnitude_type: 'ML', source_event_type: 'duplicate', quality_score: 90 }),
      row('ghost', 3.0, { magnitude_type: 'ML', source_event_type: 'not existing', quality_score: 90 }),
      row('lost', 3.0, { magnitude_type: 'ML', source_event_type: ' Not Locatable ', quality_score: 90 }),
      row('quakeml-ghost', 3.0, { magnitude_type: 'ML', event_type: 'not existing', quality_score: 90 }),
    ] };
  });

  it('excludes agency-flagged records by default, counts them, and includes them on request', async () => {
    await openCatalogue(5);
    expect(screen.getByText('5 of 9 events')).toBeInTheDocument();
    expect(screen.getByText(/4 records the source agency flagged as duplicate, not existing or not locatable are excluded/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Include agency-flagged records \(4\)/));
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('9 events on map'));
  });

  it('keeps events at or above a minimum Q, preferring the stored score', async () => {
    await openCatalogue(5);
    fireEvent.change(screen.getByLabelText('slider 0..100'), { target: { value: '50' } });
    // good (80), mb (70) and untyped (90) pass on their stored scores; poor (40) fails;
    // legacy has no score and is computed from its (absent) fields, which scores low.
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('3 events on map'));
    expect(screen.getByText(/Q ≥ 50 \(grade C or better\)/)).toBeInTheDocument();
  });

  it('keeps events within a maximum azimuthal gap and drops those that report none', async () => {
    await openCatalogue(5);
    fireEvent.change(screen.getByLabelText('slider 0..360'), { target: { value: '180' } });
    // good (90), mb (150), untyped (45); poor (200) is outside, legacy reports no gap.
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('3 events on map'));
    expect(screen.getByText(/Events without a reported azimuthal gap are excluded/)).toBeInTheDocument();
  });

  it('splits the catalogue by magnitude type', async () => {
    await openCatalogue(5);
    fireEvent.click(screen.getByLabelText(/^ML \(/));
    // good and poor; the four flagged ML records stay excluded.
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('2 events on map'));
    fireEvent.click(screen.getByLabelText(/^No type stated/));
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('3 events on map'));
  });

  it('shows the magnitude types of the analysed set on every tab', async () => {
    await openCatalogue(5);
    const table = screen.getByRole('region', { name: 'Magnitude types of the analysed events' });
    expect(table).toHaveTextContent('in the filtered events (5 events)');
    // Largest count first, ties in summariseMagnitudeTypes' order (untyped '' first).
    const headers = within(table).getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toEqual(['ML', 'none stated', 'mb', 'Mw']);
    expect(within(table).getByRole('row', { name: /Events/ })).toHaveTextContent(/2\s*1\s*1\s*1/);
    expect(within(table).getByRole('row', { name: /Share/ })).toHaveTextContent('40.0%');
    openTab(/Charts/);
    expect(screen.getByRole('region', { name: 'Magnitude types of the analysed events' })).toBeInTheDocument();
  });

  it('names the active filters where an analysis states its scope', async () => {
    await openCatalogue(5);
    fireEvent.change(screen.getByLabelText('slider 0..100'), { target: { value: '50' } });
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('3 events on map'));
    openTab(/Moment/);
    expect(await screen.findByText(/Computed from 3 of 9 loaded events \(filters: Q ≥ 50; 4 agency-flagged records excluded\)/)).toBeInTheDocument();
  });

  it('reports the stored quality scores in the statistics (contract C1)', async () => {
    mockRows = { a: [row('s1', 3, { quality_score: 80 }), row('s2', 3, { quality_score: 60 })] };
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 2 }];
    await openCatalogue(2);
    expect(screen.getByText('Avg Quality: 70.0/100')).toBeInTheDocument();
  });
});
