/**
 * Comprehensive field definitions for earthquake catalogue schema mapping
 * Includes all QuakeML 1.2 BED (Basic Event Description) fields
 */

import { z } from 'zod';
import { inferMagnitudeTypeFromColumn } from './earthquake-utils';

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
    description: 'Depth of the earthquake hypocenter below sea level; negative values are above sea level (e.g. volcanic events beneath a summit, mining-induced events)',
    category: 'basic',
    required: false,
    type: 'number',
    unit: 'km',
    example: '33.0',
    // The ranges here are shown to depositors as the accepted range, so they must match what
    // the platform actually enforces: earthquakeEventSchema in lib/validation.ts and
    // validateDepth() in lib/earthquake-utils.ts both accept -5 to 1000 km. The negative band
    // exists for above-sea-level sources (Taupo Volcanic Zone, Ruapehu, Whakaari, mining);
    // documenting a floor of 0 made depositors drop or clamp those legitimate events.
    validation: { min: -5, max: 1000 },
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
    // Matches the -3 floor enforced by earthquakeEventSchema in lib/validation.ts and
    // validateMagnitude() in lib/earthquake-utils.ts; borehole/mine microseismicity is
    // routinely catalogued below M -2.
    validation: { min: -3, max: 10 },
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
  {
    id: 'location_name',
    name: 'Location Name',
    description: 'Place name or textual description of the event location',
    category: 'event_metadata',
    required: false,
    type: 'string',
    example: '20 km north-east of Seddon',
    quakemlPath: 'event/description/text'
  },
  {
    id: 'agency_id',
    name: 'Agency',
    description: 'Agency that produced the origin solution',
    category: 'event_metadata',
    required: false,
    type: 'string',
    example: 'WEL, ISC, us',
    quakemlPath: 'event/origin/creationInfo/agencyID'
  },
  {
    id: 'author',
    name: 'Author',
    description: 'Analyst or program that produced the origin solution',
    category: 'event_metadata',
    required: false,
    type: 'string',
    example: 'scautoloc',
    quakemlPath: 'event/origin/creationInfo/author'
  },

  // ===== ORIGIN UNCERTAINTIES =====
  // The units and ranges declared here are rendered to depositors as the accepted range
  // (components/settings/DefaultFieldMappings.tsx), so they mirror the bounds enforced by
  // earthquakeEventSchema in lib/validation.ts.
  {
    id: 'time_uncertainty',
    name: 'Time Uncertainty',
    description: 'Uncertainty of the origin time',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'seconds',
    example: '0.5',
    // Upper bound of one day covers pre-instrumental origin times, which the platform admits
    // back to 1000 CE and which are often known only to the nearest hour or day.
    validation: { min: 0, max: 86400 },
    quakemlPath: 'event/origin/time/uncertainty'
  },
  {
    id: 'latitude_uncertainty',
    name: 'Latitude Uncertainty',
    // DEGREES, not km. This is the QuakeML RealQuantity uncertainty carried on
    // origin/latitude, whose value is in degrees, and the platform reads it that way
    // throughout (metricsFromEvent() in lib/quality-scoring.ts and calculateUncertaintyEllipse()
    // in lib/uncertainty-utils.ts both convert it with 111 km/degree). Documenting it as km
    // invited depositors to supply kilometres, which are then read as degrees - a 2.5 km
    // uncertainty would be interpreted as ~278 km.
    description: 'Uncertainty of the latitude in decimal degrees (multiply by 111 km/degree for kilometres)',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'degrees',
    example: '0.022',
    validation: { min: 0, max: 10 },
    quakemlPath: 'event/origin/latitude/uncertainty'
  },
  {
    id: 'longitude_uncertainty',
    name: 'Longitude Uncertainty',
    // DEGREES, not km - see the note on latitude_uncertainty above. A degree of longitude is
    // 111 km x cos(latitude), i.e. ~84 km at New Zealand latitudes.
    description: 'Uncertainty of the longitude in decimal degrees (multiply by 111 km/degree x cos(latitude) for kilometres)',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'degrees',
    example: '0.030',
    validation: { min: 0, max: 10 },
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
    validation: { min: 0, max: 100 },
    quakemlPath: 'event/origin/depth/uncertainty'
  },
  // The error-ellipse fields below are stored columns the parser already maps (herr, seh,
  // smaj, ...). They are defined here so the schema step can show, re-map and unmap them;
  // their ranges are the insert validator's (EVENT_OPTIONAL_RANGES in lib/db.ts). QuakeML
  // carries these lengths in metres; the platform stores kilometres.
  {
    id: 'horizontal_uncertainty',
    name: 'Horizontal Uncertainty',
    description: 'Horizontal location uncertainty (radius of the epicentre error)',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'km',
    example: '1.5',
    validation: { min: 0, max: 100 },
    quakemlPath: 'event/origin/originUncertainty/horizontalUncertainty'
  },
  {
    id: 'min_horizontal_uncertainty',
    name: 'Error Ellipse Semi-minor Axis',
    description: 'Semi-minor axis of the horizontal error ellipse',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'km',
    example: '0.8',
    validation: { min: 0, max: 100 },
    quakemlPath: 'event/origin/originUncertainty/minHorizontalUncertainty'
  },
  {
    id: 'max_horizontal_uncertainty',
    name: 'Error Ellipse Semi-major Axis',
    description: 'Semi-major axis of the horizontal error ellipse',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'km',
    example: '2.1',
    validation: { min: 0, max: 100 },
    quakemlPath: 'event/origin/originUncertainty/maxHorizontalUncertainty'
  },
  {
    id: 'azimuth_max_horizontal_uncertainty',
    name: 'Error Ellipse Azimuth',
    description: 'Azimuth of the error ellipse semi-major axis, clockwise from north',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'degrees',
    example: '35',
    validation: { min: 0, max: 360 },
    quakemlPath: 'event/origin/originUncertainty/azimuthMaxHorizontalUncertainty'
  },
  {
    id: 'confidence_level',
    name: 'Uncertainty Confidence Level',
    description: 'Confidence level of the horizontal uncertainty / error ellipse',
    category: 'origin_uncertainty',
    required: false,
    type: 'number',
    unit: 'percent',
    example: '68',
    validation: { min: 0, max: 100 },
    quakemlPath: 'event/origin/originUncertainty/confidenceLevel'
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
    validation: { min: 0, max: 5 },
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
    validation: { min: 0, max: 5000 },
    quakemlPath: 'event/magnitude/stationCount'
  },
  {
    id: 'magnitude_method_id',
    name: 'Magnitude Method',
    description: 'Method or agency used to compute the magnitude',
    category: 'magnitude',
    required: false,
    type: 'string',
    example: 'smi:nz.org.geonet/magnitude/ML',
    quakemlPath: 'event/magnitude/methodID'
  },

  // ===== ORIGIN QUALITY METRICS =====
  // Maxima mirror the sanity bounds enforced by earthquakeEventSchema in lib/validation.ts;
  // the counts are sized for agency-reviewed solutions of large NZ events, which routinely
  // use several thousand phases from well over 500 stations.
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
    validation: { min: 0, max: 10000 },
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
    validation: { min: 0, max: 5000 },
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
    validation: { min: 0, max: 100 },
    quakemlPath: 'event/origin/quality/standardError'
  },
  {
    id: 'associated_phase_count',
    name: 'Associated Phase Count',
    description: 'Number of phases associated with the origin (used or not)',
    category: 'quality',
    required: false,
    type: 'number',
    example: '60',
    validation: { min: 0, max: 10000 },
    quakemlPath: 'event/origin/quality/associatedPhaseCount'
  },
  {
    id: 'associated_station_count',
    name: 'Associated Station Count',
    description: 'Number of stations associated with the origin (used or not)',
    category: 'quality',
    required: false,
    type: 'number',
    example: '24',
    validation: { min: 0, max: 5000 },
    quakemlPath: 'event/origin/quality/associatedStationCount'
  },
  {
    id: 'depth_phase_count',
    name: 'Depth Phase Count',
    description: 'Number of depth phases (e.g. pP, sP) used to constrain the depth',
    category: 'quality',
    required: false,
    type: 'number',
    example: '3',
    validation: { min: 0, max: 1000 },
    quakemlPath: 'event/origin/quality/depthPhaseCount'
  },
  {
    id: 'minimum_distance',
    name: 'Minimum Station Distance',
    description: 'Epicentral distance to the nearest station used',
    category: 'quality',
    required: false,
    type: 'number',
    unit: 'degrees',
    example: '0.12',
    validation: { min: 0, max: 180 },
    quakemlPath: 'event/origin/quality/minimumDistance'
  },
  {
    id: 'maximum_distance',
    name: 'Maximum Station Distance',
    description: 'Epicentral distance to the farthest station used',
    category: 'quality',
    required: false,
    type: 'number',
    unit: 'degrees',
    example: '8.4',
    validation: { min: 0, max: 180 },
    quakemlPath: 'event/origin/quality/maximumDistance'
  },
  {
    id: 'depth_type',
    name: 'Depth Type',
    description: 'How the depth was determined',
    category: 'quality',
    required: false,
    type: 'string',
    example: 'from location, operator assigned',
    validation: {
      enum: ['from location', 'from moment tensor inversion', 'from modeling of broad-band P waveforms',
             'constrained by depth phases', 'constrained by direct phases',
             'constrained by S-P time differences', 'operator assigned', 'other']
    },
    quakemlPath: 'event/origin/depthType'
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
    id: 'source_events',
    name: 'Source Events (lineage)',
    description: 'Where the event came from, as a JSON list of source entries (kept when an export is re-imported)',
    category: 'complex',
    required: false,
    type: 'json',
    example: '[{"source": "upload", "eventId": "2024p000001"}]'
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
    aliases: ['lat', 'lats', 'y', 'ylat', 'originlat', 'origin_latitude', 'evla']
  },
  longitude: {
    exactMatches: ['longitude', 'Longitude', 'LONGITUDE', 'Lon', 'LON', 'Long', 'LONG'],
    aliases: ['lon', 'lons', 'lng', 'long', 'x', 'xlon', 'originlon', 'origin_longitude', 'evlo']
  },
  depth: {
    exactMatches: ['depth', 'Depth', 'DEPTH', 'Depth/km'],
    // The unit-bearing spellings are listed so the parser resolves them: its file-level
    // unit decision (inferDepthUnit in lib/parsers.ts) reads the unit from the column
    // name, so a 'depth_m' column is converted from metres once for the whole file
    // instead of being left unmapped and guessed per value later.
    aliases: ['dep', 'depths', 'z', 'depthkm', 'depth_km', 'evdp', 'origindepth', 'origin_depth',
              'CD', 'cd', 'centroid_depth', 'centroiddepth',
              'depth (km)', 'depth(km)', 'depth [km]', 'depth[km]', 'depth/km', 'depth_kilometres', 'depth_kilometers',
              'depth_m', 'depth (m)', 'depth(m)', 'depth [m]', 'depth[m]', 'depth/m', 'depth_metres', 'depth_meters']
  },
  magnitude: {
    // Mw / ML are common named-type columns; schema mapper lets user choose which wins
    exactMatches: ['magnitude', 'Magnitude', 'MAGNITUDE', 'Mag', 'MAG', 'Mw', 'MW', 'mw', 'ML', 'ml'],
    aliases: ['mag', 'm', 'mpref', 'prefmag', 'pref_magnitude']
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
  // Identity and lineage columns of the platform's own CSV export (lib/exporters.ts
  // CSV_EVENT_HEADERS), so an exported catalogue re-imports with the same source IDs
  // (duplicate detection keys on source_id) and preferred-solution references.
  source_id: {
    exactMatches: ['source_id', 'SourceID', 'sourceId'],
    aliases: ['sourceid']
  },
  source_event_type: {
    exactMatches: ['source_event_type', 'SourceEventType', 'sourceEventType'],
    aliases: ['sourceeventtype']
  },
  preferred_origin_id: {
    exactMatches: ['preferred_origin_id', 'PreferredOriginID', 'preferredOriginID'],
    aliases: ['preferredoriginid']
  },
  preferred_magnitude_id: {
    exactMatches: ['preferred_magnitude_id', 'PreferredMagnitudeID', 'preferredMagnitudeID'],
    aliases: ['preferredmagnitudeid']
  },
  preferred_focal_mechanism_id: {
    exactMatches: ['preferred_focal_mechanism_id', 'PreferredFocalMechanismID', 'preferredFocalMechanismID'],
    aliases: ['preferredfocalmechanismid']
  },
  // The event's lineage (JSON list of source entries); kept on re-import of an export.
  source_events: {
    exactMatches: ['source_events', 'SourceEventsJSON', 'sourceEvents'],
    aliases: ['sourceeventsjson', 'source_events_json']
  },
  event_type: {
    exactMatches: ['event_type', 'EventType', 'eventType'],
    // A bare 'type' column is the EVENT type in the most widely copied catalogue schema
    // (USGS ComCat CSV/GeoJSON: type = earthquake / quarry blast, magType = the scale).
    // A file whose 'type' column holds magnitude scale codes instead (ML, Mw, ...) is still
    // stored correctly: parsedEventToDbFields moves a scale code found in event_type to
    // magnitude_type, so the value decides the meaning, not the header.
    aliases: ['eventtype', 'etype', 'seismic_type', 'type']
  },
  event_type_certainty: {
    exactMatches: ['event_type_certainty', 'typeCertainty', 'EventTypeCertainty'],
    aliases: ['typecertainty', 'eventcertainty', 'type_certainty', 'eventtypecertainty']
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
  min_horizontal_uncertainty: {
    exactMatches: ['min_horizontal_uncertainty', 'minHorizontalUncertainty'],
    aliases: ['semi_minor_axis', 'semiminoraxis', 'smin']
  },
  max_horizontal_uncertainty: {
    exactMatches: ['max_horizontal_uncertainty', 'maxHorizontalUncertainty'],
    aliases: ['semi_major_axis', 'semimajoraxis', 'smaj']
  },
  azimuth_max_horizontal_uncertainty: {
    exactMatches: ['azimuth_max_horizontal_uncertainty', 'azimuthMaxHorizontalUncertainty'],
    aliases: ['ellipse_azimuth', 'sazimuth', 'saz']
  },
  confidence_level: {
    exactMatches: ['confidence_level', 'confidenceLevel', 'ConfidenceLevel'],
    aliases: ['confidencelevel', 'conf_level', 'ellipse_confidence']
  },

  // Origin metadata
  depth_type: {
    exactMatches: ['depth_type', 'depthType'],
    aliases: ['depthtype', 'depth_method', 'depthflag', 'depth_determination',
              'depthfixed', 'depth_fixed', 'fixeddepth', 'fixed_depth']
  },
  earth_model_id: {
    exactMatches: ['earth_model_id', 'earthModelID'],
    aliases: ['earthmodelid', 'velocity_model', 'earth_model', 'velmodel', 'vel_model', 'vmodel']
  },
  method_id: {
    exactMatches: ['method_id', 'methodID'],
    aliases: ['methodid', 'location_method', 'locmethod', 'loc_method', 'algorithm',
              'Method', 'method', 'invmethod', 'inversion_method']
  },

  // Agency/Author
  agency_id: {
    exactMatches: ['agency_id', 'agencyID', 'Agency'],
    aliases: ['agencyid', 'agency', 'source_agency', 'contributor', 'network', 'net',
              'locsource', 'loc_source', 'location_source', 'origsource', 'orig_source']
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
    aliases: ['magmethod', 'mag_method', 'magnitude_method', 'magmethodid',
              'magsource', 'mag_source', 'magnitude_source']
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
    aliases: ['nst', 'nsta', 'stations_used', 'usedstations', 'numstations', 'stationcount',
              'NS', 'ns', 'mt_stations', 'nstations']
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
  },

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
 * Field mapping result with confidence score.
 *
 * matchType: 'exact' and 'alias' come from the alias table (the same table the parser
 * resolves columns with); 'custom' is an explicit rule from Settings; 'fuzzy' is a
 * similarity guess and is the only kind a confidence threshold applies to.
 */
export interface FieldMappingResult {
  sourceField: string;
  targetField: string | null;
  confidence: number;
  matchType: 'exact' | 'alias' | 'custom' | 'fuzzy' | 'none';
}

/**
 * Column names of split date/time components. They feed the parser's timestamp
 * synthesis (synthesizeTimestamp in lib/parsers.ts) and are never schema fields, so
 * they are excluded from similarity matching: 'min' is a substring of the ellipse alias
 * 'smin' and 'sec' of nothing useful, and matching them stored the minute of the origin
 * time as a 45 km semi-minor axis.
 */
export const DATE_TIME_COMPONENT_COLUMNS = new Set([
  'year', 'yr', 'yyyy', 'yy',
  'month', 'mon', 'mo', 'mm',
  'day', 'dy', 'dd', 'dom', 'doy', 'jday', 'julday', 'julianday',
  'hour', 'hr', 'hh', 'hours',
  'minute', 'min', 'mn', 'minutes',
  'second', 'sec', 'ss', 'seconds', 'msec', 'millisecond', 'milliseconds',
]);

/**
 * The magnitude scale a column header names ('Ms', 'mb', 'ML', 'mag_Mw' ...), in its
 * conventional spelling, or null when the header is not a scale name. Such a column
 * carries a value AND its scale, so it must never be similarity-matched onto another
 * field ('Ms' is a substring of the RMS alias 'rms'), and an explicit choice of it as the
 * event magnitude also fixes magnitude_type. This is the parser's own reading of the
 * name (inferMagnitudeTypeFromColumn), so the schema step and the stored magnitude type
 * always agree. CSV headers arrive lower-cased, so 'mb' there is short-period mb.
 */
export function magnitudeScaleFromColumnName(name: string): string | null {
  return inferMagnitudeTypeFromColumn(name);
}

/**
 * Words that can surround a field name in a header without changing the quantity:
 * units and descriptors ('depth_km', 'origin_time_utc', 'event_latitude'). A header whose
 * extra words are anything else ('depth_err', 'magnitude_type', 'lat_uncertainty') is a
 * different quantity and must not be matched to the bare field.
 */
const NEUTRAL_HEADER_TOKENS = new Set([
  'km', 'kms', 'kilometre', 'kilometres', 'kilometer', 'kilometers',
  'm', 'metre', 'metres', 'meter', 'meters',
  'deg', 'degs', 'degree', 'degrees', 'decimal',
  'utc', 'gmt', 'iso', 'z',
  'value', 'val', 'origin', 'event', 'ev', 'evt', 'hypo', 'hypocentre', 'hypocenter',
  'epicentre', 'epicenter', 'preferred', 'pref',
]);

/** Shortest alias (after normalisation) that may be matched inside a longer header. */
const MIN_PARTIAL_ALIAS_LENGTH = 4;

/** Confidence given to a whole-word match inside a longer header ('event_latitude'). */
const TOKEN_MATCH_CONFIDENCE = 0.8;

/** Split a header into lower-case words at separators and camelCase boundaries. */
export function tokenizeFieldName(fieldName: string): string[] {
  return String(fieldName ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * True when `normalizedAlias` equals a run of whole words of the header and every other
 * word is neutral (unit or descriptor). Substrings inside a word never match: 'ms' is
 * not found in 'rms' and 'min' not in 'smin'.
 */
function matchesAliasAtWordBoundary(sourceTokens: string[], normalizedAlias: string): boolean {
  if (normalizedAlias.length < MIN_PARTIAL_ALIAS_LENGTH || sourceTokens.length < 2) return false;
  for (let start = 0; start < sourceTokens.length; start++) {
    let joined = '';
    for (let end = start; end < sourceTokens.length; end++) {
      joined += sourceTokens[end];
      if (joined.length > normalizedAlias.length) break;
      if (joined === normalizedAlias) {
        const rest = [...sourceTokens.slice(0, start), ...sourceTokens.slice(end + 1)];
        if (rest.length > 0 && rest.every(token => NEUTRAL_HEADER_TOKENS.has(token))) return true;
      }
    }
  }
  return false;
}

/**
 * Auto-detect the best matching target field for a source field name.
 *
 * Exact and alias matches use the alias table the parser resolves columns with.
 * Anything looser is a 'fuzzy' guess: a whole-word match inside a longer header whose
 * other words are units or descriptors, or a near spelling of a field id. Split date/time
 * component columns and magnitude-scale columns (Ms, mb, Md, ...) are never guessed.
 */
export function detectFieldMapping(sourceField: string): FieldMappingResult {
  const normalizedSource = normalizeFieldName(sourceField);
  const none: FieldMappingResult = { sourceField, targetField: null, confidence: 0, matchType: 'none' };

  // The parser's own resolution first (resolveHeaderAlias), so a header resolves here
  // exactly as it does on upload: exact spellings take precedence over another field's
  // lower-case alias ('PublicID' is the event public ID, not the event ID), and a
  // bracketed unit the field accepts is set aside ('Depth (km)').
  const parserTarget = resolveHeaderAlias(sourceField);
  if (parserTarget && FIELD_ALIASES[parserTarget]?.exactMatches.includes(sourceField)) {
    return { sourceField, targetField: parserTarget, confidence: 1.0, matchType: 'exact' };
  }
  if (parserTarget) {
    const isExactSpelling = FIELD_ALIASES[parserTarget]?.exactMatches
      .some(exact => exact.toLowerCase() === String(sourceField).toLowerCase());
    return { sourceField, targetField: parserTarget, confidence: isExactSpelling ? 0.98 : 0.95, matchType: isExactSpelling ? 'exact' : 'alias' };
  }

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
      if (normalizedSource === normalizeFieldName(alias)) {
        return { sourceField, targetField: fieldId, confidence: 0.95, matchType: 'alias' };
      }
    }
  }

  // Not a known name. Split-time components and scale-named magnitude columns are
  // resolved by the parser (or chosen explicitly by the user), never by similarity.
  if (!normalizedSource ||
      DATE_TIME_COMPONENT_COLUMNS.has(normalizedSource) ||
      magnitudeScaleFromColumnName(sourceField) !== null) {
    return none;
  }

  const sourceTokens = tokenizeFieldName(sourceField);
  // A near-spelling is only a typo of a field when the header is a single word apart from
  // units/descriptors; 'magnitude_err' is close to 'magnitude' but is another quantity.
  const coreTokens = sourceTokens.filter(token => !NEUTRAL_HEADER_TOKENS.has(token));
  const typoCandidate = coreTokens.length === 1 ? coreTokens[0] : null;
  let bestMatch = none;

  for (const [fieldId, aliases] of Object.entries(FIELD_ALIASES)) {
    // Whole-word match of a field name or alias inside a longer header
    const names = [fieldId, ...aliases.exactMatches, ...aliases.aliases];
    if (bestMatch.confidence < TOKEN_MATCH_CONFIDENCE &&
        names.some(name => matchesAliasAtWordBoundary(sourceTokens, normalizeFieldName(name)))) {
      bestMatch = { sourceField, targetField: fieldId, confidence: TOKEN_MATCH_CONFIDENCE, matchType: 'fuzzy' };
    }

    // Near spelling of the field id (typos such as 'lattitude')
    if (typoCandidate) {
      const similarity = calculateSimilarity(typoCandidate, normalizeFieldName(fieldId));
      if (similarity > 0.7 && similarity * 0.85 > bestMatch.confidence) {
        bestMatch = { sourceField, targetField: fieldId, confidence: similarity * 0.85, matchType: 'fuzzy' };
      }
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
  /** Threshold for 'fuzzy' matches only; exact, alias and Settings matches always apply. */
  minConfidence?: number;
  customMappings?: CustomFieldMapping[];
  useBuiltInAliases?: boolean;
}

/** Longest source pattern (and header) a Settings rule is evaluated on. */
export const MAX_MAPPING_PATTERN_LENGTH = 200;

/**
 * Check if a source field matches a custom mapping pattern. A malformed rule (missing or
 * non-string pattern, invalid or oversized regex) matches nothing instead of throwing:
 * one bad saved rule must not break the schema step of every upload.
 */
function matchesCustomMapping(sourceField: string, mapping: CustomFieldMapping): boolean {
  const pattern = mapping?.sourcePattern;
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > MAX_MAPPING_PATTERN_LENGTH) {
    return false;
  }
  if (typeof sourceField !== 'string' || sourceField.length > MAX_MAPPING_PATTERN_LENGTH) return false;
  if (mapping.isRegex) {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(sourceField);
    } catch {
      return false;
    }
  }
  // Case-insensitive exact match for non-regex patterns
  return sourceField.toLowerCase() === pattern.toLowerCase();
}

/** Priority orders Settings rules (1-100, higher first); it is not a confidence. */
function mappingPriority(mapping: CustomFieldMapping): number {
  const priority = Number(mapping?.priority);
  return Number.isFinite(priority) ? priority : 0;
}

/**
 * True for a target a column can be mapped to: a schema field definition or a field the
 * alias table (and so the parser) knows. Anything else would be silently dropped on save.
 */
export function isKnownTargetField(targetField: unknown): targetField is string {
  return typeof targetField === 'string' &&
    (FIELD_DEFINITIONS.some(field => field.id === targetField) ||
      Object.prototype.hasOwnProperty.call(FIELD_ALIASES, targetField));
}

/** Settings rules matching a header, highest priority first. */
function matchingCustomMappings(sourceField: string, customMappings: CustomFieldMapping[]): CustomFieldMapping[] {
  return customMappings
    .filter(mapping => isKnownTargetField(mapping?.targetField) && matchesCustomMapping(sourceField, mapping))
    .sort((a, b) => mappingPriority(b) - mappingPriority(a));
}

/**
 * Auto-detect the best matching target field using custom mappings first.
 *
 * A matching Settings rule is an explicit instruction, so it applies with confidence 1;
 * its priority only decides between several matching rules.
 */
export function detectFieldMappingWithCustom(
  sourceField: string,
  customMappings: CustomFieldMapping[] = []
): FieldMappingResult {
  const [rule] = matchingCustomMappings(sourceField, customMappings);
  if (rule) {
    return { sourceField, targetField: rule.targetField, confidence: 1.0, matchType: 'custom' };
  }

  // Fall back to built-in detection
  return detectFieldMapping(sourceField);
}

/**
 * Rank of a column as the event magnitude, mirroring the parser's resolution (a
 * scale-named Mw column wins, then the generic magnitude, then ML), so a detected
 * mapping never prefers a column the parser would not choose.
 */
function magnitudeRank(sourceField: string): number {
  const scale = magnitudeScaleFromColumnName(sourceField);
  if (scale === 'Mw') return 0;
  if (scale === null) return 1;
  if (scale === 'ML') return 2;
  return 3;
}

/**
 * Auto-detect mappings for all source fields, one source per target.
 *
 * Every header gets an ordered list of candidates: the Settings rules that match it
 * (confidence 1, ordered by priority), then the built-in detection. A threshold only
 * rejects 'fuzzy' candidates. Candidates are assigned greedily, explicit rules first,
 * and a header whose rule loses its target to another header falls back to its next
 * candidate instead of being left unmapped.
 */
export function detectAllFieldMappings(
  sourceFields: string[],
  minConfidence: number = 0.6,
  options?: FieldMappingOptions
): Record<string, string> {
  const usedTargets = new Set<string>();
  const assignedSources = new Set<string>();
  const result: Record<string, string> = {};
  const customMappings = Array.isArray(options?.customMappings) ? options!.customMappings! : [];
  const useBuiltIn = options?.useBuiltInAliases !== false;
  const threshold = options?.minConfidence ?? minConfidence;

  interface Candidate extends FieldMappingResult {
    targetField: string;
    priority: number;
    order: number;
  }
  const candidates: Candidate[] = [];

  sourceFields.forEach((field, order) => {
    for (const rule of matchingCustomMappings(field, customMappings)) {
      candidates.push({
        sourceField: field,
        targetField: rule.targetField,
        confidence: 1.0,
        matchType: 'custom',
        priority: mappingPriority(rule),
        order,
      });
    }
    if (useBuiltIn) {
      const detected = detectFieldMapping(field);
      if (detected.targetField && (detected.matchType !== 'fuzzy' || detected.confidence >= threshold)) {
        candidates.push({ ...detected, targetField: detected.targetField, priority: 0, order });
      }
    }
  });

  // Built-in exact/alias candidates for the event magnitude are ordered by the parser's
  // preference rather than by confidence ('ml' is an exact match, 'mag' only an alias, yet
  // the generic column is the one the parser keeps). Encoding the rank in the sort key
  // keeps the comparator a total order.
  const sortKey = (candidate: Candidate): number =>
    candidate.matchType !== 'custom' && candidate.matchType !== 'fuzzy' && candidate.targetField === 'magnitude'
      ? 1 - magnitudeRank(candidate.sourceField) / 1000
      : candidate.confidence;

  candidates.sort((a, b) => {
    const explicitA = a.matchType === 'custom' ? 1 : 0;
    const explicitB = b.matchType === 'custom' ? 1 : 0;
    if (explicitA !== explicitB) return explicitB - explicitA;
    if (explicitA && a.priority !== b.priority) return b.priority - a.priority;
    const keyDelta = sortKey(b) - sortKey(a);
    if (keyDelta !== 0) return keyDelta;
    return a.order - b.order;
  });

  for (const candidate of candidates) {
    if (assignedSources.has(candidate.sourceField) || usedTargets.has(candidate.targetField)) continue;
    result[candidate.sourceField] = candidate.targetField;
    assignedSources.add(candidate.sourceField);
    usedTargets.add(candidate.targetField);
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

// ====================================================================
// PARSER RESOLUTION AND EXPLICIT MAPPING CHANGES (contract C14)
//
// The upload stores the parser's events: every column the alias table knows is already
// resolved, with the file's date format, depth unit and longitude convention applied.
// The schema step therefore starts from that resolution and only records what the user
// (or an explicit Settings rule) changes. Per file, a change is either
//   set:   target <- column   (the server re-reads the raw cell with the parser's rules)
//   unset: target             (the user chose not to map the column it came from)
// ====================================================================

/** Stored scalar fields every event must have. */
export const REQUIRED_EVENT_FIELDS: readonly string[] = ['time', 'latitude', 'longitude', 'magnitude'];

/** A column mapped to this value in an explicit mapping is deliberately not mapped. */
export const DO_NOT_MAP = '';

/**
 * True for a target a raw column can be explicitly mapped to: a known stored field
 * holding a scalar. JSON structures (origins, focal mechanisms ...) are assembled by
 * the parser and cannot be filled from one cell.
 */
export function isMappableTargetField(targetField: unknown): targetField is string {
  return isKnownTargetField(targetField) && getFieldById(targetField)?.type !== 'json';
}

/** The generic magnitude column names the parser reads, in the order it prefers them. */
const GENERIC_MAGNITUDE_KEYS = ['magnitude', 'Magnitude', 'MAGNITUDE', 'Mag', 'MAG', 'mag', 'm', 'M', 'mpref', 'prefmag', 'pref_magnitude'];
const MW_MAGNITUDE_KEYS = ['Mw', 'MW', 'mw'];
const ML_MAGNITUDE_KEYS = ['ML', 'ml'];

let parserAliasLookup: Map<string, string> | null = null;

/** Exact spellings (as written and lower-cased) and aliases, as lib/parsers.ts builds them. */
function getParserAliasLookup(): Map<string, string> {
  if (parserAliasLookup) return parserAliasLookup;
  const lookup = new Map<string, string>();
  for (const [targetField, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const exact of aliases.exactMatches) {
      lookup.set(exact, targetField);
      lookup.set(exact.toLowerCase(), targetField);
    }
    for (const alias of aliases.aliases) {
      const key = alias.toLowerCase();
      if (!lookup.has(key)) lookup.set(key, targetField);
    }
  }
  parserAliasLookup = lookup;
  return lookup;
}

let normalizedParserAliasLookup: Map<string, string> | null = null;

/** Every field name, exact spelling and alias under normalizeFieldName; FIELD_ALIASES order wins. */
function getNormalizedParserAliasLookup(): Map<string, string> {
  if (normalizedParserAliasLookup) return normalizedParserAliasLookup;
  const lookup = new Map<string, string>();
  for (const [targetField, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const name of [targetField, ...aliases.exactMatches, ...aliases.aliases]) {
      const key = normalizeFieldName(name);
      if (key && !lookup.has(key)) lookup.set(key, targetField);
    }
  }
  normalizedParserAliasLookup = lookup;
  return lookup;
}

/** Units a bracketed header annotation may name, by the unit the field is stored in. */
const HEADER_UNITS = {
  length: /^(?:km|kms|kilomet(?:re|er)s?|m|met(?:re|er)s?)$/i,
  angle: /^(?:deg|degs|degrees?|°|decimal degrees?)$/i,
  seconds: /^(?:s|sec|secs|seconds?)$/i,
  zone: /^(?:utc|gmt|z)$/i,
};

/** The unit kind each field accepts in a header annotation (see resolveHeaderAlias). */
const HEADER_UNIT_KIND: Record<string, keyof typeof HEADER_UNITS> = {
  depth: 'length', depth_uncertainty: 'length', horizontal_uncertainty: 'length',
  min_horizontal_uncertainty: 'length', max_horizontal_uncertainty: 'length',
  latitude: 'angle', longitude: 'angle', latitude_uncertainty: 'angle', longitude_uncertainty: 'angle',
  azimuthal_gap: 'angle', azimuth_max_horizontal_uncertainty: 'angle',
  minimum_distance: 'angle', maximum_distance: 'angle',
  time_uncertainty: 'seconds', standard_error: 'seconds',
  time: 'zone',
};

const resolvedHeaderCache = new Map<string, string | null>();

/**
 * The field the parser maps a column or key name to, resolved exactly as lib/parsers.ts
 * lookupAlias does (that module cannot be loaded in the browser, so the schema step
 * replays it here; keep the two in step). The exact spelling is tried first, then lower
 * case, then the name under normalizeFieldName ('Origin Time', 'Horizontal Error'). A
 * bracketed unit ('Depth (km)', 'Horizontal Error (m)', 'Origin Time (UTC)') is set
 * aside only when it is a unit the field is stored in or converted from, so
 * 'Origin Time (NZST)' or 'Lat Error (km)' stay unmapped rather than misread.
 */
export function resolveHeaderAlias(name: string): string | undefined {
  if (typeof name !== 'string' || name === '') return undefined;
  const cached = resolvedHeaderCache.get(name);
  if (cached !== undefined) return cached ?? undefined;

  const lookup = getParserAliasLookup();
  const byName = (candidate: string): string | null =>
    lookup.get(candidate) ?? lookup.get(candidate.toLowerCase()) ??
    getNormalizedParserAliasLookup().get(normalizeFieldName(candidate)) ?? null;

  let target = byName(name);
  if (!target) {
    const annotated = name.match(/^(.*?\S)\s*[([]\s*([^()[\]]*?)\s*[)\]]\s*$/);
    if (annotated) {
      const base = byName(annotated[1]);
      const kind = base ? HEADER_UNIT_KIND[base] : undefined;
      if (base && kind && HEADER_UNITS[kind].test(annotated[2])) target = base;
    }
  }
  resolvedHeaderCache.set(name, target);
  return target ?? undefined;
}

/**
 * Canonical target -> the column the parser filled it from, for one file.
 *
 * `reported` is the parse result's resolvedFieldSources. Where it names a real column
 * it is used as is; otherwise (older parse results, or a magnitude reported by its role
 * rather than its column) the parser's column resolution is replayed: first matching
 * column wins, then the magnitude preference (a scale-named Mw column, then the generic
 * magnitude, then ML). A value assembled from several columns keeps its '+'-joined
 * source and is never treated as one column.
 */
export function resolveParserFieldSources(
  fields: string[],
  reported?: Record<string, string> | null,
): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const field of fields) {
    const target = resolveHeaderAlias(field);
    if (target && !(target in sources)) sources[target] = field;
  }

  const present = (names: string[]) => names.find(name => fields.includes(name));
  const mw = present(MW_MAGNITUDE_KEYS);
  const ml = present(ML_MAGNITUDE_KEYS);
  if (mw || ml) {
    const magnitudeColumn = mw ?? present(GENERIC_MAGNITUDE_KEYS) ?? ml;
    if (magnitudeColumn) sources.magnitude = magnitudeColumn;
  }

  // No time column: the parser assembles the origin time from split date/time columns.
  if (!sources.time) {
    const lower = new Set(fields.map(field => field.toLowerCase()));
    const has = (names: string[]) => names.some(name => lower.has(name));
    if (has(['year', 'yr', 'yyyy', 'yy']) && has(['month', 'mon', 'mo', 'mm']) && has(['day', 'dy', 'dd', 'dom'])) {
      sources.time = 'year+month+day+hour+minute+second';
    }
  }

  for (const [target, source] of Object.entries(reported ?? {})) {
    if (typeof source !== 'string' || source === '') continue;
    const column = fields.find(field => field === source) ??
      fields.find(field => field.toLowerCase() === source.toLowerCase());
    if (column) sources[target] = column;
    else if (source.includes('+')) sources[target] = source;
  }

  return sources;
}

/**
 * Columns the parser weighs for the event magnitude: scale-named Mw/ML columns and, when
 * one of those is present, the generic magnitude column. Those it does not choose are
 * kept with the event as alternatives in `magnitudes`.
 */
export function parserMagnitudeCandidates(fields: string[]): string[] {
  const named = fields.filter(field => MW_MAGNITUDE_KEYS.includes(field) || ML_MAGNITUDE_KEYS.includes(field));
  if (named.length === 0) return [];
  return [...named, ...fields.filter(field => GENERIC_MAGNITUDE_KEYS.includes(field))];
}

/**
 * A target the parser derives from the column of another target rather than mapping on
 * its own: the magnitude type read off a scale-named magnitude column ('mw' -> Mw). It
 * follows that column's magnitude and is never a mapping of its own.
 */
function isDerivedParserTarget(target: string, column: string, parserSources: Record<string, string>): boolean {
  return target === 'magnitude_type' && parserSources.magnitude === column;
}

/** The first column (in file order) the parser's alias table sends to `target`. */
function aliasColumnFor(fields: string[], target: string): string | undefined {
  return fields.find(field => resolveHeaderAlias(field) === target);
}

/**
 * Column -> target for one file: the explicit mapping where it says something about the
 * column, else the parser's resolution.
 */
export function effectiveColumnMapping(
  fields: string[],
  parserSources: Record<string, string>,
  explicit: Record<string, string>,
): Record<string, string> {
  const fieldSet = new Set(fields);
  const result: Record<string, string> = {};
  for (const [target, column] of Object.entries(parserSources)) {
    if (!fieldSet.has(column) || isDerivedParserTarget(target, column, parserSources)) continue;
    if (!(column in result)) result[column] = target;
  }
  for (const [column, target] of Object.entries(explicit)) {
    if (!fieldSet.has(column)) continue;
    if (target === DO_NOT_MAP) delete result[column];
    else result[column] = target;
  }
  return result;
}

export interface FileMappingChanges {
  set: Record<string, string>;
  unset: string[];
}

/**
 * The changes one file needs so that its stored rows follow the explicit mapping:
 * targets re-sourced from another column, and targets whose parser column the user
 * explicitly re-mapped or chose not to map. Columns the explicit mapping does not
 * mention keep the parser's values untouched, so an empty mapping changes nothing.
 * When the event magnitude is moved to a column that does not name its scale, the
 * file's magnitude-type column is re-read with it, since the parser's type described the
 * magnitude it had chosen.
 */
export function computeFileMappingChanges(
  fields: string[],
  parserSources: Record<string, string>,
  explicit: Record<string, string>,
): FileMappingChanges {
  const fieldSet = new Set(fields);
  const effective = effectiveColumnMapping(fields, parserSources, explicit);
  const set: Record<string, string> = {};
  const claimed = new Set<string>();

  // Explicitly mapped columns claim their targets before columns kept from the parser.
  const ordered = [
    ...fields.filter(field => field in explicit),
    ...fields.filter(field => !(field in explicit)),
  ];
  for (const column of ordered) {
    const target = effective[column];
    if (!target || claimed.has(target) || !isMappableTargetField(target)) continue;
    claimed.add(target);
    if (parserSources[target] !== column) set[target] = column;
  }

  const unset = Object.entries(parserSources)
    .filter(([target, column]) =>
      fieldSet.has(column) && column in explicit && isMappableTargetField(target) &&
      !isDerivedParserTarget(target, column, parserSources) && !claimed.has(target))
    .map(([target]) => target);

  if (set.magnitude && !magnitudeScaleFromColumnName(set.magnitude) && !('magnitude_type' in set)) {
    const typeColumn = aliasColumnFor(fields, 'magnitude_type');
    if (typeColumn && (!(typeColumn in explicit) || explicit[typeColumn] === 'magnitude_type')) {
      set.magnitude_type = typeColumn;
    }
  }

  return { set, unset };
}

/**
 * Required fields a file would end up without: the core event fields (and, with strict
 * validation, every required schema field) that neither the parser's resolution nor the
 * explicit mapping supplies. A parser value assembled from several columns (a time
 * built from year/month/day) counts as supplied.
 */
export function missingRequiredFields(
  fields: string[],
  parserSources: Record<string, string>,
  explicit: Record<string, string>,
  strict = false,
): string[] {
  const required = strict
    ? Array.from(new Set([...REQUIRED_EVENT_FIELDS, ...getRequiredFields().map(field => field.id)]))
    : [...REQUIRED_EVENT_FIELDS];
  const fieldSet = new Set(fields);
  const mappedTargets = new Set(Object.values(effectiveColumnMapping(fields, parserSources, explicit)));
  return required.filter(target => {
    if (mappedTargets.has(target)) return false;
    const source = parserSources[target];
    // Synthesized by the parser from several columns, and not re-mapped away.
    return !(source && !fieldSet.has(source) && source.includes('+'));
  });
}

// ====================================================================
// SAVED FIELD-MAPPING CONFIGURATION (Settings -> Default Field Mappings)
//
// The configuration is applied to every upload's schema step, so it is validated in
// full wherever it enters the system (PUT /api/settings/field-mappings and the Settings
// import dialog): one malformed rule used to make detection throw for every upload.
// ====================================================================

/** Settings formats, one tab each. */
export const FIELD_MAPPING_FORMATS = ['csv', 'json', 'quakeml', 'geojson'] as const;

/** Largest number of rules per format tab (and of custom rules). */
export const MAX_SAVED_MAPPINGS = 500;

const savedMappingEntrySchema = z.object({
  id: z.string().trim().min(1).max(100),
  sourcePattern: z.string().trim().min(1, 'source pattern is required').max(MAX_MAPPING_PATTERN_LENGTH),
  targetField: z.string().refine(isMappableTargetField, {
    message: 'target is not a field a column can be mapped to',
  }),
  isRegex: z.boolean().default(false),
  // Priority only orders rules that match the same column (1-100, higher first).
  priority: z.number().int().min(1).max(100),
  description: z.string().max(500).optional(),
}).superRefine((mapping, ctx) => {
  if (!mapping.isRegex) return;
  try {
    new RegExp(mapping.sourcePattern, 'i');
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourcePattern'], message: 'is not a valid regular expression' });
  }
});

const savedFormatConfigSchema = z.object({
  enabled: z.boolean(),
  mappings: z.array(savedMappingEntrySchema).max(MAX_SAVED_MAPPINGS),
  description: z.string().max(500).optional(),
});

export const fieldMappingsConfigSchema = z.object({
  autoDetectEnabled: z.boolean(),
  strictValidation: z.boolean().default(false),
  // Gates only fuzzy (similarity) suggestions; the Settings slider spans 0.4-1.0.
  fuzzyMatchThreshold: z.number().min(0.4).max(1).default(0.6),
  formats: z.object({
    csv: savedFormatConfigSchema.optional(),
    json: savedFormatConfigSchema.optional(),
    quakeml: savedFormatConfigSchema.optional(),
    geojson: savedFormatConfigSchema.optional(),
  }),
  customMappings: z.array(savedMappingEntrySchema).max(MAX_SAVED_MAPPINGS),
  lastUpdated: z.string().max(64).optional(),
});

export type ValidatedFieldMappingsConfig = z.infer<typeof fieldMappingsConfigSchema>;

/** The config if valid, else the first problem as a readable message. */
export function parseFieldMappingsConfig(
  input: unknown,
): { ok: true; config: ValidatedFieldMappingsConfig } | { ok: false; error: string } {
  const parsed = fieldMappingsConfigSchema.safeParse(input);
  if (parsed.success) return { ok: true, config: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return { ok: false, error: `Invalid configuration: ${where}${issue?.message ?? 'invalid value'}` };
}

export interface MappingRuleConflict {
  /** The source pattern, as written in the first rule. */
  pattern: string;
  /** The different targets it is mapped to. */
  targets: string[];
  /** Where each rule lives ('custom' or a format). */
  scopes: string[];
}

interface ScopedRule {
  scope: string;
  sourcePattern: string;
  targetField: string;
  isRegex?: boolean;
}

/**
 * Rules that contradict each other: one source pattern mapped to different targets
 * within a format, or between a custom rule (which applies to every format) and a format
 * rule. Several patterns mapping to the same target are normal (lat, Lat, evla ->
 * latitude) and are not reported.
 */
export function findConflictingMappingRules(config: {
  formats?: Partial<Record<string, { enabled?: boolean; mappings?: Array<Partial<ScopedRule>> }>>;
  customMappings?: Array<Partial<ScopedRule>>;
}): MappingRuleConflict[] {
  const custom: ScopedRule[] = (config.customMappings ?? [])
    .filter(rule => typeof rule?.sourcePattern === 'string' && typeof rule?.targetField === 'string')
    .map(rule => ({ ...(rule as ScopedRule), scope: 'custom' }));
  const conflicts = new Map<string, MappingRuleConflict>();

  const check = (rules: ScopedRule[]) => {
    const byPattern = new Map<string, ScopedRule[]>();
    for (const rule of rules) {
      const key = `${rule.isRegex ? 're' : 'lit'}:${rule.isRegex ? rule.sourcePattern : rule.sourcePattern.toLowerCase()}`;
      byPattern.set(key, [...(byPattern.get(key) ?? []), rule]);
    }
    byPattern.forEach((group, key) => {
      const targets = Array.from(new Set(group.map(rule => rule.targetField)));
      if (targets.length < 2) return;
      const existing = conflicts.get(key);
      const scopes = Array.from(new Set([...(existing?.scopes ?? []), ...group.map(rule => rule.scope)]));
      conflicts.set(key, {
        pattern: group[0].sourcePattern,
        targets: Array.from(new Set([...(existing?.targets ?? []), ...targets])),
        scopes,
      });
    });
  };

  check(custom);
  for (const [format, formatConfig] of Object.entries(config.formats ?? {})) {
    if (!formatConfig?.enabled) continue;
    const rules = (formatConfig.mappings ?? [])
      .filter(rule => typeof rule?.sourcePattern === 'string' && typeof rule?.targetField === 'string')
      .map(rule => ({ ...(rule as ScopedRule), scope: format }));
    check([...custom, ...rules]);
  }
  return Array.from(conflicts.values());
}

/**
 * Rules that send a column the parser already resolves through its built-in aliases to
 * a different field. They are valid (an explicit rule wins), but worth knowing about.
 */
export function findBuiltInAliasOverrides(
  rules: Array<{ sourcePattern?: unknown; targetField?: unknown; isRegex?: unknown }>,
): Array<{ pattern: string; target: string; builtInTarget: string }> {
  const overrides: Array<{ pattern: string; target: string; builtInTarget: string }> = [];
  for (const rule of rules) {
    if (rule?.isRegex || typeof rule?.sourcePattern !== 'string' || typeof rule?.targetField !== 'string') continue;
    const builtIn = resolveHeaderAlias(rule.sourcePattern);
    if (builtIn && builtIn !== rule.targetField) {
      overrides.push({ pattern: rule.sourcePattern, target: rule.targetField, builtInTarget: builtIn });
    }
  }
  return overrides;
}
