/**
 * Web Worker for Seismological Analysis
 * 
 * Offloads heavy computations to a separate thread to prevent UI freezing.
 * Handles: Gutenberg-Richter, Completeness, Temporal Analysis, Seismic Moment
 */

// Event data interface (must match main thread)
interface EarthquakeEvent {
  id: number | string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  magnitude_type?: string;
}

// Message types
type WorkerMessage = 
  | { type: 'gutenberg-richter'; events: EarthquakeEvent[]; minMagnitude?: number; binWidth?: number }
  | { type: 'completeness'; events: EarthquakeEvent[] }
  | { type: 'temporal'; events: EarthquakeEvent[] }
  | { type: 'moment'; events: EarthquakeEvent[] }
  | { type: 'statistics'; events: EarthquakeEvent[] };

// Simple cache using Map (workers have their own memory space)
const cache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(type: string, events: EarthquakeEvent[]): string {
  // Use a fast hash based on event count and a sample of IDs
  const eventCount = events.length;
  const sampleIds = events.length > 100 
    ? [events[0]?.id, events[Math.floor(events.length/2)]?.id, events[events.length-1]?.id].join('_')
    : events.map(e => e.id).join('_');
  return `${type}_${eventCount}_${sampleIds}`;
}

function getFromCache(key: string): any | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.result;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, result: any): void {
  // Limit cache size
  if (cache.size > 50) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { result, timestamp: Date.now() });
}

// Gutenberg-Richter calculation
function calculateGutenbergRichter(events: EarthquakeEvent[], minMagnitude?: number, binWidth = 0.1) {
  const filteredEvents = minMagnitude 
    ? events.filter(e => e.magnitude >= minMagnitude)
    : events;

  if (filteredEvents.length < 10) {
    return { error: 'Insufficient data (need at least 10 events)' };
  }

  const magnitudes = filteredEvents.map(e => e.magnitude);
  const minMag = Math.floor(Math.min(...magnitudes) / binWidth) * binWidth;
  const maxMag = Math.ceil(Math.max(...magnitudes) / binWidth) * binWidth;

  const bins = new Map<number, number>();
  for (let mag = minMag; mag <= maxMag; mag += binWidth) {
    bins.set(Number(mag.toFixed(2)), 0);
  }

  filteredEvents.forEach(event => {
    const bin = Math.floor(event.magnitude / binWidth) * binWidth;
    const roundedBin = Number(bin.toFixed(2));
    bins.set(roundedBin, (bins.get(roundedBin) || 0) + 1);
  });

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

  const n = cumulativeCounts.length;
  if (n < 3) return { error: 'Insufficient magnitude bins' };

  const sumX = cumulativeCounts.reduce((sum, p) => sum + p.magnitude, 0);
  const sumY = cumulativeCounts.reduce((sum, p) => sum + p.logCount, 0);
  const sumXY = cumulativeCounts.reduce((sum, p) => sum + p.magnitude * p.logCount, 0);
  const sumX2 = cumulativeCounts.reduce((sum, p) => sum + p.magnitude * p.magnitude, 0);

  const bValue = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const aValue = (sumY - bValue * sumX) / n;

  const meanY = sumY / n;
  const ssTotal = cumulativeCounts.reduce((sum, p) => sum + Math.pow(p.logCount - meanY, 2), 0);
  const ssResidual = cumulativeCounts.reduce((sum, p) => {
    const predicted = aValue + bValue * p.magnitude;
    return sum + Math.pow(p.logCount - predicted, 2);
  }, 0);
  const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

  // Estimate completeness magnitude (max curvature)
  let maxCount = 0;
  let completeness = minMag;
  sortedBins.forEach(([mag, count]) => {
    if (count > maxCount) {
      maxCount = count;
      completeness = mag;
    }
  });

  const fittedLine = cumulativeCounts.map(p => ({
    magnitude: p.magnitude,
    logCount: aValue + bValue * p.magnitude
  }));

  return {
    bValue: -bValue, // Convention: b-value is positive
    aValue,
    completeness: completeness + binWidth * 0.5,
    rSquared,
    dataPoints: cumulativeCounts,
    fittedLine
  };
}

// Completeness magnitude estimation
function estimateCompleteness(events: EarthquakeEvent[]) {
  if (events.length < 50) {
    return { error: 'Insufficient data (need at least 50 events)' };
  }

  const binWidth = 0.1;
  const magnitudes = events.map(e => e.magnitude);
  const minMag = Math.floor(Math.min(...magnitudes) / binWidth) * binWidth;
  const maxMag = Math.ceil(Math.max(...magnitudes) / binWidth) * binWidth;

  const distribution: { magnitude: number; count: number }[] = [];
  for (let mag = minMag; mag <= maxMag; mag += binWidth) {
    const count = events.filter(e =>
      e.magnitude >= mag && e.magnitude < mag + binWidth
    ).length;
    distribution.push({ magnitude: Number(mag.toFixed(2)), count });
  }

  // Find Mc using maximum curvature method
  let maxCount = 0;
  let mc = minMag;
  distribution.forEach(({ magnitude, count }) => {
    if (count > maxCount) {
      maxCount = count;
      mc = magnitude;
    }
  });

  mc += binWidth * 0.5; // Center of bin

  const eventsAboveMc = events.filter(e => e.magnitude >= mc).length;
  const confidence = eventsAboveMc / events.length;

  return {
    mc,
    method: 'MAXC' as const,
    confidence,
    magnitudeDistribution: distribution
  };
}

// Temporal pattern analysis
function analyzeTemporalPattern(events: EarthquakeEvent[]) {
  if (events.length === 0) {
    return { error: 'No events to analyze' };
  }

  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const startTime = new Date(sortedEvents[0].time).getTime();
  const endTime = new Date(sortedEvents[sortedEvents.length - 1].time).getTime();
  const timeSpanDays = (endTime - startTime) / (1000 * 60 * 60 * 24);

  // Aggregate by day for time series
  const dayMap = new Map<string, number>();
  sortedEvents.forEach(event => {
    const day = new Date(event.time).toISOString().split('T')[0];
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  });

  const timeSeries: { date: string; count: number; cumulativeCount: number }[] = [];
  let cumulative = 0;
  Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, count]) => {
      cumulative += count;
      timeSeries.push({ date, count, cumulativeCount: cumulative });
    });

  // Detect clusters (simplified: periods with >2x average daily rate)
  const avgDaily = events.length / Math.max(timeSpanDays, 1);
  const clusters: { startDate: string; endDate: string; eventCount: number; maxMagnitude: number }[] = [];

  let clusterStart: string | null = null;
  let clusterEvents: EarthquakeEvent[] = [];

  timeSeries.forEach(({ date, count }) => {
    if (count > avgDaily * 2) {
      if (!clusterStart) clusterStart = date;
      const dayEvents = sortedEvents.filter(e => e.time.startsWith(date));
      clusterEvents.push(...dayEvents);
    } else if (clusterStart) {
      clusters.push({
        startDate: clusterStart,
        endDate: timeSeries[timeSeries.indexOf({ date, count, cumulativeCount: 0 }) - 1]?.date || clusterStart,
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
    eventsPerDay: events.length / Math.max(timeSpanDays, 1),
    eventsPerMonth: (events.length / Math.max(timeSpanDays, 1)) * 30,
    eventsPerYear: (events.length / Math.max(timeSpanDays, 1)) * 365,
    timeSeries: timeSeries.length > 500
      ? timeSeries.filter((_, i) => i % Math.ceil(timeSeries.length / 500) === 0)
      : timeSeries,
    clusters: clusters.slice(0, 10) // Limit to top 10 clusters
  };
}

// Seismic moment calculation
function calculateSeismicMoment(events: EarthquakeEvent[]) {
  if (events.length === 0) {
    return { error: 'No events to analyze' };
  }

  // M0 = 10^(1.5 * Mw + 9.1) in N⋅m
  const momentForMagnitude = (mag: number) => Math.pow(10, 1.5 * mag + 9.1);

  let totalMoment = 0;
  let largestMoment = 0;
  let largestMag = 0;

  const momentByMagBin = new Map<number, { moment: number; count: number }>();

  events.forEach(event => {
    const moment = momentForMagnitude(event.magnitude);
    totalMoment += moment;

    if (moment > largestMoment) {
      largestMoment = moment;
      largestMag = event.magnitude;
    }

    const bin = Math.floor(event.magnitude);
    const existing = momentByMagBin.get(bin) || { moment: 0, count: 0 };
    momentByMagBin.set(bin, {
      moment: existing.moment + moment,
      count: existing.count + 1
    });
  });

  const totalMomentMagnitude = (Math.log10(totalMoment) - 9.1) / 1.5;

  const momentByMagnitude = Array.from(momentByMagBin.entries())
    .map(([magnitude, { moment, count }]) => ({ magnitude, moment, count }))
    .sort((a, b) => a.magnitude - b.magnitude);

  return {
    totalMoment,
    totalMomentMagnitude,
    momentByMagnitude,
    largestEvent: {
      magnitude: largestMag,
      moment: largestMoment,
      percentOfTotal: (largestMoment / totalMoment) * 100
    }
  };
}

// Handle messages from main thread
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, events } = e.data as { type: string; events: EarthquakeEvent[] };

  const cacheKey = getCacheKey(type, events);
  const cached = getFromCache(cacheKey);

  if (cached) {
    self.postMessage({ type, result: cached, cached: true });
    return;
  }

  let result: any;

  try {
    switch (type) {
      case 'gutenberg-richter':
        result = calculateGutenbergRichter(
          events,
          (e.data as any).minMagnitude,
          (e.data as any).binWidth
        );
        break;
      case 'completeness':
        result = estimateCompleteness(events);
        break;
      case 'temporal':
        result = analyzeTemporalPattern(events);
        break;
      case 'moment':
        result = calculateSeismicMoment(events);
        break;
      default:
        result = { error: `Unknown analysis type: ${type}` };
    }

    if (!result.error) {
      setCache(cacheKey, result);
    }

    self.postMessage({ type, result, cached: false });
  } catch (error) {
    self.postMessage({
      type,
      result: { error: error instanceof Error ? error.message : 'Unknown error' },
      cached: false
    });
  }
};

export {};

