'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Ruler, Calendar } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMagnitudeColor, getMagnitudeRadius, getMagnitudeLabel } from '@/lib/earthquake-utils';
import { useMapTheme, useMapColors } from '@/hooks/use-map-theme';

interface MapComponentProps {
  events: Array<{
    id?: number;
    latitude: number;
    longitude: number;
    magnitude: number;
    depth?: number;
    time: string;
    region?: string;
    source?: string;
  }>;
}

export default function MapComponent({ events }: MapComponentProps) {
  const mapTheme = useMapTheme();
  const mapColors = useMapColors();

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border relative">
      <MapContainer
        center={[-41.0, 174.0]} // Center on New Zealand
        zoom={6}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution={mapTheme.attribution}
          url={mapTheme.tileLayerUrl}
        />

        {/* Earthquake Markers */}
        {events.map((event, index) => (
          <Circle
            key={event.id || index}
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
              <div className="p-2 min-w-[250px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-base">{event.region || 'New Zealand'}</h3>
                  <Badge variant={event.magnitude >= 5.0 ? 'destructive' : 'default'}>
                    {getMagnitudeLabel(event.magnitude)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-medium">Magnitude:</span>
                    <span>{event.magnitude.toFixed(1)}</span>
                  </div>

                  {event.depth !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Ruler className="h-4 w-4 text-primary" />
                      <span className="font-medium">Depth:</span>
                      <span>{event.depth} km</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="font-medium">Time:</span>
                    <span className="text-xs">{event.time}</span>
                  </div>

                  {event.source && (
                    <div className="flex items-center gap-2 text-sm pt-2 border-t">
                      <span className="font-medium">Source:</span>
                      <span className="text-xs">{event.source}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Location:</span>
                    <span className="text-xs">
                      {event.latitude.toFixed(4)}°, {event.longitude.toFixed(4)}°
                    </span>
                  </div>
                </div>
              </div>
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
