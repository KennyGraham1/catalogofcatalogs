/**
 * Comprehensive QuakeML 1.2 Parser
 * Extracts all fields from QuakeML Basic Event Description (BED) format
 *
 * Performance Optimization: Added SAX-based streaming parser for large QuakeML files
 */

import * as fs from 'fs';
import * as sax from 'sax';
import type {
  QuakeMLEvent,
  Origin,
  Magnitude,
  Pick,
  Arrival,
  FocalMechanism,
  Amplitude,
  StationMagnitude,
  RealQuantity,
  TimeQuantity,
  OriginQuality,
  OriginUncertainty,
  NodalPlane,
  NodalPlanes,
  Axis,
  PrincipalAxes,
  Tensor,
  MomentTensor,
  CreationInfo,
  Comment,
  EventDescription,
  WaveformStreamID
} from './types/quakeml';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nsTag(tag: string): string {
  return `(?:[\\w.-]+:)?${escapeRegex(tag)}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
};

/**
 * Resolve the five XML predefined entities and numeric character references.
 */
function decodeXmlEntities(text: string): string {
  if (text.indexOf('&') === -1) return text;
  return text.replace(
    /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g,
    (match, dec: string | undefined, hex: string | undefined, named: string | undefined) => {
      if (named !== undefined) return NAMED_ENTITIES[named];
      const codePoint = dec !== undefined ? parseInt(dec, 10) : parseInt(hex as string, 16);
      // Leave anything outside the Unicode range (or a lone surrogate) as written.
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match;
      return String.fromCodePoint(codePoint);
    }
  );
}

/**
 * Escape text for re-serialisation into an XML fragment.
 *
 * Used by the SAX path only: sax hands over decoded text, and decodeXmlEntities()
 * undoes this again when the fragment is read back, so the round trip is lossless.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isEventTagName(tagName: string): boolean {
  return tagName === 'event' || tagName.endsWith(':event');
}

/**
 * Remove the given child elements (with their sub-trees) from an XML fragment.
 *
 * The extractors below scan for the first match of a tag name, which is only
 * correct once the sub-trees that can carry the same tag names have been taken
 * out. QuakeML-BED-1.2.xsd puts those repeatable children FIRST in every
 * complexType sequence, so without this the first match is always the nested one.
 */
function stripChildElements(xml: string, tagNames: readonly string[]): string {
  let stripped = xml;
  for (const tagName of tagNames) {
    const tag = nsTag(tagName);
    stripped = stripped.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'g'), '');
    stripped = stripped.replace(new RegExp(`<${tag}\\b[^>]*\\/>`, 'g'), '');
  }
  return stripped;
}

/**
 * The BED Event choice group: description, comment, focalMechanism, amplitude,
 * magnitude, stationMagnitude, origin and pick all repeat ahead of the event's
 * own preferredOriginID / preferredMagnitudeID / preferredFocalMechanismID /
 * type / typeCertainty / creationInfo, and each of them can carry its own
 * <type> and <creationInfo>.
 */
const EVENT_CHILD_ELEMENTS = [
  'description',
  'comment',
  'focalMechanism',
  'amplitude',
  'magnitude',
  'stationMagnitude',
  'origin',
  'pick'
] as const;

/**
 * Extract text content from XML tag
 */
function extractTagValue(xml: string, tagName: string): string | undefined {
  const tag = nsTag(tagName);
  const regex = new RegExp(`<${tag}\\b[^>]*>([^<]*)<\\/${tag}>`, 's');
  const match = xml.match(regex);
  return match ? decodeXmlEntities(match[1].trim()) : undefined;
}

/**
 * Extract an attribute value from a serialised start tag (already entity-decoded)
 */
function extractAttribute(tagOrAttrs: string, attrName: string): string | undefined {
  const match = tagOrAttrs.match(new RegExp(`\\b${escapeRegex(attrName)}="([^"]*)"`));
  return match ? decodeXmlEntities(match[1]) : undefined;
}

/**
 * Extract nested value tag (e.g., <magnitude><value>5.2</value></magnitude>)
 */
function extractNestedValue(xml: string, parentTag: string): string | undefined {
  const parent = nsTag(parentTag);
  const value = nsTag('value');
  const regex = new RegExp(`<${parent}\\b[^>]*>.*?<${value}>([^<]*)<\\/${value}>.*?<\\/${parent}>`, 's');
  const match = xml.match(regex);
  return match ? decodeXmlEntities(match[1].trim()) : undefined;
}

/**
 * Extract RealQuantity (value with optional uncertainty)
 */
function extractRealQuantity(xml: string, parentTag: string): RealQuantity | undefined {
  const parent = nsTag(parentTag);
  const regex = new RegExp(`<${parent}\\b[^>]*>(.*?)<\\/${parent}>`, 's');
  const match = xml.match(regex);
  if (!match) return undefined;

  const content = match[1];
  const valueStr = extractTagValue(content, 'value');
  if (!valueStr) return undefined;

  const value = parseFloat(valueStr);
  if (isNaN(value)) return undefined;

  const result: RealQuantity = { value };

  const uncertaintyStr = extractTagValue(content, 'uncertainty');
  if (uncertaintyStr) {
    const uncertainty = parseFloat(uncertaintyStr);
    if (!isNaN(uncertainty)) result.uncertainty = uncertainty;
  }

  const lowerUncertaintyStr = extractTagValue(content, 'lowerUncertainty');
  if (lowerUncertaintyStr) {
    const lowerUncertainty = parseFloat(lowerUncertaintyStr);
    if (!isNaN(lowerUncertainty)) result.lowerUncertainty = lowerUncertainty;
  }

  const upperUncertaintyStr = extractTagValue(content, 'upperUncertainty');
  if (upperUncertaintyStr) {
    const upperUncertainty = parseFloat(upperUncertaintyStr);
    if (!isNaN(upperUncertainty)) result.upperUncertainty = upperUncertainty;
  }

  return result;
}

/**
 * Extract TimeQuantity (datetime with optional uncertainty)
 */
function extractTimeQuantity(xml: string, parentTag: string): TimeQuantity | undefined {
  const parent = nsTag(parentTag);
  const regex = new RegExp(`<${parent}\\b[^>]*>(.*?)<\\/${parent}>`, 's');
  const match = xml.match(regex);
  if (!match) return undefined;

  const content = match[1];
  const value = extractTagValue(content, 'value');
  if (!value) return undefined;

  const result: TimeQuantity = { value };

  const uncertaintyStr = extractTagValue(content, 'uncertainty');
  if (uncertaintyStr) {
    const uncertainty = parseFloat(uncertaintyStr);
    if (!isNaN(uncertainty)) result.uncertainty = uncertainty;
  }

  return result;
}

/**
 * Extract CreationInfo
 * If excludeNested is true, removes nested elements before extracting
 */
function extractCreationInfo(xml: string, excludeNested: boolean = false): CreationInfo | undefined {
  let searchXML = xml;

  // If excludeNested, remove every element of the BED Event choice group. All
  // eight can carry their own creationInfo and all eight precede the event's own
  // (which is the last child), so stripping only some of them still returns a
  // child's provenance — a focalMechanism, amplitude or pick creationInfo is the
  // normal case for SeisComP/GeoNet FDSN output.
  if (excludeNested) {
    searchXML = stripChildElements(searchXML, EVENT_CHILD_ELEMENTS);
  }

  const regex = /<(?:[\w.-]+:)?creationInfo\b[^>]*>(.*?)<\/(?:[\w.-]+:)?creationInfo>/s;
  const match = searchXML.match(regex);
  if (!match) return undefined;

  const content = match[1];
  const info: CreationInfo = {};

  const agencyID = extractTagValue(content, 'agencyID');
  if (agencyID) info.agencyID = agencyID;

  const author = extractTagValue(content, 'author');
  if (author) info.author = author;

  const creationTime = extractTagValue(content, 'creationTime');
  if (creationTime) info.creationTime = creationTime;

  const version = extractTagValue(content, 'version');
  if (version) info.version = version;

  return Object.keys(info).length > 0 ? info : undefined;
}

/**
 * Extract Comments (preserves id attribute, text, and creationInfo)
 */
function extractComments(xml: string): Comment[] | undefined {
  const comments: Comment[] = [];
  const regex = /<(?:[\w.-]+:)?comment([^>]*)>(.*?)<\/(?:[\w.-]+:)?comment>/gs;
  const matchesArray = Array.from(xml.matchAll(regex));

  for (let i = 0; i < matchesArray.length; i++) {
    const match = matchesArray[i];
    const attrs = match[1];
    const content = match[2];
    const text = extractTagValue(content, 'text');
    if (text) {
      const comment: Comment = { text };
      // Preserve the comment's id attribute (e.g. id="smi:local/…")
      const id = extractAttribute(attrs, 'id');
      if (id !== undefined) comment.id = id;
      const creationInfo = extractCreationInfo(content);
      if (creationInfo) comment.creationInfo = creationInfo;
      comments.push(comment);
    }
  }

  return comments.length > 0 ? comments : undefined;
}

/**
 * Extract Event Descriptions
 */
function extractEventDescriptions(xml: string): EventDescription[] | undefined {
  const descriptions: EventDescription[] = [];
  const regex = /<(?:[\w.-]+:)?description\b[^>]*>(.*?)<\/(?:[\w.-]+:)?description>/gs;
  const matchesArray = Array.from(xml.matchAll(regex));

  for (let i = 0; i < matchesArray.length; i++) {
    const match = matchesArray[i];
    const content = match[1];
    const text = extractTagValue(content, 'text');
    if (text) {
      const description: EventDescription = { text };
      const type = extractTagValue(content, 'type');
      if (type) description.type = type as any;
      descriptions.push(description);
    }
  }

  return descriptions.length > 0 ? descriptions : undefined;
}

/**
 * Extract OriginQuality
 */
function extractOriginQuality(xml: string): OriginQuality | undefined {
  const regex = /<(?:[\w.-]+:)?quality\b[^>]*>(.*?)<\/(?:[\w.-]+:)?quality>/s;
  const match = xml.match(regex);
  if (!match) return undefined;

  const content = match[1];
  const quality: OriginQuality = {};

  const associatedPhaseCount = extractTagValue(content, 'associatedPhaseCount');
  if (associatedPhaseCount) quality.associatedPhaseCount = parseInt(associatedPhaseCount);

  const usedPhaseCount = extractTagValue(content, 'usedPhaseCount');
  if (usedPhaseCount) quality.usedPhaseCount = parseInt(usedPhaseCount);

  const associatedStationCount = extractTagValue(content, 'associatedStationCount');
  if (associatedStationCount) quality.associatedStationCount = parseInt(associatedStationCount);

  const usedStationCount = extractTagValue(content, 'usedStationCount');
  if (usedStationCount) quality.usedStationCount = parseInt(usedStationCount);

  const depthPhaseCount = extractTagValue(content, 'depthPhaseCount');
  if (depthPhaseCount) quality.depthPhaseCount = parseInt(depthPhaseCount);

  const standardError = extractTagValue(content, 'standardError');
  if (standardError) quality.standardError = parseFloat(standardError);

  const azimuthalGap = extractTagValue(content, 'azimuthalGap');
  if (azimuthalGap) quality.azimuthalGap = parseFloat(azimuthalGap);

  const minimumDistance = extractTagValue(content, 'minimumDistance');
  if (minimumDistance) quality.minimumDistance = parseFloat(minimumDistance);

  const maximumDistance = extractTagValue(content, 'maximumDistance');
  if (maximumDistance) quality.maximumDistance = parseFloat(maximumDistance);

  return Object.keys(quality).length > 0 ? quality : undefined;
}

/**
 * Extract OriginUncertainty
 */
function extractOriginUncertainty(xml: string): OriginUncertainty | undefined {
  const regex = /<(?:[\w.-]+:)?originUncertainty\b[^>]*>(.*?)<\/(?:[\w.-]+:)?originUncertainty>/s;
  const match = xml.match(regex);
  if (!match) return undefined;

  const content = match[1];
  const uncertainty: OriginUncertainty = {};

  const horizontalUncertainty = extractTagValue(content, 'horizontalUncertainty');
  if (horizontalUncertainty) uncertainty.horizontalUncertainty = parseFloat(horizontalUncertainty);

  const minHorizontalUncertainty = extractTagValue(content, 'minHorizontalUncertainty');
  if (minHorizontalUncertainty) uncertainty.minHorizontalUncertainty = parseFloat(minHorizontalUncertainty);

  const maxHorizontalUncertainty = extractTagValue(content, 'maxHorizontalUncertainty');
  if (maxHorizontalUncertainty) uncertainty.maxHorizontalUncertainty = parseFloat(maxHorizontalUncertainty);

  const azimuthMaxHorizontalUncertainty = extractTagValue(content, 'azimuthMaxHorizontalUncertainty');
  if (azimuthMaxHorizontalUncertainty) uncertainty.azimuthMaxHorizontalUncertainty = parseFloat(azimuthMaxHorizontalUncertainty);

  return Object.keys(uncertainty).length > 0 ? uncertainty : undefined;
}

/**
 * Extract Origin
 */
function extractOrigin(xml: string): Origin | undefined {
  const publicIDTagMatch = xml.match(/<(?:[\w.-]+:)?origin\b[^>]*publicID="[^"]*"[^>]*>/);
  if (!publicIDTagMatch) return undefined;
  const publicID = extractAttribute(publicIDTagMatch[0], 'publicID');
  if (publicID === undefined) return undefined;

  // Arrivals, comments and compositeTimes are the repeatable children that open
  // the BED Origin sequence, so they precede (and shadow) the origin's own
  // earthModelID / methodID / creationInfo in a first-match scan. Pull the
  // arrivals out of the full element, then read the scalars from what remains.
  const arrivals = extractArrivals(xml);
  const ownXML = stripChildElements(xml, ['arrival', 'comment', 'compositeTime']);

  const time = extractTimeQuantity(ownXML, 'time');
  const latitude = extractRealQuantity(ownXML, 'latitude');
  const longitude = extractRealQuantity(ownXML, 'longitude');

  if (!time || !latitude || !longitude) return undefined;

  const origin: Origin = {
    publicID,
    time,
    latitude,
    longitude
  };

  const depth = extractRealQuantity(ownXML, 'depth');
  if (depth) origin.depth = depth;

  const depthType = extractTagValue(ownXML, 'depthType');
  if (depthType) origin.depthType = depthType as any;

  // Extract origin metadata (QuakeML/GeoNet/ISC fields)
  const earthModelID = extractTagValue(ownXML, 'earthModelID');
  if (earthModelID) origin.earthModelID = earthModelID;

  const methodID = extractTagValue(ownXML, 'methodID');
  if (methodID) origin.methodID = methodID;

  const region = extractTagValue(ownXML, 'region');
  if (region) origin.region = region;

  const evaluationMode = extractTagValue(ownXML, 'evaluationMode');
  if (evaluationMode) origin.evaluationMode = evaluationMode as any;

  const evaluationStatus = extractTagValue(ownXML, 'evaluationStatus');
  if (evaluationStatus) origin.evaluationStatus = evaluationStatus as any;

  const quality = extractOriginQuality(ownXML);
  if (quality) origin.quality = quality;

  const uncertainty = extractOriginUncertainty(ownXML);
  if (uncertainty) origin.uncertainty = uncertainty;

  const creationInfo = extractCreationInfo(ownXML);
  if (creationInfo) origin.creationInfo = creationInfo;

  // In BED an Arrival is a child of Origin — it is the association of a pick with
  // one specific origin, and different origins of the same event routinely use
  // different phase sets, weights and residuals.
  if (arrivals.length > 0) origin.arrivals = arrivals;

  return origin;
}

/**
 * Extract WaveformStreamID from an XML element (e.g. <waveformID …/>)
 */
function extractWaveformID(xml: string): WaveformStreamID | undefined {
  // waveformID can be a self-closing tag with attributes
  const match = xml.match(/<(?:[\w.-]+:)?waveformID([^>]*)\/?>/);
  if (!match) return undefined;

  const attrs = match[1];
  const networkCode  = extractAttribute(attrs, 'networkCode');
  const stationCode  = extractAttribute(attrs, 'stationCode');
  if (!networkCode || !stationCode) return undefined;

  const waveformID: WaveformStreamID = { networkCode, stationCode };
  const locationCode = extractAttribute(attrs, 'locationCode');
  if (locationCode !== undefined) waveformID.locationCode = locationCode;
  const channelCode  = extractAttribute(attrs, 'channelCode');
  if (channelCode !== undefined) waveformID.channelCode = channelCode;
  const resourceURI  = extractAttribute(attrs, 'resourceURI');
  if (resourceURI !== undefined) waveformID.resourceURI = resourceURI;

  return waveformID;
}

/**
 * Extract Pick
 */
function extractPick(xml: string): Pick | undefined {
  const publicIDTagMatch = xml.match(/<(?:[\w.-]+:)?pick\b[^>]*publicID="[^"]*"[^>]*>/);
  if (!publicIDTagMatch) return undefined;
  const publicID = extractAttribute(publicIDTagMatch[0], 'publicID');
  if (publicID === undefined) return undefined;

  // <comment> is the repeatable child that opens the BED Pick sequence and it
  // carries its own creationInfo, so read the pick's scalars without it.
  const ownXML = stripChildElements(xml, ['comment']);

  const time = extractTimeQuantity(ownXML, 'time');
  if (!time) return undefined;

  const waveformID = extractWaveformID(ownXML);
  if (!waveformID) return undefined;

  const pick: Pick = { publicID, time, waveformID };

  const filterID = extractTagValue(ownXML, 'filterID');
  if (filterID) pick.filterID = filterID;

  const methodID = extractTagValue(ownXML, 'methodID');
  if (methodID) pick.methodID = methodID;

  const onset = extractTagValue(ownXML, 'onset');
  if (onset) pick.onset = onset as any;

  const phaseHint = extractTagValue(ownXML, 'phaseHint');
  if (phaseHint) pick.phaseHint = phaseHint;

  const polarity = extractTagValue(ownXML, 'polarity');
  if (polarity) pick.polarity = polarity as any;

  const evaluationMode = extractTagValue(ownXML, 'evaluationMode');
  if (evaluationMode) pick.evaluationMode = evaluationMode as any;

  const evaluationStatus = extractTagValue(ownXML, 'evaluationStatus');
  if (evaluationStatus) pick.evaluationStatus = evaluationStatus as any;

  const creationInfo = extractCreationInfo(ownXML);
  if (creationInfo) pick.creationInfo = creationInfo;

  const comments = extractComments(xml);
  if (comments) pick.comment = comments;

  return pick;
}

/**
 * Extract Magnitude
 */
function extractMagnitude(xml: string): Magnitude | undefined {
  const publicIDTagMatch = xml.match(/<(?:[\w.-]+:)?magnitude\b[^>]*publicID="[^"]*"[^>]*>/);
  if (!publicIDTagMatch) return undefined;
  const publicID = extractAttribute(publicIDTagMatch[0], 'publicID');
  if (publicID === undefined) return undefined;

  // comment and stationMagnitudeContribution are the repeatable children that
  // open the BED Magnitude sequence; comment carries its own creationInfo.
  const ownXML = stripChildElements(xml, ['comment', 'stationMagnitudeContribution']);

  const mag = extractRealQuantity(ownXML, 'mag');

  if (!mag) return undefined;

  const magnitude: Magnitude = {
    publicID,
    mag
  };

  const type = extractTagValue(ownXML, 'type');
  if (type) magnitude.type = type;

  // The origin this network magnitude was computed for (BED Magnitude/originID)
  const originID = extractTagValue(ownXML, 'originID');
  if (originID) magnitude.originID = originID;

  // Extract magnitude method ID (QuakeML/GeoNet/ISC field)
  const methodID = extractTagValue(ownXML, 'methodID');
  if (methodID) magnitude.methodID = methodID;

  const stationCount = extractTagValue(ownXML, 'stationCount');
  if (stationCount) magnitude.stationCount = parseInt(stationCount);

  const azimuthalGap = extractTagValue(ownXML, 'azimuthalGap');
  if (azimuthalGap) magnitude.azimuthalGap = parseFloat(azimuthalGap);

  const evaluationMode = extractTagValue(ownXML, 'evaluationMode');
  if (evaluationMode) magnitude.evaluationMode = evaluationMode as any;

  const evaluationStatus = extractTagValue(ownXML, 'evaluationStatus');
  if (evaluationStatus) magnitude.evaluationStatus = evaluationStatus as any;

  const creationInfo = extractCreationInfo(ownXML);
  if (creationInfo) magnitude.creationInfo = creationInfo;

  return magnitude;
}

/**
 * Extract Arrival
 */
function extractArrival(xml: string): Arrival | undefined {
  // <comment> is the repeatable child that opens the BED Arrival sequence and it
  // carries its own creationInfo, so read the arrival's scalars without it.
  const ownXML = stripChildElements(xml, ['comment']);

  const pickID = extractTagValue(ownXML, 'pickID');
  const phase = extractTagValue(ownXML, 'phase');
  if (!pickID || !phase) return undefined;

  const publicIDTagMatch = xml.match(/<(?:[\w.-]+:)?arrival\b[^>]*publicID="[^"]*"[^>]*>/);
  const arrival: Arrival = { pickID, phase };
  if (publicIDTagMatch) {
    const publicID = extractAttribute(publicIDTagMatch[0], 'publicID');
    if (publicID !== undefined) arrival.publicID = publicID;
  }

  const timeCorrection = extractTagValue(ownXML, 'timeCorrection');
  if (timeCorrection) arrival.timeCorrection = parseFloat(timeCorrection);
  const azimuth = extractTagValue(ownXML, 'azimuth');
  if (azimuth) arrival.azimuth = parseFloat(azimuth);
  const distance = extractTagValue(ownXML, 'distance');
  if (distance) arrival.distance = parseFloat(distance);
  const takeoffAngle = extractRealQuantity(ownXML, 'takeoffAngle');
  if (takeoffAngle) arrival.takeoffAngle = takeoffAngle;
  const timeResidual = extractTagValue(ownXML, 'timeResidual');
  if (timeResidual) arrival.timeResidual = parseFloat(timeResidual);
  const horizontalSlownessResidual = extractTagValue(ownXML, 'horizontalSlownessResidual');
  if (horizontalSlownessResidual) arrival.horizontalSlownessResidual = parseFloat(horizontalSlownessResidual);
  const backazimuthResidual = extractTagValue(ownXML, 'backazimuthResidual');
  if (backazimuthResidual) arrival.backazimuthResidual = parseFloat(backazimuthResidual);
  const timeWeight = extractTagValue(ownXML, 'timeWeight');
  if (timeWeight) arrival.timeWeight = parseFloat(timeWeight);
  const horizontalSlownessWeight = extractTagValue(ownXML, 'horizontalSlownessWeight');
  if (horizontalSlownessWeight) arrival.horizontalSlownessWeight = parseFloat(horizontalSlownessWeight);
  const backazimuthWeight = extractTagValue(ownXML, 'backazimuthWeight');
  if (backazimuthWeight) arrival.backazimuthWeight = parseFloat(backazimuthWeight);
  const earthModelID = extractTagValue(ownXML, 'earthModelID');
  if (earthModelID) arrival.earthModelID = earthModelID;

  const creationInfo = extractCreationInfo(ownXML);
  if (creationInfo) arrival.creationInfo = creationInfo;
  const comments = extractComments(xml);
  if (comments) arrival.comment = comments;

  return arrival;
}

/**
 * Extract every <arrival> element contained in an XML fragment
 */
function extractArrivals(xml: string): Arrival[] {
  const matches = Array.from(xml.matchAll(/<(?:[\w.-]+:)?arrival\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?arrival>/g));
  const arrivals: Arrival[] = [];
  for (let i = 0; i < matches.length; i++) {
    const arrival = extractArrival(matches[i][0]);
    if (arrival) arrivals.push(arrival);
  }
  return arrivals;
}

/**
 * Extract Amplitude
 */
function extractAmplitude(xml: string): Amplitude | undefined {
  const publicIDTagMatch = xml.match(/<(?:[\w.-]+:)?amplitude\b[^>]*publicID="[^"]*"[^>]*>/);
  if (!publicIDTagMatch) return undefined;
  const publicID = extractAttribute(publicIDTagMatch[0], 'publicID');
  if (publicID === undefined) return undefined;

  // <comment> is the repeatable child that opens the BED Amplitude sequence and
  // it carries its own creationInfo, so read the amplitude's scalars without it.
  const ownXML = stripChildElements(xml, ['comment']);

  const genericAmplitude = extractRealQuantity(ownXML, 'genericAmplitude');
  if (!genericAmplitude) return undefined;

  const amplitude: Amplitude = {
    publicID,
    genericAmplitude
  };

  const type = extractTagValue(ownXML, 'type');
  if (type) amplitude.type = type;
  const category = extractTagValue(ownXML, 'category');
  if (category) amplitude.category = category as any;
  const unit = extractTagValue(ownXML, 'unit');
  if (unit) amplitude.unit = unit;
  const methodID = extractTagValue(ownXML, 'methodID');
  if (methodID) amplitude.methodID = methodID;
  const period = extractRealQuantity(ownXML, 'period');
  if (period) amplitude.period = period;
  const snr = extractTagValue(ownXML, 'snr');
  if (snr) amplitude.snr = parseFloat(snr);
  const pickID = extractTagValue(ownXML, 'pickID');
  if (pickID) amplitude.pickID = pickID;
  const waveformID = extractWaveformID(ownXML);
  if (waveformID) amplitude.waveformID = waveformID;
  const filterID = extractTagValue(ownXML, 'filterID');
  if (filterID) amplitude.filterID = filterID;
  const scalingTime = extractTimeQuantity(ownXML, 'scalingTime');
  if (scalingTime) amplitude.scalingTime = scalingTime;
  const magnitudeHint = extractTagValue(ownXML, 'magnitudeHint');
  if (magnitudeHint) amplitude.magnitudeHint = magnitudeHint;
  const evaluationMode = extractTagValue(ownXML, 'evaluationMode');
  if (evaluationMode) amplitude.evaluationMode = evaluationMode as any;
  const evaluationStatus = extractTagValue(ownXML, 'evaluationStatus');
  if (evaluationStatus) amplitude.evaluationStatus = evaluationStatus as any;

  const creationInfo = extractCreationInfo(ownXML);
  if (creationInfo) amplitude.creationInfo = creationInfo;
  const comments = extractComments(xml);
  if (comments) amplitude.comment = comments;

  return amplitude;
}

/**
 * Extract StationMagnitude
 */
function extractStationMagnitude(xml: string): StationMagnitude | undefined {
  const publicIDTagMatch = xml.match(/<(?:[\w.-]+:)?stationMagnitude\b[^>]*publicID="[^"]*"[^>]*>/);
  if (!publicIDTagMatch) return undefined;
  const publicID = extractAttribute(publicIDTagMatch[0], 'publicID');
  if (publicID === undefined) return undefined;

  // <comment> is the repeatable child that opens the BED StationMagnitude
  // sequence and it carries its own creationInfo.
  const ownXML = stripChildElements(xml, ['comment']);

  const mag = extractRealQuantity(ownXML, 'mag');
  if (!mag) return undefined;

  const stationMagnitude: StationMagnitude = {
    publicID,
    mag
  };

  const originID = extractTagValue(ownXML, 'originID');
  if (originID) stationMagnitude.originID = originID;
  const type = extractTagValue(ownXML, 'type');
  if (type) stationMagnitude.type = type;
  const amplitudeID = extractTagValue(ownXML, 'amplitudeID');
  if (amplitudeID) stationMagnitude.amplitudeID = amplitudeID;
  const methodID = extractTagValue(ownXML, 'methodID');
  if (methodID) stationMagnitude.methodID = methodID;
  const waveformID = extractWaveformID(ownXML);
  if (waveformID) stationMagnitude.waveformID = waveformID;

  const creationInfo = extractCreationInfo(ownXML);
  if (creationInfo) stationMagnitude.creationInfo = creationInfo;
  const comments = extractComments(xml);
  if (comments) stationMagnitude.comment = comments;

  return stationMagnitude;
}

/**
 * Extract a single NodalPlane (BED requires strike, dip and rake)
 */
function extractNodalPlane(xml: string, planeTag: string): NodalPlane | undefined {
  const plane = nsTag(planeTag);
  const match = xml.match(new RegExp(`<${plane}\\b[^>]*>([\\s\\S]*?)<\\/${plane}>`));
  if (!match) return undefined;

  const content = match[1];
  const strike = extractRealQuantity(content, 'strike');
  const dip = extractRealQuantity(content, 'dip');
  const rake = extractRealQuantity(content, 'rake');
  if (!strike || !dip || !rake) return undefined;

  return { strike, dip, rake };
}

/**
 * Extract NodalPlanes
 */
function extractNodalPlanes(xml: string): NodalPlanes | undefined {
  const match = xml.match(/<(?:[\w.-]+:)?nodalPlanes\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?nodalPlanes>/);
  if (!match) return undefined;

  const attrs = match[1];
  const content = match[2];
  const nodalPlanes: NodalPlanes = {};

  const nodalPlane1 = extractNodalPlane(content, 'nodalPlane1');
  if (nodalPlane1) nodalPlanes.nodalPlane1 = nodalPlane1;
  const nodalPlane2 = extractNodalPlane(content, 'nodalPlane2');
  if (nodalPlane2) nodalPlanes.nodalPlane2 = nodalPlane2;

  // QuakeML-BED-1.2.xsd declares preferredPlane as an xs:integer ATTRIBUTE of
  // <nodalPlanes>. Accept the child-element spelling as well, because
  // lib/quakeml-exporter.ts currently writes it that way.
  const preferredPlaneStr = extractAttribute(attrs, 'preferredPlane') ?? extractTagValue(content, 'preferredPlane');
  if (preferredPlaneStr) {
    const preferredPlane = parseInt(preferredPlaneStr, 10);
    if (!isNaN(preferredPlane)) nodalPlanes.preferredPlane = preferredPlane;
  }

  return Object.keys(nodalPlanes).length > 0 ? nodalPlanes : undefined;
}

/**
 * Extract a single principal Axis (azimuth, plunge and length)
 */
function extractAxis(xml: string, axisTag: string): Axis | undefined {
  const axisName = nsTag(axisTag);
  const match = xml.match(new RegExp(`<${axisName}\\b[^>]*>([\\s\\S]*?)<\\/${axisName}>`));
  if (!match) return undefined;

  const content = match[1];
  const azimuth = extractRealQuantity(content, 'azimuth');
  const plunge = extractRealQuantity(content, 'plunge');
  if (!azimuth || !plunge) return undefined;

  const axis: Axis = { azimuth, plunge };
  const length = extractRealQuantity(content, 'length');
  if (length) axis.length = length;

  return axis;
}

/**
 * Extract PrincipalAxes (tAxis and pAxis are required, nAxis is optional)
 */
function extractPrincipalAxes(xml: string): PrincipalAxes | undefined {
  const match = xml.match(/<(?:[\w.-]+:)?principalAxes\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?principalAxes>/);
  if (!match) return undefined;

  const content = match[1];
  const tAxis = extractAxis(content, 'tAxis');
  const pAxis = extractAxis(content, 'pAxis');
  if (!tAxis || !pAxis) return undefined;

  const principalAxes: PrincipalAxes = { tAxis, pAxis };
  const nAxis = extractAxis(content, 'nAxis');
  if (nAxis) principalAxes.nAxis = nAxis;

  return principalAxes;
}

/**
 * Extract the moment tensor components (BED requires all six)
 */
function extractTensor(xml: string): Tensor | undefined {
  const match = xml.match(/<(?:[\w.-]+:)?tensor\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?tensor>/);
  if (!match) return undefined;

  const content = match[1];
  const Mrr = extractRealQuantity(content, 'Mrr');
  const Mtt = extractRealQuantity(content, 'Mtt');
  const Mpp = extractRealQuantity(content, 'Mpp');
  const Mrt = extractRealQuantity(content, 'Mrt');
  const Mrp = extractRealQuantity(content, 'Mrp');
  const Mtp = extractRealQuantity(content, 'Mtp');
  if (!Mrr || !Mtt || !Mpp || !Mrt || !Mrp || !Mtp) return undefined;

  return { Mrr, Mtt, Mpp, Mrt, Mrp, Mtp };
}

/**
 * Extract FocalMechanism
 */
function extractFocalMechanism(xml: string): FocalMechanism | undefined {
  const publicIDTagMatch = xml.match(/<(?:[\w.-]+:)?focalMechanism\b[^>]*publicID="[^"]*"[^>]*>/);
  if (!publicIDTagMatch) return undefined;
  const publicID = extractAttribute(publicIDTagMatch[0], 'publicID');
  if (publicID === undefined) return undefined;

  const focalMechanism: FocalMechanism = {
    publicID
  };

  // waveformID, comment and momentTensor are the repeatable children that open
  // the BED FocalMechanism sequence, so they precede (and shadow) the mechanism's
  // own methodID / creationInfo — momentTensor carries both of those itself.
  const ownXML = stripChildElements(xml, ['comment', 'momentTensor']);

  const triggeringOriginID = extractTagValue(ownXML, 'triggeringOriginID');
  if (triggeringOriginID) focalMechanism.triggeringOriginID = triggeringOriginID;

  const nodalPlanes = extractNodalPlanes(ownXML);
  if (nodalPlanes) focalMechanism.nodalPlanes = nodalPlanes;

  const principalAxes = extractPrincipalAxes(ownXML);
  if (principalAxes) focalMechanism.principalAxes = principalAxes;

  const azimuthalGap = extractTagValue(ownXML, 'azimuthalGap');
  if (azimuthalGap) focalMechanism.azimuthalGap = parseFloat(azimuthalGap);
  const stationPolarityCount = extractTagValue(ownXML, 'stationPolarityCount');
  if (stationPolarityCount) focalMechanism.stationPolarityCount = parseInt(stationPolarityCount);
  const misfit = extractTagValue(ownXML, 'misfit');
  if (misfit) focalMechanism.misfit = parseFloat(misfit);
  const stationDistributionRatio = extractTagValue(ownXML, 'stationDistributionRatio');
  if (stationDistributionRatio) focalMechanism.stationDistributionRatio = parseFloat(stationDistributionRatio);
  const methodID = extractTagValue(ownXML, 'methodID');
  if (methodID) focalMechanism.methodID = methodID;
  const evaluationMode = extractTagValue(ownXML, 'evaluationMode');
  if (evaluationMode) focalMechanism.evaluationMode = evaluationMode as any;
  const evaluationStatus = extractTagValue(ownXML, 'evaluationStatus');
  if (evaluationStatus) focalMechanism.evaluationStatus = evaluationStatus as any;

  const momentTensorMatch = xml.match(/<(?:[\w.-]+:)?momentTensor\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?momentTensor>/);
  if (momentTensorMatch) {
    const mtXml = momentTensorMatch[0];
    const mtAttrs = momentTensorMatch[1];
    // dataUsed and comment open the BED MomentTensor sequence; comment carries
    // its own creationInfo and dataUsed its own stationCount.
    const mtOwnXML = stripChildElements(mtXml, ['comment', 'dataUsed']);
    const derivedOriginID = extractTagValue(mtOwnXML, 'derivedOriginID');
    if (derivedOriginID) {
      const momentTensor: MomentTensor = { derivedOriginID };
      const mtPublicID = extractAttribute(mtAttrs, 'publicID');
      if (mtPublicID !== undefined) momentTensor.publicID = mtPublicID;
      const momentMagnitudeID = extractTagValue(mtOwnXML, 'momentMagnitudeID');
      if (momentMagnitudeID) momentTensor.momentMagnitudeID = momentMagnitudeID;
      const scalarMoment = extractRealQuantity(mtOwnXML, 'scalarMoment');
      if (scalarMoment) momentTensor.scalarMoment = scalarMoment;
      const tensor = extractTensor(mtOwnXML);
      if (tensor) momentTensor.tensor = tensor;
      const variance = extractTagValue(mtOwnXML, 'variance');
      if (variance) momentTensor.variance = parseFloat(variance);
      const varianceReduction = extractTagValue(mtOwnXML, 'varianceReduction');
      if (varianceReduction) momentTensor.varianceReduction = parseFloat(varianceReduction);
      const doubleCouple = extractTagValue(mtOwnXML, 'doubleCouple');
      if (doubleCouple) momentTensor.doubleCouple = parseFloat(doubleCouple);
      const clvd = extractTagValue(mtOwnXML, 'clvd');
      if (clvd) momentTensor.clvd = parseFloat(clvd);
      const iso = extractTagValue(mtOwnXML, 'iso');
      if (iso) momentTensor.iso = parseFloat(iso);
      const greensFunctionID = extractTagValue(mtOwnXML, 'greensFunctionID');
      if (greensFunctionID) momentTensor.greensFunctionID = greensFunctionID;
      const filterID = extractTagValue(mtOwnXML, 'filterID');
      if (filterID) momentTensor.filterID = filterID;
      const methodID = extractTagValue(mtOwnXML, 'methodID');
      if (methodID) momentTensor.methodID = methodID;
      const category = extractTagValue(mtOwnXML, 'category');
      if (category) momentTensor.category = category;
      const inversionType = extractTagValue(mtOwnXML, 'inversionType');
      if (inversionType) momentTensor.inversionType = inversionType;
      const creationInfo = extractCreationInfo(mtOwnXML);
      if (creationInfo) momentTensor.creationInfo = creationInfo;
      focalMechanism.momentTensor = momentTensor;
    }
  }

  const waveformIDs = Array.from(xml.matchAll(/<(?:[\w.-]+:)?waveformID\b[^>]*\/?>/g))
    .map(match => extractWaveformID(match[0]))
    .filter((item): item is WaveformStreamID => !!item);
  if (waveformIDs.length > 0) focalMechanism.waveformID = waveformIDs;

  const creationInfo = extractCreationInfo(ownXML);
  if (creationInfo) focalMechanism.creationInfo = creationInfo;
  const comments = extractComments(xml);
  if (comments) focalMechanism.comment = comments;

  return focalMechanism;
}

/**
 * Parse QuakeML event and extract all fields
 */
export function parseQuakeMLEvent(eventXML: string): QuakeMLEvent | null {
  try {
    // Extract publicID
    const publicIDTagMatch = eventXML.match(/<(?:[\w.-]+:)?event\b[^>]*publicID="[^"]*"[^>]*>/);
    if (!publicIDTagMatch) return null;
    const eventPublicID = extractAttribute(publicIDTagMatch[0], 'publicID');
    if (eventPublicID === undefined) return null;

    const event: QuakeMLEvent = {
      publicID: eventPublicID
    };

    // The event's own type/typeCertainty/preferred*ID are the LAST children in
    // the BED Event sequence, after the unbounded description | comment |
    // focalMechanism | amplitude | magnitude | stationMagnitude | origin | pick
    // choice group. description/<type> ("region name"), magnitude/<type> ("ML"),
    // origin/<type> ("hypocenter"), amplitude/<type> and stationMagnitude/<type>
    // therefore all precede it, so a first-match scan has to run over the
    // event's own children only.
    const eventOwnXML = stripChildElements(eventXML, EVENT_CHILD_ELEMENTS);

    // Extract event type
    const type = extractTagValue(eventOwnXML, 'type');
    if (type) event.type = type as any;

    const typeCertainty = extractTagValue(eventOwnXML, 'typeCertainty');
    if (typeCertainty) event.typeCertainty = typeCertainty as any;

    // Extract descriptions
    const descriptions = extractEventDescriptions(eventXML);
    if (descriptions) event.description = descriptions;

    // Extract comments
    const comments = extractComments(eventXML);
    if (comments) event.comment = comments;

    // Extract creation info (exclude nested elements to get event-level creationInfo)
    const creationInfo = extractCreationInfo(eventXML, true);
    if (creationInfo) event.creationInfo = creationInfo;

    // Extract preferred IDs
    const preferredOriginID = extractTagValue(eventOwnXML, 'preferredOriginID');
    if (preferredOriginID) event.preferredOriginID = preferredOriginID;

    const preferredMagnitudeID = extractTagValue(eventOwnXML, 'preferredMagnitudeID');
    if (preferredMagnitudeID) event.preferredMagnitudeID = preferredMagnitudeID;

    const preferredFocalMechanismID = extractTagValue(eventOwnXML, 'preferredFocalMechanismID');
    if (preferredFocalMechanismID) event.preferredFocalMechanismID = preferredFocalMechanismID;

    // Extract origins
    const originMatchesArray = Array.from(eventXML.matchAll(/<(?:[\w.-]+:)?origin\b[^>]*publicID="[^"]*"[^>]*>(.*?)<\/(?:[\w.-]+:)?origin>/gs));
    const origins: Origin[] = [];
    for (let j = 0; j < originMatchesArray.length; j++) {
      const match = originMatchesArray[j];
      const originXML = match[0];
      const origin = extractOrigin(originXML);
      if (origin) origins.push(origin);
    }
    if (origins.length > 0) event.origins = origins;

    // Extract magnitudes
    const magnitudeMatchesArray = Array.from(eventXML.matchAll(/<(?:[\w.-]+:)?magnitude\b[^>]*publicID="[^"]*"[^>]*>(.*?)<\/(?:[\w.-]+:)?magnitude>/gs));
    const magnitudes: Magnitude[] = [];
    for (let j = 0; j < magnitudeMatchesArray.length; j++) {
      const match = magnitudeMatchesArray[j];
      const magnitudeXML = match[0];
      const magnitude = extractMagnitude(magnitudeXML);
      if (magnitude) magnitudes.push(magnitude);
    }
    if (magnitudes.length > 0) event.magnitudes = magnitudes;

    // Extract picks
    const pickMatchesArray = Array.from(eventXML.matchAll(/<(?:[\w.-]+:)?pick\b[^>]*publicID="[^"]*"[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?pick>/g));
    const picks: Pick[] = [];
    for (let j = 0; j < pickMatchesArray.length; j++) {
      const pick = extractPick(pickMatchesArray[j][0]);
      if (pick) picks.push(pick);
    }
    if (picks.length > 0) event.picks = picks;

    // Arrivals are children of Origin in BED and are parsed there (origin.arrivals).
    // The flat event-level list is kept for the flattened DB column
    // (lib/quakeml-to-db.ts -> `arrivals`) and is defined as the PREFERRED
    // origin's phase set, so the column can never be attributed to a different
    // solution than the one whose quality counts are stored alongside it.
    const preferredOrigin =
      (event.preferredOriginID && origins.find(o => o.publicID === event.preferredOriginID)) || origins[0];
    if (preferredOrigin?.arrivals?.length) {
      event.arrivals = preferredOrigin.arrivals;
    } else if (!origins.some(o => o.arrivals?.length)) {
      // Fall back to a flat scan for documents that place <arrival> outside any
      // <origin>; doing this only when no origin owns arrivals keeps the export
      // from re-attaching one origin's phases to another.
      const arrivals = extractArrivals(eventXML);
      if (arrivals.length > 0) event.arrivals = arrivals;
    }

    // Extract station magnitudes
    const stationMagnitudeMatchesArray = Array.from(eventXML.matchAll(/<(?:[\w.-]+:)?stationMagnitude\b[^>]*publicID="[^"]*"[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?stationMagnitude>/g));
    const stationMagnitudes: StationMagnitude[] = [];
    for (let j = 0; j < stationMagnitudeMatchesArray.length; j++) {
      const stationMagnitude = extractStationMagnitude(stationMagnitudeMatchesArray[j][0]);
      if (stationMagnitude) stationMagnitudes.push(stationMagnitude);
    }
    if (stationMagnitudes.length > 0) event.stationMagnitudes = stationMagnitudes;

    // Extract amplitudes
    const amplitudeMatchesArray = Array.from(eventXML.matchAll(/<(?:[\w.-]+:)?amplitude\b[^>]*publicID="[^"]*"[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?amplitude>/g));
    const amplitudes: Amplitude[] = [];
    for (let j = 0; j < amplitudeMatchesArray.length; j++) {
      const amplitude = extractAmplitude(amplitudeMatchesArray[j][0]);
      if (amplitude) amplitudes.push(amplitude);
    }
    if (amplitudes.length > 0) event.amplitudes = amplitudes;

    // Extract focal mechanisms
    const focalMechanismMatchesArray = Array.from(eventXML.matchAll(/<(?:[\w.-]+:)?focalMechanism\b[^>]*publicID="[^"]*"[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?focalMechanism>/g));
    const focalMechanisms: FocalMechanism[] = [];
    for (let j = 0; j < focalMechanismMatchesArray.length; j++) {
      const focalMechanism = extractFocalMechanism(focalMechanismMatchesArray[j][0]);
      if (focalMechanism) focalMechanisms.push(focalMechanism);
    }
    if (focalMechanisms.length > 0) event.focalMechanisms = focalMechanisms;

    return event;
  } catch (error) {
    console.error('Error parsing QuakeML event:', error);
    return null;
  }
}

/**
 * Streaming QuakeML Parser Options
 */
export interface QuakeMLStreamOptions {
  /**
   * Callback function called for each parsed event
   */
  onEvent?: (event: QuakeMLEvent) => void | Promise<void>;

  /**
   * Callback function called for each batch of events
   */
  onBatch?: (events: QuakeMLEvent[]) => void | Promise<void>;

  /**
   * Number of events to accumulate before calling onBatch
   * Default: 100
   */
  batchSize?: number;

  /**
   * Callback function called when parsing encounters an error
   */
  onError?: (error: Error, eventXML?: string) => void;
}

/**
 * Streaming QuakeML Parser Result
 */
export interface QuakeMLStreamResult {
  totalEvents: number;
  successfulEvents: number;
  errors: Array<{ message: string; eventXML?: string }>;
}

/**
 * Parse QuakeML file using SAX streaming parser
 */
export async function parseQuakeMLStream(
  filePath: string,
  options: QuakeMLStreamOptions = {}
): Promise<QuakeMLStreamResult> {
  const {
    onEvent,
    onBatch,
    batchSize = 100,
    onError
  } = options;

  return new Promise((resolve, reject) => {
    const result: QuakeMLStreamResult = {
      totalEvents: 0,
      successfulEvents: 0,
      errors: []
    };

    let currentEventXML = '';
    let insideEvent = false;
    let eventDepth = 0;
    let eventBatch: QuakeMLEvent[] = [];
    // Callbacks may be async, but sax emits synchronously for a whole stream
    // chunk, so the handlers below stay synchronous and hand the asynchronous
    // work to this chain instead. Awaiting inside a handler would defer the
    // per-event state reset to a microtask that only runs at the end of the
    // chunk, by which point the next event has already started accumulating.
    let pendingWrite: Promise<void> = Promise.resolve();
    let streamFailed = false;

    // Create SAX parser (strict mode for valid XML)
    const parser = sax.createStream(true, {
      trim: false,
      normalize: false
    });

    // Create read stream and pipe to SAX parser
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });

    // Chain callback work onto pendingWrite and pause the source while it runs,
    // so a slow consumer applies back-pressure instead of buffering the file.
    const enqueue = (work: () => void | Promise<void>) => {
      fileStream.pause();
      pendingWrite = pendingWrite
        .then(work)
        .finally(() => {
          if (!streamFailed && !fileStream.destroyed) fileStream.resume();
        });
    };

    const serializeOpenTag = (node: sax.Tag | sax.QualifiedTag): string => {
      let out = `<${node.name}`;
      for (const [key, value] of Object.entries(node.attributes)) {
        out += ` ${key}="${escapeXml(String(value))}"`;
      }
      out += '>';
      return out;
    };

    const handleEvent = (eventXML: string) => {
      result.totalEvents++;

      let event: QuakeMLEvent | null = null;
      try {
        event = parseQuakeMLEvent(eventXML);
      } catch (error) {
        const err = error as Error;
        result.errors.push({
          message: err.message,
          eventXML: eventXML.substring(0, 200) + '...'
        });
        if (onError) onError(err, eventXML);
        return;
      }

      if (!event) {
        const error = new Error('Failed to parse event');
        result.errors.push({
          message: error.message,
          eventXML: eventXML.substring(0, 200) + '...'
        });
        if (onError) onError(error, eventXML);
        return;
      }

      result.successfulEvents++;
      const parsedEvent = event;

      // Call per-event callback
      if (onEvent) {
        enqueue(async () => {
          try {
            await onEvent(parsedEvent);
          } catch (error) {
            const err = error as Error;
            result.errors.push({ message: err.message });
            if (onError) onError(err);
          }
        });
      }

      // Add to batch
      if (onBatch) {
        eventBatch.push(parsedEvent);

        // Process batch if it reaches the batch size
        if (eventBatch.length >= batchSize) {
          flushBatch();
        }
      }
    };

    const flushBatch = () => {
      if (!onBatch || eventBatch.length === 0) return;
      const batch = eventBatch;
      eventBatch = [];
      enqueue(async () => {
        try {
          await onBatch(batch);
        } catch (error) {
          const err = error as Error;
          result.errors.push({ message: `Batch processing error: ${err.message}` });
        }
      });
    };

    // Track when we enter/exit <event> tags
    parser.on('opentag', (node) => {
      if (isEventTagName(node.name)) {
        insideEvent = true;
        eventDepth = 1;
        currentEventXML = serializeOpenTag(node);
        return;
      }

      if (!insideEvent) return;
      eventDepth += 1;
      currentEventXML += serializeOpenTag(node);
    });

    parser.on('text', (text) => {
      // sax has already resolved entity and character references; re-escape so
      // the re-serialised fragment is well-formed XML and decodes back to the
      // same text in parseQuakeMLEvent. Without this a <text>a &lt; b</text>
      // becomes a literal '<' and the element is silently unreadable.
      if (insideEvent && text.length > 0) {
        currentEventXML += escapeXml(text);
      }
    });

    parser.on('cdata', (text) => {
      if (insideEvent) {
        currentEventXML += `<![CDATA[${text}]]>`;
      }
    });

    parser.on('closetag', (tagName) => {
      if (!insideEvent) return;
      currentEventXML += `</${tagName}>`;
      eventDepth -= 1;

      if (eventDepth !== 0) return;

      // Capture and reset synchronously, before any callback can yield.
      const eventXML = currentEventXML;
      currentEventXML = '';
      insideEvent = false;

      handleEvent(eventXML);
    });

    parser.on('error', (error) => {
      result.errors.push({ message: error.message });
      if (onError) {
        onError(error);
      }
      // Don't reject - continue parsing
      parser.resume();
    });

    parser.on('end', () => {
      // Process any remaining events in the batch, then wait for every queued
      // callback to settle before reporting the result.
      flushBatch();
      pendingWrite.then(() => resolve(result), reject);
    });

    fileStream.on('error', (error) => {
      streamFailed = true;
      reject(error);
    });

    fileStream.pipe(parser);
  });
}
