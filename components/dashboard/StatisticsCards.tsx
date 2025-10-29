'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, FileJson, Layers, RefreshCw } from 'lucide-react';
import { useCatalogues } from '@/contexts/CatalogueContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export function StatisticsCards() {
  const { stats, loading, refreshCatalogues, lastUpdated } = useCatalogues();

  const statsConfig = [
    {
      title: 'Total Catalogues',
      value: stats.totalCatalogues.toLocaleString(),
      icon: Database,
      description: 'Across all sources',
      trend: stats.recentlyAdded > 0 ? `+${stats.recentlyAdded} this month` : 'No new catalogues',
      trendUp: stats.recentlyAdded > 0
    },
    {
      title: 'Events',
      value: stats.totalEvents.toLocaleString(),
      icon: FileJson,
      description: 'Total earthquake events',
      trend: 'Across all catalogues',
      trendUp: true
    },
    {
      title: 'Merged Catalogues',
      value: stats.mergedCatalogues.toLocaleString(),
      icon: Layers,
      description: 'Unified datasets',
      trend: `${Math.round((stats.mergedCatalogues / Math.max(stats.totalCatalogues, 1)) * 100)}% of total`,
      trendUp: true
    },
    {
      title: 'Last Updated',
      value: lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--:--',
      icon: RefreshCw,
      description: lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'Never',
      trend: 'Auto-refresh: 30s',
      trendUp: true
    }
  ];

  if (loading) {
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
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            {index === 3 ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={refreshCatalogues}
                title="Refresh data"
              >
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </Button>
            ) : (
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
            <div className={`flex items-center mt-1 text-xs ${stat.trendUp ? 'text-green-500' : 'text-muted-foreground'}`}>
              {stat.trend}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}