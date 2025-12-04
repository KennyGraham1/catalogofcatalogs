'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, X, File, FileSpreadsheet, FileJson, FilePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export type UploadStage = 'idle' | 'uploading' | 'parsing' | 'validating' | 'saving' | 'complete' | 'error';

export interface UploadProgressInfo {
  stage: UploadStage;
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  currentFile?: string;
  filesCompleted: number;
  totalFiles: number;
  startTime?: number;
  message?: string;
}

interface FileUploaderProps {
  files: File[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (fileName: string) => void;
  uploading?: boolean;
  progressInfo?: UploadProgressInfo;
}

const stageLabels: Record<UploadStage, string> = {
  idle: 'Ready',
  uploading: 'Uploading files...',
  parsing: 'Parsing catalogue data...',
  validating: 'Validating events...',
  saving: 'Saving to database...',
  complete: 'Complete',
  error: 'Error'
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m remaining`;
  return `${Math.ceil(seconds / 3600)}h remaining`;
}

export function FileUploader({
  files,
  onFilesAdded,
  onFileRemoved,
  uploading = false,
  progressInfo
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate total file size
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  // Simulate progress during upload when no progressInfo is provided
  useEffect(() => {
    if (!uploading || progressInfo) {
      setSimulatedProgress(0);
      return;
    }

    if (simulatedProgress >= 100) {
      return;
    }

    const timer = setTimeout(() => {
      setSimulatedProgress(prev => Math.min(prev + 5, 100));
    }, 150);

    return () => clearTimeout(timer);
  }, [uploading, simulatedProgress, progressInfo]);

  // Calculate ETA based on progress info
  const getETA = (): string | null => {
    if (!progressInfo?.startTime || progressInfo.progress <= 0) return null;
    const elapsed = (Date.now() - progressInfo.startTime) / 1000;
    const rate = progressInfo.progress / elapsed;
    if (rate <= 0) return null;
    const remaining = (100 - progressInfo.progress) / rate;
    return formatTimeRemaining(remaining);
  };

  // Determine actual progress to display
  const displayProgress = progressInfo?.progress ?? simulatedProgress;
  const isActive = uploading || (progressInfo && progressInfo.stage !== 'idle' && progressInfo.stage !== 'complete');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesAdded(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(Array.from(e.target.files));
    }
  };

  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    switch (extension) {
      case 'csv':
      case 'txt':
        return FileSpreadsheet;
      case 'json':
      case 'xml':
      case 'qml':
        return FileJson;
      default:
        return File;
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="p-3 rounded-full bg-primary/10">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          
          <div>
            <h3 className="font-semibold text-lg mb-1">Upload Earthquake Catalogues</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Drag and drop your catalogue files here, or click to browse. 
              Supported formats: CSV, TXT, QML, JSON, XML.
            </p>
          </div>
          
          <Button 
            type="button" 
            onClick={openFileDialog}
            disabled={uploading}
            variant="outline"
            className="relative"
          >
            <FilePlus className="mr-2 h-4 w-4" />
            Select Files
          </Button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
            multiple
            accept=".csv,.txt,.qml,.json,.xml"
            disabled={uploading}
          />
        </div>
      </div>

      {/* Enhanced Progress Indicator */}
      {isActive && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          {/* Stage indicator */}
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="font-medium text-sm">
              {progressInfo ? stageLabels[progressInfo.stage] : 'Processing...'}
            </span>
            {progressInfo?.message && (
              <span className="text-xs text-muted-foreground ml-2">
                {progressInfo.message}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <Progress value={displayProgress} className="h-2" />

          {/* Progress details */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <div className="flex gap-4">
              {/* Bytes uploaded / total */}
              {progressInfo && progressInfo.totalBytes > 0 ? (
                <span>
                  {formatBytes(progressInfo.bytesUploaded)} / {formatBytes(progressInfo.totalBytes)}
                </span>
              ) : totalBytes > 0 ? (
                <span>Total: {formatBytes(totalBytes)}</span>
              ) : null}

              {/* Files progress */}
              {progressInfo && progressInfo.totalFiles > 1 && (
                <span>
                  File {progressInfo.filesCompleted + 1} of {progressInfo.totalFiles}
                  {progressInfo.currentFile && `: ${progressInfo.currentFile}`}
                </span>
              )}
            </div>

            <div className="flex gap-4">
              {/* ETA */}
              {getETA() && <span>{getETA()}</span>}

              {/* Percentage */}
              <span className="font-medium">{Math.round(displayProgress)}%</span>
            </div>
          </div>

          {/* Stage indicators */}
          {progressInfo && (
            <div className="flex items-center gap-1 pt-1">
              {(['uploading', 'parsing', 'validating', 'saving'] as UploadStage[]).map((stage, idx) => {
                const stages: UploadStage[] = ['uploading', 'parsing', 'validating', 'saving'];
                const currentIdx = stages.indexOf(progressInfo.stage);
                const stageIdx = stages.indexOf(stage);
                const isComplete = stageIdx < currentIdx || progressInfo.stage === 'complete';
                const isCurrent = stageIdx === currentIdx;

                return (
                  <div key={stage} className="flex items-center">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        isComplete
                          ? 'bg-green-500'
                          : isCurrent
                          ? 'bg-primary animate-pulse'
                          : 'bg-muted-foreground/30'
                      }`}
                    />
                    <span
                      className={`text-[10px] mx-1 ${
                        isComplete || isCurrent ? 'text-foreground' : 'text-muted-foreground/50'
                      }`}
                    >
                      {stage.charAt(0).toUpperCase() + stage.slice(1)}
                    </span>
                    {idx < 3 && (
                      <div
                        className={`w-4 h-0.5 ${
                          isComplete ? 'bg-green-500' : 'bg-muted-foreground/30'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-sm font-medium">
            {files.length} file{files.length > 1 ? 's' : ''} selected
          </div>
          <div className="divide-y">
            {files.map((file, index) => {
              const FileIcon = getFileIcon(file.name);
              return (
                <div key={index} className="flex items-center justify-between p-3 hover:bg-muted/20">
                  <div className="flex items-center space-x-3">
                    <FileIcon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB • {file.type || 'Unknown type'}
                      </p>
                    </div>
                  </div>
                  {!uploading && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onFileRemoved(file.name);
                      }}
                      className="h-7 w-7"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}