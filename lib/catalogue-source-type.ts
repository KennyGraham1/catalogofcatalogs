/**
 * Shared catalogue provenance classifier (contract C6).
 *
 * The logic mirrors getSourceType in app/merge/page.tsx (and its duplicate in
 * app/catalogues/page.tsx), which classify a catalogue by how its events got there.
 * This module is the single canonical copy so every consumer (dashboard stats, merge
 * UI, analytics) agrees on what counts as a merge output instead of an ordinary
 * upload or import. Return values intentionally use 'upload'/'import' (contract C6),
 * not the 'uploaded'/'imported' labels the two page-local copies use for display text.
 */

export type CatalogueSourceType = 'merged' | 'upload' | 'import' | 'unknown';

interface SourceCatalogueEntry {
  id?: string | number;
  name?: string;
  events?: number;
  source?: string;
}

/** The subset of a catalogue row this classifier reads. */
export interface CatalogueSourceTypeInput {
  source_catalogues?: string | null;
  merge_config?: string | null;
}

// Agency/import source names seen in source_catalogues[0].source (case-insensitive
// substring match, matching the original getSourceType behaviour).
const IMPORT_SOURCE_HINTS = ['geonet', 'fdsn', 'api'];

function parseSourceCatalogues(raw: string | null | undefined): SourceCatalogueEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Classifies a catalogue by provenance:
 * - 'merged': built from more than one source catalogue (lib/merge.ts writes one
 *   source_catalogues entry per contributing catalogue, each carrying id/name/events).
 * - 'upload': a single source_catalogues entry with source 'upload'.
 * - 'import': a single source_catalogues entry from an agency feed (GeoNet, FDSN, ...).
 * - 'unknown': neither source_catalogues nor merge_config gives a usable signal (e.g.
 *   a legacy row). Callers must not assume 'unknown' means 'upload' — that guess is
 *   exactly what made every catalogue read as 'merged' before this helper existed.
 */
export function getCatalogueSourceType(catalogue: CatalogueSourceTypeInput): CatalogueSourceType {
  const sources = parseSourceCatalogues(catalogue.source_catalogues);

  // A merge's source_catalogues array carries one entry per contributing catalogue,
  // each with id/name/events (lib/merge.ts:445). A plain upload or import writes
  // exactly one entry describing itself (e.g. {source:'upload'}), never a reference
  // to another catalogue, so length alone is not enough to tell them apart.
  if (sources.length > 1 && sources.some((s) => s && s.id != null && s.name && s.events !== undefined)) {
    return 'merged';
  }

  if (sources.length > 0) {
    const sourceName = String(sources[0]?.source || '').toLowerCase();
    if (IMPORT_SOURCE_HINTS.some((hint) => sourceName.includes(hint))) {
      return 'import';
    }
    if (sourceName === 'upload') {
      return 'upload';
    }
  }

  // Fall back to merge_config (lib/merge.ts stores the effective MergeConfig here,
  // contract C2: at least mergeStrategy, timeThresholdSeconds, ...) for rows whose
  // source_catalogues alone did not resolve above.
  if (catalogue.merge_config) {
    try {
      const mergeConfig = JSON.parse(catalogue.merge_config);
      if (
        mergeConfig && typeof mergeConfig === 'object' &&
        (mergeConfig.mergeStrategy || mergeConfig.timeThreshold !== undefined || mergeConfig.timeThresholdSeconds !== undefined)
      ) {
        return 'merged';
      }
    } catch {
      // ignore invalid merge_config JSON
    }
  }

  return 'unknown';
}
