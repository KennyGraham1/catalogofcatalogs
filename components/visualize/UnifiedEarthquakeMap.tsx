'use client';

import { useState, useEffect, useMemo } from 'react';
import { MapContainer, Circle, Popup, GeoJSON } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Ruler, Calendar, MapPin, Layers, Target, Radio, Zap, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useMapColors } from '@/hooks/use-map-theme';
import { calculateQualityScore, QualityMetrics, getQualityColor } from '@/lib/quality-scoring';
import { getMagnitudeRadius, getMagnitudeColor, getEarthquakeColor, sampleEarthquakeEvents } from '@/lib/earthquake-utils';
import { useNearbyFaults } from '@/hooks/use-nearby-faults';
import { loadFaultData, getFaultsInBounds, simplifyFaultsForZoom, FaultCollection, FaultFeature } from '@/lib/fault-data';
import type { PathOptions } from 'leaflet';

interface Earthquake {
  id: number | string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depth: number;
  time: string;
  region?: string;
  catalogue?: string;

  // Quality metrics
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  used_phase_count?: number | null;
  standard_error?: number | null;
  magnitude_uncertainty?: number | null;
  magnitude_station_count?: number | null;
  magnitude_type?: string | null;
  evaluation_mode?: string | null;
  evaluation_status?: string | null;
  focal_mechanisms?: string | null;
  picks?: string | null;
  arrivals?: string | null;

  // Extended QuakeML 1.2 fields (GeoNet/ISC)
  horizontal_uncertainty?: number | null;
  depth_type?: string | null;
  earth_model_id?: string | null;
  method_id?: string | null;
  agency_id?: string | null;
  author?: string | null;
  minimum_distance?: number | null;
  maximum_distance?: number | null;
  associated_phase_count?: number | null;
  associated_station_count?: number | null;
  depth_phase_count?: number | null;
  magnitude_method_id?: string | null;
  magnitude_evaluation_mode?: string | null;
  magnitude_evaluation_status?: string | null;
}

interface UnifiedEarthquakeMapProps {
  earthquakes: Earthquake[];
  colorBy?: 'magnitude' | 'depth' | 'quality';
  showFocalMechanisms?: boolean;
  showStations?: boolean;
  showFaultLines?: boolean;
  showActiveFaults?: boolean;
}



export default function UnifiedEarthquakeMap({
  earthquakes,
  colorBy = 'magnitude',
  showFocalMechanisms = false,
  showStations = false,
  showFaultLines = true,
  showActiveFaults = true
}: UnifiedEarthquakeMapProps) {
  const [selectedEvent, setSelectedEvent] = useState<Earthquake | null>(null);
  const [showFaults, setShowFaults] = useState(showFaultLines);
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

  // Update color mode when colorBy prop changes
  useEffect(() => {
    setColorMode(colorBy);
  }, [colorBy]);

  // Load fault data
  useEffect(() => {
    if (showFaults) {
      loadFaultData().then(setFaultData);
    }
  }, [showFaults]);

  // Fix Leaflet icons
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    });
  }, []);

  // Calculate quality scores (use sampled earthquakes)
  const qualityScores = useMemo(() => {
    return sampledEarthquakes.map(event => ({
      eventId: event.id,
      score: calculateQualityScore(event as QualityMetrics)
    }));
  }, [sampledEarthquakes]);

  // Get event color based on selected mode
  const getEventColor = (event: Earthquake) => {
    if (colorMode === 'quality') {
      const quality = qualityScores.find(q => q.eventId === event.id);
      return quality ? getQualityColor(quality.score.overall) : getEarthquakeColor(event.depth, mapColors.isDark);
    } else if (colorMode === 'depth') {
      return getEarthquakeColor(event.depth, mapColors.isDark);
    }
    return getMagnitudeColor(event.magnitude);
  };

  const getMagnitudeLabel = (magnitude: number): string => {
    if (magnitude >= 6.0) return 'Major';
    if (magnitude >= 5.0) return 'Moderate';
    if (magnitude >= 4.0) return 'Light';
    if (magnitude >= 3.0) return 'Minor';
    return 'Micro';
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

      {/* Map */}
      <div className="h-[600px] w-full rounded-lg overflow-hidden border shadow-sm">
        <MapContainer
          key="unified-earthquake-map"
          center={[-41.0, 174.0]}
          zoom={6}
          className="h-full w-full"
          scrollWheelZoom={true}
          preferCanvas={true}
        >
          <MapLayerControl position="topright" />

          {/* NZ Active Faults from Local GeoJSON */}
          {showFaults && faultData && (
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

          {/* Earthquake markers - using intelligent sampling for performance */}
          {/* Sort by magnitude (small to large) so larger events render on top */}
          {[...sampledEarthquakes].sort((a, b) => a.magnitude - b.magnitude).map((eq) => {
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
                  weight: 1,
                  // Add title for accessibility (shows on hover)
                  title: ariaLabel,
                } as any}
                eventHandlers={{
                  click: () => setSelectedEvent(eq),
                }}
              >
                <Popup>
                  <EventPopup event={eq} qualityScores={qualityScores} />
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

// Event popup component
function EventPopup({ event, qualityScores }: { event: Earthquake; qualityScores: any[] }) {
  const quality = qualityScores.find(q => q.eventId === event.id);

  // Fetch nearby faults for this event
  const { faults, loading: faultsLoading, count: faultCount } = useNearbyFaults({
    latitude: event.latitude,
    longitude: event.longitude,
    radius: 50, // 50 km radius
    limit: 3, // Show top 3 nearest faults
    enabled: true,
  });

  return (
    <div className="p-2 min-w-[280px] max-w-[320px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base">{event.region || 'Event'}</h3>
        {quality && (
          <Badge variant="outline" style={{ backgroundColor: getQualityColor(quality.score.overall), color: 'white' }}>
            {quality.score.grade}
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
          <span className="font-bold">{event.magnitude.toFixed(1)} {event.magnitude_type || ''}</span>
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
            <InfoTooltip content="Event origin time in local timezone." />
          </div>
          <span className="text-xs">{new Date(event.time).toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Location:</span>
            <InfoTooltip content="Epicenter coordinates in decimal degrees." />
          </div>
          <span className="text-xs">{event.latitude.toFixed(4)}°, {event.longitude.toFixed(4)}°</span>
        </div>

        {event.catalogue && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Source:</span>
              <InfoTooltip content="Catalogue or agency that reported the event." />
              <span>{event.catalogue}</span>
            </div>
          </div>
        )}

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
}
