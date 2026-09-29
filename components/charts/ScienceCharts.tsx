'use client';

/**
 * Seismology plots (Apache ECharts): Gutenberg-Richter, frequency-magnitude
 * completeness, cumulative temporal series, moment release (by magnitude and over
 * time), the goodness-of-fit Mc test, and multi-catalogue MFD comparison. These preserve the scientific content of the previous recharts
 * versions (Mc reference lines, log axes, per-catalogue series) and add a few
 * tasteful touches (shaded incomplete region, zoomable axes).
 */

import { memo, useMemo } from 'react';
import { useTheme } from 'next-themes';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { chartColors, axis, tooltip, grid, legend, ttHeader, ttRow, ttBadge } from '@/lib/echarts-theme';
import { SEISMIC_COLORS, getMagnitudeColor, magnitudeClass } from '@/lib/chart-config';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day (UTC): time-series bins are UTC days, ISO weeks and months. */
const UTC_DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
});

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
      xAxis: { ...axis(c, { type: 'category', name: 'Magnitude (M)', nameGap: 30 }), data: distribution.map((d) => String(d.magnitude)), axisLabel: { ...axis(c).axisLabel, formatter: (v: string) => `M${Number(v).toFixed(1)}` } },
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
            data: [{ xAxis: String(mcBin) }],
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
  binDays = 1,
  height = 420,
}: {
  /** Occupied bins keyed by their first UTC day; cumulativeCount runs to the bin's end. */
  data: { date: string; cumulativeCount: number; count?: number; dailyCount?: number }[];
  /** Bin length in days (analyzeTemporalPattern binDays: 1, or 7 for ISO weeks). */
  binDays?: number;
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  // Current day/week bins use UTC dates. Preserve elapsed time between occupied
  // bins; a category axis makes a quiet year look as short as a quiet day.
  // Older saved results may still have week labels, so retain their fallback.
  // A running total counts every event up to the END of its bin, so it is plotted
  // there: at the bin's start it credited the whole bin's events up to a week early.
  const timeAxis = data.every(d => Number.isFinite(Date.parse(d.date)));
  const fmtDate = (v: string | number) => {
    const t = typeof v === 'number' ? v : Date.parse(v);
    if (!Number.isFinite(t)) return String(v);
    const d = new Date(t);
    return `${d.getUTCMonth() + 1}/${d.getUTCFullYear().toString().slice(-2)}`;
  };
  const fmtTooltipDate = (v: string) => {
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return v;
    return new Date(t).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
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
          const date = fmtTooltipDate(row.date);
          const lastDay = Date.parse(row.date) + (binDays - 1) * DAY_MS;
          const header = binDays > 1 && Number.isFinite(lastDay) ? `${date} – ${UTC_DAY_FORMAT.format(new Date(lastDay))}` : date;
          let html = ttHeader(c, header) + ttRow(c, 'Cumulative events', row.cumulativeCount.toLocaleString(), SEISMIC_COLORS.time.dark);
          const inPeriod = row.dailyCount ?? row.count;
          if (inPeriod !== undefined) html += ttRow(c, 'This period', inPeriod.toLocaleString());
          return html;
        },
      }),
      xAxis: timeAxis ? {
        ...axis(c, { type: 'time' }),
        axisLabel: { ...axis(c).axisLabel, formatter: fmtDate },
      } : {
        ...axis(c, { type: 'category' }),
        boundaryGap: false,
        data: data.map(d => d.date),
        axisLabel: { ...axis(c).axisLabel, formatter: fmtDate },
      },
      yAxis: axis(c, { name: 'Cumulative events', nameGap: 46 }),
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 16, bottom: 30, borderColor: c.grid, textStyle: { color: c.subtext, fontSize: 10 } },
      ],
      series: [
        {
          type: 'line',
          name: 'Cumulative Events',
          smooth: false,
          step: 'end',
          sampling: 'lttb',
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
          data: data.map(d => timeAxis ? [Date.parse(d.date) + binDays * DAY_MS, d.cumulativeCount] : d.cumulativeCount),
        },
      ],
    }),
    [data, c, timeAxis, binDays]
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
          // Mw = (log10 M0 - 9.1) / 1.5 for M0 in N*m - Hanks & Kanamori (1979) as
          // standardised by IASPEI (2005). (The textbook -10.7 constant is the
          // dyne*cm form; 1 N*m = 1e7 dyne*cm.) Matches the moment worker exactly.
          const equivMw = row.moment > 0 ? (Math.log10(row.moment) - 9.1) / 1.5 : 0;
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
// Cumulative moment / radiated-energy release over time (step line, UTC axis)
// ---------------------------------------------------------------------------
export interface ReleasePoint {
  /** First UTC day of the bin. */
  date: string;
  /** Length of the bin in days; the cumulative totals run to its end. */
  days: number;
  moment: number;
  energy: number;
  cumulativeMoment: number;
  cumulativeEnergy: number;
}

export const CumulativeReleaseChart = memo(function CumulativeReleaseChart({
  data,
  quantity = 'moment',
  height = 380,
}: {
  /** lib/seismological-analysis analyzeSeismicityTimeSeries release bins. */
  data: ReleasePoint[];
  /** Seismic moment M0 (N·m), or radiated energy E (J) from log10 E = 1.5 M + 4.8. */
  quantity?: 'moment' | 'energy';
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const isMoment = quantity === 'moment';
  const unit = isMoment ? 'N·m' : 'J';
  const name = isMoment ? 'Cumulative seismic moment' : 'Cumulative radiated energy';
  const option = useMemo<EChartsOption>(
    () => ({
      useUTC: true,
      grid: grid({ top: 24, left: 76, right: 28, bottom: 64 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params?.length) return '';
          const row = data[params[0].dataIndex];
          if (!row) return '';
          const start = Date.parse(row.date);
          const lastDay = start + (row.days - 1) * DAY_MS;
          const header = !Number.isFinite(start) ? row.date
            : row.days > 1 ? `${UTC_DAY_FORMAT.format(new Date(start))} – ${UTC_DAY_FORMAT.format(new Date(lastDay))}`
              : UTC_DAY_FORMAT.format(new Date(start));
          const cumulative = isMoment ? row.cumulativeMoment : row.cumulativeEnergy;
          const released = isMoment ? row.moment : row.energy;
          let html = ttHeader(c, header) +
            ttRow(c, name, `${cumulative.toExponential(2)} ${unit}`, SEISMIC_COLORS.energy.dark) +
            ttRow(c, 'Released in this period', `${released.toExponential(2)} ${unit}`);
          // Mw = (log10 M0 - 9.1) / 1.5 (N·m; Hanks & Kanamori, 1979, IASPEI 2005).
          if (isMoment && cumulative > 0) html += ttRow(c, 'Equivalent single event', `Mw ${((Math.log10(cumulative) - 9.1) / 1.5).toFixed(2)}`);
          return html;
        },
      }),
      xAxis: axis(c, { type: 'time' }),
      yAxis: {
        ...axis(c, { name: `${name} (${unit})`, nameGap: 64 }),
        axisLabel: { ...axis(c).axisLabel, formatter: (v: number) => (v === 0 ? '0' : Number(v).toExponential(1)) },
      },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 16, bottom: 30, borderColor: c.grid, textStyle: { color: c.subtext, fontSize: 10 } },
      ],
      series: [
        {
          type: 'line',
          name,
          step: 'end',
          showSymbol: false,
          lineStyle: { color: SEISMIC_COLORS.energy.dark, width: 2 },
          itemStyle: { color: SEISMIC_COLORS.energy.dark },
          areaStyle: { color: SEISMIC_COLORS.energy.dark, opacity: 0.08 },
          // Each running total is reached at the END of its bin, so it is plotted there
          // (at the bin start it showed a bin's release up to a month early).
          data: data.map(d => [Date.parse(d.date) + d.days * DAY_MS, isMoment ? d.cumulativeMoment : d.cumulativeEnergy]),
        },
      ],
    }),
    [data, c, isMoment, unit, name]
  );
  return <EChart option={option} height={height} exportData={data as unknown as Record<string, unknown>[]}
    exportName={isMoment ? 'cumulative-moment' : 'cumulative-energy'} aria-label={`${name} over time`} />;
});

// ---------------------------------------------------------------------------
// Goodness-of-fit test for Mc: R (%) against candidate cut-off
// ---------------------------------------------------------------------------
export const GoodnessOfFitChart = memo(function GoodnessOfFitChart({
  curve,
  mc,
  height = 300,
}: {
  curve: { magnitude: number; fit: number }[];
  /** The Mc the test chose, or null when it fell back to MAXC. */
  mc: number | null;
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const option = useMemo<EChartsOption>(() => {
    const lowest = curve.reduce((min, p) => Math.min(min, p.fit), 100);
    return {
      grid: grid({ top: 28, left: 60, right: 28, bottom: 52 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params?.length) return '';
          const point = curve[params[0].dataIndex];
          if (!point) return '';
          const reached = point.fit >= 95 ? 'Reaches 95%' : point.fit >= 90 ? 'Reaches 90%' : 'Below 90%';
          return ttHeader(c, `Cut-off M ${point.magnitude.toFixed(1)}`) +
            ttRow(c, 'Goodness of fit R', `${point.fit.toFixed(1)}%`, SEISMIC_COLORS.frequency.dark) +
            ttBadge(c, reached, point.fit >= 90 ? c.fit : c.reference);
        },
      }),
      xAxis: axis(c, { name: 'Candidate Mc (magnitude cut-off)', nameGap: 30 }),
      yAxis: { ...axis(c, { name: 'R (%)', nameGap: 40 }), min: Math.max(0, Math.floor(Math.min(lowest, 88) / 5) * 5), max: 100 },
      series: [
        {
          type: 'line',
          name: 'Goodness of fit R',
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: SEISMIC_COLORS.frequency.dark, width: 2 },
          itemStyle: { color: SEISMIC_COLORS.frequency.dark },
          data: curve.map(p => [p.magnitude, p.fit]),
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              { yAxis: 95, lineStyle: { color: c.fit, type: 'dashed', width: 1.5 }, label: { formatter: '95%', color: c.fit, position: 'insideStartTop' } },
              { yAxis: 90, lineStyle: { color: c.subtext, type: 'dashed', width: 1.5 }, label: { formatter: '90%', color: c.subtext, position: 'insideStartTop' } },
              ...(mc != null ? [{ xAxis: mc, lineStyle: { color: c.reference, type: 'dashed' as const, width: 2 }, label: { formatter: `Mc = ${mc.toFixed(1)}`, color: c.reference, fontWeight: 'bold' as const, position: 'insideEndTop' as const } }] : []),
            ],
          },
        },
      ],
    } as EChartsOption;
  }, [curve, mc, c]);
  return <EChart option={option} height={height} exportData={curve} exportName="mc-goodness-of-fit" aria-label="Goodness-of-fit test for the completeness magnitude" />;
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
    // A zero is a gap on a log axis. Dropping it would connect occupied bins
    // across an empty interval and falsely draw nonzero event counts there.
    const pts = (arr: { magnitude: number; count: number }[]) =>
      arr.map(d => [d.magnitude, logScale && d.count === 0 ? null : d.count]);
    const series: any[] = [];
    // Incremental N(M) and cumulative N(>=M) are different quantities, so they
    // must not share a series name: ECharts keys legend items by name, and the
    // axis tooltip prints one row per series using that name. Sharing it gave
    // one legend entry that toggled both curves and two identically labelled
    // tooltip rows holding different numbers.
    if (showHistogram) {
      for (const cat of catalogues) {
        // The library returns sparse histogram counts and a complete cumulative
        // bin grid. Restore the empty bins before connecting histogram points.
        const counts = new Map(cat.histogram.map(d => [d.magnitude, d.count]));
        const histogram = cat.cumulative.length
          ? cat.cumulative.map(d => ({ magnitude: d.magnitude, count: counts.get(d.magnitude) ?? 0 }))
          : cat.histogram;
        series.push({
          type: 'line',
          name: `${cat.catalogueName} N(M)`,
          step: 'end',
          connectNulls: false,
          showSymbol: false,
          lineStyle: { color: cat.color, width: 1 },
          itemStyle: { color: cat.color },
          areaStyle: { color: cat.color, opacity: 0.18 },
          data: pts(histogram),
        });
      }
    }
    if (showCumulative) {
      for (const cat of catalogues) {
        series.push({
          type: 'line',
          name: `${cat.catalogueName} N(≥M)`,
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
        ...axis(c, { name: 'Magnitude (M)', nameGap: 30 }),
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
