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
  | { type: 'completeness'; events: EarthquakeEvent[]; binWidth?: number }
  | { type: 'temporal'; events: EarthquakeEvent[] }
  | { type: 'moment'; events: EarthquakeEvent[] }
  | { type: 'statistics'; events: EarthquakeEvent[] };

// Simple cache using Map (workers have their own memory space)
const cache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes


/**
 * Mean longitude of a compact cluster, taken around the circle so members either
 * side of the antimeridian (179.99 and -179.99) average to -179.993, not to -60.
 */
function meanLongitude(longitudes: number[]): number {
  let x = 0, y = 0;
  for (const lon of longitudes) {
    x += Math.cos((lon * Math.PI) / 180);
    y += Math.sin((lon * Math.PI) / 180);
  }
  if (x === 0 && y === 0) return longitudes.reduce((a, b) => a + b, 0) / longitudes.length;
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Cache key over the analysis type, its parameters and the event CONTENT the
 * analyses read. Sampling three ids let an edited magnitude, a re-import keeping
 * its ids, or a changed minimum-magnitude cutoff be answered from a stale result;
 * a content hash costs a few milliseconds even for national catalogues.
 */
function getCacheKey(type: string, events: EarthquakeEvent[], params: Record<string, unknown> = {}): string {
  const paramKey = Object.keys(params).sort().map((k) => `${k}=${String(params[k])}`).join(',');
  return `${type}_${eventsContentHash(events)}_${paramKey}`;
}

/**
 * Order-independent content hash of the fields the analyses read. Numbers are mixed
 * from their IEEE-754 words and strings character by character, without building a
 * per-event string or allocating per event.
 */
function eventsContentHash(events: EarthquakeEvent[]): string {
  const buf = new Float64Array(1);
  const words = new Uint32Array(buf.buffer);
  let sum1 = 0, sum2 = 0, xor = 0; // commutative accumulators: input order does not matter
  for (let k = 0; k < events.length; k++) {
    const e = events[k];
    let h = 0x811c9dc5;
    const id = e.id == null ? '' : String(e.id);
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ 0x1f, 0x01000193) >>> 0;
    const time = e.time == null ? '' : String(e.time);
    for (let i = 0; i < time.length; i++) h = Math.imul(h ^ time.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ 0x1f, 0x01000193) >>> 0;
    const type = e.magnitude_type == null ? '' : String(e.magnitude_type);
    for (let i = 0; i < type.length; i++) h = Math.imul(h ^ type.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ 0x1f, 0x01000193) >>> 0;
    buf[0] = e.magnitude; h = Math.imul(h ^ words[0], 0x01000193) >>> 0; h = Math.imul(h ^ words[1], 0x01000193) >>> 0;
    buf[0] = e.latitude; h = Math.imul(h ^ words[0], 0x01000193) >>> 0; h = Math.imul(h ^ words[1], 0x01000193) >>> 0;
    buf[0] = e.longitude; h = Math.imul(h ^ words[0], 0x01000193) >>> 0; h = Math.imul(h ^ words[1], 0x01000193) >>> 0;
    buf[0] = e.depth == null ? NaN : e.depth; h = Math.imul(h ^ words[0], 0x01000193) >>> 0; h = Math.imul(h ^ words[1], 0x01000193) >>> 0;
    sum1 = (sum1 + h) >>> 0;
    sum2 = (sum2 + Math.imul(h, 0x9e3779b1)) >>> 0;
    xor ^= h;
  }
  return `${events.length}:${sum1.toString(16)}${sum2.toString(16)}${(xor >>> 0).toString(16)}`;
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

/**
 * Numeric helpers kept deliberately identical to lib/seismological-analysis.ts.
 */
const BIN_EPSILON = 1e-9;

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

function binLowerEdge(magnitude: number, binWidth: number): number {
  return Math.floor(magnitude / binWidth + BIN_EPSILON) * binWidth;
}

function binKey(edge: number): number {
  return Number(edge.toFixed(4));
}

// Gutenberg-Richter calculation
function calculateGutenbergRichter(events: EarthquakeEvent[], minMagnitude?: number, binWidth = 0.1) {
  const filteredEvents = minMagnitude != null
    ? events.filter(e => e.magnitude >= minMagnitude)
    : events;

  if (filteredEvents.length < 10) {
    return { error: 'Insufficient data (need at least 10 events)' };
  }

  const magnitudes = filteredEvents.map(e => e.magnitude);
  const minMag = binLowerEdge(minOf(magnitudes), binWidth);
  const maxMag = Math.ceil(maxOf(magnitudes) / binWidth - BIN_EPSILON) * binWidth;

  const bins = new Map<number, number>();
  // Index-based iteration so floating-point drift cannot drop the top bin.
  const nBins = Math.round((maxMag - minMag) / binWidth) + 1;
  for (let i = 0; i < nBins; i++) {
    bins.set(binKey(minMag + i * binWidth), 0);
  }

  filteredEvents.forEach(event => {
    const roundedBin = binKey(binLowerEdge(event.magnitude, binWidth));
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

  // Completeness magnitude Mc (MAXC; Wiemer & Wyss 2000, with the +0.2 correction
  // of Woessner & Wiemer 2005) when no explicit cut-off is supplied. The Aki-Utsu
  // MLE is only valid above Mc and the mean MUST be taken over events with M >= Mc;
  // the previous code averaged the FULL (incomplete) magnitude array, biasing b.
  // Uses the same +0.2 correction as lib/seismological-analysis.ts (was +0.05 here).
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
  const magsAboveMc = magnitudes.filter(m => m >= mc);
  // Hard floor: fewer than 10 events above Mc means the estimate is WITHHELD, not
  // reported. Falling back to the catalogue floor (the old behaviour) anchored the
  // MLE at a magnitude the catalogue is not complete above and reported that floor
  // as the completeness magnitude. Matches lib/seismological-analysis.ts.
  if (magsAboveMc.length < 10) {
    return {
      error: `Insufficient data above the completeness magnitude (need at least 10 events above Mc=${mc})`
    };
  }

  // Apply the bin safeguard to the same complete sample used by the MLE.
  const populatedBins = new Set(magsAboveMc.map(m => binKey(binLowerEdge(m, binWidth)))).size;
  if (populatedBins < 3) {
    return { error: 'Insufficient magnitude bins above Mc (need at least 3 populated bins)' };
  }

  // Maximum-likelihood b-value (Aki, 1965) with the Utsu binning correction.
  const meanMag = magsAboveMc.reduce((sum, m) => sum + m, 0) / magsAboveMc.length;
  const bValue = Math.LOG10E / (meanMag - (mc - binWidth / 2));
  const bUncertainty = bValue / Math.sqrt(magsAboveMc.length);
  const aValue = Math.log10(magsAboveMc.length) + bValue * mc;

  const fittedCounts = cumulativeCounts.filter(p => p.magnitude >= mc);
  const meanY = fittedCounts.reduce((sum, p) => sum + p.logCount, 0) / fittedCounts.length;
  const ssTotal = fittedCounts.reduce((sum, p) => sum + Math.pow(p.logCount - meanY, 2), 0);
  const ssResidual = fittedCounts.reduce((sum, p) => {
    const predicted = aValue - bValue * p.magnitude;
    return sum + Math.pow(p.logCount - predicted, 2);
  }, 0);
  const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

  // Completeness magnitude actually used for the b-value.
  const completeness = mc;

  const fittedLine = fittedCounts.map(p => ({
    magnitude: p.magnitude,
    logCount: aValue - bValue * p.magnitude
  }));

  return {
    bValue, // positive by construction (MLE)
    aValue,
    completeness,
    rSquared,
    bUncertainty,
    dataPoints: cumulativeCounts,
    fittedLine
  };
}

// Completeness magnitude estimation
// `binWidth` mirrors lib/seismological-analysis.ts estimateCompletenessMagnitude,
// which the caller can parameterise; it used to be hard-coded here, so the two
// copies could only agree at the default 0.1.
function estimateCompleteness(events: EarthquakeEvent[], binWidth = 0.1) {
  if (events.length < 50) {
    return { error: 'Insufficient data (need at least 50 events)' };
  }

  const magnitudes = events.map(e => e.magnitude);
  const minMag = binLowerEdge(minOf(magnitudes), binWidth);
  const maxMag = Math.ceil(maxOf(magnitudes) / binWidth - BIN_EPSILON) * binWidth;

  // Bin once rather than re-filtering the whole catalogue per bin: the old loop
  // was O(bins x N), and its `m >= edge && m < edge + binWidth` test put M0.3 in
  // the 0.2 bin because 0.2 + 0.1 is 0.30000000000000004.
  const counts = new Map<number, number>();
  const nBins = Math.round((maxMag - minMag) / binWidth) + 1;
  for (let i = 0; i < nBins; i++) {
    counts.set(binKey(minMag + i * binWidth), 0);
  }
  for (const event of events) {
    const key = binKey(binLowerEdge(event.magnitude, binWidth));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const distribution: { magnitude: number; count: number }[] = Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([magnitude, count]) => ({ magnitude, count }));

  // Find Mc using the maximum-curvature method (peak of the non-cumulative FMD).
  let maxCount = 0;
  let mc = minMag;
  distribution.forEach(({ magnitude, count }) => {
    if (count > maxCount) {
      maxCount = count;
      mc = magnitude;
    }
  });

  // Standard MAXC correction (Woessner & Wiemer 2005), matching
  // lib/seismological-analysis.ts (was a +0.05 half-bin shift here).
  mc = Number((mc + 0.2).toFixed(2));

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
 * Gardner-Knopoff (1974) space-time window parameters (two-branch),
 * as compiled in Table 1 of van Stiphout et al. (2012).
 */
function getGardnerKnopoffWindow(magnitude: number): { timeWindowDays: number; distanceWindowKm: number } {
  // Two-branch Gardner-Knopoff time window (days): T = 10^(0.032*M + 2.7389) for
  // M >= 6.5, otherwise T = 10^(0.5409*M - 0.547). Matches van Stiphout et al.
  // (2012) Table 1 / OpenQuake hmtk. (Branches were previously swapped.)
  const timeWindowDays = magnitude >= 6.5
    ? Math.pow(10, 0.032 * magnitude + 2.7389)
    : Math.pow(10, 0.5409 * magnitude - 0.547);
  // Gardner & Knopoff (1974) distance relation
  const distanceWindowKm = Math.pow(10, 0.1238 * magnitude + 0.983);
  return { timeWindowDays, distanceWindowKm };
}

/**
 * ISO-8601 week start (the Monday, in UTC) of the day containing `date`, as a
 * `YYYY-MM-DD` string. Identical to lib/seismological-analysis.ts.
 *
 * Weekly time-series bins used to be keyed `YYYY-Www` ("2016-W47"), which is not
 * a date `new Date()` can parse, so the temporal chart rendered "NaN/aN" ticks
 * and "Invalid Date" tooltips for every catalogue spanning more than a year.
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
    // Reserve heads too, including independent events with no dependents.
    clusterAssignment.set(mainshock.id, mainshock.id);

    const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(mainshock.magnitude);
    const mainshockTime = new Date(mainshock.time).getTime();
    const clusterEvents: EarthquakeEvent[] = [mainshock];

    for (const event of validEvents) {
      if (event.id === mainshock.id || clusterAssignment.has(event.id)) continue;

      const eventTime = new Date(event.time).getTime();
      // Forward window only; must match lib/seismological-analysis.ts.
      const timeDiffDays = (eventTime - mainshockTime) / (1000 * 60 * 60 * 24);
      if (timeDiffDays < 0 || timeDiffDays > timeWindowDays) continue;

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
    let maxDist = 0, sumLat = 0;
    clusterEvents.forEach(e => {
      const dist = haversineDistance(mainshock.latitude, mainshock.longitude, e.latitude, e.longitude);
      if (dist > maxDist) maxDist = dist;
      sumLat += e.latitude;
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

    // Per-sequence b-value, as lib/seismological-analysis.ts buildClusterInfo does;
    // withheld (left undefined) whenever the fit does not meet the hard floors.
    let bValue: number | undefined;
    if (clusterEvents.length >= 10) {
      const gr = calculateGutenbergRichter(clusterEvents) as { error?: string; bValue?: number };
      if (!gr.error) bValue = gr.bValue;
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
      centerLongitude: meanLongitude(clusterEvents.map((e) => e.longitude)),
      clusterType,
      bValue
    });
  });

  // Every significant cluster, sorted by mainshock magnitude. This used to end in
  // `.slice(0, 20)`: a rendering cap applied inside the scientific routine, which
  // the caller then reported as the number of clusters detected (a catalogue with
  // 137 clusters displayed "20 clusters detected"). Truncation for display belongs
  // in the presentation layer, and lib/seismological-analysis.ts returns them all.
  return clusterInfo
    .filter(c => c.eventCount >= 3)
    .sort((a, b) => b.maxMagnitude - a.maxMagnitude);
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
    // Both branches emit a parseable ISO calendar date: the event's UTC day, or
    // the Monday starting its ISO week. (Weekly bins were keyed "YYYY-Www", which
    // no date formatter can parse.)
    const binKey = useWeeklyBins
      ? isoWeekStartUTC(eventDate)
      : eventDate.toISOString().split('T')[0];
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
    // Preserve period counts and the final cumulative total. Chart rendering
    // may sample points, but analysis results and exports need every period.
    timeSeries,
    clusters
  };
}

// Seismic moment calculation
/**
 * Which magnitudes may enter the Hanks-Kanamori relation M0 = 10^(1.5*Mw + 9.1).
 * It is defined for MOMENT magnitude only. ML/Mb/Ms saturate (mb hard above ~6), so
 * treating them as Mw misstates the moment of large events by orders of magnitude.
 *   'exact'    Mw family - used as-is.
 *   'assumed'  ML - used under the ML ~ Mw approximation this codebase already labels
 *              generic; counted so the result can say how much rests on it.
 *   'excluded' mb, Ms, Md, unknown - not summed; counted.
 */
function momentEligibility(magType: string | null | undefined): 'exact' | 'assumed' | 'excluded' {
  // An UNTYPED magnitude (plain CSV, historical bulletins) is almost always a local
  // magnitude; treat it like ML - counted under the assumption, never silently exact
  // and never silently dropped, since dropping it would empty the moment tab for the
  // catalogues this platform exists to serve.
  if (!magType) return 'assumed';
  const t = magType.trim().toLowerCase();
  if (t.startsWith('mw')) return 'exact';
  // ML, MLv and GeoNet's bare 'M' (the SeisComP summary magnitude, which for most of
  // the NZ catalogue is a network-weighted local magnitude) share the ML assumption.
  if (t.startsWith('ml') || t === 'm') return 'assumed';
  return 'excluded';
}

function calculateSeismicMoment(events: EarthquakeEvent[]) {
  if (events.length === 0) {
    return { error: 'No events to analyze' };
  }

  // M0 = 10^(1.5 * Mw + 9.1) in N⋅m
  const momentForMagnitude = (mag: number) => Math.pow(10, 1.5 * mag + 9.1);

  let totalMoment = 0;
  let largestMoment = 0;
  let largestMag = 0;
  let assumedCount = 0;
  let excludedCount = 0;
  let usedCount = 0;

  const momentByMagBin = new Map<number, { moment: number; count: number }>();

  events.forEach(event => {
    const eligibility = momentEligibility(event.magnitude_type);
    if (eligibility === 'excluded') { excludedCount++; return; }
    if (eligibility === 'assumed') assumedCount++;
    usedCount++;
    const moment = momentForMagnitude(event.magnitude);
    totalMoment += moment;

    if (moment > largestMoment) {
      largestMoment = moment;
      largestMag = event.magnitude;
    }

    const bin = Math.floor(event.magnitude * 2) / 2; // 0.5 magnitude bins, as the library
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

  if (usedCount === 0) {
    return { error: 'No Mw or ML magnitudes to compute seismic moment from (mb/Ms/Md are excluded because they saturate)' };
  }

  return {
    totalMoment,
    totalMomentMagnitude,
    assumedMwCount: assumedCount,
    excludedCount,
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
  const { minMagnitude, binWidth, declusterMethod } = e.data as {
    minMagnitude?: number; binWidth?: number; declusterMethod?: string;
  };

  const cacheKey = getCacheKey(type, events, { minMagnitude, binWidth, declusterMethod });
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
        result = estimateCompleteness(events, (e.data as any).binWidth);
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
