'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Circle, Popup, GeoJSON } from 'react-leaflet';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Ruler, Calendar, MapPin, Layers, Info } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapTheme, useMapColors } from '@/hooks/use-map-theme';
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

  // Dark mode support
  const mapTheme = useMapTheme();
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
            <Label htmlFor="faults" className="text-xs cursor-pointer">
              NZ Active Faults
            </Label>
            <Switch
              id="faults"
              checked={showFaults}
              onCheckedChange={setShowFaults}
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
            <Select value={sampleSize.toString()} onValueChange={(value) => setSampleSize(Number(value))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1,000</SelectItem>
                <SelectItem value="2000">2,000</SelectItem>
                <SelectItem value="5000">5,000</SelectItem>
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
          <TileLayer
            attribution={mapTheme.attribution}
            url={mapTheme.tileLayerUrl}
          />

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
            const eventDate = new Date(eq.time).toLocaleDateString();
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
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M2</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M4</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M6</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex-shrink-0"></div>
            <span>M7+</span>
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
          <span className="font-medium">M {eq.magnitude.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Ruler className="h-4 w-4 text-primary" />
          <span>Depth: {eq.depth} km</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs">{new Date(eq.time).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs">{eq.latitude.toFixed(4)}°, {eq.longitude.toFixed(4)}°</span>
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

        {eq.catalogue && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Source:</span> {eq.catalogue}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

