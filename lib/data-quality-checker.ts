/**
 * Data Quality Checker
 * Comprehensive data quality assessment for earthquake catalogues
 */

import { assessDataQuality, detectAnomalies, validateGeographicBounds, type DataQualityReport, type DataQualityCheck } from './validation';

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  report: DataQualityReport;
  anomalies: DataQualityCheck[];
  geographicChecks: DataQualityCheck[];
  recommendations: string[];
}

/**
 * Perform comprehensive quality check on earthquake data
 */
export function performQualityCheck(events: any[]): QualityCheckResult {
  // Assess overall data quality
  const report = assessDataQuality(events);
  
  // Detect anomalies
  const anomalies = detectAnomalies(events);
  
  // Validate geographic bounds if we have spatial data
  let geographicChecks: DataQualityCheck[] = [];
  if (report.statistics.spatialExtent) {
    geographicChecks = validateGeographicBounds(report.statistics.spatialExtent);
  }
  
  // Calculate overall score
  const score = (report.completeness + report.consistency + report.accuracy) / 3;
  
  // Determine if quality check passed
  const passed = score >= 60 && !report.checks.some(c => c.severity === 'error');
  
  // Generate recommendations
  const recommendations = generateRecommendations(report, anomalies, geographicChecks);
  
  return {
    passed,
    score: Math.round(score),
    report,
    anomalies,
    geographicChecks,
    recommendations
  };
}

/**
 * Generate actionable recommendations based on quality checks
 */
function generateRecommendations(
  report: DataQualityReport,
  anomalies: DataQualityCheck[],
  geographicChecks: DataQualityCheck[]
): string[] {
  const recommendations: string[] = [];
  
  // Completeness recommendations
  if (report.completeness < 90) {
    recommendations.push('Improve data completeness by ensuring all required fields are populated');
  }
  
  if (report.statistics.eventsWithUncertainties < report.statistics.totalEvents * 0.5) {
    recommendations.push('Add uncertainty estimates to improve quality assessment capabilities');
  }
  
  if (report.statistics.eventsWithQualityMetrics < report.statistics.totalEvents * 0.5) {
    recommendations.push('Include quality metrics (azimuthal gap, phase counts, station counts) for better event assessment');
  }
  
  // Consistency recommendations
  if (report.consistency < 80) {
    recommendations.push('Review data for consistency issues such as duplicates or suspicious values');
  }
  
  // Accuracy recommendations
  if (report.accuracy < 80) {
    recommendations.push('Improve location accuracy by using more seismic stations or better velocity models');
  }
  
  // Anomaly-based recommendations
  const errorAnomalies = anomalies.filter(a => a.severity === 'error');
  if (errorAnomalies.length > 0) {
    recommendations.push('Critical anomalies detected - review and correct before proceeding');
  }
  
  const warningAnomalies = anomalies.filter(a => a.severity === 'warning');
  if (warningAnomalies.length > 0) {
    recommendations.push(`Review ${warningAnomalies.length} warning(s) to ensure data quality`);
  }
  
  // Geographic recommendations
  const geographicErrors = geographicChecks.filter(c => c.severity === 'error');
  if (geographicErrors.length > 0) {
    recommendations.push('Fix geographic bounds errors before importing data');
  }
  
  // If everything is good
  if (recommendations.length === 0) {
    recommendations.push('Data quality is excellent - ready for import');
  }
  
  return recommendations;
}

/**
 * Check if data meets minimum quality standards for import
 */
export function meetsMinimumQuality(result: QualityCheckResult): boolean {
  // Minimum requirements:
  // 1. At least 50% completeness
  // 2. No critical errors
  // 3. At least 60% overall score
  
  const hasNoErrors = !result.report.checks.some(c => c.severity === 'error') &&
                      !result.anomalies.some(a => a.severity === 'error') &&
                      !result.geographicChecks.some(c => c.severity === 'error');
  
  return result.report.completeness >= 50 && hasNoErrors && result.score >= 60;
}

/**
 * Get quality grade based on score
 */
export function getQualityGrade(score: number): {
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  color: string;
} {
  if (score >= 95) {
    return { grade: 'A+', label: 'Excellent', color: 'green' };
  } else if (score >= 90) {
    return { grade: 'A', label: 'Excellent', color: 'green' };
  } else if (score >= 80) {
    return { grade: 'B', label: 'Good', color: 'blue' };
  } else if (score >= 70) {
    return { grade: 'C', label: 'Fair', color: 'yellow' };
  } else if (score >= 60) {
    return { grade: 'D', label: 'Poor', color: 'orange' };
  } else {
    return { grade: 'F', label: 'Failing', color: 'red' };
  }
}

/**
 * Format quality check results for display
 */
export function formatQualityCheckResults(result: QualityCheckResult): {
  summary: string;
  details: string[];
  warnings: string[];
  errors: string[];
} {
  const grade = getQualityGrade(result.score);
  
  const summary = `Data Quality: ${grade.label} (${grade.grade}) - Score: ${result.score}/100`;
  
  const details = [
    `Completeness: ${result.report.completeness}%`,
    `Consistency: ${result.report.consistency}%`,
    `Accuracy: ${result.report.accuracy}%`,
    `Total Events: ${result.report.statistics.totalEvents}`,
    `Valid Events: ${result.report.statistics.validEvents}`,
    `Events with Uncertainties: ${result.report.statistics.eventsWithUncertainties}`,
    `Events with Quality Metrics: ${result.report.statistics.eventsWithQualityMetrics}`,
  ];
  
  if (result.report.statistics.timeRange) {
    details.push(`Time Range: ${result.report.statistics.timeRange.start} to ${result.report.statistics.timeRange.end}`);
  }
  
  if (result.report.statistics.spatialExtent) {
    const extent = result.report.statistics.spatialExtent;
    details.push(`Spatial Extent: ${extent.minLat.toFixed(2)}°N to ${extent.maxLat.toFixed(2)}°N, ${extent.minLon.toFixed(2)}°E to ${extent.maxLon.toFixed(2)}°E`);
  }
  
  const warnings = [
    ...result.report.checks.filter(c => c.severity === 'warning').map(c => c.message),
    ...result.anomalies.filter(a => a.severity === 'warning').map(a => a.message),
    ...result.geographicChecks.filter(c => c.severity === 'warning').map(c => c.message),
  ];
  
  const errors = [
    ...result.report.checks.filter(c => c.severity === 'error').map(c => c.message),
    ...result.anomalies.filter(a => a.severity === 'error').map(a => a.message),
    ...result.geographicChecks.filter(c => c.severity === 'error').map(c => c.message),
  ];
  
  return { summary, details, warnings, errors };
}

/**
 * Validate event data against quality thresholds
 */
export function validateEventQuality(event: any, thresholds?: {
  maxHorizontalUncertainty?: number;
  maxDepthUncertainty?: number;
  minStationCount?: number;
  maxAzimuthalGap?: number;
}): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];
  const defaults = {
    maxHorizontalUncertainty: 0.1, // ~10km
    maxDepthUncertainty: 10, // 10km
    minStationCount: 6,
    maxAzimuthalGap: 180,
    ...thresholds
  };
  
  // Check horizontal uncertainty
  const horizUncert = Math.max(
    event.latitude_uncertainty || 0,
    event.longitude_uncertainty || 0
  );
  
  if (horizUncert > defaults.maxHorizontalUncertainty) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Horizontal uncertainty (${(horizUncert * 111).toFixed(1)}km) exceeds threshold`,
      field: 'location_uncertainty',
      suggestion: 'Location may be poorly constrained'
    });
  }
  
  // Check depth uncertainty
  if (event.depth_uncertainty && event.depth_uncertainty > defaults.maxDepthUncertainty) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Depth uncertainty (${event.depth_uncertainty.toFixed(1)}km) exceeds threshold`,
      field: 'depth_uncertainty',
      suggestion: 'Depth may be poorly constrained'
    });
  }
  
  // Check station count
  if (event.used_station_count && event.used_station_count < defaults.minStationCount) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Only ${event.used_station_count} stations used (minimum recommended: ${defaults.minStationCount})`,
      field: 'used_station_count',
      suggestion: 'Location quality may be reduced with few stations'
    });
  }
  
  // Check azimuthal gap
  if (event.azimuthal_gap && event.azimuthal_gap > defaults.maxAzimuthalGap) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Azimuthal gap (${event.azimuthal_gap.toFixed(0)}°) exceeds threshold`,
      field: 'azimuthal_gap',
      suggestion: 'Poor station distribution may affect location accuracy'
    });
  }
  
  return checks;
}

/**
 * Calculate data completeness percentage
 */
export function calculateCompleteness(events: any[], requiredFields: string[], optionalFields: string[]): {
  required: number;
  optional: number;
  overall: number;
  missingFields: Record<string, number>;
} {
  if (events.length === 0) {
    return { required: 0, optional: 0, overall: 0, missingFields: {} };
  }
  
  const missingFields: Record<string, number> = {};
  
  // Check required fields
  let requiredCount = 0;
  requiredFields.forEach(field => {
    const presentCount = events.filter(e => e[field] !== null && e[field] !== undefined && e[field] !== '').length;
    requiredCount += presentCount;
    if (presentCount < events.length) {
      missingFields[field] = events.length - presentCount;
    }
  });
  
  const requiredCompleteness = (requiredCount / (events.length * requiredFields.length)) * 100;
  
  // Check optional fields
  let optionalCount = 0;
  optionalFields.forEach(field => {
    const presentCount = events.filter(e => e[field] !== null && e[field] !== undefined && e[field] !== '').length;
    optionalCount += presentCount;
  });
  
  const optionalCompleteness = optionalFields.length > 0
    ? (optionalCount / (events.length * optionalFields.length)) * 100
    : 100;
  
  const overallCompleteness = (requiredCompleteness * 0.7 + optionalCompleteness * 0.3);
  
  return {
    required: Math.round(requiredCompleteness),
    optional: Math.round(optionalCompleteness),
    overall: Math.round(overallCompleteness),
    missingFields
  };
}

