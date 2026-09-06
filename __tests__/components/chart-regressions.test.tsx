import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { chartColors } from '@/lib/echarts-theme';

let captured: any;
let theme = 'light';
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: theme }) }));
jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: (props: any) => { captured = props; return null; },
}));

import { EventTimelineChart, CompletenessChart, MagnitudeDepthScatter, CatalogueDistributionChart } from '@/components/charts';

describe('plot correctness and performance regressions', () => {
  beforeEach(() => { theme = 'light'; captured = null; });

  it('keeps chart options stable during resize and regenerates them on theme changes', () => {
    const data = [{ date: '2024-01-01', count: 4 }];
    const { rerender } = render(<EventTimelineChart data={data} height={300} />);
    const initial = captured.option;
    rerender(<EventTimelineChart data={data} height={500} />);
    // New formatter closures previously forced notMerge setOption and reset zoom.
    expect(captured.option).toBe(initial);
    theme = 'dark';
    rerender(<EventTimelineChart data={data} height={501} />);
    expect(captured.option).not.toBe(initial);
    expect(captured.option.textStyle.color).toBe(chartColors(true).text);
  });

  it('places Mc at the matching magnitude category, rather than a numeric category index', () => {
    render(<CompletenessChart distribution={[{ magnitude: -1, count: 1 }, { magnitude: 2.5, count: 20 }, { magnitude: 6, count: 2 }]} mc={2.6} />);
    const option = captured.option;
    expect(option.xAxis.data).toEqual(['-1', '2.5', '6']);
    expect(option.series[0].markLine.data[0].xAxis).toBe('2.5');
  });

  it('bounds scatter rendering after excluding unknown depths and reports actual plotted counts', () => {
    const data = Array.from({ length: 501 }, (_, i) => ({ magnitude: i / 100, depth: i }));
    const { getByRole } = render(<MagnitudeDepthScatter data={[...data, { magnitude: 9, depth: null }]} />);
    expect(captured.option.series[0].data).toHaveLength(500);
    expect(getByRole('status')).toHaveTextContent('Showing 500 of 501');
  });

  it('escapes user supplied catalogue names in HTML tooltips', () => {
    const name = '<img src=x onerror=alert(1)> & "catalogue"';
    render(<CatalogueDistributionChart data={[{ catalogue: name, count: 1 }]} />);
    const html = captured.option.tooltip.formatter({ name, value: 1, percent: 100, color: '#ff0000' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&amp;');
  });
});
