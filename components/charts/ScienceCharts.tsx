'use client';

/**
 * Seismology plots (Apache ECharts): Gutenberg-Richter, frequency-magnitude
 * completeness, cumulative temporal series, moment release, and multi-catalogue
 * MFD comparison. These preserve the scientific content of the previous recharts
 * versions (Mc reference lines, log axes, per-catalogue series) and add a few
 * tasteful touches (shaded incomplete region, zoomable axes).
 */

import { memo, useMemo } from 'react';
import { useTheme } from 'next-themes';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { chartColors, axis, tooltip, grid, legend, ttHeader, ttRow, ttBadge } from '@/lib/echarts-theme';
import { SEISMIC_COLORS, getMagnitudeColor, magnitudeClass } from '@/lib/chart-config';

// ---------------------------------------------------------------------------
// Gutenberg-Richter: observed cumulative FMD (points) + linear fit + Mc line
// ---------------------------------------------------------------------------
export interface GRResult {
  dataPoints: { magnitude: number; logCount: number; count: number }[];
  fittedLine: { magnitude: number; logCount: number }[];
  completeness: number;
  aValue: number;
  bValue: number;
}

export const GutenbergRichterChart = memo(function GutenbergRichterChart({
  result,
  height = 420,
}: {
  result: GRResult;
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const minMag = result.dataPoints.length ? Math.min(...result.dataPoints.map((d) => d.magnitude)) : 0;

  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ top: 36, left: 60, right: 28, bottom: 52 }),
      legend: legend(c, { top: 4, right: 36 }),
      tooltip: tooltip(c, {
        trigger: 'item',
        formatter: (p: any) => {
          const m = Number(p.value[0]);
          const log = Number(p.value[1]);
          if (p.seriesName === 'G-R Fit') {
            return ttHeader(c, 'Gutenberg–Richter fit') +
              ttRow(c, `M ${m.toFixed(1)}`, `log₁₀N = ${log.toFixed(2)}`, c.fit) +
              ttRow(c, 'b-value', result.bValue.toFixed(2));
          }
          const aboveMc = m >= result.completeness;
          return ttHeader(c, `Magnitude M ${m.toFixed(1)}`) +
            ttRow(c, 'Cumulative N ≥ M', Math.round(Math.pow(10, log)).toLocaleString(), p.color) +
            ttRow(c, 'log₁₀(N)', log.toFixed(2)) +
            ttBadge(c, aboveMc ? `Above Mc ${result.completeness.toFixed(1)} (complete)` : `Below Mc ${result.completeness.toFixed(1)} (incomplete)`, aboveMc ? c.fit : c.reference);
        },
      }),
      xAxis: axis(c, { name: 'Magnitude (M)', nameGap: 30 }),
      yAxis: axis(c, { name: 'log₁₀(N) — cumulative ≥ M', nameGap: 44 }),
      series: [
        {
          type: 'scatter',
          name: 'Observed',
          symbolSize: 9,
          itemStyle: { color: SEISMIC_COLORS.magnitude.dark, borderColor: c.background, borderWidth: 1, opacity: 0.85 },
          data: result.dataPoints.map((d) => [d.magnitude, d.logCount, d.count]),
          markArea: {
            silent: true,
            itemStyle: { color: c.reference, opacity: 0.06 },
            label: { show: true, position: 'insideTop', color: c.subtext, fontSize: 10, formatter: 'incomplete' },
            data: [[{ xAxis: minMag }, { xAxis: result.completeness }]],
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.reference, type: 'dashed', width: 2 },
            label: { formatter: `Mc = ${result.completeness.toFixed(1)}`, color: c.reference, fontWeight: 'bold', fontSize: 12, position: 'insideEndTop' },
            data: [{ xAxis: result.completeness }],
          },
        },
        {
          type: 'line',
          name: 'G-R Fit',
          showSymbol: false,
          lineStyle: { color: c.fit, width: 2.5 },
          itemStyle: { color: c.fit },
          data: result.fittedLine.map((d) => [d.magnitude, d.logCount]),
        },
      ],
    }),
    [result, c, minMag]
  );
  return <EChart option={option} height={height} exportData={result.dataPoints} exportName="gutenberg-richter" aria-label="Gutenberg-Richter relationship" />;
});

// ---------------------------------------------------------------------------
// Frequency-Magnitude completeness histogram (bars colour-split at Mc)
// ---------------------------------------------------------------------------
export const CompletenessChart = memo(function CompletenessChart({
  distribution,
  mc,
  height = 420,
}: {
  distribution: { magnitude: number; count: number }[];
  mc: number;
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const mcBin = useMemo(
    () =>
      distribution.reduce(
        (best, d) => (Math.abs(d.magnitude - mc) < Math.abs(best - mc) ? d.magnitude : best),
        distribution[0]?.magnitude ?? mc
      ),
    [distribution, mc]
  );
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ top: 32, left: 60, right: 28, bottom: 52 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!params || !params.length) return '';
          const p = params[0];
          const m = Number(p.axisValue);
          const complete = m >= mc;
          return ttHeader(c, `Magnitude M ${m.toFixed(1)}`) +
            ttRow(c, 'Events', (Number(p.value) || 0).toLocaleString(), SEISMIC_COLORS.frequency.dark) +
            ttBadge(c, complete ? `Complete (≥ Mc ${mc.toFixed(1)})` : `Incomplete (< Mc ${mc.toFixed(1)})`, complete ? c.fit : c.reference);
        },
      }),
      xAxis: { ...axis(c, { type: 'category', name: 'Magnitude (M)', nameGap: 30 }), data: distribution.map((d) => d.magnitude), axisLabel: { ...axis(c).axisLabel, formatter: (v: string) => `M${Number(v).toFixed(1)}` } },
      yAxis: axis(c, { name: 'Number of events', nameGap: 46 }),
      series: [
        {
          type: 'bar',
          name: 'Events',
          barMaxWidth: 50,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: distribution.map((d) => ({
            value: d.count,
            itemStyle: { color: SEISMIC_COLORS.frequency.dark, opacity: d.magnitude >= mc ? 1 : 0.4 },
          })),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: c.reference, type: 'dashed', width: 2 },
            label: { formatter: `Mc = ${mc.toFixed(1)}`, color: c.reference, fontWeight: 'bold', fontSize: 12 },
            data: [{ xAxis: mcBin }],
          },
        },
      ],
    }),
    [distribution, mc, mcBin, c]
  );
  return <EChart option={option} height={height} exportData={distribution} exportName="completeness-fmd" aria-label="Frequency-magnitude completeness" />;
});

// ---------------------------------------------------------------------------
// Cumulative temporal series (area)
// ---------------------------------------------------------------------------
export const TemporalSeriesChart = memo(function TemporalSeriesChart({
  data,
  height = 420,
}: {
  data: { date: string; cumulativeCount: number; dailyCount?: number }[];
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const fmtDate = (v: string) => {
    const d = new Date(v);
    return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
  };
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ top: 24, left: 60, right: 28, bottom: 64 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || !params.length) return '';
          const row = data[params[0].dataIndex];
          if (!row) return '';
          const date = new Date(row.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          let html = ttHeader(c, date) + ttRow(c, 'Cumulative events', row.cumulativeCount.toLocaleString(), SEISMIC_COLORS.time.dark);
          if (row.dailyCount !== undefined) html += ttRow(c, 'This period', row.dailyCount.toLocaleString());
          return html;
        },
      }),
      xAxis: { ...axis(c, { type: 'category' }), boundaryGap: false, data: data.map((d) => d.date), axisLabel: { ...axis(c).axisLabel, formatter: fmtDate } },
      yAxis: axis(c, { name: 'Cumulative events', nameGap: 46 }),
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 16, bottom: 30, borderColor: c.grid, textStyle: { color: c.subtext, fontSize: 10 } },
      ],
      series: [
        {
          type: 'line',
          name: 'Cumulative Events',
          smooth: true,
          showSymbol: false,
          lineStyle: { color: SEISMIC_COLORS.time.dark, width: 2 },
          itemStyle: { color: SEISMIC_COLORS.time.dark },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(6,182,212,0.40)' },
                { offset: 0.95, color: 'rgba(6,182,212,0.04)' },
              ],
            },
          },
          data: data.map((d) => d.cumulativeCount),
        },
      ],
    }),
    [data, c]
  );
  return <EChart option={option} height={height} exportData={data} exportName="cumulative-time-series" aria-label="Cumulative event time series" />;
});

// ---------------------------------------------------------------------------
// Moment release by magnitude (log y-axis, colour by magnitude)
// ---------------------------------------------------------------------------
export const MomentReleaseChart = memo(function MomentReleaseChart({
  data,
  totalMoment,
  height = 420,
}: {
  data: { magnitude: number; moment: number; count?: number }[];
  totalMoment: number;
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ top: 24, left: 76, right: 28, bottom: 52 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!params || !params.length) return '';
          const row = data[params[0].dataIndex];
          if (!row) return '';
          const pct = ((row.moment / totalMoment) * 100).toFixed(1);
          const equivMw = row.moment > 0 ? (2 / 3) * Math.log10(row.moment) - 6.07 : 0; // Hanks & Kanamori (1979)
          const color = getMagnitudeColor(row.magnitude);
          let html = ttHeader(c, `Magnitude M ${row.magnitude.toFixed(1)} bin`) +
            ttRow(c, 'Seismic moment', `${row.moment.toExponential(2)} N·m`, color) +
            ttRow(c, 'Share of total', `${pct}%`) +
            ttRow(c, 'Equivalent Mw', equivMw.toFixed(1));
          if (row.count) html += ttRow(c, 'Events', row.count.toLocaleString());
          html += ttBadge(c, `${magnitudeClass(row.magnitude)} class`, color);
          return html;
        },
      }),
      xAxis: { ...axis(c, { type: 'category', name: 'Magnitude (M)', nameGap: 30 }), data: data.map((d) => d.magnitude), axisLabel: { ...axis(c).axisLabel, formatter: (v: string) => `M${Number(v).toFixed(1)}` } },
      yAxis: { ...axis(c, { type: 'log', name: 'Seismic moment (N·m)', nameGap: 60 }), axisLabel: { ...axis(c).axisLabel, formatter: (v: number) => Number(v).toExponential(0) } },
      series: [
        {
          type: 'bar',
          name: 'Seismic Moment',
          barMaxWidth: 50,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: data.map((d) => ({ value: d.moment, itemStyle: { color: getMagnitudeColor(d.magnitude) } })),
        },
      ],
    }),
    [data, totalMoment, c]
  );
  return <EChart option={option} height={height} exportData={data} exportName="moment-release" aria-label="Moment release by magnitude" />;
});

// ---------------------------------------------------------------------------
// Multi-catalogue MFD comparison (histogram + cumulative, optional log y)
// ---------------------------------------------------------------------------
export interface MFDCatalogue {
  catalogueId: string;
  catalogueName: string;
  color: string;
  histogram: { magnitude: number; count: number }[];
  cumulative: { magnitude: number; count: number }[];
}

export const MFDComparisonChart = memo(function MFDComparisonChart({
  catalogues,
  magnitudeRange,
  logScale,
  showHistogram,
  showCumulative,
  cumulativeStyle = 'solid',
  height = 500,
}: {
  catalogues: MFDCatalogue[];
  magnitudeRange: { min: number; max: number };
  logScale: boolean;
  showHistogram: boolean;
  showCumulative: boolean;
  cumulativeStyle?: 'solid' | 'dotted';
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');

  const mfdExportRows = useMemo(
    () =>
      catalogues.flatMap((cat) =>
        cat.cumulative.map((d) => ({
          catalogue: cat.catalogueName,
          magnitude: d.magnitude,
          cumulativeCount: d.count,
        }))
      ),
    [catalogues]
  );

  const option = useMemo<EChartsOption>(() => {
    // On a log axis, zero counts cannot be plotted, so drop them.
    const pts = (arr: { magnitude: number; count: number }[]) =>
      (logScale ? arr.filter((d) => d.count > 0) : arr).map((d) => [d.magnitude, d.count]);
    const series: any[] = [];
    if (showHistogram) {
      for (const cat of catalogues) {
        series.push({
          type: 'line',
          name: cat.catalogueName,
          step: 'end',
          showSymbol: false,
          lineStyle: { color: cat.color, width: 1 },
          itemStyle: { color: cat.color },
          areaStyle: { color: cat.color, opacity: 0.18 },
          data: pts(cat.histogram),
        });
      }
    }
    if (showCumulative) {
      for (const cat of catalogues) {
        series.push({
          type: 'line',
          name: cat.catalogueName,
          step: 'end',
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: cat.color, width: 2.5, type: cumulativeStyle === 'dotted' ? 'dashed' : 'solid' },
          itemStyle: { color: cat.color },
          data: pts(cat.cumulative),
        });
      }
    }
    return {
      grid: grid({ top: 36, left: 64, right: 28, bottom: 52 }),
      legend: legend(c, { top: 4, right: 36, type: 'scroll' }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params?.length) return '';
          const m = Number(params[0].axisValue);
          return ttHeader(c, `Magnitude M ${m.toFixed(1)}`) +
            params.map((p: any) => ttRow(c, p.seriesName, Number(p.value[1]).toLocaleString(), p.color)).join('');
        },
      }),
      xAxis: {
        ...axis(c, { name: 'Magnitude (ML)', nameGap: 30 }),
        min: Math.floor(magnitudeRange.min),
        max: Math.ceil(magnitudeRange.max),
        axisLabel: { ...axis(c).axisLabel, formatter: (v: number) => `M${v}` },
      },
      yAxis: {
        ...axis(c, { type: logScale ? 'log' : 'value', name: 'Number of events', nameGap: 48 }),
        min: logScale ? 1 : 0,
      },
      series,
    } as EChartsOption;
  }, [catalogues, magnitudeRange, logScale, showHistogram, showCumulative, cumulativeStyle, c]);

  return <EChart option={option} height={height} exportData={mfdExportRows} exportName="mfd-comparison" aria-label="Magnitude-frequency distribution comparison" />;
});
