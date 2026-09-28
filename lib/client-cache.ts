'use client';

import { clearCacheByPrefix } from '@/hooks/use-cached-fetch';

/**
 * Client-side catalogue cache invalidation (contract C5).
 *
 * gc#0 found that CatalogueContext's invalidateCache() only cleared an empty browser
 * cache (lib/cache.ts's apiCache, which nothing on the client ever populates — that
 * module is bundled separately per side, so the client's copy never sees what the
 * server's API routes write into it) and that hooks/use-cached-fetch's own
 * module-global cache (used by the analytics, catalogue detail and map pages) was
 * never touched by anything, so a merge, delete, rename, upload or GeoNet import left
 * every one of those pages showing the pre-mutation catalogue list or event pages for
 * up to their TTL (5-10 minutes).
 *
 * This module is the single place that knows every client-side cache capable of
 * holding a stale /api/catalogues* response. Callers outside the CatalogueContext
 * tree (upload, GeoNet import, catalogue edit/delete) that have no reason to depend
 * on the context can still invalidate correctly by importing invalidateCatalogueData
 * directly instead of going through useCatalogues().
 */

type InvalidationListener = () => void;

const listeners = new Set<InvalidationListener>();

// Every useCachedFetch call site that reads catalogue data keys its cache entry off
// a URL starting with this prefix (e.g. '/api/catalogues', '/api/catalogues/<id>',
// '/api/catalogues/<id>/events'), so a single prefix clear reaches all of them
// without this module needing to know each page's exact URL.
const CATALOGUE_API_PREFIX = '/api/catalogues';

/**
 * Registers a callback to run whenever invalidateCatalogueData() is called anywhere
 * in the app. CatalogueProvider subscribes on mount so that a mutation triggered from
 * outside the context (e.g. the upload page, which has no reason to depend on
 * useCatalogues()) still makes the provider refetch, per contract C5 ("triggers
 * CatalogueProvider to refetch"). Returns an unsubscribe function; call it on unmount
 * so a provider instance that has gone away is not kept alive by this module-global
 * registry.
 */
export function subscribeToCatalogueInvalidation(listener: InvalidationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Clears every client-side cache that can hold a stale /api/catalogues* response
 * (contract C5) and asks every subscriber — normally just the root CatalogueProvider
 * — to refetch. Call this after any mutation that creates, modifies or deletes a
 * catalogue: upload, GeoNet import, merge, delete, rename. Safe to call even if no
 * CatalogueProvider is currently mounted (e.g. in a unit test): the cache is still
 * cleared, there are just no listeners to notify.
 */
export function invalidateCatalogueData(): void {
  clearCacheByPrefix(CATALOGUE_API_PREFIX);
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      // A broken subscriber must not stop the cache clear above, nor stop the
      // remaining subscribers (e.g. a second CatalogueProvider in a test tree) from
      // being notified.
      console.error('[client-cache] invalidateCatalogueData listener failed:', err);
    }
  });
}
