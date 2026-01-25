/**
 * Core earthquake event types used throughout the application
 * These types provide type safety for seismological data processing
 */

/**
 * Base earthquake event with required fields for processing
 * This is the minimum required structure for duplicate detection and merging
 */
export interface BaseEarthquakeEvent {
  // Core identifiers (at least one should be present)
  id?: string;
  event_public_id?: string;

  // Required location and time
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;

  // Optional location info
  depth?: number | null;
}

/**
 * Extended earthquake event with all optional metadata
 */
export interface EarthquakeEvent extends BaseEarthquakeEvent {
  // Location information
  region?: string | null;
  location_name?: string | null;

  // Event type
  event_type?: string | null;
  event_type_certainty?: string | null;

  // Uncertainties
  time_uncertainty?: number | null;
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;
  horizontal_uncertainty?: number | null;

  // Origin metadata
  depth_type?: string | null;
  earth_model_id?: string | null;
  method_id?: string | null;

  // Agency/Author information
  agency_id?: string | null;
  author?: string | null;

  // Magnitude details
  magnitude_type?: string | null;
  magnitude_uncertainty?: number | null;
  magnitude_station_count?: number | null;
  magnitude_method_id?: string | null;
  magnitude_evaluation_mode?: string | null;
  magnitude_evaluation_status?: string | null;

  // Origin quality metrics
  azimuthal_gap?: number | null;
  used_phase_count?: number | null;
  used_station_count?: number | null;
  standard_error?: number | null;
  minimum_distance?: number | null;
  maximum_distance?: number | null;
  associated_phase_count?: number | null;
  associated_station_count?: number | null;
  depth_phase_count?: number | null;

  // Evaluation metadata
  evaluation_mode?: string | null;
  evaluation_status?: string | null;

  // Preferred IDs for QuakeML export
  preferred_origin_id?: string | null;
  preferred_magnitude_id?: string | null;

  // Complex nested data as JSON strings
  origin_quality?: string | null;
  origins?: string | null;
  magnitudes?: string | null;
  picks?: string | null;
  arrivals?: string | null;
  focal_mechanisms?: string | null;
  amplitudes?: string | null;
  station_magnitudes?: string | null;
  event_descriptions?: string | null;
  comments?: string | null;
  creation_info?: string | null;

  // Internal tracking
  source_id?: string | null;
  catalogue_id?: string;
  source_events?: string;
  created_at?: string;

  // Generated ID for events without one (used internally)
  _generated_id?: string;
}

/**
 * Event used for duplicate detection
 * Contains the minimum fields needed for matching
 */
export interface DuplicateDetectionEvent {
  id?: string;
  event_public_id?: string;
  _generated_id?: string;
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth?: number | null;
  evaluation_status?: string | null;
  used_station_count?: number | null;
  azimuthal_gap?: number | null;
  used_phase_count?: number | null;
  event_type?: string | null;
  magnitude_type?: string | null;
  [key: string]: unknown;
}

/**
 * Event with score for quality-based selection
 */
export interface ScoredEvent extends DuplicateDetectionEvent {
  _qualityScore?: number;
}

/**
 * Merge source event reference
 */
export interface MergeSourceEvent {
  source: string;
  eventId?: string;
  description?: string;
}

/**
 * Error details for structured error handling
 */
export interface ErrorDetails {
  field?: string;
  value?: unknown;
  expected?: string;
  received?: string;
  line?: number;
  column?: number;
  [key: string]: unknown;
}

/**
 * Log metadata for structured logging
 */
export interface LogMetadata {
  [key: string]: unknown;
}
