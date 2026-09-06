'use client';

import { useEffect, useCallback, memo } from 'react';
import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { MapViewportObserver } from './MapViewportObserver';
import { MapDetailControl } from './MapDetailControl';
import type { MapDetail } from '@/lib/map-event-selection';
import { EarthquakeMarkerLayer } from './EarthquakeMarkerLayer';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import L from 'leaflet';
import { MapContainer, Popup } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Calendar, Ruler, MapPin, Info } from 'lucide-react';
import { TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { getEarthquakeColor } from '@/lib/earthquake-utils';
import { useMapColors } from '@/hooks/use-map-theme';
import 'leaflet/dist/leaflet.css';

export interface CircleMapEvent {
  id: string | number;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number | null;
  time: string;
  magnitude_type?: string | null;
  event_type?: string | null;
  region?: string | null;
}

interface EarthquakeCircleMapProps {
  events: CircleMapEvent[];
  sampleSize: MapDetail;
  onSampleSizeChange: (size: MapDetail) => void;
  center?: [number, number];
  zoom?: number;
  height?: string;
  mapKey?: string;
}

/**
 * Origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z"), so they are rendered
 * in UTC with the zone shown - formatting them in the browser's zone puts an event on the
 * wrong calendar day for 13 of every 24 hours under NZDT (UTC+13).
 *
 * Hoisted to module scope on purpose: popups are rebuilt per event over thousands of
 * events, and constructing an Intl.DateTimeFormat per render costs ~82 ms per 1000 rows.
 */
const UTC_SECOND_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

/** Render an ISO origin time in UTC; unparseable values are shown verbatim. */
function formatOriginTime(time: string): string {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time;
  return UTC_SECOND_FORMAT.format(date);
}

function getMagnitudeLabel(magnitude: number): string {
  if (magnitude >= 6.0) return 'Major';
  if (magnitude >= 5.0) return 'Moderate';
  if (magnitude >= 4.0) return 'Light';
  if (magnitude >= 3.0) return 'Minor';
  return 'Micro';
}

function EventPopupContent({ event }: { event: CircleMapEvent }) {
  return (
    <div className="p-2 min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className="text-xs">
          {getMagnitudeLabel(event.magnitude)}
        </Badge>
        <span className="text-sm font-semibold">M {event.magnitude.toFixed(1)}</span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span>{formatOriginTime(event.time)}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-3 w-3 text-muted-foreground" />
          <span>{event.latitude.toFixed(3)}°, {event.longitude.toFixed(3)}°</span>
        </div>
        {event.depth != null && (
          <div className="flex items-center gap-2">
            <Ruler className="h-3 w-3 text-muted-foreground" />
            <span>{event.depth.toFixed(1)} km depth</span>
          </div>
        )}
        {event.magnitude_type && (
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 text-muted-foreground" />
            <span>Type: {event.magnitude_type}</span>
          </div>
        )}
        {event.region && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <span className="truncate max-w-[160px]">{event.region}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const EarthquakeCircleMap = memo(function EarthquakeCircleMap({
  events,
  sampleSize,
  onSampleSizeChange,
  center = [-41.0, 174.0],
  zoom = 5,
  height = '600px',
  mapKey = 'earthquake-circle-map',
}: EarthquakeCircleMapProps) {
  const mapColors = useMapColors();

  const { sampled: sampledEvents, total, displayCount, visibleCount, isSampled, onViewportChange } = useMapEventSelection(events, sampleSize);

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  const { activePopup, onEventClick } = useEventMapPopup(events, mapKey);
  const getEventColor = useCallback((event: CircleMapEvent) =>
    getEarthquakeColor(event.depth, mapColors.isDark), [mapColors.isDark]);

  return (
    <div className="relative" style={{ height }}>
      {/* Sampling badge */}
      {isSampled && (
        <Card className="absolute top-20 left-4 z-[2000] p-3 bg-background/95 backdrop-blur-sm shadow-lg">
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
        key={mapKey}
        center={center}
        zoom={zoom}
        className="h-full w-full"
        minZoom={2}
        maxZoom={18}
        preferCanvas={true}
      >
        <MapLayerControl position="topright" />
        <MapViewportObserver onChange={onViewportChange} />
        <EarthquakeMarkerLayer events={sampledEvents} getColor={getEventColor} opacity={mapColors.markerOpacity} onEventClick={onEventClick} />
        {activePopup && (
          <Popup
            key={activePopup.seq}
            position={activePopup.position}
          >
            <EventPopupContent event={activePopup.event} />
          </Popup>
        )}
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 right-4 z-[2000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold">Depth (Color)</h4>
          <TechnicalTermTooltip term="depth" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {[
            { color: getEarthquakeColor(0, mapColors.isDark), label: '<15 km (Shallow)' },
            { color: getEarthquakeColor(15, mapColors.isDark), label: '15–40 km' },
            { color: getEarthquakeColor(40, mapColors.isDark), label: '40–100 km' },
            { color: getEarthquakeColor(100, mapColors.isDark), label: '100–200 km' },
            { color: getEarthquakeColor(200, mapColors.isDark), label: '≥200 km (Deep)' },
            { color: getEarthquakeColor(null, mapColors.isDark), label: 'Unknown depth' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold">Magnitude (Size)</h4>
            <TechnicalTermTooltip term="magnitude" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {[
              { size: 'h-2 w-2', label: 'M2' },
              { size: 'h-3 w-3', label: 'M4' },
              { size: 'h-4 w-4', label: 'M6' },
              { size: 'h-5 w-5', label: 'M7+' },
            ].map(({ size, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`${size} flex-shrink-0 rounded-full`} style={{ backgroundColor: '#0D9488' }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[10px] text-muted-foreground mb-2">{total.toLocaleString()} total events</p>
          <MapDetailControl value={sampleSize} onChange={onSampleSizeChange} />
        </div>
      </Card>
    </div>
  );
});
