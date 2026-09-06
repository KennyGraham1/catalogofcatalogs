/**
 * Data Quality Checker
 * Comprehensive data quality assessment for earthquake catalogues
 */

import {
  assessDataQuality,
  detectAnomalies,
  validateGeographicBounds,
  horizontalUncertaintyKm,
  type DataQualityReport,
  type DataQualityCheck,
} from './validation';
import { calculateQualityScore, metricsFromEvent } from './quality-scoring';

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  report: DataQualityReport;
  anomalies: DataQualityCheck[];
  geographicChecks: DataQualityCheck[];
  recommendations: string[];
  /**
   * Mean event-level quality index Q (0-100, paper Eq. 1) over the catalogue — the fourth
   * term of `score`. Optional only so that callers which build a QualityCheckResult by hand
   * (tests, fixtures) keep type-checking; performQualityCheck always sets it.
   */
  eventQuality?: number;
}

/**
 * Mean event-level quality index Q over the catalogue (0-100).
 */
function meanEventQuality(events: any[]): number {
  if (!Array.isArray(events) || events.length === 0) return 0;
  let total = 0;
  for (const event of events) {
    total += calculateQualityScore(metricsFromEvent(event)).overall;
  }
  return total / events.length;
}

/**
 * Data-integrity score (0-100): the mean of the three terms that describe the catalogue's own
 * records rather than the richness of its optional solution metadata.
 */
function dataIntegrityScore(report: DataQualityReport): number {
  return (report.completeness + report.consistency + report.accuracy) / 3;
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
  
  // Mean event-level quality index (see meanEventQuality above)
  const eventQuality = meanEventQuality(events);

  // Calculate the headline score. The four terms are equally weighted percentages: field
  // completeness, internal consistency, reported-uncertainty accuracy, and the mean
  // event-level quality index Q. This number DESCRIBES the catalogue (and is what the grade
  // badge and the 0-100 progress bar show); it does not decide admissibility.
  const score = (report.completeness + report.consistency + report.accuracy + eventQuality) / 4;

  // Determine if the quality check passed. `passed` answers "is this catalogue admissible for
  // import?", which is judged on data integrity plus the absence of hard errors — NOT on the
  // headline score, because the score's Q term is dominated by optional instrument metadata a
  // plain CSV catalogue can never supply. See dataIntegrityScore() for the full rationale.
  const passed =
    dataIntegrityScore(report) >= 60 && !report.checks.some(c => c.severity === 'error');
  
  // Generate recommendations
  const recommendations = generateRecommendations(report, anomalies, geographicChecks, eventQuality);
  
  return {
    passed,
    score: Math.round(score),
    report,
    anomalies,
    geographicChecks,
    recommendations,
    eventQuality: Math.round(eventQuality)
  };
}

/**
 * Generate actionable recommendations based on quality checks
 */
function generateRecommendations(
  report: DataQualityReport,
  anomalies: DataQualityCheck[],
  geographicChecks: DataQualityCheck[],
  eventQuality: number
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
  
  // Event-level quality recommendations. Grade band C (< 65) on the Table 2 thresholds.
  if (eventQuality < 65) {
    recommendations.push(
      `Mean event quality index is ${Math.round(eventQuality)}/100 - solutions are weakly constrained ` +
      `or their solution metadata (uncertainties, azimuthal gap, station/phase counts, RMS) is absent`
    );
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
  // 2. No critical errors (report, anomaly or geographic)
  // 3. At least 60% data-integrity score
  const hasNoErrors = !result.report.checks.some(c => c.severity === 'error') &&
                      !result.anomalies.some(a => a.severity === 'error') &&
                      !result.geographicChecks.some(c => c.severity === 'error');

  return result.report.completeness >= 50 && hasNoErrors && dataIntegrityScore(result.report) >= 60;
}

/**
 * Get quality grade based on score
 */
export function getQualityGrade(score: number): {
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
  label: string;
  color: string;
} {
  // Table 2 thresholds (see lib/quality-scoring.ts scoreToGrade)
  if (score >= 95) {
    return { grade: 'A+', label: 'Excellent', color: 'green' };
  } else if (score >= 85) {
    return { grade: 'A', label: 'Excellent', color: 'green' };
  } else if (score >= 75) {
    return { grade: 'B+', label: 'Good', color: 'blue' };
  } else if (score >= 65) {
    return { grade: 'B', label: 'Good', color: 'blue' };
  } else if (score >= 45) {
    return { grade: 'C', label: 'Fair', color: 'yellow' };
  } else if (score >= 35) {
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
  /** Horizontal location uncertainty threshold, KM (project-canonical unit) */
  maxHorizontalUncertainty?: number;
  /** Depth uncertainty threshold, KM */
  maxDepthUncertainty?: number;
  minStationCount?: number;
  /** Azimuthal gap threshold, DEGREES */
  maxAzimuthalGap?: number;
}): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];
  // All length thresholds are in km, matching the DB convention (lib/db.ts:104-105) and
  // every other horizontal-uncertainty threshold in the codebase
  // (lib/geonet-quality-score.ts, lib/validation.ts). maxHorizontalUncertainty used to be
  // in DEGREES (0.1) while maxDepthUncertainty in the same object was in km, so a caller
  // passing its own threshold in km silently disabled the check by a factor of ~111.
  const defaults = {
    maxHorizontalUncertainty: 10, // km
    maxDepthUncertainty: 10, // km
    minStationCount: 6,
    maxAzimuthalGap: 180, // degrees
    ...thresholds
  };
  
  // Check horizontal uncertainty, resolved in km by horizontalUncertaintyKm() in
  // lib/validation.ts — the same helper assessDataQuality()'s accuracy dimension uses, so the
  // two sites cannot disagree about which columns count. Reading only the degree columns made
  // this warning unreachable for QuakeML imports, which carry the km column instead.
  const horizUncertKm = horizontalUncertaintyKm(event);
  
  if (horizUncertKm !== null && horizUncertKm > defaults.maxHorizontalUncertainty) {
    checks.push({
      passed: false,
      severity: 'warning',
      message: `Horizontal uncertainty (${horizUncertKm.toFixed(1)}km) exceeds threshold`,
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
  
  // Check station count (!= null, not truthiness: a reported count of 0 must still warn)
  if (event.used_station_count != null && event.used_station_count < defaults.minStationCount) {
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

