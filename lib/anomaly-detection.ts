/**
 * Anomaly Detection System for Earthquake Events
 * Flags suspicious or potentially erroneous earthquake data
 */

export interface AnomalyFlag {
  type: 'error' | 'warning' | 'info';
  category: 'location' | 'magnitude' | 'depth' | 'quality' | 'temporal' | 'consistency';
  message: string;
  field?: string;
  value?: number | string;
  suggestion?: string;
}

export interface AnomalyDetectionResult {
  hasAnomalies: boolean;
  flags: AnomalyFlag[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Detect anomalies in earthquake event data
 */
export function detectAnomalies(event: {
  latitude: number;
  longitude: number;
  depth?: number | null;
  magnitude: number;
  magnitude_type?: string | null;
  time?: string;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  used_phase_count?: number | null;
  standard_error?: number | null;
  depth_uncertainty?: number | null;
  magnitude_uncertainty?: number | null;
}): AnomalyDetectionResult {
  const flags: AnomalyFlag[] = [];

  // === LOCATION ANOMALIES ===
  
  // Check for impossible coordinates
  if (event.latitude < -90 || event.latitude > 90) {
    flags.push({
      type: 'error',
      category: 'location',
      field: 'latitude',
      value: event.latitude,
      message: `Invalid latitude: ${event.latitude}. Must be between -90 and 90 degrees.`,
      suggestion: 'Check coordinate system and ensure proper decimal degree format.'
    });
  }

  if (event.longitude < -180 || event.longitude > 180) {
    flags.push({
      type: 'error',
      category: 'location',
      field: 'longitude',
      value: event.longitude,
      message: `Invalid longitude: ${event.longitude}. Must be between -180 and 180 degrees.`,
      suggestion: 'Check coordinate system and ensure proper decimal degree format.'
    });
  }

  // Check for null island (0,0) - often indicates missing data
  if (event.latitude === 0 && event.longitude === 0) {
    flags.push({
      type: 'warning',
      category: 'location',
      message: 'Event located at (0°, 0°) - "Null Island". This often indicates missing or default coordinates.',
      suggestion: 'Verify that coordinates were properly recorded.'
    });
  }

  // Check for suspiciously precise coordinates (too many decimal places)
  const latDecimals = event.latitude.toString().split('.')[1]?.length || 0;
  const lonDecimals = event.longitude.toString().split('.')[1]?.length || 0;
  if (latDecimals > 6 || lonDecimals > 6) {
    flags.push({
      type: 'info',
      category: 'location',
      message: `Coordinates have unusually high precision (${Math.max(latDecimals, lonDecimals)} decimal places).`,
      suggestion: 'Typical seismic location precision is 3-5 decimal places (~1-100m).'
    });
  }

  // === DEPTH ANOMALIES ===
  
  if (event.depth !== null && event.depth !== undefined) {
    // Negative depth
    if (event.depth < 0) {
      flags.push({
        type: 'error',
        category: 'depth',
        field: 'depth',
        value: event.depth,
        message: `Negative depth: ${event.depth} km. Depth must be >= 0.`,
        suggestion: 'Check depth calculation and sign convention.'
      });
    }

    // Extremely deep events (>700km are very rare)
    if (event.depth > 700) {
      flags.push({
        type: 'warning',
        category: 'depth',
        field: 'depth',
        value: event.depth,
        message: `Extremely deep event: ${event.depth} km. Events deeper than 700 km are very rare.`,
        suggestion: 'Verify depth calculation. Most earthquakes occur in the upper 100 km.'
      });
    }

    // Very shallow events with large magnitude (suspicious)
    if (event.depth < 5 && event.magnitude > 7.5) {
      flags.push({
        type: 'warning',
        category: 'consistency',
        message: `Very shallow event (${event.depth} km) with large magnitude (M${event.magnitude}). This combination is extremely rare.`,
        suggestion: 'Verify both depth and magnitude calculations.'
      });
    }

    // Depth exactly 0 or 10 km (often default values)
    if (event.depth === 0 || event.depth === 10 || event.depth === 33) {
      flags.push({
        type: 'info',
        category: 'depth',
        field: 'depth',
        value: event.depth,
        message: `Depth is ${event.depth} km, which is a common default value.`,
        suggestion: 'Verify that depth was actually calculated and not set to a default.'
      });
    }

    // Large depth uncertainty
    if (event.depth_uncertainty && event.depth_uncertainty > event.depth) {
      flags.push({
        type: 'warning',
        category: 'depth',
        message: `Depth uncertainty (${event.depth_uncertainty} km) exceeds depth value (${event.depth} km).`,
        suggestion: 'This indicates very poor depth constraint. Consider flagging as unreliable.'
      });
    }
  }

  // === MAGNITUDE ANOMALIES ===
  
  // Unrealistic magnitude values
  if (event.magnitude < -2) {
    flags.push({
      type: 'error',
      category: 'magnitude',
      field: 'magnitude',
      value: event.magnitude,
      message: `Magnitude ${event.magnitude} is below typical detection threshold.`,
      suggestion: 'Check magnitude calculation and scale.'
    });
  }

  if (event.magnitude > 10) {
    flags.push({
      type: 'error',
      category: 'magnitude',
      field: 'magnitude',
      value: event.magnitude,
      message: `Magnitude ${event.magnitude} exceeds physical limits. Largest recorded earthquake was M9.5.`,
      suggestion: 'Check magnitude calculation and ensure correct scale.'
    });
  }

  // Suspiciously large magnitude for shallow depth
  if (event.depth !== null && event.depth !== undefined && event.depth < 1 && event.magnitude > 6) {
    flags.push({
      type: 'warning',
      category: 'consistency',
      message: `Very shallow event (<1 km) with magnitude M${event.magnitude}. This is unusual.`,
      suggestion: 'Verify depth and magnitude. May be a mining blast or explosion.'
    });
  }

  // Large magnitude uncertainty
  if (event.magnitude_uncertainty && event.magnitude_uncertainty > 1.0) {
    flags.push({
      type: 'warning',
      category: 'magnitude',
      message: `Large magnitude uncertainty: ±${event.magnitude_uncertainty}`,
      suggestion: 'This indicates poor magnitude constraint. Consider flagging as unreliable.'
    });
  }

  // === QUALITY ANOMALIES ===
  
  // Large azimuthal gap (poor station coverage)
  if (event.azimuthal_gap !== null && event.azimuthal_gap !== undefined) {
    if (event.azimuthal_gap > 270) {
      flags.push({
        type: 'warning',
        category: 'quality',
        field: 'azimuthal_gap',
        value: event.azimuthal_gap,
        message: `Very large azimuthal gap: ${event.azimuthal_gap}°. Poor station coverage.`,
        suggestion: 'Location quality is poor. Consider flagging or excluding from analysis.'
      });
    } else if (event.azimuthal_gap > 180) {
      flags.push({
        type: 'info',
        category: 'quality',
        field: 'azimuthal_gap',
        value: event.azimuthal_gap,
        message: `Large azimuthal gap: ${event.azimuthal_gap}°. Station coverage could be better.`,
        suggestion: 'Location uncertainty may be higher than reported.'
      });
    }
  }

  // Very few stations used
  if (event.used_station_count !== null && event.used_station_count !== undefined) {
    if (event.used_station_count < 4) {
      flags.push({
        type: 'warning',
        category: 'quality',
        field: 'used_station_count',
        value: event.used_station_count,
        message: `Only ${event.used_station_count} stations used. Minimum 4 recommended for reliable location.`,
        suggestion: 'Location quality is poor. Consider flagging as unreliable.'
      });
    } else if (event.used_station_count < 6) {
      flags.push({
        type: 'info',
        category: 'quality',
        field: 'used_station_count',
        value: event.used_station_count,
        message: `Only ${event.used_station_count} stations used. 6+ recommended for good quality.`,
        suggestion: 'Location quality may be marginal.'
      });
    }
  }

  // Very few phases used
  if (event.used_phase_count !== null && event.used_phase_count !== undefined) {
    if (event.used_phase_count < 8) {
      flags.push({
        type: 'info',
        category: 'quality',
        field: 'used_phase_count',
        value: event.used_phase_count,
        message: `Only ${event.used_phase_count} phases used. More phases improve location quality.`,
        suggestion: 'Consider this when assessing location reliability.'
      });
    }
  }

  // Large standard error
  if (event.standard_error !== null && event.standard_error !== undefined) {
    if (event.standard_error > 2.0) {
      flags.push({
        type: 'warning',
        category: 'quality',
        field: 'standard_error',
        value: event.standard_error,
        message: `Large RMS residual: ${event.standard_error}s. Poor fit to data.`,
        suggestion: 'Location quality is questionable. May indicate timing errors or poor velocity model.'
      });
    } else if (event.standard_error > 1.0) {
      flags.push({
        type: 'info',
        category: 'quality',
        field: 'standard_error',
        value: event.standard_error,
        message: `Moderate RMS residual: ${event.standard_error}s.`,
        suggestion: 'Location quality is acceptable but not optimal.'
      });
    }
  }

  // === TEMPORAL ANOMALIES ===
  
  if (event.time) {
    const eventDate = new Date(event.time);
    const now = new Date();
    const minDate = new Date('1900-01-01');

    // Future event
    if (eventDate > now) {
      flags.push({
        type: 'error',
        category: 'temporal',
        field: 'time',
        message: `Event time is in the future: ${event.time}`,
        suggestion: 'Check time zone and ensure UTC is used.'
      });
    }

    // Very old event (before 1900)
    if (eventDate < minDate) {
      flags.push({
        type: 'warning',
        category: 'temporal',
        field: 'time',
        message: `Event time is before 1900: ${event.time}`,
        suggestion: 'Historical events before 1900 should be carefully verified.'
      });
    }
  }

  // === DETERMINE OVERALL SEVERITY ===
  
  const errorCount = flags.filter(f => f.type === 'error').length;
  const warningCount = flags.filter(f => f.type === 'warning').length;

  let severity: AnomalyDetectionResult['severity'] = 'none';
  if (errorCount > 0) {
    severity = 'critical';
  } else if (warningCount >= 3) {
    severity = 'high';
  } else if (warningCount >= 2) {
    severity = 'medium';
  } else if (warningCount >= 1 || flags.length > 0) {
    severity = 'low';
  }

  return {
    hasAnomalies: flags.length > 0,
    flags,
    severity
  };
}

/**
 * Batch detect anomalies in multiple events
 */
export function detectBatchAnomalies(events: any[]): {
  totalEvents: number;
  eventsWithAnomalies: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  results: Map<string, AnomalyDetectionResult>;
} {
  const results = new Map<string, AnomalyDetectionResult>();
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const event of events) {
    const result = detectAnomalies(event);
    if (result.hasAnomalies) {
      results.set(event.id || event.event_public_id || String(events.indexOf(event)), result);
      
      switch (result.severity) {
        case 'critical': criticalCount++; break;
        case 'high': highCount++; break;
        case 'medium': mediumCount++; break;
        case 'low': lowCount++; break;
      }
    }
  }

  return {
    totalEvents: events.length,
    eventsWithAnomalies: results.size,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    results
  };
}

