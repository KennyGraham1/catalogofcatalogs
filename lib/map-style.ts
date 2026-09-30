/**
 * Map symbology: the single source of truth for how an earthquake is drawn on every map
 * (depth colour, magnitude size, marker stroke, the other colour modes and fault lines).
 *
 * Pure module - no Leaflet runtime import (only types), no DOM - so it can be imported by
 * server code, workers and tests. Legends are generated from the functions below, never
 * from a second hard-coded copy of the colours, so a legend cannot drift from its map.
 *
 * See MAP_DESIGN_SPEC S2/S4 for the design rationale.
 */
import type { PathOptions } from 'leaflet';

// ---------------------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------------------

export interface DepthClass {
  /** Inclusive lower bound in km (-Infinity for the first class: above-sea-level depths). */
  min: number;
  /** Exclusive upper bound in km (Infinity for the last class). */
  max: number;
  /** Range label as shown in legends, e.g. '15–40 km', '< 15 km', '≥ 300 km'. */
  label: string;
  /** Standard hypocentral depth class (ISC/USGS usage: 70 and 300 km boundaries). */
  category: 'shallow' | 'intermediate' | 'deep';
  /** Fill on a light basemap. */
  light: string;
  /** Fill on a dark basemap (one notch lighter so deep events stay visible). */
  dark: string;
}

/**
 * Depth classes, shallow to deep. Colours are sampled from matplotlib 'plasma'
 * (perceptually ordered, colour-vision-deficiency safe): warm = shallow, dark = deep, the
 * seismological convention. The pale-yellow end of plasma is omitted so shallow events
 * stay visible on a light basemap.
 */
export const DEPTH_CLASSES: readonly DepthClass[] = Object.freeze([
  { min: -Infinity, max: 15, label: '< 15 km', category: 'shallow', light: '#FCA636', dark: '#FDB42F' },
  { min: 15, max: 40, label: '15–40 km', category: 'shallow', light: '#E66C5C', dark: '#F07F4F' },
  { min: 40, max: 70, label: '40–70 km', category: 'shallow', light: '#C5407E', dark: '#DB5C68' },
  { min: 70, max: 150, label: '70–150 km', category: 'intermediate', light: '#9C179E', dark: '#B83289' },
  { min: 150, max: 300, label: '150–300 km', category: 'intermediate', light: '#6A00A8', dark: '#8B0AA5' },
  { min: 300, max: Infinity, label: '≥ 300 km', category: 'deep', light: '#2A0593', dark: '#5B02A3' },
] as DepthClass[]);

/** Colour of an event whose depth is not reported. */
export const DEPTH_UNKNOWN = Object.freeze({ label: 'unknown', light: '#9CA3AF', dark: '#6B7280' });

/** Class boundaries in km as drawn under the depth colour bar (0 stands for the surface). */
export const DEPTH_BOUNDARIES_KM: readonly number[] = Object.freeze([0, 15, 40, 70, 150, 300]);

/** True for a usable depth value (finite number). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Index into DEPTH_CLASSES for a depth in km, or -1 when the depth is unknown. */
export function depthClassIndex(depth: number | null | undefined): number {
  if (!isFiniteNumber(depth)) return -1;
  for (let i = 0; i < DEPTH_CLASSES.length; i++) {
    if (depth < DEPTH_CLASSES[i].max) return i;
  }
  return DEPTH_CLASSES.length - 1;
}

/** Marker fill for a depth in km (grey for unknown depth). Same as getEarthquakeColor. */
export function depthColor(depth: number | null | undefined, isDark = false): string {
  const index = depthClassIndex(depth);
  if (index < 0) return isDark ? DEPTH_UNKNOWN.dark : DEPTH_UNKNOWN.light;
  return isDark ? DEPTH_CLASSES[index].dark : DEPTH_CLASSES[index].light;
}

// ---------------------------------------------------------------------------------------
// Magnitude size
// ---------------------------------------------------------------------------------------

/**
 * CircleMarker radius law: r(M) = clamp(base * growth^(M - 1), min, max) px. Exponential,
 * so every magnitude unit is visibly larger (x1.5 radius, x2.25 area):
 * M1 2.2, M2 3.3, M3 5.0, M4 7.4, M5 11.1, M6 16.7, M7 25 px.
 */
export const MAGNITUDE_RADIUS = Object.freeze({
  base: 2.2,
  growth: 1.5,
  min: 2.2,
  max: 28,
  /** Radius for an event with no usable magnitude. */
  unknown: 3,
});

/** Screen-pixel radius for a magnitude (see MAGNITUDE_RADIUS), rounded to 0.01 px. */
export function magnitudeRadius(magnitude: number | null | undefined): number {
  if (!isFiniteNumber(magnitude)) return MAGNITUDE_RADIUS.unknown;
  const { base, growth, min, max } = MAGNITUDE_RADIUS;
  const radius = Math.min(max, Math.max(min, base * Math.pow(growth, magnitude - 1)));
  return Math.round(radius * 100) / 100;
}

/** Magnitudes shown in the legend's size key. */
export const MAGNITUDE_KEY_MAGNITUDES: readonly number[] = Object.freeze([2, 3, 4, 5, 6]);

// ---------------------------------------------------------------------------------------
// Marker stroke / fill style
// ---------------------------------------------------------------------------------------

export const MARKER_STYLE = Object.freeze({
  fillOpacity: 0.78,
  weight: 0.6,
  stroke: { light: 'rgba(17,24,39,0.55)', dark: 'rgba(255,255,255,0.55)' },
  highlight: {
    fillOpacity: 0.95,
    weight: 2,
    stroke: { light: '#111827', dark: '#FFFFFF' },
  },
  /** Neutral fill of the legend's magnitude circles (colour is not what they encode). */
  neutralFill: { light: '#D1D5DB', dark: '#52525B' },
});

/**
 * Stroke-only style for a marker: what Layer.setStyle() needs to toggle hover/selection
 * without touching the fill colour.
 */
export function markerStrokeStyle(isDark: boolean, highlighted = false): Pick<PathOptions, 'color' | 'weight' | 'fillOpacity' | 'opacity'> {
  if (highlighted) {
    return {
      color: isDark ? MARKER_STYLE.highlight.stroke.dark : MARKER_STYLE.highlight.stroke.light,
      weight: MARKER_STYLE.highlight.weight,
      fillOpacity: MARKER_STYLE.highlight.fillOpacity,
      opacity: 1,
    };
  }
  return {
    color: isDark ? MARKER_STYLE.stroke.dark : MARKER_STYLE.stroke.light,
    weight: MARKER_STYLE.weight,
    fillOpacity: MARKER_STYLE.fillOpacity,
    opacity: 1,
  };
}

/** Full CircleMarker path options for an event marker filled with `fill`. */
export function markerPathOptions(fill: string, isDark: boolean, highlighted = false): PathOptions {
  return { ...markerStrokeStyle(isDark, highlighted), fillColor: fill, fill: true, stroke: true };
}

// ---------------------------------------------------------------------------------------
// Quality (Q 0-100, by letter grade)
// ---------------------------------------------------------------------------------------

/** Letter grades of lib/quality-scoring scoreToGrade (kept local: this module is type-free of it). */
export type QualityGradeKey = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

/** Marker colour per quality grade; getQualityColor(score) reads this table. */
export const QUALITY_GRADE_COLORS: Readonly<Record<QualityGradeKey, string>> = Object.freeze({
  'A+': '#0F766E',
  A: '#0F766E',
  'B+': '#14B8A6',
  B: '#14B8A6',
  C: '#EAB308',
  D: '#F97316',
  F: '#DC2626',
});

/** Colour for an event with no quality score (never used for real data). */
export const QUALITY_UNKNOWN_COLOR = '#9CA3AF';

// ---------------------------------------------------------------------------------------
// Azimuthal gap (continuous)
// ---------------------------------------------------------------------------------------

/** Ramp stops: teal (0°, well surrounded) -> pale amber (180°) -> red (360°, poor). */
export const AZIMUTHAL_GAP_STOPS: ReadonlyArray<{ gap: number; color: string }> = Object.freeze([
  { gap: 0, color: '#0F766E' },
  { gap: 180, color: '#FDE68A' },
  { gap: 360, color: '#B91C1C' },
]);
export const AZIMUTHAL_GAP_TICKS: readonly number[] = Object.freeze([0, 90, 180, 270, 360]);
export const AZIMUTHAL_GAP_UNKNOWN_COLOR = '#9CA3AF';

type Rgb = [number, number, number];
type Lab = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

const toLinear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** sRGB -> OKLab (Ottosson 2020), so the ramp is interpolated perceptually evenly. */
function rgbToOklab([r8, g8, b8]: Rgb): Lab {
  const r = toLinear(r8), g = toLinear(g8), b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: Lab): Rgb {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Interpolate between two hex colours in OKLab; t in [0, 1]. */
export function mixOklab(from: string, to: string, t: number): string {
  const a = rgbToOklab(hexToRgb(from));
  const b = rgbToOklab(hexToRgb(to));
  return rgbToHex(oklabToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
}

/**
 * Continuous azimuthal-gap colour (hex). Unknown gap -> grey; out-of-range gaps clamp to
 * 0-360. Used by getAzimuthalGapColor (lib/uncertainty-utils) and the gap colour bar.
 */
export function azimuthalGapColor(gap: number | null | undefined): string {
  if (!isFiniteNumber(gap)) return AZIMUTHAL_GAP_UNKNOWN_COLOR;
  const clamped = Math.max(0, Math.min(360, gap));
  for (let i = 1; i < AZIMUTHAL_GAP_STOPS.length; i++) {
    const lo = AZIMUTHAL_GAP_STOPS[i - 1];
    const hi = AZIMUTHAL_GAP_STOPS[i];
    if (clamped <= hi.gap) return mixOklab(lo.color, hi.color, (clamped - lo.gap) / (hi.gap - lo.gap));
  }
  return AZIMUTHAL_GAP_STOPS[AZIMUTHAL_GAP_STOPS.length - 1].color;
}

/**
 * CSS linear-gradient for a gap colour bar, sampled from azimuthalGapColor every `step`
 * degrees so the bar shows exactly what the markers are painted with (CSS would otherwise
 * interpolate the stops in sRGB, not OKLab).
 */
export function azimuthalGapGradientCss(step = 15): string {
  const stops: string[] = [];
  for (let gap = 0; gap <= 360; gap += step) stops.push(`${azimuthalGapColor(gap)} ${((gap / 360) * 100).toFixed(2)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// ---------------------------------------------------------------------------------------
// Source catalogue (categorical)
// ---------------------------------------------------------------------------------------

/** Okabe–Ito qualitative palette (CVD safe); the 8th entry is black/white by theme. */
export const OKABE_ITO: readonly string[] = Object.freeze(['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#000000']);
export const OKABE_ITO_DARK: readonly string[] = Object.freeze(['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#FFFFFF']);
export const CATALOGUE_UNKNOWN_COLOR = '#9CA3AF';

/** Categorical colour for the index-th catalogue (cycles after 8). */
export function catalogueColorAt(index: number, isDark = false): string {
  const palette = isDark ? OKABE_ITO_DARK : OKABE_ITO;
  const i = ((Math.floor(index) % palette.length) + palette.length) % palette.length;
  return palette[i];
}

// ---------------------------------------------------------------------------------------
// Faults (analytics map)
// ---------------------------------------------------------------------------------------

export const FAULT_STYLE = Object.freeze({
  light: { color: '#7F1D1D', opacity: 0.55 },
  dark: { color: '#FCA5A5', opacity: 0.45 },
  weight: 1,
  weightZoomedIn: 1.5,
  /** Zoom at and above which faults use weightZoomedIn. */
  zoomThreshold: 9,
});

export const FAULT_LEGEND_LABEL = 'Active faults (GNS Science NZ AFDB)';

/** Path options for fault lines at the given zoom. Draw them in MAP_PANES.faults. */
export function faultPathOptions(isDark: boolean, zoom = 0): PathOptions {
  const tone = isDark ? FAULT_STYLE.dark : FAULT_STYLE.light;
  return {
    color: tone.color,
    opacity: tone.opacity,
    weight: zoom >= FAULT_STYLE.zoomThreshold ? FAULT_STYLE.weightZoomedIn : FAULT_STYLE.weight,
    fill: false,
    interactive: false,
  };
}

// ---------------------------------------------------------------------------------------
// Panes and chrome constants
// ---------------------------------------------------------------------------------------

/**
 * Custom Leaflet panes. Leaflet's own: tilePane 200, overlayPane 400 (canvas events),
 * shadowPane 500, markerPane 600, tooltipPane 650, popupPane 700.
 */
export const MAP_PANES = Object.freeze({
  /** Fault lines: under the events. */
  faults: { name: 'faults', zIndex: 380 },
  /** Basemap place labels: above the events, never intercepting clicks. */
  labels: { name: 'labels', zIndex: 650 },
});

/** Tailwind classes shared by every card/chip overlaid on a map. */
export const MAP_OVERLAY_CLASS = 'border bg-background/95 backdrop-blur-sm rounded-md shadow-sm';

/** fitBounds options for the initial view (spec S3). */
export const FIT_BOUNDS_OPTIONS = Object.freeze({ padding: [24, 24] as [number, number], maxZoom: 9 });

/**
 * Zoom behaviour shared by every map: quarter-level zoom steps, so fitting to the data frames
 * it tightly (with whole levels a catalogue that needs zoom 5.8 was shown at 5, half the map
 * empty), half-level button and keyboard steps, and a gentler wheel.
 */
export const MAP_ZOOM_OPTIONS = Object.freeze({ zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 100 });
