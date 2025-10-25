'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Circle, Popup } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Activity, Calendar, Ruler } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Mock data for New Zealand earthquakes
const mockEvents = [
  { id: 1, lat: -41.2865, lng: 174.7762, mag: 4.5, depth: 25, time: "2023-09-01T10:30:00Z", region: "Wellington" },
  { id: 2, lat: -36.8485, lng: 174.7633, mag: 3.2, depth: 12, time: "2023-09-02T15:45:00Z", region: "Auckland" },
  { id: 3, lat: -43.5321, lng: 172.6362, mag: 4.8, depth: 15, time: "2023-09-03T08:15:00Z", region: "Christchurch" },
  { id: 4, lat: -45.0312, lng: 168.6626, mag: 3.7, depth: 8, time: "2023-09-04T12:00:00Z", region: "Queenstown" },
  { id: 5, lat: -39.0556, lng: 174.0752, mag: 5.2, depth: 30, time: "2023-09-05T22:30:00Z", region: "New Plymouth" },
  { id: 6, lat: -37.7870, lng: 175.2793, mag: 2.8, depth: 5, time: "2023-09-06T14:20:00Z", region: "Hamilton" },
  { id: 7, lat: -40.9006, lng: 175.9972, mag: 4.1, depth: 20, time: "2023-09-07T09:10:00Z", region: "Masterton" },
  { id: 8, lat: -38.1368, lng: 176.2497, mag: 3.9, depth: 15, time: "2023-09-08T18:05:00Z", region: "Rotorua" }
];

export function CatalogueMap() {
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
    return Math.max(10000, magnitude * 8000);
  };

  return (
    <div className="h-[600px] w-full relative">
      <MapContainer
        center={[-41.0, 174.0]} // Center on New Zealand
        zoom={5} // Closer zoom for NZ view
        className="h-full w-full"
        minZoom={4}
        maxZoom={12}
        maxBounds={[[-48, 165], [-34, 179]]} // Bound to New Zealand region
        maxBoundsViscosity={1.0}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {mockEvents.map((event) => (
          <Circle
            key={event.id}
            center={[event.lat, event.lng]}
            radius={getMagnitudeRadius(event.mag)}
            color={getMagnitudeColor(event.mag)}
            fillColor={getMagnitudeColor(event.mag)}
            fillOpacity={0.5}
            weight={1}
          >
            <Popup>
              <Card className="p-4 min-w-[200px]">
                <h3 className="font-medium mb-2">{event.region}, New Zealand</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4 text-primary" />
                    <span>Magnitude: {event.mag}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Ruler className="h-4 w-4 text-primary" />
                    <span>Depth: {event.depth} km</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>{new Date(event.time).toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            </Popup>
          </Circle>
        ))}
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