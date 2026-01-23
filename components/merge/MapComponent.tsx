'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Circle, Popup } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Ruler, Calendar, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMagnitudeColor, getMagnitudeRadius, getMagnitudeLabel, getEarthquakeColor, sampleEarthquakeEvents } from '@/lib/earthquake-utils';
import { useMapColors } from '@/hooks/use-map-theme';

interface MapComponentProps {
  events: Array<{
    id?: number;
    latitude: number;
    longitude: number;
    magnitude: number;
    depth?: number;
    time: string;
    region?: string;
    source?: string;
  }>;
}

export default function MapComponent({ events }: MapComponentProps) {
  const mapColors = useMapColors();
  const [sampleSize, setSampleSize] = useState<number>(1000);

  // Sample events for performance
  const { sampled: sampledEvents, total, displayCount, isSampled } = useMemo(
    () => sampleEarthquakeEvents(events, sampleSize),
    [events, sampleSize]
  );

  // Fix for Leaflet icons in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
  }, []);

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border relative">
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

      <MapContainer
        key="merge-map-component"
        center={[-41.0, 174.0]} // Center on New Zealand
        zoom={6}
        className="h-full w-full"
        scrollWheelZoom={true}
        preferCanvas={true}
      >
        <MapLayerControl position="topright" />

        {/* Earthquake markers - using intelligent sampling for performance */}
        {/* Sort by magnitude (small to large) so larger events render on top */}
        {[...sampledEvents].sort((a, b) => a.magnitude - b.magnitude).map((event, index) => {
          const eventDate = new Date(event.time).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
          const ariaLabel = `Magnitude ${event.magnitude} earthquake at ${event.latitude.toFixed(2)}, ${event.longitude.toFixed(2)} on ${eventDate}`;

          return (
            <Circle
              key={event.id || index}
              center={[event.latitude, event.longitude]}
              radius={getMagnitudeRadius(event.magnitude)}
              pathOptions={{
                color: getEarthquakeColor(event.depth || 0, mapColors.isDark),
                fillColor: getEarthquakeColor(event.depth || 0, mapColors.isDark),
                fillOpacity: mapColors.markerOpacity,
                weight: 1,
                // Add title for accessibility (shows on hover)
                title: ariaLabel,
              } as any}
            >
              <Popup>
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

                    {event.depth !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <Ruler className="h-4 w-4 text-primary" />
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">Depth:</span>
                          <TechnicalTermTooltip term="depth" />
                        </div>
                        <span>{event.depth} km</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-primary" />
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">Time:</span>
                        <InfoTooltip content="Event origin time in local timezone." />
                      </div>
                      <span className="text-xs">{event.time}</span>
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
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <Card className="absolute bottom-4 right-4 z-[1000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold">Magnitude Scale</h4>
          <TechnicalTermTooltip term="magnitude" />
        </div>
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
        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="text-[10px] text-muted-foreground">
            {total.toLocaleString()} total events
          </div>
          <div className="mt-2">
            <Label htmlFor="sampleSize-merge" className="text-[11px] font-medium mb-1 block">
              Max Events
            </Label>
            <Select value={sampleSize.toString()} onValueChange={(value) => setSampleSize(value === 'all' ? Infinity : Number(value))}>
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
        </div>
      </Card>
    </div>
  );
}
