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
  NodalPlanes,
  PrincipalAxes,
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

/**
 * Extract text content from XML tag
 */
function extractTagValue(xml: string, tagName: string): string | undefined {
  const tag = nsTag(tagName);
  const regex = new RegExp(`<${tag}\\b[^>]*>([^<]*)<\\/${tag}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Extract nested value tag (e.g., <magnitude><value>5.2</value></magnitude>)
 */
function extractNestedValue(xml: string, parentTag: string): string | undefined {
  const parent = nsTag(parentTag);
  const value = nsTag('value');
  const regex = new RegExp(`<${parent}\\b[^>]*>.*?<${value}>([^<]*)<\\/${value}>.*?<\\/${parent}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
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

  // If excludeNested, remove nested elements that might contain creationInfo
  if (excludeNested) {
    // Remove comment elements
    searchXML = searchXML.replace(/<(?:[\w.-]+:)?comment\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?comment>/g, '');
    // Remove origin elements
    searchXML = searchXML.replace(/<(?:[\w.-]+:)?origin\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?origin>/g, '');
    // Remove magnitude elements
    searchXML = searchXML.replace(/<(?:[\w.-]+:)?magnitude\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?magnitude>/g, '');
    // Remove description elements
    searchXML = searchXML.replace(/<(?:[\w.-]+:)?description\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?description>/g, '');
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
      const idMatch = attrs.match(/\bid="([^"]*)"/);
      if (idMatch) comment.id = idMatch[1];
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
  const publicIDMatch = xml.match(/<(?:[\w.-]+:)?origin\b[^>]*publicID="([^"]*)"[^>]*>/);
  if (!publicIDMatch) return undefined;

  const publicID = publicIDMatch[1];
  const time = extractTimeQuantity(xml, 'time');
  const latitude = extractRealQuantity(xml, 'latitude');
  const longitude = extractRealQuantity(xml, 'longitude');

  if (!time || !latitude || !longitude) return undefined;

  const origin: Origin = {
    publicID,
    time,
    latitude,
    longitude
  };

  const depth = extractRealQuantity(xml, 'depth');
  if (depth) origin.depth = depth;

  const depthType = extractTagValue(xml, 'depthType');
  if (depthType) origin.depthType = depthType as any;

  // Extract origin metadata (QuakeML/GeoNet/ISC fields)
  const earthModelID = extractTagValue(xml, 'earthModelID');
  if (earthModelID) origin.earthModelID = earthModelID;

  const methodID = extractTagValue(xml, 'methodID');
  if (methodID) origin.methodID = methodID;

  const region = extractTagValue(xml, 'region');
  if (region) origin.region = region;

  const evaluationMode = extractTagValue(xml, 'evaluationMode');
  if (evaluationMode) origin.evaluationMode = evaluationMode as any;

  const evaluationStatus = extractTagValue(xml, 'evaluationStatus');
  if (evaluationStatus) origin.evaluationStatus = evaluationStatus as any;

  const quality = extractOriginQuality(xml);
  if (quality) origin.quality = quality;

  const uncertainty = extractOriginUncertainty(xml);
  if (uncertainty) origin.uncertainty = uncertainty;

  const creationInfo = extractCreationInfo(xml);
  if (creationInfo) origin.creationInfo = creationInfo;

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
  const networkCode  = (attrs.match(/\bnetworkCode="([^"]*)"/)  || [])[1];
  const stationCode  = (attrs.match(/\bstationCode="([^"]*)"/)  || [])[1];
  if (!networkCode || !stationCode) return undefined;

  const waveformID: WaveformStreamID = { networkCode, stationCode };
  const locationCode = (attrs.match(/\blocationCode="([^"]*)"/) || [])[1];
  if (locationCode !== undefined) waveformID.locationCode = locationCode;
  const channelCode  = (attrs.match(/\bchannelCode="([^"]*)"/)  || [])[1];
  if (channelCode !== undefined) waveformID.channelCode = channelCode;
  const resourceURI  = (attrs.match(/\bresourceURI="([^"]*)"/)  || [])[1];
  if (resourceURI !== undefined) waveformID.resourceURI = resourceURI;

  return waveformID;
}

/**
 * Extract Pick
 */
function extractPick(xml: string): Pick | undefined {
  const publicIDMatch = xml.match(/<(?:[\w.-]+:)?pick\b[^>]*publicID="([^"]*)"[^>]*>/);
  if (!publicIDMatch) return undefined;

  const publicID = publicIDMatch[1];
  const time = extractTimeQuantity(xml, 'time');
  if (!time) return undefined;

  const waveformID = extractWaveformID(xml);
  if (!waveformID) return undefined;

  const pick: Pick = { publicID, time, waveformID };

  const filterID = extractTagValue(xml, 'filterID');
  if (filterID) pick.filterID = filterID;

  const methodID = extractTagValue(xml, 'methodID');
  if (methodID) pick.methodID = methodID;

  const onset = extractTagValue(xml, 'onset');
  if (onset) pick.onset = onset as any;

  const phaseHint = extractTagValue(xml, 'phaseHint');
  if (phaseHint) pick.phaseHint = phaseHint;

  const polarity = extractTagValue(xml, 'polarity');
  if (polarity) pick.polarity = polarity as any;

  const evaluationMode = extractTagValue(xml, 'evaluationMode');
  if (evaluationMode) pick.evaluationMode = evaluationMode as any;

  const evaluationStatus = extractTagValue(xml, 'evaluationStatus');
  if (evaluationStatus) pick.evaluationStatus = evaluationStatus as any;

  const creationInfo = extractCreationInfo(xml);
  if (creationInfo) pick.creationInfo = creationInfo;

  const comments = extractComments(xml);
  if (comments) pick.comment = comments;

  return pick;
}

/**
 * Extract Magnitude
 */
function extractMagnitude(xml: string): Magnitude | undefined {
  const publicIDMatch = xml.match(/<(?:[\w.-]+:)?magnitude\b[^>]*publicID="([^"]*)"[^>]*>/);
  if (!publicIDMatch) return undefined;

  const publicID = publicIDMatch[1];
  const mag = extractRealQuantity(xml, 'mag');

  if (!mag) return undefined;

  const magnitude: Magnitude = {
    publicID,
    mag
  };

  const type = extractTagValue(xml, 'type');
  if (type) magnitude.type = type;

  // Extract magnitude method ID (QuakeML/GeoNet/ISC field)
  const methodID = extractTagValue(xml, 'methodID');
  if (methodID) magnitude.methodID = methodID;

  const stationCount = extractTagValue(xml, 'stationCount');
  if (stationCount) magnitude.stationCount = parseInt(stationCount);

  const azimuthalGap = extractTagValue(xml, 'azimuthalGap');
  if (azimuthalGap) magnitude.azimuthalGap = parseFloat(azimuthalGap);

  const evaluationMode = extractTagValue(xml, 'evaluationMode');
  if (evaluationMode) magnitude.evaluationMode = evaluationMode as any;

  const evaluationStatus = extractTagValue(xml, 'evaluationStatus');
  if (evaluationStatus) magnitude.evaluationStatus = evaluationStatus as any;

  const creationInfo = extractCreationInfo(xml);
  if (creationInfo) magnitude.creationInfo = creationInfo;

  return magnitude;
}

/**
 * Extract Arrival
 */
function extractArrival(xml: string): Arrival | undefined {
  const pickID = extractTagValue(xml, 'pickID');
  const phase = extractTagValue(xml, 'phase');
  if (!pickID || !phase) return undefined;

  const publicIDMatch = xml.match(/<(?:[\w.-]+:)?arrival\b[^>]*publicID="([^"]*)"[^>]*>/);
  const arrival: Arrival = { pickID, phase };
  if (publicIDMatch) arrival.publicID = publicIDMatch[1];

  const timeCorrection = extractTagValue(xml, 'timeCorrection');
  if (timeCorrection) arrival.timeCorrection = parseFloat(timeCorrection);
  const azimuth = extractTagValue(xml, 'azimuth');
  if (azimuth) arrival.azimuth = parseFloat(azimuth);
  const distance = extractTagValue(xml, 'distance');
  if (distance) arrival.distance = parseFloat(distance);
  const takeoffAngle = extractRealQuantity(xml, 'takeoffAngle');
  if (takeoffAngle) arrival.takeoffAngle = takeoffAngle;
  const timeResidual = extractTagValue(xml, 'timeResidual');
  if (timeResidual) arrival.timeResidual = parseFloat(timeResidual);
  const horizontalSlownessResidual = extractTagValue(xml, 'horizontalSlownessResidual');
  if (horizontalSlownessResidual) arrival.horizontalSlownessResidual = parseFloat(horizontalSlownessResidual);
  const backazimuthResidual = extractTagValue(xml, 'backazimuthResidual');
  if (backazimuthResidual) arrival.backazimuthResidual = parseFloat(backazimuthResidual);
  const timeWeight = extractTagValue(xml, 'timeWeight');
  if (timeWeight) arrival.timeWeight = parseFloat(timeWeight);
  const horizontalSlownessWeight = extractTagValue(xml, 'horizontalSlownessWeight');
  if (horizontalSlownessWeight) arrival.horizontalSlownessWeight = parseFloat(horizontalSlownessWeight);
  const backazimuthWeight = extractTagValue(xml, 'backazimuthWeight');
  if (backazimuthWeight) arrival.backazimuthWeight = parseFloat(backazimuthWeight);
  const earthModelID = extractTagValue(xml, 'earthModelID');
  if (earthModelID) arrival.earthModelID = earthModelID;

  const creationInfo = extractCreationInfo(xml);
  if (creationInfo) arrival.creationInfo = creationInfo;
  const comments = extractComments(xml);
  if (comments) arrival.comment = comments;

  return arrival;
}

/**
 * Extract Amplitude
 */
function extractAmplitude(xml: string): Amplitude | undefined {
  const publicIDMatch = xml.match(/<(?:[\w.-]+:)?amplitude\b[^>]*publicID="([^"]*)"[^>]*>/);
  if (!publicIDMatch) return undefined;

  const genericAmplitude = extractRealQuantity(xml, 'genericAmplitude');
  if (!genericAmplitude) return undefined;

  const amplitude: Amplitude = {
    publicID: publicIDMatch[1],
    genericAmplitude
  };

  const type = extractTagValue(xml, 'type');
  if (type) amplitude.type = type;
  const category = extractTagValue(xml, 'category');
  if (category) amplitude.category = category as any;
  const unit = extractTagValue(xml, 'unit');
  if (unit) amplitude.unit = unit;
  const methodID = extractTagValue(xml, 'methodID');
  if (methodID) amplitude.methodID = methodID;
  const period = extractRealQuantity(xml, 'period');
  if (period) amplitude.period = period;
  const snr = extractTagValue(xml, 'snr');
  if (snr) amplitude.snr = parseFloat(snr);
  const pickID = extractTagValue(xml, 'pickID');
  if (pickID) amplitude.pickID = pickID;
  const waveformID = extractWaveformID(xml);
  if (waveformID) amplitude.waveformID = waveformID;
  const filterID = extractTagValue(xml, 'filterID');
  if (filterID) amplitude.filterID = filterID;
  const scalingTime = extractTimeQuantity(xml, 'scalingTime');
  if (scalingTime) amplitude.scalingTime = scalingTime;
  const magnitudeHint = extractTagValue(xml, 'magnitudeHint');
  if (magnitudeHint) amplitude.magnitudeHint = magnitudeHint;
  const evaluationMode = extractTagValue(xml, 'evaluationMode');
  if (evaluationMode) amplitude.evaluationMode = evaluationMode as any;
  const evaluationStatus = extractTagValue(xml, 'evaluationStatus');
  if (evaluationStatus) amplitude.evaluationStatus = evaluationStatus as any;

  const creationInfo = extractCreationInfo(xml);
  if (creationInfo) amplitude.creationInfo = creationInfo;
  const comments = extractComments(xml);
  if (comments) amplitude.comment = comments;

  return amplitude;
}

/**
 * Extract StationMagnitude
 */
function extractStationMagnitude(xml: string): StationMagnitude | undefined {
  const publicIDMatch = xml.match(/<(?:[\w.-]+:)?stationMagnitude\b[^>]*publicID="([^"]*)"[^>]*>/);
  if (!publicIDMatch) return undefined;

  const mag = extractRealQuantity(xml, 'mag');
  if (!mag) return undefined;

  const stationMagnitude: StationMagnitude = {
    publicID: publicIDMatch[1],
    mag
  };

  const originID = extractTagValue(xml, 'originID');
  if (originID) stationMagnitude.originID = originID;
  const type = extractTagValue(xml, 'type');
  if (type) stationMagnitude.type = type;
  const amplitudeID = extractTagValue(xml, 'amplitudeID');
  if (amplitudeID) stationMagnitude.amplitudeID = amplitudeID;
  const methodID = extractTagValue(xml, 'methodID');
  if (methodID) stationMagnitude.methodID = methodID;
  const waveformID = extractWaveformID(xml);
  if (waveformID) stationMagnitude.waveformID = waveformID;

  const creationInfo = extractCreationInfo(xml);
  if (creationInfo) stationMagnitude.creationInfo = creationInfo;
  const comments = extractComments(xml);
  if (comments) stationMagnitude.comment = comments;

  return stationMagnitude;
}

/**
 * Extract FocalMechanism
 */
function extractFocalMechanism(xml: string): FocalMechanism | undefined {
  const publicIDMatch = xml.match(/<(?:[\w.-]+:)?focalMechanism\b[^>]*publicID="([^"]*)"[^>]*>/);
  if (!publicIDMatch) return undefined;

  const focalMechanism: FocalMechanism = {
    publicID: publicIDMatch[1]
  };

  const triggeringOriginID = extractTagValue(xml, 'triggeringOriginID');
  if (triggeringOriginID) focalMechanism.triggeringOriginID = triggeringOriginID;
  const azimuthalGap = extractTagValue(xml, 'azimuthalGap');
  if (azimuthalGap) focalMechanism.azimuthalGap = parseFloat(azimuthalGap);
  const stationPolarityCount = extractTagValue(xml, 'stationPolarityCount');
  if (stationPolarityCount) focalMechanism.stationPolarityCount = parseInt(stationPolarityCount);
  const misfit = extractTagValue(xml, 'misfit');
  if (misfit) focalMechanism.misfit = parseFloat(misfit);
  const stationDistributionRatio = extractTagValue(xml, 'stationDistributionRatio');
  if (stationDistributionRatio) focalMechanism.stationDistributionRatio = parseFloat(stationDistributionRatio);
  const methodID = extractTagValue(xml, 'methodID');
  if (methodID) focalMechanism.methodID = methodID;
  const evaluationMode = extractTagValue(xml, 'evaluationMode');
  if (evaluationMode) focalMechanism.evaluationMode = evaluationMode as any;
  const evaluationStatus = extractTagValue(xml, 'evaluationStatus');
  if (evaluationStatus) focalMechanism.evaluationStatus = evaluationStatus as any;

  const momentTensorMatch = xml.match(/<(?:[\w.-]+:)?momentTensor\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?momentTensor>/);
  if (momentTensorMatch) {
    const mtXml = momentTensorMatch[0];
    const derivedOriginID = extractTagValue(mtXml, 'derivedOriginID');
    if (derivedOriginID) {
      const momentTensor: MomentTensor = { derivedOriginID };
      const momentMagnitudeID = extractTagValue(mtXml, 'momentMagnitudeID');
      if (momentMagnitudeID) momentTensor.momentMagnitudeID = momentMagnitudeID;
      const scalarMoment = extractRealQuantity(mtXml, 'scalarMoment');
      if (scalarMoment) momentTensor.scalarMoment = scalarMoment;
      const methodID = extractTagValue(mtXml, 'methodID');
      if (methodID) momentTensor.methodID = methodID;
      const category = extractTagValue(mtXml, 'category');
      if (category) momentTensor.category = category;
      const inversionType = extractTagValue(mtXml, 'inversionType');
      if (inversionType) momentTensor.inversionType = inversionType;
      const creationInfo = extractCreationInfo(mtXml);
      if (creationInfo) momentTensor.creationInfo = creationInfo;
      focalMechanism.momentTensor = momentTensor;
    }
  }

  const waveformIDs = Array.from(xml.matchAll(/<(?:[\w.-]+:)?waveformID\b[^>]*\/?>/g))
    .map(match => extractWaveformID(match[0]))
    .filter((item): item is WaveformStreamID => !!item);
  if (waveformIDs.length > 0) focalMechanism.waveformID = waveformIDs;

  const creationInfo = extractCreationInfo(xml);
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
    const publicIDMatch = eventXML.match(/<(?:[\w.-]+:)?event\b[^>]*publicID="([^"]*)"[^>]*>/);
    if (!publicIDMatch) return null;

    const event: QuakeMLEvent = {
      publicID: publicIDMatch[1]
    };

    // Extract event type
    const type = extractTagValue(eventXML, 'type');
    if (type) event.type = type as any;

    const typeCertainty = extractTagValue(eventXML, 'typeCertainty');
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
    const preferredOriginID = extractTagValue(eventXML, 'preferredOriginID');
    if (preferredOriginID) event.preferredOriginID = preferredOriginID;

    const preferredMagnitudeID = extractTagValue(eventXML, 'preferredMagnitudeID');
    if (preferredMagnitudeID) event.preferredMagnitudeID = preferredMagnitudeID;

    const preferredFocalMechanismID = extractTagValue(eventXML, 'preferredFocalMechanismID');
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

    // Extract arrivals (typically nested under origins)
    const arrivalMatchesArray = Array.from(eventXML.matchAll(/<(?:[\w.-]+:)?arrival\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?arrival>/g));
    const arrivals: Arrival[] = [];
    for (let j = 0; j < arrivalMatchesArray.length; j++) {
      const arrival = extractArrival(arrivalMatchesArray[j][0]);
      if (arrival) arrivals.push(arrival);
    }
    if (arrivals.length > 0) event.arrivals = arrivals;

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
 *
 * Performance Optimization: Uses SAX parser to process large QuakeML files
 * with constant memory usage. Processes events one at a time without loading
 * the entire file into memory.
 *
 * @param filePath - Path to QuakeML file
 * @param options - Streaming options
 * @returns Promise<QuakeMLStreamResult>
 *
 * @example
 * ```typescript
 * const result = await parseQuakeMLStream('large-catalog.xml', {
 *   batchSize: 100,
 *   onBatch: async (events) => {
 *     await db.bulkInsertEvents(events);
 *   },
 *   onError: (error) => console.error('Parse error:', error)
 * });
 * console.log(`Processed ${result.successfulEvents} events`);
 * ```
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

    // Create SAX parser (strict mode for valid XML)
    const parser = sax.createStream(true, {
      trim: true,
      normalize: true
    });

    // Track when we enter/exit <event> tags
    parser.on('opentag', (node) => {
      if (node.name === 'event' || node.name === 'q:event' || node.name === 'quakeml:event') {
        insideEvent = true;
        eventDepth++;
        currentEventXML = `<${node.name}`;

        // Add attributes
        for (const [key, value] of Object.entries(node.attributes)) {
          currentEventXML += ` ${key}="${value}"`;
        }
        currentEventXML += '>';
      } else if (insideEvent) {
        currentEventXML += `<${node.name}`;

        // Add attributes
        for (const [key, value] of Object.entries(node.attributes)) {
          currentEventXML += ` ${key}="${value}"`;
        }
        currentEventXML += '>';
      }
    });

    parser.on('text', (text) => {
      if (insideEvent && text.trim()) {
        currentEventXML += text;
      }
    });

    parser.on('closetag', async (tagName) => {
      if (insideEvent) {
        currentEventXML += `</${tagName}>`;

        if (tagName === 'event' || tagName === 'q:event' || tagName === 'quakeml:event') {
          eventDepth--;

          if (eventDepth === 0) {
            insideEvent = false;
            result.totalEvents++;

            // Parse the complete event XML
            try {
              const event = parseQuakeMLEvent(currentEventXML);

              if (event) {
                result.successfulEvents++;

                // Call per-event callback
                if (onEvent) {
                  await onEvent(event);
                }

                // Add to batch
                if (onBatch) {
                  eventBatch.push(event);

                  // Process batch if it reaches the batch size
                  if (eventBatch.length >= batchSize) {
                    await onBatch(eventBatch);
                    eventBatch = [];
                  }
                }
              } else {
                const error = new Error('Failed to parse event');
                result.errors.push({
                  message: error.message,
                  eventXML: currentEventXML.substring(0, 200) + '...'
                });

                if (onError) {
                  onError(error, currentEventXML);
                }
              }
            } catch (error) {
              const err = error as Error;
              result.errors.push({
                message: err.message,
                eventXML: currentEventXML.substring(0, 200) + '...'
              });

              if (onError) {
                onError(err, currentEventXML);
              }
            }

            // Reset for next event
            currentEventXML = '';
          }
        }
      }
    });

    parser.on('error', (error) => {
      result.errors.push({ message: error.message });
      if (onError) {
        onError(error);
      }
      // Don't reject - continue parsing
      parser.resume();
    });

    parser.on('end', async () => {
      // Process any remaining events in the batch
      if (onBatch && eventBatch.length > 0) {
        try {
          await onBatch(eventBatch);
        } catch (error) {
          const err = error as Error;
          result.errors.push({ message: `Batch processing error: ${err.message}` });
        }
      }

      resolve(result);
    });

    // Create read stream and pipe to SAX parser
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });

    fileStream.on('error', (error) => {
      reject(error);
    });

    fileStream.pipe(parser);
  });
}
