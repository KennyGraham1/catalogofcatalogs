/**
 * Utility functions for calculating and rendering uncertainty ellipses
 * for earthquake location uncertainties
 */

import L from 'leaflet';

export interface UncertaintyData {
  latitude: number;
  longitude: number;
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;
  time_uncertainty?: number | null;
  azimuthal_gap?: number | null;
}

export interface UncertaintyEllipse {
  center: [number, number];
  semiMajorAxis: number; // in meters
  semiMinorAxis: number; // in meters
  rotation: number; // in degrees
  confidence: number; // 0-1 scale
}

/**
 * Calculate uncertainty ellipse parameters from QuakeML uncertainty data
 */
export function calculateUncertaintyEllipse(data: UncertaintyData): UncertaintyEllipse | null {
  const { latitude, longitude, latitude_uncertainty, longitude_uncertainty } = data;
  
  if (!latitude_uncertainty && !longitude_uncertainty) {
    return null;
  }

  // Convert uncertainties from degrees to meters (approximate)
  // 1 degree latitude ≈ 111,000 meters
  // 1 degree longitude ≈ 111,000 * cos(latitude) meters
  const latUncertaintyMeters = (latitude_uncertainty || 0) * 111000;
  const lonUncertaintyMeters = (longitude_uncertainty || 0) * 111000 * Math.cos(latitude * Math.PI / 180);

  // Use the larger uncertainty as semi-major axis, smaller as semi-minor
  const semiMajorAxis = Math.max(latUncertaintyMeters, lonUncertaintyMeters);
  const semiMinorAxis = Math.min(latUncertaintyMeters, lonUncertaintyMeters);

  // Calculate rotation (0 if uncertainties are equal)
  const rotation = latUncertaintyMeters > lonUncertaintyMeters ? 0 : 90;

  // Calculate confidence based on azimuthal gap (if available)
  let confidence = 0.68; // Default to 1-sigma (68% confidence)
  if (data.azimuthal_gap !== null && data.azimuthal_gap !== undefined) {
    // Better azimuthal gap = higher confidence
    // Gap < 90° = high confidence, Gap > 270° = low confidence
    confidence = Math.max(0.3, Math.min(0.95, 1 - (data.azimuthal_gap / 360)));
  }

  return {
    center: [latitude, longitude],
    semiMajorAxis,
    semiMinorAxis,
    rotation,
    confidence
  };
}

/**
 * Get color for uncertainty visualization based on confidence level
 */
export function getUncertaintyColor(confidence: number): string {
  if (confidence >= 0.9) return '#22c55e'; // Green - high confidence
  if (confidence >= 0.7) return '#eab308'; // Yellow - medium confidence
  if (confidence >= 0.5) return '#f97316'; // Orange - low confidence
  return '#ef4444'; // Red - very low confidence
}

/**
 * Get opacity for uncertainty ellipse based on confidence
 */
export function getUncertaintyOpacity(confidence: number): number {
  return Math.max(0.1, Math.min(0.4, confidence * 0.5));
}

/**
 * Create Leaflet ellipse options for uncertainty visualization
 */
export function createUncertaintyEllipseOptions(ellipse: UncertaintyEllipse) {
  return {
    color: getUncertaintyColor(ellipse.confidence),
    fillColor: getUncertaintyColor(ellipse.confidence),
    fillOpacity: getUncertaintyOpacity(ellipse.confidence),
    weight: 1,
    dashArray: '5, 5',
  };
}

/**
 * Calculate quality score based on uncertainties and quality metrics
 */
export function calculateLocationQuality(data: UncertaintyData): {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    horizontalUncertainty: number;
    depthUncertainty: number;
    azimuthalGap: number;
    timeUncertainty: number;
  };
} {
  let score = 100;
  const factors = {
    horizontalUncertainty: 100,
    depthUncertainty: 100,
    azimuthalGap: 100,
    timeUncertainty: 100
  };

  // Horizontal uncertainty penalty (0-30 points)
  const horizontalUncertainty = Math.max(
    data.latitude_uncertainty || 0,
    data.longitude_uncertainty || 0
  );
  if (horizontalUncertainty > 0) {
    // Excellent: < 0.01° (~1km), Poor: > 0.1° (~10km)
    const penalty = Math.min(30, horizontalUncertainty * 300);
    factors.horizontalUncertainty = Math.max(0, 100 - penalty);
    score -= penalty;
  }

  // Depth uncertainty penalty (0-20 points)
  if (data.depth_uncertainty) {
    // Excellent: < 1km, Poor: > 10km
    const penalty = Math.min(20, data.depth_uncertainty * 2);
    factors.depthUncertainty = Math.max(0, 100 - penalty);
    score -= penalty;
  }

  // Azimuthal gap penalty (0-30 points)
  if (data.azimuthal_gap !== null && data.azimuthal_gap !== undefined) {
    // Excellent: < 90°, Poor: > 270°
    const penalty = Math.min(30, (data.azimuthal_gap / 270) * 30);
    factors.azimuthalGap = Math.max(0, 100 - penalty);
    score -= penalty;
  }

  // Time uncertainty penalty (0-20 points)
  if (data.time_uncertainty) {
    // Excellent: < 0.1s, Poor: > 1s
    const penalty = Math.min(20, data.time_uncertainty * 20);
    factors.timeUncertainty = Math.max(0, 100 - penalty);
    score -= penalty;
  }

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return {
    score: Math.max(0, Math.round(score)),
    grade,
    factors
  };
}

/**
 * Format uncertainty value for display
 */
export function formatUncertainty(value: number | null | undefined, unit: string = 'km'): string {
  if (value === null || value === undefined) return 'N/A';
  
  if (unit === 'km') {
    if (value < 0.01) return `${(value * 1000).toFixed(0)} m`;
    return `${value.toFixed(2)} km`;
  }
  
  if (unit === 'degrees') {
    return `${value.toFixed(4)}°`;
  }
  
  if (unit === 'seconds') {
    if (value < 1) return `${(value * 1000).toFixed(0)} ms`;
    return `${value.toFixed(2)} s`;
  }
  
  return `${value.toFixed(2)} ${unit}`;
}

/**
 * Get uncertainty level description
 */
export function getUncertaintyLevel(uncertainty: number | null | undefined, type: 'horizontal' | 'depth' | 'time'): {
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  description: string;
} {
  if (uncertainty === null || uncertainty === undefined) {
    return { level: 'unknown', description: 'No uncertainty data available' };
  }

  if (type === 'horizontal') {
    if (uncertainty < 0.01) return { level: 'excellent', description: 'Very precise location (< 1 km)' };
    if (uncertainty < 0.05) return { level: 'good', description: 'Good location precision (1-5 km)' };
    if (uncertainty < 0.1) return { level: 'fair', description: 'Fair location precision (5-10 km)' };
    return { level: 'poor', description: 'Poor location precision (> 10 km)' };
  }

  if (type === 'depth') {
    if (uncertainty < 1) return { level: 'excellent', description: 'Very precise depth (< 1 km)' };
    if (uncertainty < 5) return { level: 'good', description: 'Good depth precision (1-5 km)' };
    if (uncertainty < 10) return { level: 'fair', description: 'Fair depth precision (5-10 km)' };
    return { level: 'poor', description: 'Poor depth precision (> 10 km)' };
  }

  if (type === 'time') {
    if (uncertainty < 0.1) return { level: 'excellent', description: 'Very precise timing (< 0.1 s)' };
    if (uncertainty < 0.5) return { level: 'good', description: 'Good timing precision (0.1-0.5 s)' };
    if (uncertainty < 1) return { level: 'fair', description: 'Fair timing precision (0.5-1 s)' };
    return { level: 'poor', description: 'Poor timing precision (> 1 s)' };
  }

  return { level: 'unknown', description: 'Unknown uncertainty type' };
}

