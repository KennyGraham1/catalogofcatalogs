'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, FeatureGroup, Circle, Popup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, Ruler, Activity, Zap, Layers, MapPin } from 'lucide-react';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { useNearbyFaults } from '@/hooks/use-nearby-faults';
import { useMapTheme, useMapColors } from '@/hooks/use-map-theme';
import { calculateQualityScore, QualityMetrics, getQualityColor } from '@/lib/quality-scoring';
import { getMagnitudeRadius, getMagnitudeColor } from '@/lib/earthquake-utils';
import { loadFaultData, FaultCollection } from '@/lib/fault-data';
import type { PathOptions } from 'leaflet';
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
  const [showActiveFaults, setShowActiveFaults] = useState(true);
  const [colorMode, setColorMode] = useState<'magnitude' | 'depth' | 'quality'>('magnitude');
  const [faultData, setFaultData] = useState<FaultCollection | null>(null);

  // Dark mode support
  const mapTheme = useMapTheme();
  const mapColors = useMapColors();

  // Use cached fetch for events if catalogueId is provided
  const { data: eventsData, loading } = useCachedFetch<any[] | { data: any[] }>(
    catalogueId && !propEvents ? `/api/catalogues/${catalogueId}/events` : null,
    { cacheTime: 2 * 60 * 1000 } // 2 minutes
  );

  // Extract events array from response or use propEvents
  const events = useMemo(() => {
    if (propEvents) return propEvents;
    if (!eventsData) return [];
    if (Array.isArray(eventsData)) return eventsData;
    if ('data' in eventsData && Array.isArray(eventsData.data)) return eventsData.data;
    return [];
  }, [eventsData, propEvents]);

  // Load fault data
  useEffect(() => {
    if (showActiveFaults) {
      loadFaultData().then(setFaultData);
    }
  }, [showActiveFaults]);

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // Calculate quality scores
  const qualityScores = useMemo(() => {
    return events.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(event as QualityMetrics)
    }));
  }, [events]);

  const getDepthColor = (depth: number): string => {
    if (depth >= 40) return '#000080'; // Navy
    if (depth >= 30) return '#0000FF'; // Blue
    if (depth >= 20) return '#4169E1'; // Royal blue
    if (depth >= 10) return '#87CEEB'; // Sky blue
    return '#ADD8E6'; // Light blue
  };

  // Get event color based on selected mode
  const getEventColor = (event: any) => {
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
      {/* Control Panel */}
      <Card className="absolute top-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[240px]">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Map Options
          </h3>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="faults" className="text-xs cursor-pointer">
              NZ Active Faults
            </Label>
            <Switch
              id="faults"
              checked={showActiveFaults}
              onCheckedChange={setShowActiveFaults}
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
          attribution={mapTheme.attribution}
          url={mapTheme.tileLayerUrl}
        />

        {/* NZ Active Faults from Local GeoJSON */}
        {showActiveFaults && faultData && (
          <GeoJSON
            data={faultData}
            style={(feature) => {
              const pathOptions: PathOptions = {
                color: '#ff0000',
                weight: 2,
                opacity: 0.6,
              };
              return pathOptions;
            }}
          />
        )}

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
        </FeatureGroup>

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
            >
              <Popup>
                <EventPopupWithFaults event={event} qualityScores={qualityScores} />
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <LegendPanel
        colorMode={colorMode}
        showFaults={showActiveFaults}
        faultCount={faultData?.features.length}
      />
    </div>
  );
}

// Legend panel component
function LegendPanel({ colorMode, showFaults, faultCount }: { colorMode: string; showFaults: boolean; faultCount?: number }) {
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
              <div className="w-6 h-0.5 bg-red-500"></div>
              <span>NZ Active Faults{faultCount ? ` (${faultCount.toLocaleString()})` : ''}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Data: GNS Science (CC-BY 3.0 NZ)
          </p>
        </div>
      )}
    </Card>
  );
}

// Event popup component with nearby faults
function EventPopupWithFaults({ event, qualityScores }: { event: any; qualityScores: any[] }) {
  const quality = qualityScores.find(q => q.eventId === event.id);

  // Fetch nearby faults for this event
  const { faults, loading: faultsLoading, count: faultCount } = useNearbyFaults({
    latitude: event.latitude,
    longitude: event.longitude,
    radius: 50, // 50 km radius
    limit: 3, // Show top 3 nearest faults
    enabled: true,
  });

  const getMagnitudeLabel = (magnitude: number): string => {
    if (magnitude >= 6.0) return 'Major';
    if (magnitude >= 5.0) return 'Moderate';
    if (magnitude >= 4.0) return 'Light';
    if (magnitude >= 3.0) return 'Minor';
    return 'Micro';
  };

  const getQualityGrade = (score: number): string => {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  };

  return (
    <div className="p-3 min-w-[280px] max-w-[320px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">{event.region || 'Unknown Region'}</h3>
        <Badge variant={event.magnitude >= 5.0 ? 'destructive' : 'default'}>
          {getMagnitudeLabel(event.magnitude)}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-medium">M {event.magnitude?.toFixed(1) || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Ruler className="h-4 w-4 text-primary" />
          <span>Depth: {event.depth?.toFixed(1) || 'N/A'} km</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs">{new Date(event.time).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs">{event.latitude.toFixed(3)}°, {event.longitude.toFixed(3)}°</span>
        </div>

        {quality && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Quality Score:</span>
              <Badge
                variant="outline"
                style={{
                  backgroundColor: getQualityColor(quality.score.overall),
                  color: 'white',
                  borderColor: getQualityColor(quality.score.overall)
                }}
              >
                {getQualityGrade(quality.score.overall)} ({quality.score.overall.toFixed(0)})
              </Badge>
            </div>
          </div>
        )}

        {/* Nearby Faults Section */}
        {!faultsLoading && faultCount > 0 && (
          <div className="pt-2 border-t mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-orange-500" />
              <span className="font-medium text-sm">Nearby Faults ({faultCount})</span>
            </div>
            <div className="space-y-1.5">
              {faults.map((fault, idx) => (
                <div key={fault.id || idx} className="text-xs bg-muted/50 p-2 rounded">
                  <div className="font-medium text-foreground">{fault.name}</div>
                  <div className="text-muted-foreground">
                    {fault.distance.toFixed(1)} km away
                    {fault.slipType && ` • ${fault.slipType}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {faultsLoading && (
          <div className="pt-2 border-t mt-2">
            <div className="text-xs text-muted-foreground">Loading nearby faults...</div>
          </div>
        )}
      </div>
    </div>
  );
}