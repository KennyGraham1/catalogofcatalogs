import {
  sampleEarthquakeEvents, sampleEarthquakeEventsWithViewport, isEventInBounds,
} from '@/lib/earthquake-utils';

const events = Array.from({ length: 137 }, (_, id) => ({
  id, latitude: -41, longitude: 175,
  magnitude: id === 136 ? 7 : id % 5,
  time: new Date(Date.UTC(2024, 0, id + 1)).toISOString(),
}));
const nz = { south: -50, north: -30, west: 170, east: 190 };

describe('map sampling', () => {
  it.each([1, 2, 7, 10, 50, 136, Infinity])('fills budget %s without duplicates and keeps the largest event', limit => {
    const result = sampleEarthquakeEvents(events, limit);
    expect(result.displayCount).toBe(Math.min(events.length, limit));
    expect(new Set(result.sampled.map(e => e.id)).size).toBe(result.displayCount);
    expect(result.sampled).toContain(events[136]);
  });

  it('is deterministic and does not mutate the source', () => {
    const input = Object.freeze([...events]);
    expect(sampleEarthquakeEvents(input as typeof events, 50))
      .toEqual(sampleEarthquakeEvents([...input], 50));
    expect(input).toEqual(events);
  });

  it('never refills sparse bins with events that were already selected', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const selected = sampleEarthquakeEvents(events, 136).sampled;
      expect(new Set(selected.map(event => event.id)).size).toBe(136);
    } finally { random.mockRestore(); }
  });

  it('handles catalogues larger than the JavaScript argument limit', () => {
    const large = Array.from({ length: 150000 }, (_, id) => ({ ...events[0], id }));
    expect(sampleEarthquakeEventsWithViewport(large, 1000).displayCount).toBe(1000);
  });

  it('validates and deduplicates before counting or sampling', () => {
    const result = sampleEarthquakeEvents([
      ...events, { ...events[0] }, { ...events[0], id: '0' },
      { ...events[0], id: 'bad', latitude: NaN },
      { ...events[0], id: 'bad2', longitude: Infinity },
      { ...events[0], id: 'bad3', magnitude: NaN },
    ], Infinity);
    expect(result.total).toBe(events.length);
    expect(result.displayCount).toBe(events.length);
    expect(result.isSampled).toBe(false);
  });

  it.each([0, -1, NaN, -Infinity])('handles invalid/empty budgets (%s)', limit => {
    expect(sampleEarthquakeEvents(events, limit).sampled).toEqual([]);
    expect(sampleEarthquakeEventsWithViewport(events, limit, nz).sampled).toEqual([]);
  });

  it('handles fractional budgets and empty input', () => {
    expect(sampleEarthquakeEvents(events, 2.9).displayCount).toBe(2);
    expect(sampleEarthquakeEvents([], 10)).toEqual({ sampled: [], total: 0, displayCount: 0, isSampled: false });
  });

  it('keeps the full temporal range in a dense magnitude bin', () => {
    const sameMagnitude = events.map(e => ({ ...e, magnitude: 3 }));
    const selected = sampleEarthquakeEvents(sameMagnitude, 10).sampled;
    expect(selected).toContain(sameMagnitude[0]);
    expect(selected).toContain(sameMagnitude[136]);
  });

  it.each([null, nz])('uses the full budget when all events are visible (%s)', bounds => {
    expect(sampleEarthquakeEventsWithViewport(events, 50, bounds).displayCount).toBe(50);
  });

  it('borrows unused viewport capacity and reports actual visible totals even below the limit', () => {
    const input = events.map((e, i) => ({ ...e, longitude: i < 3 ? -175 : 0 }));
    const sampled = sampleEarthquakeEventsWithViewport(input, 20, nz);
    expect(sampled.displayCount).toBe(20);
    expect(sampled.inViewport).toBe(3);
    expect(sampled.sampled.filter(e => isEventInBounds(e, nz))).toHaveLength(3);
    expect(sampleEarthquakeEventsWithViewport(input, Infinity, nz).inViewport).toBe(3);
  });

  it.each([
    { ...nz, west: 170, east: -170 }, nz,
    { ...nz, west: 530, east: 550 },
    { ...nz, west: -190, east: -170 },
  ])('recognizes both sides of the dateline and wrapped world copies: %s', bounds => {
    expect(isEventInBounds({ latitude: -41, longitude: -175 }, bounds)).toBe(true);
    expect(isEventInBounds({ latitude: -41, longitude: 175 }, bounds)).toBe(true);
    expect(isEventInBounds({ latitude: -41, longitude: 0 }, bounds)).toBe(false);
    expect(isEventInBounds({ latitude: 0, longitude: 175 }, bounds)).toBe(false);
  });

  it('handles whole-world and zero-width bounds', () => {
    expect(isEventInBounds(events[0], { ...nz, west: -540, east: 540 })).toBe(true);
    expect(isEventInBounds(events[0], { ...nz, west: 175, east: 175 })).toBe(true);
    expect(isEventInBounds(events[0], { ...nz, west: 170, east: 170 })).toBe(false);
  });
});
