/**
 * Integrated Quality Assessment System
 * 
 * Combines our existing 0-100 quality scoring system with the GeoNet QS (QS0-QS6) system
 * to provide both detailed analysis and standardized quality classification.
 */

import { calculateQualityScore, type QualityMetrics, type QualityScore } from './quality-scoring';
import { calculateGeoNetQS, formatQS, type GeoNetQSCriteria, type GeoNetQSResult } from './geonet-quality-score';

export interface IntegratedQualityAssessment {
  // Detailed 0-100 scoring system
  detailedScore: QualityScore;
  
  // Standardized GeoNet QS system
  geonetQS: GeoNetQSResult;
  
  // Combined summary
  summary: {
    overallQuality: 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor' | 'Very Poor' | 'Unconstrained';
    primaryScore: number; // 0-100
    standardizedScore: number; // 0-6 (QS)
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
  // Extract metrics for detailed scoring
  const detailedMetrics: QualityMetrics = {
    horizontalUncertainty: calculateHorizontalUncertainty(event),
    depthUncertainty: event.depth_uncertainty ?? null,
    timeUncertainty: event.time_uncertainty ?? null,
    azimuthalGap: event.azimuthal_gap ?? null,
    usedStationCount: event.used_station_count ?? null,
    usedPhaseCount: event.used_phase_count ?? null,
    standardError: event.standard_error ?? null,
    magnitudeUncertainty: event.magnitude_uncertainty ?? null,
    magnitudeStationCount: event.magnitude_station_count ?? null,
    evaluationMode: event.evaluation_mode ?? null,
    evaluationStatus: event.evaluation_status ?? null,
  };

  // Extract criteria for GeoNet QS
  const geonetCriteria: GeoNetQSCriteria = {
    azimuthalGap: event.azimuthal_gap ?? null,
    usedStationCount: event.used_station_count ?? null,
    rmsResidual: event.standard_error ?? null,
    horizontalUncertainty: calculateHorizontalUncertainty(event),
    depthUncertainty: event.depth_uncertainty ?? null,
    minimumDistance: event.minimum_distance ?? null,
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
 * Calculate horizontal uncertainty from latitude/longitude uncertainties
 */
function calculateHorizontalUncertainty(event: any): number | null {
  const latUncert = event.latitude_uncertainty;
  const lonUncert = event.longitude_uncertainty;

  if (latUncert === null || latUncert === undefined || lonUncert === null || lonUncert === undefined) {
    return null;
  }

  // Convert degrees to km (approximate at mid-latitudes)
  const latKm = latUncert * 111; // 1 degree latitude ≈ 111 km
  const lonKm = lonUncert * 111 * Math.cos((event.latitude || 0) * Math.PI / 180);

  // Return maximum of the two (conservative estimate)
  return Math.max(latKm, lonKm);
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
    `GeoNet QS: ${formatQS(assessment.geonetQS.qualityScore)} - ${assessment.geonetQS.label}`,
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

