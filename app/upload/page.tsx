'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileUploader } from '@/components/upload/FileUploader';
import { EnhancedSchemaMapper } from '@/components/upload/EnhancedSchemaMapper';
import { ValidationResults } from '@/components/upload/ValidationResults';
import { toast } from '@/hooks/use-toast';

type UploadStatus = 'idle' | 'uploading' | 'validating' | 'mapping' | 'processing' | 'complete' | 'error';

export default function UploadPage() {
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [validationResults, setValidationResults] = useState<any | null>(null);
  const [isSchemaReady, setIsSchemaReady] = useState(false);

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
    <div className="container py-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload Catalogues</h1>
          <p className="text-muted-foreground">
            Upload and process earthquake catalogue files from various sources and formats.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Catalogue Processing</CardTitle>
                <CardDescription>
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
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="schema" disabled={uploadStatus !== 'mapping' && uploadStatus !== 'processing' && uploadStatus !== 'complete'}>
                  Schema Mapping
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
                  <div className="mt-6">
                    <ValidationResults results={validationResults} />
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
                  disabled={files.length === 0 || uploadStatus === 'uploading' || uploadStatus === 'validating' || uploadStatus === 'mapping' || uploadStatus === 'processing' || uploadStatus === 'complete'}
                >
                  {uploadStatus === 'error' ? 'Retry Upload' : 'Upload and Validate'}
                </Button>
              )}
              {activeTab === 'schema' && (
                <Button 
                  onClick={handleSchemaSubmit}
                  disabled={!isSchemaReady || uploadStatus === 'processing' || uploadStatus === 'complete'}
                >
                  Process Catalogues
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