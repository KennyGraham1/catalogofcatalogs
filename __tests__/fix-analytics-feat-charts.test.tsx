/**
 * A2 chart components: the generalised timeline (per-bin lengths, partial first and last
 * bins), the magnitude-time scatter, the cumulative release chart, the goodness-of-fit
 * chart, and the magnitude-time sampler. echarts-for-react is mocked to capture the built
 * option, as in __tests__/components/chart-tooltips.test.tsx. Expected values are worked
 * out by hand.
 */
import { render } from '@testing-library/react';

let captured: any = null;
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => { captured = props.option; return null; },
}));

import {
  EventTimelineChart, MagnitudeTimeScatter, CumulativeReleaseChart, GoodnessOfFitChart,
} from '@/components/charts';
import { sampleMagnitudeTime } from '@/lib/plot-sampling';

const build = (el: React.ReactElement) => { captured = null; render(el); return captured; };

describe('EventTimelineChart with calendar bins', () => {
  // ISO weeks of a span from Wednesday 3 Jan to Tuesday 20 Feb 2024 (5 and 2 days covered).
  const weeks = [
    { date: '2024-01-01', count: 5, days: 7, coveredDays: 5 },
    { date: '2024-01-08', count: 7, days: 7 },
    { date: '2024-01-15', count: 7, days: 7 },
    { date: '2024-02-19', count: 1, days: 7, coveredDays: 2 },
  ];

  it('scales a partial first bin as well as a partial last one', () => {
    const option = build(<EventTimelineChart data={weeks} daysPerBin={7} seriesName="Events per week" />);
    const [full, partial] = option.series;
    expect(full.data).toEqual([null, 7, 7, null]);
    // 5 events in 5 of 7 days -> 7; 1 event in 2 of 7 days -> 3.5; each joined to its neighbour.
    expect(partial.data).toEqual([7, 7, 7, 3.5]);
    expect(partial.lineStyle.type).toBe('dashed');
  });

  it('uses each month\'s own length', () => {
    const months = [
      { date: '2024-01-01', count: 29, days: 31, coveredDays: 29 },
      { date: '2024-02-01', count: 29, days: 29 },
      { date: '2024-03-01', count: 10, days: 31, coveredDays: 10 },
    ];
    const option = build(<EventTimelineChart data={months} seriesName="Events per month" />);
    const [full, partial] = option.series;
    expect(full.data).toEqual([null, 29, null]);
    expect(partial.data).toEqual([31, 29, 31]);
    const html = option.tooltip.formatter([{ dataIndex: 2, axisValue: '2024-03-01' }]);
    expect(html).toContain('10 events in 10 of 31 days');
    expect(html).toContain('scaled to 31 days');
  });

  it('draws no partial series when every bin is whole', () => {
    const option = build(<EventTimelineChart data={[weeks[1], weeks[2]]} daysPerBin={7} />);
    expect(option.series).toHaveLength(1);
  });
});

describe('MagnitudeTimeScatter', () => {
  const data = [
    { time: '2016-11-13T11:02:56Z', magnitude: 7.8, magnitude_type: 'Mw' },
    { time: '2016-11-14T00:34:22Z', magnitude: 6.5, magnitude_type: 'ML' },
    { time: 'not a time', magnitude: 3 },
  ];

  it('plots UTC times against magnitude, with the threshold line', () => {
    const option = build(<MagnitudeTimeScatter data={data} threshold={2.3} thresholdLabel="Mc = 2.3" />);
    expect(option.useUTC).toBe(true);
    const series = option.series[0];
    expect(series.data).toEqual([[Date.parse('2016-11-13T11:02:56Z'), 7.8, 'Mw'], [Date.parse('2016-11-14T00:34:22Z'), 6.5, 'ML']]);
    expect(series.markLine.data).toEqual([{ yAxis: 2.3 }]);
    expect(series.markLine.label.formatter).toBe('Mc = 2.3');
    // The tooltip shows the UTC instant (13 Nov, not 14 Nov NZDT) and the type.
    const html = option.tooltip.formatter({ value: series.data[0], color: '#000' });
    expect(html).toContain('13 Nov 2016, 11:02 UTC');
    expect(html).toContain('7.8 Mw');
  });

  it('draws no threshold line without a threshold', () => {
    expect(build(<MagnitudeTimeScatter data={data} threshold={null} />).series[0].markLine).toBeUndefined();
  });
});

describe('sampleMagnitudeTime', () => {
  const events = Array.from({ length: 10000 }, (_, i) => ({
    time: new Date(Date.UTC(2020, 0, 1) + i * 60_000).toISOString(),
    magnitude: i === 1234 ? 7.5 : 1 + (i % 30) / 10,
  }));

  it('keeps every event under the budget, in time order', () => {
    const { points, total } = sampleMagnitudeTime(events.slice(0, 100).reverse(), 3000);
    expect(total).toBe(100);
    expect(points.map(p => p.t)).toEqual([...points.map(p => p.t)].sort((a, b) => a - b));
  });

  it('bounds a large catalogue, keeps the largest event, and samples evenly in time', () => {
    const { points, total } = sampleMagnitudeTime(events, 1000);
    expect(total).toBe(10000);
    expect(points).toHaveLength(1000);
    expect(points.some(p => p.magnitude === 7.5)).toBe(true);
    // Uniform event times, so each half of the span holds about half the points.
    const mid = Date.UTC(2020, 0, 1) + 5000 * 60_000;
    const firstHalf = points.filter(p => p.t < mid).length;
    expect(Math.abs(firstHalf - 500)).toBeLessThan(60);
  });
});

describe('CumulativeReleaseChart', () => {
  const bins = [
    { date: '2024-01-01', days: 7, moment: 1.12e17, energy: 5.6e12, cumulativeMoment: 1.12e17, cumulativeEnergy: 5.6e12 },
    { date: '2024-01-08', days: 7, moment: 0, energy: 0, cumulativeMoment: 1.12e17, cumulativeEnergy: 5.6e12 },
  ];

  it('plots cumulative moment in N·m at each bin END, with the equivalent single-event Mw', () => {
    const option = build(<CumulativeReleaseChart data={bins} quantity="moment" />);
    // A running total is reached at the end of its bin: 8 and 15 January for these weeks.
    expect(option.series[0].data).toEqual([[Date.parse('2024-01-08'), 1.12e17], [Date.parse('2024-01-15'), 1.12e17]]);
    expect(option.yAxis.name).toBe('Cumulative seismic moment (N·m)');
    const html = option.tooltip.formatter([{ dataIndex: 0 }]);
    // Mw = (log10 1.12e17 - 9.1) / 1.5 = 5.30
    expect(html).toContain('Mw 5.30');
    expect(html).toContain('01 Jan 2024 – 07 Jan 2024');
  });

  it('plots cumulative radiated energy in J', () => {
    const option = build(<CumulativeReleaseChart data={bins} quantity="energy" />);
    expect(option.series[0].data[0]).toEqual([Date.parse('2024-01-08'), 5.6e12]);
    expect(option.yAxis.name).toBe('Cumulative radiated energy (J)');
    expect(option.tooltip.formatter([{ dataIndex: 0 }])).not.toContain('Mw');
  });
});

describe('GoodnessOfFitChart', () => {
  it('marks the 95% and 90% levels and the chosen Mc', () => {
    const curve = [{ magnitude: 1.8, fit: 83.1 }, { magnitude: 1.9, fit: 91.1 }, { magnitude: 2.0, fit: 99.7 }];
    const option = build(<GoodnessOfFitChart curve={curve} mc={2.0} />);
    const lines = option.series[0].markLine.data;
    expect(lines.map((l: any) => l.yAxis ?? l.xAxis)).toEqual([95, 90, 2.0]);
    expect(option.series[0].data).toEqual([[1.8, 83.1], [1.9, 91.1], [2.0, 99.7]]);
    expect(option.tooltip.formatter([{ dataIndex: 1 }])).toContain('Reaches 90%');
  });

  it('marks no Mc after a fallback to MAXC', () => {
    const option = build(<GoodnessOfFitChart curve={[{ magnitude: 1, fit: 82 }]} mc={null} />);
    expect(option.series[0].markLine.data).toHaveLength(2);
  });
});
