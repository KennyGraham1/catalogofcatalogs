import { automaticMapBudget, selectMapEvents, type MapViewport } from '@/lib/map-event-selection';

const viewport: MapViewport = { bounds: { west: 170, east: 190, south: -50, north: -30 }, width: 800, height: 600 };
const event = (id: number, longitude = 175, magnitude = 3) => ({ id, longitude, magnitude, latitude: -41, time: '2024-01-01' });

it('adapts the automatic budget to display area while bounding rendering work', () => {
  expect(automaticMapBudget(360, 640)).toBeLessThan(automaticMapBudget(1200, 800));
  expect(automaticMapBudget(10000, 10000)).toBe(4000);
  expect(automaticMapBudget(0, 0)).toBeGreaterThan(0);
  expect(automaticMapBudget(NaN, 600)).toBeGreaterThan(0);
});

it('allocates the entire budget to visible events regardless of offscreen magnitudes', () => {
  const nearby = event(10000, 175, 0);
  const events = [...Array.from({ length: 10000 }, (_, i) => event(i, 0, 8)), nearby];
  expect(selectMapEvents(events, viewport, 1)).toEqual({ sampled: [nearby], visibleCount: 1 });
  expect(events).toHaveLength(10001);
});

it('shows every visible event when they fit and preserves the original dataset', () => {
  const events = [event(1, 175), event(2, -175), event(3, 0)];
  const original = [...events];
  expect(selectMapEvents(events, viewport, 'auto').sampled).toEqual(events.slice(0, 2));
  expect(events).toEqual(original);
});

it('reveals previously omitted events when zooming into their region', () => {
  const events = [event(1, 175, 8), event(2, -175, 2)];
  expect(selectMapEvents(events, viewport, 1).sampled).toEqual([events[0]]);
  const zoomed = { ...viewport, bounds: { ...viewport.bounds, west: 180, east: 190 } };
  expect(selectMapEvents(events, zoomed, 1).sampled).toEqual([events[1]]);
});

it('keeps dateline and repeated-world selections equivalent', () => {
  const events = Array.from({ length: 2000 }, (_, i) => event(i, i % 2 ? 175 : -175, i % 10));
  const expected = selectMapEvents(events, viewport, 500);
  expect(selectMapEvents(events, { ...viewport, bounds: { ...viewport.bounds, east: -170 } }, 500)).toEqual(expected);
  expect(selectMapEvents(events, { ...viewport, bounds: { ...viewport.bounds, west: 530, east: 550 } }, 500)).toEqual(expected);
});

it('keeps the largest event, covers sparse areas, and fills its budget without duplicates', () => {
  const dense = Array.from({ length: 9000 }, (_, i) => event(i, 175, 3));
  const isolated = { ...event(9000, 188, 1), latitude: -32 };
  const largest = event(9001, 175, 8);
  const events = [...dense, isolated, largest];
  const result = selectMapEvents(events, viewport, 500);
  expect(result.sampled).toHaveLength(500);
  expect(result.sampled).toContain(largest);
  expect(result.sampled).toContain(isolated);
  expect(new Set(result.sampled.map(row => row.id)).size).toBe(500);
  expect(selectMapEvents(events, viewport, 500)).toEqual(result);
});

it('supports all-visible and explicit zero limits and repeated object references', () => {
  const row = event(1);
  const events = Array.from({ length: 1000 }, () => row);
  expect(selectMapEvents(events, viewport, Infinity).sampled).toHaveLength(1000);
  expect(selectMapEvents(events, viewport, 0).sampled).toHaveLength(0);
  const limited = selectMapEvents(events, viewport, 500).sampled;
  expect(limited).toHaveLength(500);
  expect(limited.every(item => item === row)).toBe(true);
});
