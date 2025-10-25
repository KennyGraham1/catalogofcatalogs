/**
 * QuakeML 1.2 Exporter
 * Converts database events to QuakeML 1.2 XML format
 */

import type { MergedEvent } from './db';
import type { QuakeMLEvent, Origin, Magnitude, CreationInfo, Comment, EventDescription } from './types/quakeml';

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

