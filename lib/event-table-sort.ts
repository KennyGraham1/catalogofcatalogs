export type EventSortField = 'time' | 'magnitude' | 'depth' | 'quality' | 'latitude' | 'longitude';

interface SortableEvent {
  time: string;
  magnitude: number;
  depth: number | null;
  latitude: number;
  longitude: number;
  quality_score?: number | null;
}

/** Compute keys once (especially timestamps); keep unknown values last. */
export function sortTableEvents<T extends SortableEvent>(events: T[], field: EventSortField, direction: 'asc' | 'desc'): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return events.map(event => {
    const value = field === 'time' ? Date.parse(event.time) : field === 'quality' ? event.quality_score : event[field];
    return { event, value: typeof value === 'number' && Number.isFinite(value) ? value : null };
  }).sort((a, b) => {
    if (a.value === null) return b.value === null ? 0 : 1;
    if (b.value === null) return -1;
    return sign * (a.value - b.value);
  }).map(row => row.event);
}
