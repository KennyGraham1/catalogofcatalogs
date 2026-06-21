/**
 * Invokes each chart's tooltip formatter with representative ECharts params to prove
 * the (professional, enriched) tooltips render without throwing and include the
 * expected content. echarts-for-react is mocked to capture the built option.
 */
import { render } from '@testing-library/react';

let captured: any = null;
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => { captured = props.option; return null; },
}));

import {
  MagnitudeDistributionChart, DepthDistributionChart, CatalogueDistributionChart,
  MagnitudeDepthScatter, EventTimelineChart,
  GutenbergRichterChart, CompletenessChart, TemporalSeriesChart, MomentReleaseChart, MFDComparisonChart,
} from '@/components/charts';

const fmt = (el: React.ReactElement) => {
  captured = null;
  render(el);
  return captured?.tooltip?.formatter as (p: any) => string;
};

describe('chart tooltip formatters (enriched, professional)', () => {
  it('magnitude distribution: range + %, magnitude class', () => {
    const f = fmt(<MagnitudeDistributionChart data={[{ range: '5.0+', count: 25 }, { range: '2.0-2.5', count: 75 }]} />);
    const html = f([{ axisValue: '5.0+', value: 25, color: '#ef4444' }]);
    expect(html).toContain('Magnitude 5.0+');
    expect(html).toContain('25 (25.0%)');
    expect(html).toContain('class');
  });
  it('depth distribution: depth class badge', () => {
    const f = fmt(<DepthDistributionChart data={[{ range: '0-10 km', count: 50 }]} />);
    expect(f([{ axisValue: '0-10 km', value: 50, color: '#10b981' }])).toContain('Shallow-focus');
  });
  it('catalogue pie: events + share', () => {
    const f = fmt(<CatalogueDistributionChart data={[{ catalogue: 'GeoNet', count: 10 }]} />);
    const html = f({ name: 'GeoNet', value: 10, percent: 100, color: '#2563eb' });
    expect(html).toContain('GeoNet');
    expect(html).toContain('Share');
  });
  it('magnitude-depth scatter: magnitude + depth class', () => {
    const f = fmt(<MagnitudeDepthScatter data={[{ magnitude: 4.2, depth: 120 }]} />);
    const html = f({ value: [4.2, 120, 4.2], color: '#f97316' });
    expect(html).toContain('M 4.2');
    expect(html).toContain('Intermediate-focus');
  });
  it('timeline: formatted date + count', () => {
    const f = fmt(<EventTimelineChart data={[{ date: '2024-03-15', count: 8 }]} />);
    expect(f([{ axisValue: '2024-03-15', value: 8 }])).toMatch(/Mar 2024|2024/);
  });
  it('Gutenberg-Richter: cumulative N + Mc state for observed, fit for line', () => {
    const f = fmt(<GutenbergRichterChart result={{ dataPoints: [{ magnitude: 3, logCount: 2, count: 100 }], fittedLine: [{ magnitude: 3, logCount: 2 }], completeness: 2.5, aValue: 4, bValue: 1 }} />);
    expect(f({ seriesName: 'Observed', value: [3, 2], color: '#2563eb' })).toContain('Cumulative N');
    expect(f({ seriesName: 'Observed', value: [2, 2.5], color: '#2563eb' })).toContain('incomplete');
    expect(f({ seriesName: 'G-R Fit', value: [3, 2] })).toContain('b-value');
  });
  it('completeness: Complete/Incomplete relative to Mc', () => {
    const f = fmt(<CompletenessChart distribution={[{ magnitude: 2.0, count: 5 }, { magnitude: 3.0, count: 9 }]} mc={2.5} />);
    expect(f([{ axisValue: 3.0, value: 9 }])).toContain('Complete');
    expect(f([{ axisValue: 2.0, value: 5 }])).toContain('Incomplete');
  });
  it('temporal: cumulative + this-period', () => {
    const f = fmt(<TemporalSeriesChart data={[{ date: '2024-01-01T00:00:00Z', cumulativeCount: 10, dailyCount: 3 }]} />);
    const html = f([{ dataIndex: 0 }]);
    expect(html).toContain('Cumulative events');
    expect(html).toContain('This period');
  });
  it('moment: share of total + equivalent Mw', () => {
    const f = fmt(<MomentReleaseChart data={[{ magnitude: 6, moment: 1.2e18, count: 2 }]} totalMoment={2.4e18} />);
    const html = f([{ dataIndex: 0 }]);
    expect(html).toContain('Seismic moment');
    expect(html).toContain('Equivalent Mw');
    expect(html).toContain('50.0%');
  });
  it('MFD: per-catalogue rows', () => {
    const f = fmt(<MFDComparisonChart catalogues={[{ catalogueId: 'a', catalogueName: 'Cat A', color: '#f00', histogram: [{ magnitude: 2, count: 5 }], cumulative: [{ magnitude: 2, count: 5 }] }]} magnitudeRange={{ min: 1, max: 6 }} logScale={false} showHistogram showCumulative cumulativeStyle="solid" />);
    expect(f([{ axisValue: 2, value: [2, 5], seriesName: 'Cat A', color: '#f00' }])).toContain('Cat A');
  });
});
