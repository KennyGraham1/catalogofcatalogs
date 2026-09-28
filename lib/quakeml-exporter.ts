/**
 * QuakeML 1.2 Exporter
 * Converts database events to QuakeML 1.2 XML format
 */

import {
  describeDeclustering,
  eventLineage,
  exportChecksumOf,
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

// xs:dateTime lexical space (the zone designator is optional in XML Schema).
const XS_DATE_TIME = /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

/** An xs:dateTime string from a stored blob; null for anything else. */
function xmlDateTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return XS_DATE_TIME.test(text) ? text : null;
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
// ---------------------------------------------------------------------------

function formatCreationInfo(info: unknown, indent: string): string {
  if (!info || typeof info !== 'object') return '';
  const ci = info as CreationInfo;
  const inner = indent + '  ';
  const body =
    textElement(inner, 'agencyID', ci.agencyID) +
    referenceElement(inner, 'agencyURI', ci.agencyURI, 'agency') +
    textElement(inner, 'author', ci.author) +
    referenceElement(inner, 'authorURI', ci.authorURI, 'author') +
    dateTimeElement(inner, 'creationTime', ci.creationTime) +
    textElement(inner, 'version', ci.version);
  return body ? `${indent}<creationInfo>\n${body}${indent}</creationInfo>\n` : '';
}

function formatComment(comment: Comment, indent: string): string {
  // QuakeML BED 1.2 Comment: text (+ optional creationInfo) are the only child
  // elements; the identifier is the `id` ATTRIBUTE (type ResourceReference).
  const idAttr = textOrNull(comment.id) ? ` id="${escapeXml(toResourceID(comment.id, 'comment'))}"` : '';
  const text = typeof comment.text === 'object' ? '' : comment.text;
  return `${indent}<comment${idAttr}>\n` +
    `${indent}  <text>${escapeXml(text)}</text>\n` +
    formatCreationInfo(comment.creationInfo, indent + '  ') +
    `${indent}</comment>\n`;
}

function formatComments(comments: unknown, indent: string): string {
  return parseBlobArray<Comment>(comments).map(comment => formatComment(comment, indent)).join('');
}

function formatEventDescription(description: EventDescription, indent: string): string {
  const text = typeof description.text === 'object' ? '' : description.text;
  return `${indent}<description>\n` +
    `${indent}  <text>${escapeXml(text)}</text>\n` +
    textElement(indent + '  ', 'type', description.type) +
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

function formatOriginQuality(quality: unknown, indent: string): string {
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
    textElement(inner, 'groundTruthLevel', q.groundTruthLevel) +
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

function formatOriginUncertainty(uncertainty: unknown, indent: string): string {
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
  body += textElement(inner, 'preferredDescription', u.preferredDescription);
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
 * column when that is attributed to it; see planOrigins).
 */
function formatOrigin(origin: Origin, indent: string, arrivals: Arrival[]): string {
  const publicID = toResourceID(origin.publicID, 'origin');
  const inner = indent + '  ';
  const depthType = bedDepthType(origin.depthType);
  const comments = parseBlobArray<Comment>(origin.comment).concat(depthType.note ? [depthType.note] : []);

  let xml = `${indent}<origin publicID="${escapeXml(publicID)}">\n`;
  xml += comments.map(comment => formatComment(comment, inner)).join('');
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
  xml += formatOriginQuality(origin.quality, inner);
  xml += formatOriginUncertainty(origin.uncertainty, inner);
  xml += textElement(inner, 'type', origin.type);
  xml += textElement(inner, 'region', origin.region);
  xml += textElement(inner, 'evaluationMode', origin.evaluationMode);
  xml += textElement(inner, 'evaluationStatus', origin.evaluationStatus);
  xml += formatCreationInfo(origin.creationInfo, inner);
  // Arrivals are child elements of Origin in QuakeML.
  arrivals.forEach((arrival, index) => {
    xml += formatArrival(arrival, inner, publicID, index);
  });
  xml += `${indent}</origin>\n`;
  return xml;
}

function formatMagnitude(magnitude: Magnitude, indent: string): string {
  const inner = indent + '  ';
  let xml = `${indent}<magnitude publicID="${escapeXml(toResourceID(magnitude.publicID, 'magnitude'))}">\n`;
  xml += formatComments(magnitude.comment, inner);
  xml += quantityElement(inner, 'mag', magnitude.mag, 'real');
  xml += textElement(inner, 'type', magnitude.type);
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
  xml += textElement(inner, 'evaluationMode', magnitude.evaluationMode);
  xml += textElement(inner, 'evaluationStatus', magnitude.evaluationStatus);
  xml += formatCreationInfo(magnitude.creationInfo, inner);
  xml += `${indent}</magnitude>\n`;
  return xml;
}

function formatWaveformID(waveformID: WaveformStreamID, indent: string): string {
  let xml = `${indent}<waveformID`;
  xml += ` networkCode="${escapeXml(waveformID.networkCode)}"`;
  xml += ` stationCode="${escapeXml(waveformID.stationCode)}"`;
  if (waveformID.locationCode) {
    xml += ` locationCode="${escapeXml(waveformID.locationCode)}"`;
  }
  if (waveformID.channelCode) {
    xml += ` channelCode="${escapeXml(waveformID.channelCode)}"`;
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
  let xml = `${indent}<pick publicID="${escapeXml(toResourceID(pick.publicID, 'pick'))}">\n`;
  xml += formatComments(pick.comment, inner);
  // Time and waveformID are required.
  xml += quantityElement(inner, 'time', pick.time, 'time');
  if (pick.waveformID && typeof pick.waveformID === 'object') {
    xml += formatWaveformID(pick.waveformID, inner);
  }
  xml += referenceElement(inner, 'filterID', pick.filterID, 'filter');
  xml += referenceElement(inner, 'methodID', pick.methodID, 'method');
  xml += referenceElement(inner, 'slownessMethodID', pick.slownessMethodID, 'slownessMethod');
  xml += quantityElement(inner, 'horizontalSlowness', pick.horizontalSlowness, 'real');
  xml += quantityElement(inner, 'backazimuth', pick.backazimuth, 'real');
  xml += textElement(inner, 'onset', pick.onset);
  xml += textElement(inner, 'phaseHint', pick.phaseHint);
  xml += textElement(inner, 'polarity', pick.polarity);
  xml += textElement(inner, 'evaluationMode', pick.evaluationMode);
  xml += textElement(inner, 'evaluationStatus', pick.evaluationStatus);
  xml += formatCreationInfo(pick.creationInfo, inner);
  xml += `${indent}</pick>\n`;
  return xml;
}

/** An arrival of the origin `originID`, at position `index` in that origin's phase list. */
function formatArrival(arrival: Arrival, indent: string, originID: string, index: number): string {
  const inner = indent + '  ';
  // BED requires Arrival.publicID. One stored without it (parser output, JSON/CSV blobs) is
  // given a deterministic id derived from its origin instead of being written as a bare
  // <arrival>, which failed schema validation.
  const publicID = textOrNull(arrival.publicID)
    ? toResourceID(arrival.publicID, 'arrival')
    : childResourceID(originID, `arrival-${index + 1}`, 'arrival');
  let xml = `${indent}<arrival publicID="${escapeXml(publicID)}">\n`;
  xml += formatComments(arrival.comment, inner);
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
  xml += formatCreationInfo(arrival.creationInfo, inner);
  xml += `${indent}</arrival>\n`;
  return xml;
}

function formatAmplitude(amplitude: Amplitude, indent: string): string {
  const inner = indent + '  ';
  let xml = `${indent}<amplitude publicID="${escapeXml(toResourceID(amplitude.publicID, 'amplitude'))}">\n`;
  xml += formatComments(amplitude.comment, inner);
  // GenericAmplitude (required)
  xml += quantityElement(inner, 'genericAmplitude', amplitude.genericAmplitude, 'real');
  xml += textElement(inner, 'type', amplitude.type);
  xml += textElement(inner, 'category', amplitude.category);
  xml += textElement(inner, 'unit', amplitude.unit);
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
    xml += formatWaveformID(amplitude.waveformID, inner);
  }
  xml += quantityElement(inner, 'scalingTime', amplitude.scalingTime, 'time');
  xml += textElement(inner, 'magnitudeHint', amplitude.magnitudeHint);
  xml += textElement(inner, 'evaluationMode', amplitude.evaluationMode);
  xml += textElement(inner, 'evaluationStatus', amplitude.evaluationStatus);
  xml += formatCreationInfo(amplitude.creationInfo, inner);
  xml += `${indent}</amplitude>\n`;
  return xml;
}

function formatStationMagnitude(stationMag: StationMagnitude, indent: string): string {
  const inner = indent + '  ';
  let xml = `${indent}<stationMagnitude publicID="${escapeXml(toResourceID(stationMag.publicID, 'stationMagnitude'))}">\n`;
  xml += formatComments(stationMag.comment, inner);
  xml += referenceElement(inner, 'originID', stationMag.originID, 'origin');
  // Magnitude value (required)
  xml += quantityElement(inner, 'mag', stationMag.mag, 'real');
  xml += textElement(inner, 'type', stationMag.type);
  xml += referenceElement(inner, 'amplitudeID', stationMag.amplitudeID, 'amplitude');
  xml += referenceElement(inner, 'methodID', stationMag.methodID, 'method');
  if (stationMag.waveformID && typeof stationMag.waveformID === 'object') {
    xml += formatWaveformID(stationMag.waveformID, inner);
  }
  xml += formatCreationInfo(stationMag.creationInfo, inner);
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
  // SourceTimeFunction requires type and duration.
  if (stf && typeof stf === 'object' && textOrNull(stf.type) && finiteNumber(stf.duration) !== null) {
    xml += `${inner}<sourceTimeFunction>\n`;
    xml += textElement(inner + '  ', 'type', stf.type);
    xml += numberElement(inner + '  ', 'duration', stf.duration);
    xml += numberElement(inner + '  ', 'riseTime', stf.riseTime);
    xml += numberElement(inner + '  ', 'decayTime', stf.decayTime);
    xml += `${inner}</sourceTimeFunction>\n`;
  }
  parseBlobArray<DataUsed>(mt.dataUsed).forEach(dataUsed => {
    xml += `${inner}<dataUsed>\n`;
    xml += `${inner}  <waveType>${escapeXml(typeof dataUsed.waveType === 'object' ? '' : dataUsed.waveType)}</waveType>\n`;
    xml += integerElement(inner + '  ', 'stationCount', dataUsed.stationCount);
    xml += integerElement(inner + '  ', 'componentCount', dataUsed.componentCount);
    xml += numberElement(inner + '  ', 'shortestPeriod', dataUsed.shortestPeriod);
    xml += numberElement(inner + '  ', 'longestPeriod', dataUsed.longestPeriod);
    xml += `${inner}</dataUsed>\n`;
  });
  xml += referenceElement(inner, 'methodID', mt.methodID, 'method');
  xml += textElement(inner, 'category', mt.category);
  xml += textElement(inner, 'inversionType', mt.inversionType);
  xml += formatCreationInfo(mt.creationInfo, inner);
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
  const publicID = toResourceID(fm.publicID, 'focalMechanism');
  let xml = `${indent}<focalMechanism publicID="${escapeXml(publicID)}">\n`;
  xml += formatComments(fm.comment, inner);
  xml += referenceElement(inner, 'triggeringOriginID', fm.triggeringOriginID, 'origin');
  parseBlobArray<WaveformStreamID>(fm.waveformID).forEach(waveformID => {
    xml += formatWaveformID(waveformID, inner);
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
  xml += textElement(inner, 'evaluationMode', fm.evaluationMode);
  xml += textElement(inner, 'evaluationStatus', fm.evaluationStatus);
  xml += formatCreationInfo(fm.creationInfo, inner);
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

/** Whether a stored origin carries exactly the hypocentre of a row (depth: metres vs km). */
function originCarries(origin: Origin, row: ExportableEvent | Record<string, unknown>): boolean {
  const depthMetres = finiteNumber(origin.depth?.value);
  return sameHypocentre(
    {
      time: origin.time?.value,
      latitude: finiteNumber(origin.latitude?.value),
      longitude: finiteNumber(origin.longitude?.value),
      depth: depthMetres === null ? null : depthMetres / 1000,
    },
    row as { time?: unknown; latitude?: unknown; longitude?: unknown; depth?: unknown }
  );
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
    } as OriginQuality, inner);
  }

  xml += formatOriginUncertainty(originUncertaintyFromEvent(record), inner);

  if (!options.restricted) {
    xml += textElement(inner, 'evaluationMode', record.evaluation_mode);
    xml += textElement(inner, 'evaluationStatus', record.evaluation_status);
    // Fallback creationInfo from scalar agency/author fields
    xml += formatCreationInfo({ agencyID: record.agency_id ?? undefined, author: record.author ?? undefined }, inner);
  }

  // Arrivals (child elements of Origin in QuakeML)
  options.arrivals.forEach((arrival, index) => {
    xml += formatArrival(arrival, inner, originID, index);
  });
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
  const allStored = parseBlobArray<Origin>(event.origins);
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
    const ownOrigins = parseBlobArray<Origin>(ownerRow.origins).filter(hasRequiredOriginValues);
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
  let xml = `    <magnitude publicID="${escapeXml(magnitudeID)}">\n`;
  xml += quantityElement(inner, 'mag', { value: event.magnitude, uncertainty: event.magnitude_uncertainty }, 'real');
  xml += textElement(inner, 'type', event.magnitude_type);
  xml += integerElement(inner, 'stationCount', event.magnitude_station_count);
  if (originID) {
    xml += `${inner}<originID>${escapeXml(originID)}</originID>\n`;
  }
  xml += referenceElement(inner, 'methodID', event.magnitude_method_id, 'method');
  // Prefer magnitude-specific evaluation fields; fall back to origin-level fields.
  const magEvalMode = event.magnitude_evaluation_mode || (!merged ? event.evaluation_mode : undefined);
  const magEvalStatus = event.magnitude_evaluation_status || (!merged ? event.evaluation_status : undefined);
  xml += textElement(inner, 'evaluationMode', magEvalMode);
  xml += textElement(inner, 'evaluationStatus', magEvalStatus);
  // For a merge these fields identify the origin's agency, which may differ from
  // the selected magnitude's agency. An unknown donor must remain unattributed.
  if (!merged) {
    xml += formatCreationInfo({ agencyID: event.agency_id ?? undefined, author: event.author ?? undefined }, inner);
  }
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
  const lineage = eventLineage(event, options.catalogueMergeStrategy);
  const publicID = eventPublicID(event, members, options.usedEventIDs);

  let xml = `  <event publicID="${escapeXml(publicID)}">\n`;

  // QuakeML BED 1.2 schema event child element order:
  // description*, comment*, focalMechanism*, amplitude*, magnitude*, stationMagnitude*,
  // origin*, pick*, preferredOriginID?, preferredMagnitudeID?, type?, typeCertainty?, creationInfo?

  // Descriptions — use stored JSON if available, otherwise synthesise from scalar fields.
  const descriptions = parseBlobArray<EventDescription>(event.event_descriptions);
  descriptions.forEach(description => {
    xml += formatEventDescription(description, '    ');
  });
  // When no structured descriptions exist, emit region / location_name as a
  // "region name" description (QuakeML EventDescriptionType = "region name").
  if (descriptions.length === 0 && (event.region || event.location_name)) {
    const regionText = event.region || event.location_name || '';
    xml += formatEventDescription({ text: regionText, type: 'region name' }, '    ');
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
  if (origins.omittedIDs.length > 0) {
    comments.push({
      text: `Stored origin(s) ${origins.omittedIDs.join(', ')} omitted: no valid time, latitude or longitude ` +
        '(required by QuakeML 1.2 BED). The stored data is unchanged in the JSON and GeoJSON exports.',
    });
  }
  comments.forEach(comment => {
    xml += formatComment(comment, '    ');
  });

  // Focal Mechanisms (schema order: 3rd group, before amplitudes/magnitudes/origins)
  parseBlobArray<FocalMechanism>(event.focal_mechanisms).forEach((fm, index) => {
    const lifted = liftSimplifiedFocalMechanism(fm);
    // A mechanism stored without an id (GeoNet enrichment) gets a deterministic one
    // so two of them cannot both export as ".../unknown".
    if (!lifted.publicID) lifted.publicID = `${event.id}-focalMechanism-${index + 1}`;
    xml += formatFocalMechanism(lifted, '    ');
  });

  // Amplitudes (schema order: 4th group, before magnitudes/origins)
  parseBlobArray<Amplitude>(event.amplitudes).forEach(amplitude => {
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
    const withIds = storedMagnitudes.map((magnitude, index) => ({
      ...magnitude,
      publicID: magnitude.publicID || `${event.id}-magnitude-${index + 1}`,
    }));
    // Keep source measurements intact. Rewriting an ML entry with a selected Mw
    // also rewrote its identity while retaining the ML agency's creationInfo.
    withIds.forEach(magnitude => {
      xml += formatMagnitude(magnitude, '    ');
    });
    if (event.magnitude != null) {
      const matching = withIds.filter(magnitude => matchesScalarMagnitude(magnitude, event));
      const selected = matching.find(magnitude => magnitude.publicID === event.preferred_magnitude_id)
        ?? (matching.length === 1 ? matching[0] : undefined);
      if (selected) {
        preferredMagnitudeExportId = toResourceID(selected.publicID, 'magnitude', event.id);
      } else {
        // The selected measurement may not be in the stored alternatives. Emit it
        // separately, without borrowing a different measurement's ID or provenance.
        const usedIds = new Set(withIds.map(m => toResourceID(m.publicID, 'magnitude', event.id)));
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
  parseBlobArray<StationMagnitude>(event.station_magnitudes).forEach(stationMag => {
    xml += formatStationMagnitude(stationMag, '    ');
  });

  // Origins (schema order: 7th group, after magnitudes)
  xml += origins.xml;

  // Picks (schema order: 8th group, after origins)
  parseBlobArray<Pick>(event.picks).forEach(pick => {
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
  xml += textElement('    ', 'typeCertainty', event.event_type_certainty);

  // Creation info (schema order: last)
  xml += formatCreationInfo(parseBlobObject<CreationInfo>(event.creation_info), '    ');

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
  xml += textElement('      ', 'version', metadata?.version);
  xml += `    </creationInfo>\n`;

  // Add all events
  const mergeConfig = metadata?.mergeConfig as Record<string, unknown> | undefined;
  const catalogueMergeStrategy = mergeConfig && typeof mergeConfig === 'object'
    ? textOrNull(mergeConfig.mergeStrategy) ?? textOrNull(mergeConfig.strategy)
    : null;
  const tags = metadata?.declustering && metadata.declustering.algorithm !== 'none'
    ? metadata.declustering.tags ?? null
    : null;
  const usedEventIDs = new Set<string>();
  events.forEach(event => {
    xml += eventToQuakeML(event, {
      catalogueMergeStrategy,
      declusterTag: tags ? tags.get(event.id) ?? null : null,
      declusteringAlgorithm: metadata?.declustering?.algorithm,
      usedEventIDs,
    }) + '\n';
  });

  xml += '  </eventParameters>\n';
  xml += '</q:quakeml>';

  return xml;
}
