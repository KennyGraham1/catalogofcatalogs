/**
 * Utility for loading and working with NZ Active Faults GeoJSON data
 */

export interface FaultFeature {
  type: 'Feature';
  id?: string | number;
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: number[][] | number[][][];
  };
  properties: {
    NAME?: string;
    SLIP_TYPE?: string;
    SLIP_RATE?: string;
    RECURRENCE?: string;
    DISPLACEMENT?: string;
    LAST_EVENT?: string;
    SENSE_OF_MOVEMENT?: string;
    [key: string]: any;
  };
}

export interface FaultCollection {
  type: 'FeatureCollection';
  features: FaultFeature[];
}

let cachedFaultData: FaultCollection | null = null;

/**
 * Load fault data from local GeoJSON file
 * Data is cached after first load
 */
export async function loadFaultData(): Promise<FaultCollection> {
  if (cachedFaultData) {
    return cachedFaultData;
  }

  try {
    const response = await fetch('/data/nz-active-faults.geojson');
    if (!response.ok) {
      throw new Error(`Failed to load fault data: ${response.statusText}`);
    }
    
    const data = await response.json();
    cachedFaultData = data;
    return data;
  } catch (error) {
    console.error('Error loading fault data:', error);
    // Return empty collection on error
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Get faults within a bounding box
 */
export function getFaultsInBounds(
  faults: FaultCollection,
  bounds: { north: number; south: number; east: number; west: number }
): FaultFeature[] {
  return faults.features.filter((fault) => {
    const coords = fault.geometry.coordinates;
    
    // Check if any coordinate is within bounds
    const checkCoord = (coord: number[]) => {
      const [lon, lat] = coord;
      return (
        lat >= bounds.south &&
        lat <= bounds.north &&
        lon >= bounds.west &&
        lon <= bounds.east
      );
    };

    if (fault.geometry.type === 'LineString') {
      return (coords as number[][]).some(checkCoord);
    } else if (fault.geometry.type === 'MultiLineString') {
      return (coords as number[][][]).some((line) => line.some(checkCoord));
    }
    
    return false;
  });
}

/**
 * Simplify fault data for rendering at different zoom levels
 * Returns a subset of faults based on importance/length
 */
export function simplifyFaultsForZoom(
  faults: FaultFeature[],
  zoomLevel: number
): FaultFeature[] {
  // At low zoom levels, only show major faults
  if (zoomLevel < 7) {
    // Filter by fault length (longer faults are more significant)
    return faults.filter((fault) => {
      const length = calculateFaultLength(fault);
      return length > 50; // Only faults longer than 50 km
    });
  } else if (zoomLevel < 9) {
    return faults.filter((fault) => {
      const length = calculateFaultLength(fault);
      return length > 10; // Only faults longer than 10 km
    });
  }
  
  // At high zoom, show all faults
  return faults;
}

/**
 * Calculate approximate length of a fault in kilometers
 */
function calculateFaultLength(fault: FaultFeature): number {
  const coords = fault.geometry.coordinates;
  let totalLength = 0;

  const calcSegmentLength = (line: number[][]) => {
    let length = 0;
    for (let i = 1; i < line.length; i++) {
      const [lon1, lat1] = line[i - 1];
      const [lon2, lat2] = line[i];
      length += haversineDistance(lat1, lon1, lat2, lon2);
    }
    return length;
  };

  if (fault.geometry.type === 'LineString') {
    totalLength = calcSegmentLength(coords as number[][]);
  } else if (fault.geometry.type === 'MultiLineString') {
    (coords as number[][][]).forEach((line) => {
      totalLength += calcSegmentLength(line);
    });
  }

  return totalLength;
}

/**
 * Calculate distance between two points using Haversine formula
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get color for fault based on slip type
 */
export function getFaultColor(slipType?: string): string {
  if (!slipType) return '#ff0000'; // Red for unknown
  
  const type = slipType.toLowerCase();
  
  if (type.includes('reverse')) return '#ff4444'; // Red
  if (type.includes('normal')) return '#4444ff'; // Blue
  if (type.includes('strike')) return '#44ff44'; // Green
  if (type.includes('dextral')) return '#ffaa00'; // Orange
  if (type.includes('sinistral')) return '#aa00ff'; // Purple
  
  return '#ff0000'; // Default red
}

