'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, Circle, Popup, GeoJSON } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Ruler, Calendar, MapPin, Layers, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapColors } from '@/hooks/use-map-theme';
import { calculateQualityScore, QualityMetrics, getQualityColor } from '@/lib/quality-scoring';
import { getMagnitudeRadius, getMagnitudeColor, sampleEarthquakeEvents } from '@/lib/earthquake-utils';
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
  const [sampleSize, setSampleSize] = useState<number>(1000);

  // Dark mode support for marker colors
  const mapColors = useMapColors();

  // Sample earthquakes for performance
  const { sampled: sampledEarthquakes, total, displayCount, isSampled } = useMemo(
    () => sampleEarthquakeEvents(earthquakes, sampleSize),
    [earthquakes, sampleSize]
  );

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
      score: calculateQualityScore(event as QualityMetrics)
    }));
  }, [sampledEarthquakes]);

  const getDepthColor = (depth: number): string => {
    if (depth >= 40) return '#000080'; // Navy
    if (depth >= 30) return '#0000FF'; // Blue
    if (depth >= 20) return '#4169E1'; // Royal blue
    if (depth >= 10) return '#87CEEB'; // Sky blue
    return '#ADD8E6'; // Light blue
  };

  const getEventColor = (eq: Earthquake): string => {
    if (colorMode === 'quality') {
      const quality = qualityScores.find(q => q.eventId === eq.id);
      return quality ? getQualityColor(quality.score.overall) : getMagnitudeColor(eq.magnitude);
    } else if (colorMode === 'depth') {
      return getDepthColor(eq.depth);
    }
    return getMagnitudeColor(eq.magnitude);
  };

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
            <div className="flex items-center gap-1.5 mb-2">
              <Label htmlFor="sampleSize" className="text-xs font-medium">
                Max Events to Display
              </Label>
              <InfoTooltip content="Limits rendered events for performance." />
            </div>
            <Select value={sampleSize.toString()} onValueChange={(value) => setSampleSize(value === 'all' ? Infinity : Number(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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

      <div className="h-[600px] w-full rounded-lg overflow-hidden border">
        <MapContainer
          key="nz-earthquake-map"
          center={[-41.0, 174.0]} // Center on New Zealand
          zoom={6}
          className="h-full w-full"
          scrollWheelZoom={true}
        >
          <MapLayerControl position="topright" />

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

          {/* Earthquake markers - using intelligent sampling for performance */}
          {sampledEarthquakes.map((eq) => {
            const eventDate = new Date(eq.time).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });
            const ariaLabel = `Magnitude ${eq.magnitude} earthquake at ${eq.latitude.toFixed(2)}, ${eq.longitude.toFixed(2)} on ${eventDate}`;

            return (
              <Circle
                key={eq.id}
                center={[eq.latitude, eq.longitude]}
                radius={getMagnitudeRadius(eq.magnitude)}
                pathOptions={{
                  color: getEventColor(eq),
                  fillColor: getEventColor(eq),
                  fillOpacity: mapColors.markerOpacity,
                  weight: 2,
                  // Add title for accessibility (shows on hover)
                  title: ariaLabel,
                } as any}
              >
                <Popup>
                  <EventPopup
                    eq={eq}
                    qualityScores={qualityScores}
                    getMagnitudeLabel={getMagnitudeLabel}
                    getQualityGrade={getQualityGrade}
                  />
                </Popup>
              </Circle>
            );
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <LegendPanel
        colorMode={colorMode}
        showFaults={showFaults}
        faultCount={faultData?.features.length}
      />
    </div>
  );
}

// Legend panel component
function LegendPanel({ colorMode, showFaults, faultCount }: { colorMode: string; showFaults: boolean; faultCount?: number }) {
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
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#000080' }}></div>
            <span>≥ 40 km (Deep)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#0000FF' }}></div>
            <span>30 - 39 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#4169E1' }}></div>
            <span>20 - 29 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#87CEEB' }}></div>
            <span>10 - 19 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10" style={{ backgroundColor: '#ADD8E6' }}></div>
            <span>&lt; 10 km (Shallow)</span>
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
}

// Event popup component
function EventPopup({
  eq,
  qualityScores,
  getMagnitudeLabel,
  getQualityGrade
}: {
  eq: Earthquake;
  qualityScores: any[];
  getMagnitudeLabel: (mag: number) => string;
  getQualityGrade: (score: number) => string;
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
            <span className="text-xs">{new Date(eq.time).toLocaleString('en-GB', {
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
                {getQualityGrade(quality.score.overall)} ({quality.score.overall.toFixed(0)})
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
