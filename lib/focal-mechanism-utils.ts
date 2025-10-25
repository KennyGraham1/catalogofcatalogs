/**
 * Utility functions for rendering focal mechanism beach ball diagrams
 * Supports standard double-couple focal mechanisms
 */

export interface NodalPlane {
  strike: number;  // 0-360 degrees
  dip: number;     // 0-90 degrees
  rake: number;    // -180 to 180 degrees
}

export interface FocalMechanism {
  nodalPlane1?: NodalPlane;
  nodalPlane2?: NodalPlane;
  preferredPlane?: 1 | 2;
}

export interface BeachBallPoint {
  x: number;
  y: number;
  isCompressional: boolean;
}

/**
 * Parse focal mechanism data from JSON string
 */
export function parseFocalMechanism(focalMechanismsJson: string | null | undefined): FocalMechanism | null {
  if (!focalMechanismsJson) return null;
  
  try {
    const mechanisms = JSON.parse(focalMechanismsJson);
    if (!Array.isArray(mechanisms) || mechanisms.length === 0) return null;
    
    const fm = mechanisms[0]; // Use first focal mechanism
    
    if (!fm.nodalPlanes) return null;
    
    return {
      nodalPlane1: fm.nodalPlanes.nodalPlane1 ? {
        strike: fm.nodalPlanes.nodalPlane1.strike?.value || 0,
        dip: fm.nodalPlanes.nodalPlane1.dip?.value || 0,
        rake: fm.nodalPlanes.nodalPlane1.rake?.value || 0,
      } : undefined,
      nodalPlane2: fm.nodalPlanes.nodalPlane2 ? {
        strike: fm.nodalPlanes.nodalPlane2.strike?.value || 0,
        dip: fm.nodalPlanes.nodalPlane2.dip?.value || 0,
        rake: fm.nodalPlanes.nodalPlane2.rake?.value || 0,
      } : undefined,
      preferredPlane: fm.nodalPlanes.preferredPlane || 1,
    };
  } catch (error) {
    console.error('Error parsing focal mechanism:', error);
    return null;
  }
}

/**
 * Convert strike, dip, rake to SVG path for beach ball diagram
 * Uses lower-hemisphere equal-area projection
 */
export function generateBeachBallSVG(
  mechanism: FocalMechanism,
  size: number = 100
): string {
  if (!mechanism.nodalPlane1) return '';
  
  const { strike, dip, rake } = mechanism.nodalPlane1;
  const radius = size / 2;
  const center = radius;
  
  // Convert to radians
  const strikeRad = (strike * Math.PI) / 180;
  const dipRad = (dip * Math.PI) / 180;
  const rakeRad = (rake * Math.PI) / 180;
  
  // Calculate nodal plane positions
  const points: BeachBallPoint[] = [];
  const numPoints = 360;
  
  for (let i = 0; i < numPoints; i++) {
    const azimuth = (i * 2 * Math.PI) / numPoints;
    
    // Project point onto lower hemisphere
    const x = Math.sin(azimuth);
    const y = Math.cos(azimuth);
    
    // Determine if point is in compressional (black) or tensional (white) quadrant
    const isCompressional = isPointCompressional(azimuth, strikeRad, dipRad, rakeRad);
    
    points.push({
      x: center + x * radius * 0.95,
      y: center + y * radius * 0.95,
      isCompressional
    });
  }
  
  // Generate SVG paths for compressional quadrants
  const compressionalPaths: string[] = [];
  let currentPath: BeachBallPoint[] = [];
  let inCompressionalZone = false;
  
  for (let i = 0; i <= numPoints; i++) {
    const point = points[i % numPoints];
    
    if (point.isCompressional) {
      if (!inCompressionalZone) {
        currentPath = [point];
        inCompressionalZone = true;
      } else {
        currentPath.push(point);
      }
    } else {
      if (inCompressionalZone && currentPath.length > 0) {
        compressionalPaths.push(pointsToPath(currentPath, center, radius));
        currentPath = [];
        inCompressionalZone = false;
      }
    }
  }
  
  if (currentPath.length > 0) {
    compressionalPaths.push(pointsToPath(currentPath, center, radius));
  }
  
  // Build SVG
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <!-- White background circle -->
      <circle cx="${center}" cy="${center}" r="${radius * 0.95}" fill="white" stroke="black" stroke-width="2"/>
      
      <!-- Compressional quadrants (black) -->
      ${compressionalPaths.map(path => `<path d="${path}" fill="black" />`).join('\n      ')}
      
      <!-- Outer circle border -->
      <circle cx="${center}" cy="${center}" r="${radius * 0.95}" fill="none" stroke="black" stroke-width="2"/>
    </svg>
  `;
  
  return svg;
}

/**
 * Determine if a point is in a compressional quadrant
 */
function isPointCompressional(
  azimuth: number,
  strike: number,
  dip: number,
  rake: number
): boolean {
  // Simplified calculation for double-couple mechanism
  // This is a basic implementation - a full implementation would use
  // proper seismological transformations
  
  // Calculate the angle relative to the strike
  let relativeAngle = azimuth - strike;
  while (relativeAngle < 0) relativeAngle += 2 * Math.PI;
  while (relativeAngle >= 2 * Math.PI) relativeAngle -= 2 * Math.PI;
  
  // Determine quadrant based on rake
  // Rake > 0: reverse fault, Rake < 0: normal fault, Rake ≈ 0 or ±180: strike-slip
  const isReverse = rake > 45 && rake < 135;
  const isNormal = rake < -45 && rake > -135;
  const isStrikeSlip = Math.abs(rake) < 45 || Math.abs(rake) > 135;
  
  if (isStrikeSlip) {
    // Strike-slip: alternating quadrants
    return (relativeAngle > Math.PI / 2 && relativeAngle < 3 * Math.PI / 2);
  } else if (isReverse) {
    // Reverse fault: compressional in center
    return (relativeAngle < Math.PI / 2 || relativeAngle > 3 * Math.PI / 2);
  } else if (isNormal) {
    // Normal fault: tensional in center
    return (relativeAngle > Math.PI / 2 && relativeAngle < 3 * Math.PI / 2);
  }
  
  // Default pattern
  return (relativeAngle > Math.PI / 2 && relativeAngle < 3 * Math.PI / 2);
}

/**
 * Convert array of points to SVG path
 */
function pointsToPath(points: BeachBallPoint[], center: number, radius: number): string {
  if (points.length === 0) return '';
  
  let path = `M ${points[0].x} ${points[0].y}`;
  
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  
  // Close the path by connecting to the arc on the circle
  path += ` A ${radius * 0.95} ${radius * 0.95} 0 0 1 ${points[0].x} ${points[0].y}`;
  path += ' Z';
  
  return path;
}

/**
 * Get fault type description from rake angle
 */
export function getFaultType(rake: number): {
  type: 'normal' | 'reverse' | 'strike-slip' | 'oblique-normal' | 'oblique-reverse';
  description: string;
} {
  const absRake = Math.abs(rake);
  
  if (rake >= -30 && rake <= 30) {
    return { type: 'strike-slip', description: 'Left-lateral strike-slip' };
  } else if (rake >= 150 || rake <= -150) {
    return { type: 'strike-slip', description: 'Right-lateral strike-slip' };
  } else if (rake > 30 && rake < 60) {
    return { type: 'oblique-reverse', description: 'Oblique-reverse (thrust component)' };
  } else if (rake >= 60 && rake <= 120) {
    return { type: 'reverse', description: 'Reverse/Thrust fault' };
  } else if (rake > 120 && rake < 150) {
    return { type: 'oblique-reverse', description: 'Oblique-reverse (strike-slip component)' };
  } else if (rake < -30 && rake > -60) {
    return { type: 'oblique-normal', description: 'Oblique-normal (strike-slip component)' };
  } else if (rake <= -60 && rake >= -120) {
    return { type: 'normal', description: 'Normal fault' };
  } else if (rake < -120 && rake > -150) {
    return { type: 'oblique-normal', description: 'Oblique-normal (strike-slip component)' };
  }
  
  return { type: 'strike-slip', description: 'Strike-slip fault' };
}

/**
 * Format focal mechanism parameters for display
 */
export function formatFocalMechanism(mechanism: FocalMechanism): {
  plane1: string;
  plane2: string;
  faultType: string;
  preferred: string;
} {
  const plane1 = mechanism.nodalPlane1
    ? `Strike: ${mechanism.nodalPlane1.strike.toFixed(0)}°, Dip: ${mechanism.nodalPlane1.dip.toFixed(0)}°, Rake: ${mechanism.nodalPlane1.rake.toFixed(0)}°`
    : 'N/A';
  
  const plane2 = mechanism.nodalPlane2
    ? `Strike: ${mechanism.nodalPlane2.strike.toFixed(0)}°, Dip: ${mechanism.nodalPlane2.dip.toFixed(0)}°, Rake: ${mechanism.nodalPlane2.rake.toFixed(0)}°`
    : 'N/A';
  
  const faultType = mechanism.nodalPlane1
    ? getFaultType(mechanism.nodalPlane1.rake).description
    : 'Unknown';
  
  const preferred = mechanism.preferredPlane === 2 ? 'Plane 2' : 'Plane 1';
  
  return { plane1, plane2, faultType, preferred };
}

/**
 * Generate a simple beach ball as a data URL for use in Leaflet markers
 */
export function generateBeachBallDataURL(mechanism: FocalMechanism, size: number = 40): string {
  const svg = generateBeachBallSVG(mechanism, size);
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml,${encoded}`;
}

