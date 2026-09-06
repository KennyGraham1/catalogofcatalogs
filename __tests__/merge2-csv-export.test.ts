/**
 * Regression test for the merge CSV download (components/merge/MergeActions.tsx).
 *
 * The server export (GET /api/catalogues/{id}/export?format=csv) emits plain RFC 4180 by
 * default — the header is record 1 — and only writes the `#` metadata prologue behind
 * ?metadata=comments. The browser-side merge download used to always prepend that prologue,
 * so the app emitted two incompatible CSV dialects for the same data: a file whose line 1 is
 * `# Catalogue: ...` is not readable by pandas.read_csv, R's read.csv (comment.char="" by
 * default), ZMAP, or this platform's own parseCSV. This pins the two exports to one dialect.
 */

import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// The map is loaded through next/dynamic and pulls in Leaflet, which needs a real browser.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicStub() { return null; },
}));

jest.mock('@/components/events/EventTable', () => ({
  EventTable: () => null,
}));

// Radix renders dropdown content only after a real pointer interaction; render the items as
// plain buttons so the export handlers themselves are what the test exercises.
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

import { MergeActions } from '@/components/merge/MergeActions';
import { CSV_EVENT_HEADERS, eventsToCSV } from '@/lib/exporters';

const events: any[] = [
  {
    id: 'ev-1',
    catalogue_id: 'cat-merged',
    time: '2020-01-01T00:00:00.000Z',
    created_at: '2020-01-02T00:00:00.000Z',
    latitude: -41.5,
    longitude: 174.25,
    depth: 12,
    magnitude: 4.3,
    magnitude_type: 'ML',
    source_id: 'gn-1',
    source_events: JSON.stringify([{ source: 'GeoNet' }]),
  },
  {
    id: 'ev-2',
    catalogue_id: 'cat-merged',
    time: '2020-01-03T04:05:06.000Z',
    created_at: '2020-01-04T00:00:00.000Z',
    latitude: -40.0,
    longitude: 175.0,
    depth: null,
    magnitude: 5.1,
    magnitude_type: 'Mw',
    source_id: 'isc-1',
    source_events: JSON.stringify([{ source: 'ISC' }]),
  },
];

// Metadata that the old code turned into a `#` prologue.
const catalogueMetadata: any = {
  name: 'NZ merged catalogue',
  description: 'GeoNet + ISC',
  data_source: 'GeoNet',
  provider: 'GNS',
  license: 'CC BY 4.0',
  citation: 'GeoNet (2020)',
};

/** Render the component, click the CSV export item, and return the downloaded blob. */
function downloadCsv(): { text: string; type: string } {
  const captured: Array<{ text: string; type: string }> = [];

  class CapturingBlob {
    type: string;
    constructor(parts: any[], options?: { type?: string }) {
      this.type = options?.type ?? '';
      captured.push({ text: parts.join(''), type: this.type });
    }
  }

  const originalBlob = (globalThis as any).Blob;
  (globalThis as any).Blob = CapturingBlob as any;
  const createObjectURL = jest.fn(() => 'blob:merge-csv');
  const revokeObjectURL = jest.fn();
  (window.URL as any).createObjectURL = createObjectURL;
  (window.URL as any).revokeObjectURL = revokeObjectURL;
  const click = jest
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);

  try {
    render(
      React.createElement(MergeActions, { events, catalogueMetadata })
    );
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
  } finally {
    (globalThis as any).Blob = originalBlob;
    click.mockRestore();
  }

  expect(captured).toHaveLength(1);
  return captured[0];
}

describe('MergeActions CSV download — one dialect with the server export', () => {
  it('writes a plain RFC 4180 file with the header as record 1', () => {
    const { text, type } = downloadCsv();
    const lines = text.split('\n');

    expect(type).toBe('text/csv');
    // Record 1 is the header, not a comment.
    expect(lines[0]).toBe(CSV_EVENT_HEADERS.join(','));
    expect(lines[0].startsWith('#')).toBe(false);
    // Header + one record per event, and nothing else.
    expect(lines).toHaveLength(1 + events.length);
  });

  it('never emits a `#` metadata prologue, even when metadata is supplied', () => {
    const { text } = downloadCsv();

    expect(text).not.toContain('# Catalogue:');
    expect(text).not.toContain('# License:');
    expect(text).not.toContain('# Event Count:');
    expect(text.split('\n').some(line => line.startsWith('#'))).toBe(false);
  });

  it('emits byte-for-byte what the shared exporter produces', () => {
    const { text } = downloadCsv();

    expect(text).toBe(eventsToCSV(events));
  });

  it('escapes the event fields and keeps the documented column order', () => {
    const { text } = downloadCsv();
    const record = text.split('\n')[1].split(',');

    expect(record[CSV_EVENT_HEADERS.indexOf('ID')]).toBe('ev-1');
    expect(record[CSV_EVENT_HEADERS.indexOf('Time')]).toBe('2020-01-01T00:00:00.000Z');
    expect(record[CSV_EVENT_HEADERS.indexOf('Latitude')]).toBe('-41.5');
    expect(record[CSV_EVENT_HEADERS.indexOf('Magnitude')]).toBe('4.3');
    expect(record[CSV_EVENT_HEADERS.indexOf('MagnitudeType')]).toBe('ML');
    expect(record[CSV_EVENT_HEADERS.indexOf('Source')]).toBe('GeoNet');
    // A null depth is an empty field, not "null".
    const secondRecord = text.split('\n')[2].split(',');
    expect(secondRecord[CSV_EVENT_HEADERS.indexOf('Depth')]).toBe('');
  });
});
