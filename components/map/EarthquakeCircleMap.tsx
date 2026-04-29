'use client';

import { useEffect, useMemo, memo } from 'react';
import L from 'leaflet';
import { MapContainer, Circle, Popup } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Calendar, Ruler, MapPin, Info } from 'lucide-react';
import { TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { getMagnitudeRadius, getEarthquakeColor, sampleEarthquakeEvents } from '@/lib/earthquake-utils';
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
  sampleSize: number;
  onSampleSizeChange: (size: number) => void;
  center?: [number, number];
  zoom?: number;
  height?: string;
  mapKey?: string;
}

function getMagnitudeLabel(magnitude: number): string {
  if (magnitude >= 6.0) return 'Major';
  if (magnitude >= 5.0) return 'Moderate';
  if (magnitude >= 4.0) return 'Light';
  if (magnitude >= 3.0) return 'Minor';
  return 'Micro';
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

  const { sampled: sampledEvents, total, displayCount, isSampled } = useMemo(
    () => sampleEarthquakeEvents(events, sampleSize),
    [events, sampleSize]
  );

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  const eventMarkers = useMemo(() => {
    return [...sampledEvents].sort((a, b) => a.magnitude - b.magnitude).map((event) => (
      <Circle
        key={event.id}
        center={[event.latitude, event.longitude]}
        radius={getMagnitudeRadius(event.magnitude)}
        pathOptions={{
          fillColor: getEarthquakeColor(event.depth ?? 0, mapColors.isDark),
          fillOpacity: mapColors.markerOpacity,
          color: getEarthquakeColor(event.depth ?? 0, mapColors.isDark),
          weight: 1,
        }}
      >
        <Popup>
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
                <span>{new Date(event.time).toLocaleString('en-GB', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}</span>
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
        </Popup>
      </Circle>
    ));
  }, [sampledEvents, mapColors]);

  return (
    <div className="relative" style={{ height }}>
      {/* Sampling badge */}
      {isSampled && (
        <Card className="absolute top-4 left-4 z-[2000] p-3 bg-background/95 backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-blue-500" />
            <span>
              Displaying <strong>{displayCount.toLocaleString()}</strong> of{' '}
              <strong>{total.toLocaleString()}</strong> events
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
        {eventMarkers}
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 right-4 z-[2000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold">Depth (Color)</h4>
          <TechnicalTermTooltip term="depth" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {[
            { color: '#06B6D4', label: '<15 km (Shallow)' },
            { color: '#14B8A6', label: '15–40 km' },
            { color: '#0D9488', label: '40–100 km' },
            { color: '#0F766E', label: '100–200 km' },
            { color: '#115E59', label: '>200 km (Deep)' },
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
          <Label htmlFor="sampleSize-circlemap" className="text-[11px] font-medium mb-1 block">
            Max Events
          </Label>
          <Select
            value={sampleSize === Infinity ? 'Infinity' : sampleSize.toString()}
            onValueChange={(v) => onSampleSizeChange(v === 'Infinity' ? Infinity : Number(v))}
          >
            <SelectTrigger className="w-full h-7 text-[11px]">
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
      </Card>
    </div>
  );
});
