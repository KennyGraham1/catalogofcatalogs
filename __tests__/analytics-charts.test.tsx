/**
 * Regression tests for the analytics chart defects fixed in the `analytics`
 * cluster. echarts-for-react is mocked so the built ECharts option (series
 * names, axis label formatter, tooltip formatter) can be inspected directly -
 * the same seam __tests__/components/chart-tooltips.test.tsx uses.
 *
 * Expected values are derived by hand in each test, never by running the code.
 */
import { render } from '@testing-library/react';

let captured: any = null;
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => { captured = props.option; return null; },
}));

import {
  RegionDistributionChart, TemporalSeriesChart, MomentReleaseChart, MFDComparisonChart,
} from '@/components/charts';

const build = (el: React.ReactElement) => {
  captured = null;
  render(el);
  return captured as any;
};

/** Pull the value cell out of a ttRow(label, value) fragment of tooltip HTML. */
const rowValue = (html: string, label: string): string | null => {
  const match = html.match(new RegExp(`${label}</span><span[^>]*>([^<]*)</span>`));
  return match ? match[1] : null;
};

const MFD_CATALOGUES = [
  {
    catalogueId: 'a', catalogueName: 'Cat A', color: '#ff0000',
    histogram: [{ magnitude: 3, count: 120 }],
    cumulative: [{ magnitude: 3, count: 1540 }],
  },
  {
    catalogueId: 'b', catalogueName: 'Cat B', color: '#0000ff',
    histogram: [{ magnitude: 3, count: 60 }],
    cumulative: [{ magnitude: 3, count: 700 }],
  },
];

describe('MFD comparison: incremental and cumulative are separate, identifiable series', () => {
  it('names each curve after its quantity so the legend and tooltip can tell them apart', () => {
    const option = build(
      <MFDComparisonChart
        catalogues={MFD_CATALOGUES}
        magnitudeRange={{ min: 1, max: 6 }}
        logScale={false}
        showHistogram
        showCumulative
        cumulativeStyle="solid"
      />
    );
    const names = option.series.map((s: any) => s.name);
    // Two catalogues x two quantities = four series, all distinctly named.
    expect(names).toEqual(['Cat A N(M)', 'Cat B N(M)', 'Cat A N(≥M)', 'Cat B N(≥M)']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps the quantity suffix when only one of the two curves is enabled', () => {
    const histogramOnly = build(
      <MFDComparisonChart catalogues={MFD_CATALOGUES} magnitudeRange={{ min: 1, max: 6 }}
        logScale={false} showHistogram showCumulative={false} />
    );
    expect(histogramOnly.series.map((s: any) => s.name)).toEqual(['Cat A N(M)', 'Cat B N(M)']);

    const cumulativeOnly = build(
      <MFDComparisonChart catalogues={MFD_CATALOGUES} magnitudeRange={{ min: 1, max: 6 }}
        logScale={false} showHistogram={false} showCumulative />
    );
    expect(cumulativeOnly.series.map((s: any) => s.name)).toEqual(['Cat A N(≥M)', 'Cat B N(≥M)']);
  });

  it('labels the two tooltip rows for one catalogue differently', () => {
    const option = build(
      <MFDComparisonChart catalogues={[MFD_CATALOGUES[0]]} magnitudeRange={{ min: 1, max: 6 }}
        logScale={false} showHistogram showCumulative />
    );
    const html = option.tooltip.formatter([
      { axisValue: 3, value: [3, 120], seriesName: 'Cat A N(M)', color: '#ff0000' },
      { axisValue: 3, value: [3, 1540], seriesName: 'Cat A N(≥M)', color: '#ff0000' },
    ]);
    expect(rowValue(html, 'Cat A N\\(M\\)')).toBe('120');
    expect(rowValue(html, 'Cat A N\\(≥M\\)')).toBe('1,540');
  });
});

describe('Temporal series: week bin keys are not dates', () => {
  // The temporal worker emits ISO day keys up to a one-year span and ISO week
  // keys ("2019-W07") beyond it. `new Date('2019-W07')` is Invalid Date, which
  // previously rendered every tick as "NaN/aN" and every tooltip as
  // "Invalid Date". The bin key itself is the correct fallback label.
  const weekOption = () => build(
    <TemporalSeriesChart data={[{ date: '2019-W07', cumulativeCount: 4200, dailyCount: 31 }]} />
  );

  it('falls back to the bin key for an axis tick that is not a parseable date', () => {
    const label = weekOption().xAxis.axisLabel.formatter('2019-W07');
    expect(label).toBe('2019-W07');
    expect(label).not.toMatch(/NaN|aN/);
  });

  it('falls back to the bin key in the tooltip header', () => {
    const html = weekOption().tooltip.formatter([{ dataIndex: 0 }]);
    expect(html).toContain('2019-W07');
    expect(html).not.toContain('Invalid Date');
    expect(rowValue(html, 'Cumulative events')).toBe('4,200');
  });
});

describe('Temporal series: day bin keys are formatted in UTC', () => {
  const ORIGINAL_TZ = process.env.TZ;
  // A westward local zone is where a UTC-midnight key rolls back a day (and,
  // on the 1st of a month, a month) if the formatter uses local getters.
  beforeAll(() => { process.env.TZ = 'America/New_York'; });
  afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ;
  });

  it('labels 2024-01-01 as January 2024 regardless of the viewer time zone', () => {
    const option = build(
      <TemporalSeriesChart data={[{ date: '2024-01-01', cumulativeCount: 10 }]} />
    );
    // "M/YY" of the UTC instant 2024-01-01T00:00:00Z: month 1, year "24".
    expect(option.xAxis.axisLabel.formatter('2024-01-01')).toBe('1/24');
    expect(option.tooltip.formatter([{ dataIndex: 0 }])).toContain('01 Jan 2024');
  });

  it('labels a mid-month day key with its own month', () => {
    const option = build(
      <TemporalSeriesChart data={[{ date: '2024-03-05', cumulativeCount: 10 }]} />
    );
    expect(option.xAxis.axisLabel.formatter('2024-03-05')).toBe('3/24');
  });
});

describe('Moment release: equivalent Mw uses the N·m form of Hanks & Kanamori (1979)', () => {
  // Mw = (log10 M0 - 9.1) / 1.5 for M0 in N*m (IASPEI 2005 standardisation of
  // Hanks & Kanamori 1979, whose -10.7 constant is the dyne*cm form).
  it('agrees with the hand-computed relation at M0 = 1e18 N·m', () => {
    const option = build(
      <MomentReleaseChart data={[{ magnitude: 6, moment: 1e18, count: 1 }]} totalMoment={1e18} />
    );
    // (18 - 9.1) / 1.5 = 8.9 / 1.5 = 5.9333 -> "5.9"
    expect(rowValue(option.tooltip.formatter([{ dataIndex: 0 }]), 'Equivalent Mw')).toBe('5.9');
  });

  it('uses 9.1/1.5 rather than the rounded 6.07 constant', () => {
    // log10 M0 = 18.02775 exactly.
    //   (18.02775 - 9.1) / 1.5     = 8.92775 / 1.5 = 5.95183 -> "6.0"
    //   (2/3) * 18.02775 - 6.07    = 12.0185 - 6.07 = 5.94850 -> "5.9"
    const moment = Math.pow(10, 18.02775);
    const option = build(
      <MomentReleaseChart data={[{ magnitude: 6, moment, count: 1 }]} totalMoment={moment} />
    );
    expect(rowValue(option.tooltip.formatter([{ dataIndex: 0 }]), 'Equivalent Mw')).toBe('6.0');
  });
});

describe('Top regions: tooltip percentages are shares of the catalogue, not of the top N', () => {
  const TOP_TWO = [{ region: 'Canterbury', count: 300 }, { region: 'Wellington', count: 200 }];

  it('divides by the supplied event total when the caller passes only the top N', () => {
    const option = build(<RegionDistributionChart data={TOP_TWO} total={1000} />);
    const html = option.tooltip.formatter([{ axisValue: 'Canterbury', value: 300 }]);
    // 300 / 1000 = 30.0% of the filtered catalogue (not 300/500 = 60.0% of the bars drawn).
    expect(rowValue(html, 'Events')).toBe('300 (30.0%)');
  });

  it('falls back to the bar sum when no total is supplied', () => {
    const option = build(<RegionDistributionChart data={TOP_TWO} />);
    // 300 / (300 + 200) = 60.0%
    expect(rowValue(option.tooltip.formatter([{ axisValue: 'Canterbury', value: 300 }]), 'Events'))
      .toBe('300 (60.0%)');
  });
});
