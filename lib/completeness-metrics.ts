/**
 * Data Completeness Metrics for Earthquake Catalogues
 * Calculate and analyze data completeness across various fields
 */

export interface FieldCompleteness {
  fieldName: string;
  category: 'basic' | 'uncertainty' | 'quality' | 'metadata' | 'complex';
  totalEvents: number;
  presentCount: number;
  missingCount: number;
  completenessPercent: number;
  isRequired: boolean;
}

export interface CompletenessMetrics {
  totalEvents: number;
  overallCompleteness: number;
  
  // Category-wise completeness
  basicFieldsCompleteness: number;
  uncertaintyFieldsCompleteness: number;
  qualityFieldsCompleteness: number;
  metadataFieldsCompleteness: number;
  complexFieldsCompleteness: number;
  
  // Field-by-field breakdown
  fields: FieldCompleteness[];
  
  // Summary statistics
  fullyCompleteEvents: number; // Events with all required + optional fields
  minimallyCompleteEvents: number; // Events with only required fields
  incompleteEvents: number; // Events missing required fields
  
  // Quality indicators
  hasUncertainties: number; // Events with at least one uncertainty field
  hasQualityMetrics: number; // Events with at least one quality metric
  hasFocalMechanisms: number; // Events with focal mechanism data
  hasPicks: number; // Events with pick data
  hasArrivals: number; // Events with arrival data
}

/**
 * Calculate completeness metrics for a catalogue
 */
export function calculateCompletenessMetrics(events: any[]): CompletenessMetrics {
  if (events.length === 0) {
    return createEmptyMetrics();
  }

  const fields: FieldCompleteness[] = [];
  
  // Define field categories
  const basicFields = [
    { name: 'time', required: true },
    { name: 'latitude', required: true },
    { name: 'longitude', required: true },
    { name: 'depth', required: false },
    { name: 'magnitude', required: true },
    { name: 'magnitude_type', required: false },
  ];

  const uncertaintyFields = [
    { name: 'time_uncertainty', required: false },
    { name: 'latitude_uncertainty', required: false },
    { name: 'longitude_uncertainty', required: false },
    { name: 'depth_uncertainty', required: false },
    { name: 'magnitude_uncertainty', required: false },
  ];

  const qualityFields = [
    { name: 'azimuthal_gap', required: false },
    { name: 'used_phase_count', required: false },
    { name: 'used_station_count', required: false },
    { name: 'magnitude_station_count', required: false },
    { name: 'standard_error', required: false },
  ];

  const metadataFields = [
    { name: 'event_public_id', required: false },
    { name: 'source_id', required: false },
    { name: 'event_type', required: false },
    { name: 'event_type_certainty', required: false },
    { name: 'evaluation_mode', required: false },
    { name: 'evaluation_status', required: false },
  ];

  const complexFields = [
    { name: 'origin_quality', required: false },
    { name: 'origins', required: false },
    { name: 'magnitudes', required: false },
    { name: 'picks', required: false },
    { name: 'arrivals', required: false },
    { name: 'focal_mechanisms', required: false },
    { name: 'amplitudes', required: false },
    { name: 'station_magnitudes', required: false },
    { name: 'event_descriptions', required: false },
    { name: 'comments', required: false },
    { name: 'creation_info', required: false },
  ];

  // Calculate completeness for each field
  const calculateFieldCompleteness = (
    fieldName: string,
    category: FieldCompleteness['category'],
    isRequired: boolean
  ): FieldCompleteness => {
    let presentCount = 0;
    
    for (const event of events) {
      const value = event[fieldName];
      // Consider field present if it's not null, undefined, or empty string
      if (value !== null && value !== undefined && value !== '') {
        presentCount++;
      }
    }

    const missingCount = events.length - presentCount;
    const completenessPercent = (presentCount / events.length) * 100;

    return {
      fieldName,
      category,
      totalEvents: events.length,
      presentCount,
      missingCount,
      completenessPercent,
      isRequired,
    };
  };

  // Process all field categories
  for (const field of basicFields) {
    fields.push(calculateFieldCompleteness(field.name, 'basic', field.required));
  }
  for (const field of uncertaintyFields) {
    fields.push(calculateFieldCompleteness(field.name, 'uncertainty', field.required));
  }
  for (const field of qualityFields) {
    fields.push(calculateFieldCompleteness(field.name, 'quality', field.required));
  }
  for (const field of metadataFields) {
    fields.push(calculateFieldCompleteness(field.name, 'metadata', field.required));
  }
  for (const field of complexFields) {
    fields.push(calculateFieldCompleteness(field.name, 'complex', field.required));
  }

  // Calculate category-wise completeness
  const getCategoryCompleteness = (category: FieldCompleteness['category']): number => {
    const categoryFields = fields.filter(f => f.category === category);
    if (categoryFields.length === 0) return 0;
    const avgCompleteness = categoryFields.reduce((sum, f) => sum + f.completenessPercent, 0) / categoryFields.length;
    return avgCompleteness;
  };

  const basicFieldsCompleteness = getCategoryCompleteness('basic');
  const uncertaintyFieldsCompleteness = getCategoryCompleteness('uncertainty');
  const qualityFieldsCompleteness = getCategoryCompleteness('quality');
  const metadataFieldsCompleteness = getCategoryCompleteness('metadata');
  const complexFieldsCompleteness = getCategoryCompleteness('complex');

  // Calculate overall completeness (weighted by category importance)
  const overallCompleteness = (
    basicFieldsCompleteness * 0.4 +
    uncertaintyFieldsCompleteness * 0.15 +
    qualityFieldsCompleteness * 0.15 +
    metadataFieldsCompleteness * 0.15 +
    complexFieldsCompleteness * 0.15
  );

  // Count events by completeness level
  let fullyCompleteEvents = 0;
  let minimallyCompleteEvents = 0;
  let incompleteEvents = 0;
  let hasUncertainties = 0;
  let hasQualityMetrics = 0;
  let hasFocalMechanisms = 0;
  let hasPicks = 0;
  let hasArrivals = 0;

  for (const event of events) {
    // Check required fields
    const hasAllRequired = basicFields
      .filter(f => f.required)
      .every(f => event[f.name] !== null && event[f.name] !== undefined && event[f.name] !== '');

    if (!hasAllRequired) {
      incompleteEvents++;
      continue;
    }

    // Check if event has all fields (required + optional)
    const allFieldsPresent = fields.every(f => {
      const value = event[f.fieldName];
      return value !== null && value !== undefined && value !== '';
    });

    if (allFieldsPresent) {
      fullyCompleteEvents++;
    } else {
      minimallyCompleteEvents++;
    }

    // Check for specific data types
    if (uncertaintyFields.some(f => event[f.name] !== null && event[f.name] !== undefined)) {
      hasUncertainties++;
    }

    if (qualityFields.some(f => event[f.name] !== null && event[f.name] !== undefined)) {
      hasQualityMetrics++;
    }

    if (event.focal_mechanisms && event.focal_mechanisms !== null && event.focal_mechanisms !== '') {
      hasFocalMechanisms++;
    }

    if (event.picks && event.picks !== null && event.picks !== '') {
      hasPicks++;
    }

    if (event.arrivals && event.arrivals !== null && event.arrivals !== '') {
      hasArrivals++;
    }
  }

  return {
    totalEvents: events.length,
    overallCompleteness,
    basicFieldsCompleteness,
    uncertaintyFieldsCompleteness,
    qualityFieldsCompleteness,
    metadataFieldsCompleteness,
    complexFieldsCompleteness,
    fields,
    fullyCompleteEvents,
    minimallyCompleteEvents,
    incompleteEvents,
    hasUncertainties,
    hasQualityMetrics,
    hasFocalMechanisms,
    hasPicks,
    hasArrivals,
  };
}

/**
 * Create empty metrics object
 */
function createEmptyMetrics(): CompletenessMetrics {
  return {
    totalEvents: 0,
    overallCompleteness: 0,
    basicFieldsCompleteness: 0,
    uncertaintyFieldsCompleteness: 0,
    qualityFieldsCompleteness: 0,
    metadataFieldsCompleteness: 0,
    complexFieldsCompleteness: 0,
    fields: [],
    fullyCompleteEvents: 0,
    minimallyCompleteEvents: 0,
    incompleteEvents: 0,
    hasUncertainties: 0,
    hasQualityMetrics: 0,
    hasFocalMechanisms: 0,
    hasPicks: 0,
    hasArrivals: 0,
  };
}

/**
 * Get completeness grade based on percentage
 */
export function getCompletenessGrade(completenessPercent: number): {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  color: string;
} {
  if (completenessPercent >= 90) {
    return { grade: 'A', label: 'Excellent', color: 'green' };
  } else if (completenessPercent >= 75) {
    return { grade: 'B', label: 'Good', color: 'blue' };
  } else if (completenessPercent >= 60) {
    return { grade: 'C', label: 'Fair', color: 'yellow' };
  } else if (completenessPercent >= 40) {
    return { grade: 'D', label: 'Poor', color: 'orange' };
  } else {
    return { grade: 'F', label: 'Very Poor', color: 'red' };
  }
}

/**
 * Generate completeness report summary
 */
export function generateCompletenessSummary(metrics: CompletenessMetrics): string {
  const grade = getCompletenessGrade(metrics.overallCompleteness);
  
  const lines: string[] = [];
  lines.push(`Data Completeness Report`);
  lines.push(`========================`);
  lines.push(``);
  lines.push(`Total Events: ${metrics.totalEvents}`);
  lines.push(`Overall Completeness: ${metrics.overallCompleteness.toFixed(1)}% (Grade: ${grade.grade} - ${grade.label})`);
  lines.push(``);
  lines.push(`Category Breakdown:`);
  lines.push(`  Basic Fields: ${metrics.basicFieldsCompleteness.toFixed(1)}%`);
  lines.push(`  Uncertainty Fields: ${metrics.uncertaintyFieldsCompleteness.toFixed(1)}%`);
  lines.push(`  Quality Metrics: ${metrics.qualityFieldsCompleteness.toFixed(1)}%`);
  lines.push(`  Metadata Fields: ${metrics.metadataFieldsCompleteness.toFixed(1)}%`);
  lines.push(`  Complex Fields: ${metrics.complexFieldsCompleteness.toFixed(1)}%`);
  lines.push(``);
  lines.push(`Event Quality:`);
  lines.push(`  Fully Complete: ${metrics.fullyCompleteEvents} (${((metrics.fullyCompleteEvents / metrics.totalEvents) * 100).toFixed(1)}%)`);
  lines.push(`  Minimally Complete: ${metrics.minimallyCompleteEvents} (${((metrics.minimallyCompleteEvents / metrics.totalEvents) * 100).toFixed(1)}%)`);
  lines.push(`  Incomplete: ${metrics.incompleteEvents} (${((metrics.incompleteEvents / metrics.totalEvents) * 100).toFixed(1)}%)`);
  lines.push(``);
  lines.push(`Data Richness:`);
  lines.push(`  With Uncertainties: ${metrics.hasUncertainties} (${((metrics.hasUncertainties / metrics.totalEvents) * 100).toFixed(1)}%)`);
  lines.push(`  With Quality Metrics: ${metrics.hasQualityMetrics} (${((metrics.hasQualityMetrics / metrics.totalEvents) * 100).toFixed(1)}%)`);
  lines.push(`  With Focal Mechanisms: ${metrics.hasFocalMechanisms} (${((metrics.hasFocalMechanisms / metrics.totalEvents) * 100).toFixed(1)}%)`);
  lines.push(`  With Picks: ${metrics.hasPicks} (${((metrics.hasPicks / metrics.totalEvents) * 100).toFixed(1)}%)`);
  lines.push(`  With Arrivals: ${metrics.hasArrivals} (${((metrics.hasArrivals / metrics.totalEvents) * 100).toFixed(1)}%)`);
  
  return lines.join('\n');
}

