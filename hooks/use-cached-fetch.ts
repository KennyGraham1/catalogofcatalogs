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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = globalCache.get(url);
    const now = Date.now();

    if (cached && now - cached.timestamp < cacheTime) {
      // Cache is still valid - set data immediately
      if (mountedRef.current) {
        setData(cached.data);
        setLoading(false);
        setError(null);
      }
      return;
    }

    // Check if there's already a pending request for this URL
    let pending = pendingRequests.get(url);
    if (pending) {
      // Dedupe: wait for the existing request
      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await pending;
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch'));
          setLoading(false);
        }
      }
      return;
    }

    // Start new request
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    // Create the promise
    const requestPromise = fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((result) => {
        // Update cache
        globalCache.set(url, {
          data: result,
          timestamp: Date.now(),
        });

        // Clean up pending request
        pendingRequests.delete(url);

        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }

        return result;
      })
      .catch((err) => {
        // Clean up pending request
        pendingRequests.delete(url);

        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch'));
          setLoading(false);
        }

        throw err;
      });

    // Store pending request IMMEDIATELY before awaiting to prevent race conditions
    pendingRequests.set(url, requestPromise);

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
        // Update cache with new data
        globalCache.set(url, {
          data: newData,
          timestamp: Date.now(),
        });
        if (mountedRef.current) {
          setData(newData);
        }
      } else {
        // Invalidate cache and refetch
        globalCache.delete(url);
        fetchData();
      }
    },
    [url, fetchData]
  );

  const invalidate = useCallback(() => {
    if (!url) return;
    globalCache.delete(url);
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
  globalCache.clear();
  pendingRequests.clear();
}

// Utility to clear specific cache entry
export function clearCache(url: string) {
  globalCache.delete(url);
}

