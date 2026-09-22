'use client';

import { useState, useEffect, useMemo } from 'react';
import { createSeismologicalWorker } from '@/lib/seismological-worker-client';

interface EarthquakeEvent {
  id: number | string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
  magnitude_type?: string | null;
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
  const minMagnitude = options?.minMagnitude;
  const binWidth = options?.binWidth;
  const request = useMemo(() => ({ type, events, enabled, minMagnitude, binWidth }),
    [type, events, enabled, minMagnitude, binWidth]);
  const pending: WorkerResult<T> = { data: null, loading: enabled && events.length > 0, error: null, cached: false };
  const [state, setState] = useState<WorkerResult<T> & { request: typeof request }>({ ...pending, request });

  useEffect(() => {
    const finish = (result: Partial<WorkerResult<T>>) => setState({
      request, data: null, loading: false, error: null, cached: false, ...result,
    });
    if (!enabled || events.length === 0) {
      finish({});
      return;
    }
    const minEvents = type === 'completeness' ? 50 : type === 'gutenberg-richter' ? 10 : 1;
    if (events.length < minEvents) {
      finish({ error: `Insufficient data (need at least ${minEvents} events)` });
      return;
    }
    finish({ loading: true });
    let active = true;
    let worker: Worker | undefined;
    try {
      worker = createSeismologicalWorker();
      worker.onmessage = event => {
        if (!active) return;
        const { result, cached } = event.data;
        finish(result?.error ? { error: result.error } : { data: result, cached: Boolean(cached) });
      };
      worker.onerror = event => {
        if (active) finish({ error: event.message || 'Analysis worker failed' });
      };
      // Send only the inputs the science algorithms use. Nested event details
      // otherwise incur an unnecessary structured clone for every tab change.
      worker.postMessage({ type, minMagnitude, binWidth, events: events.map(event => ({
        id: event.id, time: event.time, latitude: event.latitude, longitude: event.longitude,
        depth: event.depth, magnitude: event.magnitude, magnitude_type: event.magnitude_type,
      })) });
    } catch (error) {
      active = false;
      worker?.terminate();
      finish({ error: error instanceof Error ? error.message : 'Unable to start analysis worker' });
    }
    return () => { active = false; worker?.terminate(); };
  }, [request, type, events, enabled, minMagnitude, binWidth]);

  // A queued message or an old result must never describe newly selected inputs.
  return state.request === request ? state : pending;
}

/**
 * Hook to manage multiple seismological analyses with lazy loading
 */
export function useSeismologicalAnalyses(events: EarthquakeEvent[], activeTab: string) {
  // Only compute analysis for active tab
  const grEnabled = activeTab === 'gutenberg-richter';
  const completenessEnabled = activeTab === 'completeness';
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

