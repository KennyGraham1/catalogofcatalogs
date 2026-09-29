/**
 * Post-fix review, items 4 and 9.
 *
 *  4  A partial first or last time bin was measured from the first or last EVENT's day,
 *     so it always held its defining event and scaling it to a full bin overstated the
 *     rate (weekly bins at 0.3 events/day: edge bins 1.99x the true rate). Coverage is now
 *     measured against a known period (the time filter, or the catalogue's declared
 *     time_period_start/end); without one the result says so and the chart shows the raw
 *     count, marked, instead of scaling it.
 *  9  Cumulative charts plotted each bin's running total at the bin's START; it is
 *     reached at the bin's end.
 *
 * Library and worker parity is checked through the worker's own `self.onmessage`.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { render } from '@testing-library/react';

import { analyzeSeismicityTimeSeries, type EarthquakeEvent } from '@/lib/seismological-analysis';
import { aggregateEventTimeline } from '@/lib/event-timeline';

let captured: any = null;
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => { captured = props.option; return null; },
}));

import { EventTimelineChart, TemporalSeriesChart } from '@/components/charts';

const WORKER_PATH = path.join(__dirname, '..', 'workers', 'seismological-worker.ts');
function loadWorker(): (message: Record<string, unknown>) => any {
  const js = ts.transpileModule(fs.readFileSync(WORKER_PATH, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const posted: any[] = [];
  const selfStub: any = { postMessage: (message: any) => posted.push(message) };
  const moduleStub = { exports: {} as Record<string, unknown> };
  new Function('self', 'module', 'exports', js)(selfStub, moduleStub, moduleStub.exports);
  return (message: Record<string, unknown>) => {
    posted.length = 0;
    selfStub.onmessage({ data: message });
    return posted[posted.length - 1].result;
  };
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86400_000;
let id = 0;
const at = (time: string | number): EarthquakeEvent => ({
  id: `e${id++}`, time: typeof time === 'number' ? new Date(time).toISOString() : time,
  latitude: -41, longitude: 174, depth: 10, magnitude: 3,
});

describe('4: partial bins are measured against a known period', () => {
  // Wednesday 3 Jan and Tuesday 20 Feb 2024; the catalogue covers 1 Jan (a Monday) to
  // the end of 29 Feb 2024 (a Thursday): the period's end is exclusive, 1 Mar 00:00.
  const events = () => [at('2024-01-03T05:00:00Z'), at('2024-01-10T00:00:00Z'), at('2024-02-20T23:59:59Z')];
  const period = { start: '2024-01-01T00:00:00Z', end: '2024-03-01T00:00:00Z' };

  it('spans the period and measures the edge weeks against it, in both copies', () => {
    const lib = analyzeSeismicityTimeSeries(events(), { interval: 'week', minMagnitude: 0, period });
    expect(lib.coverage).toBe('period');
    expect([lib.startDate, lib.endDate]).toEqual(['2024-01-01', '2024-02-29']);
    // The week of 1 Jan is whole; the week of 26 Feb holds 26-29 Feb of the period.
    expect(lib.rate.bins[0]).toEqual({ date: '2024-01-01', count: 1, days: 7 });
    expect(lib.rate.bins[lib.rate.bins.length - 1]).toEqual({ date: '2024-02-26', count: 0, days: 7, coveredDays: 4 });
    const worker = loadWorker()({ type: 'time-series', events: events(), interval: 'week', minMagnitude: 0, period });
    expect(worker).toEqual(JSON.parse(JSON.stringify(lib)));
  });

  it('measures a period that starts mid-day exactly, in fractional days', () => {
    // The period opens at noon on Tuesday 2 Jan, before the first event: 5.5 days of
    // that ISO week (2 Jan 12:00 to 8 Jan 00:00).
    const lib = analyzeSeismicityTimeSeries(events(), {
      interval: 'week', minMagnitude: 0, period: { start: '2024-01-02T12:00:00Z', end: '2024-03-01T00:00:00Z' },
    });
    expect(lib.rate.bins[0]).toMatchObject({ date: '2024-01-01', days: 7, coveredDays: 5.5 });
  });

  it('says when it could only read coverage off the events', () => {
    const lib = analyzeSeismicityTimeSeries(events(), { interval: 'week', minMagnitude: 0 });
    expect(lib.coverage).toBe('events');
    expect(lib.startDate).toBe('2024-01-03');
    expect(lib.rate.bins[0].coveredDays).toBe(5);
  });

  it('widens a declared period that misses an event, and ignores an inverted one', () => {
    const widened = analyzeSeismicityTimeSeries(events(), {
      interval: 'week', minMagnitude: 0, period: { start: '2024-01-15T00:00:00Z', end: '2024-03-01T00:00:00Z' },
    });
    expect(widened.startDate).toBe('2024-01-03');
    const inverted = analyzeSeismicityTimeSeries(events(), {
      interval: 'week', minMagnitude: 0, period: { start: '2024-03-01T00:00:00Z', end: '2024-01-01T00:00:00Z' },
    });
    expect(inverted.coverage).toBe('events');
  });

  it('scales edge bins without bias once the period is known (Poisson catalogues)', () => {
    // 0.3 events/day for three years; the observation period is the three years. The
    // reviewer measured edge bins 1.99x the true rate when coverage came from the events.
    const rate = 0.3;
    const ratios: number[] = [];
    for (let s = 0; s < 400; s++) {
      const r = rng(s + 1);
      const t0 = Date.UTC(2020, 0, 1, 12) + Math.floor(r() * 7) * DAY; // any weekday
      const t1 = t0 + 3 * 365 * DAY;
      const list: EarthquakeEvent[] = [];
      for (let t = t0 - Math.log(1 - r()) / rate * DAY; t < t1; t += -Math.log(1 - r()) / rate * DAY) list.push(at(t));
      if (list.length === 0) continue;
      const result = analyzeSeismicityTimeSeries(list, {
        interval: 'week', minMagnitude: 0, period: { start: t0, end: t1 },
      });
      for (const bin of [result.rate.bins[0], result.rate.bins[result.rate.bins.length - 1]]) {
        if (bin.coveredDays) ratios.push((bin.count * bin.days / bin.coveredDays) / (rate * bin.days));
      }
    }
    const mean = ratios.reduce((s, x) => s + x, 0) / ratios.length;
    expect(ratios.length).toBeGreaterThan(300);
    expect(Math.abs(mean - 1)).toBeLessThan(0.1);
  });
});

describe('4: the Timeline tab aggregation takes the same period', () => {
  const daily = (from: number, days: number) => Array.from({ length: days }, (_, d) => ({
    time: new Date(from + d * DAY + 3600_000).toISOString(),
  }));

  it('starts the bins at the period start and measures the last bin to the period end', () => {
    // Events on days 10-409 of a period covering days 0-419 from 1 Jan 2024 (its end,
    // exclusive, is day 420): 420 days in 7-day bins is 60 whole bins, none partial.
    const start = Date.UTC(2024, 0, 1);
    const withPeriod = aggregateEventTimeline(daily(start + 10 * DAY, 400), 365, {
      period: { start, end: start + 420 * DAY },
    });
    expect(withPeriod.daysPerBin).toBe(7);
    expect(withPeriod.data[0].date).toBe('2024-01-01');
    expect(withPeriod.data).toHaveLength(60);
    expect(withPeriod.data.some(bin => bin.coveredDays !== undefined)).toBe(false);
    // Without it the bins start at the first event and the last one is cut by the last event.
    const withoutPeriod = aggregateEventTimeline(daily(start + 10 * DAY, 400));
    expect(withoutPeriod.data[0].date).toBe('2024-01-11');
    expect(withoutPeriod.data[withoutPeriod.data.length - 1].coveredDays).toBe(1);
  });
});

describe('4: the chart scales only coverage it can trust', () => {
  const data = [
    { date: '2025-01-20', count: 7 },
    { date: '2025-01-27', count: 7 },
    { date: '2025-02-03', count: 1, coveredDays: 1 },
  ];

  it("draws a partial bin at its raw count, marked, in 'mark' mode", () => {
    captured = null;
    render(<EventTimelineChart data={data} daysPerBin={7} seriesName="Events per week" partialBins="mark" />);
    const [full, partial] = captured.series;
    expect(full.data).toEqual([7, 7, null]);
    expect(partial.data).toEqual([null, 7, 1]);
    expect(partial.symbol).toBe('emptyCircle');
    const html = captured.tooltip.formatter([{ dataIndex: 2, axisValue: '2025-02-03' }]);
    expect(html).toContain('raw count, not scaled');
    expect(html).not.toContain('scaled to 7 days');
  });

  it("still scales it in 'scale' mode (a known period)", () => {
    captured = null;
    render(<EventTimelineChart data={data} daysPerBin={7} seriesName="Events per week" partialBins="scale" />);
    expect(captured.series[1].data).toEqual([null, 7, 7]);
  });
});

describe('9: cumulative counts are plotted at the end of their bins', () => {
  it('puts each ISO week\'s running total at the Monday after it', () => {
    captured = null;
    render(<TemporalSeriesChart binDays={7} data={[
      { date: '2024-01-01', count: 3, cumulativeCount: 3 },
      { date: '2024-01-15', count: 2, cumulativeCount: 5 },
    ]} />);
    expect(captured.series[0].data).toEqual([[Date.parse('2024-01-08'), 3], [Date.parse('2024-01-22'), 5]]);
    const html = captured.tooltip.formatter([{ dataIndex: 1 }]);
    expect(html).toContain('15 Jan 2024 – 21 Jan 2024');
    expect(html).toContain('This period');
  });
});
