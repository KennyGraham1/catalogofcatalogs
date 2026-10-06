'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MapPin, Ruler, Clock, Target } from 'lucide-react';
import {
  formatUncertainty,
  getUncertaintyLevel,
  calculateLocationQuality,
  horizontalUncertaintyKm,
  UncertaintyData
} from '@/lib/uncertainty-utils';
import { TechnicalTermTooltip } from '@/components/ui/info-tooltip';

interface UncertaintyVisualizationProps {
  data: UncertaintyData;
}

export function UncertaintyVisualization({ data }: UncertaintyVisualizationProps) {
  const quality = calculateLocationQuality(data);

  // Whichever horizontal measure the source reported: ellipse axis, circular radius or
  // lat/lon marginals. Absence stays 'unknown' rather than becoming 0 km / 'excellent'.
  const horizontal = horizontalUncertaintyKm(data);
  const horizontalLevel = getUncertaintyLevel(horizontal?.km ?? null, 'horizontal-km');
  const horizontalSourceLabel =
    horizontal?.source === 'origin-uncertainty' ? 'error ellipse semi-major axis'
    : horizontal?.source === 'horizontal-circle' ? 'circular horizontal uncertainty'
    : horizontal ? 'from latitude/longitude marginals' : null;
  
  const depthLevel = getUncertaintyLevel(data.depth_uncertainty, 'depth');
  const timeLevel = getUncertaintyLevel(data.time_uncertainty, 'time');

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'excellent': return 'bg-green-500';
      case 'good': return 'bg-lime-500';
      case 'fair': return 'bg-yellow-500';
      case 'poor': return 'bg-orange-500';
      default: return 'bg-gray-400';
    }
  };

  const getLevelBadgeVariant = (level: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (level) {
      case 'excellent': return 'default';
      case 'good': return 'secondary';
      case 'fair': return 'outline';
      case 'unknown': return 'outline';
      default: return 'destructive';
    }
  };

  // Grades map onto the same colour bands as the level badges.
  const gradeVariant = (grade: 'A' | 'B' | 'C' | 'D' | 'F' | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (grade === null) return 'outline';
    if (grade === 'A') return 'default';
    if (grade === 'B') return 'secondary';
    if (grade === 'C') return 'outline';
    return 'destructive';
  };

  /** Progress bar for one factor; renders "not reported" instead of a full bar when absent. */
  const FactorBar = ({ level, value }: { level: string; value: number | null }) =>
    value === null ? (
      <p className="text-xs text-muted-foreground italic">Not reported — excluded from the score</p>
    ) : (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${getLevelColor(level)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Location Uncertainty</CardTitle>
            <TechnicalTermTooltip term="uncertainty" />
          </div>
          <Badge variant={gradeVariant(quality.grade)}>
            {quality.grade === null ? 'No uncertainty metadata' : `Grade: ${quality.grade}`}
          </Badge>
        </div>
        <CardDescription>
          Precision and reliability of earthquake location
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Quality Score */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">Location Quality Score</span>
            <span className="text-muted-foreground">
              {quality.score === null ? 'not scored' : `${quality.score}/100`}
            </span>
          </div>
          <Progress value={quality.score ?? 0} className="h-3" aria-label="Uncertainty quality score" />
          <p className="text-xs text-muted-foreground mt-1">
            {quality.score === null
              ? 'This event reports none of the four uncertainty fields, so no quality score can be computed.'
              : `Weighted over the ${quality.scoredFactors.length} of 4 uncertainty fields this event reports (${Math.round(quality.metadataCoverage * 100)}% of the scoring weight).`}
          </p>
        </div>

        {/* Horizontal Uncertainty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Horizontal Uncertainty</span>
            </div>
            <Badge variant={getLevelBadgeVariant(horizontalLevel.level)}>
              {horizontalLevel.level}
            </Badge>
          </div>
          {horizontal && (
            <div className="text-sm">
              <span className="text-muted-foreground">Horizontal:</span>
              <span className="ml-2 font-medium">± {formatUncertainty(horizontal.km, 'km')}</span>
              <span className="ml-2 text-xs text-muted-foreground">({horizontalSourceLabel})</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Latitude:</span>
              <span className="ml-2 font-medium">
                ± {formatUncertainty(data.latitude_uncertainty, 'degrees')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Longitude:</span>
              <span className="ml-2 font-medium">
                ± {formatUncertainty(data.longitude_uncertainty, 'degrees')}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{horizontalLevel.description}</p>
          <FactorBar level={horizontalLevel.level} value={quality.factors.horizontalUncertainty} />
        </div>

        {/* Depth Uncertainty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Depth Uncertainty</span>
            </div>
            <Badge variant={getLevelBadgeVariant(depthLevel.level)}>
              {depthLevel.level}
            </Badge>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Uncertainty:</span>
            <span className="ml-2 font-medium">
              ± {formatUncertainty(data.depth_uncertainty, 'km')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{depthLevel.description}</p>
          <FactorBar level={depthLevel.level} value={quality.factors.depthUncertainty} />
        </div>

        {/* Time Uncertainty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Time Uncertainty</span>
            </div>
            <Badge variant={getLevelBadgeVariant(timeLevel.level)}>
              {timeLevel.level}
            </Badge>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Uncertainty:</span>
            <span className="ml-2 font-medium">
              ± {formatUncertainty(data.time_uncertainty, 'seconds')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{timeLevel.description}</p>
          <FactorBar level={timeLevel.level} value={quality.factors.timeUncertainty} />
        </div>

        {/* Azimuthal Gap */}
        {data.azimuthal_gap !== null && data.azimuthal_gap !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Azimuthal Gap</span>
                <TechnicalTermTooltip term="azimuthalGap" />
              </div>
              <Badge variant={data.azimuthal_gap < 90 ? 'default' : data.azimuthal_gap < 180 ? 'secondary' : 'destructive'}>
                {data.azimuthal_gap.toFixed(0)}°
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.azimuthal_gap < 90 && 'Excellent station coverage'}
              {data.azimuthal_gap >= 90 && data.azimuthal_gap < 180 && 'Good station coverage'}
              {data.azimuthal_gap >= 180 && data.azimuthal_gap < 270 && 'Fair station coverage'}
              {data.azimuthal_gap >= 270 && 'Poor station coverage - large gap in station distribution'}
            </p>
            <FactorBar
              level={
                data.azimuthal_gap < 90 ? 'excellent' :
                data.azimuthal_gap < 180 ? 'good' :
                data.azimuthal_gap < 270 ? 'fair' : 'poor'
              }
              value={quality.factors.azimuthalGap}
            />
          </div>
        )}

        {/* Summary */}
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            {quality.score === null && 'No uncertainty metadata is recorded for this event, so its location precision cannot be assessed — this is not the same as a precise location.'}
            {quality.score !== null && quality.score >= 90 && 'This is a high-quality location with excellent precision.'}
            {quality.score !== null && quality.score >= 80 && quality.score < 90 && 'This is a good quality location with reliable precision.'}
            {quality.score !== null && quality.score >= 70 && quality.score < 80 && 'This location has acceptable precision for most applications.'}
            {quality.score !== null && quality.score >= 60 && quality.score < 70 && 'This location has moderate precision. Use with caution for critical applications.'}
            {quality.score !== null && quality.score < 60 && 'This location has poor precision. Consider using additional data or alternative solutions.'}
            {quality.score !== null && quality.metadataCoverage < 1 &&
              ` Note: only ${Math.round(quality.metadataCoverage * 100)}% of the scoring weight is backed by reported metadata.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
