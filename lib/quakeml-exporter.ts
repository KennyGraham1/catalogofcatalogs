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
  if (info.agencyURI) parts.push(`${indent}<agencyURI>${escapeXml(info.agencyURI)}</agencyURI>`);
  if (info.author) parts.push(`${indent}<author>${escapeXml(info.author)}</author>`);
  if (info.authorURI) parts.push(`${indent}<authorURI>${escapeXml(info.authorURI)}</authorURI>`);
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
  let xml = `${indent}<comment>\n`;
  xml += `${indent}  <text>${escapeXml(comment.text)}</text>\n`;

  if (comment.id) xml += `${indent}  <id>${escapeXml(comment.id)}</id>\n`;
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
  let xml = `${indent}<origin publicID="${escapeXml(origin.publicID)}">\n`;

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
    xml += `${indent}  <referenceSystemID>${escapeXml(origin.referenceSystemID)}</referenceSystemID>\n`;
  }
  if (origin.methodID) {
    xml += `${indent}  <methodID>${escapeXml(origin.methodID)}</methodID>\n`;
  }
  if (origin.earthModelID) {
    xml += `${indent}  <earthModelID>${escapeXml(origin.earthModelID)}</earthModelID>\n`;
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
    if (origin.quality.usedStationCount !== undefined) {
      xml += `${indent}    <usedStationCount>${origin.quality.usedStationCount}</usedStationCount>\n`;
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
  let xml = `${indent}<magnitude publicID="${escapeXml(magnitude.publicID)}">\n`;

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
    xml += `${indent}  <originID>${escapeXml(magnitude.originID)}</originID>\n`;
  }

  if (magnitude.methodID) {
    xml += `${indent}  <methodID>${escapeXml(magnitude.methodID)}</methodID>\n`;
  }

  if (magnitude.stationMagnitudeContributions && magnitude.stationMagnitudeContributions.length > 0) {
    magnitude.stationMagnitudeContributions.forEach(contribution => {
      xml += `${indent}  <stationMagnitudeContribution>\n`;
      xml += `${indent}    <stationMagnitudeID>${escapeXml(contribution.stationMagnitudeID)}</stationMagnitudeID>\n`;
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
    xml += `>${escapeXml(waveformID.resourceURI)}</waveformID>`;
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
  let xml = `${indent}<pick publicID="${escapeXml(pick.publicID)}">\n`;

  xml += formatComments(pick.comment, indent + '  ');

  // Time (required)
  if (pick.time) {
    xml += `${indent}  <time>\n`;
    xml += `${indent}    ${formatTimeQuantity(pick.time.value, pick.time.uncertainty)}\n`;
    xml += `${indent}  </time>\n`;
  }

  // WaveformID (required)
  if (pick.waveformID) {
    xml += formatWaveformID(pick.waveformID, indent + '  ') + '\n';
  }

  // Optional elements
  if (pick.filterID) {
    xml += `${indent}  <filterID>${escapeXml(pick.filterID)}</filterID>\n`;
  }
  if (pick.methodID) {
    xml += `${indent}  <methodID>${escapeXml(pick.methodID)}</methodID>\n`;
  }
  if (pick.slownessMethodID) {
    xml += `${indent}  <slownessMethodID>${escapeXml(pick.slownessMethodID)}</slownessMethodID>\n`;
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
    xml += ` publicID="${escapeXml(arrival.publicID)}"`;
  }
  xml += '>\n';

  xml += formatComments(arrival.comment, indent + '  ');

  // PickID (required)
  xml += `${indent}  <pickID>${escapeXml(arrival.pickID)}</pickID>\n`;

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
    xml += `${indent}  <earthModelID>${escapeXml(arrival.earthModelID)}</earthModelID>\n`;
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
  let xml = `${indent}<amplitude publicID="${escapeXml(amplitude.publicID)}">\n`;

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
    xml += `${indent}  <methodID>${escapeXml(amplitude.methodID)}</methodID>\n`;
  }
  if (amplitude.filterID) {
    xml += `${indent}  <filterID>${escapeXml(amplitude.filterID)}</filterID>\n`;
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
    xml += `${indent}  <pickID>${escapeXml(amplitude.pickID)}</pickID>\n`;
  }
  if (amplitude.waveformID) {
    xml += formatWaveformID(amplitude.waveformID, indent + '  ') + '\n';
  }
  if (amplitude.scalingTime) {
    xml += `${indent}  <scalingTime>\n`;
    xml += `${indent}    ${formatTimeQuantity(amplitude.scalingTime.value, amplitude.scalingTime.uncertainty)}\n`;
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
  let xml = `${indent}<stationMagnitude publicID="${escapeXml(stationMag.publicID)}">\n`;

  xml += formatComments(stationMag.comment, indent + '  ');

  // Origin ID
  if (stationMag.originID) {
    xml += `${indent}  <originID>${escapeXml(stationMag.originID)}</originID>\n`;
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
    xml += `${indent}  <amplitudeID>${escapeXml(stationMag.amplitudeID)}</amplitudeID>\n`;
  }

  // Method ID
  if (stationMag.methodID) {
    xml += `${indent}  <methodID>${escapeXml(stationMag.methodID)}</methodID>\n`;
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
    xml += ` publicID="${escapeXml(mt.publicID)}"`;
  }
  xml += '>\n';

  // Derived origin ID (required)
  xml += `${indent}  <derivedOriginID>${escapeXml(mt.derivedOriginID)}</derivedOriginID>\n`;

  if (mt.momentMagnitudeID) {
    xml += `${indent}  <momentMagnitudeID>${escapeXml(mt.momentMagnitudeID)}</momentMagnitudeID>\n`;
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
    xml += `${indent}  <greensFunctionID>${escapeXml(mt.greensFunctionID)}</greensFunctionID>\n`;
  }
  if (mt.filterID) {
    xml += `${indent}  <filterID>${escapeXml(mt.filterID)}</filterID>\n`;
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
    xml += `${indent}  <methodID>${escapeXml(mt.methodID)}</methodID>\n`;
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
function formatFocalMechanism(fm: FocalMechanism, indent: string = '    '): string {
  let xml = `${indent}<focalMechanism publicID="${escapeXml(fm.publicID)}">\n`;

  xml += formatComments(fm.comment, indent + '  ');

  if (fm.triggeringOriginID) {
    xml += `${indent}  <triggeringOriginID>${escapeXml(fm.triggeringOriginID)}</triggeringOriginID>\n`;
  }

  if (fm.waveformID && fm.waveformID.length > 0) {
    fm.waveformID.forEach(waveformID => {
      xml += formatWaveformID(waveformID, indent + '  ') + '\n';
    });
  }

  // Nodal planes
  if (fm.nodalPlanes) {
    xml += `${indent}  <nodalPlanes>\n`;
    if (fm.nodalPlanes.nodalPlane1) {
      xml += formatNodalPlane(fm.nodalPlanes.nodalPlane1, 'nodalPlane1', indent + '    ') + '\n';
    }
    if (fm.nodalPlanes.nodalPlane2) {
      xml += formatNodalPlane(fm.nodalPlanes.nodalPlane2, 'nodalPlane2', indent + '    ') + '\n';
    }
    if (fm.nodalPlanes.preferredPlane !== undefined) {
      xml += `${indent}    <preferredPlane>${fm.nodalPlanes.preferredPlane}</preferredPlane>\n`;
    }
    xml += `${indent}  </nodalPlanes>\n`;
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
    xml += `${indent}  <methodID>${escapeXml(fm.methodID)}</methodID>\n`;
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
 * Convert a MergedEvent to QuakeML Event element
 */
export function eventToQuakeML(event: MergedEvent): string {
  // Build QuakeML from stored data
  const publicID = event.event_public_id || `smi:local/event/${event.id}`;

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
      focalMechanisms.forEach(fm => {
        xml += formatFocalMechanism(fm) + '\n';
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
  if (parsedMagnitudes && parsedMagnitudes.length > 0) {
    parsedMagnitudes.forEach(magnitude => {
      xml += formatMagnitude(magnitude) + '\n';
    });
  } else {
    // Fallback: reconstruct Magnitude from scalar database fields.
    {
      const magnitudeID = event.preferred_magnitude_id || `smi:local/magnitude/${event.id}`;
      xml += `    <magnitude publicID="${escapeXml(magnitudeID)}">\n`;

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
        xml += `      <originID>${escapeXml(event.preferred_origin_id)}</originID>\n`;
      }
      if (event.magnitude_method_id) {
        xml += `      <methodID>${escapeXml(event.magnitude_method_id)}</methodID>\n`;
      }
      // Prefer magnitude-specific evaluation fields; fall back to origin-level fields.
      const magEvalMode = event.magnitude_evaluation_mode || event.evaluation_mode;
      const magEvalStatus = event.magnitude_evaluation_status || event.evaluation_status;
      if (magEvalMode) {
        xml += `      <evaluationMode>${escapeXml(magEvalMode)}</evaluationMode>\n`;
      }
      if (magEvalStatus) {
        xml += `      <evaluationStatus>${escapeXml(magEvalStatus)}</evaluationStatus>\n`;
      }
      // Fallback creationInfo from scalar agency/author fields
      if (event.agency_id || event.author) {
        xml += `      <creationInfo>\n`;
        if (event.agency_id) xml += `        <agencyID>${escapeXml(event.agency_id)}</agencyID>\n`;
        if (event.author) xml += `        <author>${escapeXml(event.author)}</author>\n`;
        xml += `      </creationInfo>\n`;
      }
      xml += `    </magnitude>\n`;
    }
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
    parsedOrigins.forEach((origin, index) => {
      const originWithArrivals = (!origin.arrivals || origin.arrivals.length === 0) &&
        index === 0 && standaloneArrivals.length > 0
        ? { ...origin, arrivals: standaloneArrivals }
        : origin;
      xml += formatOrigin(originWithArrivals) + '\n';
    });
  } else {
    // Fallback: reconstruct Origin from scalar database fields.
    {
      const originID = event.preferred_origin_id || `smi:local/origin/${event.id}`;
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
        xml += `      <methodID>${escapeXml(event.method_id)}</methodID>\n`;
      }
      if (event.earth_model_id) {
        xml += `      <earthModelID>${escapeXml(event.earth_model_id)}</earthModelID>\n`;
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

      if (event.horizontal_uncertainty != null) {
        xml += `      <originUncertainty>\n`;
        // horizontalUncertainty in QuakeML is in meters; DB stores km
        xml += `        <horizontalUncertainty>${event.horizontal_uncertainty * 1000}</horizontalUncertainty>\n`;
        xml += `      </originUncertainty>\n`;
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
    xml += `    <preferredOriginID>${escapeXml(event.preferred_origin_id)}</preferredOriginID>\n`;
  }
  if (event.preferred_magnitude_id) {
    xml += `    <preferredMagnitudeID>${escapeXml(event.preferred_magnitude_id)}</preferredMagnitudeID>\n`;
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

  if (descParts.length > 0) {
    xml += `    <description>\n`;
    xml += `      <text>${escapeXml(descParts.join('; '))}</text>\n`;
    xml += `    </description>\n`;
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
  if (metadata?.createdBy) addComment(`Created By: ${metadata.createdBy}`);
  if (metadata?.modifiedAt) addComment(`Modified At: ${metadata.modifiedAt}`);
  if (metadata?.sourceCatalogues) addComment(`Source Catalogues: ${JSON.stringify(metadata.sourceCatalogues)}`);

  // Creation info with version
  xml += `    <creationInfo>\n`;
  xml += `      <creationTime>${timestamp}</creationTime>\n`;
  xml += `      <agencyID>CatalogueOfCatalogues</agencyID>\n`;
  xml += `      <version>${metadata?.version || '1.0'}</version>\n`;
  xml += `    </creationInfo>\n`;

  // Add all events
  events.forEach(event => {
    xml += eventToQuakeML(event) + '\n';
  });

  xml += '  </eventParameters>\n';
  xml += '</q:quakeml>';

  return xml;
}
