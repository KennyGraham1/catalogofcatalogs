'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, List } from 'lucide-react';
import { getQualityColor, scoreToGrade, type QualityGrade } from '@/lib/quality-scoring';
import { getEarthquakeColor, getMagnitudePixelRadius } from '@/lib/earthquake-utils';
import { getAzimuthalGapColor } from '@/lib/uncertainty-utils';
import {
  AZIMUTHAL_GAP_TICKS, CATALOGUE_UNKNOWN_COLOR, DEPTH_CLASSES, FAULT_LEGEND_LABEL, MAGNITUDE_KEY_MAGNITUDES,
  MAP_OVERLAY_CLASS, MARKER_STYLE, QUALITY_UNKNOWN_COLOR, azimuthalGapGradientCss, catalogueColorAt,
  faultPathOptions, markerStrokeStyle,
} from '@/lib/map-style';
import { cn } from '@/lib/utils';

/**
 * Map legends. Every entry is built from the functions that colour and size the markers,
 * so a legend cannot drift from the map it describes. The hard-coded quality legends kept
 * the old 90/80/70/60 bands after getQualityColor moved to the letter-grade thresholds, so
 * every band was labelled one grade low next to a popup badge showing the true grade.
 *
 * Current API (spec S3): <MapLegend> card with <LegendSection>s holding <DepthColorBar>,
 * <QualityColorKey>, <AzimuthalGapColorBar>, <CatalogueColorKey>, <MagnitudeSizeKey> and
 * <FaultLineKey> - or <ColorModeLegendSection mode=...> to pick the colour key. The
 * *LegendItems components further down are the previous swatch-grid legends, kept so maps
 * not yet moved to the new chrome still compile; do not use them in new code.
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

/**
 * Quality-score colour key, one row per getQualityColor band.
 * @deprecated Use <QualityColorKey /> inside <MapLegend>.
 */
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
 * uses for an unknown depth. Labelled by range; DEPTH_CLASS_NOTE states the standard
 * shallow / intermediate / deep classes the bands nest in.
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

/**
 * Depth colour key for the active theme, as the markers are coloured.
 * @deprecated Use <DepthColorBar isDark={...} /> inside <MapLegend>.
 */
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

/** Tiers shown in the legacy size key (MagnitudeLegendItems). The new key uses MAGNITUDE_KEY_MAGNITUDES. */
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
 * @deprecated Use <MagnitudeSizeKey isDark={...} /> inside <MapLegend>.
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

/**
 * Azimuthal-gap colour key: the same continuous ramp the markers are coloured with.
 * @deprecated Use <AzimuthalGapColorBar /> inside <MapLegend>.
 */
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
const UNKNOWN_CATALOGUE_COLOR = CATALOGUE_UNKNOWN_COLOR;

/** resolveSourceCatalogue's key for an event with no catalogue signal at all. */
export const UNKNOWN_SOURCE_KEY = '__unknown__';

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
  return { key: UNKNOWN_SOURCE_KEY, label: 'Unknown source' };
}

export interface CatalogueColorScale {
  colorFor(key: string): string;
  legend: Array<{ key: string; label: string; color: string }>;
}

/**
 * Build a stable categorical colour assignment (Okabe–Ito, lib/map-style.ts) from the
 * distinct SourceCatalogueInfo keys of one map's events, plus the legend entries it implies.
 * Sorted by label so the legend reads alphabetically and is deterministic regardless of
 * event order: the same set of catalogues always gets the same colours. Build it from the
 * map's full event list, not the viewport sample, so colours do not shift as the user pans.
 * 'Unknown source' is grey and listed last; it never takes a palette colour.
 */
export function buildCatalogueColorScale(
  infos: SourceCatalogueInfo[],
  { isDark = false }: { isDark?: boolean } = {}
): CatalogueColorScale {
  const labelByKey = new Map<string, string>();
  for (const info of infos) if (!labelByKey.has(info.key)) labelByKey.set(info.key, info.label);
  const orderedKeys = Array.from(labelByKey.keys())
    .filter((key) => key !== UNKNOWN_SOURCE_KEY)
    .sort((a, b) => labelByKey.get(a)!.localeCompare(labelByKey.get(b)!));
  const colorByKey = new Map(orderedKeys.map((key, index) => [key, catalogueColorAt(index, isDark)]));
  if (labelByKey.has(UNKNOWN_SOURCE_KEY)) {
    orderedKeys.push(UNKNOWN_SOURCE_KEY);
    colorByKey.set(UNKNOWN_SOURCE_KEY, UNKNOWN_CATALOGUE_COLOR);
  }
  return {
    colorFor: (key: string) => colorByKey.get(key) ?? UNKNOWN_CATALOGUE_COLOR,
    legend: orderedKeys.map((key) => ({ key, label: labelByKey.get(key)!, color: colorByKey.get(key)! })),
  };
}

/**
 * Source-catalogue colour key: one row per distinct catalogue in the plotted events.
 * @deprecated Use <CatalogueColorKey legend={...} /> inside <MapLegend>.
 */
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

// =======================================================================================
// Map chrome legend (spec S3): one collapsible card bottom-right, generated from the same
// colour and size functions the markers use.
// =======================================================================================

/** Default legend position: bottom-right, clear of the attribution line under it. */
export const MAP_LEGEND_POSITION = 'bottom-6 right-2';

export interface MapLegendProps {
  children: ReactNode;
  /** Extra classes; position overrides merge over MAP_LEGEND_POSITION. */
  className?: string;
  /** Start expanded (default) or as the small "Legend" chip. */
  defaultOpen?: boolean;
  /** Accessible name of the legend region. */
  label?: string;
}

/**
 * The legend card: width <= 220 px, text-xs, never taller than 45% of the map (scrolls
 * beyond that), collapsible to a "Legend" chip. Place it as a sibling of <MapContainer>
 * inside the map's `relative` wrapper. Children are <LegendSection>s, divided by rules.
 */
export function MapLegend({ children, className, defaultOpen = true, label = 'Map legend' }: MapLegendProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-label="Show legend"
        onClick={() => setOpen(true)}
        className={cn(
          'absolute z-[1000] inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent',
          MAP_OVERLAY_CLASS, MAP_LEGEND_POSITION, className,
        )}
      >
        <List className="h-3.5 w-3.5" aria-hidden />
        Legend
      </button>
    );
  }
  return (
    <section
      aria-label={label}
      className={cn(
        'absolute z-[1000] w-[220px] max-w-[calc(100%-16px)] max-h-[45%] overflow-y-auto px-2.5 py-2 text-xs text-foreground',
        MAP_OVERLAY_CLASS, MAP_LEGEND_POSITION, className,
      )}
    >
      <button
        type="button"
        aria-expanded
        aria-label="Hide legend"
        onClick={() => setOpen(false)}
        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div className="space-y-2 [&>*+*]:border-t [&>*+*]:pt-2">{children}</div>
    </section>
  );
}

/** One titled block of the legend (colour key, magnitude key, faults...). */
export function LegendSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {/* h3: maps sit in a page's h2-level card or section; h4 skipped a level (UI audit 2026-10-05). */}
      <h3 className="mb-1.5 pr-5 text-[11px] font-semibold leading-4">{title}</h3>
      {children}
    </div>
  );
}

/** Tick labels under a bar: `ticks` at fractions 0..1 of its width; the ends hug the edges. */
function BarTicks({ ticks }: { ticks: Array<{ at: number; label: string }> }) {
  return (
    <div className="relative h-3 text-[10px] leading-3 tabular-nums text-muted-foreground" aria-hidden>
      {ticks.map(({ at, label }) => (
        <span
          key={`${at}-${label}`}
          className="absolute whitespace-nowrap"
          style={at <= 0 ? { left: 0 } : at >= 1 ? { right: 0 } : { left: `${at * 100}%`, transform: 'translateX(-50%)' }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function UnknownSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 pt-1 text-[10px] leading-3 text-muted-foreground">
      <span data-swatch={label} className="h-2.5 w-2.5 flex-shrink-0 rounded-sm ring-1 ring-inset ring-black/10 dark:ring-white/15" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

const BAR_CLASS = 'flex h-2.5 overflow-hidden rounded-sm ring-1 ring-inset ring-black/10 dark:ring-white/15';

/** A depth class's representative depth, for reading its colour back from getEarthquakeColor. */
const classSampleDepth = (min: number, max: number) => (Number.isFinite(min) ? min : Math.min(0, max - 1));

/**
 * Depth colour key: a discrete horizontal bar, one segment per DEPTH_CLASSES entry,
 * coloured by getEarthquakeColor (so it shows exactly what the markers use), boundaries
 * 0 15 40 70 150 300 km under it, the shallow / intermediate / deep classes over it, and
 * the unknown-depth swatch.
 */
/** 'shallow < 70 · intermediate 70–300 · deep ≥ 300 km', from the class boundaries. */
function depthClassCaption(categories: Array<{ name: string; span: number }>): string {
  let index = 0;
  const parts = categories.map(({ name, span }) => {
    const first = DEPTH_CLASSES[index];
    const last = DEPTH_CLASSES[index + span - 1];
    index += span;
    if (!Number.isFinite(first.min) || first.min <= 0) return `${name} < ${last.max}`;
    if (!Number.isFinite(last.max)) return `${name} ≥ ${first.min}`;
    return `${name} ${first.min}–${last.max}`;
  });
  return `${parts.join(' · ')} km`;
}

export function DepthColorBar({ isDark, showUnknown = true }: { isDark: boolean; showUnknown?: boolean }) {
  const count = DEPTH_CLASSES.length;
  const segments = DEPTH_CLASSES.map((cls) => ({ ...cls, color: getEarthquakeColor(classSampleDepth(cls.min, cls.max), isDark) }));
  const categories: Array<{ name: string; span: number }> = [];
  for (const segment of segments) {
    const last = categories[categories.length - 1];
    if (last && last.name === segment.category) last.span++;
    else categories.push({ name: segment.category, span: 1 });
  }
  const ticks = segments.map((segment, index) => ({ at: index / count, label: String(index === 0 ? 0 : segment.min) }));
  ticks.push({ at: 1, label: 'km' });
  return (
    <div data-legend="depth">
      <div role="img" aria-label={`Depth colour scale: ${segments.map((s) => s.label).join(', ')}`} className={BAR_CLASS}>
        {segments.map((segment) => (
          <span key={segment.label} data-depth-class={segment.label} title={segment.label} className="flex-1" style={{ backgroundColor: segment.color }} />
        ))}
      </div>
      <BarTicks ticks={ticks} />
      {/* The classes in full under the bar: labels over the segments had to be truncated
          ('intermedi…') in a legend this narrow. */}
      <p className="mt-1 text-[10px] leading-3 text-muted-foreground">{depthClassCaption(categories)}</p>
      {showUnknown && <UnknownSwatch color={getEarthquakeColor(null, isDark)} label="unknown depth" />}
    </div>
  );
}

/**
 * Magnitude size key: circles for M2-M6 (or `magnitudes`) at their true rendered radius
 * (getMagnitudePixelRadius), in a neutral fill with the marker stroke, on a common baseline.
 */
export function MagnitudeSizeKey({ isDark, magnitudes = MAGNITUDE_KEY_MAGNITUDES }: { isDark: boolean; magnitudes?: readonly number[] }) {
  const stroke = markerStrokeStyle(isDark);
  const strokeWidth = stroke.weight ?? MARKER_STYLE.weight;
  const fill = isDark ? MARKER_STYLE.neutralFill.dark : MARKER_STYLE.neutralFill.light;
  return (
    <div
      data-legend="magnitude"
      role="img"
      aria-label={`Marker size by magnitude: ${magnitudes.map((m) => `M${m}`).join(', ')}`}
      className="flex items-end justify-between gap-1"
    >
      {magnitudes.map((magnitude) => {
        const radius = getMagnitudePixelRadius(magnitude);
        const size = 2 * radius + strokeWidth;
        return (
          <div key={magnitude} data-magnitude={magnitude} className="flex flex-col items-center gap-0.5">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" aria-hidden>
              <circle cx={size / 2} cy={size / 2} r={radius} fill={fill} fillOpacity={MARKER_STYLE.fillOpacity} stroke={stroke.color} strokeWidth={strokeWidth} />
            </svg>
            <span className="text-[10px] leading-3 tabular-nums text-muted-foreground">M{magnitude}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Quality key: a discrete bar, one segment per getQualityColor band (QUALITY_LEGEND_BANDS),
 * best grade left, grades over it and score boundaries under it.
 */
export function QualityColorKey({ showUnknown = false }: { showUnknown?: boolean }) {
  const bands = QUALITY_LEGEND_BANDS;
  const count = bands.length;
  const ticks = [
    { at: 0, label: String(QUALITY_SCORE_MAX) },
    ...bands.slice(0, -1).map((band, index) => ({ at: (index + 1) / count, label: String(band.min) })),
    { at: 1, label: String(QUALITY_SCORE_MIN) },
  ];
  return (
    <div data-legend="quality">
      <div className="flex text-[10px] font-medium leading-3 text-muted-foreground" aria-hidden>
        {bands.map((band) => (
          <span key={band.color} className="flex-1 truncate text-center">{band.grades.join('/')}</span>
        ))}
      </div>
      <div role="img" aria-label={`Quality colour scale: ${bands.map((b) => b.label).join(', ')}`} className={cn(BAR_CLASS, 'mt-0.5')}>
        {bands.map((band) => (
          <span key={band.color} data-quality-band={band.label} title={band.label} className="flex-1" style={{ backgroundColor: band.color }} />
        ))}
      </div>
      <BarTicks ticks={ticks} />
      {showUnknown && <UnknownSwatch color={QUALITY_UNKNOWN_COLOR} label="no quality score" />}
    </div>
  );
}

/**
 * Azimuthal-gap key: the continuous ramp as a gradient bar sampled from azimuthalGapColor,
 * ticks at 0/90/180/270/360°, and the unknown-gap swatch.
 */
export function AzimuthalGapColorBar({ showUnknown = true }: { showUnknown?: boolean }) {
  return (
    <div data-legend="azimuthal-gap">
      <div className="flex justify-between text-[10px] leading-3 text-muted-foreground" aria-hidden>
        <span>good</span>
        <span>poor</span>
      </div>
      <div
        role="img"
        aria-label="Azimuthal gap colour scale from 0° (good station coverage) to 360° (poor)"
        className={cn(BAR_CLASS, 'mt-0.5')}
        style={{ backgroundImage: azimuthalGapGradientCss() }}
      />
      <BarTicks ticks={AZIMUTHAL_GAP_TICKS.map((gap) => ({ at: gap / 360, label: `${gap}°` }))} />
      {showUnknown && <UnknownSwatch color={getAzimuthalGapColor(null)} label="unknown gap" />}
    </div>
  );
}

/** Source-catalogue key: one row per catalogue in buildCatalogueColorScale's legend. */
export function CatalogueColorKey({ legend, isDark = false }: { legend: CatalogueColorScale['legend']; isDark?: boolean }) {
  if (legend.length === 0) {
    return <p className="text-[10px] text-muted-foreground">No catalogue information on the plotted events.</p>;
  }
  const stroke = markerStrokeStyle(isDark);
  return (
    <ul data-legend="source-catalogue" className="space-y-1">
      {legend.map(({ key, label, color }) => (
        <li key={key} data-catalogue-key={key} className="flex min-w-0 items-center gap-1.5">
          <span
            data-swatch={label}
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 0 ${stroke.weight}px ${stroke.color}` }}
          />
          <span className="truncate" title={label}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Fault-line key: a short line in the fault style and the source. */
export function FaultLineKey({ isDark, label = FAULT_LEGEND_LABEL }: { isDark: boolean; label?: string }) {
  const style = faultPathOptions(isDark, 0);
  return (
    <div data-legend="faults" className="flex items-center gap-1.5">
      <svg width="20" height="8" className="flex-shrink-0" aria-hidden>
        <line x1="0" y1="4" x2="20" y2="4" stroke={style.color} strokeOpacity={style.opacity} strokeWidth={1.5} />
      </svg>
      <span className="text-[11px] leading-4">{label}</span>
    </div>
  );
}

/** The colour modes the event maps offer. */
export type MapColorMode = 'depth' | 'quality' | 'azimuthal-gap' | 'source-catalogue';

/** Radio labels for the colour modes (sentence case, one place). */
export const COLOR_MODE_LABELS: Readonly<Record<MapColorMode, string>> = Object.freeze({
  depth: 'Depth',
  quality: 'Quality',
  'azimuthal-gap': 'Azimuthal gap',
  'source-catalogue': 'Source catalogue',
});

/** Legend headings for the colour modes. */
export const COLOR_MODE_LEGEND_TITLES: Readonly<Record<MapColorMode, string>> = Object.freeze({
  depth: 'Depth',
  quality: 'Location quality (Q)',
  'azimuthal-gap': 'Azimuthal gap',
  'source-catalogue': 'Source catalogue',
});

/** The colour key for the active colour mode, titled. */
export function ColorModeLegendSection({
  mode, isDark, catalogueLegend = [],
}: { mode: MapColorMode; isDark: boolean; catalogueLegend?: CatalogueColorScale['legend'] }) {
  return (
    <LegendSection title={COLOR_MODE_LEGEND_TITLES[mode]}>
      {mode === 'quality' ? <QualityColorKey />
        : mode === 'azimuthal-gap' ? <AzimuthalGapColorBar />
          : mode === 'source-catalogue' ? <CatalogueColorKey legend={catalogueLegend} isDark={isDark} />
            : <DepthColorBar isDark={isDark} />}
    </LegendSection>
  );
}

/** Colour for an index-th catalogue on maps that list catalogues themselves (DuplicateGroupMap). */
export { catalogueColorAt, CATALOGUE_UNKNOWN_COLOR };
