'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { FocalMechanism, generateBeachBallSVG, getMechanismFaultType, selectPlane } from '@/lib/focal-mechanism-utils';
import { magnitudeRadius } from '@/lib/map-style';

/**
 * Beach-ball symbology (the event maps' focal-mechanism mode, components/map/MapOverlays).
 * Lower-hemisphere double-couple, dilatational quadrants white, compressional quadrants
 * filled with the caller's colour (the event's colour in the map's colour mode), thin dark
 * outline.
 */
export const BEACH_BALL_STYLE = Object.freeze({
  /** Compressional fill when no event colour is given, and the legend glyph's shading. */
  neutralFill: '#374151',
  background: '#FFFFFF',
  stroke: '#1F2937',
  /** Diameter law: 2 * marker radius + padding, clamped (see beachBallDiameter). */
  padding: 12,
  minDiameter: 18,
  maxDiameter: 48,
});

/**
 * Icon diameter in px for a magnitude: the event marker's own diameter (magnitudeRadius,
 * lib/map-style.ts) plus 12 px so the ball always covers its marker and stays readable,
 * clamped to 18-48 px. M2 19, M3 22, M4 27, M5 34, M6 45, M7+ 48.
 */
export function beachBallDiameter(magnitude: number | null | undefined): number {
  const { padding, minDiameter, maxDiameter } = BEACH_BALL_STYLE;
  const diameter = Math.round(2 * magnitudeRadius(magnitude) + padding);
  return Math.min(maxDiameter, Math.max(minDiameter, diameter));
}

interface BeachBallMarkerProps {
  position: [number, number];
  mechanism: FocalMechanism;
  eventId: string | number;
  /** Icon diameter in px. Defaults to beachBallDiameter(magnitude), or 40 without one. */
  size?: number;
  /** Event magnitude: sizes the ball and draws larger events on top. */
  magnitude?: number | null;
  /** Compressional quadrant fill (default BEACH_BALL_STYLE.neutralFill). */
  fill?: string;
  /** Opens the event's popup: the ball covers its marker, so it must take the click. */
  onClick?: () => void;
}

/**
 * A focal-mechanism beach ball on a Leaflet map (marker pane, above the event canvas).
 * The icon is rebuilt only when the plane, size or colour changes, and the marker only
 * when its position does, so viewport updates do not churn the DOM.
 */
export function BeachBallMarker({
  position,
  mechanism,
  eventId,
  size,
  magnitude,
  fill = BEACH_BALL_STYLE.neutralFill,
  onClick,
}: BeachBallMarkerProps) {
  const map = useMap();
  const diameter = size ?? (magnitude !== undefined ? beachBallDiameter(magnitude) : 40);
  const plane = selectPlane(mechanism);
  const planeKey = plane ? `${plane.strike}|${plane.dip}|${plane.rake}` : '';

  const icon = useMemo(() => {
    if (!planeKey) return null;
    const svg = generateBeachBallSVG(mechanism, diameter, {
      fill,
      background: BEACH_BALL_STYLE.background,
      stroke: BEACH_BALL_STYLE.stroke,
    });
    if (!svg) return null;
    return L.icon({
      iconUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      iconSize: [diameter, diameter],
      iconAnchor: [diameter / 2, diameter / 2],
      popupAnchor: [0, -diameter / 2],
    });
    // The icon depends on the mechanism only through its selected plane (planeKey):
    // callers re-parse mechanisms on every viewport change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planeKey, diameter, fill]);

  const title = useMemo(() => {
    const style = getMechanismFaultType(mechanism)?.description;
    const deg = (value: number) => `${Math.round(value)}°`;
    return plane ? `Focal mechanism${style ? `: ${style}` : ''} (strike ${deg(plane.strike)}, dip ${deg(plane.dip)}, rake ${deg(plane.rake)})` : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planeKey]);

  const onClickRef = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);
  const clickable = onClick !== undefined;

  const [lat, lng] = position;
  // Larger events on top, as for the event markers (Leaflet stacks markers by screen y
  // plus zIndexOffset; 10,000 per magnitude unit outranks any y difference on screen).
  const zIndexOffset = Number.isFinite(magnitude) ? Math.round((magnitude as number) * 10000) : 0;

  useEffect(() => {
    if (!map || !icon) return;
    const marker = L.marker([lat, lng], {
      icon,
      title,
      alt: title,
      keyboard: false,
      interactive: clickable,
      zIndexOffset,
    });
    if (clickable) marker.on('click', () => onClickRef.current?.());
    marker.addTo(map);
    return () => {
      map.removeLayer(marker);
    };
  }, [map, lat, lng, icon, title, clickable, zIndexOffset, eventId]);

  return null;
}
