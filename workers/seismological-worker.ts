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

type McMethod = 'MAXC' | 'GFT';
type RateInterval = 'day' | 'week' | 'month';
type RateIntervalOption = RateInterval | 'auto';

// Message types. `mcMethod` / `maxcCorrection` choose how Mc is estimated wherever it
// is (lib/seismological-analysis.ts McEstimationOptions); `interval` bins the time series.
type WorkerMessage =
  | { type: 'gutenberg-richter'; events: EarthquakeEvent[]; minMagnitude?: number; binWidth?: number; mcMethod?: McMethod; maxcCorrection?: number }
  | { type: 'completeness'; events: EarthquakeEvent[]; binWidth?: number; mcMethod?: McMethod; maxcCorrection?: number }
  | { type: 'temporal'; events: EarthquakeEvent[] }
  | { type: 'time-series'; events: EarthquakeEvent[]; interval?: RateIntervalOption; minMagnitude?: number; binWidth?: number; mcMethod?: McMethod; maxcCorrection?: number }
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

/**
 * Reporting-resolution helpers, identical to lib/seismological-analysis.ts: the Utsu
 * binning correction follows the step the magnitudes were REPORTED at (0 for
 * continuous magnitudes), not the histogram bin width.
 */
const REPORTING_GRIDS = [0.1, 0.05, 0.01, 0.001];
const GRID_TOLERANCE = 1e-9;

function isOnGrid(magnitude: number, step: number): boolean {
  return Math.abs(magnitude - Math.round(magnitude / step) * step) < GRID_TOLERANCE;
}

function ceilToGrid(magnitude: number, step: number): number {
  return Math.ceil(magnitude / step - GRID_TOLERANCE / step) * step;
}

/** Share of the sample reported at each step of REPORTING_GRIDS, chance hits unmixed. */
function reportingShares(magnitudes: number[]): number[] {
  const n = magnitudes.length;
  const onGrid = REPORTING_GRIDS.map(step => {
    let count = 0;
    for (const m of magnitudes) if (isOnGrid(m, step)) count++;
    return n > 0 ? count / n : 0;
  });
  return unmixReportingShares(onGrid);
}

/** The unmixing step of reportingShares, from the share lying on each grid. */
function unmixReportingShares(onGrid: number[]): number[] {
  const last = REPORTING_GRIDS.length - 1;
  const shares = new Array<number>(REPORTING_GRIDS.length).fill(0);
  let coarserOrEqual = onGrid[last];
  for (let k = last; k > 0; k--) {
    const coarser = REPORTING_GRIDS[k - 1];
    let chance = 0;
    for (let j = k + 1; j <= last; j++) chance += shares[j] * REPORTING_GRIDS[j] / coarser;
    const share = (coarserOrEqual + chance - onGrid[k - 1]) / (1 - REPORTING_GRIDS[k] / coarser);
    shares[k] = Math.min(Math.max(share, 0), coarserOrEqual);
    coarserOrEqual -= shares[k];
  }
  shares[0] = coarserOrEqual;
  return shares;
}

/** Continuous lower bound of the complete sample {M >= mc} for the Aki MLE. */
function sampleLowerBound(mc: number, magsAboveMc: number[]): { lowerBound: number; resolution: number } {
  return lowerBoundFromShares(mc, reportingShares(magsAboveMc));
}

/** sampleLowerBound given the sample's reporting shares. */
function lowerBoundFromShares(mc: number, shares: number[]): { lowerBound: number; resolution: number } {
  let continuousShare = 1;
  let lowerBound = 0;
  let resolution = 0;
  let dominantShare = 0;
  REPORTING_GRIDS.forEach((step, k) => {
    continuousShare -= shares[k];
    lowerBound += shares[k] * (ceilToGrid(mc, step) - step / 2);
    if (shares[k] > dominantShare) { dominantShare = shares[k]; resolution = step; }
  });
  continuousShare = Math.max(continuousShare, 0);
  lowerBound += continuousShare * mc;
  if (continuousShare >= dominantShare) resolution = 0;
  return { lowerBound, resolution };
}

/** Fewest events from which Mc may be estimated; matches lib/seismological-analysis.ts. */
const MIN_EVENTS_FOR_MC = 50;

/**
 * Mc estimation options, floors and estimators, identical to lib/seismological-analysis.ts
 * (resolveMcOptions, goodnessOfFitMc, estimateMcFromBins).
 */
const DEFAULT_MAXC_CORRECTION = 0.2;
const MAXC_CORRECTION_RANGE = { min: 0, max: 0.5 } as const;
const MIN_EVENTS_ABOVE_MC = 10;
const MIN_POPULATED_BINS = 3;
const GFT_LEVELS = [95, 90] as const;

interface GoodnessOfFitOutcome {
  mc: number | null;
  level: 95 | 90 | null;
  fit: number | null;
  curve: { magnitude: number; fit: number }[];
}

interface McEstimate {
  mc: number;
  method: McMethod;
  requestedMethod: McMethod;
  maxcCorrection: number;
  gft?: GoodnessOfFitOutcome;
  fallbackReason?: string;
}

function resolveMcOptions(options: { method?: McMethod; maxcCorrection?: number } | undefined): { method: McMethod; maxcCorrection: number } {
  const method = options?.method ?? 'MAXC';
  if (method !== 'MAXC' && method !== 'GFT') {
    throw new Error(`Unknown Mc method "${String(method)}" (expected MAXC or GFT)`);
  }
  const maxcCorrection = options?.maxcCorrection ?? DEFAULT_MAXC_CORRECTION;
  if (!Number.isFinite(maxcCorrection) ||
      maxcCorrection < MAXC_CORRECTION_RANGE.min || maxcCorrection > MAXC_CORRECTION_RANGE.max) {
    throw new Error(
      `Invalid MAXC correction ${maxcCorrection} (must be between ${MAXC_CORRECTION_RANGE.min} and ${MAXC_CORRECTION_RANGE.max})`
    );
  }
  return { method, maxcCorrection };
}

/**
 * Goodness-of-fit test for Mc (Wiemer & Wyss, 2000): the lowest bin edge Mi whose MLE
 * Gutenberg-Richter law reproduces R >= 95% (else 90%) of the observed cumulative
 * counts at and above it, R = 100 - 100 sum|B_j - S_j| / sum B_j.
 */
function goodnessOfFitMc(magnitudes: number[], sortedBins: Array<[number, number]>): GoodnessOfFitOutcome {
  const sorted = [...magnitudes].sort((a, b) => a - b);
  const n = sorted.length;
  const suffixSum = new Float64Array(n + 1);
  const suffixOnGrid = REPORTING_GRIDS.map(() => new Float64Array(n + 1));
  for (let i = n - 1; i >= 0; i--) {
    suffixSum[i] = suffixSum[i + 1] + sorted[i];
    for (let k = 0; k < REPORTING_GRIDS.length; k++) {
      suffixOnGrid[k][i] = suffixOnGrid[k][i + 1] + (isOnGrid(sorted[i], REPORTING_GRIDS[k]) ? 1 : 0);
    }
  }
  const nBins = sortedBins.length;
  const cumulative = new Array<number>(nBins);
  const populatedFrom = new Array<number>(nBins);
  let running = 0;
  let populated = 0;
  for (let j = nBins - 1; j >= 0; j--) {
    running += sortedBins[j][1];
    if (sortedBins[j][1] > 0) populated++;
    cumulative[j] = running;
    populatedFrom[j] = populated;
  }

  const curve: { magnitude: number; fit: number }[] = [];
  for (let i = 0; i < nBins; i++) {
    const cutoff = sortedBins[i][0];
    const start = firstIndexAtOrAfter(sorted, cutoff - GRID_TOLERANCE);
    const count = n - start;
    if (count < MIN_EVENTS_ABOVE_MC || populatedFrom[i] < MIN_POPULATED_BINS) break;
    const shares = unmixReportingShares(suffixOnGrid.map(onGrid => onGrid[start] / count));
    const { lowerBound } = lowerBoundFromShares(cutoff, shares);
    const bValue = Math.LOG10E / (suffixSum[start] / count - lowerBound);
    if (!Number.isFinite(bValue) || bValue <= 0) continue;
    let misfit = 0;
    let observed = 0;
    for (let j = i; j < nBins; j++) {
      misfit += Math.abs(cumulative[j] - count * Math.pow(10, -bValue * (sortedBins[j][0] - cutoff)));
      observed += cumulative[j];
    }
    curve.push({ magnitude: cutoff, fit: 100 - (100 * misfit) / observed });
  }
  for (const level of GFT_LEVELS) {
    const reached = curve.find(point => point.fit >= level);
    if (reached) return { mc: reached.magnitude, level, fit: reached.fit, curve };
  }
  return { mc: null, level: null, fit: null, curve };
}

/** Mc from a sample's magnitudes and non-cumulative FMD: MAXC + correction, or the GFT. */
function estimateMcFromBins(
  magnitudes: number[],
  sortedBins: Array<[number, number]>,
  options: { method: McMethod; maxcCorrection: number }
): McEstimate {
  let peakMag = sortedBins[0][0];
  let peakCount = -1;
  for (const [mag, count] of sortedBins) {
    if (count > peakCount) { peakCount = count; peakMag = mag; }
  }
  const { method, maxcCorrection } = options;
  const maxcMc = Number((peakMag + maxcCorrection).toFixed(2));
  if (method === 'MAXC') {
    return { mc: maxcMc, method: 'MAXC', requestedMethod: 'MAXC', maxcCorrection };
  }
  const gft = goodnessOfFitMc(magnitudes, sortedBins);
  if (gft.mc != null) {
    return { mc: gft.mc, method: 'GFT', requestedMethod: 'GFT', maxcCorrection, gft };
  }
  return {
    mc: maxcMc,
    method: 'MAXC',
    requestedMethod: 'GFT',
    maxcCorrection,
    gft,
    fallbackReason: `No cut-off reached a 90% goodness of fit, so Mc is maximum curvature + ${Number(maxcCorrection.toFixed(2))}`,
  };
}

// Gutenberg-Richter calculation
function calculateGutenbergRichter(
  events: EarthquakeEvent[],
  minMagnitude?: number,
  binWidth = 0.1,
  mcOptions?: { method?: McMethod; maxcCorrection?: number }
) {
  const resolvedMcOptions = resolveMcOptions(mcOptions);
  const filteredEvents = minMagnitude != null
    ? events.filter(e => e.magnitude >= minMagnitude - GRID_TOLERANCE)
    : events;

  if (filteredEvents.length < 10) {
    return { error: 'Insufficient data (need at least 10 events)' };
  }
  // Estimating Mc (no explicit cut-off) is held to the Mc floor, as in the library.
  if (minMagnitude == null && filteredEvents.length < MIN_EVENTS_FOR_MC) {
    return {
      error: `Insufficient data to estimate the completeness magnitude (need at least ${MIN_EVENTS_FOR_MC} events, or an explicit magnitude cut-off)`
    };
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

  // Completeness magnitude Mc when no explicit cut-off is supplied: MAXC (Wiemer &
  // Wyss 2000) plus the correction (default +0.2; Woessner & Wiemer 2005), or the
  // goodness-of-fit test, as in lib/seismological-analysis.ts. The Aki-Utsu MLE is
  // only valid above Mc and the mean MUST be taken over events with M >= Mc; the
  // previous code averaged the FULL (incomplete) magnitude array, biasing b.
  let mc: number;
  let estimate: McEstimate | undefined;
  if (minMagnitude != null) {
    mc = minMagnitude;
  } else {
    estimate = estimateMcFromBins(magnitudes, sortedBins, resolvedMcOptions);
    mc = estimate.mc;
  }
  const magsAboveMc = magnitudes.filter(m => m >= mc - GRID_TOLERANCE);
  // Hard floor: fewer than 10 events above Mc means the estimate is WITHHELD, not
  // reported. Falling back to the catalogue floor (the old behaviour) anchored the
  // MLE at a magnitude the catalogue is not complete above and reported that floor
  // as the completeness magnitude. Matches lib/seismological-analysis.ts.
  if (magsAboveMc.length < MIN_EVENTS_ABOVE_MC) {
    return {
      error: `Insufficient data above the completeness magnitude (need at least ${MIN_EVENTS_ABOVE_MC} events above Mc=${mc})`
    };
  }

  // Apply the bin safeguard to the same complete sample used by the MLE.
  const populatedBins = new Set(magsAboveMc.map(m => binKey(binLowerEdge(m, binWidth)))).size;
  if (populatedBins < MIN_POPULATED_BINS) {
    return { error: `Insufficient magnitude bins above Mc (need at least ${MIN_POPULATED_BINS} populated bins)` };
  }

  // Maximum-likelihood b-value (Aki, 1965); the lower bound carries the Utsu
  // correction for the magnitudes' reporting resolution, not for binWidth.
  const meanMag = magsAboveMc.reduce((sum, m) => sum + m, 0) / magsAboveMc.length;
  const { lowerBound, resolution } = sampleLowerBound(mc, magsAboveMc);
  const bValue = Math.LOG10E / (meanMag - lowerBound);
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
    mcSource: estimate ? estimate.method : 'cutoff',
    ...(estimate && {
      requestedMcMethod: estimate.requestedMethod,
      maxcCorrection: estimate.maxcCorrection,
      ...(estimate.gft && { gftLevel: estimate.gft.level }),
      ...(estimate.fallbackReason && { fallbackReason: estimate.fallbackReason }),
    }),
    rSquared,
    bUncertainty,
    eventsAboveMc: magsAboveMc.length,
    magnitudeResolution: resolution,
    // Snap float noise to 0; a real negative value means an off-grid cut-off sits
    // below the first grid value kept, i.e. the sample starts above the cut-off.
    binningCorrection: Math.abs(mc - lowerBound) < GRID_TOLERANCE ? 0 : mc - lowerBound,
    dataPoints: cumulativeCounts,
    fittedLine
  };
}

// Completeness magnitude estimation
// `binWidth` mirrors lib/seismological-analysis.ts estimateCompletenessMagnitude,
// which the caller can parameterise; it used to be hard-coded here, so the two
// copies could only agree at the default 0.1.
function estimateCompleteness(
  events: EarthquakeEvent[],
  binWidth = 0.1,
  correction: number = DEFAULT_MAXC_CORRECTION,
  method?: McMethod
) {
  const mcOptions = resolveMcOptions({ method, maxcCorrection: correction });
  if (events.length < MIN_EVENTS_FOR_MC) {
    return { error: `Insufficient data (need at least ${MIN_EVENTS_FOR_MC} events)` };
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

  // Mc by maximum curvature (peak of the non-cumulative FMD) plus the correction, or
  // by the goodness-of-fit test; the estimator the G-R fit uses, as in the library.
  const estimate = estimateMcFromBins(
    magnitudes,
    distribution.map(({ magnitude, count }): [number, number] => [magnitude, count]),
    mcOptions
  );
  const mc = estimate.mc;

  // Share of events at or above Mc, which the fit keeps; not a completeness score
  // (see CompletenessResult in lib/seismological-analysis.ts).
  const eventsAboveMc = events.filter(e => e.magnitude >= mc).length;
  const confidence = eventsAboveMc / events.length;

  return {
    mc,
    method: estimate.method,
    requestedMethod: estimate.requestedMethod,
    maxcCorrection: estimate.maxcCorrection,
    ...(estimate.gft && {
      gftLevel: estimate.gft.level,
      gftFit: estimate.gft.fit,
      gftCurve: estimate.gft.curve,
    }),
    ...(estimate.fallbackReason && { fallbackReason: estimate.fallbackReason }),
    confidence,
    eventsAboveMc,
    binWidth,
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

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Great-circle kilometres per degree of latitude on haversineDistance's sphere. */
const KM_PER_DEGREE_LATITUDE = 6371 * Math.PI / 180;

/** Index of the first entry of the ascending `times` at or after `time`. */
function firstIndexAtOrAfter(times: number[], time: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Gardner-Knopoff Declustering Algorithm (Worker version)
 */
function gardnerKnopoffDeclustering(events: EarthquakeEvent[]): SeismicCluster[] {
  if (events.length < 3) return [];

  // Parse every origin time once and sort by it; each head's forward window is then
  // a contiguous run found by binary search, as in lib/seismological-analysis.ts.
  // The previous full rescan per head was O(N^2) and held the Temporal tab's time
  // series back behind it.
  const byTime = events
    .map(event => ({ event, time: new Date(event.time).getTime() }))
    .sort((a, b) => a.time - b.time);

  // Filter events with valid locations
  const validEntries = byTime.filter(({ event: e }) =>
    e.latitude != null && e.longitude != null &&
    !isNaN(e.latitude) && !isNaN(e.longitude)
  );

  if (validEntries.length < 3) return [];

  // An unparseable origin time falls in no window; such an event stays independent.
  const windowed = validEntries.filter(entry => Number.isFinite(entry.time));
  const windowedTimes = windowed.map(entry => entry.time);

  const clusterAssignment = new Map<number | string, number | string>();
  const clusters = new Map<number | string, EarthquakeEvent[]>();

  // Process by magnitude (largest first); equal magnitudes retain time order.
  const byMagnitude = [...validEntries].sort((a, b) => b.event.magnitude - a.event.magnitude);

  for (const { event: mainshock, time: mainshockTime } of byMagnitude) {
    if (clusterAssignment.has(mainshock.id)) continue;
    // Reserve heads too, including independent events with no dependents.
    clusterAssignment.set(mainshock.id, mainshock.id);
    if (!Number.isFinite(mainshockTime)) continue;

    const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(mainshock.magnitude);
    const clusterEvents: EarthquakeEvent[] = [mainshock];

    // Forward window only; must match lib/seismological-analysis.ts.
    for (let i = firstIndexAtOrAfter(windowedTimes, mainshockTime); i < windowed.length; i++) {
      const timeDiffDays = (windowedTimes[i] - mainshockTime) / MS_PER_DAY;
      if (timeDiffDays > timeWindowDays) break;

      const event = windowed[i].event;
      if (event.id === mainshock.id || clusterAssignment.has(event.id)) continue;

      // Exact lower bound on the great-circle distance; boundary cases go on to the haversine.
      if (Math.abs(event.latitude - mainshock.latitude) * KM_PER_DEGREE_LATITUDE > distanceWindowKm + 1e-6) {
        continue;
      }

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
    // withheld (left undefined) below the Mc floor or when the fit fails its floors.
    let bValue: number | undefined;
    if (clusterEvents.length >= MIN_EVENTS_FOR_MC) {
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

  // Parse each origin time once rather than per sort comparison.
  const sortedEvents = events
    .map(event => ({ event, time: new Date(event.time).getTime() }))
    .sort((a, b) => a.time - b.time)
    .map(entry => entry.event);

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
 *   'assumed'  ML family, GeoNet's bare 'M', and untyped magnitudes - used under the
 *              ML ~ Mw approximation this codebase already labels generic; counted so
 *              the result can say how much rests on it.
 *   'excluded' every other stated scale: mb/mB and Ms (which saturate), Md, and any
 *              unrecognised type (Me, Mjma, Mc, ...) - no moment relation is applied
 *              to them here; not summed; counted.
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
    return { error: 'No Mw or ML magnitudes to compute seismic moment from (mb, Ms, Md and other stated scales have no moment relation here and are excluded)' };
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

/**
 * Seismicity-rate and cumulative-release time series, identical to
 * analyzeSeismicityTimeSeries in lib/seismological-analysis.ts: events at or above the
 * cut-off (else the estimated Mc, else every event below the 50-event Mc floor) per UTC
 * day, ISO week or month ('auto': daily up to a 365-day span, weekly beyond), and the
 * moment and radiated energy (log10 E = 1.5 M + 4.8) of the moment-eligible events on
 * the same bins.
 */
const RATE_INTERVAL_OPTIONS: readonly RateIntervalOption[] = ['auto', 'day', 'week', 'month'];

function utcDayIndex(ms: number): number {
  return Math.floor(ms / MS_PER_DAY);
}

function utcDayString(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().split('T')[0];
}

function utcMonthIndex(day: number): number {
  const date = new Date(day * MS_PER_DAY);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function monthStartDay(monthIndex: number): number {
  const date = new Date(0);
  date.setUTCFullYear(Math.floor(monthIndex / 12), ((monthIndex % 12) + 12) % 12, 1);
  return Math.round(date.getTime() / MS_PER_DAY);
}

function calendarBins(interval: RateInterval, firstDay: number, lastDay: number): {
  starts: number[];
  lengths: number[];
  binOf: (day: number) => number;
} {
  const starts: number[] = [];
  const lengths: number[] = [];
  if (interval === 'day') {
    for (let day = firstDay; day <= lastDay; day++) { starts.push(day); lengths.push(1); }
    return { starts, lengths, binOf: day => day - firstDay };
  }
  if (interval === 'week') {
    // Day 0 (1970-01-01) was a Thursday, so (day + 3) mod 7 counts days since Monday.
    const firstMonday = firstDay - (((firstDay + 3) % 7) + 7) % 7;
    for (let start = firstMonday; start <= lastDay; start += 7) { starts.push(start); lengths.push(7); }
    return { starts, lengths, binOf: day => Math.floor((day - firstMonday) / 7) };
  }
  const firstMonth = utcMonthIndex(firstDay);
  const lastMonth = utcMonthIndex(lastDay);
  for (let month = firstMonth; month <= lastMonth; month++) {
    const start = monthStartDay(month);
    starts.push(start);
    lengths.push(monthStartDay(month + 1) - start);
  }
  return { starts, lengths, binOf: day => utcMonthIndex(day) - firstMonth };
}

function analyzeSeismicityTimeSeries(
  events: EarthquakeEvent[],
  options: { interval?: RateIntervalOption; minMagnitude?: number; mcMethod?: McMethod; maxcCorrection?: number; binWidth?: number } = {}
) {
  const requestedInterval = options.interval ?? 'auto';
  if (!RATE_INTERVAL_OPTIONS.includes(requestedInterval)) {
    return { error: `Unknown rate interval "${String(requestedInterval)}" (expected auto, day, week or month)` };
  }
  const mcOptions = resolveMcOptions({ method: options.mcMethod, maxcCorrection: options.maxcCorrection });
  if (events.length === 0) {
    return { error: 'No events provided for time-series analysis' };
  }

  const times = events.map(event => new Date(event.time).getTime());
  let first = Infinity;
  let last = -Infinity;
  let untimedEvents = 0;
  for (const time of times) {
    if (!Number.isFinite(time)) { untimedEvents++; continue; }
    if (time < first) first = time;
    if (time > last) last = time;
  }
  if (untimedEvents === events.length) {
    return { error: 'No events with a valid origin time for time-series analysis' };
  }
  const interval: RateInterval = requestedInterval !== 'auto' ? requestedInterval
    : Math.max((last - first) / MS_PER_DAY, 1) > 365 ? 'week' : 'day';

  let threshold: number | null = null;
  let thresholdSource: 'cutoff' | 'mc' | 'none';
  let mcDetails: Record<string, unknown> = {};
  let note: string | undefined;
  if (options.minMagnitude != null) {
    threshold = options.minMagnitude;
    thresholdSource = 'cutoff';
  } else if (events.length >= MIN_EVENTS_FOR_MC) {
    const completeness = estimateCompleteness(
      events, options.binWidth ?? 0.1, mcOptions.maxcCorrection, mcOptions.method
    ) as { mc: number; method: McMethod; requestedMethod: McMethod; maxcCorrection: number; gftLevel?: 95 | 90 | null };
    threshold = completeness.mc;
    thresholdSource = 'mc';
    mcDetails = {
      mcMethod: completeness.method,
      requestedMcMethod: completeness.requestedMethod,
      maxcCorrection: completeness.maxcCorrection,
      ...(completeness.requestedMethod === 'GFT' && { gftLevel: completeness.gftLevel ?? null }),
    };
  } else {
    thresholdSource = 'none';
    note = `Mc needs at least ${MIN_EVENTS_FOR_MC} events to estimate and ${events.length} were analysed, so every event is counted`;
  }

  const firstDay = utcDayIndex(first);
  const lastDay = utcDayIndex(last);
  const { starts, lengths, binOf } = calendarBins(interval, firstDay, lastDay);
  const nBins = starts.length;
  const counts = new Array<number>(nBins).fill(0);
  const moments = new Array<number>(nBins).fill(0);
  const energies = new Array<number>(nBins).fill(0);
  let eventCount = 0;
  let usedCount = 0;
  let assumedMwCount = 0;
  let excludedCount = 0;
  events.forEach((event, i) => {
    if (!Number.isFinite(times[i])) return;
    const bin = binOf(utcDayIndex(times[i]));
    if (threshold == null || event.magnitude >= threshold - GRID_TOLERANCE) {
      counts[bin]++;
      eventCount++;
    }
    const eligibility = momentEligibility(event.magnitude_type);
    if (eligibility === 'excluded') { excludedCount++; return; }
    if (eligibility === 'assumed') assumedMwCount++;
    usedCount++;
    moments[bin] += Math.pow(10, 1.5 * event.magnitude + 9.1);
    energies[bin] += Math.pow(10, 1.5 * event.magnitude + 4.8);
  });

  const rateBins: { date: string; count: number; days: number; coveredDays?: number }[] = [];
  const releaseBins: { date: string; moment: number; energy: number; cumulativeMoment: number; cumulativeEnergy: number }[] = [];
  let cumulativeMoment = 0;
  let cumulativeEnergy = 0;
  for (let b = 0; b < nBins; b++) {
    const date = utcDayString(starts[b]);
    const covered = Math.min(starts[b] + lengths[b] - 1, lastDay) - Math.max(starts[b], firstDay) + 1;
    rateBins.push({
      date,
      count: counts[b],
      days: lengths[b],
      ...(covered < lengths[b] && { coveredDays: covered }),
    });
    cumulativeMoment += moments[b];
    cumulativeEnergy += energies[b];
    releaseBins.push({ date, moment: moments[b], energy: energies[b], cumulativeMoment, cumulativeEnergy });
  }

  return {
    interval,
    requestedInterval,
    startDate: utcDayString(firstDay),
    endDate: utcDayString(lastDay),
    untimedEvents,
    rate: {
      threshold,
      thresholdSource,
      ...mcDetails,
      ...(note && { note }),
      eventCount,
      bins: rateBins,
    },
    release: {
      bins: releaseBins,
      totalMoment: cumulativeMoment,
      totalEnergy: cumulativeEnergy,
      usedCount,
      assumedMwCount,
      excludedCount,
    },
  };
}

// Handle messages from main thread
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, events } = e.data as { type: string; events: EarthquakeEvent[] };
  const { minMagnitude, binWidth, declusterMethod, mcMethod, maxcCorrection, interval } = e.data as {
    minMagnitude?: number; binWidth?: number; declusterMethod?: string;
    mcMethod?: McMethod; maxcCorrection?: number; interval?: RateIntervalOption;
  };

  const cacheKey = getCacheKey(type, events, { minMagnitude, binWidth, declusterMethod, mcMethod, maxcCorrection, interval });
  const cached = getFromCache(cacheKey);

  if (cached) {
    self.postMessage({ type, result: cached, cached: true });
    return;
  }

  let result: any;

  try {
    switch (type) {
      case 'gutenberg-richter':
        result = calculateGutenbergRichter(events, minMagnitude, binWidth, { method: mcMethod, maxcCorrection });
        break;
      case 'completeness':
        result = estimateCompleteness(events, binWidth, maxcCorrection, mcMethod);
        break;
      case 'temporal':
        result = analyzeTemporalPattern(events);
        break;
      case 'time-series':
        result = analyzeSeismicityTimeSeries(events, { interval, minMagnitude, mcMethod, maxcCorrection, binWidth });
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
