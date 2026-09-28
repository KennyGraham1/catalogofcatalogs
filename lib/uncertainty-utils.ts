/**
 * Utility functions for calculating and rendering uncertainty ellipses
 * for earthquake location uncertainties
 */

export interface UncertaintyData {
  latitude: number;
  longitude: number;
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;
  time_uncertainty?: number | null;
  azimuthal_gap?: number | null;
  /** OriginUncertainty.horizontalUncertainty (circular), km - the DB column most sources fill. */
  horizontal_uncertainty?: number | null;
  // --- QuakeML 1.2 BED OriginUncertainty horizontal error ellipse -----------
  // These are the real, agency-computed error ellipse: semi-minor axis,
  // semi-major axis and the azimuth (clockwise from north) of the semi-major
  // axis. QuakeML carries the two lengths in metres; the DB convention in this
  // project is km (see lib/quakeml-to-db.ts, which already converts
  // horizontalUncertainty m -> km), so these are km here.
  // They are optional because most stored events do not (yet) carry them.
  /** OriginUncertainty.minHorizontalUncertainty — semi-minor axis, km. */
  min_horizontal_uncertainty?: number | null;
  /** OriginUncertainty.maxHorizontalUncertainty — semi-major axis, km. */
  max_horizontal_uncertainty?: number | null;
  /** OriginUncertainty.azimuthMaxHorizontalUncertainty — degrees clockwise from north. */
  azimuth_max_horizontal_uncertainty?: number | null;
  /**
   * OriginUncertainty.confidenceLevel (C16): the confidence, percent 0-100, that the
   * agency's ellipse/circle above is quoted at. Only meaningful alongside a reported
   * ellipse or circle (min/max_horizontal_uncertainty or horizontal_uncertainty) — it
   * says nothing about the independent lat/lon-marginal fallback, which stays an
   * uncalibrated extent regardless of this field.
   */
  confidence_level?: number | null;
}

export interface UncertaintyEllipse {
  center: [number, number];
  semiMajorAxis: number; // in meters
  semiMinorAxis: number; // in meters
  /**
   * Orientation in degrees, measured COUNTER-CLOCKWISE FROM EAST in the local
   * (east, north) plane — the convention used by generateEllipsePoints below.
   * rotation 0 puts the semi-major axis E-W, rotation 90 puts it N-S.
   * A compass azimuth `az` (clockwise from north) maps to rotation = 90 - az.
   */
  rotation: number;
  /**
   * 0-1 DISPLAY WEIGHT used only to pick a colour/opacity for the drawn shape.
   * It is derived from the azimuthal gap (better gap -> higher value) and is
   * NOT a statistical confidence level: it does not correspond to a 68%/95%
   * confidence region and is independent of the ellipse geometry.
   */
  displayWeight: number;
  /** Provenance of the geometry, so the renderer can label it honestly. */
  source: 'origin-uncertainty' | 'horizontal-circle' | 'latlon-marginals';
  /**
   * False when the source gave the ellipse semi-axes but no azimuth for the major axis.
   * The shape is then a circle of the semi-major radius (no orientation is invented), and
   * reportedSemiMinorAxis (m) keeps the reported minor axis for labelling.
   */
  orientationKnown?: boolean;
  reportedSemiMinorAxis?: number;
  /**
   * OriginUncertainty.confidenceLevel (percent, 0-100), carried through from
   * UncertaintyData.confidence_level when the source event has it AND this ellipse was
   * built from a reported ellipse/circle (source 'origin-uncertainty' or
   * 'horizontal-circle'). describeUncertaintyEllipse shows "N% confidence ellipse" when
   * set, instead of the generic "level the agency states (not recorded here)".
   */
  confidenceLevel?: number;
}

/** Degrees of latitude to km (WGS84 mean); longitude scales by cos(latitude). */
const KM_PER_DEGREE = 111.32;

/**
 * The best available horizontal location uncertainty in kilometres and where it came from:
 * the agency ellipse's semi-major axis, the circular horizontalUncertainty column, or the
 * larger of the latitude/longitude marginals converted at the event latitude.
 */
export function horizontalUncertaintyKm(
  data: UncertaintyData
): { km: number; source: 'origin-uncertainty' | 'horizontal-circle' | 'latlon-marginals' } | null {
  // A reported zero-length axis is a reported (excellent) uncertainty; only the
  // drawing needs a positive radius.
  const major = positiveOrNull(data.max_horizontal_uncertainty);
  if (major !== null) return { km: major, source: 'origin-uncertainty' };
  const circular = positiveOrNull(data.horizontal_uncertainty);
  if (circular !== null) return { km: circular, source: 'horizontal-circle' };
  const latUnc = positiveOrNull(data.latitude_uncertainty);
  const lonUnc = positiveOrNull(data.longitude_uncertainty);
  if (latUnc === null && lonUnc === null) return null;
  const cosLat = Math.cos(((Number.isFinite(data.latitude) ? data.latitude : 0) * Math.PI) / 180);
  return { km: Math.max((latUnc ?? 0) * KM_PER_DEGREE, (lonUnc ?? 0) * KM_PER_DEGREE * cosLat), source: 'latlon-marginals' };
}

/** Finite, non-negative number or null. Anything else is treated as "absent". */
function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Finite percent in [0, 100], or undefined. Anything else is treated as "not recorded". */
function confidenceOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

/**
 * Calculate uncertainty ellipse parameters from QuakeML uncertainty data.
 */
export function calculateUncertaintyEllipse(data: UncertaintyData): UncertaintyEllipse | null {
  const { latitude, longitude, latitude_uncertainty, longitude_uncertainty } = data;

  // HEURISTIC display weight: see the interface doc — not a confidence level.
  let displayWeight = 0.68;
  if (data.azimuthal_gap !== null && data.azimuthal_gap !== undefined) {
    displayWeight = Math.max(0.3, Math.min(0.95, 1 - (data.azimuthal_gap / 360)));
  }

  // 1. Real OriginUncertainty ellipse (km -> m).
  const semiMajorKm = positiveOrNull(data.max_horizontal_uncertainty);
  const semiMinorKm = positiveOrNull(data.min_horizontal_uncertainty);
  if (semiMajorKm !== null && semiMinorKm !== null && semiMajorKm > 0) {
    const majorM = Math.max(semiMajorKm, semiMinorKm) * 1000;
    const minorM = Math.min(semiMajorKm, semiMinorKm) * 1000;
    const azimuth = positiveOrNull(data.azimuth_max_horizontal_uncertainty);
    if (azimuth === null) {
      // azimuthMaxHorizontalUncertainty is its own optional BED element, and CSV imports
      // can carry the axes without it. Reading the absence as azimuth 0 drew the major
      // axis N-S as if the agency had said so. The circle of the semi-major radius is the
      // smallest shape that contains the ellipse in any orientation.
      return {
        center: [latitude, longitude],
        semiMajorAxis: majorM,
        semiMinorAxis: majorM,
        rotation: 0,
        displayWeight,
        source: 'origin-uncertainty',
        orientationKnown: false,
        reportedSemiMinorAxis: minorM,
        confidenceLevel: confidenceOrUndefined(data.confidence_level),
      };
    }
    return {
      center: [latitude, longitude],
      semiMajorAxis: majorM,
      semiMinorAxis: minorM,
      // azimuth is clockwise from north; the renderer measures counter-clockwise
      // from east, so rotation = 90 - azimuth (az 0 -> 90, az 90 -> 0).
      rotation: ((90 - azimuth) % 360 + 360) % 360,
      displayWeight,
      source: 'origin-uncertainty',
      orientationKnown: true,
      confidenceLevel: confidenceOrUndefined(data.confidence_level),
    };
  }

  // 2. Circular OriginUncertainty.horizontalUncertainty (km -> m). A reported 20 km
  //    radius is location metadata and must draw, not vanish because no ellipse or
  //    marginals accompany it.
  //    Precedence is the same as horizontalUncertaintyKm and the quality factor:
  //    ellipse, then circle, then marginals, so the map and the card describe the
  //    same measurement.
  const circularKm = positiveOrNull(data.horizontal_uncertainty);
  if (circularKm !== null && circularKm > 0) {
    return {
      center: [latitude, longitude],
      semiMajorAxis: circularKm * 1000,
      semiMinorAxis: circularKm * 1000,
      rotation: 0,
      displayWeight,
      source: 'horizontal-circle',
      confidenceLevel: confidenceOrUndefined(data.confidence_level),
    };
  }

  // 3. Fallback: independent lat/lon marginals.
  if (!latitude_uncertainty && !longitude_uncertainty) {
    return null;
  }

  // Convert uncertainties from degrees to meters (approximate)
  // 1 degree latitude ≈ 111,000 meters
  // 1 degree longitude ≈ 111,000 * cos(latitude) meters
  const latUncertaintyMeters = (latitude_uncertainty || 0) * 111000;
  const lonUncertaintyMeters = (longitude_uncertainty || 0) * 111000 * Math.cos(latitude * Math.PI / 180);

  const semiMajorAxis = Math.max(latUncertaintyMeters, lonUncertaintyMeters);
  const semiMinorAxis = Math.min(latUncertaintyMeters, lonUncertaintyMeters);

  // Orientation must match the renderer (generateEllipsePoints), where rotation=0
  // puts the semi-major axis along EAST-WEST (longitude). So when LATITUDE (N-S)
  // uncertainty dominates, rotate the major axis to N-S (90 deg); otherwise 0.
  // (This was previously inverted, drawing N-S-uncertain locations elongated E-W.)
  const rotation = latUncertaintyMeters > lonUncertaintyMeters ? 90 : 0;

  return {
    center: [latitude, longitude],
    semiMajorAxis,
    semiMinorAxis,
    rotation,
    displayWeight,
    source: 'latlon-marginals'
  };
}

/**
 * Tooltip text for a drawn uncertainty shape: what was reported and what is drawn.
 * An agency's OriginUncertainty ellipse or circle IS a confidence region, at the
 * OriginUncertainty.confidenceLevel the agency states (e.g. 90% for ISC). When the source
 * event carries that level (C16's confidence_level), it is shown verbatim as "N%
 * confidence ellipse"; otherwise the text calls it unrecorded rather than denying it is a
 * confidence region. Only the lat/lon-marginal construction is an uncalibrated extent:
 * scaling a bivariate normal to probability p needs both semi-axes multiplied by
 * k = sqrt(-2 ln(1 - p)) (1.515 for 68%, 2.448 for 95%), and the marginals carry no
 * covariance. The colour encodes the azimuthal gap, not a confidence level.
 */
export function describeUncertaintyEllipse(ellipse: UncertaintyEllipse): string {
  const km = (m: number) => (m / 1000).toFixed(1);
  const axes = `${km(ellipse.semiMajorAxis)} × ${km(ellipse.semiMinorAxis)} km`;
  const formatConfidence = (level: number) => (Number.isInteger(level) ? String(level) : level.toFixed(1));
  const agencyLevel = ellipse.confidenceLevel !== undefined
    ? `<em>${formatConfidence(ellipse.confidenceLevel)}% confidence ellipse</em>`
    : '<em>Confidence region at the level the agency states (not recorded here)</em>';
  if (ellipse.source === 'origin-uncertainty' && ellipse.orientationKnown === false) {
    const minor = km(ellipse.reportedSemiMinorAxis ?? ellipse.semiMinorAxis);
    return `Location uncertainty<br/>Semi-axes: ${km(ellipse.semiMajorAxis)} × ${minor} km, azimuth not reported<br/>` +
      `QuakeML OriginUncertainty horizontal error ellipse, drawn as a circle of the semi-major axis because its orientation is unknown<br/>${agencyLevel}`;
  }
  if (ellipse.source === 'origin-uncertainty') {
    return `Location uncertainty<br/>Semi-axes: ${axes}<br/>QuakeML OriginUncertainty horizontal error ellipse<br/>${agencyLevel}`;
  }
  if (ellipse.source === 'horizontal-circle') {
    return `Location uncertainty<br/>Radius: ${km(ellipse.semiMajorAxis)} km<br/>QuakeML OriginUncertainty circular horizontal uncertainty (radius)<br/>${agencyLevel}`;
  }
  return `Location uncertainty extent<br/>Semi-axes: ${axes}<br/>Approximate: axis-aligned from independent lat/lon uncertainties (no covariance)<br/><em>Not a 68%/95% confidence region</em>`;
}

/**
 * Generate points for an ellipse polygon (WGS84 lat/lon), used by the Leaflet
 * renderer. `rotation` is counter-clockwise from east in the local (east, north)
 * plane, matching UncertaintyEllipse.rotation.
 */
export function generateEllipsePoints(
  center: [number, number],
  semiMajorAxis: number,
  semiMinorAxis: number,
  rotation: number,
  numPoints: number = 64
): [number, number][] {
  const points: [number, number][] = [];
  const [centerLat, centerLon] = center;
  const rotationRad = (rotation * Math.PI) / 180;

  // Earth's radius in meters
  const R = 6371000;
  const lat1 = (centerLat * Math.PI) / 180;
  const lon1 = (centerLon * Math.PI) / 180;

  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;

    // Point on the ellipse in local coordinates (x = east, y = north), rotated
    // counter-clockwise in the (east, north) plane.
    const x = semiMajorAxis * Math.cos(angle);
    const y = semiMinorAxis * Math.sin(angle);
    const xRotated = x * Math.cos(rotationRad) - y * Math.sin(rotationRad);
    const yRotated = x * Math.sin(rotationRad) + y * Math.cos(rotationRad);

    // Walk that (bearing, distance) along a great circle. The flat-earth
    // offset (lat + dy/R) left the WGS84 domain for wide ellipses near the poles
    // (latitude 83 with an 8-degree marginal produced vertices above 90); the
    // spherical destination formula cannot, and reduces to the same values at
    // ordinary latitudes and sizes.
    const distance = Math.hypot(xRotated, yRotated);
    const bearing = Math.atan2(xRotated, yRotated); // clockwise from north
    const delta = distance / R;
    const sinLat2 = Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(bearing);
    const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
    const lon2 = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(delta) * Math.cos(lat1),
      Math.cos(delta) - Math.sin(lat1) * sinLat2
    );

    // Keep longitude continuous around the centre (no +-360 jump at the
    // antimeridian) so Leaflet draws one polygon rather than a wrap-around.
    let lonDeg = (lon2 * 180) / Math.PI;
    while (lonDeg - centerLon > 180) lonDeg -= 360;
    while (lonDeg - centerLon < -180) lonDeg += 360;

    points.push([(lat2 * 180) / Math.PI, lonDeg]);
  }

  return points;
}

/**
 * Continuous colour ramp for the station-coverage "azimuthal gap" map colour mode
 * (paper sec:viz): green (well-constrained) through yellow to red as the largest gap
 * between reporting stations widens, matching a standard "good to bad" traffic-light
 * hue sweep. Beyond the widely-used 180-degree usability threshold (Havskov &
 * Ottemoller, 2010, sec. 6.3; GeoNet quality flags) the ramp keeps going but swings
 * into magenta/violet hues instead of staying red, so poorly-constrained events are
 * unmistakably highlighted rather than blending into the same red as a 175-degree gap.
 * A missing gap is grey, never a guessed position on the ramp.
 */
export function getAzimuthalGapColor(gap: number | null | undefined): string {
  if (gap === null || gap === undefined || !Number.isFinite(gap)) return '#94a3b8'; // slate-400: unknown
  const clamped = Math.max(0, Math.min(360, gap));
  if (clamped <= 180) {
    const hue = 142 - 142 * (clamped / 180); // 142 (green) at 0 deg -> 0 (red) at 180 deg
    return `hsl(${hue.toFixed(1)}, 85%, 45%)`;
  }
  const over = clamped - 180; // 0..180 beyond the 180 deg threshold
  const hue = 360 - 100 * (over / 180); // continues 0/360 (red) -> 260 (blue-violet)
  return `hsl(${hue.toFixed(1)}, 100%, 38%)`;
}

/**
 * Get colour for the uncertainty ellipse from its display weight.
 *
 * NOTE: the weight is a network-geometry heuristic (see
 * UncertaintyEllipse.displayWeight), so these bands describe how well the event
 * was surrounded by stations — they are NOT confidence levels.
 */
export function getUncertaintyColor(displayWeight: number): string {
  if (displayWeight >= 0.9) return '#22c55e'; // Green - small azimuthal gap
  if (displayWeight >= 0.7) return '#eab308'; // Yellow
  if (displayWeight >= 0.5) return '#f97316'; // Orange
  return '#ef4444'; // Red - large azimuthal gap
}

/**
 * Get opacity for uncertainty ellipse from its display weight
 */
export function getUncertaintyOpacity(displayWeight: number): number {
  return Math.max(0.1, Math.min(0.4, displayWeight * 0.5));
}

/**
 * Create Leaflet ellipse options for uncertainty visualization
 */
export function createUncertaintyEllipseOptions(ellipse: UncertaintyEllipse) {
  return {
    color: getUncertaintyColor(ellipse.displayWeight),
    fillColor: getUncertaintyColor(ellipse.displayWeight),
    fillOpacity: getUncertaintyOpacity(ellipse.displayWeight),
    weight: 1,
    dashArray: '5, 5',
  };
}

export interface LocationQualityFactors {
  horizontalUncertainty: number | null;
  depthUncertainty: number | null;
  azimuthalGap: number | null;
  timeUncertainty: number | null;
}

export interface LocationQuality {
  /** 0-100 weighted mean of the factors that are actually documented, or null when none are. */
  score: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  /** Per-factor 0-100 sub-score; null where the event carries no such metadata. */
  factors: LocationQualityFactors;
  /** Fraction (0-1) of the total scoring weight backed by real metadata. */
  metadataCoverage: number;
  /** Names of the factors that were actually scored. */
  scoredFactors: Array<keyof LocationQualityFactors>;
}

// Relative weights of the four factors; they sum to 100 so that a fully
// documented event scores exactly 100 - (sum of penalties), as before.
const QUALITY_WEIGHTS: Record<keyof LocationQualityFactors, number> = {
  horizontalUncertainty: 30,
  depthUncertainty: 20,
  azimuthalGap: 30,
  timeUncertainty: 20,
};

/**
 * Calculate a location-quality score from the uncertainty/quality metadata.
 *
 * IMPORTANT: absence of a field is NOT scored as quality. Only the factors the
 * event actually documents are scored, and the overall score is the weighted
 * mean over those factors; `metadataCoverage` reports how much of the scoring
 * weight that represents. An event with no uncertainty metadata at all returns
 * score = null / grade = null rather than a perfect 100/A.
 */
export function calculateLocationQuality(data: UncertaintyData): LocationQuality {
  const factors: LocationQualityFactors = {
    horizontalUncertainty: null,
    depthUncertainty: null,
    azimuthalGap: null,
    timeUncertainty: null,
  };

  // Each sub-score is 100 * (1 - penaltyFraction), where penaltyFraction is the
  // same ramp as before expressed as a fraction of the factor's weight.
  const ramp = (value: number, worst: number) => 100 * (1 - Math.min(1, Math.max(0, value / worst)));

  // Horizontal uncertainty: the ellipse semi-major axis or circular
  // horizontalUncertainty column (km, floor at 0.1 deg = 11.1 km) when reported,
  // otherwise the larger lat/lon marginal (degrees, floor at 0.1 deg). A stored 20 km
  // radius used to be ignored entirely because only the marginals were read.
  // The same resolution the card badge uses (ellipse, circle, then marginals converted
  // at the event latitude), so badge and bar cannot disagree at high latitude.
  const horizontal = horizontalUncertaintyKm(data);
  if (horizontal !== null) {
    factors.horizontalUncertainty = ramp(horizontal.km, 0.1 * KM_PER_DEGREE);
  }

  // Depth uncertainty (km): excellent < 1 km, floor at 10 km
  const depthUnc = positiveOrNull(data.depth_uncertainty);
  if (depthUnc !== null) {
    factors.depthUncertainty = ramp(depthUnc, 10);
  }

  // Azimuthal gap (degrees): excellent < 90°, floor at 270°
  const gap = positiveOrNull(data.azimuthal_gap);
  if (gap !== null) {
    factors.azimuthalGap = ramp(gap, 270);
  }

  // Time uncertainty (seconds): excellent < 0.1 s, floor at 1 s
  const timeUnc = positiveOrNull(data.time_uncertainty);
  if (timeUnc !== null) {
    factors.timeUncertainty = ramp(timeUnc, 1);
  }

  const scoredFactors = (Object.keys(QUALITY_WEIGHTS) as Array<keyof LocationQualityFactors>)
    .filter(key => factors[key] !== null);

  const availableWeight = scoredFactors.reduce((sum, key) => sum + QUALITY_WEIGHTS[key], 0);
  const totalWeight = Object.values(QUALITY_WEIGHTS).reduce((sum, w) => sum + w, 0);
  const metadataCoverage = availableWeight / totalWeight;

  if (availableWeight === 0) {
    // No uncertainty metadata at all — refuse to invent a grade.
    return { score: null, grade: null, factors, metadataCoverage: 0, scoredFactors };
  }

  const weighted = scoredFactors.reduce(
    (sum, key) => sum + QUALITY_WEIGHTS[key] * (factors[key] as number),
    0
  ) / availableWeight;

  const score = Math.max(0, Math.min(100, Math.round(weighted)));

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return { score, grade, factors, metadataCoverage, scoredFactors };
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
export function getUncertaintyLevel(
  uncertainty: number | null | undefined,
  type: 'horizontal' | 'horizontal-km' | 'depth' | 'time'
): {
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  description: string;
} {
  if (uncertainty === null || uncertainty === undefined) {
    return { level: 'unknown', description: 'No uncertainty data available' };
  }

  // 'horizontal' takes degrees (marginals); 'horizontal-km' takes kilometres. Both use
  // the same 1 / 5 / 10 km bands (0.01 deg ~ 1.1 km).
  if (type === 'horizontal' || type === 'horizontal-km') {
    const km = type === 'horizontal' ? uncertainty * KM_PER_DEGREE : uncertainty;
    if (km < 1) return { level: 'excellent', description: 'Very precise location (< 1 km)' };
    if (km < 5) return { level: 'good', description: 'Good location precision (1-5 km)' };
    if (km < 10) return { level: 'fair', description: 'Fair location precision (5-10 km)' };
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
