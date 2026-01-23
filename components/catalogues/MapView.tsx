'use client';

import { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import L from 'leaflet';
import { MapContainer, GeoJSON, FeatureGroup, Circle, Popup, Marker } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { EditControl } from 'react-leaflet-draw';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Ruler, Activity, Zap, Layers, MapPin, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { useNearbyFaults } from '@/hooks/use-nearby-faults';
import { useMapColors } from '@/hooks/use-map-theme';
import { calculateQualityScore, QualityMetrics, getQualityColor } from '@/lib/quality-scoring';
import { getMagnitudeRadius, getMagnitudeColor, getEarthquakeColor, sampleEarthquakeEvents } from '@/lib/earthquake-utils';
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

// Memoized MapView component for better performance
export const MapView = memo(function MapView({ catalogueId, events: propEvents, onBoundsChange, onShapeDrawn }: MapViewProps) {
  const mapRef = useRef<L.Map>(null);
  const [showActiveFaults, setShowActiveFaults] = useState(true);
  const [colorMode, setColorMode] = useState<'magnitude' | 'depth' | 'quality'>('magnitude');
  const [faultData, setFaultData] = useState<FaultCollection | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(1000);

  // Dark mode support for marker colors
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

  // Sample events for performance
  const { sampled: sampledEvents, total, displayCount, isSampled } = useMemo(
    () => sampleEarthquakeEvents(events, sampleSize),
    [events, sampleSize]
  );

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

  // Calculate quality scores (memoized for performance, use sampled events)
  const qualityScores = useMemo(() => {
    return sampledEvents.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(event as QualityMetrics)
    }));
  }, [sampledEvents]);

  // Memoize quality score lookup map for O(1) access
  const qualityScoreMap = useMemo(() => {
    const map = new Map();
    qualityScores.forEach(qs => map.set(qs.eventId, qs.score));
    return map;
  }, [qualityScores]);

  // Memoize color functions for better performance
  const getDepthColor = useMemo(() => (depth: number): string => {
    if (depth >= 40) return '#000080'; // Navy
    if (depth >= 30) return '#0000FF'; // Blue
    if (depth >= 20) return '#4169E1'; // Royal blue
    if (depth >= 10) return '#87CEEB'; // Sky blue
    return '#ADD8E6'; // Light blue
  }, []);

  // Get event color based on selected mode (optimized with Map lookup)
  const getEventColor = useMemo(() => (event: any) => {
    if (colorMode === 'quality') {
      const quality = qualityScoreMap.get(event.id);
      return quality ? getQualityColor(quality.overall) : getEarthquakeColor(event.depth, mapColors.isDark);
    } else if (colorMode === 'depth') {
      return getEarthquakeColor(event.depth, mapColors.isDark);
    }
    return getMagnitudeColor(event.magnitude);
  }, [colorMode, qualityScoreMap, mapColors.isDark]);

  const getMagnitudeLabel = useMemo(() => (magnitude: number): string => {
    if (magnitude >= 6.0) return 'Major';
    if (magnitude >= 5.0) return 'Moderate';
    if (magnitude >= 4.0) return 'Light';
    if (magnitude >= 3.0) return 'Minor';
    return 'Micro';
  }, []);

  // Debounced bounds change handler for better performance
  useEffect(() => {
    if (mapRef.current && onBoundsChange) {
      const map = mapRef.current;
      let timeoutId: NodeJS.Timeout;

      const updateBounds = () => {
        // Debounce bounds updates to avoid excessive calls during panning/zooming
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          onBoundsChange(map.getBounds());
        }, 300); // 300ms debounce
      };

      map.on('moveend', updateBounds);
      return () => {
        clearTimeout(timeoutId);
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
      <Card className="absolute top-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[280px]">
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

          <div className="pt-2 border-t">
            <Label htmlFor="sampleSize" className="text-xs font-medium mb-2 block">
              Max Events to Display
            </Label>
            <Select value={sampleSize.toString()} onValueChange={(value) => setSampleSize(value === 'all' ? Infinity : Number(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[10000]">
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="2000">2,000</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
                <SelectItem value="Infinity">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Sampling Info Badge */}
      {isSampled && (
        <Card className="absolute top-4 left-4 z-[1000] p-3 bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-blue-500" />
            <span>
              Displaying <strong>{displayCount.toLocaleString()}</strong> of{' '}
              <strong>{total.toLocaleString()}</strong> events
            </span>
          </div>
        </Card>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-[1000]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-2"></div>
            <p>Loading events...</p>
          </div>
        </div>
      )}
      <MapContainer
        key={`map-view-${catalogueId || 'default'}`}
        center={[0, 0]}
        zoom={2}
        ref={mapRef}
        className="h-full w-full"
        preferCanvas={true}
      >
        <MapLayerControl position="topright" />

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

        {/* Earthquake markers - using intelligent sampling for performance */}
        {/* Sort by magnitude (small to large) so larger events render on top */}
        {[...sampledEvents].sort((a, b) => a.magnitude - b.magnitude).map((event) => {
          const eventDate = new Date(event.time).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
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
                weight: 1,
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
});

// Legend panel component (memoized)
const LegendPanel = memo(function LegendPanel({ colorMode, showFaults, faultCount }: { colorMode: string; showFaults: boolean; faultCount?: number }) {
  return (
    <Card className="absolute bottom-4 right-4 z-[1000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold">
          {colorMode === 'quality' ? 'Quality Score' : colorMode === 'depth' ? 'Depth Scale' : 'Magnitude Scale'}
        </h4>
        {colorMode === 'quality' ? (
          <TechnicalTermTooltip term="qualityScore" />
        ) : colorMode === 'depth' ? (
          <TechnicalTermTooltip term="depth" />
        ) : (
          <TechnicalTermTooltip term="magnitude" />
        )}
      </div>

      {colorMode === 'quality' ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#22c55e' }}></div>
            <span>A+ / A (90-100)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#84cc16' }}></div>
            <span>B (80-89)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#eab308' }}></div>
            <span>C (70-79)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#f97316' }}></div>
            <span>D (60-69)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#ef4444' }}></div>
            <span>F (&lt; 60)</span>
          </div>
        </div>
      ) : colorMode === 'depth' ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#00CED1' }}></div>
            <span>&lt; 15 km (Shallow)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#20B2AA' }}></div>
            <span>15 - 40 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#008B8B' }}></div>
            <span>40 - 100 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#006666' }}></div>
            <span>100 - 200 km (Deep)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#004D4D' }}></div>
            <span>≥ 200 km (V. Deep)</span>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M2</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M4</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M6</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M7+</span>
          </div>
        </div>
      )}

      {showFaults && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold">Fault Lines</h4>
            <InfoTooltip content="Active fault traces from the GNS Science dataset." />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-0.5 w-6 rounded-full bg-red-500"></div>
            <span>NZ Active Faults{faultCount ? ` (${faultCount.toLocaleString()})` : ''}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Data: GNS Science (CC-BY 3.0 NZ)
          </p>
        </div>
      )}
    </Card>
  );
});

// Event popup component with nearby faults (memoized)
const EventPopupWithFaults = memo(function EventPopupWithFaults({ event, qualityScores }: { event: any; qualityScores: any[] }) {
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
          <div className="flex items-center gap-1.5">
            <span className="font-medium">M {event.magnitude?.toFixed(1) || 'N/A'}</span>
            <TechnicalTermTooltip term="magnitude" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Ruler className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span>Depth: {event.depth?.toFixed(1) || 'N/A'} km</span>
            <TechnicalTermTooltip term="depth" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{new Date(event.time).toLocaleString('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}</span>
            <InfoTooltip content="Event origin time in local timezone." />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{event.latitude.toFixed(3)}°, {event.longitude.toFixed(3)}°</span>
            <InfoTooltip content="Epicenter coordinates in decimal degrees." />
          </div>
        </div>

        {quality && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Quality Score:</span>
                <TechnicalTermTooltip term="qualityScore" />
              </div>
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
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm">Nearby Faults ({faultCount})</span>
                <InfoTooltip content="Closest faults within 50 km of the epicenter." />
              </div>
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
});
