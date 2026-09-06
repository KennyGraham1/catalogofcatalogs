import { aggregateEventTimeline } from '@/lib/event-timeline';

describe('event timeline aggregation', () => {
  it('uses UTC dates and fills days without events', () => {
    expect(aggregateEventTimeline([
      { time: '2024-01-01T23:00:00-02:00' },
      { time: '2024-01-02T01:00:00Z' },
      { time: '2024-01-04T00:00:00Z' },
      { time: 'invalid' },
    ])).toEqual({ daysPerBin: 1, data: [
      { date: '2024-01-02', count: 2 },
      { date: '2024-01-03', count: 0 },
      { date: '2024-01-04', count: 1 },
    ] });
  });

  it.each([366, 4000, 40000, 150000])('bounds a %s-day catalogue without losing totals', days => {
    const events = Array.from({ length: days }, (_, day) => ({
      time: new Date(Date.UTC(1960, 0, 1) + day * 86400000).toISOString(),
    }));
    const result = aggregateEventTimeline(events);
    expect(result.data.length).toBeLessThanOrEqual(365);
    expect(result.daysPerBin).toBeGreaterThan(1);
    expect(result.data.reduce((sum, point) => sum + point.count, 0)).toBe(days);
  });

  it('chooses aggregation by time span, not by event count', () => {
    const events = Array.from({ length: 40001 }, () => ({ time: '2024-01-01T00:00:00Z' }));
    expect(aggregateEventTimeline(events)).toEqual({ daysPerBin: 1, data: [{ date: '2024-01-01', count: 40001 }] });
  });

  it('handles empty data and invalid budgets', () => {
    expect(aggregateEventTimeline([{ time: 'invalid' }]).data).toEqual([]);
    expect(aggregateEventTimeline([{ time: '2024-01-01' }, { time: '2024-02-01' }], 0).data).toHaveLength(1);
  });
});
