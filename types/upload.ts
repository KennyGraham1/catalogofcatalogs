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
  eventIndex: number;
  checks: CrossFieldCheck[];
}

/**
 * Summary of cross-field validation
 */
export interface CrossFieldValidationResult {
  summary: {
    total: number;
    errors: number;
    warnings: number;
    valid: number;
  };
  results: CrossFieldEventResult[];
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

  // Quality metrics
  azimuthal_gap?: number;
  azimuthalGap?: number;
  minimum_distance?: number;
  used_phase_count?: number;
  usedPhaseCount?: number;
  used_station_count?: number;
  usedStationCount?: number;
  standard_error?: number;

  // Evaluation
  evaluation_mode?: string;
  evaluation_status?: string;

  // Agency info
  author?: string;
  agency_id?: string;

  // Additional data
  comment?: string;
  creation_info?: Record<string, unknown>;

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
  version?: string;
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
 * API response for file upload
 */
export interface FileUploadResponse {
  fileName: string;
  isValid?: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
  format?: string;
  events?: ParsedEvent[];
  eventCount?: number;
  detectedFields?: string[];
  validationReport?: ValidationReport;
}

/**
 * Delimiter options for CSV parsing
 */
export type DelimiterOption = 'auto' | ',' | '\t' | ';' | '|' | ' ';

/**
 * Date format options for parsing
 */
export type DateFormatOption = 'auto' | 'us' | 'international' | 'iso';
