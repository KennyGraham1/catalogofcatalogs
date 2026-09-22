/**
 * QuakeML 1.2 Exporter
 * Converts database events to QuakeML 1.2 XML format
 */

import type { MergedEvent } from './db';
import type { ExportMetadata } from './exporters';
import type {
  Origin,
  Magnitude,
  CreationInfo,
  Comment,
  EventDescription,
  Pick,
  Arrival,
  Amplitude,
  StationMagnitude,
  FocalMechanism,
  NodalPlane,
  Axis,
  MomentTensor,
  WaveformStreamID,
  RealQuantity,
  IntegerQuantity,
  CompositeTime,
  OriginUncertainty
} from './types/quakeml';

/**
 * Format a number with optional uncertainty
 */
function formatRealQuantity(
  value: number | null,
  uncertainty?: number | null,
  lowerUncertainty?: number | null,
  upperUncertainty?: number | null,
  confidenceLevel?: number | null
): string {
  if (value === null) return '';

  let xml = `<value>${value}</value>`;
  if (uncertainty !== null && uncertainty !== undefined) {
    xml += `\n      <uncertainty>${uncertainty}</uncertainty>`;
  }
  if (lowerUncertainty !== null && lowerUncertainty !== undefined) {
    xml += `\n      <lowerUncertainty>${lowerUncertainty}</lowerUncertainty>`;
  }
  if (upperUncertainty !== null && upperUncertainty !== undefined) {
    xml += `\n      <upperUncertainty>${upperUncertainty}</upperUncertainty>`;
  }
  if (confidenceLevel !== null && confidenceLevel !== undefined) {
    xml += `\n      <confidenceLevel>${confidenceLevel}</confidenceLevel>`;
  }
  return xml;
}

/**
 * Format a time value with optional uncertainty
 */
function formatTimeQuantity(
  time: string,
  uncertainty?: number | null,
  lowerUncertainty?: number | null,
  upperUncertainty?: number | null,
  confidenceLevel?: number | null
): string {
  let xml = `<value>${time}</value>`;
  if (uncertainty !== null && uncertainty !== undefined) {
    xml += `\n      <uncertainty>${uncertainty}</uncertainty>`;
  }
  if (lowerUncertainty !== null && lowerUncertainty !== undefined) {
    xml += `\n      <lowerUncertainty>${lowerUncertainty}</lowerUncertainty>`;
  }
  if (upperUncertainty !== null && upperUncertainty !== undefined) {
    xml += `\n      <upperUncertainty>${upperUncertainty}</upperUncertainty>`;
  }
  if (confidenceLevel !== null && confidenceLevel !== undefined) {
    xml += `\n      <confidenceLevel>${confidenceLevel}</confidenceLevel>`;
  }
  return xml;
}

/**
 * Format CreationInfo element
 */
function formatCreationInfo(info: CreationInfo, indent: string = '    '): string {
  const parts: string[] = [];

  if (info.agencyID) parts.push(`${indent}<agencyID>${escapeXml(info.agencyID)}</agencyID>`);
  if (info.agencyURI) parts.push(`${indent}<agencyURI>${escapeXml(toResourceID(info.agencyURI, 'agency'))}</agencyURI>`);
  if (info.author) parts.push(`${indent}<author>${escapeXml(info.author)}</author>`);
  if (info.authorURI) parts.push(`${indent}<authorURI>${escapeXml(toResourceID(info.authorURI, 'author'))}</authorURI>`);
  if (info.creationTime) parts.push(`${indent}<creationTime>${info.creationTime}</creationTime>`);
  if (info.version) parts.push(`${indent}<version>${escapeXml(info.version)}</version>`);

  if (parts.length === 0) return '';

  return `${indent.slice(2)}<creationInfo>\n${parts.join('\n')}\n${indent.slice(2)}</creationInfo>`;
}

function formatComments(comments: Comment[] | undefined, indent: string = '    '): string {
  if (!comments || comments.length === 0) return '';
  return comments.map(comment => formatComment(comment, indent)).join('\n') + '\n';
}

function formatIntegerQuantityElement(
  tagName: string,
  quantity: IntegerQuantity,
  indent: string = '    '
): string {
  let xml = `${indent}<${tagName}>\n`;
  xml += `${indent}  <value>${quantity.value}</value>\n`;
  if (quantity.uncertainty !== undefined) {
    xml += `${indent}  <uncertainty>${quantity.uncertainty}</uncertainty>\n`;
  }
  if (quantity.lowerUncertainty !== undefined) {
    xml += `${indent}  <lowerUncertainty>${quantity.lowerUncertainty}</lowerUncertainty>\n`;
  }
  if (quantity.upperUncertainty !== undefined) {
    xml += `${indent}  <upperUncertainty>${quantity.upperUncertainty}</upperUncertainty>\n`;
  }
  if (quantity.confidenceLevel !== undefined) {
    xml += `${indent}  <confidenceLevel>${quantity.confidenceLevel}</confidenceLevel>\n`;
  }
  xml += `${indent}</${tagName}>`;
  return xml;
}

function formatCompositeTime(compositeTime: CompositeTime, indent: string = '    '): string {
  let xml = `${indent}<compositeTime>\n`;
  if (compositeTime.year) xml += formatIntegerQuantityElement('year', compositeTime.year, indent + '  ') + '\n';
  if (compositeTime.month) xml += formatIntegerQuantityElement('month', compositeTime.month, indent + '  ') + '\n';
  if (compositeTime.day) xml += formatIntegerQuantityElement('day', compositeTime.day, indent + '  ') + '\n';
  if (compositeTime.hour) xml += formatIntegerQuantityElement('hour', compositeTime.hour, indent + '  ') + '\n';
  if (compositeTime.minute) xml += formatIntegerQuantityElement('minute', compositeTime.minute, indent + '  ') + '\n';
  if (compositeTime.second) xml += formatRealQuantityElement('second', compositeTime.second, indent + '  ') + '\n';
  xml += `${indent}</compositeTime>`;
  return xml;
}

/**
 * The stored row's own OriginUncertainty (km -> metres). Returns undefined when the row
 * carries neither a circular radius nor an ellipse.
 */
function originUncertaintyFromEvent(event: {
  horizontal_uncertainty?: number | null;
  min_horizontal_uncertainty?: number | null;
  max_horizontal_uncertainty?: number | null;
  azimuth_max_horizontal_uncertainty?: number | null;
}): OriginUncertainty | undefined {
  const out: OriginUncertainty = {};
  if (event.horizontal_uncertainty != null) out.horizontalUncertainty = event.horizontal_uncertainty * 1000;
  if (event.min_horizontal_uncertainty != null) out.minHorizontalUncertainty = event.min_horizontal_uncertainty * 1000;
  if (event.max_horizontal_uncertainty != null) out.maxHorizontalUncertainty = event.max_horizontal_uncertainty * 1000;
  if (event.azimuth_max_horizontal_uncertainty != null) out.azimuthMaxHorizontalUncertainty = event.azimuth_max_horizontal_uncertainty;
  return Object.keys(out).length > 0 ? out : undefined;
}

function formatOriginUncertainty(uncertainty: OriginUncertainty, indent: string = '    '): string {
  let xml = `${indent}<originUncertainty>\n`;
  if (uncertainty.horizontalUncertainty !== undefined) {
    xml += `${indent}  <horizontalUncertainty>${uncertainty.horizontalUncertainty}</horizontalUncertainty>\n`;
  }
  if (uncertainty.minHorizontalUncertainty !== undefined) {
    xml += `${indent}  <minHorizontalUncertainty>${uncertainty.minHorizontalUncertainty}</minHorizontalUncertainty>\n`;
  }
  if (uncertainty.maxHorizontalUncertainty !== undefined) {
    xml += `${indent}  <maxHorizontalUncertainty>${uncertainty.maxHorizontalUncertainty}</maxHorizontalUncertainty>\n`;
  }
  if (uncertainty.azimuthMaxHorizontalUncertainty !== undefined) {
    xml += `${indent}  <azimuthMaxHorizontalUncertainty>${uncertainty.azimuthMaxHorizontalUncertainty}</azimuthMaxHorizontalUncertainty>\n`;
  }
  if (uncertainty.confidenceEllipsoid) {
    const ellipsoid = uncertainty.confidenceEllipsoid;
    xml += `${indent}  <confidenceEllipsoid>\n`;
    xml += `${indent}    <semiMajorAxisLength>${ellipsoid.semiMajorAxisLength}</semiMajorAxisLength>\n`;
    xml += `${indent}    <semiMinorAxisLength>${ellipsoid.semiMinorAxisLength}</semiMinorAxisLength>\n`;
    xml += `${indent}    <semiIntermediateAxisLength>${ellipsoid.semiIntermediateAxisLength}</semiIntermediateAxisLength>\n`;
    xml += `${indent}    <majorAxisPlunge>${ellipsoid.majorAxisPlunge}</majorAxisPlunge>\n`;
    xml += `${indent}    <majorAxisAzimuth>${ellipsoid.majorAxisAzimuth}</majorAxisAzimuth>\n`;
    xml += `${indent}    <majorAxisRotation>${ellipsoid.majorAxisRotation}</majorAxisRotation>\n`;
    xml += `${indent}  </confidenceEllipsoid>\n`;
  }
  if (uncertainty.preferredDescription) {
    xml += `${indent}  <preferredDescription>${escapeXml(uncertainty.preferredDescription)}</preferredDescription>\n`;
  }
  if (uncertainty.confidenceLevel !== undefined) {
    xml += `${indent}  <confidenceLevel>${uncertainty.confidenceLevel}</confidenceLevel>\n`;
  }
  xml += `${indent}</originUncertainty>`;
  return xml;
}

/**
 * Format Comment element
 */
function formatComment(comment: Comment, indent: string = '    '): string {
  // QuakeML BED 1.2 Comment: text (+ optional creationInfo) are the only child
  // elements; the identifier is the `id` ATTRIBUTE (type ResourceReference).
  const idAttr = comment.id ? ` id="${escapeXml(toResourceID(comment.id, 'comment'))}"` : '';
  let xml = `${indent}<comment${idAttr}>\n`;
  xml += `${indent}  <text>${escapeXml(comment.text)}</text>\n`;

  if (comment.creationInfo) {
    xml += formatCreationInfo(comment.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</comment>`;
  return xml;
}

/**
 * Format EventDescription element
 */
function formatEventDescription(desc: EventDescription, indent: string = '    '): string {
  let xml = `${indent}<description>\n`;
  xml += `${indent}  <text>${escapeXml(desc.text)}</text>\n`;
  if (desc.type) xml += `${indent}  <type>${escapeXml(desc.type)}</type>\n`;
  xml += `${indent}</description>`;
  return xml;
}

/**
 * Format Origin element
 */
function formatOrigin(origin: Origin, indent: string = '    '): string {
  let xml = `${indent}<origin publicID="${escapeXml(toResourceID(origin.publicID, 'origin'))}">\n`;

  xml += formatComments(origin.comment, indent + '  ');

  if (origin.compositeTime && origin.compositeTime.length > 0) {
    origin.compositeTime.forEach(compositeTime => {
      xml += formatCompositeTime(compositeTime, indent + '  ') + '\n';
    });
  }

  // Time
  if (origin.time) {
    xml += `${indent}  <time>\n`;
    xml += `${indent}    ${formatTimeQuantity(
      origin.time.value,
      origin.time.uncertainty,
      origin.time.lowerUncertainty,
      origin.time.upperUncertainty,
      origin.time.confidenceLevel
    )}\n`;
    xml += `${indent}  </time>\n`;
  }

  // Latitude
  if (origin.latitude) {
    xml += `${indent}  <latitude>\n`;
    xml += `${indent}    ${formatRealQuantity(
      origin.latitude.value,
      origin.latitude.uncertainty,
      origin.latitude.lowerUncertainty,
      origin.latitude.upperUncertainty,
      origin.latitude.confidenceLevel
    )}\n`;
    xml += `${indent}  </latitude>\n`;
  }

  // Longitude
  if (origin.longitude) {
    xml += `${indent}  <longitude>\n`;
    xml += `${indent}    ${formatRealQuantity(
      origin.longitude.value,
      origin.longitude.uncertainty,
      origin.longitude.lowerUncertainty,
      origin.longitude.upperUncertainty,
      origin.longitude.confidenceLevel
    )}\n`;
    xml += `${indent}  </longitude>\n`;
  }

  // Depth
  if (origin.depth) {
    xml += `${indent}  <depth>\n`;
    xml += `${indent}    ${formatRealQuantity(
      origin.depth.value,
      origin.depth.uncertainty,
      origin.depth.lowerUncertainty,
      origin.depth.upperUncertainty,
      origin.depth.confidenceLevel
    )}\n`;
    xml += `${indent}  </depth>\n`;
  }

  if (origin.depthType) {
    xml += `${indent}  <depthType>${escapeXml(origin.depthType)}</depthType>\n`;
  }
  if (origin.timeFixed !== undefined) {
    xml += `${indent}  <timeFixed>${origin.timeFixed}</timeFixed>\n`;
  }
  if (origin.epicenterFixed !== undefined) {
    xml += `${indent}  <epicenterFixed>${origin.epicenterFixed}</epicenterFixed>\n`;
  }
  if (origin.referenceSystemID) {
    xml += `${indent}  <referenceSystemID>${escapeXml(toResourceID(origin.referenceSystemID, 'referenceSystem'))}</referenceSystemID>\n`;
  }
  if (origin.methodID) {
    xml += `${indent}  <methodID>${escapeXml(toResourceID(origin.methodID, 'method'))}</methodID>\n`;
  }
  if (origin.earthModelID) {
    xml += `${indent}  <earthModelID>${escapeXml(toResourceID(origin.earthModelID, 'earthModel'))}</earthModelID>\n`;
  }

  // Quality
  if (origin.quality) {
    xml += `${indent}  <quality>\n`;
    if (origin.quality.associatedPhaseCount !== undefined) {
      xml += `${indent}    <associatedPhaseCount>${origin.quality.associatedPhaseCount}</associatedPhaseCount>\n`;
    }
    if (origin.quality.usedPhaseCount !== undefined) {
      xml += `${indent}    <usedPhaseCount>${origin.quality.usedPhaseCount}</usedPhaseCount>\n`;
    }
    // BED sequence: associatedStationCount precedes usedStationCount, depthPhaseCount
    // follows it. Both were parsed and mapped but never written, so a round trip lost them.
    if (origin.quality.associatedStationCount !== undefined) {
      xml += `${indent}    <associatedStationCount>${origin.quality.associatedStationCount}</associatedStationCount>\n`;
    }
    if (origin.quality.usedStationCount !== undefined) {
      xml += `${indent}    <usedStationCount>${origin.quality.usedStationCount}</usedStationCount>\n`;
    }
    if (origin.quality.depthPhaseCount !== undefined) {
      xml += `${indent}    <depthPhaseCount>${origin.quality.depthPhaseCount}</depthPhaseCount>\n`;
    }
    if (origin.quality.azimuthalGap !== undefined) {
      xml += `${indent}    <azimuthalGap>${origin.quality.azimuthalGap}</azimuthalGap>\n`;
    }
    if (origin.quality.minimumDistance !== undefined) {
      xml += `${indent}    <minimumDistance>${origin.quality.minimumDistance}</minimumDistance>\n`;
    }
    if (origin.quality.maximumDistance !== undefined) {
      xml += `${indent}    <maximumDistance>${origin.quality.maximumDistance}</maximumDistance>\n`;
    }
    if (origin.quality.medianDistance !== undefined) {
      xml += `${indent}    <medianDistance>${origin.quality.medianDistance}</medianDistance>\n`;
    }
    if (origin.quality.secondaryAzimuthalGap !== undefined) {
      xml += `${indent}    <secondaryAzimuthalGap>${origin.quality.secondaryAzimuthalGap}</secondaryAzimuthalGap>\n`;
    }
    if (origin.quality.groundTruthLevel !== undefined) {
      xml += `${indent}    <groundTruthLevel>${escapeXml(origin.quality.groundTruthLevel)}</groundTruthLevel>\n`;
    }
    if (origin.quality.standardError !== undefined) {
      xml += `${indent}    <standardError>${origin.quality.standardError}</standardError>\n`;
    }
    xml += `${indent}  </quality>\n`;
  }

  if (origin.uncertainty) {
    xml += formatOriginUncertainty(origin.uncertainty, indent + '  ') + '\n';
  }

  if (origin.type) {
    xml += `${indent}  <type>${escapeXml(origin.type)}</type>\n`;
  }
  if (origin.region) {
    xml += `${indent}  <region>${escapeXml(origin.region)}</region>\n`;
  }

  // Evaluation mode and status
  if (origin.evaluationMode) {
    xml += `${indent}  <evaluationMode>${escapeXml(origin.evaluationMode)}</evaluationMode>\n`;
  }
  if (origin.evaluationStatus) {
    xml += `${indent}  <evaluationStatus>${escapeXml(origin.evaluationStatus)}</evaluationStatus>\n`;
  }

  // Creation info
  if (origin.creationInfo) {
    xml += formatCreationInfo(origin.creationInfo, indent + '  ') + '\n';
  }

  // Arrivals (child elements of Origin in QuakeML)
  if (origin.arrivals && origin.arrivals.length > 0) {
    origin.arrivals.forEach(arrival => {
      xml += formatArrival(arrival, indent + '  ') + '\n';
    });
  }

  xml += `${indent}</origin>`;
  return xml;
}

/**
 * Format Magnitude element
 */
function formatMagnitude(magnitude: Magnitude, indent: string = '    '): string {
  let xml = `${indent}<magnitude publicID="${escapeXml(toResourceID(magnitude.publicID, 'magnitude'))}">\n`;

  xml += formatComments(magnitude.comment, indent + '  ');

  // Magnitude value
  if (magnitude.mag) {
    xml += `${indent}  <mag>\n`;
    xml += `${indent}    ${formatRealQuantity(
      magnitude.mag.value,
      magnitude.mag.uncertainty,
      magnitude.mag.lowerUncertainty,
      magnitude.mag.upperUncertainty,
      magnitude.mag.confidenceLevel
    )}\n`;
    xml += `${indent}  </mag>\n`;
  }

  // Type
  if (magnitude.type) {
    xml += `${indent}  <type>${escapeXml(magnitude.type)}</type>\n`;
  }

  // Station count
  if (magnitude.stationCount !== undefined) {
    xml += `${indent}  <stationCount>${magnitude.stationCount}</stationCount>\n`;
  }
  if (magnitude.azimuthalGap !== undefined) {
    xml += `${indent}  <azimuthalGap>${magnitude.azimuthalGap}</azimuthalGap>\n`;
  }

  // Origin ID
  if (magnitude.originID) {
    xml += `${indent}  <originID>${escapeXml(toResourceID(magnitude.originID, 'origin'))}</originID>\n`;
  }

  if (magnitude.methodID) {
    xml += `${indent}  <methodID>${escapeXml(toResourceID(magnitude.methodID, 'method'))}</methodID>\n`;
  }

  if (magnitude.stationMagnitudeContributions && magnitude.stationMagnitudeContributions.length > 0) {
    magnitude.stationMagnitudeContributions.forEach(contribution => {
      xml += `${indent}  <stationMagnitudeContribution>\n`;
      xml += `${indent}    <stationMagnitudeID>${escapeXml(toResourceID(contribution.stationMagnitudeID, 'stationMagnitude'))}</stationMagnitudeID>\n`;
      if (contribution.residual !== undefined) {
        xml += `${indent}    <residual>${contribution.residual}</residual>\n`;
      }
      if (contribution.weight !== undefined) {
        xml += `${indent}    <weight>${contribution.weight}</weight>\n`;
      }
      xml += `${indent}  </stationMagnitudeContribution>\n`;
    });
  }

  // Evaluation mode and status
  if (magnitude.evaluationMode) {
    xml += `${indent}  <evaluationMode>${escapeXml(magnitude.evaluationMode)}</evaluationMode>\n`;
  }
  if (magnitude.evaluationStatus) {
    xml += `${indent}  <evaluationStatus>${escapeXml(magnitude.evaluationStatus)}</evaluationStatus>\n`;
  }

  // Creation info
  if (magnitude.creationInfo) {
    xml += formatCreationInfo(magnitude.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</magnitude>`;
  return xml;
}

/**
 * Format WaveformStreamID element
 */
function formatWaveformID(waveformID: WaveformStreamID, indent: string = '    '): string {
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
    xml += `>${escapeXml(toResourceID(waveformID.resourceURI, 'waveform'))}</waveformID>`;
  } else {
    xml += '/>';
  }
  return xml;
}

/**
 * Format RealQuantity element
 */
function formatRealQuantityElement(
  tagName: string,
  quantity: RealQuantity,
  indent: string = '    '
): string {
  let xml = `${indent}<${tagName}>\n`;
  xml += `${indent}  <value>${quantity.value}</value>\n`;
  if (quantity.uncertainty !== undefined) {
    xml += `${indent}  <uncertainty>${quantity.uncertainty}</uncertainty>\n`;
  }
  if (quantity.lowerUncertainty !== undefined) {
    xml += `${indent}  <lowerUncertainty>${quantity.lowerUncertainty}</lowerUncertainty>\n`;
  }
  if (quantity.upperUncertainty !== undefined) {
    xml += `${indent}  <upperUncertainty>${quantity.upperUncertainty}</upperUncertainty>\n`;
  }
  if (quantity.confidenceLevel !== undefined) {
    xml += `${indent}  <confidenceLevel>${quantity.confidenceLevel}</confidenceLevel>\n`;
  }
  xml += `${indent}</${tagName}>`;
  return xml;
}

/**
 * Format Pick element
 */
function formatPick(pick: Pick, indent: string = '    '): string {
  let xml = `${indent}<pick publicID="${escapeXml(toResourceID(pick.publicID, 'pick'))}">\n`;

  xml += formatComments(pick.comment, indent + '  ');

  // Time (required)
  if (pick.time) {
    xml += `${indent}  <time>\n`;
    xml += `${indent}    ${formatTimeQuantity(pick.time.value, pick.time.uncertainty, pick.time.lowerUncertainty, pick.time.upperUncertainty, pick.time.confidenceLevel)}\n`;
    xml += `${indent}  </time>\n`;
  }

  // WaveformID (required)
  if (pick.waveformID) {
    xml += formatWaveformID(pick.waveformID, indent + '  ') + '\n';
  }

  // Optional elements
  if (pick.filterID) {
    xml += `${indent}  <filterID>${escapeXml(toResourceID(pick.filterID, 'filter'))}</filterID>\n`;
  }
  if (pick.methodID) {
    xml += `${indent}  <methodID>${escapeXml(toResourceID(pick.methodID, 'method'))}</methodID>\n`;
  }
  if (pick.slownessMethodID) {
    xml += `${indent}  <slownessMethodID>${escapeXml(toResourceID(pick.slownessMethodID, 'slownessMethod'))}</slownessMethodID>\n`;
  }
  if (pick.horizontalSlowness) {
    xml += formatRealQuantityElement('horizontalSlowness', pick.horizontalSlowness, indent + '  ') + '\n';
  }
  if (pick.backazimuth) {
    xml += formatRealQuantityElement('backazimuth', pick.backazimuth, indent + '  ') + '\n';
  }
  if (pick.onset) {
    xml += `${indent}  <onset>${escapeXml(pick.onset)}</onset>\n`;
  }
  if (pick.phaseHint) {
    xml += `${indent}  <phaseHint>${escapeXml(pick.phaseHint)}</phaseHint>\n`;
  }
  if (pick.polarity) {
    xml += `${indent}  <polarity>${escapeXml(pick.polarity)}</polarity>\n`;
  }
  if (pick.evaluationMode) {
    xml += `${indent}  <evaluationMode>${escapeXml(pick.evaluationMode)}</evaluationMode>\n`;
  }
  if (pick.evaluationStatus) {
    xml += `${indent}  <evaluationStatus>${escapeXml(pick.evaluationStatus)}</evaluationStatus>\n`;
  }
  if (pick.creationInfo) {
    xml += formatCreationInfo(pick.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</pick>`;
  return xml;
}

/**
 * Format Arrival element (child of Origin)
 */
function formatArrival(arrival: Arrival, indent: string = '      '): string {
  let xml = `${indent}<arrival`;
  if (arrival.publicID) {
    xml += ` publicID="${escapeXml(toResourceID(arrival.publicID, 'arrival'))}"`;
  }
  xml += '>\n';

  xml += formatComments(arrival.comment, indent + '  ');

  // PickID (required)
  xml += `${indent}  <pickID>${escapeXml(toResourceID(arrival.pickID, 'pick'))}</pickID>\n`;

  // Phase (required)
  xml += `${indent}  <phase>${escapeXml(arrival.phase)}</phase>\n`;

  // Optional elements
  if (arrival.timeCorrection !== undefined) {
    xml += `${indent}  <timeCorrection>${arrival.timeCorrection}</timeCorrection>\n`;
  }
  if (arrival.azimuth !== undefined) {
    xml += `${indent}  <azimuth>${arrival.azimuth}</azimuth>\n`;
  }
  if (arrival.distance !== undefined) {
    xml += `${indent}  <distance>${arrival.distance}</distance>\n`;
  }
  if (arrival.takeoffAngle) {
    xml += formatRealQuantityElement('takeoffAngle', arrival.takeoffAngle, indent + '  ') + '\n';
  }
  if (arrival.timeResidual !== undefined) {
    xml += `${indent}  <timeResidual>${arrival.timeResidual}</timeResidual>\n`;
  }
  if (arrival.horizontalSlownessResidual !== undefined) {
    xml += `${indent}  <horizontalSlownessResidual>${arrival.horizontalSlownessResidual}</horizontalSlownessResidual>\n`;
  }
  if (arrival.backazimuthResidual !== undefined) {
    xml += `${indent}  <backazimuthResidual>${arrival.backazimuthResidual}</backazimuthResidual>\n`;
  }
  if (arrival.timeWeight !== undefined) {
    xml += `${indent}  <timeWeight>${arrival.timeWeight}</timeWeight>\n`;
  }
  if (arrival.horizontalSlownessWeight !== undefined) {
    xml += `${indent}  <horizontalSlownessWeight>${arrival.horizontalSlownessWeight}</horizontalSlownessWeight>\n`;
  }
  if (arrival.backazimuthWeight !== undefined) {
    xml += `${indent}  <backazimuthWeight>${arrival.backazimuthWeight}</backazimuthWeight>\n`;
  }
  if (arrival.earthModelID) {
    xml += `${indent}  <earthModelID>${escapeXml(toResourceID(arrival.earthModelID, 'earthModel'))}</earthModelID>\n`;
  }
  if (arrival.creationInfo) {
    xml += formatCreationInfo(arrival.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</arrival>`;
  return xml;
}

/**
 * Format Amplitude element
 */
function formatAmplitude(amplitude: Amplitude, indent: string = '    '): string {
  let xml = `${indent}<amplitude publicID="${escapeXml(toResourceID(amplitude.publicID, 'amplitude'))}">\n`;

  xml += formatComments(amplitude.comment, indent + '  ');

  // GenericAmplitude (required)
  if (amplitude.genericAmplitude) {
    xml += formatRealQuantityElement('genericAmplitude', amplitude.genericAmplitude, indent + '  ') + '\n';
  }

  // Optional elements
  if (amplitude.type) {
    xml += `${indent}  <type>${escapeXml(amplitude.type)}</type>\n`;
  }
  if (amplitude.category) {
    xml += `${indent}  <category>${escapeXml(amplitude.category)}</category>\n`;
  }
  if (amplitude.unit) {
    xml += `${indent}  <unit>${escapeXml(amplitude.unit)}</unit>\n`;
  }
  if (amplitude.methodID) {
    xml += `${indent}  <methodID>${escapeXml(toResourceID(amplitude.methodID, 'method'))}</methodID>\n`;
  }
  if (amplitude.filterID) {
    xml += `${indent}  <filterID>${escapeXml(toResourceID(amplitude.filterID, 'filter'))}</filterID>\n`;
  }
  if (amplitude.period) {
    xml += formatRealQuantityElement('period', amplitude.period, indent + '  ') + '\n';
  }
  if (amplitude.snr !== undefined) {
    xml += `${indent}  <snr>${amplitude.snr}</snr>\n`;
  }
  if (amplitude.timeWindow) {
    xml += `${indent}  <timeWindow>\n`;
    xml += `${indent}    <reference>${escapeXml(amplitude.timeWindow.reference)}</reference>\n`;
    xml += `${indent}    <begin>${amplitude.timeWindow.begin}</begin>\n`;
    xml += `${indent}    <end>${amplitude.timeWindow.end}</end>\n`;
    xml += `${indent}  </timeWindow>\n`;
  }
  if (amplitude.pickID) {
    xml += `${indent}  <pickID>${escapeXml(toResourceID(amplitude.pickID, 'pick'))}</pickID>\n`;
  }
  if (amplitude.waveformID) {
    xml += formatWaveformID(amplitude.waveformID, indent + '  ') + '\n';
  }
  if (amplitude.scalingTime) {
    xml += `${indent}  <scalingTime>\n`;
    xml += `${indent}    ${formatTimeQuantity(amplitude.scalingTime.value, amplitude.scalingTime.uncertainty, amplitude.scalingTime.lowerUncertainty, amplitude.scalingTime.upperUncertainty, amplitude.scalingTime.confidenceLevel)}\n`;
    xml += `${indent}  </scalingTime>\n`;
  }
  if (amplitude.magnitudeHint) {
    xml += `${indent}  <magnitudeHint>${escapeXml(amplitude.magnitudeHint)}</magnitudeHint>\n`;
  }
  if (amplitude.evaluationMode) {
    xml += `${indent}  <evaluationMode>${escapeXml(amplitude.evaluationMode)}</evaluationMode>\n`;
  }
  if (amplitude.evaluationStatus) {
    xml += `${indent}  <evaluationStatus>${escapeXml(amplitude.evaluationStatus)}</evaluationStatus>\n`;
  }
  if (amplitude.creationInfo) {
    xml += formatCreationInfo(amplitude.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</amplitude>`;
  return xml;
}

/**
 * Format StationMagnitude element
 */
function formatStationMagnitude(stationMag: StationMagnitude, indent: string = '    '): string {
  let xml = `${indent}<stationMagnitude publicID="${escapeXml(toResourceID(stationMag.publicID, 'stationMagnitude'))}">\n`;

  xml += formatComments(stationMag.comment, indent + '  ');

  // Origin ID
  if (stationMag.originID) {
    xml += `${indent}  <originID>${escapeXml(toResourceID(stationMag.originID, 'origin'))}</originID>\n`;
  }

  // Magnitude value (required)
  if (stationMag.mag) {
    xml += `${indent}  <mag>\n`;
    xml += `${indent}    ${formatRealQuantity(
      stationMag.mag.value,
      stationMag.mag.uncertainty,
      stationMag.mag.lowerUncertainty,
      stationMag.mag.upperUncertainty,
      stationMag.mag.confidenceLevel
    )}\n`;
    xml += `${indent}  </mag>\n`;
  }

  // Type
  if (stationMag.type) {
    xml += `${indent}  <type>${escapeXml(stationMag.type)}</type>\n`;
  }

  // Amplitude ID
  if (stationMag.amplitudeID) {
    xml += `${indent}  <amplitudeID>${escapeXml(toResourceID(stationMag.amplitudeID, 'amplitude'))}</amplitudeID>\n`;
  }

  // Method ID
  if (stationMag.methodID) {
    xml += `${indent}  <methodID>${escapeXml(toResourceID(stationMag.methodID, 'method'))}</methodID>\n`;
  }

  // Waveform ID
  if (stationMag.waveformID) {
    xml += formatWaveformID(stationMag.waveformID, indent + '  ') + '\n';
  }

  // Creation info
  if (stationMag.creationInfo) {
    xml += formatCreationInfo(stationMag.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</stationMagnitude>`;
  return xml;
}

/**
 * Format NodalPlane element
 */
function formatNodalPlane(plane: NodalPlane, name: string, indent: string = '        '): string {
  let xml = `${indent}<${name}>\n`;
  xml += formatRealQuantityElement('strike', plane.strike, indent + '  ') + '\n';
  xml += formatRealQuantityElement('dip', plane.dip, indent + '  ') + '\n';
  xml += formatRealQuantityElement('rake', plane.rake, indent + '  ') + '\n';
  xml += `${indent}</${name}>`;
  return xml;
}

/**
 * Format Axis element
 */
function formatAxis(axis: Axis, name: string, indent: string = '        '): string {
  let xml = `${indent}<${name}>\n`;
  xml += formatRealQuantityElement('azimuth', axis.azimuth, indent + '  ') + '\n';
  xml += formatRealQuantityElement('plunge', axis.plunge, indent + '  ') + '\n';
  if (axis.length) {
    xml += formatRealQuantityElement('length', axis.length, indent + '  ') + '\n';
  }
  xml += `${indent}</${name}>`;
  return xml;
}

/**
 * Format MomentTensor element
 */
function formatMomentTensor(mt: MomentTensor, indent: string = '      '): string {
  let xml = `${indent}<momentTensor`;
  if (mt.publicID) {
    xml += ` publicID="${escapeXml(toResourceID(mt.publicID, 'momentTensor'))}"`;
  }
  xml += '>\n';

  // Derived origin ID (required)
  xml += `${indent}  <derivedOriginID>${escapeXml(toResourceID(mt.derivedOriginID, 'origin'))}</derivedOriginID>\n`;

  if (mt.momentMagnitudeID) {
    xml += `${indent}  <momentMagnitudeID>${escapeXml(toResourceID(mt.momentMagnitudeID, 'magnitude'))}</momentMagnitudeID>\n`;
  }
  if (mt.scalarMoment) {
    xml += formatRealQuantityElement('scalarMoment', mt.scalarMoment, indent + '  ') + '\n';
  }
  if (mt.tensor) {
    xml += `${indent}  <tensor>\n`;
    xml += formatRealQuantityElement('Mrr', mt.tensor.Mrr, indent + '    ') + '\n';
    xml += formatRealQuantityElement('Mtt', mt.tensor.Mtt, indent + '    ') + '\n';
    xml += formatRealQuantityElement('Mpp', mt.tensor.Mpp, indent + '    ') + '\n';
    xml += formatRealQuantityElement('Mrt', mt.tensor.Mrt, indent + '    ') + '\n';
    xml += formatRealQuantityElement('Mrp', mt.tensor.Mrp, indent + '    ') + '\n';
    xml += formatRealQuantityElement('Mtp', mt.tensor.Mtp, indent + '    ') + '\n';
    xml += `${indent}  </tensor>\n`;
  }
  if (mt.variance !== undefined) {
    xml += `${indent}  <variance>${mt.variance}</variance>\n`;
  }
  if (mt.varianceReduction !== undefined) {
    xml += `${indent}  <varianceReduction>${mt.varianceReduction}</varianceReduction>\n`;
  }
  if (mt.doubleCouple !== undefined) {
    xml += `${indent}  <doubleCouple>${mt.doubleCouple}</doubleCouple>\n`;
  }
  if (mt.clvd !== undefined) {
    xml += `${indent}  <clvd>${mt.clvd}</clvd>\n`;
  }
  if (mt.iso !== undefined) {
    xml += `${indent}  <iso>${mt.iso}</iso>\n`;
  }
  if (mt.greensFunctionID) {
    xml += `${indent}  <greensFunctionID>${escapeXml(toResourceID(mt.greensFunctionID, 'greensFunction'))}</greensFunctionID>\n`;
  }
  if (mt.filterID) {
    xml += `${indent}  <filterID>${escapeXml(toResourceID(mt.filterID, 'filter'))}</filterID>\n`;
  }
  if (mt.sourceTimeFunction) {
    xml += `${indent}  <sourceTimeFunction>\n`;
    xml += `${indent}    <type>${escapeXml(mt.sourceTimeFunction.type)}</type>\n`;
    xml += `${indent}    <duration>${mt.sourceTimeFunction.duration}</duration>\n`;
    if (mt.sourceTimeFunction.riseTime !== undefined) {
      xml += `${indent}    <riseTime>${mt.sourceTimeFunction.riseTime}</riseTime>\n`;
    }
    if (mt.sourceTimeFunction.decayTime !== undefined) {
      xml += `${indent}    <decayTime>${mt.sourceTimeFunction.decayTime}</decayTime>\n`;
    }
    xml += `${indent}  </sourceTimeFunction>\n`;
  }
  if (mt.dataUsed && mt.dataUsed.length > 0) {
    mt.dataUsed.forEach(dataUsed => {
      xml += `${indent}  <dataUsed>\n`;
      xml += `${indent}    <waveType>${escapeXml(dataUsed.waveType)}</waveType>\n`;
      if (dataUsed.stationCount !== undefined) {
        xml += `${indent}    <stationCount>${dataUsed.stationCount}</stationCount>\n`;
      }
      if (dataUsed.componentCount !== undefined) {
        xml += `${indent}    <componentCount>${dataUsed.componentCount}</componentCount>\n`;
      }
      if (dataUsed.shortestPeriod !== undefined) {
        xml += `${indent}    <shortestPeriod>${dataUsed.shortestPeriod}</shortestPeriod>\n`;
      }
      if (dataUsed.longestPeriod !== undefined) {
        xml += `${indent}    <longestPeriod>${dataUsed.longestPeriod}</longestPeriod>\n`;
      }
      xml += `${indent}  </dataUsed>\n`;
    });
  }
  if (mt.methodID) {
    xml += `${indent}  <methodID>${escapeXml(toResourceID(mt.methodID, 'method'))}</methodID>\n`;
  }
  if (mt.category) {
    xml += `${indent}  <category>${escapeXml(mt.category)}</category>\n`;
  }
  if (mt.inversionType) {
    xml += `${indent}  <inversionType>${escapeXml(mt.inversionType)}</inversionType>\n`;
  }
  if (mt.creationInfo) {
    xml += formatCreationInfo(mt.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</momentTensor>`;
  return xml;
}

/**
 * Format FocalMechanism element
 */
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

function formatFocalMechanism(fm: FocalMechanism, indent: string = '    '): string {
  let xml = `${indent}<focalMechanism publicID="${escapeXml(toResourceID(fm.publicID, 'focalMechanism'))}">\n`;

  xml += formatComments(fm.comment, indent + '  ');

  if (fm.triggeringOriginID) {
    xml += `${indent}  <triggeringOriginID>${escapeXml(toResourceID(fm.triggeringOriginID, 'origin'))}</triggeringOriginID>\n`;
  }

  if (fm.waveformID && fm.waveformID.length > 0) {
    fm.waveformID.forEach(waveformID => {
      xml += formatWaveformID(waveformID, indent + '  ') + '\n';
    });
  }

  // Nodal planes
  if (fm.nodalPlanes) {
    // In QuakeML-BED-1.2 preferredPlane is an ATTRIBUTE of <nodalPlanes>, not a child
    // element. Emitted as a child it was XSD-invalid and ObsPy read the preference as None.
    // BED requires strike, dip and rake on every NodalPlane, so a partially reported
    // plane is omitted rather than exported with invented values or as invalid XML,
    // and a preference can only point at a plane that is actually emitted.
    const complete = (p?: NodalPlane) => !!p && p.strike?.value != null && p.dip?.value != null && p.rake?.value != null;
    const emitted1 = complete(fm.nodalPlanes.nodalPlane1);
    const emitted2 = complete(fm.nodalPlanes.nodalPlane2);
    const preferred = fm.nodalPlanes.preferredPlane;
    const preferredAttr = (preferred === 1 && emitted1) || (preferred === 2 && emitted2) ? ` preferredPlane="${preferred}"` : '';
    const planes = [
      emitted1 ? formatNodalPlane(fm.nodalPlanes.nodalPlane1!, 'nodalPlane1', indent + '    ') : null,
      emitted2 ? formatNodalPlane(fm.nodalPlanes.nodalPlane2!, 'nodalPlane2', indent + '    ') : null,
    ].filter((p): p is string => p !== null);
    if (planes.length > 0) {
      xml += `${indent}  <nodalPlanes${preferredAttr}>\n`;
      xml += planes.join('\n') + '\n';
      xml += `${indent}  </nodalPlanes>\n`;
    }
  }

  // Principal axes
  if (fm.principalAxes) {
    xml += `${indent}  <principalAxes>\n`;
    xml += formatAxis(fm.principalAxes.tAxis, 'tAxis', indent + '    ') + '\n';
    xml += formatAxis(fm.principalAxes.pAxis, 'pAxis', indent + '    ') + '\n';
    if (fm.principalAxes.nAxis) {
      xml += formatAxis(fm.principalAxes.nAxis, 'nAxis', indent + '    ') + '\n';
    }
    xml += `${indent}  </principalAxes>\n`;
  }

  if (fm.azimuthalGap !== undefined) {
    xml += `${indent}  <azimuthalGap>${fm.azimuthalGap}</azimuthalGap>\n`;
  }
  if (fm.stationPolarityCount !== undefined) {
    xml += `${indent}  <stationPolarityCount>${fm.stationPolarityCount}</stationPolarityCount>\n`;
  }
  if (fm.misfit !== undefined) {
    xml += `${indent}  <misfit>${fm.misfit}</misfit>\n`;
  }
  if (fm.stationDistributionRatio !== undefined) {
    xml += `${indent}  <stationDistributionRatio>${fm.stationDistributionRatio}</stationDistributionRatio>\n`;
  }
  if (fm.methodID) {
    xml += `${indent}  <methodID>${escapeXml(toResourceID(fm.methodID, 'method'))}</methodID>\n`;
  }

  // Moment tensor
  if (fm.momentTensor) {
    xml += formatMomentTensor(fm.momentTensor, indent + '  ') + '\n';
  }

  if (fm.evaluationMode) {
    xml += `${indent}  <evaluationMode>${escapeXml(fm.evaluationMode)}</evaluationMode>\n`;
  }
  if (fm.evaluationStatus) {
    xml += `${indent}  <evaluationStatus>${escapeXml(fm.evaluationStatus)}</evaluationStatus>\n`;
  }
  if (fm.creationInfo) {
    xml += formatCreationInfo(fm.creationInfo, indent + '  ') + '\n';
  }

  xml += `${indent}</focalMechanism>`;
  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

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
  value: string | null | undefined,
  kind: string,
  fallbackID: string = 'unknown'
): string {
  const raw = (value ?? '').trim();
  if (BED_RESOURCE_ID_PATTERN.test(raw)) return raw;
  const source = raw || String(fallbackID ?? '').trim();
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
 * True when the row is the product of merging two or more source events.
 */
function isMultiSourceMerge(event: MergedEvent): boolean {
  if (!event.source_events) return false;
  try {
    const sources = JSON.parse(event.source_events);
    return Array.isArray(sources) && sources.length > 1;
  } catch {
    return false;
  }
}

/**
 * Rebuild a QuakeML quantity around a merged scalar.
 *
 * TimeQuantity/RealQuantity carry uncertainty, lowerUncertainty, upperUncertainty and
 * confidenceLevel, and every one of them describes the SOURCE solution's value. Once
 * that value has been replaced by the merged scalar none of them still applies, so the
 * quantity is rebuilt rather than spread and only the merged row's own uncertainty
 * (when it has one) is re-attached.
 */
function mergedQuantity<T extends number | string>(
  value: T,
  uncertainty: number | null | undefined
): { value: T; uncertainty?: number } {
  return uncertainty != null ? { value, uncertainty } : { value };
}

/**
 * Rewrite the preferred origin of a merged row with the authoritative merged
 * hypocentre from the scalar columns, so the QuakeML export agrees with the
 * CSV/JSON/GeoJSON exports of the same row (those read the scalars directly).
 * Non-preferred origins are left untouched — they remain the contributing
 * source solutions.
 */
function applyMergedOriginValues(origins: Origin[], event: MergedEvent): Origin[] {
  const preferredIndex = Math.max(
    0,
    origins.findIndex(o => o.publicID === event.preferred_origin_id)
  );

  return origins.map((origin, index) => {
    if (index !== preferredIndex) return origin;

    const merged: Origin = { ...origin };

    // Each scalar below REPLACES the contributing source's value, so the source's
    // uncertainty for it no longer describes what is emitted. lib/merge.ts nulls
    // LOCATION_META_FIELDS/DEPTH_META_FIELDS whenever no source reports the merged
    // value, exactly so an averaged hypocentre is not labelled with one contributor's
    // error estimate; carrying the blob's uncertainty over would re-attach here what
    // that nulling removed.
    merged.time = mergedQuantity(event.time, event.time_uncertainty);
    merged.latitude = mergedQuantity(event.latitude, event.latitude_uncertainty);
    merged.longitude = mergedQuantity(event.longitude, event.longitude_uncertainty);

    if (event.depth != null) {
      // QuakeML spec: depth value and its uncertainty in metres; DB stores km.
      merged.depth = mergedQuantity(
        event.depth * 1000,
        event.depth_uncertainty != null ? event.depth_uncertainty * 1000 : null
      );
      // depthType states how THAT solution's depth was determined, so it travels with
      // the depth value: a merged depth with no merged depth type must not inherit the
      // source's "operator assigned"/"from location" label either.
      if (event.depth_type) {
        merged.depthType = event.depth_type as Origin['depthType'];
      } else {
        delete merged.depthType;
      }
    } else if (event.depth_type) {
      merged.depthType = event.depth_type as Origin['depthType'];
    }

    // OriginUncertainty describes the error ellipse of the SOURCE's epicentre, which
    // has just been replaced: emit only the merged row's own horizontal uncertainty,
    // and drop the element entirely when the merged row has none.
    const ellipse = originUncertaintyFromEvent(event);
    if (ellipse) {
      merged.uncertainty = ellipse;
    } else {
      delete merged.uncertainty;
    }

    return merged;
  });
}

/** Whether a stored measurement agrees with the authoritative scalar selection. */
function matchesScalarMagnitude(magnitude: Magnitude, event: MergedEvent): boolean {
  return magnitude.mag?.value === event.magnitude &&
    (magnitude.type ?? '') === (event.magnitude_type ?? '') &&
    (event.magnitude_uncertainty == null || magnitude.mag.uncertainty === event.magnitude_uncertainty) &&
    (event.magnitude_station_count == null || magnitude.stationCount === event.magnitude_station_count) &&
    (event.magnitude_method_id == null || magnitude.methodID === event.magnitude_method_id) &&
    (event.magnitude_evaluation_mode == null || magnitude.evaluationMode === event.magnitude_evaluation_mode) &&
    (event.magnitude_evaluation_status == null || magnitude.evaluationStatus === event.magnitude_evaluation_status);
}

/** A <magnitude> element built from the row's scalar magnitude columns. */
function scalarMagnitudeXml(event: MergedEvent, magnitudeID: string): string {
  let xml = `    <magnitude publicID="${escapeXml(magnitudeID)}">\n`;
  xml += `      <mag>\n        <value>${event.magnitude}</value>\n`;
  if (event.magnitude_uncertainty != null) {
    xml += `        <uncertainty>${event.magnitude_uncertainty}</uncertainty>\n`;
  }
  xml += `      </mag>\n`;
  if (event.magnitude_type) {
    xml += `      <type>${escapeXml(event.magnitude_type)}</type>\n`;
  }
  if (event.magnitude_station_count != null) {
    xml += `      <stationCount>${event.magnitude_station_count}</stationCount>\n`;
  }
  if (event.preferred_origin_id) {
    xml += `      <originID>${escapeXml(toResourceID(event.preferred_origin_id, 'origin', event.id))}</originID>\n`;
  }
  if (event.magnitude_method_id) {
    xml += `      <methodID>${escapeXml(toResourceID(event.magnitude_method_id, 'method'))}</methodID>\n`;
  }
  // Prefer magnitude-specific evaluation fields; fall back to origin-level fields.
  const merged = isMultiSourceMerge(event);
  const magEvalMode = event.magnitude_evaluation_mode || (!merged ? event.evaluation_mode : undefined);
  const magEvalStatus = event.magnitude_evaluation_status || (!merged ? event.evaluation_status : undefined);
  if (magEvalMode) {
    xml += `      <evaluationMode>${escapeXml(magEvalMode)}</evaluationMode>\n`;
  }
  if (magEvalStatus) {
    xml += `      <evaluationStatus>${escapeXml(magEvalStatus)}</evaluationStatus>\n`;
  }
  // For a merge these fields identify the origin's agency, which may differ from
  // the selected magnitude's agency. An unknown donor must remain unattributed.
  if (!merged && (event.agency_id || event.author)) {
    xml += `      <creationInfo>\n`;
    if (event.agency_id) xml += `        <agencyID>${escapeXml(event.agency_id)}</agencyID>\n`;
    if (event.author) xml += `        <author>${escapeXml(event.author)}</author>\n`;
    xml += `      </creationInfo>\n`;
  }
  xml += `    </magnitude>\n`;
  return xml;
}

/**
 * Convert a MergedEvent to QuakeML Event element
 */
export function eventToQuakeML(event: MergedEvent): string {
  // Build QuakeML from stored data
  const publicID = toResourceID(event.event_public_id, 'event', event.id);

  let xml = `  <event publicID="${escapeXml(publicID)}">\n`;

  // QuakeML BED 1.2 schema event child element order:
  // description*, comment*, focalMechanism*, amplitude*, magnitude*, stationMagnitude*,
  // origin*, pick*, preferredOriginID?, preferredMagnitudeID?, type?, typeCertainty?, creationInfo?

  // Descriptions — use stored JSON if available, otherwise synthesise from scalar fields.
  let descriptionEmitted = false;
  if (event.event_descriptions) {
    try {
      const descriptions: EventDescription[] = JSON.parse(event.event_descriptions);
      descriptions.forEach(desc => {
        xml += formatEventDescription(desc) + '\n';
      });
      descriptionEmitted = descriptions.length > 0;
    } catch (e) {
      // Ignore parse errors; fall through to scalar fallback below
    }
  }
  // When no structured descriptions exist, emit region / location_name as a
  // "region name" description (QuakeML EventDescriptionType = "region name").
  if (!descriptionEmitted && (event.region || event.location_name)) {
    const regionText = event.region || event.location_name || '';
    xml += formatEventDescription({ text: regionText, type: 'region name' }) + '\n';
  }

  // Comments
  if (event.comments) {
    try {
      const comments: Comment[] = JSON.parse(event.comments);
      comments.forEach(comment => {
        xml += formatComment(comment) + '\n';
      });
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Focal Mechanisms (schema order: 3rd group, before amplitudes/magnitudes/origins)
  if (event.focal_mechanisms) {
    try {
      const focalMechanisms: FocalMechanism[] = JSON.parse(event.focal_mechanisms);
      focalMechanisms.forEach((fm, index) => {
        const lifted = liftSimplifiedFocalMechanism(fm);
        // A mechanism stored without an id (GeoNet enrichment) gets a deterministic one
        // so two of them cannot both export as ".../unknown".
        if (!lifted.publicID) lifted.publicID = `${event.id}-focalMechanism-${index + 1}`;
        xml += formatFocalMechanism(lifted) + '\n';
      });
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Amplitudes (schema order: 4th group, before magnitudes/origins)
  if (event.amplitudes) {
    try {
      const amplitudes: Amplitude[] = JSON.parse(event.amplitudes);
      amplitudes.forEach(amplitude => {
        xml += formatAmplitude(amplitude) + '\n';
      });
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Magnitudes (schema order: 5th group, before origins)
  let parsedMagnitudes: Magnitude[] | null = null;
  if (event.magnitudes) {
    try {
      parsedMagnitudes = JSON.parse(event.magnitudes);
    } catch {
      // unparseable JSON; fall through to scalar fallback
    }
  }
  // The id the <preferredMagnitudeID> element will point at (set below).
  let preferredMagnitudeExportId: string | undefined = event.preferred_magnitude_id
    ? toResourceID(event.preferred_magnitude_id, 'magnitude', event.id)
    : undefined;
  if (parsedMagnitudes && parsedMagnitudes.length > 0) {
    // Entries without an id (e.g. alternatives kept from a flat CSV import) get a
    // deterministic one so two of them cannot collapse onto "unknown".
    const withIds = parsedMagnitudes.map((magnitude, index) => ({
      ...magnitude,
      publicID: magnitude.publicID || `${event.id}-magnitude-${index + 1}`,
    }));
    // Keep source measurements intact. Rewriting an ML entry with a selected Mw
    // also rewrote its identity while retaining the ML agency's creationInfo.
    withIds.forEach(magnitude => {
      xml += formatMagnitude(magnitude) + '\n';
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
        xml += scalarMagnitudeXml(event, magnitudeID);
        preferredMagnitudeExportId = magnitudeID;
      }
    }
  } else if (event.magnitude != null) {
    // Fallback: reconstruct Magnitude from scalar database fields.
    const magnitudeID = toResourceID(event.preferred_magnitude_id, 'magnitude', event.id);
    xml += scalarMagnitudeXml(event, magnitudeID);
    preferredMagnitudeExportId = magnitudeID;
  }

  // Station Magnitudes (schema order: 6th group, before origins)
  if (event.station_magnitudes) {
    try {
      const stationMagnitudes: StationMagnitude[] = JSON.parse(event.station_magnitudes);
      stationMagnitudes.forEach(stationMag => {
        xml += formatStationMagnitude(stationMag) + '\n';
      });
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Origins (schema order: 7th group, after magnitudes)
  let standaloneArrivals: Arrival[] = [];
  if (event.arrivals) {
    try {
      standaloneArrivals = JSON.parse(event.arrivals);
    } catch {
      standaloneArrivals = [];
    }
  }
  let parsedOrigins: Origin[] | null = null;
  if (event.origins) {
    try {
      parsedOrigins = JSON.parse(event.origins);
    } catch {
      // unparseable JSON; fall through to scalar fallback
    }
  }
  if (parsedOrigins && parsedOrigins.length > 0) {
    const originsToEmit = isMultiSourceMerge(event)
      ? applyMergedOriginValues(parsedOrigins, event)
      : parsedOrigins;
    originsToEmit.forEach((origin, index) => {
      const originWithArrivals = (!origin.arrivals || origin.arrivals.length === 0) &&
        index === 0 && standaloneArrivals.length > 0
        ? { ...origin, arrivals: standaloneArrivals }
        : origin;
      xml += formatOrigin(originWithArrivals) + '\n';
    });
  } else {
    // Fallback: reconstruct Origin from scalar database fields.
    {
      const originID = toResourceID(event.preferred_origin_id, 'origin', event.id);
      xml += `    <origin publicID="${escapeXml(originID)}">\n`;

      // Time
      xml += `      <time>\n        <value>${event.time}</value>\n`;
      if (event.time_uncertainty != null) {
        xml += `        <uncertainty>${event.time_uncertainty}</uncertainty>\n`;
      }
      xml += `      </time>\n`;

      // Latitude
      xml += `      <latitude>\n        <value>${event.latitude}</value>\n`;
      if (event.latitude_uncertainty != null) {
        xml += `        <uncertainty>${event.latitude_uncertainty}</uncertainty>\n`;
      }
      xml += `      </latitude>\n`;

      // Longitude
      xml += `      <longitude>\n        <value>${event.longitude}</value>\n`;
      if (event.longitude_uncertainty != null) {
        xml += `        <uncertainty>${event.longitude_uncertainty}</uncertainty>\n`;
      }
      xml += `      </longitude>\n`;

      // Depth (QuakeML spec: depth value in meters; DB stores km)
      if (event.depth != null) {
        xml += `      <depth>\n        <value>${event.depth * 1000}</value>\n`;
        if (event.depth_uncertainty != null) {
          xml += `        <uncertainty>${event.depth_uncertainty * 1000}</uncertainty>\n`;
        }
        xml += `      </depth>\n`;
      }

      // Depth type (how depth was constrained)
      if (event.depth_type) {
        xml += `      <depthType>${escapeXml(event.depth_type)}</depthType>\n`;
      }

      // Velocity model and location method
      if (event.method_id) {
        xml += `      <methodID>${escapeXml(toResourceID(event.method_id, 'method'))}</methodID>\n`;
      }
      if (event.earth_model_id) {
        xml += `      <earthModelID>${escapeXml(toResourceID(event.earth_model_id, 'earthModel'))}</earthModelID>\n`;
      }

      // Quality metrics — all available fields
      const hasQuality = event.azimuthal_gap != null || event.used_phase_count != null ||
        event.used_station_count != null || event.standard_error != null ||
        event.minimum_distance != null || event.maximum_distance != null ||
        event.associated_phase_count != null || event.associated_station_count != null ||
        event.depth_phase_count != null;
      if (hasQuality) {
        xml += `      <quality>\n`;
        if (event.associated_phase_count != null) xml += `        <associatedPhaseCount>${event.associated_phase_count}</associatedPhaseCount>\n`;
        if (event.used_phase_count != null) xml += `        <usedPhaseCount>${event.used_phase_count}</usedPhaseCount>\n`;
        if (event.associated_station_count != null) xml += `        <associatedStationCount>${event.associated_station_count}</associatedStationCount>\n`;
        if (event.used_station_count != null) xml += `        <usedStationCount>${event.used_station_count}</usedStationCount>\n`;
        if (event.depth_phase_count != null) xml += `        <depthPhaseCount>${event.depth_phase_count}</depthPhaseCount>\n`;
        if (event.azimuthal_gap != null) xml += `        <azimuthalGap>${event.azimuthal_gap}</azimuthalGap>\n`;
        if (event.minimum_distance != null) xml += `        <minimumDistance>${event.minimum_distance}</minimumDistance>\n`;
        if (event.maximum_distance != null) xml += `        <maximumDistance>${event.maximum_distance}</maximumDistance>\n`;
        if (event.standard_error != null) xml += `        <standardError>${event.standard_error}</standardError>\n`;
        xml += `      </quality>\n`;
      }

      const flatUncertainty = originUncertaintyFromEvent(event);
      if (flatUncertainty) {
        xml += formatOriginUncertainty(flatUncertainty, '      ') + '\n';
      }

      if (event.evaluation_mode) {
        xml += `      <evaluationMode>${escapeXml(event.evaluation_mode)}</evaluationMode>\n`;
      }
      if (event.evaluation_status) {
        xml += `      <evaluationStatus>${escapeXml(event.evaluation_status)}</evaluationStatus>\n`;
      }

      // Fallback creationInfo from scalar agency/author fields
      if (event.agency_id || event.author) {
        xml += `      <creationInfo>\n`;
        if (event.agency_id) xml += `        <agencyID>${escapeXml(event.agency_id)}</agencyID>\n`;
        if (event.author) xml += `        <author>${escapeXml(event.author)}</author>\n`;
        xml += `      </creationInfo>\n`;
      }

      // Arrivals (child elements of Origin in QuakeML)
      if (event.arrivals) {
        try {
          standaloneArrivals.forEach(arrival => {
            xml += formatArrival(arrival) + '\n';
          });
        } catch {
          // Ignore parse errors
        }
      }

      xml += `    </origin>\n`;
    }
  }

  // Picks (schema order: 8th group, after origins)
  if (event.picks) {
    try {
      const picks: Pick[] = JSON.parse(event.picks);
      picks.forEach(pick => {
        xml += formatPick(pick) + '\n';
      });
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Preferred IDs (schema order: after origin/magnitude elements)
  if (event.preferred_origin_id) {
    xml += `    <preferredOriginID>${escapeXml(toResourceID(event.preferred_origin_id, 'origin', event.id))}</preferredOriginID>\n`;
  }
  if (preferredMagnitudeExportId) {
    xml += `    <preferredMagnitudeID>${escapeXml(preferredMagnitudeExportId)}</preferredMagnitudeID>\n`;
  }
  if (event.preferred_focal_mechanism_id) {
    xml += `    <preferredFocalMechanismID>${escapeXml(toResourceID(event.preferred_focal_mechanism_id, 'focalMechanism', event.id))}</preferredFocalMechanismID>\n`;
  }

  // Event type (schema order: after preferredIDs)
  if (event.event_type) {
    xml += `    <type>${escapeXml(event.event_type)}</type>\n`;
  }
  if (event.event_type_certainty) {
    xml += `    <typeCertainty>${escapeXml(event.event_type_certainty)}</typeCertainty>\n`;
  }

  // Creation info (schema order: last)
  if (event.creation_info) {
    try {
      const creationInfo: CreationInfo = JSON.parse(event.creation_info);
      xml += formatCreationInfo(creationInfo) + '\n';
    } catch (e) {
      // Ignore parse errors
    }
  }

  xml += `  </event>`;
  return xml;
}

/**
 * Convert multiple events to a complete QuakeML document
 */
export function eventsToQuakeMLDocument(
  events: MergedEvent[],
  catalogueName?: string,
  metadata?: ExportMetadata
): string {
  const timestamp = new Date().toISOString();
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
  if (metadata?.timePeriodStart || metadata?.timePeriodEnd) {
    descParts.push(`Time Period: ${metadata.timePeriodStart ?? '?'} to ${metadata.timePeriodEnd ?? '?'}`);
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

  // Creation info with version
  xml += `    <creationInfo>\n`;
  xml += `      <creationTime>${timestamp}</creationTime>\n`;
  xml += `      <agencyID>CatalogueOfCatalogues</agencyID>\n`;
  // User-entered free text; "1 & 2" unescaped produced a malformed document.
  xml += `      <version>${escapeXml(String(metadata?.version || '1.0'))}</version>\n`;
  xml += `    </creationInfo>\n`;

  // Add all events
  events.forEach(event => {
    xml += eventToQuakeML(event) + '\n';
  });

  xml += '  </eventParameters>\n';
  xml += '</q:quakeml>';

  return xml;
}
