/**
 * Renders every ECharts chart component with the data shapes the analytics page passes.
 * echarts-for-react is mocked so this exercises OUR option builders + wrapper (the code
 * that runs at mount) without loading echarts' ESM. Catches runtime throws tsc cannot.
 */
import { render } from '@testing-library/react';

jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => {
    // Touch the option like echarts would, to surface obviously-bad shapes.
    void JSON.stringify(props.option ?? {});
    return null;
  },
}));

import {
  MagnitudeDistributionChart, DepthDistributionChart, RegionDistributionChart, CatalogueDistributionChart,
  MagnitudeDepthScatter, EventTimelineChart,
  GutenbergRichterChart, CompletenessChart, TemporalSeriesChart, MomentReleaseChart, MFDComparisonChart,
} from '@/components/charts';

const noThrow = (el: React.ReactElement) => expect(() => render(el)).not.toThrow();

describe('ECharts chart components render (mocked echarts) without throwing', () => {
  it('distribution charts', () => {
    noThrow(<MagnitudeDistributionChart data={[{ range: '2.0-2.5', count: 5 }, { range: '4.5-5.0', count: 2 }, { range: '5.0+', count: 1 }]} />);
    noThrow(<DepthDistributionChart data={[{ range: '0-10 km', count: 9 }]} />);
    noThrow(<RegionDistributionChart data={[{ region: 'Wellington', count: 3 }]} />);
    noThrow(<CatalogueDistributionChart data={[{ catalogue: 'GeoNet', count: 7 }]} />);
  });
  it('overview charts (incl. null depth)', () => {
    noThrow(<MagnitudeDepthScatter data={[{ magnitude: 4.1, depth: 12 }, { magnitude: 3.0, depth: null }]} />);
    noThrow(<EventTimelineChart data={[{ date: '2024-01-01', count: 4 }]} />);
  });
  it('science charts', () => {
    noThrow(<GutenbergRichterChart result={{ dataPoints: [{ magnitude: 2, logCount: 2, count: 100 }], fittedLine: [{ magnitude: 2, logCount: 2 }], completeness: 2.2, aValue: 4, bValue: 1 }} />);
    noThrow(<CompletenessChart distribution={[{ magnitude: 2.0, count: 10 }, { magnitude: 2.5, count: 5 }]} mc={2.2} />);
    noThrow(<TemporalSeriesChart data={[{ date: '2024-01-01T00:00:00Z', cumulativeCount: 10, dailyCount: 2 }]} />);
    noThrow(<MomentReleaseChart data={[{ magnitude: 5, moment: 1e17, count: 1 }]} totalMoment={1e17} />);
    noThrow(<MFDComparisonChart catalogues={[{ catalogueId: 'a', catalogueName: 'A', color: '#f00', histogram: [{ magnitude: 2, count: 5 }], cumulative: [{ magnitude: 2, count: 5 }] }]} magnitudeRange={{ min: 1, max: 6 }} logScale showHistogram showCumulative cumulativeStyle="solid" />);
  });
  it('empty data does not throw', () => {
    noThrow(<MagnitudeDistributionChart data={[]} />);
    noThrow(<MFDComparisonChart catalogues={[]} magnitudeRange={{ min: 0, max: 1 }} logScale={false} showHistogram showCumulative />);
  });
});
