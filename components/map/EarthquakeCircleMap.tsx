'use client';

import { useCallback, useMemo, useState, memo } from 'react';
import { MapContainer, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import { useMapColors } from '@/hooks/use-map-theme';
import type { MapDetail } from '@/lib/map-event-selection';
import { getEarthquakeColor } from '@/lib/earthquake-utils';
import { getAzimuthalGapColor } from '@/lib/uncertainty-utils';
import { getQualityColor } from '@/lib/quality-scoring';
import { FIT_BOUNDS_OPTIONS, MAP_ZOOM_OPTIONS } from '@/lib/map-style';
import { eventsFitBounds } from '@/lib/map-view';
import { cn } from '@/lib/utils';
import { resolveEventQuality } from '@/components/events/event-quality';
import { MapViewportObserver } from './MapViewportObserver';
import { MapDetailControl } from './MapDetailControl';
import { EarthquakeMarkerLayer } from './EarthquakeMarkerLayer';
import { MapLayerControl } from './MapLayerControl';
import { MapScaleBar } from './MapScaleBar';
import { MapStatusChip } from './MapStatusChip';
import { MapStylePanel, StylePanelSection, StyleRadioGroup } from './MapStylePanel';
import { FitMapToEvents } from './FitMapToEvents';
import { OptimizedEventPopup } from './OptimizedEventPopup';
import {
  COLOR_MODE_LABELS, ColorModeLegendSection, LegendSection, MagnitudeSizeKey, MapLegend,
  UNKNOWN_SOURCE_KEY, buildCatalogueColorScale, resolveSourceCatalogue, type MapColorMode,
} from './MapLegend';

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

  // Popup details (shown only when present).
  depth_uncertainty?: number | null;
  depth_type?: string | null;
  source_id?: string | null;
  used_station_count?: number | null;

  // C1: stored quality score/grade (resolveEventQuality prefers these; see event-quality.ts).
  quality_score?: number | null;
  quality_grade?: string | null;

  // Station-coverage / azimuthal-gap colour mode.
  azimuthal_gap?: number | null;

  // Source-catalogue colour mode (contract C2; see MapLegend.resolveSourceCatalogue).
  /** Stamped by catalogue-event-loader with the catalogue this row was fetched from. */
  catalogue?: string | null;
  /** Distinct catalogue ids that contributed to a merged row. */
  source_catalogue_ids?: string[] | null;
  /** Full per-source provenance JSON; only present when the caller fetched full events. */
  source_events?: string | null;
}

interface EarthquakeCircleMapProps {
  events: CircleMapEvent[];
  sampleSize: MapDetail;
  onSampleSizeChange: (size: MapDetail) => void;
  /** Fixed initial view. Omit both to frame the events (the default). */
  center?: [number, number];
  zoom?: number;
  /** CSS height of the map; the map fills it. */
  height?: string;
  mapKey?: string;
  /** Extra classes for the map wrapper (e.g. rounding to match the enclosing card). */
  className?: string;
  /**
   * Optional catalogue id -> display name lookup for the source-catalogue colour mode.
   * Without it, a merged row's contributing catalogues are labelled by their raw id.
   */
  catalogueNames?: Record<string, string>;
}

/** Colour modes this map offers (paper sec:viz: depth, quality grade, azimuthal gap,
 *  source catalogue). Magnitude is encoded by size only, so it is not a colour choice. */
const COLOR_MODES: MapColorMode[] = ['depth', 'quality', 'azimuthal-gap', 'source-catalogue'];
const COLOR_MODE_OPTIONS = COLOR_MODES.map((value) => ({ value, label: COLOR_MODE_LABELS[value] }));

const STYLE_INFO = (
  <>
    Colour shows the chosen attribute; marker size always shows magnitude. <b>Quality</b> is the
    location quality score (Q 0–100). <b>Azimuthal gap</b> is the largest angle between recording
    stations seen from the epicentre. <b>Source catalogue</b> is, for a merged event, the catalogue
    whose solution the row publishes. <b>Map detail</b> caps how many events are drawn at once;
    zoom in to see more.
  </>
);

export const EarthquakeCircleMap = memo(function EarthquakeCircleMap({
  events,
  sampleSize,
  onSampleSizeChange,
  center,
  zoom,
  height = '600px',
  mapKey = 'earthquake-circle-map',
  className,
  catalogueNames,
}: EarthquakeCircleMapProps) {
  const { isDark } = useMapColors();
  const [colorMode, setColorMode] = useState<MapColorMode>('depth');

  const { sampled: sampledEvents, displayCount, visibleCount, onViewportChange } = useMapEventSelection(events, sampleSize);
  const { activePopup, onEventClick, closePopup } = useEventMapPopup(events, mapKey);

  // Frame the events (antimeridian aware; NZ when empty). MapContainer reads the bounds once,
  // on creation; FitMapToEvents keeps framing them while events stream in.
  const fixedView = center !== undefined && zoom !== undefined;
  const bounds = useMemo(() => (fixedView ? null : eventsFitBounds(events)), [events, fixedView]);

  // Quality scores (C1: prefer the stored quality_score/quality_grade; see event-quality.ts).
  const qualityScoreMap = useMemo(() => {
    if (colorMode !== 'quality') return new Map<CircleMapEvent['id'], ReturnType<typeof resolveEventQuality>>();
    return new Map(sampledEvents.map(event => [event.id, resolveEventQuality(event)]));
  }, [sampledEvents, colorMode]);

  // Source-catalogue category per event (contract C2), resolved over ALL events so a
  // catalogue keeps its colour as the viewport sample changes.
  const sourceCatalogueInfoMap = useMemo(() => {
    if (colorMode !== 'source-catalogue') return new Map<CircleMapEvent['id'], ReturnType<typeof resolveSourceCatalogue>>();
    return new Map(events.map(event => [event.id, resolveSourceCatalogue(event, catalogueNames)]));
  }, [events, colorMode, catalogueNames]);

  const sourceCatalogueScale = useMemo(
    () => buildCatalogueColorScale(Array.from(sourceCatalogueInfoMap.values()), { isDark }),
    [sourceCatalogueInfoMap, isDark]
  );

  const getEventColor = useCallback((event: CircleMapEvent) => {
    if (colorMode === 'quality') {
      const quality = qualityScoreMap.get(event.id);
      return getQualityColor(quality ? quality.score : null);
    }
    if (colorMode === 'azimuthal-gap') {
      return getAzimuthalGapColor(event.azimuthal_gap);
    }
    if (colorMode === 'source-catalogue') {
      const info = sourceCatalogueInfoMap.get(event.id);
      return sourceCatalogueScale.colorFor(info?.key ?? UNKNOWN_SOURCE_KEY);
    }
    return getEarthquakeColor(event.depth, isDark);
  }, [colorMode, qualityScoreMap, isDark, sourceCatalogueInfoMap, sourceCatalogueScale]);

  const popupEvent = activePopup?.event;
  const popupQuality = useMemo(
    () => (popupEvent && colorMode === 'quality' ? resolveEventQuality(popupEvent) : null),
    [popupEvent, colorMode]
  );

  return (
    <div className={cn('relative isolate overflow-hidden', className)} style={{ height }}>
      <MapContainer
        key={mapKey}
        {...(bounds ? { bounds, boundsOptions: FIT_BOUNDS_OPTIONS } : { center, zoom })}
        className="h-full w-full"
        minZoom={2}
        maxZoom={18}
        {...MAP_ZOOM_OPTIONS}
        preferCanvas={true}
      >
        <MapLayerControl position="topright" />
        <MapScaleBar />
        {bounds && <FitMapToEvents bounds={bounds} />}
        <MapViewportObserver onChange={onViewportChange} />
        <EarthquakeMarkerLayer
          events={sampledEvents}
          getColor={getEventColor}
          isDark={isDark}
          selectedId={popupEvent?.id ?? null}
          onEventClick={onEventClick}
        />
        {activePopup && (
          <Popup
            key={activePopup.seq}
            position={activePopup.position}
            minWidth={260}
            maxWidth={300}
            autoPanPadding={[48, 48]}
            eventHandlers={{ remove: () => closePopup(activePopup.seq) }}
          >
            <OptimizedEventPopup event={activePopup.event} quality={popupQuality} />
          </Popup>
        )}
      </MapContainer>

      <MapStylePanel info={STYLE_INFO}>
        <StyleRadioGroup
          name={`circle-colorMode-${mapKey}`}
          legend="Colour by"
          value={colorMode}
          onChange={setColorMode}
          options={COLOR_MODE_OPTIONS}
        />
        <StylePanelSection>
          <MapDetailControl value={sampleSize} onChange={onSampleSizeChange} />
        </StylePanelSection>
      </MapStylePanel>

      <MapStatusChip shown={displayCount} total={visibleCount} />

      {/* Legend: every key is generated from the functions that colour and size the markers. */}
      <MapLegend>
        <ColorModeLegendSection mode={colorMode} isDark={isDark} catalogueLegend={sourceCatalogueScale.legend} />
        <LegendSection title="Magnitude">
          <MagnitudeSizeKey isDark={isDark} />
        </LegendSection>
      </MapLegend>
    </div>
  );
});
