'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, X, File, FileSpreadsheet, FileJson, FilePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface FileUploaderProps {
  files: File[];
  onFilesAdded: (files: File[]) => void;
  onFileRemoved: (fileName: string) => void;
  uploading?: boolean;
}

export function FileUploader({ files, onFilesAdded, onFileRemoved, uploading = false }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simulate progress during upload with proper cleanup
  useEffect(() => {
    if (!uploading) {
      setUploadProgress(0);
      return;
    }

    if (uploadProgress >= 100) {
      return;
    }

    const timer = setTimeout(() => {
      setUploadProgress(prev => Math.min(prev + 5, 100));
    }, 150);

    return () => clearTimeout(timer);
  }, [uploading, uploadProgress]);

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

      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} />
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
                      variant="ghost"
                      size="icon"
                      onClick={() => onFileRemoved(file.name)}
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