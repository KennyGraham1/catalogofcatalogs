'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { GeoJSON, MapContainer, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import { useMapColors } from '@/hooks/use-map-theme';
import type { MapDetail } from '@/lib/map-event-selection';
import { getEarthquakeColor } from '@/lib/earthquake-utils';
import { getQualityColor } from '@/lib/quality-scoring';
import { calculateUncertaintyEllipse, getAzimuthalGapColor, type UncertaintyData } from '@/lib/uncertainty-utils';
import { parseFocalMechanism, selectPlane } from '@/lib/focal-mechanism-utils';
import { loadFaultData, type FaultCollection } from '@/lib/fault-data';
import { FAULT_STYLE, FIT_BOUNDS_OPTIONS, MAP_PANES, MAP_ZOOM_OPTIONS, faultPathOptions } from '@/lib/map-style';
import { formatCount } from '@/lib/map-format';
import { eventsFitBounds } from '@/lib/map-view';
import { cn } from '@/lib/utils';
import { resolveEventQuality } from '@/components/events/event-quality';
import {
  UncertaintyEllipse, UncertaintyEllipseLegendKey, formatEllipseSummary,
} from '@/components/advanced-viz/UncertaintyEllipse';
import { BEACH_BALL_STYLE, BeachBallLegendKey, BeachBallMarker } from '@/components/advanced-viz/BeachBallMarker';
import { MapViewportObserver } from '@/components/map/MapViewportObserver';
import { MapDetailControl } from '@/components/map/MapDetailControl';
import { EarthquakeMarkerLayer } from '@/components/map/EarthquakeMarkerLayer';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { MapScaleBar } from '@/components/map/MapScaleBar';
import { MapStatusChip } from '@/components/map/MapStatusChip';
import { MapStylePanel, StylePanelSection, StyleRadioGroup } from '@/components/map/MapStylePanel';
import { FitMapToEvents } from '@/components/map/FitMapToEvents';
import { OptimizedEventPopup } from '@/components/map/OptimizedEventPopup';
import { ensureMapPane } from '@/components/map/map-panes';
import { ensureLeafletDefaultIcon } from '@/components/map/leaflet-default-icon';
import {
  COLOR_MODE_LABELS, ColorModeLegendSection, FaultLineKey, LegendSection, MagnitudeSizeKey, MapLegend,
  UNKNOWN_SOURCE_KEY, buildCatalogueColorScale, resolveSourceCatalogue, type MapColorMode,
} from '@/components/map/MapLegend';

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

/** Overlays are drawn only for the plotted (sampled, in-view) events, and further capped
 *  here: an uncertainty ellipse is a 64-point polygon and a beach ball is a rasterised
 *  icon, so drawing one per sampled event (up to a few thousand) would stall the browser.
 *  The largest-magnitude events are kept first (see overlayCandidates below). */
export const MAX_MAP_OVERLAYS = 150;

/** Beach balls are drawn only when zoomed in this far, or when few enough are plotted
 *  (below) - at national scale hundreds of 20-45 px balls would bury the events. */
export const BEACH_BALL_MIN_ZOOM = 6;
export const BEACH_BALL_MAX_UNZOOMED = 300;

const STYLE_INFO = (
  <>
    Colour shows the chosen attribute; marker size always shows magnitude. <b>Quality</b> is the
    location quality score (Q 0–100). <b>Azimuthal gap</b> is the largest angle between recording
    stations seen from the epicentre. <b>Source catalogue</b> is, for a merged event, the catalogue
    whose solution the row publishes. <b>Uncertainty ellipses</b> show each event&apos;s reported
    horizontal location error in the event&apos;s colour (dashed: approximate, from lat/lon errors).
    <b> Focal mechanisms</b> are lower-hemisphere beach balls, compressional quadrants shaded in the
    depth colour (dark grey in other colour modes), sized by magnitude. Ellipses and beach balls
    cover the {MAX_MAP_OVERLAYS} largest plotted events. <b>Map detail</b> caps how many events are drawn at
    once; zoom in to see more.
  </>
);

/** Reports the map's zoom (initially and after every zoom). */
function MapZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const update = () => onChange(map.getZoom());
    update();
    map.on('zoomend', update);
    return () => { map.off('zoomend', update); };
  }, [map, onChange]);
  return null;
}

/**
 * Active fault traces (spec S4): thin and quiet in their own pane under the events and
 * ellipses, heavier from zoom 9. Non-interactive, so they never take an event's click.
 */
function FaultLinesLayer({ data, isDark, zoom }: { data: FaultCollection; isDark: boolean; zoom: number }) {
  const map = useMap();
  // The pane has to exist before the GeoJSON layer is added to it. react-leaflet adds the
  // layer in its own (passive) effect, which runs after this layout effect.
  useLayoutEffect(() => { ensureMapPane(map, MAP_PANES.faults); }, [map]);
  const zoomedIn = zoom >= FAULT_STYLE.zoomThreshold;
  // A new style function only when the theme or the weight step changes: react-leaflet
  // restyles all ~10,000 features whenever `style` changes identity.
  const style = useMemo(() => {
    const options = faultPathOptions(isDark, zoomedIn ? FAULT_STYLE.zoomThreshold : 0);
    return () => options;
  }, [isDark, zoomedIn]);
  return (
    <GeoJSON
      data={data}
      pane={MAP_PANES.faults.name}
      interactive={false}
      style={style}
      attribution="Active faults &copy; GNS Science (CC BY 3.0 NZ)"
    />
  );
}

/** A labelled overlay switch in the Style panel, with an optional muted note under it. */
function OverlayToggle({ id, label, checked, onCheckedChange, note }: {
  id: string; label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; note?: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="cursor-pointer text-xs font-normal leading-4">{label}</Label>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4" />
      </div>
      {note && <p className="text-[11px] leading-snug text-muted-foreground">{note}</p>}
    </div>
  );
}

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
  const idPrefix = useId();
  const [colorMode, setColorMode] = useState<MapColorMode>(() => normalizeColorMode(colorBy));
  const [showFaults, setShowFaults] = useState(showFaultLines);
  const [faultData, setFaultData] = useState<FaultCollection | null>(null);
  const [sampleSize, setSampleSize] = useState<MapDetail>('auto');
  const [zoom, setZoom] = useState<number | null>(null);
  // On-demand overlays (paper sec:viz "two additional overlays are available on demand").
  // Both default off: they are opt-in extras, not part of the base map.
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [showBeachBalls, setShowBeachBalls] = useState(false);

  // Viewport-sampled events (culling + detail budget) and the single lazy popup.
  const { sampled: sampledEarthquakes, displayCount, visibleCount, onViewportChange, getPosition } = useMapEventSelection(earthquakes, sampleSize);
  const { activePopup, onEventClick, closePopup } = useEventMapPopup(earthquakes, mapKey);

  // Frame the events (antimeridian aware; NZ when empty). MapContainer reads the bounds once;
  // FitMapToEvents keeps framing them while events stream in, until the user takes over.
  const bounds = useMemo(() => eventsFitBounds(earthquakes), [earthquakes]);

  // Update the colour mode when the colorBy prop changes (a saved 'magnitude' -> depth).
  useEffect(() => {
    setColorMode(normalizeColorMode(colorBy));
  }, [colorBy]);

  // Load the fault traces once, the first time the overlay is on.
  useEffect(() => {
    if (!showFaults || faultData) return;
    let cancelled = false;
    loadFaultData()
      .then((data) => { if (!cancelled) setFaultData(data); })
      .catch(() => { /* overlay stays empty; the map itself is unaffected */ });
    return () => { cancelled = true; };
  }, [showFaults, faultData]);

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

  // Overlay candidates: largest-magnitude events first, so the MAX_MAP_OVERLAYS cap keeps
  // the most significant events deterministically rather than depending on the spatial
  // sampling order (selectMapEvents's cell-representative order is not magnitude-ordered).
  const overlayCandidates = useMemo(
    () => [...sampledEarthquakes].sort((a, b) => b.magnitude - a.magnitude),
    [sampledEarthquakes]
  );

  // Uncertainty ellipses (on demand): reported error ellipse first, then circular
  // horizontal uncertainty, then lat/lon marginals — see calculateUncertaintyEllipse.
  const uncertaintyEllipses = useMemo((): { items: Array<{ event: Earthquake; ellipse: MapUncertaintyEllipse }>; total: number } => {
    if (!showUncertainty) return { items: [], total: 0 };
    const withEllipse = overlayCandidates
      .map(event => ({ event, ellipse: calculateUncertaintyEllipse(event as UncertaintyData) }))
      .filter((x): x is { event: Earthquake; ellipse: MapUncertaintyEllipse } => x.ellipse !== null);
    const items = withEllipse.slice(0, MAX_MAP_OVERLAYS).map(({ event, ellipse }) => ({
      event,
      ellipse: { ...ellipse, center: getPosition(event) },
    }));
    return { items, total: withEllipse.length };
  }, [overlayCandidates, showUncertainty, getPosition]);

  // Focal-mechanism beach balls (on demand, gated by the showFocalMechanisms prop): parsed
  // from the stored focal_mechanisms JSON, preferring preferred_focal_mechanism_id.
  const mechanismCandidates = useMemo((): Array<{ event: Earthquake; mechanism: MapFocalMechanism }> => {
    if (!showFocalMechanisms || !showBeachBalls) return [];
    return overlayCandidates
      .map(event => ({ event, mechanism: parseFocalMechanism(event.focal_mechanisms, event.preferred_focal_mechanism_id) }))
      .filter((x): x is { event: Earthquake; mechanism: MapFocalMechanism } => x.mechanism !== null && selectPlane(x.mechanism) !== null);
  }, [overlayCandidates, showFocalMechanisms, showBeachBalls]);

  // Drawn only at zoom >= BEACH_BALL_MIN_ZOOM or when at most BEACH_BALL_MAX_UNZOOMED are
  // plotted, then capped at the MAX_MAP_OVERLAYS largest.
  const beachBallZoomReached = zoom !== null && zoom >= BEACH_BALL_MIN_ZOOM;
  const focalMechanismOverlays = useMemo((): {
    items: Array<{ event: Earthquake; position: [number, number]; mechanism: MapFocalMechanism }>;
    total: number;
    hiddenUntilZoom: boolean;
  } => {
    const total = mechanismCandidates.length;
    if (total > BEACH_BALL_MAX_UNZOOMED && !beachBallZoomReached) return { items: [], total, hiddenUntilZoom: true };
    const items = mechanismCandidates.slice(0, MAX_MAP_OVERLAYS).map(({ event, mechanism }) => ({
      event,
      position: getPosition(event),
      mechanism,
    }));
    return { items, total, hiddenUntilZoom: false };
  }, [mechanismCandidates, beachBallZoomReached, getPosition]);

  // Beach balls take the event's depth colour in depth mode, neutral dark grey otherwise.
  const beachBallFill = useCallback(
    (event: Earthquake) => (colorMode === 'depth' ? getEarthquakeColor(event.depth, isDark) : BEACH_BALL_STYLE.neutralFill),
    [colorMode, isDark]
  );

  const popupEvent = activePopup?.event;
  const popupQuality = useMemo(() => (popupEvent ? resolveEventQuality(popupEvent) : null), [popupEvent]);
  const popupEllipse = useMemo(
    () => (popupEvent && showUncertainty ? calculateUncertaintyEllipse(popupEvent as UncertaintyData) : null),
    [popupEvent, showUncertainty]
  );

  const ellipseNote = !showUncertainty ? undefined
    : uncertaintyEllipses.total === 0 ? 'No plotted event reports a location uncertainty.'
      : uncertaintyEllipses.total > MAX_MAP_OVERLAYS
        ? `Showing the ${MAX_MAP_OVERLAYS} largest of ${formatCount(uncertaintyEllipses.total)} plotted events.`
        : undefined;

  const beachBallRule = `Drawn at zoom ≥ ${BEACH_BALL_MIN_ZOOM}, or when ≤ ${BEACH_BALL_MAX_UNZOOMED} are plotted.`;
  const beachBallNote = !showBeachBalls ? beachBallRule
    : focalMechanismOverlays.hiddenUntilZoom
      ? `${formatCount(focalMechanismOverlays.total)} plotted events have one: zoom in to draw them.`
      : focalMechanismOverlays.total === 0 ? 'No plotted event has a focal mechanism.'
        : focalMechanismOverlays.total > MAX_MAP_OVERLAYS
          ? `Showing the ${MAX_MAP_OVERLAYS} largest of ${formatCount(focalMechanismOverlays.total)} plotted events.`
          : beachBallRule;

  const beachBallsDrawn = focalMechanismOverlays.items.length > 0;
  const ellipsesDrawn = uncertaintyEllipses.items.length > 0;
  const showOverlayLegend = showFaults || ellipsesDrawn || beachBallsDrawn;

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
        <FitMapToEvents bounds={bounds} />
        <MapViewportObserver onChange={onViewportChange} />
        <MapZoomWatcher onChange={setZoom} />

        {/* NZ active faults (local GeoJSON), own pane under the events. */}
        {showFaults && faultData && <FaultLinesLayer data={faultData} isDark={isDark} zoom={zoom ?? 0} />}

        {/* Uncertainty ellipses (on demand): the horizontal location error in the event's own
            colour, in a pane under the event markers (components/advanced-viz/UncertaintyEllipse). */}
        {uncertaintyEllipses.items.map(({ event, ellipse }) => (
          <UncertaintyEllipse key={`uncertainty-${event.id}`} ellipse={ellipse} eventId={event.id} color={getEventColor(event)} />
        ))}

        <EarthquakeMarkerLayer
          events={sampledEarthquakes}
          getColor={getEventColor}
          isDark={isDark}
          selectedId={popupEvent?.id ?? null}
          onEventClick={onEventClick}
        />

        {/* Focal-mechanism beach balls (on demand, gated by showFocalMechanisms and zoom).
            A ball covers its event's marker, so a click on it opens that event's popup. */}
        {focalMechanismOverlays.items.map(({ event, position, mechanism }) => (
          <BeachBallMarker
            key={`focal-${event.id}`}
            position={position}
            mechanism={mechanism}
            eventId={event.id}
            magnitude={event.magnitude}
            fill={beachBallFill(event)}
            onClick={() => onEventClick(event, position)}
          />
        ))}

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
              {popupEllipse && (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
                  <dt className="whitespace-nowrap text-muted-foreground" title="Horizontal location uncertainty drawn on the map">Location error</dt>
                  <dd className="min-w-0 break-words text-right tabular-nums">{formatEllipseSummary(popupEllipse)}</dd>
                </dl>
              )}
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
        <StylePanelSection title="Overlays">
          <div className="space-y-1.5">
            <OverlayToggle id={`${idPrefix}-faults`} label="Active faults" checked={showFaults} onCheckedChange={setShowFaults} />
            <OverlayToggle
              id={`${idPrefix}-uncertainty`}
              label="Uncertainty ellipses"
              checked={showUncertainty}
              onCheckedChange={setShowUncertainty}
              note={ellipseNote}
            />
            {showFocalMechanisms && (
              <OverlayToggle
                id={`${idPrefix}-focal`}
                label="Focal mechanisms"
                checked={showBeachBalls}
                onCheckedChange={setShowBeachBalls}
                note={beachBallNote}
              />
            )}
          </div>
        </StylePanelSection>
        <StylePanelSection>
          <MapDetailControl value={sampleSize} onChange={setSampleSize} />
        </StylePanelSection>
      </MapStylePanel>

      <MapStatusChip shown={displayCount} total={visibleCount} />

      {/* Legend: every key is generated from the functions that colour and size the markers. */}
      <MapLegend>
        <ColorModeLegendSection mode={colorMode} isDark={isDark} catalogueLegend={sourceCatalogueScale.legend} />
        <LegendSection title="Magnitude">
          <MagnitudeSizeKey isDark={isDark} />
        </LegendSection>
        {showOverlayLegend && (
          <LegendSection title="Overlays">
            <div className="space-y-1">
              {showFaults && <FaultLineKey isDark={isDark} />}
              {ellipsesDrawn && <UncertaintyEllipseLegendKey ellipses={uncertaintyEllipses.items.map(({ ellipse }) => ellipse)} />}
              {beachBallsDrawn && (
                <BeachBallLegendKey fill={colorMode === 'depth' ? getEarthquakeColor(10, isDark) : BEACH_BALL_STYLE.neutralFill} />
              )}
            </div>
          </LegendSection>
        )}
      </MapLegend>
    </div>
  );
}
