'use client';

import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';

// Dynamically import to avoid SSR issues with Leaflet
const EarthquakeCircleMap = dynamic(
  () => import('@/components/map/EarthquakeCircleMap').then(mod => ({ default: mod.EarthquakeCircleMap })),
  { ssr: false }
);

interface CatalogueEvent {
  id: number | string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number | null;
  time: string;
  region?: string | null;
  magnitude_type?: string | null;
  event_type?: string | null;

  // Uncertainty fields
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;

  // Quality metrics
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  used_phase_count?: number | null;

  // Complex data
  focal_mechanisms?: string | null;
  picks?: string | null;
  arrivals?: string | null;
}

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
  const [sampleSize, setSampleSize] = useState<number>(1000);

  const { data: catalogues, loading: cataloguesLoading } = useCachedFetch<Catalogue[]>(
    '/api/catalogues',
    { cacheTime: 5 * 60 * 1000 }
  );

  const { data: eventsData, loading: eventsLoading, error: eventsError } = useCachedFetch<CatalogueEvent[] | { data: CatalogueEvent[] }>(
    catalogueId ? `/api/catalogues/${catalogueId}/events` : null,
    { cacheTime: 2 * 60 * 1000 }
  );

  const catalogue = useMemo(() => {
    if (!catalogues || !catalogueId) return null;
    return catalogues.find((c: Catalogue) => c.id === catalogueId) || null;
  }, [catalogues, catalogueId]);

  const events = useMemo(() => {
    if (!eventsData) return [];
    if (Array.isArray(eventsData)) return eventsData;
    if ('data' in eventsData && Array.isArray(eventsData.data)) return eventsData.data;
    return [];
  }, [eventsData]);

  const loading = cataloguesLoading || eventsLoading;
  const error = eventsError?.message || null;

  const stats = {
    total: events.length,
    withUncertainty: events.filter(e => e.latitude_uncertainty || e.longitude_uncertainty || e.depth_uncertainty).length,
    withFocalMechanisms: events.filter(e => e.focal_mechanisms).length,
    withStationData: events.filter(e => e.picks || e.arrivals).length,
  };

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
              {catalogue.name} • {catalogue.event_count} events
            </p>
          )}
        </div>

        {!loading && events.length > 0 && (
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
                  <InfoTooltip content="Events that include picks or arrivals from seismic stations." />
                </div>
                <CardTitle className="text-2xl">{stats.withStationData.toLocaleString()}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>

      {/* Map Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Interactive Map</CardTitle>
              <CardDescription>Explore earthquake events with advanced visualization features</CardDescription>
            </div>
            {catalogue && (
              <Badge variant={catalogue.status === 'complete' ? 'default' : 'secondary'}>
                {catalogue.status}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="h-[700px] flex items-center justify-center">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground">Loading catalogue events...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="h-[700px] flex items-center justify-center p-6">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
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

          {!loading && !error && events.length > 0 && (
            <EarthquakeCircleMap
              events={events}
              sampleSize={sampleSize}
              onSampleSizeChange={setSampleSize}
              center={[-41.0, 174.0]}
              zoom={6}
              height="700px"
              mapKey={`catalogue-map-${catalogueId}`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
