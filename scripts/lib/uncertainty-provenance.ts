/**
 * Pure decision logic for scripts/migrate-uncertainty-units.ts (finding gs#0).
 *
 * Legacy QuakeML imports (before commit 632a493) stored Origin.depth.uncertainty
 * and OriginUncertainty.horizontalUncertainty RAW, in metres, in the flat
 * depth_uncertainty / horizontal_uncertainty columns the app now reads as km.
 * Picking legacy rows by size (the original script's `> 100 km` heuristic) is
 * wrong in both directions: a metre value of 100 or less (a WELL-constrained
 * event — the best data in the catalogue) is left alone and misread as up to
 * 100 km, while a value already correctly stored in km above 100 (a genuinely
 * poorly-constrained event — legal between 632a493 and c5e88f3, before the
 * [0,100] cap existed) gets silently divided by 1000 again.
 *
 * The QuakeML parser never divides: every legacy row's `origins` JSON blob (the
 * raw parsed Origin array, quakeml-to-db.ts:114) still carries the true metre
 * value alongside the flat column. Comparing the flat column to that raw value
 * tells unconverted rows (ratio ~1, any size) apart from already-correct ones
 * (ratio ~0.001) with no ambiguity and no size threshold at all.
 */

export type UncertaintyField = 'depth_uncertainty' | 'horizontal_uncertainty';

export const UNCERTAINTY_FIELDS: readonly UncertaintyField[] = [
  'depth_uncertainty',
  'horizontal_uncertainty',
];

/** The slice of a parsed QuakeML Origin (lib/types/quakeml.ts) this module reads. */
export interface OriginLike {
  publicID?: string | null;
  depth?: { uncertainty?: number | null } | null;
  uncertainty?: { horizontalUncertainty?: number | null } | null;
}

const RAW_METRES: Record<UncertaintyField, (o: OriginLike) => number | null | undefined> = {
  depth_uncertainty: (o) => o.depth?.uncertainty,
  horizontal_uncertainty: (o) => o.uncertainty?.horizontalUncertainty,
};

// The stored/raw ratio lands at exactly 1 (unconverted) or exactly 0.001 (already
// divided by 1000), up to floating point noise — a 1000x gap. A 2% relative band
// around 1 comfortably absorbs rounding without any risk of the two being confused.
const UNCONVERTED_RATIO_TOLERANCE = 0.02;

export type UncertaintyDecision =
  | { action: 'convert'; newValueKm: number; ratio: number }
  | { action: 'leave'; ratio: number }
  | { action: 'no-origin-data' };

/** The same origin quakemlEventToDbFields (lib/quakeml-to-db.ts) would have preferred. */
export function findPreferredOrigin(
  origins: OriginLike[] | null | undefined,
  preferredOriginId: string | null | undefined,
): OriginLike | undefined {
  if (!origins || origins.length === 0) return undefined;
  const byId = preferredOriginId ? origins.find((o) => o.publicID === preferredOriginId) : undefined;
  return byId ?? origins[0];
}

/**
 * Decide what a single legacy uncertainty column should become, using the
 * preferred origin's raw QuakeML value (always metres) as ground truth instead of
 * the column's size. Rows with no usable provenance (no origins JSON, unparseable,
 * or the preferred origin carries no raw value for this field) are left alone —
 * this also covers CSV-derived rows, which never had a metres-legacy phase.
 */
export function decideUncertaintyConversion(
  storedValueKm: number,
  origins: OriginLike[] | null | undefined,
  preferredOriginId: string | null | undefined,
  field: UncertaintyField,
): UncertaintyDecision {
  if (!Number.isFinite(storedValueKm)) return { action: 'no-origin-data' };

  const preferred = findPreferredOrigin(origins, preferredOriginId);
  const raw = preferred ? RAW_METRES[field](preferred) : null;
  if (raw == null || !Number.isFinite(raw) || raw === 0) return { action: 'no-origin-data' };

  const ratio = storedValueKm / raw;
  if (Math.abs(ratio - 1) <= UNCONVERTED_RATIO_TOLERANCE) {
    return { action: 'convert', newValueKm: raw / 1000, ratio };
  }
  return { action: 'leave', ratio };
}
