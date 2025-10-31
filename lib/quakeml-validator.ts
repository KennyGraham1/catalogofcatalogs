/**
 * QuakeML 1.2 BED Schema Validation
 * Validates QuakeML documents against the QuakeML 1.2 Basic Event Description specification
 */

import type { QuakeMLEvent, Origin, Magnitude } from './types/quakeml';

export interface QuakeMLValidationError {
  type: 'error' | 'warning';
  path: string;
  message: string;
  value?: any;
}

export interface QuakeMLValidationResult {
  isValid: boolean;
  errors: QuakeMLValidationError[];
  warnings: QuakeMLValidationError[];
  eventCount: number;
}

/**
 * Validate QuakeML XML structure
 */
export function validateQuakeMLStructure(xmlContent: string): QuakeMLValidationResult {
  const errors: QuakeMLValidationError[] = [];
  const warnings: QuakeMLValidationError[] = [];

  // Check for basic XML structure
  if (!xmlContent.includes('<quakeml') && !xmlContent.includes('<q:quakeml')) {
    errors.push({
      type: 'error',
      path: 'root',
      message: 'Document must contain a <quakeml> root element'
    });
    return { isValid: false, errors, warnings, eventCount: 0 };
  }

  // Check for namespace declaration
  if (!xmlContent.includes('xmlns') && !xmlContent.includes('http://quakeml.org/xmlns')) {
    warnings.push({
      type: 'warning',
      path: 'root',
      message: 'QuakeML namespace declaration is missing or non-standard'
    });
  }

  // Count events
  const eventMatches = xmlContent.match(/<event[^>]*>/g);
  const eventCount = eventMatches ? eventMatches.length : 0;

  if (eventCount === 0) {
    errors.push({
      type: 'error',
      path: 'quakeml',
      message: 'No <event> elements found in QuakeML document'
    });
  }

  // Check for well-formed XML (basic check)
  const openTags = xmlContent.match(/<[^/][^>]*>/g) || [];
  const closeTags = xmlContent.match(/<\/[^>]+>/g) || [];
  
  if (openTags.length !== closeTags.length) {
    errors.push({
      type: 'error',
      path: 'xml',
      message: 'XML document appears to be malformed (mismatched tags)'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    eventCount
  };
}

/**
 * Validate a parsed QuakeML event object
 */
export function validateQuakeMLEvent(event: QuakeMLEvent): QuakeMLValidationResult {
  const errors: QuakeMLValidationError[] = [];
  const warnings: QuakeMLValidationError[] = [];

  // Required: publicID
  if (!event.publicID || event.publicID.trim() === '') {
    errors.push({
      type: 'error',
      path: 'event.publicID',
      message: 'Event must have a publicID',
      value: event.publicID
    });
  } else {
    // Validate publicID format (should be a URI)
    if (!event.publicID.includes(':')) {
      warnings.push({
        type: 'warning',
        path: 'event.publicID',
        message: 'publicID should be a URI (e.g., smi:agency/event/id)',
        value: event.publicID
      });
    }
  }

  // Required: At least one origin
  if (!event.origins || event.origins.length === 0) {
    errors.push({
      type: 'error',
      path: 'event.origins',
      message: 'Event must have at least one origin'
    });
  } else {
    // Validate each origin
    event.origins.forEach((origin, index) => {
      const originErrors = validateOrigin(origin, `event.origins[${index}]`);
      errors.push(...originErrors.filter(e => e.type === 'error'));
      warnings.push(...originErrors.filter(e => e.type === 'warning'));
    });

    // Check preferred origin
    if (event.preferredOriginID) {
      const hasPreferred = event.origins.some(o => o.publicID === event.preferredOriginID);
      if (!hasPreferred) {
        errors.push({
          type: 'error',
          path: 'event.preferredOriginID',
          message: 'preferredOriginID does not match any origin publicID',
          value: event.preferredOriginID
        });
      }
    } else if (event.origins.length > 1) {
      warnings.push({
        type: 'warning',
        path: 'event.preferredOriginID',
        message: 'Event has multiple origins but no preferredOriginID specified'
      });
    }
  }

  // Required: At least one magnitude
  if (!event.magnitudes || event.magnitudes.length === 0) {
    errors.push({
      type: 'error',
      path: 'event.magnitudes',
      message: 'Event must have at least one magnitude'
    });
  } else {
    // Validate each magnitude
    event.magnitudes.forEach((magnitude, index) => {
      const magErrors = validateMagnitude(magnitude, `event.magnitudes[${index}]`);
      errors.push(...magErrors.filter(e => e.type === 'error'));
      warnings.push(...magErrors.filter(e => e.type === 'warning'));
    });

    // Check preferred magnitude
    if (event.preferredMagnitudeID) {
      const hasPreferred = event.magnitudes.some(m => m.publicID === event.preferredMagnitudeID);
      if (!hasPreferred) {
        errors.push({
          type: 'error',
          path: 'event.preferredMagnitudeID',
          message: 'preferredMagnitudeID does not match any magnitude publicID',
          value: event.preferredMagnitudeID
        });
      }
    } else if (event.magnitudes.length > 1) {
      warnings.push({
        type: 'warning',
        path: 'event.preferredMagnitudeID',
        message: 'Event has multiple magnitudes but no preferredMagnitudeID specified'
      });
    }
  }

  // Optional but recommended: event type
  if (!event.type) {
    warnings.push({
      type: 'warning',
      path: 'event.type',
      message: 'Event type is not specified (recommended: earthquake, quarry blast, etc.)'
    });
  }

  // Optional: creation info
  if (!event.creationInfo) {
    warnings.push({
      type: 'warning',
      path: 'event.creationInfo',
      message: 'Event creation info is missing (recommended for provenance tracking)'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    eventCount: 1
  };
}

/**
 * Validate an origin object
 */
function validateOrigin(origin: Origin, path: string): QuakeMLValidationError[] {
  const errors: QuakeMLValidationError[] = [];

  // Required: publicID
  if (!origin.publicID) {
    errors.push({
      type: 'error',
      path: `${path}.publicID`,
      message: 'Origin must have a publicID'
    });
  }

  // Required: time
  if (!origin.time || !origin.time.value) {
    errors.push({
      type: 'error',
      path: `${path}.time`,
      message: 'Origin must have a time value'
    });
  } else {
    // Validate time format (ISO 8601)
    const timeValue = origin.time.value;
    if (isNaN(Date.parse(timeValue))) {
      errors.push({
        type: 'error',
        path: `${path}.time.value`,
        message: 'Origin time must be a valid ISO 8601 datetime',
        value: timeValue
      });
    }
  }

  // Required: latitude
  if (!origin.latitude || origin.latitude.value === undefined) {
    errors.push({
      type: 'error',
      path: `${path}.latitude`,
      message: 'Origin must have a latitude value'
    });
  } else {
    const lat = origin.latitude.value;
    if (lat < -90 || lat > 90) {
      errors.push({
        type: 'error',
        path: `${path}.latitude.value`,
        message: 'Latitude must be between -90 and 90 degrees',
        value: lat
      });
    }
  }

  // Required: longitude
  if (!origin.longitude || origin.longitude.value === undefined) {
    errors.push({
      type: 'error',
      path: `${path}.longitude`,
      message: 'Origin must have a longitude value'
    });
  } else {
    const lon = origin.longitude.value;
    if (lon < -180 || lon > 180) {
      errors.push({
        type: 'error',
        path: `${path}.longitude.value`,
        message: 'Longitude must be between -180 and 180 degrees',
        value: lon
      });
    }
  }

  // Optional but recommended: depth
  if (!origin.depth) {
    errors.push({
      type: 'warning',
      path: `${path}.depth`,
      message: 'Origin depth is missing (recommended)'
    });
  } else if (origin.depth.value < 0) {
    errors.push({
      type: 'error',
      path: `${path}.depth.value`,
      message: 'Depth must be >= 0 meters',
      value: origin.depth.value
    });
  }

  // Optional but recommended: quality metrics
  if (!origin.quality) {
    errors.push({
      type: 'warning',
      path: `${path}.quality`,
      message: 'Origin quality metrics are missing (recommended for quality assessment)'
    });
  }

  return errors;
}

/**
 * Validate a magnitude object
 */
function validateMagnitude(magnitude: Magnitude, path: string): QuakeMLValidationError[] {
  const errors: QuakeMLValidationError[] = [];

  // Required: publicID
  if (!magnitude.publicID) {
    errors.push({
      type: 'error',
      path: `${path}.publicID`,
      message: 'Magnitude must have a publicID'
    });
  }

  // Required: mag value
  if (!magnitude.mag || magnitude.mag.value === undefined) {
    errors.push({
      type: 'error',
      path: `${path}.mag`,
      message: 'Magnitude must have a mag value'
    });
  } else {
    const mag = magnitude.mag.value;
    if (mag < -2 || mag > 10) {
      errors.push({
        type: 'warning',
        path: `${path}.mag.value`,
        message: 'Magnitude value is outside typical range (-2 to 10)',
        value: mag
      });
    }
  }

  // Optional but recommended: type
  if (!magnitude.type) {
    errors.push({
      type: 'warning',
      path: `${path}.type`,
      message: 'Magnitude type is missing (recommended: ML, Mw, mb, etc.)'
    });
  }

  // Optional but recommended: originID
  if (!magnitude.originID) {
    errors.push({
      type: 'warning',
      path: `${path}.originID`,
      message: 'Magnitude originID is missing (recommended to link to origin)'
    });
  }

  return errors;
}

/**
 * Validate multiple QuakeML events
 */
export function validateQuakeMLEvents(events: QuakeMLEvent[]): QuakeMLValidationResult {
  const allErrors: QuakeMLValidationError[] = [];
  const allWarnings: QuakeMLValidationError[] = [];

  events.forEach((event, index) => {
    const result = validateQuakeMLEvent(event);
    
    // Prefix paths with event index
    result.errors.forEach(error => {
      allErrors.push({
        ...error,
        path: `events[${index}].${error.path}`
      });
    });
    
    result.warnings.forEach(warning => {
      allWarnings.push({
        ...warning,
        path: `events[${index}].${warning.path}`
      });
    });
  });

  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    eventCount: events.length
  };
}

