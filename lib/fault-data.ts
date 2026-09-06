/**
 * Utility for loading and working with NZ Active Faults GeoJSON data
 */

export interface FaultFeature {
  type: 'Feature';
  id?: string | number;
  /**
   * Every one of the 10,269 features in the bundled AF250 layer is a
   * MultiLineString (an array of line strings). LineString is kept in the union
   * so the helpers below stay usable with a plain single-trace GeoJSON source;
   * both shapes are handled explicitly wherever coordinates are walked.
   */
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: number[][] | number[][][];
  };
  geometry_name?: string;
  /**
   * The attributes actually present in public/data/nz-active-faults.geojson
   * (GNS Science AF250 active faults layer). The names are all lower case — the
   * interface once declared upper-case names that appear nowhere in that file,
   * so every property read resolved to undefined.
   */
  properties: {
    id?: number;
    afdb_id?: number;
    bib_id?: string | null;
    line_accuracy?: string;
    line_source?: string | null;
    name?: string | null;
    /** Recurrence-interval class as a Roman numeral, I-VI (5 features carry the literal string '<Null>'). */
    rec_interval?: string | null;
    section?: string | null;
    author?: string | null;
    source?: string | null;
    lq_filesource?: string | null;
    lq_contrib?: string | null;
    lq_geom_se?: string | null;
    match_id?: number | null;
    dipdir?: number;
    /** AF250 slip-type code: 0 unknown, 1 dextral, 2 normal, 3 reverse, 4 sinistral. */
    slip_type?: number;
    acc?: number;
    dip?: number;
    displacement?: number;
    slip_rate?: number;
    /** Subsidiary slip-type code, same domain as slip_type (0 = none recorded). */
    sub_sliptype?: number;
    down_quad?: number;
    last_event?: number;
    createddate?: string | null;
    modifieddate?: string | null;
    modification?: string | null;
    activity?: string | null;
    shape_length?: number | null;
    gid?: number | null;
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
 * Get faults within a bounding box (antimeridian-aware).
 */
export function getFaultsInBounds(
  faults: FaultCollection,
  bounds: { north: number; south: number; east: number; west: number }
): FaultFeature[] {
  const span = bounds.east - bounds.west;
  // >= 360 covers the whole circle; a non-finite span leaves width NaN, so every
  // comparison below is false and no fault is claimed to be inside.
  const wholeWorld = Math.abs(span) >= 360;
  const width = ((span % 360) + 360) % 360;

  const lonInBounds = (lon: number): boolean => {
    if (wholeWorld) return true;
    return ((((lon - bounds.west) % 360) + 360) % 360) <= width;
  };

  return faults.features.filter((fault) => {
    const coords = fault.geometry.coordinates;

    // Check if any coordinate is within bounds
    const checkCoord = (coord: number[]) => {
      const [lon, lat] = coord;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
      return lat >= bounds.south && lat <= bounds.north && lonInBounds(lon);
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
 * AF250 slip-type coded domain.
 */
export const AF250_SLIP_TYPE_CODES: Readonly<Record<number, string>> = {
  0: 'unknown',
  1: 'dextral',
  2: 'normal',
  3: 'reverse',
  4: 'sinistral',
};

/**
 * Resolve a slip type to its descriptive name. Accepts an AF250 integer code
 * (what `feature.properties.slip_type` actually holds) or an already descriptive
 * string from some other fault source. Returns undefined when the sense is not
 * recorded or the code is outside the domain.
 */
export function getFaultSlipTypeName(slipType?: string | number | null): string | undefined {
  if (slipType === null || slipType === undefined) return undefined;
  if (typeof slipType === 'number') {
    if (slipType === 0) return undefined; // 0 = sense not recorded
    return AF250_SLIP_TYPE_CODES[slipType];
  }
  const trimmed = slipType.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Get color for fault based on slip type. Takes either the AF250 numeric code or
 * a descriptive slip-type string; unknown/unrecorded senses fall back to red.
 */
export function getFaultColor(slipType?: string | number | null): string {
  const name = getFaultSlipTypeName(slipType);
  if (!name) return '#ff0000'; // Red for unknown

  const type = name.toLowerCase();

  if (type.includes('reverse')) return '#ff4444'; // Red
  if (type.includes('normal')) return '#4444ff'; // Blue
  if (type.includes('strike')) return '#44ff44'; // Green
  if (type.includes('dextral')) return '#ffaa00'; // Orange
  if (type.includes('sinistral')) return '#aa00ff'; // Purple

  return '#ff0000'; // Default red
}

