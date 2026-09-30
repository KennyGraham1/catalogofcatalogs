/**
 * The hover card for an earthquake on the maps: a compact summary in the form seismic
 * observatories use - where (a locality such as "15 km north-east of Gisborne"), how big
 * (magnitude with its type), how deep, the epicentre, how well the network surrounds it
 * (azimuthal gap with a plain-language judgement), and when (UTC, with New Zealand local
 * time for New Zealand events) plus the agency's event id. The full record stays in the
 * click popup.
 *
 * Built as an HTML string for a Leaflet tooltip bound to the hovered marker only, so the
 * thousands of canvas markers carry no tooltip until one is hovered. Every value is escaped.
 */
import { NZ_NATIONAL_BOUNDS, pointInBounds } from '@/lib/geo-bounds-utils';
import { azimuthalGapQuality, describeLocality, type Locality } from '@/lib/nz-localities';
import { formatDepth, formatLatLon, formatMagnitude, formatOriginTimeUtc, isKnownRegion } from '@/lib/map-format';

export interface EventCardFields {
  id?: string | number | null;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  depth_uncertainty?: number | null;
  depth_type?: string | null;
  magnitude: number;
  magnitude_type?: string | null;
  azimuthal_gap?: number | null;
  region?: string | null;
  source_id?: string | null;
  event_public_id?: string | null;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const NZ_TIME = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
});

/**
 * "29 Oct 05:31 NZDT" for an instant, or null when the time does not parse. The date is
 * always given: New Zealand is 12-13 hours ahead of UTC, so the local date often differs
 * from the UTC one (16:31 UTC on 28 October is 05:31 NZDT on the 29th).
 */
export function newZealandLocalTime(time: string): string | null {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  const parts = NZ_TIME.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
}

/** The agency's own event id: the last segment of a resource id, else the source id. */
export function agencyEventLabel(event: Pick<EventCardFields, 'source_id' | 'event_public_id'>): string | null {
  const raw = (typeof event.source_id === 'string' && event.source_id.trim()) ||
    (typeof event.event_public_id === 'string' && event.event_public_id.trim()) || '';
  if (!raw) return null;
  const segment = raw.split(/[/=]/).filter(Boolean).pop() ?? raw;
  // A merge qualifies ids as '<source>:<id>'; the agency's id is the part after it.
  return segment.includes(':') ? segment.slice(segment.lastIndexOf(':') + 1) || segment : segment;
}

/** Title of the card: locality (from the LINZ Gazetteer places), else the stored region, else the epicentre. */
export function eventCardTitle(
  event: Pick<EventCardFields, 'latitude' | 'longitude' | 'region'>, places: ReadonlyArray<Locality> = []
): string {
  return describeLocality(event.latitude, event.longitude, places)
    ?? (isKnownRegion(event.region) ? event.region.trim() : null)
    ?? formatLatLon(event.latitude, event.longitude, 2);
}

/** The card's HTML (see the module comment); `places` are the Gazetteer places (loadNzLocalities). */
export function buildEventCardHtml(event: EventCardFields, places: ReadonlyArray<Locality> = []): string {
  const row = (label: string, value: string, className = '') =>
    `<div class="eq-card-row"><span class="eq-card-label">${escapeHtml(label)}</span><span class="eq-card-value ${className}">${value}</span></div>`;
  const rows: string[] = [];
  rows.push(row('Magnitude', `<strong>${escapeHtml(formatMagnitude(event.magnitude, event.magnitude_type))}</strong>`));
  const depth = formatDepth({ depth: event.depth, depth_uncertainty: event.depth_uncertainty, depth_type: event.depth_type });
  rows.push(row('Depth', escapeHtml(depth ?? 'not reported')));
  rows.push(row('Location', escapeHtml(formatLatLon(event.latitude, event.longitude))));
  const gap = azimuthalGapQuality(event.azimuthal_gap);
  if (gap && typeof event.azimuthal_gap === 'number') {
    rows.push(row('Azimuthal gap', `${Math.round(event.azimuthal_gap)}° · ${escapeHtml(gap.label)}`, `eq-card-gap-${gap.level}`));
  }
  const inNewZealand = pointInBounds(event.latitude, event.longitude, NZ_NATIONAL_BOUNDS);
  const local = inNewZealand ? newZealandLocalTime(event.time) : null;
  const when = `<div>${escapeHtml(formatOriginTimeUtc(event.time))}</div>` + (local ? `<div class="eq-card-muted">${escapeHtml(local)} (local)</div>` : '');
  const id = agencyEventLabel(event);
  return [
    '<div class="eq-card">',
    `<div class="eq-card-title">${escapeHtml(eventCardTitle(event, places))}</div>`,
    `<div class="eq-card-rows">${rows.join('')}</div>`,
    `<div class="eq-card-footer">${when}${id ? `<div class="eq-card-id">ID ${escapeHtml(id)}</div>` : ''}</div>`,
    '</div>',
  ].join('');
}
