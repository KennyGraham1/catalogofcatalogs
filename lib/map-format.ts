/**
 * Text formatting for map popups and map chrome: how a seismologist writes an event's
 * magnitude, position, depth and origin time. Pure (no DOM), shared by the React popup
 * (components/map/OptimizedEventPopup.tsx) and HTML-string popups of imperative maps.
 *
 * Origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z"), so every formatter here
 * is explicit about the zone; nothing reads the host timezone.
 */

/** Canonical spellings (IASPEI / QuakeML usage), keyed by lower case. */
const MAGNITUDE_TYPE_SPELLINGS: Record<string, string> = {
  m: 'M',
  ml: 'ML',
  mlv: 'MLv',
  mlr: 'MLr',
  mln: 'MLn',
  mw: 'Mw',
  mww: 'Mww',
  mwr: 'Mwr',
  mwc: 'Mwc',
  mwb: 'Mwb',
  mwp: 'Mwp',
  mwd: 'Mwd',
  'mw(mb)': 'Mw(mB)',
  ms: 'Ms',
  ms_20: 'Ms_20',
  ms_bb: 'Ms_BB',
  mb: 'mb',
  mb_lg: 'mb_Lg',
  mblg: 'mbLg',
  md: 'Md',
  mc: 'Mc',
  me: 'Me',
  mi: 'Mi',
  mh: 'Mh',
  mjma: 'Mjma',
};

/** Spellings whose case carries meaning and must be kept exactly as stored. */
const CASE_SENSITIVE_TYPES = new Set(['mB', 'mb', 'mB_BB']);

const UNKNOWN_TYPES = new Set(['', 'unknown', 'none', 'n/a', 'na', 'null', '-', '?']);

/**
 * Magnitude type as a seismologist writes it ('ML', 'Mw', 'mb', 'mB', 'MLv' ...), or ''
 * when the type is not reported. A generic 'M' is returned as 'M'.
 */
export function formatMagnitudeType(type: string | null | undefined): string {
  if (typeof type !== 'string') return '';
  const trimmed = type.trim();
  if (UNKNOWN_TYPES.has(trimmed.toLowerCase())) return '';
  if (CASE_SENSITIVE_TYPES.has(trimmed)) return trimmed;
  const known = MAGNITUDE_TYPE_SPELLINGS[trimmed.toLowerCase()];
  if (known) return known;
  // Unrecognised scale: keep the agency's spelling but capitalise a leading 'm'.
  return /^m/i.test(trimmed) ? `M${trimmed.slice(1)}` : trimmed;
}

/** "ML 2.6", "Mw 7.8", or "M 2.6" when the type is unknown; "M –" without a magnitude. */
export function formatMagnitude(magnitude: number | null | undefined, type?: string | null): string {
  const scale = formatMagnitudeType(type) || 'M';
  if (typeof magnitude !== 'number' || !Number.isFinite(magnitude)) return `${scale} –`;
  return `${scale} ${magnitude.toFixed(1)}`;
}

/** Wrap a longitude into (-180, 180]. */
function normaliseLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function hemisphere(value: number, positive: string, negative: string, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  // A value that rounds to zero has no hemisphere worth a minus sign.
  const letter = value < 0 && Number(text) !== 0 ? negative : positive;
  return `${text}° ${letter}`;
}

/** "40.379° S, 177.196° E": hemisphere letters, `digits` decimals (default 3, ~100 m). */
export function formatLatLon(latitude: number, longitude: number, digits = 3): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '–';
  return `${hemisphere(latitude, 'N', 'S', digits)}, ${hemisphere(normaliseLongitude(longitude), 'E', 'W', digits)}`;
}

/**
 * Whether a QuakeML depthType (or legacy label) says the depth was fixed, not solved for:
 * 'operator assigned', or any label containing 'fix'. Mirrors lib/merge.ts isFixedDepth.
 */
export function isFixedDepthType(depthType: string | null | undefined): boolean {
  if (typeof depthType !== 'string') return false;
  const lower = depthType.trim().toLowerCase();
  return lower === 'operator assigned' || /\bfix/.test(lower);
}

export interface DepthFields {
  depth: number | null | undefined;
  depth_uncertainty?: number | null;
  depth_type?: string | null;
}

/**
 * "12.0 km", "12.0 ± 2.1 km", "10.0 km (fixed)"; null when the depth is unknown. A fixed
 * depth never shows an uncertainty (the 0 many bulletins write beside it only records the
 * fixing).
 */
export function formatDepth({ depth, depth_uncertainty, depth_type }: DepthFields): string | null {
  if (typeof depth !== 'number' || !Number.isFinite(depth)) return null;
  if (isFixedDepthType(depth_type)) return `${depth.toFixed(1)} km (fixed)`;
  if (typeof depth_uncertainty === 'number' && Number.isFinite(depth_uncertainty) && depth_uncertainty > 0) {
    return `${depth.toFixed(1)} ± ${depth_uncertainty.toFixed(1)} km`;
  }
  return `${depth.toFixed(1)} km`;
}

/** "2020-08-13 16:23:50 UTC"; an unparseable value is returned verbatim. */
export function formatOriginTimeUtc(time: string | number | Date): string {
  const date = time instanceof Date ? time : new Date(time);
  if (Number.isNaN(date.getTime())) return String(time);
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

const PLACEHOLDER_REGIONS = new Set(['', 'unknown', 'unknown region', 'n/a', 'na', 'none', 'null', '-', '?']);

/** A region name worth printing (not empty, not an 'Unknown' placeholder). */
export function isKnownRegion(region: string | null | undefined): region is string {
  return typeof region === 'string' && !PLACEHOLDER_REGIONS.has(region.trim().toLowerCase());
}

/** "Q 67 (B)". */
export function formatQuality(score: number, grade?: string | null): string {
  const rounded = Math.round(score);
  return grade ? `Q ${rounded} (${grade})` : `Q ${rounded}`;
}

const COUNT_FORMAT = new Intl.NumberFormat('en-US');

/** "3,319" - fixed grouping so map chrome reads the same for every viewer. */
export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}
