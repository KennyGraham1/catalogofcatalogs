import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { calculateCompleteness } from '@/lib/data-quality-checker';

interface DataCompletenessMetricsProps {
  events: any[];
  requiredFields?: string[];
  optionalFields?: string[];
}

const DEFAULT_REQUIRED_FIELDS = ['time', 'latitude', 'longitude', 'magnitude'];
const DEFAULT_OPTIONAL_FIELDS = [
  'depth',
  'magnitude_type',
  'region',
  'source',
  'latitude_uncertainty',
  'longitude_uncertainty',
  'depth_uncertainty',
  'magnitude_uncertainty',
  'azimuthal_gap',
  'used_phase_count',
  'used_station_count',
  'standard_error',
  'evaluation_mode',
  'evaluation_status',
];

export function DataCompletenessMetrics({
  events,
  requiredFields = DEFAULT_REQUIRED_FIELDS,
  optionalFields = DEFAULT_OPTIONAL_FIELDS,
}: DataCompletenessMetricsProps) {
  const completeness = calculateCompleteness(events, requiredFields, optionalFields);

  const getCompletenessColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600 dark:text-green-400';
    if (percentage >= 70) return 'text-blue-600 dark:text-blue-400';
    if (percentage >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getCompletenessLabel = (percentage: number) => {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 70) return 'Good';
    if (percentage >= 50) return 'Fair';
    return 'Poor';
  };

  const getFieldStatus = (field: string) => {
    const presentCount = events.filter(
      e => e[field] !== null && e[field] !== undefined && e[field] !== ''
    ).length;
    const percentage = events.length > 0 ? (presentCount / events.length) * 100 : 0;
    return { presentCount, percentage };
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Data Completeness Metrics</CardTitle>
        <CardDescription className="text-xs">
          Analysis of field coverage and data completeness
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Completeness */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Completeness</span>
            <Badge variant="outline" className={getCompletenessColor(completeness.overall)}>
              {getCompletenessLabel(completeness.overall)}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span>Overall</span>
              <span className="font-medium">{completeness.overall}%</span>
            </div>
            <Progress value={completeness.overall} className="h-2" />
          </div>
        </div>

        {/* Required vs Optional */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Required Fields</span>
              <span className={`text-xs font-semibold ${getCompletenessColor(completeness.required)}`}>
                {completeness.required}%
              </span>
            </div>
            <Progress value={completeness.required} className="h-1.5" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Optional Fields</span>
              <span className={`text-xs font-semibold ${getCompletenessColor(completeness.optional)}`}>
                {completeness.optional}%
              </span>
            </div>
            <Progress value={completeness.optional} className="h-1.5" />
          </div>
        </div>

        {/* Required Fields Detail */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Required Fields Coverage</h4>
          <div className="space-y-1.5">
            {requiredFields.map(field => {
              const status = getFieldStatus(field);
              const isComplete = status.percentage === 100;
              return (
                <div key={field} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                  <div className="flex items-center gap-2">
                    {isComplete ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className="font-medium">{field}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {status.presentCount}/{events.length}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        isComplete
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                      }`}
                    >
                      {status.percentage.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Optional Fields Detail */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Optional Fields Coverage</h4>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {optionalFields.map(field => {
              const status = getFieldStatus(field);
              const hasData = status.percentage > 0;
              return (
                <div key={field} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                  <div className="flex items-center gap-2">
                    {hasData ? (
                      status.percentage >= 50 ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                      )
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-gray-400" />
                    )}
                    <span className={hasData ? 'font-medium' : 'text-muted-foreground'}>{field}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {status.presentCount}/{events.length}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        status.percentage >= 75
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : status.percentage >= 50
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                          : status.percentage >= 25
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {status.percentage.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Missing Fields Summary */}
        {Object.keys(completeness.missingFields).length > 0 && (
          <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Missing Data Summary
            </h4>
            <div className="space-y-1">
              {Object.entries(completeness.missingFields)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([field, count]) => (
                  <div key={field} className="flex items-center justify-between text-xs">
                    <span className="font-medium">{field}</span>
                    <span className="text-muted-foreground">
                      {count} event{count !== 1 ? 's' : ''} missing
                    </span>
                  </div>
                ))}
              {Object.keys(completeness.missingFields).length > 5 && (
                <p className="text-xs text-muted-foreground italic">
                  ...and {Object.keys(completeness.missingFields).length - 5} more fields
                </p>
              )}
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Recommendations
          </h4>
          <ul className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
            {completeness.required < 100 && (
              <li>• Ensure all required fields (time, latitude, longitude, magnitude) are populated</li>
            )}
            {completeness.optional < 50 && (
              <li>• Consider adding uncertainty estimates and quality metrics for better analysis</li>
            )}
            {events.filter(e => !e.depth || e.depth === 0).length > events.length * 0.5 && (
              <li>• Many events are missing depth information - this is important for seismological analysis</li>
            )}
            {events.filter(e => !e.magnitude_type).length > events.length * 0.5 && (
              <li>• Magnitude type information is missing - specify ML, Mw, mb, etc.</li>
            )}
            {completeness.overall >= 90 && (
              <li>• Data completeness is excellent - ready for high-quality analysis</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

