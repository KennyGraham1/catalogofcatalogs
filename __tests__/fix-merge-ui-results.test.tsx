/**
 * Regression tests for the merge QC card and the merged-results panel.
 *
 * Origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z"). The Kaikoura mainshock
 * originated at 2016-11-13T11:02:56Z, which is 14/11/2016 00:02:56 in Pacific/Auckland, so a
 * renderer on the host zone shows a different calendar day with no zone label. The QC card
 * writes ISO 8601 date and time with the zone (no day/month ambiguity), as the map hover
 * card does. Expected strings are derived by hand from the UTC instant.
 */
import '@testing-library/jest-dom';
import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

// The result map is loaded through next/dynamic and pulls in Leaflet.
const mockMapProps: Array<Record<string, unknown>> = [];
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function DynamicStub(props: Record<string, unknown>) { mockMapProps.push(props); return null; },
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

import { DuplicateGroupCard } from '@/components/merge/DuplicateGroupCard';
import { MergeActions } from '@/components/merge/MergeActions';

const KAIKOURA_UTC = '2016-11-13T11:02:56.000Z';
const EXPECTED_UTC = '2016-11-13 11:02:56 UTC';
/** What Pacific/Auckland (UTC+13 in November) shows for the same instant, in either order. */
const NZ_LOCAL_DAY = /14\/11\/2016|2016-11-14/;

describe('#31 merge QC card shows origin times in UTC with the zone', () => {
  it('renders every event time in the expanded group table as UTC', () => {
    const group = {
      id: 'g1',
      selectedEventIndex: 0,
      isSuspicious: false,
      validationWarnings: [],
      events: [
        { id: 'a', time: KAIKOURA_UTC, latitude: -42.737, longitude: 173.054, depth: 15.1, magnitude: 7.8, source: 'GeoNet', catalogueId: 'cat-a', catalogueName: 'GeoNet' },
        { id: 'b', time: '2016-11-13T11:02:59.500Z', latitude: -42.7, longitude: 173.1, depth: null, magnitude: 7.7, source: 'USGS', catalogueId: 'cat-b', catalogueName: 'USGS' },
      ],
    };
    render(<DuplicateGroupCard group={group} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    // Expand the per-entry table.
    fireEvent.click(screen.getByRole('button', { name: /Show entries/ }));

    const table = screen.getByRole('table', { name: 'Entries of Group #1' });
    expect(within(table).getByText(EXPECTED_UTC)).toBeInTheDocument();
    expect(within(table).getByText('2016-11-13 11:02:59 UTC')).toBeInTheDocument();
    expect(screen.queryByText(NZ_LOCAL_DAY)).toBeNull();
    expect(screen.queryByText(/\d{2}\/\d{2}\/\d{4}/)).toBeNull();
  });

  it('shows an unparseable time verbatim instead of throwing', () => {
    const group = {
      id: 'g2', selectedEventIndex: 0, isSuspicious: false, validationWarnings: [],
      events: [
        { id: 'a', time: 'not-a-time', latitude: -41, longitude: 174, depth: 10, magnitude: 4, source: 'A', catalogueId: 'a', catalogueName: 'A' },
        { id: 'b', time: KAIKOURA_UTC, latitude: -41, longitude: 174, depth: 10, magnitude: 4, source: 'B', catalogueId: 'b', catalogueName: 'B' },
      ],
    };
    render(<DuplicateGroupCard group={group} groupIndex={0} catalogueColors={{}} onViewOnMap={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Show entries/ }));
    expect(screen.getByText('not-a-time')).toBeInTheDocument();
  });
});

describe('#31 merged-results table keeps unknown depth unknown', () => {
  const events = [
    { id: 'known', time: KAIKOURA_UTC, latitude: -42.737, longitude: 173.054, depth: 15.1, magnitude: 7.8, source_events: '[]' },
    { id: 'unknown', time: '2016-11-14T00:34:22.000Z', latitude: -42.4, longitude: 173.6, depth: null, magnitude: 6.5, source_events: '[]' },
  ];

  it('renders a null depth as a dash, not 0.0 km', () => {
    render(<MergeActions events={events} catalogueMetadata={{ name: 'Merged' }} />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Table View/ }), { button: 0, ctrlKey: false });

    const unknownRow = screen.getByText('6.5').closest('tr')!;
    expect(within(unknownRow).queryByText('0.0')).toBeNull();
    expect(within(unknownRow).getByText('—')).toBeInTheDocument();
    const knownRow = screen.getByText('7.8').closest('tr')!;
    expect(within(knownRow).getByText('15.1')).toBeInTheDocument();
  });
});

describe('merged-results map names the source catalogues', () => {
  it('passes catalogue names by id, from the stored source_catalogues JSON', () => {
    mockMapProps.length = 0;
    render(
      <MergeActions
        events={[{ id: 'e1', time: KAIKOURA_UTC, latitude: -42.7, longitude: 173.1, depth: 15, magnitude: 7.8, source_events: '[]' }]}
        catalogueMetadata={{ name: 'Merged', source_catalogues: JSON.stringify([{ id: 'cat-a', name: 'GeoNet' }, { id: 7, name: 'ISC' }]) }}
      />
    );
    expect(mockMapProps.at(-1)?.catalogueNames).toEqual({ 'cat-a': 'GeoNet', '7': 'ISC' });
  });
});

describe('#72 browser-built downloads parse stored merge provenance', () => {
  it('accepts merge_config / source_catalogues as the JSON strings a catalogue row stores', () => {
    const captured: string[] = [];
    const originalCreateObjectURL = (window.URL as any).createObjectURL;
    const originalRevokeObjectURL = (window.URL as any).revokeObjectURL;
    const originalBlob = (globalThis as any).Blob;
    (globalThis as any).Blob = class { constructor(parts: any[]) { captured.push(parts.join('')); } };
    (window.URL as any).createObjectURL = () => 'blob:results-test';
    (window.URL as any).revokeObjectURL = () => {};
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const config = { timeThreshold: 30, distanceThreshold: 50, mergeStrategy: 'average', priority: 'newest' };
    const sources = [{ id: 'a', name: 'GeoNet', events: 10, source: 'GeoNet' }, { id: 'b', name: 'ISC', events: 8, source: 'ISC' }];
    try {
      render(
        <MergeActions
          events={[{ id: 'e', time: KAIKOURA_UTC, latitude: -42.7, longitude: 173.1, depth: 15, magnitude: 7.8, source_events: '[]' }]}
          catalogueMetadata={{ name: 'Merged', merge_config: JSON.stringify(config), source_catalogues: JSON.stringify(sources) }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
    } finally {
      (globalThis as any).Blob = originalBlob;
      (window.URL as any).createObjectURL = originalCreateObjectURL;
      (window.URL as any).revokeObjectURL = originalRevokeObjectURL;
      click.mockRestore();
    }
    const exported = JSON.parse(captured[0]);
    expect(exported.metadata.merge.config).toEqual(config);
    expect(exported.metadata.provenance.sourceCatalogues).toEqual(sources);
  });
});
