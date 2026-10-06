/**
 * Regression tests for the "render origin times in UTC" fix (cluster utc2).
 *
 * Seismological origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z").
 * `new Date(t).toLocaleString('en-GB', {...})` with no `timeZone` renders them in the
 * HOST's zone, so under NZDT (UTC+13) an event is shown on the wrong calendar day for
 * 13 of every 24 hours. Every expected string below is derived by hand from the UTC
 * instant, never by running the code.
 *
 * The Kaikoura mainshock originated at 2016-11-13T11:02:56Z; in Pacific/Auckland the
 * same instant is 14/11/2016 00:02:56 - a different day, month-of-year aside.
 */
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import path from 'path';

import { EventTable } from '@/components/events/EventTable';
import { VirtualizedEventTable } from '@/components/events/VirtualizedEventTable';
import { OptimizedEventPopup } from '@/components/map/OptimizedEventPopup';

const KAIKOURA_UTC = '2016-11-13T11:02:56.000Z';

/**
 * Every event time is written ISO 8601 in UTC, to the second (derived by hand from the
 * instant above). The tables used "13/11/2016, 11:02 UTC" until 2026-10-06; day-first
 * dates are ambiguous to month-first readers, so the platform has one format.
 */
const EXPECTED_TABLE = '2016-11-13 11:02:56 UTC';
const EXPECTED_POPUP = '2016-11-13 11:02:56 UTC';

const event = {
  id: 'kaikoura',
  time: KAIKOURA_UTC,
  latitude: -42.737,
  longitude: 173.054,
  depth: 15.1,
  magnitude: 7.8,
  magnitude_type: 'Mw',
  region: 'Kaikoura',
};

/** Every file in this cluster that formats an origin time with Intl. */
const OWNED_UI_FILES = [
  'app/analytics/page.tsx',
  'components/catalogues/CatalogueStatsPopover.tsx',
  // Both event tables format through this one shared module.
  'components/events/event-table-model.ts',
  'components/map/OptimizedEventPopup.tsx',
];

/** Files that show origin times through a shared formatter rather than their own. */
const DELEGATING_UI_FILES = [
  'components/events/EventTable.tsx',
  'components/events/EventTableParts.tsx',
  'components/events/VirtualizedEventTable.tsx',
  'components/map/EarthquakeCircleMap.tsx',
  'lib/map-format.ts',
];

const readOwned = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

describe('origin times render in UTC', () => {
  it('EventTable shows the UTC calendar day, not the host zone day', () => {
    render(createElement(EventTable, { events: [event] }));
    expect(screen.getByText(EXPECTED_TABLE)).toBeTruthy();
    // 2016-11-14 is what Pacific/Auckland (UTC+13) would show for this instant.
    expect(screen.queryByText(/2016-11-14/)).toBeNull();
  });

  it('VirtualizedEventTable shows the same UTC string as EventTable', () => {
    render(
      createElement(VirtualizedEventTable, { events: [event], height: 400, rowHeight: 48 })
    );
    expect(screen.getByText(EXPECTED_TABLE)).toBeTruthy();
    expect(screen.queryByText(/2016-11-14/)).toBeNull();
  });

  it('OptimizedEventPopup shows the UTC origin time to the second', () => {
    render(createElement(OptimizedEventPopup, { event: { ...event, id: 1 } }));
    expect(screen.getAllByText(EXPECTED_POPUP).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2016-11-14/)).toBeNull();
  });

  it('an unparseable time is shown verbatim rather than throwing', () => {
    // Intl.DateTimeFormat.format() throws RangeError on an invalid Date, where
    // Date.prototype.toLocaleString returned "Invalid Date".
    render(createElement(EventTable, { events: [{ ...event, time: 'not-a-time' }] }));
    expect(screen.getByText('not-a-time')).toBeTruthy();
  });
});

describe('no origin-time renderer is left on the host timezone', () => {
  it.each([...OWNED_UI_FILES, ...DELEGATING_UI_FILES])('%s has no zone-less toLocale* date call', (file) => {
    const source = readOwned(file);
    // Bare `x.toLocaleString()` on a NUMBER (thousands separators) is fine; a date
    // formatted with an explicit locale and no timeZone is the defect.
    const zoneless = source.match(/toLocale(?:String|DateString|TimeString)\(\s*['"]en-GB['"]/g);
    expect(zoneless).toBeNull();
  });

  it.each(OWNED_UI_FILES)('%s formats from the UTC instant (ISO 8601) with the zone named', (file) => {
    const source = readOwned(file);
    // Through the shared formatter (lib/map-format.ts formatOriginTimeUtc) or the UTC
    // instant's own ISO string - never a locale formatter on the host's zone - and the
    // zone is written out so the value cannot be read as local time.
    expect(source).toMatch(/formatOriginTimeUtc\(|toISOString\(\)/);
    expect(source).not.toMatch(/new Intl\.DateTimeFormat\('en-GB'/);
    expect(source).toMatch(/UTC/);
  });

  it('the popup formats the origin time from the UTC instant (toISOString), never the host zone', () => {
    const source = readOwned('lib/map-format.ts');
    expect(source).toContain('toISOString()');
    expect(source).not.toMatch(/get(?:Hours|Date|Month|FullYear)\(/);
    expect(readOwned('components/map/EarthquakeCircleMap.tsx')).toContain('<OptimizedEventPopup');
  });

  it('the popup tooltip no longer calls the origin time local', () => {
    const source = readOwned('components/map/OptimizedEventPopup.tsx');
    expect(source).not.toContain('Event origin time in local timezone.');
    expect(source).toContain('Event origin time in UTC');
  });
});
