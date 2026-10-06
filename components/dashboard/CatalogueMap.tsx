'use client';

import { useEffect, useMemo, useState, memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogIn, MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCatalogueEvents, useMapEventView } from '@/hooks/use-catalogue-events';
import { EVENTS_SIGN_IN_MESSAGE } from '@/lib/catalogue-event-loader';
import { loginHref } from '@/lib/auth/login-href';
import { Button } from '@/components/ui/button';
import { EarthquakeCircleMap } from '@/components/map/EarthquakeCircleMap';
import type { MapDetail } from '@/lib/map-event-selection';
import { formatCount } from '@/lib/map-format';

interface Catalogue {
  id: string;
  name: string;
  event_count: number;
}

export const CatalogueMap = memo(function CatalogueMap() {
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('');
  const [cataloguesLoading, setCataloguesLoading] = useState(true);
  const [cataloguesError, setCataloguesError] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');
  // Bumped by "Retry" after the catalogue list failed to load.
  const [catalogueAttempt, setCatalogueAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setCataloguesLoading(true);
    setCataloguesError(null);
    async function fetchCatalogues() {
      try {
        const response = await fetch('/api/catalogues', { signal: controller.signal });
        if (!response.ok) throw new Error(`The catalogue list could not be loaded (HTTP ${response.status}).`);
        const data = await response.json();
        if (!active) return;
        const available = Array.isArray(data) ? data : [];
        setCatalogues(available);
        if (available.length > 0) setSelectedCatalogue(available[0].id);
        setCataloguesLoading(false);
      } catch (err) {
        if (!active) return;
        setCataloguesError(err instanceof Error ? err.message : 'The catalogue list could not be loaded.');
        setCataloguesLoading(false);
      }
    }
    fetchCatalogues();
    return () => { active = false; controller.abort(); };
  }, [catalogueAttempt]);

  // The map is public: a signed-out visitor loads the map view of the events, a signed-in
  // user the summary view as before.
  const view = useMapEventView();
  const isGuest = view === 'map';
  const signInHref = loginHref(usePathname() ?? '/dashboard');
  const { events, loading: eventsLoading, complete, loadedCount, error: eventsError, retry: reload } = useCatalogueEvents(catalogues, selectedCatalogue, undefined, { view });
  const loading = cataloguesLoading || (eventsLoading && events.length === 0);
  const error = cataloguesError || eventsError;
  // Refused for want of a session: only a signed-in session the server no longer honours
  // (the map view needs none), so signing in again is the remedy, not a retry.
  const eventsNeedSignIn = !cataloguesError && eventsError === EVENTS_SIGN_IN_MESSAGE;

  // Already-fetched id -> name lookup for the map's source-catalogue colour mode, so a
  // merged row's contributing catalogues (C2 source_catalogue_ids) show real names instead
  // of raw ids, with no extra request.
  const catalogueNames = useMemo(
    () => Object.fromEntries(catalogues.map((c) => [c.id, c.name])),
    [catalogues]
  );

  const emptyHeight = 'h-[600px] w-full relative flex items-center justify-center bg-muted/20';

  const renderMap = () => {
    if (loading) {
      return (
        <div className={emptyHeight}>
          <div className="text-center">
            <Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Loading earthquake data...</p>
          </div>
        </div>
      );
    }

    if (error && events.length === 0) {
      return (
        <div className={emptyHeight}>
          <div className="text-center text-muted-foreground px-4" role="alert">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p>The map could not be loaded</p>
            <p className="text-sm mt-1">
              {eventsNeedSignIn ? 'Your session has ended, so the events could not be loaded. Sign in again to continue.' : error}
            </p>
            {cataloguesError ? (
              <Button variant="outline" className="mt-3" onClick={() => setCatalogueAttempt((n) => n + 1)}>Retry</Button>
            ) : eventsNeedSignIn ? (
              <Button asChild variant="outline" className="mt-3"><Link href={signInHref}>Sign in</Link></Button>
            ) : (
              eventsError && <Button variant="outline" className="mt-3" onClick={reload}>Retry loading events</Button>
            )}
          </div>
        </div>
      );
    }

    if (catalogues.length === 0) {
      return (
        <div className={emptyHeight}>
          <div className="text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p>No catalogues yet</p>
            <p className="text-sm mt-1">Import or create catalogues to see events on the map</p>
          </div>
        </div>
      );
    }

    if (events.length === 0) {
      return (
        <div className={emptyHeight}>
          <div className="text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No earthquake events found in this catalogue</p>
            <p className="text-sm mt-1">Select a different catalogue or import more data</p>
          </div>
        </div>
      );
    }
    return <EarthquakeCircleMap
      events={events}
      sampleSize={sampleSize}
      onSampleSizeChange={setSampleSize}
      mapKey={`catalogue-map-${selectedCatalogue}`}
      height="600px"
      className="rounded-b-[calc(var(--radius)-1px)]"
      catalogueNames={catalogueNames}
    />;
  };

  const selectorId = 'dashboard-map-catalogue';
  return (
    <div className="w-full">
      {/* Catalogue selector in the card's header strip: nothing overlays the map's own controls. */}
      {catalogues.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-6 pb-3">
        <label htmlFor={selectorId} className="text-xs font-medium text-muted-foreground">Catalogue</label>
        <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
          <SelectTrigger id={selectorId} aria-label="Catalogue" className="h-8 w-[300px] max-w-full text-xs">
            <SelectValue placeholder="Select catalogue" />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[10000]">
            {catalogues.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({formatCount(c.event_count ?? 0)} events)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!complete && events.length > 0 && <div className="flex items-center gap-2 text-xs text-muted-foreground" role={eventsError ? 'alert' : 'status'}>
          <span>{eventsError || `Preview · ${loadedCount.toLocaleString()} events received, loading the rest…`}</span>
          {eventsError && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reload}>Retry loading events</Button>}
        </div>}
        {isGuest && <div role="note" className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Public map. The event table, full event records, analytics and exports need an account.</span>
          <Link href={signInHref} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />Sign in
          </Link>
        </div>}
      </div>}

      {renderMap()}
    </div>
  );
});
