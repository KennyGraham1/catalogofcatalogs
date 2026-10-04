/**
 * Symbology and popup text for the merge preview's duplicate-group map
 * (components/merge/DuplicateGroupMap.tsx): one event reported by 2-10 catalogues a few km
 * apart. Pure (no Leaflet runtime, no DOM), so it is unit-testable and safe to import from
 * server-rendered code.
 *
 * - Each entry is coloured by its source catalogue: the colour the preview API assigned
 *   (lib/merge.ts previewMerge, Okabe–Ito), so the map matches the group card's dots.
 * - The published entry: a thick ring (2.5 px) in the foreground colour.
 * - A superseded entry (an older vintage of one agency's solution, contract M5): hollow,
 *   dashed outline in its catalogue colour.
 * - Every other entry: the shared event-marker style.
 * - Thin dashed grey connectors run from each entry to the published solution: the
 *   published entry, or the computed epicentre of an averaged / median group.
 */
import type { PathOptions } from 'leaflet';
import { calculateDistance } from '@/lib/earthquake-utils';
import { escapeHtml } from '@/lib/html';
import { formatDepth, formatLatLon, formatMagnitude, formatOriginTimeUtc } from '@/lib/map-format';
import { CATALOGUE_UNKNOWN_COLOR, MARKER_STYLE, catalogueColorAt, markerPathOptions } from '@/lib/map-style';

/** Initial view: the whole group with regional context, never street level. */
export const GROUP_FIT_OPTIONS = Object.freeze({ padding: [48, 48] as [number, number], maxZoom: 11 });

/** Marker radius (px). One size for every entry: they report the same event, and a
 *  magnitude-scaled size would only show agency magnitude-scale differences as "bigger". */
export const GROUP_MARKER_RADIUS = 6;

export const PUBLISHED_RING_WEIGHT = 2.5;
export const SUPERSEDED_DASH = '3 3';
export const CONNECTOR_DASH = '4 4';

/** How an entry took part in the merge. */
export type GroupEntryRole = 'published' | 'duplicate' | 'superseded';

export interface GroupEntry {
  id?: string;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  depth_uncertainty?: number | null;
  magnitude: number;
  magnitude_type?: string | null;
  catalogueId: string;
  catalogueName: string;
}

/** Where the merge puts the published solution, for separations and connectors. */
export interface PublishedReference {
  latitude: number;
  longitude: number;
  time: string;
  /** True for the computed epicentre of an averaged / median group. */
  computed: boolean;
}

export interface GroupShape {
  events: GroupEntry[];
  selectedEventIndex: number;
  supersededEventIndexes?: number[];
  computedEpicentre?: { latitude: number; longitude: number; time: string } | null;
  /**
   * Entries published as events of their own, beside selectedEventIndex: a kept-apart
   * cluster shown as one map, where each split-off event has its own published solution.
   */
  publishedEventIndexes?: number[];
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function foreground(isDark: boolean): string {
  return isDark ? MARKER_STYLE.highlight.stroke.dark : MARKER_STYLE.highlight.stroke.light;
}

/** Role of the entry at `index` in `group`. */
export function entryRole(group: GroupShape, index: number): GroupEntryRole {
  if ((group.supersededEventIndexes ?? []).includes(index)) return 'superseded';
  if ((group.publishedEventIndexes ?? []).includes(index)) return 'published';
  return index === group.selectedEventIndex ? 'published' : 'duplicate';
}

/** The published solution of a group: the selected entry, else its computed epicentre. */
export function publishedReference(group: GroupShape): PublishedReference | null {
  const selected = group.events[group.selectedEventIndex];
  if (selected) return { latitude: selected.latitude, longitude: selected.longitude, time: selected.time, computed: false };
  const epicentre = group.computedEpicentre;
  if (epicentre && Number.isFinite(epicentre.latitude) && Number.isFinite(epicentre.longitude)) {
    return { ...epicentre, computed: true };
  }
  return null;
}

/**
 * Catalogue id -> colour for the catalogues in a group, in order of first appearance: the
 * colour the preview assigned (a valid #rrggbb), else the Okabe–Ito colour at that position.
 */
export function groupCatalogueColors(
  events: ReadonlyArray<Pick<GroupEntry, 'catalogueId'>>,
  assigned: Record<string, string> | undefined,
  isDark: boolean
): Map<string, string> {
  const colors = new Map<string, string>();
  for (const { catalogueId } of events) {
    if (colors.has(catalogueId)) continue;
    const candidate = assigned?.[catalogueId];
    colors.set(catalogueId, candidate && HEX_COLOR.test(candidate) ? candidate : catalogueColorAt(colors.size, isDark));
  }
  return colors;
}

/** Legend rows: one per catalogue in the group, in order of first appearance. */
export function groupCatalogueLegend(
  events: ReadonlyArray<Pick<GroupEntry, 'catalogueId' | 'catalogueName'>>,
  colors: Map<string, string>
): Array<{ key: string; label: string; color: string }> {
  const seen = new Set<string>();
  const legend: Array<{ key: string; label: string; color: string }> = [];
  for (const { catalogueId, catalogueName } of events) {
    if (seen.has(catalogueId)) continue;
    seen.add(catalogueId);
    legend.push({ key: catalogueId, label: catalogueName || catalogueId, color: colors.get(catalogueId) ?? CATALOGUE_UNKNOWN_COLOR });
  }
  return legend;
}

/** Circle style of an entry by role (see the module comment). */
export function groupMarkerStyle(role: GroupEntryRole, fill: string, isDark: boolean): PathOptions {
  if (role === 'published') {
    return { ...markerPathOptions(fill, isDark), color: foreground(isDark), weight: PUBLISHED_RING_WEIGHT, fillOpacity: 0.95, opacity: 1 };
  }
  if (role === 'superseded') {
    // fillOpacity 0 keeps the fill paintable, so the hollow disc still takes clicks.
    return { stroke: true, color: fill, weight: 1.5, opacity: 1, dashArray: SUPERSEDED_DASH, fill: true, fillColor: fill, fillOpacity: 0 };
  }
  return markerPathOptions(fill, isDark);
}

/** Thin dashed grey line from an entry to the published solution. */
export function connectorStyle(isDark: boolean): PathOptions {
  return { color: isDark ? '#9CA3AF' : '#6B7280', weight: 1, opacity: 0.9, dashArray: CONNECTOR_DASH, interactive: false };
}

/** Colours of the computed-epicentre cross: foreground stroke on a background halo. */
export function epicentreCrossColors(isDark: boolean): { stroke: string; halo: string } {
  return { stroke: foreground(isDark), halo: isDark ? '#111827' : '#FFFFFF' };
}

/** SVG markup of the computed-epicentre cross (size x size px). */
export function epicentreCrossSvg(isDark: boolean, size = 14): string {
  const { stroke, halo } = epicentreCrossColors(isDark);
  const a = 3;
  const b = size - 3;
  const d = `M${a} ${a}L${b} ${b}M${b} ${a}L${a} ${b}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
    + `<path d="${d}" stroke="${halo}" stroke-width="4" stroke-linecap="round"/>`
    + `<path d="${d}" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export interface Separation {
  /** Great-circle distance in km. */
  km: number;
  /** Entry origin time minus the reference origin time, in seconds (NaN if unparseable). */
  seconds: number;
}

/** Separation of an entry from the published solution. */
export function separationFrom(reference: Pick<PublishedReference, 'latitude' | 'longitude' | 'time'>, entry: Pick<GroupEntry, 'latitude' | 'longitude' | 'time'>): Separation {
  return {
    km: calculateDistance(reference.latitude, reference.longitude, entry.latitude, entry.longitude),
    seconds: (new Date(entry.time).getTime() - new Date(reference.time).getTime()) / 1000,
  };
}

const MINUS = '−';

/** "3.2 km · +1.4 s" (a later entry is +, an earlier one −). */
export function formatSeparation({ km, seconds }: Separation): string {
  const distance = `${km.toFixed(1)} km`;
  if (!Number.isFinite(seconds)) return distance;
  const rounded = Math.round(seconds * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '';
  return `${distance} · ${sign}${Math.abs(rounded).toFixed(1)} s`;
}

const ROLE_TEXT: Record<GroupEntryRole, string> = {
  published: 'Published solution',
  duplicate: 'Duplicate (not published)',
  superseded: 'Superseded',
};

function row(label: string, value: string): string {
  return `<dt class="text-muted-foreground">${escapeHtml(label)}</dt><dd class="m-0 text-right">${escapeHtml(value)}</dd>`;
}

/**
 * Popup HTML for one entry (Leaflet bindPopup string). Every value is escaped: catalogue
 * names are user-supplied, and an unparseable time is shown verbatim.
 */
export function groupEntryPopupHtml({
  entry, role, color, reference,
}: {
  entry: GroupEntry;
  role: GroupEntryRole;
  color: string;
  reference: PublishedReference | null;
}): string {
  const rows = [
    row('Location', formatLatLon(entry.latitude, entry.longitude)),
    row('Depth', formatDepth({ depth: entry.depth, depth_uncertainty: entry.depth_uncertainty }) ?? 'not reported'),
  ];
  const isReference = role === 'published' && reference && !reference.computed;
  if (reference && !isReference) {
    rows.push(row(reference.computed ? 'From computed epicentre' : 'From published', formatSeparation(separationFrom(reference, entry))));
  }
  const roleText = role === 'duplicate' && reference?.computed ? 'Averaged into the published solution' : ROLE_TEXT[role];
  rows.push(row('Role', roleText));
  const note = role === 'superseded'
    ? `<p class="mt-1.5 text-[11px] leading-4 text-muted-foreground">Superseded: an older vintage of this agency&#39;s solution, replaced by a newer one in the group.</p>`
    : '';
  return `<div class="group-entry-popup text-xs" data-role="${role}">`
    + `<div class="flex items-center gap-1.5 font-semibold text-[13px] leading-5">`
    + `<span aria-hidden="true" class="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style="background-color:${HEX_COLOR.test(color) ? color : CATALOGUE_UNKNOWN_COLOR}"></span>`
    + `<span class="min-w-0 truncate">${escapeHtml(entry.catalogueName || entry.catalogueId)}</span></div>`
    + `<div class="font-semibold tabular-nums">${escapeHtml(formatMagnitude(entry.magnitude, entry.magnitude_type))}</div>`
    + `<div class="tabular-nums text-muted-foreground">${escapeHtml(formatOriginTimeUtc(entry.time))}</div>`
    + `<dl class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">${rows.join('')}</dl>`
    + note
    + `</div>`;
}

/** Popup HTML for the computed epicentre of an averaged / median group. */
export function computedEpicentrePopupHtml(reference: PublishedReference, entryCount: number): string {
  return `<div class="group-entry-popup text-xs" data-role="computed-epicentre">`
    + `<div class="font-semibold text-[13px] leading-5">Computed epicentre</div>`
    + `<div class="tabular-nums text-muted-foreground">${escapeHtml(formatOriginTimeUtc(reference.time))}</div>`
    + `<dl class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">`
    + row('Location', formatLatLon(reference.latitude, reference.longitude))
    + row('Role', `Published, computed from ${entryCount} entries`)
    + `</dl></div>`;
}
