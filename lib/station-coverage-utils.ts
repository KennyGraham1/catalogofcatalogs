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
  /**
   * Arrival azimuths actually present in the data (degrees clockwise from
   * north). Empty when the arrivals carry no azimuth element — consumers must
   * not substitute synthetic azimuths for these.
   */
  azimuths: number[];
  /** Largest azimuthal gap in degrees, or null when it cannot be determined. */
  azimuthalGap: number | null;
  /** Provenance of azimuthalGap. */
  azimuthalGapSource: 'origin-quality' | 'arrivals' | null;
  /** Distinct recording stations, or null when the data does not say. */
  stationCount: number | null;
  /** Provenance of stationCount. */
  stationCountSource: 'origin-quality' | 'picks' | null;
  averageDistance: number;
  minDistance: number;
  maxDistance: number;
  coverageQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
}

/**
 * Authoritative origin-quality values stored on the event record
 * (OriginQuality.azimuthalGap / usedStationCount). When supplied they are
 * preferred over the values derived from the picks/arrivals arrays, which are
 * often incomplete.
 */
export interface OriginQualityCoverage {
  azimuthalGap?: number | null;
  usedStationCount?: number | null;
}

function finiteInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

/**
 * Parse station data from picks/arrivals JSON.
 */
export function parseStationData(
  picksJson: string | null | undefined,
  arrivalsJson: string | null | undefined,
  eventLat: number,
  eventLon: number,
  originQuality?: OriginQualityCoverage | null
): StationCoverage | null {
  const storedGap = finiteInRange(originQuality?.azimuthalGap, 0, 360);
  const storedCount = finiteInRange(originQuality?.usedStationCount, 0, Number.MAX_SAFE_INTEGER);
  // Stored OriginQuality alone (no phase data) is still a statement about coverage.
  if (!picksJson && !arrivalsJson && storedGap === null && storedCount === null) return null;

  try {
    const stations: Station[] = [];
    const stationKeyByPickId = new Map<string, string>();
    let picksParsed = false;

    // Parse picks to get station information
    if (picksJson) {
      const picks = JSON.parse(picksJson);
      if (Array.isArray(picks)) {
        picksParsed = true;
        picks.forEach(pick => {
          if (pick.waveformID) {
            const station: Station = {
              code: pick.waveformID.stationCode || 'UNKNOWN',
              network: pick.waveformID.networkCode || 'XX',
              latitude: 0, // Would need station metadata
              longitude: 0,
            };
            // A pick that names no station cannot be merged with another such pick:
            // key it on its own id so distinct unnamed stations stay distinct.
            const named = !!pick.waveformID.stationCode;
            const key = named ? `${station.network}.${station.code}` : `pick:${pick.publicID ?? `#${stations.length}`}`;
            if (typeof pick.publicID === 'string') stationKeyByPickId.set(pick.publicID, key);

            // Check if we already have this station
            if (!stations.find(s => s.code === station.code && s.network === station.network)) {
              stations.push(station);
            }
          }
        });
      }
    }

    // Parse arrivals for azimuth and distance, ONE entry per station. The card
    // describes station geometry, so a station that contributed both a P and an
    // S arrival must count once: with both phases, twelve evenly spaced stations
    // were previously reported as "clustered" (every gap doubled up as 0 and 30)
    // and a second phase at a near station pulled the mean distance towards it.
    const azimuthByStation = new Map<string, number>();
    const distanceByStation = new Map<string, number>();
    if (arrivalsJson) {
      const arrivals = JSON.parse(arrivalsJson);
      if (Array.isArray(arrivals)) {
        arrivals.forEach((arrival, index) => {
          const key =
            (typeof arrival.pickID === 'string' && stationKeyByPickId.get(arrival.pickID)) ||
            (typeof arrival.pickID === 'string' ? `pick:${arrival.pickID}` : `arrival:${index}`);
          if (arrival.azimuth !== undefined && arrival.azimuth !== null && !azimuthByStation.has(key)) {
            azimuthByStation.set(key, arrival.azimuth);
          }
          if (arrival.distance !== undefined && arrival.distance !== null && !distanceByStation.has(key)) {
            // Distance is in degrees, convert to km
            distanceByStation.set(key, arrival.distance * 111.32);
          }
        });
      }
    }
    const azimuths = Array.from(azimuthByStation.values());
    const distances = Array.from(distanceByStation.values());

    // Azimuthal gap: stored OriginQuality value first, arrivals second.
    const derivedGap = calculateAzimuthalGapDetail(azimuths).gap;
    const azimuthalGap = storedGap ?? derivedGap;
    const azimuthalGapSource: StationCoverage['azimuthalGapSource'] =
      storedGap !== null ? 'origin-quality' : derivedGap !== null ? 'arrivals' : null;

    // Station count: stored OriginQuality value first, distinct picks second.
    const stationCount = storedCount ?? (picksParsed ? stations.length : null);
    const stationCountSource: StationCoverage['stationCountSource'] =
      storedCount !== null ? 'origin-quality' : picksParsed ? 'picks' : null;

    // Calculate distance statistics
    const averageDistance = distances.length > 0
      ? distances.reduce((sum, d) => sum + d, 0) / distances.length
      : 0;
    const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
    const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;

    // Determine coverage quality
    const coverageQuality = determineCoverageQuality(azimuthalGap, stationCount);

    return {
      stations,
      azimuths,
      azimuthalGap,
      azimuthalGapSource,
      stationCount,
      stationCountSource,
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

export interface AzimuthalGapDetail {
  /** Largest gap in degrees, or null when there are no azimuths to measure. */
  gap: number | null;
  /** Azimuth of the last station before the gap (where the gap starts, clockwise). */
  startAzimuth: number | null;
  /** Azimuth of the first station after the gap (where the gap ends, clockwise). */
  endAzimuth: number | null;
}

/**
 * Largest azimuthal gap AND the pair of azimuths that bound it, so a directional
 * coverage diagram can be drawn at the real azimuths instead of an assumed one.
 */
export function calculateAzimuthalGapDetail(azimuths: number[]): AzimuthalGapDetail {
  const sorted = azimuths
    .filter(a => typeof a === 'number' && Number.isFinite(a))
    .map(a => ((a % 360) + 360) % 360)
    .sort((a, b) => a - b);

  if (sorted.length === 0) return { gap: null, startAzimuth: null, endAzimuth: null };
  // A single azimuth leaves the whole circle uncovered on one side of it.
  if (sorted.length === 1) return { gap: 360, startAzimuth: sorted[0], endAzimuth: sorted[0] };

  let gap = -1;
  let startAzimuth = sorted[0];
  let endAzimuth = sorted[0];

  for (let i = 0; i < sorted.length - 1; i++) {
    const candidate = sorted[i + 1] - sorted[i];
    if (candidate > gap) {
      gap = candidate;
      startAzimuth = sorted[i];
      endAzimuth = sorted[i + 1];
    }
  }

  // Don't forget the gap between last and first (wrapping around)
  const wrapGap = 360 - sorted[sorted.length - 1] + sorted[0];
  if (wrapGap > gap) {
    gap = wrapGap;
    startAzimuth = sorted[sorted.length - 1];
    endAzimuth = sorted[0];
  }

  return { gap, startAzimuth, endAzimuth };
}

/**
 * Calculate azimuthal gap from array of azimuths.
 * Returns 360 when there is nothing to measure (0 or 1 azimuth); use
 * calculateAzimuthalGapDetail when "unknown" has to be distinguished from 360.
 */
export function calculateAzimuthalGap(azimuths: number[]): number {
  return calculateAzimuthalGapDetail(azimuths).gap ?? 360;
}

/**
 * Determine coverage quality based on azimuthal gap and station count.
 */
export function determineCoverageQuality(
  azimuthalGap: number | null,
  stationCount: number | null
): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
  if (azimuthalGap === null || stationCount === null) return 'unknown';

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
export function getCoverageQualityColor(quality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'): string {
  switch (quality) {
    case 'excellent': return '#22c55e'; // Green
    case 'good': return '#84cc16'; // Light green
    case 'fair': return '#eab308'; // Yellow
    case 'poor': return '#ef4444'; // Red
    case 'unknown': return '#9ca3af'; // Gray - not enough data to judge
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
export function calculateStationDistributionRatio(azimuths: number[]): number | null {
  // Fewer than two azimuths says nothing about the distribution — returning 0
  // here would report "perfectly even" for events with no azimuth data at all.
  if (azimuths.length < 2) return null;
  
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
  // Rounding can push `a` a few ulp above 1 for antipodal points, which made
  // sqrt(1 - a) NaN; the true value there is half the circumference.
  const clamped = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
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

