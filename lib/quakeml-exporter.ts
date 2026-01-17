/**
 * QuakeML 1.2 Exporter
 * Converts database events to QuakeML 1.2 XML format
 */

import type { MergedEvent } from './db';
import type {
  QuakeMLEvent,
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
  RealQuantity
} from './types/quakeml';

/**
 * Format a number with optional uncertainty
 */
function formatRealQuantity(value: number | null, uncertainty?: number | null): string {
  if (value === null) return '';
  
  let xml = `<value>${value}</value>`;
  if (uncertainty !== null && uncertainty !== undefined) {
    xml += `\n      <uncertainty>${uncertainty}</uncertainty>`;
  }
  return xml;
}

/**
 * Format a time value with optional uncertainty
 */
function formatTimeQuantity(time: string, uncertainty?: number | null): string {
  let xml = `<value>${time}</value>`;
  if (uncertainty !== null && uncertainty !== undefined) {
    xml += `\n      <uncertainty>${uncertainty}</uncertainty>`;
  }
  return xml;
}

/**
 * Format CreationInfo element
 */
function formatCreationInfo(info: CreationInfo, indent: string = '    '): string {
  const parts: string[] = [];
  
  if (info.agencyID) parts.push(`${indent}<agencyID>${escapeXml(info.agencyID)}</agencyID>`);
  if (info.author) parts.push(`${indent}<author>${escapeXml(info.author)}</author>`);
  if (info.creationTime) parts.push(`${indent}<creationTime>${info.creationTime}</creationTime>`);
  if (info.version) parts.push(`${indent}<version>${escapeXml(info.version)}</version>`);
  
  if (parts.length === 0) return '';
  
  return `${indent.slice(2)}<creationInfo>\n${parts.join('\n')}\n${indent.slice(2)}</creationInfo>`;
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
  
  // Time
  if (origin.time) {
    xml += `${indent}  <time>\n`;
    xml += `${indent}    ${formatTimeQuantity(origin.time.value, origin.time.uncertainty)}\n`;
    xml += `${indent}  </time>\n`;
  }
  
  // Latitude
  if (origin.latitude) {
    xml += `${indent}  <latitude>\n`;
    xml += `${indent}    ${formatRealQuantity(origin.latitude.value, origin.latitude.uncertainty)}\n`;
    xml += `${indent}  </latitude>\n`;
  }
  
  // Longitude
  if (origin.longitude) {
    xml += `${indent}  <longitude>\n`;
    xml += `${indent}    ${formatRealQuantity(origin.longitude.value, origin.longitude.uncertainty)}\n`;
    xml += `${indent}  </longitude>\n`;
  }
  
  // Depth
  if (origin.depth) {
    xml += `${indent}  <depth>\n`;
    xml += `${indent}    ${formatRealQuantity(origin.depth.value, origin.depth.uncertainty)}\n`;
    xml += `${indent}  </depth>\n`;
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
    if (origin.quality.standardError !== undefined) {
      xml += `${indent}    <standardError>${origin.quality.standardError}</standardError>\n`;
    }
    xml += `${indent}  </quality>\n`;
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
  
  // Magnitude value
  if (magnitude.mag) {
    xml += `${indent}  <mag>\n`;
    xml += `${indent}    ${formatRealQuantity(magnitude.mag.value, magnitude.mag.uncertainty)}\n`;
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
  
  // Origin ID
  if (magnitude.originID) {
    xml += `${indent}  <originID>${escapeXml(magnitude.originID)}</originID>\n`;
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
  if (amplitude.period) {
    xml += formatRealQuantityElement('period', amplitude.period, indent + '  ') + '\n';
  }
  if (amplitude.snr !== undefined) {
    xml += `${indent}  <snr>${amplitude.snr}</snr>\n`;
  }
  if (amplitude.timeWindow) {
    xml += `${indent}  <timeWindow>\n`;
    xml += `${indent}    <reference>${amplitude.timeWindow.reference}</reference>\n`;
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

  // Origin ID
  if (stationMag.originID) {
    xml += `${indent}  <originID>${escapeXml(stationMag.originID)}</originID>\n`;
  }

  // Magnitude value (required)
  if (stationMag.mag) {
    xml += `${indent}  <mag>\n`;
    xml += `${indent}    ${formatRealQuantity(stationMag.mag.value, stationMag.mag.uncertainty)}\n`;
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

  if (fm.triggeringOriginID) {
    xml += `${indent}  <triggeringOriginID>${escapeXml(fm.triggeringOriginID)}</triggeringOriginID>\n`;
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
  // Parse QuakeML data if available
  let quakeml: QuakeMLEvent | null = null;
  
  // Try to reconstruct QuakeML from stored data
  const publicID = event.event_public_id || `smi:local/event/${event.id}`;
  
  let xml = `  <event publicID="${escapeXml(publicID)}">\n`;
  
  // Event type
  if (event.event_type) {
    xml += `    <type>${escapeXml(event.event_type)}</type>\n`;
  }
  
  // Event type certainty
  if (event.event_type_certainty) {
    xml += `    <typeCertainty>${escapeXml(event.event_type_certainty)}</typeCertainty>\n`;
  }
  
  // Descriptions
  if (event.event_descriptions) {
    try {
      const descriptions: EventDescription[] = JSON.parse(event.event_descriptions);
      descriptions.forEach(desc => {
        xml += formatEventDescription(desc) + '\n';
      });
    } catch (e) {
      // Ignore parse errors
    }
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
  
  // Preferred origin ID
  if (event.preferred_origin_id) {
    xml += `    <preferredOriginID>${escapeXml(event.preferred_origin_id)}</preferredOriginID>\n`;
  }
  
  // Preferred magnitude ID
  if (event.preferred_magnitude_id) {
    xml += `    <preferredMagnitudeID>${escapeXml(event.preferred_magnitude_id)}</preferredMagnitudeID>\n`;
  }
  
  // Origins
  if (event.origins) {
    try {
      const origins: Origin[] = JSON.parse(event.origins);
      origins.forEach(origin => {
        xml += formatOrigin(origin) + '\n';
      });
    } catch (e) {
      // Fallback: create origin from basic fields
      const originID = event.preferred_origin_id || `smi:local/origin/${event.id}`;
      xml += `    <origin publicID="${escapeXml(originID)}">\n`;
      xml += `      <time>\n        <value>${event.time}</value>\n`;
      if (event.time_uncertainty) {
        xml += `        <uncertainty>${event.time_uncertainty}</uncertainty>\n`;
      }
      xml += `      </time>\n`;
      xml += `      <latitude>\n        <value>${event.latitude}</value>\n`;
      if (event.latitude_uncertainty) {
        xml += `        <uncertainty>${event.latitude_uncertainty}</uncertainty>\n`;
      }
      xml += `      </latitude>\n`;
      xml += `      <longitude>\n        <value>${event.longitude}</value>\n`;
      if (event.longitude_uncertainty) {
        xml += `        <uncertainty>${event.longitude_uncertainty}</uncertainty>\n`;
      }
      xml += `      </longitude>\n`;
      if (event.depth !== null) {
        xml += `      <depth>\n        <value>${event.depth * 1000}</value>\n`; // Convert km to meters
        if (event.depth_uncertainty) {
          xml += `        <uncertainty>${event.depth_uncertainty}</uncertainty>\n`;
        }
        xml += `      </depth>\n`;
      }
      
      // Add quality metrics if available
      if (event.azimuthal_gap || event.used_phase_count || event.used_station_count || event.standard_error) {
        xml += `      <quality>\n`;
        if (event.used_phase_count) xml += `        <usedPhaseCount>${event.used_phase_count}</usedPhaseCount>\n`;
        if (event.used_station_count) xml += `        <usedStationCount>${event.used_station_count}</usedStationCount>\n`;
        if (event.azimuthal_gap) xml += `        <azimuthalGap>${event.azimuthal_gap}</azimuthalGap>\n`;
        if (event.standard_error) xml += `        <standardError>${event.standard_error}</standardError>\n`;
        xml += `      </quality>\n`;
      }
      
      if (event.evaluation_mode) {
        xml += `      <evaluationMode>${escapeXml(event.evaluation_mode)}</evaluationMode>\n`;
      }
      if (event.evaluation_status) {
        xml += `      <evaluationStatus>${escapeXml(event.evaluation_status)}</evaluationStatus>\n`;
      }

      // Include arrivals in the fallback origin if available
      if (event.arrivals) {
        try {
          const arrivals: Arrival[] = JSON.parse(event.arrivals);
          arrivals.forEach(arrival => {
            xml += formatArrival(arrival) + '\n';
          });
        } catch (arrivalError) {
          // Ignore parse errors
        }
      }

      xml += `    </origin>\n`;
    }
  }

  // Magnitudes
  if (event.magnitudes) {
    try {
      const magnitudes: Magnitude[] = JSON.parse(event.magnitudes);
      magnitudes.forEach(magnitude => {
        xml += formatMagnitude(magnitude) + '\n';
      });
    } catch (e) {
      // Fallback: create magnitude from basic fields
      const magnitudeID = event.preferred_magnitude_id || `smi:local/magnitude/${event.id}`;
      xml += `    <magnitude publicID="${escapeXml(magnitudeID)}">\n`;
      xml += `      <mag>\n        <value>${event.magnitude}</value>\n`;
      if (event.magnitude_uncertainty) {
        xml += `        <uncertainty>${event.magnitude_uncertainty}</uncertainty>\n`;
      }
      xml += `      </mag>\n`;
      if (event.magnitude_type) {
        xml += `      <type>${escapeXml(event.magnitude_type)}</type>\n`;
      }
      if (event.magnitude_station_count) {
        xml += `      <stationCount>${event.magnitude_station_count}</stationCount>\n`;
      }
      if (event.evaluation_mode) {
        xml += `      <evaluationMode>${escapeXml(event.evaluation_mode)}</evaluationMode>\n`;
      }
      if (event.evaluation_status) {
        xml += `      <evaluationStatus>${escapeXml(event.evaluation_status)}</evaluationStatus>\n`;
      }
      xml += `    </magnitude>\n`;
    }
  }

  // Station Magnitudes
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

  // Picks
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

  // Amplitudes
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

  // Focal Mechanisms
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

  // Creation info
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
export function eventsToQuakeMLDocument(events: MergedEvent[], catalogueName?: string): string {
  const timestamp = new Date().toISOString();
  const publicID = `smi:local/eventParameters/${Date.now()}`;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<q:quakeml xmlns="http://quakeml.org/xmlns/bed/1.2" xmlns:q="http://quakeml.org/xmlns/quakeml/1.2">\n';
  xml += `  <eventParameters publicID="${escapeXml(publicID)}">\n`;

  if (catalogueName) {
    xml += `    <description>\n`;
    xml += `      <text>Merged earthquake catalogue: ${escapeXml(catalogueName)}</text>\n`;
    xml += `    </description>\n`;
  }

  xml += `    <creationInfo>\n`;
  xml += `      <creationTime>${timestamp}</creationTime>\n`;
  xml += `      <agencyID>CatalogueOfCatalogues</agencyID>\n`;
  xml += `      <version>1.0</version>\n`;
  xml += `    </creationInfo>\n`;

  // Add all events
  events.forEach(event => {
    xml += eventToQuakeML(event) + '\n';
  });

  xml += '  </eventParameters>\n';
  xml += '</q:quakeml>';

  return xml;
}

