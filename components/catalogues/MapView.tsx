'use client';

import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { MapViewportObserver } from '@/components/map/MapViewportObserver';
import { MapDetailControl } from '@/components/map/MapDetailControl';
import type { MapDetail } from '@/lib/map-event-selection';

import { useEffect, useState, useMemo, memo } from 'react';
import type { CircleMapEvent } from '@/components/map/EarthquakeCircleMap';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import L from 'leaflet';
import { MapContainer, GeoJSON, FeatureGroup, Popup, useMap } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { DepthLegendItems, MagnitudeLegendItems, QualityLegendItems } from '@/components/map/MapLegend';
import { formatOriginTime } from '@/components/map/OptimizedEventPopup';
import { EditControl } from 'react-leaflet-draw';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar, Ruler, Activity, Zap, Layers, MapPin, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { useCatalogueEvents } from '@/hooks/use-catalogue-events';
import { useNearbyFaults } from '@/hooks/use-nearby-faults';
import { useMapColors } from '@/hooks/use-map-theme';
import { calculateQualityScore, getQualityColor, metricsFromEvent } from '@/lib/quality-scoring';
import { getMagnitudeColor, getEarthquakeColor, getMagnitudeLabel } from '@/lib/earthquake-utils';
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

// Subscribe inside the map context: MapContainer's forwarded ref is still null
// during the parent's initial effect, so an outer ref-based subscription is lost.
export function MapBoundsObserver({ onBoundsChange }: Pick<MapViewProps, 'onBoundsChange'>) {
  const map = useMap();
  useEffect(() => {
    if (!onBoundsChange) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onBoundsChange(map.getBounds()), 300);
    };
    onBoundsChange(map.getBounds());
    map.on('moveend', update);
    return () => { clearTimeout(timer); map.off('moveend', update); };
  }, [map, onBoundsChange]);
  return null;
}

// Memoized MapView component for better performance
export const MapView = memo(function MapView({ catalogueId, events: propEvents, onBoundsChange, onShapeDrawn }: MapViewProps) {
  const [showActiveFaults, setShowActiveFaults] = useState(true);
  const [colorMode, setColorMode] = useState<'magnitude' | 'depth' | 'quality'>('magnitude');
  const [faultData, setFaultData] = useState<FaultCollection | null>(null);
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');

  // Dark mode support for marker colors
  const mapColors = useMapColors();

  const sourceCatalogues = useMemo(() => catalogueId && !propEvents
    ? [{ id: catalogueId, name: 'Catalogue' }] : [], [catalogueId, propEvents]);
  const { events: loadedEvents, loading, complete, loadedCount, error, retry: reload } = useCatalogueEvents(sourceCatalogues, catalogueId || '');
  const events: CircleMapEvent[] = propEvents ?? loadedEvents;

  // Sample events for performance
  const { sampled: sampledEvents, displayCount, visibleCount, isSampled, onViewportChange } = useMapEventSelection(events, sampleSize);

  const { activePopup, onEventClick } = useEventMapPopup(events);

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
    if (colorMode !== 'quality') return [];
    return sampledEvents.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(metricsFromEvent(event))
    }));
  }, [sampledEvents, colorMode]);

  // Memoize quality score lookup map for O(1) access
  const qualityScoreMap = useMemo(() => {
    const map = new Map();
    qualityScores.forEach(qs => map.set(qs.eventId, qs.score));
    return map;
  }, [qualityScores]);

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

  const handleShapeCreated = (e: any) => {
    if (onShapeDrawn) {
      onShapeDrawn(e.layer.toGeoJSON());
    }
  };

  return (
    <div className="h-[calc(100vh-12rem)] w-full relative">
      {!propEvents && !complete && (loading || error) && <Card className="absolute bottom-4 left-4 z-[1000] p-3" role={error ? 'alert' : 'status'}>
        <p className="text-sm">{error || `Preview · ${loadedCount.toLocaleString()} events received. Loading...`}</p>
        {error && <button className="underline" onClick={reload}>Retry loading events</button>}
      </Card>}
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
            <MapDetailControl value={sampleSize} onChange={setSampleSize} />
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
              <strong>{visibleCount.toLocaleString()}</strong> visible events. Zoom in for more.
            </span>
          </div>
        </Card>
      )}

      {loading && events.length === 0 && (
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
        className="h-full w-full"
        preferCanvas={true}
      >
        <MapLayerControl position="topright" />
        <MapViewportObserver onChange={onViewportChange} />
        <MapBoundsObserver onBoundsChange={onBoundsChange} />

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

        <EarthquakeMarkerLayer events={sampledEvents} getColor={getEventColor} opacity={mapColors.markerOpacity} onEventClick={onEventClick} />

        {/* One popup, rendered only for the clicked event, so the nearby-faults fetch
            in EventPopupWithFaults fires once per click instead of once per plotted
            marker. Keyed by click sequence so re-clicking a marker reopens it. */}
        {activePopup && (
          <Popup
            key={activePopup.seq}
            position={activePopup.position}
          >
            <EventPopupWithFaults event={activePopup.event} qualityScores={qualityScores} />
          </Popup>
        )}
      </MapContainer>

      {/* Legend */}
      <LegendPanel
        colorMode={colorMode}
        isDark={mapColors.isDark}
        showFaults={showActiveFaults}
        faultCount={faultData?.features.length}
      />
    </div>
  );
});

// Legend panel component (memoized; swatches come from the functions that draw the markers)
const LegendPanel = memo(function LegendPanel({ colorMode, isDark, showFaults, faultCount }: { colorMode: string; isDark: boolean; showFaults: boolean; faultCount?: number }) {
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
        <QualityLegendItems />
      ) : colorMode === 'depth' ? (
        <DepthLegendItems isDark={isDark} />
      ) : (
        <MagnitudeLegendItems getColor={getMagnitudeColor} />
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
  const quality = useMemo(() => qualityScores.find(q => q.eventId === event.id) ?? {
    eventId: event.id, score: calculateQualityScore(metricsFromEvent(event)),
  }, [event, qualityScores]);

  // Fetch nearby faults for this event
  const { faults, loading: faultsLoading, count: faultCount } = useNearbyFaults({
    latitude: event.latitude,
    longitude: event.longitude,
    radius: 50, // 50 km radius
    limit: 3, // Show top 3 nearest faults
    enabled: true,
  });

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
            <span className="text-xs">{formatOriginTime(event.time)}</span>
            <InfoTooltip content="Event origin time in UTC, the reference frame catalogues report origin times in." />
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
                {quality.score.grade} ({quality.score.overall.toFixed(0)})
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
