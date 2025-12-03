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
import { UncertaintyEllipse } from './UncertaintyEllipse';
import { BeachBallMarker } from './BeachBallMarker';
import { StationMarker } from './StationMarker';
import { useMapTheme, useMapColors } from '@/hooks/use-map-theme';
import { calculateUncertaintyEllipse, UncertaintyData } from '@/lib/uncertainty-utils';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { calculateDistance } from '@/lib/station-coverage-utils';
import { calculateQualityScore, QualityMetrics, getQualityColor } from '@/lib/quality-scoring';
import { getMagnitudeColor, getMagnitudeRadius } from '@/lib/earthquake-utils';

interface EnhancedEvent {
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

interface EnhancedMapViewProps {
  events: EnhancedEvent[];
  center?: [number, number];
  zoom?: number;
}

export function EnhancedMapView({
  events,
  center = [-41.0, 174.0],
  zoom = 6
}: EnhancedMapViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<EnhancedEvent | null>(null);
  const [showUncertainty, setShowUncertainty] = useState(true);
  const [showFocalMechanisms, setShowFocalMechanisms] = useState(true);
  const [showStations, setShowStations] = useState(false);
  const [showQualityColors, setShowQualityColors] = useState(false);

  // Dark mode support
  const mapTheme = useMapTheme();
  const mapColors = useMapColors();

  // Fix Leaflet icons
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // Calculate uncertainty ellipses
  const uncertaintyEllipses = useMemo(() => {
    return events.map(event => ({
      eventId: event.id,
      ellipse: calculateUncertaintyEllipse(event as UncertaintyData)
    })).filter(item => item.ellipse !== null);
  }, [events]);

  // Parse focal mechanisms
  const focalMechanisms = useMemo(() => {
    return events.map(event => ({
      eventId: event.id,
      position: [event.latitude, event.longitude] as [number, number],
      mechanism: parseFocalMechanism(event.focal_mechanisms)
    })).filter(item => item.mechanism !== null);
  }, [events]);

  // Calculate quality scores
  const qualityScores = useMemo(() => {
    return events.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(event as QualityMetrics)
    }));
  }, [events]);

  // Get event color based on quality or magnitude
  const getEventColor = (event: EnhancedEvent) => {
    if (showQualityColors) {
      const quality = qualityScores.find(q => q.eventId === event.id);
      return quality ? getQualityColor(quality.score.overall) : getMagnitudeColor(event.magnitude);
    }
    return getMagnitudeColor(event.magnitude);
  };

  // Stations array - empty for now (would be fetched from database in production)
  const stations: any[] = [];

  return (
    <div className="relative">
      {/* Control Panel */}
      <Card className="absolute top-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Visualization Options
          </h3>
          
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="uncertainty" className="text-sm cursor-pointer">
              Uncertainty Ellipses
            </Label>
            <Switch
              id="uncertainty"
              checked={showUncertainty}
              onCheckedChange={setShowUncertainty}
            />
          </div>
          
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="focal" className="text-sm cursor-pointer">
              Focal Mechanisms
            </Label>
            <Switch
              id="focal"
              checked={showFocalMechanisms}
              onCheckedChange={setShowFocalMechanisms}
            />
          </div>
          
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="stations" className="text-sm cursor-pointer">
              Station Coverage
            </Label>
            <Switch
              id="stations"
              checked={showStations}
              onCheckedChange={setShowStations}
            />
          </div>
          
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="quality" className="text-sm cursor-pointer">
              Quality Colors
            </Label>
            <Switch
              id="quality"
              checked={showQualityColors}
              onCheckedChange={setShowQualityColors}
            />
          </div>
        </div>
      </Card>

      {/* Map */}
      <div className="h-[700px] w-full rounded-lg overflow-hidden border">
        <MapContainer
          center={center}
          zoom={zoom}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution={mapTheme.attribution}
            url={mapTheme.tileLayerUrl}
          />

          {/* Earthquake markers - No clustering */}
          {events.map((event) => {
            const eventDate = new Date(event.time).toLocaleDateString();
            const ariaLabel = `Magnitude ${event.magnitude} earthquake at ${event.latitude.toFixed(2)}, ${event.longitude.toFixed(2)} on ${eventDate}`;

            return (
              <Circle
                key={event.id}
                center={[event.latitude, event.longitude]}
                radius={getMagnitudeRadius(event.magnitude)}
                pathOptions={{
                  color: getEventColor(event),
                  fillColor: getEventColor(event),
                  fillOpacity: mapColors.markerOpacity,
                  weight: 2,
                  // Add title for accessibility (shows on hover)
                  title: ariaLabel,
                } as any}
                eventHandlers={{
                  click: () => setSelectedEvent(event),
                }}
              >
                <Popup>
                  <EventPopup event={event} qualityScores={qualityScores} />
                </Popup>
              </Circle>
            );
          })}

          {/* Uncertainty ellipses */}
          {showUncertainty && uncertaintyEllipses.map(({ eventId, ellipse }) => (
            ellipse && <UncertaintyEllipse key={`uncertainty-${eventId}`} ellipse={ellipse} eventId={eventId} />
          ))}

          {/* Focal mechanisms */}
          {showFocalMechanisms && focalMechanisms.map(({ eventId, position, mechanism }) => (
            mechanism && (
              <BeachBallMarker
                key={`focal-${eventId}`}
                position={position}
                mechanism={mechanism}
                eventId={eventId}
                size={30}
                onClick={() => {
                  const event = events.find(e => e.id === eventId);
                  if (event) setSelectedEvent(event);
                }}
              />
            )
          ))}

          {/* Station markers - Triangular markers to distinguish from circular earthquake markers */}
          {showStations && (
            <>
              {stations.map((station) => {
                // If an event is selected, calculate distance
                let distance: number | null = null;

                if (selectedEvent) {
                  distance = calculateDistance(
                    selectedEvent.latitude,
                    selectedEvent.longitude,
                    station.latitude,
                    station.longitude
                  );
                }

                return (
                  <StationMarker
                    key={`station-${station.code}`}
                    position={[station.latitude, station.longitude]}
                    stationCode={station.code}
                    stationNetwork={station.network}
                    stationName={station.name}
                    distance={distance}
                  />
                );
              })}

              {/* Lines from selected event to nearby stations */}
              {selectedEvent && stations.map((station) => {
                const distance = calculateDistance(
                  selectedEvent.latitude,
                  selectedEvent.longitude,
                  station.latitude,
                  station.longitude
                );

                // Only show connection lines for stations within 500km
                if (distance > 500) return null;

                return (
                  <Polyline
                    key={`line-${station.code}`}
                    positions={[
                      [selectedEvent.latitude, selectedEvent.longitude],
                      [station.latitude, station.longitude]
                    ]}
                    pathOptions={{
                      color: '#3b82f6',
                      weight: 1,
                      opacity: 0.3,
                      dashArray: '5, 5',
                    }}
                  />
                );
              })}
            </>
          )}
        </MapContainer>
      </div>

      {/* Legend */}
      <Card className="absolute bottom-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg">
        <h4 className="font-semibold text-sm mb-2">
          {showQualityColors ? 'Quality Score' : 'Magnitude Scale'}
        </h4>
        {showQualityColors ? (
          <div className="space-y-1 text-xs">
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
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">Circle size represents magnitude</p>
            <div className="flex items-center justify-center gap-1 py-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
              <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
              <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0"></div>
              <div className="w-5 h-5 rounded-full bg-blue-500 flex-shrink-0"></div>
              <div className="w-6 h-6 rounded-full bg-blue-500 flex-shrink-0"></div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// Event popup component
function EventPopup({ event, qualityScores }: { event: EnhancedEvent; qualityScores: any[] }) {
  const quality = qualityScores.find(q => q.eventId === event.id);
  
  return (
    <div className="p-2 min-w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">{event.region || 'Event'}</h3>
        {quality && (
          <Badge variant="outline" style={{ backgroundColor: getQualityColor(quality.score.overall), color: 'white' }}>
            Quality: {quality.score.grade}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-medium">Magnitude:</span>
          <span>{event.magnitude.toFixed(1)} {event.magnitude_type || ''}</span>
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

