'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileUploader, UploadProgressInfo } from '@/components/upload/FileUploader';
import { DelimiterSelector, type DelimiterOption } from '@/components/upload/DelimiterSelector';
import { DateFormatSelector, type DateFormatOption } from '@/components/upload/DateFormatSelector';
import { EnhancedSchemaMapper } from '@/components/upload/EnhancedSchemaMapper';
import { ValidationResults } from '@/components/upload/ValidationResults';
import { DataQualityReport } from '@/components/upload/DataQualityReport';
import { DataCompletenessMetrics } from '@/components/upload/DataCompletenessMetrics';
import { CatalogueMetadataForm, CatalogueMetadata } from '@/components/upload/CatalogueMetadataForm';
import { ProcessingProgressIndicator, ProcessingProgressInfo } from '@/components/upload/ProcessingProgressIndicator';
import { AuthGateCard } from '@/components/auth/AuthGateCard';
import { toast } from '@/hooks/use-toast';
import { performQualityCheck, QualityCheckResult, getQualityGrade } from '@/lib/data-quality-checker';
import { validateEventsCrossFields } from '@/lib/cross-field-validation';
import { useAuth } from '@/lib/auth/hooks';
import { UserRole } from '@/lib/auth/types';
import { getApiError } from '@/lib/api';
import type { FileValidationResult, ParsedEvent } from '@/types/upload';

// Type for cross-field validation result (matches validateEventsCrossFields return type)
type CrossFieldValidationBatchResult = ReturnType<typeof validateEventsCrossFields>;

// Maximum number of files allowed per upload
const MAX_FILES = 20;
// Files above this threshold are uploaded in 3 MB chunks and may take up to
// 60 seconds to process on the server — warn the user so they are not surprised.
const LARGE_FILE_WARN_BYTES = 200 * 1024 * 1024; // 200 MB

type UploadStatus = 'idle' | 'uploading' | 'validating' | 'mapping' | 'metadata' | 'processing' | 'complete' | 'error';

export default function UploadPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const canUpload = user?.role === UserRole.EDITOR || user?.role === UserRole.ADMIN;
  const isReadOnly = !canUpload;
  const uploadBlockedMessage = !user
    ? 'Log in to upload files and create catalogues.'
    : 'Editor or Admin access is required to upload catalogues.';
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [delimiter, setDelimiter] = useState<DelimiterOption>('auto');
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('auto');
  const [validationResults, setValidationResults] = useState<FileValidationResult[] | null>(null);
  const [qualityCheckResult, setQualityCheckResult] = useState<QualityCheckResult | null>(null);
  const [crossFieldValidation, setCrossFieldValidation] = useState<CrossFieldValidationBatchResult | null>(null);
  const [parsedEvents, setParsedEvents] = useState<ParsedEvent[]>([]);
  // Pending upload IDs keyed by file name — used to retrieve full QuakeML data
  // on the server when creating the catalogue (see lib/pending-uploads.ts).
  const [pendingUploadIds, setPendingUploadIds] = useState<Record<string, string>>({});
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [isSchemaReady, setIsSchemaReady] = useState(false);
  const [catalogueName, setCatalogueName] = useState('');
  const [metadata, setMetadata] = useState<CatalogueMetadata>({});
  // Processing report type - inline since structure is constructed locally
  const [processingReport, setProcessingReport] = useState<{
    catalogueId: string;
    catalogueName: string;
    processedAt: string;
    filesProcessed: Array<{ name: string; size: number; format: string }>;
    totalEvents: number;
    qualityScore: number | null;
    validationResults: FileValidationResult[] | null;
    validationSummary: { totalEvents: number; validEvents: number; invalidEvents: number } | null;
    metadata: CatalogueMetadata;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo>({
    stage: 'idle',
    progress: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    filesCompleted: 0,
    totalFiles: 0
  });
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgressInfo>({
    stage: 'idle',
    progress: 0,
  });

  // Show loading state while authentication is being checked
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canUpload) {
    return (
      <AuthGateCard
        title={isAuthenticated ? 'Editor access required' : 'Login required'}
        description={uploadBlockedMessage}
        requiredRole={UserRole.EDITOR}
        action={
          isAuthenticated
            ? { label: 'Back to Dashboard', href: '/dashboard' }
            : { label: 'Log in', href: '/login' }
        }
        secondaryAction={
          isAuthenticated
            ? { label: 'View Catalogues', href: '/catalogues' }
            : { label: 'Back to Home', href: '/' }
        }
      />
    );
  }

  const handleFilesAdded = (newFiles: File[]) => {
    const totalFiles = files.length + newFiles.length;
    if (totalFiles > MAX_FILES) {
      toast({
        title: 'Too many files',
        description: `Maximum ${MAX_FILES} files allowed per upload. You have ${files.length} files and tried to add ${newFiles.length} more.`,
        variant: 'destructive',
      });
      // Only add files up to the limit
      const remainingSlots = MAX_FILES - files.length;
      if (remainingSlots > 0) {
        setFiles([...files, ...newFiles.slice(0, remainingSlots)]);
      }
      return;
    }
    setFiles([...files, ...newFiles]);

    // Warn about large files so the user knows to expect a longer wait
    const largeFiles = newFiles.filter(f => f.size > LARGE_FILE_WARN_BYTES);
    if (largeFiles.length > 0) {
      const names = largeFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(0)} MB)`).join(', ');
      toast({
        title: 'Large file detected',
        description: `${names} will be uploaded in chunks and may take up to 60 seconds to process on the server.`,
      });
    }
  };

  const handleFileRemoved = (fileName: string) => {
    setFiles(files.filter(file => file.name !== fileName));
  };

  const handleCancel = () => {
    // Reset all upload state
    setFiles([]);
    setValidationResults(null);
    setQualityCheckResult(null);
    setCrossFieldValidation(null);
    setParsedEvents([]);
    setPendingUploadIds({});
    setFieldMappings({});
    setIsSchemaReady(false);
    setCatalogueName('');
    setMetadata({});
    setProcessingReport(null);
    setUploadStatus('idle');
    setUploadProgress({
      stage: 'idle',
      progress: 0,
      bytesUploaded: 0,
      totalBytes: 0,
      filesCompleted: 0,
      totalFiles: 0
    });
    setProcessingProgress({
      stage: 'idle',
      progress: 0,
    });
    setActiveTab('upload');
  };

  /**
   * Apply UI field mappings to events before saving
   * This ensures user's manual mapping changes are respected
   */
  const applyUIMappings = (events: any[]): any[] => {
    if (Object.keys(fieldMappings).length === 0) {
      return events; // No custom mappings, return as-is
    }

    // Fields that must be numeric
    const numericFields = new Set([
      'latitude', 'longitude', 'depth', 'magnitude',
      'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty',
      'depth_uncertainty', 'horizontal_uncertainty', 'magnitude_uncertainty',
      'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
      'minimum_distance', 'maximum_distance', 'associated_phase_count',
      'associated_station_count', 'depth_phase_count', 'magnitude_station_count'
    ]);

    // Helper to safely parse numeric values
    const safeParseNumber = (value: any): number | null => {
      if (value === undefined || value === null || value === '') return null;
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      return isNaN(num) ? null : num;
    };

    return events.map(event => {
      const mappedEvent: any = { ...event };

      // Apply each UI mapping
      for (const [sourceField, targetField] of Object.entries(fieldMappings)) {
        // Skip if no target or source field doesn't exist
        if (!targetField || targetField === '' || event[sourceField] === undefined) {
          continue;
        }

        // For numeric fields, ensure proper type conversion
        if (numericFields.has(targetField)) {
          const parsed = safeParseNumber(event[sourceField]);
          if (parsed !== null) {
            mappedEvent[targetField] = parsed;
          }
        } else if (targetField === 'time') {
          const value = event[sourceField];
          if (typeof value === 'string' || typeof value === 'number') {
            mappedEvent[targetField] = value;
          }
        } else {
          mappedEvent[targetField] = event[sourceField];
        }
      }

      return mappedEvent;
    });
  };

  const buildValidationReportStorage = () => {
    if (!validationResults || validationResults.length === 0) {
      return null;
    }

    const maxFailuresPerFile = 500;
    const files = validationResults.map((result: any) => {
      const report = result.validationReport;
      const failures = report?.failures || [];

      return {
        fileName: result.fileName,
        format: result.format,
        summary: report?.summary || {
          totalEvents: result.eventCount,
          validEvents: result.eventCount,
          invalidEvents: 0,
          failureCount: (result.errors?.length || 0) + (result.warnings?.length || 0),
          errorCount: result.errors?.length || 0,
          warningCount: result.warnings?.length || 0,
          infoCount: 0,
          byCategory: {},
          byField: {},
        },
        failures: failures.slice(0, maxFailuresPerFile),
        truncated: failures.length > maxFailuresPerFile,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      files,
    };
  };

  const buildValidationSummary = () => {
    if (!validationResults || validationResults.length === 0) {
      return null;
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      totalEvents: 0,
      validEvents: 0,
      invalidEvents: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      byCategory: {} as Record<string, number>,
      files: [] as Array<any>,
    };

    validationResults.forEach((result: any) => {
      const reportSummary = result.validationReport?.summary;
      if (!reportSummary) {
        return;
      }

      summary.totalEvents += reportSummary.totalEvents || 0;
      summary.validEvents += reportSummary.validEvents || 0;
      summary.invalidEvents += reportSummary.invalidEvents || 0;
      summary.errorCount += reportSummary.errorCount || 0;
      summary.warningCount += reportSummary.warningCount || 0;
      summary.infoCount += reportSummary.infoCount || 0;

      if (reportSummary.byCategory) {
        Object.entries(reportSummary.byCategory).forEach(([category, count]) => {
          summary.byCategory[category] = (summary.byCategory[category] || 0) + (count as number);
        });
      }

      summary.files.push({
        fileName: result.fileName,
        format: result.format,
        summary: reportSummary,
      });
    });

    return summary;
  };

  const handleUpload = async () => {
    if (isReadOnly) {
      toast({
        title: 'Read-only mode',
        description: uploadBlockedMessage,
        variant: 'destructive',
      });
      return;
    }
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one file to upload.",
        variant: "destructive"
      });
      return;
    }

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const startTime = Date.now();

    // Initialize progress
    setUploadProgress({
      stage: 'uploading',
      progress: 0,
      bytesUploaded: 0,
      totalBytes,
      filesCompleted: 0,
      totalFiles: files.length,
      startTime,
      message: `Starting upload of ${files.length} file(s)...`
    });
    setUploadStatus('uploading');

    try {
      const uploadResults: any[] = [];
      let bytesCompleted = 0;

      // Vercel hard limit: 4.5 MB per serverless function payload.
      // Files above LARGE_FILE_THRESHOLD use the three-step chunked flow:
      //   1. POST /api/upload/init   → sessionId
      //   2. POST /api/upload/chunk  × N  (one per 3 MB chunk)
      //   3. POST /api/upload/finalize   → same response shape as /api/upload
      // Smaller files use the existing single-request upload.
      const LARGE_FILE_THRESHOLD = 3.5 * 1024 * 1024; // 3.5 MB
      const CHUNK_SIZE = 3 * 1024 * 1024;              // 3 MB per chunk

      // Helper: throw on non-ok responses with user-readable messages
      const assertOk = async (res: Response, label: string) => {
        if (res.ok) return;
        if (res.status === 401) throw new Error('Please log in to upload files.');
        if (res.status === 403) throw new Error('Editor or Admin access is required to upload files.');
        const errorInfo = await getApiError(res, label);
        throw new Error(errorInfo.message);
      };

      // Upload files sequentially to track progress accurately
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        setUploadProgress(prev => ({
          ...prev,
          stage: 'uploading',
          currentFile: file.name,
          message: `Uploading ${file.name}...`,
          progress: Math.round((bytesCompleted / totalBytes) * 40)
        }));

        let result: any;

        if (file.size > LARGE_FILE_THRESHOLD) {
          // ── Chunked upload ───────────────────────────────────────────────
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

          // Step 1: init
          const initRes = await fetch('/api/upload/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              fileSize: file.size,
              totalChunks,
              delimiter: delimiter !== 'auto' ? delimiter : undefined,
              dateFormat: dateFormat !== 'auto' ? dateFormat : undefined,
            }),
          });
          await assertOk(initRes, 'Failed to initialise upload');
          const { sessionId } = await initRes.json();

          // Step 2: send each chunk
          for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end   = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const chunkForm = new FormData();
            chunkForm.append('sessionId',  sessionId);
            chunkForm.append('chunkIndex', String(chunkIndex));
            chunkForm.append('chunk',      chunk, file.name);

            const chunkRes = await fetch('/api/upload/chunk', {
              method: 'POST',
              body: chunkForm,
            });
            await assertOk(chunkRes, `Failed to upload chunk ${chunkIndex + 1}/${totalChunks}`);

            // Update progress proportionally within the 0-40% upload band
            const chunkBytesCompleted = bytesCompleted + end;
            setUploadProgress(prev => ({
              ...prev,
              bytesUploaded: chunkBytesCompleted,
              message: `Uploading ${file.name} — part ${chunkIndex + 1} of ${totalChunks}...`,
              progress: Math.round((chunkBytesCompleted / totalBytes) * 40),
            }));
          }

          // Step 3: finalize — server reassembles, parses, returns events
          setUploadProgress(prev => ({
            ...prev,
            message: `Processing ${file.name}...`,
          }));
          const finalRes = await fetch('/api/upload/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          await assertOk(finalRes, 'Upload finalisation failed');
          result = await finalRes.json();

        } else {
          // ── Direct upload (small files) ───────────────────────────────────
          const formData = new FormData();
          formData.append('file', file);
          if (delimiter !== 'auto') formData.append('delimiter', delimiter);
          if (dateFormat !== 'auto') formData.append('dateFormat', dateFormat);

          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          await assertOk(response, 'Upload failed');
          result = await response.json();
        }

        uploadResults.push(result);
        // Record server-side pending upload token for QuakeML files
        if (result.pendingUploadId) {
          setPendingUploadIds(prev => ({ ...prev, [file.name]: result.pendingUploadId }));
        }
        bytesCompleted += file.size;

        setUploadProgress(prev => ({
          ...prev,
          bytesUploaded: bytesCompleted,
          filesCompleted: i + 1,
          progress: Math.round((bytesCompleted / totalBytes) * 40)
        }));
      }

      // Parsing stage (40-60%)
      setUploadProgress(prev => ({
        ...prev,
        stage: 'parsing',
        progress: 50,
        message: 'Parsing catalogue data...'
      }));

      await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause for UI update

      // Validating stage (60-80%)
      setUploadProgress(prev => ({
        ...prev,
        stage: 'validating',
        progress: 70,
        message: 'Validating events...'
      }));
      setUploadStatus('validating');

      // Process validation results
      // Issue #6 fix: isValid should consider validation report's invalidEvents count, not just parser errors
      const results = uploadResults.map(result => {
        const hasParserErrors = result.errors && result.errors.length > 0;
        const hasValidationErrors = (result.validationReport?.summary?.invalidEvents || 0) > 0;
        const explicitlyInvalid = result.isValid === false;

        return {
          fileName: result.fileName,
          isValid: !explicitlyInvalid && !hasParserErrors && !hasValidationErrors,
          errors: result.errors || [],
          warnings: result.warnings || [],
          format: result.format || 'UNKNOWN',
          eventCount: result.events?.length || 0,
          fields: result.detectedFields || ['time', 'latitude', 'longitude', 'depth', 'magnitude'],
          validationReport: result.validationReport
        };
      });

      // Combine all events from all files
      const allEvents = uploadResults.flatMap(result => result.events || []);
      setParsedEvents(allEvents);
      const totalErrors = results.reduce((sum, result) => sum + result.errors.length, 0);
      const hasValidEvents = allEvents.length > 0;
      const hasErrors = totalErrors > 0;

      // Update progress
      setUploadProgress(prev => ({
        ...prev,
        progress: 85,
        message: `Validating ${allEvents.length} events...`
      }));

      // Perform quality check
      const qualityResult = performQualityCheck(allEvents);
      setQualityCheckResult(qualityResult);

      // Perform cross-field validation
      const crossFieldResult = validateEventsCrossFields(allEvents);
      setCrossFieldValidation(crossFieldResult);

      // Complete
      setUploadProgress(prev => ({
        ...prev,
        stage: 'complete',
        progress: 100,
        message: `Successfully processed ${allEvents.length} events`
      }));

      setValidationResults(results);
      setUploadStatus(hasValidEvents ? 'mapping' : 'error');

      if (!hasValidEvents) {
        const firstErrors = results
          .flatMap(result => (result.errors || []).map((error: any) => ({
            fileName: result.fileName,
            line: error.line,
            message: error.message,
          })))
          .slice(0, 3);
        const description = firstErrors.length > 0
          ? firstErrors
              .map(error => `${error.fileName}${error.line ? ` line ${error.line}` : ''}: ${error.message}`)
              .join('; ')
          : 'No valid events were found in the uploaded file.';

        toast({
          title: 'Validation failed',
          description,
          variant: 'destructive',
        });
      }

      if (hasErrors && hasValidEvents) {
        toast({
          title: 'Partial import ready',
          description: `Skipped ${totalErrors} invalid event${totalErrors === 1 ? '' : 's'}. ${allEvents.length} valid event${allEvents.length === 1 ? '' : 's'} ready to map.`,
        });
      }

      // Cross-field checks are advisory quality checks. They should be visible,
      // but they do not block mapping or catalogue creation.
      if (crossFieldResult.summary.failedEvents > 0) {
        toast({
          title: 'Cross-field review recommended',
          description: `${crossFieldResult.summary.failedEvents} event(s) have high-severity consistency checks. You can continue, but review the validation results when possible.`,
        });
      } else if (crossFieldResult.summary.warnings > 0) {
        toast({
          title: 'Cross-field review recommended',
          description: `${crossFieldResult.summary.warnings} cross-field warning(s) detected. You can continue.`,
        });
      }

      // Auto-navigate to schema tab when there are valid events (including partial imports)
      if (hasValidEvents) {
        setTimeout(() => {
          setActiveTab('schema');
        }, 500);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(prev => ({
        ...prev,
        stage: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      }));
      setUploadStatus('error');
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload files",
        variant: "destructive"
      });
    }
  };

  const handleSchemaSubmit = () => {
    if (isReadOnly) {
      toast({
        title: 'Read-only mode',
        description: uploadBlockedMessage,
        variant: 'destructive',
      });
      return;
    }
    setUploadStatus('metadata');
    setActiveTab('metadata');
  };

  const handleMetadataSubmit = async () => {
    if (isReadOnly) {
      toast({
        title: 'Read-only mode',
        description: uploadBlockedMessage,
        variant: 'destructive',
      });
      return;
    }
    if (!catalogueName.trim()) {
      toast({
        title: "Catalogue name required",
        description: "Please provide a name for this catalogue.",
        variant: "destructive"
      });
      return;
    }

    setUploadStatus('processing');

    // Initialize processing progress
    setProcessingProgress({
      stage: 'mapping',
      progress: 0,
      message: 'Applying field mappings...',
      eventCount: parsedEvents.length,
      eventsProcessed: 0,
    });

    try {
      // Step 1: Apply UI field mappings before saving
      setProcessingProgress(prev => ({
        ...prev,
        stage: 'mapping',
        progress: 10,
        message: 'Applying field mappings to events...',
      }));

      // Large uploads omit the events array from the catalogue request because
      // it can exceed Vercel's 4.5 MB hard limit. Small uploads keep sending
      // events inline, even when they also have a pendingUploadId, so they stay
      // on the older catalogue creation path.
      //
      // If any file is missing a pending record (e.g. it was a tiny in-memory
      // upload that never went through the pending store) we fall back to
      // sending the events inline as before.
      const pendingIds = Object.values(pendingUploadIds);
      const allFilesHavePendingId = files.length > 0 && files.every(f => pendingUploadIds[f.name]);
      const totalSourceBytes = files.reduce((sum, f) => sum + f.size, 0);
      const usePendingOnlyPayload = allFilesHavePendingId && totalSourceBytes > 3.5 * 1024 * 1024;

      const finalEvents = usePendingOnlyPayload ? [] : applyUIMappings(parsedEvents);

      setProcessingProgress(prev => ({
        ...prev,
        progress: 25,
        message: 'Building validation reports...',
        eventsProcessed: parsedEvents.length,
      }));

      const validationSummary = buildValidationSummary();
      const validationReportStorage = buildValidationReportStorage();
      const validationTimestamp = validationSummary?.generatedAt || validationReportStorage?.generatedAt;
      const metadataPayload = {
        ...metadata,
        ...(validationSummary ? { validation_summary: JSON.stringify(validationSummary) } : {}),
        ...(validationReportStorage ? { validation_report: JSON.stringify(validationReportStorage) } : {}),
        ...(validationTimestamp ? { validation_timestamp: validationTimestamp } : {}),
      };

      // Step 2: Create catalogue in database
      setProcessingProgress(prev => ({
        ...prev,
        stage: 'saving',
        progress: 35,
        message: `Saving catalogue with ${parsedEvents.length.toLocaleString()} events...`,
      }));

      const response = await fetch('/api/catalogues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: catalogueName.trim(),
          // Omit events only when the source payload is large enough that the
          // catalogue request risks Vercel's 4.5 MB body limit. Small uploads
          // keep using the mature inline-events path even when a pending token
          // exists.
          ...(usePendingOnlyPayload ? {} : { events: finalEvents }),
          metadata: metadataPayload,
          pendingUploadIds: pendingIds,
          // Send field mappings config so the server can apply them to
          // pendingEvents when events are not included in the body.
          ...(usePendingOnlyPayload && Object.keys(fieldMappings).length > 0
            ? { fieldMappings }
            : {}),
        }),
      });

      setProcessingProgress(prev => ({
        ...prev,
        progress: 75,
        message: 'Waiting for database confirmation...',
      }));

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to create catalogues.');
        }
        if (response.status === 403) {
          throw new Error('Editor or Admin access is required to create catalogues.');
        }
        const errorInfo = await getApiError(response, 'Failed to create catalogue');
        throw new Error(errorInfo.message);
      }

      const createdCatalogue = await response.json();

      // Step 3: Generate processing report
      setProcessingProgress(prev => ({
        ...prev,
        stage: 'report',
        progress: 90,
        message: 'Generating processing report...',
      }));

      const report = {
        catalogueId: createdCatalogue.id,
        catalogueName,
        processedAt: new Date().toISOString(),
        filesProcessed: files.map(f => ({
          name: f.name,
          size: f.size,
          format: f.name.split('.').pop()?.toUpperCase() || 'UNKNOWN'
        })),
        totalEvents: parsedEvents.length,
        // Issue #9 fix: Use null instead of 0 when no quality check was performed
        // This distinguishes "no check performed" from "score is 0"
        qualityScore: qualityCheckResult?.score ?? null,
        validationResults,
        validationSummary,
        metadata
      };
      setProcessingReport(report);

      // Mark as complete
      setProcessingProgress(prev => ({
        ...prev,
        stage: 'complete',
        progress: 100,
        message: 'Processing complete!',
      }));

      setUploadStatus('complete');

      // Auto-navigate to Results tab after successful processing
      setActiveTab('results');

      toast({
        title: "Processing complete",
        description: `Successfully created catalogue "${catalogueName}" with ${parsedEvents.length} events!`,
        variant: "default"
      });
    } catch (error) {
      console.error('Catalogue creation error:', error);
      setProcessingProgress(prev => ({
        ...prev,
        stage: 'error',
        message: error instanceof Error ? error.message : 'An error occurred',
      }));
      setUploadStatus('error');
      toast({
        title: "Failed to create catalogue",
        description: error instanceof Error ? error.message : "An error occurred while saving the catalogue",
        variant: "destructive"
      });
    }
  };

  const handleViewCatalogues = () => {
    router.push('/catalogues');
  };

  const buildProcessingReportContent = (): any | null => {
    if (!processingReport) return null;

    const formatBytes = (bytes: number) => {
      if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
    };

    const formatPercent = (value: number) => `${value.toFixed(2)}%`;
    const generatedAt = new Date();
    const processedAt = new Date(processingReport.processedAt);

    const summary = (processingReport.validationSummary || {}) as any;
    const totalEvents = Number(summary.totalEvents ?? processingReport.totalEvents ?? 0);
    const validEvents = Number(summary.validEvents ?? totalEvents);
    const invalidEvents = Number(summary.invalidEvents ?? Math.max(totalEvents - validEvents, 0));
    const validationPassRate = totalEvents > 0 ? (validEvents / totalEvents) * 100 : 100;
    const filesProcessedCount = processingReport.filesProcessed.length;

    const qualityScore = processingReport.qualityScore;
    const qualityGrade = qualityScore !== null ? getQualityGrade(qualityScore) : null;
    const qualityInterpretation = qualityGrade
      ? `${qualityGrade.label} (${qualityGrade.grade})`
      : 'Quality assessment was not available for this run';

    const totalFileSizeBytes = processingReport.filesProcessed.reduce((sum, file) => sum + (file.size || 0), 0);
    const fileFormats = Array.from(new Set(processingReport.filesProcessed.map(file => file.format)));

    const aggregateValidationByCategory: Record<string, number> = {};
    const aggregateSeverity = { error: 0, warning: 0, info: 0 };
    const validationByFile = (processingReport.validationResults || []).map((result: any) => {
      const reportSummary = result.validationReport?.summary || {};
      const byCategory = reportSummary.byCategory || {};
      Object.entries(byCategory).forEach(([category, count]) => {
        aggregateValidationByCategory[category] = (aggregateValidationByCategory[category] || 0) + Number(count);
      });

      aggregateSeverity.error += Number(reportSummary.errorCount || result.errors?.length || 0);
      aggregateSeverity.warning += Number(reportSummary.warningCount || result.warnings?.length || 0);
      aggregateSeverity.info += Number(reportSummary.infoCount || 0);

      return {
        fileName: result.fileName,
        format: result.format,
        isValid: result.isValid,
        eventCount: Number(result.eventCount || 0),
        errorCount: Number(reportSummary.errorCount || result.errors?.length || 0),
        warningCount: Number(reportSummary.warningCount || result.warnings?.length || 0),
        infoCount: Number(reportSummary.infoCount || 0),
        validationSummary: reportSummary,
      };
    });

    const qualityReport = qualityCheckResult?.report;
    const reportContent = {
      reportMetadata: {
        reportType: 'Catalogue Processing Report',
        reportVersion: '2.0',
        generatedAt: {
          iso: generatedAt.toISOString(),
          local: generatedAt.toLocaleString(),
        },
        generatedBy: 'Upload Workflow',
        description: 'Comprehensive processing report for catalogue ingestion, validation, and quality assessment.',
      },
      executiveSummary: {
        description: 'High-level metrics for stakeholders.',
        keyMetrics: {
          totalEventsProcessed: totalEvents,
          filesProcessed: filesProcessedCount,
          overallQualityScore: qualityScore,
          qualityInterpretation,
          validationPassRate: {
            percent: Number(validationPassRate.toFixed(2)),
            display: formatPercent(validationPassRate),
            validEvents,
            invalidEvents,
            totalEvents,
          },
        },
      },
      sections: {
        catalogueInformation: {
          description: 'Core catalogue identity and processing timestamps.',
          catalogueId: processingReport.catalogueId,
          catalogueName: processingReport.catalogueName,
          processedAt: {
            iso: processingReport.processedAt,
            local: processedAt.toLocaleString(),
          },
        },
        fileProcessingDetails: {
          description: 'Uploaded files and processing footprint.',
          totals: {
            filesProcessed: filesProcessedCount,
            totalFileSizeBytes,
            totalFileSizeHuman: formatBytes(totalFileSizeBytes),
            formats: fileFormats,
          },
          files: processingReport.filesProcessed.map(file => ({
            fileName: file.name,
            format: file.format,
            sizeBytes: file.size,
            sizeHuman: formatBytes(file.size),
          })),
        },
        qualityAssessment: {
          description: 'Overall catalogue quality score and supporting metrics.',
          overall: {
            score: qualityScore,
            grade: qualityGrade?.grade || null,
            label: qualityGrade?.label || null,
            interpretation: qualityInterpretation,
          },
          metrics: qualityReport ? {
            completenessPercent: qualityReport.completeness,
            consistencyPercent: qualityReport.consistency,
            accuracyPercent: qualityReport.accuracy,
          } : null,
          qualityChecks: {
            reportChecks: qualityCheckResult?.report?.checks || [],
            anomalyChecks: qualityCheckResult?.anomalies || [],
            geographicChecks: qualityCheckResult?.geographicChecks || [],
            recommendations: qualityCheckResult?.recommendations || [],
          },
          statistics: qualityReport ? {
            totalEvents: qualityReport.statistics.totalEvents,
            validEvents: qualityReport.statistics.validEvents,
            eventsWithUncertainties: qualityReport.statistics.eventsWithUncertainties,
            eventsWithQualityMetrics: qualityReport.statistics.eventsWithQualityMetrics,
            timeRange: qualityReport.statistics.timeRange || null,
            spatialExtent: qualityReport.statistics.spatialExtent || null,
          } : null,
        },
        validationResults: {
          description: 'Validation outcomes by file, category, and severity.',
          summary: {
            totalEvents,
            validEvents,
            invalidEvents,
            passRatePercent: Number(validationPassRate.toFixed(2)),
            passRateDisplay: formatPercent(validationPassRate),
            errorCount: Number(summary.errorCount ?? aggregateSeverity.error),
            warningCount: Number(summary.warningCount ?? aggregateSeverity.warning),
            infoCount: Number(summary.infoCount ?? aggregateSeverity.info),
          },
          byCategory: Object.keys(summary.byCategory || {}).length > 0
            ? summary.byCategory
            : aggregateValidationByCategory,
          bySeverity: aggregateSeverity,
          byFile: validationByFile,
        },
        metadata: {
          description: 'User-provided catalogue metadata submitted during upload.',
          values: processingReport.metadata,
        },
      },
      technicalAppendix: {
        rawValidationResults: processingReport.validationResults,
        rawValidationSummary: processingReport.validationSummary,
        notes: [
          'Timestamps include ISO and locale-formatted variants.',
          'Percentages are rounded to 2 decimal places.',
          'Quality interpretation is derived from getQualityGrade(score).',
        ],
      },
    };
    return reportContent;
  };

  const handleDownloadReport = () => {
    const reportContent = buildProcessingReportContent();
    if (!reportContent || !processingReport) {
      toast({
        title: "No report available",
        description: "Please complete the upload process first.",
        variant: "destructive"
      });
      return;
    }

    // Create and download JSON report
    // Issue #20 fix: Use try-finally to ensure URL cleanup even if download fails
    const blob = new Blob([JSON.stringify(reportContent, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    try {
      a.href = url;
      a.download = `${processingReport.catalogueName.replace(/\s+/g, '_')}_processing_report.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: "Report downloaded",
        description: "Processing report has been downloaded.",
      });
    } finally {
      // Always revoke the URL to prevent memory leaks
      window.URL.revokeObjectURL(url);
    }
  };

  const statusLabels: Record<UploadStatus, string> = {
    idle: 'Ready to upload',
    uploading: 'Uploading files...',
    validating: 'Validating catalogues...',
    mapping: 'Ready for schema mapping',
    metadata: 'Ready for metadata',
    processing: 'Processing catalogues...',
    complete: 'Processing complete',
    error: 'Validation failed'
  };

  const getStatusColor = (status: UploadStatus) => {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'uploading':
      case 'validating':
      case 'processing':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    }
  };

  const reportPreview = buildProcessingReportContent();

  return (
    <div className="container py-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Upload Catalogues</h1>
          <p className="text-sm text-muted-foreground">
            Upload and process earthquake catalogue files from various sources and formats.
          </p>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Catalogue Processing</CardTitle>
                <CardDescription className="text-xs">
                  Upload, validate, and configure your earthquake catalogue data
                </CardDescription>
              </div>
              <Badge className={getStatusColor(uploadStatus)}>
                {statusLabels[uploadStatus]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="upload" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="schema" disabled={uploadStatus !== 'mapping' && uploadStatus !== 'metadata' && uploadStatus !== 'processing' && uploadStatus !== 'complete'}>
                  Schema Mapping
                </TabsTrigger>
                <TabsTrigger value="metadata" disabled={uploadStatus !== 'metadata' && uploadStatus !== 'processing' && uploadStatus !== 'complete'}>
                  Metadata
                </TabsTrigger>
                <TabsTrigger value="results" disabled={uploadStatus !== 'complete'}>
                  Results
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="upload" className="pt-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DelimiterSelector
                      value={delimiter}
                      onChange={setDelimiter}
                      disabled={uploadStatus === 'uploading' || uploadStatus === 'validating'}
                    />

                    <DateFormatSelector
                      value={dateFormat}
                      onChange={setDateFormat}
                      disabled={uploadStatus === 'uploading' || uploadStatus === 'validating'}
                    />
                  </div>

                  <FileUploader
                    files={files}
                    onFilesAdded={handleFilesAdded}
                    onFileRemoved={handleFileRemoved}
                    uploading={uploadStatus === 'uploading' || uploadStatus === 'validating'}
                    progressInfo={uploadProgress}
                    disabled={isReadOnly}
                  />
                </div>

                {validationResults && (
                  <div className="mt-6 space-y-6">
                    <ValidationResults results={validationResults} catalogueName={catalogueName} />

                    {qualityCheckResult && (
                      <DataQualityReport result={qualityCheckResult} />
                    )}

                    {parsedEvents.length > 0 && (
                      <DataCompletenessMetrics events={parsedEvents} />
                    )}

                    {crossFieldValidation && (crossFieldValidation.summary.errors > 0 || crossFieldValidation.summary.warnings > 0) && (
                      <Card className={`shadow-sm ${crossFieldValidation.summary.errors > 0 ? 'border-red-200 dark:border-red-800' : 'border-amber-200 dark:border-amber-800'}`}>
                        <CardHeader className="pb-3">
                          <CardTitle className={`text-base ${crossFieldValidation.summary.errors > 0 ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                            Cross-Field Review
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {crossFieldValidation.summary.failedEvents} event(s) affected —{' '}
                            {crossFieldValidation.summary.errors > 0 && (
                              <span className="text-red-600 dark:text-red-400 font-medium">{crossFieldValidation.summary.errors} high-severity check(s)</span>
                            )}
                            {crossFieldValidation.summary.errors > 0 && crossFieldValidation.summary.warnings > 0 && ', '}
                            {crossFieldValidation.summary.warnings > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">{crossFieldValidation.summary.warnings} warning(s)</span>
                            )}
                            {' '}These checks are advisory and do not block import.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {crossFieldValidation.results
                              .filter((r: any) => r.checks && r.checks.some((c: any) => c.severity === 'error' || c.severity === 'warning'))
                              .slice(0, 5)
                              .map((result: any, idx: number) => (
                                <div key={idx} className="text-xs p-2 bg-muted/50 rounded space-y-1">
                                  <span className="font-medium">Event {result.eventIndex + 1}:</span>
                                  {result.checks
                                    .filter((c: any) => c.severity === 'error' || c.severity === 'warning')
                                    .map((check: any, cIdx: number) => (
                                      <div key={cIdx} className="flex items-start gap-1.5 pl-2">
                                        <span className={`shrink-0 font-semibold ${check.severity === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                          {check.severity === 'error' ? '✕' : '⚠'}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {check.field && <span className="font-medium text-foreground">[{check.field}] </span>}
                                          {check.message}
                                          {check.suggestion && <span className="italic"> — {check.suggestion}</span>}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              ))}
                            {crossFieldValidation.results.filter((r: any) => r.checks && r.checks.some((c: any) => c.severity === 'error' || c.severity === 'warning')).length > 5 && (
                              <p className="text-xs text-muted-foreground italic">
                                ...and {crossFieldValidation.results.filter((r: any) => r.checks && r.checks.some((c: any) => c.severity === 'error' || c.severity === 'warning')).length - 5} more event(s) with issues
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="schema" className="pt-6">
                <EnhancedSchemaMapper
                  isProcessing={uploadStatus === 'processing'}
                  validationResults={validationResults}
                  onSchemaReady={setIsSchemaReady}
                  onMappingsChange={setFieldMappings}
                  readOnly={isReadOnly}
                />
              </TabsContent>

              <TabsContent value="metadata" className="pt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Catalogue Name</CardTitle>
                    <CardDescription>Provide a unique name for this catalogue</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="catalogue-name">Name *</Label>
                      <Input
                        id="catalogue-name"
                        placeholder="e.g., New Zealand Seismic Events 2024"
                        value={catalogueName}
                        onChange={(e) => setCatalogueName(e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <CatalogueMetadataForm
                  metadata={metadata}
                  onChange={setMetadata}
                  readOnly={isReadOnly}
                />

                {/* Processing progress indicator */}
                {uploadStatus === 'processing' && (
                  <ProcessingProgressIndicator progressInfo={processingProgress} />
                )}
              </TabsContent>

              <TabsContent value="results" className="pt-6">
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="h-16 w-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-600 dark:text-green-400"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold mb-2">Processing Complete</h3>
                  <p className="text-muted-foreground mb-6 max-w-md">
                    Your catalogue files have been successfully processed and are now available in your collections.
                  </p>
                  <div className="flex gap-4">
                    <Button variant="default" onClick={handleViewCatalogues}>View Catalogues</Button>
                    <Button variant="outline" onClick={handleDownloadReport}>Download Report</Button>
                  </div>
                </div>

                {reportPreview && (
                  <div className="mt-6 space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>Report Preview</CardTitle>
                        <CardDescription>
                          Preview of the downloadable processing report.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <section className="space-y-2">
                          <h4 className="font-medium">Executive Summary</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div>Total Events: <span className="font-medium">{reportPreview.executiveSummary.keyMetrics.totalEventsProcessed.toLocaleString()}</span></div>
                            <div>Files Processed: <span className="font-medium">{reportPreview.executiveSummary.keyMetrics.filesProcessed}</span></div>
                            <div>Validation Pass Rate: <span className="font-medium">{reportPreview.executiveSummary.keyMetrics.validationPassRate.display}</span></div>
                            <div>Quality: <span className="font-medium">{reportPreview.executiveSummary.keyMetrics.qualityInterpretation}</span></div>
                          </div>
                        </section>

                        <section className="space-y-2">
                          <h4 className="font-medium">Catalogue Information</h4>
                          <div className="text-sm space-y-1">
                            <div>Name: <span className="font-medium">{reportPreview.sections.catalogueInformation.catalogueName}</span></div>
                            <div>ID: <span className="font-mono text-xs">{reportPreview.sections.catalogueInformation.catalogueId}</span></div>
                            <div>Processed: <span className="font-medium">{reportPreview.sections.catalogueInformation.processedAt.local}</span></div>
                          </div>
                        </section>

                        <section className="space-y-2">
                          <h4 className="font-medium">Validation Overview</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <div>Errors: <span className="font-medium">{reportPreview.sections.validationResults.summary.errorCount}</span></div>
                            <div>Warnings: <span className="font-medium">{reportPreview.sections.validationResults.summary.warningCount}</span></div>
                            <div>Info: <span className="font-medium">{reportPreview.sections.validationResults.summary.infoCount}</span></div>
                          </div>
                        </section>

                        <section className="space-y-2">
                          <h4 className="font-medium">File Processing Details</h4>
                          <div className="text-sm mb-2">
                            Total size: <span className="font-medium">{reportPreview.sections.fileProcessingDetails.totals.totalFileSizeHuman}</span>
                          </div>
                          <div className="space-y-1">
                            {reportPreview.sections.fileProcessingDetails.files.map((file: any) => (
                              <div key={file.fileName} className="text-sm flex justify-between border rounded px-3 py-2">
                                <span>{file.fileName} ({file.format})</span>
                                <span className="font-medium">{file.sizeHuman}</span>
                              </div>
                            ))}
                          </div>
                        </section>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between border-t bg-muted/20 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={uploadStatus === 'uploading' || uploadStatus === 'validating' || uploadStatus === 'processing'}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              {activeTab === 'upload' && (
                <Button
                  onClick={handleUpload}
                  disabled={isReadOnly || files.length === 0 || uploadStatus === 'uploading' || uploadStatus === 'validating' || uploadStatus === 'mapping' || uploadStatus === 'metadata' || uploadStatus === 'processing' || uploadStatus === 'complete'}
                >
                  {uploadStatus === 'error' ? 'Retry Upload' : 'Upload and Validate'}
                </Button>
              )}
              {activeTab === 'schema' && (
                <Button
                  onClick={handleSchemaSubmit}
                  disabled={isReadOnly || !isSchemaReady || uploadStatus === 'metadata' || uploadStatus === 'processing' || uploadStatus === 'complete'}
                >
                  Continue to Metadata
                </Button>
              )}
              {activeTab === 'metadata' && (
                <Button
                  onClick={handleMetadataSubmit}
                  disabled={isReadOnly || uploadStatus === 'processing' || uploadStatus === 'complete'}
                >
                  Process Catalogue
                </Button>
              )}
              {activeTab === 'results' && (
                <Button onClick={() => setActiveTab('upload')}>
                  Upload More
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
