/**
 * TypeScript types for the upload workflow
 * These types ensure type safety throughout the file upload, validation, and catalogue creation process
 */

/**
 * Validation error with detailed context
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  line?: number;
  column?: string;
}

/**
 * Validation warning (non-blocking issue)
 */
export interface ValidationWarning {
  field: string;
  message: string;
  value?: unknown;
  line?: number;
  suggestion?: string;
}

/**
 * Summary of validation results
 */
export interface ValidationSummary {
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  failureCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  byCategory: Record<string, number>;
  byField: Record<string, number>;
}

/**
 * Individual validation failure record
 */
export interface ValidationFailure {
  eventIndex: number;
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  value?: unknown;
  line?: number;
}

/**
 * Validation report for a single file
 */
export interface ValidationReport {
  summary: ValidationSummary;
  failures: ValidationFailure[];
}

/**
 * Result of validating a single uploaded file
 */
export interface FileValidationResult {
  fileName: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  format: string;
  eventCount: number;
  fields: string[];
  validationReport?: ValidationReport;
}

/**
 * Quality check result from performQualityCheck
 * NOTE: Use QualityCheckResult from '@/lib/data-quality-checker' instead
 * This re-export is for convenience
 */
export type { QualityCheckResult } from '@/lib/data-quality-checker';

/**
 * Cross-field validation check result
 */
export interface CrossFieldCheck {
  field: string;
  relatedField: string;
  message: string;
  severity: 'error' | 'warning';
  value?: unknown;
  relatedValue?: unknown;
}

/**
 * Result of cross-field validation for a single event
 */
export interface CrossFieldEventResult {
  eventIndex?: number;
  passed: boolean;
  checks: CrossFieldCheck[];
}

/**
 * Summary of cross-field validation for a batch of events
 */
export interface CrossFieldValidationResult {
  passed: boolean;
  results: CrossFieldEventResult[];
  summary: {
    totalEvents: number;
    passedEvents: number;
    failedEvents: number;
    totalChecks: number;
    errors: number;
    warnings: number;
    info: number;
  };
}

/**
 * Parsed earthquake event before mapping
 * Uses optional fields since parsing may not capture all data
 * This is the single source of truth for ParsedEvent
 */
export interface ParsedEvent {
  // Required fields
  time: string;
  latitude: number;
  longitude: number;
  magnitude: number;

  // Optional location info
  depth?: number | null;
  region?: string | null;
  location_name?: string | null;
  source?: string;

  // Event identification
  id?: string;
  eventId?: string;
  source_id?: string;
  event_public_id?: string;
  publicID?: string;

  // Event type
  event_type?: string;
  eventType?: string;
  event_type_certainty?: string;

  // Uncertainties
  time_uncertainty?: number;
  latitude_uncertainty?: number;
  longitude_uncertainty?: number;
  depth_uncertainty?: number;

  // Magnitude details
  magnitude_type?: string;
  magnitudeType?: string;
  magnitude_uncertainty?: number;
  magnitude_station_count?: number;
  magnitude_method_id?: string;
  magnitude_evaluation_mode?: string;
  magnitude_evaluation_status?: string;

  // Quality metrics
  azimuthal_gap?: number;
  azimuthalGap?: number;
  minimum_distance?: number;
  maximum_distance?: number;
  used_phase_count?: number;
  usedPhaseCount?: number;
  used_station_count?: number;
  usedStationCount?: number;
  standard_error?: number;
  associated_phase_count?: number;
  associated_station_count?: number;
  depth_phase_count?: number;
  horizontal_uncertainty?: number;

  // Origin metadata
  depth_type?: string;
  earth_model_id?: string;
  method_id?: string;

  // Evaluation
  evaluation_mode?: string;
  evaluation_status?: string;

  // Agency info
  author?: string;
  agency_id?: string;

  // Preferred IDs (for QuakeML cross-referencing)
  preferred_origin_id?: string;
  preferred_magnitude_id?: string;

  // Additional data
  comment?: string;
  creation_info?: Record<string, unknown>;
  origin_quality?: string;
  origins?: string;
  magnitudes?: string;
  picks?: string;
  arrivals?: string;
  focal_mechanisms?: string;
  amplitudes?: string;
  station_magnitudes?: string;
  event_descriptions?: string;
  comments?: string;

  // QuakeML 1.2 extended data (when parsing QuakeML files)
  quakeml?: import('@/lib/types/quakeml').QuakeMLEvent;

  // Index for reference purposes
  [key: string]: unknown;
}

/**
 * Field mapping configuration
 */
export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: string;
  confidence?: number;
}

/**
 * Processing report after catalogue creation
 */
export interface ProcessingReport {
  catalogueId: string;
  catalogueName: string;
  processedAt: string;
  filesProcessed: Array<{
    name: string;
    size: number;
    format: string;
  }>;
  totalEvents: number;
  qualityScore: number;
  validationResults: FileValidationResult[];
  validationSummary: ValidationSummary | null;
  metadata: CatalogueMetadata;
}

/**
 * Catalogue metadata from the form
 * This is the single source of truth for metadata structure
 */
export interface CatalogueMetadata {
  // Basic metadata
  description?: string;
  data_source?: string;
  provider?: string;
  geographic_region?: string;

  // Time period
  time_period_start?: string;
  time_period_end?: string;

  // Quality - nested object for structured quality assessment
  data_quality?: {
    completeness?: string;
    accuracy?: string;
    reliability?: string;
  };
  quality_notes?: string;

  // Contact
  contact_name?: string;
  contact_email?: string;
  contact_organization?: string;

  // License
  license?: string;
  usage_terms?: string;
  citation?: string;

  // Additional
  doi?: string;
  // The depositor's own free-text release label for the source data (e.g. "GeoNet
  // 2024.1"), distinct from the catalogue's server-managed MAJOR.MINOR.PATCH
  // `version` (C3, lib/db.ts). Named to match the API/DB field it round-trips
  // through (app/api/catalogues/[id]/route.ts, lib/db.ts).
  source_version?: string;
  keywords?: string[];        // Array of keywords
  reference_links?: string[]; // Array of reference URLs
  notes?: string;

  // Validation data (added during processing)
  validation_summary?: string;
  validation_report?: string;
  validation_timestamp?: string;
}

/**
 * Upload stage type - stages during file upload and initial processing
 */
export type UploadStage = 'idle' | 'uploading' | 'parsing' | 'validating' | 'saving' | 'complete' | 'error';

/**
 * Upload progress tracking
 */
export interface UploadProgressInfo {
  stage: UploadStage;
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  filesCompleted: number;
  totalFiles: number;
  currentFile?: string;
  startTime?: number;
  message?: string;
}

/**
 * Processing stage type - stages during catalogue processing
 */
export type ProcessingStage = 'idle' | 'mapping' | 'saving' | 'report' | 'complete' | 'error';

/**
 * Processing progress tracking (post-upload)
 */
export interface ProcessingProgressInfo {
  stage: ProcessingStage;
  progress: number;
  message?: string;
  eventCount?: number;
  eventsProcessed?: number;
}

/**
 * Upload status states - overall workflow status
 */
export type UploadStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'validating'
  | 'mapping'
  | 'metadata'
  | 'processing'
  | 'complete'
  | 'error';

/**
 * Validation report storage format (for database)
 */
export interface ValidationReportStorage {
  generatedAt: string;
  files: Array<{
    fileName: string;
    format: string;
    summary: ValidationSummary;
    failures: ValidationFailure[];
    truncated: boolean;
  }>;
}

/**
 * API response for one file from POST /api/upload and POST /api/upload/finalize
 * (contract C15).
 *
 * Parsed events are never sent to the browser in bulk — they stay in the server's
 * pending-upload store (lib/pending-uploads.ts) under `pendingUploadId`, which
 * /api/catalogues later reads from directly to create the catalogue. The response
 * instead carries counts, the parser's column-resolution and file-level decisions
 * (contract C14), a bounded slice of errors/warnings, and an evenly spaced preview
 * sample — each bounded well under Vercel's 4.5 MB response limit regardless of
 * catalogue size. This was previously shaped around a full `events` array; both
 * routes now build this exact bounded shape via their own `buildUploadResponse()`.
 */
export interface FileUploadResponse {
  fileName: string;
  fileSize: number;
  format: string;
  success: boolean;
  eventCount: number;
  detectedFields: string[];

  /** Canonical target field -> the source column/key the parser actually used (C14). */
  resolvedFieldSources: Record<string, string>;
  /** File-level decisions (date format, depth unit, ...) applied to every row (C14). */
  fileDecisions: Record<string, unknown>;

  /** Bounded to the first 200; errorCount/errorsTruncated describe the full total. */
  errors: Array<{ line: number; message: string }>;
  errorCount: number;
  errorsTruncated: boolean;
  /** Bounded to the first 200; warningCount/warningsTruncated describe the full total. */
  warnings: Array<{ line: number; message: string }>;
  warningsTruncated: boolean;

  /** Present only when at least one event failed validation. */
  validationReport?: {
    generatedAt: string;
    summary: {
      totalEvents: number;
      validEvents: number;
      invalidEvents: number;
      failureCount: number;
      errorCount: number;
      warningCount: number;
      infoCount: number;
      byCategory: Record<string, number>;
    };
    /** Bounded to the first 500; failuresTruncated says whether more exist. */
    failures: Array<{
      line?: number;
      eventIndex?: number;
      eventId?: string | null;
      field?: string;
      value?: unknown;
      expected?: string;
      message: string;
      category: string;
      severity: 'error' | 'warning' | 'info';
    }>;
    failuresTruncated: boolean;
  };

  /**
   * An evenly spaced sample of the parsed events (never every event — see above),
   * with each sample's 0-based position in the file (previewIndices), and whether
   * the sample omits events the file actually has (previewTruncated).
   */
  previewEvents: ParsedEvent[];
  previewIndices: number[];
  previewTruncated: boolean;

  /** Present only when at least one event was parsed. */
  pendingUploadId?: string;
}

/**
 * Delimiter options for CSV parsing.
 *
 * This is the single source of truth: the named options DelimiterSelector
 * presents ('comma', 'tab', ...), which is also what /api/upload/init
 * validates and stores for chunked uploads (findings #36/#46). Previously
 * this type was declared twice — once here as the literal characters, which
 * nothing imported, and once (correctly) in DelimiterSelector.tsx — and the
 * unused character-based version masked the fact that the chunked upload
 * path passed the name straight through as if it were a character.
 * components/upload/DelimiterSelector.tsx re-exports this.
 */
export type DelimiterOption = 'auto' | 'comma' | 'tab' | 'semicolon' | 'pipe' | 'space';

/**
 * Date format options for parsing
 */
export type DateFormatOption = 'auto' | 'us' | 'international' | 'iso';
