import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AnalyticsPage from '@/app/analytics/page';

const catalogues = [{ id: 'a', name: 'Catalogue A', event_count: 2 }];
let mockAnalysisError: string | null = null;
jest.mock('@/hooks/use-cached-fetch', () => ({ useCachedFetch: () => ({ data: catalogues, loading: false }) }));
jest.mock('next/dynamic', () => () => function MockMap({ earthquakes }: any) {
  return <div data-testid="preview-map">{earthquakes.length} events on map</div>;
});
jest.mock('@/hooks/use-seismological-worker', () => ({ useSeismologicalAnalyses: () => ({
  grAnalysis: { data: null, error: mockAnalysisError }, completeness: { data: null, error: mockAnalysisError },
  temporalAnalysis: { data: null, error: mockAnalysisError }, momentAnalysis: { data: null, error: mockAnalysisError }, anyLoading: false,
}) }));
jest.mock('@/components/charts', () => Object.fromEntries([
  'MagnitudeDistributionChart', 'DepthDistributionChart', 'RegionDistributionChart', 'CatalogueDistributionChart',
  'MagnitudeDepthScatter', 'EventTimelineChart', 'GutenbergRichterChart', 'CompletenessChart', 'TemporalSeriesChart', 'MomentReleaseChart', 'MFDComparisonChart',
].map(name => [name, () => null])));

it('keeps the preview map usable while loading and unlocks analyses after completion', async () => {
  const originalFetch = global.fetch;
  const originalResizeObserver = global.ResizeObserver;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  let finish!: (response: Response) => void;
  const row = { id: 'one', time: '2024-01-01T00:00:00Z', magnitude: 3, depth: 10, latitude: -41, longitude: 175 };
  const page = (data: unknown[], cursor: string | null) => ({ ok: true, json: async () => ({ data, pagination: { hasMore: Boolean(cursor), nextCursor: cursor } }) } as Response);
  global.fetch = jest.fn().mockResolvedValueOnce(page([row], 'next')).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  try {
    render(<AnalyticsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Load All Catalogues/ }));
    expect(await screen.findByTestId('preview-map')).toHaveTextContent('1 events on map');
    expect(screen.getByRole('tab', { name: /Charts/ })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /Map/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel loading' })).toBeEnabled();
    await act(async () => finish(page([{ ...row, id: 'two' }], null)));
    expect(screen.getByTestId('preview-map')).toHaveTextContent('2 events on map');
    expect(screen.getByRole('tab', { name: /Charts/ })).not.toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel loading' })).not.toBeInTheDocument();
  } finally {
    global.fetch = originalFetch;
    global.ResizeObserver = originalResizeObserver;
  }
});

it.each(['G-R', 'Mc', 'Temporal', 'Moment'])('shows analysis failures instead of a permanent loading indicator in %s', async tabName => {
  const originalFetch = global.fetch;
  const originalResizeObserver = global.ResizeObserver;
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  mockAnalysisError = 'Only 9 complete events; at least 10 required';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
    data: Array.from({ length: 60 }, (_, id) => ({ id: String(id), time: '2024-01-01', magnitude: 3, depth: 10, latitude: -41, longitude: 175 })),
    pagination: { hasMore: false, nextCursor: null },
  }) });
  try {
    render(<AnalyticsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Load All Catalogues/ }));
    await screen.findByTestId('preview-map');
    const tab = screen.getByRole('tab', { name: new RegExp(tabName, 'i') });
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(mockAnalysisError);
    expect(screen.queryByText(/^Computing .*analysis/)).not.toBeInTheDocument();
  } finally {
    global.fetch = originalFetch;
    global.ResizeObserver = originalResizeObserver;
    mockAnalysisError = null;
  }
});
