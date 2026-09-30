/**
 * QuakeML 1.2 Exporter
 * Converts database events to QuakeML 1.2 XML format
 */

import {
  coalesce,
  describeDeclustering,
  eventLineage,
  exportChecksumOf,
  joinChunks,
  parseSourceEvents,
  publishedSolutionMember,
  sameHypocentre,
  utcEpoch,
} from './exporters';
import type {
  DeclusterTag,
  EventLineage,
  ExportMetadata,
  ExportableEvent,
  SourceEventMember,
} from './exporters';
import { stripXmlIllegalChars, toUtcIsoString } from './export-utils';
import { QUAKEML_EVENT_TYPES, QUAKEML_ORIGIN_DEPTH_TYPES } from './types/quakeml';
import type {
  Origin,
  OriginQuality,
  OriginUncertainty,
  Magnitude,
  CreationInfo,
  Comment,
  EventDescription,
  Pick,
  Arrival,
  Amplitude,
  StationMagnitude,
  StationMagnitudeContribution,
  FocalMechanism,
  NodalPlane,
  Axis,
  MomentTensor,
  WaveformStreamID,
  CompositeTime,
  DataUsed,
  EventType,
  OriginDepthType,
} from './types/quakeml';

// ---------------------------------------------------------------------------
// Values written into the document
//
// Blobs from CSV/JSON/GeoJSON uploads reach the database without a schema check
// (lib/parsed-event-to-db.ts passes them through), so a slot this exporter expects to hold a
// number, boolean or timestamp may hold any JSON value. Every such value is checked against its
// XML Schema type and dropped when it is not a valid lexical value of that type; nothing is
// interpolated raw. A string in a numeric or time slot used to be written verbatim, so a crafted
// origin time could close its element and inject a forged <origin>, and a lone "&" made the whole
// export unparseable. Text goes through escapeXml.
// ---------------------------------------------------------------------------

const NUMERIC_LITERAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A finite xs:double, from a number or a numeric-literal string; null otherwise. */
function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!NUMERIC_LITERAL.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

/** An xs:integer; null for anything else, including 3.5. */
function integerNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

/** The canonical xs:boolean lexical form; null for anything else. */
function xmlBoolean(value: unknown): 'true' | 'false' | null {
  if (value === true || value === 1 || value === 'true' || value === '1') return 'true';
  if (value === false || value === 0 || value === 'false' || value === '0') return 'false';
  return null;
}

// xs:dateTime lexical form (the zone designator is optional in XML Schema), captured so the
// value can be checked against the calendar: the lexical pattern alone let
// "2019-13-45T25:61:61Z" through, which made the whole document schema-invalid.
const XS_DATE_TIME = /^(-?\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))?$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** An xs:dateTime string from a stored blob, valid as a calendar date and time; null otherwise. */
function xmlDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const parts = text.match(XS_DATE_TIME);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  // XML Schema 1.0 has no year 0000. Leap years are proleptic Gregorian; a negative year
  // counts BCE with no year zero, so -0001 is astronomical year 0.
  if (year === 0 || month < 1 || month > 12 || day < 1) return null;
  const astronomical = year > 0 ? year : year + 1;
  const leap = (astronomical % 4 === 0 && astronomical % 100 !== 0) || astronomical % 400 === 0;
  if (day > (month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1])) return null;
  if (Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) return null;
  if (parts[7]) {
    const offsetMinutes = Number(parts[8]) * 60 + Number(parts[9]);
    if (Number(parts[9]) > 59 || offsetMinutes > 14 * 60) return null;
  }
  return text;
}

/**
 * A row timestamp column as xs:dateTime. Row times are ISO 8601 UTC, but a legacy value written
 * with a space separator or without seconds is re-rendered (as UTC) rather than dropped.
 */
function rowDateTime(value: unknown): string | null {
  const direct = xmlDateTime(value);
  if (direct) return direct;
  const epoch = utcEpoch(value);
  return epoch === null ? null : new Date(epoch).toISOString();
}

function textOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Escape text for element content or an attribute value. Characters XML 1.0 forbids even when
 * escaped (C0 controls, U+FFFE/U+FFFF) are dropped: one vertical tab in a region name made the
 * whole multi-event document unreadable.
 */
function escapeXml(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return stripXmlIllegalChars(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** The object elements of a stored JSON array (JSON text or already parsed); [] otherwise. */
function parseBlobArray<T>(value: unknown): T[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)) as T[]
    : [];
}

/** A stored JSON object (JSON text or already parsed); null otherwise. */
function parseBlobObject<T>(value: unknown): T | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
}

function textElement(indent: string, tag: string, value: unknown): string {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return '';
  return `${indent}<${tag}>${escapeXml(value)}</${tag}>\n`;
}

// ---------------------------------------------------------------------------
// Values the schema constrains beyond their base type. A stored blob (or a free-form scalar
// column) may hold a value outside those constraints — "Manual", "Point", an 80-character
// agency ID — and one such value made the WHOLE multi-event document XSD-invalid. They are
// normalised here, and whatever cannot be represented is recorded in a comment on the
// nearest object that carries comments (`notes`), so nothing is silently lost.
// ---------------------------------------------------------------------------

/** QuakeML-BED-1.2.xsd enumerations (besides EventType / OriginDepthType, handled above). */
const BED_ENUMERATIONS = {
  EventDescriptionType: ['felt report', 'Flinn-Engdahl region', 'local time', 'tectonic summary', 'nearest cities', 'earthquake name', 'region name'],
  EventTypeCertainty: ['known', 'suspected'],
  OriginType: ['hypocenter', 'centroid', 'amplitude', 'macroseismic', 'rupture start', 'rupture end'],
  OriginUncertaintyDescription: ['horizontal uncertainty', 'uncertainty ellipse', 'confidence ellipsoid'],
  EvaluationMode: ['manual', 'automatic'],
  EvaluationStatus: ['preliminary', 'confirmed', 'reviewed', 'final', 'rejected'],
  AmplitudeCategory: ['point', 'mean', 'duration', 'period', 'integral', 'other'],
  AmplitudeUnit: ['m', 's', 'm/s', 'm/(s*s)', 'm*s', 'dimensionless', 'other'],
  PickOnset: ['emergent', 'impulsive', 'questionable'],
  PickPolarity: ['positive', 'negative', 'undecidable'],
  DataUsedWaveType: ['P waves', 'body waves', 'surface waves', 'mantle waves', 'combined', 'unknown'],
  MomentTensorCategory: ['teleseismic', 'regional'],
  MTInversionType: ['general', 'zero trace', 'double couple'],
  SourceTimeFunctionType: ['box car', 'triangle', 'trapezoid', 'unknown'],
} as const;
type BedEnumeration = keyof typeof BED_ENUMERATIONS;

const ENUMERATION_BY_LOWERCASE = {} as Record<BedEnumeration, Map<string, string>>;
(Object.keys(BED_ENUMERATIONS) as BedEnumeration[]).forEach(name => {
  ENUMERATION_BY_LOWERCASE[name] = new Map<string, string>(
    (BED_ENUMERATIONS[name] as readonly string[]).map(value => [value.toLowerCase(), value] as [string, string])
  );
});

/**
 * The BED spelling of an enumerated value, matched case-insensitively ("Manual" -> "manual",
 * "Region Name" -> "region name"); null (and a note) when it is not a value of the enumeration.
 */
function enumerationValue(enumeration: BedEnumeration, value: unknown, label: string, notes?: string[]): string | null {
  const text = typeof value === 'object' ? null : textOrNull(value);
  if (text === null) return null;
  const canonical = ENUMERATION_BY_LOWERCASE[enumeration].get(text.replace(/\s+/g, ' ').toLowerCase());
  if (canonical !== undefined) return canonical;
  notes?.push(`${label}="${text}" (not a QuakeML ${enumeration} value; dropped)`);
  return null;
}

function enumerationElement(indent: string, tag: string, value: unknown, enumeration: BedEnumeration, notes?: string[]): string {
  const canonical = enumerationValue(enumeration, value, tag, notes);
  return canonical === null ? '' : `${indent}<${tag}>${escapeXml(canonical)}</${tag}>\n`;
}

/**
 * Text within a maxLength facet of the schema (counted in characters, i.e. code points), cut to
 * the limit when longer, with the full value kept in a note.
 */
function limitedText(value: unknown, maxLength: number, label: string, notes?: string[]): string | null {
  const text = typeof value === 'object' ? null : textOrNull(value);
  if (text === null) return null;
  const characters = Array.from(text);
  if (characters.length <= maxLength) return text;
  notes?.push(`${label}="${text}" (longer than the schema's ${maxLength}-character limit; shortened)`);
  return characters.slice(0, maxLength).join('');
}

function limitedTextElement(indent: string, tag: string, value: unknown, maxLength: number, notes?: string[]): string {
  const text = limitedText(value, maxLength, tag, notes);
  return text === null ? '' : `${indent}<${tag}>${escapeXml(text)}</${tag}>\n`;
}

/** A timestamp element; an invalid stored value is dropped and noted. */
function notedDateTimeElement(indent: string, tag: string, value: unknown, notes?: string[]): string {
  const time = xmlDateTime(value);
  if (time === null && value !== null && value !== undefined && value !== '') {
    notes?.push(`${tag}="${typeof value === 'object' ? JSON.stringify(value) : String(value)}" (not a valid date-time; dropped)`);
  }
  return time === null ? '' : `${indent}<${tag}>${escapeXml(time)}</${tag}>\n`;
}

/** One comment recording the values an object could not carry (see the section note above). */
function notesComment(notes: string[], indent: string): string {
  if (notes.length === 0) return '';
  return formatComment({ text: `Stored values not representable in QuakeML 1.2 BED: ${notes.join('; ')}` }, indent);
}

function numberElement(indent: string, tag: string, value: unknown): string {
  const number = finiteNumber(value);
  return number === null ? '' : `${indent}<${tag}>${number}</${tag}>\n`;
}

function integerElement(indent: string, tag: string, value: unknown): string {
  const number = integerNumber(value);
  return number === null ? '' : `${indent}<${tag}>${number}</${tag}>\n`;
}

function booleanElement(indent: string, tag: string, value: unknown): string {
  const flag = xmlBoolean(value);
  return flag === null ? '' : `${indent}<${tag}>${flag}</${tag}>\n`;
}

function dateTimeElement(indent: string, tag: string, value: unknown): string {
  const time = xmlDateTime(value);
  return time === null ? '' : `${indent}<${tag}>${escapeXml(time)}</${tag}>\n`;
}

function referenceElement(indent: string, tag: string, value: unknown, kind: string): string {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return '';
  return `${indent}<${tag}>${escapeXml(toResourceID(value, kind))}</${tag}>\n`;
}

type QuantityKind = 'real' | 'integer' | 'time';

/**
 * A RealQuantity / IntegerQuantity / TimeQuantity element, or '' when its value is not a valid
 * lexical value of the type (the element is then omitted rather than emitted empty or raw).
 */
function quantityElement(indent: string, tag: string, quantity: unknown, kind: QuantityKind): string {
  if (!quantity || typeof quantity !== 'object') return '';
  const q = quantity as Record<string, unknown>;
  const value = kind === 'time'
    ? xmlDateTime(q.value)
    : kind === 'integer' ? integerNumber(q.value) : finiteNumber(q.value);
  if (value === null) return '';
  const inner = indent + '  ';
  // IntegerQuantity's uncertainties are xs:integer; every other bound is xs:double.
  const bound = kind === 'integer' ? integerElement : numberElement;
  let xml = `${indent}<${tag}>\n`;
  xml += `${inner}<value>${kind === 'time' ? escapeXml(value) : value}</value>\n`;
  xml += bound(inner, 'uncertainty', q.uncertainty);
  xml += bound(inner, 'lowerUncertainty', q.lowerUncertainty);
  xml += bound(inner, 'upperUncertainty', q.upperUncertainty);
  xml += numberElement(inner, 'confidenceLevel', q.confidenceLevel);
  xml += `${indent}</${tag}>\n`;
  return xml;
}

// ---------------------------------------------------------------------------
// Resource identifiers
// ---------------------------------------------------------------------------

/**
 * QuakeML BED 1.2 ResourceIdentifier grammar (QuakeML-BED-1.2.xsd, simpleType
 * ResourceIdentifier, which ResourceReference also derives from):
 * (smi|quakeml):[\w\d][\w\d\-\.\*\(\)_~']{2,}/[\w\d\-\.\*\(\)_~'][\w\d\-\.\*\(\)\+\?_~'=,;#/&]*
 * Every publicID attribute and every *ID / *URI reference element is constrained
 * by it, so a bare identifier carried over from a CSV/GeoJSON upload (e.g.
 * "2016p858000") or a bare method name (e.g. "NonLinLoc") makes the exported
 */
const BED_RESOURCE_ID_PATTERN =
  /^(?:smi|quakeml):[A-Za-z0-9_][A-Za-z0-9_\-.*()~']{2,}\/[A-Za-z0-9_\-.*()~'][A-Za-z0-9_\-.*()+?~'=,;#/&]*$/;

/**
 * Coerce an identifier to a conformant QuakeML ResourceIdentifier.
 */
function toResourceID(
  value: unknown,
  kind: string,
  fallbackID: unknown = 'unknown'
): string {
  const raw = value === null || value === undefined || typeof value === 'object' ? '' : String(value).trim();
  if (BED_RESOURCE_ID_PATTERN.test(raw)) return raw;
  const source = raw || (fallbackID === null || fallbackID === undefined ? '' : String(fallbackID).trim());
  // Injective escaping. Mapping every disallowed character to "_" collapsed distinct
  // identifiers ("a/b" and "a:b" both became a_b), merging two events' identities on
  // export. Each disallowed byte is instead encoded as ~XX (hex), using "~", which the
  // grammar permits, as the escape lead; a literal "~" is doubled so the map stays 1:1.
  const sanitised = source
    .replace(/~/g, '~~')
    .replace(/[^A-Za-z0-9_\-.*()~']/gu, (ch) => {
      // Two hex digits for a Latin-1 code point; a 'u' marker (not a hex digit, so it
      // cannot be confused with a two-digit escape followed by literal hex characters)
      // and exactly six digits above that. Variable widths collide: U+0100 + '00'
      // and U+10000 must not both encode as ~u010000.
      const cp = ch.codePointAt(0)!;
      const hex = cp.toString(16).toUpperCase();
      return cp < 0x100 ? '~' + hex.padStart(2, '0') : '~u' + hex.padStart(6, '0');
    }) || 'unknown';
  return `smi:local/${kind}/${sanitised}`;
}

/**
 * An identifier for a child object stored without one, derived from its parent's
 * ("<parent>#arrival-2"). BED requires a publicID on Arrival and MomentTensor; the fragment keeps
 * it deterministic, unique within the parent and inside the ResourceIdentifier grammar.
 */
function childResourceID(parentID: string, fragment: string, kind: string): string {
  const candidate = `${parentID}#${fragment}`;
  return BED_RESOURCE_ID_PATTERN.test(candidate) ? candidate : toResourceID(`${parentID}-${fragment}`, kind);
}

/** `id`, or `id-2`, `id-3`, ... when already taken; the result is recorded in `used`. */
function uniqueResourceID(id: string, used: Set<string>): string {
  let candidate = id;
  for (let suffix = 2; used.has(candidate); suffix++) candidate = `${id}-${suffix}`;
  used.add(candidate);
  return candidate;
}

// ---------------------------------------------------------------------------
// QuakeML 1.2 BED enumerations. lib/db.ts accepts a few labels outside them (its vocabulary is
// owned there); exporting those verbatim made the document XSD-invalid and ObsPy dropped the
// event ("does not comply with QuakeML standard -- event will be ignored"). They are mapped to
// the closest BED value here and the original label is kept in a comment.
// ---------------------------------------------------------------------------

const EVENT_TYPE_BY_LOWERCASE = new Map<string, EventType>(
  QUAKEML_EVENT_TYPES.map(type => [type.toLowerCase(), type] as [string, EventType])
);

const EVENT_TYPE_FALLBACK: Record<string, EventType> = {
  // Volcano-tectonic events are brittle-failure earthquakes in a volcanic setting.
  'volcano-tectonic': 'earthquake',
  'tectonic': 'earthquake',
  // BED has no tremor or generic volcanic class, and "volcanic eruption" would assert an
  // eruption the label does not.
  'tremor': 'other event',
  'volcanic tremor': 'other event',
  'volcanic': 'other event',
};

/** The BED EventType to export for a stored label, and the label itself when it is not one. */
function bedEventType(label: unknown): { value: EventType | null; original: string | null } {
  const original = textOrNull(label);
  if (original === null) return { value: null, original: null };
  const exact = EVENT_TYPE_BY_LOWERCASE.get(original.toLowerCase());
  if (exact) return { value: exact, original: null };
  return { value: EVENT_TYPE_FALLBACK[original.toLowerCase()] ?? 'other event', original };
}

const DEPTH_TYPE_BY_LOWERCASE = new Map<string, OriginDepthType>(
  QUAKEML_ORIGIN_DEPTH_TYPES.map(type => [type.toLowerCase(), type] as [string, OriginDepthType])
);

const DEPTH_TYPE_FALLBACK: Record<string, OriginDepthType> = {
  // S-P times at near stations are a direct-phase constraint on depth.
  'constrained by s-p time differences': 'constrained by direct phases',
};

/**
 * The BED OriginDepthType to export for a stored label (matched case-insensitively: stored
 * labels are lowercased, while BED spells "broad-band P waveforms"), plus a comment keeping a
 * label that is not a BED value.
 */
function bedDepthType(label: unknown): { value: OriginDepthType | null; note: Comment | null } {
  const original = textOrNull(label);
  if (original === null) return { value: null, note: null };
  const exact = DEPTH_TYPE_BY_LOWERCASE.get(original.toLowerCase());
  if (exact) return { value: exact, note: null };
  const value = DEPTH_TYPE_FALLBACK[original.toLowerCase()] ?? 'other';
  return {
    value,
    note: {
      text: `Depth type reported by the source: "${original}" (not a QuakeML 1.2 BED OriginDepthType; exported as "${value}")`,
    },
  };
}

// ---------------------------------------------------------------------------
// Element formatters. Each returns the element followed by a newline, or '' when omitted.
// `notes` collects stored values an element could not carry (see limitedText and
// enumerationValue); the object that owns them writes them as one comment.
// ---------------------------------------------------------------------------

/** CreationInfo, with the schema's maxLength limits on agencyID, author and version. */
function formatCreationInfo(info: unknown, indent: string, notes?: string[]): string {
  if (!info || typeof info !== 'object') return '';
  const ci = info as CreationInfo;
  const inner = indent + '  ';
  const body =
    limitedTextElement(inner, 'agencyID', ci.agencyID, 64, notes) +
    referenceElement(inner, 'agencyURI', ci.agencyURI, 'agency') +
    limitedTextElement(inner, 'author', ci.author, 128, notes) +
    referenceElement(inner, 'authorURI', ci.authorURI, 'author') +
    notedDateTimeElement(inner, 'creationTime', ci.creationTime, notes) +
    limitedTextElement(inner, 'version', ci.version, 64, notes);
  return body ? `${indent}<creationInfo>\n${body}${indent}</creationInfo>\n` : '';
}

function formatComment(comment: Comment, indent: string, notes?: string[]): string {
  // QuakeML BED 1.2 Comment: text (+ optional creationInfo) are the only child
  // elements; the identifier is the `id` ATTRIBUTE (type ResourceReference).
  const idAttr = textOrNull(comment.id) ? ` id="${escapeXml(toResourceID(comment.id, 'comment'))}"` : '';
  const text = typeof comment.text === 'object' ? '' : comment.text;
  return `${indent}<comment${idAttr}>\n` +
    `${indent}  <text>${escapeXml(text)}</text>\n` +
    formatCreationInfo(comment.creationInfo, indent + '  ', notes) +
    `${indent}</comment>\n`;
}

function formatComments(comments: unknown, indent: string, notes?: string[]): string {
  return parseBlobArray<Comment>(comments).map(comment => formatComment(comment, indent, notes)).join('');
}

function formatEventDescription(description: EventDescription, indent: string, notes?: string[]): string {
  const text = typeof description.text === 'object' ? '' : description.text;
  return `${indent}<description>\n` +
    `${indent}  <text>${escapeXml(text)}</text>\n` +
    enumerationElement(indent + '  ', 'type', description.type, 'EventDescriptionType', notes) +
    `${indent}</description>\n`;
}

function formatCompositeTime(compositeTime: CompositeTime, indent: string): string {
  const inner = indent + '  ';
  return `${indent}<compositeTime>\n` +
    quantityElement(inner, 'year', compositeTime.year, 'integer') +
    quantityElement(inner, 'month', compositeTime.month, 'integer') +
    quantityElement(inner, 'day', compositeTime.day, 'integer') +
    quantityElement(inner, 'hour', compositeTime.hour, 'integer') +
    quantityElement(inner, 'minute', compositeTime.minute, 'integer') +
    quantityElement(inner, 'second', compositeTime.second, 'real') +
    `${indent}</compositeTime>\n`;
}

function formatOriginQuality(quality: unknown, indent: string, notes?: string[]): string {
  if (!quality || typeof quality !== 'object') return '';
  const q = quality as OriginQuality;
  const inner = indent + '  ';
  // BED sequence: associatedStationCount precedes usedStationCount, depthPhaseCount
  // follows it. Both were parsed and mapped but never written, so a round trip lost them.
  const body =
    integerElement(inner, 'associatedPhaseCount', q.associatedPhaseCount) +
    integerElement(inner, 'usedPhaseCount', q.usedPhaseCount) +
    integerElement(inner, 'associatedStationCount', q.associatedStationCount) +
    integerElement(inner, 'usedStationCount', q.usedStationCount) +
    integerElement(inner, 'depthPhaseCount', q.depthPhaseCount) +
    numberElement(inner, 'azimuthalGap', q.azimuthalGap) +
    numberElement(inner, 'minimumDistance', q.minimumDistance) +
    numberElement(inner, 'maximumDistance', q.maximumDistance) +
    numberElement(inner, 'medianDistance', q.medianDistance) +
    numberElement(inner, 'secondaryAzimuthalGap', q.secondaryAzimuthalGap) +
    limitedTextElement(inner, 'groundTruthLevel', q.groundTruthLevel, 32, notes) +
    numberElement(inner, 'standardError', q.standardError);
  return body ? `${indent}<quality>\n${body}${indent}</quality>\n` : '';
}

const CONFIDENCE_ELLIPSOID_FIELDS = [
  'semiMajorAxisLength',
  'semiMinorAxisLength',
  'semiIntermediateAxisLength',
  'majorAxisPlunge',
  'majorAxisAzimuth',
  'majorAxisRotation',
] as const;

function formatOriginUncertainty(uncertainty: unknown, indent: string, notes?: string[]): string {
  if (!uncertainty || typeof uncertainty !== 'object') return '';
  const u = uncertainty as OriginUncertainty;
  const inner = indent + '  ';
  let body =
    numberElement(inner, 'horizontalUncertainty', u.horizontalUncertainty) +
    numberElement(inner, 'minHorizontalUncertainty', u.minHorizontalUncertainty) +
    numberElement(inner, 'maxHorizontalUncertainty', u.maxHorizontalUncertainty) +
    numberElement(inner, 'azimuthMaxHorizontalUncertainty', u.azimuthMaxHorizontalUncertainty);
  const ellipsoid = u.confidenceEllipsoid as unknown as Record<string, unknown> | undefined;
  // BED requires all six ellipsoid parameters; an incomplete one is omitted, not exported invalid.
  if (ellipsoid && typeof ellipsoid === 'object' &&
      CONFIDENCE_ELLIPSOID_FIELDS.every(field => finiteNumber(ellipsoid[field]) !== null)) {
    body += `${inner}<confidenceEllipsoid>\n` +
      CONFIDENCE_ELLIPSOID_FIELDS.map(field => numberElement(inner + '  ', field, ellipsoid[field])).join('') +
      `${inner}</confidenceEllipsoid>\n`;
  }
  body += enumerationElement(inner, 'preferredDescription', u.preferredDescription, 'OriginUncertaintyDescription', notes);
  body += numberElement(inner, 'confidenceLevel', u.confidenceLevel);
  return body ? `${indent}<originUncertainty>\n${body}${indent}</originUncertainty>\n` : '';
}

/**
 * The stored row's own OriginUncertainty (km -> metres) with its confidence level (C16).
 * Returns undefined when the row carries none of them.
 */
function originUncertaintyFromEvent(event: ExportableEvent): OriginUncertainty | undefined {
  const out: OriginUncertainty = {};
  const km = (value: unknown) => {
    const number = finiteNumber(value);
    return number === null ? undefined : number * 1000;
  };
  const horizontal = km(event.horizontal_uncertainty);
  const minimum = km(event.min_horizontal_uncertainty);
  const maximum = km(event.max_horizontal_uncertainty);
  const azimuth = finiteNumber(event.azimuth_max_horizontal_uncertainty);
  const confidence = finiteNumber(event.confidence_level);
  if (horizontal !== undefined) out.horizontalUncertainty = horizontal;
  if (minimum !== undefined) out.minHorizontalUncertainty = minimum;
  if (maximum !== undefined) out.maxHorizontalUncertainty = maximum;
  if (azimuth !== null) out.azimuthMaxHorizontalUncertainty = azimuth;
  if (confidence !== null) out.confidenceLevel = confidence;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * An origin exactly as stored, with `arrivals` as its phase set (its own, or the flat arrivals
 * column when that is attributed to it; see planOrigins). Its publicID must already be the
 * distinct identifier planOrigins assigned.
 */
function formatOrigin(origin: Origin, indent: string, arrivals: Arrival[]): string {
  const publicID = toResourceID(origin.publicID, 'origin');
  const inner = indent + '  ';
  const notes: string[] = [];
  const depthType = bedDepthType(origin.depthType);
  const comments = parseBlobArray<Comment>(origin.comment).concat(depthType.note ? [depthType.note] : []);

  let xml = `${indent}<origin publicID="${escapeXml(publicID)}">\n`;
  xml += comments.map(comment => formatComment(comment, inner, notes)).join('');
  xml += parseBlobArray<CompositeTime>(origin.compositeTime).map(ct => formatCompositeTime(ct, inner)).join('');
  xml += quantityElement(inner, 'time', origin.time, 'time');
  xml += quantityElement(inner, 'latitude', origin.latitude, 'real');
  xml += quantityElement(inner, 'longitude', origin.longitude, 'real');
  xml += quantityElement(inner, 'depth', origin.depth, 'real');
  xml += textElement(inner, 'depthType', depthType.value);
  xml += booleanElement(inner, 'timeFixed', origin.timeFixed);
  xml += booleanElement(inner, 'epicenterFixed', origin.epicenterFixed);
  xml += referenceElement(inner, 'referenceSystemID', origin.referenceSystemID, 'referenceSystem');
  xml += referenceElement(inner, 'methodID', origin.methodID, 'method');
  xml += referenceElement(inner, 'earthModelID', origin.earthModelID, 'earthModel');
  xml += formatOriginQuality(origin.quality, inner, notes);
  xml += formatOriginUncertainty(origin.uncertainty, inner, notes);
  xml += enumerationElement(inner, 'type', origin.type, 'OriginType', notes);
  xml += limitedTextElement(inner, 'region', origin.region, 128, notes);
  xml += enumerationElement(inner, 'evaluationMode', origin.evaluationMode, 'EvaluationMode', notes);
  xml += enumerationElement(inner, 'evaluationStatus', origin.evaluationStatus, 'EvaluationStatus', notes);
  xml += formatCreationInfo(origin.creationInfo, inner, notes);
  // Arrivals are child elements of Origin in QuakeML.
  arrivals.forEach((arrival, index) => {
    xml += formatArrival(arrival, inner, publicID, index);
  });
  xml += notesComment(notes, inner);
  xml += `${indent}</origin>\n`;
  return xml;
}

function formatMagnitude(magnitude: Magnitude, indent: string): string {
  const inner = indent + '  ';
  const notes: string[] = [];
  let xml = `${indent}<magnitude publicID="${escapeXml(toResourceID(magnitude.publicID, 'magnitude'))}">\n`;
  xml += formatComments(magnitude.comment, inner, notes);
  xml += quantityElement(inner, 'mag', magnitude.mag, 'real');
  xml += limitedTextElement(inner, 'type', magnitude.type, 32, notes);
  xml += integerElement(inner, 'stationCount', magnitude.stationCount);
  xml += numberElement(inner, 'azimuthalGap', magnitude.azimuthalGap);
  xml += referenceElement(inner, 'originID', magnitude.originID, 'origin');
  xml += referenceElement(inner, 'methodID', magnitude.methodID, 'method');
  parseBlobArray<StationMagnitudeContribution>(magnitude.stationMagnitudeContributions).forEach(contribution => {
    xml += `${inner}<stationMagnitudeContribution>\n`;
    xml += `${inner}  <stationMagnitudeID>${escapeXml(toResourceID(contribution.stationMagnitudeID, 'stationMagnitude'))}</stationMagnitudeID>\n`;
    xml += numberElement(inner + '  ', 'residual', contribution.residual);
    xml += numberElement(inner + '  ', 'weight', contribution.weight);
    xml += `${inner}</stationMagnitudeContribution>\n`;
  });
  xml += enumerationElement(inner, 'evaluationMode', magnitude.evaluationMode, 'EvaluationMode', notes);
  xml += enumerationElement(inner, 'evaluationStatus', magnitude.evaluationStatus, 'EvaluationStatus', notes);
  xml += formatCreationInfo(magnitude.creationInfo, inner, notes);
  xml += notesComment(notes, inner);
  xml += `${indent}</magnitude>\n`;
  return xml;
}

/** A WaveformStreamID; its SEED codes are limited to 8 characters by the schema. */
function formatWaveformID(waveformID: WaveformStreamID, indent: string, notes?: string[]): string {
  const code = (value: unknown, name: string) => limitedText(value, 8, name, notes);
  // networkCode and stationCode are required attributes, so they are written even when empty.
  let xml = `${indent}<waveformID`;
  xml += ` networkCode="${escapeXml(code(waveformID.networkCode, 'networkCode') ?? '')}"`;
  xml += ` stationCode="${escapeXml(code(waveformID.stationCode, 'stationCode') ?? '')}"`;
  const locationCode = code(waveformID.locationCode, 'locationCode');
  if (locationCode !== null) {
    xml += ` locationCode="${escapeXml(locationCode)}"`;
  }
  const channelCode = code(waveformID.channelCode, 'channelCode');
  if (channelCode !== null) {
    xml += ` channelCode="${escapeXml(channelCode)}"`;
  }
  if (waveformID.resourceURI) {
    xml += `>${escapeXml(toResourceID(waveformID.resourceURI, 'waveform'))}</waveformID>\n`;
  } else {
    xml += '/>\n';
  }
  return xml;
}

function formatPick(pick: Pick, indent: string): string {
  const inner = indent + '  ';
  const notes: string[] = [];
  let xml = `${indent}<pick publicID="${escapeXml(toResourceID(pick.publicID, 'pick'))}">\n`;
  xml += formatComments(pick.comment, inner, notes);
  // Time and waveformID are required.
  xml += quantityElement(inner, 'time', pick.time, 'time');
  if (pick.waveformID && typeof pick.waveformID === 'object') {
    xml += formatWaveformID(pick.waveformID, inner, notes);
  }
  xml += referenceElement(inner, 'filterID', pick.filterID, 'filter');
  xml += referenceElement(inner, 'methodID', pick.methodID, 'method');
  xml += referenceElement(inner, 'slownessMethodID', pick.slownessMethodID, 'slownessMethod');
  xml += quantityElement(inner, 'horizontalSlowness', pick.horizontalSlowness, 'real');
  xml += quantityElement(inner, 'backazimuth', pick.backazimuth, 'real');
  xml += enumerationElement(inner, 'onset', pick.onset, 'PickOnset', notes);
  xml += textElement(inner, 'phaseHint', pick.phaseHint);
  xml += enumerationElement(inner, 'polarity', pick.polarity, 'PickPolarity', notes);
  xml += enumerationElement(inner, 'evaluationMode', pick.evaluationMode, 'EvaluationMode', notes);
  xml += enumerationElement(inner, 'evaluationStatus', pick.evaluationStatus, 'EvaluationStatus', notes);
  xml += formatCreationInfo(pick.creationInfo, inner, notes);
  xml += notesComment(notes, inner);
  xml += `${indent}</pick>\n`;
  return xml;
}

/** An arrival of the origin `originID`, at position `index` in that origin's phase list. */
function formatArrival(arrival: Arrival, indent: string, originID: string, index: number): string {
  const inner = indent + '  ';
  const notes: string[] = [];
  // BED requires Arrival.publicID. One stored without it (parser output, JSON/CSV blobs) is
  // given a deterministic id derived from its origin instead of being written as a bare
  // <arrival>, which failed schema validation.
  const publicID = textOrNull(arrival.publicID)
    ? toResourceID(arrival.publicID, 'arrival')
    : childResourceID(originID, `arrival-${index + 1}`, 'arrival');
  let xml = `${indent}<arrival publicID="${escapeXml(publicID)}">\n`;
  xml += formatComments(arrival.comment, inner, notes);
  // PickID and phase are required.
  xml += `${inner}<pickID>${escapeXml(toResourceID(arrival.pickID, 'pick'))}</pickID>\n`;
  xml += `${inner}<phase>${escapeXml(typeof arrival.phase === 'object' ? '' : arrival.phase)}</phase>\n`;
  xml += numberElement(inner, 'timeCorrection', arrival.timeCorrection);
  xml += numberElement(inner, 'azimuth', arrival.azimuth);
  xml += numberElement(inner, 'distance', arrival.distance);
  xml += quantityElement(inner, 'takeoffAngle', arrival.takeoffAngle, 'real');
  xml += numberElement(inner, 'timeResidual', arrival.timeResidual);
  xml += numberElement(inner, 'horizontalSlownessResidual', arrival.horizontalSlownessResidual);
  xml += numberElement(inner, 'backazimuthResidual', arrival.backazimuthResidual);
  xml += numberElement(inner, 'timeWeight', arrival.timeWeight);
  xml += numberElement(inner, 'horizontalSlownessWeight', arrival.horizontalSlownessWeight);
  xml += numberElement(inner, 'backazimuthWeight', arrival.backazimuthWeight);
  xml += referenceElement(inner, 'earthModelID', arrival.earthModelID, 'earthModel');
  xml += formatCreationInfo(arrival.creationInfo, inner, notes);
  xml += notesComment(notes, inner);
  xml += `${indent}</arrival>\n`;
  return xml;
}

function formatAmplitude(amplitude: Amplitude, indent: string): string {
  const inner = indent + '  ';
  const notes: string[] = [];
  let xml = `${indent}<amplitude publicID="${escapeXml(toResourceID(amplitude.publicID, 'amplitude'))}">\n`;
  xml += formatComments(amplitude.comment, inner, notes);
  // GenericAmplitude (required)
  xml += quantityElement(inner, 'genericAmplitude', amplitude.genericAmplitude, 'real');
  xml += limitedTextElement(inner, 'type', amplitude.type, 32, notes);
  xml += enumerationElement(inner, 'category', amplitude.category, 'AmplitudeCategory', notes);
  xml += enumerationElement(inner, 'unit', amplitude.unit, 'AmplitudeUnit', notes);
  xml += referenceElement(inner, 'methodID', amplitude.methodID, 'method');
  xml += referenceElement(inner, 'filterID', amplitude.filterID, 'filter');
  xml += quantityElement(inner, 'period', amplitude.period, 'real');
  xml += numberElement(inner, 'snr', amplitude.snr);
  const window = amplitude.timeWindow as unknown as Record<string, unknown> | undefined;
  // BED TimeWindow requires all three members.
  if (window && typeof window === 'object' && xmlDateTime(window.reference) !== null &&
      finiteNumber(window.begin) !== null && finiteNumber(window.end) !== null) {
    xml += `${inner}<timeWindow>\n`;
    xml += dateTimeElement(inner + '  ', 'reference', window.reference);
    xml += numberElement(inner + '  ', 'begin', window.begin);
    xml += numberElement(inner + '  ', 'end', window.end);
    xml += `${inner}</timeWindow>\n`;
  }
  xml += referenceElement(inner, 'pickID', amplitude.pickID, 'pick');
  if (amplitude.waveformID && typeof amplitude.waveformID === 'object') {
    xml += formatWaveformID(amplitude.waveformID, inner, notes);
  }
  xml += quantityElement(inner, 'scalingTime', amplitude.scalingTime, 'time');
  xml += limitedTextElement(inner, 'magnitudeHint', amplitude.magnitudeHint, 32, notes);
  xml += enumerationElement(inner, 'evaluationMode', amplitude.evaluationMode, 'EvaluationMode', notes);
  xml += enumerationElement(inner, 'evaluationStatus', amplitude.evaluationStatus, 'EvaluationStatus', notes);
  xml += formatCreationInfo(amplitude.creationInfo, inner, notes);
  xml += notesComment(notes, inner);
  xml += `${indent}</amplitude>\n`;
  return xml;
}

function formatStationMagnitude(stationMag: StationMagnitude, indent: string): string {
  const inner = indent + '  ';
  const notes: string[] = [];
  let xml = `${indent}<stationMagnitude publicID="${escapeXml(toResourceID(stationMag.publicID, 'stationMagnitude'))}">\n`;
  xml += formatComments(stationMag.comment, inner, notes);
  xml += referenceElement(inner, 'originID', stationMag.originID, 'origin');
  // Magnitude value (required)
  xml += quantityElement(inner, 'mag', stationMag.mag, 'real');
  xml += limitedTextElement(inner, 'type', stationMag.type, 32, notes);
  xml += referenceElement(inner, 'amplitudeID', stationMag.amplitudeID, 'amplitude');
  xml += referenceElement(inner, 'methodID', stationMag.methodID, 'method');
  if (stationMag.waveformID && typeof stationMag.waveformID === 'object') {
    xml += formatWaveformID(stationMag.waveformID, inner, notes);
  }
  xml += formatCreationInfo(stationMag.creationInfo, inner, notes);
  xml += notesComment(notes, inner);
  xml += `${indent}</stationMagnitude>\n`;
  return xml;
}

function formatNodalPlane(plane: NodalPlane, name: string, indent: string): string {
  const inner = indent + '  ';
  return `${indent}<${name}>\n` +
    quantityElement(inner, 'strike', plane.strike, 'real') +
    quantityElement(inner, 'dip', plane.dip, 'real') +
    quantityElement(inner, 'rake', plane.rake, 'real') +
    `${indent}</${name}>\n`;
}

function formatAxis(axis: Axis, name: string, indent: string): string {
  const inner = indent + '  ';
  return `${indent}<${name}>\n` +
    quantityElement(inner, 'azimuth', axis.azimuth, 'real') +
    quantityElement(inner, 'plunge', axis.plunge, 'real') +
    quantityElement(inner, 'length', axis.length, 'real') +
    `${indent}</${name}>\n`;
}

const TENSOR_COMPONENTS = ['Mrr', 'Mtt', 'Mpp', 'Mrt', 'Mrp', 'Mtp'] as const;

/** A moment tensor of the focal mechanism `focalMechanismID`. */
function formatMomentTensor(mt: MomentTensor, indent: string, focalMechanismID: string): string {
  const inner = indent + '  ';
  const notes: string[] = [];
  // BED requires MomentTensor.publicID; CSV rows with Mxx..Mzz columns build tensors without one.
  const publicID = textOrNull(mt.publicID)
    ? toResourceID(mt.publicID, 'momentTensor')
    : childResourceID(focalMechanismID, 'momentTensor', 'momentTensor');
  let xml = `${indent}<momentTensor publicID="${escapeXml(publicID)}">\n`;

  // Derived origin ID (required)
  xml += `${inner}<derivedOriginID>${escapeXml(toResourceID(mt.derivedOriginID, 'origin'))}</derivedOriginID>\n`;
  xml += referenceElement(inner, 'momentMagnitudeID', mt.momentMagnitudeID, 'magnitude');
  xml += quantityElement(inner, 'scalarMoment', mt.scalarMoment, 'real');
  const tensor = mt.tensor as unknown as Record<string, unknown> | undefined;
  // BED requires all six components; a partial tensor is omitted rather than exported invalid.
  if (tensor && typeof tensor === 'object' &&
      TENSOR_COMPONENTS.every(component => quantityElement('', component, tensor[component], 'real') !== '')) {
    xml += `${inner}<tensor>\n`;
    xml += TENSOR_COMPONENTS.map(component => quantityElement(inner + '  ', component, tensor[component], 'real')).join('');
    xml += `${inner}</tensor>\n`;
  }
  xml += numberElement(inner, 'variance', mt.variance);
  xml += numberElement(inner, 'varianceReduction', mt.varianceReduction);
  xml += numberElement(inner, 'doubleCouple', mt.doubleCouple);
  xml += numberElement(inner, 'clvd', mt.clvd);
  xml += numberElement(inner, 'iso', mt.iso);
  xml += referenceElement(inner, 'greensFunctionID', mt.greensFunctionID, 'greensFunction');
  xml += referenceElement(inner, 'filterID', mt.filterID, 'filter');
  const stf = mt.sourceTimeFunction as unknown as Record<string, unknown> | undefined;
  if (stf && typeof stf === 'object') {
    // SourceTimeFunction requires a type from its enumeration and a duration.
    const stfType = enumerationValue('SourceTimeFunctionType', stf.type, 'sourceTimeFunction type', notes);
    if (stfType !== null && finiteNumber(stf.duration) !== null) {
      xml += `${inner}<sourceTimeFunction>\n`;
      xml += `${inner}  <type>${escapeXml(stfType)}</type>\n`;
      xml += numberElement(inner + '  ', 'duration', stf.duration);
      xml += numberElement(inner + '  ', 'riseTime', stf.riseTime);
      xml += numberElement(inner + '  ', 'decayTime', stf.decayTime);
      xml += `${inner}</sourceTimeFunction>\n`;
    }
  }
  parseBlobArray<DataUsed>(mt.dataUsed).forEach(dataUsed => {
    // DataUsed requires a waveType from its enumeration.
    const waveType = enumerationValue('DataUsedWaveType', dataUsed.waveType, 'dataUsed waveType', notes);
    if (waveType === null) return;
    xml += `${inner}<dataUsed>\n`;
    xml += `${inner}  <waveType>${escapeXml(waveType)}</waveType>\n`;
    xml += integerElement(inner + '  ', 'stationCount', dataUsed.stationCount);
    xml += integerElement(inner + '  ', 'componentCount', dataUsed.componentCount);
    xml += numberElement(inner + '  ', 'shortestPeriod', dataUsed.shortestPeriod);
    xml += numberElement(inner + '  ', 'longestPeriod', dataUsed.longestPeriod);
    xml += `${inner}</dataUsed>\n`;
  });
  xml += referenceElement(inner, 'methodID', mt.methodID, 'method');
  xml += enumerationElement(inner, 'category', mt.category, 'MomentTensorCategory', notes);
  xml += enumerationElement(inner, 'inversionType', mt.inversionType, 'MTInversionType', notes);
  xml += formatCreationInfo(mt.creationInfo, inner, notes);
  xml += notesComment(notes, inner);
  xml += `${indent}</momentTensor>\n`;
  return xml;
}

/**
 * GeoNet enrichment stores mechanisms in the simplified shape
 * `{ nodalPlane1: { strike, dip, rake }, nodalPlane2?, preferredPlane? }`. Lift that into
 * the QuakeML shape so the planes are exported instead of an empty <focalMechanism>.
 */
function liftSimplifiedFocalMechanism(fm: FocalMechanism): FocalMechanism {
  const simple = fm as unknown as {
    nodalPlanes?: unknown;
    nodalPlane1?: { strike?: number | null; dip?: number | null; rake?: number | null };
    nodalPlane2?: { strike?: number | null; dip?: number | null; rake?: number | null };
    preferredPlane?: number;
  };
  if (simple.nodalPlanes || (!simple.nodalPlane1 && !simple.nodalPlane2)) return fm;
  const plane = (p?: { strike?: number | null; dip?: number | null; rake?: number | null }) =>
    p
      ? {
          ...(p.strike != null ? { strike: { value: p.strike } } : {}),
          ...(p.dip != null ? { dip: { value: p.dip } } : {}),
          ...(p.rake != null ? { rake: { value: p.rake } } : {}),
        }
      : undefined;
  const lifted = {
    ...fm,
    publicID: fm.publicID || '',
    nodalPlanes: {
      ...(simple.nodalPlane1 ? { nodalPlane1: plane(simple.nodalPlane1) } : {}),
      ...(simple.nodalPlane2 ? { nodalPlane2: plane(simple.nodalPlane2) } : {}),
      ...(simple.preferredPlane === 1 || simple.preferredPlane === 2 ? { preferredPlane: simple.preferredPlane } : {}),
    },
  } as unknown as FocalMechanism;
  delete (lifted as unknown as Record<string, unknown>).nodalPlane1;
  delete (lifted as unknown as Record<string, unknown>).nodalPlane2;
  delete (lifted as unknown as Record<string, unknown>).preferredPlane;
  return lifted;
}

function formatFocalMechanism(fm: FocalMechanism, indent: string): string {
  const inner = indent + '  ';
  const notes: string[] = [];
  const publicID = toResourceID(fm.publicID, 'focalMechanism');
  let xml = `${indent}<focalMechanism publicID="${escapeXml(publicID)}">\n`;
  xml += formatComments(fm.comment, inner, notes);
  xml += referenceElement(inner, 'triggeringOriginID', fm.triggeringOriginID, 'origin');
  parseBlobArray<WaveformStreamID>(fm.waveformID).forEach(waveformID => {
    xml += formatWaveformID(waveformID, inner, notes);
  });

  // Nodal planes
  if (fm.nodalPlanes && typeof fm.nodalPlanes === 'object') {
    // In QuakeML-BED-1.2 preferredPlane is an ATTRIBUTE of <nodalPlanes>, not a child
    // element. Emitted as a child it was XSD-invalid and ObsPy read the preference as None.
    // BED requires strike, dip and rake on every NodalPlane, so a partially reported
    // plane is omitted rather than exported with invented values or as invalid XML,
    // and a preference can only point at a plane that is actually emitted.
    const complete = (p?: NodalPlane) => !!p && typeof p === 'object' &&
      finiteNumber(p.strike?.value) !== null && finiteNumber(p.dip?.value) !== null && finiteNumber(p.rake?.value) !== null;
    const emitted1 = complete(fm.nodalPlanes.nodalPlane1);
    const emitted2 = complete(fm.nodalPlanes.nodalPlane2);
    const preferred = fm.nodalPlanes.preferredPlane;
    const preferredAttr = (preferred === 1 && emitted1) || (preferred === 2 && emitted2) ? ` preferredPlane="${preferred}"` : '';
    const planes =
      (emitted1 ? formatNodalPlane(fm.nodalPlanes.nodalPlane1!, 'nodalPlane1', inner + '  ') : '') +
      (emitted2 ? formatNodalPlane(fm.nodalPlanes.nodalPlane2!, 'nodalPlane2', inner + '  ') : '');
    if (planes) {
      xml += `${inner}<nodalPlanes${preferredAttr}>\n${planes}${inner}</nodalPlanes>\n`;
    }
  }

  // Principal axes (tAxis and pAxis are required)
  const axes = fm.principalAxes;
  if (axes && typeof axes === 'object' && axes.tAxis && axes.pAxis) {
    xml += `${inner}<principalAxes>\n`;
    xml += formatAxis(axes.tAxis, 'tAxis', inner + '  ');
    xml += formatAxis(axes.pAxis, 'pAxis', inner + '  ');
    if (axes.nAxis) {
      xml += formatAxis(axes.nAxis, 'nAxis', inner + '  ');
    }
    xml += `${inner}</principalAxes>\n`;
  }

  xml += numberElement(inner, 'azimuthalGap', fm.azimuthalGap);
  xml += integerElement(inner, 'stationPolarityCount', fm.stationPolarityCount);
  xml += numberElement(inner, 'misfit', fm.misfit);
  xml += numberElement(inner, 'stationDistributionRatio', fm.stationDistributionRatio);
  xml += referenceElement(inner, 'methodID', fm.methodID, 'method');
  if (fm.momentTensor && typeof fm.momentTensor === 'object') {
    xml += formatMomentTensor(fm.momentTensor, inner, publicID);
  }
  xml += enumerationElement(inner, 'evaluationMode', fm.evaluationMode, 'EvaluationMode', notes);
  xml += enumerationElement(inner, 'evaluationStatus', fm.evaluationStatus, 'EvaluationStatus', notes);
  xml += formatCreationInfo(fm.creationInfo, inner, notes);
  xml += notesComment(notes, inner);
  xml += `${indent}</focalMechanism>\n`;
  return xml;
}

// ---------------------------------------------------------------------------
// Event identity and lineage
// ---------------------------------------------------------------------------

const isGeoNetSource = (member: SourceEventMember) => (member.source ?? '').toLowerCase() === 'geonet';

/**
 * smi:nz.org.geonet/<EventID> when the row's source_id is a GeoNet event ID recorded by the
 * GeoNet importer, which stores that ID only in source_id and in source_events
 * ({source: 'GeoNet', eventId}); a merged row keeps it qualified as "<source>:<EventID>".
 */
function geonetEventResourceID(sourceId: string, members: SourceEventMember[]): string | null {
  let agencyId: string | null = null;
  if (members.length === 1 && isGeoNetSource(members[0]) && members[0].recordedEventId === sourceId) {
    agencyId = sourceId;
  }
  if (agencyId === null) {
    for (const member of members) {
      const data = member.originalData;
      const rawId = data ? textOrNull(data.source_id) : null;
      if (!data || !rawId || (sourceId !== rawId && sourceId !== `${member.source}:${rawId}`)) continue;
      const inner = parseSourceEvents(data.source_events);
      if (inner.length === 1 && isGeoNetSource(inner[0]) && inner[0].recordedEventId === rawId) {
        agencyId = rawId;
        break;
      }
    }
  }
  if (agencyId === null) return null;
  const candidate = `smi:nz.org.geonet/${agencyId}`;
  return BED_RESOURCE_ID_PATTERN.test(candidate) ? candidate : null;
}

/**
 * The event's publicID: its stored public id; else its source_id (the identity the source
 * catalogue gave the event, which the GeoNet importer stores nowhere else), as the GeoNet
 * resource URI for GeoNet-imported events and under smi:local/source/ otherwise; else the row
 * id. Falling straight back to the row id lost the GeoNet event ID from QuakeML exports and
 * changed the publicID on every re-import. A source_id that merely repeats the row id carries
 * no external identity and keeps the row-id form.
 */
function eventPublicID(event: ExportableEvent, members: SourceEventMember[], used?: Set<string>): string {
  let id: string;
  const sourceId = textOrNull(event.source_id);
  if (textOrNull(event.event_public_id)) {
    id = toResourceID(event.event_public_id, 'event', event.id);
  } else if (sourceId && sourceId !== String(event.id)) {
    id = geonetEventResourceID(sourceId, members) ?? toResourceID(sourceId, 'source');
  } else {
    id = toResourceID(null, 'event', event.id);
  }
  if (used) {
    // publicIDs are unique within a document; a second row claiming the same source identity
    // keeps its own row identity instead.
    if (used.has(id)) id = toResourceID(null, 'event', event.id);
    id = uniqueResourceID(id, used);
  }
  return id;
}

/**
 * The event-level lineage comment: which source catalogues and source events the row came from,
 * which one supplied the published solution, the merge strategy, the quality score and, when the
 * export was declustered, the event's tag. JSON after a fixed prefix, so it stays machine
 * readable. null when the row records none of these.
 */
function lineageComment(event: ExportableEvent, lineage: EventLineage, options: EventToQuakeMLOptions): Comment | null {
  const tag = options.declusterTag ?? null;
  if (lineage.members.length === 0 && lineage.qualityScore === null && !lineage.mergeStrategy && !tag) return null;
  const record: Record<string, unknown> = {};
  if (lineage.members.length > 0) record.source = lineage.source;
  if (lineage.sourceCatalogueIds.length > 0) record.sourceCatalogueIds = lineage.sourceCatalogueIds;
  if (lineage.mergeStrategy) record.mergeStrategy = lineage.mergeStrategy;
  if (lineage.selectedSource) record.selectedSource = lineage.selectedSource;
  if (lineage.selectedSourceCatalogueId) record.selectedSourceCatalogueId = lineage.selectedSourceCatalogueId;
  if (lineage.qualityScore !== null) record.qualityScore = lineage.qualityScore;
  if (lineage.qualityGrade) record.qualityGrade = lineage.qualityGrade;
  if (lineage.members.length > 0) {
    record.members = lineage.members.map(member => ({
      catalogueId: member.catalogueId,
      source: member.source,
      eventId: member.eventId,
      ...(member.selected ? { selected: true } : {}),
    }));
  }
  if (tag) {
    record.declustering = {
      algorithm: options.declusteringAlgorithm ?? 'unknown',
      clusterId: tag.clusterId,
      isMainshock: tag.isMainshock,
    };
  }
  return { id: toResourceID(`${event.id}-lineage`, 'comment'), text: `Lineage: ${JSON.stringify(record)}` };
}

/**
 * A held merged event (M5) says so in the document: the reader of a QuakeML export has no
 * other way to tell a provisional solution from a decided one. Nothing is written for rows
 * that were never held or have been resolved.
 */
function reviewComment(event: ExportableEvent): Comment | null {
  if (event.review_status !== 'pending') return null;
  let reasons: unknown = event.review_reasons;
  if (typeof reasons === 'string') {
    try {
      reasons = JSON.parse(reasons);
    } catch {
      reasons = [reasons];
    }
  }
  const texts = Array.isArray(reasons)
    ? reasons.filter((reason): reason is string => typeof reason === 'string' && reason.trim() !== '')
    : [];
  const text = texts.length > 0 ? `Merge review: pending — ${texts.join('; ')}` : 'Merge review: pending';
  return { id: toResourceID(`${event.id}-review`, 'comment'), text };
}

/** Keeps a stored event type that is not a BED EventType, or the agency's raw label (C8). */
function eventTypeComment(
  event: ExportableEvent,
  exported: { value: EventType | null; original: string | null }
): Comment | null {
  const labels: string[] = [];
  if (exported.original) labels.push(exported.original);
  const agencyLabel = textOrNull(event.source_event_type);
  if (agencyLabel && [exported.value, exported.original].every(v => !v || v.toLowerCase() !== agencyLabel.toLowerCase())) {
    labels.push(agencyLabel);
  }
  if (labels.length === 0) return null;
  let text = `Event type reported by the source: ${labels.map(label => `"${label}"`).join(', ')}`;
  if (exported.original && exported.value) {
    text += ` ("${exported.original}" is not a QuakeML 1.2 BED EventType; exported as "${exported.value}")`;
  }
  return { text };
}

// ---------------------------------------------------------------------------
// Origins
// ---------------------------------------------------------------------------

/**
 * Stored objects of one kind with distinct identifiers within their event: each keeps its
 * stored publicID, and one stored without an id, or repeating an id already used, gets a
 * deterministic one derived from the owning row and its position ("<row id>-origin-2"). A
 * missing id used to become ".../unknown" for every such object, so two origins shared one
 * publicID, the arrival ids derived from it collided, and a <preferredOriginID> resolved to the
 * wrong origin. The ids assigned here are the ones every formatter and reference then uses.
 */
function withDistinctIDs<T extends { publicID?: unknown }>(items: T[], kind: string, owner: string): T[] {
  const used = new Set<string>();
  return items.map((item, index) => {
    const stored = typeof item.publicID === 'object' ? null : textOrNull(item.publicID);
    let id = stored === null ? null : toResourceID(stored, kind);
    if (id === null || used.has(id)) {
      id = uniqueResourceID(toResourceID(`${owner}-${kind}-${index + 1}`, kind), used);
    } else {
      used.add(id);
    }
    return { ...item, publicID: id };
  });
}

/** A depth type label as compared: case and spacing do not distinguish two labels. */
function depthTypeKey(label: unknown): string | null {
  const text = textOrNull(label);
  return text === null ? null : text.replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Whether a stored origin carries exactly the hypocentre of a row (depth: metres vs km) and
 * the row's depth metadata. A merge's depth rule can publish one report's depth beside
 * another report's epicentre, and fixed-depth conventions make the two depth VALUES equal
 * often (10 km); the base's origin then matches every value while its depthType and depth
 * uncertainty describe a different determination of the depth than the one the row
 * publishes, so it cannot stand for the row.
 */
function originCarries(origin: Origin, row: ExportableEvent | Record<string, unknown>): boolean {
  const depthMetres = finiteNumber(origin.depth?.value);
  const values = row as { time?: unknown; latitude?: unknown; longitude?: unknown; depth?: unknown };
  if (!sameHypocentre(
    {
      time: origin.time?.value,
      latitude: finiteNumber(origin.latitude?.value),
      longitude: finiteNumber(origin.longitude?.value),
      depth: depthMetres === null ? null : depthMetres / 1000,
    },
    values
  )) return false;
  const meta = row as { depth?: unknown; depth_type?: unknown; depth_uncertainty?: unknown };
  // Without a depth there is no depth determination to describe.
  if (finiteNumber(meta.depth) === null) return true;
  if (depthTypeKey(origin.depthType) !== depthTypeKey(meta.depth_type)) return false;
  const uncertaintyMetres = finiteNumber(origin.depth?.uncertainty);
  const originUncertainty = uncertaintyMetres === null ? null : uncertaintyMetres / 1000;
  const rowUncertainty = finiteNumber(meta.depth_uncertainty);
  if (originUncertainty === null || rowUncertainty === null) return originUncertainty === rowUncertainty;
  return Math.abs(originUncertainty - rowUncertainty) <= 1e-9 * Math.max(1, Math.abs(rowUncertainty));
}

/**
 * An <origin> built from a record's scalar columns. `restricted` keeps only what travels with the
 * hypocentre values themselves (time, epicentre and depth with their own uncertainties, depth
 * type, error ellipse): a merged row's quality counts, method, evaluation state and agency may
 * have been filled from a different contributing solution by the merge's union pass
 * (lib/merge.ts UNION_SCALAR_FIELDS), so they are not attached to its hypocentre.
 */
function scalarOriginXml(
  record: ExportableEvent,
  originID: string,
  options: { restricted: boolean; arrivals: Arrival[]; comments: Comment[] }
): string {
  const indent = '    ';
  const inner = indent + '  ';
  const notes: string[] = [];
  const depthType = bedDepthType(record.depth_type);
  const comments = options.comments.concat(depthType.note ? [depthType.note] : []);

  let xml = `${indent}<origin publicID="${escapeXml(originID)}">\n`;
  xml += comments.map(comment => formatComment(comment, inner)).join('');
  xml += quantityElement(inner, 'time', { value: rowDateTime(record.time), uncertainty: record.time_uncertainty }, 'time');
  xml += quantityElement(inner, 'latitude', { value: record.latitude, uncertainty: record.latitude_uncertainty }, 'real');
  xml += quantityElement(inner, 'longitude', { value: record.longitude, uncertainty: record.longitude_uncertainty }, 'real');
  // QuakeML spec: depth value and its uncertainty in metres; the DB stores km.
  const depth = finiteNumber(record.depth);
  if (depth !== null) {
    const depthUncertainty = finiteNumber(record.depth_uncertainty);
    xml += quantityElement(inner, 'depth', {
      value: depth * 1000,
      uncertainty: depthUncertainty === null ? null : depthUncertainty * 1000,
    }, 'real');
  }
  // Depth type (how depth was constrained)
  xml += textElement(inner, 'depthType', depthType.value);

  if (!options.restricted) {
    // Velocity model and location method
    xml += referenceElement(inner, 'methodID', record.method_id, 'method');
    xml += referenceElement(inner, 'earthModelID', record.earth_model_id, 'earthModel');
    xml += formatOriginQuality({
      associatedPhaseCount: record.associated_phase_count,
      usedPhaseCount: record.used_phase_count,
      associatedStationCount: record.associated_station_count,
      usedStationCount: record.used_station_count,
      depthPhaseCount: record.depth_phase_count,
      azimuthalGap: record.azimuthal_gap,
      minimumDistance: record.minimum_distance,
      maximumDistance: record.maximum_distance,
      standardError: record.standard_error,
    } as OriginQuality, inner, notes);
  }

  xml += formatOriginUncertainty(originUncertaintyFromEvent(record), inner, notes);

  if (!options.restricted) {
    xml += enumerationElement(inner, 'evaluationMode', record.evaluation_mode, 'EvaluationMode', notes);
    xml += enumerationElement(inner, 'evaluationStatus', record.evaluation_status, 'EvaluationStatus', notes);
    // Fallback creationInfo from scalar agency/author fields
    xml += formatCreationInfo({ agencyID: record.agency_id ?? undefined, author: record.author ?? undefined }, inner, notes);
  }

  // Arrivals (child elements of Origin in QuakeML)
  options.arrivals.forEach((arrival, index) => {
    xml += formatArrival(arrival, inner, originID, index);
  });
  xml += notesComment(notes, inner);
  xml += `${indent}</origin>\n`;
  return xml;
}

interface OriginPlan {
  /** Every <origin> element of the event. */
  xml: string;
  /** The publicID <preferredOriginID> names, always one of the emitted origins; null if none. */
  preferredID: string | null;
  /** Stored origins left out because they lack a valid time, latitude or longitude. */
  omittedIDs: string[];
}

/**
 * Whether a stored origin has the values BED requires of every Origin (time, latitude,
 * longitude). One without them (a malformed JSON/CSV blob) cannot be exported as an origin, and
 * cannot be the solution a row publishes.
 */
function hasRequiredOriginValues(origin: Origin): boolean {
  return xmlDateTime(origin.time?.value) !== null &&
    finiteNumber(origin.latitude?.value) !== null &&
    finiteNumber(origin.longitude?.value) !== null;
}

/**
 * The <origin> elements of an event and the one <preferredOriginID> names.
 *
 * Stored origins are emitted exactly as stored: a publicID names one agency's solution, and its
 * creationInfo, quality counts and arrival residuals describe that solution only. The preferred
 * origin is the one that carries the row's published hypocentre (its scalar columns, which the
 * CSV/JSON/GeoJSON exports publish):
 *  - a single-source row's stored preferred origin (the scalars were extracted from it);
 *  - else a stored origin with exactly that hypocentre;
 *  - for a merged row, else the contributing event whose own solution it is, from that event's
 *    stored origin or its own scalar columns (source_events keeps both);
 *  - else an origin built here from the row's scalars, under a local identifier.
 * A merged row's hypocentre used to be written INTO a contributing origin, publishing values that
 * agency never reported under its publicID and agency while its real solution disappeared, and
 * an unmatched preference fell back to origins[0] or was emitted as a dangling reference.
 */
function planOrigins(
  event: ExportableEvent,
  members: SourceEventMember[],
  mergeStrategy: string | null
): OriginPlan {
  const merged = members.length > 1;
  const allStored = withDistinctIDs(parseBlobArray<Origin>(event.origins), 'origin', String(event.id));
  const stored = allStored.filter(hasRequiredOriginValues);
  const omittedIDs = allStored
    .filter(origin => !hasRequiredOriginValues(origin))
    .map(origin => toResourceID(origin.publicID, 'origin'));
  const storedIDs = stored.map(origin => toResourceID(origin.publicID, 'origin'));
  const usedIDs = new Set(storedIDs);
  const standaloneArrivals = parseBlobArray<Arrival>(event.arrivals);
  const preferenceID = textOrNull(event.preferred_origin_id)
    ? toResourceID(event.preferred_origin_id, 'origin', event.id)
    : null;
  const byPreference = preferenceID === null ? -1 : storedIDs.indexOf(preferenceID);
  const hasSolution = rowDateTime(event.time) !== null &&
    finiteNumber(event.latitude) !== null && finiteNumber(event.longitude) !== null;

  let preferredIndex = -1;
  if (byPreference >= 0 && (!merged || !hasSolution || originCarries(stored[byPreference], event))) {
    preferredIndex = byPreference;
  } else if (hasSolution) {
    const matching = stored.map((_, index) => index).filter(index => originCarries(stored[index], event));
    if (matching.length === 1) preferredIndex = matching[0];
  }

  // The flat arrivals column is the PREFERRED stored origin's phase set (lib/quakeml-parser.ts),
  // so it belongs to that origin alone, and only fills it when it carries none of its own:
  // attaching it to origins[0] put one solution's residuals on another and duplicated the
  // arrival publicIDs. On a merged row the column may come from a different contributor than
  // the origins blob, so it is attached only when a contributor stored exactly this pair.
  let arrivalsOwner = -1;
  if (standaloneArrivals.length > 0) {
    if (!merged) {
      arrivalsOwner = byPreference >= 0 ? byPreference : preferredIndex;
    } else if (byPreference >= 0 && members.some(member =>
      member.originalData !== null &&
      member.originalData.arrivals === event.arrivals &&
      textOrNull(member.originalData.preferred_origin_id) !== null &&
      toResourceID(member.originalData.preferred_origin_id, 'origin') === storedIDs[byPreference]
    )) {
      arrivalsOwner = byPreference;
    }
  }

  let xml = '';
  stored.forEach((origin, index) => {
    const own = parseBlobArray<Arrival>(origin.arrivals);
    xml += formatOrigin(origin, '    ', index === arrivalsOwner && own.length === 0 ? standaloneArrivals : own);
  });

  if (preferredIndex >= 0) return { xml, preferredID: storedIDs[preferredIndex], omittedIDs };
  if (!hasSolution) return { xml, preferredID: null, omittedIDs };

  if (!merged) {
    // The row's own solution (a CSV/GeoJSON/GeoNet-text row has no stored origins at all), under
    // the row's own preferred-origin identity, unless that names a stored origin omitted as
    // unusable. Its phases go with it unless a stored origin already took them.
    const ownIdentity = preferenceID !== null && omittedIDs.indexOf(preferenceID) === -1 ? preferenceID : null;
    const originID = uniqueResourceID(ownIdentity ?? toResourceID(null, 'origin', event.id), usedIDs);
    xml += scalarOriginXml(event, originID, {
      restricted: false,
      arrivals: arrivalsOwner < 0 ? standaloneArrivals : [],
      comments: [],
    });
    return { xml, preferredID: originID, omittedIDs };
  }

  const owner = publishedSolutionMember(event, members);
  const ownerRow = owner?.originalData ?? null;
  if (owner && ownerRow) {
    // The published hypocentre is this contributor's own solution: emit it with its identity.
    const ownOrigins = withDistinctIDs(
      parseBlobArray<Origin>(ownerRow.origins),
      'origin',
      textOrNull(ownerRow.id) ?? `${event.id}-contributor`
    ).filter(hasRequiredOriginValues);
    const ownPreference = textOrNull(ownerRow.preferred_origin_id)
      ? toResourceID(ownerRow.preferred_origin_id, 'origin')
      : null;
    const ownPreferred = ownOrigins.find(origin =>
      ownPreference !== null && toResourceID(origin.publicID, 'origin') === ownPreference && originCarries(origin, event));
    const ownMatching = ownOrigins.filter(origin => originCarries(origin, event));
    const ownOrigin = ownPreferred ?? (ownMatching.length === 1 ? ownMatching[0] : undefined);
    const ownArrivals = parseBlobArray<Arrival>(ownerRow.arrivals);
    if (ownOrigin && !usedIDs.has(toResourceID(ownOrigin.publicID, 'origin'))) {
      const originID = toResourceID(ownOrigin.publicID, 'origin');
      usedIDs.add(originID);
      const nested = parseBlobArray<Arrival>(ownOrigin.arrivals);
      xml += formatOrigin(ownOrigin, '    ', nested.length === 0 && originID === ownPreference ? ownArrivals : nested);
      return { xml, preferredID: originID, omittedIDs };
    }
    if (ownOrigins.length === 0) {
      const originID = uniqueResourceID(
        ownPreference ?? toResourceID(`${event.id}-merged`, 'origin'),
        usedIDs
      );
      xml += scalarOriginXml(ownerRow as unknown as ExportableEvent, originID, {
        // A contributor that is itself a merged row carries union-filled metadata too.
        restricted: parseSourceEvents(ownerRow.source_events).length > 1,
        arrivals: ownArrivals,
        comments: [{
          text: `Hypocentre of the contributing event the catalogue merge selected (source: ${owner.source ?? 'unknown'}` +
            `${owner.catalogueId ? `, catalogue ${owner.catalogueId}` : ''}` +
            `${owner.eventId ? `, event ${owner.eventId}` : ''}).`,
        }],
      });
      return { xml, preferredID: originID, omittedIDs };
    }
  }

  // No single contributor reported this hypocentre (an averaged solution, or members not stored).
  const originID = uniqueResourceID(toResourceID(`${event.id}-merged`, 'origin'), usedIDs);
  xml += scalarOriginXml(event, originID, {
    restricted: true,
    arrivals: [],
    comments: [{
      text: `Hypocentre published by the catalogue merge${mergeStrategy ? ` (strategy: ${mergeStrategy})` : ''}; ` +
        'it is not any single contributing agency\'s solution. The contributing events are listed in ' +
        'this event\'s lineage comment.',
    }],
  });
  return { xml, preferredID: originID, omittedIDs };
}

// ---------------------------------------------------------------------------
// Magnitudes
// ---------------------------------------------------------------------------

/** Whether a stored measurement agrees with the authoritative scalar selection. */
function matchesScalarMagnitude(magnitude: Magnitude, event: ExportableEvent): boolean {
  return finiteNumber(magnitude.mag?.value) === event.magnitude &&
    (magnitude.type ?? '') === (event.magnitude_type ?? '') &&
    (event.magnitude_uncertainty == null || finiteNumber(magnitude.mag.uncertainty) === event.magnitude_uncertainty) &&
    (event.magnitude_station_count == null || finiteNumber(magnitude.stationCount) === event.magnitude_station_count) &&
    (event.magnitude_method_id == null || magnitude.methodID === event.magnitude_method_id) &&
    (event.magnitude_evaluation_mode == null || magnitude.evaluationMode === event.magnitude_evaluation_mode) &&
    (event.magnitude_evaluation_status == null || magnitude.evaluationStatus === event.magnitude_evaluation_status);
}

/**
 * A <magnitude> element built from the row's scalar magnitude columns, linked to the event's
 * preferred origin (the solution the row publishes).
 */
function scalarMagnitudeXml(event: ExportableEvent, magnitudeID: string, merged: boolean, originID: string | null): string {
  const inner = '      ';
  const notes: string[] = [];
  let xml = `    <magnitude publicID="${escapeXml(magnitudeID)}">\n`;
  xml += quantityElement(inner, 'mag', { value: event.magnitude, uncertainty: event.magnitude_uncertainty }, 'real');
  xml += limitedTextElement(inner, 'type', event.magnitude_type, 32, notes);
  xml += integerElement(inner, 'stationCount', event.magnitude_station_count);
  if (originID) {
    xml += `${inner}<originID>${escapeXml(originID)}</originID>\n`;
  }
  xml += referenceElement(inner, 'methodID', event.magnitude_method_id, 'method');
  // Prefer magnitude-specific evaluation fields; fall back to origin-level fields.
  const magEvalMode = event.magnitude_evaluation_mode || (!merged ? event.evaluation_mode : undefined);
  const magEvalStatus = event.magnitude_evaluation_status || (!merged ? event.evaluation_status : undefined);
  xml += enumerationElement(inner, 'evaluationMode', magEvalMode, 'EvaluationMode', notes);
  xml += enumerationElement(inner, 'evaluationStatus', magEvalStatus, 'EvaluationStatus', notes);
  // For a merge these fields identify the origin's agency, which may differ from
  // the selected magnitude's agency. An unknown donor must remain unattributed.
  if (!merged) {
    xml += formatCreationInfo({ agencyID: event.agency_id ?? undefined, author: event.author ?? undefined }, inner, notes);
  }
  xml += notesComment(notes, inner);
  xml += `    </magnitude>\n`;
  return xml;
}

// ---------------------------------------------------------------------------
// Events and documents
// ---------------------------------------------------------------------------

export interface EventToQuakeMLOptions {
  /** Catalogue-level merge strategy (merge_config), to attribute rows stored before C2. */
  catalogueMergeStrategy?: string | null;
  /** This event's declustering tag, when the export was declustered (C7). */
  declusterTag?: DeclusterTag | null;
  /** The declustering algorithm applied, recorded with the tag. */
  declusteringAlgorithm?: string;
  /** Event publicIDs already used in the document (they must be unique). */
  usedEventIDs?: Set<string>;
}

/**
 * Convert a MergedEvent to QuakeML Event element
 */
export function eventToQuakeML(event: ExportableEvent, options: EventToQuakeMLOptions = {}): string {
  const members = parseSourceEvents(event.source_events);
  const merged = members.length > 1;
  const lineage = eventLineage(event, options.catalogueMergeStrategy, members);
  const publicID = eventPublicID(event, members, options.usedEventIDs);
  // Stored event-level values the schema cannot carry (see notesComment).
  const eventNotes: string[] = [];

  let xml = `  <event publicID="${escapeXml(publicID)}">\n`;

  // QuakeML BED 1.2 schema event child element order:
  // description*, comment*, focalMechanism*, amplitude*, magnitude*, stationMagnitude*,
  // origin*, pick*, preferredOriginID?, preferredMagnitudeID?, type?, typeCertainty?, creationInfo?

  // Descriptions — use stored JSON if available, otherwise synthesise from scalar fields.
  const descriptions = parseBlobArray<EventDescription>(event.event_descriptions);
  descriptions.forEach(description => {
    xml += formatEventDescription(description, '    ', eventNotes);
  });
  // When no structured descriptions exist, emit region / location_name as a
  // "region name" description (QuakeML EventDescriptionType = "region name").
  if (descriptions.length === 0 && (event.region || event.location_name)) {
    const regionText = event.region || event.location_name || '';
    xml += formatEventDescription({ text: regionText, type: 'region name' }, '    ', eventNotes);
  }

  // Origins are planned first: the scalar magnitude refers to the preferred origin, and an
  // omitted stored origin is recorded in a comment.
  const origins = planOrigins(event, members, lineage.mergeStrategy ?? options.catalogueMergeStrategy ?? null);

  // Comments: the stored ones, then this export's lineage and event-type notes.
  const eventType = bedEventType(event.event_type);
  const comments = parseBlobArray<Comment>(event.comments);
  const lineageNote = lineageComment(event, lineage, options);
  if (lineageNote) comments.push(lineageNote);
  const typeNote = eventTypeComment(event, eventType);
  if (typeNote) comments.push(typeNote);
  const reviewNote = reviewComment(event);
  if (reviewNote) comments.push(reviewNote);
  if (origins.omittedIDs.length > 0) {
    comments.push({
      text: `Stored origin(s) ${origins.omittedIDs.join(', ')} omitted: no valid time, latitude or longitude ` +
        '(required by QuakeML 1.2 BED). The stored data is unchanged in the JSON and GeoJSON exports.',
    });
  }
  comments.forEach(comment => {
    xml += formatComment(comment, '    ', eventNotes);
  });

  // Focal Mechanisms (schema order: 3rd group, before amplitudes/magnitudes/origins). A
  // mechanism stored without an id (GeoNet enrichment) gets a deterministic one so two of them
  // cannot both export as ".../unknown".
  const mechanisms = parseBlobArray<FocalMechanism>(event.focal_mechanisms).map(liftSimplifiedFocalMechanism);
  withDistinctIDs(mechanisms, 'focalMechanism', String(event.id)).forEach(fm => {
    xml += formatFocalMechanism(fm, '    ');
  });

  // Amplitudes (schema order: 4th group, before magnitudes/origins)
  withDistinctIDs(parseBlobArray<Amplitude>(event.amplitudes), 'amplitude', String(event.id)).forEach(amplitude => {
    xml += formatAmplitude(amplitude, '    ');
  });

  // Magnitudes (schema order: 5th group, before origins)
  const storedMagnitudes = parseBlobArray<Magnitude>(event.magnitudes);
  // The id the <preferredMagnitudeID> element will point at (set below).
  let preferredMagnitudeExportId: string | undefined = event.preferred_magnitude_id
    ? toResourceID(event.preferred_magnitude_id, 'magnitude', event.id)
    : undefined;
  if (storedMagnitudes.length > 0) {
    // Entries without an id (e.g. alternatives kept from a flat CSV import) get a
    // deterministic one so two of them cannot collapse onto "unknown".
    const withIds = withDistinctIDs(storedMagnitudes, 'magnitude', String(event.id));
    const preferenceID = event.preferred_magnitude_id
      ? toResourceID(event.preferred_magnitude_id, 'magnitude', event.id)
      : null;
    // Keep source measurements intact. Rewriting an ML entry with a selected Mw
    // also rewrote its identity while retaining the ML agency's creationInfo.
    withIds.forEach(magnitude => {
      xml += formatMagnitude(magnitude, '    ');
    });
    if (event.magnitude != null) {
      const matching = withIds.filter(magnitude => matchesScalarMagnitude(magnitude, event));
      const selected = matching.find(magnitude => magnitude.publicID === preferenceID)
        ?? (matching.length === 1 ? matching[0] : undefined);
      if (selected) {
        preferredMagnitudeExportId = selected.publicID;
      } else {
        // The selected measurement may not be in the stored alternatives. Emit it
        // separately, without borrowing a different measurement's ID or provenance.
        const usedIds = new Set(withIds.map(m => m.publicID));
        let magnitudeID = toResourceID(event.preferred_magnitude_id || `${event.id}-magnitude-preferred`, 'magnitude', event.id);
        let suffix = 0;
        while (usedIds.has(magnitudeID)) {
          magnitudeID = toResourceID(`${event.id}-magnitude-preferred-${++suffix}`, 'magnitude', event.id);
        }
        xml += scalarMagnitudeXml(event, magnitudeID, merged, origins.preferredID);
        preferredMagnitudeExportId = magnitudeID;
      }
    }
  } else if (event.magnitude != null) {
    // Fallback: reconstruct Magnitude from scalar database fields.
    const magnitudeID = toResourceID(event.preferred_magnitude_id, 'magnitude', event.id);
    xml += scalarMagnitudeXml(event, magnitudeID, merged, origins.preferredID);
    preferredMagnitudeExportId = magnitudeID;
  }

  // Station Magnitudes (schema order: 6th group, before origins)
  withDistinctIDs(parseBlobArray<StationMagnitude>(event.station_magnitudes), 'stationMagnitude', String(event.id))
    .forEach(stationMag => {
      xml += formatStationMagnitude(stationMag, '    ');
    });

  // Origins (schema order: 7th group, after magnitudes)
  xml += origins.xml;

  // Picks (schema order: 8th group, after origins)
  withDistinctIDs(parseBlobArray<Pick>(event.picks), 'pick', String(event.id)).forEach(pick => {
    xml += formatPick(pick, '    ');
  });

  // Preferred IDs (schema order: after origin/magnitude elements). Each names an emitted element.
  if (origins.preferredID) {
    xml += `    <preferredOriginID>${escapeXml(origins.preferredID)}</preferredOriginID>\n`;
  }
  if (preferredMagnitudeExportId) {
    xml += `    <preferredMagnitudeID>${escapeXml(preferredMagnitudeExportId)}</preferredMagnitudeID>\n`;
  }
  if (event.preferred_focal_mechanism_id) {
    xml += `    <preferredFocalMechanismID>${escapeXml(toResourceID(event.preferred_focal_mechanism_id, 'focalMechanism', event.id))}</preferredFocalMechanismID>\n`;
  }

  // Event type (schema order: after preferredIDs)
  xml += textElement('    ', 'type', eventType.value);
  xml += enumerationElement('    ', 'typeCertainty', event.event_type_certainty, 'EventTypeCertainty', eventNotes);

  // Creation info (schema order: last)
  xml += formatCreationInfo(parseBlobObject<CreationInfo>(event.creation_info), '    ', eventNotes);

  // Event children may come in any order (QuakeML-BED-1.2.xsd: an unbounded choice), so the
  // note on values the event could not carry follows the elements that produced it.
  xml += notesComment(eventNotes, '    ');
  xml += `  </event>`;
  return xml;
}

/**
 * Convert multiple events to a complete QuakeML document
 */
export function eventsToQuakeMLDocument(
  events: ExportableEvent[],
  catalogueName?: string,
  metadata?: ExportMetadata
): string {
  return joinChunks(eventsToQuakeMLChunks(events, catalogueName, metadata));
}

/**
 * Streaming form of eventsToQuakeMLDocument(): yields the same bytes in chunks, one event at a
 * time, so a whole-catalogue export never has to exist as a single JS string. Built whole, the
 * document reached V8's 536,870,888-character string limit near 100,000 richly merged events
 * (an opaque 500), and no byte could be sent before the last event was formatted.
 */
export function eventsToQuakeMLChunks(
  events: ExportableEvent[],
  catalogueName?: string,
  metadata?: ExportMetadata
): Generator<string> {
  return coalesce(quakemlParts(events, catalogueName, metadata));
}

function* quakemlParts(
  events: ExportableEvent[],
  catalogueName?: string,
  metadata?: ExportMetadata
): Generator<string> {
  yield quakemlDocumentHead(events, catalogueName, metadata);

  const mergeConfig = metadata?.mergeConfig as Record<string, unknown> | undefined;
  const catalogueMergeStrategy = mergeConfig && typeof mergeConfig === 'object'
    ? textOrNull(mergeConfig.mergeStrategy) ?? textOrNull(mergeConfig.strategy)
    : null;
  const tags = metadata?.declustering && metadata.declustering.algorithm !== 'none'
    ? metadata.declustering.tags ?? null
    : null;
  const usedEventIDs = new Set<string>();
  for (const event of events) {
    yield eventToQuakeML(event, {
      catalogueMergeStrategy,
      declusterTag: tags ? tags.get(event.id) ?? null : null,
      declusteringAlgorithm: metadata?.declustering?.algorithm,
      usedEventIDs,
    }) + '\n';
  }

  yield '  </eventParameters>\n</q:quakeml>';
}

/** Everything before the first <event>: declaration, root, catalogue description and comments. */
function quakemlDocumentHead(
  events: ExportableEvent[],
  catalogueName?: string,
  metadata?: ExportMetadata
): string {
  const timestamp = rowDateTime(metadata?.generatedAt) ?? new Date().toISOString();
  const publicID = `smi:local/eventParameters/${Date.now()}`;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">\n';
  xml += `  <eventParameters publicID="${escapeXml(publicID)}">\n`;
  // Build comprehensive description
  const descParts: string[] = [];
  if (catalogueName) descParts.push(`Catalogue: ${catalogueName}`);
  if (metadata?.description) descParts.push(metadata.description);
  if (metadata?.source) descParts.push(`Source: ${metadata.source}`);
  if (metadata?.provider) descParts.push(`Provider: ${metadata.provider}`);
  if (metadata?.region) descParts.push(`Region: ${metadata.region}`);
  const periodStart = toUtcIsoString(metadata?.timePeriodStart);
  const periodEnd = toUtcIsoString(metadata?.timePeriodEnd);
  if (periodStart || periodEnd) {
    descParts.push(`Time Period: ${periodStart ?? '?'} to ${periodEnd ?? '?'}`);
  }
  if (metadata?.eventCount != null) descParts.push(`Event Count: ${metadata.eventCount}`);

  // EventParameters/description is type="xs:string" in QuakeML-BED-1.2.xsd — a
  // plain text element with no children. (Event/description is the complex
  // EventDescription type with <text>/<type>; see formatEventDescription.)
  if (descParts.length > 0) {
    xml += `    <description>${escapeXml(descParts.join('; '))}</description>\n`;
  }

  // Add comments for additional metadata
  const addComment = (text: string) => {
    xml += `    <comment>\n      <text>${escapeXml(text)}</text>\n    </comment>\n`;
  };

  // Export provenance (C12): which catalogue and version, when, what exactly, and how selected.
  const checksum = exportChecksumOf(events, metadata);
  if (metadata?.catalogueId) addComment(`Catalogue ID: ${metadata.catalogueId}`);
  if (metadata?.version) {
    addComment(`Catalogue Version: ${metadata.version}${metadata.versionUpdatedAt ? ` (updated ${metadata.versionUpdatedAt})` : ''}`);
  }
  if (metadata?.sourceVersion) addComment(`Source Version: ${metadata.sourceVersion}`);
  addComment(`Exported At (UTC): ${timestamp}`);
  addComment(`Event Rows SHA-256: ${checksum.value} (${checksum.scope})`);
  addComment(`Filter: ${metadata?.filter ? JSON.stringify(metadata.filter) : 'none'}`);
  const declustering = describeDeclustering(metadata);
  addComment(`Declustering: ${declustering.algorithm === 'none' ? 'none' : JSON.stringify(declustering)}`);

  if (metadata?.license) addComment(`License: ${metadata.license}`);
  if (metadata?.citation) addComment(`Citation: ${metadata.citation}`);
  if (metadata?.doi) addComment(`DOI: ${metadata.doi}`);
  if (metadata?.usageTerms) addComment(`Usage Terms: ${metadata.usageTerms}`);
  if (metadata?.contactName || metadata?.contactEmail || metadata?.contactOrganization) {
    const contactParts = [];
    if (metadata.contactName) contactParts.push(metadata.contactName);
    if (metadata.contactOrganization) contactParts.push(metadata.contactOrganization);
    if (metadata.contactEmail) contactParts.push(metadata.contactEmail);
    addComment(`Contact: ${contactParts.join(', ')}`);
  }
  if (metadata?.keywords && metadata.keywords.length > 0) {
    addComment(`Keywords: ${metadata.keywords.join(', ')}`);
  }
  if (metadata?.referenceLinks && metadata.referenceLinks.length > 0) {
    addComment(`References: ${metadata.referenceLinks.join(', ')}`);
  }
  if (metadata?.dataQuality) {
    const qParts = [];
    if (metadata.dataQuality.completeness) qParts.push(`Completeness: ${metadata.dataQuality.completeness}`);
    if (metadata.dataQuality.accuracy) qParts.push(`Accuracy: ${metadata.dataQuality.accuracy}`);
    if (metadata.dataQuality.reliability) qParts.push(`Reliability: ${metadata.dataQuality.reliability}`);
    if (qParts.length > 0) addComment(`Data Quality: ${qParts.join('; ')}`);
  }
  if (metadata?.qualityNotes) addComment(`Quality Notes: ${metadata.qualityNotes}`);
  if (metadata?.notes) addComment(`Notes: ${metadata.notes}`);
  if (metadata?.boundingBox) {
    addComment(`Bounding Box: ${JSON.stringify(metadata.boundingBox)}`);
  }
  // Merge provenance
  if (metadata?.mergeDescription) addComment(`Merge Description: ${metadata.mergeDescription}`);
  if (metadata?.mergeUseCase) addComment(`Merge Use Case: ${metadata.mergeUseCase}`);
  if (metadata?.mergeMethodology) addComment(`Merge Methodology: ${metadata.mergeMethodology}`);
  if (metadata?.mergeQualityAssessment) addComment(`Merge Quality Assessment: ${metadata.mergeQualityAssessment}`);
  // The strategy and thresholds that produced the merge were carried by CSV/GeoJSON
  // exports but dropped here (H2).
  if (metadata?.mergeConfig) addComment(`Merge Config: ${JSON.stringify(metadata.mergeConfig)}`);
  if (metadata?.createdBy) addComment(`Created By: ${metadata.createdBy}`);
  if (metadata?.modifiedAt) addComment(`Modified At: ${metadata.modifiedAt}`);
  if (metadata?.sourceCatalogues) addComment(`Source Catalogues: ${JSON.stringify(metadata.sourceCatalogues)}`);

  // Creation info with the catalogue version (C3) when the export has one.
  xml += `    <creationInfo>\n`;
  xml += `      <agencyID>CatalogueOfCatalogues</agencyID>\n`;
  xml += `      <creationTime>${escapeXml(timestamp)}</creationTime>\n`;
  // User-entered free text; "1 & 2" unescaped produced a malformed document.
  xml += limitedTextElement('      ', 'version', metadata?.version, 64);
  xml += `    </creationInfo>\n`;

  return xml;
}
