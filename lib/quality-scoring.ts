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

export interface QualityScore {
  overall: number; // 0-100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
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
 * Calculate comprehensive quality score for an earthquake event
 */
export function calculateQualityScore(metrics: QualityMetrics): QualityScore {
  const components = {
    location: calculateLocationScore(metrics),
    network: calculateNetworkScore(metrics),
    solution: calculateSolutionScore(metrics),
    magnitude: calculateMagnitudeScore(metrics),
    evaluation: calculateEvaluationScore(metrics),
  };
  
  // Calculate weighted overall score
  const totalWeight = Object.values(components).reduce((sum, c) => sum + c.weight, 0);
  const overall = Object.values(components).reduce(
    (sum, c) => sum + (c.score * c.weight),
    0
  ) / totalWeight;
  
  // Determine grade
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  if (overall >= 95) grade = 'A+';
  else if (overall >= 90) grade = 'A';
  else if (overall >= 80) grade = 'B';
  else if (overall >= 70) grade = 'C';
  else if (overall >= 60) grade = 'D';
  else grade = 'F';
  
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
    // Excellent: < 1km (0.009°), Poor: > 10km (0.09°)
    score -= Math.min(40, horizUncertainty * 444);
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
  if (grade === 'B') return 'secondary';
  if (grade === 'C' || grade === 'D') return 'outline';
  return 'destructive';
}

