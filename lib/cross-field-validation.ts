/**
 * Cross-field validation for earthquake data
 * Validates relationships and consistency between different fields
 */

import type { DataQualityCheck } from './validation';

export interface CrossFieldValidationResult {
  passed: boolean;
  checks: DataQualityCheck[];
  eventIndex?: number;
}

/**
 * Validate magnitude-depth relationship
 * Very shallow events with large magnitudes are extremely rare
 */
export function validateMagnitudeDepthRelationship(event: any): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];

  if (event.depth === null || event.depth === undefined || event.magnitude === null || event.magnitude === undefined) {
    return checks;
  }

  // Very shallow (<5km) events with magnitude >8 are extremely rare
  if (event.depth < 5 && event.magnitude > 8) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Very shallow event (${event.depth}km) with large magnitude (${event.magnitude}) is extremely rare`,
      field: 'depth',
      suggestion: 'Verify depth and magnitude values - this may indicate a data error'
    });
  }

  // Deep events (>300km) with small magnitudes (<3) are unusual
  if (event.depth > 300 && event.magnitude < 3) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Deep event (${event.depth}km) with small magnitude (${event.magnitude}) is unusual`,
      field: 'magnitude',
      suggestion: 'Small deep events are difficult to detect - verify this is not a location error'
    });
  }

  // Extremely deep events (>700km) should have reasonable magnitudes
  if (event.depth > 700 && event.magnitude < 4) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Very deep event (${event.depth}km) with magnitude ${event.magnitude} is unlikely to be detected`,
      field: 'depth',
      suggestion: 'Verify depth - events this deep and small are rarely detected'
    });
  }

  return checks;
}

/**
 * Validate uncertainty-value relationships
 * Uncertainties should be reasonable relative to the measured values
 */
export function validateUncertaintyRelationships(event: any): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];

  // Depth uncertainty should not exceed depth value significantly
  if (event.depth !== null && event.depth !== undefined && event.depth_uncertainty !== undefined) {
    if (event.depth_uncertainty > event.depth * 2) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: `Depth uncertainty (${event.depth_uncertainty}km) exceeds twice the depth value (${event.depth}km)`,
        field: 'depth_uncertainty',
        suggestion: 'This indicates very poor depth constraint - consider fixing the depth or reviewing the solution'
      });
    }

    if (event.depth > 0 && event.depth_uncertainty > event.depth) {
      checks.push({
        passed: false,
        severity: 'info',
        message: `Depth uncertainty (${event.depth_uncertainty}km) exceeds the depth value (${event.depth}km)`,
        field: 'depth_uncertainty',
        suggestion: 'Depth is poorly constrained'
      });
    }
  }

  // Magnitude uncertainty should be reasonable
  if (event.magnitude !== undefined && event.magnitude_uncertainty !== undefined) {
    if (event.magnitude_uncertainty > 1.0) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: `Magnitude uncertainty (${event.magnitude_uncertainty}) is very large`,
        field: 'magnitude_uncertainty',
        suggestion: 'Magnitude is poorly constrained - consider using more stations'
      });
    }

    if (event.magnitude_uncertainty > Math.abs(event.magnitude)) {
      checks.push({
        passed: false,
        severity: 'error',
        message: `Magnitude uncertainty (${event.magnitude_uncertainty}) exceeds magnitude value (${event.magnitude})`,
        field: 'magnitude_uncertainty',
        suggestion: 'This is physically unreasonable - review the magnitude calculation'
      });
    }
  }

  // Location uncertainties should be consistent
  if (event.latitude_uncertainty !== undefined && event.longitude_uncertainty !== undefined) {
    const ratio = Math.max(event.latitude_uncertainty, event.longitude_uncertainty) / 
                  Math.min(event.latitude_uncertainty, event.longitude_uncertainty);
    
    if (ratio > 10) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: `Location uncertainties are highly asymmetric (ratio: ${ratio.toFixed(1)}:1)`,
        field: 'location_uncertainty',
        suggestion: 'This may indicate poor station distribution or a systematic error'
      });
    }
  }

  return checks;
}

/**
 * Validate quality metrics consistency
 * Check if quality metrics are consistent with each other
 */
export function validateQualityMetricsConsistency(event: any): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];

  // Station count should be less than or equal to phase count
  if (event.used_station_count !== undefined && event.used_phase_count !== undefined) {
    if (event.used_station_count > event.used_phase_count) {
      checks.push({
        passed: false,
        severity: 'error',
        message: `Station count (${event.used_station_count}) exceeds phase count (${event.used_phase_count})`,
        field: 'used_station_count',
        suggestion: 'This is impossible - each station contributes at least one phase'
      });
    }

    // Typically, phase count should be at least 1.5x station count (P and S from each station)
    if (event.used_phase_count < event.used_station_count * 1.2) {
      checks.push({
        passed: false,
        severity: 'info',
        message: `Phase count (${event.used_phase_count}) is low relative to station count (${event.used_station_count})`,
        field: 'used_phase_count',
        suggestion: 'Consider using both P and S phases for better location accuracy'
      });
    }
  }

  // Magnitude station count should be reasonable
  if (event.magnitude_station_count !== undefined && event.used_station_count !== undefined) {
    if (event.magnitude_station_count > event.used_station_count) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: `Magnitude station count (${event.magnitude_station_count}) exceeds location station count (${event.used_station_count})`,
        field: 'magnitude_station_count',
        suggestion: 'This is unusual - verify the station counts'
      });
    }
  }

  // Azimuthal gap and station count relationship
  if (event.azimuthal_gap !== undefined && event.used_station_count !== undefined) {
    // With many stations, gap should be small
    if (event.used_station_count >= 10 && event.azimuthal_gap > 180) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: `Large azimuthal gap (${event.azimuthal_gap}°) despite ${event.used_station_count} stations`,
        field: 'azimuthal_gap',
        suggestion: 'Stations may be poorly distributed - consider using more distant stations'
      });
    }

    // With few stations, gap will be large
    if (event.used_station_count < 6 && event.azimuthal_gap < 90) {
      checks.push({
        passed: false,
        severity: 'info',
        message: `Small azimuthal gap (${event.azimuthal_gap}°) with only ${event.used_station_count} stations is unusual`,
        field: 'azimuthal_gap',
        suggestion: 'Verify azimuthal gap calculation'
      });
    }
  }

  // Standard error should be reasonable
  if (event.standard_error !== undefined) {
    if (event.standard_error > 5.0) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: `Very large RMS residual (${event.standard_error}s)`,
        field: 'standard_error',
        suggestion: 'Poor fit to data - review phase picks and velocity model'
      });
    }

    if (event.standard_error < 0.01) {
      checks.push({
        passed: false,
        severity: 'info',
        message: `Unusually small RMS residual (${event.standard_error}s)`,
        field: 'standard_error',
        suggestion: 'Verify this is not a rounding or calculation error'
      });
    }
  }

  return checks;
}

/**
 * Validate time-location consistency
 * Check if event time and location are consistent
 */
export function validateTimeLocationConsistency(event: any): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];

  // Check if time is in the future
  if (event.time) {
    const eventTime = new Date(event.time);
    const now = new Date();
    // Absolute minimum date for historical seismology (year 1000 CE)
    const absoluteMinDate = new Date('1000-01-01');
    // Instrumental era threshold (for informational notes)
    const instrumentalEraDate = new Date('1900-01-01');

    if (eventTime > now) {
      checks.push({
        passed: false,
        severity: 'error',
        message: `Event time (${eventTime.toISOString()}) is in the future`,
        field: 'time',
        suggestion: 'Verify the timestamp - events cannot occur in the future'
      });
    }

    // Check if time is unreasonably old (before 1000 CE)
    if (eventTime < absoluteMinDate) {
      checks.push({
        passed: false,
        severity: 'error',
        message: `Event time (${eventTime.toISOString()}) is before year 1000 CE`,
        field: 'time',
        suggestion: 'Events before 1000 CE are not supported - check timestamp format'
      });
    }
    // Informational note for pre-instrumental era (before 1900)
    else if (eventTime < instrumentalEraDate) {
      checks.push({
        passed: true, // This is informational, not a validation failure
        severity: 'info',
        message: `Historical event from pre-instrumental era (${eventTime.toISOString()})`,
        field: 'time',
        suggestion: 'Pre-1900 historical events are supported - uncertainties may be higher due to lack of instrumental data'
      });
    }
  }

  // Check if location is on land or sea (basic sanity check)
  if (event.latitude !== undefined && event.longitude !== undefined) {
    // Check for null island (0,0)
    if (event.latitude === 0 && event.longitude === 0) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: 'Event located at (0°, 0°) - "Null Island"',
        field: 'latitude',
        suggestion: 'This is likely a data error - verify coordinates'
      });
    }

    // Check for extreme coordinates
    if (Math.abs(event.latitude) < 0.001 && Math.abs(event.longitude) < 0.001) {
      checks.push({
        passed: false,
        severity: 'warning',
        message: 'Event located very close to (0°, 0°)',
        field: 'latitude',
        suggestion: 'Verify coordinates are correct'
      });
    }
  }

  return checks;
}

/**
 * Perform comprehensive cross-field validation on an event
 */
export function validateEventCrossFields(event: any, eventIndex?: number): CrossFieldValidationResult {
  const checks: DataQualityCheck[] = [
    ...validateMagnitudeDepthRelationship(event),
    ...validateUncertaintyRelationships(event),
    ...validateQualityMetricsConsistency(event),
    ...validateTimeLocationConsistency(event),
  ];

  const passed = !checks.some(c => c.severity === 'error');

  return {
    passed,
    checks,
    eventIndex,
  };
}

/**
 * Validate cross-field relationships for multiple events
 */
export function validateEventsCrossFields(events: any[]): {
  passed: boolean;
  results: CrossFieldValidationResult[];
  summary: {
    totalEvents: number;
    passedEvents: number;
    failedEvents: number;
    totalChecks: number;
    errors: number;
    warnings: number;
    info: number;
  };
} {
  const results = events.map((event, index) => validateEventCrossFields(event, index));

  const passedEvents = results.filter(r => r.passed).length;
  const failedEvents = results.length - passedEvents;

  const allChecks = results.flatMap(r => r.checks);
  const errors = allChecks.filter(c => c.severity === 'error').length;
  const warnings = allChecks.filter(c => c.severity === 'warning').length;
  const info = allChecks.filter(c => c.severity === 'info').length;

  return {
    passed: failedEvents === 0,
    results,
    summary: {
      totalEvents: events.length,
      passedEvents,
      failedEvents,
      totalChecks: allChecks.length,
      errors,
      warnings,
      info,
    },
  };
}

