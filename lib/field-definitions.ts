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
    example: 'GeoNet, USGS, EMSC',
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

