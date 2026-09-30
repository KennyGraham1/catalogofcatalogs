'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Loader2, MapPin, AlertCircle, LogIn } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCatalogueEvents } from '@/hooks/use-catalogue-events';
import { EVENTS_SIGN_IN_MESSAGE } from '@/lib/catalogue-event-loader';
import type { MapDetail } from '@/lib/map-event-selection';
import { Button } from '@/components/ui/button';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { formatCount } from '@/lib/map-format';

// Dynamically import to avoid SSR issues with Leaflet
const EarthquakeCircleMap = dynamic(
  () => import('@/components/map/EarthquakeCircleMap').then(mod => ({ default: mod.EarthquakeCircleMap })),
  { ssr: false }
);

interface Catalogue {
  id: string;
  name: string;
  event_count: number;
  status: string;
  created_at: string;
}

export default function CatalogueMapPage() {
  const params = useParams();
  const catalogueId = params.id as string;
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');

  const { data: catalogues, loading: cataloguesLoading } = useCachedFetch<Catalogue[]>(
    '/api/catalogues',
    { cacheTime: 5 * 60 * 1000 }
  );

  const availableCatalogues = useMemo(() => Array.isArray(catalogues) ? catalogues : [], [catalogues]);
  const { events, loading: eventsLoading, complete, loadedCount, error, retry: reload } = useCatalogueEvents(availableCatalogues, catalogueId);

  const catalogue = useMemo(() => {
    if (!catalogues || !catalogueId) return null;
    return catalogues.find((c: Catalogue) => c.id === catalogueId) || null;
  }, [catalogues, catalogueId]);

  // Catalogue id -> name, for EarthquakeCircleMap's source-catalogue colour mode legend
  // (a merged catalogue's events carry source_catalogue_ids, C2). Built from the catalogue
  // list this page already loads for the header/lookup above - no extra fetch.
  const catalogueNames = useMemo(
    () => Object.fromEntries(availableCatalogues.map(c => [c.id, c.name])),
    [availableCatalogues]
  );

  const loading = cataloguesLoading || (eventsLoading && events.length === 0);
  const stats = useMemo(() => ({
    total: events.length,
    // Any reported location uncertainty counts: lat/lon (rarely written), the circular
    // horizontal column, the QuakeML OriginUncertainty error-ellipse axes, or depth. GeoNet
    // and USGS (QuakeML/CSV) only ever populate horizontal_uncertainty/depth_uncertainty,
    // never latitude_uncertainty/longitude_uncertainty (#57) - matches the definition
    // lib/validation.ts already uses for the upload quality report.
    withUncertainty: events.filter(e =>
      e.latitude_uncertainty != null ||
      e.longitude_uncertainty != null ||
      e.horizontal_uncertainty != null ||
      e.min_horizontal_uncertainty != null ||
      e.max_horizontal_uncertainty != null ||
      e.depth_uncertainty != null
    ).length,
    withFocalMechanisms: events.filter(e => e.focal_mechanisms).length,
    withStationData: events.filter(e => (e.used_station_count ?? 0) > 0).length,
  }), [events]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-8 w-8 text-primary" />
            Interactive Map
          </h1>
          {catalogue && (
            <p className="text-muted-foreground mt-1">
              {catalogue.name} · {formatCount(catalogue.event_count ?? 0)} events
            </p>
          )}
        </div>

        {complete && events.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Total Events</span>
                  <InfoTooltip content="Number of events with coordinates loaded for this catalogue." />
                </div>
                <CardTitle className="text-2xl">{stats.total.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>With Uncertainty</span>
                  <TechnicalTermTooltip term="uncertainty" />
                </div>
                <CardTitle className="text-2xl">{stats.withUncertainty.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Focal Mechanisms</span>
                  <TechnicalTermTooltip term="focalMechanism" />
                </div>
                <CardTitle className="text-2xl">{stats.withFocalMechanisms.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span>Station Data</span>
                  <InfoTooltip content="Events with a reported count of stations used in the solution." />
                </div>
                <CardTitle className="text-2xl">{stats.withStationData.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>

      {!complete && events.length > 0 && <div role={error ? 'alert' : 'status'} className="rounded-lg border p-3 text-sm">
        {error || `Showing a preview. ${loadedCount.toLocaleString()} events received; loading the remaining events...`}
        {error && <Button variant="outline" onClick={reload}>Retry loading events</Button>}
      </div>}

      {/* Map card: the page header above already names the map, so the card is the map
          alone - no second title, no status badge - filling the card to its rounded edge. */}
      <Card className="overflow-hidden">
        {loading && (
          <div className="h-[700px] flex items-center justify-center">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Loading catalogue events...</p>
            </div>
          </div>
        )}

        {error === EVENTS_SIGN_IN_MESSAGE && events.length === 0 && (
          <div className="h-[700px] flex items-center justify-center p-6">
            <Alert className="max-w-md">
              <LogIn className="h-4 w-4" />
              <AlertDescription className="space-y-3">
                <p>{error} Your session may have expired.</p>
                <Button asChild size="sm">
                  <Link href={`/login?callbackUrl=${encodeURIComponent(`/catalogues/${catalogueId}/map`)}`}>Log in</Link>
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {error && error !== EVENTS_SIGN_IN_MESSAGE && events.length === 0 && (
          <div className="h-[700px] flex items-center justify-center p-6">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
              <Button variant="outline" onClick={reload}>Retry loading events</Button>
            </Alert>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="h-[700px] flex items-center justify-center">
            <div className="text-center space-y-2">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No events found in this catalogue</p>
            </div>
          </div>
        )}

        {!loading && events.length > 0 && (
          <EarthquakeCircleMap
            events={events}
            sampleSize={sampleSize}
            onSampleSizeChange={setSampleSize}
            height="clamp(480px, 72vh, 760px)"
            mapKey={`catalogue-map-${catalogueId}`}
            catalogueNames={catalogueNames}
          />
        )}
      </Card>
    </div>
  );
}
