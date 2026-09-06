/**
 * Regression tests for lib/earthquake-utils.ts
 *  - Unix epochs arriving as strings (CSV cells are always strings) must not be
 *    swallowed by the compact Julian day branch, which read them as year-1705 dates.
 *  - Map sampling must stay deterministic, duplicate-free, and able to report how
 *    strongly a strategy favours large events.
 *
 * Expected timestamps are derived from the calendar, not from the implementation:
 * 2024-01-01T00:00:00Z is 19723 days after the epoch (54*365 + 13 leap days) =
 * 1704067200 s, so 1705318200 s = +1251000 s = 14 d 11 h 30 min = 2024-01-15T11:30Z.
 */
import {
  normalizeTimestamp,
  validateTimestamp,
  sampleEarthquakeEvents,
  sampleEarthquakeEventsWithStrategy,
} from '@/lib/earthquake-utils';

describe('normalizeTimestamp - Unix epochs supplied as strings', () => {
  it('reads a 13-digit string as milliseconds, matching the numeric form', () => {
    expect(normalizeTimestamp('1705318200000')).toBe('2024-01-15T11:30:00.000Z');
    expect(normalizeTimestamp('1705318200000')).toBe(normalizeTimestamp(1705318200000));
  });

  it('reads a 10-digit string as seconds instead of rejecting it', () => {
    expect(normalizeTimestamp('1705318200')).toBe('2024-01-15T11:30:00.000Z');
    expect(validateTimestamp('1705318200')).toBe(true);
  });

  it('no longer parses an epoch-millisecond string as a year-1705 date', () => {
    // Before the fix this returned '1705-11-14T20:00:00.000Z' (year 1705, day 318)
    // and validateTimestamp accepted it, so the event was stored 318 years early.
    expect(normalizeTimestamp('1705318200000')?.slice(0, 4)).toBe('2024');
  });

  it('still reads genuine compact Julian day timestamps (year >= 1900)', () => {
    // 2024 day 015 = 15 January; 1998 day 200 = 19 July (1998 is not a leap year:
    // 31+28+31+30+31+30 = 181 days to 30 June, so day 200 is 19 July).
    expect(normalizeTimestamp('2024015103000')).toBe('2024-01-15T10:30:00.000Z');
    expect(normalizeTimestamp('1998200235959')).toBe('1998-07-19T23:59:59.000Z');
  });

  it('reads a pre-1900 13-digit string as an epoch, not a Julian day', () => {
    // 1855015103 s = 1704067200 + 150947903 s = 1747 d 1 h 58 min 23 s after
    // 2024-01-01Z: 2024 (366) + 2025 + 2026 + 2027 (365 each) = 1461 d to
    // 2028-01-01Z, then 286 more days = day-of-year 287 of leap year 2028 = 13 Oct.
    expect(normalizeTimestamp('1855015103000')).toBe('2028-10-13T01:58:23.000Z');
  });

  it('leaves every other supported format untouched', () => {
    expect(normalizeTimestamp('2024-01-15T11:30:00Z')).toBe('2024-01-15T11:30:00.000Z');
    expect(normalizeTimestamp('2024-01-15 11:30:00')).toBe('2024-01-15T11:30:00.000Z');
    expect(normalizeTimestamp('20240115 113000')).toBe('2024-01-15T11:30:00.000Z');
    expect(normalizeTimestamp('20240115113000')).toBe('2024-01-15T11:30:00.000Z');
    expect(normalizeTimestamp('2024 015 11:30:00')).toBe('2024-01-15T11:30:00.000Z');
    expect(normalizeTimestamp('15/01/2024 11:30:00')).toBe('2024-01-15T11:30:00.000Z');
    expect(normalizeTimestamp('not a date')).toBeNull();
    expect(normalizeTimestamp('123456789012')).toBeNull(); // 12 digits: not an epoch
  });
});

// 1000 events, one in ten of magnitude 6.5, one per day so time order == index order.
const catalogue = Array.from({ length: 1000 }, (_, id) => ({
  id,
  latitude: -41,
  longitude: 175,
  magnitude: id % 10 === 5 ? 6.5 : 2,
  time: new Date(Date.UTC(2024, 0, 1) + id * 86400000).toISOString(),
}));

describe('sampleEarthquakeEvents - selection integrity', () => {
  it('fills the budget with distinct events and can still pick the head of the array', () => {
    // The old top-up filtered the SOURCE array by positions taken from the SAMPLED
    // array, so it re-drew already-sampled events and could never pick the first
    // sampled.length entries (the oldest events in DB order).
    const { sampled, displayCount, total } = sampleEarthquakeEvents(catalogue, 100);
    expect(total).toBe(1000);
    expect(displayCount).toBe(100);
    expect(new Set(sampled.map(event => event.id)).size).toBe(100);
    expect(sampled.some(event => (event.id as number) < 100)).toBe(true);
  });

  it('uses no randomness at all, so the same catalogue always renders the same map', () => {
    const random = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('sampling must be deterministic');
    });
    try {
      expect(sampleEarthquakeEvents(catalogue, 137).sampled.map(event => event.id))
        .toEqual(sampleEarthquakeEvents(catalogue, 137).sampled.map(event => event.id));
    } finally {
      random.mockRestore();
    }
  });

  it('keeps its published result shape (no strategy metadata leaks into it)', () => {
    expect(Object.keys(sampleEarthquakeEvents(catalogue, 10)).sort())
      .toEqual(['displayCount', 'isSampled', 'sampled', 'total']);
  });
});

describe('sampleEarthquakeEventsWithStrategy', () => {
  it('reports how far the stratified default over-represents large events', () => {
    // Budget 100 over 1000 events: 10 slots go to the largest events, leaving 90 to
    // split evenly between the two non-empty bins (45 each, both bins can absorb it).
    // So M>=6 keeps 10 + 45 = 55 of its 100 events and M<3 keeps 45 of its 900 - an
    // 11x higher retention rate for the large-magnitude bin.
    const result = sampleEarthquakeEventsWithStrategy(catalogue, 100);
    expect(result.strategy).toBe('magnitude-stratified');
    expect(result.displayCount).toBe(100);
    expect(result.bins.find(bin => bin.label === 'M>=6')).toEqual({
      label: 'M>=6', total: 100, retained: 55,
    });
    expect(result.bins.find(bin => bin.label === 'M<3')).toEqual({
      label: 'M<3', total: 900, retained: 45,
    });
    expect(result.sampled).toEqual(sampleEarthquakeEvents(catalogue, 100).sampled);
  });

  it('retains every magnitude at the same rate under the proportional strategy', () => {
    // A systematic pass in time order with a step of 999/99 = 10.09 events sweeps
    // through all ten index residues while the large events sit on one residue, so
    // roughly 10 of the 100 retained events are large - the catalogue's own 10%.
    const result = sampleEarthquakeEventsWithStrategy(catalogue, 100, 'proportional');
    const large = result.bins.find(bin => bin.label === 'M>=6')!;
    expect(result.strategy).toBe('proportional');
    expect(result.displayCount).toBe(100);
    expect(new Set(result.sampled.map(event => event.id)).size).toBe(100);
    expect(large.total).toBe(100);
    expect(large.retained).toBeGreaterThanOrEqual(6);
    expect(large.retained).toBeLessThanOrEqual(14);
    expect(result.bins.reduce((sum, bin) => sum + bin.retained, 0)).toBe(100);
    expect(result.bins.reduce((sum, bin) => sum + bin.total, 0)).toBe(1000);
  });

  it('accounts for every eligible event when nothing is dropped', () => {
    const all = sampleEarthquakeEventsWithStrategy(catalogue, Infinity, 'proportional');
    expect(all.isSampled).toBe(false);
    expect(all.displayCount).toBe(1000);
    expect(all.bins.map(bin => bin.total)).toEqual(all.bins.map(bin => bin.retained));
    expect(sampleEarthquakeEventsWithStrategy([], 10, 'proportional').bins)
      .toEqual([
        { label: 'M>=6', total: 0, retained: 0 },
        { label: 'M5-6', total: 0, retained: 0 },
        { label: 'M4-5', total: 0, retained: 0 },
        { label: 'M3-4', total: 0, retained: 0 },
        { label: 'M<3', total: 0, retained: 0 },
      ]);
  });
});
