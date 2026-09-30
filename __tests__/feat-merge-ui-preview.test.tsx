/**
 * The merge QC preview after contract M4: the "Held for review" tile, the Held badge, the
 * superseded-report markings and the superseded-reports line, plus the page's wiring of the
 * hold setting into the preview. Components are rendered directly (the QC map with the real
 * installed Leaflet under jsdom, as in fix-merge-ui-maps.test.tsx).
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import L from 'leaflet';

jest.mock('leaflet/dist/leaflet.css', () => ({}));
jest.mock('@/hooks/use-map-theme', () => ({
  useMapColors: () => ({ isDark: false, markerOpacity: 0.75 }),
  BASE_LAYERS: [],
  getDefaultBaseLayer: () => 'none',
}));

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
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} onProceedWithMerge={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByText('Held for review')).toBeNull();
    rerender(
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} holdForReview onProceedWithMerge={() => {}} onCancel={() => {}} />
    );
    const tile = screen.getByText('Held for review').parentElement!;
    expect(within(tile).getByText('1')).toBeInTheDocument();
  });

  it('counts superseded reports and renders an older server response without them', () => {
    render(
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} onProceedWithMerge={() => {}} onCancel={() => {}} />
    );
    expect(screen.getByText("2 superseded reports (older vintages of one agency's solution)")).toBeInTheDocument();

    cleanup();
    const { heldForReviewCount, supersededReportsCount, ...legacy } = statistics;
    const { heldForReview, supersededEventIndexes, ...legacyGroup } = heldGroup;
    render(
      <MergePreviewQC previewData={{ duplicateGroups: [legacyGroup], statistics: legacy, catalogueColors: {} }} holdForReview onProceedWithMerge={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByText(/superseded report/)).toBeNull();
    expect(within(screen.getByText('Held for review').parentElement!).getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Held')).toBeNull();
  });
});

describe('MergePreviewQC separated reports', () => {
  // A report the windows matched but the validity gate split off: published alone, flagged
  // apart from the suspicious merges so that count keeps its meaning.
  const separatedGroup = {
    id: 'g2', selectedEventIndex: 0, isSuspicious: false, separated: true,
    validationWarnings: ['Matched with another report but separated because the group failed consistency validation. Reason: Large magnitude range'],
    events: [report('d', 'ISC')],
  };

  it('counts them, lists them under their own tab and badges the card', () => {
    render(
      <MergePreviewQC
        previewData={{ duplicateGroups: [heldGroup, separatedGroup], statistics: { ...statistics, separatedReportsCount: 1 }, catalogueColors: {} }}
        onProceedWithMerge={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/1 report was matched but kept apart because its group failed validation/)).toBeInTheDocument();
    const tab = screen.getByRole('tab', { name: 'Separated (1)' });
    act(() => { fireEvent.mouseDown(tab, { button: 0, ctrlKey: false }); });
    expect(screen.getByText('Single report')).toBeInTheDocument();
    expect(screen.getByText('Separated')).toBeInTheDocument();
    expect(screen.getByText(/Reason: Large magnitude range/)).toBeInTheDocument();
    expect(screen.queryByText('GeoNet 2024')).toBeNull();
  });

  it('shows no tab or line when nothing was separated', () => {
    render(
      <MergePreviewQC previewData={{ duplicateGroups: [heldGroup], statistics, catalogueColors: {} }} onProceedWithMerge={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByRole('tab', { name: /Separated/ })).toBeNull();
    expect(screen.queryByText(/kept apart/)).toBeNull();
  });
});

describe('DuplicateGroupCard', () => {
  it('badges a held group and greys its superseded report', () => {
    render(<DuplicateGroupCard group={heldGroup} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    expect(screen.getByText('Held')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);

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
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
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

  it('labels a superseded report in its popup and fades its marker', () => {
    const marker = jest.spyOn(L, 'marker');
    const divIcon = jest.spyOn(L, 'divIcon');
    render(<DuplicateGroupMap group={heldGroup} catalogueColors={{}} height="500px" />);
    const markers = marker.mock.results.map(result => result.value as L.Marker);
    expect(String(markers[1].getPopup()!.getContent())).toContain('Superseded');
    expect(String(markers[0].getPopup()!.getContent())).not.toContain('Superseded');
    expect(String(markers[2].getPopup()!.getContent())).not.toContain('Superseded');
    const icons = divIcon.mock.calls.map(call => String((call[0] as L.DivIconOptions).html));
    expect(icons[1]).toMatch(/opacity: 0\.45/);
    expect(icons[0]).toMatch(/opacity: 1;/);
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

  it('sets holdForReview from the flagged-group radio', async () => {
    render(<MergePage />);
    for (const name of ['Alpha catalogue', 'Bravo catalogue']) fireEvent.click(screen.getByRole('checkbox', { name }));
    fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Hold for review' }));
    fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate QC Preview' }));
    expect(await screen.findByTestId('qc-stub')).toHaveTextContent('hold');
    await waitFor(() => expect(qcProps[qcProps.length - 1].holdForReview).toBe(true));
    expect(qcProps[qcProps.length - 1].previewData.statistics.heldForReviewCount).toBe(1);
  });
});
