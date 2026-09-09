/**
 * Seismological Analysis Library
 */

import { memoize } from './memoization';
import { EarthquakeEvent as BaseEarthquakeEvent } from '@/types/earthquake';

/**
 * Seismological analysis event type
 */
export interface EarthquakeEvent extends Omit<BaseEarthquakeEvent, 'id' | 'depth'> {
  id: number | string;
  depth: number;
}

export interface GutenbergRichterResult {
  bValue: number;
  aValue: number;
  completeness: number;
  rSquared: number;
  /** Formal Aki (1965) standard error of the b-value: sigma_b = b / sqrt(N). */
  bUncertainty: number;
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
 * Smallest / largest value in a numeric array.
 *
 * `Math.min(...array)` spreads every element as a separate function argument and
 * throws `RangeError: Maximum call stack size exceeded` once the array passes the
 * V8 argument limit (measured: 125,000 arguments succeed, 131,000 throw on Node
 * 20.19.6). A national New Zealand catalogue is well past that, so every min/max
 * taken over an event array in this module goes through these helpers.
 */
function minOf(values: number[]): number {
  let min = Infinity;
  for (const value of values) {
    if (value < min) min = value;
  }
  return min;
}

function maxOf(values: number[]): number {
  let max = -Infinity;
  for (const value of values) {
    if (value > max) max = value;
  }
  return max;
}

/**
 * Absorbs IEEE-754 representation error when locating a magnitude bin.
 */
const BIN_EPSILON = 1e-9;

/** Lower edge of the magnitude bin containing `magnitude`. */
function binLowerEdge(magnitude: number, binWidth: number): number {
  return Math.floor(magnitude / binWidth + BIN_EPSILON) * binWidth;
}

/**
 * Canonical numeric key for a bin edge.
 *
 * Rounding to a fixed number of decimals keeps `Map` keys stable against drift in
 * repeated `edge + binWidth` accumulation. Four decimals covers every bin width
 * the UI offers (0.01, 0.05, 0.1); the previous `Math.round(edge * 10) / 10` hard
 * coded a 0.1 grid, so selecting a finer bin width silently collapsed the finer
 * bins back onto the 0.1 grid and summed their counts.
 */
function binKey(edge: number): number {
  return Number(edge.toFixed(4));
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

  const minMag = binLowerEdge(minOf(magnitudes), binWidth);
  const maxMag = Math.ceil(maxOf(magnitudes) / binWidth - BIN_EPSILON) * binWidth;

  // Create histogram bins. Index-based so that repeated `mag += binWidth`
  // accumulation cannot drift and drop the top bin.
  const bins: Map<number, number> = new Map();
  const nBins = Math.round((maxMag - minMag) / binWidth) + 1;
  for (let i = 0; i < nBins; i++) {
    bins.set(binKey(minMag + i * binWidth), 0);
  }

  // Count events in each bin
  magnitudes.forEach(mag => {
    const key = binKey(binLowerEdge(mag, binWidth));
    bins.set(key, (bins.get(key) || 0) + 1);
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
  const filteredEvents = minMagnitude != null
    ? events.filter(e => e.magnitude >= minMagnitude)
    : events;

  if (filteredEvents.length < 10) {
    throw new Error('Insufficient data for Gutenberg-Richter analysis (need at least 10 events)');
  }

  // Bin magnitudes
  const filteredMagnitudes = filteredEvents.map(e => e.magnitude);
  const minMag = binLowerEdge(minOf(filteredMagnitudes), binWidth);
  const maxMag = Math.ceil(maxOf(filteredMagnitudes) / binWidth - BIN_EPSILON) * binWidth;

  const bins: Map<number, number> = new Map();
  // Index-based iteration so floating-point drift in `mag += binWidth` cannot drop
  // the maximum-magnitude bin (the previous `mag <= maxMag` loop could).
  const nBins = Math.round((maxMag - minMag) / binWidth) + 1;
  for (let i = 0; i < nBins; i++) {
    bins.set(binKey(minMag + i * binWidth), 0);
  }

  // Count events in each bin
  filteredEvents.forEach(event => {
    const roundedBin = binKey(binLowerEdge(event.magnitude, binWidth));
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

  const n = cumulativeCounts.length;
  // Hard floor: a Gutenberg-Richter fit needs at least three POPULATED magnitude
  // bins (paper, sec:mc). `cumulativeCounts.length` cannot express that — it holds
  // every bin from minMag up to the largest populated one, so a catalogue with
  // events at only M1.0 and M4.0 still produced 31 entries and was fitted
  // (b = 0.15, R^2 = -13.5) instead of being withheld.
  const populatedBins = sortedBins.reduce(
    (count, [, binCount]) => (binCount > 0 ? count + 1 : count),
    0
  );
  if (populatedBins < 3) {
    throw new Error('Insufficient magnitude bins for regression (need at least 3 populated bins)');
  }

  // Completeness magnitude Mc. The Aki-Utsu MLE below is only valid for a sample
  // that is complete above Mc, so when the caller does not supply an explicit
  // cut-off we ESTIMATE Mc by maximum curvature (MAXC; Wiemer & Wyss, 2000) — the
  // magnitude bin with the most events — plus the standard +0.2 correction
  // (Woessner & Wiemer, 2005). Using the catalogue floor here (the old behaviour)
  // biased b low because the incomplete low-magnitude tail was included.
  const MAXC_CORRECTION = 0.2;
  let mc: number;
  if (minMagnitude != null) {
    mc = minMagnitude;
  } else {
    let peakMag = minMag;
    let peakCount = -1;
    for (const [mag, count] of sortedBins) {
      if (count > peakCount) { peakCount = count; peakMag = mag; }
    }
    mc = Number((peakMag + MAXC_CORRECTION).toFixed(2));
  }
  const magsAboveMc = filteredEvents.map(e => e.magnitude).filter(m => m >= mc);
  // Hard floor: fewer than 10 events above Mc means the estimate is WITHHELD, not
  // reported (paper, sec:mc). The previous guard fell back to the catalogue floor,
  // which anchored the Aki-Utsu MLE at a magnitude the catalogue is demonstrably
  // not complete above and then returned that floor to the UI as `completeness`
  // (e.g. a 14-event sequence with MAXC Mc = 1.2 reported Mc = 1.0, b = 0.53).
  if (magsAboveMc.length < 10) {
    throw new Error(
      `Insufficient data above the completeness magnitude (need at least 10 events above Mc=${mc})`
    );
  }

  // Maximum-likelihood b-value (Aki, 1965) with the Utsu binning correction:
  //   b = log10(e) / (meanMag - (Mc - binWidth/2))
  // (ordinary least-squares on the cumulative FMD is biased and is not used).
  const meanMag = magsAboveMc.reduce((sum, m) => sum + m, 0) / magsAboveMc.length;
  const bValue = Math.LOG10E / (meanMag - (mc - binWidth / 2));
  // Formal Aki (1965) standard error of the MLE b-value: sigma_b = b / sqrt(N).
  const bUncertainty = bValue / Math.sqrt(magsAboveMc.length);
  // a-value fixes the GR line through (Mc, N >= Mc): log10 N(M) = a - b*M.
  const aValue = Math.log10(magsAboveMc.length) + bValue * mc;

  // R-squared of the MLE line against the observed cumulative FMD (diagnostic).
  const meanY = cumulativeCounts.reduce((sum, p) => sum + p.logCount, 0) / n;
  const ssTotal = cumulativeCounts.reduce((sum, p) => sum + Math.pow(p.logCount - meanY, 2), 0);
  const ssResidual = cumulativeCounts.reduce((sum, p) => {
    const predicted = aValue - bValue * p.magnitude;
    return sum + Math.pow(p.logCount - predicted, 2);
  }, 0);
  const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

  // Generate fitted line
  const fittedLine = cumulativeCounts.map(p => ({
    magnitude: p.magnitude,
    logCount: aValue - bValue * p.magnitude
  }));

  // Completeness magnitude actually used for the b-value (the MAXC estimate, or
  // the caller-supplied cut-off). The previous "first cumulative residual < 0.2"
  // rule was not a recognised Mc method and has been removed.
  const completeness = mc;

  return {
    bValue,
    aValue,
    completeness,
    rSquared,
    bUncertainty,
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
  binWidth: number = 0.1,
  correction: number = 0.2  // MAXC under-estimates Mc by ~0.1-0.2 (Woessner & Wiemer, 2005)
): CompletenessResult {
  if (events.length < 50) {
    throw new Error('Insufficient data for completeness estimation (need at least 50 events)');
  }

  // Bin magnitudes
  const eventMagnitudes = events.map(e => e.magnitude);
  const minMag = binLowerEdge(minOf(eventMagnitudes), binWidth);
  const maxMag = Math.ceil(maxOf(eventMagnitudes) / binWidth - BIN_EPSILON) * binWidth;

  const bins: Map<number, number> = new Map();
  const nBins = Math.round((maxMag - minMag) / binWidth) + 1;
  for (let i = 0; i < nBins; i++) {
    bins.set(binKey(minMag + i * binWidth), 0);
  }

  events.forEach(event => {
    const roundedBin = binKey(binLowerEdge(event.magnitude, binWidth));
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

  // Apply the standard MAXC correction (default +0.2; configurable) so that
  // the returned Mc matches the value documented in the paper.
  mc = Number((mc + correction).toFixed(2)); // round to bin precision (matches worker)

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
 * Gardner-Knopoff (1974) space-time window parameters, as tabulated in
 * van Stiphout et al. (2012), CORSSA, Table 1.
 *
 * NOTE: the windows are canonical, but this codebase APPLIES them symmetrically
 * (|t - t_mainshock| <= T(M); see gardnerKnopoffDeclustering below), so events before the
 * mainshock are removed as well as after. Classical Gardner-Knopoff is a forward/aftershock
 * window - OpenQuake's hmtk exposes the backward extent as fs_time_prop and defaults it to 0.
 * Symmetric application is a deliberate choice, not the reference behaviour, and it changes
 * the declustered b-value by an amount that is not stable across catalogues (measured at
 * 0.005-0.05 on two different synthetics). Report results as "independent events" rather
 * than "mainshocks", and do not describe the output as classical Gardner-Knopoff without
 * stating the symmetry.
 */
export function getGardnerKnopoffWindow(magnitude: number): { timeWindowDays: number; distanceWindowKm: number } {
  const timeWindowDays = magnitude >= 6.5
    ? Math.pow(10, 0.032 * magnitude + 2.7389)
    : Math.pow(10, 0.5409 * magnitude - 0.547);
  const distanceWindowKm = Math.pow(10, 0.1238 * magnitude + 0.983);

  return { timeWindowDays, distanceWindowKm };
}

/**
 * ISO-8601 week start (the Monday, in UTC) of the day containing `date`, as a
 * `YYYY-MM-DD` string.
 */
function isoWeekStartUTC(date: Date): string {
  const dayStartMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  // getUTCDay() is 0 for Sunday; ISO weeks run Monday (0 here) to Sunday (6).
  const mondayOffset = (new Date(dayStartMs).getUTCDay() + 6) % 7;
  return new Date(dayStartMs - mondayOffset * 86400000).toISOString().split('T')[0];
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
 * Build SeismicCluster summaries from a map of clusters (mainshock = largest-magnitude
 * event in each cluster). Shared by the window (Gardner-Knopoff) and link-based
 * (Reasenberg) declusterers.
 */
function buildClusterInfo(
  clusters: Map<number | string, EarthquakeEvent[]>
): SeismicCluster[] {
  const clusterInfo: SeismicCluster[] = [];
  let clusterId = 0;

  clusters.forEach((clusterEvents) => {
    const sortedCluster = [...clusterEvents].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    const mainshock = clusterEvents.reduce(
      (m, e) => (e.magnitude > m.magnitude ? e : m),
      clusterEvents[0]
    );
    const mainshockTime = new Date(mainshock.time).getTime();
    const foreshocks = sortedCluster.filter(
      (e) => e.id !== mainshock.id && new Date(e.time).getTime() < mainshockTime
    );
    const aftershocks = sortedCluster.filter(
      (e) => e.id !== mainshock.id && new Date(e.time).getTime() >= mainshockTime
    );

    let maxDistance = 0;
    let sumLat = 0;
    let sumLon = 0;
    clusterEvents.forEach((e) => {
      const dist = haversineDistance(
        mainshock.latitude, mainshock.longitude, e.latitude, e.longitude
      );
      if (dist > maxDistance) maxDistance = dist;
      sumLat += e.latitude;
      sumLon += e.longitude;
    });

    const startTime = new Date(sortedCluster[0].time);
    const endTime = new Date(sortedCluster[sortedCluster.length - 1].time);
    const durationDays = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);

    const magnitudes = clusterEvents.map((e) => e.magnitude).sort((a, b) => b - a);
    const magDiff = magnitudes.length > 1 ? magnitudes[0] - magnitudes[1] : 999;

    let clusterType: 'mainshock-aftershock' | 'swarm' | 'burst';
    if (durationDays < 1 && clusterEvents.length >= 3) {
      clusterType = 'burst';
    } else if (magDiff < 0.5 && clusterEvents.length >= 5) {
      clusterType = 'swarm';
    } else {
      clusterType = 'mainshock-aftershock';
    }

    let bValue: number | undefined;
    if (clusterEvents.length >= 10) {
      try {
        bValue = calculateGutenbergRichter(clusterEvents).bValue;
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
        depth: mainshock.depth,
      },
      aftershockCount: aftershocks.length,
      foreshockCount: foreshocks.length,
      durationDays,
      spatialExtentKm: maxDistance,
      centerLatitude: sumLat / clusterEvents.length,
      centerLongitude: sumLon / clusterEvents.length,
      clusterType,
      bValue,
    });
  });

  clusterInfo.sort((a, b) => b.maxMagnitude - a.maxMagnitude);
  return clusterInfo;
}

export interface ReasenbergParams {
  /** Interaction-radius factor (number of crack radii); Reasenberg default 10. */
  rfact?: number;
  /** Minimum look-ahead time, days (default 1). */
  taumin?: number;
  /** Maximum look-ahead time, days (default 10). */
  taumax?: number;
  /** Confidence for the look-ahead time (default 0.95). */
  p1?: number;
  /** Effective completeness magnitude; defaults to the catalogue minimum. */
  xmeff?: number;
  /** Factor raising the effective magnitude within a cluster (default 0.5). */
  xk?: number;
}

/**
 * Reasenberg (1985) link-based declustering.
 */
export function reasenbergDeclustering(
  events: EarthquakeEvent[],
  params: ReasenbergParams = {}
): {
  mainshocks: EarthquakeEvent[];
  clusters: Map<number | string, EarthquakeEvent[]>;
  clusterInfo: SeismicCluster[];
} {
  if (events.length === 0) {
    return { mainshocks: [], clusters: new Map(), clusterInfo: [] };
  }

  const rfact = params.rfact ?? 10;
  const taumin = params.taumin ?? 1;
  const taumax = params.taumax ?? 10;
  const p1 = params.p1 ?? 0.95;
  const xk = params.xk ?? 0.5;

  const sorted = [...events].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
  const xmeff = params.xmeff ?? minOf(sorted.map((e) => e.magnitude));

  const DAY = 1000 * 60 * 60 * 24;
  const tms = (e: EarthquakeEvent) => new Date(e.time).getTime();
  const crackRadiusKm = (m: number) => 0.011 * Math.pow(10, 0.4 * m);

  // clusterIdOf[i] = 0 means event i is not (yet) in a cluster.
  const clusterIdOf = new Array<number>(sorted.length).fill(0);
  let nextCluster = 1;

  for (let i = 0; i < sorted.length; i++) {
    const ei = sorted[i];

    // Reference event + look-ahead time tau for event i.
    let mref = ei.magnitude;
    let refLat = ei.latitude;
    let refLon = ei.longitude;
    let tau: number;

    if (clusterIdOf[i] === 0) {
      tau = taumin;
    } else {
      const cid = clusterIdOf[i];
      let big = ei;
      for (let j = 0; j <= i; j++) {
        if (clusterIdOf[j] === cid && sorted[j].magnitude > big.magnitude) big = sorted[j];
      }
      mref = big.magnitude;
      refLat = big.latitude;
      refLon = big.longitude;
      const tdiff = Math.max((tms(ei) - tms(big)) / DAY, 0);
      const deltam = (1 - xk) * mref - xmeff;
      const denom = Math.pow(10, ((deltam - 1) * 2) / 3);
      const tauP = denom > 0 ? (-Math.log(1 - p1) * tdiff) / denom : taumax;
      tau = Math.min(taumax, Math.max(taumin, tauP));
    }

    const r = rfact * Math.max(crackRadiusKm(mref), crackRadiusKm(ei.magnitude));

    for (let j = i + 1; j < sorted.length; j++) {
      const ej = sorted[j];
      const dtDays = (tms(ej) - tms(ei)) / DAY;
      if (dtDays > tau) break; // time-sorted: no later event can be within tau
      if (haversineDistance(refLat, refLon, ej.latitude, ej.longitude) > r) continue;

      const ci = clusterIdOf[i];
      const cj = clusterIdOf[j];
      if (ci === 0 && cj === 0) {
        clusterIdOf[i] = nextCluster;
        clusterIdOf[j] = nextCluster;
        nextCluster++;
      } else if (ci !== 0 && cj === 0) {
        clusterIdOf[j] = ci;
      } else if (ci === 0 && cj !== 0) {
        clusterIdOf[i] = cj;
      } else if (ci !== cj) {
        const keep = Math.min(ci, cj);
        const drop = Math.max(ci, cj);
        for (let k = 0; k < sorted.length; k++) {
          if (clusterIdOf[k] === drop) clusterIdOf[k] = keep;
        }
      }
    }
  }

  const byCluster = new Map<number, number[]>();
  clusterIdOf.forEach((cid, idx) => {
    if (cid !== 0) {
      if (!byCluster.has(cid)) byCluster.set(cid, []);
      byCluster.get(cid)!.push(idx);
    }
  });

  const clusters = new Map<number | string, EarthquakeEvent[]>();
  const dependentIds = new Set<number | string>();
  byCluster.forEach((idxs) => {
    const evs = idxs.map((k) => sorted[k]);
    const big = evs.reduce((m, e) => (e.magnitude > m.magnitude ? e : m), evs[0]);
    clusters.set(big.id, evs);
    evs.forEach((e) => {
      if (e.id !== big.id) dependentIds.add(e.id);
    });
  });

  const mainshocks = sorted.filter((e) => !dependentIds.has(e.id));
  const clusterInfo = buildClusterInfo(clusters);
  return { mainshocks, clusters, clusterInfo };
}

/**
 * Perform temporal analysis of seismicity with proper Gardner-Knopoff declustering
 */
export type DeclusterMethod = 'gardner-knopoff' | 'reasenberg';

export function analyzeTemporalPattern(
  events: EarthquakeEvent[],
  declusterMethod: DeclusterMethod = 'gardner-knopoff'
): TemporalAnalysisResult {
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
    // Both branches emit a parseable ISO calendar date: the event's UTC day, or
    // the Monday starting its ISO week. (Weekly bins were keyed "YYYY-Www", which
    // no date formatter can parse.)
    const binKey = useWeeklyBins
      ? isoWeekStartUTC(eventDate)
      : eventDate.toISOString().split('T')[0];
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
      const declusteringResult =
        declusterMethod === 'reasenberg'
          ? reasenbergDeclustering(eventsWithLocation)
          : gardnerKnopoffDeclustering(eventsWithLocation);
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
