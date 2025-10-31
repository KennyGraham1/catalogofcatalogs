'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Popup, Polyline } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Activity, Ruler, Calendar, MapPin, Layers, Target, Radio } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BeachBallMarker } from '../advanced-viz/BeachBallMarker';
import { StationMarker } from '../advanced-viz/StationMarker';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { calculateDistance } from '@/lib/station-coverage-utils';
import { calculateQualityScore, QualityMetrics, getQualityColor } from '@/lib/quality-scoring';
import { getMagnitudeColor, getMagnitudeRadius } from '@/lib/earthquake-utils';

interface Earthquake {
  id: number | string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number;
  time: string;
  region?: string;
  catalogue?: string;
  
  // Quality metrics
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  used_phase_count?: number | null;
  standard_error?: number | null;
  magnitude_uncertainty?: number | null;
  magnitude_station_count?: number | null;
  magnitude_type?: string | null;
  evaluation_mode?: string | null;
  evaluation_status?: string | null;
  focal_mechanisms?: string | null;
  picks?: string | null;
  arrivals?: string | null;
}

interface UnifiedEarthquakeMapProps {
  earthquakes: Earthquake[];
  colorBy?: 'magnitude' | 'depth' | 'quality';
  showFocalMechanisms?: boolean;
  showStations?: boolean;
  showFaultLines?: boolean;
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

export default function UnifiedEarthquakeMap({ 
  earthquakes, 
  colorBy = 'magnitude',
  showFocalMechanisms = false,
  showStations = false,
  showFaultLines = true
}: UnifiedEarthquakeMapProps) {
  const [selectedEvent, setSelectedEvent] = useState<Earthquake | null>(null);
  const [showFocal, setShowFocal] = useState(showFocalMechanisms);
  const [showStationCoverage, setShowStationCoverage] = useState(showStations);
  const [showFaults, setShowFaults] = useState(showFaultLines);
  const [colorMode, setColorMode] = useState<'magnitude' | 'depth' | 'quality'>(colorBy);

  // Fix Leaflet icons
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    });
  }, []);

  // Parse focal mechanisms
  const focalMechanisms = useMemo(() => {
    return earthquakes.map(event => ({
      eventId: event.id,
      position: [event.latitude, event.longitude] as [number, number],
      mechanism: parseFocalMechanism(event.focal_mechanisms)
    })).filter(item => item.mechanism !== null);
  }, [earthquakes]);

  // Calculate quality scores
  const qualityScores = useMemo(() => {
    return earthquakes.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(event as QualityMetrics)
    }));
  }, [earthquakes]);

  const getDepthColor = (depth: number): string => {
    if (depth >= 40) return '#000080'; // Navy
    if (depth >= 30) return '#0000FF'; // Blue
    if (depth >= 20) return '#4169E1'; // Royal blue
    if (depth >= 10) return '#87CEEB'; // Sky blue
    return '#ADD8E6'; // Light blue
  };

  // Get event color based on selected mode
  const getEventColor = (event: Earthquake) => {
    if (colorMode === 'quality') {
      const quality = qualityScores.find(q => q.eventId === event.id);
      return quality ? getQualityColor(quality.score.overall) : getMagnitudeColor(event.magnitude);
    } else if (colorMode === 'depth') {
      return getDepthColor(event.depth);
    }
    return getMagnitudeColor(event.magnitude);
  };

  const getMagnitudeLabel = (magnitude: number): string => {
    if (magnitude >= 6.0) return 'Major';
    if (magnitude >= 5.0) return 'Moderate';
    if (magnitude >= 4.0) return 'Light';
    if (magnitude >= 3.0) return 'Minor';
    return 'Micro';
  };

  // Stations array - empty for now
  const stations: any[] = [];

  return (
    <div className="relative">
      {/* Control Panel */}
      <Card className="absolute top-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[240px]">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Map Options
          </h3>
          
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="focal" className="text-xs cursor-pointer">
              Focal Mechanisms
            </Label>
            <Switch
              id="focal"
              checked={showFocal}
              onCheckedChange={setShowFocal}
            />
          </div>
          
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="faults" className="text-xs cursor-pointer">
              Fault Lines
            </Label>
            <Switch
              id="faults"
              checked={showFaults}
              onCheckedChange={setShowFaults}
            />
          </div>

          <div className="pt-2 border-t">
            <Label className="text-xs font-medium mb-2 block">Color By</Label>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="color-magnitude"
                  name="colorMode"
                  checked={colorMode === 'magnitude'}
                  onChange={() => setColorMode('magnitude')}
                  className="cursor-pointer"
                />
                <Label htmlFor="color-magnitude" className="text-xs cursor-pointer">Magnitude</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="color-depth"
                  name="colorMode"
                  checked={colorMode === 'depth'}
                  onChange={() => setColorMode('depth')}
                  className="cursor-pointer"
                />
                <Label htmlFor="color-depth" className="text-xs cursor-pointer">Depth</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="color-quality"
                  name="colorMode"
                  checked={colorMode === 'quality'}
                  onChange={() => setColorMode('quality')}
                  className="cursor-pointer"
                />
                <Label htmlFor="color-quality" className="text-xs cursor-pointer">Quality</Label>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Map */}
      <div className="h-[600px] w-full rounded-lg overflow-hidden border shadow-sm">
        <MapContainer
          center={[-41.0, 174.0]}
          zoom={6}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Fault Lines */}
          {showFaults && (
            <>
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
            </>
          )}

          {/* Earthquake markers */}
          {earthquakes.map((eq) => (
            <Circle
              key={eq.id}
              center={[eq.latitude, eq.longitude]}
              radius={getMagnitudeRadius(eq.magnitude)}
              pathOptions={{
                color: getEventColor(eq),
                fillColor: getEventColor(eq),
                fillOpacity: 0.6,
                weight: 2,
              }}
              eventHandlers={{
                click: () => setSelectedEvent(eq),
              }}
            >
              <Popup>
                <EventPopup event={eq} qualityScores={qualityScores} />
              </Popup>
            </Circle>
          ))}

          {/* Focal mechanisms */}
          {showFocal && focalMechanisms.map(({ eventId, position, mechanism }) => (
            mechanism && (
              <BeachBallMarker
                key={`focal-${eventId}`}
                position={position}
                mechanism={mechanism}
                eventId={eventId}
                size={30}
                onClick={() => {
                  const event = earthquakes.find(e => e.id === eventId);
                  if (event) setSelectedEvent(event);
                }}
              />
            )
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <LegendPanel colorMode={colorMode} showFaults={showFaults} />
    </div>
  );
}

// Event popup component
function EventPopup({ event, qualityScores }: { event: Earthquake; qualityScores: any[] }) {
  const quality = qualityScores.find(q => q.eventId === event.id);
  
  return (
    <div className="p-2 min-w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">{event.region || 'Event'}</h3>
        {quality && (
          <Badge variant="outline" style={{ backgroundColor: getQualityColor(quality.score.overall), color: 'white' }}>
            {quality.score.grade}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-medium">Magnitude:</span>
          <span className="font-bold">{event.magnitude.toFixed(1)} {event.magnitude_type || ''}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Ruler className="h-4 w-4 text-primary" />
          <span className="font-medium">Depth:</span>
          <span>{event.depth?.toFixed(1) || 'N/A'} km</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-medium">Time:</span>
          <span className="text-xs">{new Date(event.time).toLocaleString()}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-medium">Location:</span>
          <span className="text-xs">{event.latitude.toFixed(4)}°, {event.longitude.toFixed(4)}°</span>
        </div>

        {event.catalogue && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Source:</span> {event.catalogue}
            </div>
          </div>
        )}

        {event.azimuthal_gap !== null && event.azimuthal_gap !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-primary" />
            <span className="font-medium">Azimuthal Gap:</span>
            <span>{event.azimuthal_gap.toFixed(0)}°</span>
          </div>
        )}

        {event.used_station_count !== null && event.used_station_count !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 text-primary" />
            <span className="font-medium">Stations:</span>
            <span>{event.used_station_count}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Legend panel component
function LegendPanel({ colorMode, showFaults }: { colorMode: string; showFaults: boolean }) {
  return (
    <Card className="absolute bottom-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[220px]">
      <h4 className="font-semibold text-sm mb-3">
        {colorMode === 'quality' ? 'Quality Score' : colorMode === 'depth' ? 'Depth Scale' : 'Magnitude Scale'}
      </h4>
      
      {colorMode === 'quality' ? (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#22c55e' }}></div>
            <span>A+ / A (90-100)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#84cc16' }}></div>
            <span>B (80-89)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#eab308' }}></div>
            <span>C (70-79)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f97316' }}></div>
            <span>D (60-69)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444' }}></div>
            <span>F (&lt; 60)</span>
          </div>
        </div>
      ) : colorMode === 'depth' ? (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#000080' }}></div>
            <span>≥ 40 km (Deep)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#0000FF' }}></div>
            <span>30 - 39 km</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#4169E1' }}></div>
            <span>20 - 29 km</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#87CEEB' }}></div>
            <span>10 - 19 km</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#ADD8E6' }}></div>
            <span>&lt; 10 km (Shallow)</span>
          </div>
        </div>
      ) : (
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
      )}
      
      {showFaults && (
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
      )}
    </Card>
  );
}

