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

/**
 * How the completeness magnitude is estimated: maximum curvature (MAXC; Wiemer & Wyss,
 * 2000) plus a correction, or the goodness-of-fit test (GFT; Wiemer & Wyss, 2000).
 */
export type McMethod = 'MAXC' | 'GFT';

/** Options for estimating Mc; the defaults reproduce the paper's MAXC + 0.2. */
export interface McEstimationOptions {
  /** Estimation method (default 'MAXC'). */
  method?: McMethod;
  /** Added to the MAXC bin (default 0.2), also when a GFT falls back to MAXC. */
  maxcCorrection?: number;
}

/** R (%) of the GFT at one candidate cut-off. */
export interface GoodnessOfFitPoint {
  magnitude: number;
  fit: number;
}

export interface GutenbergRichterResult {
  bValue: number;
  aValue: number;
  completeness: number;
  /**
   * Where `completeness` came from: the caller's explicit cut-off, or the Mc estimation
   * method actually used ('GFT' only when the test reached 90%; a GFT that did not falls
   * back to 'MAXC', see `fallbackReason`).
   */
  mcSource: 'cutoff' | McMethod;
  /** The Mc method asked for, when Mc was estimated. */
  requestedMcMethod?: McMethod;
  /** The MAXC correction in effect when Mc was estimated. */
  maxcCorrection?: number;
  /** Goodness-of-fit level the GFT Mc reached (95 or 90 %); null when it reached neither. */
  gftLevel?: 95 | 90 | null;
  /** Why the requested Mc method was not the one used. */
  fallbackReason?: string;
  rSquared: number;
  /** Formal Aki (1965) standard error of the b-value: sigma_b = b / sqrt(N). */
  bUncertainty: number;
  /** Number of events at or above the cut-off: the N behind b and sigma_b. */
  eventsAboveMc: number;
  /**
   * Step the complete sample's magnitudes are reported at (0.5, 0.25, 0.2, 0.1, 0.05,
   * 0.01, 0.001), or 0 when they are continuous. For a sample mixing steps, the step
   * most of it is reported at.
   */
  magnitudeResolution: number;
  /**
   * How far below the cut-off the MLE places the sample's lower bound: dM/2 for
   * magnitudes rounded to a dM grid (Utsu, 1966; Bender, 1983), 0 for continuous
   * magnitudes, and the share-weighted value when a catalogue mixes resolutions.
   */
  binningCorrection: number;
  dataPoints: { magnitude: number; logCount: number; count: number }[];
  fittedLine: { magnitude: number; logCount: number }[];
}

export interface CompletenessResult {
  mc: number;
  /** Method that produced `mc` ('MAXC' also when a requested GFT fell back to it). */
  method: 'MAXC' | 'GFT' | 'MBS';
  /** The method asked for. */
  requestedMethod: McMethod;
  /** The MAXC correction in effect (added to the MAXC bin when `method` is 'MAXC'). */
  maxcCorrection: number;
  /** GFT only: the goodness-of-fit level reached (95 or 90 %), or null when neither was. */
  gftLevel?: 95 | 90 | null;
  /** GFT only: R (%) at the chosen Mc, or null when the test fell back to MAXC. */
  gftFit?: number | null;
  /** GFT only: R (%) at every candidate cut-off that met the fitting floors. */
  gftCurve?: GoodnessOfFitPoint[];
  /** Why the requested method was not the one used. */
  fallbackReason?: string;
  /**
   * Share of the events at or above Mc: the sample a b-value fit keeps. Despite the
   * name it is neither a confidence in Mc nor a completeness score; for a perfectly
   * complete catalogue the +0.2 MAXC correction alone caps it at 10^(-0.2 b), 63% at
   * b = 1.
   */
  confidence: number;
  /** Number of events at or above Mc. */
  eventsAboveMc: number;
  /** Magnitude bin width of the distribution; one bin is a lower bound on Mc's uncertainty. */
  binWidth: number;
  magnitudeDistribution: { magnitude: number; count: number }[];
}

export interface TemporalAnalysisResult {
  totalEvents: number;
  /** Events without a parseable origin time: left out of the span, rates and bins. */
  untimedEvents: number;
  timeSpanDays: number;
  eventsPerDay: number;
  eventsPerMonth: number;
  eventsPerYear: number;
  /** Length of the time-series bins in days: 1 (UTC days) or 7 (ISO weeks). */
  binDays: 1 | 7;
  /** Occupied bins, keyed by their first UTC day; cumulativeCount runs to the bin's end. */
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
  assumedMwCount: number;
  excludedCount: number;
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
 * Tolerance (magnitude units) of every grid, bin and threshold test on a magnitude.
 * It absorbs representation error, not measurement: a 0.1-rounded magnitude stored as
 * float32 (2.0999999046) is off its decimal by at most 4.8e-7 below M16, one printed
 * to 8 significant digits (2.0999999) by 1e-7, and 2.3 - 0.1 is 2.1999999999999997;
 * a genuine full-precision magnitude such as 7.820379 lies 3.8e-4 from the nearest
 * multiple of 0.001. At 1e-9 (the previous value) float32 0.1-grid magnitudes read as
 * continuous, which dropped the Utsu correction and biased b high by ~8%, and fell
 * into the bin below their own. It is 2^-20 (9.5e-7) rather than 1e-6 because no
 * magnitude printed to fewer than 20 decimals lies exactly that far from a grid
 * line: at 1e-6, a 6-decimal value such as 2.299999 sat on the edge of the test and
 * went either way with rounding, so shifting a catalogue changed its b.
 */
export const MAGNITUDE_TOLERANCE = 2 ** -20;

/** True when `magnitude` is at or above `threshold`, within MAGNITUDE_TOLERANCE. */
export function magnitudeAtOrAbove(magnitude: number, threshold: number): boolean {
  return magnitude >= threshold - MAGNITUDE_TOLERANCE;
}

/** True when `magnitude` is at or below `threshold`, within MAGNITUDE_TOLERANCE. */
export function magnitudeAtOrBelow(magnitude: number, threshold: number): boolean {
  return magnitude <= threshold + MAGNITUDE_TOLERANCE;
}

/** Lower edge of the magnitude bin containing `magnitude`. */
function binLowerEdge(magnitude: number, binWidth: number): number {
  return Math.floor((magnitude + MAGNITUDE_TOLERANCE) / binWidth) * binWidth;
}

/** Lower edge of the highest bin a sample whose largest magnitude is `max` needs. */
function topBinEdge(max: number, binWidth: number): number {
  return Math.ceil((max - MAGNITUDE_TOLERANCE) / binWidth) * binWidth;
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
 * Steps a catalogue magnitude is commonly reported at, coarsest first. Each is a
 * multiple of the next, so a value on a coarser grid also lies on every finer one.
 */
const REPORTING_GRIDS = [0.1, 0.05, 0.01, 0.001];

/**
 * Steps coarser than 0.1 that historical and intensity-derived magnitudes are reported
 * at (half and quarter units, and 0.2), coarsest first. They cannot join the unmixing
 * of REPORTING_GRIDS: they do not nest with it (0.25 is not a multiple of 0.1), and the
 * exponential FMD crowds the low residues, so about 30% of b = 1 magnitudes reported to
 * 0.1 are multiples of 0.5, not the 20% that unmixing by chance would allow for. A
 * sample is therefore taken to be reported at a coarse step only when at least
 * COARSE_GRID_SHARE of it lies on that step. The likeliest confusion, a b = 1 sample
 * reported to 0.1 lying that much on the 0.2 grid, has a probability of about 0.3% at
 * 10 events and below 1e-9 at 50.
 */
const COARSE_REPORTING_GRIDS = [0.5, 0.25, 0.2];
const COARSE_GRID_SHARE = 0.95;

function isOnGrid(magnitude: number, step: number): boolean {
  return Math.abs(magnitude - Math.round(magnitude / step) * step) < MAGNITUDE_TOLERANCE;
}

/** Smallest multiple of `step` at or above `magnitude`. */
function ceilToGrid(magnitude: number, step: number): number {
  return Math.ceil((magnitude - MAGNITUDE_TOLERANCE) / step) * step;
}

/** Share of `magnitudes` lying on each grid of `grids` (index-aligned). */
function onGridShares(magnitudes: number[], grids: number[]): number[] {
  const n = magnitudes.length;
  return grids.map(step => {
    let count = 0;
    for (const m of magnitudes) if (isOnGrid(m, step)) count++;
    return n > 0 ? count / n : 0;
  });
}

/**
 * Share of a sample reported at each step of REPORTING_GRIDS (index-aligned), from the
 * share of it lying on each of those grids; the rest of the sample is continuous.
 *
 * Lying on a grid does not by itself mean a value was rounded to it: a tenth of all
 * 0.01-resolution magnitudes are multiples of 0.1 by chance. The shares are therefore
 * unmixed from the finest grid up, removing from each coarser grid the hits expected
 * by chance from the finer resolutions already accounted for (a value reported at
 * step g_j lands on the coarser grid g_k with probability g_j / g_k). The goodness-of-
 * fit test calls this for every candidate cut-off, from running counts.
 */
function unmixReportingShares(onGrid: number[]): number[] {
  const last = REPORTING_GRIDS.length - 1;
  const shares = new Array<number>(REPORTING_GRIDS.length).fill(0);
  let coarserOrEqual = onGrid[last]; // share reported at REPORTING_GRIDS[k] or coarser
  for (let k = last; k > 0; k--) {
    const coarser = REPORTING_GRIDS[k - 1];
    let chance = 0;
    for (let j = k + 1; j <= last; j++) chance += shares[j] * REPORTING_GRIDS[j] / coarser;
    const share = (coarserOrEqual + chance - onGrid[k - 1]) / (1 - REPORTING_GRIDS[k] / coarser);
    // Sampling noise can push the unmixed share just outside [0, remaining].
    shares[k] = Math.min(Math.max(share, 0), coarserOrEqual);
    coarserOrEqual -= shares[k];
  }
  shares[0] = coarserOrEqual;
  return shares;
}

/**
 * Continuous lower bound of the complete sample {M >= mc}, for the Aki (1965) MLE
 * b = log10(e) / (mean(M) - lowerBound).
 *
 * A magnitude rounded to a grid of step dM stands for [M - dM/2, M + dM/2), so the
 * lowest value kept, the first grid value at or above mc, extends dM/2 below itself
 * (Utsu, 1966; Bender, 1983). A continuous magnitude stands for itself, so its sample
 * starts at mc. Subtracting half the histogram bin width regardless of how the
 * magnitudes were reported (the previous rule) put the bound 0.05 too low for
 * full-precision magnitudes such as GeoNet's and biased b low by 1/(1 + 0.05 b ln10),
 * about 10% at b = 1. For a catalogue that mixes resolutions (a merged catalogue),
 * the bound is the share-weighted mean over its resolutions: to first order that is
 * the MLE for the mixture.
 */
function sampleLowerBound(mc: number, magsAboveMc: number[]): { lowerBound: number; resolution: number } {
  return lowerBoundFromGridShares(
    mc,
    onGridShares(magsAboveMc, REPORTING_GRIDS),
    onGridShares(magsAboveMc, COARSE_REPORTING_GRIDS)
  );
}

/**
 * sampleLowerBound from the sample's share on each grid of REPORTING_GRIDS (`fineOnGrid`)
 * and of COARSE_REPORTING_GRIDS (`coarseOnGrid`). A sample at least COARSE_GRID_SHARE on
 * a coarse step takes that step's half-step for its on-grid share; the rest, and every
 * other sample, the unmixed fine resolutions.
 */
function lowerBoundFromGridShares(
  mc: number,
  fineOnGrid: number[],
  coarseOnGrid: number[]
): { lowerBound: number; resolution: number } {
  const fine = lowerBoundFromShares(mc, unmixReportingShares(fineOnGrid));
  const coarse = COARSE_REPORTING_GRIDS.findIndex((_, k) => coarseOnGrid[k] >= COARSE_GRID_SHARE);
  if (coarse < 0) return fine;
  const step = COARSE_REPORTING_GRIDS[coarse];
  const share = coarseOnGrid[coarse];
  return {
    lowerBound: share * (ceilToGrid(mc, step) - step / 2) + (1 - share) * fine.lowerBound,
    resolution: step,
  };
}

/** The lower bound given the sample's unmixed REPORTING_GRIDS shares. */
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
    magnitudes = magnitudes.filter(m => magnitudeAtOrAbove(m, minMagnitude));
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
  const maxMag = topBinEdge(maxOf(magnitudes), binWidth);

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
 * Fewest events from which Mc may be ESTIMATED (paper, sec:mc). MAXC takes the
 * fullest magnitude bin, and over a few dozen events that bin is sampling noise.
 */
const MIN_EVENTS_FOR_MC = 50;

/**
 * Default MAXC correction: MAXC underestimates Mc by ~0.1-0.2 magnitude units for
 * typical networks (Woessner & Wiemer, 2005), and the paper applies +0.2.
 */
export const DEFAULT_MAXC_CORRECTION = 0.2;

/**
 * Range the MAXC correction may be adjusted within. The documented underestimate is
 * 0.1-0.2; a correction beyond +0.5 discards far more complete data than it protects,
 * and a catalogue that needs it calls for a different Mc method.
 */
export const MAXC_CORRECTION_RANGE = { min: 0, max: 0.5 } as const;

/**
 * Fewest events at or above the cut-off, and fewest populated magnitude bins among
 * them, below which a b-value fit is withheld (paper, sec:mc). The goodness-of-fit
 * test holds every candidate cut-off to the same floors.
 */
const MIN_EVENTS_ABOVE_MC = 10;
const MIN_POPULATED_BINS = 3;

/** Goodness-of-fit levels (%) the GFT tries in turn (Wiemer & Wyss, 2000). */
const GFT_LEVELS = [95, 90] as const;

/** Validated Mc options with their defaults filled in; a bad value throws. */
function resolveMcOptions(options: McEstimationOptions | undefined): Required<McEstimationOptions> {
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

interface GoodnessOfFitOutcome {
  /** Lowest cut-off reaching 95% (else 90%), or null when none reached 90%. */
  mc: number | null;
  level: 95 | 90 | null;
  fit: number | null;
  curve: GoodnessOfFitPoint[];
}

interface McEstimate {
  mc: number;
  method: McMethod;
  requestedMethod: McMethod;
  maxcCorrection: number;
  gft?: GoodnessOfFitOutcome;
  fallbackReason?: string;
}

/**
 * Goodness-of-fit test for Mc (Wiemer & Wyss, 2000; Woessner & Wiemer, 2005).
 *
 * Every bin lower edge Mi, ascending, is a candidate cut-off. The Aki-Utsu MLE gives
 * b from the events at or above Mi, with the reporting-resolution correction the
 * b-value fit uses (lowerBoundFromShares), and a = log10 N(>= Mi) + b Mi. That law
 * predicts the cumulative count S_j = N(>= Mi) 10^(-b (M_j - Mi)) at every bin edge
 * M_j >= Mi up to the bin holding the largest magnitude, and
 *   R = 100 - 100 * sum_j |B_j - S_j| / sum_j B_j
 * is the share of the observed cumulative counts B_j it reproduces. Mc is the lowest
 * cut-off with R >= 95%, else the lowest with R >= 90%. A candidate below the b-value
 * fitting floors (10 events, 3 populated bins) is not tried. The sums stop at the last
 * populated bin, as Wiemer & Wyss's run to Mmax: the histogram of full-precision
 * magnitudes ends in an empty bin above the largest one, whose B = 0 against S > 0 used
 * to lower R by up to ~3 points and move Mc in small catalogues.
 */
function goodnessOfFitMc(magnitudes: number[], sortedBins: Array<[number, number]>): GoodnessOfFitOutcome {
  const sorted = [...magnitudes].sort((a, b) => a - b);
  const n = sorted.length;
  // Totals accumulated from the top, so the sample above any cut-off is summarised in
  // O(1) (its sum, and how many of its values lie on each reporting grid) instead of
  // being rescanned for every candidate.
  const suffixSum = new Float64Array(n + 1);
  const grids = [...REPORTING_GRIDS, ...COARSE_REPORTING_GRIDS];
  const suffixOnGrid = grids.map(() => new Float64Array(n + 1));
  for (let i = n - 1; i >= 0; i--) {
    suffixSum[i] = suffixSum[i + 1] + sorted[i];
    for (let k = 0; k < grids.length; k++) {
      suffixOnGrid[k][i] = suffixOnGrid[k][i + 1] + (isOnGrid(sorted[i], grids[k]) ? 1 : 0);
    }
  }
  const nBins = sortedBins.length;
  const cumulative = new Array<number>(nBins);
  const populatedFrom = new Array<number>(nBins);
  let running = 0;
  let populated = 0;
  let lastPopulated = -1;
  for (let j = nBins - 1; j >= 0; j--) {
    running += sortedBins[j][1];
    if (sortedBins[j][1] > 0) {
      populated++;
      if (lastPopulated < 0) lastPopulated = j;
    }
    cumulative[j] = running;
    populatedFrom[j] = populated;
  }

  const curve: GoodnessOfFitPoint[] = [];
  for (let i = 0; i < nBins; i++) {
    const cutoff = sortedBins[i][0];
    const start = firstIndexAtOrAfter(sorted, cutoff - MAGNITUDE_TOLERANCE);
    const count = n - start;
    // Both floors only fall as the cut-off rises, so no later candidate can meet them.
    if (count < MIN_EVENTS_ABOVE_MC || populatedFrom[i] < MIN_POPULATED_BINS) break;
    const shareOn = suffixOnGrid.map(onGrid => onGrid[start] / count);
    const { lowerBound } = lowerBoundFromGridShares(
      cutoff, shareOn.slice(0, REPORTING_GRIDS.length), shareOn.slice(REPORTING_GRIDS.length)
    );
    const bValue = Math.LOG10E / (suffixSum[start] / count - lowerBound);
    if (!Number.isFinite(bValue) || bValue <= 0) continue;
    let misfit = 0;
    let observed = 0;
    for (let j = i; j <= lastPopulated; j++) {
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

/**
 * Mc of a sample from its magnitudes and its non-cumulative FMD (contiguous ascending
 * [lower edge, count] bins). calculateGutenbergRichter and estimateCompletenessMagnitude
 * both estimate through here, so the G-R and Mc tabs cannot disagree.
 */
function estimateMcFromBins(
  magnitudes: number[],
  sortedBins: Array<[number, number]>,
  options: Required<McEstimationOptions>
): McEstimate {
  // MAXC (Wiemer & Wyss, 2000): the lower edge of the fullest bin, the lowest on a tie,
  // plus the correction. Always computed, as the GFT falls back to it.
  let peakMag = sortedBins[0][0];
  let peakCount = -1;
  for (const [mag, count] of sortedBins) {
    if (count > peakCount) { peakCount = count; peakMag = mag; }
  }
  const { method, maxcCorrection } = options;
  const maxcMc = Number((peakMag + maxcCorrection).toFixed(2)); // round to bin precision
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

/**
 * Calculate Gutenberg-Richter b-value using maximum likelihood estimation.
 *
 * With no `minMagnitude`, Mc is estimated (`mcOptions`: MAXC + 0.2 by default, or the
 * GFT) and the fit runs above it; an explicit `minMagnitude` is used as given.
 */
export function calculateGutenbergRichter(
  events: EarthquakeEvent[],
  minMagnitude?: number,
  binWidth: number = 0.1,
  mcOptions?: McEstimationOptions
): GutenbergRichterResult {
  const resolvedMcOptions = resolveMcOptions(mcOptions);
  // Filter events by minimum magnitude if specified. The cut tolerates float noise
  // so that a value on the reporting grid equal to the cut-off is never dropped.
  const filteredEvents = minMagnitude != null
    ? events.filter(e => magnitudeAtOrAbove(e.magnitude, minMagnitude))
    : events;

  if (filteredEvents.length < 10) {
    throw new Error('Insufficient data for Gutenberg-Richter analysis (need at least 10 events)');
  }
  // Without a cut-off the fit estimates Mc itself, so the Mc floor applies here as
  // it does in estimateCompletenessMagnitude; this path used to run MAXC on as few
  // as 10 events and report the result as the completeness magnitude. An explicit
  // cut-off is not an estimate and needs only the fitting floors below.
  if (minMagnitude == null && filteredEvents.length < MIN_EVENTS_FOR_MC) {
    throw new Error(
      `Insufficient data to estimate the completeness magnitude (need at least ${MIN_EVENTS_FOR_MC} events, or an explicit magnitude cut-off)`
    );
  }

  // Bin magnitudes
  const filteredMagnitudes = filteredEvents.map(e => e.magnitude);
  const minMag = binLowerEdge(minOf(filteredMagnitudes), binWidth);
  const maxMag = topBinEdge(maxOf(filteredMagnitudes), binWidth);

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

  // Completeness magnitude Mc. The Aki-Utsu MLE below is only valid for a sample
  // that is complete above Mc, so when the caller does not supply an explicit
  // cut-off we ESTIMATE Mc: by maximum curvature (MAXC; Wiemer & Wyss, 2000), the
  // magnitude bin with the most events, plus the correction (default +0.2; Woessner
  // & Wiemer, 2005), or by the goodness-of-fit test. Using the catalogue floor here
  // (the old behaviour) biased b low because the incomplete tail was included.
  let mc: number;
  let estimate: McEstimate | undefined;
  if (minMagnitude != null) {
    mc = minMagnitude;
  } else {
    estimate = estimateMcFromBins(filteredMagnitudes, sortedBins, resolvedMcOptions);
    mc = estimate.mc;
  }
  const magsAboveMc = filteredEvents.map(e => e.magnitude).filter(m => magnitudeAtOrAbove(m, mc));
  // Hard floor: fewer than 10 events above Mc means the estimate is WITHHELD, not
  // reported (paper, sec:mc). The previous guard fell back to the catalogue floor,
  // which anchored the Aki-Utsu MLE at a magnitude the catalogue is demonstrably
  // not complete above and then returned that floor to the UI as `completeness`
  // (e.g. a 14-event sequence with MAXC Mc = 1.2 reported Mc = 1.0, b = 0.53).
  if (magsAboveMc.length < MIN_EVENTS_ABOVE_MC) {
    throw new Error(
      `Insufficient data above the completeness magnitude (need at least ${MIN_EVENTS_ABOVE_MC} events above Mc=${mc})`
    );
  }

  // Apply the bin safeguard to the same complete sample used by the MLE.
  const populatedBins = new Set(magsAboveMc.map(m => binKey(binLowerEdge(m, binWidth)))).size;
  if (populatedBins < MIN_POPULATED_BINS) {
    throw new Error(`Insufficient magnitude bins above Mc (need at least ${MIN_POPULATED_BINS} populated bins)`);
  }

  // Maximum-likelihood b-value (Aki, 1965): b = log10(e) / (meanMag - lowerBound),
  // where lowerBound is Mc less the Utsu binning correction that the REPORTING
  // resolution of the magnitudes calls for (see sampleLowerBound); binWidth only
  // shapes the histogram. Ordinary least-squares on the cumulative FMD is biased and
  // is not used.
  const meanMag = magsAboveMc.reduce((sum, m) => sum + m, 0) / magsAboveMc.length;
  const { lowerBound, resolution } = sampleLowerBound(mc, magsAboveMc);
  const bValue = Math.LOG10E / (meanMag - lowerBound);
  // Formal Aki (1965) standard error of the MLE b-value: sigma_b = b / sqrt(N).
  const bUncertainty = bValue / Math.sqrt(magsAboveMc.length);
  // a-value fixes the GR line through (Mc, N >= Mc): log10 N(M) = a - b*M.
  const aValue = Math.log10(magsAboveMc.length) + bValue * mc;

  // R-squared of the MLE line against the observed cumulative FMD (diagnostic).
  const fittedCounts = cumulativeCounts.filter(p => magnitudeAtOrAbove(p.magnitude, mc));
  const meanY = fittedCounts.reduce((sum, p) => sum + p.logCount, 0) / fittedCounts.length;
  const ssTotal = fittedCounts.reduce((sum, p) => sum + Math.pow(p.logCount - meanY, 2), 0);
  const ssResidual = fittedCounts.reduce((sum, p) => {
    const predicted = aValue - bValue * p.magnitude;
    return sum + Math.pow(p.logCount - predicted, 2);
  }, 0);
  const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

  // Generate fitted line
  const fittedLine = fittedCounts.map(p => ({
    magnitude: p.magnitude,
    logCount: aValue - bValue * p.magnitude
  }));

  // Completeness magnitude actually used for the b-value (the estimate, or the
  // caller-supplied cut-off). The previous "first cumulative residual < 0.2" rule was
  // not a recognised Mc method and has been removed.
  const completeness = mc;

  return {
    bValue,
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
    binningCorrection: Math.abs(mc - lowerBound) < MAGNITUDE_TOLERANCE ? 0 : mc - lowerBound,
    dataPoints: cumulativeCounts,
    fittedLine
  };
}

/**
 * Estimate the completeness magnitude: by maximum curvature plus `correction`
 * (MAXC; Wiemer & Wyss, 2000), or with `options.method = 'GFT'` by the goodness-of-fit
 * test, which falls back to MAXC + `correction` when no cut-off reaches a 90% fit.
 */
export function estimateCompletenessMagnitude(
  events: EarthquakeEvent[],
  binWidth: number = 0.1,
  correction: number = DEFAULT_MAXC_CORRECTION, // MAXC under-estimates Mc by ~0.1-0.2 (Woessner & Wiemer, 2005)
  options: { method?: McMethod } = {}
): CompletenessResult {
  const mcOptions = resolveMcOptions({ method: options.method, maxcCorrection: correction });
  if (events.length < MIN_EVENTS_FOR_MC) {
    throw new Error(`Insufficient data for completeness estimation (need at least ${MIN_EVENTS_FOR_MC} events)`);
  }

  // Bin magnitudes
  const eventMagnitudes = events.map(e => e.magnitude);
  const minMag = binLowerEdge(minOf(eventMagnitudes), binWidth);
  const maxMag = topBinEdge(maxOf(eventMagnitudes), binWidth);

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

  // Maximum curvature (the peak of the non-cumulative FMD) plus the correction, or
  // the goodness-of-fit test: the same estimator calculateGutenbergRichter uses.
  const estimate = estimateMcFromBins(
    eventMagnitudes,
    magnitudeDistribution.map(({ magnitude, count }): [number, number] => [magnitude, count]),
    mcOptions
  );
  const mc = estimate.mc;

  // Share of events at or above Mc (see CompletenessResult.confidence), under the same
  // tolerant test as the G-R fit and the rate series, so all three count the same events.
  const totalEvents = events.length;
  const eventsAboveMc = events.filter(e => magnitudeAtOrAbove(e.magnitude, mc)).length;
  const confidence = eventsAboveMc / totalEvents;

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
    magnitudeDistribution
  };
}

/**
 * Gardner-Knopoff (1974) space-time window parameters, as tabulated in
 * van Stiphout et al. (2012), CORSSA, Table 1.
 *
 * This implementation uses a forward window (0 <= t - t_mainshock <= T(M)).
 * Events before a mainshock are not removed by that mainshock's window.
 * This is a method choice: OpenQuake HMTK exposes the backward fraction through
 * fs_time_prop; choosing 0 there corresponds to this time-window policy.
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

  const { sortedEvents, clusters, mainshockCandidates } = gardnerKnopoffWindows(events);

  // Get mainshocks (events not assigned to any cluster or cluster heads)
  const mainshocks = sortedEvents.filter(e => mainshockCandidates.has(e.id));

  return { mainshocks, clusters, clusterInfo: gardnerKnopoffClusterInfo(clusters) };
}

/** Gardner-Knopoff tag of one event (contract C7). */
export interface GardnerKnopoffTag {
  /** Id of the mainshock heading the event's cluster; null for an event in no cluster. */
  clusterId: string | null;
  /** True for a cluster mainshock and for an event in no cluster (the declustered catalogue). */
  isMainshock: boolean;
  /** True for an event inside a larger event's window (removed by declustering). */
  isDependent: boolean;
}

/**
 * Per-event Gardner-Knopoff tags (contract C7): the same windows, largest-first head
 * reservation and forward-only window as gardnerKnopoffDeclustering, without its
 * per-cluster summaries. Sorting dominates: O(N log N) plus the window scans.
 */
export function declusterGardnerKnopoff(
  events: Array<{ id: string; time: string; latitude: number; longitude: number; magnitude: number }>
): Map<string, GardnerKnopoffTag> {
  const tags = new Map<string, GardnerKnopoffTag>();
  if (events.length === 0) return tags;
  // The window method reads no depth.
  const { clusters } = gardnerKnopoffWindows(events.map(event => ({ ...event, depth: 0 })));
  clusters.forEach((members, headId) => {
    const clusterId = String(headId);
    for (const member of members) {
      const isHead = String(member.id) === clusterId;
      tags.set(String(member.id), { clusterId, isMainshock: isHead, isDependent: !isHead });
    }
  });
  for (const event of events) {
    if (!tags.has(String(event.id))) {
      tags.set(String(event.id), { clusterId: null, isMainshock: true, isDependent: false });
    }
  }
  return tags;
}

/**
 * Order in which Gardner-Knopoff heads claim their windows: the larger magnitude first;
 * equal magnitudes by origin time, an unparseable time last; then input order.
 */
function compareHeads(
  a: { event: { magnitude: number }; time: number; index: number },
  b: { event: { magnitude: number }; time: number; index: number }
): number {
  if (a.event.magnitude !== b.event.magnitude) return b.event.magnitude - a.event.magnitude;
  const aTimed = Number.isFinite(a.time);
  const bTimed = Number.isFinite(b.time);
  if (aTimed !== bTimed) return aTimed ? -1 : 1;
  if (aTimed && a.time !== b.time) return a.time - b.time;
  return a.index - b.index;
}

/**
 * The window pass of the Gardner-Knopoff method: the events in time order, the
 * cluster (head id -> head and dependents) of every head that gathered dependents,
 * and the ids no larger event's window took.
 */
function gardnerKnopoffWindows(events: EarthquakeEvent[]): {
  sortedEvents: EarthquakeEvent[];
  clusters: Map<number | string, EarthquakeEvent[]>;
  mainshockCandidates: Set<number | string>;
} {
  // Parse every origin time once and sort by it. The window is forward-only, so a
  // head's window is the contiguous run of the sorted catalogue from its own origin
  // time to T(M) later, found by binary search. Rescanning the whole catalogue for
  // every head and re-parsing each ISO string per comparison (the previous loop)
  // was O(N^2): 21.7 s at 10k events, hours for a national catalogue.
  // Only finite times are sorted: one NaN in a sort comparator makes the whole order
  // inconsistent, and the binary search then misses window members (one unparseable
  // time put hundreds of other events of a 3,000-event catalogue in the wrong
  // cluster). An unparseable time falls in no window; such an event stays independent.
  const parsed = events.map((event, index) => ({ event, time: new Date(event.time).getTime(), index }));
  const windowed = parsed
    .filter(entry => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time || a.index - b.index);
  const untimed = parsed.filter(entry => !Number.isFinite(entry.time));
  const sortedEvents = [...windowed, ...untimed].map(entry => entry.event);
  const windowedTimes = windowed.map(entry => entry.time);

  // Track which events are clustered and their cluster assignments
  const clusterAssignment: Map<number | string, number | string> = new Map();
  const clusters: Map<number | string, EarthquakeEvent[]> = new Map();
  const mainshockCandidates: Set<number | string> = new Set(sortedEvents.map(e => e.id));

  // Consider larger events first; equal magnitudes in time order, then input order.
  const headsByMagnitude = [...parsed].sort(compareHeads);

  for (const { event: potentialMainshock, time: mainshockTime } of headsByMagnitude) {
    // Skip if already assigned to a cluster
    if (clusterAssignment.has(potentialMainshock.id)) continue;
    // Reserve the head as well as its dependents. A later, smaller candidate
    // must not absorb this event, even when it has no dependents of its own.
    clusterAssignment.set(potentialMainshock.id, potentialMainshock.id);
    if (!Number.isFinite(mainshockTime)) continue;

    const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(potentialMainshock.magnitude);

    // Find all events within the space-time window
    const clusterEvents: EarthquakeEvent[] = [potentialMainshock];

    // Forward window only; keep the same policy in the worker implementation.
    for (let i = firstIndexAtOrAfter(windowedTimes, mainshockTime); i < windowed.length; i++) {
      const timeDiffDays = (windowedTimes[i] - mainshockTime) / MS_PER_DAY;
      if (timeDiffDays > timeWindowDays) break;

      const event = windowed[i].event;
      if (event.id === potentialMainshock.id) continue;
      if (clusterAssignment.has(event.id)) continue;

      // The latitude difference alone bounds the great-circle distance from below,
      // so this rejects exactly; the margin leaves boundary cases to the haversine.
      if (Math.abs(event.latitude - potentialMainshock.latitude) * KM_PER_DEGREE_LATITUDE > distanceWindowKm + 1e-6) {
        continue;
      }

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

  return { sortedEvents, clusters, mainshockCandidates };
}

/**
 * SeismicCluster summaries of Gardner-Knopoff clusters, largest mainshock first. Sorts
 * each cluster's members into time order in place.
 */
function gardnerKnopoffClusterInfo(clusters: Map<number | string, EarthquakeEvent[]>): SeismicCluster[] {
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
    let sumLat = 0;
    clusterEvents.forEach(e => {
      const dist = haversineDistance(
        mainshock.latitude, mainshock.longitude,
        e.latitude, e.longitude
      );
      if (dist > maxDistance) maxDistance = dist;
      sumLat += e.latitude;
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

    // Per-sequence b-value, estimating the sequence's own Mc, so it is withheld below
    // the Mc floor. The parent catalogue's Mc is not a usable cut-off instead: early
    // in a sequence, short-term aftershock incompleteness puts the sequence's Mc well
    // above the background network's, and fitting from the lower value biases b low.
    let bValue: number | undefined;
    if (clusterEvents.length >= MIN_EVENTS_FOR_MC) {
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
      centerLongitude: meanLongitude(clusterEvents.map((e) => e.longitude)),
      clusterType,
      bValue
    });
  });

  // Sort clusters by mainshock magnitude (largest first)
  clusterInfo.sort((a, b) => b.maxMagnitude - a.maxMagnitude);

  return clusterInfo;
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
    clusterEvents.forEach((e) => {
      const dist = haversineDistance(
        mainshock.latitude, mainshock.longitude, e.latitude, e.longitude
      );
      if (dist > maxDistance) maxDistance = dist;
      sumLat += e.latitude;
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

    // Withheld below the Mc floor, as in gardnerKnopoffDeclustering.
    let bValue: number | undefined;
    if (clusterEvents.length >= MIN_EVENTS_FOR_MC) {
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
      centerLongitude: meanLongitude(clusterEvents.map((e) => e.longitude)),
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

/** Hypocentral distance (km); a missing or non-finite depth is treated as the other event's. */
function hypocentralDistance(lat: number, lon: number, depth: number | null | undefined, other: EarthquakeEvent): number {
  const horizontal = haversineDistance(lat, lon, other.latitude, other.longitude);
  const d1 = typeof depth === 'number' && Number.isFinite(depth) ? depth : null;
  const d2 = typeof other.depth === 'number' && Number.isFinite(other.depth) ? other.depth : null;
  const vertical = d1 !== null && d2 !== null ? d1 - d2 : 0;
  return Math.hypot(horizontal, vertical);
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

  // Only events with a parseable origin time can be linked. Sorting them with the rest
  // fed NaN to the comparator, which scrambles the whole order, and an unparseable time
  // passed every `dt > tau` test, so it was linked to every cluster it lay near. It
  // stays independent, after the timed events.
  const parsed = events.map((event, index) => ({ event, time: new Date(event.time).getTime(), index }));
  const sorted = parsed
    .filter(entry => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time || a.index - b.index)
    .map(entry => entry.event);
  const untimed = parsed.filter(entry => !Number.isFinite(entry.time)).map(entry => entry.event);
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
    let refDepth = ei.depth;
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
      refDepth = big.depth;
      const tdiff = Math.max((tms(ei) - tms(big)) / DAY, 0);
      const deltam = (1 - xk) * mref - xmeff;
      const denom = Math.pow(10, ((deltam - 1) * 2) / 3);
      const tauP = denom > 0 ? (-Math.log(1 - p1) * tdiff) / denom : taumax;
      tau = Math.min(taumax, Math.max(taumin, tauP));
    }

    // Reasenberg links a later event to the cluster when it lies inside the
    // interaction zone of EITHER the largest event in the cluster OR the most
    // recent event (ei). Testing only the largest-event zone, with the larger of
    // the two radii, dropped chains that propagate through a nearby aftershock
    // beyond the mainshock's own radius.
    const rMain = rfact * crackRadiusKm(mref);
    const rLast = rfact * crackRadiusKm(ei.magnitude);

    for (let j = i + 1; j < sorted.length; j++) {
      const ej = sorted[j];
      const dtDays = (tms(ej) - tms(ei)) / DAY;
      if (dtDays > tau) break; // time-sorted: no later event can be within tau
      // Reasenberg's interaction zone is a sphere around the hypocentre, so the test
      // is on HYPOCENTRAL distance: a 610 km deep event is not an aftershock of a
      // 10 km one however close the epicentres. Gardner-Knopoff keeps its
      // epicentral windows, which is how that method was calibrated.
      const nearMain = hypocentralDistance(refLat, refLon, refDepth, ej) <= rMain;
      const nearLast = hypocentralDistance(ei.latitude, ei.longitude, ei.depth, ej) <= rLast;
      if (!nearMain && !nearLast) continue;

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

  const mainshocks = [...sorted.filter((e) => !dependentIds.has(e.id)), ...untimed];
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

  // Parse each origin time once and sort the parseable ones. An unparseable time has
  // no place in the series (toISOString() threw "Invalid time value" on it, failing the
  // whole analysis, and as NaN it scrambled the sort); it is counted and left out.
  const parsed = events.map((event, index) => ({ event, time: new Date(event.time).getTime(), index }));
  const timed = parsed
    .filter(entry => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time || a.index - b.index);
  const untimedEvents = parsed.length - timed.length;
  if (timed.length === 0) {
    throw new Error('No events with a valid origin time for temporal analysis');
  }
  // Declustering input: the timed events in time order, then the untimed (which the
  // declusterers leave independent).
  const sortedEvents = [
    ...timed.map(entry => entry.event),
    ...parsed.filter(entry => !Number.isFinite(entry.time)).map(entry => entry.event),
  ];

  const timeSpanMs = timed[timed.length - 1].time - timed[0].time;
  const timeSpanDays = Math.max(timeSpanMs / (1000 * 60 * 60 * 24), 1);

  // Calculate rates over the events placed in time.
  const eventsPerDay = timed.length / timeSpanDays;
  const eventsPerMonth = eventsPerDay * 30.44;
  const eventsPerYear = eventsPerDay * 365.25;

  // Create time series (daily bins, or weekly if span > 365 days)
  const useWeeklyBins = timeSpanDays > 365;

  const dailyBins: Map<string, number> = new Map();
  timed.forEach(({ time }) => {
    const eventDate = new Date(time);
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

  // Three located events, the smallest significant cluster, as in the worker the
  // Analytics page runs. The window method has no sample-size floor of its own; the
  // former 10-event gate here dropped 3-9 event sequences the UI reported.
  if (eventsWithLocation.length >= 3) {
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
    untimedEvents,
    timeSpanDays,
    eventsPerDay,
    eventsPerMonth,
    eventsPerYear,
    binDays: useWeeklyBins ? 7 : 1,
    timeSeries,
    clusters
  };
}

/**
 * Magnitude types present in a sample, so a b-value or Mc can be flagged when it
 * pools scales. ML, mb, Ms and Mw saturate at different sizes, and pooling them
 * broadens the frequency-magnitude distribution and shifts b (Tinti & Mulargia,
 * 1987; Marzocchi & Sandri, 2003), which the formal sigma_b does not reflect.
 */
export interface MagnitudeTypeSummary {
  /** Reported types as written (trimmed), largest count first; '' marks untyped events. */
  types: { type: string; count: number }[];
  /** Distinct scale families among the typed events (ML and MLv are one family). */
  families: string[];
  /** Events with no stated magnitude type. */
  untyped: number;
}

/** Scale family of a magnitude type: the variants of one scale share a family. */
function magnitudeScaleFamily(type: string): string {
  const t = type.toLowerCase();
  for (const family of ['mw', 'ml', 'mb', 'ms', 'md', 'me']) {
    if (t.startsWith(family)) return family;
  }
  return t;
}

export function summariseMagnitudeTypes(events: { magnitude_type?: string | null }[]): MagnitudeTypeSummary {
  const counts = new Map<string, number>();
  for (const event of events) {
    const type = (event.magnitude_type ?? '').trim();
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const types = Array.from(counts, ([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const families = Array.from(new Set(types.filter(t => t.type).map(t => magnitudeScaleFamily(t.type))));
  return { types, families, untyped: counts.get('') ?? 0 };
}

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
  // catalogues this platform exists to serve. Blank text is untyped too, as the
  // magnitude-type table (summariseMagnitudeTypes) counts it; it used to be excluded.
  const t = (magType ?? '').trim().toLowerCase();
  if (!t) return 'assumed';
  if (t.startsWith('mw')) return 'exact';
  // ML, MLv and GeoNet's bare 'M' (the SeisComP summary magnitude, which for most of
  // the NZ catalogue is a network-weighted local magnitude) share the ML assumption.
  if (t.startsWith('ml') || t === 'm') return 'assumed';
  return 'excluded';
}

/**
 * Calculate seismic moment and moment magnitude
 * M0 = 10^(1.5 * Mw + 9.1) N⋅m
 */
export function calculateSeismicMoment(events: EarthquakeEvent[]): SeismicMomentResult {
  if (events.length === 0) {
    throw new Error('No events provided for seismic moment calculation');
  }

  // Only Mw (exact) and ML (assumed ~Mw) enter the sum; other scales are excluded.
  let assumedCount = 0;
  let excludedCount = 0;
  const momentsData: { magnitude: number; moment: number }[] = [];
  for (const event of events) {
    const eligibility = momentEligibility(event.magnitude_type);
    if (eligibility === 'excluded') { excludedCount++; continue; }
    if (eligibility === 'assumed') assumedCount++;
    momentsData.push({ magnitude: event.magnitude, moment: Math.pow(10, 1.5 * event.magnitude + 9.1) });
  }
  if (momentsData.length === 0) {
    throw new Error('No Mw or ML magnitudes to compute seismic moment from (mb, Ms, Md and other stated scales have no moment relation here and are excluded)');
  }

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
    /** Events whose magnitude entered the sum under the generic ML ~ Mw assumption. */
    assumedMwCount: assumedCount,
    /**
     * Events excluded because their stated scale (mb, Ms, Md or an unrecognised type)
     * has no moment relation here. Untyped magnitudes are not excluded: they are
     * counted in assumedMwCount.
     */
    excludedCount,
    momentByMagnitude: momentByMagnitudeArray,
    largestEvent: {
      magnitude: largestEvent.magnitude,
      moment: largestEvent.moment,
      percentOfTotal: (largestEvent.moment / totalMoment) * 100
    }
  };
}

/** Calendar interval of a seismicity-rate bin. */
export type RateInterval = 'day' | 'week' | 'month';

/** A bin interval, or 'auto': daily bins for a span of up to 365 days, weekly beyond. */
export type RateIntervalOption = RateInterval | 'auto';

const RATE_INTERVAL_OPTIONS: readonly RateIntervalOption[] = ['auto', 'day', 'week', 'month'];

export interface RateBin {
  /** UTC date (YYYY-MM-DD) the bin starts on: the day, its ISO week's Monday, or the 1st of the month. */
  date: string;
  /** Events at or above the threshold in the bin. */
  count: number;
  /** Length of the bin in days: 1, 7, or the length of the month. */
  days: number;
  /**
   * Days of the bin inside the covered span, when fewer than `days` (a partial first or
   * last bin): exact, possibly fractional, against a known period; whole days otherwise.
   */
  coveredDays?: number;
}

export interface ReleaseBin {
  /** Same bin grid as the rate series. */
  date: string;
  /** Length of the bin in days; the cumulative totals run to its end, `days` after `date`. */
  days: number;
  /** Seismic moment (N m) of the moment-eligible events in the bin. */
  moment: number;
  /** Radiated energy (J) of the same events, from log10 E = 1.5 M + 4.8. */
  energy: number;
  cumulativeMoment: number;
  cumulativeEnergy: number;
}

export interface SeismicityTimeSeriesOptions {
  /** Bin interval (default 'auto'). */
  interval?: RateIntervalOption;
  /** Explicit magnitude cut-off: count events at or above it rather than above an estimated Mc. */
  minMagnitude?: number;
  /** Mc estimation used when there is no cut-off (defaults as estimateCompletenessMagnitude). */
  mcMethod?: McMethod;
  maxcCorrection?: number;
  /** Magnitude bin width for estimating Mc (default 0.1). */
  binWidth?: number;
  /**
   * The period [start, end) the events are known to cover (UTC instants or ISO strings;
   * `end` exclusive): the active time-filter window, or the catalogue's declared
   * time_period_start/end. A first or last bin is partial when this period covers only
   * part of it, measured exactly. Without it, coverage can only be read off the first
   * and last events, whose bins hold an event by construction, so scaling such a bin to
   * a full one overstates its rate (`coverage: 'events'` in the result).
   */
  period?: { start: string | number; end: string | number };
}

export interface SeismicityTimeSeriesResult {
  /** The interval binned at ('auto' resolved to 'day' or 'week'). */
  interval: RateInterval;
  requestedInterval: RateIntervalOption;
  /**
   * First and last UTC days the bins cover: the known period (widened to any event
   * outside it), else the first and last events' days.
   */
  startDate: string;
  endDate: string;
  /**
   * What `coveredDays` is measured against: 'period', a known coverage period, so a
   * partial bin's count can be scaled to its full length; or 'events', the first and
   * last events, so a partial bin's count is a lower-edge count that must not be scaled.
   */
  coverage: 'period' | 'events';
  /** Events without a parseable origin time, which no bin can hold. */
  untimedEvents: number;
  rate: {
    /** Magnitude an event must reach to be counted, or null when every event is. */
    threshold: number | null;
    /** 'cutoff': the caller's cut-off; 'mc': the estimated Mc; 'none': too few events to estimate Mc. */
    thresholdSource: 'cutoff' | 'mc' | 'none';
    /** For an 'mc' threshold: the method that produced it and the settings it ran with. */
    mcMethod?: McMethod;
    requestedMcMethod?: McMethod;
    maxcCorrection?: number;
    gftLevel?: 95 | 90 | null;
    /** Why every event is counted (thresholdSource 'none'). */
    note?: string;
    /** Events counted in the bins. */
    eventCount: number;
    bins: RateBin[];
  };
  release: {
    bins: ReleaseBin[];
    totalMoment: number;
    totalEnergy: number;
    /** Events summed: Mw as reported, ML / GeoNet M / untyped under ML ~ Mw. */
    usedCount: number;
    assumedMwCount: number;
    /** Events of a stated scale with no moment relation here (mb, Ms, Md, other). */
    excludedCount: number;
  };
}

/** Days since 1970-01-01 (UTC) of the day holding `ms`. */
function utcDayIndex(ms: number): number {
  return Math.floor(ms / MS_PER_DAY);
}

/** YYYY-MM-DD of a UTC day index. */
function utcDayString(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().split('T')[0];
}

/** Year * 12 + month (UTC) of a day index. */
function utcMonthIndex(day: number): number {
  const date = new Date(day * MS_PER_DAY);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** Day index of the 1st of a month index. (Date.UTC would read years 0-99 as 1900-1999.) */
function monthStartDay(monthIndex: number): number {
  const date = new Date(0);
  date.setUTCFullYear(Math.floor(monthIndex / 12), ((monthIndex % 12) + 12) % 12, 1);
  return Math.round(date.getTime() / MS_PER_DAY);
}

/** A coverage period [start, end) in UTC ms, or null when missing, unparseable or empty. */
function resolvePeriod(period: { start: string | number; end: string | number } | undefined): { start: number; end: number } | null {
  if (!period) return null;
  const toMs = (value: string | number) => (typeof value === 'number' ? value : Date.parse(value));
  const start = toMs(period.start);
  const end = toMs(period.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/**
 * The instants [start, end) the bins cover: a known period, widened to the whole UTC day
 * of any event outside it; else the whole UTC days from the first to the last event.
 * Coverage against a period is exact, in fractional days: counted in whole days, a
 * period starting at noon credited its first bin with half a day it never observed and
 * scaled that bin's count some 25% low.
 */
function coverageWindow(first: number, last: number, period: { start: number; end: number } | null): { start: number; end: number } {
  const dayStart = (ms: number) => Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
  if (!period) return { start: dayStart(first), end: dayStart(last) + MS_PER_DAY };
  return {
    start: first < period.start ? dayStart(first) : period.start,
    end: last >= period.end ? dayStart(last) + MS_PER_DAY : period.end,
  };
}

/**
 * The calendar bins (UTC) spanning days firstDay..lastDay: every day, every ISO week
 * (Monday to Sunday), or every month touching the span, empty ones included, with
 * the bin each day falls in.
 */
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

/**
 * Seismicity-rate and cumulative-release time series (paper, sec:viz and temporal
 * pattern analysis).
 *
 * Rate: events at or above a magnitude threshold, counted in UTC calendar bins (days,
 * ISO weeks or months; 'auto' is daily for a span of up to 365 days and weekly beyond,
 * the rule analyzeTemporalPattern uses). The threshold is the caller's explicit
 * cut-off, else the Mc estimated from these events as estimateCompletenessMagnitude
 * would; with fewer than 50 events Mc cannot be estimated and every event is counted
 * (`note` says so). The bins cover the UTC days of `options.period`, the period the
 * catalogue is known to cover, widened to any event outside it, or else of the events
 * themselves; empty bins are included, and a first or last bin the span only partly
 * covers carries `coveredDays`. Only against a known period is that a coverage a
 * partial count can be scaled by (`coverage` says which).
 *
 * Release: on the same bins, the seismic moment M0 = 10^(1.5 Mw + 9.1) N m and the
 * radiated energy log10 E = 1.5 M + 4.8 (E in J; Gutenberg & Richter, 1956, which for
 * Mw equals Kanamori's, 1977, E = M0 / 2e4) of every event the moment tab sums, under
 * the same eligibility rule (momentEligibility), whatever its magnitude.
 */
export function analyzeSeismicityTimeSeries(
  events: EarthquakeEvent[],
  options: SeismicityTimeSeriesOptions = {}
): SeismicityTimeSeriesResult {
  const requestedInterval = options.interval ?? 'auto';
  if (!RATE_INTERVAL_OPTIONS.includes(requestedInterval)) {
    throw new Error(`Unknown rate interval "${String(requestedInterval)}" (expected auto, day, week or month)`);
  }
  const mcOptions = resolveMcOptions({ method: options.mcMethod, maxcCorrection: options.maxcCorrection });
  if (events.length === 0) {
    throw new Error('No events provided for time-series analysis');
  }

  // Parse every origin time once.
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
    throw new Error('No events with a valid origin time for time-series analysis');
  }
  // A known coverage period (widened to any event outside it) sets the span; without
  // one the span runs over the whole days from the first to the last event.
  const period = resolvePeriod(options.period);
  const cover = coverageWindow(first, last, period);
  const interval: RateInterval = requestedInterval !== 'auto' ? requestedInterval
    : Math.max((period ? cover.end - cover.start : last - first) / MS_PER_DAY, 1) > 365 ? 'week' : 'day';

  // The magnitude threshold of the rate series.
  let threshold: number | null = null;
  let thresholdSource: 'cutoff' | 'mc' | 'none';
  let mcDetails: Pick<SeismicityTimeSeriesResult['rate'], 'mcMethod' | 'requestedMcMethod' | 'maxcCorrection' | 'gftLevel'> = {};
  let note: string | undefined;
  if (options.minMagnitude != null) {
    threshold = options.minMagnitude;
    thresholdSource = 'cutoff';
  } else if (events.length >= MIN_EVENTS_FOR_MC) {
    const completeness = estimateCompletenessMagnitude(
      events, options.binWidth ?? 0.1, mcOptions.maxcCorrection, { method: mcOptions.method }
    );
    threshold = completeness.mc;
    thresholdSource = 'mc';
    mcDetails = {
      mcMethod: completeness.method as McMethod,
      requestedMcMethod: completeness.requestedMethod,
      maxcCorrection: completeness.maxcCorrection,
      ...(completeness.requestedMethod === 'GFT' && { gftLevel: completeness.gftLevel ?? null }),
    };
  } else {
    thresholdSource = 'none';
    note = `Mc needs at least ${MIN_EVENTS_FOR_MC} events to estimate and ${events.length} were analysed, so every event is counted`;
  }

  const firstDay = utcDayIndex(cover.start);
  const lastDay = utcDayIndex(cover.end - 1);
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
    if (threshold == null || magnitudeAtOrAbove(event.magnitude, threshold)) {
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

  const rateBins: RateBin[] = [];
  const releaseBins: ReleaseBin[] = [];
  let cumulativeMoment = 0;
  let cumulativeEnergy = 0;
  for (let b = 0; b < nBins; b++) {
    const date = utcDayString(starts[b]);
    const covered = (Math.min((starts[b] + lengths[b]) * MS_PER_DAY, cover.end) -
      Math.max(starts[b] * MS_PER_DAY, cover.start)) / MS_PER_DAY;
    const coveredDays = Math.round(covered * 1e6) / 1e6; // exact days; microsecond noise dropped
    rateBins.push({
      date,
      count: counts[b],
      days: lengths[b],
      ...(coveredDays < lengths[b] && { coveredDays }),
    });
    cumulativeMoment += moments[b];
    cumulativeEnergy += energies[b];
    releaseBins.push({ date, days: lengths[b], moment: moments[b], energy: energies[b], cumulativeMoment, cumulativeEnergy });
  }

  return {
    interval,
    requestedInterval,
    startDate: utcDayString(firstDay),
    endDate: utcDayString(lastDay),
    coverage: period ? 'period' : 'events',
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

/**
 * Performance Optimization: Memoized versions of expensive calculations
 */

/**
 * Cache key over the event CONTENT the analyses read (id, time, magnitude, position),
 * not just the ids: an edited magnitude or a re-imported catalogue keeping its ids
 * must not be answered from the old result. Order-independent.
 */
function eventsContentKey(events: EarthquakeEvent[]): string {
  return eventsContentHash(events);
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

/**
 * Memoized Gutenberg-Richter calculation
 * Cache: 50 results, 10 minute TTL
 */
export const calculateGutenbergRichterMemoized = memoize(
  calculateGutenbergRichter,
  {
    maxSize: 50,
    ttl: 10 * 60 * 1000, // 10 minutes
    keyGenerator: (
      events: EarthquakeEvent[],
      minMagnitude: number | undefined,
      binWidth: number | undefined,
      mcOptions?: McEstimationOptions
    ) =>
      `gr_${eventsContentKey(events)}_${minMagnitude ?? 'none'}_${binWidth}_` +
      `${mcOptions?.method ?? 'MAXC'}_${mcOptions?.maxcCorrection ?? DEFAULT_MAXC_CORRECTION}`,
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
    keyGenerator: (
      events: EarthquakeEvent[],
      binWidth: number | undefined,
      correction: number | undefined,
      options?: { method?: McMethod }
    ) =>
      `comp_${eventsContentKey(events)}_${binWidth ?? 0.1}_${correction ?? DEFAULT_MAXC_CORRECTION}_${options?.method ?? 'MAXC'}`,
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
    keyGenerator: (events: EarthquakeEvent[], method?: DeclusterMethod) =>
      `temporal_${method ?? 'gardner-knopoff'}_${eventsContentKey(events)}`,
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
    keyGenerator: (events: EarthquakeEvent[]) => `moment_${eventsContentKey(events)}`,
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
