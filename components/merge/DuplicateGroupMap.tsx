'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useIsDarkTheme } from '@/hooks/use-map-theme';
import { positionInMapWorld } from '@/lib/map-event-selection';
import { MAP_ZOOM_OPTIONS, MARKER_STYLE } from '@/lib/map-style';
import { cn } from '@/lib/utils';
import { attachBaseLayers, type BaseLayerControlHandle } from '@/components/map/MapLayerControl';
import { MAP_SCALE_OPTIONS } from '@/components/map/MapScaleBar';
import { ensureLeafletDefaultIcon } from '@/components/map/leaflet-default-icon';
import { CatalogueColorKey, LegendSection, MapLegend } from '@/components/map/MapLegend';
import { ActiveFaultsToggle, useFaultData } from '@/components/map/MapOverlays';
import { attachFaultsLayer, type FaultsLayerHandle } from '@/components/map/faults-layer';
import {
  GROUP_FIT_OPTIONS, GROUP_MARKER_RADIUS, computedEpicentrePopupHtml, connectorStyle, entryRole,
  epicentreCrossSvg, groupCatalogueColors, groupCatalogueLegend, groupEntryPopupHtml, groupMarkerStyle,
  publishedReference, type GroupEntryRole,
} from './duplicate-group-style';

interface EventData {
  id?: string;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  depth_uncertainty?: number | null;
  magnitude: number;
  magnitude_type?: string | null;
  source: string;
  catalogueId: string;
  catalogueName: string;
}

interface DuplicateGroup {
  id: string;
  events: EventData[];
  /** Index of the entry whose solution the merge publishes; -1 when it computes one. */
  selectedEventIndex: number;
  isSuspicious: boolean;
  validationWarnings: string[];
  // Optional so a preview from a server that predates contract M4 still renders.
  heldForReview?: boolean;
  supersededEventIndexes?: number[];
  /** The averaged / median epicentre the merge publishes when no entry is selected. */
  computedEpicentre?: { latitude: number; longitude: number; time: string } | null;
  /** Several published entries (a kept-apart cluster): ringed, without connectors. */
  publishedEventIndexes?: number[];
}

interface DuplicateGroupMapProps {
  group: DuplicateGroup;
  /** Catalogue id -> colour, as the preview API assigned them (the group card's dots). */
  catalogueColors: Record<string, string>;
  height?: string;
  /** Extra classes for the map wrapper (e.g. a top rule under a card header). */
  className?: string;
}

/** Paint order: hollow superseded rings at the bottom, the published entry on top. */
const PAINT_ORDER: Record<GroupEntryRole, number> = { superseded: 0, duplicate: 1, published: 2 };

const POPUP_OPTIONS: L.PopupOptions = { minWidth: 220, maxWidth: 300, autoPanPadding: [48, 48] };

const CROSS_SIZE = 14;

const PUBLISHED_TAG = '<span class="inline-block whitespace-nowrap rounded-sm bg-background/85 px-1 text-[10px] font-medium leading-4 text-foreground shadow-sm">published</span>';

/**
 * The small "published" tag beside the published entry (or the computed epicentre), on the
 * side away from the other entries so it does not cover them. No iconSize: the tag sizes to
 * its text; a left-hand tag is shifted back by its own width.
 */
function publishedLabelIcon(offset: number, side: 'left' | 'right'): L.DivIcon {
  return L.divIcon({
    className: 'duplicate-group-label',
    html: side === 'right' ? PUBLISHED_TAG : `<span class="block -translate-x-full">${PUBLISHED_TAG}</span>`,
    iconSize: undefined,
    iconAnchor: side === 'right' ? [-offset, 8] : [offset, 8],
  });
}

/** Right of the symbol unless the other entries lie mostly to its right. */
function labelSide(at: [number, number], others: Array<[number, number]>): 'left' | 'right' {
  if (others.length === 0) return 'right';
  const meanLng = others.reduce((sum, [, lng]) => sum + lng, 0) / others.length;
  return at[1] >= meanLng ? 'right' : 'left';
}

/**
 * The merge preview's "View on Map": one duplicate group (2-10 catalogue entries of one
 * event, usually a few km apart) on the gray basemap at regional scale. Entries are
 * coloured by source catalogue; the published entry carries a thick ring and a
 * "published" tag, superseded vintages are hollow and dashed, and dashed grey connectors
 * run to the published solution (the computed epicentre, marked with a cross, for an
 * averaged / median group). Each popup gives the entry's separation from it.
 *
 * Imperative Leaflet (not react-leaflet): the map is created once, base layers come from
 * the shared layer control (attachBaseLayers: gray base by theme, labels above the data,
 * maxNativeZoom), and only the overlay is redrawn when the group or the theme changes.
 */
export function DuplicateGroupMap({ group, catalogueColors, height = '400px', className }: DuplicateGroupMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<BaseLayerControlHandle | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const fittedGroupRef = useRef<DuplicateGroup | null>(null);
  const faultsRef = useRef<FaultsLayerHandle | null>(null);
  const isDark = useIsDarkTheme();
  const isDarkRef = useRef(isDark);
  // Active faults for tectonic context: off by default on this small map, loaded (once per
  // page, shared with the other maps) the first time the reader switches them on.
  const [showFaults, setShowFaults] = useState(false);
  const faultData = useFaultData(showFaults);

  const events = useMemo(() => group.events ?? [], [group.events]);
  const hasEvents = events.length > 0;

  const colors = useMemo(() => groupCatalogueColors(events, catalogueColors, isDark), [events, catalogueColors, isDark]);
  const legend = useMemo(() => groupCatalogueLegend(events, colors), [events, colors]);
  const roles = useMemo(() => events.map((_, index) => entryRole(group, index)), [events, group]);
  const reference = useMemo(() => publishedReference(group), [group]);

  // Create the map once (and destroy it on unmount); theme and group changes only touch
  // the base layer and the overlay below, so zoom/pan and the chosen base survive them.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasEvents) return;
    ensureLeafletDefaultIcon();

    const first = group.events[0];
    const map = L.map(containerRef.current, {
      center: [first.latitude, first.longitude],
      zoom: GROUP_FIT_OPTIONS.maxZoom,
      minZoom: 2,
      maxZoom: 18,
      ...MAP_ZOOM_OPTIONS,
      zoomControl: true,
    });
    mapRef.current = map;
    baseLayersRef.current = attachBaseLayers(map, { isDark: isDarkRef.current, position: 'topright' });
    L.control.scale(MAP_SCALE_OPTIONS).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);

    return () => {
      baseLayersRef.current?.remove();
      baseLayersRef.current = null;
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      fittedGroupRef.current = null;
    };
    // Mount/unmount only: later prop and theme changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEvents]);

  // Follow the site theme: swap the gray base (a base the user chose stays).
  useEffect(() => {
    isDarkRef.current = isDark;
    baseLayersRef.current?.setDark(isDark);
    faultsRef.current?.setDark(isDark);
  }, [isDark]);

  // Fault traces in their pane under the entries (same style and attribution as every map).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showFaults || !faultData?.features?.length) return;
    const handle = attachFaultsLayer(map, faultData, { isDark: isDarkRef.current });
    faultsRef.current = handle;
    return () => {
      handle.remove();
      if (faultsRef.current === handle) faultsRef.current = null;
    };
  }, [showFaults, faultData, hasEvents]);

  // Draw the group.
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay || !hasEvents) return;
    overlay.clearLayers();

    // Draw every entry in the first entry's world copy. Merge matches duplicates across the
    // antimeridian (Kermadec/Chatham), and Leaflet does not wrap markers, lines or bounds,
    // so a pair at 179.95° and -179.97° (8 km apart) was drawn 360° apart and fitted at
    // world zoom. A zero-width box at the anchor longitude centres positionInMapWorld on
    // it. Popups still report the stored coordinates.
    const anchor = events[0];
    const world = { north: anchor.latitude, south: anchor.latitude, east: anchor.longitude, west: anchor.longitude };
    const at = (point: { latitude: number; longitude: number }) => positionInMapWorld(point, world);
    const referencePosition = reference ? at(reference) : null;

    // Connectors first, so they run under the symbols.
    if (referencePosition) {
      events.forEach((event, index) => {
        if (roles[index] === 'published' && !reference?.computed) return;
        overlay.addLayer(L.polyline([referencePosition, at(event)], connectorStyle(isDark)));
      });
    }

    // One circle per entry, created in entry order and painted in role order.
    const circles = events.map((event, index) => {
      const color = colors.get(event.catalogueId)!;
      return L.circleMarker(at(event), { ...groupMarkerStyle(roles[index], color, isDark), radius: GROUP_MARKER_RADIUS })
        .bindPopup(groupEntryPopupHtml({ entry: event, role: roles[index], color, reference }), POPUP_OPTIONS);
    });
    events
      .map((_, index) => index)
      .sort((a, b) => PAINT_ORDER[roles[a]] - PAINT_ORDER[roles[b]])
      .forEach(index => overlay.addLayer(circles[index]));

    let labelPosition: [number, number] | null = null;
    let labelOffset = GROUP_MARKER_RADIUS + 5;
    let labelNeighbours: Array<[number, number]> = [];
    if (reference?.computed && referencePosition) {
      const activeEntries = roles.filter(role => role !== 'superseded').length;
      overlay.addLayer(
        L.marker(referencePosition, {
          icon: L.divIcon({
            className: 'duplicate-group-epicentre',
            html: epicentreCrossSvg(isDark, CROSS_SIZE),
            iconSize: [CROSS_SIZE, CROSS_SIZE],
            iconAnchor: [CROSS_SIZE / 2, CROSS_SIZE / 2],
          }),
          title: 'Computed epicentre',
          keyboard: false,
        }).bindPopup(computedEpicentrePopupHtml(reference, activeEntries), POPUP_OPTIONS)
      );
      labelPosition = referencePosition;
      labelOffset = CROSS_SIZE / 2 + 5;
      labelNeighbours = events.map(event => at(event));
    } else {
      // One tag for one published entry; a kept-apart cluster's rings speak for themselves.
      const published = roles.indexOf('published');
      if (published >= 0 && roles.lastIndexOf('published') === published) {
        labelPosition = at(events[published]);
        labelNeighbours = events.filter((_, index) => index !== published).map(event => at(event));
      }
    }
    if (labelPosition) {
      overlay.addLayer(L.marker(labelPosition, {
        icon: publishedLabelIcon(labelOffset, labelSide(labelPosition, labelNeighbours)),
        interactive: false,
        keyboard: false,
      }));
    }

    // Frame the group when it changes (not on a theme toggle, which keeps the user's view).
    if (fittedGroupRef.current !== group) {
      fittedGroupRef.current = group;
      const points = events.map(event => at(event));
      if (referencePosition) points.push(referencePosition);
      map.fitBounds(L.latLngBounds(points), GROUP_FIT_OPTIONS);
    }
  }, [group, events, colors, roles, reference, isDark, hasEvents]);

  if (!hasEvents) {
    return (
      <div
        className={cn('flex w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground', className)}
        style={{ height }}
      >
        No events to display
      </div>
    );
  }

  const hasDuplicates = roles.includes('duplicate');
  const hasSuperseded = roles.includes('superseded');

  return (
    <div className={cn('relative isolate w-full overflow-hidden', className)} style={{ height }}>
      <div ref={containerRef} className="h-full w-full" data-testid="duplicate-group-map" />
      <MapLegend label="Group legend">
        <LegendSection title="Catalogue">
          <CatalogueColorKey legend={legend} isDark={isDark} />
        </LegendSection>
        <LegendSection title="Entries">
          <ul data-legend="group-roles" className="space-y-1">
            {((reference && !reference.computed) || roles.includes('published')) && <RoleKey role="published" isDark={isDark} label="published" />}
            {hasDuplicates && <RoleKey role="duplicate" isDark={isDark} label={reference?.computed ? 'averaged entry' : 'duplicate'} />}
            {hasSuperseded && <RoleKey role="superseded" isDark={isDark} label="superseded (older vintage)" />}
            {reference?.computed && (
              <li data-role-key="computed-epicentre" className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: epicentreCrossSvg(isDark, 12) }}
                />
                <span>computed epicentre (published)</span>
              </li>
            )}
          </ul>
        </LegendSection>
        <LegendSection title="Overlays">
          <ActiveFaultsToggle checked={showFaults} onCheckedChange={setShowFaults} isDark={isDark} />
        </LegendSection>
      </MapLegend>
    </div>
  );
}

/** Legend symbol for an entry role, drawn with the map's own path style on a neutral fill
 *  (colour encodes the catalogue, not the role). */
function RoleKey({ role, isDark, label }: { role: GroupEntryRole; isDark: boolean; label: string }) {
  const neutral = isDark ? MARKER_STYLE.neutralFill.dark : MARKER_STYLE.neutralFill.light;
  const style = groupMarkerStyle(role, role === 'superseded' ? (isDark ? '#9CA3AF' : '#6B7280') : neutral, isDark);
  return (
    <li data-role-key={role} className="flex items-center gap-1.5">
      <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0" aria-hidden>
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill={style.fillColor}
          fillOpacity={style.fillOpacity}
          stroke={style.color}
          strokeWidth={style.weight}
          strokeDasharray={style.dashArray as string | undefined}
        />
      </svg>
      <span>{label}</span>
    </li>
  );
}
