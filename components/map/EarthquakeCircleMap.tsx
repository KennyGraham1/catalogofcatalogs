'use client';

import { useEffect, useCallback, useMemo, useState, memo } from 'react';
import { useMapEventSelection } from '@/hooks/use-map-event-selection';
import { MapViewportObserver } from './MapViewportObserver';
import { MapDetailControl } from './MapDetailControl';
import type { MapDetail } from '@/lib/map-event-selection';
import { EarthquakeMarkerLayer } from './EarthquakeMarkerLayer';
import {
  DepthLegendItems, MagnitudeLegendItems, QualityLegendItems, AzimuthalGapLegendItems,
  SourceCatalogueLegendItems, resolveSourceCatalogue, buildCatalogueColorScale,
} from './MapLegend';
import { useEventMapPopup } from '@/hooks/use-event-map-popup';
import L from 'leaflet';
import { MapContainer, Popup } from 'react-leaflet';
import { MapLayerControl } from '@/components/map/MapLayerControl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Activity, Calendar, Ruler, MapPin, Info, Layers } from 'lucide-react';
import { InfoTooltip, TechnicalTermTooltip } from '@/components/ui/info-tooltip';
import { getEarthquakeColor, getMagnitudeLabel } from '@/lib/earthquake-utils';
import { getAzimuthalGapColor } from '@/lib/uncertainty-utils';
import { getQualityColor } from '@/lib/quality-scoring';
import { resolveEventQuality } from '@/components/events/event-quality';
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
  center?: [number, number];
  zoom?: number;
  height?: string;
  mapKey?: string;
  /**
   * Optional catalogue id -> display name lookup for the source-catalogue colour mode.
   * Without it, a merged row's contributing catalogues are labelled by their raw id.
   */
  catalogueNames?: Record<string, string>;
}

/** Colour modes this map's selector offers (paper sec:viz: depth, quality grade,
 *  azimuthal gap, source catalogue). Magnitude is size-only here, matching the existing
 *  legend ("Magnitude (Size)"), so it is not also a colour choice. */
type CircleMapColorMode = 'depth' | 'quality' | 'azimuthal-gap' | 'source-catalogue';

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
  catalogueNames,
}: EarthquakeCircleMapProps) {
  const mapColors = useMapColors();
  const [colorMode, setColorMode] = useState<CircleMapColorMode>('depth');

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

  // Quality scores (C1: prefer the stored quality_score/quality_grade; see event-quality.ts).
  const qualityScoreMap = useMemo(() => {
    if (colorMode !== 'quality') return new Map<CircleMapEvent['id'], ReturnType<typeof resolveEventQuality>>();
    return new Map(sampledEvents.map(event => [event.id, resolveEventQuality(event)]));
  }, [sampledEvents, colorMode]);

  // Source-catalogue category per event (contract C2) and the categorical scale/legend it implies.
  const sourceCatalogueInfoMap = useMemo(() => {
    if (colorMode !== 'source-catalogue') return new Map<CircleMapEvent['id'], ReturnType<typeof resolveSourceCatalogue>>();
    return new Map(sampledEvents.map(event => [event.id, resolveSourceCatalogue(event, catalogueNames)]));
  }, [sampledEvents, colorMode, catalogueNames]);

  const sourceCatalogueScale = useMemo(
    () => buildCatalogueColorScale(Array.from(sourceCatalogueInfoMap.values())),
    [sourceCatalogueInfoMap]
  );

  const getEventColor = useCallback((event: CircleMapEvent) => {
    if (colorMode === 'quality') {
      const quality = qualityScoreMap.get(event.id);
      return quality ? getQualityColor(quality.score) : getEarthquakeColor(event.depth, mapColors.isDark);
    }
    if (colorMode === 'azimuthal-gap') {
      return getAzimuthalGapColor(event.azimuthal_gap);
    }
    if (colorMode === 'source-catalogue') {
      const info = sourceCatalogueInfoMap.get(event.id);
      return sourceCatalogueScale.colorFor(info?.key ?? '__unknown__');
    }
    return getEarthquakeColor(event.depth, mapColors.isDark);
  }, [colorMode, qualityScoreMap, mapColors.isDark, sourceCatalogueInfoMap, sourceCatalogueScale]);

  return (
    <div className="relative" style={{ height }}>
      {/* Map Options: colour-mode selector (paper sec:viz: depth, quality grade,
          azimuthal gap, source catalogue), self-contained so callers need no change. */}
      <Card className="absolute top-4 right-4 z-[2000] p-3 bg-background/95 backdrop-blur-sm shadow-lg max-w-[220px]">
        <div className="flex items-center gap-1.5 mb-2">
          <Layers className="h-3.5 w-3.5" />
          <Label className="text-xs font-medium">Color By</Label>
          <InfoTooltip content="Choose which attribute determines marker color." />
        </div>
        <div className="space-y-1">
          {([
            { mode: 'depth', label: 'Depth', term: 'depth' },
            { mode: 'quality', label: 'Quality', term: 'qualityScore' },
            { mode: 'azimuthal-gap', label: 'Azimuthal Gap', term: 'azimuthalGap' },
          ] as const).map(({ mode, label, term }) => (
            <div key={mode} className="flex items-center gap-2">
              <input
                type="radio"
                id={`circle-color-${mode}`}
                name={`circle-colorMode-${mapKey}`}
                checked={colorMode === mode}
                onChange={() => setColorMode(mode)}
                className="cursor-pointer"
              />
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`circle-color-${mode}`} className="text-xs cursor-pointer">{label}</Label>
                <TechnicalTermTooltip term={term} />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="circle-color-source-catalogue"
              name={`circle-colorMode-${mapKey}`}
              checked={colorMode === 'source-catalogue'}
              onChange={() => setColorMode('source-catalogue')}
              className="cursor-pointer"
            />
            <div className="flex items-center gap-1.5">
              <Label htmlFor="circle-color-source-catalogue" className="text-xs cursor-pointer">Source Catalogue</Label>
              <InfoTooltip content="For a merged event, the catalogue whose solution (time and location) this row publishes; otherwise the catalogue the event came from." />
            </div>
          </div>
        </div>
      </Card>

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

      {/* Legend: swatches come from the same functions that colour the markers above */}
      <Card className="absolute bottom-4 right-4 z-[2000] max-w-[240px] border-border/60 bg-background/90 px-3 py-2.5 text-[11px] leading-tight backdrop-blur-sm shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[11px] font-semibold">
            {colorMode === 'quality' ? 'Quality Score'
              : colorMode === 'azimuthal-gap' ? 'Azimuthal Gap'
              : colorMode === 'source-catalogue' ? 'Source Catalogue'
              : 'Depth (Color)'}
          </h4>
          {colorMode === 'quality' ? (
            <TechnicalTermTooltip term="qualityScore" />
          ) : colorMode === 'azimuthal-gap' ? (
            <TechnicalTermTooltip term="azimuthalGap" />
          ) : colorMode === 'source-catalogue' ? (
            <InfoTooltip content="Which catalogue each plotted event's solution (or source) came from." />
          ) : (
            <TechnicalTermTooltip term="depth" />
          )}
        </div>
        {colorMode === 'quality' ? (
          <QualityLegendItems />
        ) : colorMode === 'azimuthal-gap' ? (
          <AzimuthalGapLegendItems />
        ) : colorMode === 'source-catalogue' ? (
          <SourceCatalogueLegendItems legend={sourceCatalogueScale.legend} />
        ) : (
          <DepthLegendItems isDark={mapColors.isDark} />
        )}

        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-semibold">Magnitude (Size)</h4>
            <TechnicalTermTooltip term="magnitude" />
          </div>
          <MagnitudeLegendItems />
        </div>

        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[10px] text-muted-foreground mb-2">{total.toLocaleString()} total events</p>
          <MapDetailControl value={sampleSize} onChange={onSampleSizeChange} />
        </div>
      </Card>
    </div>
  );
});
