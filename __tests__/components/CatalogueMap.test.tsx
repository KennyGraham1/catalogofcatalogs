import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogueMap } from '@/components/dashboard/CatalogueMap';

jest.mock('@/components/map/EarthquakeCircleMap', () => ({
  EarthquakeCircleMap: ({ events }: any) => <div data-testid="event-map">{events.map((e: any) => e.id).join(',')}</div>,
}));
// Use native controls to exercise the dashboard's fetch/selection state machine.
jest.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => <select aria-label="Catalogue" value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const catalogues = [{ id: 'a', name: 'A', event_count: 10 }, { id: 'b', name: 'B', event_count: 20 }];
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => data } as Response);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('CatalogueMap', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn(); });
  afterAll(() => { global.fetch = originalFetch; });

  it('finishes loading when no catalogues exist', async () => {
    (fetch as jest.Mock).mockResolvedValue(response([]));
    render(<CatalogueMap />);
    expect(await screen.findByText('No catalogues found')).toBeInTheDocument();
    expect(screen.queryByText('Loading earthquake data...')).not.toBeInTheDocument();
  });

  it('reports catalogue loading errors', async () => {
    (fetch as jest.Mock).mockResolvedValue(response(null, false));
    render(<CatalogueMap />);
    expect(await screen.findByText('Failed to fetch catalogues')).toBeInTheDocument();
  });

  it.each([[], null])('keeps catalogue selection available after an empty/error response (%s)', async data => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(catalogues))
      .mockResolvedValueOnce(response(data, data !== null))
      .mockResolvedValueOnce(response([{ id: 'b-event' }]));
    render(<CatalogueMap />);
    await screen.findByText(data === null ? 'Failed to load A (HTTP 500)' : 'No earthquake events found in this catalogue');
    fireEvent.change(screen.getByRole('combobox', { name: 'Catalogue' }), { target: { value: 'b' } });
    expect(await screen.findByTestId('event-map')).toHaveTextContent('b-event');
  });

  it('aborts obsolete requests and ignores late responses when catalogues change', async () => {
    const slow = deferred<Response>();
    const latest = deferred<Response>();
    (fetch as jest.Mock)
      .mockResolvedValueOnce(response(catalogues))
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(latest.promise);
    render(<CatalogueMap />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByRole('combobox', { name: 'Catalogue' }), { target: { value: 'b' } });
    expect((fetch as jest.Mock).mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => latest.resolve(response([{ id: 'b-event' }])));
    expect(screen.getByTestId('event-map')).toHaveTextContent('b-event');
    await act(async () => slow.resolve(response([{ id: 'a-event' }])));
    expect(screen.getByTestId('event-map')).toHaveTextContent('b-event');
  });

  it('aborts pending requests when unmounted', async () => {
    (fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<CatalogueMap />);
    const signal = (fetch as jest.Mock).mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
