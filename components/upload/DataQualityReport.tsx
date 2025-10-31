import { AlertTriangle, CheckCircle, AlertCircle, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { QualityCheckResult } from '@/lib/data-quality-checker';
import { getQualityGrade } from '@/lib/data-quality-checker';

interface DataQualityReportProps {
  result: QualityCheckResult;
}

export function DataQualityReport({ result }: DataQualityReportProps) {
  const grade = getQualityGrade(result.score);
  
  const gradeColors: Record<string, string> = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 border-green-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 border-blue-300',
    yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300 border-orange-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 border-red-300',
  };

  const getSeverityIcon = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800';
      case 'warning':
        return 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';
    }
  };

  const errorCount = [
    ...result.report.checks,
    ...result.anomalies,
    ...result.geographicChecks
  ].filter(c => c.severity === 'error').length;

  const warningCount = [
    ...result.report.checks,
    ...result.anomalies,
    ...result.geographicChecks
  ].filter(c => c.severity === 'warning').length;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Data Quality Assessment</CardTitle>
            <CardDescription className="text-xs">
              Comprehensive quality analysis of uploaded earthquake data
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {errorCount > 0 && (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                {errorCount} Error{errorCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                {warningCount} Warning{warningCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {result.passed && (
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                <CheckCircle className="h-3 w-3 mr-1" />
                Passed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Quality Score</span>
            <Badge className={gradeColors[grade.color]}>
              {grade.grade} - {grade.label}
            </Badge>
          </div>
          <Progress value={result.score} className="h-2" />
          <p className="text-xs text-muted-foreground">{result.score}/100</p>
        </div>

        {/* Quality Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Completeness</span>
              <span className="text-xs text-muted-foreground">{result.report.completeness}%</span>
            </div>
            <Progress value={result.report.completeness} className="h-1.5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Consistency</span>
              <span className="text-xs text-muted-foreground">{result.report.consistency}%</span>
            </div>
            <Progress value={result.report.consistency} className="h-1.5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Accuracy</span>
              <span className="text-xs text-muted-foreground">{result.report.accuracy}%</span>
            </div>
            <Progress value={result.report.accuracy} className="h-1.5" />
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Events</p>
            <p className="text-lg font-semibold">{result.report.statistics.totalEvents}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Valid Events</p>
            <p className="text-lg font-semibold">{result.report.statistics.validEvents}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">With Uncertainties</p>
            <p className="text-sm font-medium">{result.report.statistics.eventsWithUncertainties}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">With Quality Metrics</p>
            <p className="text-sm font-medium">{result.report.statistics.eventsWithQualityMetrics}</p>
          </div>
          {result.report.statistics.averageMagnitude > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Avg Magnitude</p>
              <p className="text-sm font-medium">{result.report.statistics.averageMagnitude.toFixed(1)}</p>
            </div>
          )}
          {result.report.statistics.averageDepth > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Avg Depth</p>
              <p className="text-sm font-medium">{result.report.statistics.averageDepth.toFixed(1)} km</p>
            </div>
          )}
        </div>

        {/* Time Range */}
        {result.report.statistics.timeRange && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium mb-1">Time Range</p>
            <p className="text-xs text-muted-foreground">
              {new Date(result.report.statistics.timeRange.start).toLocaleDateString()} - {new Date(result.report.statistics.timeRange.end).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Spatial Extent */}
        {result.report.statistics.spatialExtent && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium mb-1">Spatial Extent</p>
            <p className="text-xs text-muted-foreground">
              Lat: {result.report.statistics.spatialExtent.minLat.toFixed(2)}° to {result.report.statistics.spatialExtent.maxLat.toFixed(2)}°
              <br />
              Lon: {result.report.statistics.spatialExtent.minLon.toFixed(2)}° to {result.report.statistics.spatialExtent.maxLon.toFixed(2)}°
            </p>
          </div>
        )}

        {/* Detailed Checks */}
        <Tabs defaultValue="checks" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="checks">Quality Checks</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          <TabsContent value="checks" className="space-y-2 mt-3">
            {result.report.checks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No quality checks to display</p>
            ) : (
              <div className="space-y-2">
                {result.report.checks.map((check, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2 p-3 border rounded-lg text-sm ${getSeverityColor(check.severity)}`}
                  >
                    {getSeverityIcon(check.severity)}
                    <div className="flex-1 space-y-1">
                      <p className="font-medium">{check.message}</p>
                      {check.field && (
                        <p className="text-xs text-muted-foreground">Field: {check.field}</p>
                      )}
                      {check.suggestion && (
                        <p className="text-xs italic">{check.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="anomalies" className="space-y-2 mt-3">
            {[...result.anomalies, ...result.geographicChecks].length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium">No anomalies detected</p>
                <p className="text-xs text-muted-foreground">Data appears normal</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...result.anomalies, ...result.geographicChecks].map((check, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-2 p-3 border rounded-lg text-sm ${getSeverityColor(check.severity)}`}
                  >
                    {getSeverityIcon(check.severity)}
                    <div className="flex-1 space-y-1">
                      <p className="font-medium">{check.message}</p>
                      {check.field && (
                        <p className="text-xs text-muted-foreground">Field: {check.field}</p>
                      )}
                      {check.suggestion && (
                        <p className="text-xs italic">{check.suggestion}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-2 mt-3">
            {result.recommendations.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium">No recommendations</p>
                <p className="text-xs text-muted-foreground">Data quality is excellent</p>
              </div>
            ) : (
              <div className="space-y-2">
                {result.recommendations.map((recommendation, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm"
                  >
                    <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                    <p>{recommendation}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

