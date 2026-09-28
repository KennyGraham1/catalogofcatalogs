'use client';

import { getQualityColor, scoreToGrade, type QualityGrade } from '@/lib/quality-scoring';
import { getEarthquakeColor, getMagnitudePixelRadius } from '@/lib/earthquake-utils';
import { getAzimuthalGapColor } from '@/lib/uncertainty-utils';

/**
 * Legend entries are built from the functions that colour and size the markers, so a
 * legend cannot drift from the map it describes. The hard-coded quality legends kept the
 * old 90/80/70/60 bands after getQualityColor moved to the letter-grade thresholds, so
 * every band was labelled one grade low next to a popup badge showing the true grade.
 */

export interface QualityLegendBand {
  color: string;
  /** Lowest and highest reported score drawn in this colour. */
  min: number;
  max: number;
  /** Letter grades (scoreToGrade) the band's scores receive, best first. */
  grades: QualityGrade[];
  label: string;
}

/** Scores are reported as integers in 0-100 (calculateQualityScore rounds before grading). */
const QUALITY_SCORE_MIN = 0;
const QUALITY_SCORE_MAX = 100;

/**
 * Walk every reportable score through getQualityColor and scoreToGrade and group the
 * runs that share a colour. The open-ended top and bottom bands are labelled >= / <.
 */
export function buildQualityLegendBands(): QualityLegendBand[] {
  const bands: Omit<QualityLegendBand, 'label'>[] = [];
  for (let score = QUALITY_SCORE_MAX; score >= QUALITY_SCORE_MIN; score--) {
    const color = getQualityColor(score);
    const grade = scoreToGrade(score);
    const current = bands[bands.length - 1];
    if (current && current.color === color) {
      current.min = score;
      if (!current.grades.includes(grade)) current.grades.push(grade);
    } else {
      bands.push({ color, min: score, max: score, grades: [grade] });
    }
  }
  return bands.map((band) => {
    const range = band.max === QUALITY_SCORE_MAX ? `≥ ${band.min}`
      : band.min === QUALITY_SCORE_MIN ? `< ${band.max + 1}`
        : `${band.min}–${band.max}`;
    return { ...band, label: `${band.grades.join(' / ')} (${range})` };
  });
}

export const QUALITY_LEGEND_BANDS = buildQualityLegendBands();

/** Quality-score colour key, one row per getQualityColor band. */
export function QualityLegendItems() {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      {QUALITY_LEGEND_BANDS.map(({ color, label }) => (
        <div key={color} className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px] ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: color }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export interface DepthLegendEntry {
  color: string;
  label: string;
}

/** Depths swept to find the colour bands: 1 km steps down to the deepest earthquakes. */
const DEPTH_SWEEP_MAX_KM = 700;

/**
 * getEarthquakeColor's bands for one theme, found by sweeping depth, plus the colour it
 * uses for an unknown depth. The bands follow the GeoNet palette rather than the depth
 * classes, so they are labelled by range only; DEPTH_CLASS_NOTE states the classes.
 */
export function buildDepthLegendEntries(isDark: boolean): DepthLegendEntry[] {
  const bands: Array<{ color: string; min: number }> = [];
  for (let depth = 0; depth <= DEPTH_SWEEP_MAX_KM; depth++) {
    const color = getEarthquakeColor(depth, isDark);
    if (bands[bands.length - 1]?.color !== color) bands.push({ color, min: depth });
  }
  const entries = bands.map(({ color, min }, index) => {
    const next = bands[index + 1];
    const label = index === 0 ? `< ${next ? next.min : DEPTH_SWEEP_MAX_KM} km`
      : next ? `${min}–${next.min} km` : `≥ ${min} km`;
    return { color, label };
  });
  entries.push({ color: getEarthquakeColor(null, isDark), label: 'Unknown depth' });
  return entries;
}

const DEPTH_LEGEND_ENTRIES = {
  light: buildDepthLegendEntries(false),
  dark: buildDepthLegendEntries(true),
};

/** Standard hypocentral depth classes (ISC/USGS usage). */
export const DEPTH_CLASS_NOTE = 'Shallow < 70 km · intermediate 70–300 km · deep ≥ 300 km';

/** Depth colour key for the active theme, as the markers are coloured. */
export function DepthLegendItems({ isDark }: { isDark: boolean }) {
  const entries = isDark ? DEPTH_LEGEND_ENTRIES.dark : DEPTH_LEGEND_ENTRIES.light;
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {entries.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{DEPTH_CLASS_NOTE}</p>
    </>
  );
}

export interface MagnitudeLegendEntry {
  magnitude: number;
  label: string;
  /** Marker diameter in CSS px: twice the CircleMarker radius. */
  diameter: number;
}

/** Tiers shown in the size key; M7+ because getMagnitudePixelRadius stops growing at M7. */
export const MAGNITUDE_LEGEND_ENTRIES: MagnitudeLegendEntry[] = [
  { magnitude: 2, label: 'M2' },
  { magnitude: 4, label: 'M4' },
  { magnitude: 6, label: 'M6' },
  { magnitude: 7, label: 'M7+' },
].map((entry) => ({ ...entry, diameter: 2 * getMagnitudePixelRadius(entry.magnitude) }));

/** Swatch colour of the size key on maps where colour encodes something else. */
const SIZE_SWATCH_COLOR = '#0D9488';

/**
 * Magnitude size key drawn at the markers' own screen size. `getColor` gives the swatch
 * the markers' colour when colour also encodes magnitude.
 */
export function MagnitudeLegendItems({ getColor }: { getColor?: (magnitude: number) => string }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      {MAGNITUDE_LEGEND_ENTRIES.map(({ magnitude, label, diameter }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className="flex-shrink-0 rounded-full"
            style={{ width: diameter, height: diameter, backgroundColor: getColor ? getColor(magnitude) : SIZE_SWATCH_COLOR }}
          />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Representative gap values shown in the azimuthal-gap legend. The ramp itself
 * (getAzimuthalGapColor) is continuous, so — like MagnitudeLegendItems — the legend
 * samples fixed tick points along it rather than sweep-banding it into runs the way the
 * genuinely discrete depth/quality colour functions are (buildDepthLegendEntries would
 * find a "new band" at nearly every degree).
 */
export const AZIMUTHAL_GAP_LEGEND_TICKS = [0, 60, 120, 180, 270, 360] as const;

/** Azimuthal-gap colour key: the same continuous ramp the markers are coloured with. */
export function AzimuthalGapLegendItems() {
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {AZIMUTHAL_GAP_LEGEND_TICKS.map((gap) => (
          <div key={gap} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: getAzimuthalGapColor(gap) }} />
            <span>{gap}°{gap > 180 ? ' (highlighted)' : ''}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: getAzimuthalGapColor(null) }} />
          <span>Unknown</span>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">Continuous ramp · gap &gt; 180° highlighted (poor network geometry)</p>
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Source-catalogue colour mode: categorical palette + legend, shared by every map that
// colours markers by which catalogue an event came from (paper sec:viz; contract C2).
// ---------------------------------------------------------------------------------------

/** Grey used for an event whose source catalogue cannot be resolved from any signal. */
const UNKNOWN_CATALOGUE_COLOR = '#94a3b8'; // slate-400, matching the "unknown" grey used elsewhere on these maps

/** Distinct hues, cycled when more catalogues are plotted than the palette has entries. */
const CATALOGUE_PALETTE = [
  '#2563eb', // blue
  '#d97706', // amber
  '#16a34a', // green
  '#db2777', // pink
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#dc2626', // red
  '#65a30d', // lime
  '#ea580c', // orange
  '#4338ca', // indigo
];

export interface SourceCatalogueEvent {
  /** Pooled multi-catalogue views (e.g. the analytics page) stamp every event with this. */
  catalogue?: string | null;
  /** C2: distinct catalogue ids that contributed to this row (merged catalogues only). */
  source_catalogue_ids?: string[] | null;
  /** C2: full per-source provenance JSON; one member gains `selected: true`. Heavier than
   *  source_catalogue_ids and left out of list/summary payloads, so it is only present
   *  when a caller fetched the full event. */
  source_events?: string | null;
}

export interface SourceCatalogueInfo {
  /** Stable grouping key: same key => same legend row => same colour. */
  key: string;
  /** Human-readable legend label for this key. */
  label: string;
}

/**
 * Resolve the "source catalogue" category a map marker's colour should encode (contract
 * C2, consumed by F2). Precedence, most precise first:
 *  1. The source_events member marked `selected: true` — the one whose solution
 *     (time/epicentre) this row actually publishes, so it is what the row's position
 *     represents.
 *  2. A single source_catalogue_id — nothing to disambiguate.
 *  3. Multiple source_catalogue_ids with no selected member found (e.g. an 'average'
 *     merge, C2: "No member is selected for 'average'") — grouped as one "Merged (N
 *     sources)" category rather than guessing a single contributor.
 *  4. The event's own `catalogue` — a pooled multi-catalogue view's per-event source.
 *  5. 'Unknown source'.
 * `catalogueNames` lets a caller that already has the catalogue list turn a bare id into
 * a display name; without it, the id itself is shown.
 */
export function resolveSourceCatalogue(
  event: SourceCatalogueEvent,
  catalogueNames?: Record<string, string>
): SourceCatalogueInfo {
  const nameFor = (id: string) => catalogueNames?.[id] ?? id;

  if (event.source_events) {
    try {
      const members = JSON.parse(event.source_events);
      if (Array.isArray(members)) {
        const selected = members.find((m) => m && typeof m === 'object' && m.selected === true);
        if (selected) {
          const key = String(selected.catalogueId ?? selected.source ?? 'unknown');
          const label = typeof selected.source === 'string' && selected.source ? selected.source : nameFor(key);
          return { key, label };
        }
      }
    } catch {
      // Malformed JSON: fall through to the coarser signals below.
    }
  }

  const ids = Array.isArray(event.source_catalogue_ids)
    ? event.source_catalogue_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (ids.length === 1) return { key: ids[0], label: nameFor(ids[0]) };
  if (ids.length > 1) {
    const key = `merged:${[...ids].sort().join('+')}`;
    return { key, label: `Merged (${ids.length} sources)` };
  }

  if (event.catalogue) return { key: `catalogue:${event.catalogue}`, label: event.catalogue };
  return { key: '__unknown__', label: 'Unknown source' };
}

export interface CatalogueColorScale {
  colorFor(key: string): string;
  legend: Array<{ key: string; label: string; color: string }>;
}

/**
 * Build a stable categorical colour assignment from the distinct SourceCatalogueInfo keys
 * present in one map's plotted events, plus the legend entries it implies. Sorted by
 * label so the legend reads alphabetically and is deterministic regardless of event
 * order; the same set of catalogues always gets the same colours.
 */
export function buildCatalogueColorScale(infos: SourceCatalogueInfo[]): CatalogueColorScale {
  const labelByKey = new Map<string, string>();
  for (const info of infos) if (!labelByKey.has(info.key)) labelByKey.set(info.key, info.label);
  const orderedKeys = Array.from(labelByKey.keys()).sort((a, b) => labelByKey.get(a)!.localeCompare(labelByKey.get(b)!));
  const colorByKey = new Map(orderedKeys.map((key, index) => [key, CATALOGUE_PALETTE[index % CATALOGUE_PALETTE.length]]));
  return {
    colorFor: (key: string) => colorByKey.get(key) ?? UNKNOWN_CATALOGUE_COLOR,
    legend: orderedKeys.map((key) => ({ key, label: labelByKey.get(key)!, color: colorByKey.get(key)! })),
  };
}

/** Source-catalogue colour key: one row per distinct catalogue in the plotted events. */
export function SourceCatalogueLegendItems({ legend }: { legend: Array<{ key: string; label: string; color: string }> }) {
  if (legend.length === 0) {
    return <p className="mt-2 text-[10px] text-muted-foreground">No catalogue information on the plotted events.</p>;
  }
  return (
    <div className="mt-2 grid grid-cols-1 gap-y-1">
      {legend.map(({ key, label, color }) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: color }} />
          <span className="truncate" title={label}>{label}</span>
        </div>
      ))}
    </div>
  );
}
