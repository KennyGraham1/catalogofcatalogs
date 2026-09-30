'use client';

import { buildEventCardHtml } from '@/lib/map-event-card';
import { LocalitiesAttribution, useNzLocalities } from '@/components/map/use-nz-localities';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import { useMapColors } from '@/hooks/use-map-theme';
import type { MapDetail } from '@/lib/map-event-selection';
import { getEarthquakeColor } from '@/lib/earthquake-utils';
import { getQualityColor } from '@/lib/quality-scoring';
import { calculateUncertaintyEllipse, getAzimuthalGapColor } from '@/lib/uncertainty-utils';
import { FIT_BOUNDS_OPTIONS, MAP_ZOOM_OPTIONS } from '@/lib/map-style';
import { eventsFitBounds } from '@/lib/map-view';
import { cn } from '@/lib/utils';
import { resolveEventQuality } from '@/components/events/event-quality';
import { MapViewportObserver } from '@/components/map/MapViewportObserver';
import { MapDetailControl } from '@/components/map/MapDetailControl';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { MapScaleBar } from '@/components/map/MapScaleBar';
import { MapStatusChip } from '@/components/map/MapStatusChip';
import { MapStylePanel, StylePanelSection, StyleRadioGroup } from '@/components/map/MapStylePanel';
import { FitMapToEvents } from '@/components/map/FitMapToEvents';
import { OptimizedEventPopup } from '@/components/map/OptimizedEventPopup';
import { ensureLeafletDefaultIcon } from '@/components/map/leaflet-default-icon';
import {
  COLOR_MODE_LABELS, ColorModeLegendSection, LegendSection, MagnitudeSizeKey, MapLegend,
  UNKNOWN_SOURCE_KEY, buildCatalogueColorScale, resolveSourceCatalogue, type MapColorMode,
} from '@/components/map/MapLegend';
import {
  EllipsePopupRow, FaultsOverlay, FocalMechanismLegendSection, FocalMechanismStatus, FocalMechanismsOverlay,
  MapOverlayLegendSection, MapOverlayToggles, OverlayStyleInfo, UncertaintyEllipsesOverlay,
  useEventOverlays, useFaultData, useOverlayDataAvailability,
} from '@/components/map/MapOverlays';

// The overlay limits live with the shared overlays; re-exported for existing importers.
export { MAX_FOCAL_MECHANISMS, MAX_MAP_OVERLAYS } from '@/components/map/MapOverlays';

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
  source_id?: string | null;
  event_type?: string | null;

  // C1: stored quality score/grade, preferred over the on-the-fly computation when present.
  quality_score?: number | null;
  quality_grade?: string | null;

  // C2: merged-event provenance, used by the source-catalogue colour mode.
  source_catalogue_ids?: string[] | null;
  source_events?: string | null;
}

/**
 * Colour modes this map offers (paper sec:viz: depth, quality grade, azimuthal gap, source
 * catalogue). Magnitude is encoded by marker size only: the old 'magnitude' colour mode
 * painted every marker the same blue, so it is gone.
 */
const COLOR_MODES: readonly MapColorMode[] = ['depth', 'quality', 'azimuthal-gap', 'source-catalogue'];
const COLOR_MODE_OPTIONS = COLOR_MODES.map((value) => ({ value, label: COLOR_MODE_LABELS[value] }));

/**
 * A colour mode as saved by an older version of the page, URL or caller: any value that is
 * not a current mode (notably the removed 'magnitude') falls back to depth, the default.
 */
export function normalizeColorMode(mode: string | null | undefined): MapColorMode {
  return (COLOR_MODES as readonly string[]).includes(mode ?? '') ? mode as MapColorMode : 'depth';
}

interface UnifiedEarthquakeMapProps {
  earthquakes: Earthquake[];
  /** Initial colour mode. 'magnitude' (removed) and unknown values fall back to 'depth'. */
  colorBy?: MapColorMode | 'magnitude';
  /**
   * Offers the focal-mechanism switch (paper sec:viz): on, the event circles are replaced by
   * the plotted events' beach balls (mechanisms mode).
   */
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
  /** Active faults overlay on at first (default true). */
  showFaultLines?: boolean;
  /** @deprecated Ignored (showFaultLines sets the faults overlay); kept for interface stability. */
  showActiveFaults?: boolean;
  /**
   * Optional catalogue id -> display name lookup for the source-catalogue colour mode.
   * Without it, a merged row's contributing catalogues are labelled by their raw id.
   */
  catalogueNames?: Record<string, string>;
  /** CSS height of the map. Omit to size it with `className` (default 600 px). */
  height?: string;
  /** Extra classes for the map wrapper: height, rounding to match the enclosing card. */
  className?: string;
  mapKey?: string;
}

const NO_EVENTS: Earthquake[] = [];

const STYLE_INFO = (
  <>
    Colour shows the chosen attribute; marker size always shows magnitude. <b>Quality</b> is the
    location quality score (Q 0–100). <b>Azimuthal gap</b> is the largest angle between recording
    stations seen from the epicentre. <b>Source catalogue</b> is, for a merged event, the catalogue
    whose solution the row publishes. <OverlayStyleInfo /> <b>Map detail</b> caps how many events are
    drawn at once; zoom in to see more.
  </>
);

export default function UnifiedEarthquakeMap({
  earthquakes,
  colorBy = 'depth',
  showFocalMechanisms = false,
  showFaultLines = true,
  catalogueNames,
  height,
  className,
  mapKey = 'unified-earthquake-map',
}: UnifiedEarthquakeMapProps) {
  const { isDark } = useMapColors();
  const [colorMode, setColorMode] = useState<MapColorMode>(() => normalizeColorMode(colorBy));
  const [showFaults, setShowFaults] = useState(showFaultLines);
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');
  // On-demand overlays (paper sec:viz "two additional overlays are available on demand").
  // Both default off: they are opt-in extras, not part of the base map.
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [showBeachBalls, setShowBeachBalls] = useState(false);
  // Mechanisms mode: beach balls replace the event circles (only when the page offers it).
  const mechanismsMode = showFocalMechanisms && showBeachBalls;

  // Viewport-sampled events (culling + detail budget) and the single lazy popup.
  const { sampled: sampledEarthquakes, displayCount, visibleCount, onViewportChange, getPosition } = useMapEventSelection(earthquakes, sampleSize);
  const { activePopup, onEventClick, closePopup } = useEventMapPopup(earthquakes, mapKey);
  // Hover card (lib/map-event-card.ts): localities from the LINZ Gazetteer once loaded.
  const places = useNzLocalities();
  const hoverCard = useCallback((event: Earthquake) => buildEventCardHtml(event, places), [places]);

  // Frame the events (antimeridian aware; NZ when empty). MapContainer reads the bounds once;
  // FitMapToEvents keeps framing them while events stream in, until the user takes over.
  const bounds = useMemo(() => eventsFitBounds(earthquakes), [earthquakes]);

  // Update the colour mode when the colorBy prop changes (a saved 'magnitude' -> depth).
  useEffect(() => {
    setColorMode(normalizeColorMode(colorBy));
  }, [colorBy]);

  // The fault traces, loaded (once per page, shared by every map) the first time the overlay is on.
  const faultData = useFaultData(showFaults);

  // Default Leaflet marker icon from this origin (the cdnjs URLs are blocked by the CSP).
  useEffect(() => {
    ensureLeafletDefaultIcon();
  }, []);

  // Quality per sampled event. Per C1, the stored quality_score/quality_grade is preferred
  // and only legacy rows without it are scored on the fly - resolveEventQuality is the same
  // resolver EventTable uses, so the map and the table never disagree about an event's grade.
  const qualityScoreMap = useMemo(() => {
    if (colorMode !== 'quality') return new Map<Earthquake['id'], ReturnType<typeof resolveEventQuality>>();
    return new Map(sampledEarthquakes.map(event => [event.id, resolveEventQuality(event)]));
  }, [sampledEarthquakes, colorMode]);

  // Source-catalogue category per event (contract C2), resolved over ALL events so a
  // catalogue keeps its colour as the viewport sample changes.
  const sourceCatalogueInfoMap = useMemo(() => {
    if (colorMode !== 'source-catalogue') return new Map<Earthquake['id'], ReturnType<typeof resolveSourceCatalogue>>();
    return new Map(earthquakes.map(event => [event.id, resolveSourceCatalogue(event, catalogueNames)]));
  }, [earthquakes, colorMode, catalogueNames]);

  const sourceCatalogueScale = useMemo(
    () => buildCatalogueColorScale(Array.from(sourceCatalogueInfoMap.values()), { isDark }),
    [sourceCatalogueInfoMap, isDark]
  );

  // Marker fill for the selected mode (the stroke is the shared neutral outline).
  const getEventColor = useCallback((event: Earthquake) => {
    if (colorMode === 'quality') {
      const quality = qualityScoreMap.get(event.id);
      return getQualityColor(quality ? quality.score : null);
    }
    if (colorMode === 'azimuthal-gap') return getAzimuthalGapColor(event.azimuthal_gap);
    if (colorMode === 'source-catalogue') {
      const info = sourceCatalogueInfoMap.get(event.id);
      return sourceCatalogueScale.colorFor(info?.key ?? UNKNOWN_SOURCE_KEY);
    }
    return getEarthquakeColor(event.depth, isDark);
  }, [colorMode, qualityScoreMap, isDark, sourceCatalogueInfoMap, sourceCatalogueScale]);

  // Uncertainty ellipses and focal-mechanism beach balls (on demand) for the plotted events,
  // capped at the largest magnitudes (see useEventOverlays).
  const overlays = useEventOverlays({
    events: sampledEarthquakes,
    getPosition,
    showUncertainty,
    showFocalMechanisms: mechanismsMode,
  });
  // Words the empty mechanisms notice ("in this catalogue" / "in view").
  const available = useOverlayDataAvailability(mechanismsMode ? earthquakes : NO_EVENTS);

  const popupEvent = activePopup?.event;
  const popupQuality = useMemo(() => (popupEvent ? resolveEventQuality(popupEvent) : null), [popupEvent]);
  const popupEllipse = useMemo(
    () => (popupEvent && showUncertainty ? calculateUncertaintyEllipse(popupEvent) : null),
    [popupEvent, showUncertainty]
  );

  return (
    <div className={cn('relative isolate h-[600px] overflow-hidden', className)} style={height ? { height } : undefined}>
      <MapContainer
        key={mapKey}
        bounds={bounds}
        boundsOptions={FIT_BOUNDS_OPTIONS}
        className="h-full w-full"
        minZoom={2}
        maxZoom={18}
        {...MAP_ZOOM_OPTIONS}
        scrollWheelZoom={true}
        preferCanvas={true}
      >
        <MapLayerControl position="topright" />
        <MapScaleBar />
        <LocalitiesAttribution active={places.length > 0} />
        <FitMapToEvents bounds={bounds} />
        <MapViewportObserver onChange={onViewportChange} />

        {/* NZ active faults (local GeoJSON), own pane under the events. */}
        {showFaults && <FaultsOverlay data={faultData} isDark={isDark} />}

        {/* Uncertainty ellipses (on demand): the horizontal location error in the event's own
            colour, in a pane under the event markers (components/advanced-viz/UncertaintyEllipse). */}
        <UncertaintyEllipsesOverlay items={overlays.ellipses.items} getColor={getEventColor} />

        {/* The event circles - replaced by the beach balls in mechanisms mode. */}
        {!mechanismsMode && (
          <EarthquakeMarkerLayer
            events={sampledEarthquakes}
            getColor={getEventColor}
            isDark={isDark}
            selectedId={popupEvent?.id ?? null}
            onEventClick={onEventClick}
            hoverCard={hoverCard}
          />
        )}

        {/* Mechanisms mode: the largest plotted events' beach balls, compressional quadrants in
            the event's colour; a click on a ball opens that event's popup. */}
        <FocalMechanismsOverlay items={overlays.mechanisms.items} getFill={getEventColor} onEventClick={onEventClick} />

        {/* One popup, rendered only for the clicked event. Keeping the popup (and its
            nearby-faults fetch) out of the per-marker loop avoids mounting one fetch-firing
            popup per plotted earthquake. Keyed by a click sequence so re-clicking the same
            marker reopens it. */}
        {activePopup && (
          <Popup
            key={activePopup.seq}
            position={activePopup.position}
            minWidth={260}
            maxWidth={300}
            autoPanPadding={[48, 48]}
            eventHandlers={{ remove: () => closePopup(activePopup.seq) }}
          >
            <OptimizedEventPopup event={activePopup.event} quality={popupQuality} showFaults>
              {popupEllipse && <EllipsePopupRow ellipse={popupEllipse} />}
            </OptimizedEventPopup>
          </Popup>
        )}
      </MapContainer>

      <MapStylePanel info={STYLE_INFO}>
        <StyleRadioGroup
          name={`unified-colorMode-${mapKey}`}
          legend="Colour by"
          value={colorMode}
          onChange={setColorMode}
          options={COLOR_MODE_OPTIONS}
        />
        <MapOverlayToggles
          faults={{ checked: showFaults, onCheckedChange: setShowFaults }}
          uncertainty={{ checked: showUncertainty, onCheckedChange: setShowUncertainty, note: overlays.ellipseNote }}
          focalMechanisms={showFocalMechanisms ? { checked: showBeachBalls, onCheckedChange: setShowBeachBalls } : undefined}
        />
        <StylePanelSection>
          <MapDetailControl value={sampleSize} onChange={setSampleSize} />
        </StylePanelSection>
      </MapStylePanel>

      {mechanismsMode ? (
        <FocalMechanismStatus
          shown={overlays.mechanisms.items.length}
          total={overlays.mechanisms.total}
          catalogueHasAny={available.focalMechanisms}
        />
      ) : (
        <MapStatusChip shown={displayCount} total={visibleCount} />
      )}

      {/* Legend: every key is generated from the functions that colour and size the markers. */}
      <MapLegend>
        <ColorModeLegendSection mode={colorMode} isDark={isDark} catalogueLegend={sourceCatalogueScale.legend} />
        {mechanismsMode ? (
          <FocalMechanismLegendSection />
        ) : (
          <LegendSection title="Magnitude">
            <MagnitudeSizeKey isDark={isDark} />
          </LegendSection>
        )}
        <MapOverlayLegendSection
          isDark={isDark}
          showFaults={showFaults}
          ellipses={overlays.ellipses.items.map(({ ellipse }) => ellipse)}
        />
      </MapLegend>
    </div>
  );
}
