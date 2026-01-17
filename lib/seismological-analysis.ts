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
  clusters: SeismicCluster[];
}

/**
 * Seismic cluster identified through declustering analysis
 */
export interface SeismicCluster {
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
  bValue?: number; // b-value of the sequence if calculable
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
 * Magnitude-Frequency Distribution (MFD) result for a single catalogue
 */
export interface MFDResult {
  catalogueId: string;
  catalogueName: string;
  color: string;
  totalEvents: number;
  minMagnitude: number;
  maxMagnitude: number;
  // Non-cumulative histogram (incremental count per bin)
  histogram: { magnitude: number; count: number }[];
  // Cumulative distribution (N >= M)
  cumulative: { magnitude: number; count: number; logCount: number }[];
}

/**
 * Combined MFD results for multiple catalogues
 */
export interface MFDComparisonResult {
  catalogues: MFDResult[];
  magnitudeRange: { min: number; max: number };
  binWidth: number;
}

/**
 * Calculate Magnitude-Frequency Distribution for a catalogue
 * Returns both incremental histogram and cumulative distribution
 */
export function calculateMFD(
  events: EarthquakeEvent[],
  catalogueId: string,
  catalogueName: string,
  color: string,
  binWidth: number = 0.1,
  minMagnitude?: number
): MFDResult {
  if (events.length === 0) {
    return {
      catalogueId,
      catalogueName,
      color,
      totalEvents: 0,
      minMagnitude: 0,
      maxMagnitude: 0,
      histogram: [],
      cumulative: [],
    };
  }

  // Filter by minimum magnitude if specified
  let magnitudes = events.map(e => e.magnitude).filter(m => m != null && !isNaN(m));

  if (minMagnitude !== undefined) {
    magnitudes = magnitudes.filter(m => m >= minMagnitude);
  }

  if (magnitudes.length === 0) {
    return {
      catalogueId,
      catalogueName,
      color,
      totalEvents: 0,
      minMagnitude: minMagnitude || 0,
      maxMagnitude: 0,
      histogram: [],
      cumulative: [],
    };
  }

  const minMag = Math.floor(Math.min(...magnitudes) / binWidth) * binWidth;
  const maxMag = Math.ceil(Math.max(...magnitudes) / binWidth) * binWidth;

  // Create histogram bins
  const bins: Map<number, number> = new Map();
  for (let mag = minMag; mag <= maxMag + binWidth; mag += binWidth) {
    const roundedMag = Math.round(mag * 10) / 10; // Round to avoid floating point issues
    bins.set(roundedMag, 0);
  }

  // Count events in each bin
  magnitudes.forEach(mag => {
    const bin = Math.floor(mag / binWidth) * binWidth;
    const roundedBin = Math.round(bin * 10) / 10;
    bins.set(roundedBin, (bins.get(roundedBin) || 0) + 1);
  });

  // Convert to sorted array for histogram
  const sortedBins = Array.from(bins.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([magnitude, count]) => ({ magnitude, count }));

  // Calculate cumulative counts (N >= M)
  const cumulative: { magnitude: number; count: number; logCount: number }[] = [];
  for (let i = 0; i < sortedBins.length; i++) {
    const magnitude = sortedBins[i].magnitude;
    const cumulativeCount = sortedBins.slice(i).reduce((sum, bin) => sum + bin.count, 0);
    if (cumulativeCount > 0) {
      cumulative.push({
        magnitude,
        count: cumulativeCount,
        logCount: Math.log10(cumulativeCount),
      });
    }
  }

  return {
    catalogueId,
    catalogueName,
    color,
    totalEvents: magnitudes.length,
    minMagnitude: minMag,
    maxMagnitude: maxMag,
    histogram: sortedBins.filter(bin => bin.count > 0),
    cumulative,
  };
}

/**
 * Calculate MFD comparison for multiple catalogues
 */
export function calculateMFDComparison(
  catalogueData: Array<{
    events: EarthquakeEvent[];
    catalogueId: string;
    catalogueName: string;
    color: string;
  }>,
  binWidth: number = 0.1,
  minMagnitude?: number
): MFDComparisonResult {
  const results = catalogueData.map(({ events, catalogueId, catalogueName, color }) =>
    calculateMFD(events, catalogueId, catalogueName, color, binWidth, minMagnitude)
  );

  // Calculate overall magnitude range
  let globalMin = Infinity;
  let globalMax = -Infinity;

  results.forEach(result => {
    if (result.totalEvents > 0) {
      globalMin = Math.min(globalMin, result.minMagnitude);
      globalMax = Math.max(globalMax, result.maxMagnitude);
    }
  });

  return {
    catalogues: results,
    magnitudeRange: {
      min: globalMin === Infinity ? 0 : globalMin,
      max: globalMax === -Infinity ? 10 : globalMax,
    },
    binWidth,
  };
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
 * Gardner-Knopoff (1974) space-time window parameters
 * These are the standard parameters used for earthquake declustering
 *
 * Time window (days): T = 10^(0.5386*M - 0.547)  (Uhrhammer, 1986 revision)
 * Distance window (km): L = 10^(0.1238*M + 0.983)  (Gardner & Knopoff, 1974)
 */
function getGardnerKnopoffWindow(magnitude: number): { timeWindowDays: number; distanceWindowKm: number } {
  // Uhrhammer (1986) revision for California - more commonly used
  const timeWindowDays = Math.pow(10, 0.5386 * magnitude - 0.547);
  // Gardner & Knopoff (1974) original distance relation
  const distanceWindowKm = Math.pow(10, 0.1238 * magnitude + 0.983);

  return { timeWindowDays, distanceWindowKm };
}

/**
 * Calculate Haversine distance between two points in kilometers
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Gardner-Knopoff Declustering Algorithm
 *
 * Reference:
 * - Gardner, J.K. and Knopoff, L. (1974). "Is the sequence of earthquakes in Southern
 *   California, with aftershocks removed, Poissonian?" BSSA, 64(5), 1363-1367.
 * - Uhrhammer, R.A. (1986). "Characteristics of Northern and Central California Seismicity"
 *   Earthquake Notes, 57(1), p. 21.
 *
 * This implementation identifies mainshocks and links dependent events (foreshocks/aftershocks)
 * using magnitude-dependent space-time windows.
 */
export function gardnerKnopoffDeclustering(events: EarthquakeEvent[]): {
  mainshocks: EarthquakeEvent[];
  clusters: Map<number | string, EarthquakeEvent[]>;
  clusterInfo: SeismicCluster[];
} {
  if (events.length === 0) {
    return { mainshocks: [], clusters: new Map(), clusterInfo: [] };
  }

  // Sort events by time
  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  // Track which events are clustered and their cluster assignments
  const clusterAssignment: Map<number | string, number | string> = new Map();
  const clusters: Map<number | string, EarthquakeEvent[]> = new Map();
  const mainshockCandidates: Set<number | string> = new Set(sortedEvents.map(e => e.id));

  // Process events in reverse time order (largest magnitude first within time windows)
  // This ensures larger events are considered as mainshocks first
  const eventsByMagnitude = [...sortedEvents].sort((a, b) => b.magnitude - a.magnitude);

  for (const potentialMainshock of eventsByMagnitude) {
    // Skip if already assigned to a cluster
    if (clusterAssignment.has(potentialMainshock.id)) continue;

    const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(potentialMainshock.magnitude);
    const mainshockTime = new Date(potentialMainshock.time).getTime();

    // Find all events within the space-time window
    const clusterEvents: EarthquakeEvent[] = [potentialMainshock];

    for (const event of sortedEvents) {
      if (event.id === potentialMainshock.id) continue;
      if (clusterAssignment.has(event.id)) continue;

      const eventTime = new Date(event.time).getTime();
      const timeDiffDays = Math.abs(eventTime - mainshockTime) / (1000 * 60 * 60 * 24);

      // Check time window (both before for foreshocks and after for aftershocks)
      if (timeDiffDays > timeWindowDays) continue;

      // Check distance window
      const distance = haversineDistance(
        potentialMainshock.latitude, potentialMainshock.longitude,
        event.latitude, event.longitude
      );

      if (distance <= distanceWindowKm) {
        // Event is within the space-time window
        clusterEvents.push(event);
        clusterAssignment.set(event.id, potentialMainshock.id);
        mainshockCandidates.delete(event.id);
      }
    }

    // If we found dependent events, create a cluster
    if (clusterEvents.length > 1) {
      clusters.set(potentialMainshock.id, clusterEvents);
    }
  }

  // Get mainshocks (events not assigned to any cluster or cluster heads)
  const mainshocks = sortedEvents.filter(e => mainshockCandidates.has(e.id));

  // Build detailed cluster info
  const clusterInfo: SeismicCluster[] = [];
  let clusterId = 0;

  clusters.forEach((clusterEvents, mainshockId) => {
    const mainshock = clusterEvents.find(e => e.id === mainshockId)!;
    const sortedCluster = clusterEvents.sort((a, b) =>
      new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const mainshockTime = new Date(mainshock.time).getTime();
    const foreshocks = sortedCluster.filter(e =>
      e.id !== mainshockId && new Date(e.time).getTime() < mainshockTime
    );
    const aftershocks = sortedCluster.filter(e =>
      e.id !== mainshockId && new Date(e.time).getTime() >= mainshockTime
    );

    // Calculate spatial extent (max distance from mainshock)
    let maxDistance = 0;
    let sumLat = 0, sumLon = 0;
    clusterEvents.forEach(e => {
      const dist = haversineDistance(
        mainshock.latitude, mainshock.longitude,
        e.latitude, e.longitude
      );
      if (dist > maxDistance) maxDistance = dist;
      sumLat += e.latitude;
      sumLon += e.longitude;
    });

    const startTime = new Date(sortedCluster[0].time);
    const endTime = new Date(sortedCluster[sortedCluster.length - 1].time);
    const durationDays = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);

    // Determine cluster type
    // Swarm: no clear mainshock (largest event is similar in magnitude to others)
    // Burst: very short duration (<1 day)
    // Mainshock-aftershock: typical sequence
    const magnitudes = clusterEvents.map(e => e.magnitude).sort((a, b) => b - a);
    const magDiff = magnitudes.length > 1 ? magnitudes[0] - magnitudes[1] : 999;

    let clusterType: 'mainshock-aftershock' | 'swarm' | 'burst';
    if (durationDays < 1 && clusterEvents.length >= 3) {
      clusterType = 'burst';
    } else if (magDiff < 0.5 && clusterEvents.length >= 5) {
      clusterType = 'swarm';
    } else {
      clusterType = 'mainshock-aftershock';
    }

    // Calculate b-value for the sequence if enough events
    let bValue: number | undefined;
    if (clusterEvents.length >= 10) {
      try {
        const grResult = calculateGutenbergRichter(clusterEvents);
        bValue = grResult.bValue;
      } catch {
        // Not enough data for b-value calculation
      }
    }

    clusterInfo.push({
      id: clusterId++,
      startDate: sortedCluster[0].time,
      endDate: sortedCluster[sortedCluster.length - 1].time,
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
      spatialExtentKm: maxDistance,
      centerLatitude: sumLat / clusterEvents.length,
      centerLongitude: sumLon / clusterEvents.length,
      clusterType,
      bValue
    });
  });

  // Sort clusters by mainshock magnitude (largest first)
  clusterInfo.sort((a, b) => b.maxMagnitude - a.maxMagnitude);

  return { mainshocks, clusters, clusterInfo };
}

/**
 * Perform temporal analysis of seismicity with proper Gardner-Knopoff declustering
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
  const timeSpanDays = Math.max(timeSpanMs / (1000 * 60 * 60 * 24), 1);

  // Calculate rates
  const eventsPerDay = events.length / timeSpanDays;
  const eventsPerMonth = eventsPerDay * 30.44;
  const eventsPerYear = eventsPerDay * 365.25;

  // Create time series (daily bins, or weekly if span > 365 days)
  const useWeeklyBins = timeSpanDays > 365;
  const binSize = useWeeklyBins ? 7 : 1;

  const dailyBins: Map<string, number> = new Map();
  sortedEvents.forEach(event => {
    const eventDate = new Date(event.time);
    let binKey: string;
    if (useWeeklyBins) {
      // Use ISO week number for weekly bins
      const startOfYear = new Date(eventDate.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((eventDate.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
      binKey = `${eventDate.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
    } else {
      binKey = eventDate.toISOString().split('T')[0];
    }
    dailyBins.set(binKey, (dailyBins.get(binKey) || 0) + 1);
  });

  let cumulativeCount = 0;
  const timeSeries = Array.from(dailyBins.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => {
      cumulativeCount += count;
      return { date, count, cumulativeCount };
    });

  // Use Gardner-Knopoff declustering for proper cluster detection
  // Only run if we have enough events and location data
  let clusters: SeismicCluster[] = [];

  const eventsWithLocation = sortedEvents.filter(e =>
    e.latitude != null && e.longitude != null &&
    !isNaN(e.latitude) && !isNaN(e.longitude)
  );

  if (eventsWithLocation.length >= 10) {
    try {
      const declusteringResult = gardnerKnopoffDeclustering(eventsWithLocation);
      // Only include significant clusters (3+ events)
      clusters = declusteringResult.clusterInfo.filter(c => c.eventCount >= 3);
    } catch {
      // Fall back to empty clusters if declustering fails
      clusters = [];
    }
  }

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
