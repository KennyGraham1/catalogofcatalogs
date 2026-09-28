/**
 * Regression tests for lib/client-cache.ts (contract C5).
 *
 * gc#0: invalidateCatalogueData() must clear every client cache of /api/catalogues*
 * responses (including hooks/use-cached-fetch's module cache) and notify every
 * subscriber (CatalogueProvider) to refetch.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useCachedFetch, clearAllCache } from '@/hooks/use-cached-fetch';
import { invalidateCatalogueData, subscribeToCatalogueInvalidation } from '@/lib/client-cache';

describe('invalidateCatalogueData', () => {
  beforeEach(() => {
    clearAllCache();
  });

  it('clears cached /api/catalogues* entries so the next read is a real fetch', async () => {
    const fetchMock = jest.fn((url: string) => Promise.resolve({ ok: true, json: async () => ({ url }) }));
    (global as any).fetch = fetchMock;

    renderHook(() => useCachedFetch<any>('/api/catalogues', { cacheTime: 60000 }));
    renderHook(() => useCachedFetch<any>('/api/catalogues/abc/events', { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    invalidateCatalogueData();

    renderHook(() => useCachedFetch<any>('/api/catalogues', { cacheTime: 60000 }));
    renderHook(() => useCachedFetch<any>('/api/catalogues/abc/events', { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it('does not clear caches for unrelated URLs', async () => {
    const fetchMock = jest.fn((url: string) => Promise.resolve({ ok: true, json: async () => ({ url }) }));
    (global as any).fetch = fetchMock;

    const settings = renderHook(() => useCachedFetch<any>('/api/settings/field-mappings', { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    invalidateCatalogueData();

    renderHook(() => useCachedFetch<any>('/api/settings/field-mappings', { cacheTime: 60000 }));
    await waitFor(() => expect(settings.result.current.data).toEqual({ url: '/api/settings/field-mappings' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('notifies every subscriber, and a broken subscriber does not block the others or the cache clear', async () => {
    const fetchMock = jest.fn((url: string) => Promise.resolve({ ok: true, json: async () => ({ url }) }));
    (global as any).fetch = fetchMock;
    renderHook(() => useCachedFetch<any>('/api/catalogues', { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const goodListener = jest.fn();
    const badListener = jest.fn(() => { throw new Error('boom'); });
    const unsubscribeBad = subscribeToCatalogueInvalidation(badListener);
    const unsubscribeGood = subscribeToCatalogueInvalidation(goodListener);

    expect(() => invalidateCatalogueData()).not.toThrow();
    expect(badListener).toHaveBeenCalledTimes(1);
    expect(goodListener).toHaveBeenCalledTimes(1);

    // The cache clear itself still happened despite the throwing listener.
    renderHook(() => useCachedFetch<any>('/api/catalogues', { cacheTime: 60000 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    unsubscribeGood();
    unsubscribeBad();
    invalidateCatalogueData();
    expect(goodListener).toHaveBeenCalledTimes(1); // not called again after unsubscribe
  });
});
