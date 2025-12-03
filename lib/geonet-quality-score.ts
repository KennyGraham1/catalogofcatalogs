/**
 * GeoNet Quality Score (QS) System
 * 
 * Implements the Quality Score system from:
 * "A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand"
 * DOI: 10.1080/00288306.2024.2421309
 * 
 * Quality Score ranges from QS0 (unconstrained) to QS6 (best constrained)
 * based on multiple location quality criteria.
 */

export interface GeoNetQSCriteria {
  azimuthalGap?: number | null;          // degrees
  usedStationCount?: number | null;      // number of stations
  rmsResidual?: number | null;           // seconds
  horizontalUncertainty?: number | null; // km
  depthUncertainty?: number | null;      // km
  minimumDistance?: number | null;       // km to nearest station
}

export interface GeoNetQSResult {
  qualityScore: number; // 0-6 (QS0 to QS6)
  label: string;        // e.g., "QS6 - Best Constrained"
  description: string;  // Human-readable description
  criteriaBreakdown: {
    azimuthalGap: { value: number | null; score: number; label: string };
    stationCount: { value: number | null; score: number; label: string };
    rmsResidual: { value: number | null; score: number; label: string };
    horizontalUncertainty: { value: number | null; score: number; label: string };
    depthUncertainty: { value: number | null; score: number; label: string };
    minimumDistance: { value: number | null; score: number; label: string };
  };
  limitingFactor: string; // Which criterion limited the QS
  color: string;          // Color for visualization
}

/**
 * Calculate GeoNet Quality Score (QS0-QS6)
 * 
 * The final QS is determined by the WORST (minimum) score across all criteria.
 * This ensures that a location must meet ALL quality standards to achieve a high QS.
 */
export function calculateGeoNetQS(criteria: GeoNetQSCriteria): GeoNetQSResult {
  // Calculate individual criterion scores
  const azGapScore = scoreAzimuthalGap(criteria.azimuthalGap);
  const stationScore = scoreStationCount(criteria.usedStationCount);
  const rmsScore = scoreRMSResidual(criteria.rmsResidual);
  const horizScore = scoreHorizontalUncertainty(criteria.horizontalUncertainty);
  const depthScore = scoreDepthUncertainty(criteria.depthUncertainty);
  const distScore = scoreMinimumDistance(criteria.minimumDistance);

  // QS is the minimum (worst) of all criteria scores
  const scores = [
    { name: 'Azimuthal Gap', score: azGapScore.score, label: azGapScore.label },
    { name: 'Station Count', score: stationScore.score, label: stationScore.label },
    { name: 'RMS Residual', score: rmsScore.score, label: rmsScore.label },
    { name: 'Horizontal Uncertainty', score: horizScore.score, label: horizScore.label },
    { name: 'Depth Uncertainty', score: depthScore.score, label: depthScore.label },
    { name: 'Minimum Distance', score: distScore.score, label: distScore.label },
  ];

  const minScore = Math.min(...scores.map(s => s.score));
  const limitingCriterion = scores.find(s => s.score === minScore);

  const qualityScore = minScore;
  const qsInfo = getQSInfo(qualityScore);

  return {
    qualityScore,
    label: qsInfo.label,
    description: qsInfo.description,
    criteriaBreakdown: {
      azimuthalGap: { value: criteria.azimuthalGap ?? null, ...azGapScore },
      stationCount: { value: criteria.usedStationCount ?? null, ...stationScore },
      rmsResidual: { value: criteria.rmsResidual ?? null, ...rmsScore },
      horizontalUncertainty: { value: criteria.horizontalUncertainty ?? null, ...horizScore },
      depthUncertainty: { value: criteria.depthUncertainty ?? null, ...depthScore },
      minimumDistance: { value: criteria.minimumDistance ?? null, ...distScore },
    },
    limitingFactor: limitingCriterion?.name || 'Unknown',
    color: qsInfo.color,
  };
}

/**
 * Score azimuthal gap (angular distribution of stations)
 * Lower gap = better station coverage
 */
function scoreAzimuthalGap(gap?: number | null): { score: number; label: string } {
  if (gap === null || gap === undefined) return { score: 0, label: 'No data' };
  
  if (gap <= 90) return { score: 6, label: 'Excellent (<90°)' };
  if (gap <= 120) return { score: 5, label: 'Very Good (90-120°)' };
  if (gap <= 150) return { score: 4, label: 'Good (120-150°)' };
  if (gap <= 180) return { score: 3, label: 'Fair (150-180°)' };
  if (gap <= 240) return { score: 2, label: 'Poor (180-240°)' };
  if (gap <= 300) return { score: 1, label: 'Very Poor (240-300°)' };
  return { score: 0, label: 'Unconstrained (>300°)' };
}

/**
 * Score number of stations used in location
 * More stations = better constraint
 */
function scoreStationCount(count?: number | null): { score: number; label: string } {
  if (count === null || count === undefined) return { score: 0, label: 'No data' };
  
  if (count >= 30) return { score: 6, label: 'Excellent (≥30)' };
  if (count >= 20) return { score: 5, label: 'Very Good (20-29)' };
  if (count >= 12) return { score: 4, label: 'Good (12-19)' };
  if (count >= 8) return { score: 3, label: 'Fair (8-11)' };
  if (count >= 5) return { score: 2, label: 'Poor (5-7)' };
  if (count >= 3) return { score: 1, label: 'Very Poor (3-4)' };
  return { score: 0, label: 'Unconstrained (<3)' };
}

/**
 * Score RMS residual (fit quality)
 * Lower RMS = better fit to velocity model
 */
function scoreRMSResidual(rms?: number | null): { score: number; label: string } {
  if (rms === null || rms === undefined) return { score: 0, label: 'No data' };
  
  if (rms <= 0.2) return { score: 6, label: 'Excellent (≤0.2s)' };
  if (rms <= 0.3) return { score: 5, label: 'Very Good (0.2-0.3s)' };
  if (rms <= 0.5) return { score: 4, label: 'Good (0.3-0.5s)' };
  if (rms <= 0.8) return { score: 3, label: 'Fair (0.5-0.8s)' };
  if (rms <= 1.2) return { score: 2, label: 'Poor (0.8-1.2s)' };
  if (rms <= 2.0) return { score: 1, label: 'Very Poor (1.2-2.0s)' };
  return { score: 0, label: 'Unconstrained (>2.0s)' };
}

/**
 * Score horizontal location uncertainty
 * Lower uncertainty = better precision
 */
function scoreHorizontalUncertainty(uncert?: number | null): { score: number; label: string } {
  if (uncert === null || uncert === undefined) return { score: 0, label: 'No data' };
  
  if (uncert <= 1) return { score: 6, label: 'Excellent (≤1km)' };
  if (uncert <= 2) return { score: 5, label: 'Very Good (1-2km)' };
  if (uncert <= 5) return { score: 4, label: 'Good (2-5km)' };
  if (uncert <= 10) return { score: 3, label: 'Fair (5-10km)' };
  if (uncert <= 20) return { score: 2, label: 'Poor (10-20km)' };
  if (uncert <= 50) return { score: 1, label: 'Very Poor (20-50km)' };
  return { score: 0, label: 'Unconstrained (>50km)' };
}

/**
 * Score depth uncertainty
 * Lower uncertainty = better depth constraint
 */
function scoreDepthUncertainty(uncert?: number | null): { score: number; label: string } {
  if (uncert === null || uncert === undefined) return { score: 0, label: 'No data' };
  
  if (uncert <= 2) return { score: 6, label: 'Excellent (≤2km)' };
  if (uncert <= 5) return { score: 5, label: 'Very Good (2-5km)' };
  if (uncert <= 10) return { score: 4, label: 'Good (5-10km)' };
  if (uncert <= 20) return { score: 3, label: 'Fair (10-20km)' };
  if (uncert <= 40) return { score: 2, label: 'Poor (20-40km)' };
  if (uncert <= 80) return { score: 1, label: 'Very Poor (40-80km)' };
  return { score: 0, label: 'Unconstrained (>80km)' };
}

/**
 * Score minimum distance to nearest station
 * Closer station = better constraint
 */
function scoreMinimumDistance(dist?: number | null): { score: number; label: string } {
  if (dist === null || dist === undefined) return { score: 3, label: 'Unknown (assume fair)' };
  
  if (dist <= 30) return { score: 6, label: 'Excellent (≤30km)' };
  if (dist <= 50) return { score: 5, label: 'Very Good (30-50km)' };
  if (dist <= 100) return { score: 4, label: 'Good (50-100km)' };
  if (dist <= 200) return { score: 3, label: 'Fair (100-200km)' };
  if (dist <= 400) return { score: 2, label: 'Poor (200-400km)' };
  if (dist <= 800) return { score: 1, label: 'Very Poor (400-800km)' };
  return { score: 0, label: 'Unconstrained (>800km)' };
}

/**
 * Get QS level information
 */
function getQSInfo(qs: number): { label: string; description: string; color: string } {
  const info = {
    6: {
      label: 'QS6 - Best Constrained',
      description: 'Excellent location quality with tight constraints from all criteria',
      color: '#22c55e', // Green
    },
    5: {
      label: 'QS5 - Very Well Constrained',
      description: 'Very good location quality with strong constraints',
      color: '#84cc16', // Light green
    },
    4: {
      label: 'QS4 - Well Constrained',
      description: 'Good location quality with adequate constraints',
      color: '#eab308', // Yellow
    },
    3: {
      label: 'QS3 - Moderately Constrained',
      description: 'Fair location quality with moderate constraints',
      color: '#f97316', // Orange
    },
    2: {
      label: 'QS2 - Poorly Constrained',
      description: 'Poor location quality with weak constraints',
      color: '#ef4444', // Red
    },
    1: {
      label: 'QS1 - Very Poorly Constrained',
      description: 'Very poor location quality with very weak constraints',
      color: '#dc2626', // Dark red
    },
    0: {
      label: 'QS0 - Unconstrained',
      description: 'Unconstrained location with insufficient quality data',
      color: '#991b1b', // Very dark red
    },
  };

  return info[qs as keyof typeof info] || info[0];
}

/**
 * Get QS badge variant for UI
 */
export function getQSBadgeVariant(qs: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (qs >= 5) return 'default';      // Green
  if (qs >= 3) return 'secondary';    // Yellow/Orange
  if (qs >= 1) return 'outline';      // Red outline
  return 'destructive';               // Dark red
}

/**
 * Format QS for display
 */
export function formatQS(qs: number): string {
  return `QS${qs}`;
}

