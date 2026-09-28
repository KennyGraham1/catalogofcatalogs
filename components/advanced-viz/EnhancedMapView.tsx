'use client';

import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { MapViewportObserver } from '@/components/map/MapViewportObserver';
import { MapDetailControl } from '@/components/map/MapDetailControl';
import type { MapDetail } from '@/lib/map-event-selection';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import { MapContainer, Popup, Polyline } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { DepthLegendItems, MagnitudeLegendItems, QualityLegendItems } from '@/components/map/MapLegend';
import { formatOriginTime } from '@/components/map/OptimizedEventPopup';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Activity, Ruler, Calendar, MapPin, Layers, Target, Radio, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { UncertaintyEllipse } from './UncertaintyEllipse';
import { BeachBallMarker } from './BeachBallMarker';
import { StationMarker } from './StationMarker';
import { useMapColors } from '@/hooks/use-map-theme';
import { calculateUncertaintyEllipse, UncertaintyData } from '@/lib/uncertainty-utils';
import { parseFocalMechanism } from '@/lib/focal-mechanism-utils';
import { calculateDistance } from '@/lib/station-coverage-utils';
import { calculateQualityScore, getQualityColor, metricsFromEvent } from '@/lib/quality-scoring';
import { getEarthquakeColor } from '@/lib/earthquake-utils';

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
  horizontal_uncertainty?: number | null;

  // Quality metrics
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  used_phase_count?: number | null;
  standard_error?: number | null;
  minimum_distance?: number | null;
  maximum_distance?: number | null;
  associated_phase_count?: number | null;
  associated_station_count?: number | null;
  depth_phase_count?: number | null;

  // Magnitude details
  magnitude_uncertainty?: number | null;
  magnitude_station_count?: number | null;
  magnitude_type?: string | null;
  magnitude_method_id?: string | null;
  magnitude_evaluation_mode?: string | null;
  magnitude_evaluation_status?: string | null;

  // Evaluation
  evaluation_mode?: string | null;
  evaluation_status?: string | null;

  // Origin metadata
  depth_type?: string | null;
  earth_model_id?: string | null;
  method_id?: string | null;

  // Agency/Author
  agency_id?: string | null;
  author?: string | null;

  // Complex data
  focal_mechanisms?: string | null;
  /** QuakeML preferredFocalMechanismID: which of focal_mechanisms is authoritative. */
  preferred_focal_mechanism_id?: string | null;
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
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');

  // Dark mode support for marker colors
  const mapColors = useMapColors();

  // Sample events for performance
  const { sampled: sampledEvents, displayCount, visibleCount, isSampled, onViewportChange, getPosition } = useMapEventSelection(events, sampleSize);

  const { activePopup, onEventClick } = useEventMapPopup(events);
  useEffect(() => setSelectedEvent(null), [events]);

  // Fix Leaflet icons
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // Calculate uncertainty ellipses (use sampled events)
  const uncertaintyEllipses = useMemo(() => {
    return sampledEvents.map(event => {
      const ellipse = calculateUncertaintyEllipse(event as UncertaintyData);
      return { eventId: event.id, ellipse: ellipse ? { ...ellipse, center: getPosition(event) } : null };
    }).filter(item => item.ellipse !== null);
  }, [sampledEvents, getPosition]);

  // Parse focal mechanisms (use sampled events)
  const focalMechanisms = useMemo(() => {
    return sampledEvents.map(event => ({
      eventId: event.id,
      position: getPosition(event),
      mechanism: parseFocalMechanism(event.focal_mechanisms, event.preferred_focal_mechanism_id)
    })).filter(item => item.mechanism !== null);
  }, [sampledEvents, getPosition]);

  // Calculate quality scores (use sampled events)
  const qualityScores = useMemo(() => {
    return sampledEvents.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(metricsFromEvent(event))
    }));
  }, [sampledEvents]);

  const qualityScoreMap = useMemo(() => new Map(qualityScores.map(q => [q.eventId, q.score])), [qualityScores]);

  // Get event color based on quality or depth
  const getEventColor = useCallback((event: EnhancedEvent) => {
    if (showQualityColors) {
      const quality = qualityScoreMap.get(event.id);
      return quality ? getQualityColor(quality.overall) : getEarthquakeColor(event.depth, mapColors.isDark);
    }
    return getEarthquakeColor(event.depth, mapColors.isDark);
  }, [showQualityColors, qualityScoreMap, mapColors.isDark]);

  // A click opens the popup and selects the event for the station distance lines
  const handleEventClick = useCallback((event: EnhancedEvent, position: [number, number]) => {
    setSelectedEvent(event);
    onEventClick(event, position);
  }, [onEventClick]);

  // Stations array - empty for now (would be fetched from database in production)
  const stations: any[] = [];

  return (
    <div className="relative">
      {/* Control Panel */}
      <Card className="absolute top-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[280px]">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Visualization Options
          </h3>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="uncertainty" className="text-sm cursor-pointer">
                Uncertainty Ellipses
              </Label>
              <TechnicalTermTooltip term="uncertainty" />
            </div>
            <Switch
              id="uncertainty"
              checked={showUncertainty}
              onCheckedChange={setShowUncertainty}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="focal" className="text-sm cursor-pointer">
                Focal Mechanisms
              </Label>
              <TechnicalTermTooltip term="focalMechanism" />
            </div>
            <Switch
              id="focal"
              checked={showFocalMechanisms}
              onCheckedChange={setShowFocalMechanisms}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="stations" className="text-sm cursor-pointer">
                Station Coverage
              </Label>
              <InfoTooltip content="Shows station markers and link lines for coverage context." />
            </div>
            <Switch
              id="stations"
              checked={showStations}
              onCheckedChange={setShowStations}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="quality" className="text-sm cursor-pointer">
                Quality Colors
              </Label>
              <TechnicalTermTooltip term="qualityScore" />
            </div>
            <Switch
              id="quality"
              checked={showQualityColors}
              onCheckedChange={setShowQualityColors}
            />
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

      {/* Map */}
      <div className="h-[700px] w-full rounded-lg overflow-hidden border">
        <MapContainer
          key="enhanced-map-view"
          center={center}
          zoom={zoom}
          className="h-full w-full"
          scrollWheelZoom={true}
          preferCanvas={true}
        >
          <MapLayerControl position="topright" />
          <MapViewportObserver onChange={onViewportChange} />

          {/* Earthquake markers - screen-pixel circles sized like the legend (larger
              events drawn on top), using intelligent sampling for performance */}
          <EarthquakeMarkerLayer events={sampledEvents} getColor={getEventColor} opacity={mapColors.markerOpacity} onEventClick={handleEventClick} />

          {activePopup && <Popup key={activePopup.seq} position={activePopup.position}>
            <EventPopup event={activePopup.event} qualityScores={qualityScores} />
          </Popup>}

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
      <Card className="absolute bottom-4 right-4 z-[1000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
        {/* Colour is quality or depth; size is always magnitude */}
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold">
            {showQualityColors ? 'Quality Score' : 'Depth (Color)'}
          </h4>
          {showQualityColors ? (
            <TechnicalTermTooltip term="qualityScore" />
          ) : (
            <TechnicalTermTooltip term="depth" />
          )}
        </div>
        {showQualityColors ? (
          <QualityLegendItems />
        ) : (
          <DepthLegendItems isDark={mapColors.isDark} />
        )}

        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold">Magnitude (Size)</h4>
            <TechnicalTermTooltip term="magnitude" />
          </div>
          <MagnitudeLegendItems />
        </div>
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
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Magnitude:</span>
            <TechnicalTermTooltip term="magnitude" />
          </div>
          <span>{event.magnitude.toFixed(1)} {event.magnitude_type || ''}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Ruler className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Depth:</span>
            <TechnicalTermTooltip term="depth" />
          </div>
          <span>{event.depth?.toFixed(1) || 'N/A'} km</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Time:</span>
            <InfoTooltip content="Event origin time in UTC, the reference frame catalogues report origin times in." />
          </div>
          <span className="text-xs">{formatOriginTime(event.time)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Location:</span>
            <InfoTooltip content="Epicenter coordinates in decimal degrees." />
          </div>
          <span className="text-xs">{event.latitude.toFixed(4)}°, {event.longitude.toFixed(4)}°</span>
        </div>

        {event.azimuthal_gap !== null && event.azimuthal_gap !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-primary" />
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Azimuthal Gap:</span>
              <TechnicalTermTooltip term="azimuthalGap" />
            </div>
            <span>{event.azimuthal_gap.toFixed(0)}°</span>
          </div>
        )}

        {event.used_station_count !== null && event.used_station_count !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 text-primary" />
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Stations:</span>
              <TechnicalTermTooltip term="stationCount" />
            </div>
            <span>{event.used_station_count}</span>
          </div>
        )}
      </div>
    </div>
  );
}
