/**
 * Utility functions for visualizing seismic station coverage and distribution
 */

export interface Station {
  code: string;
  network: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  name?: string;
}

export interface StationCoverage {
  stations: Station[];
  azimuthalGap: number;
  stationCount: number;
  averageDistance: number;
  minDistance: number;
  maxDistance: number;
  coverageQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Parse station data from picks/arrivals JSON
 */
export function parseStationData(
  picksJson: string | null | undefined,
  arrivalsJson: string | null | undefined,
  eventLat: number,
  eventLon: number
): StationCoverage | null {
  if (!picksJson && !arrivalsJson) return null;
  
  try {
    const stations: Station[] = [];
    const azimuths: number[] = [];
    const distances: number[] = [];
    
    // Parse picks to get station information
    if (picksJson) {
      const picks = JSON.parse(picksJson);
      if (Array.isArray(picks)) {
        picks.forEach(pick => {
          if (pick.waveformID) {
            const station: Station = {
              code: pick.waveformID.stationCode || 'UNKNOWN',
              network: pick.waveformID.networkCode || 'XX',
              latitude: 0, // Would need station metadata
              longitude: 0,
            };
            
            // Check if we already have this station
            if (!stations.find(s => s.code === station.code && s.network === station.network)) {
              stations.push(station);
            }
          }
        });
      }
    }
    
    // Parse arrivals to get azimuth and distance information
    if (arrivalsJson) {
      const arrivals = JSON.parse(arrivalsJson);
      if (Array.isArray(arrivals)) {
        arrivals.forEach(arrival => {
          if (arrival.azimuth !== undefined && arrival.azimuth !== null) {
            azimuths.push(arrival.azimuth);
          }
          if (arrival.distance !== undefined && arrival.distance !== null) {
            // Distance is in degrees, convert to km
            distances.push(arrival.distance * 111.32);
          }
        });
      }
    }
    
    // Calculate azimuthal gap
    const azimuthalGap = calculateAzimuthalGap(azimuths);
    
    // Calculate distance statistics
    const averageDistance = distances.length > 0
      ? distances.reduce((sum, d) => sum + d, 0) / distances.length
      : 0;
    const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
    const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;
    
    // Determine coverage quality
    const coverageQuality = determineCoverageQuality(azimuthalGap, stations.length);
    
    return {
      stations,
      azimuthalGap,
      stationCount: stations.length,
      averageDistance,
      minDistance,
      maxDistance,
      coverageQuality,
    };
  } catch (error) {
    console.error('Error parsing station data:', error);
    return null;
  }
}

/**
 * Calculate azimuthal gap from array of azimuths
 */
export function calculateAzimuthalGap(azimuths: number[]): number {
  if (azimuths.length === 0) return 360;
  if (azimuths.length === 1) return 360;
  
  // Sort azimuths
  const sorted = [...azimuths].sort((a, b) => a - b);
  
  // Calculate gaps between consecutive azimuths
  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i + 1] - sorted[i]);
  }
  
  // Don't forget the gap between last and first (wrapping around)
  gaps.push(360 - sorted[sorted.length - 1] + sorted[0]);
  
  // Return the largest gap
  return Math.max(...gaps);
}

/**
 * Determine coverage quality based on azimuthal gap and station count
 */
export function determineCoverageQuality(
  azimuthalGap: number,
  stationCount: number
): 'excellent' | 'good' | 'fair' | 'poor' {
  // Excellent: gap < 90° and >= 10 stations
  if (azimuthalGap < 90 && stationCount >= 10) return 'excellent';
  
  // Good: gap < 180° and >= 6 stations
  if (azimuthalGap < 180 && stationCount >= 6) return 'good';
  
  // Fair: gap < 270° and >= 4 stations
  if (azimuthalGap < 270 && stationCount >= 4) return 'fair';
  
  // Poor: everything else
  return 'poor';
}

/**
 * Get color for coverage quality visualization
 */
export function getCoverageQualityColor(quality: 'excellent' | 'good' | 'fair' | 'poor'): string {
  switch (quality) {
    case 'excellent': return '#22c55e'; // Green
    case 'good': return '#84cc16'; // Light green
    case 'fair': return '#eab308'; // Yellow
    case 'poor': return '#ef4444'; // Red
  }
}

/**
 * Generate azimuthal coverage visualization data
 * Returns array of sectors for polar plot
 */
export function generateAzimuthalCoverageSectors(
  azimuths: number[],
  sectorSize: number = 30
): Array<{ start: number; end: number; count: number; coverage: number }> {
  const numSectors = 360 / sectorSize;
  const sectors: Array<{ start: number; end: number; count: number; coverage: number }> = [];
  
  for (let i = 0; i < numSectors; i++) {
    const start = i * sectorSize;
    const end = (i + 1) * sectorSize;
    
    // Count azimuths in this sector
    const count = azimuths.filter(az => az >= start && az < end).length;
    
    // Calculate coverage (0-1 scale)
    const coverage = Math.min(1, count / 3); // 3+ stations = full coverage
    
    sectors.push({ start, end, count, coverage });
  }
  
  return sectors;
}

/**
 * Calculate station distribution ratio
 * Measures how evenly stations are distributed around the event
 */
export function calculateStationDistributionRatio(azimuths: number[]): number {
  if (azimuths.length < 2) return 0;
  
  const gaps = [];
  const sorted = [...azimuths].sort((a, b) => a - b);
  
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i + 1] - sorted[i]);
  }
  gaps.push(360 - sorted[sorted.length - 1] + sorted[0]);
  
  // Calculate standard deviation of gaps
  const meanGap = 360 / azimuths.length;
  const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - meanGap, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);
  
  // Ratio: 0 = perfectly even, 1 = very uneven
  // Normalize by expected standard deviation for random distribution
  const expectedStdDev = meanGap * 0.5;
  const ratio = Math.min(1, stdDev / (expectedStdDev * 2));
  
  return ratio;
}

/**
 * Get description of station distribution
 */
export function getStationDistributionDescription(ratio: number): {
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  description: string;
} {
  if (ratio < 0.3) {
    return {
      quality: 'excellent',
      description: 'Stations are evenly distributed around the event'
    };
  } else if (ratio < 0.5) {
    return {
      quality: 'good',
      description: 'Stations are reasonably well distributed'
    };
  } else if (ratio < 0.7) {
    return {
      quality: 'fair',
      description: 'Station distribution is somewhat uneven'
    };
  } else {
    return {
      quality: 'poor',
      description: 'Stations are poorly distributed (clustered)'
    };
  }
}


/**
 * Calculate distance between two points (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate azimuth from point 1 to point 2
 */
export function calculateAzimuth(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let azimuth = Math.atan2(y, x) * 180 / Math.PI;
  azimuth = (azimuth + 360) % 360; // Normalize to 0-360
  
  return azimuth;
}

