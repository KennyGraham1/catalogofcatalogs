'use client';

import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { MapViewportObserver } from '@/components/map/MapViewportObserver';
import { MapDetailControl } from '@/components/map/MapDetailControl';
import type { MapDetail } from '@/lib/map-event-selection';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import { MapContainer, Popup, GeoJSON } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { DepthLegendItems, MagnitudeLegendItems, QualityLegendItems } from '@/components/map/MapLegend';
import { formatOriginTime } from '@/components/map/OptimizedEventPopup';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Activity, Ruler, Calendar, MapPin, Layers, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapColors } from '@/hooks/use-map-theme';
import { calculateQualityScore, getQualityColor, metricsFromEvent } from '@/lib/quality-scoring';
import { getEarthquakeColor, getMagnitudeColor, getMagnitudeLabel } from '@/lib/earthquake-utils';
import { loadFaultData, FaultCollection } from '@/lib/fault-data';
import type { PathOptions } from 'leaflet';

interface Earthquake {
  id: number;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number;
  time: string;
  region?: string;
  catalogue?: string;
}

interface NZEarthquakeMapProps {
  earthquakes: Earthquake[];
  colorBy?: 'magnitude' | 'depth' | 'quality';
}

export default function NZEarthquakeMap({ earthquakes, colorBy = 'magnitude' }: NZEarthquakeMapProps) {
  const [showFaults, setShowFaults] = useState(true);
  const [colorMode, setColorMode] = useState<'magnitude' | 'depth' | 'quality'>(colorBy);
  const [faultData, setFaultData] = useState<FaultCollection | null>(null);
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');

  // Dark mode support for marker colors
  const mapColors = useMapColors();

  // Sample earthquakes for performance
  const { sampled: sampledEarthquakes, displayCount, visibleCount, isSampled, onViewportChange } = useMapEventSelection(earthquakes, sampleSize);

  const { activePopup, onEventClick } = useEventMapPopup(earthquakes);

  // Load fault data
  useEffect(() => {
    if (showFaults) {
      loadFaultData().then(setFaultData);
    }
  }, [showFaults]);

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // Calculate quality scores (use sampled earthquakes)
  const qualityScores = useMemo(() => {
    return sampledEarthquakes.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(metricsFromEvent(event))
    }));
  }, [sampledEarthquakes]);

  const qualityScoreMap = useMemo(() => new Map(qualityScores.map(q => [q.eventId, q.score])), [qualityScores]);

  // Depth uses the shared palette (and legend) of the other maps, including grey for an
  // unknown depth, which the private blue ramp drew as its shallowest colour.
  const getEventColor = useCallback((eq: Earthquake): string => {
    if (colorMode === 'quality') {
      const quality = qualityScoreMap.get(eq.id);
      return quality ? getQualityColor(quality.overall) : getMagnitudeColor(eq.magnitude);
    } else if (colorMode === 'depth') {
      return getEarthquakeColor(eq.depth, mapColors.isDark);
    }
    return getMagnitudeColor(eq.magnitude);
  }, [colorMode, qualityScoreMap, mapColors.isDark]);

  return (
    <div className="relative">
      {/* Control Panel */}
      <Card className="absolute top-4 right-4 z-[1000] p-4 bg-background/95 backdrop-blur-sm shadow-lg max-w-[280px]">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Map Options
          </h3>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="faults" className="text-xs cursor-pointer">
                NZ Active Faults
              </Label>
              <InfoTooltip content="Overlay active fault traces to compare events with known structures." />
            </div>
            <Switch
              id="faults"
              checked={showFaults}
              onCheckedChange={setShowFaults}
            />
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center gap-1.5 mb-2">
              <Label className="text-xs font-medium">Color By</Label>
              <InfoTooltip content="Choose which attribute determines marker color." />
            </div>
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
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="color-magnitude" className="text-xs cursor-pointer">Magnitude</Label>
                  <TechnicalTermTooltip term="magnitude" />
                </div>
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
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="color-depth" className="text-xs cursor-pointer">Depth</Label>
                  <TechnicalTermTooltip term="depth" />
                </div>
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
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="color-quality" className="text-xs cursor-pointer">Quality</Label>
                  <TechnicalTermTooltip term="qualityScore" />
                </div>
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

      <div className="h-[600px] w-full rounded-lg overflow-hidden border">
        <MapContainer
          key="nz-earthquake-map"
          center={[-41.0, 174.0]} // Center on New Zealand
          zoom={6}
          className="h-full w-full"
          scrollWheelZoom={true}
          preferCanvas={true}
        >
          <MapLayerControl position="topright" />
          <MapViewportObserver onChange={onViewportChange} />

          {/* NZ Active Faults from Local GeoJSON */}
          {showFaults && faultData && (
            <GeoJSON
              data={faultData}
              style={(_feature) => {
                const pathOptions: PathOptions = {
                  color: '#ff0000',
                  weight: 2,
                  opacity: 0.6,
                };
                return pathOptions;
              }}
            />
          )}

          {/* Earthquake markers - screen-pixel circles sized like the legend, using
              intelligent sampling for performance */}
          <EarthquakeMarkerLayer events={sampledEarthquakes} getColor={getEventColor} opacity={mapColors.markerOpacity} onEventClick={onEventClick} />
          {activePopup && <Popup key={activePopup.seq} position={activePopup.position}>
            <EventPopup eq={activePopup.event} qualityScores={qualityScores}
              getMagnitudeLabel={getMagnitudeLabel} />
          </Popup>}
        </MapContainer>
      </div>

      {/* Legend */}
      <LegendPanel
        colorMode={colorMode}
        isDark={mapColors.isDark}
        showFaults={showFaults}
        faultCount={faultData?.features.length}
      />
    </div>
  );
}

// Legend panel component (swatches come from the functions that draw the markers)
function LegendPanel({ colorMode, isDark, showFaults, faultCount }: { colorMode: string; isDark: boolean; showFaults: boolean; faultCount?: number }) {
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
}

// Event popup component
function EventPopup({
  eq,
  qualityScores,
  getMagnitudeLabel
}: {
  eq: Earthquake;
  qualityScores: any[];
  getMagnitudeLabel: (mag: number) => string;
}) {
  const quality = qualityScores.find(q => q.eventId === eq.id);

  return (
    <div className="p-3 min-w-[280px] max-w-[320px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">{eq.region || 'Unknown Region'}</h3>
        <Badge variant={eq.magnitude >= 5.0 ? 'destructive' : 'default'}>
          {getMagnitudeLabel(eq.magnitude)}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">M {eq.magnitude.toFixed(1)}</span>
            <TechnicalTermTooltip term="magnitude" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Ruler className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span>Depth: {eq.depth} km</span>
            <TechnicalTermTooltip term="depth" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{formatOriginTime(eq.time)}</span>
            <InfoTooltip content="Event origin time in UTC, the reference frame catalogues report origin times in." />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{eq.latitude.toFixed(4)}°, {eq.longitude.toFixed(4)}°</span>
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

        {eq.catalogue && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Source:</span>
              <InfoTooltip content="Catalogue or agency that reported the event." />
              <span>{eq.catalogue}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
