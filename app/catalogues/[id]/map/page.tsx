'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { EnhancedMapView } from '@/components/advanced-viz/EnhancedMapView';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCachedFetch } from '@/hooks/use-cached-fetch';

interface CatalogueEvent {
  id: number | string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number;
  time: string;
  region?: string;

  // Uncertainty fields
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;
  time_uncertainty?: number | null;

  // Quality metrics
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  used_phase_count?: number | null;
  standard_error?: number | null;

  // Magnitude details
  magnitude_uncertainty?: number | null;
  magnitude_station_count?: number | null;
  magnitude_type?: string | null;

  // Evaluation
  evaluation_mode?: string | null;
  evaluation_status?: string | null;

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

  // Use cached fetch for catalogues list
  const { data: catalogues, loading: cataloguesLoading, error: cataloguesError } = useCachedFetch<Catalogue[]>(
    '/api/catalogues',
    { cacheTime: 5 * 60 * 1000 } // 5 minutes
  );

  // Use cached fetch for events
  const { data: eventsData, loading: eventsLoading, error: eventsError } = useCachedFetch<CatalogueEvent[] | { data: CatalogueEvent[] }>(
    catalogueId ? `/api/catalogues/${catalogueId}/events` : null,
    { cacheTime: 2 * 60 * 1000 } // 2 minutes
  );

  // Find current catalogue from the list
  const catalogue = useMemo(() => {
    if (!catalogues || !catalogueId) return null;
    return catalogues.find((c: Catalogue) => c.id === catalogueId) || null;
  }, [catalogues, catalogueId]);

  // Extract events array from response
  const events = useMemo(() => {
    if (!eventsData) return [];
    if (Array.isArray(eventsData)) return eventsData;
    if ('data' in eventsData && Array.isArray(eventsData.data)) return eventsData.data;
    return [];
  }, [eventsData]);

  const loading = cataloguesLoading || eventsLoading;
  const error = cataloguesError?.message || eventsError?.message || null;

  // Calculate statistics
  const stats = {
    total: events.length,
    withUncertainty: events.filter(e =>
      e.latitude_uncertainty || e.longitude_uncertainty || e.depth_uncertainty
    ).length,
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
            Enhanced Map View
          </h1>
          {catalogue && (
            <p className="text-muted-foreground mt-1">
              {catalogue.name} • {catalogue.event_count} events
            </p>
          )}
        </div>

        {/* Statistics Cards */}
        {!loading && events.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Events</CardDescription>
                <CardTitle className="text-2xl">{stats.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>With Uncertainty</CardDescription>
                <CardTitle className="text-2xl">{stats.withUncertainty}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Focal Mechanisms</CardDescription>
                <CardTitle className="text-2xl">{stats.withFocalMechanisms}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Station Data</CardDescription>
                <CardTitle className="text-2xl">{stats.withStationData}</CardTitle>
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
              <CardDescription>
                Explore earthquake events with advanced visualization features
              </CardDescription>
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
            <EnhancedMapView
              events={events}
              center={[-41.0, 174.0]}
              zoom={6}
            />
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      {!loading && events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Visualization Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">Available Controls:</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• <strong>Uncertainty Ellipses:</strong> Show location uncertainty</li>
                  <li>• <strong>Focal Mechanisms:</strong> Display beach ball diagrams</li>
                  <li>• <strong>Station Coverage:</strong> View seismic station distribution</li>
                  <li>• <strong>Quality Colors:</strong> Color events by quality score</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Interaction:</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Click on earthquake markers for detailed information</li>
                  <li>• Use mouse wheel to zoom in/out</li>
                  <li>• Drag to pan the map</li>
                  <li>• Toggle visualization options in the control panel</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}