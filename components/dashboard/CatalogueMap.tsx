'use client';

import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Calendar, Ruler, MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getMagnitudeColor, getMagnitudeRadius } from '@/lib/earthquake-utils';
import { useMapTheme, useMapColors } from '@/hooks/use-map-theme';
import 'leaflet/dist/leaflet.css';

interface EarthquakeEvent {
  id: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number | null;
  time: string;
  catalogue_name: string;
  magnitude_type?: string | null;
  event_type?: string | null;
}

export function CatalogueMap() {
  const [events, setEvents] = useState<EarthquakeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dark mode support
  const mapTheme = useMapTheme();
  const mapColors = useMapColors();

  // Fetch sample events from database
  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/events/sample?limit=100');

        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }

        const data = await response.json();
        setEvents(data.events || []);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, []);

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

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

  if (events.length === 0) {
    return (
      <div className="h-[600px] w-full relative flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No earthquake events found</p>
          <p className="text-sm mt-1">Import or create catalogues to see events on the map</p>
        </div>
      </div>
    );
  }

  const getMagnitudeLabel = (magnitude: number): string => {
    if (magnitude >= 6.0) return 'Major';
    if (magnitude >= 5.0) return 'Moderate';
    if (magnitude >= 4.0) return 'Light';
    if (magnitude >= 3.0) return 'Minor';
    return 'Micro';
  };

  return (
    <div className="h-[600px] w-full relative">
      <MapContainer
        center={[-41.0, 174.0]} // Center on New Zealand
        zoom={5}
        className="h-full w-full"
        minZoom={2}
        maxZoom={12}
      >
        <TileLayer
          attribution={mapTheme.attribution}
          url={mapTheme.tileLayerUrl}
        />

        {/* Earthquake markers - No clustering */}
        {events.map((event) => (
          <Circle
            key={event.id}
            center={[event.latitude, event.longitude]}
            radius={getMagnitudeRadius(event.magnitude)}
            pathOptions={{
              color: getMagnitudeColor(event.magnitude),
              fillColor: getMagnitudeColor(event.magnitude),
              fillOpacity: mapColors.markerOpacity,
              weight: 2,
            }}
          >
            <Popup>
              <EventPopup event={event} getMagnitudeLabel={getMagnitudeLabel} />
            </Popup>
          </Circle>
        ))}
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[220px]">
        <h4 className="font-semibold text-sm mb-3">Magnitude Scale</h4>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Circle size = magnitude</p>
          <div className="flex items-center justify-center gap-1 py-1">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <div className="w-5 h-5 rounded-full bg-blue-500"></div>
            <div className="w-6 h-6 rounded-full bg-blue-500"></div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground text-center">
          {events.length} events
        </div>
      </Card>
    </div>
  );
}

// Event popup component
function EventPopup({ event, getMagnitudeLabel }: { event: EarthquakeEvent; getMagnitudeLabel: (mag: number) => string }) {
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
}