/**
 * Comprehensive field definitions for earthquake catalogue schema mapping
 * Includes all QuakeML 1.2 BED (Basic Event Description) fields
 */

export interface FieldDefinition {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'event_metadata' | 'origin_uncertainty' | 'magnitude' | 'quality' | 'evaluation' | 'complex';
  required: boolean;
  type: 'string' | 'number' | 'datetime' | 'json';
  unit?: string;
  example?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
  quakemlPath?: string; // Path in QuakeML XML structure
}

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  // ===== BASIC REQUIRED FIELDS =====
  {
    id: 'id',
    name: 'Event ID',
    description: 'Unique identifier for the earthquake event',
    category: 'basic',
    required: true,
    type: 'string',
    example: 'nz2024abcd',
    quakemlPath: 'event/@publicID'
  },
  {
    id: 'time',
    name: 'Origin Time',
    description: 'Date and time when the earthquake occurred (ISO 8601 format)',
    category: 'basic',
    required: true,
    type: 'datetime',
    example: '2024-10-24T12:34:56.789Z',
    quakemlPath: 'event/origin/time/value'
  },
  {
    id: 'latitude',
    name: 'Latitude',
    description: 'Geographic latitude of the earthquake epicenter in decimal degrees',
    category: 'basic',
    required: true,
    type: 'number',
    unit: 'degrees',
    example: '-41.2865',
    validation: { min: -90, max: 90 },
    quakemlPath: 'event/origin/latitude/value'
  },
  {
    id: 'longitude',
    name: 'Longitude',
    description: 'Geographic longitude of the earthquake epicenter in decimal degrees',
    category: 'basic',
    required: true,
    type: 'number',
    unit: 'degrees',
    example: '174.7762',
    validation: { min: -180, max: 180 },
    quakemlPath: 'event/origin/longitude/value'
  },
  {
    id: 'depth',
    name: 'Depth',
    description: 'Depth of the earthquake hypocenter below sea level',
    category: 'basic',
    required: false,
    type: 'number',
    unit: 'km',
    example: '33.0',
    validation: { min: 0, max: 1000 },
    quakemlPath: 'event/origin/depth/value'
  },
  {
    id: 'magnitude',
    name: 'Magnitude',
    description: 'Magnitude of the earthquake (preferred magnitude value)',
    category: 'basic',
    required: true,
    type: 'number',
    example: '5.8',
    validation: { min: -2, max: 10 },
    quakemlPath: 'event/magnitude/mag/value'
  },
  
  // ===== BASIC OPTIONAL FIELDS =====
  {
    id: 'source',
    name: 'Data Source',
    description: 'Agency or organization that provided the data',
    category: 'basic',
    required: false,
    type: 'string',
    example: 'GeoNet, ISC, Local Network',
    quakemlPath: 'event/creationInfo/agencyID'
  },
  {
    id: 'region',
    name: 'Region',
    description: 'Geographic region or location description',
    category: 'basic',
    required: false,
    type: 'string',
    example: '10 km NE of Wellington, New Zealand'
  },
  
  // ===== QUAKEML 1.2 EVENT METADATA =====
  {
    id: 'event_public_id',
    name: 'Event Public ID',
    description: 'QuakeML public identifier (Resource Identifier)',
    category: 'event_metadata',
    required: false,
    type: 'string',
    example: 'smi:nz.org.geonet/2024abcd',
    quakemlPath: 'event/@publicID'
  },
  {
    id: 'event_type',
    name: 'Event Type',
    description: 'Type of seismic event',
    category: 'event_metadata',
    required: false,
    type: 'string',
    example: 'earthquake, quarry blast, explosion, not existing',
    validation: {
      enum: ['not existing', 'not reported', 'earthquake', 'anthropogenic event', 'collapse', 
             'cavity collapse', 'mine collapse', 'building collapse', 'explosion', 'accidental explosion',
             'chemical explosion', 'controlled explosion', 'experimental explosion', 'industrial explosion',
             'mining explosion', 'quarry blast', 'road cut', 'blasting levee', 'nuclear explosion',
             'induced or triggered event', 'rock burst', 'reservoir loading', 'fluid injection',
             'fluid extraction', 'crash', 'plane crash', 'train crash', 'boat crash', 'other event',
             'atmospheric event', 'sonic boom', 'sonic blast', 'acoustic noise', 'thunder', 'avalanche',
             'snow avalanche', 'debris avalanche', 'hydroacoustic event', 'ice quake', 'slide',
             'landslide', 'rockslide', 'meteorite', 'volcanic eruption']
    },
    quakemlPath: 'event/type'
  },
  {
    id: 'event_type_certainty',
    name: 'Event Type Certainty',
    description: 'Certainty of the event type classification',
    category: 'event_metadata',
    required: false,
    type: 'string',
    example: 'known, suspected',
    validation: { enum: ['known', 'suspected'] },
    quakemlPath: 'event/typeCertainty'
  },
  
  // ===== ORIGIN UNCERTAINTIES =====
  {
    id: 'time_uncertainty',
    name: 'Time Uncertainty',
    description: 'Uncertainty of the origin time',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'seconds',
    example: '0.5',
    validation: { min: 0 },
    quakemlPath: 'event/origin/time/uncertainty'
  },
  {
    id: 'latitude_uncertainty',
    name: 'Latitude Uncertainty',
    description: 'Uncertainty of the latitude in kilometers',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'km',
    example: '2.5',
    validation: { min: 0 },
    quakemlPath: 'event/origin/latitude/uncertainty'
  },
  {
    id: 'longitude_uncertainty',
    name: 'Longitude Uncertainty',
    description: 'Uncertainty of the longitude in kilometers',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'km',
    example: '3.1',
    validation: { min: 0 },
    quakemlPath: 'event/origin/longitude/uncertainty'
  },
  {
    id: 'depth_uncertainty',
    name: 'Depth Uncertainty',
    description: 'Uncertainty of the depth',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'km',
    example: '5.0',
    validation: { min: 0 },
    quakemlPath: 'event/origin/depth/uncertainty'
  },
  
  // ===== MAGNITUDE DETAILS =====
  {
    id: 'magnitude_type',
    name: 'Magnitude Type',
    description: 'Type of magnitude scale used',
    category: 'magnitude',
    required: false,
    type: 'string',
    example: 'ML, Mw, mb, Ms, Md',
    validation: { enum: ['ML', 'Ms', 'mb', 'Mw', 'Md', 'Mwp', 'M', 'MwpRF', 'Mwc', 'Mwr', 'Mjma'] },
    quakemlPath: 'event/magnitude/type'
  },
  {
    id: 'magnitude_uncertainty',
    name: 'Magnitude Uncertainty',
    description: 'Uncertainty of the magnitude value',
    category: 'magnitude',
    required: false,
    type: 'number',
    example: '0.2',
    validation: { min: 0 },
    quakemlPath: 'event/magnitude/mag/uncertainty'
  },
  {
    id: 'magnitude_station_count',
    name: 'Magnitude Station Count',
    description: 'Number of stations used to calculate the magnitude',
    category: 'magnitude',
    required: false,
    type: 'number',
    example: '25',
    validation: { min: 0 },
    quakemlPath: 'event/magnitude/stationCount'
  },
  
  // ===== ORIGIN QUALITY METRICS =====
  {
    id: 'azimuthal_gap',
    name: 'Azimuthal Gap',
    description: 'Largest azimuthal gap between stations',
    category: 'quality',
    required: false,
    type: 'number',
    unit: 'degrees',
    example: '120',
    validation: { min: 0, max: 360 },
    quakemlPath: 'event/origin/quality/azimuthalGap'
  },
  {
    id: 'used_phase_count',
    name: 'Used Phase Count',
    description: 'Number of seismic phases used in location',
    category: 'quality',
    required: false,
    type: 'number',
    example: '45',
    validation: { min: 0 },
    quakemlPath: 'event/origin/quality/usedPhaseCount'
  },
  {
    id: 'used_station_count',
    name: 'Used Station Count',
    description: 'Number of stations used in location',
    category: 'quality',
    required: false,
    type: 'number',
    example: '18',
    validation: { min: 0 },
    quakemlPath: 'event/origin/quality/usedStationCount'
  },
  {
    id: 'standard_error',
    name: 'Standard Error',
    description: 'RMS of the residuals of the arrival time data',
    category: 'quality',
    required: false,
    type: 'number',
    unit: 'seconds',
    example: '0.35',
    validation: { min: 0 },
    quakemlPath: 'event/origin/quality/standardError'
  },
  
  // ===== EVALUATION METADATA =====
  {
    id: 'evaluation_mode',
    name: 'Evaluation Mode',
    description: 'Mode of evaluation (manual or automatic)',
    category: 'evaluation',
    required: false,
    type: 'string',
    example: 'manual, automatic',
    validation: { enum: ['manual', 'automatic'] },
    quakemlPath: 'event/origin/evaluationMode'
  },
  {
    id: 'evaluation_status',
    name: 'Evaluation Status',
    description: 'Status of the evaluation',
    category: 'evaluation',
    required: false,
    type: 'string',
    example: 'preliminary, reviewed, final, rejected',
    validation: { enum: ['preliminary', 'confirmed', 'reviewed', 'final', 'rejected'] },
    quakemlPath: 'event/origin/evaluationStatus'
  },
  
  // ===== COMPLEX NESTED DATA (JSON) =====
  {
    id: 'origin_quality',
    name: 'Origin Quality',
    description: 'Complete origin quality information as JSON',
    category: 'complex',
    required: false,
    type: 'json',
    example: '{"usedPhaseCount": 45, "usedStationCount": 18, "standardError": 0.35}',
    quakemlPath: 'event/origin/quality'
  },
  {
    id: 'origins',
    name: 'Origins',
    description: 'All origin solutions as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"publicID": "smi:...", "time": {...}, "latitude": {...}}]',
    quakemlPath: 'event/origin'
  },
  {
    id: 'magnitudes',
    name: 'Magnitudes',
    description: 'All magnitude determinations as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"publicID": "smi:...", "mag": {...}, "type": "ML"}]',
    quakemlPath: 'event/magnitude'
  },
  {
    id: 'picks',
    name: 'Picks',
    description: 'Seismic phase picks as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"publicID": "smi:...", "time": {...}, "phaseHint": "P"}]',
    quakemlPath: 'event/pick'
  },
  {
    id: 'arrivals',
    name: 'Arrivals',
    description: 'Phase arrivals at stations as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"pickID": "smi:...", "phase": "P", "azimuth": 45.2}]',
    quakemlPath: 'event/origin/arrival'
  },
  {
    id: 'focal_mechanisms',
    name: 'Focal Mechanisms',
    description: 'Focal mechanism solutions as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"publicID": "smi:...", "nodalPlanes": {...}}]',
    quakemlPath: 'event/focalMechanism'
  },
  {
    id: 'amplitudes',
    name: 'Amplitudes',
    description: 'Amplitude measurements as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"publicID": "smi:...", "genericAmplitude": {...}}]',
    quakemlPath: 'event/amplitude'
  },
  {
    id: 'station_magnitudes',
    name: 'Station Magnitudes',
    description: 'Station magnitude contributions as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"publicID": "smi:...", "mag": {...}, "stationID": "NZ.WEL"}]',
    quakemlPath: 'event/stationMagnitude'
  },
  {
    id: 'event_descriptions',
    name: 'Event Descriptions',
    description: 'Textual event descriptions as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"text": "10 km NE of Wellington", "type": "region name"}]',
    quakemlPath: 'event/description'
  },
  {
    id: 'comments',
    name: 'Comments',
    description: 'Additional comments as JSON array',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"text": "Felt widely in the region", "id": "comment1"}]',
    quakemlPath: 'event/comment'
  },
  {
    id: 'creation_info',
    name: 'Creation Info',
    description: 'Information about data creation as JSON',
    category: 'complex',
    required: false,
    type: 'json',
    example: '{"agencyID": "GeoNet", "author": "auto", "creationTime": "..."}',
    quakemlPath: 'event/creationInfo'
  }
];

// Helper functions
export function getFieldById(id: string): FieldDefinition | undefined {
  return FIELD_DEFINITIONS.find(f => f.id === id);
}

export function getFieldsByCategory(category: string): FieldDefinition[] {
  return FIELD_DEFINITIONS.filter(f => f.category === category);
}

export function getRequiredFields(): FieldDefinition[] {
  return FIELD_DEFINITIONS.filter(f => f.required);
}

export function getOptionalFields(): FieldDefinition[] {
  return FIELD_DEFINITIONS.filter(f => !f.required);
}

export const FIELD_CATEGORIES = [
  { id: 'basic', name: 'Basic Fields', description: 'Essential earthquake parameters' },
  { id: 'event_metadata', name: 'Event Metadata', description: 'Event classification and identification' },
  { id: 'origin_uncertainty', name: 'Origin Uncertainties', description: 'Location and time uncertainties' },
  { id: 'magnitude', name: 'Magnitude Details', description: 'Magnitude type and quality' },
  { id: 'quality', name: 'Quality Metrics', description: 'Solution quality indicators' },
  { id: 'evaluation', name: 'Evaluation Metadata', description: 'Review and processing status' },
  { id: 'complex', name: 'Complex Data', description: 'Nested QuakeML structures (JSON)' }
];

// ====================================================================
// FIELD ALIAS MAPPINGS for auto-detection
// Comprehensive aliases for QuakeML 1.2, GeoNet, ISC, and common formats
// ====================================================================

/**
 * Field alias definitions for auto-detection
 * Each field has exactMatches (case-sensitive) and aliases (normalized comparison)
 */
export const FIELD_ALIASES: Record<string, { exactMatches: string[]; aliases: string[] }> = {
  // Basic fields
  id: {
    exactMatches: ['id', 'ID', 'Id'],
    aliases: ['eventid', 'event_id', 'publicid', 'public_id', 'evid', 'eid', 'quakemlid']
  },
  time: {
    exactMatches: ['time', 'Time', 'TIME'],
    aliases: ['datetime', 'date', 'origintime', 'origin_time', 'timestamp', 'origin', 'ot', 'otime']
  },
  latitude: {
    exactMatches: ['latitude', 'Latitude', 'LATITUDE', 'Lat', 'LAT'],
    aliases: ['lat', 'y', 'ylat', 'originlat', 'origin_latitude', 'evla']
  },
  longitude: {
    exactMatches: ['longitude', 'Longitude', 'LONGITUDE', 'Lon', 'LON', 'Long', 'LONG'],
    aliases: ['lon', 'lng', 'long', 'x', 'xlon', 'originlon', 'origin_longitude', 'evlo']
  },
  depth: {
    exactMatches: ['depth', 'Depth', 'DEPTH', 'Depth/km'],
    aliases: ['dep', 'z', 'depthkm', 'depth_km', 'evdp', 'origindepth', 'origin_depth']
  },
  magnitude: {
    exactMatches: ['magnitude', 'Magnitude', 'MAGNITUDE', 'Mag', 'MAG'],
    aliases: ['mag', 'm', 'prefmag', 'pref_magnitude']
  },

  // Region/Location
  region: {
    exactMatches: ['region', 'Region', 'REGION'],
    aliases: ['flinnengdahl', 'flinn_engdahl', 'fe_region', 'geo_region', 'area']
  },
  location_name: {
    exactMatches: ['location_name', 'location', 'Location'],
    aliases: ['locationname', 'place', 'placename', 'description', 'event_description']
  },

  // Event metadata
  event_public_id: {
    exactMatches: ['event_public_id', 'publicID', 'PublicID'],
    aliases: ['publicid', 'quakemlid', 'quakeml_id', 'resourceid', 'resource_id']
  },
  event_type: {
    exactMatches: ['event_type', 'EventType', 'eventType'],
    aliases: ['eventtype', 'type', 'etype', 'seismic_type']
  },
  event_type_certainty: {
    exactMatches: ['event_type_certainty', 'typeCertainty'],
    aliases: ['typecertainty', 'eventcertainty', 'type_certainty']
  },

  // Uncertainties
  time_uncertainty: {
    exactMatches: ['time_uncertainty', 'timeUncertainty'],
    aliases: ['timeerror', 'time_error', 'oterror', 'ot_uncertainty', 'stime']
  },
  latitude_uncertainty: {
    exactMatches: ['latitude_uncertainty', 'latitudeUncertainty'],
    aliases: ['laterror', 'lat_error', 'lat_uncertainty', 'slat']
  },
  longitude_uncertainty: {
    exactMatches: ['longitude_uncertainty', 'longitudeUncertainty'],
    aliases: ['lonerror', 'lon_error', 'long_error', 'lon_uncertainty', 'slon']
  },
  depth_uncertainty: {
    exactMatches: ['depth_uncertainty', 'depthUncertainty'],
    aliases: ['deptherror', 'depth_error', 'sdepth', 'sdep', 'z_error']
  },
  horizontal_uncertainty: {
    exactMatches: ['horizontal_uncertainty', 'horizontalUncertainty'],
    aliases: ['horizontalerror', 'horiz_unc', 'h_uncertainty', 'herr', 'horizontal_error', 'seh']
  },

  // Origin metadata
  depth_type: {
    exactMatches: ['depth_type', 'depthType'],
    aliases: ['depthtype', 'depth_method', 'depthflag', 'depth_determination']
  },
  earth_model_id: {
    exactMatches: ['earth_model_id', 'earthModelID'],
    aliases: ['earthmodelid', 'velocity_model', 'earth_model', 'velmodel', 'vel_model', 'vmodel']
  },
  method_id: {
    exactMatches: ['method_id', 'methodID'],
    aliases: ['methodid', 'location_method', 'locmethod', 'loc_method', 'algorithm']
  },

  // Agency/Author
  agency_id: {
    exactMatches: ['agency_id', 'agencyID', 'Agency'],
    aliases: ['agencyid', 'agency', 'source_agency', 'contributor', 'source', 'network', 'net']
  },
  author: {
    exactMatches: ['author', 'Author', 'AUTHOR'],
    aliases: ['analyst', 'created_by', 'createdby', 'reporter', 'originator']
  },

  // Magnitude details
  magnitude_type: {
    exactMatches: ['magnitude_type', 'magnitudeType', 'MagType'],
    aliases: ['magtype', 'mag_type', 'mtype', 'magnitudeclass']
  },
  magnitude_uncertainty: {
    exactMatches: ['magnitude_uncertainty', 'magnitudeUncertainty'],
    aliases: ['magerror', 'mag_error', 'smag', 'magnitude_error']
  },
  magnitude_station_count: {
    exactMatches: ['magnitude_station_count', 'magnitudeStationCount'],
    aliases: ['magstationcount', 'mag_nst', 'nstmag', 'magnitude_nsta']
  },
  magnitude_method_id: {
    exactMatches: ['magnitude_method_id', 'magnitudeMethodID'],
    aliases: ['magmethod', 'mag_method', 'magnitude_method', 'magmethodid']
  },
  magnitude_evaluation_mode: {
    exactMatches: ['magnitude_evaluation_mode', 'magnitudeEvaluationMode'],
    aliases: ['magevalmode', 'mag_eval_mode', 'magnitude_mode', 'magmode']
  },
  magnitude_evaluation_status: {
    exactMatches: ['magnitude_evaluation_status', 'magnitudeEvaluationStatus'],
    aliases: ['magevalstatus', 'mag_eval_status', 'magnitude_status', 'magstatus']
  },

  // Quality metrics
  azimuthal_gap: {
    exactMatches: ['azimuthal_gap', 'azimuthalGap'],
    aliases: ['azgap', 'az_gap', 'gap', 'azimuthgap', 'azimuth_gap']
  },
  used_phase_count: {
    exactMatches: ['used_phase_count', 'usedPhaseCount'],
    aliases: ['nph', 'ndef', 'n_def', 'phases_used', 'usedphases', 'numphases', 'phasecount']
  },
  used_station_count: {
    exactMatches: ['used_station_count', 'usedStationCount'],
    aliases: ['nst', 'nsta', 'stations_used', 'usedstations', 'numstations', 'stationcount']
  },
  standard_error: {
    exactMatches: ['standard_error', 'standardError'],
    aliases: ['rms', 'rmserror', 'rms_error', 'residual', 'sres']
  },
  minimum_distance: {
    exactMatches: ['minimum_distance', 'minimumDistance'],
    aliases: ['mindist', 'min_dist', 'minimumdistance', 'dmin', 'nearest_station']
  },
  maximum_distance: {
    exactMatches: ['maximum_distance', 'maximumDistance'],
    aliases: ['maxdist', 'max_dist', 'maximumdistance', 'dmax', 'farthest_station']
  },
  associated_phase_count: {
    exactMatches: ['associated_phase_count', 'associatedPhaseCount'],
    aliases: ['associatedphasecount', 'phase_count', 'nass', 'total_phases', 'nassocphases']
  },
  associated_station_count: {
    exactMatches: ['associated_station_count', 'associatedStationCount'],
    aliases: ['associatedstationcount', 'station_count', 'total_stations', 'nassocstations']
  },
  depth_phase_count: {
    exactMatches: ['depth_phase_count', 'depthPhaseCount'],
    aliases: ['depthphasecount', 'depth_phases', 'ndepthphases', 'n_depth_phases']
  },

  // Evaluation
  evaluation_mode: {
    exactMatches: ['evaluation_mode', 'evaluationMode'],
    aliases: ['evalmode', 'eval_mode', 'mode', 'analysismode', 'analysis_mode']
  },
  evaluation_status: {
    exactMatches: ['evaluation_status', 'evaluationStatus'],
    aliases: ['evalstatus', 'eval_status', 'status', 'reviewstatus', 'review_status']
  }
};

/**
 * Normalize a field name for comparison
 */
export function normalizeFieldName(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1$2')
    .toLowerCase()
    .replace(/[_\-\s.]/g, '');
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) based on Levenshtein distance
 */
export function calculateSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}

/**
 * Field mapping result with confidence score
 */
export interface FieldMappingResult {
  sourceField: string;
  targetField: string | null;
  confidence: number;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'none';
}

/**
 * Auto-detect the best matching target field for a source field name
 */
export function detectFieldMapping(sourceField: string): FieldMappingResult {
  const normalizedSource = normalizeFieldName(sourceField);

  let bestMatch: FieldMappingResult = {
    sourceField,
    targetField: null,
    confidence: 0,
    matchType: 'none'
  };

  for (const [fieldId, aliases] of Object.entries(FIELD_ALIASES)) {
    // Check exact matches first (highest confidence)
    if (aliases.exactMatches.includes(sourceField)) {
      return { sourceField, targetField: fieldId, confidence: 1.0, matchType: 'exact' };
    }

    // Check normalized exact match against field ID
    if (normalizedSource === normalizeFieldName(fieldId)) {
      return { sourceField, targetField: fieldId, confidence: 0.98, matchType: 'exact' };
    }

    // Check aliases
    for (const alias of aliases.aliases) {
      const normalizedAlias = normalizeFieldName(alias);

      if (normalizedSource === normalizedAlias) {
        return { sourceField, targetField: fieldId, confidence: 0.95, matchType: 'alias' };
      }

      // Check partial matches
      if (normalizedSource.includes(normalizedAlias) || normalizedAlias.includes(normalizedSource)) {
        const similarity = calculateSimilarity(normalizedSource, normalizedAlias);
        if (similarity * 0.9 > bestMatch.confidence) {
          bestMatch = { sourceField, targetField: fieldId, confidence: similarity * 0.9, matchType: 'alias' };
        }
      }
    }

    // Fuzzy match on field ID
    const similarity = calculateSimilarity(normalizedSource, normalizeFieldName(fieldId));
    if (similarity > 0.7 && similarity * 0.85 > bestMatch.confidence) {
      bestMatch = { sourceField, targetField: fieldId, confidence: similarity * 0.85, matchType: 'fuzzy' };
    }
  }

  return bestMatch;
}

/**
 * Custom field mapping entry (from user settings)
 */
export interface CustomFieldMapping {
  id: string;
  sourcePattern: string;
  targetField: string;
  isRegex: boolean;
  priority: number;
}

/**
 * Options for field mapping detection
 */
export interface FieldMappingOptions {
  minConfidence?: number;
  customMappings?: CustomFieldMapping[];
  useBuiltInAliases?: boolean;
}

/**
 * Check if a source field matches a custom mapping pattern
 */
function matchesCustomMapping(sourceField: string, mapping: CustomFieldMapping): boolean {
  if (mapping.isRegex) {
    try {
      const regex = new RegExp(mapping.sourcePattern, 'i');
      return regex.test(sourceField);
    } catch {
      return false;
    }
  }
  // Case-insensitive exact match for non-regex patterns
  return sourceField.toLowerCase() === mapping.sourcePattern.toLowerCase();
}

/**
 * Auto-detect the best matching target field using custom mappings first
 */
export function detectFieldMappingWithCustom(
  sourceField: string,
  customMappings: CustomFieldMapping[] = []
): FieldMappingResult {
  // Sort custom mappings by priority (higher first)
  const sortedCustom = [...customMappings].sort((a, b) => b.priority - a.priority);

  // Check custom mappings first
  for (const mapping of sortedCustom) {
    if (matchesCustomMapping(sourceField, mapping)) {
      return {
        sourceField,
        targetField: mapping.targetField,
        confidence: mapping.priority / 100, // Convert priority to confidence
        matchType: 'exact' // Custom mappings are treated as exact matches
      };
    }
  }

  // Fall back to built-in detection
  return detectFieldMapping(sourceField);
}

/**
 * Auto-detect mappings for all source fields, avoiding duplicates
 */
export function detectAllFieldMappings(
  sourceFields: string[],
  minConfidence: number = 0.6,
  options?: FieldMappingOptions
): Record<string, string> {
  const usedTargets = new Set<string>();
  const result: Record<string, string> = {};
  const customMappings = options?.customMappings || [];
  const useBuiltIn = options?.useBuiltInAliases !== false;
  const confidence = options?.minConfidence ?? minConfidence;

  // Get mappings sorted by confidence
  const mappings = sourceFields
    .map(field => {
      // If we have custom mappings, use them first
      if (customMappings.length > 0) {
        return detectFieldMappingWithCustom(field, customMappings);
      }
      // Otherwise use built-in detection
      return useBuiltIn ? detectFieldMapping(field) : {
        sourceField: field,
        targetField: null,
        confidence: 0,
        matchType: 'none' as const
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  for (const mapping of mappings) {
    if (mapping.targetField &&
        mapping.confidence >= confidence &&
        !usedTargets.has(mapping.targetField)) {
      result[mapping.sourceField] = mapping.targetField;
      usedTargets.add(mapping.targetField);
    }
  }

  return result;
}

/**
 * Check if all required fields are mapped
 */
export function checkRequiredFieldsMapped(mappings: Record<string, string>): {
  complete: boolean;
  missing: string[];
} {
  const requiredFields = getRequiredFields();
  const mappedTargets = new Set(Object.values(mappings));
  const missing = requiredFields
    .filter(field => !mappedTargets.has(field.id))
    .map(field => field.id);

  return { complete: missing.length === 0, missing };
}

/**
 * Get default field mappings configuration for initialization
 */
export function getDefaultFieldMappingsConfig() {
  const mappings: CustomFieldMapping[] = [];
  let id = 0;

  for (const [targetField, aliases] of Object.entries(FIELD_ALIASES)) {
    // Add exact matches with high priority
    for (const exactMatch of aliases.exactMatches) {
      mappings.push({
        id: `default-${id++}`,
        sourcePattern: exactMatch,
        targetField,
        isRegex: false,
        priority: 100
      });
    }
    // Add aliases with medium priority
    for (const alias of aliases.aliases) {
      mappings.push({
        id: `default-${id++}`,
        sourcePattern: alias,
        targetField,
        isRegex: false,
        priority: 50
      });
    }
  }

  return {
    autoDetectEnabled: true,
    strictValidation: false,
    fuzzyMatchThreshold: 0.6,
    formats: {
      csv: { enabled: true, mappings: [] },
      json: { enabled: true, mappings: [] },
      quakeml: { enabled: true, mappings: [] },
      geojson: { enabled: true, mappings: [] }
    },
    customMappings: mappings.slice(0, 50) // Return first 50 as defaults
  };
}

