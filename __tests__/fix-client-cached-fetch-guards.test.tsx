/**
 * Regression tests for hooks/use-cached-fetch.ts (gc#0).
 *
 * gc#0 found that the module-global cache is never invalidated on mutation and,
 * relatedly, that an in-flight request racing an invalidation can write pre-mutation
 * data back into the cache right after it was cleared. These tests cover the two
 * guards added to fix that race, plus the new clearCacheByPrefix export that
 * lib/client-cache.ts's invalidateCatalogueData() (contract C5) depends on to reach
 * every /api/catalogues* entry in one call.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useCachedFetch, clearCache, clearAllCache, clearCacheByPrefix } from '@/hooks/use-cached-fetch';

describe('useCachedFetch stale in-flight guards', () => {
  beforeEach(() => {
    clearAllCache();
  });

  it('does not let a response that was in flight during an invalidation repopulate the shared cache', async () => {
    const url = '/api/x-generation-guard';
    let resolveFirst: (value: unknown) => void = () => {};
    const gate = new Promise((resolve) => { resolveFirst = resolve; });
    const fetchMock = jest.fn()
      .mockImplementationOnce(() => gate.then(() => ({ ok: true, json: async () => ({ stale: true }) })))
      .mockImplementation(async () => ({ ok: true, json: async () => ({ fresh: true }) }));
    (global as any).fetch = fetchMock;

    const first = renderHook(() => useCachedFetch<any>(url, { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(first.result.current.loading).toBe(true);

    // Simulate a mutation elsewhere invalidating this URL while the GET above is
    // still in flight (e.g. invalidateCatalogueData() runs mid-request).
    clearCache(url);

    // Let the now-stale request resolve.
    resolveFirst(undefined);
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    // The originating instance still gets its own response rather than hanging forever.
    expect(first.result.current.data).toEqual({ stale: true });

    // A fresh mount must NOT see {stale:true} resurrected into the cache: the
    // invalidation has to still be in effect, forcing a real network request.
    const second = renderHook(() => useCachedFetch<any>(url, { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.data).toEqual({ fresh: true }));
  });

  it('ignores a stale response for a previous url once the hook has moved on to a new url', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    const oldGate = new Promise((resolve) => { resolveOld = resolve; });
    const fetchMock = jest.fn((url: string) => {
      if (url === '/api/catalogues/OLD/events') {
        return oldGate.then(() => ({ ok: true, json: async () => ({ id: 'OLD' }) }));
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'NEW' }) });
    });
    (global as any).fetch = fetchMock;

    const { result, rerender } = renderHook(
      ({ url }) => useCachedFetch<any>(url, { cacheTime: 60000 }),
      { initialProps: { url: '/api/catalogues/OLD/events' } }
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/catalogues/OLD/events'));

    // The user switches to a different catalogue before the OLD request returns
    // (e.g. the catalogue id in the route changed under the same mounted component).
    rerender({ url: '/api/catalogues/NEW/events' });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'NEW' }));

    // The slow OLD request now resolves. It must not clobber the NEW url's state.
    resolveOld(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.data).toEqual({ id: 'NEW' });
  });

  it('clearCacheByPrefix clears every URL sharing a prefix and leaves others cached', async () => {
    const fetchMock = jest.fn((url: string) => Promise.resolve({ ok: true, json: async () => ({ url }) }));
    (global as any).fetch = fetchMock;

    renderHook(() => useCachedFetch<any>('/api/catalogues', { cacheTime: 60000 }));
    renderHook(() => useCachedFetch<any>('/api/catalogues/123/events', { cacheTime: 60000 }));
    renderHook(() => useCachedFetch<any>('/api/settings/field-mappings', { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    clearCacheByPrefix('/api/catalogues');

    // Both /api/catalogues* URLs were cleared and must be refetched.
    renderHook(() => useCachedFetch<any>('/api/catalogues', { cacheTime: 60000 }));
    renderHook(() => useCachedFetch<any>('/api/catalogues/123/events', { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

    // The unrelated prefix was left alone and is still served from cache.
    const settings = renderHook(() => useCachedFetch<any>('/api/settings/field-mappings', { cacheTime: 60000 }));
    await waitFor(() => expect(settings.result.current.data).toEqual({ url: '/api/settings/field-mappings' }));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
