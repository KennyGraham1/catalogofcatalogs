'use client';

import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Activity, Calendar, Ruler, MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getMagnitudeColor, getMagnitudeRadius } from '@/lib/earthquake-utils';
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {events.map((event) => (
          <Circle
            key={event.id}
            center={[event.latitude, event.longitude]}
            radius={getMagnitudeRadius(event.magnitude)}
            color={getMagnitudeColor(event.magnitude)}
            fillColor={getMagnitudeColor(event.magnitude)}
            fillOpacity={0.5}
            weight={1}
          >
            <Popup>
              <Card className="p-4 min-w-[220px]">
                <h3 className="font-medium mb-2">{event.catalogue_name}</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-primary" />
                    <span>Magnitude: {event.magnitude.toFixed(1)}{event.magnitude_type ? ` ${event.magnitude_type}` : ''}</span>
                  </div>
                  {event.depth !== null && (
                    <div className="flex items-center gap-2 text-sm">
                      <Ruler className="h-4 w-4 text-primary" />
                      <span>Depth: {event.depth.toFixed(1)} km</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>{new Date(event.time).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="text-xs">{event.latitude.toFixed(3)}°, {event.longitude.toFixed(3)}°</span>
                  </div>
                </div>
              </Card>
            </Popup>
          </Circle>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-background/95 backdrop-blur-sm p-4 rounded-lg border shadow-lg">
        <h4 className="font-medium mb-2 text-sm">Magnitude Scale</h4>
        <p className="text-xs text-muted-foreground mb-3">Circle size represents magnitude</p>
        <div className="flex items-center justify-center gap-1 py-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
          <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
          <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0"></div>
          <div className="w-5 h-5 rounded-full bg-blue-500 flex-shrink-0"></div>
          <div className="w-6 h-6 rounded-full bg-blue-500 flex-shrink-0"></div>
        </div>
        <div className="mt-2 pt-2 border-t text-xs text-muted-foreground text-center">
          {events.length} events
        </div>
      </div>
    </div>
  );
}