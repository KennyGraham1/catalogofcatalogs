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

/**
 * Extract text content from XML tag
 */
function extractTagValue(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Extract nested value tag (e.g., <magnitude><value>5.2</value></magnitude>)
 */
function extractNestedValue(xml: string, parentTag: string): string | undefined {
  const regex = new RegExp(`<${parentTag}[^>]*>.*?<value>([^<]*)<\/value>.*?<\/${parentTag}>`, 's');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Extract RealQuantity (value with optional uncertainty)
 */
function extractRealQuantity(xml: string, parentTag: string): RealQuantity | undefined {
  const regex = new RegExp(`<${parentTag}[^>]*>(.*?)<\/${parentTag}>`, 's');
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
  const regex = new RegExp(`<${parentTag}[^>]*>(.*?)<\/${parentTag}>`, 's');
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
    searchXML = searchXML.replace(/<comment[^>]*>[\s\S]*?<\/comment>/g, '');
    // Remove origin elements
    searchXML = searchXML.replace(/<origin[^>]*>[\s\S]*?<\/origin>/g, '');
    // Remove magnitude elements
    searchXML = searchXML.replace(/<magnitude[^>]*>[\s\S]*?<\/magnitude>/g, '');
    // Remove description elements
    searchXML = searchXML.replace(/<description[^>]*>[\s\S]*?<\/description>/g, '');
  }

  const regex = /<creationInfo[^>]*>(.*?)<\/creationInfo>/s;
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
 * Extract Comments
 */
function extractComments(xml: string): Comment[] | undefined {
  const comments: Comment[] = [];
  const regex = /<comment[^>]*>(.*?)<\/comment>/gs;
  const matchesArray = Array.from(xml.matchAll(regex));

  for (let i = 0; i < matchesArray.length; i++) {
    const match = matchesArray[i];
    const content = match[1];
    const text = extractTagValue(content, 'text');
    if (text) {
      const comment: Comment = { text };
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
  const regex = /<description[^>]*>(.*?)<\/description>/gs;
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
  const regex = /<quality[^>]*>(.*?)<\/quality>/s;
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
  const regex = /<originUncertainty[^>]*>(.*?)<\/originUncertainty>/s;
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
  const publicIDMatch = xml.match(/<origin[^>]*publicID="([^"]*)"[^>]*>/);
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
 * Extract Magnitude
 */
function extractMagnitude(xml: string): Magnitude | undefined {
  const publicIDMatch = xml.match(/<magnitude[^>]*publicID="([^"]*)"[^>]*>/);
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
 * Parse QuakeML event and extract all fields
 */
export function parseQuakeMLEvent(eventXML: string): QuakeMLEvent | null {
  try {
    // Extract publicID
    const publicIDMatch = eventXML.match(/<event[^>]*publicID="([^"]*)"[^>]*>/);
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

    // Extract origins
    const originMatchesArray = Array.from(eventXML.matchAll(/<origin[^>]*publicID="[^"]*"[^>]*>(.*?)<\/origin>/gs));
    const origins: Origin[] = [];
    for (let j = 0; j < originMatchesArray.length; j++) {
      const match = originMatchesArray[j];
      const originXML = match[0];
      const origin = extractOrigin(originXML);
      if (origin) origins.push(origin);
    }
    if (origins.length > 0) event.origins = origins;

    // Extract magnitudes
    const magnitudeMatchesArray = Array.from(eventXML.matchAll(/<magnitude[^>]*publicID="[^"]*"[^>]*>(.*?)<\/magnitude>/gs));
    const magnitudes: Magnitude[] = [];
    for (let j = 0; j < magnitudeMatchesArray.length; j++) {
      const match = magnitudeMatchesArray[j];
      const magnitudeXML = match[0];
      const magnitude = extractMagnitude(magnitudeXML);
      if (magnitude) magnitudes.push(magnitude);
    }
    if (magnitudes.length > 0) event.magnitudes = magnitudes;

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
