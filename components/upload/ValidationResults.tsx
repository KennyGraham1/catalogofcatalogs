import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

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
}

interface ValidationResultsProps {
  results: ValidationResult[];
}

export function ValidationResults({ results }: ValidationResultsProps) {
  const hasErrors = results.some(result => !result.isValid);
  const warningCount = results.reduce((count, result) => count + result.warnings.length, 0);
  const errorCount = results.reduce((count, result) => count + result.errors.length, 0);
  
  const formatColors: Record<string, string> = {
    CSV: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    TXT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    QML: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
    JSON: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    XML: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
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
                    {result.errors.length > 0 && (
                      <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                        {result.errors.length} Error{result.errors.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {result.warnings.length > 0 && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                        {result.warnings.length} Warning{result.warnings.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Detected Fields</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.fields.map((field, i) => (
                        <Badge key={i} variant="secondary">{field}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  {result.errors.length > 0 && (
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
                  
                  {result.warnings.length > 0 && (
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