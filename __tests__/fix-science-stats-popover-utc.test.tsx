/**
 * Finding #16: the catalogue statistics popover formatted the earliest and latest
 * origin times in the browser's zone with no zone label. Origin times are UTC
 * (QuakeML 1.2 / ISO 8601), and the analytics page renders them in UTC, so under
 * NZDT the popover put a boundary event on the next calendar day (and sometimes the
 * next year). Expected strings are derived by hand from the UTC instants.
 *
 * The assertions hold on any host: the popover must show the UTC day, labelled UTC, and
 * never the New Zealand day. (Assigning process.env.TZ here would not change the zone: Jest
 * gives each test file its own copy of process.env. A zone-less formatter in this component
 * is caught on any host by the source scan in __tests__/utc2-utc-origin-times.test.ts.)
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CatalogueStatsPopover } from '@/components/catalogues/CatalogueStatsPopover';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

it('shows the UTC calendar day of the earliest and latest origin times, labelled UTC', async () => {
  // Kaikoura mainshock 2016-11-13T11:02:56Z is 14/11/2016 in Pacific/Auckland (UTC+13);
  // 2024-12-31T12:30Z is already 01/01/2025 there.
  const nzDay = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', day: 'numeric' }).format(new Date(iso));
  expect([nzDay('2016-11-13T11:02:56.000Z'), nzDay('2024-12-31T12:30:00.000Z')]).toEqual(['14', '1']); // boundary instants
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      eventCount: 2,
      dateRange: { earliest: '2016-11-13T11:02:56.000Z', latest: '2024-12-31T12:30:00.000Z', spanDays: 2970 },
    }),
  }) as any;

  render(<CatalogueStatsPopover catalogueId="kaikoura" catalogueName="Kaikoura sequence" />);
  fireEvent.click(screen.getByRole('button', { name: /View statistics for Kaikoura sequence/ }));

  const earliest = await screen.findByText(/13\/11\/2016/);
  expect(earliest).toHaveTextContent('UTC');
  expect(screen.getByText(/31\/12\/2024/)).toHaveTextContent('UTC');
  expect(screen.queryByText(/14\/11\/2016/)).not.toBeInTheDocument();
  expect(screen.queryByText(/01\/01\/2025/)).not.toBeInTheDocument();
});
