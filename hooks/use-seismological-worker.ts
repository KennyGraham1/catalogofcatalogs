'use client';

import { useState, useEffect, useRef } from 'react';

interface EarthquakeEvent {
  id: number | string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  magnitude_type?: string;
}

interface WorkerResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
}

type AnalysisType = 'gutenberg-richter' | 'completeness' | 'temporal' | 'moment';

/**
 * Hook for running seismological analysis in a web worker
 * Prevents UI blocking during heavy computations
 */
export function useSeismologicalWorker<T>(
  type: AnalysisType,
  events: EarthquakeEvent[],
  enabled: boolean = true,
  options?: { minMagnitude?: number; binWidth?: number }
): WorkerResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  
  const workerRef = useRef<Worker | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Don't run if not enabled or no events
    if (!enabled || events.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }

    // Minimum event requirements
    const minEvents = type === 'completeness' ? 50 : type === 'gutenberg-richter' ? 10 : 1;
    if (events.length < minEvents) {
      setError(`Insufficient data (need at least ${minEvents} events)`);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Create worker
    try {
      // Use dynamic import for worker
      const worker = new Worker(
        new URL('../workers/seismological-worker.ts', import.meta.url)
      );
      workerRef.current = worker;

      worker.onmessage = (e) => {
        if (!mountedRef.current) return;
        
        const { result, cached: wasCached } = e.data;
        
        if (result.error) {
          setError(result.error);
          setData(null);
        } else {
          setData(result);
          setError(null);
        }
        setCached(wasCached);
        setLoading(false);
      };

      worker.onerror = (e) => {
        if (!mountedRef.current) return;
        setError(e.message || 'Worker error');
        setLoading(false);
      };

      // Send data to worker
      worker.postMessage({
        type,
        events,
        ...options
      });

    } catch (err) {
      // Fallback if workers aren't supported
      setError('Web Workers not supported');
      setLoading(false);
    }

    // Cleanup
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [type, events, enabled, options?.minMagnitude, options?.binWidth]);

  return { data, loading, error, cached };
}

/**
 * Hook to manage multiple seismological analyses with lazy loading
 */
export function useSeismologicalAnalyses(events: EarthquakeEvent[], activeTab: string) {
  // Only compute analysis for active tab
  const grEnabled = activeTab === 'gutenberg-richter' && events.length >= 10;
  const completenessEnabled = activeTab === 'completeness' && events.length >= 50;
  const temporalEnabled = activeTab === 'temporal' && events.length > 0;
  const momentEnabled = activeTab === 'moment' && events.length > 0;

  const gr = useSeismologicalWorker<any>('gutenberg-richter', events, grEnabled);
  const completeness = useSeismologicalWorker<any>('completeness', events, completenessEnabled);
  const temporal = useSeismologicalWorker<any>('temporal', events, temporalEnabled);
  const moment = useSeismologicalWorker<any>('moment', events, momentEnabled);

  return {
    grAnalysis: gr,
    completeness,
    temporalAnalysis: temporal,
    momentAnalysis: moment,
    anyLoading: gr.loading || completeness.loading || temporal.loading || moment.loading
  };
}

export default useSeismologicalWorker;

