'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { CircleMarker } from 'react-leaflet';
import { useMapViewport } from '@/hooks/use-map-viewport';
import { useMapColors } from '@/hooks/use-map-theme';
import { getMagnitudePixelRadius, isEventInBounds } from '@/lib/earthquake-utils';
import { positionInMapWorld } from '@/lib/map-event-selection';
import { MARKER_STYLE, markerPathOptions, markerStrokeStyle } from '@/lib/map-style';

interface MarkerEvent {
  id?: string | number | null;
  latitude: number;
  longitude: number;
  magnitude: number;
}

export interface EarthquakeMarkerLayerProps<T extends MarkerEvent> {
  /** Events to draw (already sampled for the viewport); drawn smallest first, largest on top. */
  events: T[];
  /** Marker fill for an event (depth / quality / gap / catalogue colour function). */
  getColor: (event: T) => string;
  /** Called with the event and the position it was drawn at (the viewed world copy). */
  onEventClick: (event: T, position: [number, number]) => void;
  /** Theme for the marker stroke; defaults to the site theme. */
  isDark?: boolean;
  /**
   * Id of the event whose popup is open. When given, the clicked marker keeps the
   * highlighted stroke until this changes (pass null when the popup closes). Omit to
   * disable persistent selection; hover highlighting works either way.
   */
  selectedId?: string | number | null;
  /** @deprecated Fill opacity comes from MARKER_STYLE; an explicit value still overrides it. */
  opacity?: number;
  /**
   * HTML for the hover card of an event (lib/map-event-card.ts buildEventCardHtml), or
   * null for none. Bound to the hovered marker only and removed on mouse-out or click.
   */
  hoverCard?: (event: T) => string | null;
}

/** Leaflet tooltip options for the event hover card. */
const HOVER_CARD_OPTIONS: L.TooltipOptions = { direction: 'top', offset: [0, -8], opacity: 1, className: 'eq-hover-card' };

/** A Leaflet path we can restyle (react-leaflet test doubles hand handlers DOM events). */
function asPath(target: unknown): L.Path | null {
  return target && typeof (target as L.Path).setStyle === 'function' ? target as L.Path : null;
}

/**
 * Earthquake markers: screen-pixel CircleMarkers on a dedicated canvas renderer (keeps
 * 3,000+ markers smooth), sized by getMagnitudePixelRadius and styled by
 * markerPathOptions. Offscreen events are culled; marker reconciliation is kept out of
 * popup/control updates. Hover and selection restyle the Leaflet layer directly, so they
 * never re-render the marker list.
 */
export const EarthquakeMarkerLayer = memo(function EarthquakeMarkerLayer<T extends MarkerEvent>({
  events, getColor, onEventClick, isDark: isDarkProp, selectedId, opacity, hoverCard,
}: EarthquakeMarkerLayerProps<T>) {
  const { bounds } = useMapViewport();
  const colors = useMapColors();
  const isDark = isDarkProp ?? colors.isDark;
  const trackSelection = selectedId !== undefined;
  const fillOpacity = opacity ?? MARKER_STYLE.fillOpacity;

  // One canvas per layer, with generous padding so panning rarely exposes an undrawn edge.
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  useEffect(() => () => { renderer.remove(); }, [renderer]);

  // Shared path options per fill colour and theme: the same object across viewport
  // rebuilds, so react-leaflet skips a setStyle() on every marker for every pan.
  const styleCache = useRef(new Map<string, L.PathOptions>());
  const selected = useRef<{ id: string | number | null | undefined; layer: L.Path } | null>(null);

  const ordered = useMemo(() => [...events].sort((a, b) => a.magnitude - b.magnitude), [events]);

  const markers = useMemo(() => {
    if (!bounds) return null;
    const baseStroke = { ...markerStrokeStyle(isDark), fillOpacity };
    const hoverStroke = markerStrokeStyle(isDark, true);
    const optionsFor = (fill: string) => {
      const key = `${fill}|${isDark}|${fillOpacity}`;
      let options = styleCache.current.get(key);
      if (!options) {
        options = { ...markerPathOptions(fill, isDark), fillOpacity };
        styleCache.current.set(key, options);
      }
      return options;
    };
    return ordered.filter(event => isEventInBounds(event, bounds)).map((event, index) => {
      // Draw in the world copy the user is viewing (NZ commonly straddles 180°).
      const position = positionInMapWorld(event, bounds);
      return <CircleMarker
        key={event.id ?? index}
        center={position}
        radius={getMagnitudePixelRadius(event.magnitude)}
        renderer={renderer}
        pathOptions={optionsFor(getColor(event))}
        eventHandlers={{
          mouseover: (e) => {
            const layer = asPath(e.target);
            if (layer && selected.current?.layer !== layer) layer.setStyle(hoverStroke);
            const html = hoverCard?.(event);
            const target = e.target as L.Layer | undefined;
            if (html && target && typeof target.bindTooltip === 'function') target.bindTooltip(html, HOVER_CARD_OPTIONS).openTooltip();
          },
          mouseout: (e) => {
            const layer = asPath(e.target);
            if (layer && selected.current?.layer !== layer) layer.setStyle(baseStroke);
            const target = e.target as L.Layer | undefined;
            if (target && typeof target.unbindTooltip === 'function') target.unbindTooltip();
          },
          click: (e) => {
            // The popup replaces the hover card.
            const clicked = e?.target as L.Layer | undefined;
            if (clicked && typeof clicked.unbindTooltip === 'function') clicked.unbindTooltip();
            const layer = asPath(e?.target);
            if (layer && trackSelection) {
              if (selected.current && selected.current.layer !== layer) selected.current.layer.setStyle(baseStroke);
              selected.current = { id: event.id, layer };
              layer.setStyle(hoverStroke);
              layer.bringToFront();
            }
            onEventClick(event, position);
          },
        }}
      />;
    });
  }, [ordered, bounds, getColor, isDark, fillOpacity, renderer, trackSelection, onEventClick, hoverCard]);

  // Drop the highlight when the selection moves on (popup closed, another event chosen),
  // and re-apply it after a rebuild restyled the selected marker.
  useEffect(() => {
    const current = selected.current;
    if (!current) return;
    if (!trackSelection || current.id !== selectedId) {
      current.layer.setStyle({ ...markerStrokeStyle(isDark), fillOpacity });
      selected.current = null;
    } else {
      current.layer.setStyle(markerStrokeStyle(isDark, true));
    }
  }, [selectedId, trackSelection, isDark, fillOpacity, markers]);

  return markers;
}) as <T extends MarkerEvent>(props: EarthquakeMarkerLayerProps<T>) => React.ReactNode;
