'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, FeatureGroup, Circle, Popup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Ruler, Activity } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

interface MapViewProps {
  catalogueId?: string;
  events?: Array<{
    id: number;
    latitude: number;
    longitude: number;
    magnitude: number;
    depth: number;
    time: string;
    region?: string;
  }>;
  onBoundsChange?: (bounds: L.LatLngBounds) => void;
  onShapeDrawn?: (shape: any) => void;
}

export function MapView({ catalogueId, events: propEvents, onBoundsChange, onShapeDrawn }: MapViewProps) {
  const mapRef = useRef<L.Map>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [events, setEvents] = useState<any[]>(propEvents || []);
  const [loading, setLoading] = useState(false);

  // Fetch events if catalogueId is provided
  useEffect(() => {
    if (catalogueId && !propEvents) {
      setLoading(true);
      fetch(`/api/catalogues/${catalogueId}/events`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setEvents(data);
          } else if (data.data && Array.isArray(data.data)) {
            setEvents(data.data);
          }
          setLoading(false);
        })
        .catch(error => {
          console.error('Error fetching events:', error);
          setLoading(false);
        });
    } else if (propEvents) {
      setEvents(propEvents);
    }
  }, [catalogueId, propEvents]);

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  const getMagnitudeColor = (magnitude: number) => {
    if (magnitude > 6) return '#9333ea'; // purple
    if (magnitude > 5) return '#dc2626'; // red
    if (magnitude > 4) return '#ea580c'; // orange
    if (magnitude > 3) return '#ca8a04'; // yellow
    return '#16a34a'; // green
  };

  const getMagnitudeRadius = (magnitude: number) => {
    return Math.max(20000, magnitude * 10000);
  };

  useEffect(() => {
    if (mapRef.current && onBoundsChange) {
      const map = mapRef.current;
      const updateBounds = () => {
        onBoundsChange(map.getBounds());
      };
      map.on('moveend', updateBounds);
      return () => {
        map.off('moveend', updateBounds);
      };
    }
  }, [onBoundsChange]);

  const handleShapeCreated = (e: any) => {
    if (onShapeDrawn) {
      onShapeDrawn(e.layer.toGeoJSON());
    }
  };

  return (
    <div className="h-[calc(100vh-12rem)] w-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-[1000]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-2"></div>
            <p>Loading events...</p>
          </div>
        </div>
      )}
      <MapContainer
        center={[0, 0]}
        zoom={2}
        ref={mapRef}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <FeatureGroup>
          <EditControl
            position="topright"
            onCreated={handleShapeCreated}
            draw={{
              rectangle: true,
              polygon: true,
              circle: true,
              circlemarker: false,
              marker: false,
              polyline: false,
            }}
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
              eventHandlers={{
                click: () => setSelectedEvent(event),
              }}
            >
              <Popup>
                <Card className="p-4 min-w-[200px]">
                  <h3 className="font-medium mb-2">Event Details</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4 text-primary" />
                      <span>Magnitude: {event.magnitude?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Ruler className="h-4 w-4 text-primary" />
                      <span>Depth: {event.depth?.toFixed(1) || 'N/A'} km</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>{new Date(event.time).toLocaleString()}</span>
                    </div>
                    {event.event_type && (
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{event.event_type}</Badge>
                      </div>
                    )}
                  </div>
                </Card>
              </Popup>
            </Circle>
          ))}
        </FeatureGroup>
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-background/95 backdrop-blur-sm p-4 rounded-lg border shadow-sm">
        <h4 className="font-medium mb-2">Magnitude Scale</h4>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-600"></div>
            <span className="text-sm">&gt; 6.0</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span className="text-sm">5.0 - 6.0</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-600"></div>
            <span className="text-sm">4.0 - 5.0</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
            <span className="text-sm">3.0 - 4.0</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600"></div>
            <span className="text-sm">&lt; 3.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}