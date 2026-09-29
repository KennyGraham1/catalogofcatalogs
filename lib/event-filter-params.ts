/**
 * Event filter parameters (shared contract C4).
 *
 * One strict parser for the event-filter query string, used by the filtered-events
 * route and by filtered exports, so both accept exactly the same filters and reject
 * the same bad input. Bare parseFloat/parseInt let '4,7' through as 4 and 'M4' as NaN,
 * which MongoDB then matched against nothing: a 200 with silently wrong or empty
 * results. Every value here must parse completely, be finite and lie in a sane range,
 * or the caller gets a 400 naming the parameter.
 *
 * This module is dependency-light on purpose (no MongoDB layer), so client code can
 * build and validate filter URLs with it. For the same reason it holds the controlled
 * vocabularies the filters validate against; lib/db.ts builds its ALLOWED_* sets from
 * these arrays, so ingest validation and filter validation cannot drift apart.
 */

import { normalizeTimestamp } from './earthquake-utils';
import { metricsFromEvent, scoreQualityMetrics } from './quality-scoring';

/** QuakeML 1.2 BED EventType enumeration (the 44 values of the BED XSD and ObsPy). */
export const QUAKEML_EVENT_TYPES = [
  'not existing', 'not reported', 'earthquake', 'anthropogenic event',
  'collapse', 'cavity collapse', 'mine collapse', 'building collapse',
  'explosion', 'accidental explosion', 'chemical explosion',
  'controlled explosion', 'experimental explosion', 'industrial explosion',
  'mining explosion', 'quarry blast', 'road cut', 'blasting levee',
  'nuclear explosion', 'induced or triggered event', 'rock burst',
  'reservoir loading', 'fluid injection', 'fluid extraction',
  'crash', 'plane crash', 'train crash', 'boat crash',
  'other event', 'atmospheric event', 'sonic boom', 'sonic blast',
  'acoustic noise', 'thunder', 'avalanche', 'snow avalanche',
  'debris avalanche', 'hydroacoustic event', 'ice quake', 'slide',
  'landslide', 'rockslide', 'meteorite', 'volcanic eruption',
] as const;

/**
 * Volcano-seismology labels accepted on ingest IN ADDITION to the BED enumeration,
 * because New Zealand volcanic catalogues classify events this way. They are not
 * QuakeML 1.2 values: a QuakeML document carrying them fails XSD validation and ObsPy
 * drops the event, so the QuakeML exporter maps them onto BED types (volcano-tectonic
 * and tectonic -> earthquake; tremor, volcanic tremor and volcanic -> other event) and
 * keeps the original label. CSV/JSON/GeoJSON exports carry them verbatim.
 */
export const NON_BED_EVENT_TYPES = [
  'tremor', 'volcanic tremor', 'volcano-tectonic', 'tectonic', 'volcanic',
] as const;

/** QuakeML 1.2 EvaluationStatus and EvaluationMode enumerations. */
export const EVALUATION_STATUSES = ['preliminary', 'confirmed', 'reviewed', 'final', 'rejected'] as const;
export const EVALUATION_MODES = ['manual', 'automatic'] as const;

export interface EventFilters {
  minMagnitude?: number;
  maxMagnitude?: number;
  /** km, positive down; hypocentres above the datum are negative. */
  minDepth?: number;
  maxDepth?: number;
  /** ISO 8601 UTC ('...Z'); the bounds are inclusive. */
  startTime?: string;
  endTime?: string;
  eventType?: string;
  magnitudeType?: string;
  evaluationStatus?: string;
  evaluationMode?: string;
  /** degrees */
  maxAzimuthalGap?: number;
  minUsedPhaseCount?: number;
  minUsedStationCount?: number;
  /** origin RMS, seconds */
  maxStandardError?: number;
  /**
   * Largest accepted horizontal location uncertainty, km. Matched against the same
   * value the quality score reads: the error-ellipse semi-major axis, else the
   * circular horizontal uncertainty, else the larger of the latitude/longitude
   * marginals converted to km.
   */
  maxHorizontalUncertainty?: number;
  /** km */
  maxDepthUncertainty?: number;
  /** seconds */
  maxTimeUncertainty?: number;
  /** magnitude units */
  maxMagnitudeUncertainty?: number;
  /** Stored event quality score Q (0-100) must be at least this. */
  minQuality?: number;
  // Geographic bounds. minLongitude > maxLongitude is a box that crosses the
  // antimeridian (RFC 7946 §5.2), e.g. 177 .. -178 for the Kermadec arc.
  minLatitude?: number;
  maxLatitude?: number;
  minLongitude?: number;
  maxLongitude?: number;
}

export type EventFilterParseResult =
  | { ok: true; filters: EventFilters }
  | { ok: false; error: string };

type NumericKey = {
  [K in keyof EventFilters]-?: EventFilters[K] extends number | undefined ? K : never;
}[keyof EventFilters];

interface NumericSpec {
  key: NumericKey;
  min: number;
  max: number;
  integer?: boolean;
  unit?: string;
}

/**
 * Accepted ranges. Magnitude, depth, latitude and longitude use the bounds ingest
 * enforces (lib/validation.ts), so a filter value no stored event could have is an
 * error rather than an empty result. Maxima of uncertainty-like quantities accept
 * anything non-negative up to a generous physical ceiling: a large maximum simply
 * does not constrain, but a negative one is a mistake.
 */
const NUMERIC_PARAMS: ReadonlyArray<NumericSpec> = [
  { key: 'minMagnitude', min: -3, max: 10 },
  { key: 'maxMagnitude', min: -3, max: 10 },
  { key: 'minDepth', min: -5, max: 1000, unit: 'km' },
  { key: 'maxDepth', min: -5, max: 1000, unit: 'km' },
  { key: 'maxAzimuthalGap', min: 0, max: 360, unit: 'degrees' },
  { key: 'minUsedPhaseCount', min: 0, max: 100000, integer: true },
  { key: 'minUsedStationCount', min: 0, max: 100000, integer: true },
  { key: 'maxStandardError', min: 0, max: 1000, unit: 's' },
  { key: 'maxHorizontalUncertainty', min: 0, max: 20000, unit: 'km' },
  { key: 'maxDepthUncertainty', min: 0, max: 1000, unit: 'km' },
  { key: 'maxTimeUncertainty', min: 0, max: 86400, unit: 's' },
  { key: 'maxMagnitudeUncertainty', min: 0, max: 10 },
  { key: 'minQuality', min: 0, max: 100 },
  { key: 'minLatitude', min: -90, max: 90, unit: 'degrees' },
  { key: 'maxLatitude', min: -90, max: 90, unit: 'degrees' },
  { key: 'minLongitude', min: -180, max: 180, unit: 'degrees' },
  { key: 'maxLongitude', min: -180, max: 180, unit: 'degrees' },
];

const TIME_PARAMS = ['startTime', 'endTime'] as const;
const VOCABULARY_PARAMS: ReadonlyArray<{ key: 'eventType' | 'evaluationStatus' | 'evaluationMode'; values: ReadonlyArray<string> }> = [
  { key: 'eventType', values: [...QUAKEML_EVENT_TYPES, ...NON_BED_EVENT_TYPES] },
  { key: 'evaluationStatus', values: EVALUATION_STATUSES },
  { key: 'evaluationMode', values: EVALUATION_MODES },
];

/** Every query parameter this parser reads, in canonical order. */
export const EVENT_FILTER_PARAM_NAMES: ReadonlyArray<keyof EventFilters> = [
  'minMagnitude', 'maxMagnitude', 'minDepth', 'maxDepth', 'startTime', 'endTime',
  'eventType', 'magnitudeType', 'evaluationStatus', 'evaluationMode',
  'maxAzimuthalGap', 'minUsedPhaseCount', 'minUsedStationCount', 'maxStandardError',
  'maxHorizontalUncertainty', 'maxDepthUncertainty', 'maxTimeUncertainty', 'maxMagnitudeUncertainty',
  'minQuality', 'minLatitude', 'maxLatitude', 'minLongitude', 'maxLongitude',
];

// A plain decimal, optionally signed, with an optional exponent. Number() alone also
// accepts '0x10', '0b1', 'Infinity' and whitespace-only strings.
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const MAGNITUDE_TYPE = /^[A-Za-z][A-Za-z0-9_.()-]{0,19}$/;

/**
 * Parse and validate event filters from a query string.
 *
 * Absent or empty parameters are ignored; unknown parameters are ignored (the export
 * route shares its query string with `format` and `metadata`). Anything present but
 * unusable is an error, including a parameter given twice with different values.
 */
export function parseEventFilterParams(searchParams: URLSearchParams): EventFilterParseResult {
  const filters: EventFilters = {};

  const single = (name: string): { value?: string; error?: string } => {
    const values = searchParams.getAll(name).map((v) => v.trim()).filter((v) => v !== '');
    if (values.length === 0) return {};
    if (values.some((v) => v !== values[0])) {
      return { error: `Parameter ${name} was given more than once with different values` };
    }
    return { value: values[0] };
  };

  for (const spec of NUMERIC_PARAMS) {
    const { value, error } = single(spec.key);
    if (error) return { ok: false, error };
    if (value === undefined) continue;
    const range = `${spec.min} to ${spec.max}${spec.unit ? ` ${spec.unit}` : ''}`;
    if (!DECIMAL.test(value)) {
      return { ok: false, error: `Invalid ${spec.key}: "${value}" is not a number (use a decimal point, e.g. 4.7)` };
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < spec.min || n > spec.max) {
      return { ok: false, error: `Invalid ${spec.key}: ${value}. Must be between ${range}` };
    }
    if (spec.integer && !Number.isInteger(n)) {
      return { ok: false, error: `Invalid ${spec.key}: ${value}. Must be a whole number` };
    }
    filters[spec.key] = n;
  }

  for (const key of TIME_PARAMS) {
    const { value, error } = single(key);
    if (error) return { ok: false, error };
    if (value === undefined) continue;
    // normalizeTimestamp reads a string without a zone as UTC, the platform-wide
    // convention for origin times, and returns ISO 8601 with 'Z' so the string
    // comparison against stored times is chronological.
    const normalized = normalizeTimestamp(value);
    if (!normalized) {
      return { ok: false, error: `Invalid ${key}: could not parse "${value}" as a date/time` };
    }
    filters[key] = normalized;
  }

  for (const { key, values } of VOCABULARY_PARAMS) {
    const { value, error } = single(key);
    if (error) return { ok: false, error };
    if (value === undefined) continue;
    const normalized = value.toLowerCase();
    if (values.indexOf(normalized) === -1) {
      return { ok: false, error: `Invalid ${key}: "${value}". Allowed: ${values.join(', ')}` };
    }
    filters[key] = normalized;
  }

  {
    const { value, error } = single('magnitudeType');
    if (error) return { ok: false, error };
    if (value !== undefined) {
      // Free-form (ML, Mw, mb, Mw(mB), MLv ...) but bounded: it becomes a query term.
      if (!MAGNITUDE_TYPE.test(value)) {
        return { ok: false, error: `Invalid magnitudeType: "${value}"` };
      }
      filters.magnitudeType = value;
    }
  }

  const ordered: Array<[NumericKey, NumericKey, string]> = [
    ['minMagnitude', 'maxMagnitude', 'magnitude'],
    ['minDepth', 'maxDepth', 'depth'],
    ['minLatitude', 'maxLatitude', 'latitude'],
  ];
  for (const [lo, hi, label] of ordered) {
    const a = filters[lo];
    const b = filters[hi];
    if (a !== undefined && b !== undefined && a > b) {
      return { ok: false, error: `Invalid ${label} range: ${lo} (${a}) is greater than ${hi} (${b})` };
    }
  }
  // Both bounds are toISOString() output, so string order is chronological order.
  if (filters.startTime !== undefined && filters.endTime !== undefined && filters.startTime > filters.endTime) {
    return { ok: false, error: `Invalid time range: startTime (${filters.startTime}) is after endTime (${filters.endTime})` };
  }
  // Longitude is deliberately absent above: minLongitude > maxLongitude is the
  // antimeridian-crossing box, not an error.

  return { ok: true, filters };
}

/** True when at least one filter is set. */
export function hasEventFilters(filters: EventFilters | null | undefined): boolean {
  if (!filters) return false;
  return EVENT_FILTER_PARAM_NAMES.some((key) => filters[key] !== undefined);
}

/**
 * Serialise filters back to query parameters in canonical order, e.g. to build a
 * link or record in export metadata exactly which filter produced a file. The
 * result parses back to the same filters.
 */
export function eventFiltersToSearchParams(filters: EventFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of EVENT_FILTER_PARAM_NAMES) {
    const value = filters[key];
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}

// ---------------------------------------------------------------------------
// Matching rules shared by the server query (lib/db.ts buildEventFilterQuery) and the
// client-side table filter (components/event-filters.tsx applyEventFilters). The table a
// user sees and the file "Export filtered events" downloads must hold the same events,
// so both sides take their rules from here, and eventMatchesFilters below applies them
// exactly as MongoDB evaluates the server query.
// ---------------------------------------------------------------------------

function escapeRegExpSource(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A value of a lower-case controlled vocabulary (event type, evaluation status/mode), in any case. */
export function vocabularyPattern(value: string): RegExp {
  return new RegExp(`^${escapeRegExpSource(value.trim())}$`, 'i');
}

// The broadband body-wave magnitude is written mB (ISC mB, SeisComP mB_BB) and is a
// different scale from short-period mb; only this mixed-case spelling marks it (an
// all-caps MB is short-period mb in upper case, and mB followed by Lg is the regional
// mb_Lg). Same rule as lib/merge.ts getMagnitudeTypeCategory.
const BROADBAND_BODY_WAVE = 'mB(?![_ ]?[lL][gG])';
const isBroadbandAt = (type: string, i: number) =>
  type[i] === 'm' && type[i + 1] === 'B' && !/^[_ ]?[lL][gG]/.test(type.slice(i + 2));

/**
 * The stored magnitude types that are the given one: the same code in any letter case
 * (ML = Ml, Mw = MW, Mw(mB) = MW(mB)), except that the case-significant broadband mB
 * matches only itself, so filtering by mb does not return mB events or the reverse.
 */
export function magnitudeTypePattern(type: string): RegExp {
  const t = type.trim();
  let source = '';
  for (let i = 0; i < t.length; i++) {
    if (isBroadbandAt(t, i)) {
      source += 'mB';
      i++;
      continue;
    }
    const ch = t[i];
    const lower = ch.toLowerCase();
    const upper = ch.toUpperCase();
    // An mb in any other case is short-period mb: it must not match a stored mB there.
    if (lower === 'm' && (t[i + 1] ?? '').toLowerCase() === 'b') source += `(?!${BROADBAND_BODY_WAVE})`;
    source += lower !== upper ? `[${lower}${upper}]` : escapeRegExpSource(ch);
  }
  return new RegExp(`^${source}$`);
}

/**
 * Horizontal location uncertainty (km) exactly as the quality score reads it — the
 * error-ellipse semi-major axis, else the circular value, else the larger lat/lon
 * marginal converted to km; a value outside its valid range counts as absent — or null.
 */
export function eventHorizontalUncertaintyKm(event: unknown): number | null {
  return metricsFromEvent(event).horizontalUncertainty ?? null;
}

/**
 * The quality score Q a filter compares: the stored score, or for a row stored before
 * scores were persisted the score computed with the same function inserts use. The
 * server scores such rows before a minQuality query (lib/db.ts), so both sides agree.
 */
export function eventQualityScore(event: unknown): number {
  const stored = event && typeof event === 'object' ? (event as { quality_score?: unknown }).quality_score : undefined;
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  return scoreQualityMetrics(metricsFromEvent(event)).overall;
}

/**
 * Whether one event row passes `filters`, with the semantics MongoDB gives the server's
 * query (lib/db.ts buildEventFilterQuery): a bound matches only a value of its own type
 * (a number for numeric filters, a string for times, compared as stored), a missing
 * value never passes, maxima of non-negative quantities need a value of at least 0,
 * and a longitude range ending at +180 or -180 also takes the other spelling of the seam.
 */
export function eventMatchesFilters(event: object, filters: EventFilters): boolean {
  const e = event as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === 'number';
  const inRange = (v: unknown, lo?: number, hi?: number) =>
    num(v) && (lo === undefined || v >= lo) && (hi === undefined || v <= hi);
  const bound = (value: string | undefined) => (value ? normalizeTimestamp(value) ?? value : undefined);
  const matchesPattern = (v: unknown, pattern: RegExp) => typeof v === 'string' && pattern.test(v);

  if ((filters.minMagnitude !== undefined || filters.maxMagnitude !== undefined) &&
      !inRange(e.magnitude, filters.minMagnitude, filters.maxMagnitude)) return false;
  if ((filters.minDepth !== undefined || filters.maxDepth !== undefined) &&
      !inRange(e.depth, filters.minDepth, filters.maxDepth)) return false;

  const start = bound(filters.startTime);
  const end = bound(filters.endTime);
  if (start !== undefined || end !== undefined) {
    const t = e.time;
    if (typeof t !== 'string' || (start !== undefined && t < start) || (end !== undefined && t > end)) return false;
  }

  if (filters.eventType && !matchesPattern(e.event_type, vocabularyPattern(filters.eventType))) return false;
  if (filters.magnitudeType && !matchesPattern(e.magnitude_type, magnitudeTypePattern(filters.magnitudeType))) return false;
  if (filters.evaluationStatus && !matchesPattern(e.evaluation_status, vocabularyPattern(filters.evaluationStatus))) return false;
  if (filters.evaluationMode && !matchesPattern(e.evaluation_mode, vocabularyPattern(filters.evaluationMode))) return false;

  if (filters.maxAzimuthalGap !== undefined && !inRange(e.azimuthal_gap, 0, filters.maxAzimuthalGap)) return false;
  if (filters.minUsedPhaseCount !== undefined && !inRange(e.used_phase_count, filters.minUsedPhaseCount)) return false;
  if (filters.minUsedStationCount !== undefined && !inRange(e.used_station_count, filters.minUsedStationCount)) return false;
  if (filters.maxStandardError !== undefined && !inRange(e.standard_error, 0, filters.maxStandardError)) return false;
  if (filters.maxDepthUncertainty !== undefined && !inRange(e.depth_uncertainty, 0, filters.maxDepthUncertainty)) return false;
  if (filters.maxTimeUncertainty !== undefined && !inRange(e.time_uncertainty, 0, filters.maxTimeUncertainty)) return false;
  if (filters.maxMagnitudeUncertainty !== undefined && !inRange(e.magnitude_uncertainty, 0, filters.maxMagnitudeUncertainty)) return false;
  if (filters.maxHorizontalUncertainty !== undefined) {
    const horizontal = eventHorizontalUncertaintyKm(event);
    if (horizontal === null || horizontal > filters.maxHorizontalUncertainty) return false;
  }
  if (filters.minQuality !== undefined && !(eventQualityScore(event) >= filters.minQuality)) return false;

  if ((filters.minLatitude !== undefined || filters.maxLatitude !== undefined) &&
      !inRange(e.latitude, filters.minLatitude, filters.maxLatitude)) return false;
  const { minLongitude: west, maxLongitude: east } = filters;
  if (west !== undefined && east !== undefined && west > east) {
    // A box crossing the antimeridian: the two arcs either side of 180.
    if (!(inRange(e.longitude, west) || inRange(e.longitude, undefined, east))) return false;
  } else if (west !== undefined || east !== undefined) {
    const onSeam = (west === -180 && e.longitude === 180) || (east === 180 && e.longitude === -180);
    if (!inRange(e.longitude, west, east) && !onSeam) return false;
  }

  return true;
}
