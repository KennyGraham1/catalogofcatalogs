'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface UseCachedFetchOptions {
  cacheTime?: number; // Time in ms to keep cache valid (default: 5 minutes)
  dedupingInterval?: number; // Time in ms to dedupe requests (default: 2 seconds)
}

// Global cache shared across all hook instances
const globalCache = new Map<string, CacheEntry<any>>();
const pendingRequests = new Map<string, Promise<any>>();
// Bumped whenever a URL's cache entry is explicitly invalidated (clearCache /
// clearAllCache / clearCacheByPrefix). A request already in flight at that moment is
// carrying a possibly pre-invalidation snapshot; comparing generations when it
// resolves stops it from writing that snapshot back into the shared cache and
// undoing the invalidation (gc#0: a remount right after invalidateCatalogueData()
// must not see the pre-mutation list resurface).
const cacheGeneration = new Map<string, number>();

function currentGeneration(url: string): number {
  return cacheGeneration.get(url) ?? 0;
}

function bumpGeneration(url: string): void {
  cacheGeneration.set(url, currentGeneration(url) + 1);
}

export function useCachedFetch<T>(
  url: string | null,
  options: UseCachedFetchOptions = {}
) {
  const {
    cacheTime = 5 * 60 * 1000, // 5 minutes default
    dedupingInterval = 2000, // 2 seconds default
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  // Latest url this hook instance has been asked to fetch. A response that started
  // before the caller moved on to a different url (e.g. a catalogue id changed while
  // the previous id's request was still in flight) must not overwrite the state for
  // the url the hook has since moved to.
  const latestUrlRef = useRef(url);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    latestUrlRef.current = url;
  }, [url]);

  const fetchData = useCallback(async () => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }

    const requestUrl = url;
    const isCurrent = () => mountedRef.current && latestUrlRef.current === requestUrl;

    // Check cache first
    const cached = globalCache.get(requestUrl);
    const now = Date.now();

    if (cached && now - cached.timestamp < cacheTime) {
      // Cache is still valid - set data immediately
      if (isCurrent()) {
        setData(cached.data);
        setLoading(false);
        setError(null);
      }
      return;
    }

    // Check if there's already a pending request for this URL
    let pending = pendingRequests.get(requestUrl);
    if (pending) {
      // Dedupe: wait for the existing request
      if (isCurrent()) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await pending;
        if (isCurrent()) {
          setData(result);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (isCurrent()) {
          setError(err instanceof Error ? err : new Error('Failed to fetch'));
          setLoading(false);
        }
      }
      return;
    }

    // Start new request
    if (isCurrent()) {
      setLoading(true);
      setError(null);
    }

    // Snapshot this URL's generation now: if it changes before the response comes
    // back, the response is stale with respect to a later invalidation.
    const requestGeneration = currentGeneration(requestUrl);

    // Create the promise
    const requestPromise = fetch(requestUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((result) => {
        // Clean up pending request
        pendingRequests.delete(requestUrl);

        // Only resurrect the shared cache if nothing invalidated this URL while the
        // request was in flight. A stale response is still handed to this instance
        // below (better than an indefinite spinner) but is not allowed to poison
        // future readers of the cache with pre-invalidation data.
        if (currentGeneration(requestUrl) === requestGeneration) {
          globalCache.set(requestUrl, {
            data: result,
            timestamp: Date.now(),
          });
        }

        if (isCurrent()) {
          setData(result);
          setLoading(false);
        }

        return result;
      })
      .catch((err) => {
        // Clean up pending request
        pendingRequests.delete(requestUrl);

        if (isCurrent()) {
          setError(err instanceof Error ? err : new Error('Failed to fetch'));
          setLoading(false);
        }

        throw err;
      });

    // Store pending request IMMEDIATELY before awaiting to prevent race conditions
    pendingRequests.set(requestUrl, requestPromise);

    try {
      await requestPromise;
    } catch (err) {
      // Error already handled in catch block above
    }
  }, [url, cacheTime]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = useCallback(
    (newData?: T) => {
      if (!url) return;

      if (newData !== undefined) {
        // Update cache with new data. Bumping the generation stops a slower,
        // already-in-flight GET for this url from clobbering this authoritative
        // value once it resolves.
        bumpGeneration(url);
        globalCache.set(url, {
          data: newData,
          timestamp: Date.now(),
        });
        if (mountedRef.current) {
          setData(newData);
        }
      } else {
        // Invalidate cache and refetch
        clearCache(url);
        fetchData();
      }
    },
    [url, fetchData]
  );

  const invalidate = useCallback(() => {
    if (!url) return;
    clearCache(url);
  }, [url]);

  return {
    data,
    loading,
    error,
    mutate,
    invalidate,
    refetch: fetchData,
  };
}

// Utility to clear all cache
export function clearAllCache() {
  // Array.from(...): the project's ES5 TS target cannot iterate a Map iterator
  // directly (spread/for-of) without downlevelIteration, matching the existing
  // pattern in lib/cache.ts's invalidateByPrefix/invalidateBySubstring.
  const keys = new Set<string>([...Array.from(globalCache.keys()), ...Array.from(pendingRequests.keys())]);
  keys.forEach(bumpGeneration);
  globalCache.clear();
  pendingRequests.clear();
}

// Utility to clear specific cache entry
export function clearCache(url: string) {
  bumpGeneration(url);
  globalCache.delete(url);
}

/**
 * Clears every cached entry (and generation-guards every in-flight request, see
 * above) whose URL starts with `prefix`. lib/client-cache.ts's
 * invalidateCatalogueData() (contract C5) uses this to drop every /api/catalogues*
 * entry in one call — the analytics, catalogue detail and map pages each key their
 * useCachedFetch calls off a distinct exact URL under that prefix, so a single
 * targeted clearCache(url) cannot reach all of them.
 */
export function clearCacheByPrefix(prefix: string): void {
  const keys = new Set<string>();
  // Array.from(...): see the note in clearAllCache above.
  for (const key of Array.from(globalCache.keys())) {
    if (key.startsWith(prefix)) keys.add(key);
  }
  for (const key of Array.from(pendingRequests.keys())) {
    if (key.startsWith(prefix)) keys.add(key);
  }
  keys.forEach((key) => {
    bumpGeneration(key);
    globalCache.delete(key);
  });
}

