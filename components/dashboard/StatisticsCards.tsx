'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, FileJson, Layers, RefreshCw } from 'lucide-react';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { getCatalogueSourceType } from '@/lib/catalogue-source-type';
import { hasCatalogueData } from '@/contexts/catalogue-load-status';
import { UnavailableValue } from '@/components/catalogues/CatalogueLoadNotice';
import { formatLocalDate, formatLocalTime } from '@/lib/date-format';

/** A refresh interval in the largest whole unit: 21600000 ms is "6 h". */
function formatInterval(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} h`;
  if (ms % 60_000 === 0) return `${ms / 60_000} min`;
  return `${Math.round(ms / 1000)} s`;
}

export function StatisticsCards() {
  const { catalogues, stats, loading, status, refreshCatalogues, lastUpdated, autoRefreshInterval } = useCatalogues();
  // Totals exist only once a request has succeeded; after a failure with no earlier
  // success they are unknown and shown as unavailable, never as 0.
  const available = hasCatalogueData(status);

  // Classified with the shared rule (lib/catalogue-source-type.ts, contract C6) that the
  // provider's stats use too, here so the merged copies can be counted separately: a
  // merged catalogue holds copies of its sources' events, which are not added again.
  let mergedCount = 0;
  let sourceRecords = 0;
  let mergedRecords = 0;
  for (const catalogue of catalogues) {
    if (getCatalogueSourceType(catalogue) === 'merged') {
      mergedCount++;
      mergedRecords += catalogue.event_count || 0;
    } else {
      sourceRecords += catalogue.event_count || 0;
    }
  }

  const statsConfig: Array<{
    title: string;
    value: string | null;
    icon: typeof Database;
    description: string;
    trend: string;
    trendUp: boolean;
  }> = [
    {
      title: 'Total Catalogues',
      value: available ? stats.totalCatalogues.toLocaleString() : null,
      icon: Database,
      description: 'Across all sources',
      // The provider counts catalogues created in a rolling 30-day window.
      trend: stats.recentlyAdded > 0 ? `+${stats.recentlyAdded} in the last 30 days` : 'None in the last 30 days',
      trendUp: stats.recentlyAdded > 0
    },
    {
      // Records, not earthquakes: overlapping source catalogues (GeoNet and ISC, say)
      // still hold the same earthquake once each.
      title: 'Event records',
      value: available ? sourceRecords.toLocaleString() : null,
      icon: FileJson,
      description: 'In source catalogues; not distinct earthquakes',
      trend: mergedRecords > 0
        ? `${mergedRecords.toLocaleString()} more in merged catalogues (copies)`
        : 'No merged copies',
      trendUp: true
    },
    {
      title: 'Merged Catalogues',
      value: available ? mergedCount.toLocaleString() : null,
      icon: Layers,
      description: 'Unified datasets',
      trend: `${Math.round((mergedCount / Math.max(catalogues.length, 1)) * 100)}% of total`,
      trendUp: true
    },
    {
      title: 'Last Updated',
      value: lastUpdated ? formatLocalTime(lastUpdated) : null,
      icon: RefreshCw,
      description: lastUpdated ? formatLocalDate(lastUpdated) : 'Not loaded yet',
      // The provider's own interval (CatalogueProvider autoRefreshInterval, 6 h by default).
      trend: typeof autoRefreshInterval !== 'number'
        ? 'Use the refresh icon for the latest data'
        : autoRefreshInterval > 0
          ? `Auto-refresh every ${formatInterval(autoRefreshInterval)}; the icon refreshes now`
          : 'Auto-refresh off; use the refresh icon',
      trendUp: true
    }
  ];

  // Unavailable cards keep their labels but replace every figure and derived note.
  if (!available) {
    for (const stat of statsConfig.slice(0, 3)) {
      stat.description = 'Unavailable: the catalogue list could not be loaded';
      stat.trend = '';
    }
  } else if (status === 'stale') {
    statsConfig[3].trend = 'The latest refresh failed; these figures may be out of date';
    statsConfig[3].trendUp = false;
  }

  if (status === 'loading') {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {statsConfig.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle as="h3" className="text-sm font-medium">{stat.title}</CardTitle>
            {index === 3 ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => refreshCatalogues()}
                disabled={loading}
                title="Refresh catalogue data"
                aria-label="Refresh catalogue data"
              >
                <stat.icon className={`h-4 w-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </Button>
            ) : (
              <stat.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-stat-value>
              {stat.value ?? <UnavailableValue />}
            </div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
            {stat.trend && (
              <div className={`flex items-center mt-1 text-xs ${stat.trendUp ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                {stat.trend}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
