/**
 * The merge QC preview after contract M4: the "Held for review" tile, the Held badge, the
 * superseded-entry markings and the superseded-entries line, plus the page's wiring of the
 * hold setting into the preview. Components are rendered directly (the QC map with the real
 * installed Leaflet under jsdom, as in fix-merge-ui-maps.test.tsx).
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import L from 'leaflet';

jest.mock('leaflet/dist/leaflet.css', () => ({}));
// react-leaflet ships ESM that Jest does not transform; the QC map is plain Leaflet and only
// imports the shared layer control's attachBaseLayers and the scale options beside it.
jest.mock('react-leaflet', () => ({ useMap: jest.fn(), ScaleControl: () => null }));

// next/dynamic loads the component lazily, so the page's real MergePreviewQC (stubbed below
// to record its props) can be reached through the page.
jest.mock('next/dynamic', () => {
  const react: typeof React = require('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<any>) => {
      const Lazy = react.lazy(() => loader().then((mod: any) => ({ default: mod.default ?? mod })));
      return function DynamicStub(props: any) {
        return react.createElement(react.Suspense, { fallback: null }, react.createElement(Lazy, props));
      };
    },
  };
});

const qcProps: any[] = [];
jest.mock('@/components/merge/MergePreviewQC', () => {
  const react: typeof React = require('react');
  return {
    MergePreviewQC: (props: any) => {
      qcProps.push(props);
      return react.createElement('div', { 'data-testid': 'qc-stub' }, props.holdForReview ? 'hold' : 'resolve');
    },
  };
});
jest.mock('@/components/catalogues/GeographicSearchPanel', () => ({ GeographicSearchPanel: () => null }));
jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' }, isAuthenticated: true }),
}));
const mockCatalogues = [
  { id: 'cat-a', name: 'Alpha catalogue', event_count: 3, created_at: '2024-01-03T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
  { id: 'cat-b', name: 'Bravo catalogue', event_count: 2, created_at: '2024-01-02T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
];
jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({ catalogues: mockCatalogues, loading: false, invalidateCache: () => {} }),
}));
jest.mock('@/lib/client-cache', () => ({
  invalidateCatalogueData: () => {},
  subscribeToCatalogueInvalidation: () => () => {},
}));

import MergePage from '@/app/merge/page';
import { DuplicateGroupCard } from '@/components/merge/DuplicateGroupCard';
import { DuplicateGroupMap } from '@/components/merge/DuplicateGroupMap';

// The real component, bypassing the module stub above.
const { MergePreviewQC } = jest.requireActual('@/components/merge/MergePreviewQC');

const report = (id: string, catalogueName: string, time = '2024-01-01T00:00:00.000Z') => ({
  id, time, latitude: -41.2, longitude: 174.8, depth: 12, magnitude: 4.1, source: id, catalogueId: id, catalogueName,
});

/** A GeoNet group with an older vintage of the same solution (index 1) superseded. */
const heldGroup = {
  id: 'g1',
  selectedEventIndex: 0,
  isSuspicious: true,
  validationWarnings: ['Magnitude disagreement'],
  heldForReview: true,
  supersededEventIndexes: [1],
  events: [report('a', 'GeoNet 2024'), report('b', 'GeoNet 2023 archive'), report('c', 'USGS')],
};

const statistics = {
  totalEventsBefore: 6, totalEventsAfter: 3, duplicateGroupsCount: 1, duplicatesRemoved: 2, suspiciousGroupsCount: 1,
  heldForReviewCount: 1, supersededReportsCount: 2,
};

afterEach(() => cleanup());

describe('MergePreviewQC statistics', () => {
  it('shows the Held for review tile only when the merge holds flagged groups', () => {
    const { rerender } = render(
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} />
    );
    expect(screen.queryByText('Held for review')).toBeNull();
    rerender(
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} holdForReview />
    );
    const tile = screen.getByText('Held for review').parentElement!;
    expect(within(tile).getByText('1')).toBeInTheDocument();
  });

  it('counts superseded entries and renders an older server response without them', () => {
    render(
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} />
    );
    expect(screen.getByText("2 superseded entries (older vintages of one agency's solution, kept as provenance).")).toBeInTheDocument();

    cleanup();
    const { heldForReviewCount, supersededReportsCount, ...legacy } = statistics;
    const { heldForReview, supersededEventIndexes, ...legacyGroup } = heldGroup;
    render(
      <MergePreviewQC previewData={{ duplicateGroups: [legacyGroup], statistics: legacy, catalogueColors: {} }} holdForReview />
    );
    expect(screen.queryByText(/superseded entr/)).toBeNull();
    expect(within(screen.getByText('Held for review').parentElement!).getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Held')).toBeNull();
  });
});

describe('MergePreviewQC kept-apart entries', () => {
  // An entry the windows matched but the consistency checks split off: published alone, and
  // counted apart from the flagged groups so that count keeps its meaning. This one comes
  // from a server that predates splitKey, so it is a cluster of its own.
  const separatedGroup = {
    id: 'g2', selectedEventIndex: 0, isSuspicious: false, separated: true,
    validationWarnings: ['Matched with another entry but kept apart because the group failed consistency validation. Reason: Large magnitude range'],
    events: [report('d', 'ISC')],
  };

  it('counts them, lists them under Kept apart and gives the reason', () => {
    render(
      <MergePreviewQC
        previewData={{ duplicateGroups: [heldGroup, separatedGroup], statistics: { ...statistics, separatedReportsCount: 1 }, catalogueColors: {} }}
      />
    );
    expect(screen.getByText(/1 entry was matched but kept apart because its group failed the consistency checks/)).toBeInTheDocument();
    const tab = screen.getByRole('tab', { name: 'Kept apart (1)' });
    act(() => { fireEvent.mouseDown(tab, { button: 0, ctrlKey: false }); });
    expect(screen.getByRole('heading', { name: 'Kept apart' })).toBeInTheDocument();
    expect(screen.getByTestId('split-outcome')).toHaveTextContent('Published on its own');
    expect(screen.getByTestId('split-reason')).toHaveTextContent('Kept apart because: Large magnitude range');
    // The flagged group is not in this list.
    expect(screen.queryByText('Group #1')).toBeNull();
  });

  it('shows an empty Kept apart list and no line when nothing was kept apart', () => {
    render(
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} />
    );
    expect(screen.getByRole('tab', { name: 'Kept apart (0)' })).toBeInTheDocument();
    expect(screen.queryByText(/kept apart because/)).toBeNull();
  });
});

describe('DuplicateGroupCard', () => {
  it('badges a held group and greys its superseded report', () => {
    render(<DuplicateGroupCard group={heldGroup} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    expect(screen.getByText('Held')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show entries/ }));

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveAttribute('data-superseded', 'true');
    expect(rows[1].className).toMatch(/opacity-60/);
    expect(within(rows[1]).getByText('superseded')).toBeInTheDocument();
    expect(rows[0]).not.toHaveAttribute('data-superseded');
    expect(within(rows[0]).queryByText('superseded')).toBeNull();
    expect(within(rows[2]).queryByText('superseded')).toBeNull();
  });

  it('shows neither marking for a group without the new fields', () => {
    const { heldForReview, supersededEventIndexes, ...legacyGroup } = heldGroup;
    render(<DuplicateGroupCard group={legacyGroup} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    expect(screen.queryByText('Held')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show entries/ }));
    expect(screen.queryByText('superseded')).toBeNull();
  });
});

describe('DuplicateGroupMap popups', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 800; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 500; } });
  });
  afterAll(() => {
    delete (HTMLElement.prototype as any).clientWidth;
    delete (HTMLElement.prototype as any).clientHeight;
  });
  afterEach(() => jest.restoreAllMocks());

  it('labels a superseded report in its popup and draws it hollow and dashed', () => {
    const circleMarker = jest.spyOn(L, 'circleMarker');
    render(<DuplicateGroupMap group={heldGroup} catalogueColors={{}} height="500px" />);
    const markers = circleMarker.mock.results.map(result => result.value as L.CircleMarker);
    expect(String(markers[1].getPopup()!.getContent())).toContain('Superseded');
    expect(String(markers[0].getPopup()!.getContent())).not.toContain('Superseded');
    expect(String(markers[2].getPopup()!.getContent())).not.toContain('Superseded');
    expect(markers[1].options).toMatchObject({ fillOpacity: 0, dashArray: expect.any(String) });
    expect(markers[0].options.fillOpacity).toBeGreaterThan(0);
    expect(markers[0].options.dashArray).toBeFalsy();
    expect(markers[2].options.dashArray).toBeFalsy();
  });
});

describe('merge page passes the hold setting to the preview', () => {
  const originalFetch = global.fetch;
  const originalResizeObserver = (global as any).ResizeObserver;

  beforeEach(() => {
    qcProps.length = 0;
    const jsonResponse = (body: unknown, status = 200) => ({
      ok: status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async (): Promise<string> => JSON.stringify(body),
    });
    (global as any).fetch = jest.fn(async (input: any, init?: any) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/merge/preview' && init?.method === 'POST') {
        return jsonResponse({ duplicateGroups: [], statistics, catalogueColors: {} });
      }
      return jsonResponse({ error: 'unexpected' }, 404);
    });
    (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.scrollIntoView = () => {};
  });
  afterEach(() => {
    (global as any).fetch = originalFetch;
    (global as any).ResizeObserver = originalResizeObserver;
  });

  it('sets holdForReview from the flagged-group radio, and passes the strategy and priority', async () => {
    render(<MergePage />);
    for (const name of ['Alpha catalogue', 'Bravo catalogue']) fireEvent.click(screen.getByRole('checkbox', { name }));
    fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Hold for review' }));
    fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate QC Preview' }));
    expect(await screen.findByTestId('qc-stub')).toHaveTextContent('hold');
    await waitFor(() => expect(qcProps[qcProps.length - 1].holdForReview).toBe(true));
    expect(qcProps[qcProps.length - 1].previewData.statistics.heldForReviewCount).toBe(1);
    // The panel explains each published solution by the strategy, and has no merge actions.
    expect(qcProps[qcProps.length - 1]).toMatchObject({ strategy: 'priority', priority: 'newest' });
    expect(qcProps[qcProps.length - 1]).not.toHaveProperty('onProceedWithMerge');
    expect(qcProps[qcProps.length - 1]).not.toHaveProperty('onCancel');
  });
});
