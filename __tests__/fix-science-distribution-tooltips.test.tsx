/**
 * Findings #13 / #14: the histogram tooltips classed a bin by parseFloat(label).
 * '< 2.0' parsed to NaN, and every comparison in magnitudeClass is false for NaN, so
 * the tallest bar of an NZ catalogue (sub-M2 events) was badged 'Great class'; the
 * open '5.0+' bin was classed by its lower bound alone. '40+ km' parsed to 40 and was
 * badged 'Shallow-focus' although it held the intermediate and deep slab seismicity
 * of the Hikurangi and Kermadec subduction zones (70 and 300 km are the standard
 * shallow/intermediate/deep boundaries).
 */
import { render } from '@testing-library/react';

let captured: any = null;
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => { captured = props.option; return null; },
}));

import { MagnitudeDistributionChart, DepthDistributionChart } from '@/components/charts';

const tooltipFor = (element: React.ReactElement, dataIndex: number, axisValue: string) => {
  captured = null;
  render(element);
  return captured.tooltip.formatter([{ dataIndex, axisValue, value: 1 }]) as string;
};

// The bins the Analytics page builds (app/analytics/page.tsx magnitudeDistribution).
const MAGNITUDE_BINS = [
  { range: '< 2.0', min: -Infinity, max: 2.0, count: 900 },
  { range: '2.0-2.5', min: 2.0, max: 2.5, count: 60 },
  { range: '5.0+', min: 5.0, max: Infinity, count: 3 },
];

describe('magnitude histogram tooltip classes each bin by its bounds', () => {
  it("badges the open '< 2.0' bin Micro, not Great", () => {
    const html = tooltipFor(<MagnitudeDistributionChart data={MAGNITUDE_BINS} />, 0, '< 2.0');
    expect(html).toContain('Micro class');
    expect(html).not.toContain('Great');
  });

  it("badges the open '5.0+' bin as Moderate or larger", () => {
    const html = tooltipFor(<MagnitudeDistributionChart data={MAGNITUDE_BINS} />, 2, '5.0+');
    expect(html).toContain('Moderate class or larger');
  });

  it('reads the bounds from the label when a caller passes none', () => {
    const labelled = MAGNITUDE_BINS.map(({ range, count }) => ({ range, count }));
    expect(tooltipFor(<MagnitudeDistributionChart data={labelled} />, 0, '< 2.0')).toContain('Micro class');
    expect(tooltipFor(<MagnitudeDistributionChart data={labelled} />, 1, '2.0-2.5')).toContain('Minor class');
    expect(tooltipFor(<MagnitudeDistributionChart data={labelled} />, 2, '5.0+')).toContain('Moderate class or larger');
  });
});

describe('depth histogram tooltip does not call a bin shallow unless all of it is', () => {
  it("no longer badges a 40-1000 km bin 'Shallow-focus'", () => {
    const html = tooltipFor(<DepthDistributionChart data={[{ range: '40+ km', min: 40, max: 1000, count: 12 }]} />, 0, '40+ km');
    expect(html).toContain('Shallow-focus to deep-focus');
  });

  it('badges bins split at 70 and 300 km with their single class', () => {
    const bins = [
      { range: '40-70 km', min: 40, max: 70, count: 5 },
      { range: '70-300 km', min: 70, max: 300, count: 7 },
      { range: '300+ km', min: 300, max: Infinity, count: 2 },
    ];
    expect(tooltipFor(<DepthDistributionChart data={bins} />, 0, '40-70 km')).toContain('Shallow-focus');
    expect(tooltipFor(<DepthDistributionChart data={bins} />, 1, '70-300 km')).toContain('Intermediate-focus');
    expect(tooltipFor(<DepthDistributionChart data={bins} />, 2, '300+ km')).toContain('Deep-focus');
  });
});
