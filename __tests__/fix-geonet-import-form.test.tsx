/**
 * GeoNet import form (findings #102, #103, #108, #109 and contract C5).
 *
 *  #102  custom dates are labelled UTC, so they are sent as explicit UTC instants
 *        (a bare datetime-local value was read in the SERVER's timezone).
 *  #103  the form can target an existing GeoNet import catalogue (catalogueId), and
 *        "Update existing events" only applies to one; it never sent a catalogueId,
 *        so every run created another catalogue and the switch did nothing.
 *  #108  a box across 180 degrees is accepted, and the suggested bounds include the
 *        Kermadec and Chatham Islands.
 *  #109  the rows that were not imported are shown, by reason.
 *  C5    a completed import invalidates the client catalogue caches.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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

jest.mock('@/components/ui/ProgressOverlay', () => ({ ProgressOverlay: () => null }));

jest.mock('@/lib/client-cache', () => ({ invalidateCatalogueData: jest.fn() }));

import { ImportForm } from '@/components/import/ImportForm';
import { invalidateCatalogueData } from '@/lib/client-cache';

const CATALOGUES = [
  { id: 'cat-geonet', name: 'GeoNet - Daily', merge_config: JSON.stringify({ source: 'GeoNet' }), event_count: 120 },
  { id: 'cat-upload', name: 'ISC upload', merge_config: JSON.stringify({ source: 'upload' }), event_count: 50 },
  { id: 'cat-merged', name: 'Merged NZ', merge_config: JSON.stringify({ strategy: 'quality' }), event_count: 900 },
];

const RESULT = {
  success: true,
  catalogueId: 'cat-geonet',
  catalogueName: 'GeoNet - Daily',
  totalFetched: 10,
  newEvents: 4,
  updatedEvents: 1,
  skippedEvents: 2,
  collidedEvents: 0,
  invalidEvents: 1,
  excludedEvents: 2,
  excludedEventTypes: { duplicate: 1, 'not existing': 1 },
  failedEvents: 0,
  errors: [],
  startTime: '2026-09-25T00:00:00.000Z',
  endTime: '2026-09-25T00:00:01.000Z',
  duration: 1000,
};

let fetchMock: jest.Mock;
const originalResizeObserver = global.ResizeObserver;

beforeAll(() => {
  // Radix Switch measures itself with ResizeObserver, which jsdom lacks.
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as any;
});

afterAll(() => {
  global.ResizeObserver = originalResizeObserver;
});

beforeEach(() => {
  // jsdom has no fetch Response; the form reads only these members.
  fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => RESULT,
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  (invalidateCatalogueData as jest.Mock).mockClear();
});

function postedBody(): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/import/geonet');
  return JSON.parse(String(init.body));
}

/** The native <select> standing in for a Select whose options include `optionText`. */
function selectWithOption(optionText: string): HTMLSelectElement {
  const select = screen.getAllByRole('combobox').find((el) =>
    within(el).queryByRole('option', { name: optionText })
  );
  if (!select) throw new Error(`no select offers "${optionText}"`);
  return select as HTMLSelectElement;
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /start import/i }));

describe('#103 target catalogue', () => {
  it('offers only the GeoNet import catalogues as targets', () => {
    render(<ImportForm catalogues={CATALOGUES} />);
    const target = selectWithOption('Create a new catalogue');
    const options = within(target).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Create a new catalogue', 'GeoNet - Daily (120 events)']);
  });

  it('sends the chosen catalogue and the update switch, so a re-run updates it', async () => {
    const onImportComplete = jest.fn();
    render(<ImportForm catalogues={CATALOGUES} onImportComplete={onImportComplete} />);

    fireEvent.change(selectWithOption('Create a new catalogue'), { target: { value: 'cat-geonet' } });
    fireEvent.click(screen.getByRole('switch'));
    submit();

    await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
    const body = postedBody();
    expect(body).toMatchObject({ catalogueId: 'cat-geonet', updateExisting: true, hours: 24 });
    expect(body).not.toHaveProperty('catalogueName');
    // C5: the catalogue changed, so every client catalogue cache is invalidated.
    expect(invalidateCatalogueData).toHaveBeenCalledTimes(1);
    expect(onImportComplete).toHaveBeenCalledWith(expect.objectContaining({ catalogueId: 'cat-geonet' }));
  });

  it('creates a new catalogue by name, where there is nothing to update', async () => {
    render(<ImportForm catalogues={CATALOGUES} />);
    expect(screen.getByRole('switch')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Catalogue Name'), { target: { value: 'GeoNet - Kermadec' } });
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = postedBody();
    expect(body).toMatchObject({ catalogueName: 'GeoNet - Kermadec', updateExisting: false });
    expect(body).not.toHaveProperty('catalogueId');
  });

  it('sends the depth filters the Information tab advertises', async () => {
    render(<ImportForm catalogues={[]} />);
    fireEvent.change(screen.getByLabelText('Minimum Depth (km)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Maximum Depth (km)'), { target: { value: '40' } });
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBody()).toMatchObject({ minDepth: 0, maxDepth: 40 });
  });
});

describe('#102 custom date range', () => {
  it('sends the UTC-labelled times as explicit UTC', async () => {
    const { container } = render(<ImportForm catalogues={[]} />);
    fireEvent.change(selectWithOption('Custom Date Range'), { target: { value: 'custom' } });
    fireEvent.change(container.querySelector('#startDate')!, { target: { value: '2024-10-24T00:00' } });
    fireEvent.change(container.querySelector('#endDate')!, { target: { value: '2024-10-25T00:00' } });
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBody()).toMatchObject({
      startDate: '2024-10-24T00:00:00Z',
      endDate: '2024-10-25T00:00:00Z',
    });
  });
});

describe('#108 antimeridian-crossing bounds', () => {
  it('accepts a box across 180 degrees and sends it as entered', async () => {
    render(<ImportForm catalogues={[]} />);
    fireEvent.change(screen.getByLabelText('Minimum Longitude'), { target: { value: '170' } });
    fireEvent.change(screen.getByLabelText('Maximum Longitude'), { target: { value: '-175' } });
    expect(screen.getByText(/crosses the 180° meridian/)).toBeInTheDocument();
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBody()).toMatchObject({ minLongitude: 170, maxLongitude: -175 });
    expect(screen.queryByText(/cannot be greater than maximum longitude/i)).not.toBeInTheDocument();
  });

  it('suggests New Zealand bounds that include the Kermadec and Chatham Islands', () => {
    render(<ImportForm catalogues={[]} />);
    expect(screen.getByLabelText('Maximum Longitude')).toHaveAttribute('placeholder', expect.stringContaining('-175.0'));
    expect(screen.getByLabelText('Maximum Latitude')).toHaveAttribute('placeholder', expect.stringContaining('-28.0'));

    fireEvent.click(screen.getByRole('button', { name: /use new zealand region/i }));
    const value = (label: string) => Number((screen.getByLabelText(label) as HTMLInputElement).value);
    const [south, north, west, east] = ['Minimum Latitude', 'Maximum Latitude', 'Minimum Longitude', 'Maximum Longitude'].map(value);
    // Raoul Island (Kermadec) 29.27 S 177.92 W; Chatham Islands 44 S 176.5 W.
    for (const [lat, lon] of [[-29.27, -177.92], [-44.0, -176.5], [-41.3, 174.8]]) {
      expect(lat).toBeGreaterThanOrEqual(south);
      expect(lat).toBeLessThanOrEqual(north);
      // A crossing box contains lon when it lies east of the west edge or west of the east edge.
      expect(west > east ? lon >= west || lon <= east : lon >= west && lon <= east).toBe(true);
    }
  });
});

describe('#109 result', () => {
  it('shows the rows that were not imported, by reason', async () => {
    render(<ImportForm catalogues={CATALOGUES} />);
    submit();
    expect(await screen.findByText(/Excluded \(GeoNet flags them as not real events\)/)).toBeInTheDocument();
    expect(screen.getByText(/duplicate: 1, not existing: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid or unusable rows/)).toBeInTheDocument();
    // Zero buckets are not listed.
    expect(screen.queryByText(/Not written \(database error\)/)).not.toBeInTheDocument();
  });
});
