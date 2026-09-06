import { isEventInBounds, normalizeSampleLimit, type ViewportBounds } from './earthquake-utils';

export type MapDetail = 'auto' | number;
export interface MapViewport {
  bounds: ViewportBounds;
  width: number;
  height: number;
}
interface MapEvent {
  latitude: number;
  longitude: number;
  magnitude: number;
}

export function positionInMapWorld(event: Pick<MapEvent, 'latitude' | 'longitude'>, bounds: ViewportBounds): [number, number] {
  const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
  const center = (bounds.west + east) / 2;
  return [event.latitude, event.longitude + 360 * Math.round((center - event.longitude) / 360)];
}

/** Rendering budget in CSS pixels. Scientific calculations never use this selection. */
export function automaticMapBudget(width: number, height: number): number {
  const area = Number.isFinite(width * height) && width > 0 && height > 0 ? width * height : 480000;
  return Math.max(300, Math.min(4000, Math.floor(area / 256)));
}

const mercatorY = (latitude: number) => {
  const radians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
};

/** Select from the visible dataset, so zooming can reveal events omitted at wider scales. */
export function selectMapEvents<T extends MapEvent>(events: T[], viewport: MapViewport, detail: MapDetail) {
  const visible = events.filter(event => isEventInBounds(event, viewport.bounds));
  const budget = normalizeSampleLimit(detail === 'auto' ? automaticMapBudget(viewport.width, viewport.height) : detail, visible.length);
  if (visible.length <= budget) return { sampled: visible, visibleCount: visible.length };
  if (!budget) return { sampled: [] as T[], visibleCount: visible.length };

  // Keep the largest event in each screen cell. Representatives are actual events,
  // not cluster counts or an unbiased sample of the magnitude distribution.
  const aspect = Math.max(0.1, Math.min(10, viewport.width / Math.max(1, viewport.height)));
  const columns = Math.max(1, Math.floor(Math.sqrt(budget * aspect)));
  const rows = Math.max(1, Math.floor(budget / columns));
  const cells = new Map<number, number>();
  const { west, east, north, south } = viewport.bounds;
  const span = east - west;
  const longitudeSpan = Math.abs(span) >= 360 ? 360 : ((span % 360) + 360) % 360;
  const top = mercatorY(north);
  const height = top - mercatorY(south);
  for (let index = 0; index < visible.length; index++) {
    const event = visible[index];
    const offset = ((event.longitude - west) % 360 + 360) % 360;
    const column = Math.min(columns - 1, Math.floor(offset / (longitudeSpan || 1) * columns));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((top - mercatorY(event.latitude)) / (height || 1) * rows)));
    const cell = row * columns + column;
    const previous = cells.get(cell);
    if (previous === undefined || event.magnitude > visible[previous].magnitude) {
      cells.set(cell, index);
    }
  }
  // Fill spare capacity across the remaining catalogue order, without sorting N events.
  const selected = new Set(cells.values());
  const remaining = visible.map((_, index) => index).filter(index => !selected.has(index));
  const slots = budget - selected.size;
  for (let i = 0; i < slots; i++) selected.add(remaining[Math.floor(i * remaining.length / slots)]);
  return { sampled: Array.from(selected, index => visible[index]), visibleCount: visible.length };
}
