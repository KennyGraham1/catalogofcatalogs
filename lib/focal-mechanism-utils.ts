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

function finiteNumber(value: unknown, fallback: number = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePreferredPlane(value: unknown): 1 | 2 {
  return value === 2 ? 2 : 1;
}

/**
 * Parse focal mechanism data from JSON string
 * Supports both QuakeML format and simplified format
 */
export function parseFocalMechanism(focalMechanismsJson: string | null | undefined): FocalMechanism | null {
  if (!focalMechanismsJson) return null;

  try {
    const mechanisms = JSON.parse(focalMechanismsJson);
    if (!Array.isArray(mechanisms) || mechanisms.length === 0) return null;

    const fm = mechanisms[0]; // Use first focal mechanism

    // Check if this is the simplified format (direct nodalPlane1/nodalPlane2)
    if (fm.nodalPlane1 && typeof fm.nodalPlane1.strike === 'number') {
      return {
        nodalPlane1: {
          strike: finiteNumber(fm.nodalPlane1.strike),
          dip: finiteNumber(fm.nodalPlane1.dip),
          rake: finiteNumber(fm.nodalPlane1.rake),
        },
        nodalPlane2: fm.nodalPlane2 ? {
          strike: finiteNumber(fm.nodalPlane2.strike),
          dip: finiteNumber(fm.nodalPlane2.dip),
          rake: finiteNumber(fm.nodalPlane2.rake),
        } : undefined,
        preferredPlane: normalizePreferredPlane(fm.preferredPlane),
      };
    }

    // Otherwise, try QuakeML format (nested nodalPlanes with value objects)
    if (!fm.nodalPlanes) return null;

    return {
      nodalPlane1: fm.nodalPlanes.nodalPlane1 ? {
        strike: finiteNumber(fm.nodalPlanes.nodalPlane1.strike?.value),
        dip: finiteNumber(fm.nodalPlanes.nodalPlane1.dip?.value),
        rake: finiteNumber(fm.nodalPlanes.nodalPlane1.rake?.value),
      } : undefined,
      nodalPlane2: fm.nodalPlanes.nodalPlane2 ? {
        strike: finiteNumber(fm.nodalPlanes.nodalPlane2.strike?.value),
        dip: finiteNumber(fm.nodalPlanes.nodalPlane2.dip?.value),
        rake: finiteNumber(fm.nodalPlanes.nodalPlane2.rake?.value),
      } : undefined,
      preferredPlane: normalizePreferredPlane(fm.nodalPlanes.preferredPlane),
    };
  } catch (error) {
    console.error('Error parsing focal mechanism:', error);
    return null;
  }
}

// ===========================================================================
// Correct double-couple beach ball (Aki & Richards, 1980)
//
// We build the unit moment tensor in (North, East, Down) coordinates from
// (strike, dip, rake), then shade the focal sphere by the sign of the P-wave
// first motion f(r) = r·M·r in a lower-hemisphere EQUAL-AREA (Schmidt)
// projection. Compressional (f > 0, first motion "up") area is filled and
// contains the T (tension) axis; the two nodal planes are drawn as great
// circles. This matches obspy.imaging.beachball / GMT psmeca conventions.
// ===========================================================================

type V3 = [number, number, number];
const DEG = Math.PI / 180;
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize3 = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

export interface AxisProjection { x: number; y: number; azimuth: number; plunge: number }

export interface BeachballGeometry {
  size: number;
  center: number;
  radius: number;
  /** Single filled SVG path covering all compressional (first-motion up) area. */
  compressionalPath: string;
  /** The two nodal-plane great-circle traces (lower hemisphere) as polyline paths. */
  nodalPaths: string[];
  pAxis: AxisProjection; // pressure axis (in dilatational area)
  tAxis: AxisProjection; // tension axis (in compressional area)
}

/** Unit moment tensor in (N, E, Down) from strike/dip/rake (Aki & Richards 1980, eq. 4.29). */
function momentTensorNED(strike: number, dip: number, rake: number): number[][] {
  const s = strike * DEG, d = dip * DEG, r = rake * DEG;
  const sind = Math.sin(d), cosd = Math.cos(d), sin2d = Math.sin(2 * d), cos2d = Math.cos(2 * d);
  const sinr = Math.sin(r), cosr = Math.cos(r);
  const sins = Math.sin(s), coss = Math.cos(s), sin2s = Math.sin(2 * s), cos2s = Math.cos(2 * s);
  const Mnn = -(sind * cosr * sin2s + sin2d * sinr * sins * sins);
  const Mee = sind * cosr * sin2s - sin2d * sinr * coss * coss;
  const Mdd = sin2d * sinr;
  const Mne = sind * cosr * cos2s + 0.5 * sin2d * sinr * sin2s;
  const Mnd = -(cosd * cosr * coss + cos2d * sinr * sins);
  const Med = -(cosd * cosr * sins - cos2d * sinr * coss);
  return [
    [Mnn, Mne, Mnd],
    [Mne, Mee, Med],
    [Mnd, Med, Mdd],
  ];
}

/** P-wave first-motion amplitude r·M·r. */
function radiation(M: number[][], v: V3): number {
  return (
    v[0] * (M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2]) +
    v[1] * (M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2]) +
    v[2] * (M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2])
  );
}

/** Fault normal n and slip u in (N, E, Down). */
function normalAndSlip(strike: number, dip: number, rake: number): { n: V3; u: V3 } {
  const s = strike * DEG, d = dip * DEG, r = rake * DEG;
  const n: V3 = [-Math.sin(d) * Math.sin(s), Math.sin(d) * Math.cos(s), -Math.cos(d)];
  const u: V3 = [
    Math.cos(r) * Math.cos(s) + Math.sin(r) * Math.cos(d) * Math.sin(s),
    Math.cos(r) * Math.sin(s) - Math.sin(r) * Math.cos(d) * Math.cos(s),
    -Math.sin(r) * Math.sin(d),
  ];
  return { n: normalize3(n), u: normalize3(u) };
}

/** Equal-area projection of a unit vector to the lower hemisphere (flips up vectors when allowed). */
function projectLower(v: V3, cx: number, cy: number, R: number, allowFlip = false): { x: number; y: number } | null {
  let [vn, ve, vd] = v;
  if (vd < 0) {
    if (!allowFlip) return null;
    vn = -vn; ve = -ve; vd = -vd;
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, vd))); // angle from nadir
  const rho = Math.SQRT2 * Math.sin(theta / 2); // Schmidt radius (0 at nadir, 1 at horizontal)
  const az = Math.atan2(ve, vn);
  return { x: cx + R * rho * Math.sin(az), y: cy - R * rho * Math.cos(az) };
}

/** azimuth (deg from N, clockwise) and plunge (deg below horizontal) of an axis. */
function axisInfo(v: V3): { azimuth: number; plunge: number } {
  let d = v;
  if (d[2] < 0) d = [-d[0], -d[1], -d[2]];
  const plunge = Math.asin(Math.min(1, Math.max(-1, d[2]))) / DEG;
  let az = Math.atan2(d[1], d[0]) / DEG;
  if (az < 0) az += 360;
  return { azimuth: az, plunge };
}

/** Filled compressional region, sampled by radiation sign and merged into one path. */
function buildCompressionalPath(M: number[][], cx: number, cy: number, R: number): string {
  const azStep = 2 * DEG;
  const rSteps = 48;
  const proj = (rho: number, ang: number) =>
    `${(cx + R * rho * Math.sin(ang)).toFixed(2)} ${(cy - R * rho * Math.cos(ang)).toFixed(2)}`;
  let d = '';
  for (let a = 0; a < 2 * Math.PI - 1e-9; a += azStep) {
    const amid = a + azStep / 2;
    const intervals: [number, number][] = [];
    let start = -1;
    for (let k = 0; k <= rSteps; k++) {
      const rho = k / rSteps;
      const theta = 2 * Math.asin(Math.min(1, rho / Math.SQRT2));
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      const v: V3 = [sinT * Math.cos(amid), sinT * Math.sin(amid), cosT];
      const compressional = radiation(M, v) > 0;
      if (compressional && start < 0) start = Math.max(0, (k - 0.5) / rSteps);
      if (!compressional && start >= 0) {
        intervals.push([start, (k - 0.5) / rSteps]);
        start = -1;
      }
    }
    if (start >= 0) intervals.push([start, 1]);
    for (const [r1, r2] of intervals) {
      d += `M ${proj(r1, a)} L ${proj(r2, a)} L ${proj(r2, a + azStep)} L ${proj(r1, a + azStep)} Z `;
    }
  }
  return d.trim();
}

/** Great-circle trace of the plane whose pole is `pole`, clipped to the lower hemisphere. */
function nodalPath(pole: V3, cx: number, cy: number, R: number): string {
  const ref: V3 = Math.abs(pole[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = normalize3(cross3(pole, ref));
  const e2 = normalize3(cross3(pole, e1));
  const N = 240;
  let d = '';
  let pen = false;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const ct = Math.cos(t), st = Math.sin(t);
    const v: V3 = [ct * e1[0] + st * e2[0], ct * e1[1] + st * e2[1], ct * e1[2] + st * e2[2]];
    const pt = projectLower(v, cx, cy, R);
    if (!pt) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)} `;
    pen = true;
  }
  return d.trim();
}

/** Compute the full beach-ball geometry for the preferred nodal plane. */
export function computeBeachball(mechanism: FocalMechanism, size: number = 100): BeachballGeometry | null {
  // The double-couple beach ball is identical for either nodal plane; honour the
  // preferred plane when set, and fall back to whichever plane is available.
  const plane =
    mechanism.preferredPlane === 2 && mechanism.nodalPlane2
      ? mechanism.nodalPlane2
      : mechanism.nodalPlane1 ?? mechanism.nodalPlane2;
  if (!plane) return null;
  const strike = finiteNumber(plane.strike);
  const dip = finiteNumber(plane.dip);
  const rake = finiteNumber(plane.rake);
  const s = Math.max(8, finiteNumber(size, 100));
  const center = s / 2;
  const R = center - Math.max(2, s * 0.04);

  const M = momentTensorNED(strike, dip, rake);
  const { n, u } = normalAndSlip(strike, dip, rake);
  const T = normalize3([n[0] + u[0], n[1] + u[1], n[2] + u[2]]); // tension
  const P = normalize3([n[0] - u[0], n[1] - u[1], n[2] - u[2]]); // pressure
  const tPt = projectLower(T, center, center, R, true)!;
  const pPt = projectLower(P, center, center, R, true)!;

  return {
    size: s,
    center,
    radius: R,
    compressionalPath: buildCompressionalPath(M, center, center, R),
    nodalPaths: [nodalPath(n, center, center, R), nodalPath(u, center, center, R)],
    tAxis: { ...tPt, ...axisInfo(T) },
    pAxis: { ...pPt, ...axisInfo(P) },
  };
}

export interface BeachballStyle {
  fill?: string;        // compressional fill
  background?: string;  // dilatational background
  stroke?: string;      // outline + nodal planes
  showAxes?: boolean;   // draw P/T markers
}

/**
 * Render a correct double-couple beach ball as a standalone SVG string
 * (used for Leaflet markers and anywhere a string is needed).
 */
// Bounded memo cache: map markers re-render the same mechanisms on every pan/zoom.
const beachballSvgCache = new Map<string, string>();
const BEACHBALL_CACHE_MAX = 500;

export function generateBeachBallSVG(
  mechanism: FocalMechanism,
  size: number = 100,
  style: BeachballStyle = {}
): string {
  const np =
    mechanism.preferredPlane === 2 && mechanism.nodalPlane2
      ? mechanism.nodalPlane2
      : mechanism.nodalPlane1 ?? mechanism.nodalPlane2;
  const cacheKey = np
    ? `${np.strike}|${np.dip}|${np.rake}|${size}|${style.fill ?? ''}|${style.background ?? ''}|${style.stroke ?? ''}|${style.showAxes ? 1 : 0}`
    : '';
  if (cacheKey) {
    const hit = beachballSvgCache.get(cacheKey);
    if (hit !== undefined) return hit;
  }
  const g = computeBeachball(mechanism, size);
  if (!g) return '';
  const fill = style.fill ?? '#1f2937';
  const background = style.background ?? '#ffffff';
  const stroke = style.stroke ?? '#111827';
  const clip = `bbclip${Math.round(g.radius)}`;
  const axes = style.showAxes
    ? `<circle cx="${g.tAxis.x.toFixed(1)}" cy="${g.tAxis.y.toFixed(1)}" r="${(g.radius * 0.07).toFixed(1)}" fill="${background}" stroke="${stroke}"/>` +
      `<text x="${g.tAxis.x.toFixed(1)}" y="${(g.tAxis.y + g.radius * 0.045).toFixed(1)}" font-size="${(g.radius * 0.13).toFixed(1)}" text-anchor="middle" fill="${stroke}" font-family="sans-serif">T</text>` +
      `<circle cx="${g.pAxis.x.toFixed(1)}" cy="${g.pAxis.y.toFixed(1)}" r="${(g.radius * 0.07).toFixed(1)}" fill="${fill}" stroke="${stroke}"/>` +
      `<text x="${g.pAxis.x.toFixed(1)}" y="${(g.pAxis.y + g.radius * 0.045).toFixed(1)}" font-size="${(g.radius * 0.13).toFixed(1)}" text-anchor="middle" fill="${background}" font-family="sans-serif">P</text>`
    : '';
  const svg =
    `<svg width="${g.size}" height="${g.size}" viewBox="0 0 ${g.size} ${g.size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Focal mechanism beach ball">` +
    `<defs><clipPath id="${clip}"><circle cx="${g.center}" cy="${g.center}" r="${g.radius}"/></clipPath></defs>` +
    `<circle cx="${g.center}" cy="${g.center}" r="${g.radius}" fill="${background}"/>` +
    `<g clip-path="url(#${clip})"><path d="${g.compressionalPath}" fill="${fill}"/>` +
    g.nodalPaths.map((p) => `<path d="${p}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1, g.radius * 0.02).toFixed(1)}"/>`).join('') +
    `</g>` +
    `<circle cx="${g.center}" cy="${g.center}" r="${g.radius}" fill="none" stroke="${stroke}" stroke-width="${Math.max(1.5, g.radius * 0.025).toFixed(1)}"/>` +
    axes +
    `</svg>`;
  if (cacheKey) {
    if (beachballSvgCache.size >= BEACHBALL_CACHE_MAX) {
      const oldest = beachballSvgCache.keys().next().value;
      if (oldest !== undefined) beachballSvgCache.delete(oldest);
    }
    beachballSvgCache.set(cacheKey, svg);
  }
  return svg;
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
