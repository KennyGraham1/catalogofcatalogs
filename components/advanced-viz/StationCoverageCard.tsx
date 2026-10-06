'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Radio, Target, Ruler, TrendingUp } from 'lucide-react';
import {
  StationCoverage,
  calculateAzimuthalGapDetail,
  calculateStationDistributionRatio,
  getStationDistributionDescription
} from '@/lib/station-coverage-utils';
import { TechnicalTermTooltip } from '@/components/ui/info-tooltip';

interface StationCoverageCardProps {
  coverage: StationCoverage;
}

const SOURCE_LABEL: Record<'origin-quality' | 'arrivals' | 'picks', string> = {
  'origin-quality': 'from the origin quality record',
  arrivals: 'derived from arrival azimuths',
  picks: 'derived from the pick list',
};

export function StationCoverageCard({ coverage }: StationCoverageCardProps) {
  // Real arrival azimuths only — never synthesised. When the arrivals carry no
  // azimuths there is nothing to say about the distribution, so the block below
  // is not rendered at all.
  const distributionRatio = calculateStationDistributionRatio(coverage.azimuths);
  const distribution = distributionRatio !== null ? getStationDistributionDescription(distributionRatio) : null;

  // Directional gap, measured from the same azimuths, for the coverage diagram.
  const gapDetail = calculateAzimuthalGapDetail(coverage.azimuths);

  const getQualityBadgeVariant = (quality: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (quality) {
      case 'excellent': return 'default';
      case 'good': return 'secondary';
      case 'fair': return 'outline';
      case 'unknown': return 'outline';
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
              <TechnicalTermTooltip term="stationCount" />
            </div>
            <span className="text-2xl font-bold">
              {coverage.stationCount === null ? '—' : coverage.stationCount}
            </span>
          </div>
          {coverage.stationCount === null ? (
            <p className="text-xs text-muted-foreground">
              Station count not reported for this event
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {coverage.stationCount >= 20 && 'Excellent number of stations for reliable location'}
              {coverage.stationCount >= 10 && coverage.stationCount < 20 && 'Good number of stations for location'}
              {coverage.stationCount >= 5 && coverage.stationCount < 10 && 'Adequate number of stations'}
              {coverage.stationCount < 5 && 'Limited number of stations - location may be less reliable'}
              {coverage.stationCountSource && ` (${SOURCE_LABEL[coverage.stationCountSource]})`}
            </p>
          )}
        </div>

        {/* Azimuthal Gap */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Azimuthal Gap</span>
              <TechnicalTermTooltip term="azimuthalGap" />
            </div>
            {coverage.azimuthalGap === null ? (
              <Badge variant="outline">not reported</Badge>
            ) : (
              <Badge
                variant={coverage.azimuthalGap < 90 ? 'default' : coverage.azimuthalGap < 180 ? 'secondary' : 'destructive'}
              >
                {coverage.azimuthalGap.toFixed(0)}°
              </Badge>
            )}
          </div>
          {coverage.azimuthalGap === null ? (
            <p className="text-xs text-muted-foreground">
              No azimuthal gap in the origin quality record and no arrival azimuths to derive one from.
            </p>
          ) : (
            <>
              <Progress
                aria-label="Azimuthal coverage"
                value={Math.max(0, 100 - (coverage.azimuthalGap / 360) * 100)}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {coverage.azimuthalGap < 90 && 'Excellent azimuthal coverage - stations well distributed around event'}
                {coverage.azimuthalGap >= 90 && coverage.azimuthalGap < 180 && 'Good azimuthal coverage'}
                {coverage.azimuthalGap >= 180 && coverage.azimuthalGap < 270 && 'Fair azimuthal coverage - some gaps in station distribution'}
                {coverage.azimuthalGap >= 270 && 'Poor azimuthal coverage - large gap in station distribution may affect location accuracy'}
                {coverage.azimuthalGapSource && ` (${SOURCE_LABEL[coverage.azimuthalGapSource]})`}
              </p>
            </>
          )}
        </div>

        {/* Station Distribution — only when there are real azimuths to measure */}
        {distribution !== null && distributionRatio !== null && (
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
              aria-label="Station distribution"
              value={(1 - distributionRatio) * 100}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              {distribution.description} (from {coverage.azimuths.length} station azimuths)
            </p>
          </div>
        )}

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
            <h3 className="font-semibold text-sm mb-2">Recording Stations</h3>
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
          <h3 className="font-semibold text-sm mb-2">Coverage Assessment</h3>
          <p className="text-sm text-muted-foreground">
            {coverage.coverageQuality === 'excellent' && 
              'Excellent station coverage with well-distributed stations providing reliable location constraints.'}
            {coverage.coverageQuality === 'good' && 
              'Good station coverage. Location should be reliable for most applications.'}
            {coverage.coverageQuality === 'fair' && 
              'Fair station coverage. Location is acceptable but may have increased uncertainty.'}
            {coverage.coverageQuality === 'poor' && 
              'Poor station coverage. Location may have significant uncertainty due to limited or poorly distributed stations.'}
            {coverage.coverageQuality === 'unknown' &&
              'Coverage cannot be assessed: this event does not report both an azimuthal gap and a station count.'}
          </p>
        </div>

        {/* Azimuthal Coverage Diagram — drawn at the real gap azimuths, so it is
            omitted entirely when the arrivals carry no azimuths. */}
        {gapDetail.gap !== null && gapDetail.startAzimuth !== null && gapDetail.endAzimuth !== null && (
          <div className="pt-2 border-t">
            <h3 className="font-semibold text-sm mb-2">Azimuthal Coverage</h3>
            <div className="flex justify-center">
              <AzimuthalCoverageDiagram
                azimuths={coverage.azimuths}
                gap={gapDetail.gap}
                gapStartAzimuth={gapDetail.startAzimuth}
                gapEndAzimuth={gapDetail.endAzimuth}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Green sector: azimuths covered by the {coverage.azimuths.length} recording stations. North is up.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Azimuthal coverage diagram drawn at the REAL azimuths.
 *
 * Screen mapping: azimuth is measured clockwise from north, and the plot is
 * north-up, so (x, y) = (cx + r sin az, cy - r cos az). The covered sector runs
 * clockwise from where the gap ends to where it starts, sweeping 360 - gap
 * degrees (SVG sweep-flag 1 is clockwise on screen because y points down).
 */
function AzimuthalCoverageDiagram({
  azimuths,
  gap,
  gapStartAzimuth,
  gapEndAzimuth,
}: {
  azimuths: number[];
  gap: number;
  gapStartAzimuth: number;
  gapEndAzimuth: number;
}) {
  const size = 120;
  const center = size / 2;
  const radius = size / 2 - 10;
  const DEG = Math.PI / 180;

  const point = (azimuth: number, r: number): [number, number] => [
    center + r * Math.sin(azimuth * DEG),
    center - r * Math.cos(azimuth * DEG),
  ];

  const [x1, y1] = point(gapEndAzimuth, radius);
  const [x2, y2] = point(gapStartAzimuth, radius);
  const coveredSweep = 360 - gap;
  const largeArcFlag = coveredSweep > 180 ? 1 : 0;
  const coveragePath =
    coveredSweep <= 0
      ? ''
      : `M ${center} ${center} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Azimuthal coverage, largest gap ${gap.toFixed(0)} degrees`}>
      {/* Background circle */}
      <circle cx={center} cy={center} r={radius} fill="#f3f4f6" stroke="#d1d5db" strokeWidth="2" />

      {/* Coverage area (green) */}
      {coveragePath && <path d={coveragePath} fill="#22c55e" opacity="0.5" />}

      {/* Individual arrival azimuths */}
      {azimuths.map((az, i) => {
        const [ix, iy] = point(az, radius * 0.82);
        const [ox, oy] = point(az, radius);
        return <line key={i} x1={ix} y1={iy} x2={ox} y2={oy} stroke="#111827" strokeWidth="1.5" />;
      })}

      {/* Center point */}
      <circle cx={center} cy={center} r="3" fill="#000" />

      {/* North indicator */}
      <text x={center} y="12" textAnchor="middle" fontSize="10" fontWeight="bold">N</text>

      {/* Gap label */}
      <text x={center} y={center + 5} textAnchor="middle" fontSize="12" fontWeight="bold">
        {gap.toFixed(0)}°
      </text>
    </svg>
  );
}
