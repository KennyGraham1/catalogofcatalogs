'use client';

import { useState, useEffect, useMemo } from 'react';
import { createSeismologicalWorker } from '@/lib/seismological-worker-client';
import type { McMethod, RateIntervalOption } from '@/lib/seismological-analysis';

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

type AnalysisType = 'gutenberg-richter' | 'completeness' | 'temporal' | 'moment' | 'time-series';

/** Parameters an analysis reads besides its events (workers/seismological-worker.ts). */
export interface SeismologicalWorkerOptions {
  /** Explicit magnitude cut-off (G-R fit, time series). */
  minMagnitude?: number;
  binWidth?: number;
  /** How Mc is estimated wherever it is: b-value stability (default), the goodness-of-fit test or MAXC. */
  mcMethod?: McMethod;
  /** Correction added to the MAXC bin (default 0.2). */
  maxcCorrection?: number;
  /** Bin interval of the time series (default 'auto'). */
  interval?: RateIntervalOption;
  /**
   * The period the events are known to cover (UTC, ISO strings), against which the
   * time series measures partial first and last bins.
   */
  period?: { start: string; end: string };
}

/**
 * Hook for running seismological analysis in a web worker
 * Prevents UI blocking during heavy computations
 */
export function useSeismologicalWorker<T>(
  type: AnalysisType,
  events: EarthquakeEvent[],
  enabled: boolean = true,
  options?: SeismologicalWorkerOptions
): WorkerResult<T> {
  const minMagnitude = options?.minMagnitude;
  const binWidth = options?.binWidth;
  const mcMethod = options?.mcMethod;
  const maxcCorrection = options?.maxcCorrection;
  const interval = options?.interval;
  const periodStart = options?.period?.start;
  const periodEnd = options?.period?.end;
  const request = useMemo(() => ({ type, events, enabled, minMagnitude, binWidth, mcMethod, maxcCorrection, interval, periodStart, periodEnd }),
    [type, events, enabled, minMagnitude, binWidth, mcMethod, maxcCorrection, interval, periodStart, periodEnd]);
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
    // The worker's own floors, checked here so no worker starts for a withheld fit:
    // 50 events whenever Mc is estimated (the Mc tab, or a G-R fit without an
    // explicit cut-off), 10 for a G-R fit above a supplied cut-off. The time series
    // counts every event itself when there are too few to estimate Mc.
    const minEvents = type === 'completeness' ? 50
      : type === 'gutenberg-richter' ? (minMagnitude == null ? 50 : 10) : 1;
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
      const period = periodStart != null && periodEnd != null ? { start: periodStart, end: periodEnd } : undefined;
      worker.postMessage({ type, minMagnitude, binWidth, mcMethod, maxcCorrection, interval, period, events: events.map(event => ({
        id: event.id, time: event.time, latitude: event.latitude, longitude: event.longitude,
        depth: event.depth, magnitude: event.magnitude, magnitude_type: event.magnitude_type,
      })) });
    } catch (error) {
      active = false;
      worker?.terminate();
      finish({ error: error instanceof Error ? error.message : 'Unable to start analysis worker' });
    }
    return () => { active = false; worker?.terminate(); };
  }, [request, type, events, enabled, minMagnitude, binWidth, mcMethod, maxcCorrection, interval, periodStart, periodEnd]);

  // A queued message or an old result must never describe newly selected inputs.
  return state.request === request ? state : pending;
}

/**
 * Hook to manage multiple seismological analyses with lazy loading
 *
 * `options.fitEvents` feeds the G-R and Mc fits when they need a different sample
 * from `events`, and `options.minMagnitude` is the G-R fit's explicit cut-off. The
 * Analytics page passes its events without the magnitude filter's lower bound plus
 * that bound as the cut-off: run on a sample already cut at c, MAXC finds its peak
 * at c by construction and reports Mc = c + 0.2, discarding a further ~37% of the
 * events the user kept (Woessner & Wiemer, 2005: MAXC needs the untruncated FMD).
 *
 * `mcMethod` and `maxcCorrection` choose the Mc estimate the G-R fit, the Mc tab and
 * the seismicity-rate series share. The Temporal tab runs two analyses: 'temporal'
 * (rates, cumulative count, declustering) and the cheap 'time-series' (rate above Mc
 * and cumulative moment per `rateInterval` bin), so changing the interval does not
 * rerun the declustering.
 */
export function useSeismologicalAnalyses(
  events: EarthquakeEvent[],
  activeTab: string,
  options?: {
    fitEvents?: EarthquakeEvent[];
    minMagnitude?: number;
    mcMethod?: McMethod;
    maxcCorrection?: number;
    rateInterval?: RateIntervalOption;
    /** Known coverage period of `events`, for the time series' partial bins. */
    period?: { start: string; end: string };
  }
) {
  const fitEvents = options?.fitEvents ?? events;
  const mcMethod = options?.mcMethod;
  const maxcCorrection = options?.maxcCorrection;
  // Only compute analysis for active tab
  const grEnabled = activeTab === 'gutenberg-richter';
  const completenessEnabled = activeTab === 'completeness';
  const temporalEnabled = activeTab === 'temporal' && events.length > 0;
  const momentEnabled = activeTab === 'moment' && events.length > 0;

  const gr = useSeismologicalWorker<any>('gutenberg-richter', fitEvents, grEnabled,
    { minMagnitude: options?.minMagnitude, mcMethod, maxcCorrection });
  const completeness = useSeismologicalWorker<any>('completeness', fitEvents, completenessEnabled,
    { mcMethod, maxcCorrection });
  const temporal = useSeismologicalWorker<any>('temporal', events, temporalEnabled);
  const timeSeries = useSeismologicalWorker<any>('time-series', events, temporalEnabled,
    { minMagnitude: options?.minMagnitude, mcMethod, maxcCorrection, interval: options?.rateInterval, period: options?.period });
  const moment = useSeismologicalWorker<any>('moment', events, momentEnabled);

  return {
    grAnalysis: gr,
    completeness,
    temporalAnalysis: temporal,
    timeSeriesAnalysis: timeSeries,
    momentAnalysis: moment,
    anyLoading: gr.loading || completeness.loading || temporal.loading || timeSeries.loading || moment.loading
  };
}

export default useSeismologicalWorker;
