'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Popup, Polyline } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Ruler, Calendar, MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Earthquake {
  id: number;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number;
  time: string;
  region: string;
  catalogue: string;
}

interface NZEarthquakeMapProps {
  earthquakes: Earthquake[];
  colorBy: 'magnitude' | 'depth';
}

// New Zealand fault lines (simplified major faults)
const alpineFault = [
  [-42.0, 171.5],
  [-42.5, 171.8],
  [-43.0, 170.5],
  [-43.5, 170.0],
  [-44.0, 169.5],
  [-44.5, 168.8],
];

const hikurangiSubductionZone = [
  [-37.5, 179.0],
  [-38.0, 178.5],
  [-39.0, 178.0],
  [-40.0, 177.5],
  [-41.0, 177.0],
  [-42.0, 176.5],
];

const wellingtonFault = [
  [-41.1, 174.8],
  [-41.3, 174.9],
  [-41.5, 175.0],
];

export default function NZEarthquakeMap({ earthquakes, colorBy }: NZEarthquakeMapProps) {
  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  const getMagnitudeColor = (magnitude: number): string => {
    if (magnitude >= 6.0) return '#8B0000'; // Dark red
    if (magnitude >= 5.0) return '#FF0000'; // Red
    if (magnitude >= 4.0) return '#FF6B00'; // Orange
    if (magnitude >= 3.0) return '#FFD700'; // Gold
    return '#90EE90'; // Light green
  };

  const getDepthColor = (depth: number): string => {
    if (depth >= 40) return '#000080'; // Navy
    if (depth >= 30) return '#0000FF'; // Blue
    if (depth >= 20) return '#4169E1'; // Royal blue
    if (depth >= 10) return '#87CEEB'; // Sky blue
    return '#ADD8E6'; // Light blue
  };

  const getColor = (eq: Earthquake): string => {
    return colorBy === 'magnitude' 
      ? getMagnitudeColor(eq.magnitude)
      : getDepthColor(eq.depth);
  };

  const getMagnitudeRadius = (magnitude: number): number => {
    // Radius in meters for the circle
    return Math.pow(2, magnitude) * 1000;
  };

  const getMagnitudeLabel = (magnitude: number): string => {
    if (magnitude >= 6.0) return 'Major';
    if (magnitude >= 5.0) return 'Moderate';
    if (magnitude >= 4.0) return 'Light';
    if (magnitude >= 3.0) return 'Minor';
    return 'Micro';
  };

  return (
    <div className="relative">
      <div className="h-[600px] w-full rounded-lg overflow-hidden border">
        <MapContainer
          center={[-41.0, 174.0]} // Center on New Zealand
          zoom={6}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Major Fault Lines */}
          <Polyline
            positions={alpineFault as any}
            color="#FF0000"
            weight={3}
            opacity={0.6}
            dashArray="10, 10"
          />
          <Polyline
            positions={hikurangiSubductionZone as any}
            color="#8B0000"
            weight={3}
            opacity={0.6}
            dashArray="10, 10"
          />
          <Polyline
            positions={wellingtonFault as any}
            color="#FF4500"
            weight={2}
            opacity={0.6}
            dashArray="5, 5"
          />

          {/* Earthquake Markers */}
          {earthquakes.map((eq) => (
            <Circle
              key={eq.id}
              center={[eq.latitude, eq.longitude]}
              radius={getMagnitudeRadius(eq.magnitude)}
              pathOptions={{
                color: getColor(eq),
                fillColor: getColor(eq),
                fillOpacity: 0.6,
                weight: 2,
              }}
            >
              <Popup>
                <div className="p-2 min-w-[250px]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-base">{eq.region}</h3>
                    <Badge variant={eq.magnitude >= 5.0 ? 'destructive' : 'default'}>
                      {getMagnitudeLabel(eq.magnitude)}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="font-medium">Magnitude:</span>
                      <span className="font-bold">{eq.magnitude.toFixed(1)}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <Ruler className="h-4 w-4 text-primary" />
                      <span className="font-medium">Depth:</span>
                      <span>{eq.depth} km</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-medium">Time:</span>
                      <span className="text-xs">{new Date(eq.time).toLocaleString()}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">Location:</span>
                      <span className="text-xs">{eq.latitude.toFixed(4)}°, {eq.longitude.toFixed(4)}°</span>
                    </div>
                    
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Source:</span> {eq.catalogue}
                      </div>
                    </div>
                  </div>
                </div>
              </Popup>
            </Circle>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-background/95 backdrop-blur-sm border rounded-lg p-4 shadow-lg">
        <h4 className="font-semibold text-sm mb-3">
          {colorBy === 'magnitude' ? 'Magnitude Scale' : 'Depth Scale'}
        </h4>
        
        {colorBy === 'magnitude' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#8B0000' }}></div>
              <span>≥ 6.0 (Major)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FF0000' }}></div>
              <span>5.0 - 5.9 (Moderate)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FF6B00' }}></div>
              <span>4.0 - 4.9 (Light)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FFD700' }}></div>
              <span>3.0 - 3.9 (Minor)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#90EE90' }}></div>
              <span>&lt; 3.0 (Micro)</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#000080' }}></div>
              <span>≥ 40 km (Deep)</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#0000FF' }}></div>
              <span>30 - 39 km</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#4169E1' }}></div>
              <span>20 - 29 km</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#87CEEB' }}></div>
              <span>10 - 19 km</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#ADD8E6' }}></div>
              <span>&lt; 10 km (Shallow)</span>
            </div>
          </div>
        )}
        
        <div className="mt-3 pt-3 border-t">
          <h4 className="font-semibold text-xs mb-2">Fault Lines</h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-6 h-0.5 bg-red-600" style={{ borderTop: '2px dashed' }}></div>
              <span>Alpine Fault</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-6 h-0.5 bg-red-900" style={{ borderTop: '2px dashed' }}></div>
              <span>Hikurangi Zone</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-6 h-0.5 bg-orange-600" style={{ borderTop: '2px dashed' }}></div>
              <span>Wellington Fault</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

