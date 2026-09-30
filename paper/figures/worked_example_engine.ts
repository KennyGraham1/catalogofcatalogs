/**
 * The SRL worked example, computed by the platform's own engine.
 *
 * paper/figures/synthetic_catalogues.py builds the two synthetic catalogues (the INPUT of
 * the example). Everything the paper reports about them is computed here with the same
 * modules the platform runs, called exactly as the platform calls them:
 *
 *   - quality index Q (paper Eq. 1) of every imported event: eventQualityFields (lib/db.ts),
 *     the routine the database applies on insert;
 *   - duplicate association and conflict resolution: groupMatchingEvents + mergeEventGroup
 *     (lib/merge.ts), which is what mergeCatalogues runs (performMerge), with the
 *     Quality-based strategy; the merged row, and its Q, from buildMergedEventFields;
 *   - completeness magnitude, b-value and sigma_b: calculateGutenbergRichter
 *     (lib/seismological-analysis.ts), with Mc estimated by each of the platform's methods,
 *     named explicitly: b-value stability (MBS, its default), the goodness-of-fit test (GFT)
 *     and maximum curvature (MAXC) + 0.2; the analysis cut-off is the platform's MBS
 *     estimate for the merged catalogue (stabilityCutoff);
 *   - declustering: gardnerKnopoffDeclustering (lib/seismological-analysis.ts).
 *
 * The one computation the platform does NOT offer is the symmetric-window Gardner-Knopoff
 * variant, used only as a sensitivity check on the window convention; it is implemented
 * below (symmetricGardnerKnopoff) and labelled as such wherever it is reported.
 *
 * The generator's ground truth (which true earthquake each report describes, and whether
 * it is an injected aftershock) is passed alongside the catalogues and used ONLY for the
 * diagnostics (duplicate precision/recall, the background-only b), never by the pipeline.
 */
import { eventQualityFields } from '@/lib/db';
import { scoreQualityMetrics } from '@/lib/quality-scoring';
import {
  buildMergedEventFields,
  catalogueAgencyOf,
  eventsMatchAdaptive,
  getMergeConflictLog,
  groupMatchingEvents,
  mergeEventGroup,
  validateEventGroup,
} from '@/lib/merge';
import {
  calculateGutenbergRichter,
  gardnerKnopoffDeclustering,
  getGardnerKnopoffWindow,
  type EarthquakeEvent,
  type GutenbergRichterResult,
  type McMethod,
} from '@/lib/seismological-analysis';
import type { MergeConfig, SourceCatalogue } from '@/lib/validation';

/** One catalogue as the generator writes it: columns of equal length. */
export interface InputCatalogue {
  id: string;
  name: string;
  columns: Record<string, Array<number | string | boolean | null>>;
}

/** Ground truth for one catalogue's reports, index-aligned with its columns. */
export interface InputTruth {
  true_index: number[];
  is_aftershock: boolean[];
}

export interface WorkedExampleInput {
  /** Origin of the generator's time axis (ISO 8601 UTC); report times are day offsets. */
  t0: string;
  catalogues: InputCatalogue[];
  truth: Record<string, InputTruth>;
}

export interface WorkedExampleOptions {
  /** Baseline matching windows (s, km); the engine widens them with magnitude and depth. */
  timeThresholdSeconds: number;
  distanceThresholdKm: number;
  /** Quality threshold applied to the merged catalogue (keep Q >= minQuality). */
  minQuality: number;
  /**
   * Magnitude cut-off for the final b-value and declustering: a number; 'stability' for the
   * lowest cut-off at which the merged catalogue's b-value is stable (stabilityCutoff: the
   * platform's MBS estimate); or null for the platform's MAXC + 0.2 estimate on the
   * quality-filtered catalogue.
   */
  analysisCutoff: number | 'stability' | null;
}

export const DEFAULT_OPTIONS: WorkedExampleOptions = {
  timeThresholdSeconds: 60,
  distanceThresholdKm: 50,
  minQuality: 70,
  analysisCutoff: 'stability',
};

type Row = Record<string, unknown> & {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
};

/** Fields of a generated report that become columns of the stored row, in this order. */
const ROW_FIELDS = [
  'id', 'source_id', 'magnitude', 'magnitude_type', 'latitude', 'longitude', 'depth', 'depth_type',
  'horizontal_uncertainty', 'depth_uncertainty', 'time_uncertainty',
  'azimuthal_gap', 'used_station_count', 'used_phase_count', 'standard_error',
  'magnitude_uncertainty', 'magnitude_station_count',
  'evaluation_mode', 'evaluation_status', 'agency_id',
] as const;

/**
 * The optional columns executeMergeOperation passes to buildMergedEventFields
 * (OPTIONAL_DB_FIELDS in lib/merge.ts, a function-local constant there). Every field the
 * quality score reads is in it, so Q of the merged row is scored from the same columns the
 * platform stores.
 */
const MERGED_ROW_FIELDS: ReadonlyArray<string> = [
  'source_id', 'region', 'location_name',
  'event_public_id', 'event_type', 'event_type_certainty', 'source_event_type',
  'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
  'depth_uncertainty', 'horizontal_uncertainty',
  'min_horizontal_uncertainty', 'max_horizontal_uncertainty', 'azimuth_max_horizontal_uncertainty',
  'confidence_level',
  'depth_type', 'earth_model_id', 'method_id',
  'agency_id', 'author',
  'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count',
  'magnitude_method_id', 'magnitude_evaluation_mode', 'magnitude_evaluation_status',
  'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
  'minimum_distance', 'maximum_distance',
  'associated_phase_count', 'associated_station_count', 'depth_phase_count',
  'evaluation_mode', 'evaluation_status',
  'preferred_origin_id', 'preferred_magnitude_id', 'preferred_focal_mechanism_id',
  'origin_quality', 'origins', 'magnitudes', 'picks', 'arrivals',
  'focal_mechanisms', 'amplitudes', 'station_magnitudes',
  'event_descriptions', 'comments', 'creation_info',
];

const MS_PER_DAY = 86_400_000;

/** Stored rows of one generated catalogue, with Q computed as the database does on insert. */
export function catalogueRows(catalogue: InputCatalogue, t0: string): Row[] {
  const cols = catalogue.columns;
  const n = cols.id.length;
  const origin = new Date(t0).getTime();
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const row: Record<string, unknown> = {
      time: new Date(origin + Math.round((cols.t_days[i] as number) * MS_PER_DAY)).toISOString(),
    };
    for (const field of ROW_FIELDS) {
      const value = cols[field]?.[i];
      if (value !== null && value !== undefined) row[field] = value;
    }
    Object.assign(row, eventQualityFields(row));
    rows.push(row as Row);
  }
  return rows;
}

/** Median of a numeric list (average of the two middle values for an even count). */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const GRADES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'] as const;

export function gradeCounts(rows: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {};
  GRADES.forEach(g => { counts[g] = 0; });
  rows.forEach(r => { counts[String(r.quality_grade)] = (counts[String(r.quality_grade)] ?? 0) + 1; });
  return counts;
}

function asAnalysisEvent(row: Record<string, unknown>): EarthquakeEvent {
  return {
    id: String(row.id),
    time: String(row.time),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    depth: typeof row.depth === 'number' ? row.depth : 0,
    magnitude: Number(row.magnitude),
  } as EarthquakeEvent;
}

function grSummary(gr: GutenbergRichterResult) {
  return {
    b: gr.bValue,
    sigma_b: gr.bUncertainty,
    a: gr.aValue,
    mc: gr.completeness,
    n: gr.eventsAboveMc,
    magnitude_resolution: gr.magnitudeResolution,
    binning_correction: gr.binningCorrection,
  };
}

/** The platform's GFT Mc (with its MAXC fallback) and the b-value above it. */
function gftSummary(events: EarthquakeEvent[]) {
  const gr = calculateGutenbergRichter(events, undefined, 0.1, { method: 'GFT' });
  return { ...grSummary(gr), mc_source: gr.mcSource, gft_level: gr.gftLevel ?? null };
}

/** Gardner-Knopoff on a set of events; returns the ids of the events it keeps. */
function declusteredIds(events: EarthquakeEvent[]): Set<string> {
  const { mainshocks } = gardnerKnopoffDeclustering(events);
  return new Set(mainshocks.map(e => String(e.id)));
}

// ---------------------------------------------------------------------------
// Symmetric-window Gardner-Knopoff: NOT a platform option. Identical to
// gardnerKnopoffDeclustering (lib/seismological-analysis.ts) - heads visited in
// order of decreasing magnitude, each head reserved, the same L(M) and T(M) - except
// that the time window also reaches T(M) BEFORE each head, as in the common variant
// the paper compares against (section sec:decluster).
// ---------------------------------------------------------------------------
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

export function symmetricGardnerKnopoff(events: EarthquakeEvent[]): EarthquakeEvent[] {
  const byTime = events
    .map(event => ({ event, time: new Date(event.time).getTime() }))
    .sort((a, b) => a.time - b.time);
  const times = byTime.map(e => e.time);
  const assigned = new Set<string>();
  const dependent = new Set<string>();
  const heads = byTime.slice().sort((a, b) => b.event.magnitude - a.event.magnitude);
  const kmPerDegLat = (6371 * Math.PI) / 180;
  for (const { event: head, time: headTime } of heads) {
    const headId = String(head.id);
    if (assigned.has(headId)) continue;
    assigned.add(headId);
    if (!Number.isFinite(headTime)) continue;
    const { timeWindowDays, distanceWindowKm } = getGardnerKnopoffWindow(head.magnitude);
    const windowMs = timeWindowDays * MS_PER_DAY;
    for (let i = firstIndexAtOrAfter(times, headTime - windowMs); i < byTime.length; i++) {
      if (times[i] - headTime > windowMs) break;
      const other = byTime[i].event;
      const otherId = String(other.id);
      if (otherId === headId || assigned.has(otherId)) continue;
      if (Math.abs(other.latitude - head.latitude) * kmPerDegLat > distanceWindowKm + 1e-6) continue;
      if (haversineKm(head.latitude, head.longitude, other.latitude, other.longitude) <= distanceWindowKm) {
        assigned.add(otherId);
        dependent.add(otherId);
      }
    }
  }
  return byTime.map(e => e.event).filter(e => !dependent.has(String(e.id)));
}


// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------
type Provenance = 'first-only' | 'second-only' | 'duplicate-first' | 'duplicate-second';
type GrSummary = ReturnType<typeof grSummary>;

/** calculateGutenbergRichter with an explicit cut-off, or null when the platform withholds it. */
function grAt(events: EarthquakeEvent[], cutoff: number): GrSummary | null {
  try {
    return grSummary(calculateGutenbergRichter(events, cutoff));
  } catch {
    return null;
  }
}

type Estimate = GrSummary & { mc_source: string; gft_level: number | null };

/**
 * The platform's Mc estimate by the method named (MBS, which falls back to the GFT when no
 * cut-off is stable; the GFT, which falls back to MAXC + 0.2 below a 90% fit; or MAXC + 0.2)
 * and the b-value above it. mc_source is the method that produced Mc.
 */
function estimated(events: EarthquakeEvent[], method: McMethod): Estimate {
  const gr = calculateGutenbergRichter(events, undefined, 0.1, { method });
  return { ...grSummary(gr), mc_source: gr.mcSource, gft_level: gr.gftLevel ?? null };
}

/** Mc of a b-value-stability estimate, or null when the MBS found no stable cut-off. */
function stableCutoffOf(mbs: Estimate): number | null {
  return mbs.mc_source === 'MBS' ? mbs.mc : null;
}

/**
 * The lowest cut-off at which the b-value of `events` is stable: the platform's own
 * b-value-stability estimate (MBS; Cao and Gao 2002, in the form of Woessner and Wiemer
 * 2005; lib/seismological-analysis.ts), i.e. the lowest bin edge Mi with
 * |b_ave(Mi..Mi+0.5) - b(Mi)| <= db(Mi), db the Shi and Bolt (1982) uncertainty, every
 * cut-off holding at least 50 events. Null when no cut-off is stable (the platform then
 * falls back to the GFT).
 */
export function stabilityCutoff(events: EarthquakeEvent[]): number | null {
  return stableCutoffOf(estimated(events, 'MBS'));
}

/** Cut-offs of the b-versus-cut-off diagnostic (magnitude units, 0.1 steps). */
export const CUTOFFS: ReadonlyArray<number> = Array.from({ length: 21 }, (_, k) => Number((1.5 + k / 10).toFixed(1)));

/** Magnitude classes for the quality filter's retention. */
const RETENTION_BINS: ReadonlyArray<[number, number]> = [
  [1.0, 1.5], [1.5, 2.0], [2.0, 2.5], [2.5, 3.0], [3.0, 3.5], [3.5, 4.0], [4.0, 10.0],
];

export interface WorkedExampleResult {
  options: WorkedExampleOptions;
  catalogues: Array<{
    id: string;
    name: string;
    events: number;
    median_q: number;
    grades: Record<string, number>;
    gap_over_180: number;
    maxc: GrSummary;
    gft: Estimate;
    mbs: Estimate;
    q: number[];
  }>;
  merge: {
    config: MergeConfig;
    ingested: number;
    merged: number;
    duplicate_groups: number;
    removed: number;
    resolved_to: Record<string, number>;
    first_only: number;
    second_only: number;
    // Ground-truth diagnostics (generator truth, not used by the pipeline).
    injected_pairs: number;
    true_pairs_found: number;
    false_associations: number;
    false_associations_with_aftershock: number;
    missed_pairs: number;
    missed_by_reason: Record<string, number>;
  };
  quality: {
    min_quality: number;
    merged_median_q: number;
    merged_grades: Record<string, number>;
    retained: number;
    removed: number;
    removed_share_by_provenance: Record<string, number>;
    gap_over_180_merged: number;
    gap_over_180_removed_fraction: number;
    removed_share_with_gap_over_180: number;
    retention_by_magnitude: Array<{ lo: number; hi: number; events: number; retained: number }>;
  };
  completeness: {
    retained_maxc: Estimate;
    retained_gft: Estimate;
    retained_mbs: Estimate;
    merged_maxc: Estimate;
    merged_gft: Estimate;
    merged_mbs: Estimate;
    concatenated_maxc: Estimate;
    /** The merged catalogue's MBS Mc, or null when the MBS fell back. */
    merged_stability_cutoff: number | null;
  };
  analysis: {
    cutoff: number;
    cutoff_source: 'b-value stability' | 'option' | 'platform MAXC';
    retained_above: number;
    below_cutoff_removed: number;
    gr_retained: GrSummary;
    gr_merged: GrSummary;
    gr_concatenated: GrSummary;
    concatenated_above: number;
    injected_aftershock_share: number;
    gr_retained_background: GrSummary | null;
    gr_merged_background: GrSummary | null;
    gr_retained_aftershocks: GrSummary | null;
    declustered: number;
    removed_by_gk: number;
    gk_recall_of_injected: number;
    gk_background_removed: number;
    gk_background_removed_b: number | null;
    gk_background_removed_mean_magnitude: number | null;
    retained_mean_magnitude: number;
    gr_declustered: GrSummary | null;
    symmetric_removed: number;
    gr_symmetric: GrSummary | null;
  };
  b_vs_cutoff: Array<{
    cutoff: number;
    merged: GrSummary | null;
    retained: GrSummary | null;
    retained_declustered: GrSummary | null;
    retained_declustered_removed: number | null;
    merged_background: GrSummary | null;
    retained_background: GrSummary | null;
  }>;
  /** Per-merged-event arrays for the figures, index-aligned. */
  merged_events: {
    latitude: number[];
    longitude: number[];
    magnitude: number[];
    q: number[];
    gap: Array<number | null>;
    provenance: Provenance[];
    retained: boolean[];
    above_cutoff: boolean[];
    declustered: boolean[];
    injected_aftershock: boolean[];
  };
  /** Associated pairs (first catalogue's report, second's) as [lat1, lon1, lat2, lon2]. */
  pairs: Array<[number, number, number, number]>;
  /** Q (Eq. 1) of an event whose every other attribute scores full marks, against its gap. */
  q_gap_only: Array<{ gap: number; q: number }>;
}

/**
 * The most the azimuthal gap can move Q on its own: the platform's score for an event
 * that is ideal in every other respect, at gaps of 0-360 degrees.
 */
export function gapOnlyQuality(): Array<{ gap: number; q: number }> {
  const out: Array<{ gap: number; q: number }> = [];
  for (let gap = 0; gap <= 360; gap += 5) {
    const { overall } = scoreQualityMetrics({
      horizontalUncertainty: 0, depthUncertainty: 0, timeUncertainty: 0,
      azimuthalGap: gap, usedStationCount: 30, usedPhaseCount: 40, standardError: 0.1,
      magnitudeUncertainty: 0, magnitudeStationCount: 20,
      evaluationMode: 'manual', evaluationStatus: 'reviewed',
    });
    out.push({ gap, q: overall });
  }
  return out;
}

export function runWorkedExample(
  input: WorkedExampleInput,
  options: WorkedExampleOptions = DEFAULT_OPTIONS
): WorkedExampleResult {
  const [first, second] = input.catalogues;
  const config: MergeConfig = {
    timeThreshold: options.timeThresholdSeconds,
    distanceThreshold: options.distanceThresholdKm,
    mergeStrategy: 'quality',
    priority: 'quality',
  };

  // ---- import: stored rows and their Q ------------------------------------------------------
  const rowsByCatalogue = input.catalogues.map(c => catalogueRows(c, input.t0));
  const truthOf = new Map<string, { trueIndex: number; aftershock: boolean }>();
  input.catalogues.forEach((c, k) => {
    const truth = input.truth[c.id];
    rowsByCatalogue[k].forEach((row, i) => {
      truthOf.set(`${c.id}/${row.id}`, { trueIndex: truth.true_index[i], aftershock: truth.is_aftershock[i] });
    });
  });

  const catalogueSummaries = input.catalogues.map((c, k) => {
    const rows = rowsByCatalogue[k];
    const events = rows.map(asAnalysisEvent);
    const q = rows.map(r => Number(r.quality_score));
    const gaps = rows.map(r => r.azimuthal_gap).filter((g): g is number => typeof g === 'number');
    return {
      id: c.id,
      name: c.name,
      events: rows.length,
      median_q: median(q),
      grades: gradeCounts(rows),
      gap_over_180: gaps.filter(g => g > 180).length / gaps.length,
      maxc: grSummary(calculateGutenbergRichter(events, undefined, 0.1, { method: 'MAXC' })),
      gft: estimated(events, 'GFT'),
      mbs: estimated(events, 'MBS'),
      q,
    };
  });

  // ---- merge: what mergeCatalogues runs (performMerge), with the Quality-based strategy ----
  type Report = Record<string, unknown> & { time: string; latitude: number; longitude: number; magnitude: number; source: string };
  const allEvents: Report[] = [];
  const byKey = new Map<string, Report>();
  input.catalogues.forEach((c, k) => {
    const source: SourceCatalogue = { id: c.id, name: c.name, events: rowsByCatalogue[k].length, source: c.name };
    const agency = catalogueAgencyOf(source, { name: c.name } as never);
    rowsByCatalogue[k].forEach(row => {
      const report: Report = { ...row, source: c.name, catalogueId: c.id, _catalogueAgency: agency };
      allEvents.push(report);
      byKey.set(`${c.id}/${row.id}`, report);
    });
  });
  const groups = groupMatchingEvents(allEvents, config);
  const mergedRows = groups.map((g, index) => {
    const merged = mergeEventGroup(g.events, config);
    const members = merged.sourceEvents;
    const selected = members.find(m => m.selected === true);
    // The database gives every inserted row an id (createId); the analysis routines key
    // events by it, so the merged rows get one here.
    const row: Record<string, unknown> = {
      id: `merged-${index}`,
      ...buildMergedEventFields(merged, MERGED_ROW_FIELDS),
    };
    return { row, members, selectedCatalogue: selected ? String(selected.catalogueId) : null };
  });

  let duplicateGroups = 0;
  let truePairs = 0;
  let falseAssociations = 0;
  let falseWithAftershock = 0;
  const resolvedTo: Record<string, number> = { [first.id]: 0, [second.id]: 0 };
  let firstOnly = 0;
  let secondOnly = 0;
  const provenance: Provenance[] = [];
  const pairs: Array<[number, number, number, number]> = [];
  const groupOf = new Map<string, number>();
  mergedRows.forEach((m, gi) => {
    m.members.forEach(e => groupOf.set(`${e.catalogueId}/${e.originalData.id}`, gi));
    if (m.members.length === 1) {
      if (String(m.members[0].catalogueId) === first.id) { firstOnly++; provenance.push('first-only'); }
      else { secondOnly++; provenance.push('second-only'); }
      return;
    }
    duplicateGroups++;
    const truths = m.members.map(e => truthOf.get(`${e.catalogueId}/${e.originalData.id}`)!);
    if (truths.every(t => t.trueIndex === truths[0].trueIndex)) truePairs++;
    else {
      falseAssociations++;
      if (truths.some(t => t.aftershock)) falseWithAftershock++;
    }
    const to = m.selectedCatalogue ?? 'none';
    resolvedTo[to] = (resolvedTo[to] ?? 0) + 1;
    provenance.push(to === first.id ? 'duplicate-first' : 'duplicate-second');
    const a = m.members.find(e => String(e.catalogueId) === first.id)!.originalData;
    const b = m.members.find(e => String(e.catalogueId) === second.id)!.originalData;
    pairs.push([a.latitude, a.longitude, b.latitude, b.longitude]);
  });

  // Earthquakes both agencies report (the duplicates to be found), and why the platform
  // left any of them apart: outside the adaptive windows, rejected by a validity gate (the
  // conflict type the gate logs), or each report claimed by a closer counterpart.
  const firstByTrue = new Map<number, string>();
  input.truth[first.id].true_index.forEach((t, i) => firstByTrue.set(t, `${first.id}/${String(first.columns.id[i])}`));
  const missedByReason: Record<string, number> = {};
  let injectedPairs = 0;
  const conflictLog = getMergeConflictLog();
  input.truth[second.id].true_index.forEach((t, i) => {
    const keyA = firstByTrue.get(t);
    if (keyA === undefined) return;
    injectedPairs++;
    const keyB = `${second.id}/${String(second.columns.id[i])}`;
    if (groupOf.get(keyA) === groupOf.get(keyB)) return;
    const a = byKey.get(keyA)!;
    const b = byKey.get(keyB)!;
    let reason: string;
    if (!eventsMatchAdaptive(a, b, config.timeThreshold, config.distanceThreshold)) {
      reason = 'outside matching window';
    } else {
      conflictLog.clear();
      if (!validateEventGroup([a, b], true)) {
        const logged = conflictLog.getConflicts();
        reason = logged.length > 0 ? `gate:${logged[0].type}` : 'gate:other';
      } else {
        reason = 'paired with a closer report';
      }
    }
    missedByReason[reason] = (missedByReason[reason] ?? 0) + 1;
  });
  conflictLog.clear();

  const ingested = allEvents.length;
  const merged = mergedRows.map(m => m.row);
  const mergedEvents = merged.map(asAnalysisEvent);
  // Truth of a merged row: the true event of its published report.
  const mergedTruth = mergedRows.map(m => {
    const member = m.members.find(e => e.selected === true) ?? m.members[0];
    return truthOf.get(`${member.catalogueId}/${member.originalData.id}`)!;
  });

  // ---- quality filter ----------------------------------------------------------------------
  const q = merged.map(r => Number(r.quality_score));
  const retainedMask = q.map(v => v >= options.minQuality);
  const retainedIdx = merged.map((_, i) => i).filter(i => retainedMask[i]);
  const removedIdx = merged.map((_, i) => i).filter(i => !retainedMask[i]);
  const gapOf = (r: Record<string, unknown>) => (typeof r.azimuthal_gap === 'number' ? r.azimuthal_gap : null);
  const hiGap = merged.map(r => (gapOf(r) ?? 0) > 180);
  const removedByProvenance: Record<string, number> = {};
  removedIdx.forEach(i => { removedByProvenance[provenance[i]] = (removedByProvenance[provenance[i]] ?? 0) + 1; });
  Object.keys(removedByProvenance).forEach(k => { removedByProvenance[k] /= Math.max(1, removedIdx.length); });
  const nHiGap = hiGap.filter(Boolean).length;
  const retentionByMagnitude = RETENTION_BINS.map(([lo, hi]) => {
    const inBin = merged.map((r, i) => i).filter(i => Number(merged[i].magnitude) >= lo && Number(merged[i].magnitude) < hi);
    return { lo, hi, events: inBin.length, retained: inBin.filter(i => retainedMask[i]).length };
  });
  const retainedEvents = retainedIdx.map(i => mergedEvents[i]);

  // ---- b against the cut-off -----------------------------------------------------------------
  const bVsCutoff = CUTOFFS.map(cutoff => {
    const mergedAbove = merged.map((_, i) => i).filter(i => mergedEvents[i].magnitude >= cutoff - 1e-9);
    const retainedAbove = mergedAbove.filter(i => retainedMask[i]);
    const events = retainedAbove.map(i => mergedEvents[i]);
    let declustered: GrSummary | null = null;
    let removed: number | null = null;
    if (events.length > 0) {
      const kept = declusteredIds(events);
      removed = events.length - kept.size;
      declustered = grAt(events.filter(e => kept.has(String(e.id))), cutoff);
    }
    return {
      cutoff,
      merged: grAt(mergedEvents, cutoff),
      retained: grAt(events, cutoff),
      retained_declustered: declustered,
      retained_declustered_removed: removed,
      merged_background: grAt(mergedAbove.filter(i => !mergedTruth[i].aftershock).map(i => mergedEvents[i]), cutoff),
      retained_background: grAt(retainedAbove.filter(i => !mergedTruth[i].aftershock).map(i => mergedEvents[i]), cutoff),
    };
  });

  // ---- completeness estimates the platform offers ---------------------------------------------
  const concatenatedEvents = rowsByCatalogue.reduce<Row[]>((all, rows) => all.concat(rows), []).map(asAnalysisEvent);
  const retainedMaxc = estimated(retainedEvents, 'MAXC');
  const mergedMbs = estimated(mergedEvents, 'MBS');
  // The cut-off from which the merged catalogue's b-value is stable: its MBS estimate.
  const stability = stableCutoffOf(mergedMbs);
  const completeness = {
    retained_maxc: retainedMaxc,
    retained_gft: estimated(retainedEvents, 'GFT'),
    retained_mbs: estimated(retainedEvents, 'MBS'),
    merged_maxc: estimated(mergedEvents, 'MAXC'),
    merged_gft: estimated(mergedEvents, 'GFT'),
    merged_mbs: mergedMbs,
    concatenated_maxc: estimated(concatenatedEvents, 'MAXC'),
    merged_stability_cutoff: stability,
  };

  // ---- b-value and declustering at the analysis cut-off ---------------------------------------
  const cutoff =
    options.analysisCutoff === 'stability'
      ? stability ?? retainedMaxc.mc
      : options.analysisCutoff ?? retainedMaxc.mc;
  const aboveMask = merged.map((_, i) => retainedMask[i] && mergedEvents[i].magnitude >= cutoff - 1e-9);
  const aboveIdx = merged.map((_, i) => i).filter(i => aboveMask[i]);
  const aboveEvents = aboveIdx.map(i => mergedEvents[i]);
  const aboveAftershock = aboveIdx.map(i => mergedTruth[i].aftershock);
  const nAfterAbove = aboveAftershock.filter(Boolean).length;
  const mergedAboveIdx = merged.map((_, i) => i).filter(i => mergedEvents[i].magnitude >= cutoff - 1e-9);

  const keptIds = declusteredIds(aboveEvents);
  const mainshocks = aboveEvents.filter(e => keptIds.has(String(e.id)));
  let recalled = 0;
  const bgRemoved: EarthquakeEvent[] = [];
  aboveEvents.forEach((e, k) => {
    if (keptIds.has(String(e.id))) return;
    if (aboveAftershock[k]) recalled++;
    else bgRemoved.push(e);
  });
  const meanMag = (events: EarthquakeEvent[]) =>
    events.length ? events.reduce((sum, e) => sum + e.magnitude, 0) / events.length : null;
  const symmetricKept = symmetricGardnerKnopoff(aboveEvents);

  const analysis = {
    cutoff,
    cutoff_source: (options.analysisCutoff === 'stability' && stability != null
      ? 'b-value stability'
      : typeof options.analysisCutoff === 'number' ? 'option' : 'platform MAXC') as 'b-value stability' | 'option' | 'platform MAXC',
    retained_above: aboveEvents.length,
    below_cutoff_removed: retainedIdx.length - aboveEvents.length,
    gr_retained: grSummary(calculateGutenbergRichter(aboveEvents, cutoff)),
    gr_merged: grSummary(calculateGutenbergRichter(mergedEvents, cutoff)),
    gr_concatenated: grSummary(calculateGutenbergRichter(concatenatedEvents, cutoff)),
    concatenated_above: concatenatedEvents.filter(e => e.magnitude >= cutoff - 1e-9).length,
    injected_aftershock_share: nAfterAbove / Math.max(1, aboveEvents.length),
    gr_retained_background: grAt(aboveEvents.filter((_, k) => !aboveAftershock[k]), cutoff),
    gr_merged_background: grAt(mergedAboveIdx.filter(i => !mergedTruth[i].aftershock).map(i => mergedEvents[i]), cutoff),
    gr_retained_aftershocks: grAt(aboveEvents.filter((_, k) => aboveAftershock[k]), cutoff),
    declustered: mainshocks.length,
    removed_by_gk: aboveEvents.length - mainshocks.length,
    gk_recall_of_injected: recalled / Math.max(1, nAfterAbove),
    gk_background_removed: bgRemoved.length,
    gk_background_removed_b: grAt(bgRemoved, cutoff)?.b ?? null,
    gk_background_removed_mean_magnitude: meanMag(bgRemoved),
    retained_mean_magnitude: meanMag(aboveEvents) ?? NaN,
    gr_declustered: grAt(mainshocks, cutoff),
    symmetric_removed: aboveEvents.length - symmetricKept.length,
    gr_symmetric: grAt(symmetricKept, cutoff),
  };

  return {
    options,
    catalogues: catalogueSummaries,
    merge: {
      config,
      ingested,
      merged: merged.length,
      duplicate_groups: duplicateGroups,
      removed: ingested - merged.length,
      resolved_to: resolvedTo,
      first_only: firstOnly,
      second_only: secondOnly,
      injected_pairs: injectedPairs,
      true_pairs_found: truePairs,
      false_associations: falseAssociations,
      false_associations_with_aftershock: falseWithAftershock,
      missed_pairs: injectedPairs - truePairs,
      missed_by_reason: missedByReason,
    },
    quality: {
      min_quality: options.minQuality,
      merged_median_q: median(q),
      merged_grades: gradeCounts(merged),
      retained: retainedIdx.length,
      removed: removedIdx.length,
      removed_share_by_provenance: removedByProvenance,
      gap_over_180_merged: nHiGap,
      gap_over_180_removed_fraction: removedIdx.filter(i => hiGap[i]).length / Math.max(1, nHiGap),
      removed_share_with_gap_over_180: removedIdx.filter(i => hiGap[i]).length / Math.max(1, removedIdx.length),
      retention_by_magnitude: retentionByMagnitude,
    },
    completeness,
    analysis,
    b_vs_cutoff: bVsCutoff,
    merged_events: {
      latitude: mergedEvents.map(e => e.latitude),
      longitude: mergedEvents.map(e => e.longitude),
      magnitude: mergedEvents.map(e => e.magnitude),
      q,
      gap: merged.map(gapOf),
      provenance,
      retained: retainedMask,
      above_cutoff: aboveMask,
      declustered: merged.map((r, i) => aboveMask[i] && keptIds.has(String(r.id))),
      injected_aftershock: mergedTruth.map(t => t.aftershock),
    },
    pairs,
    q_gap_only: gapOnlyQuality(),
  };
}
