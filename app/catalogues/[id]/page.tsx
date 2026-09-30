'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
  ChevronDown,
  FilterX
} from 'lucide-react';
import { EventTable } from '@/components/events/EventTable';
import { EventFilters, applyEventFilters, type EventFilterValues } from '@/components/event-filters';
import { eventFiltersToSearchParams } from '@/lib/event-filter-params';
import { SavedFiltersDialog } from '@/components/catalogues/SavedFiltersDialog';
import { resolveEventQuality } from '@/components/events/event-quality';
import type { QualityGrade } from '@/lib/quality-scoring';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useCatalogueEvents } from '@/hooks/use-catalogue-events';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { useAuth, usePermission } from '@/lib/auth/hooks';
import { Permission, UserRole } from '@/lib/auth/types';
import { ReviewQueue } from '@/components/merge/ReviewQueue';

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
  quality_grade?: string | null;
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
  // C3: "MAJOR.MINOR.PATCH"; legacy catalogues written before versioning read as "1.0.0".
  version?: string | null;
}

/**
 * A merged catalogue records the catalogues it was built from in source_catalogues (each
 * entry carries the source catalogue's `id` and `name`); an upload or an import records only
 * a source label there. Returns the names by id, or null when the catalogue is not merged.
 */
function sourceCatalogueNames(raw?: string | null): Record<string, string> | null {
  if (!raw) return null;
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const names: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, name } = entry as { id?: unknown; name?: unknown };
    if (id === undefined || id === null || id === '') continue;
    names[String(id)] = typeof name === 'string' && name ? name : String(id);
  }
  return Object.keys(names).length > 0 ? names : null;
}

/** Table 2 order, worst to best reversed for display (best grade first). */
const GRADE_DISPLAY_ORDER: QualityGrade[] = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];

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

  // The merge review queue (M5) exists only for merged catalogues; the same roles that may
  // merge (app/merge/page.tsx) may decide a held event.
  const mergedSourceNames = useMemo(() => sourceCatalogueNames(catalogue?.source_catalogues), [catalogue]);
  const canReview = user?.role === UserRole.EDITOR || user?.role === UserRole.ADMIN;

  // Catalogue-level quality aggregate (#65/#135): the paper describes Q as shown per event
  // in the table and aggregated at catalogue level here, not as a count of "has a score"
  // (every event resolves to a score - stored, or computed client-side for legacy rows - so
  // that count was always 100% once quality_score existed and told the user nothing).
  const stats = useMemo(() => {
    const depths = events.filter(event => event.depth != null);
    const gradeCounts: Partial<Record<QualityGrade, number>> = {};
    let qualitySum = 0;
    for (const event of events) {
      const { score, grade } = resolveEventQuality(event);
      qualitySum += score;
      gradeCounts[grade] = (gradeCounts[grade] ?? 0) + 1;
    }
    return {
      total: events.length,
      avgMagnitude: events.length ? (events.reduce((sum, event) => sum + event.magnitude, 0) / events.length).toFixed(2) : '—',
      avgDepth: depths.length ? (depths.reduce((sum, event) => sum + event.depth!, 0) / depths.length).toFixed(1) : '—',
      meanQuality: events.length ? qualitySum / events.length : null,
      gradeCounts,
    };
  }, [events]);

  // Client-side event filtering (C4 shape) over the already-loaded event array. The
  // filtered-events API route is not wired up yet (H2a); this keeps the table and the
  // "Export filtered events" action consistent with each other in the meantime, and both
  // will still work once server-side filtering lands (this just becomes a client-side
  // preview of the same filter instead of the only way it's applied).
  const [filters, setFilters] = useState<EventFilterValues>({});
  const filteredEvents = useMemo(() => applyEventFilters(events, filters), [events, filters]);
  const hasActiveFilters = Object.keys(filters).length > 0;
  // Export option: tag every exported event with its Gardner-Knopoff cluster (C12), which
  // the export route computes over the exported events (after any filter).
  const [includeDeclustering, setIncludeDeclustering] = useState(false);

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

  const handleExport = async (format: 'csv' | 'json' | 'geojson' | 'kml' | 'quakeml', filterParams?: URLSearchParams) => {
    try {
      if (!canExportCatalogues) {
        toast({
          title: user ? 'Insufficient permissions' : 'Login required',
          description: exportBlockedMessage,
          variant: 'destructive',
        });
        return;
      }

      // "Export filtered events" (C12): forward the active filters as query params using the
      // same key names as EventFilterValues/C4. The export route ignores keys it doesn't
      // recognise yet, so this degrades to a full export rather than failing.
      const query = new URLSearchParams(filterParams);
      query.set('format', format);
      if (includeDeclustering) query.set('decluster', 'gardner-knopoff');

      const response = await fetch(`/api/catalogues/${catalogueId}/export?${query.toString()}`);
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
        description: `Catalogue exported as ${formatLabels[format]}` +
          (includeDeclustering ? ' with Gardner-Knopoff declustering tags' : ''),
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
            <Badge variant="outline" title="Catalogue version">
              v{catalogue.version || '1.0.0'}
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
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={includeDeclustering}
                  onCheckedChange={checked => setIncludeDeclustering(checked === true)}
                  // Keep the menu open so a format can be picked next.
                  onSelect={event => event.preventDefault()}
                  title="Tags each exported event with its Gardner-Knopoff (1974) cluster and whether it is a mainshock (forward time window), and records the windows used"
                >
                  Include Gardner-Knopoff declustering tags
                </DropdownMenuCheckboxItem>
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
            <CardTitle className="text-sm font-medium">Mean Quality (Q)</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.meanQuality != null ? stats.meanQuality.toFixed(0) : '—'}
              <span className="text-sm font-normal text-muted-foreground ml-1">/ 100</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2">
              {GRADE_DISPLAY_ORDER.filter(grade => stats.gradeCounts[grade]).map(grade => (
                <span key={grade}>{grade}: {stats.gradeCounts[grade]}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>}

      {/* Merge review queue: only a merged catalogue can hold events for review. */}
      {mergedSourceNames && (
        <ReviewQueue catalogueId={catalogueId} canReview={canReview} catalogueNames={mergedSourceNames} />
      )}

      {/* Event filters: client-side over the already-loaded events (C4 shape), with saved
          filters and a filtered export (C12) alongside. */}
      <div className="flex flex-wrap items-center gap-2">
        <EventFilters onFilterChange={setFilters} activeFilters={filters} />
        <SavedFiltersDialog
          currentFilters={filters}
          onLoadFilter={(config) => setFilters(config ?? {})}
          readOnly={!user}
        />
        {hasActiveFilters && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="gap-1">
              <FilterX className="h-4 w-4" />
              Clear filters
            </Button>
            {canExportCatalogues && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('csv', eventFiltersToSearchParams(filters))}
                className="gap-1"
              >
                <Download className="h-4 w-4" />
                Export filtered events (CSV)
              </Button>
            )}
          </>
        )}
      </div>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            {hasActiveFilters
              ? `${filteredEvents.length.toLocaleString()} of ${events.length.toLocaleString()} earthquake events match the active filters. Click column headers to sort.`
              : `${events.length.toLocaleString()} earthquake events in this catalogue. Click column headers to sort.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <EventTable
            events={filteredEvents}
            onEventClick={handleEventClick}
          />
        </CardContent>
      </Card>
    </div>
  );
}
