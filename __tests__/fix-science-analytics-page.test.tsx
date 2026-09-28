/**
 * Analytics page regressions for findings #9, #10, #11, #12 and #19.
 *
 * The real AnalyticsPage runs with its real filtering. Only the boundaries are
 * stubbed: the analysis hook (to record what the page asks it to analyse), the
 * Leaflet map and the ECharts charts (which cannot render in jsdom), and the Radix
 * slider and select (replaced by native inputs so a test can set a value).
 */
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AnalyticsPage from '@/app/analytics/page';

type Row = {
  id: string; time: string; magnitude: number; magnitude_type?: string | null;
  depth: number | null; latitude: number; longitude: number; region?: string;
};

let mockCatalogues: { id: string; name: string; event_count: number }[] = [];
let mockRows: Record<string, Row[]> = {};
const mockAnalysesCalls: any[][] = [];
let mockGr: any = null;
let mockMc: any = null;
let mockMoment: any = null;
const mockChartProps: Record<string, any> = {};

jest.mock('@/hooks/use-cached-fetch', () => ({ useCachedFetch: () => ({ data: mockCatalogues, loading: false }) }));
jest.mock('next/dynamic', () => () => function MockMap({ earthquakes }: any) {
  return <div data-testid="map">{earthquakes.length} events on map</div>;
});
jest.mock('@/hooks/use-seismological-worker', () => ({
  useSeismologicalAnalyses: (...args: any[]) => {
    mockAnalysesCalls.push(args);
    return {
      grAnalysis: { data: mockGr, error: null }, completeness: { data: mockMc, error: null },
      temporalAnalysis: { data: null, error: null }, timeSeriesAnalysis: { data: null, error: null },
      momentAnalysis: { data: mockMoment, error: null }, anyLoading: false,
    };
  },
}));
jest.mock('@/components/charts', () => Object.fromEntries([
  'MagnitudeDistributionChart', 'DepthDistributionChart', 'RegionDistributionChart', 'CatalogueDistributionChart',
  'MagnitudeDepthScatter', 'EventTimelineChart', 'GutenbergRichterChart', 'CompletenessChart', 'TemporalSeriesChart',
  'MomentReleaseChart', 'MFDComparisonChart', 'MagnitudeTimeScatter', 'CumulativeReleaseChart', 'GoodnessOfFitChart',
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
  mockMoment = null;
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

function row(id: string, magnitude: number, extra: Partial<Row> = {}): Row {
  return { id, time: '2024-01-01T00:00:00Z', magnitude, depth: 10, latitude: -41, longitude: 175, region: 'Wellington', ...extra };
}

async function openCatalogue(name: RegExp, expectedOnMap: number) {
  render(<AnalyticsPage />);
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByRole('option', { name }));
  await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent(`${expectedOnMap} events on map`));
}

async function loadAll(expectedOnMap: number) {
  render(<AnalyticsPage />);
  fireEvent.click(screen.getByRole('button', { name: /Load All Catalogues/ }));
  await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent(`${expectedOnMap} events on map`));
}

function openTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
}

const lastAnalysesCall = () => mockAnalysesCalls[mockAnalysesCalls.length - 1];

describe('#10: the default filters exclude nothing', () => {
  beforeEach(() => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 6 }];
    mockRows = { a: [
      row('no-depth', 2.0, { depth: null }),
      row('volcanic', 1.5, { depth: -1.2 }),   // above sea level; the validator allows >= -5 km
      row('crustal', 3.0, { depth: 8 }),
      row('slab', 4.0, { depth: 650 }),
      row('deepest', 4.5, { depth: 720 }),     // below the slider's 700 km end
      row('micro', -2.5),                      // the validator allows magnitudes >= -3
    ] };
  });

  it('keeps unknown, negative and very deep depths and every valid magnitude by default', async () => {
    await openCatalogue(/Catalogue A/, 6);
    expect(screen.getByText('6 of 6 events')).toBeInTheDocument();
    expect(lastAnalysesCall()[0]).toHaveLength(6);
  });

  it('applies the depth range, and drops unknown depths, only once the user narrows it', async () => {
    await openCatalogue(/Catalogue A/, 6);
    fireEvent.change(screen.getByLabelText(/slider .*\.\.700$/), { target: { value: '0,100' } });
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('2 events on map'));
  });
});

describe('#11: a raised magnitude lower bound is the fit cut-off, not MAXC input', () => {
  beforeEach(() => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 40 }];
    mockRows = { a: Array.from({ length: 40 }, (_, i) => row(`e${i}`, Number((1.0 + i * 0.1).toFixed(1)))) };
  });

  it('fits MAXC on the magnitude-unfiltered sample when no bound is raised', async () => {
    await openCatalogue(/Catalogue A/, 40);
    const [events, , options] = lastAnalysesCall();
    expect(events).toHaveLength(40);
    expect(options.fitEvents).toHaveLength(40);
    expect(options.minMagnitude).toBeUndefined();
  });

  it('passes the raised bound as minMagnitude and keeps the lower magnitudes for the Mc estimate', async () => {
    await openCatalogue(/Catalogue A/, 40);
    fireEvent.change(screen.getByLabelText(/slider .*\.\.10$/), { target: { value: '2.5,10' } });
    // 1.0 ... 4.9 in steps of 0.1: 25 events are at or above M2.5.
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('25 events on map'));
    const [events, , options] = lastAnalysesCall();
    expect(events).toHaveLength(25);          // map, charts, temporal and moment
    expect(options.fitEvents).toHaveLength(40); // G-R and Mc see the untruncated FMD
    expect(options.minMagnitude).toBe(2.5);
  });

  it('labels the G-R lower bound as the user cut-off rather than an estimated Mc', async () => {
    await openCatalogue(/Catalogue A/, 40);
    fireEvent.change(screen.getByLabelText(/slider .*\.\.10$/), { target: { value: '2.5,10' } });
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('25 events on map'));
    mockGr = {
      bValue: 1.0, aValue: 4.9, completeness: 2.5, rSquared: 0.98, bUncertainty: 0.2, eventsAboveMc: 25,
      magnitudeResolution: 0.1, binningCorrection: 0.05, dataPoints: [], fittedLine: [],
    };
    openTab(/G-R/);
    expect(await screen.findByText(/Magnitude cut-off/)).toBeInTheDocument();
    expect(screen.queryByText('Mc (Completeness)')).not.toBeInTheDocument();
  });
});

describe('#9: physical totals are not computed over overlapping catalogues', () => {
  beforeEach(() => {
    mockCatalogues = [
      { id: 'geonet', name: 'GeoNet', event_count: 3 },
      { id: 'merged', name: 'GeoNet + ISC merged', event_count: 3 },
    ];
    // The same three earthquakes held by a source catalogue and a merged catalogue.
    mockRows = {
      geonet: [row('g1', 3.0), row('g2', 3.5), row('g3', 4.0)],
      merged: [row('m1', 3.0), row('m2', 3.5), row('m3', 4.0)],
    };
  });

  it.each([/G-R/, /^Mc$/, /Temporal/, /Moment/])('withholds %s when the analysed set spans several catalogues', async tab => {
    await loadAll(6);
    openTab(tab);
    expect(await screen.findByText(/span 2 catalogues/)).toBeInTheDocument();
    // No analysis is requested for a pooled set.
    expect(lastAnalysesCall()[1]).toBe('map');
  });

  it('runs the analyses again once the Catalogues filter narrows the set to one catalogue', async () => {
    await loadAll(6);
    fireEvent.click(screen.getByLabelText('GeoNet'));
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('3 events on map'));
    openTab(/G-R/);
    await waitFor(() => expect(lastAnalysesCall()[1]).toBe('gutenberg-richter'));
    expect(screen.queryByText(/span 2 catalogues/)).not.toBeInTheDocument();
  });

  it('labels the pooled count as event records, not earthquakes', async () => {
    await loadAll(6);
    expect(screen.getByText('Event records')).toBeInTheDocument();
    expect(screen.queryByText('Total Events')).not.toBeInTheDocument();
  });
});

describe('#12: mixed magnitude scales are flagged where b and Mc are shown', () => {
  const grResult = {
    bValue: 0.9, aValue: 4.2, completeness: 2.2, rSquared: 0.97, bUncertainty: 0.12, eventsAboveMc: 56,
    magnitudeResolution: 0.1, binningCorrection: 0.05, dataPoints: [], fittedLine: [],
  };
  const mcResult = { mc: 2.2, method: 'MAXC', confidence: 0.7, magnitudeDistribution: [] };

  it('lists the magnitude types of the analysed set on the G-R and Mc tabs', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 60 }];
    mockRows = { a: Array.from({ length: 60 }, (_, i) =>
      row(`e${i}`, 2 + (i % 20) * 0.1, { magnitude_type: i < 40 ? 'ML' : i < 55 ? 'mb' : 'Mw' })) };
    mockGr = grResult;
    mockMc = mcResult;
    await openCatalogue(/Catalogue A/, 60);
    openTab(/G-R/);
    const warning = await screen.findByText(/Mixed magnitude scales/);
    const panel = warning.closest('[role="note"]') as HTMLElement;
    expect(within(panel).getByText(/ML 40/)).toBeInTheDocument();
    expect(within(panel).getByText(/mb 15/)).toBeInTheDocument();
    expect(within(panel).getByText(/Mw 5/)).toBeInTheDocument();
    openTab(/^Mc$/);
    expect(await screen.findByText(/Mixed magnitude scales/)).toBeInTheDocument();
  });

  it('stays silent for a single-scale catalogue', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 60 }];
    mockRows = { a: Array.from({ length: 60 }, (_, i) => row(`e${i}`, 2 + (i % 20) * 0.1, { magnitude_type: 'ML' })) };
    mockGr = grResult;
    await openCatalogue(/Catalogue A/, 60);
    openTab(/G-R/);
    await screen.findByText('b-value');
    expect(screen.queryByText(/Mixed magnitude scales/)).not.toBeInTheDocument();
  });
});

describe('#19: switching catalogue clears filters the new catalogue cannot show', () => {
  it('drops a region selected in the previous catalogue', async () => {
    mockCatalogues = [
      { id: 'a', name: 'Catalogue A', event_count: 3 },
      { id: 'b', name: 'Kermadec B', event_count: 3 },
    ];
    mockRows = {
      a: [row('a1', 3, { region: 'Canterbury' }), row('a2', 3, { region: 'Canterbury' }), row('a3', 3, { region: 'Wellington' })],
      b: [row('b1', 3, { region: 'Kermadec Islands' }), row('b2', 3, { region: 'Kermadec Islands' }), row('b3', 3, { region: 'Raoul Island' })],
    };
    await openCatalogue(/Catalogue A/, 3);
    fireEvent.click(screen.getByLabelText('Canterbury'));
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('2 events on map'));

    const catalogueSelect = screen.getAllByRole('combobox')
      .find(el => within(el).queryByRole('option', { name: /All Catalogues/ }))!;
    act(() => { fireEvent.change(catalogueSelect, { target: { value: 'b' } }); });
    // A stale Canterbury filter would leave 0 of B's 3 events on the map.
    await waitFor(() => expect(screen.getByTestId('map')).toHaveTextContent('3 events on map'));
    expect(screen.getByText('Regions (0 selected)')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 events')).toBeInTheDocument();
  });
});

describe('#7: the moment tab says why events were left out', () => {
  it('does not attribute every exclusion to saturating mb/Ms/Md scales', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 3 }];
    mockRows = { a: [row('a1', 4.0, { magnitude_type: 'Me' }), row('a2', 4.1, { magnitude_type: 'Mw' }), row('a3', 4.2)] };
    mockMoment = {
      totalMoment: 1.6e15, totalMomentMagnitude: 4.1, assumedMwCount: 1, excludedCount: 1,
      momentByMagnitude: [], largestEvent: { magnitude: 4.2, moment: 1e15, percentOfTotal: 62 },
    };
    await openCatalogue(/Catalogue A/, 3);
    openTab(/Moment/);
    const note = await screen.findByText(/1 event excluded/);
    expect(note).toHaveTextContent(/no moment relation is applied here/);
    expect(note).not.toHaveTextContent(/these scales saturate/);
  });
});

describe('#4: the Mc tab labels the kept share honestly and shows Mc with its bin width', () => {
  it('calls N(M >= Mc) / N the events at or above Mc, not catalogue completeness', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 60 }];
    mockRows = { a: Array.from({ length: 60 }, (_, i) => row(`e${i}`, 2 + (i % 20) * 0.1, { magnitude_type: 'ML' })) };
    mockMc = { mc: 2.2, method: 'MAXC', confidence: 38 / 60, eventsAboveMc: 38, binWidth: 0.1, magnitudeDistribution: [] };
    await openCatalogue(/Catalogue A/, 60);
    openTab(/^Mc$/);
    const title = await screen.findByText('Events at or above Mc');
    expect(screen.queryByText('Catalogue Completeness')).not.toBeInTheDocument();
    const card = title.closest('.rounded-lg') as HTMLElement;
    expect(within(card).getByText('63.3%')).toBeInTheDocument();
    expect(within(card).getByText(/38 of 60 events/)).toBeInTheDocument();
    // A progress bar read as a completeness score; a complete b = 1 catalogue tops out near 63%.
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
    const mcCard = screen.getByText('Completeness Magnitude').closest('.rounded-lg') as HTMLElement;
    expect(mcCard).toHaveTextContent('M2.2 ± 0.1');
  });
});

describe('#14: depth histogram bins follow the shallow/intermediate/deep boundaries', () => {
  it('splits at 70 and 300 km and counts above-sea-level events', async () => {
    mockCatalogues = [{ id: 'a', name: 'Catalogue A', event_count: 6 }];
    mockRows = { a: [
      row('volcanic', 2.0, { depth: -1.2 }), row('crustal', 2.0, { depth: 8 }), row('lower-crust', 2.0, { depth: 45 }),
      row('slab', 2.0, { depth: 150 }), row('deep', 2.0, { depth: 600 }), row('unknown', 2.0, { depth: null }),
    ] };
    await openCatalogue(/Catalogue A/, 6);
    openTab(/Charts/);
    await waitFor(() => expect(mockChartProps.DepthDistributionChart?.data?.length).toBeGreaterThan(0));
    const bins = mockChartProps.DepthDistributionChart.data as { range: string; min: number; max: number; count: number }[];
    const edges = bins.map(b => [b.min, b.max]);
    expect(edges).toContainEqual([40, 70]);
    expect(edges).toContainEqual([70, 300]);
    expect(edges).toContainEqual([300, Infinity]);
    // Every located event lands in exactly one bin, the -1.2 km one included.
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(5);
    expect(bins.find(b => b.min <= 150 && 150 < b.max)!.count).toBe(1);
  });
});
