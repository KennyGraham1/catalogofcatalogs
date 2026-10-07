/**
 * Regression tests for the merge page (app/merge/page.tsx) driven end to end through the
 * real page, MergeActions and the real client-side event loader. Only the network
 * (global.fetch), the auth/catalogue contexts and the Leaflet maps (next/dynamic) are
 * stubbed.
 *
 * The fetch stub below follows the documented contract of the real routes:
 *   - GET /api/catalogues/{id}/events with no parameters returns a bare array that is
 *     capped by UNPAGINATED_EVENTS_LIMIT (lib/db.ts) with no truncation metadata;
 *   - GET .../events?view=summary&limit=N[&cursor=C] returns cursor pages whose size is
 *     clamped to MAX_EVENTS_REQUEST_LIMIT, until pagination.hasMore is false;
 *   - GET /api/catalogues/{id}/export?format=F serves the complete stored catalogue.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/lib/auth/hooks', () => ({
  useAuth: () => ({ user: { role: 'editor' }, isAuthenticated: true }),
}));

const mockCatalogues = [
  { id: 'cat-a', name: 'Alpha catalogue', event_count: 3, created_at: '2024-01-03T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
  { id: 'cat-b', name: 'Bravo catalogue', event_count: 2, created_at: '2024-01-02T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
  { id: 'cat-c', name: 'Charlie catalogue', event_count: 1, created_at: '2024-01-01T00:00:00Z', status: 'complete', source_catalogues: '[]', merge_config: '' },
];
jest.mock('@/contexts/CatalogueContext', () => ({
  useCatalogues: () => ({ catalogues: mockCatalogues, loading: false, invalidateCache: () => {} }),
}));

// Leaflet maps (QC map, result map, region selector) are loaded through next/dynamic.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicStub() { return null; },
}));

// Radix renders dropdown content only after a real pointer interaction; render the export
// items as plain buttons so the download handlers themselves are exercised.
jest.mock('@/components/ui/dropdown-menu', () => {
  const react: typeof React = require('react');
  const passthrough = (props: any) => react.createElement('div', null, props.children);
  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuLabel: passthrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: (props: any) =>
      react.createElement('button', { onClick: props.onClick }, props.children),
  };
});

import MergePage from '@/app/merge/page';

const MERGED_ID = 'merged-1';
/** The saved merged catalogue, newest first (the events route sort order). */
const STORED = [
  { id: 'm3', catalogue_id: MERGED_ID, time: '2024-03-01T00:00:00.000Z', latitude: -41.2, longitude: 174.8, depth: 12, magnitude: 4.1, source_events: '[]' },
  { id: 'm2', catalogue_id: MERGED_ID, time: '2024-02-01T00:00:00.000Z', latitude: -42.1, longitude: 173.7, depth: null, magnitude: 5.2, source_events: '[]' },
  { id: 'm1', catalogue_id: MERGED_ID, time: '2024-01-01T00:00:00.000Z', latitude: -38.6, longitude: 176.1, depth: 5, magnitude: 3.3, source_events: '[]' },
];
/** UNPAGINATED_EVENTS_LIMIT as a deployment might set it. */
const UNPAGINATED_CAP = 2;
/** MAX_EVENTS_REQUEST_LIMIT: summary pages are clamped to this many rows. */
const SUMMARY_PAGE_CAP = 2;
const SERVER_CSV = 'EventID,Time\nm3,2024-03-01T00:00:00.000Z\nm2,2024-02-01T00:00:00.000Z\nm1,2024-01-01T00:00:00.000Z\n';

type Call = { url: string; body?: any };
let calls: Call[] = [];
let mergeResponse: any;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

async function fakeServer(input: any, init?: any) {
  const url = new URL(String(input), 'http://localhost');
  const body = init?.body ? JSON.parse(init.body) : undefined;
  calls.push({ url: `${url.pathname}${url.search}`, body });

  if (url.pathname === '/api/merge' && init?.method === 'POST') return jsonResponse(mergeResponse(body));
  if (url.pathname === '/api/merge/preview' && init?.method === 'POST') {
    return jsonResponse({
      duplicateGroups: [],
      statistics: { totalEventsBefore: 6, totalEventsAfter: 3, duplicateGroupsCount: 0, duplicatesRemoved: 0, suspiciousGroupsCount: 0 },
      catalogueColors: {},
    });
  }
  if (url.pathname === `/api/catalogues/${MERGED_ID}/events`) {
    const params = url.searchParams;
    if (params.get('view') === 'summary') {
      const start = params.get('cursor') ? Number(params.get('cursor')) : 0;
      const limit = Math.min(Number(params.get('limit')), SUMMARY_PAGE_CAP);
      const data = STORED.slice(start, start + limit).map(({ source_events, ...summary }) => summary);
      const hasMore = start + limit < STORED.length;
      return jsonResponse({ data, pagination: { nextCursor: hasMore ? String(start + limit) : null, prevCursor: null, hasMore, limit } });
    }
    if (Array.from(params.keys()).length === 0) return jsonResponse(STORED.slice(0, UNPAGINATED_CAP));
    return jsonResponse({ error: 'unexpected events query in test' }, 400);
  }
  if (url.pathname === `/api/catalogues/${MERGED_ID}/export`) {
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => name.toLowerCase() === 'content-disposition'
          ? 'attachment; filename="merged_nz_catalogue_20240301_000000.csv"'
          : 'text/csv',
      },
      blob: async () => new Blob([SERVER_CSV], { type: 'text/csv' }),
      text: async () => SERVER_CSV,
    };
  }
  return jsonResponse({ error: `unexpected request ${url.pathname}` }, 404);
}

/** Blobs handed to URL.createObjectURL and the filenames the page downloads them under. */
let downloads: Array<{ blob: Blob; filename: string }> = [];
let pendingBlobs: Blob[] = [];
const originalFetch = global.fetch;
const originalResizeObserver = (global as any).ResizeObserver;
const originalCreateObjectURL = (window.URL as any).createObjectURL;
const originalRevokeObjectURL = (window.URL as any).revokeObjectURL;
let anchorClick: jest.SpyInstance;

beforeEach(() => {
  calls = [];
  downloads = [];
  pendingBlobs = [];
  mergeResponse = () => ({ success: true, catalogueId: MERGED_ID, eventCount: STORED.length, originalEventCount: 6 });
  (global as any).fetch = jest.fn(fakeServer);
  (global as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = () => {};
  (window.URL as any).createObjectURL = jest.fn((blob: Blob) => { pendingBlobs.push(blob); return 'blob:merge-test'; });
  (window.URL as any).revokeObjectURL = jest.fn();
  anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ blob: pendingBlobs.shift()!, filename: this.download });
  });
});

afterEach(() => {
  cleanup();
  anchorClick.mockRestore();
  (global as any).fetch = originalFetch;
  (global as any).ResizeObserver = originalResizeObserver;
  (window.URL as any).createObjectURL = originalCreateObjectURL;
  (window.URL as any).revokeObjectURL = originalRevokeObjectURL;
});

const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

function selectCatalogues(...names: string[]) {
  for (const name of names) fireEvent.click(screen.getByRole('checkbox', { name }));
}

function goToConfigure() {
  fireEvent.click(screen.getByRole('button', { name: /Configure Merge/ }));
}

function goToPreview() {
  fireEvent.click(screen.getByRole('button', { name: /Preview Merge/ }));
}

async function startAndConfirmMerge(confirmLabel = 'Merge catalogues') {
  // A merge always follows a QC preview of the current settings: generate one if none is shown.
  const generate = screen.queryByRole('button', { name: 'Generate QC Preview' });
  if (generate) fireEvent.click(generate);
  await waitFor(() => expect(screen.getByRole('button', { name: /Start Merge/ })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /Start Merge/ }));
  fireEvent.click(await screen.findByRole('button', { name: confirmLabel }));
}

describe('#29 post-merge view and export use the complete merged catalogue', () => {
  it('loads every stored event past the unpaginated cap and exports through the server route', async () => {
    render(<MergePage />);
    selectCatalogues('Alpha catalogue', 'Bravo catalogue');
    goToConfigure();
    goToPreview();
    await startAndConfirmMerge();

    // All three stored events, not the capped two newest.
    expect(await screen.findByText(`${STORED.length} events in merged catalogue`)).toBeInTheDocument();
    const eventReads = calls.filter(c => c.url.startsWith(`/api/catalogues/${MERGED_ID}/events`));
    expect(eventReads.length).toBeGreaterThan(1);
    // The capped, metadata-free parameter-less read is never used.
    expect(eventReads.some(c => c.url === `/api/catalogues/${MERGED_ID}/events`)).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(calls.map(c => c.url)).toContain(`/api/catalogues/${MERGED_ID}/export?format=csv`);
    expect(await readBlob(downloads[0].blob)).toBe(SERVER_CSV);
    expect(downloads[0].filename).toBe('merged_nz_catalogue_20240301_000000.csv');
  });
});

describe('#72 export-only downloads record the merge configuration and source catalogues', () => {
  const MERGED_EVENTS = STORED.map(event => ({ ...event, catalogue_id: undefined }));

  async function runExportOnlyMerge() {
    mergeResponse = () => ({ success: true, catalogueId: null, eventCount: MERGED_EVENTS.length, originalEventCount: 6, events: MERGED_EVENTS });
    render(<MergePage />);
    selectCatalogues('Alpha catalogue', 'Bravo catalogue');
    goToConfigure();
    fireEvent.click(screen.getByRole('checkbox', { name: /Export only/ }));
    goToPreview();
    await startAndConfirmMerge('Merge for export');
    expect(await screen.findByText(`${MERGED_EVENTS.length} events in merged catalogue`)).toBeInTheDocument();
    const mergeRequest = calls.find(c => c.url === '/api/merge')!.body;
    expect(mergeRequest.exportOnly).toBe(true);
    return mergeRequest;
  }

  async function download(label: string): Promise<string> {
    const before = downloads.length;
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(downloads.length).toBe(before + 1));
    return readBlob(downloads[before].blob);
  }

  it('embeds the strategy, thresholds, priority and source list sent to /api/merge in every format', async () => {
    const request = await runExportOnlyMerge();
    // Nothing was saved, so the file is built in the browser from the merge result.
    expect(calls.some(c => c.url.includes('/export'))).toBe(false);

    const geojson = JSON.parse(await download('GeoJSON'));
    expect(geojson.metadata.merge.config).toEqual(request.config);
    expect(geojson.metadata.merge.config).toMatchObject({ timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority' });
    expect(geojson.metadata.provenance.sourceCatalogues).toEqual(request.sourceCatalogues);
    expect(geojson.metadata.provenance.sourceCatalogues.map((c: any) => c.id)).toEqual(['cat-a', 'cat-b']);

    const json = JSON.parse(await download('JSON'));
    expect(json.metadata.merge.config).toEqual(request.config);
    expect(json.metadata.provenance.sourceCatalogues).toEqual(request.sourceCatalogues);

    const kml = await download('KML (Google Earth)');
    expect(kml).toContain(`Merge Config: ${JSON.stringify(request.config)}`);
    expect(kml).toContain(`Source Catalogues: ${JSON.stringify(request.sourceCatalogues)}`);

    const quakeml = await download('QuakeML (XML)');
    expect(quakeml).toContain('Merge Config:');
    expect(quakeml).toContain('&quot;timeThreshold&quot;:60');
    expect(quakeml).toContain('Source Catalogues:');
    expect(quakeml).toContain('Alpha catalogue');
  });

  it('keeps recording the config that produced the result after the form is edited', async () => {
    const request = await runExportOnlyMerge();
    // Back to the configuration and widen the time window: the finished result is unchanged,
    // so its download must still describe the 60 s window it was merged with.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const timeWindow = screen.getByRole('slider', { name: 'Time window in seconds' });
    fireEvent.keyDown(timeWindow, { key: 'ArrowRight' });
    expect(timeWindow).toHaveAttribute('aria-valuenow', '65');
    goToPreview();

    const geojson = JSON.parse(await download('GeoJSON'));
    expect(geojson.metadata.merge.config).toEqual(request.config);
    expect(geojson.metadata.merge.config.timeThreshold).toBe(60);
  });
});

describe('#28 Source Priority: Custom Order ranking and honest fallback text', () => {
  // The explanation under the Source Priority select, exposed as its accessible description.
  const sourcePriorityHelp = () => screen.getByRole('combobox', { name: 'Source Priority' });

  async function chooseSourcePriority(label: string) {
    fireEvent.click(screen.getByRole('combobox', { name: 'Source Priority' }));
    fireEvent.click(await screen.findByRole('option', { name: label }));
  }

  async function generatePreview() {
    fireEvent.click(screen.getByRole('button', { name: 'Generate QC Preview' }));
    await waitFor(() => expect(calls.some(c => c.url === '/api/merge/preview')).toBe(true));
    return calls.find(c => c.url === '/api/merge/preview')!.body;
  }

  it('leaves the default request shape unchanged (no priorityOrder)', async () => {
    render(<MergePage />);
    selectCatalogues('Alpha catalogue', 'Bravo catalogue');
    goToConfigure();
    expect(screen.queryByRole('list', { name: 'Catalogue priority order' })).toBeNull();
    goToPreview();
    const preview = await generatePreview();
    expect(preview.config).toEqual({ timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'newest' });
  });

  it('ranks the selected catalogues and sends the ranking to preview and merge', async () => {
    const user = userEvent.setup();
    render(<MergePage />);
    selectCatalogues('Alpha catalogue', 'Bravo catalogue', 'Charlie catalogue');
    goToConfigure();
    await chooseSourcePriority('Custom catalogue order');

    const ranking = screen.getByRole('list', { name: 'Catalogue priority order' });
    const names = () => within(ranking).getAllByRole('listitem').map(item => item.textContent);
    expect(names()).toEqual([
      expect.stringContaining('Alpha catalogue'),
      expect.stringContaining('Bravo catalogue'),
      expect.stringContaining('Charlie catalogue'),
    ]);

    // Keyboard only: Radix hands focus back to the Select trigger after an option is chosen;
    // from there Tab reaches the ranking controls, and Enter / Space activate them.
    const trigger = screen.getByRole('combobox', { name: 'Source Priority' });
    await waitFor(() => expect(trigger).toHaveFocus());
    const charlieUp = within(ranking).getByRole('button', { name: 'Move Charlie catalogue up' });
    for (let presses = 0; presses < 10 && document.activeElement !== charlieUp; presses++) {
      await user.tab();
    }
    expect(charlieUp).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(names()[0]).toContain('Charlie catalogue');
    expect(names()[1]).toContain('Alpha catalogue');
    // Focus stays on the control that moved, even at the top of the list.
    expect(within(ranking).getByRole('button', { name: 'Move Charlie catalogue up' })).toHaveFocus();
    // Moving the top entry further up is a no-op.
    await user.keyboard('{Enter}');
    expect(names()[0]).toContain('Charlie catalogue');
    fireEvent.click(within(ranking).getByRole('button', { name: 'Move Alpha catalogue down' }));
    expect(names()).toEqual([
      expect.stringContaining('Charlie catalogue'),
      expect.stringContaining('Bravo catalogue'),
      expect.stringContaining('Alpha catalogue'),
    ]);

    expect(sourcePriorityHelp()).toHaveAccessibleDescription(expect.stringMatching(/ranking/i));
    expect(sourcePriorityHelp()).toHaveAccessibleDescription(expect.stringMatching(/quality score/i));

    goToPreview();
    const preview = await generatePreview();
    expect(preview.config).toMatchObject({ mergeStrategy: 'priority', priority: 'custom' });
    expect(preview.config.priorityOrder).toEqual(['cat-c', 'cat-b', 'cat-a']);

    await startAndConfirmMerge();
    await waitFor(() => expect(calls.some(c => c.url === '/api/merge')).toBe(true));
    const merge = calls.find(c => c.url === '/api/merge')!.body;
    expect(merge.config.priorityOrder).toEqual(['cat-c', 'cat-b', 'cat-a']);
    expect(merge.sourceCatalogues.map((c: any) => c.id)).toEqual(['cat-a', 'cat-b', 'cat-c']);
  });

  it('describes the fallback as network authority then quality, never as quality-based', async () => {
    render(<MergePage />);
    selectCatalogues('Alpha catalogue', 'Bravo catalogue');
    goToConfigure();
    await chooseSourcePriority('GeoNet first');
    expect(document.body).not.toHaveTextContent(/falls back to quality-based/i);
    expect(sourcePriorityHelp()).toHaveAccessibleDescription(expect.stringMatching(/authority/i));
    expect(sourcePriorityHelp()).toHaveAccessibleDescription(expect.stringMatching(/quality score/i));

    const label = screen.getByText('Source Priority', { selector: 'label' });
    fireEvent.focus(within(label.parentElement!).getByRole('button', { name: 'More information' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).not.toHaveTextContent(/falls back to quality-based/i);
    expect(tooltip).toHaveTextContent(/authority/i);
  });
});
