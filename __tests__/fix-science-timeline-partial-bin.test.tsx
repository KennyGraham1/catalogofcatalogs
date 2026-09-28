/**
 * Findings #6 / #15: timeline bins are fixed durations anchored at the first event's
 * UTC day, so the last bin usually covers fewer days than the rest, yet it was drawn
 * as a full "Events per N Days" total. A constant-rate catalogue therefore showed a
 * false drop in its most recent point, where readers look for rate changes. The
 * aggregator now records the days the partial bin covers, and the chart draws that
 * bin scaled to a full period and marked as partial, with the raw count on hover.
 */
import { render } from '@testing-library/react';
import { aggregateEventTimeline } from '@/lib/event-timeline';

let captured: any = null;
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => { captured = props.option; return null; },
}));

import { EventTimelineChart } from '@/components/charts';

/** One event per day for `days` days from 1 Jan 2024 (UTC). */
const daily = (days: number) => Array.from({ length: days }, (_, day) => ({
  time: new Date(Date.UTC(2024, 0, 1) + day * 86400_000 + 3600_000).toISOString(),
}));

describe('timeline aggregation marks a partial last bin', () => {
  it('records the single day the last 7-day bin of a 400-day series covers', () => {
    // 400 days in 7-day bins: 57 full bins (399 days) and one bin covering 1 day.
    const { data, daysPerBin } = aggregateEventTimeline(daily(400));
    expect(daysPerBin).toBe(7);
    expect(data).toHaveLength(58);
    expect(data[57]).toMatchObject({ count: 1, coveredDays: 1 });
    expect(data.slice(0, 57).every(bin => bin.count === 7 && bin.coveredDays === undefined)).toBe(true);
  });

  it('marks nothing when the span is a whole number of bins', () => {
    const { data } = aggregateEventTimeline(daily(399));
    expect(data).toHaveLength(57);
    expect(data.every(bin => bin.coveredDays === undefined)).toBe(true);
  });
});

describe('timeline chart draws a partial bin as a scaled, marked point', () => {
  const data = [
    { date: '2025-01-20', count: 7 },
    { date: '2025-01-27', count: 7 },
    { date: '2025-02-03', count: 1, coveredDays: 1 },
  ];

  it('scales the partial count to a full period instead of plotting it as a drop', () => {
    captured = null;
    render(<EventTimelineChart data={data} daysPerBin={7} seriesName="Events per 7 Days" />);
    const [full, partial] = captured.series;
    // The solid line stops at the last full bin...
    expect(full.data).toEqual([7, 7, null]);
    // ...and a dashed segment continues to the partial bin at 1 event x 7/1 days.
    expect(partial.data).toEqual([null, 7, 7]);
    expect(partial.lineStyle.type).toBe('dashed');
  });

  it('gives the raw count and covered days in the tooltip', () => {
    captured = null;
    render(<EventTimelineChart data={data} daysPerBin={7} seriesName="Events per 7 Days" />);
    const html = captured.tooltip.formatter([{ dataIndex: 2, axisValue: '2025-02-03' }]);
    expect(html).toContain('Partial period');
    expect(html).toContain('1 event in 1 of 7 days');
  });
});
