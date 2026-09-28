'use client';

import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { MapViewportObserver } from '@/components/map/MapViewportObserver';
import { MapDetailControl } from '@/components/map/MapDetailControl';
import type { MapDetail } from '@/lib/map-event-selection';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { DepthLegendItems, MagnitudeLegendItems } from '@/components/map/MapLegend';
import { formatOriginTime } from '@/components/map/OptimizedEventPopup';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';

import { useCallback, useEffect, useState } from 'react';
import { MapContainer, Popup } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Ruler, Calendar, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMagnitudeLabel, getEarthquakeColor } from '@/lib/earthquake-utils';
import { useMapColors } from '@/hooks/use-map-theme';

interface MergeMapEvent {
  id?: number | string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth?: number | null;
  time: string;
  region?: string;
  source?: string;
}

interface MapComponentProps {
  events: MergeMapEvent[];
}

function MergeEventPopupContent({ event }: { event: MergeMapEvent }) {
  return (
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
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Magnitude:</span>
            <TechnicalTermTooltip term="magnitude" />
          </div>
          <span>{event.magnitude.toFixed(1)}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Ruler className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Depth:</span>
            <TechnicalTermTooltip term="depth" />
          </div>
          <span>{event.depth != null ? `${event.depth} km` : 'Unknown'}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Time:</span>
            <InfoTooltip content="Event origin time in UTC, the reference frame catalogues report origin times in." />
          </div>
          <span className="text-xs">{formatOriginTime(event.time)}</span>
        </div>

        {event.source && (
          <div className="flex items-center gap-2 text-sm pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Source:</span>
              <InfoTooltip content="Catalogue or agency that reported the event." />
            </div>
            <span className="text-xs">{event.source}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Location:</span>
            <InfoTooltip content="Epicenter coordinates in decimal degrees." />
          </div>
          <span className="text-xs">
            {event.latitude.toFixed(4)}°, {event.longitude.toFixed(4)}°
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MapComponent({ events }: MapComponentProps) {
  const mapColors = useMapColors();
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');

  // Sample events for performance
  const { sampled: sampledEvents, total, displayCount, visibleCount, isSampled, onViewportChange } = useMapEventSelection(events, sampleSize);

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  // One popup, mounted only for the clicked event, as on the other live maps.
  const { activePopup, onEventClick } = useEventMapPopup(events);
  // An unknown depth keeps getEarthquakeColor's unknown-depth grey (keyed in the legend)
  // rather than being coerced to 0 km and drawn as a shallow event.
  const getEventColor = useCallback((event: MergeMapEvent) =>
    getEarthquakeColor(event.depth, mapColors.isDark), [mapColors.isDark]);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border relative">
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

      <MapContainer
        key="merge-map-component"
        center={[-41.0, 174.0]} // Center on New Zealand
        zoom={6}
        className="h-full w-full"
        scrollWheelZoom={true}
        preferCanvas={true}
      >
        <MapLayerControl position="topright" />
        <MapViewportObserver onChange={onViewportChange} />

        {/* Screen-pixel CircleMarkers sized by getMagnitudePixelRadius, larger events on top.
            The metre-radius Circles drawn here before changed size with every zoom, so no
            fixed legend swatch could match them. */}
        <EarthquakeMarkerLayer
          events={sampledEvents}
          getColor={getEventColor}
          opacity={mapColors.markerOpacity}
          onEventClick={onEventClick}
        />
        {activePopup && (
          <Popup key={activePopup.seq} position={activePopup.position}>
            <MergeEventPopupContent event={activePopup.event} />
          </Popup>
        )}
      </MapContainer>

      {/* Legend: built from the same colour and size functions as the markers */}
      <Card className="absolute bottom-4 right-4 z-[1000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold">Depth (Color)</h4>
          <TechnicalTermTooltip term="depth" />
        </div>
        <DepthLegendItems isDark={mapColors.isDark} />
        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold">Magnitude (Size)</h4>
            <TechnicalTermTooltip term="magnitude" />
          </div>
          <MagnitudeLegendItems />
        </div>
        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="text-[10px] text-muted-foreground">
            {total.toLocaleString()} total events
          </div>
          <div className="pt-2 border-t">
            <MapDetailControl value={sampleSize} onChange={setSampleSize} />
          </div>
        </div>
      </Card>
    </div>
  );
}
