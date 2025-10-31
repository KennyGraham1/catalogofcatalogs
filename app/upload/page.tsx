'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileUploader } from '@/components/upload/FileUploader';
import { EnhancedSchemaMapper } from '@/components/upload/EnhancedSchemaMapper';
import { ValidationResults } from '@/components/upload/ValidationResults';
import { DataQualityReport } from '@/components/upload/DataQualityReport';
import { DataCompletenessMetrics } from '@/components/upload/DataCompletenessMetrics';
import { CatalogueMetadataForm, CatalogueMetadata } from '@/components/upload/CatalogueMetadataForm';
import { toast } from '@/hooks/use-toast';
import { performQualityCheck } from '@/lib/data-quality-checker';
import { validateEventsCrossFields } from '@/lib/cross-field-validation';

type UploadStatus = 'idle' | 'uploading' | 'validating' | 'mapping' | 'metadata' | 'processing' | 'complete' | 'error';

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [validationResults, setValidationResults] = useState<any | null>(null);
  const [qualityCheckResult, setQualityCheckResult] = useState<any | null>(null);
  const [crossFieldValidation, setCrossFieldValidation] = useState<any | null>(null);
  const [parsedEvents, setParsedEvents] = useState<any[]>([]);
  const [isSchemaReady, setIsSchemaReady] = useState(false);
  const [catalogueName, setCatalogueName] = useState('');
  const [metadata, setMetadata] = useState<CatalogueMetadata>({});

  const handleFilesAdded = (newFiles: File[]) => {
    setFiles([...files, ...newFiles]);
  };

  const handleFileRemoved = (fileName: string) => {
    setFiles(files.filter(file => file.name !== fileName));
  };

  const handleUpload = () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one file to upload.",
        variant: "destructive"
      });
      return;
    }

    setUploadStatus('uploading');
    
    // Simulate upload process
    setTimeout(() => {
      setUploadStatus('validating');
      
      // Simulate validation
      setTimeout(() => {
        // Generate mock validation results
        const results = files.map(file => {
          const isValid = Math.random() > 0.3;

          return {
            fileName: file.name,
            isValid,
            errors: isValid ? [] : [
              { line: 42, message: "Missing required field 'magnitude'" },
              { line: 156, message: "Invalid timestamp format" }
            ],
            warnings: Math.random() > 0.5 ? [] : [
              { line: 103, message: "Missing optional field 'depth'" }
            ],
            format: file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN',
            eventCount: Math.floor(Math.random() * 5000) + 100,
            fields: ['time', 'latitude', 'longitude', 'depth', 'magnitude', 'source', 'eventId']
          };
        });

        // Generate mock parsed events for quality assessment
        const mockEvents = Array.from({ length: 100 }, (_, i) => ({
          time: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
          latitude: -41.5 + (Math.random() - 0.5) * 10,
          longitude: 174.0 + (Math.random() - 0.5) * 10,
          depth: Math.random() * 100,
          magnitude: 2 + Math.random() * 5,
          latitude_uncertainty: Math.random() > 0.5 ? Math.random() * 0.1 : undefined,
          longitude_uncertainty: Math.random() > 0.5 ? Math.random() * 0.1 : undefined,
          depth_uncertainty: Math.random() > 0.5 ? Math.random() * 5 : undefined,
          azimuthal_gap: Math.random() > 0.5 ? Math.random() * 180 : undefined,
          used_phase_count: Math.random() > 0.5 ? Math.floor(Math.random() * 50) + 10 : undefined,
          used_station_count: Math.random() > 0.5 ? Math.floor(Math.random() * 20) + 5 : undefined,
        }));

        setParsedEvents(mockEvents);

        // Perform quality check
        const qualityResult = performQualityCheck(mockEvents);
        setQualityCheckResult(qualityResult);

        // Perform cross-field validation
        const crossFieldResult = validateEventsCrossFields(mockEvents);
        setCrossFieldValidation(crossFieldResult);

        setValidationResults(results);
        setUploadStatus(results.some(r => !r.isValid) ? 'error' : 'mapping');

        if (!results.some(r => !r.isValid)) {
          setTimeout(() => {
            setActiveTab('schema');
          }, 500);
        }
      }, 1500);
    }, 1500);
  };

  const handleSchemaSubmit = () => {
    setUploadStatus('metadata');
    setActiveTab('metadata');
  };

  const handleMetadataSubmit = () => {
    if (!catalogueName.trim()) {
      toast({
        title: "Catalogue name required",
        description: "Please provide a name for this catalogue.",
        variant: "destructive"
      });
      return;
    }

    setUploadStatus('processing');
    
    // Simulate processing
    setTimeout(() => {
      setUploadStatus('complete');
      toast({
        title: "Processing complete",
        description: `Successfully processed ${files.length} catalogue${files.length > 1 ? 's' : ''}!`,
        variant: "default"
      });
    }, 2000);
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
                <FileUploader
                  files={files}
                  onFilesAdded={handleFilesAdded}
                  onFileRemoved={handleFileRemoved}
                  uploading={uploadStatus === 'uploading'}
                />

                {validationResults && (
                  <div className="mt-6 space-y-6">
                    <ValidationResults results={validationResults} />

                    {qualityCheckResult && (
                      <DataQualityReport result={qualityCheckResult} />
                    )}

                    {parsedEvents.length > 0 && (
                      <DataCompletenessMetrics events={parsedEvents} />
                    )}

                    {crossFieldValidation && crossFieldValidation.summary.errors > 0 && (
                      <Card className="shadow-sm border-amber-200 dark:border-amber-800">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base text-amber-800 dark:text-amber-300">
                            Cross-Field Validation Issues
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {crossFieldValidation.summary.errors} error(s), {crossFieldValidation.summary.warnings} warning(s) detected
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {crossFieldValidation.results
                              .filter((r: any) => r.checks.length > 0)
                              .slice(0, 5)
                              .map((result: any, idx: number) => (
                                <div key={idx} className="text-xs p-2 bg-muted/50 rounded">
                                  <span className="font-medium">Event {result.eventIndex + 1}:</span>{' '}
                                  {result.checks[0].message}
                                </div>
                              ))}
                            {crossFieldValidation.results.filter((r: any) => r.checks.length > 0).length > 5 && (
                              <p className="text-xs text-muted-foreground italic">
                                ...and {crossFieldValidation.results.filter((r: any) => r.checks.length > 0).length - 5} more issues
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
                />
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
                    <Button variant="default">View Catalogues</Button>
                    <Button variant="outline">Download Report</Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between border-t bg-muted/20 px-6 py-4">
            <Button
              variant="ghost"
              disabled={uploadStatus === 'uploading' || uploadStatus === 'validating' || uploadStatus === 'processing'}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              {activeTab === 'upload' && (
                <Button
                  onClick={handleUpload}
                  disabled={files.length === 0 || uploadStatus === 'uploading' || uploadStatus === 'validating' || uploadStatus === 'mapping' || uploadStatus === 'metadata' || uploadStatus === 'processing' || uploadStatus === 'complete'}
                >
                  {uploadStatus === 'error' ? 'Retry Upload' : 'Upload and Validate'}
                </Button>
              )}
              {activeTab === 'schema' && (
                <Button
                  onClick={handleSchemaSubmit}
                  disabled={!isSchemaReady || uploadStatus === 'metadata' || uploadStatus === 'processing' || uploadStatus === 'complete'}
                >
                  Continue to Metadata
                </Button>
              )}
              {activeTab === 'metadata' && (
                <Button
                  onClick={handleMetadataSubmit}
                  disabled={uploadStatus === 'processing' || uploadStatus === 'complete'}
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