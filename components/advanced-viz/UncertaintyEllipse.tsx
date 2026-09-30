'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  UncertaintyEllipse as UncertaintyEllipseType,
  createUncertaintyEllipseOptions,
  describeUncertaintyEllipse,
  generateEllipsePoints,
} from '@/lib/uncertainty-utils';
import { ensureMapPane } from '@/components/map/map-panes';

/**
 * Pane for uncertainty ellipses: above the fault lines (380), below the event canvas in
 * Leaflet's overlayPane (400). Under the events, an ellipse never covers a marker or
 * swallows its click (a canvas above the events would take every click on the map).
 */
export const UNCERTAINTY_PANE = Object.freeze({ name: 'uncertainty', zIndex: 390 });

/** Thin outline in the event's own colour, a faint fill, dashed when only approximate. */
export const UNCERTAINTY_ELLIPSE_STYLE = Object.freeze({
  weight: 1,
  opacity: 0.8,
  fillOpacity: 0.08,
  /** Lat/lon-marginal extents are not confidence regions: drawn dashed. */
  approximateDashArray: '3 3',
});

/**
 * Path options for an ellipse drawn in `color` (the event's marker colour). Without a
 * colour, the legacy display-weight colours (createUncertaintyEllipseOptions).
 */
export function uncertaintyEllipsePathOptions(ellipse: Pick<UncertaintyEllipseType, 'source' | 'displayWeight'>, color?: string): L.PathOptions {
  if (!color) return createUncertaintyEllipseOptions(ellipse as UncertaintyEllipseType);
  const { weight, opacity, fillOpacity, approximateDashArray } = UNCERTAINTY_ELLIPSE_STYLE;
  return {
    color,
    weight,
    opacity,
    fillColor: color,
    fillOpacity,
    dashArray: ellipse.source === 'latlon-marginals' ? approximateDashArray : undefined,
  };
}

const km = (metres: number) => (metres / 1000).toFixed(1);
const percent = (level: number) => (Number.isInteger(level) ? String(level) : level.toFixed(1));

/**
 * One-line plain-text summary of a drawn ellipse, for the event popup:
 * "8.0 × 2.0 km, 90% confidence", "radius 5.0 km", "≈ 2.2 × 1.1 km (lat/lon errors)".
 */
export function formatEllipseSummary(ellipse: UncertaintyEllipseType): string {
  const confidence = ellipse.confidenceLevel !== undefined ? `, ${percent(ellipse.confidenceLevel)}% confidence` : '';
  if (ellipse.source === 'latlon-marginals') {
    return `≈ ${km(ellipse.semiMajorAxis)} × ${km(ellipse.semiMinorAxis)} km (lat/lon errors)`;
  }
  if (ellipse.source === 'horizontal-circle') return `radius ${km(ellipse.semiMajorAxis)} km${confidence}`;
  if (ellipse.orientationKnown === false) {
    return `${km(ellipse.semiMajorAxis)} × ${km(ellipse.reportedSemiMinorAxis ?? ellipse.semiMinorAxis)} km, azimuth not reported${confidence}`;
  }
  return `${km(ellipse.semiMajorAxis)} × ${km(ellipse.semiMinorAxis)} km${confidence}`;
}

export interface EllipseLegendSummary {
  /** Label for the reported (agency) ellipses and circles, or null when none is drawn. */
  reported: string | null;
  /** Whether any drawn shape is only an approximate lat/lon-marginal extent. */
  approximate: boolean;
}

/**
 * What the drawn ellipses mean, for the legend: the confidence level(s) the agencies
 * state for them ("90% confidence", "68–90% confidence"), "confidence not recorded" when
 * no level is stored, and whether some are only lat/lon-marginal extents.
 */
export function summarizeEllipseConfidence(ellipses: ReadonlyArray<Pick<UncertaintyEllipseType, 'source' | 'confidenceLevel'>>): EllipseLegendSummary {
  const reported = ellipses.filter((ellipse) => ellipse.source !== 'latlon-marginals');
  const levels = Array.from(new Set(reported.map((ellipse) => ellipse.confidenceLevel).filter((level): level is number => typeof level === 'number' && Number.isFinite(level))))
    .sort((a, b) => a - b);
  const unstated = reported.some((ellipse) => ellipse.confidenceLevel === undefined);
  let label: string | null = null;
  if (reported.length > 0) {
    if (levels.length === 0) label = 'Error ellipse, confidence not recorded';
    else {
      const range = levels.length === 1 ? percent(levels[0]) : `${percent(levels[0])}–${percent(levels[levels.length - 1])}`;
      label = `Error ellipse, ${range}% confidence${unstated ? ' (some not recorded)' : ''}`;
    }
  }
  return { reported: label, approximate: ellipses.some((ellipse) => ellipse.source === 'latlon-marginals') };
}

/** Legend rows for the ellipse overlay: neutral swatches, solid = reported, dashed = approximate. */
export function UncertaintyEllipseLegendKey({ ellipses }: { ellipses: ReadonlyArray<Pick<UncertaintyEllipseType, 'source' | 'confidenceLevel'>> }) {
  const { reported, approximate } = summarizeEllipseConfidence(ellipses);
  if (!reported && !approximate) return null;
  const swatch = (dashed: boolean) => (
    <svg width="20" height="12" viewBox="0 0 20 12" className="flex-shrink-0 text-muted-foreground" aria-hidden>
      <ellipse cx="10" cy="6" rx="8.5" ry="4.5" fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth="1"
        strokeDasharray={dashed ? UNCERTAINTY_ELLIPSE_STYLE.approximateDashArray : undefined} />
    </svg>
  );
  return (
    <div data-legend="uncertainty" className="space-y-1">
      {reported && (
        <div className="flex items-center gap-1.5" data-ellipse-key="reported">
          {swatch(false)}
          <span className="text-[11px] leading-4">{reported}</span>
        </div>
      )}
      {approximate && (
        <div className="flex items-center gap-1.5" data-ellipse-key="approximate">
          {swatch(true)}
          <span className="text-[11px] leading-4">Approx. extent (lat/lon errors)</span>
        </div>
      )}
    </div>
  );
}

interface UncertaintyEllipseProps {
  ellipse: UncertaintyEllipseType;
  eventId: string | number;
  /** The event's marker colour; omit for the legacy display-weight colours. */
  color?: string;
  /**
   * Hover tooltip with the ellipse's provenance (describeUncertaintyEllipse). Off by
   * default: the ellipse sits under the event canvas, which takes the pointer, and the
   * event popup carries the same information.
   */
  interactive?: boolean;
}

/** Stable identity for an ellipse's geometry and labelling. */
function ellipseKey(ellipse: UncertaintyEllipseType): string {
  return [
    ellipse.center[0], ellipse.center[1], ellipse.semiMajorAxis, ellipse.semiMinorAxis, ellipse.rotation,
    ellipse.source, ellipse.orientationKnown, ellipse.reportedSemiMinorAxis, ellipse.confidenceLevel,
  ].join('|');
}

/**
 * Location-uncertainty ellipse on a Leaflet map, in the UNCERTAINTY_PANE under the
 * events. The polygon is rebuilt only when the geometry changes; a colour change restyles it.
 */
export function UncertaintyEllipse({ ellipse, eventId, color, interactive = false }: UncertaintyEllipseProps) {
  const map = useMap();
  const key = ellipseKey(ellipse);
  // The parent rebuilds ellipse objects on every viewport change; only the values matter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableEllipse = useMemo(() => ellipse, [key]);
  const pathOptions = useMemo(
    () => uncertaintyEllipsePathOptions(stableEllipse, color),
    [stableEllipse, color]
  );
  const layerRef = useRef<L.Polygon | null>(null);
  const pathOptionsRef = useRef(pathOptions);

  useEffect(() => {
    if (!map || !stableEllipse) return;
    ensureMapPane(map, UNCERTAINTY_PANE);

    // L.ellipse is not in base Leaflet: draw the ellipse as a polygon.
    const points = generateEllipsePoints(
      stableEllipse.center,
      stableEllipse.semiMajorAxis,
      stableEllipse.semiMinorAxis,
      stableEllipse.rotation
    );
    const layer = L.polygon(points, { ...pathOptionsRef.current, pane: UNCERTAINTY_PANE.name, interactive });

    // The tooltip states what was reported and what is drawn: an agency ellipse is a
    // confidence region at the agency's level, only the lat/lon-marginal construction is
    // an uncalibrated extent (see describeUncertaintyEllipse).
    layer.bindTooltip(describeUncertaintyEllipse(stableEllipse), { permanent: false, direction: 'top' });
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      if (layerRef.current === layer) layerRef.current = null;
    };
  }, [map, stableEllipse, eventId, interactive]);

  useEffect(() => {
    pathOptionsRef.current = pathOptions;
    layerRef.current?.setStyle(pathOptions);
  }, [pathOptions]);

  return null;
}
