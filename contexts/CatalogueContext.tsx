'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import { getCatalogueSourceType } from '@/lib/catalogue-source-type';
import { invalidateCatalogueData, subscribeToCatalogueInvalidation } from '@/lib/client-cache';
import {
  deriveCatalogueLoadStatus,
  describeCatalogueLoadFailure,
  type CatalogueLoadStatus,
} from './catalogue-load-status';

// Types
interface Catalogue {
  id: string;
  name: string;
  created_at: string;
  source_catalogues: string;
  merge_config: string;
  event_count: number;
  status: string;
  min_latitude?: number | null;
  max_latitude?: number | null;
  min_longitude?: number | null;
  max_longitude?: number | null;
}

interface CatalogueStats {
  totalCatalogues: number;
  totalEvents: number;
  mergedCatalogues: number;
  recentlyAdded: number;
}

interface CatalogueContextType {
  /** Catalogues from the most recent successful response; empty when none has succeeded. */
  catalogues: Catalogue[];
  /**
   * Totals over `catalogues`. They are all 0 until a request succeeds, so check `status`
   * (or hasCatalogueData) before showing them: an unknown total is not a zero total.
   */
  stats: CatalogueStats;
  /** A request for the list is in flight (the first load, a refresh or a retry). */
  loading: boolean;
  /** Why the most recent request failed; kept until a request succeeds, then null. */
  error: string | null;
  /** HTTP status of that failure when the server answered (401: sign in), else null. */
  errorStatus: number | null;
  refreshCatalogues: () => Promise<void>;
  invalidateCache: () => void;
  /** When the list last loaded successfully; null when it never has. Same as lastSuccessAt. */
  lastUpdated: Date | null;
  /** How often the provider refetches the catalogue list, in ms; 0 when it does not. */
  autoRefreshInterval: number;
  /** loading | loaded | empty | failed | stale; see contexts/catalogue-load-status.ts. */
  status: CatalogueLoadStatus;
  /** A request is in flight while data from an earlier success is shown. */
  refreshing: boolean;
  /** Requests the list again (the same request as refreshCatalogues). */
  retry: () => Promise<void>;
  /** When the list last loaded successfully; null when it never has. */
  lastSuccessAt: Date | null;
}

/** A failed catalogue-list request, with a message fit to show to the user. */
class CatalogueLoadError extends Error {
  readonly reason?: unknown;
  readonly status: number | null;

  constructor(message: string, reason?: unknown, status: number | null = null) {
    super(message);
    this.name = 'CatalogueLoadError';
    this.reason = reason;
    this.status = status;
  }
}

// Create context
const CatalogueContext = createContext<CatalogueContextType | undefined>(undefined);

// Provider props
interface CatalogueProviderProps {
  children: ReactNode;
  autoRefreshInterval?: number; // in milliseconds, 0 to disable
}

// Provider component
export function CatalogueProvider({
  children,
  autoRefreshInterval = 21600000 // Default: 6 hours (21600000ms)
}: CatalogueProviderProps) {
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [stats, setStats] = useState<CatalogueStats>({
    totalCatalogues: 0,
    totalEvents: 0,
    mergedCatalogues: 0,
    recentlyAdded: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Only the latest request may update state, so an overlapping request (auto-refresh,
  // invalidation, a retry) that resolves late cannot replace newer results.
  const requestSeq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Calculate statistics from catalogues
  const calculateStats = useCallback((catalogueList: Catalogue[]): CatalogueStats => {
    const totalCatalogues = catalogueList.length;

    // Classify once per catalogue with the shared C6 helper (merged = built from more
    // than one source catalogue), reused below for both totalEvents and
    // mergedCatalogues. The old test — "source_catalogues is a non-empty array" — is
    // true for every catalogue: uploads and GeoNet/FDSN imports each write exactly
    // one self-describing entry (e.g. {"source":"upload"}), not an empty array, so it
    // counted every catalogue as merged (gc#3).
    const sourceTypes = catalogueList.map((cat) => getCatalogueSourceType(cat));

    // A merge's output catalogue duplicates every event already counted in its
    // source catalogues, so summing event_count over every row (including merge
    // outputs) double-counts those events on top of their originals. Excluding
    // merge outputs instead gives an upper bound on distinct stored earthquakes —
    // still not exact, since overlapping upload/import catalogues can share real
    // events, but no longer inflated by the merge copies themselves.
    const totalEvents = catalogueList.reduce(
      (sum, cat, i) => sum + (sourceTypes[i] === 'merged' ? 0 : (cat.event_count || 0)),
      0
    );

    const mergedCatalogues = sourceTypes.filter((type) => type === 'merged').length;

    // Count recently added (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentlyAdded = catalogueList.filter(cat => {
      const createdDate = new Date(cat.created_at);
      return createdDate >= thirtyDaysAgo;
    }).length;

    return {
      totalCatalogues,
      totalEvents,
      mergedCatalogues,
      recentlyAdded,
    };
  }, []);

  // Fetch catalogues from API. A failure keeps the catalogues and stats of the last
  // successful response (reported as stale) instead of replacing them with an empty list,
  // and a failure before any success is reported as failed, not as an empty list.
  const fetchCatalogues = useCallback(async () => {
    const seq = ++requestSeq.current;
    const isCurrent = () => mounted.current && seq === requestSeq.current;
    setLoading(true);

    try {
      let response: Response;
      try {
        // no-store: a browser or intermediate HTTP cache serving a stale response here
        // would silently undo invalidateCatalogueData()'s refetch (gc#0).
        response = await fetch('/api/catalogues', { cache: 'no-store' });
      } catch (err) {
        throw new CatalogueLoadError(describeCatalogueLoadFailure({ kind: 'network' }), err);
      }
      if (!response.ok) {
        throw new CatalogueLoadError(describeCatalogueLoadFailure({ kind: 'http', status: response.status }), undefined, response.status);
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch (err) {
        throw new CatalogueLoadError(describeCatalogueLoadFailure({ kind: 'format' }), err);
      }
      if (!Array.isArray(data)) {
        throw new CatalogueLoadError(describeCatalogueLoadFailure({ kind: 'format' }));
      }

      if (!isCurrent()) return;
      const list = data as Catalogue[];
      setCatalogues(list);
      setStats(calculateStats(list));
      setLastUpdated(new Date());
      setError(null);
      setErrorStatus(null);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof CatalogueLoadError ? err.message : describeCatalogueLoadFailure({ kind: 'format' }));
      setErrorStatus(err instanceof CatalogueLoadError ? err.status : null);
      console.error('Error fetching catalogues:', err instanceof CatalogueLoadError && err.reason ? err.reason : err);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [calculateStats]);

  // Public refresh function
  const refreshCatalogues = useCallback(async () => {
    await fetchCatalogues();
  }, [fetchCatalogues]);

  // Invalidate every client cache that can hold a stale catalogue list or
  // per-catalogue page (lib/client-cache.ts, contract C5) and refetch. The refetch
  // itself happens through the subscription below, so this and any other caller of
  // invalidateCatalogueData() (upload, GeoNet import, merge, delete, rename) share
  // exactly one refetch path instead of racing separate ones.
  const invalidateCache = useCallback(() => {
    invalidateCatalogueData();
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchCatalogues();
  }, [fetchCatalogues]);

  // Refetch whenever anything invalidates catalogue data — this provider's own
  // invalidateCache() above, or a plain invalidateCatalogueData() import used by a
  // flow with no reason to depend on this context (e.g. the upload page). This is
  // what makes CatalogueProvider "the" refetch target promised by contract C5.
  useEffect(() => {
    return subscribeToCatalogueInvalidation(() => {
      fetchCatalogues();
    });
  }, [fetchCatalogues]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshInterval > 0) {
      const interval = setInterval(() => {
        fetchCatalogues();
      }, autoRefreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefreshInterval, fetchCatalogues]);

  const status = deriveCatalogueLoadStatus({
    inFlight: loading,
    lastSuccessAt: lastUpdated,
    lastAttemptFailed: error !== null,
    count: catalogues.length,
  });

  const value = useMemo<CatalogueContextType>(() => ({
    catalogues,
    stats,
    loading,
    error,
    errorStatus,
    refreshCatalogues,
    invalidateCache,
    lastUpdated,
    autoRefreshInterval,
    status,
    refreshing: loading && lastUpdated !== null,
    retry: refreshCatalogues,
    lastSuccessAt: lastUpdated,
  }), [catalogues, stats, loading, error, errorStatus, refreshCatalogues, invalidateCache, lastUpdated, autoRefreshInterval, status]);

  return (
    <CatalogueContext.Provider value={value}>
      {children}
    </CatalogueContext.Provider>
  );
}

// Custom hook to use the context
export function useCatalogues() {
  const context = useContext(CatalogueContext);
  if (context === undefined) {
    throw new Error('useCatalogues must be used within a CatalogueProvider');
  }
  return context;
}

// Export types
export type { Catalogue, CatalogueStats, CatalogueContextType, CatalogueLoadStatus };
