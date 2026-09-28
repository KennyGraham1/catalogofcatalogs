'use client';

import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { MapViewportObserver } from '@/components/map/MapViewportObserver';
import { MapDetailControl } from '@/components/map/MapDetailControl';
import type { MapDetail } from '@/lib/map-event-selection';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import { MapContainer, Popup, GeoJSON } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import {
  DepthLegendItems, MagnitudeLegendItems, QualityLegendItems, AzimuthalGapLegendItems,
  SourceCatalogueLegendItems, resolveSourceCatalogue, buildCatalogueColorScale,
} from '@/components/map/MapLegend';
import { formatOriginTime } from '@/components/map/OptimizedEventPopup';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Activity, Ruler, Calendar, MapPin, Layers, Target, Radio, Zap, Info } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useMapColors } from '@/hooks/use-map-theme';
import { getQualityColor } from '@/lib/quality-scoring';
import { resolveEventQuality } from '@/components/events/event-quality';
import { getMagnitudeColor, getEarthquakeColor } from '@/lib/earthquake-utils';
import { useNearbyFaults } from '@/hooks/use-nearby-faults';
import { loadFaultData, FaultCollection } from '@/lib/fault-data';
import type { PathOptions } from 'leaflet';
import { UncertaintyEllipse } from '@/components/advanced-viz/UncertaintyEllipse';
import { BeachBallMarker } from '@/components/advanced-viz/BeachBallMarker';
import { calculateUncertaintyEllipse, getAzimuthalGapColor, type UncertaintyData } from '@/lib/uncertainty-utils';
import { parseFocalMechanism, selectPlane } from '@/lib/focal-mechanism-utils';

/** Non-null result shapes, named once so the overlay memos below don't repeat them. */
type MapUncertaintyEllipse = NonNullable<ReturnType<typeof calculateUncertaintyEllipse>>;
type MapFocalMechanism = NonNullable<ReturnType<typeof parseFocalMechanism>>;

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
  /** QuakeML preferredFocalMechanismID: which of focal_mechanisms is authoritative. */
  preferred_focal_mechanism_id?: string | null;
  picks?: string | null;
  arrivals?: string | null;

  // Extended QuakeML 1.2 fields (GeoNet/ISC)
  horizontal_uncertainty?: number | null;
  // QuakeML OriginUncertainty error ellipse: semi-minor/semi-major axes (km) and the
  // azimuth of the semi-major axis (degrees clockwise from north) — see lib/uncertainty-utils.
  latitude_uncertainty?: number | null;
  longitude_uncertainty?: number | null;
  depth_uncertainty?: number | null;
  min_horizontal_uncertainty?: number | null;
  max_horizontal_uncertainty?: number | null;
  azimuth_max_horizontal_uncertainty?: number | null;
  /** C16: OriginUncertainty.confidenceLevel (percent, 0-100) of the preferred origin. */
  confidence_level?: number | null;
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

  // C1: stored quality score/grade, preferred over the on-the-fly computation when present.
  quality_score?: number | null;
  quality_grade?: string | null;

  // C2: merged-event provenance, used by the source-catalogue colour mode.
  source_catalogue_ids?: string[] | null;
  source_events?: string | null;
}

interface UnifiedEarthquakeMapProps {
  earthquakes: Earthquake[];
  colorBy?: 'magnitude' | 'depth' | 'quality' | 'azimuthal-gap' | 'source-catalogue';
  /** Enables the on-demand focal-mechanism beach-ball overlay toggle (paper sec:viz). */
  showFocalMechanisms?: boolean;
  /**
   * Accepted but not yet implementable: a per-event station-coverage overlay (markers for
   * the stations that recorded each event) needs each station's own coordinates, and the
   * schema only stores aggregate counts/gap per event (used_station_count, azimuthal_gap),
   * never which stations or where they are. Faking station positions would be worse than
   * omitting the overlay, so this prop is accepted for interface stability but intentionally
   * has no effect; the per-event azimuthal-gap colour mode below is the real, data-backed
   * substitute for "station coverage" on this map (paper's station-coverage panel).
   */
  showStations?: boolean;
  showFaultLines?: boolean;
  showActiveFaults?: boolean;
  /**
   * Optional catalogue id -> display name lookup for the source-catalogue colour mode.
   * Without it, a merged row's contributing catalogues are labelled by their raw id.
   */
  catalogueNames?: Record<string, string>;
}

/** Overlays are drawn only for the plotted (sampled, in-view) events, and further capped
 *  here: an uncertainty ellipse is a 64-point polygon and a beach ball is a rasterised
 *  icon, so drawing one per sampled event (up to a few thousand) would stall the browser.
 *  The largest-magnitude events are kept first (see overlayCandidates below). */
const MAX_MAP_OVERLAYS = 150;



export default function UnifiedEarthquakeMap({
  earthquakes,
  colorBy = 'magnitude',
  showFocalMechanisms = false,
  showStations = false,
  showFaultLines = true,
  showActiveFaults = true,
  catalogueNames,
}: UnifiedEarthquakeMapProps) {
  const [showFaults, setShowFaults] = useState(showFaultLines);
  const [colorMode, setColorMode] = useState<'magnitude' | 'depth' | 'quality' | 'azimuthal-gap' | 'source-catalogue'>(colorBy);
  const [faultData, setFaultData] = useState<FaultCollection | null>(null);
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');
  // On-demand overlays (paper sec:viz "two additional overlays are available on demand").
  // Both default off: they are opt-in extras, not part of the base map.
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [showBeachBalls, setShowBeachBalls] = useState(false);

  // Dark mode support for marker colors
  const mapColors = useMapColors();

  // Sample earthquakes for performance
  const { sampled: sampledEarthquakes, displayCount, visibleCount, isSampled, onViewportChange, getPosition } = useMapEventSelection(earthquakes, sampleSize);

  const { activePopup, onEventClick } = useEventMapPopup(earthquakes);

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

  // Calculate quality scores (use sampled earthquakes). Per C1, the stored quality_score/
  // quality_grade is preferred and only legacy rows without it are scored on the fly —
  // resolveEventQuality is the same resolver EventTable uses, so the map and the table
  // never disagree about an event's grade.
  const qualityScores = useMemo(() => {
    if (colorMode !== 'quality') return [];
    return sampledEarthquakes.map(event => ({
      eventId: event.id,
      quality: resolveEventQuality(event)
    }));
  }, [sampledEarthquakes, colorMode]);

  const qualityScoreMap = useMemo(() => new Map(qualityScores.map(q => [q.eventId, q.quality])), [qualityScores]);

  // Resolve the source-catalogue category per sampled event (contract C2) and the
  // categorical colour scale/legend it implies. Both are no-ops outside this colour mode.
  const sourceCatalogueInfos = useMemo(() => {
    if (colorMode !== 'source-catalogue') return [];
    return sampledEarthquakes.map(event => ({
      eventId: event.id,
      info: resolveSourceCatalogue(event, catalogueNames),
    }));
  }, [sampledEarthquakes, colorMode, catalogueNames]);

  const sourceCatalogueInfoMap = useMemo(
    () => new Map(sourceCatalogueInfos.map(x => [x.eventId, x.info])),
    [sourceCatalogueInfos]
  );

  const sourceCatalogueScale = useMemo(
    () => buildCatalogueColorScale(sourceCatalogueInfos.map(x => x.info)),
    [sourceCatalogueInfos]
  );

  // Get event color based on selected mode
  const getEventColor = useCallback((event: Earthquake) => {
    if (colorMode === 'quality') {
      const quality = qualityScoreMap.get(event.id);
      return quality ? getQualityColor(quality.score) : getEarthquakeColor(event.depth, mapColors.isDark);
    } else if (colorMode === 'depth') {
      return getEarthquakeColor(event.depth, mapColors.isDark);
    } else if (colorMode === 'azimuthal-gap') {
      return getAzimuthalGapColor(event.azimuthal_gap);
    } else if (colorMode === 'source-catalogue') {
      const info = sourceCatalogueInfoMap.get(event.id);
      return sourceCatalogueScale.colorFor(info?.key ?? '__unknown__');
    }
    return getMagnitudeColor(event.magnitude);
  }, [colorMode, qualityScoreMap, mapColors.isDark, sourceCatalogueInfoMap, sourceCatalogueScale]);

  // Overlay candidates: largest-magnitude events first, so the MAX_MAP_OVERLAYS cap keeps
  // the most significant events deterministically rather than depending on the spatial
  // sampling order (selectMapEvents's cell-representative order is not magnitude-ordered).
  const overlayCandidates = useMemo(
    () => [...sampledEarthquakes].sort((a, b) => b.magnitude - a.magnitude),
    [sampledEarthquakes]
  );

  // Uncertainty ellipses (on demand): reported error ellipse first, then circular
  // horizontal uncertainty, then lat/lon marginals — see calculateUncertaintyEllipse.
  const uncertaintyEllipses = useMemo((): { items: Array<{ eventId: Earthquake['id']; ellipse: MapUncertaintyEllipse }>; total: number } => {
    if (!showUncertainty) return { items: [], total: 0 };
    const withEllipse = overlayCandidates
      .map(event => ({ event, ellipse: calculateUncertaintyEllipse(event as UncertaintyData) }))
      .filter(x => x.ellipse !== null);
    const items = withEllipse.slice(0, MAX_MAP_OVERLAYS).map(({ event, ellipse }) => ({
      eventId: event.id,
      ellipse: { ...(ellipse as MapUncertaintyEllipse), center: getPosition(event) },
    }));
    return { items, total: withEllipse.length };
  }, [overlayCandidates, showUncertainty, getPosition]);

  // Focal-mechanism beach balls (on demand, gated by the showFocalMechanisms prop): parsed
  // from the stored focal_mechanisms JSON, preferring preferred_focal_mechanism_id.
  const focalMechanismOverlays = useMemo((): { items: Array<{ eventId: Earthquake['id']; position: [number, number]; mechanism: MapFocalMechanism }>; total: number } => {
    if (!showFocalMechanisms || !showBeachBalls) return { items: [], total: 0 };
    const withMechanism = overlayCandidates
      .map(event => ({ event, mechanism: parseFocalMechanism(event.focal_mechanisms, event.preferred_focal_mechanism_id) }))
      .filter(x => x.mechanism !== null && selectPlane(x.mechanism) !== null);
    const items = withMechanism.slice(0, MAX_MAP_OVERLAYS).map(({ event, mechanism }) => ({
      eventId: event.id,
      position: getPosition(event),
      mechanism: mechanism as MapFocalMechanism,
    }));
    return { items, total: withMechanism.length };
  }, [overlayCandidates, showFocalMechanisms, showBeachBalls, getPosition]);

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
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="color-azimuthal-gap"
                  name="colorMode"
                  checked={colorMode === 'azimuthal-gap'}
                  onChange={() => setColorMode('azimuthal-gap')}
                  className="cursor-pointer"
                />
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="color-azimuthal-gap" className="text-xs cursor-pointer">Azimuthal Gap</Label>
                  <TechnicalTermTooltip term="azimuthalGap" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="color-source-catalogue"
                  name="colorMode"
                  checked={colorMode === 'source-catalogue'}
                  onChange={() => setColorMode('source-catalogue')}
                  className="cursor-pointer"
                />
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="color-source-catalogue" className="text-xs cursor-pointer">Source Catalogue</Label>
                  <InfoTooltip content="For a merged event, the catalogue whose solution (time and location) this row publishes; for a pooled multi-catalogue view, the catalogue the event came from." />
                </div>
              </div>
            </div>
          </div>

          {/* On-demand overlays (paper sec:viz): off by default, drawn only for the
              plotted events and capped (see the note below the map when truncated). */}
          <div className="pt-2 border-t">
            <div className="flex items-center gap-1.5 mb-2">
              <Label className="text-xs font-medium">Overlays</Label>
              <InfoTooltip content="Extra detail drawn on demand for the currently plotted events." />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="uncertainty-overlay" className="text-xs cursor-pointer">
                  Uncertainty Ellipses
                </Label>
                <TechnicalTermTooltip term="uncertainty" />
              </div>
              <Switch
                id="uncertainty-overlay"
                checked={showUncertainty}
                onCheckedChange={setShowUncertainty}
              />
            </div>
            {showFocalMechanisms && (
              <div className="flex items-center justify-between gap-3 mt-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="beachball-overlay" className="text-xs cursor-pointer">
                    Focal Mechanisms
                  </Label>
                  <TechnicalTermTooltip term="focalMechanism" />
                </div>
                <Switch
                  id="beachball-overlay"
                  checked={showBeachBalls}
                  onCheckedChange={setShowBeachBalls}
                />
              </div>
            )}
          </div>

          <div className="pt-2 border-t">
            <MapDetailControl value={sampleSize} onChange={setSampleSize} />
          </div>
        </div>
      </Card>

      {/* Sampling / overlay info badges, stacked so neither is ever covered by the other */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 max-w-[320px]">
        {isSampled && (
          <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg">
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-blue-500" />
              <span>
                Displaying <strong>{displayCount.toLocaleString()}</strong> of{' '}
                <strong>{visibleCount.toLocaleString()}</strong> visible events. Zoom in for more.
              </span>
            </div>
          </Card>
        )}
        {showUncertainty && uncertaintyEllipses.total > MAX_MAP_OVERLAYS && (
          <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg">
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-blue-500" />
              <span>
                Showing uncertainty ellipses for the <strong>{MAX_MAP_OVERLAYS}</strong> largest of{' '}
                <strong>{uncertaintyEllipses.total.toLocaleString()}</strong> plotted events with location uncertainty.
              </span>
            </div>
          </Card>
        )}
        {showFocalMechanisms && showBeachBalls && focalMechanismOverlays.total > MAX_MAP_OVERLAYS && (
          <Card className="p-3 bg-background/95 backdrop-blur-sm shadow-lg">
            <div className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-blue-500" />
              <span>
                Showing beach balls for the <strong>{MAX_MAP_OVERLAYS}</strong> largest of{' '}
                <strong>{focalMechanismOverlays.total.toLocaleString()}</strong> plotted events with a focal mechanism.
              </span>
            </div>
          </Card>
        )}
      </div>

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
        <MapViewportObserver onChange={onViewportChange} />

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

        <EarthquakeMarkerLayer events={sampledEarthquakes} getColor={getEventColor} opacity={mapColors.markerOpacity} onEventClick={onEventClick} />

          {/* Uncertainty ellipses (on demand): the horizontal location error, scaled and
              drawn per lib/uncertainty-utils; "N% confidence ellipse" tooltip when the
              event carries confidence_level (C16). */}
          {showUncertainty && uncertaintyEllipses.items.map(({ eventId, ellipse }) => (
            <UncertaintyEllipse key={`uncertainty-${eventId}`} ellipse={ellipse} eventId={eventId} />
          ))}

          {/* Focal-mechanism beach balls (on demand, gated by showFocalMechanisms) */}
          {showFocalMechanisms && showBeachBalls && focalMechanismOverlays.items.map(({ eventId, position, mechanism }) => (
            <BeachBallMarker
              key={`focal-${eventId}`}
              position={position}
              mechanism={mechanism}
              eventId={eventId}
              size={28}
            />
          ))}

          {/* One popup, rendered only for the clicked event. Keeping the popup (and
              its nearby-faults fetch in EventPopup) out of the per-marker loop avoids
              mounting one fetch-firing popup per plotted earthquake. Keyed by a click
              sequence so re-clicking the same marker reopens it. */}
          {activePopup && (
            <Popup
              key={activePopup.seq}
              position={activePopup.position}
            >
              <EventPopup event={activePopup.event} qualityScores={qualityScores} />
            </Popup>
          )}
        </MapContainer>
      </div>

      {/* Legend */}
      <LegendPanel
        colorMode={colorMode}
        isDark={mapColors.isDark}
        showFaults={showFaults}
        faultCount={faultData?.features.length}
        catalogueLegend={sourceCatalogueScale.legend}
      />
    </div>
  );
}

// Event popup component
function EventPopup({ event, qualityScores }: { event: Earthquake; qualityScores: Array<{ eventId: Earthquake['id']; quality: ReturnType<typeof resolveEventQuality> }> }) {
  const quality = useMemo(() => qualityScores.find(q => q.eventId === event.id)?.quality ?? resolveEventQuality(event), [event, qualityScores]);

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
          <Badge variant="outline" style={{ backgroundColor: getQualityColor(quality.score), color: 'white' }}>
            {quality.grade}
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

// Legend panel component (swatches come from the same functions that draw the markers)
function LegendPanel({ colorMode, isDark, showFaults, faultCount, catalogueLegend }: {
  colorMode: string; isDark: boolean; showFaults: boolean; faultCount?: number;
  catalogueLegend: Array<{ key: string; label: string; color: string }>;
}) {
  const title = colorMode === 'quality' ? 'Quality Score'
    : colorMode === 'depth' ? 'Depth Scale'
    : colorMode === 'azimuthal-gap' ? 'Azimuthal Gap'
    : colorMode === 'source-catalogue' ? 'Source Catalogue'
    : 'Magnitude Scale';
  return (
    <Card className="absolute bottom-4 right-4 z-[1000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold">{title}</h4>
        {colorMode === 'quality' ? (
          <TechnicalTermTooltip term="qualityScore" />
        ) : colorMode === 'depth' ? (
          <TechnicalTermTooltip term="depth" />
        ) : colorMode === 'azimuthal-gap' ? (
          <TechnicalTermTooltip term="azimuthalGap" />
        ) : colorMode === 'source-catalogue' ? (
          <InfoTooltip content="Which catalogue each plotted event's solution (or, for a pooled view, source) came from." />
        ) : (
          <TechnicalTermTooltip term="magnitude" />
        )}
      </div>

      {colorMode === 'quality' ? (
        <QualityLegendItems />
      ) : colorMode === 'depth' ? (
        <DepthLegendItems isDark={isDark} />
      ) : colorMode === 'azimuthal-gap' ? (
        <AzimuthalGapLegendItems />
      ) : colorMode === 'source-catalogue' ? (
        <SourceCatalogueLegendItems legend={catalogueLegend} />
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
