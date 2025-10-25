/**
 * Comprehensive TypeScript interfaces for QuakeML 1.2 (Basic Event Description)
 * Based on the QuakeML BED specification and ObsPy implementation
 */

// ============================================================================
// Base Types
// ============================================================================

export interface RealQuantity {
  value: number;
  uncertainty?: number;
  lowerUncertainty?: number;
  upperUncertainty?: number;
  confidenceLevel?: number;
}

export interface TimeQuantity {
  value: string; // ISO 8601 datetime
  uncertainty?: number;
  lowerUncertainty?: number;
  upperUncertainty?: number;
  confidenceLevel?: number;
}

export interface IntegerQuantity {
  value: number;
  uncertainty?: number;
  lowerUncertainty?: number;
  upperUncertainty?: number;
  confidenceLevel?: number;
}

export interface CreationInfo {
  agencyID?: string;
  agencyURI?: string;
  author?: string;
  authorURI?: string;
  creationTime?: string; // ISO 8601 datetime
  version?: string;
}

export interface Comment {
  text: string;
  id?: string;
  creationInfo?: CreationInfo;
}

export interface WaveformStreamID {
  networkCode: string;
  stationCode: string;
  locationCode?: string;
  channelCode?: string;
  resourceURI?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
  | 'not existing'
  | 'not reported'
  | 'earthquake'
  | 'anthropogenic event'
  | 'collapse'
  | 'cavity collapse'
  | 'mine collapse'
  | 'building collapse'
  | 'explosion'
  | 'accidental explosion'
  | 'chemical explosion'
  | 'controlled explosion'
  | 'experimental explosion'
  | 'industrial explosion'
  | 'mining explosion'
  | 'quarry blast'
  | 'road cut'
  | 'blasting levee'
  | 'nuclear explosion'
  | 'induced or triggered event'
  | 'rock burst'
  | 'reservoir loading'
  | 'fluid injection'
  | 'fluid extraction'
  | 'crash'
  | 'plane crash'
  | 'train crash'
  | 'boat crash'
  | 'other event'
  | 'atmospheric event'
  | 'sonic boom'
  | 'sonic blast'
  | 'acoustic noise'
  | 'thunder'
  | 'avalanche'
  | 'snow avalanche'
  | 'debris avalanche'
  | 'hydroacoustic event'
  | 'ice quake'
  | 'slide'
  | 'landslide'
  | 'rockslide'
  | 'meteorite'
  | 'volcanic eruption';

export type EventTypeCertainty = 'known' | 'suspected';

export type EventDescriptionType =
  | 'felt report'
  | 'Flinn-Engdahl region'
  | 'local time'
  | 'tectonic summary'
  | 'nearest cities'
  | 'earthquake name'
  | 'region name';

export type EvaluationMode = 'manual' | 'automatic';

export type EvaluationStatus = 'preliminary' | 'confirmed' | 'reviewed' | 'final' | 'rejected';

export type OriginDepthType =
  | 'from location'
  | 'from moment tensor inversion'
  | 'from modeling of broad-band P waveforms'
  | 'constrained by depth phases'
  | 'constrained by direct phases'
  | 'constrained by depth and direct phases'
  | 'operator assigned'
  | 'other';

export type OriginUncertaintyDescription =
  | 'horizontal uncertainty'
  | 'uncertainty ellipse'
  | 'confidence ellipsoid';

export type AmplitudeCategory = 'point' | 'mean' | 'duration' | 'period' | 'integral' | 'other';

export type PickOnset = 'emergent' | 'impulsive' | 'questionable';

export type PickPolarity = 'positive' | 'negative' | 'undecidable';

// ============================================================================
// Event Description
// ============================================================================

export interface EventDescription {
  text: string;
  type?: EventDescriptionType;
}

// ============================================================================
// Origin Quality
// ============================================================================

export interface OriginQuality {
  associatedPhaseCount?: number;
  usedPhaseCount?: number;
  associatedStationCount?: number;
  usedStationCount?: number;
  depthPhaseCount?: number;
  standardError?: number;
  azimuthalGap?: number;
  secondaryAzimuthalGap?: number;
  groundTruthLevel?: string;
  minimumDistance?: number;
  maximumDistance?: number;
  medianDistance?: number;
}

// ============================================================================
// Origin Uncertainty
// ============================================================================

export interface ConfidenceEllipsoid {
  semiMajorAxisLength: number;
  semiMinorAxisLength: number;
  semiIntermediateAxisLength: number;
  majorAxisPlunge: number;
  majorAxisAzimuth: number;
  majorAxisRotation: number;
}

export interface OriginUncertainty {
  horizontalUncertainty?: number;
  minHorizontalUncertainty?: number;
  maxHorizontalUncertainty?: number;
  azimuthMaxHorizontalUncertainty?: number;
  confidenceEllipsoid?: ConfidenceEllipsoid;
  preferredDescription?: OriginUncertaintyDescription;
  confidenceLevel?: number;
}

// ============================================================================
// Origin
// ============================================================================

export interface Origin {
  publicID: string;
  time: TimeQuantity;
  latitude: RealQuantity;
  longitude: RealQuantity;
  depth?: RealQuantity;
  depthType?: OriginDepthType;
  timeFixed?: boolean;
  epicenterFixed?: boolean;
  referenceSystemID?: string;
  methodID?: string;
  earthModelID?: string;
  quality?: OriginQuality;
  uncertainty?: OriginUncertainty;
  type?: string;
  region?: string;
  evaluationMode?: EvaluationMode;
  evaluationStatus?: EvaluationStatus;
  creationInfo?: CreationInfo;
  comment?: Comment[];
}

// ============================================================================
// Magnitude
// ============================================================================

export interface Magnitude {
  publicID: string;
  mag: RealQuantity;
  type?: string;
  originID?: string;
  methodID?: string;
  stationCount?: number;
  azimuthalGap?: number;
  evaluationMode?: EvaluationMode;
  evaluationStatus?: EvaluationStatus;
  creationInfo?: CreationInfo;
  comment?: Comment[];
}

// ============================================================================
// Station Magnitude
// ============================================================================

export interface StationMagnitude {
  publicID: string;
  originID?: string;
  mag: RealQuantity;
  type?: string;
  amplitudeID?: string;
  methodID?: string;
  waveformID?: WaveformStreamID;
  creationInfo?: CreationInfo;
}

// ============================================================================
// Pick
// ============================================================================

export interface Pick {
  publicID: string;
  time: TimeQuantity;
  waveformID: WaveformStreamID;
  filterID?: string;
  methodID?: string;
  horizontalSlowness?: RealQuantity;
  backazimuth?: RealQuantity;
  slownessMethodID?: string;
  onset?: PickOnset;
  phaseHint?: string;
  polarity?: PickPolarity;
  evaluationMode?: EvaluationMode;
  evaluationStatus?: EvaluationStatus;
  creationInfo?: CreationInfo;
  comment?: Comment[];
}

// ============================================================================
// Arrival
// ============================================================================

export interface Arrival {
  publicID?: string;
  pickID: string;
  phase: string;
  timeCorrection?: number;
  azimuth?: number;
  distance?: number;
  takeoffAngle?: RealQuantity;
  timeResidual?: number;
  horizontalSlownessResidual?: number;
  backazimuthResidual?: number;
  timeWeight?: number;
  horizontalSlownessWeight?: number;
  backazimuthWeight?: number;
  earthModelID?: string;
  creationInfo?: CreationInfo;
  comment?: Comment[];
}

// ============================================================================
// Amplitude
// ============================================================================

export interface TimeWindow {
  reference: string; // ISO 8601 datetime
  begin: number;
  end: number;
}

export interface Amplitude {
  publicID: string;
  genericAmplitude: RealQuantity;
  type?: string;
  category?: AmplitudeCategory;
  unit?: string;
  methodID?: string;
  period?: RealQuantity;
  snr?: number;
  timeWindow?: TimeWindow;
  pickID?: string;
  waveformID?: WaveformStreamID;
  filterID?: string;
  scalingTime?: TimeQuantity;
  magnitudeHint?: string;
  evaluationMode?: EvaluationMode;
  evaluationStatus?: EvaluationStatus;
  creationInfo?: CreationInfo;
  comment?: Comment[];
}

// ============================================================================
// Focal Mechanism
// ============================================================================

export interface NodalPlane {
  strike: RealQuantity;
  dip: RealQuantity;
  rake: RealQuantity;
}

export interface NodalPlanes {
  nodalPlane1?: NodalPlane;
  nodalPlane2?: NodalPlane;
  preferredPlane?: number; // 1 or 2
}

export interface Axis {
  azimuth: RealQuantity;
  plunge: RealQuantity;
  length?: RealQuantity;
}

export interface PrincipalAxes {
  tAxis: Axis;
  pAxis: Axis;
  nAxis?: Axis;
}

export interface Tensor {
  Mrr: RealQuantity;
  Mtt: RealQuantity;
  Mpp: RealQuantity;
  Mrt: RealQuantity;
  Mrp: RealQuantity;
  Mtp: RealQuantity;
}

export interface SourceTimeFunction {
  type: string;
  duration: number;
  riseTime?: number;
  decayTime?: number;
}

export interface MomentTensor {
  publicID?: string;
  derivedOriginID: string;
  momentMagnitudeID?: string;
  scalarMoment?: RealQuantity;
  tensor?: Tensor;
  variance?: number;
  varianceReduction?: number;
  doubleCouple?: number;
  clvd?: number;
  iso?: number;
  greensFunctionID?: string;
  filterID?: string;
  sourceTimeFunction?: SourceTimeFunction;
  methodID?: string;
  category?: string;
  inversionType?: string;
  creationInfo?: CreationInfo;
}

export interface FocalMechanism {
  publicID: string;
  triggeringOriginID?: string;
  nodalPlanes?: NodalPlanes;
  principalAxes?: PrincipalAxes;
  azimuthalGap?: number;
  stationPolarityCount?: number;
  misfit?: number;
  stationDistributionRatio?: number;
  methodID?: string;
  momentTensor?: MomentTensor;
  evaluationMode?: EvaluationMode;
  evaluationStatus?: EvaluationStatus;
  creationInfo?: CreationInfo;
  comment?: Comment[];
}

// ============================================================================
// Event (Top Level)
// ============================================================================

export interface QuakeMLEvent {
  publicID: string;
  preferredOriginID?: string;
  preferredMagnitudeID?: string;
  preferredFocalMechanismID?: string;
  type?: EventType;
  typeCertainty?: EventTypeCertainty;
  description?: EventDescription[];
  comment?: Comment[];
  creationInfo?: CreationInfo;
  
  // Associated data
  origins?: Origin[];
  magnitudes?: Magnitude[];
  stationMagnitudes?: StationMagnitude[];
  picks?: Pick[];
  amplitudes?: Amplitude[];
  focalMechanisms?: FocalMechanism[];
}

