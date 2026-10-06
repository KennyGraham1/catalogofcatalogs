'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
  FilterX,
  RefreshCw
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
import { MergeQcCard } from '@/components/merge/MergeQcCard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OptimizedEventPopup } from '@/components/map/OptimizedEventPopup';
import { formatOriginTimeUtc } from '@/lib/map-format';
import { eventOpenLabel } from '@/components/events/event-table-model';
import { formatLocalDate } from '@/lib/date-format';

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
  const catalogueId = params.id as string;
  const { user } = useAuth();
  const canExportCatalogues = usePermission(Permission.CATALOGUE_EXPORT);
  const exportBlockedMessage = user
    ? 'Viewer or higher access is required to export catalogues.'
    : 'Log in to export catalogues.';

  // Use cached fetch for catalogues list
  const { data: catalogues, loading: cataloguesLoading, error: cataloguesError, refetch: refetchCatalogues } = useCachedFetch<Catalogue[]>(
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

  // Opening an event (a row click, or its keyboard-operable time button) shows the event's
  // full record in a dialog: the same fields and formats as its map popup.
  const [openEvent, setOpenEvent] = useState<Event | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // The opened event, kept past the state reset: Radix calls onCloseAutoFocus from the
  // render in which openEvent is already null.
  const openedEventRef = useRef<Event | null>(null);
  const handleEventClick = (event: Event) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openedEventRef.current = event;
    setOpenEvent(event);
  };
  // On close, focus returns to the event's open button (the table may have re-rendered it
  // meanwhile, so it is found again by its name), not to the top of the page.
  const returnFocusToEvent = (e: globalThis.Event) => {
    const event = openedEventRef.current;
    if (!event) return;
    e.preventDefault();
    const opener = openerRef.current?.isConnected && openerRef.current !== document.body ? openerRef.current : null;
    const byName = Array.from(document.querySelectorAll<HTMLElement>('button[aria-label]'))
      .find(button => button.getAttribute('aria-label') === eventOpenLabel(event));
    (opener ?? byName)?.focus();
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
      <div className="container mx-auto py-6 space-y-6" aria-busy="true">
        <h1 className="sr-only">Loading catalogue</h1>
        <Skeleton className="h-12 w-full max-w-[16rem]" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if ((error && events.length === 0) || !catalogue) {
    // Three different situations: the catalogue list request failed, the catalogue's events
    // failed to load, or the request succeeded and has no catalogue with this id.
    const listFailed = !!cataloguesError;
    const title = listFailed || (catalogue && eventsError)
      ? 'Catalogue could not be loaded'
      : 'Catalogue not found';
    const explanation = listFailed
      ? 'The request to the server failed, so this catalogue cannot be shown right now. This does not mean that it has been removed.'
      : catalogue && eventsError
        ? 'The events of this catalogue could not be loaded.'
        : 'No catalogue with this address exists. It may have been deleted, or the link may be incorrect.';
    return (
      <div className="container mx-auto py-6">
        <Card className="border-destructive">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1" role={listFailed || eventsError ? 'alert' : undefined}>
              <h1 className="text-xl font-semibold">{title}</h1>
              <p>{explanation}</p>
              {error && <p className="text-sm text-muted-foreground break-words">Details: {error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {listFailed ? (
                <Button onClick={() => refetchCatalogues()} className="gap-2">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </Button>
              ) : eventsError ? (
                <Button onClick={retry} className="gap-2">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry loading events
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link href="/catalogues">
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Back to catalogues
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header: title and actions stack on narrow screens so neither is pushed off screen. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Button asChild variant="ghost" size="icon" className="shrink-0">
            <Link href="/catalogues" aria-label="Back to catalogues" title="Back to catalogues">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0 space-y-2">
            <h1 className="flex min-w-0 items-start gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <FileText className="mt-0.5 h-6 w-6 shrink-0 text-primary sm:h-8 sm:w-8" aria-hidden="true" />
              <span className="min-w-0 break-words">{catalogue.name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={catalogue.status === 'complete' ? 'default' : 'secondary'}>
                {catalogue.status}
              </Badge>
              <Badge variant="outline" title="Catalogue version">
                v{catalogue.version || '1.0.0'}
              </Badge>
              <p className="text-sm text-muted-foreground">
                Created {formatLocalDate(catalogue.created_at)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:shrink-0">
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
          <Button asChild>
            <Link href={`/catalogues/${catalogueId}/map`}>
              <MapIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              View Map
            </Link>
          </Button>
        </div>
      </div>

      {!complete && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" role={eventsError ? 'alert' : 'status'}>
        <span className="min-w-0 break-words">
          {eventsError || `Preview · ${loadedCount.toLocaleString()} events received. Loading remaining events...`}
        </span>
        {eventsError && <Button variant="outline" onClick={retry}>Retry loading events</Button>}
      </div>}

      {/* Statistics Cards */}
      {complete && <section aria-labelledby="catalogue-summary-heading">
        <h2 id="catalogue-summary-heading" className="sr-only">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">Total Events</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">Avg Magnitude</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgMagnitude}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">Avg Depth</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgDepth} km</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle as="h3" className="text-sm font-medium">Mean Quality (Q)</CardTitle>
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
        </div>
      </section>}

      {/* Merge review queue: only a merged catalogue can hold events for review. */}
      {mergedSourceNames && (
        <ReviewQueue catalogueId={catalogueId} canReview={canReview} catalogueNames={mergedSourceNames} />
      )}

      {/* The QC summary kept with the merge; the card hides itself when there is none (404). */}
      {mergedSourceNames && <MergeQcCard catalogueId={catalogueId} catalogueName={catalogue.name} />}

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

      <Dialog open={openEvent !== null} onOpenChange={open => { if (!open) setOpenEvent(null); }}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto" onCloseAutoFocus={returnFocusToEvent}>
          {openEvent && (
            <>
              <DialogHeader>
                <DialogTitle>Event {formatOriginTimeUtc(openEvent.time)}</DialogTitle>
                <DialogDescription>{catalogue.name}</DialogDescription>
              </DialogHeader>
              <OptimizedEventPopup
                event={{ ...openEvent, region: openEvent.location_name ?? null }}
                quality={resolveEventQuality(openEvent)}
                showFaults
              />
              <Button asChild variant="outline" className="mt-2 w-full">
                <Link href={`/catalogues/${catalogueId}/map`}>View catalogue map</Link>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
