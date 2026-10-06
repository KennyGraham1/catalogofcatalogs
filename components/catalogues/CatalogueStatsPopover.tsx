'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { BarChart3, Calendar, TrendingUp, Layers, Activity, Ruler, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogueStatistics } from '@/lib/catalogue-statistics';
import { formatLocalDate } from '@/lib/date-format';

/**
 * Origin times are UTC (QuakeML 1.2 / ISO 8601), so the earliest and latest are
 * shown as UTC calendar days with the zone named, as on the analytics page. The
 * browser's zone put a boundary event on the next day under NZDT (UTC+13).
 *
 * What the catalogue list already holds (event count, creation date, geographic bounds)
 * is shown as soon as the popover opens; the rest comes from the statistics endpoint,
 * which is requested when the pointer rests on the trigger or it takes focus, so it has
 * usually arrived by the time the popover is opened.
 */

/** The fields of the catalogue's list row the popover shows before the statistics arrive. */
export interface CatalogueStatsSummary {
  event_count?: number | null;
  created_at?: string | null;
  min_latitude?: number | null;
  max_latitude?: number | null;
  min_longitude?: number | null;
  max_longitude?: number | null;
}

interface CatalogueStatsPopoverProps {
  catalogueId: string;
  catalogueName: string;
  /** The catalogue's row from the list, when the page has it. */
  catalogue?: CatalogueStatsSummary;
}

/**
 * How long the pointer must rest on the trigger (or focus stay on it) before the
 * statistics are requested, so moving the pointer down the list does not request
 * every row.
 */
export const STATISTICS_PREFETCH_DELAY_MS = 120;

const inFlight = new Map<string, Promise<CatalogueStatistics>>();

/**
 * One request per catalogue at a time: a prefetch and an open of the same popover, or
 * two popovers of one catalogue, share it. Nothing is kept once it has settled.
 */
export function fetchCatalogueStatistics(catalogueId: string): Promise<CatalogueStatistics> {
  const existing = inFlight.get(catalogueId);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch(`/api/catalogues/${catalogueId}/statistics`);
    if (!response.ok) throw new Error('Failed to load statistics');
    return (await response.json()) as CatalogueStatistics;
  })();
  const tracked: Promise<CatalogueStatistics> = request.finally(() => {
    if (inFlight.get(catalogueId) === tracked) inFlight.delete(catalogueId);
  });
  inFlight.set(catalogueId, tracked);
  return tracked;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** "41.29°S": two decimals and a hemisphere letter, as lib/geo-bounds-utils formatBounds. */
function formatCoordinate(value: number, positive: string, negative: string): string {
  const text = Math.abs(value).toFixed(2);
  return `${text}°${value < 0 && Number(text) !== 0 ? negative : positive}`;
}

function boundsOf(catalogue: CatalogueStatsSummary | undefined) {
  if (!catalogue) return null;
  const { min_latitude, max_latitude, min_longitude, max_longitude } = catalogue;
  if (!isFiniteNumber(min_latitude) || !isFiniteNumber(max_latitude) ||
      !isFiniteNumber(min_longitude) || !isFiniteNumber(max_longitude)) {
    return null;
  }
  return {
    latitude: `${formatCoordinate(min_latitude, 'N', 'S')} to ${formatCoordinate(max_latitude, 'N', 'S')}`,
    longitude: `${formatCoordinate(min_longitude, 'E', 'W')} to ${formatCoordinate(max_longitude, 'E', 'W')}`,
  };
}

export function CatalogueStatsPopover({ catalogueId, catalogueName, catalogue }: CatalogueStatsPopoverProps) {
  const [stats, setStats] = useState<CatalogueStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  // Refs, not state, so a hover and a click in the same tick cannot both start a load.
  const loadingRef = useRef(false);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
      prefetchTimer.current = null;
    };
  }, []);

  const loadStatistics = useCallback(() => {
    if (loadedRef.current || loadingRef.current) return; // Already loaded or loading
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    fetchCatalogueStatistics(catalogueId)
      .then(
        (data) => {
          loadedRef.current = true;
          if (mountedRef.current) setStats(data);
        },
        (err) => {
          if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to load statistics');
        }
      )
      .finally(() => {
        loadingRef.current = false;
        if (mountedRef.current) setLoading(false);
      });
  }, [catalogueId]);

  const cancelPrefetch = useCallback(() => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  }, []);

  const schedulePrefetch = useCallback(() => {
    if (loadedRef.current || loadingRef.current || prefetchTimer.current) return;
    prefetchTimer.current = setTimeout(() => {
      prefetchTimer.current = null;
      loadStatistics();
    }, STATISTICS_PREFETCH_DELAY_MS);
  }, [loadStatistics]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      cancelPrefetch();
      loadStatistics();
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // ISO calendar day in UTC ("2016-11-13 UTC"), like every event time on the platform.
    return Number.isNaN(date.getTime()) ? dateString : `${date.toISOString().slice(0, 10)} UTC`;
  };

  const listedCount = catalogue?.event_count;
  const eventCount = stats?.eventCount ?? (isFiniteNumber(listedCount) ? listedCount : null);
  const bounds = boundsOf(catalogue);
  const showOverview = catalogue !== undefined || stats !== null;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onPointerEnter={schedulePrefetch}
          onPointerLeave={cancelPrefetch}
          onFocus={schedulePrefetch}
          onBlur={cancelPrefetch}
        >
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

          {/* Known from the catalogue list: shown at once, before the statistics arrive. */}
          {showOverview && (
            <div className="space-y-2" data-testid="catalogue-stats-overview">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Info className="h-4 w-4 text-primary" />
                <span>Overview</span>
              </div>
              <div className="pl-6 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Events:</span>
                  <span className="font-medium">{eventCount !== null ? eventCount.toLocaleString() : '—'}</span>
                </div>
                {catalogue && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="font-medium">{formatLocalDate(catalogue.created_at)}</span>
                  </div>
                )}
                {catalogue && (bounds ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Latitude:</span>
                      <span className="font-medium text-right">{bounds.latitude}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Longitude:</span>
                      <span className="font-medium text-right">{bounds.longitude}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bounds:</span>
                    <span className="font-medium">Not recorded</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && !stats && (
            <div className="space-y-3" aria-busy="true">
              <p className="text-xs text-muted-foreground" role="status">Loading statistics…</p>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {error && !loading && (
            <div className="text-sm text-destructive">
              {error}
            </div>
          )}

          {stats && (
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
