'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { apiCache } from '@/lib/cache';

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
  catalogues: Catalogue[];
  stats: CatalogueStats;
  loading: boolean;
  error: string | null;
  refreshCatalogues: () => Promise<void>;
  invalidateCache: () => void;
  lastUpdated: Date | null;
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Calculate statistics from catalogues
  const calculateStats = useCallback((catalogueList: Catalogue[]): CatalogueStats => {
    const totalCatalogues = catalogueList.length;
    const totalEvents = catalogueList.reduce((sum, cat) => sum + (cat.event_count || 0), 0);
    
    // Count merged catalogues (those with source_catalogues)
    const mergedCatalogues = catalogueList.filter(cat => {
      try {
        const sources = JSON.parse(cat.source_catalogues || '[]');
        return Array.isArray(sources) && sources.length > 0;
      } catch {
        return false;
      }
    }).length;

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

  // Fetch catalogues from API
  const fetchCatalogues = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/catalogues');
      if (!response.ok) {
        throw new Error('Failed to fetch catalogues');
      }

      const data = await response.json();
      setCatalogues(data);
      setStats(calculateStats(data));
      setLastUpdated(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load catalogues';
      setError(errorMessage);
      console.error('Error fetching catalogues:', err);
    } finally {
      setLoading(false);
    }
  }, [calculateStats]);

  // Public refresh function
  const refreshCatalogues = useCallback(async () => {
    await fetchCatalogues();
  }, [fetchCatalogues]);

  // Invalidate cache and refresh
  const invalidateCache = useCallback(() => {
    apiCache.clearAll();
    fetchCatalogues();
  }, [fetchCatalogues]);

  // Initial fetch
  useEffect(() => {
    fetchCatalogues();
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

  const value: CatalogueContextType = {
    catalogues,
    stats,
    loading,
    error,
    refreshCatalogues,
    invalidateCache,
    lastUpdated,
  };

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
export type { Catalogue, CatalogueStats, CatalogueContextType };

