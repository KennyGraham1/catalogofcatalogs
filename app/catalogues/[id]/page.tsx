'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  Map as MapIcon,
  ArrowLeft,
  Download,
  BarChart3,
  Activity,
  ChevronDown
} from 'lucide-react';
import { EventTable } from '@/components/events/EventTable';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatalogueEvents } from '@/hooks/use-catalogue-events';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { useAuth, usePermission } from '@/lib/auth/hooks';
import { Permission } from '@/lib/auth/types';

interface Event {
  id: string | number;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
  magnitude_type?: string | null;
  location_name?: string | null;
  event_type?: string | null;
  quality_score?: number | null;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  public_id?: string | null;
}

interface Catalogue {
  id: string;
  name: string;
  event_count: number;
  status: string;
  created_at: string;
  source_catalogues?: string;
}

export default function CatalogueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const catalogueId = params.id as string;
  const { user } = useAuth();
  const canExportCatalogues = usePermission(Permission.CATALOGUE_EXPORT);
  const exportBlockedMessage = user
    ? 'Viewer or higher access is required to export catalogues.'
    : 'Log in to export catalogues.';

  // Use cached fetch for catalogues list
  const { data: catalogues, loading: cataloguesLoading, error: cataloguesError } = useCachedFetch<Catalogue[]>(
    '/api/catalogues',
    { cacheTime: 5 * 60 * 1000 } // 5 minutes
  );

  const availableCatalogues = useMemo(() => Array.isArray(catalogues) ? catalogues : [], [catalogues]);
  const { events, loading: eventsLoading, complete, loadedCount, error: eventsError, retry } = useCatalogueEvents(availableCatalogues, catalogueId);

  // Find current catalogue from the list
  const catalogue = useMemo(() => {
    if (!catalogues || !catalogueId) return null;
    return catalogues.find((c: Catalogue) => c.id === catalogueId) || null;
  }, [catalogues, catalogueId]);

  const loading = cataloguesLoading || (eventsLoading && events.length === 0);
  const error = cataloguesError?.message || eventsError;
  const stats = useMemo(() => {
    const depths = events.filter(event => event.depth != null);
    return {
      total: events.length,
      avgMagnitude: events.length ? (events.reduce((sum, event) => sum + event.magnitude, 0) / events.length).toFixed(2) : '—',
      avgDepth: depths.length ? (depths.reduce((sum, event) => sum + event.depth!, 0) / depths.length).toFixed(1) : '—',
      withQuality: events.filter(event => (event as typeof event & { quality_score?: number }).quality_score != null).length,
    };
  }, [events]);

  // Show error toast if there's an error
  useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: error || 'Failed to load catalogue data. Please try again.',
        variant: 'destructive',
      });
    }
  }, [error]);

  const handleEventClick = (event: Event) => {
    // Could navigate to event detail page or show modal
    // console.log('Event clicked:', event);
  };

  const handleExport = async (format: 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml') => {
    try {
      if (!canExportCatalogues) {
        toast({
          title: user ? 'Insufficient permissions' : 'Login required',
          description: exportBlockedMessage,
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch(`/api/catalogues/${catalogueId}/export?format=${format}`);
      if (!response.ok) {
        let message = 'Export failed';
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch { /* response was not JSON */ }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Get filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${catalogue?.name || 'catalogue'}.${format === 'quakeml' ? 'xml' : format}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const formatLabels = {
        csv: 'CSV',
        json: 'JSON',
        geojson: 'GeoJSON',
        kml: 'KML (Google Earth)',
        quakeml: 'QuakeML'
      };

      toast({
        title: 'Export successful',
        description: `Catalogue exported as ${formatLabels[format]}`,
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export catalogue',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if ((error && events.length === 0) || !catalogue) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error || 'Catalogue not found'}</p>
            {eventsError && <Button onClick={retry}>Retry loading events</Button>}
            <Button onClick={() => router.push('/catalogues')} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Catalogues
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/catalogues')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-8 w-8 text-primary" />
              {catalogue.name}
            </h1>
            <Badge variant={catalogue.status === 'complete' ? 'default' : 'secondary'}>
              {catalogue.status}
            </Badge>
          </div>
          <p className="text-muted-foreground ml-12">
            Created {new Date(catalogue.created_at).toLocaleDateString('en-GB', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })}
          </p>
        </div>

        <div className="flex gap-2">
          {canExportCatalogues ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV (Spreadsheet)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>
                  <Download className="mr-2 h-4 w-4" />
                  JSON (Structured Data)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('geojson')}>
                  <Download className="mr-2 h-4 w-4" />
                  GeoJSON (Geographic)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('kml')}>
                  <Download className="mr-2 h-4 w-4" />
                  KML (Google Earth)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('quakeml')}>
                  <Download className="mr-2 h-4 w-4" />
                  QuakeML (Seismology)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" disabled title={exportBlockedMessage}>
              <Download className="mr-2 h-4 w-4" />
              Export
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button onClick={() => router.push(`/catalogues/${catalogueId}/map`)}>
            <MapIcon className="mr-2 h-4 w-4" />
            View Map
          </Button>
        </div>
      </div>

      {!complete && <div className="rounded-lg border p-3" role={eventsError ? 'alert' : 'status'}>
        {eventsError || `Preview · ${loadedCount.toLocaleString()} events received. Loading remaining events...`}
        {eventsError && <Button variant="outline" onClick={retry}>Retry loading events</Button>}
      </div>}

      {/* Statistics Cards */}
      {complete && <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Magnitude</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgMagnitude}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Depth</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgDepth} km</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Quality Score</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.withQuality} 
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({stats.total > 0 ? ((stats.withQuality / stats.total) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>}

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {events.length} earthquake events in this catalogue. Click column headers to sort.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <EventTable 
            events={events} 
            onEventClick={handleEventClick}
          />
        </CardContent>
      </Card>
    </div>
  );
}
