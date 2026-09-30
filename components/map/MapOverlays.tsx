'use client';

/**
 * The three map overlays - active faults, uncertainty ellipses and focal mechanisms - and
 * their Style-panel switches and legend keys, shared by every event map (analytics
 * UnifiedEarthquakeMap, the catalogue / dashboard / merge-result EarthquakeCircleMap) and,
 * for faults alone, the small merge-group and region maps.
 *
 * Focal mechanisms are a display MODE, not an extra layer: while the switch is on the
 * event circles are hidden and each plotted event with a mechanism is drawn as its beach
 * ball instead (the MAX_FOCAL_MECHANISMS largest, at any zoom). Faults and ellipses keep
 * working in that mode.
 *
 * Composition inside an event map:
 * ```tsx
 * const faultData = useFaultData(showFaults);
 * const mechanismsMode = showFocalMechanisms;
 * const overlays = useEventOverlays({ events: sampled, getPosition, showUncertainty, showFocalMechanisms: mechanismsMode });
 * <MapContainer>
 *   {showFaults && <FaultsOverlay data={faultData} isDark={isDark} />}
 *   <UncertaintyEllipsesOverlay items={overlays.ellipses.items} getColor={getEventColor} />
 *   {!mechanismsMode && <EarthquakeMarkerLayer … />}
 *   <FocalMechanismsOverlay items={overlays.mechanisms.items} getFill={getEventColor} onEventClick={onEventClick} />
 * </MapContainer>
 * <MapStylePanel>… <MapOverlayToggles faults={…} uncertainty={…} focalMechanisms={…} /> …</MapStylePanel>
 * {mechanismsMode ? <FocalMechanismStatus … /> : <MapStatusChip … />}
 * <MapLegend>colour key, {mechanismsMode ? <FocalMechanismLegendSection /> : magnitude key}, <MapOverlayLegendSection … /></MapLegend>
 * ```
 * Faults sit in their own pane (z 380) under the ellipses (390) and the event canvas
 * (overlay pane, 400); beach balls in the marker pane (600).
 */

import { useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { GeoJSON, useMap } from 'react-leaflet';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { loadFaultData, type FaultCollection } from '@/lib/fault-data';
import { calculateUncertaintyEllipse, type UncertaintyData } from '@/lib/uncertainty-utils';
import { parseFocalMechanism, selectPlane } from '@/lib/focal-mechanism-utils';
import {
  FAULT_ATTRIBUTION, FAULT_LEGEND_LABEL, FAULT_STYLE, MAGNITUDE_KEY_MAGNITUDES, MAP_OVERLAY_CLASS, MAP_PANES,
  faultPathOptions,
} from '@/lib/map-style';
import { formatCount } from '@/lib/map-format';
import { cn } from '@/lib/utils';
import {
  UncertaintyEllipse, UncertaintyEllipseLegendKey, formatEllipseSummary,
} from '@/components/advanced-viz/UncertaintyEllipse';
import { BEACH_BALL_STYLE, BeachBallMarker, beachBallDiameter } from '@/components/advanced-viz/BeachBallMarker';
import { ensureMapPane } from './map-panes';
import { FaultLineKey, LegendSection } from './MapLegend';
import { MapStatusChip } from './MapStatusChip';
import { StylePanelSection } from './MapStylePanel';

// ---------------------------------------------------------------------------------------
// Limits and labels
// ---------------------------------------------------------------------------------------

/** Uncertainty ellipses are drawn only for the plotted (sampled, in-view) events, and
 *  further capped here: each is a 64-point polygon, so one per sampled event (up to a few
 *  thousand) would stall the browser. The largest-magnitude events are kept first. */
export const MAX_MAP_OVERLAYS = 150;

/** Mechanisms mode draws at most this many beach balls - the largest-magnitude plotted
 *  events with a mechanism - at any zoom; zooming in brings in the rest. */
export const MAX_FOCAL_MECHANISMS = 300;

/** Switch labels (one place, so every map names the overlays the same way). */
export const OVERLAY_LABELS = Object.freeze({
  faults: 'Active faults',
  uncertainty: 'Uncertainty ellipses',
  focalMechanisms: 'Focal mechanisms',
});

/** What the focal-mechanism switch does (the note under it). */
export const FOCAL_MECHANISM_DESCRIPTION = 'Show beach balls instead of event circles.';

/** Notes for a switch whose overlay has nothing to draw in the loaded events. */
export const OVERLAY_UNAVAILABLE_REASONS = Object.freeze({
  uncertainty: 'No location uncertainties in this catalogue.',
  focalMechanisms: 'No focal mechanisms in this catalogue.',
});

/** The notice over a map in mechanisms mode with nothing to draw. */
export const NO_FOCAL_MECHANISMS = Object.freeze({
  catalogue: 'No focal mechanisms in this catalogue',
  view: 'No focal mechanisms in view',
});

/** The overlay sentences of a map's Style-panel (?) text. */
export function OverlayStyleInfo({ faults = false }: { faults?: boolean }) {
  return (
    <>
      {faults && <><b>Active faults</b> are the GNS Science NZ Active Faults Database traces. </>}
      <b>Uncertainty ellipses</b> show each event&apos;s reported horizontal location error in the
      event&apos;s colour (dashed: approximate, from lat/lon errors) for the {MAX_MAP_OVERLAYS} largest
      plotted events. <b>Focal mechanisms</b> replace the event circles with lower-hemisphere beach
      balls sized by magnitude, compressional quadrants in the event&apos;s colour and dilatational
      quadrants white, for the {MAX_FOCAL_MECHANISMS} largest plotted events with one.
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Event overlays: ellipses and beach balls
// ---------------------------------------------------------------------------------------

/** What an event needs for the ellipse and beach-ball overlays (summary rows carry all of it). */
export interface OverlayEvent extends UncertaintyData {
  id: string | number;
  magnitude: number;
  depth?: number | null;
  focal_mechanisms?: string | null;
  /** QuakeML preferredFocalMechanismID: which of focal_mechanisms is authoritative. */
  preferred_focal_mechanism_id?: string | null;
}

/** Non-null result shapes, named once. */
export type MapUncertaintyEllipse = NonNullable<ReturnType<typeof calculateUncertaintyEllipse>>;
export type MapFocalMechanism = NonNullable<ReturnType<typeof parseFocalMechanism>>;

export interface EllipseOverlayItem<E> { event: E; ellipse: MapUncertaintyEllipse }
export interface FocalMechanismOverlayItem<E> { event: E; position: [number, number]; mechanism: MapFocalMechanism }

export interface EventOverlays<E> {
  /** Ellipses drawn (<= MAX_MAP_OVERLAYS) and how many plotted events have one. */
  ellipses: { items: Array<EllipseOverlayItem<E>>; total: number };
  /** Beach balls drawn (<= MAX_FOCAL_MECHANISMS, largest first) and how many plotted events have one. */
  mechanisms: { items: Array<FocalMechanismOverlayItem<E>>; total: number };
  /** Note under the ellipse switch (undefined: none). */
  ellipseNote: string | undefined;
}

/** The event's drawable mechanism (preferred_focal_mechanism_id first), or null. */
export function drawableFocalMechanism(event: Pick<OverlayEvent, 'focal_mechanisms' | 'preferred_focal_mechanism_id'>): MapFocalMechanism | null {
  if (!event.focal_mechanisms) return null;
  const mechanism = parseFocalMechanism(event.focal_mechanisms, event.preferred_focal_mechanism_id);
  return mechanism !== null && selectPlane(mechanism) !== null ? mechanism : null;
}

export function uncertaintyOverlayNote(show: boolean, total: number): string | undefined {
  if (!show) return undefined;
  if (total === 0) return 'No plotted event reports a location uncertainty.';
  if (total > MAX_MAP_OVERLAYS) return `Showing the ${MAX_MAP_OVERLAYS} largest of ${formatCount(total)} plotted events.`;
  return undefined;
}

/**
 * Ellipses and beach balls for the plotted events, largest magnitude first so the caps keep
 * the most significant events deterministically rather than depending on the spatial
 * sampling order. Ellipses: reported error ellipse first, then circular horizontal
 * uncertainty, then lat/lon marginals (calculateUncertaintyEllipse), capped at
 * MAX_MAP_OVERLAYS. Beach balls: the stored focal_mechanisms JSON, preferring
 * preferred_focal_mechanism_id, capped at MAX_FOCAL_MECHANISMS at any zoom.
 */
export function useEventOverlays<E extends OverlayEvent>({
  events, getPosition, showUncertainty, showFocalMechanisms,
}: {
  /** The plotted (filtered, viewport-sampled) events. */
  events: E[];
  /** Where the event is drawn (its viewed world copy). */
  getPosition: (event: E) => [number, number];
  showUncertainty: boolean;
  showFocalMechanisms: boolean;
}): EventOverlays<E> {
  const candidates = useMemo(
    () => (showUncertainty || showFocalMechanisms ? [...events].sort((a, b) => b.magnitude - a.magnitude) : []),
    [events, showUncertainty, showFocalMechanisms]
  );

  const ellipses = useMemo((): EventOverlays<E>['ellipses'] => {
    if (!showUncertainty) return { items: [], total: 0 };
    const withEllipse = candidates
      .map(event => ({ event, ellipse: calculateUncertaintyEllipse(event) }))
      .filter((x): x is EllipseOverlayItem<E> => x.ellipse !== null);
    const items = withEllipse.slice(0, MAX_MAP_OVERLAYS).map(({ event, ellipse }) => ({
      event,
      ellipse: { ...ellipse, center: getPosition(event) },
    }));
    return { items, total: withEllipse.length };
  }, [candidates, showUncertainty, getPosition]);

  const mechanisms = useMemo((): EventOverlays<E>['mechanisms'] => {
    if (!showFocalMechanisms) return { items: [], total: 0 };
    const withMechanism = candidates
      .map(event => ({ event, mechanism: drawableFocalMechanism(event) }))
      .filter((x): x is { event: E; mechanism: MapFocalMechanism } => x.mechanism !== null);
    const items = withMechanism.slice(0, MAX_FOCAL_MECHANISMS).map(({ event, mechanism }) => ({
      event,
      position: getPosition(event),
      mechanism,
    }));
    return { items, total: withMechanism.length };
  }, [candidates, showFocalMechanisms, getPosition]);

  return { ellipses, mechanisms, ellipseNote: uncertaintyOverlayNote(showUncertainty, ellipses.total) };
}

/**
 * Whether the loaded events have anything for the ellipse and beach-ball overlays at all
 * (over every event, not just the plotted ones): a switch that could never draw anything
 * is shown disabled with the reason, and the empty mechanisms notice says "in this
 * catalogue" rather than "in view". Stops at the first event that has one.
 */
export function useOverlayDataAvailability(events: ReadonlyArray<OverlayEvent>): { uncertainty: boolean; focalMechanisms: boolean } {
  return useMemo(() => ({
    uncertainty: events.some(event => calculateUncertaintyEllipse(event) !== null),
    focalMechanisms: events.some(event => drawableFocalMechanism(event) !== null),
  }), [events]);
}

/** Uncertainty ellipses in the event's own colour, in their pane under the event markers. */
export function UncertaintyEllipsesOverlay<E extends { id: string | number }>({
  items, getColor,
}: { items: ReadonlyArray<EllipseOverlayItem<E>>; getColor: (event: E) => string }) {
  return (
    <>
      {items.map(({ event, ellipse }) => (
        <UncertaintyEllipse key={`uncertainty-${event.id}`} ellipse={ellipse} eventId={event.id} color={getColor(event)} />
      ))}
    </>
  );
}

/**
 * Beach balls in place of the event circles: sized by magnitude (largest on top),
 * compressional quadrants in `getFill` (the event's colour in the current colour mode),
 * dilatational white. A click on a ball opens its event's popup.
 */
export function FocalMechanismsOverlay<E extends { id: string | number; magnitude: number }>({
  items, getFill, onEventClick,
}: {
  items: ReadonlyArray<FocalMechanismOverlayItem<E>>;
  getFill: (event: E) => string;
  onEventClick: (event: E, position: [number, number]) => void;
}) {
  return (
    <>
      {items.map(({ event, position, mechanism }) => (
        <BeachBallMarker
          key={`focal-${event.id}`}
          position={position}
          mechanism={mechanism}
          eventId={event.id}
          magnitude={event.magnitude}
          fill={getFill(event)}
          onClick={() => onEventClick(event, position)}
        />
      ))}
    </>
  );
}

/** A short centred notice over a map (e.g. nothing to draw); the map stays usable under it. */
export function MapNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 z-[1000] max-w-[calc(100%-16px)] -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 text-center text-xs text-muted-foreground',
        MAP_OVERLAY_CLASS, className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Mechanisms-mode status: "Showing 300 of 1,240 focal mechanisms (largest) · zoom in for
 * more" when capped, or a notice instead of an empty map when there are none.
 */
export function FocalMechanismStatus({ shown, total, catalogueHasAny }: {
  /** Beach balls drawn. */
  shown: number;
  /** Plotted events with a mechanism. */
  total: number;
  /** Whether any loaded event has one (words the empty notice). */
  catalogueHasAny: boolean;
}) {
  if (total === 0) return <MapNotice>{catalogueHasAny ? NO_FOCAL_MECHANISMS.view : NO_FOCAL_MECHANISMS.catalogue}</MapNotice>;
  return (
    <MapStatusChip
      shown={shown}
      total={total}
      label={`Showing ${formatCount(shown)} of ${formatCount(total)} focal mechanisms (largest)`}
    />
  );
}

/** The drawn error in the event popup (the ellipse sits under the events, so it has no hover). */
export function EllipsePopupRow({ ellipse }: { ellipse: MapUncertaintyEllipse }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <dt className="whitespace-nowrap text-muted-foreground" title="Horizontal location uncertainty drawn on the map">Location error</dt>
      <dd className="min-w-0 break-words text-right tabular-nums">{formatEllipseSummary(ellipse)}</dd>
    </dl>
  );
}

// ---------------------------------------------------------------------------------------
// Active faults
// ---------------------------------------------------------------------------------------

/**
 * The NZ active-fault traces, loaded the first time `enabled` is true. The file is fetched
 * once per page load and shared by every map (lib/fault-data.ts loadFaultData); a
 * component keeps its copy when the overlay is switched off and on again.
 */
export function useFaultData(enabled: boolean): FaultCollection | null {
  const [data, setData] = useState<FaultCollection | null>(null);
  useEffect(() => {
    if (!enabled || data) return;
    let cancelled = false;
    loadFaultData()
      .then((loaded) => { if (!cancelled) setData(loaded); })
      .catch(() => { /* overlay stays empty; the map itself is unaffected */ });
    return () => { cancelled = true; };
  }, [enabled, data]);
  return data;
}

/** One canvas renderer per map for the fault pane: 10,000 traces draw far faster on a
 *  canvas than as SVG paths, also on maps whose other layers are SVG (region selector). */
const faultRenderers = new WeakMap<object, L.Canvas>();
function faultsRenderer(map: L.Map): L.Canvas {
  let renderer = faultRenderers.get(map);
  if (!renderer) {
    renderer = L.canvas({ padding: 0.5, pane: MAP_PANES.faults.name });
    faultRenderers.set(map, renderer);
  }
  return renderer;
}

/**
 * Active fault traces (spec S4) inside a react-leaflet <MapContainer>: thin and quiet in
 * their own pane under the events and ellipses, heavier from zoom 9, non-interactive (so
 * they never take an event's click), GNS Science attribution. Renders nothing until the
 * data has loaded (or when it failed to load: an empty collection).
 */
export function FaultsOverlay({ data, isDark }: { data: FaultCollection | null | undefined; isDark: boolean }) {
  if (!data?.features?.length) return null;
  return <FaultLinesLayer data={data} isDark={isDark} />;
}

function FaultLinesLayer({ data, isDark }: { data: FaultCollection; isDark: boolean }) {
  const map = useMap();
  // The pane has to exist before the GeoJSON layer is added to it. react-leaflet adds the
  // layer in its own (passive) effect, which runs after this layout effect.
  useLayoutEffect(() => { ensureMapPane(map, MAP_PANES.faults); }, [map]);
  // `renderer` is a Path option that L.geoJSON hands to every trace; react-leaflet's GeoJSON
  // props type leaves it out.
  const rendererOption = useMemo(() => ({ renderer: faultsRenderer(map) }) as Record<string, unknown>, [map]);

  const [zoomedIn, setZoomedIn] = useState(() => map.getZoom() >= FAULT_STYLE.zoomThreshold);
  useEffect(() => {
    const update = () => setZoomedIn(map.getZoom() >= FAULT_STYLE.zoomThreshold);
    update();
    map.on('zoomend', update);
    return () => { map.off('zoomend', update); };
  }, [map]);

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
      {...rendererOption}
      interactive={false}
      style={style}
      attribution={FAULT_ATTRIBUTION}
    />
  );
}

// ---------------------------------------------------------------------------------------
// Style-panel switches
// ---------------------------------------------------------------------------------------

const SMALL_SWITCH_CLASS = 'h-5 w-9 [&>span]:h-4 [&>span]:w-4 [&>span]:data-[state=checked]:translate-x-4';

export interface OverlayToggleState {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Muted note under the switch (what it does, a cap, nothing plotted...). */
  note?: ReactNode;
  /**
   * The loaded data has nothing for this overlay: the switch is disabled (and shown off)
   * and this reason replaces the note.
   */
  unavailableReason?: string | null;
}

/** A labelled overlay switch in the Style panel, with an optional muted note under it. */
export function OverlayToggle({
  id, label, checked, onCheckedChange, note, unavailableReason,
}: OverlayToggleState & { id: string; label: string }) {
  const unavailable = Boolean(unavailableReason);
  const shownNote = unavailable ? unavailableReason : note;
  const noteId = `${id}-note`;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className={cn('cursor-pointer text-xs font-normal leading-4', unavailable && 'cursor-not-allowed text-muted-foreground')}
        >
          {label}
        </Label>
        <Switch
          id={id}
          checked={unavailable ? false : checked}
          onCheckedChange={onCheckedChange}
          disabled={unavailable}
          aria-describedby={shownNote ? noteId : undefined}
          className={SMALL_SWITCH_CLASS}
        />
      </div>
      {shownNote && <p id={noteId} className="text-[11px] leading-snug text-muted-foreground">{shownNote}</p>}
    </div>
  );
}

/**
 * The Style panel's "Overlays" section: a switch per overlay given (omit one to leave it
 * out), labelled once for every map (OVERLAY_LABELS). The focal-mechanism switch always
 * says what it does (FOCAL_MECHANISM_DESCRIPTION) unless its own note or reason is given.
 */
export function MapOverlayToggles({ faults, uncertainty, focalMechanisms }: {
  faults?: OverlayToggleState;
  uncertainty?: OverlayToggleState;
  focalMechanisms?: OverlayToggleState;
}) {
  const idPrefix = useId();
  return (
    <StylePanelSection title="Overlays">
      <div className="space-y-1.5">
        {faults && <OverlayToggle id={`${idPrefix}-faults`} label={OVERLAY_LABELS.faults} {...faults} />}
        {uncertainty && <OverlayToggle id={`${idPrefix}-uncertainty`} label={OVERLAY_LABELS.uncertainty} {...uncertainty} />}
        {focalMechanisms && (
          <OverlayToggle
            id={`${idPrefix}-focal`}
            label={OVERLAY_LABELS.focalMechanisms}
            {...focalMechanisms}
            note={focalMechanisms.note ?? FOCAL_MECHANISM_DESCRIPTION}
          />
        )}
      </div>
    </StylePanelSection>
  );
}

/**
 * Compact "Active faults" switch for the small maps (merge group, region selector), with
 * the fault line as its swatch; the full source is in its title and the map attribution.
 */
export function ActiveFaultsToggle({ checked, onCheckedChange, isDark, className }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  isDark: boolean;
  className?: string;
}) {
  const id = useId();
  const line = faultPathOptions(isDark, 0);
  return (
    <div className={cn('flex items-center gap-2', className)} data-overlay-toggle="faults">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className={SMALL_SWITCH_CLASS} />
      <Label htmlFor={id} title={FAULT_LEGEND_LABEL} className="flex cursor-pointer items-center gap-1.5 text-xs font-normal leading-4">
        <svg width="16" height="8" className="flex-shrink-0" aria-hidden>
          <line x1="0" y1="4" x2="16" y2="4" stroke={line.color} strokeOpacity={line.opacity} strokeWidth={1.5} />
        </svg>
        {OVERLAY_LABELS.faults}
      </Label>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Legend keys
// ---------------------------------------------------------------------------------------

/**
 * The legend's "Overlays" section: the fault line while faults are on and the ellipse key
 * while any ellipse is drawn. Renders nothing when neither shows.
 */
export function MapOverlayLegendSection({ isDark, showFaults, ellipses = [] }: {
  isDark: boolean;
  showFaults: boolean;
  /** The drawn ellipses (their confidence levels label the key). */
  ellipses?: ReadonlyArray<Pick<MapUncertaintyEllipse, 'source' | 'confidenceLevel'>>;
}) {
  if (!showFaults && ellipses.length === 0) return null;
  return (
    <LegendSection title="Overlays">
      <div className="space-y-1">
        {showFaults && <FaultLineKey isDark={isDark} />}
        {ellipses.length > 0 && <UncertaintyEllipseLegendKey ellipses={ellipses} />}
      </div>
    </LegendSection>
  );
}

/** A strike-slip beach-ball glyph (two opposite shaded quadrants) `size` px across. */
function BeachBallGlyph({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="block flex-shrink-0" aria-hidden>
      <circle cx="10" cy="10" r="9.25" fill={BEACH_BALL_STYLE.background} />
      <path d="M10 10 L10 0.75 A9.25 9.25 0 0 1 19.25 10 Z" fill={fill} />
      <path d="M10 10 L10 19.25 A9.25 9.25 0 0 1 0.75 10 Z" fill={fill} />
      <circle cx="10" cy="10" r="9.25" fill="none" stroke={BEACH_BALL_STYLE.stroke} strokeWidth={20 / size} />
    </svg>
  );
}

/**
 * Mechanisms-mode legend section (replaces the circle magnitude key): what the quadrants
 * mean - compressional in the event's colour (the colour key above), dilatational white -
 * and the ball sizes for M2-M6 at their true rendered diameter (beachBallDiameter).
 */
export function FocalMechanismLegendSection({ magnitudes = MAGNITUDE_KEY_MAGNITUDES }: { magnitudes?: readonly number[] }) {
  const shade = BEACH_BALL_STYLE.neutralFill;
  const swatch = (fill: string) => (
    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm ring-1 ring-inset ring-black/25 dark:ring-white/25" style={{ backgroundColor: fill }} aria-hidden />
  );
  return (
    <LegendSection title="Focal mechanisms">
      <div data-legend="focal-mechanisms" className="space-y-1.5">
        <ul className="space-y-0.5 text-[11px] leading-4">
          <li data-quadrant="compressional" className="flex items-center gap-1.5">{swatch(shade)}Compressional (event colour)</li>
          <li data-quadrant="dilatational" className="flex items-center gap-1.5">{swatch(BEACH_BALL_STYLE.background)}Dilatational</li>
        </ul>
        <div
          data-legend="focal-mechanism-size"
          role="img"
          aria-label={`Beach-ball size by magnitude: ${magnitudes.map((m) => `M${m}`).join(', ')}`}
          className="flex items-end justify-between gap-1"
        >
          {magnitudes.map((magnitude) => (
            <div key={magnitude} data-magnitude={magnitude} className="flex flex-col items-center gap-0.5">
              <BeachBallGlyph size={beachBallDiameter(magnitude)} fill={shade} />
              <span className="text-[10px] leading-3 tabular-nums text-muted-foreground">M{magnitude}</span>
            </div>
          ))}
        </div>
      </div>
    </LegendSection>
  );
}
