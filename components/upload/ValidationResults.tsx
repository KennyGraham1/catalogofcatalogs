'use client';

import { AlertTriangle, CheckCircle, AlertCircle, Info, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { ValidationFailureDetail, ValidationFailureReport } from '@/lib/validation';

interface ValidationError {
  line: number;
  message: string;
}

interface ValidationResult {
  fileName: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  format: string;
  eventCount: number;
  fields: string[];
  validationReport?: ValidationFailureReport;
}

interface ValidationResultsProps {
  results: ValidationResult[];
  catalogueName?: string;
}

export function ValidationResults({ results, catalogueName }: ValidationResultsProps) {
  const warningCount = results.reduce(
    (count, result) => count + (result.validationReport?.summary.warningCount ?? result.warnings.length),
    0
  );
  const errorCount = results.reduce(
    (count, result) => count + (result.validationReport?.summary.errorCount ?? result.errors.length),
    0
  );
  
  const formatColors: Record<string, string> = {
    CSV: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    TXT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    QML: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    JSON: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    XML: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  };

  const getFailureLocation = (failure: ValidationFailureDetail) => {
    if (failure.line !== undefined) {
      return `Line ${failure.line}`;
    }
    if (failure.eventIndex !== undefined) {
      return `Event ${failure.eventIndex + 1}`;
    }
    return 'Event';
  };

  const formatValue = (value: unknown) => {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const downloadBlob = (content: string, fileName: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const downloadJsonReport = (result: ValidationResult) => {
    if (!result.validationReport) return;
    const payload = {
      catalogueName: catalogueName || null,
      fileName: result.fileName,
      format: result.format,
      generatedAt: result.validationReport.generatedAt,
      summary: result.validationReport.summary,
      failures: result.validationReport.failures
    };
    const baseName = result.fileName.replace(/\.[^/.]+$/, '');
    downloadBlob(JSON.stringify(payload, null, 2), `${baseName}_validation_report.json`, 'application/json');
  };

  const downloadCsvReport = (result: ValidationResult) => {
    if (!result.validationReport) return;
    const baseName = result.fileName.replace(/\.[^/.]+$/, '');
    const headers = [
      'catalogue_name',
      'file_name',
      'validation_timestamp',
      'event_index',
      'line',
      'event_id',
      'severity',
      'category',
      'field',
      'message',
      'value',
      'expected'
    ];

    const escapeCsv = (value: unknown) => {
      const raw = formatValue(value);
      if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };

    const rows = result.validationReport.failures.map(failure => [
      catalogueName || '',
      result.fileName,
      result.validationReport?.generatedAt || '',
      failure.eventIndex ?? '',
      failure.line ?? '',
      failure.eventId ?? '',
      failure.severity,
      failure.category,
      failure.field ?? '',
      failure.message,
      formatValue(failure.value),
      failure.expected ?? ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => escapeCsv(cell)).join(','))
    ].join('\n');

    downloadBlob(csv, `${baseName}_validation_report.csv`, 'text/csv');
  };

  const renderFailureList = (failures: ValidationFailureDetail[], severity: 'error' | 'warning' | 'info') => {
    const maxItems = 50;
    const displayed = failures.slice(0, maxItems);
    const remaining = failures.length - displayed.length;
    const icon = severity === 'error' ? (
      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
    ) : severity === 'warning' ? (
      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
    ) : (
      <Info className="h-4 w-4 text-blue-500 mt-0.5" />
    );

    const containerStyle = severity === 'error'
      ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
      : severity === 'warning'
        ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
        : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';

    return (
      <div className="space-y-2">
        {displayed.map((failure, i) => (
          <div
            key={`${failure.message}-${i}`}
            className={`flex items-start gap-2 p-2 border rounded text-sm ${containerStyle}`}
          >
            {icon}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{getFailureLocation(failure)}</span>
                {failure.field && <Badge variant="secondary">{failure.field}</Badge>}
                <Badge variant="outline">{failure.category.replace(/_/g, ' ')}</Badge>
              </div>
              <div className="font-medium">{failure.message}</div>
              <div className="text-xs text-muted-foreground">
                Value: {formatValue(failure.value)}{failure.expected ? ` · Expected: ${failure.expected}` : ''}
              </div>
            </div>
          </div>
        ))}
        {remaining > 0 && (
          <p className="text-xs text-muted-foreground italic">
            ...and {remaining} more {severity} item{remaining !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Validation Results</CardTitle>
          <div className="flex gap-2">
            {warningCount > 0 && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                {warningCount} Warning{warningCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                {errorCount} Error{errorCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {errorCount === 0 && (
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                Valid
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="space-y-2">
          {results.map((result, index) => (
            <AccordionItem 
              value={`item-${index}`} 
              key={index}
              className={`border rounded-md ${!result.isValid ? 'border-red-200 dark:border-red-800' : ''}`}
            >
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    {result.isValid ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="font-medium">{result.fileName}</span>
                    <Badge variant="outline" className={formatColors[result.format] || ''}>
                      {result.format}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <span>{result.eventCount} events</span>
                    {(result.validationReport?.summary.errorCount ?? result.errors.length) > 0 && (
                      <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                        {result.validationReport?.summary.errorCount ?? result.errors.length} Error{(result.validationReport?.summary.errorCount ?? result.errors.length) !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {(result.validationReport?.summary.warningCount ?? result.warnings.length) > 0 && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                        {result.validationReport?.summary.warningCount ?? result.warnings.length} Warning{(result.validationReport?.summary.warningCount ?? result.warnings.length) !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  {result.validationReport && (
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium mb-2">Validation Summary</h4>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadJsonReport(result)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            JSON
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadCsvReport(result)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            CSV
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">Total Events</p>
                          <p className="font-medium">{result.validationReport.summary.totalEvents}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">Valid Events</p>
                          <p className="font-medium">{result.validationReport.summary.validEvents}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">Invalid Events</p>
                          <p className="font-medium">{result.validationReport.summary.invalidEvents}</p>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">Failures</p>
                          <p className="font-medium">{result.validationReport.summary.failureCount}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Object.entries(result.validationReport.summary.byCategory)
                          .filter(([, count]) => count > 0)
                          .map(([category, count]) => (
                            <Badge key={category} variant="outline">
                              {category.replace(/_/g, ' ')}: {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium mb-2">Detected Fields</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.fields.map((field, i) => (
                        <Badge key={i} variant="secondary">{field}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  {!result.validationReport && result.errors.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 text-red-600 dark:text-red-400">Errors</h4>
                      <div className="space-y-2">
                        {result.errors.map((error, i) => (
                          <div 
                            key={i}
                            className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm"
                          >
                            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                            <div>
                              <span className="font-medium">Line {error.line}: </span>
                              <span>{error.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {!result.validationReport && result.warnings.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 text-amber-600 dark:text-amber-400">Warnings</h4>
                      <div className="space-y-2">
                        {result.warnings.map((warning, i) => (
                          <div 
                            key={i}
                            className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-sm"
                          >
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                            <div>
                              <span className="font-medium">Line {warning.line}: </span>
                              <span>{warning.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.validationReport && result.validationReport.failures.length > 0 && (
                    <div className="space-y-4">
                      {result.validationReport.summary.errorCount > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 text-red-600 dark:text-red-400">Errors</h4>
                          {renderFailureList(
                            result.validationReport.failures.filter(failure => failure.severity === 'error'),
                            'error'
                          )}
                        </div>
                      )}

                      {result.validationReport.summary.warningCount > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 text-amber-600 dark:text-amber-400">Warnings</h4>
                          {renderFailureList(
                            result.validationReport.failures.filter(failure => failure.severity === 'warning'),
                            'warning'
                          )}
                        </div>
                      )}

                      {result.validationReport.summary.infoCount > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 text-blue-600 dark:text-blue-400">Info</h4>
                          {renderFailureList(
                            result.validationReport.failures.filter(failure => failure.severity === 'info'),
                            'info'
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex justify-end">
                    {!result.isValid ? (
                      <Button variant="destructive" size="sm">Remove File</Button>
                    ) : (
                      <Button variant="outline" size="sm">Preview Data</Button>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
