/**
 * Finding #16: the catalogue statistics popover formatted the earliest and latest
 * origin times in the browser's zone with no zone label. Origin times are UTC
 * (QuakeML 1.2 / ISO 8601), and the analytics page renders them in UTC, so under
 * NZDT the popover put a boundary event on the next calendar day (and sometimes the
 * next year). Expected strings are derived by hand from the UTC instants.
 */
process.env.TZ = 'Pacific/Auckland';

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CatalogueStatsPopover } from '@/components/catalogues/CatalogueStatsPopover';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

it('shows the UTC calendar day of the earliest and latest origin times, labelled UTC', async () => {
  // Kaikoura mainshock 2016-11-13T11:02:56Z is 14/11/2016 in Pacific/Auckland (UTC+13);
  // 2024-12-31T12:30Z is already 01/01/2025 there.
  expect(new Date('2016-11-13T11:02:56.000Z').getDate()).toBe(14); // the zone really is NZDT here
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
