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

/**
 * Gardner-Knopoff (1974) space-time window parameters
 * Standard parameters used for earthquake declustering
 */
function getGardnerKnopoffWindow(magnitude: number): { timeWindowDays: number; distanceWindowKm: number } {
  // Uhrhammer (1986) revision - widely used
  const timeWindowDays = Math.pow(10, 0.5386 * magnitude - 0.547);
  // Gardner & Knopoff (1974) original distance relation
  const distanceWindowKm = Math.pow(10, 0.1238 * magnitude + 0.983);
  return { timeWindowDays, distanceWindowKm };
}

/**
 * Calculate Haversine distance between two points in kilometers
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Seismic cluster interface matching the main library
interface SeismicCluster {
  id: number;
  startDate: string;
  endDate: string;
  eventCount: number;
  maxMagnitude: number;
  mainshock: {
    id: number | string;
    time: string;
    magnitude: number;
    latitude: number;
    longitude: number;
    depth: number;
  };
  aftershockCount: number;
  foreshockCount: number;
  durationDays: number;
  spatialExtentKm: number;
  centerLatitude: number;
  centerLongitude: number;
  clusterType: 'mainshock-aftershock' | 'swarm' | 'burst';
  bValue?: number;
}

/**
 * Gardner-Knopoff Declustering Algorithm (Worker version)
 */
function gardnerKnopoffDeclustering(events: EarthquakeEvent[]): SeismicCluster[] {
  if (events.length < 3) return [];

  // Sort by time
  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  // Filter events with valid locations
  const validEvents = sortedEvents.filter(e =>
    e.latitude != null && e.longitude != null &&
    !isNaN(e.latitude) && !isNaN(e.longitude)
  );

  if (validEvents.length < 3) return [];

  const clusterAssignment = new Map<number | string, number | string>();
  const clusters = new Map<number | string, EarthquakeEvent[]>();

  // Process by magnitude (largest first)
  const byMagnitude = [...validEvents].sort((a, b) => b.magnitude - a.magnitude);

  for (const mainshock of byMagnitude) {
    if (clusterAssignment.has(mainshock.id)) continue;

    const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(mainshock.magnitude);
    const mainshockTime = new Date(mainshock.time).getTime();
    const clusterEvents: EarthquakeEvent[] = [mainshock];

    for (const event of validEvents) {
      if (event.id === mainshock.id || clusterAssignment.has(event.id)) continue;

      const eventTime = new Date(event.time).getTime();
      const timeDiffDays = Math.abs(eventTime - mainshockTime) / (1000 * 60 * 60 * 24);
      if (timeDiffDays > timeWindowDays) continue;

      const distance = haversineDistance(
        mainshock.latitude, mainshock.longitude,
        event.latitude, event.longitude
      );

      if (distance <= distanceWindowKm) {
        clusterEvents.push(event);
        clusterAssignment.set(event.id, mainshock.id);
      }
    }

    if (clusterEvents.length > 1) {
      clusters.set(mainshock.id, clusterEvents);
    }
  }

  // Build cluster info
  const clusterInfo: SeismicCluster[] = [];
  let clusterId = 0;

  clusters.forEach((clusterEvents, mainshockId) => {
    const mainshock = clusterEvents.find(e => e.id === mainshockId)!;
    const sorted = [...clusterEvents].sort((a, b) =>
      new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const mainshockTime = new Date(mainshock.time).getTime();
    const foreshocks = sorted.filter(e => e.id !== mainshockId && new Date(e.time).getTime() < mainshockTime);
    const aftershocks = sorted.filter(e => e.id !== mainshockId && new Date(e.time).getTime() >= mainshockTime);

    // Calculate spatial extent
    let maxDist = 0, sumLat = 0, sumLon = 0;
    clusterEvents.forEach(e => {
      const dist = haversineDistance(mainshock.latitude, mainshock.longitude, e.latitude, e.longitude);
      if (dist > maxDist) maxDist = dist;
      sumLat += e.latitude;
      sumLon += e.longitude;
    });

    const startTime = new Date(sorted[0].time);
    const endTime = new Date(sorted[sorted.length - 1].time);
    const durationDays = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);

    // Classify cluster type
    const mags = clusterEvents.map(e => e.magnitude).sort((a, b) => b - a);
    const magDiff = mags.length > 1 ? mags[0] - mags[1] : 999;

    let clusterType: 'mainshock-aftershock' | 'swarm' | 'burst';
    if (durationDays < 1 && clusterEvents.length >= 3) {
      clusterType = 'burst';
    } else if (magDiff < 0.5 && clusterEvents.length >= 5) {
      clusterType = 'swarm';
    } else {
      clusterType = 'mainshock-aftershock';
    }

    clusterInfo.push({
      id: clusterId++,
      startDate: sorted[0].time,
      endDate: sorted[sorted.length - 1].time,
      eventCount: clusterEvents.length,
      maxMagnitude: mainshock.magnitude,
      mainshock: {
        id: mainshock.id,
        time: mainshock.time,
        magnitude: mainshock.magnitude,
        latitude: mainshock.latitude,
        longitude: mainshock.longitude,
        depth: mainshock.depth
      },
      aftershockCount: aftershocks.length,
      foreshockCount: foreshocks.length,
      durationDays,
      spatialExtentKm: maxDist,
      centerLatitude: sumLat / clusterEvents.length,
      centerLongitude: sumLon / clusterEvents.length,
      clusterType
    });
  });

  // Sort by mainshock magnitude and return top clusters
  return clusterInfo
    .filter(c => c.eventCount >= 3)
    .sort((a, b) => b.maxMagnitude - a.maxMagnitude)
    .slice(0, 20);
}

// Temporal pattern analysis with Gardner-Knopoff declustering
function analyzeTemporalPattern(events: EarthquakeEvent[]) {
  if (events.length === 0) {
    return { error: 'No events to analyze' };
  }

  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const startTime = new Date(sortedEvents[0].time).getTime();
  const endTime = new Date(sortedEvents[sortedEvents.length - 1].time).getTime();
  const timeSpanDays = Math.max((endTime - startTime) / (1000 * 60 * 60 * 24), 1);

  // Use weekly bins if time span > 1 year
  const useWeeklyBins = timeSpanDays > 365;

  const bins = new Map<string, number>();
  sortedEvents.forEach(event => {
    const eventDate = new Date(event.time);
    let binKey: string;
    if (useWeeklyBins) {
      const startOfYear = new Date(eventDate.getFullYear(), 0, 1);
      const weekNum = Math.ceil((((eventDate.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
      binKey = `${eventDate.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
    } else {
      binKey = eventDate.toISOString().split('T')[0];
    }
    bins.set(binKey, (bins.get(binKey) || 0) + 1);
  });

  const timeSeries: { date: string; count: number; cumulativeCount: number }[] = [];
  let cumulative = 0;
  Array.from(bins.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, count]) => {
      cumulative += count;
      timeSeries.push({ date, count, cumulativeCount: cumulative });
    });

  // Use Gardner-Knopoff declustering for proper cluster detection
  const clusters = gardnerKnopoffDeclustering(events);

  return {
    totalEvents: events.length,
    timeSpanDays,
    eventsPerDay: events.length / timeSpanDays,
    eventsPerMonth: (events.length / timeSpanDays) * 30.44,
    eventsPerYear: (events.length / timeSpanDays) * 365.25,
    timeSeries: timeSeries.length > 500
      ? timeSeries.filter((_, i) => i % Math.ceil(timeSeries.length / 500) === 0)
      : timeSeries,
    clusters
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

