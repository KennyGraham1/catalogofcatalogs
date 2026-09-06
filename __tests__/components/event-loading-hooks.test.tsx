import { act, renderHook, waitFor } from '@testing-library/react';
import { useCatalogueEvents } from '@/hooks/use-catalogue-events';
import { useEventDetails } from '@/hooks/use-event-details';

const catalogues = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
const page = (ids: string[], cursor: string | null = null) => ({
  ok: true, status: 200, json: async () => ({ data: ids.map(id => ({ id })), pagination: { hasMore: Boolean(cursor), nextCursor: cursor } }),
} as Response);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe('event loading hooks', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn(); });
  afterAll(() => { global.fetch = originalFetch; });

  it('exposes a stable preview while downloading and marks completion only after the final page', async () => {
    const middle = deferred<Response>();
    const last = deferred<Response>();
    (fetch as jest.Mock).mockResolvedValueOnce(page(['one'], 'c1')).mockReturnValueOnce(middle.promise).mockReturnValueOnce(last.promise);
    const { result } = renderHook(() => useCatalogueEvents(catalogues, 'a'));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    const preview = result.current.events;
    expect(result.current.loading).toBe(true);
    expect(result.current.complete).toBe(false);
    await act(async () => middle.resolve(page(['two'], 'c2')));
    expect(result.current.events).toBe(preview);
    await act(async () => last.resolve(page(['three'])));
    expect(result.current.events.map(event => event.id)).toEqual(['one', 'two', 'three']);
    expect(result.current.complete).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('ignores stale responses after switching catalogues and reuses completed loads on return', async () => {
    const slow = deferred<Response>();
    (fetch as jest.Mock).mockReturnValueOnce(slow.promise).mockResolvedValueOnce(page(['b-event'])).mockResolvedValueOnce(page(['a-event']));
    const { result, rerender } = renderHook(({ selection }) => useCatalogueEvents(catalogues, selection), { initialProps: { selection: 'a' } });
    rerender({ selection: 'b' });
    await waitFor(() => expect(result.current.complete).toBe(true));
    await act(async () => slow.resolve(page(['obsolete'])));
    expect(result.current.events[0].id).toBe('b-event');
    rerender({ selection: 'a' });
    await waitFor(() => expect(result.current.events[0]?.id).toBe('a-event'));
    rerender({ selection: 'b' });
    await waitFor(() => expect(result.current.events[0]?.id).toBe('b-event'));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('aborts cancellation, keeps a partial preview incomplete, and supports retry', async () => {
    const pending = deferred<Response>();
    (fetch as jest.Mock).mockResolvedValueOnce(page(['one'], 'c')).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page(['complete']));
    const { result } = renderHook(() => useCatalogueEvents(catalogues, 'a'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    act(() => result.current.cancel());
    expect((fetch as jest.Mock).mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => pending.resolve(page(['late'])));
    expect(result.current.events[0].id).toBe('one');
    expect(result.current.complete).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(result.current.events[0].id).toBe('complete');
  });

  it('shows failures without treating a partial catalogue as complete', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(page(['one'], 'c')).mockResolvedValueOnce({ ok: false, status: 503 });
    const { result } = renderHook(() => useCatalogueEvents(catalogues, 'a'));
    await waitFor(() => expect(result.current.error).toContain('HTTP 503'));
    expect(result.current.complete).toBe(false);
    expect(result.current.events).toHaveLength(1);
  });

  it('fetches full details only when enabled and rejects late details for a different event', async () => {
    const slow = deferred<Response>();
    (fetch as jest.Mock).mockReturnValueOnce(slow.promise).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new', picks: '[]' }) });
    const { result, rerender } = renderHook(({ id, enabled }) => useEventDetails('cat', id, enabled), { initialProps: { id: 'old', enabled: false } });
    expect(fetch).not.toHaveBeenCalled();
    rerender({ id: 'old', enabled: true });
    rerender({ id: 'new', enabled: true });
    await waitFor(() => expect(result.current.data?.id).toBe('new'));
    await act(async () => slow.resolve({ ok: true, json: async () => ({ id: 'old' }) } as Response));
    expect(result.current.data?.id).toBe('new');
    rerender({ id: 'new', enabled: false });
    expect(result.current.data).toBeNull();
    rerender({ id: 'new', enabled: true });
    await waitFor(() => expect(result.current.data?.id).toBe('new'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
