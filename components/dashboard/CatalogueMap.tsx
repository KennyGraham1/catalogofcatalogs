'use client';

import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Activity, Calendar, Ruler, MapPin, Filter, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMagnitudeColor, getMagnitudeRadius, getEarthquakeColor, sampleEarthquakeEvents } from '@/lib/earthquake-utils';
import { useMapTheme, useMapColors } from '@/hooks/use-map-theme';
import 'leaflet/dist/leaflet.css';

interface EarthquakeEvent {
  id: string;
  catalogue_id?: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number | null;
  time: string;
  catalogue_name: string;
  magnitude_type?: string | null;
  event_type?: string | null;
}

interface Catalogue {
  id: string;
  name: string;
  event_count: number;
}

// Memoized CatalogueMap component for better performance
export const CatalogueMap = memo(function CatalogueMap() {
  const [events, setEvents] = useState<EarthquakeEvent[]>([]);
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [selectedCatalogue, setSelectedCatalogue] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(1000);

  // Dark mode support
  const mapTheme = useMapTheme();
  const mapColors = useMapColors();

  // Sample events for performance
  const { sampled: sampledEvents, total, displayCount, isSampled } = useMemo(
    () => sampleEarthquakeEvents(events, sampleSize),
    [events, sampleSize]
  );

  // Fetch catalogues list
  useEffect(() => {
    async function fetchCatalogues() {
      try {
        const response = await fetch('/api/catalogues');
        if (!response.ok) {
          throw new Error('Failed to fetch catalogues');
        }
        const data = await response.json();
        setCatalogues(data || []);

        // Auto-select first catalogue if available
        if (data && data.length > 0 && !selectedCatalogue) {
          setSelectedCatalogue(data[0].id);
        }
      } catch (err) {
        console.error('Error fetching catalogues:', err);
      }
    }

    fetchCatalogues();
  }, []);

  // Memoized fetch function for better performance
  const fetchEvents = useCallback(async () => {
    if (!selectedCatalogue) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch events from specific catalogue only
      const response = await fetch(`/api/catalogues/${selectedCatalogue}/events`);

      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }

      const data = await response.json();

      // Handle different response formats
      const eventsList: EarthquakeEvent[] = Array.isArray(data) ? data : (data.data || []);

      setEvents(eventsList);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [selectedCatalogue]);

  // Fetch events based on selected catalogue
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // Memoize helper functions for better performance
  // IMPORTANT: Must be before any conditional returns to follow Rules of Hooks
  const getMagnitudeLabel = useMemo(() => (magnitude: number): string => {
    if (magnitude >= 6.0) return 'Major';
    if (magnitude >= 5.0) return 'Moderate';
    if (magnitude >= 4.0) return 'Light';
    if (magnitude >= 3.0) return 'Minor';
    return 'Micro';
  }, []);

  // Memoize event markers to avoid unnecessary re-renders (use sampled events)
  // Sort by magnitude (small to large) so larger events render on top
  const eventMarkers = useMemo(() => {
    return [...sampledEvents].sort((a, b) => a.magnitude - b.magnitude).map((event) => (
      <Circle
        key={event.id}
        center={[event.latitude, event.longitude]}
        radius={getMagnitudeRadius(event.magnitude)}
        pathOptions={{
          fillColor: getEarthquakeColor(event.depth || 0, mapColors.isDark),
          fillOpacity: mapColors.markerOpacity,
          color: getEarthquakeColor(event.depth || 0, mapColors.isDark),
          weight: 1,
        }}
      >
        <Popup>
          <div className="p-2 min-w-[200px]">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline" className="text-xs">
                {getMagnitudeLabel(event.magnitude)}
              </Badge>
              <span className="text-sm font-semibold">M {event.magnitude.toFixed(1)}</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span>{new Date(event.time).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span>
                  {event.latitude.toFixed(3)}°, {event.longitude.toFixed(3)}°
                </span>
              </div>
              {event.depth !== null && (
                <div className="flex items-center gap-2">
                  <Ruler className="h-3 w-3 text-muted-foreground" />
                  <span>{event.depth.toFixed(1)} km depth</span>
                </div>
              )}
              {event.magnitude_type && (
                <div className="flex items-center gap-2">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                  <span>Type: {event.magnitude_type}</span>
                </div>
              )}
            </div>
          </div>
        </Popup>
      </Circle>
    ));
  }, [sampledEvents, getMagnitudeLabel, mapColors]);

  if (loading) {
    return (
      <div className="h-[600px] w-full relative flex items-center justify-center bg-muted/20">
        <div className="text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading earthquake data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[600px] w-full relative flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Failed to load map data</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (catalogues.length === 0) {
    return (
      <div className="h-[600px] w-full relative flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No catalogues found</p>
          <p className="text-sm mt-1">Import or create catalogues to see events on the map</p>
        </div>
      </div>
    );
  }

  if (events.length === 0 && !loading) {
    return (
      <div className="h-[600px] w-full relative flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No earthquake events found in this catalogue</p>
          <p className="text-sm mt-1">Select a different catalogue or import more data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[600px] w-full relative">
      {/* Catalogue Filter */}
      <div className="absolute top-4 left-4 z-[2000]">
        <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedCatalogue} onValueChange={setSelectedCatalogue}>
              <SelectTrigger className="w-[250px] h-8">
                <SelectValue placeholder="Select catalogue" />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[10000]">
                {catalogues.map((catalogue) => (
                  <SelectItem key={catalogue.id} value={catalogue.id}>
                    {catalogue.name} ({catalogue.event_count} events)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      {/* Sampling Info Badge */}
      {isSampled && (
        <Card className="absolute top-16 left-4 z-[2000] p-3 bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-blue-500" />
            <span>
              Displaying <strong>{displayCount.toLocaleString()}</strong> of{' '}
              <strong>{total.toLocaleString()}</strong> events
            </span>
          </div>
        </Card>
      )}

      <MapContainer
        center={[-41.0, 174.0]} // Center on New Zealand
        zoom={5}
        className="h-full w-full"
        minZoom={2}
        maxZoom={12}
        preferCanvas={true}
      >
        <TileLayer
          attribution={mapTheme.attribution}
          url={mapTheme.tileLayerUrl}
        />

        {/* Earthquake markers - using intelligent sampling for performance */}
        {eventMarkers}
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 right-4 z-[2000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[220px]">
        <h4 className="font-semibold text-sm mb-3">Magnitude Scale</h4>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Circle size = magnitude (+3km scale)</p>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
              <span>M2 (~6 km)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
              <span>M4 (~12 km)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0"></div>
              <span>M6 (~18 km)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex-shrink-0"></div>
              <span>M7+ (~21 km)</span>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="text-xs text-muted-foreground text-center">
            {total.toLocaleString()} total events
          </div>
          {selectedCatalogue && (
            <div className="text-xs text-muted-foreground text-center">
              {catalogues.find(c => c.id === selectedCatalogue)?.name}
            </div>
          )}
          <div className="pt-2 border-t">
            <Label htmlFor="sampleSize-map" className="text-xs font-medium mb-2 block">
              Max Events
            </Label>
            <Select value={sampleSize.toString()} onValueChange={(value) => setSampleSize(Number(value))}>
              <SelectTrigger className="w-full h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[10000]">
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="2000">2,000</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
});

// Event popup component (memoized)
const EventPopup = memo(function EventPopup({ event, getMagnitudeLabel }: { event: EarthquakeEvent; getMagnitudeLabel: (mag: number) => string }) {
  return (
    <div className="p-3 min-w-[250px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">{event.catalogue_name}</h3>
        <Badge variant={event.magnitude >= 5.0 ? 'destructive' : 'default'}>
          {getMagnitudeLabel(event.magnitude)}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-medium">M {event.magnitude.toFixed(1)}{event.magnitude_type ? ` ${event.magnitude_type}` : ''}</span>
        </div>
        {event.depth !== null && (
          <div className="flex items-center gap-2 text-sm">
            <Ruler className="h-4 w-4 text-primary" />
            <span>Depth: {event.depth.toFixed(1)} km</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs">{new Date(event.time).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs">{event.latitude.toFixed(3)}°, {event.longitude.toFixed(3)}°</span>
        </div>
        {event.event_type && (
          <div className="pt-2 border-t">
            <Badge variant="outline">{event.event_type}</Badge>
          </div>
        )}
      </div>
    </div>
  );
});