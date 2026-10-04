/**
 * Merge quality control (QC): the summary a merge produces, shown in the QC preview, kept
 * with the merged catalogue, and offered for download.
 *
 * The summary describes the whole merge, not only the groups the preview lists:
 * - totals: entries in, events out, matched groups, entries combined, flagged groups;
 * - per catalogue: how many of its entries were matched, how many appear only in it, and
 *   how often its solution was the published one;
 * - per catalogue pair: how the matched solutions differ (origin time, epicentre, depth,
 *   magnitude, overall and by magnitude-type pair), the usual catalogue-comparison
 *   statistics; a systematic magnitude offset between two agencies shows here;
 * - window use: matched pairs close to the edge of the matching window, a measure of how
 *   sensitive the merge is to the thresholds;
 * - the flagged, kept-apart and held groups with their reasons (capped, with the total).
 *
 * Differences are "second minus first" in source-catalogue order. Robust statistics are
 * used throughout (median, 1.4826 x MAD, 5th/95th percentiles) because a few mismatched
 * pairs must not dominate the picture.
 */

import { calculateDistance } from './earthquake-utils';
import { csvRow } from './export-utils';

/** Distribution of a signed difference (second catalogue minus first). */
export interface DifferenceStats {
  n: number;
  median: number;
  /** 1.4826 x median absolute deviation: the standard deviation for Gaussian data. */
  robustSigma: number;
  p05: number;
  p95: number;
}

/** Distribution of a non-negative separation (for example epicentral distance, km). */
export interface SeparationStats {
  n: number;
  median: number;
  p90: number;
  p95: number;
  max: number;
}

export interface QcCatalogueRef {
  id: string;
  name: string;
}

export interface QcCatalogueStats extends QcCatalogueRef {
  /** Entries the catalogue contributed. */
  entries: number;
  /** Entries matched with at least one entry of another catalogue. */
  matched: number;
  /** Entries published on their own: not matched (kept-apart entries included). */
  unique: number;
  /** Matched groups whose published solution is this catalogue's entry. */
  published: number;
  /** Older vintages of one agency's solution, kept as provenance only. */
  superseded: number;
}

export interface QcMagnitudeTypeComparison {
  /** Magnitude type of the first catalogue's entry, e.g. "ML". */
  typeA: string;
  typeB: string;
  stats: DifferenceStats;
}

export interface QcPairComparison {
  catalogueA: QcCatalogueRef;
  catalogueB: QcCatalogueRef;
  /** Matched pairs between the two catalogues (superseded entries excluded). */
  pairs: number;
  /** Origin time, seconds, B minus A. */
  originTime: DifferenceStats | null;
  /** Epicentral separation, km. */
  epicentre: SeparationStats | null;
  /** Depth, km, B minus A, only where both depths were computed (not fixed). */
  depth: DifferenceStats | null;
  /** Magnitude, B minus A, all type pairs together. */
  magnitude: DifferenceStats | null;
  /** By magnitude-type pair, pairs with at least QC_MIN_TYPE_PAIRS members, largest first. */
  magnitudeByType: QcMagnitudeTypeComparison[];
}

export type QcGroupKind = 'flagged' | 'kept-apart' | 'held';

/** One entry of a listed group, as the downloads and the catalogue page show it. */
export interface QcListedEntry {
  catalogueId: string;
  catalogueName: string;
  sourceId: string | null;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number | null;
  magnitudeType: string | null;
  qualityScore: number | null;
}

export interface QcListedGroup {
  /** Preview group id; for a saved merge, the merged event id where there is one. */
  id: string;
  kinds: QcGroupKind[];
  reasons: string[];
  /** Index into entries of the published solution; -1 when the epicentre is computed. */
  publishedIndex: number;
  /** Shared by the groups one failed cluster was split into (see QcPreviewGroup.splitKey). */
  splitKey: string | null;
  entries: QcListedEntry[];
}

export interface MergeQcSummary {
  version: 1;
  /** ISO 8601 UTC. */
  generatedAt: string;
  /** "Earthquake Catalogue Platform <package version>". */
  generatedBy: string;
  /** The merge settings, as stored in the catalogue's merge_config. */
  config: Record<string, unknown>;
  sourceCatalogues: QcCatalogueRef[];
  totals: {
    entriesBefore: number;
    eventsAfter: number;
    /** Groups of two or more entries. */
    matchedGroups: number;
    /** entriesBefore - eventsAfter: entries combined into another event (kept as provenance). */
    entriesCombined: number;
    flaggedGroups: number;
    keptApartEntries: number;
    /** Failed clusters split into separately published events. */
    splits: number;
    heldForReview: number;
    supersededEntries: number;
  };
  perCatalogue: QcCatalogueStats[];
  pairwise: QcPairComparison[];
  windowUse: {
    /** Matched pairs whose origin-time difference exceeds 80 % of their (adaptive) time window. */
    nearTimeLimit: number;
    /** Matched pairs whose epicentral separation exceeds 80 % of their (adaptive) distance window. */
    nearDistanceLimit: number;
    matchedPairs: number;
  };
  /** Flagged, kept-apart and held groups, most severe first, at most QC_MAX_LISTED_GROUPS. */
  listedGroups: QcListedGroup[];
  /** How many groups qualified for listedGroups before the cap. */
  listedGroupsTotal: number;
}

/** Fewest pairs for a magnitude-type comparison to be reported. */
export const QC_MIN_TYPE_PAIRS = 10;
/** Most groups kept in MergeQcSummary.listedGroups. */
export const QC_MAX_LISTED_GROUPS = 5000;
/** Fraction of the matching window beyond which a pair counts as near the limit. */
export const QC_NEAR_LIMIT_FRACTION = 0.8;

// ── Preview payload (POST /api/merge/preview) ─────────────────────────────────────────

/** One entry of a preview group. */
export interface QcPreviewEntry {
  id?: string;
  source_id?: string | null;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  depth_type?: string | null;
  depth_uncertainty?: number | null;
  magnitude: number;
  magnitude_type?: string | null;
  magnitude_uncertainty?: number | null;
  used_station_count?: number | null;
  azimuthal_gap?: number | null;
  standard_error?: number | null;
  /** The stored quality score Q (0-100), when the entry has one. */
  quality_score?: number | null;
  source: string;
  catalogueId: string;
  catalogueName: string;
}

export interface QcPreviewGroup {
  id: string;
  events: QcPreviewEntry[];
  selectedEventIndex: number;
  isSuspicious: boolean;
  separated: boolean;
  heldForReview: boolean;
  validationWarnings: string[];
  supersededEventIndexes: number[];
  computedEpicentre?: { latitude: number; longitude: number; time: string } | null;
  /**
   * Shared by every group that came out of one failed cluster (the salvaged sub-groups and
   * the entries left on their own), so the QC can show a split as one unit; null otherwise.
   */
  splitKey: string | null;
  /**
   * Largest disagreement between an entry and the published solution (or the computed
   * epicentre), each in units of its matching window: max(|dt|/time window,
   * distance/distance window). 0 for a single entry. Used to rank groups.
   */
  discrepancy: number;
  /** Disagreements relative to the published solution (computed epicentre when averaged). */
  spread: {
    timeS: number;
    distanceKm: number;
    depthKm: number | null;
    magnitude: number | null;
  };
}

export interface MergePreviewPayload {
  /**
   * Every flagged, kept-apart and held group, plus the matched groups with the largest
   * discrepancy (at most QC_PREVIEW_MAX_MATCHED of them). Single entries that were never
   * matched are not listed; the counts below and `qc` cover everything.
   */
  duplicateGroups: QcPreviewGroup[];
  /** Matched groups listed in duplicateGroups, and how many there are in total. */
  matchedListed: number;
  matchedTotal: number;
  statistics: {
    totalEventsBefore: number;
    totalEventsAfter: number;
    duplicateGroupsCount: number;
    duplicatesRemoved: number;
    suspiciousGroupsCount: number;
    heldForReviewCount: number;
    supersededReportsCount: number;
    separatedReportsCount: number;
  };
  catalogueColors: Record<string, string>;
  qc: MergeQcSummary;
}

/** Most matched (non-flagged) groups the preview lists, largest discrepancy first. */
export const QC_PREVIEW_MAX_MATCHED = 2000;

/**
 * Upper bound on the serialised size of MergeQcSummary.listedGroups (UTF-16 code units of
 * its JSON, about bytes). A merge of many catalogues can list groups of many entries each;
 * the stored summary must stay well inside MongoDB's 16 MB document limit, or saving it
 * would roll the whole merge back. Groups past the budget are counted in
 * listedGroupsTotal but not listed, as for QC_MAX_LISTED_GROUPS.
 */
export const QC_MAX_LISTED_BYTES = 8_000_000;
/** Reasons kept per listed group, and characters per reason (the review_reasons bounds). */
export const QC_MAX_REASONS = 50;
export const QC_MAX_REASON_LENGTH = 500;

// ── Computation ───────────────────────────────────────────────────────────────────────

/** One entry of a group, as buildMergeQcSummary reads it. */
export interface QcEntryInput extends QcListedEntry {
  /** The depth was fixed (QuakeML depthType 'operator assigned'), not computed. */
  depthFixed: boolean;
  /** An older vintage of one agency's solution, kept as provenance only. */
  superseded: boolean;
}

/** One group of the merge (one output event), as buildMergeQcSummary reads it. */
export interface QcGroupInput {
  /** Preview group id, or the merged event id of a saved merge. */
  id: string;
  entries: QcEntryInput[];
  /** Index into entries of the published solution; -1 when the epicentre is computed. */
  publishedIndex: number;
  /** A matched group a reviewer should check (the preview's isSuspicious). */
  flagged: boolean;
  /** An entry kept apart from the group it matched (the preview's separated). */
  keptApart: boolean;
  /** Held for review by an onConflict 'hold' merge. */
  held: boolean;
  /** The preview's validationWarnings. */
  reasons: string[];
  splitKey: string | null;
  /** QcPreviewGroup.discrepancy; ranks listed groups of equal severity. */
  discrepancy: number;
}

/** A pair's adaptive matching windows: seconds and kilometres. */
export interface QcPairWindows {
  timeWindow: number;
  distanceWindow: number;
}

export interface MergeQcInput {
  /** The merge settings, as stored in the catalogue's merge_config. */
  config: Record<string, unknown>;
  /** In source order: pairwise differences are "second minus first" in this order. */
  sourceCatalogues: QcCatalogueRef[];
  /** Every group of the merge, single entries included, in output order. */
  groups: QcGroupInput[];
  /**
   * The matching windows the merge judged a pair by (the configured windows widened for
   * the pair's magnitude and depth). lib/merge.ts passes its own adaptive-window helper,
   * so window use is measured against exactly the windows the matcher used.
   */
  pairWindows: (a: QcEntryInput, b: QcEntryInput) => QcPairWindows;
  /**
   * Who wrote the summary, "Earthquake Catalogue Platform <version>" (lib/merge.ts
   * QC_GENERATED_BY). Passed in so this module, which the browser also loads for its CSV
   * builder, does not bundle package.json.
   */
  generatedBy: string;
  /** Defaults to now. */
  generatedAt?: Date;
}

/** Rounded to 1e-6 (microseconds, millimetres): removes binary noise, never information. */
function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Quantile p of an ascending list by linear interpolation between closest ranks
 * (Hyndman and Fan type 7, the default of numpy and R), so the median of an even count is
 * the mean of the two middle values.
 */
function quantileOfSorted(sorted: number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

const ascending = (a: number, b: number) => a - b;

/** Median, 1.4826 x MAD and 5th/95th percentiles of the finite values; null when there are none. */
export function differenceStats(values: number[]): DifferenceStats | null {
  const sorted = values.filter(Number.isFinite).sort(ascending);
  if (sorted.length === 0) return null;
  const median = quantileOfSorted(sorted, 0.5);
  const deviations = sorted.map(v => Math.abs(v - median)).sort(ascending);
  return {
    n: sorted.length,
    median: round6(median),
    robustSigma: round6(1.4826 * quantileOfSorted(deviations, 0.5)),
    p05: round6(quantileOfSorted(sorted, 0.05)),
    p95: round6(quantileOfSorted(sorted, 0.95)),
  };
}

/** Median, 90th and 95th percentiles and maximum of the finite values; null when there are none. */
export function separationStats(values: number[]): SeparationStats | null {
  const sorted = values.filter(Number.isFinite).sort(ascending);
  if (sorted.length === 0) return null;
  return {
    n: sorted.length,
    median: round6(quantileOfSorted(sorted, 0.5)),
    p90: round6(quantileOfSorted(sorted, 0.9)),
    p95: round6(quantileOfSorted(sorted, 0.95)),
    max: round6(sorted[sorted.length - 1]),
  };
}

/** An ISO 8601 UTC origin time; an unparseable value is kept as it is. */
function isoUtc(time: string): string {
  const ms = Date.parse(time);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : time;
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function listedEntry(entry: QcEntryInput): QcListedEntry {
  return {
    catalogueId: entry.catalogueId,
    catalogueName: entry.catalogueName,
    sourceId: entry.sourceId ?? null,
    time: isoUtc(entry.time),
    latitude: entry.latitude,
    longitude: entry.longitude,
    depth: finiteOrNull(entry.depth),
    magnitude: finiteOrNull(entry.magnitude),
    magnitudeType: entry.magnitudeType ?? null,
    qualityScore: finiteOrNull(entry.qualityScore),
  };
}

function groupKinds(group: QcGroupInput): QcGroupKind[] {
  const kinds: QcGroupKind[] = [];
  if (group.flagged) kinds.push('flagged');
  if (group.keptApart) kinds.push('kept-apart');
  if (group.held) kinds.push('held');
  return kinds;
}

/**
 * How severe a listed group is: a flagged merge (two earthquakes may have been combined
 * into one) ahead of an entry kept apart (one earthquake may be published twice).
 */
function severityTier(group: QcGroupInput): number {
  if (group.flagged) return 2;
  return group.keptApart || group.held ? 1 : 0;
}

interface PairAccumulator {
  originTime: number[];
  epicentre: number[];
  depth: number[];
  magnitude: number[];
  byType: Map<string, { typeA: string; typeB: string; values: number[] }>;
  pairs: number;
}

const newPairAccumulator = (): PairAccumulator => ({
  originTime: [], epicentre: [], depth: [], magnitude: [], byType: new Map(), pairs: 0,
});

const magnitudeTypeLabel = (type: string | null | undefined): string =>
  typeof type === 'string' && type.trim() !== '' ? type.trim() : 'unknown';

/**
 * The QC summary of one merge, from its grouping: every group the merge publishes (single
 * entries included) with the verdict the preview shows for it.
 *
 * Pure and deterministic for a given generatedAt: the result depends only on the input, in
 * the input's order. Linear in the number of entries, apart from sorting each statistic's
 * values; a group contributes one pair per two of its catalogues.
 *
 * - Matched pairs are the cross-catalogue pairs of a matched group's entries, superseded
 *   entries excluded (they take no part in the merge). A group of three catalogues gives
 *   three pairs. Each pair is oriented by source order: differences are B minus A with A
 *   the catalogue listed first.
 * - Depth differences use only pairs whose two depths were both computed, not fixed.
 * - Window use compares each pair with its own adaptive windows (input.pairWindows).
 * - Listed groups are the flagged, kept-apart and held ones. The groups one failed cluster
 *   was split into stay together as a unit; units are ordered most severe first (a
 *   flagged group in it, then the largest discrepancy, then output order).
 */
export function buildMergeQcSummary(input: MergeQcInput): MergeQcSummary {
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();

  // Catalogue order: the sources as given, then any catalogue an entry names that is not
  // among them (defensive: every entry should come from a listed source).
  const catalogues: QcCatalogueRef[] = [];
  const catalogueIndex = new Map<string, number>();
  for (const source of input.sourceCatalogues) {
    const id = String(source.id);
    if (catalogueIndex.has(id)) continue;
    catalogueIndex.set(id, catalogues.length);
    catalogues.push({ id, name: source.name });
  }
  const indexOfCatalogue = (entry: QcEntryInput): number => {
    let index = catalogueIndex.get(entry.catalogueId);
    if (index === undefined) {
      index = catalogues.length;
      catalogues.push({ id: entry.catalogueId, name: entry.catalogueName || entry.catalogueId });
      catalogueIndex.set(entry.catalogueId, index);
    }
    return index;
  };

  const perCatalogue = new Map<number, QcCatalogueStats>();
  const statsFor = (index: number): QcCatalogueStats => {
    let stats = perCatalogue.get(index);
    if (!stats) {
      stats = { ...catalogues[index], entries: 0, matched: 0, unique: 0, published: 0, superseded: 0 };
      perCatalogue.set(index, stats);
    }
    return stats;
  };

  const pairs = new Map<string, PairAccumulator>();
  let entriesBefore = 0;
  let matchedGroups = 0;
  let flaggedGroups = 0;
  let keptApartEntries = 0;
  let heldForReview = 0;
  let supersededEntries = 0;
  let nearTimeLimit = 0;
  let nearDistanceLimit = 0;
  let matchedPairs = 0;
  const splitKeys = new Set<string>();

  for (const group of input.groups) {
    const entries = group.entries;
    const matched = entries.length > 1;
    const indexes = entries.map(indexOfCatalogue);
    entriesBefore += entries.length;
    if (matched) matchedGroups++;
    if (group.flagged) flaggedGroups++;
    if (group.keptApart) keptApartEntries += entries.length;
    if (group.held) heldForReview++;
    if (group.splitKey) splitKeys.add(group.splitKey);

    entries.forEach((entry, i) => {
      const stats = statsFor(indexes[i]);
      stats.entries++;
      if (matched) stats.matched++;
      else stats.unique++;
      if (entry.superseded) {
        stats.superseded++;
        supersededEntries++;
      }
    });
    if (matched && group.publishedIndex >= 0 && group.publishedIndex < entries.length) {
      statsFor(indexes[group.publishedIndex]).published++;
    }
    if (!matched) continue;

    const times = entries.map(e => Date.parse(e.time));
    for (let p = 0; p < entries.length; p++) {
      if (entries[p].superseded) continue;
      for (let q = p + 1; q < entries.length; q++) {
        if (entries[q].superseded || indexes[p] === indexes[q]) continue;
        // Orient by source order: A is the catalogue listed first.
        const [ia, ib] = indexes[p] < indexes[q] ? [p, q] : [q, p];
        const a = entries[ia];
        const b = entries[ib];
        const key = `${indexes[ia]}|${indexes[ib]}`;
        let acc = pairs.get(key);
        if (!acc) {
          acc = newPairAccumulator();
          pairs.set(key, acc);
        }
        acc.pairs++;
        matchedPairs++;

        const dt = (times[ib] - times[ia]) / 1000;
        if (Number.isFinite(dt)) acc.originTime.push(dt);
        const distance = calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude);
        if (Number.isFinite(distance)) acc.epicentre.push(distance);
        const depthA = finiteOrNull(a.depth);
        const depthB = finiteOrNull(b.depth);
        if (depthA !== null && depthB !== null && !a.depthFixed && !b.depthFixed) acc.depth.push(depthB - depthA);
        const magA = finiteOrNull(a.magnitude);
        const magB = finiteOrNull(b.magnitude);
        if (magA !== null && magB !== null) {
          acc.magnitude.push(magB - magA);
          const typeA = magnitudeTypeLabel(a.magnitudeType);
          const typeB = magnitudeTypeLabel(b.magnitudeType);
          const typeKey = `${typeA}\u0000${typeB}`;
          let byType = acc.byType.get(typeKey);
          if (!byType) {
            byType = { typeA, typeB, values: [] };
            acc.byType.set(typeKey, byType);
          }
          byType.values.push(magB - magA);
        }

        const windows = input.pairWindows(a, b);
        if (Number.isFinite(dt) && Math.abs(dt) > QC_NEAR_LIMIT_FRACTION * windows.timeWindow) nearTimeLimit++;
        if (Number.isFinite(distance) && distance > QC_NEAR_LIMIT_FRACTION * windows.distanceWindow) nearDistanceLimit++;
      }
    }
  }

  // Every catalogue pair in source order, matched or not: "these two never matched" is a
  // finding too.
  const pairwise: QcPairComparison[] = [];
  for (let i = 0; i < catalogues.length; i++) {
    for (let j = i + 1; j < catalogues.length; j++) {
      const acc = pairs.get(`${i}|${j}`) ?? newPairAccumulator();
      const magnitudeByType: QcMagnitudeTypeComparison[] = Array.from(acc.byType.values())
        .filter(t => t.values.length >= QC_MIN_TYPE_PAIRS)
        .map(t => ({ typeA: t.typeA, typeB: t.typeB, stats: differenceStats(t.values)! }))
        .sort((x, y) =>
          y.stats.n - x.stats.n || x.typeA.localeCompare(y.typeA) || x.typeB.localeCompare(y.typeB)
        );
      pairwise.push({
        catalogueA: { ...catalogues[i] },
        catalogueB: { ...catalogues[j] },
        pairs: acc.pairs,
        originTime: differenceStats(acc.originTime),
        epicentre: separationStats(acc.epicentre),
        depth: differenceStats(acc.depth),
        magnitude: differenceStats(acc.magnitude),
        magnitudeByType,
      });
    }
  }

  const { listedGroups, listedGroupsTotal } = listGroups(input.groups);

  return {
    version: 1,
    generatedAt,
    generatedBy: input.generatedBy,
    config: input.config,
    sourceCatalogues: catalogues.map(c => ({ ...c })),
    totals: {
      entriesBefore,
      eventsAfter: input.groups.length,
      matchedGroups,
      entriesCombined: entriesBefore - input.groups.length,
      flaggedGroups,
      keptApartEntries,
      splits: splitKeys.size,
      heldForReview,
      supersededEntries,
    },
    perCatalogue: catalogues.map((_, i) => statsFor(i)),
    pairwise,
    windowUse: { nearTimeLimit, nearDistanceLimit, matchedPairs },
    listedGroups,
    listedGroupsTotal,
  };
}

/** The flagged, kept-apart and held groups, split units together, most severe first, capped. */
function listGroups(groups: QcGroupInput[]): { listedGroups: QcListedGroup[]; listedGroupsTotal: number } {
  interface Unit { members: QcGroupInput[]; tier: number; discrepancy: number; first: number }
  const units = new Map<string, Unit>();
  let listedGroupsTotal = 0;
  groups.forEach((group, index) => {
    const tier = severityTier(group);
    if (tier === 0) return;
    listedGroupsTotal++;
    const key = group.splitKey ? `split:${group.splitKey}` : `group:${index}`;
    const discrepancy = Number.isFinite(group.discrepancy) ? group.discrepancy : 0;
    const unit = units.get(key);
    if (unit) {
      unit.members.push(group);
      unit.tier = Math.max(unit.tier, tier);
      unit.discrepancy = Math.max(unit.discrepancy, discrepancy);
    } else {
      units.set(key, { members: [group], tier, discrepancy, first: index });
    }
  });

  const ordered = Array.from(units.values()).sort(
    (a, b) => b.tier - a.tier || b.discrepancy - a.discrepancy || a.first - b.first
  );

  const listedGroups: QcListedGroup[] = [];
  let size = 2; // the enclosing brackets
  outer: for (const unit of ordered) {
    for (const group of unit.members) {
      if (listedGroups.length >= QC_MAX_LISTED_GROUPS) break outer;
      const listed: QcListedGroup = {
        id: group.id,
        kinds: groupKinds(group),
        reasons: group.reasons
          .slice(0, QC_MAX_REASONS)
          .map(reason => (reason.length > QC_MAX_REASON_LENGTH ? `${reason.slice(0, QC_MAX_REASON_LENGTH - 1)}…` : reason)),
        publishedIndex: group.publishedIndex,
        splitKey: group.splitKey,
        entries: group.entries.map(listedEntry),
      };
      const added = JSON.stringify(listed).length + 1;
      if (size + added > QC_MAX_LISTED_BYTES) break outer;
      size += added;
      listedGroups.push(listed);
    }
  }
  return { listedGroups, listedGroupsTotal };
}

// ── CSV download ──────────────────────────────────────────────────────────────────────

/** Column headers of the listed-groups CSV (GET /api/catalogues/{id}/merge-qc?format=csv). */
export const QC_CSV_COLUMNS: ReadonlyArray<string> = [
  'Group ID',
  'Kinds',
  'Reasons',
  'Published',
  'Catalogue',
  'Source ID',
  'Origin time (UTC)',
  'Latitude',
  'Longitude',
  'Depth (km)',
  'Magnitude',
  'Magnitude type',
  'Quality score',
];

/**
 * The listed groups as CSV (RFC 4180, header row first, "\n" line ends): one row per
 * entry, so a group of three entries is three rows sharing its id, kinds and reasons.
 * "Published" says whether the entry's solution is the one published (never, when the
 * epicentre was computed). Kinds are joined with "; " and reasons with " | " (a reason can
 * itself contain semicolons). Text that a spreadsheet would run as a formula is
 * neutralised (csvField).
 */
export function qcListedGroupsCsv(summary: Pick<MergeQcSummary, 'listedGroups'>): string {
  const lines = [csvRow([...QC_CSV_COLUMNS])];
  for (const group of summary.listedGroups) {
    const kinds = group.kinds.join('; ');
    const reasons = group.reasons.join(' | ');
    group.entries.forEach((entry, index) => {
      lines.push(csvRow([
        group.id,
        kinds,
        reasons,
        index === group.publishedIndex ? 'yes' : 'no',
        entry.catalogueName,
        entry.sourceId,
        isoUtc(entry.time),
        entry.latitude,
        entry.longitude,
        entry.depth,
        entry.magnitude,
        entry.magnitudeType,
        entry.qualityScore,
      ]));
    });
  }
  return `${lines.join('\n')}\n`;
}
