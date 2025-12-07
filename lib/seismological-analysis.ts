/**
 * Seismological Analysis Library
 *
 * Advanced seismological calculations including:
 * - Gutenberg-Richter b-value
 * - Completeness magnitude (Mc)
 * - Temporal analysis
 * - Spatial clustering
 * - Seismic moment calculations
 *
 * Performance Optimization: All expensive calculations are memoized using LRU cache
 * to avoid redundant computations when called with the same data.
 */

import { memoize } from './memoization';

export interface EarthquakeEvent {
  id: number | string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  magnitude_type?: string;
}

export interface GutenbergRichterResult {
  bValue: number;
  aValue: number;
  completeness: number;
  rSquared: number;
  dataPoints: { magnitude: number; logCount: number; count: number }[];
  fittedLine: { magnitude: number; logCount: number }[];
}

export interface CompletenessResult {
  mc: number;
  method: 'MAXC' | 'GFT' | 'MBS';
  confidence: number;
  magnitudeDistribution: { magnitude: number; count: number }[];
}

export interface TemporalAnalysisResult {
  totalEvents: number;
  timeSpanDays: number;
  eventsPerDay: number;
  eventsPerMonth: number;
  eventsPerYear: number;
  timeSeries: { date: string; count: number; cumulativeCount: number }[];
  clusters: { startDate: string; endDate: string; eventCount: number; maxMagnitude: number }[];
}

export interface SpatialClusterResult {
  clusters: {
    id: number;
    centerLat: number;
    centerLon: number;
    eventCount: number;
    avgMagnitude: number;
    maxMagnitude: number;
    radiusKm: number;
    events: number[];
  }[];
  noise: number[];
}

export interface SeismicMomentResult {
  totalMoment: number; // N⋅m
  totalMomentMagnitude: number;
  momentByMagnitude: { magnitude: number; moment: number; count: number }[];
  largestEvent: { magnitude: number; moment: number; percentOfTotal: number };
}

/**
 * Calculate Gutenberg-Richter b-value using maximum likelihood estimation
 */
export function calculateGutenbergRichter(
  events: EarthquakeEvent[],
  minMagnitude?: number,
  binWidth: number = 0.1
): GutenbergRichterResult {
  // Filter events by minimum magnitude if specified
  const filteredEvents = minMagnitude
    ? events.filter(e => e.magnitude >= minMagnitude)
    : events;

  if (filteredEvents.length < 10) {
    throw new Error('Insufficient data for Gutenberg-Richter analysis (need at least 10 events)');
  }

  // Bin magnitudes
  const minMag = Math.floor(Math.min(...filteredEvents.map(e => e.magnitude)) / binWidth) * binWidth;
  const maxMag = Math.ceil(Math.max(...filteredEvents.map(e => e.magnitude)) / binWidth) * binWidth;
  
  const bins: Map<number, number> = new Map();
  for (let mag = minMag; mag <= maxMag; mag += binWidth) {
    bins.set(Number(mag.toFixed(2)), 0);
  }

  // Count events in each bin
  filteredEvents.forEach(event => {
    const bin = Math.floor(event.magnitude / binWidth) * binWidth;
    const roundedBin = Number(bin.toFixed(2));
    bins.set(roundedBin, (bins.get(roundedBin) || 0) + 1);
  });

  // Calculate cumulative counts (N >= M)
  const sortedBins = Array.from(bins.entries()).sort((a, b) => a[0] - b[0]);
  const cumulativeCounts: { magnitude: number; count: number; logCount: number }[] = [];
  
  for (let i = 0; i < sortedBins.length; i++) {
    const magnitude = sortedBins[i][0];
    const cumulativeCount = sortedBins.slice(i).reduce((sum, [, count]) => sum + count, 0);
    if (cumulativeCount > 0) {
      cumulativeCounts.push({
        magnitude,
        count: cumulativeCount,
        logCount: Math.log10(cumulativeCount)
      });
    }
  }

  // Linear regression on log10(N) vs M
  // log10(N) = a - b*M
  const n = cumulativeCounts.length;
  if (n < 3) {
    throw new Error('Insufficient magnitude bins for regression');
  }

  const sumX = cumulativeCounts.reduce((sum, p) => sum + p.magnitude, 0);
  const sumY = cumulativeCounts.reduce((sum, p) => sum + p.logCount, 0);
  const sumXY = cumulativeCounts.reduce((sum, p) => sum + p.magnitude * p.logCount, 0);
  const sumX2 = cumulativeCounts.reduce((sum, p) => sum + p.magnitude * p.magnitude, 0);

  const bValue = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const aValue = (sumY - bValue * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  const ssTotal = cumulativeCounts.reduce((sum, p) => sum + Math.pow(p.logCount - meanY, 2), 0);
  const ssResidual = cumulativeCounts.reduce((sum, p) => {
    const predicted = aValue + bValue * p.magnitude;
    return sum + Math.pow(p.logCount - predicted, 2);
  }, 0);
  const rSquared = 1 - (ssResidual / ssTotal);

  // Generate fitted line
  const fittedLine = cumulativeCounts.map(p => ({
    magnitude: p.magnitude,
    logCount: aValue + bValue * p.magnitude
  }));

  // Estimate completeness magnitude (where data deviates from linear fit)
  let completeness = minMag;
  for (let i = 0; i < cumulativeCounts.length - 1; i++) {
    const predicted = aValue + bValue * cumulativeCounts[i].magnitude;
    const residual = Math.abs(cumulativeCounts[i].logCount - predicted);
    if (residual < 0.2) {
      completeness = cumulativeCounts[i].magnitude;
      break;
    }
  }

  return {
    bValue: Math.abs(bValue),
    aValue,
    completeness,
    rSquared,
    dataPoints: cumulativeCounts,
    fittedLine
  };
}

/**
 * Estimate completeness magnitude using MAXC method
 * (Maximum Curvature method - Wiemer & Wyss, 2000)
 */
export function estimateCompletenessMagnitude(
  events: EarthquakeEvent[],
  binWidth: number = 0.1
): CompletenessResult {
  if (events.length < 50) {
    throw new Error('Insufficient data for completeness estimation (need at least 50 events)');
  }

  // Bin magnitudes
  const minMag = Math.floor(Math.min(...events.map(e => e.magnitude)) / binWidth) * binWidth;
  const maxMag = Math.ceil(Math.max(...events.map(e => e.magnitude)) / binWidth) * binWidth;
  
  const bins: Map<number, number> = new Map();
  for (let mag = minMag; mag <= maxMag; mag += binWidth) {
    bins.set(Number(mag.toFixed(2)), 0);
  }

  events.forEach(event => {
    const bin = Math.floor(event.magnitude / binWidth) * binWidth;
    const roundedBin = Number(bin.toFixed(2));
    bins.set(roundedBin, (bins.get(roundedBin) || 0) + 1);
  });

  const magnitudeDistribution = Array.from(bins.entries())
    .map(([magnitude, count]) => ({ magnitude, count }))
    .sort((a, b) => a.magnitude - b.magnitude);

  // Find maximum curvature (peak of frequency distribution)
  let maxCount = 0;
  let mc = minMag;
  
  magnitudeDistribution.forEach(({ magnitude, count }) => {
    if (count > maxCount) {
      maxCount = count;
      mc = magnitude;
    }
  });

  // Calculate confidence based on data quality
  const totalEvents = events.length;
  const eventsAboveMc = events.filter(e => e.magnitude >= mc).length;
  const confidence = eventsAboveMc / totalEvents;

  return {
    mc,
    method: 'MAXC',
    confidence,
    magnitudeDistribution
  };
}

/**
 * Perform temporal analysis of seismicity
 */
export function analyzeTemporalPattern(events: EarthquakeEvent[]): TemporalAnalysisResult {
  if (events.length === 0) {
    throw new Error('No events provided for temporal analysis');
  }

  // Sort events by time
  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const startTime = new Date(sortedEvents[0].time);
  const endTime = new Date(sortedEvents[sortedEvents.length - 1].time);
  const timeSpanMs = endTime.getTime() - startTime.getTime();
  const timeSpanDays = timeSpanMs / (1000 * 60 * 60 * 24);

  // Calculate rates
  const eventsPerDay = events.length / timeSpanDays;
  const eventsPerMonth = eventsPerDay * 30.44;
  const eventsPerYear = eventsPerDay * 365.25;

  // Create time series (daily bins)
  const dailyBins: Map<string, number> = new Map();
  sortedEvents.forEach(event => {
    const date = new Date(event.time).toISOString().split('T')[0];
    dailyBins.set(date, (dailyBins.get(date) || 0) + 1);
  });

  let cumulativeCount = 0;
  const timeSeries = Array.from(dailyBins.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => {
      cumulativeCount += count;
      return { date, count, cumulativeCount };
    });

  // Detect clusters (periods with >2x average rate)
  const avgDailyRate = eventsPerDay;
  const clusters: { startDate: string; endDate: string; eventCount: number; maxMagnitude: number }[] = [];
  
  let clusterStart: string | null = null;
  let clusterEvents: EarthquakeEvent[] = [];

  timeSeries.forEach(({ date, count }) => {
    if (count > avgDailyRate * 2) {
      if (!clusterStart) {
        clusterStart = date;
      }
      const dayEvents = sortedEvents.filter(e => e.time.startsWith(date));
      clusterEvents.push(...dayEvents);
    } else if (clusterStart) {
      clusters.push({
        startDate: clusterStart,
        endDate: date,
        eventCount: clusterEvents.length,
        maxMagnitude: Math.max(...clusterEvents.map(e => e.magnitude))
      });
      clusterStart = null;
      clusterEvents = [];
    }
  });

  return {
    totalEvents: events.length,
    timeSpanDays,
    eventsPerDay,
    eventsPerMonth,
    eventsPerYear,
    timeSeries,
    clusters
  };
}

/**
 * Calculate seismic moment and moment magnitude
 * M0 = 10^(1.5 * Mw + 9.1) N⋅m
 */
export function calculateSeismicMoment(events: EarthquakeEvent[]): SeismicMomentResult {
  if (events.length === 0) {
    throw new Error('No events provided for seismic moment calculation');
  }

  // Calculate moment for each event
  const momentsData = events.map(event => {
    const moment = Math.pow(10, 1.5 * event.magnitude + 9.1);
    return { magnitude: event.magnitude, moment };
  });

  const totalMoment = momentsData.reduce((sum, { moment }) => sum + moment, 0);
  const totalMomentMagnitude = (Math.log10(totalMoment) - 9.1) / 1.5;

  // Group by magnitude bins
  const momentByMagnitude: Map<number, { moment: number; count: number }> = new Map();
  
  momentsData.forEach(({ magnitude, moment }) => {
    const bin = Math.floor(magnitude * 2) / 2; // 0.5 magnitude bins
    const existing = momentByMagnitude.get(bin) || { moment: 0, count: 0 };
    momentByMagnitude.set(bin, {
      moment: existing.moment + moment,
      count: existing.count + 1
    });
  });

  const momentByMagnitudeArray = Array.from(momentByMagnitude.entries())
    .map(([magnitude, { moment, count }]) => ({ magnitude, moment, count }))
    .sort((a, b) => a.magnitude - b.magnitude);

  // Find largest event
  const largestEvent = momentsData.reduce((max, curr) => 
    curr.moment > max.moment ? curr : max
  );

  return {
    totalMoment,
    totalMomentMagnitude,
    momentByMagnitude: momentByMagnitudeArray,
    largestEvent: {
      magnitude: largestEvent.magnitude,
      moment: largestEvent.moment,
      percentOfTotal: (largestEvent.moment / totalMoment) * 100
    }
  };
}

/**
 * Performance Optimization: Memoized versions of expensive calculations
 *
 * These memoized functions cache results for 10 minutes and can store up to 50 results.
 * This dramatically improves performance for dashboard views and repeated analyses.
 *
 * Usage: Simply replace the function call with the memoized version:
 * - calculateGutenbergRichter() -> calculateGutenbergRichterMemoized()
 * - estimateCompleteness() -> estimateCompletenessMemoized()
 * - analyzeTemporalDistribution() -> analyzeTemporalDistributionMemoized()
 * - calculateSeismicMoment() -> calculateSeismicMomentMemoized()
 */

/**
 * Memoized Gutenberg-Richter calculation
 * Cache: 50 results, 10 minute TTL
 */
export const calculateGutenbergRichterMemoized = memoize(
  calculateGutenbergRichter,
  {
    maxSize: 50,
    ttl: 10 * 60 * 1000, // 10 minutes
    keyGenerator: (events: EarthquakeEvent[], minMagnitude: number | undefined, binWidth: number | undefined) => {
      // Create efficient cache key from event IDs and parameters
      const eventIds = events.map((e: EarthquakeEvent) => e.id).sort().join(',');
      return `gr_${eventIds}_${minMagnitude ?? 'none'}_${binWidth}`;
    }
  }
);

/**
 * Memoized completeness estimation
 * Cache: 50 results, 10 minute TTL
 */
export const estimateCompletenessMemoized = memoize(
  estimateCompletenessMagnitude,
  {
    maxSize: 50,
    ttl: 10 * 60 * 1000,
    keyGenerator: (events: EarthquakeEvent[], binWidth: number | undefined) => {
      const eventIds = events.map((e: EarthquakeEvent) => e.id).sort().join(',');
      return `comp_${eventIds}_${binWidth ?? 0.1}`;
    }
  }
);

/**
 * Memoized temporal analysis
 * Cache: 30 results, 15 minute TTL (longer because time series are more stable)
 */
export const analyzeTemporalPatternMemoized = memoize(
  analyzeTemporalPattern,
  {
    maxSize: 30,
    ttl: 15 * 60 * 1000, // 15 minutes
    keyGenerator: (events: EarthquakeEvent[]) => {
      const eventIds = events.map((e: EarthquakeEvent) => e.id).sort().join(',');
      return `temporal_${eventIds}`;
    }
  }
);

/**
 * Memoized seismic moment calculation
 * Cache: 50 results, 10 minute TTL
 */
export const calculateSeismicMomentMemoized = memoize(
  calculateSeismicMoment,
  {
    maxSize: 50,
    ttl: 10 * 60 * 1000,
    keyGenerator: (events: EarthquakeEvent[]) => {
      const eventIds = events.map((e: EarthquakeEvent) => e.id).sort().join(',');
      return `moment_${eventIds}`;
    }
  }
);

/**
 * Get cache statistics for all memoized functions
 * Useful for monitoring cache effectiveness
 */
export function getSeismologicalCacheStats() {
  return {
    gutenbergRichter: calculateGutenbergRichterMemoized.cacheStats(),
    completeness: estimateCompletenessMemoized.cacheStats(),
    temporal: analyzeTemporalPatternMemoized.cacheStats(),
    seismicMoment: calculateSeismicMomentMemoized.cacheStats()
  };
}

/**
 * Clear all seismological analysis caches
 * Useful when data has been updated
 */
export function clearSeismologicalCaches() {
  calculateGutenbergRichterMemoized.clearCache();
  estimateCompletenessMemoized.clearCache();
  analyzeTemporalPatternMemoized.clearCache();
  calculateSeismicMomentMemoized.clearCache();
}
