/**
 * Pure helpers for the merge quality-control (QC) views: the QC preview list
 * (MergePreviewQC, DuplicateGroupCard, KeptApartCard) and the summary
 * (MergeQcSummaryView). No React, no DOM, so every rule here is unit-testable.
 *
 * Wording follows catalogue-comparison usage: an "entry" (or "solution") is one catalogue's
 * record of an event; a "matched group" is the entries the merge treats as one event; the
 * "published" solution is the one the merged catalogue carries. Differences in the summary
 * are "second minus first" in source-catalogue order (lib/merge-qc.ts).
 */
import type {
  DifferenceStats, MergeQcSummary, QcListedGroup, QcPreviewEntry, QcPreviewGroup,
} from '@/lib/merge-qc';
import { qcListedGroupsCsv } from '@/lib/merge-qc';
import { calculateDistance } from '@/lib/earthquake-utils';
import { formatCount, formatMagnitudeType } from '@/lib/map-format';

export const MINUS = '−';

/**
 * A preview group as the QC list reads it. The fields the QC contract added are optional so
 * a preview from a server that predates them still renders (spread is then measured here).
 */
export type PreviewEntry = QcPreviewEntry;
export type PreviewGroup =
  Pick<QcPreviewGroup, 'id' | 'events' | 'selectedEventIndex' | 'isSuspicious' | 'validationWarnings'>
  & Partial<Pick<QcPreviewGroup,
    'separated' | 'heldForReview' | 'supersededEventIndexes' | 'computedEpicentre' | 'splitKey' | 'discrepancy' | 'spread'>>;

export type GroupSpread = QcPreviewGroup['spread'];

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// ── Numbers and words ──────────────────────────────────────────────────────────────────

/** "entry" / "entries" by count. */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** "1,890 pairs", "1 pair": fixed en-US grouping, as the map chrome uses. */
export function countOf(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${plural(count, one, many)}`;
}

/** "+0.15", "−0.20", "0.00": an explicit sign (true minus) for signed differences. */
export function formatSigned(value: number, digits: number): string {
  if (!isNum(value)) return '–';
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return (0).toFixed(digits);
  return `${value > 0 ? '+' : MINUS}${text}`;
}

/** "64.2 %"; "–" when the whole is zero. */
export function formatPercent(part: number, whole: number, digits = 1): string {
  if (!isNum(part) || !isNum(whole) || whole <= 0) return '–';
  return `${((100 * part) / whole).toFixed(digits)} %`;
}

// ── Preview groups ─────────────────────────────────────────────────────────────────────

/** True for a group that came out of a failed cluster: published as separate events. */
export function isKeptApart(group: PreviewGroup): boolean {
  return (group.splitKey !== undefined && group.splitKey !== null) || group.separated === true;
}

/** A matched group that failed a consistency check, or is held for review. */
export function isFlagged(group: PreviewGroup): boolean {
  return !isKeptApart(group) && (group.isSuspicious || group.heldForReview === true);
}

/** A matched group (two or more entries) that passed every check. */
export function isCleanMatch(group: PreviewGroup): boolean {
  return !isKeptApart(group) && !isFlagged(group) && group.events.length > 1;
}

/** The published entry; null for an averaged / median group or an empty one. */
export function publishedEntry(group: PreviewGroup): PreviewEntry | null {
  return group.events[group.selectedEventIndex] ?? null;
}

/** Where the published solution is: the published entry, else the computed epicentre. */
export function publishedSolution(group: PreviewGroup): { latitude: number; longitude: number; time: string; computed: boolean } | null {
  const entry = publishedEntry(group);
  if (entry) return { latitude: entry.latitude, longitude: entry.longitude, time: entry.time, computed: false };
  const epicentre = group.computedEpicentre;
  if (epicentre && isNum(epicentre.latitude) && isNum(epicentre.longitude)) return { ...epicentre, computed: true };
  return null;
}

/** Origin time used to sort a group: the published solution's, else its earliest entry's. */
export function groupOriginEpoch(group: PreviewGroup): number {
  const solution = publishedSolution(group);
  const published = solution ? Date.parse(solution.time) : NaN;
  if (Number.isFinite(published)) return published;
  let earliest = Infinity;
  for (const entry of group.events) {
    const epoch = Date.parse(entry.time);
    if (Number.isFinite(epoch) && epoch < earliest) earliest = epoch;
  }
  return earliest;
}

/** The server's discrepancy (units of the matching window); 0 when it is absent. */
export function groupDiscrepancy(group: PreviewGroup): number {
  return isNum(group.discrepancy) ? group.discrepancy : 0;
}

/**
 * Largest disagreement of any entry from the published solution: the server's spread, or
 * (older server) measured here the same way, superseded entries left out. Null for a single
 * entry, which has nothing to disagree with.
 */
export function groupSpread(group: PreviewGroup): GroupSpread | null {
  if (group.events.length < 2) return null;
  const spread = group.spread;
  if (spread && isNum(spread.timeS) && isNum(spread.distanceKm)) return spread;

  const reference = publishedSolution(group);
  if (!reference) return null;
  const published = publishedEntry(group);
  const superseded = new Set(group.supersededEventIndexes ?? []);
  const referenceEpoch = Date.parse(reference.time);
  let timeS = 0;
  let distanceKm = 0;
  let depthKm: number | null = null;
  let magnitude: number | null = null;
  group.events.forEach((entry, index) => {
    if (superseded.has(index) || index === group.selectedEventIndex) return;
    const seconds = Math.abs(Date.parse(entry.time) - referenceEpoch) / 1000;
    if (Number.isFinite(seconds)) timeS = Math.max(timeS, seconds);
    distanceKm = Math.max(distanceKm, calculateDistance(reference.latitude, reference.longitude, entry.latitude, entry.longitude));
    if (published && isNum(published.depth) && isNum(entry.depth)) {
      depthKm = Math.max(depthKm ?? 0, Math.abs(entry.depth - published.depth));
    }
    if (published && isNum(published.magnitude) && isNum(entry.magnitude)) {
      magnitude = Math.max(magnitude ?? 0, Math.abs(entry.magnitude - published.magnitude));
    }
  });
  return { timeS, distanceKm, depthKm, magnitude };
}

/** "Δt 1.4 s", "Δd 3.2 km", "Δz 2.0 km", "ΔM 0.20": the parts of a spread that are known. */
export function spreadParts(spread: GroupSpread): string[] {
  const parts = [`Δt ${spread.timeS.toFixed(1)} s`, `Δd ${spread.distanceKm.toFixed(1)} km`];
  if (isNum(spread.depthKm)) parts.push(`Δz ${spread.depthKm.toFixed(1)} km`);
  if (isNum(spread.magnitude)) parts.push(`ΔM ${spread.magnitude.toFixed(2)}`);
  return parts;
}

/** Catalogue ids with an entry in the group. */
export function groupCatalogueIds(group: PreviewGroup): string[] {
  const ids: string[] = [];
  for (const entry of group.events) if (!ids.includes(entry.catalogueId)) ids.push(entry.catalogueId);
  return ids;
}

// ── Kept-apart (split) clusters ────────────────────────────────────────────────────────

/** The groups one failed cluster was split into, published as separate events. */
export interface SplitUnit {
  key: string;
  groups: Array<{ group: PreviewGroup; index: number }>;
}

/**
 * Gathers kept-apart groups by splitKey, in order of first appearance. A group without a
 * splitKey (older server) is a unit of its own.
 */
export function splitUnits(groups: ReadonlyArray<{ group: PreviewGroup; index: number }>): SplitUnit[] {
  const units: SplitUnit[] = [];
  const byKey = new Map<string, SplitUnit>();
  for (const item of groups) {
    const key = item.group.splitKey ?? `group:${item.group.id}`;
    let unit = byKey.get(key);
    if (!unit) {
      unit = { key, groups: [] };
      byKey.set(key, unit);
      units.push(unit);
    }
    unit.groups.push(item);
  }
  return units;
}

const REASON_PREFIX = /\bReason:\s*(.+)$/i;

/**
 * Why a cluster was split: the reason each warning names ("Large magnitude range"), else the
 * whole warning, without repeats.
 */
export function splitReasons(unit: SplitUnit): string[] {
  const reasons: string[] = [];
  for (const { group } of unit.groups) {
    for (const warning of group.validationWarnings) {
      const match = REASON_PREFIX.exec(warning);
      for (const part of (match ? match[1] : warning).split(/;\s*/)) {
        const reason = part.trim().replace(/\.$/, '');
        if (reason && !reasons.includes(reason)) reasons.push(reason);
      }
    }
  }
  return reasons;
}

/** Entries in a unit (superseded vintages included: they are listed for provenance). */
export function unitEntryCount(unit: SplitUnit): number {
  return unit.groups.reduce((total, { group }) => total + group.events.length, 0);
}

export function unitDiscrepancy(unit: SplitUnit): number {
  return unit.groups.reduce((largest, { group }) => Math.max(largest, groupDiscrepancy(group)), 0);
}

export function unitOriginEpoch(unit: SplitUnit): number {
  return unit.groups.reduce((earliest, { group }) => Math.min(earliest, groupOriginEpoch(group)), Infinity);
}

/**
 * How far apart the published solutions of a split are: the largest origin-time, epicentral
 * and magnitude difference between any two of them. Null with fewer than two solutions.
 */
export function unitSeparation(unit: SplitUnit): { timeS: number; distanceKm: number; magnitude: number | null } | null {
  const solutions = unit.groups
    .map(({ group }) => ({ solution: publishedSolution(group), entry: publishedEntry(group) }))
    .filter((item): item is { solution: NonNullable<ReturnType<typeof publishedSolution>>; entry: PreviewEntry | null } => item.solution !== null);
  if (solutions.length < 2) return null;
  let timeS = 0;
  let distanceKm = 0;
  let magnitude: number | null = null;
  for (let i = 0; i < solutions.length; i++) {
    for (let j = i + 1; j < solutions.length; j++) {
      const a = solutions[i];
      const b = solutions[j];
      const seconds = Math.abs(Date.parse(a.solution.time) - Date.parse(b.solution.time)) / 1000;
      if (Number.isFinite(seconds)) timeS = Math.max(timeS, seconds);
      distanceKm = Math.max(distanceKm, calculateDistance(a.solution.latitude, a.solution.longitude, b.solution.latitude, b.solution.longitude));
      if (a.entry && b.entry && isNum(a.entry.magnitude) && isNum(b.entry.magnitude)) {
        magnitude = Math.max(magnitude ?? 0, Math.abs(a.entry.magnitude - b.entry.magnitude));
      }
    }
  }
  return { timeS, distanceKm, magnitude };
}

// ── Why the published solution won ─────────────────────────────────────────────────────

/** Display names of the merge strategies (as the merge page's strategy select labels them). */
export const STRATEGY_LABELS: Record<string, string> = {
  quality: 'Quality-Based',
  priority: 'Source Priority',
  average: 'Average Values',
  newest: 'Most Recent Solution',
  complete: 'Most Complete Record',
  median: 'Median Values',
};

const STRATEGY_REASONS: Record<string, string> = {
  newest: 'most recently computed solution',
  complete: 'most complete record (most populated fields)',
};

const PRIORITY_REASONS: Record<string, string> = {
  newest: 'most recently computed solution',
  geonet: 'GeoNet preferred, then network authority',
  gns: 'GeoNet preferred, then network authority',
  custom: 'ranked highest in your source order',
};

function qualityScore(entry: PreviewEntry): number | null {
  return isNum(entry.quality_score) ? entry.quality_score : null;
}

/**
 * The quality strategy compares only the metrics every entry reports, so the stored Q does
 * not always decide; the sentence claims "highest quality score" only when it is true.
 */
function qualityReason(group: PreviewGroup, published: PreviewEntry): string {
  const superseded = new Set(group.supersededEventIndexes ?? []);
  const own = qualityScore(published);
  const others = group.events
    .filter((_, index) => index !== group.selectedEventIndex && !superseded.has(index))
    .map(qualityScore)
    .filter(isNum);
  if (own === null) return 'best-constrained solution';
  if (others.length === 0) return `best-constrained solution (Q ${Math.round(own)})`;
  const runnerUp = Math.max(...others);
  if (Math.round(own) > Math.round(runnerUp)) {
    return `highest quality score (Q ${Math.round(own)} vs ${Math.round(runnerUp)})`;
  }
  return 'best-constrained on the quality metrics every entry reports';
}

/**
 * One line saying which solution is published and why, e.g.
 * "Published: Synthetic Agency B catalogue · highest quality score (Q 82 vs 64)".
 * A held group's solution is provisional until a reviewer decides.
 */
export function selectionReason(group: PreviewGroup, strategy?: string, priority?: string): string | null {
  const lead = group.heldForReview ? 'Provisionally published' : 'Published';
  const superseded = new Set(group.supersededEventIndexes ?? []);
  const active = group.events.filter((_, index) => !superseded.has(index)).length;
  const published = publishedEntry(group);

  if (!published) {
    if (!group.computedEpicentre && strategy !== 'average' && strategy !== 'median') return null;
    return strategy === 'median'
      ? `${lead}: median epicentre and origin time of ${active} entries (no single entry's solution)`
      : `${lead}: mean epicentre of ${active} entries (no single entry's solution)`;
  }
  if (group.events.length === 1) return `${lead}: ${published.catalogueName} · its only entry`;

  let reason: string | null = null;
  if (strategy === 'quality' || (strategy === 'priority' && priority === 'quality')) {
    reason = qualityReason(group, published);
  } else if (strategy === 'priority') {
    reason = PRIORITY_REASONS[priority ?? ''] ?? 'highest-ranked source';
  } else if (strategy) {
    reason = STRATEGY_REASONS[strategy] ?? null;
  }
  return reason ? `${lead}: ${published.catalogueName} · ${reason}` : `${lead}: ${published.catalogueName}`;
}

// ── Summary notes ──────────────────────────────────────────────────────────────────────

/** A median magnitude difference at least this large... */
export const OFFSET_NOTE_MIN_MEDIAN = 0.1;
/** ...over at least this many pairs is reported as a likely systematic offset. */
export const OFFSET_NOTE_MIN_PAIRS = 30;
/** Above this share of pairs near a window edge, the merge is called threshold-sensitive. */
export const WINDOW_SENSITIVE_FRACTION = 0.05;

function isOffset(stats: DifferenceStats | null | undefined): stats is DifferenceStats {
  return !!stats && isNum(stats.median) && isNum(stats.n)
    && stats.n >= OFFSET_NOTE_MIN_PAIRS && Math.abs(stats.median) >= OFFSET_NOTE_MIN_MEDIAN - 1e-9;
}

function offsetSentence(nameB: string, typeB: string, nameA: string, typeA: string, stats: DifferenceStats): string {
  const size = Math.abs(stats.median).toFixed(2);
  const direction = stats.median > 0 ? 'higher' : 'lower';
  const pairs = `median of ${countOf(stats.n, 'pair', 'pairs')}`;
  if (typeA && typeB) return `${nameB} ${typeB} is ${size} ${direction} than ${nameA} ${typeA} (${pairs})`;
  return `${nameB} magnitudes are ${size} ${direction} than ${nameA} magnitudes (${pairs}, all magnitude types)`;
}

/**
 * Plain-language notes for likely systematic magnitude offsets: |median ΔM| ≥ 0.1 over at
 * least 30 pairs, by magnitude-type pair where the summary has them, else over all types.
 * Differences are B minus A, so a positive median means B reads higher.
 */
export function magnitudeOffsetNotes(summary: Pick<MergeQcSummary, 'pairwise'>): string[] {
  const notes: string[] = [];
  for (const pair of summary.pairwise ?? []) {
    const nameA = pair.catalogueA.name;
    const nameB = pair.catalogueB.name;
    const byType = (pair.magnitudeByType ?? []).filter(item => isOffset(item.stats));
    if ((pair.magnitudeByType ?? []).length > 0) {
      for (const item of byType) {
        notes.push(offsetSentence(nameB, formatMagnitudeType(item.typeB), nameA, formatMagnitudeType(item.typeA), item.stats));
      }
    } else if (isOffset(pair.magnitude)) {
      notes.push(offsetSentence(nameB, '', nameA, '', pair.magnitude));
    }
  }
  return notes;
}

/**
 * How close the matched pairs came to the edges of the matching windows, one sentence per
 * window, e.g. "120 of 1,890 matched pairs used more than 80 % of the time window; a window
 * 20 % smaller would leave them unmatched".
 */
export function windowUseNotes(windowUse: MergeQcSummary['windowUse'] | null | undefined): string[] {
  if (!windowUse || !isNum(windowUse.matchedPairs) || windowUse.matchedPairs <= 0) return [];
  const total = windowUse.matchedPairs;
  const sentence = (count: number, window: string): string => {
    const base = `${formatCount(count)} of ${countOf(total, 'matched pair', 'matched pairs')} used more than 80 % of the ${window} window`;
    return count / total >= WINDOW_SENSITIVE_FRACTION ? `${base}; a window 20 % smaller would leave them unmatched` : base;
  };
  const near = [windowUse.nearTimeLimit, windowUse.nearDistanceLimit].map(n => (isNum(n) ? n : 0));
  if (near[0] === 0 && near[1] === 0) {
    return [`None of the ${countOf(total, 'matched pair', 'matched pairs')} used more than 80 % of the time or distance window.`];
  }
  return [sentence(near[0], 'time'), sentence(near[1], 'distance')];
}

/** The merge settings a summary records, as one line ("Time window 60 s · Distance window 10 km · ..."). */
export function describeQcConfig(config: Record<string, unknown> | null | undefined): string | null {
  if (!config) return null;
  const parts: string[] = [];
  if (isNum(config.timeThreshold)) parts.push(`Time window ${config.timeThreshold} s`);
  if (isNum(config.distanceThreshold)) parts.push(`Distance window ${config.distanceThreshold} km`);
  if (typeof config.mergeStrategy === 'string') {
    parts.push(`Strategy ${STRATEGY_LABELS[config.mergeStrategy] ?? config.mergeStrategy}`);
  }
  if (config.onConflict === 'hold') parts.push('Flagged groups held for review');
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Loose shape check of a stored or returned summary, so a malformed body is not rendered. */
export function isMergeQcSummary(value: unknown): value is MergeQcSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<MergeQcSummary>;
  return !!summary.totals && typeof summary.totals === 'object'
    && Array.isArray(summary.perCatalogue)
    && Array.isArray(summary.pairwise)
    && Array.isArray(summary.listedGroups);
}

// ── CSV of the listed groups ───────────────────────────────────────────────────────────

/**
 * The flagged, kept-apart and held groups of a summary as CSV, one row per entry: exactly
 * the file GET /api/catalogues/[id]/merge-qc?format=csv serves (the same builder), for a
 * preview or an export-only merge, which have no saved catalogue to ask.
 */
export function listedGroupsCsv(groups: ReadonlyArray<QcListedGroup>): string {
  return qcListedGroupsCsv({ listedGroups: groups.slice() });
}
