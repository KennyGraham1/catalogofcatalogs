/**
 * Integrated Quality Assessment System
 */

import { calculateQualityScore, metricsFromEvent, type QualityMetrics, type QualityScore } from './quality-scoring';
import { calculateGeoNetQS, formatQS, type GeoNetQSCriteria, type GeoNetQSResult } from './geonet-quality-score';

export interface IntegratedQualityAssessment {
  // Detailed 0-100 scoring system
  detailedScore: QualityScore;
  
  // In-house QS0-QS6 location-quality heuristic (NOT the published GeoNet QS; see header).
  // Field name retained for API compatibility.
  geonetQS: GeoNetQSResult;
  
  // Combined summary
  summary: {
    overallQuality: 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor' | 'Very Poor' | 'Unconstrained';
    primaryScore: number; // 0-100
    // 0-6 from the in-house location-quality heuristic (not a standard; see header).
    // Field name retained for API compatibility.
    standardizedScore: number;
    recommendation: string;
    useCaseGuidance: {
      scientificResearch: boolean;
      hazardAssessment: boolean;
      publicInformation: boolean;
      realTimeMonitoring: boolean;
    };
  };
}

/**
 * Perform integrated quality assessment using both scoring systems
 */
export function assessEventQuality(event: any): IntegratedQualityAssessment {
  // Extract metrics for detailed scoring. metricsFromEvent() is the single adapter from a
  // snake_case DB row to QualityMetrics: it resolves horizontal uncertainty from the
  // horizontal_uncertainty km column first (the column the QuakeML/GeoNet import path
  // populates, lib/quakeml-to-db.ts) and only falls back to the lat/lon degree pair. The
  // local resolver this replaced knew only the degree pair, so a SeisComP-style origin that
  // carries <horizontalUncertainty> but no per-coordinate uncertainties was scored as
  // "no horizontal data" — 1.2 km of uncertainty reported as QS0 "Unconstrained".
  const detailedMetrics: QualityMetrics = metricsFromEvent(event);

  // Criteria for the in-house QS0-QS6 location heuristic, taken from the same resolved
  // metrics so the two scorers can never disagree about the same event.
  const geonetCriteria: GeoNetQSCriteria = {
    azimuthalGap: detailedMetrics.azimuthalGap ?? null,      // degrees
    usedStationCount: detailedMetrics.usedStationCount ?? null,
    rmsResidual: detailedMetrics.standardError ?? null,      // seconds
    horizontalUncertainty: detailedMetrics.horizontalUncertainty ?? null, // km
    depthUncertainty: detailedMetrics.depthUncertainty ?? null,           // km (DB convention)
    // minimum_distance is stored in degrees (QuakeML/FDSN OriginQuality.minimumDistance);
    // the QS scorer expects km, so convert here (~111.19 km per degree).
    minimumDistance: typeof event?.minimum_distance === 'number' && Number.isFinite(event.minimum_distance)
      ? event.minimum_distance * 111.19
      : null,
  };

  // Calculate both scores
  const detailedScore = calculateQualityScore(detailedMetrics);
  const geonetQS = calculateGeoNetQS(geonetCriteria);

  // Generate combined summary
  const summary = generateCombinedSummary(detailedScore, geonetQS);

  return {
    detailedScore,
    geonetQS,
    summary,
  };
}

/**
 * Generate combined summary from both scoring systems
 */
function generateCombinedSummary(
  detailedScore: QualityScore,
  geonetQS: GeoNetQSResult
): IntegratedQualityAssessment['summary'] {
  // Determine overall quality based on both systems
  let overallQuality: IntegratedQualityAssessment['summary']['overallQuality'];
  
  if (geonetQS.qualityScore >= 6 && detailedScore.overall >= 90) {
    overallQuality = 'Excellent';
  } else if (geonetQS.qualityScore >= 5 && detailedScore.overall >= 80) {
    overallQuality = 'Very Good';
  } else if (geonetQS.qualityScore >= 4 && detailedScore.overall >= 70) {
    overallQuality = 'Good';
  } else if (geonetQS.qualityScore >= 3 && detailedScore.overall >= 60) {
    overallQuality = 'Fair';
  } else if (geonetQS.qualityScore >= 2 || detailedScore.overall >= 50) {
    overallQuality = 'Poor';
  } else if (geonetQS.qualityScore >= 1 || detailedScore.overall >= 40) {
    overallQuality = 'Very Poor';
  } else {
    overallQuality = 'Unconstrained';
  }

  // Generate recommendation
  const recommendation = generateRecommendation(overallQuality, detailedScore, geonetQS);

  // Determine use case suitability
  const useCaseGuidance = {
    scientificResearch: geonetQS.qualityScore >= 4 && detailedScore.overall >= 70,
    hazardAssessment: geonetQS.qualityScore >= 3 && detailedScore.overall >= 60,
    publicInformation: geonetQS.qualityScore >= 2 && detailedScore.overall >= 50,
    realTimeMonitoring: geonetQS.qualityScore >= 1 && detailedScore.overall >= 40,
  };

  return {
    overallQuality,
    primaryScore: detailedScore.overall,
    standardizedScore: geonetQS.qualityScore,
    recommendation,
    useCaseGuidance,
  };
}

/**
 * Generate recommendation based on quality assessment
 */
function generateRecommendation(
  quality: string,
  detailedScore: QualityScore,
  geonetQS: GeoNetQSResult
): string {
  if (quality === 'Excellent' || quality === 'Very Good') {
    return 'High-quality location suitable for all applications including scientific research and hazard assessment.';
  } else if (quality === 'Good') {
    return 'Good quality location suitable for most applications. Review detailed metrics for specific use cases.';
  } else if (quality === 'Fair') {
    return `Moderate quality location. Limiting factor: ${geonetQS.limitingFactor}. Use with caution for critical applications.`;
  } else if (quality === 'Poor') {
    return `Poor quality location. Primary issues: ${geonetQS.limitingFactor}. Not recommended for critical applications.`;
  } else if (quality === 'Very Poor') {
    return 'Very poor quality location. Significant constraints missing. Use only for preliminary analysis.';
  } else {
    return 'Unconstrained location with insufficient quality data. Not suitable for reliable analysis.';
  }
}

/**
 * Format integrated assessment for display
 */
export function formatIntegratedAssessment(assessment: IntegratedQualityAssessment): string {
  const lines = [
    `Overall Quality: ${assessment.summary.overallQuality}`,
    `Detailed Score: ${assessment.detailedScore.overall}/100 (${assessment.detailedScore.grade})`,
    // Deliberately not labelled "GeoNet QS": this is the in-house heuristic (see header).
    `Location quality heuristic (in-house, not the GeoNet QS): ${formatQS(assessment.geonetQS.qualityScore)} - ${assessment.geonetQS.label}`,
    ``,
    `Recommendation: ${assessment.summary.recommendation}`,
    ``,
    `Suitable for:`,
    `  Scientific Research: ${assessment.summary.useCaseGuidance.scientificResearch ? '✓' : '✗'}`,
    `  Hazard Assessment: ${assessment.summary.useCaseGuidance.hazardAssessment ? '✓' : '✗'}`,
    `  Public Information: ${assessment.summary.useCaseGuidance.publicInformation ? '✓' : '✗'}`,
    `  Real-time Monitoring: ${assessment.summary.useCaseGuidance.realTimeMonitoring ? '✓' : '✗'}`,
  ];

  return lines.join('\n');
}

// Re-export for convenience
export { calculateQualityScore, calculateGeoNetQS };
export type { QualityMetrics, QualityScore, GeoNetQSCriteria, GeoNetQSResult };

