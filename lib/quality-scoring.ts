/**
 * Quality scoring system for earthquake events
 * Calculates comprehensive quality metrics based on QuakeML data
 */

export interface QualityMetrics {
  // Location quality
  horizontalUncertainty?: number | null;
  depthUncertainty?: number | null;
  timeUncertainty?: number | null;
  
  // Network geometry
  azimuthalGap?: number | null;
  usedStationCount?: number | null;
  usedPhaseCount?: number | null;
  
  // Solution quality
  standardError?: number | null;
  
  // Magnitude quality
  magnitudeUncertainty?: number | null;
  magnitudeStationCount?: number | null;
  
  // Evaluation
  evaluationMode?: string | null;
  evaluationStatus?: string | null;
}

/**
 * Build QualityMetrics (camelCase) from a raw snake_case DB event row.
 *
 * Callers must NOT do `calculateQualityScore(event as QualityMetrics)` on a raw DB
 * event: the DB uses snake_case (horizontal_uncertainty, azimuthal_gap, ...), so the
 * camelCase metric lookups would all read undefined and the score would always take
 * the "no data" penalty branch. Use this adapter instead. Horizontal uncertainty is
 * resolved from the km column when present, else derived from the lat/lon degree
 * uncertainties (km). All length values are km, angles degrees, time seconds.
 */
export function metricsFromEvent(event: unknown): QualityMetrics {
  if (!event || typeof event !== 'object') return {};
  const ev = event as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const latUnc = num(ev.latitude_uncertainty);
  const lonUnc = num(ev.longitude_uncertainty);
  let horizontalUncertainty = num(ev.horizontal_uncertainty); // km
  if (horizontalUncertainty == null && latUnc != null && lonUnc != null) {
    const lat = num(ev.latitude) ?? 0;
    const latKm = latUnc * 111;
    const lonKm = lonUnc * 111 * Math.cos((lat * Math.PI) / 180);
    horizontalUncertainty = Math.max(latKm, lonKm);
  }
  return {
    horizontalUncertainty,
    depthUncertainty: num(ev.depth_uncertainty),
    timeUncertainty: num(ev.time_uncertainty),
    azimuthalGap: num(ev.azimuthal_gap),
    usedStationCount: num(ev.used_station_count),
    usedPhaseCount: num(ev.used_phase_count),
    standardError: num(ev.standard_error),
    magnitudeUncertainty: num(ev.magnitude_uncertainty),
    magnitudeStationCount: num(ev.magnitude_station_count),
    evaluationMode: (ev.evaluation_mode as string) ?? null,
    evaluationStatus: (ev.evaluation_status as string) ?? null,
  };
}

export type QualityGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export interface QualityScore {
  overall: number; // 0-100
  grade: QualityGrade;
  components: {
    location: { score: number; weight: number };
    network: { score: number; weight: number };
    solution: { score: number; weight: number };
    magnitude: { score: number; weight: number };
    evaluation: { score: number; weight: number };
  };
  details: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

/**
 * Configurable dimension weights for the quality score. Defaults match the
 * values documented in the paper (Eq. 1): location 0.35, network 0.25,
 * solution 0.15, magnitude 0.15, evaluation 0.10.
 */
export interface QualityWeights {
  location?: number;
  network?: number;
  solution?: number;
  magnitude?: number;
  evaluation?: number;
}

export const DEFAULT_QUALITY_WEIGHTS: Required<QualityWeights> = {
  location: 0.35,
  network: 0.25,
  solution: 0.15,
  magnitude: 0.15,
  evaluation: 0.10,
};

/**
 * Map a 0-100 score to a letter grade (Table 2 thresholds).
 */
export function scoreToGrade(overall: number): QualityGrade {
  if (overall >= 95) return 'A+';
  if (overall >= 85) return 'A';
  if (overall >= 75) return 'B+';
  if (overall >= 65) return 'B';
  if (overall >= 45) return 'C';
  if (overall >= 35) return 'D';
  return 'F';
}

/**
 * Calculate comprehensive quality score for an earthquake event.
 * Dimension weights may be overridden (e.g. by a community with different
 * priorities); omitted weights fall back to DEFAULT_QUALITY_WEIGHTS.
 */
export function calculateQualityScore(
  metrics: QualityMetrics,
  weights: QualityWeights = {}
): QualityScore {
  const w = { ...DEFAULT_QUALITY_WEIGHTS, ...weights };
  const components = {
    location: { ...calculateLocationScore(metrics), weight: w.location },
    network: { ...calculateNetworkScore(metrics), weight: w.network },
    solution: { ...calculateSolutionScore(metrics), weight: w.solution },
    magnitude: { ...calculateMagnitudeScore(metrics), weight: w.magnitude },
    evaluation: { ...calculateEvaluationScore(metrics), weight: w.evaluation },
  };

  // Calculate weighted overall score
  const totalWeight = Object.values(components).reduce((sum, c) => sum + c.weight, 0);
  const overall = Object.values(components).reduce(
    (sum, c) => sum + (c.score * c.weight),
    0
  ) / totalWeight;

  // Determine grade (Table 2 thresholds)
  const grade = scoreToGrade(overall);
  
  // Generate details
  const details = generateQualityDetails(metrics, components, overall);
  
  return {
    overall: Math.round(overall),
    grade,
    components,
    details,
  };
}

/**
 * Calculate location quality score (0-100)
 */
function calculateLocationScore(metrics: QualityMetrics): { score: number; weight: number } {
  let score = 100;
  const weight = 0.35; // 35% of total score
  
  // Horizontal uncertainty (max -40 points)
  const horizUncertainty = Math.max(
    metrics.horizontalUncertainty || 0,
    0
  );
  if (horizUncertainty > 0) {
    // Input is in km (QualityMetrics.horizontalUncertainty). Excellent: < 1 km, Poor: >= 10 km.
    // Linear penalty reaching the -40 cap at 10 km (40 / 10 = 4 points per km).
    score -= Math.min(40, horizUncertainty * 4);
  } else {
    score -= 20; // No data penalty
  }
  
  // Depth uncertainty (max -30 points)
  if (metrics.depthUncertainty !== null && metrics.depthUncertainty !== undefined) {
    // Excellent: < 1km, Poor: > 10km
    score -= Math.min(30, metrics.depthUncertainty * 3);
  } else {
    score -= 15; // No data penalty
  }
  
  // Time uncertainty (max -30 points)
  if (metrics.timeUncertainty !== null && metrics.timeUncertainty !== undefined) {
    // Excellent: < 0.1s, Poor: > 1s
    score -= Math.min(30, metrics.timeUncertainty * 30);
  } else {
    score -= 10; // No data penalty
  }
  
  return { score: Math.max(0, score), weight };
}

/**
 * Calculate network geometry score (0-100)
 */
function calculateNetworkScore(metrics: QualityMetrics): { score: number; weight: number } {
  let score = 100;
  const weight = 0.25; // 25% of total score
  
  // Azimuthal gap (max -50 points)
  if (metrics.azimuthalGap !== null && metrics.azimuthalGap !== undefined) {
    // Excellent: < 90°, Good: < 180°, Poor: > 270°
    if (metrics.azimuthalGap < 90) {
      score -= 0; // Excellent
    } else if (metrics.azimuthalGap < 180) {
      score -= (metrics.azimuthalGap - 90) / 2; // 0-45 points
    } else {
      score -= 45 + Math.min(5, (metrics.azimuthalGap - 180) / 18); // 45-50 points
    }
  } else {
    score -= 25; // No data penalty
  }
  
  // Station count (max -30 points)
  if (metrics.usedStationCount !== null && metrics.usedStationCount !== undefined) {
    // Excellent: >= 20, Good: >= 10, Poor: < 5
    if (metrics.usedStationCount >= 20) {
      score -= 0;
    } else if (metrics.usedStationCount >= 10) {
      score -= (20 - metrics.usedStationCount) * 1.5; // 0-15 points
    } else if (metrics.usedStationCount >= 5) {
      score -= 15 + (10 - metrics.usedStationCount) * 2; // 15-25 points
    } else {
      score -= 25 + (5 - metrics.usedStationCount); // 25-30 points
    }
  } else {
    score -= 15; // No data penalty
  }
  
  // Phase count (max -20 points)
  if (metrics.usedPhaseCount !== null && metrics.usedPhaseCount !== undefined) {
    // Excellent: >= 30, Good: >= 15, Poor: < 8
    if (metrics.usedPhaseCount >= 30) {
      score -= 0;
    } else if (metrics.usedPhaseCount >= 15) {
      score -= (30 - metrics.usedPhaseCount) / 2; // 0-7.5 points
    } else if (metrics.usedPhaseCount >= 8) {
      score -= 7.5 + (15 - metrics.usedPhaseCount) * 0.8; // 7.5-13 points
    } else {
      score -= 13 + Math.min(7, 8 - metrics.usedPhaseCount); // 13-20 points
    }
  } else {
    score -= 10; // No data penalty
  }
  
  return { score: Math.max(0, score), weight };
}

/**
 * Calculate solution quality score (0-100)
 */
function calculateSolutionScore(metrics: QualityMetrics): { score: number; weight: number } {
  let score = 100;
  const weight = 0.15; // 15% of total score
  
  // Standard error / RMS (max -100 points)
  if (metrics.standardError !== null && metrics.standardError !== undefined) {
    // Excellent: < 0.3s, Good: < 0.5s, Poor: > 1.0s
    if (metrics.standardError < 0.3) {
      score -= 0;
    } else if (metrics.standardError < 0.5) {
      score -= (metrics.standardError - 0.3) * 100; // 0-20 points
    } else if (metrics.standardError < 1.0) {
      score -= 20 + (metrics.standardError - 0.5) * 60; // 20-50 points
    } else {
      score -= 50 + Math.min(50, (metrics.standardError - 1.0) * 50); // 50-100 points
    }
  } else {
    score -= 30; // No data penalty
  }
  
  return { score: Math.max(0, score), weight };
}

/**
 * Calculate magnitude quality score (0-100)
 */
function calculateMagnitudeScore(metrics: QualityMetrics): { score: number; weight: number } {
  let score = 100;
  const weight = 0.15; // 15% of total score
  
  // Magnitude uncertainty (max -60 points)
  if (metrics.magnitudeUncertainty !== null && metrics.magnitudeUncertainty !== undefined) {
    // Excellent: < 0.1, Good: < 0.2, Poor: > 0.5
    score -= Math.min(60, metrics.magnitudeUncertainty * 120);
  } else {
    score -= 20; // No data penalty
  }
  
  // Magnitude station count (max -40 points)
  if (metrics.magnitudeStationCount !== null && metrics.magnitudeStationCount !== undefined) {
    // Excellent: >= 10, Good: >= 5, Poor: < 3
    if (metrics.magnitudeStationCount >= 10) {
      score -= 0;
    } else if (metrics.magnitudeStationCount >= 5) {
      score -= (10 - metrics.magnitudeStationCount) * 4; // 0-20 points
    } else if (metrics.magnitudeStationCount >= 3) {
      score -= 20 + (5 - metrics.magnitudeStationCount) * 5; // 20-30 points
    } else {
      score -= 30 + (3 - metrics.magnitudeStationCount) * 5; // 30-40 points
    }
  } else {
    score -= 20; // No data penalty
  }
  
  return { score: Math.max(0, score), weight };
}

/**
 * Calculate evaluation quality score (0-100)
 */
function calculateEvaluationScore(metrics: QualityMetrics): { score: number; weight: number } {
  let score = 100;
  const weight = 0.10; // 10% of total score
  
  // Evaluation mode bonus/penalty
  if (metrics.evaluationMode === 'manual') {
    score += 0; // Manual is good
  } else if (metrics.evaluationMode === 'automatic') {
    score -= 20; // Automatic is less reliable
  }
  
  // Evaluation status bonus/penalty
  if (metrics.evaluationStatus === 'reviewed' || metrics.evaluationStatus === 'final') {
    score += 0; // Reviewed/final is best
  } else if (metrics.evaluationStatus === 'confirmed') {
    score -= 10;
  } else if (metrics.evaluationStatus === 'preliminary') {
    score -= 30;
  }
  
  return { score: Math.max(0, Math.min(100, score)), weight };
}

/**
 * Generate detailed quality assessment
 */
function generateQualityDetails(
  metrics: QualityMetrics,
  components: QualityScore['components'],
  overall: number
): QualityScore['details'] {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];
  
  // Location assessment
  if (components.location.score >= 80) {
    strengths.push('Excellent location precision');
  } else if (components.location.score < 60) {
    weaknesses.push('Poor location precision');
    recommendations.push('Consider using additional stations or phases for better location');
  }
  
  // Network assessment
  if (metrics.azimuthalGap && metrics.azimuthalGap < 90) {
    strengths.push('Excellent station coverage (low azimuthal gap)');
  } else if (metrics.azimuthalGap && metrics.azimuthalGap > 270) {
    weaknesses.push('Poor station coverage (high azimuthal gap)');
    recommendations.push('Deploy additional stations to improve azimuthal coverage');
  }
  
  if (metrics.usedStationCount && metrics.usedStationCount >= 20) {
    strengths.push('Large number of recording stations');
  } else if (metrics.usedStationCount && metrics.usedStationCount < 5) {
    weaknesses.push('Few recording stations');
    recommendations.push('Use data from more stations if available');
  }
  
  // Solution assessment
  if (metrics.standardError && metrics.standardError < 0.3) {
    strengths.push('Low RMS residual (good fit)');
  } else if (metrics.standardError && metrics.standardError > 1.0) {
    weaknesses.push('High RMS residual (poor fit)');
    recommendations.push('Review phase picks and velocity model');
  }
  
  // Magnitude assessment
  if (metrics.magnitudeUncertainty && metrics.magnitudeUncertainty < 0.1) {
    strengths.push('Precise magnitude determination');
  } else if (metrics.magnitudeUncertainty && metrics.magnitudeUncertainty > 0.3) {
    weaknesses.push('Large magnitude uncertainty');
  }
  
  // Evaluation assessment
  if (metrics.evaluationStatus === 'reviewed' || metrics.evaluationStatus === 'final') {
    strengths.push('Solution has been reviewed by analyst');
  } else if (metrics.evaluationStatus === 'preliminary') {
    weaknesses.push('Preliminary solution (not yet reviewed)');
    recommendations.push('Wait for reviewed solution for critical applications');
  }
  
  return { strengths, weaknesses, recommendations };
}

/**
 * Get quality color for visualization
 */
export function getQualityColor(score: number): string {
  if (score >= 90) return '#22c55e'; // Green
  if (score >= 80) return '#84cc16'; // Light green
  if (score >= 70) return '#eab308'; // Yellow
  if (score >= 60) return '#f97316'; // Orange
  return '#ef4444'; // Red
}

/**
 * Get quality badge variant
 */
export function getQualityBadgeVariant(grade: QualityScore['grade']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (grade === 'A+' || grade === 'A') return 'default';
  if (grade === 'B+' || grade === 'B') return 'secondary';
  if (grade === 'C' || grade === 'D') return 'outline';
  return 'destructive';
}

