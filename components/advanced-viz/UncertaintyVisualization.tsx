'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MapPin, Ruler, Clock, Target } from 'lucide-react';
import {
  formatUncertainty,
  getUncertaintyLevel,
  calculateLocationQuality,
  UncertaintyData
} from '@/lib/uncertainty-utils';
import { TechnicalTermTooltip } from '@/components/ui/info-tooltip';

interface UncertaintyVisualizationProps {
  data: UncertaintyData;
}

export function UncertaintyVisualization({ data }: UncertaintyVisualizationProps) {
  const quality = calculateLocationQuality(data);
  
  const horizontalLevel = getUncertaintyLevel(
    Math.max(data.latitude_uncertainty || 0, data.longitude_uncertainty || 0),
    'horizontal'
  );
  
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
      default: return 'destructive';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Location Uncertainty</CardTitle>
            <TechnicalTermTooltip term="uncertainty" />
          </div>
          <Badge variant={getLevelBadgeVariant(quality.grade)}>
            Grade: {quality.grade}
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
            <span className="text-muted-foreground">{quality.score}/100</span>
          </div>
          <Progress value={quality.score} className="h-3" />
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
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getLevelColor(horizontalLevel.level)}`}
              style={{ width: `${quality.factors.horizontalUncertainty}%` }}
            />
          </div>
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
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getLevelColor(depthLevel.level)}`}
              style={{ width: `${quality.factors.depthUncertainty}%` }}
            />
          </div>
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
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getLevelColor(timeLevel.level)}`}
              style={{ width: `${quality.factors.timeUncertainty}%` }}
            />
          </div>
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
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${getLevelColor(
                  data.azimuthal_gap < 90 ? 'excellent' : 
                  data.azimuthal_gap < 180 ? 'good' : 
                  data.azimuthal_gap < 270 ? 'fair' : 'poor'
                )}`}
                style={{ width: `${quality.factors.azimuthalGap}%` }}
              />
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            {quality.score >= 90 && 'This is a high-quality location with excellent precision.'}
            {quality.score >= 80 && quality.score < 90 && 'This is a good quality location with reliable precision.'}
            {quality.score >= 70 && quality.score < 80 && 'This location has acceptable precision for most applications.'}
            {quality.score >= 60 && quality.score < 70 && 'This location has moderate precision. Use with caution for critical applications.'}
            {quality.score < 60 && 'This location has poor precision. Consider using additional data or alternative solutions.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

