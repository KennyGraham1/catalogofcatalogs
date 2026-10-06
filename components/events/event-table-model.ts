import type { EventSortField } from '@/lib/event-table-sort';
import { formatOriginTimeUtc } from '@/lib/map-format';

/**
 * Shared model for the two event tables: EventTable (up to its virtualization threshold) and
 * VirtualizedEventTable (above it). Both render their header and every row from the column
 * definition below, so a column cannot be one width in the header and another in the rows,
 * and a dataset looks and behaves the same on either side of the threshold.
 */

export interface EventTableEvent {
  id: string | number;
  time: string;
  latitude: number;
  longitude: number;
  depth: number | null;
  magnitude: number;
  magnitude_type?: string | null;
  location_name?: string | null;
  event_type?: string | null;
  quality_score?: number | null;
  quality_grade?: string | null;
  azimuthal_gap?: number | null;
  used_station_count?: number | null;
  public_id?: string | null;
  // Extended QuakeML 1.2 fields
  horizontal_uncertainty?: number | null;
  depth_type?: string | null;
  agency_id?: string | null;
  author?: string | null;
  evaluation_mode?: string | null;
  evaluation_status?: string | null;
}

export type SortField = EventSortField;
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  field: SortField;
  direction: SortDirection;
}

/** Clicking the sorted column reverses it; a new column starts newest-first for time, else ascending. */
export function nextSortState(current: SortState, field: SortField): SortState {
  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { field, direction: field === 'time' ? 'desc' : 'asc' };
}

export type EventColumnKey =
  | 'time'
  | 'magnitude'
  | 'depth'
  | 'location'
  | 'coordinates'
  | 'quality'
  | 'type';

export interface EventColumn {
  key: EventColumnKey;
  label: string;
  /**
   * Narrowest width (px) at which the header (label, sort icon, help icon) and the widest
   * typical value stay on one line without overlapping the next column. Never shrunk below.
   */
  minWidth: number;
  /** Share of any width beyond the table's minimum (CSS grid `fr`). */
  grow: number;
  sortField?: SortField;
}

export const EVENT_TABLE_COLUMNS: readonly EventColumn[] = [
  // "13/11/2016, 11:02 UTC" plus its icon.
  { key: 'time', label: 'Time', minWidth: 212, grow: 1.4, sortField: 'time' },
  { key: 'magnitude', label: 'Magnitude', minWidth: 136, grow: 1, sortField: 'magnitude' },
  { key: 'depth', label: 'Depth (km)', minWidth: 140, grow: 1, sortField: 'depth' },
  // Long place names wrap to two lines; the full name stays in the accessibility tree.
  { key: 'location', label: 'Location', minWidth: 168, grow: 2 },
  // "-41.200, 174.800" in a monospace face plus its icon.
  { key: 'coordinates', label: 'Coordinates', minWidth: 192, grow: 1.3, sortField: 'latitude' },
  { key: 'quality', label: 'Quality', minWidth: 120, grow: 0.9, sortField: 'quality' },
  { key: 'type', label: 'Type', minWidth: 128, grow: 1 },
];

/**
 * The single grid template used by the header row and every event row. It is set once, as
 * the `--event-table-columns` custom property on the table element, and each row reads it
 * through EVENT_TABLE_ROW_GRID_CLASS. Track minimums are fixed lengths, so a long value
 * can never widen its column in one row only.
 */
export const EVENT_TABLE_GRID_TEMPLATE = EVENT_TABLE_COLUMNS
  .map(column => `minmax(${column.minWidth}px, ${column.grow}fr)`)
  .join(' ');

/** Readable minimum table width; narrower containers scroll the table horizontally. */
export const EVENT_TABLE_MIN_WIDTH = EVENT_TABLE_COLUMNS.reduce((total, column) => total + column.minWidth, 0);

export const EVENT_TABLE_COLUMNS_VAR = '--event-table-columns';

/** Applied to the header row and every event row: all of them read the one template above. */
export const EVENT_TABLE_ROW_GRID_CLASS = 'grid [grid-template-columns:var(--event-table-columns)]';

export const EVENT_TABLE_HEADER_HEIGHT = 44;
export const EVENT_TABLE_ROW_HEIGHT = 56;

/**
 * Origin times are UTC by definition (QuakeML 1.2 / ISO 8601 "Z"), so they are rendered in
 * UTC with the zone shown, as ISO 8601 to the second: "2016-11-13 11:02:56 UTC", the format
 * of every other event time on the platform (the map cards, merge QC and review queue).
 * Formatting in the browser's zone put an event on the wrong calendar day under NZDT, and
 * the old "13/11/2016" was ambiguous between day-first and month-first readers. An
 * unparseable value is shown verbatim rather than throwing.
 */
export function formatEventTime(time: string): string {
  return formatOriginTimeUtc(time);
}

/**
 * Accessible name of a row's open control. It starts with the visible time text so speech
 * input users can activate it by what they see (WCAG 2.5.3), then adds the magnitude so
 * rows from the same minute can be told apart.
 */
export function eventOpenLabel(event: Pick<EventTableEvent, 'time' | 'magnitude'>): string {
  const magnitude = Number.isFinite(event.magnitude) ? `, M${event.magnitude.toFixed(1)}` : '';
  return `Open event ${formatEventTime(event.time)}${magnitude}`;
}

/** Text colours at the 700 shades in the light theme, 4.5:1 or better on white and on muted
 *  rows (the 500/600 shades measured 2.3-3.6:1); the 400 shades in the dark theme. */
export function magnitudeColorClass(magnitude: number): string {
  if (magnitude >= 7) return 'text-red-700 dark:text-red-400';
  if (magnitude >= 6) return 'text-orange-700 dark:text-orange-400';
  if (magnitude >= 5) return 'text-yellow-700 dark:text-yellow-400';
  if (magnitude >= 4) return 'text-blue-600 dark:text-blue-400';
  return 'text-muted-foreground';
}

/** Keep an index inside [0, count - 1]; -1 when there are no rows. */
export function clampRowIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  return Math.max(0, Math.min(count - 1, index));
}
