'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { BarChart3, Calendar, TrendingUp, Layers, Activity, Ruler } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogueStatistics } from '@/app/api/catalogues/[id]/statistics/route';

interface CatalogueStatsPopoverProps {
  catalogueId: string;
  catalogueName: string;
}

export function CatalogueStatsPopover({ catalogueId, catalogueName }: CatalogueStatsPopoverProps) {
  const [stats, setStats] = useState<CatalogueStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const loadStatistics = async () => {
    if (stats) return; // Already loaded

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/catalogues/${catalogueId}/statistics`);
      if (!response.ok) throw new Error('Failed to load statistics');

      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && !stats && !loading) {
      loadStatistics();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <BarChart3 className="h-4 w-4" />
          <span className="sr-only">View statistics for {catalogueName}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">Catalogue Statistics</h4>
            <p className="text-xs text-muted-foreground">{catalogueName}</p>
          </div>

          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive">
              {error}
            </div>
          )}

          {stats && !loading && (
            <div className="space-y-4">
              {/* Date Range */}
              {stats.dateRange && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>Time Period</span>
                  </div>
                  <div className="pl-6 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Earliest:</span>
                      <span className="font-medium">{formatDate(stats.dateRange.earliest)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Latest:</span>
                      <span className="font-medium">{formatDate(stats.dateRange.latest)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Span:</span>
                      <span className="font-medium">{stats.dateRange.spanDays.toLocaleString()} days</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Magnitude Range */}
              {stats.magnitudeRange && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="h-4 w-4 text-primary" />
                    <span>Magnitude</span>
                  </div>
                  <div className="pl-6 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Range:</span>
                      <span className="font-medium">
                        {stats.magnitudeRange.min.toFixed(1)} - {stats.magnitudeRange.max.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Average:</span>
                      <span className="font-medium">{stats.magnitudeRange.average.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Median:</span>
                      <span className="font-medium">{stats.magnitudeRange.median.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Depth Range */}
              {stats.depthRange && stats.depthRange.max > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Ruler className="h-4 w-4 text-primary" />
                    <span>Depth (km)</span>
                  </div>
                  <div className="pl-6 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Range:</span>
                      <span className="font-medium">
                        {stats.depthRange.min.toFixed(1)} - {stats.depthRange.max.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Average:</span>
                      <span className="font-medium">{stats.depthRange.average.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Magnitude Types */}
              {stats.magnitudeTypes && stats.magnitudeTypes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>Magnitude Types</span>
                  </div>
                  <div className="pl-6 space-y-1 text-sm">
                    {stats.magnitudeTypes.slice(0, 3).map((mt) => (
                      <div key={mt.type} className="flex justify-between">
                        <span className="text-muted-foreground">{mt.type}:</span>
                        <span className="font-medium">{mt.count.toLocaleString()}</span>
                      </div>
                    ))}
                    {stats.magnitudeTypes.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{stats.magnitudeTypes.length - 3} more types
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quality Metrics */}
              {stats.qualityMetrics && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span>Data Quality</span>
                  </div>
                  <div className="pl-6 space-y-1 text-sm">
                    {stats.qualityMetrics.averageAzimuthalGap !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Gap:</span>
                        <span className="font-medium">{stats.qualityMetrics.averageAzimuthalGap.toFixed(1)}°</span>
                      </div>
                    )}
                    {stats.qualityMetrics.averageStationCount !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Stations:</span>
                        <span className="font-medium">{stats.qualityMetrics.averageStationCount.toFixed(1)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">With Uncertainty:</span>
                      <span className="font-medium">
                        {((stats.qualityMetrics.eventsWithUncertainty / stats.eventCount) * 100).toFixed(0)}%
                      </span>
                    </div>
                    {stats.qualityMetrics.eventsWithFocalMechanism > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Focal Mechanisms:</span>
                        <span className="font-medium">{stats.qualityMetrics.eventsWithFocalMechanism}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

