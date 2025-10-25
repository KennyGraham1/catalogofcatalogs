'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Radio, Target, Ruler, TrendingUp } from 'lucide-react';
import { 
  StationCoverage, 
  getCoverageQualityColor,
  calculateStationDistributionRatio,
  getStationDistributionDescription 
} from '@/lib/station-coverage-utils';

interface StationCoverageCardProps {
  coverage: StationCoverage;
}

export function StationCoverageCard({ coverage }: StationCoverageCardProps) {
  const distributionRatio = calculateStationDistributionRatio(
    // Mock azimuths for demonstration - in real app would come from arrivals data
    Array.from({ length: coverage.stationCount }, (_, i) => (i * 360) / coverage.stationCount)
  );
  
  const distribution = getStationDistributionDescription(distributionRatio);

  const getQualityBadgeVariant = (quality: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (quality) {
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
          <CardTitle>Station Coverage</CardTitle>
          <Badge variant={getQualityBadgeVariant(coverage.coverageQuality)}>
            {coverage.coverageQuality}
          </Badge>
        </div>
        <CardDescription>
          Seismic network geometry and station distribution
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Station Count */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Recording Stations</span>
            </div>
            <span className="text-2xl font-bold">{coverage.stationCount}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {coverage.stationCount >= 20 && 'Excellent number of stations for reliable location'}
            {coverage.stationCount >= 10 && coverage.stationCount < 20 && 'Good number of stations for location'}
            {coverage.stationCount >= 5 && coverage.stationCount < 10 && 'Adequate number of stations'}
            {coverage.stationCount < 5 && 'Limited number of stations - location may be less reliable'}
          </p>
        </div>

        {/* Azimuthal Gap */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Azimuthal Gap</span>
            </div>
            <Badge 
              variant={coverage.azimuthalGap < 90 ? 'default' : coverage.azimuthalGap < 180 ? 'secondary' : 'destructive'}
            >
              {coverage.azimuthalGap.toFixed(0)}°
            </Badge>
          </div>
          <Progress 
            value={Math.max(0, 100 - (coverage.azimuthalGap / 360) * 100)} 
            className="h-2"
          />
          <p className="text-xs text-muted-foreground">
            {coverage.azimuthalGap < 90 && 'Excellent azimuthal coverage - stations well distributed around event'}
            {coverage.azimuthalGap >= 90 && coverage.azimuthalGap < 180 && 'Good azimuthal coverage'}
            {coverage.azimuthalGap >= 180 && coverage.azimuthalGap < 270 && 'Fair azimuthal coverage - some gaps in station distribution'}
            {coverage.azimuthalGap >= 270 && 'Poor azimuthal coverage - large gap in station distribution may affect location accuracy'}
          </p>
        </div>

        {/* Station Distribution */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Station Distribution</span>
            </div>
            <Badge variant={getQualityBadgeVariant(distribution.quality)}>
              {distribution.quality}
            </Badge>
          </div>
          <Progress 
            value={(1 - distributionRatio) * 100} 
            className="h-2"
          />
          <p className="text-xs text-muted-foreground">{distribution.description}</p>
        </div>

        {/* Distance Statistics */}
        {coverage.averageDistance > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Ruler className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Station Distances</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-center p-2 bg-muted rounded">
                <div className="text-xs text-muted-foreground">Minimum</div>
                <div className="font-semibold">{coverage.minDistance.toFixed(0)} km</div>
              </div>
              <div className="text-center p-2 bg-muted rounded">
                <div className="text-xs text-muted-foreground">Average</div>
                <div className="font-semibold">{coverage.averageDistance.toFixed(0)} km</div>
              </div>
              <div className="text-center p-2 bg-muted rounded">
                <div className="text-xs text-muted-foreground">Maximum</div>
                <div className="font-semibold">{coverage.maxDistance.toFixed(0)} km</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {coverage.minDistance < 50 && 'Good near-field coverage with close stations'}
              {coverage.minDistance >= 50 && coverage.minDistance < 100 && 'Moderate near-field coverage'}
              {coverage.minDistance >= 100 && 'Limited near-field coverage - closest station is distant'}
            </p>
          </div>
        )}

        {/* Station List */}
        {coverage.stations.length > 0 && (
          <div className="pt-2 border-t">
            <h4 className="font-semibold text-sm mb-2">Recording Stations</h4>
            <div className="max-h-32 overflow-y-auto">
              <div className="grid grid-cols-2 gap-1 text-xs">
                {coverage.stations.map((station, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {station.network}.{station.code}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Coverage Summary */}
        <div className="pt-2 border-t">
          <h4 className="font-semibold text-sm mb-2">Coverage Assessment</h4>
          <p className="text-sm text-muted-foreground">
            {coverage.coverageQuality === 'excellent' && 
              'Excellent station coverage with well-distributed stations providing reliable location constraints.'}
            {coverage.coverageQuality === 'good' && 
              'Good station coverage. Location should be reliable for most applications.'}
            {coverage.coverageQuality === 'fair' && 
              'Fair station coverage. Location is acceptable but may have increased uncertainty.'}
            {coverage.coverageQuality === 'poor' && 
              'Poor station coverage. Location may have significant uncertainty due to limited or poorly distributed stations.'}
          </p>
        </div>

        {/* Azimuthal Coverage Diagram */}
        <div className="pt-2 border-t">
          <h4 className="font-semibold text-sm mb-2">Azimuthal Coverage</h4>
          <div className="flex justify-center">
            <AzimuthalCoverageDiagram azimuthalGap={coverage.azimuthalGap} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Simple azimuthal coverage diagram
function AzimuthalCoverageDiagram({ azimuthalGap }: { azimuthalGap: number }) {
  const size = 120;
  const center = size / 2;
  const radius = size / 2 - 10;
  
  // Calculate gap position (assume gap is centered at north for visualization)
  const gapStart = -azimuthalGap / 2;
  const gapEnd = azimuthalGap / 2;
  
  // Convert to radians
  const gapStartRad = (gapStart - 90) * Math.PI / 180;
  const gapEndRad = (gapEnd - 90) * Math.PI / 180;
  
  // Create arc path for coverage (everything except the gap)
  const largeArcFlag = azimuthalGap < 180 ? 1 : 0;
  
  const x1 = center + radius * Math.cos(gapEndRad);
  const y1 = center + radius * Math.sin(gapEndRad);
  const x2 = center + radius * Math.cos(gapStartRad);
  const y2 = center + radius * Math.sin(gapStartRad);
  
  const coveragePath = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background circle */}
      <circle cx={center} cy={center} r={radius} fill="#f3f4f6" stroke="#d1d5db" strokeWidth="2" />
      
      {/* Coverage area (green) */}
      <path d={coveragePath} fill="#22c55e" opacity="0.5" />
      
      {/* Center point */}
      <circle cx={center} cy={center} r="3" fill="#000" />
      
      {/* North indicator */}
      <text x={center} y="12" textAnchor="middle" fontSize="10" fontWeight="bold">N</text>
      
      {/* Gap label */}
      <text x={center} y={center + 5} textAnchor="middle" fontSize="12" fontWeight="bold">
        {azimuthalGap.toFixed(0)}°
      </text>
    </svg>
  );
}

