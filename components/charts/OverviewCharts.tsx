'use client';

/**
 * Overview plots (Apache ECharts): magnitude-vs-depth and magnitude-vs-time scatters
 * and the event timeline. The scatters encode magnitude as both colour (severity
 * scale) and marker size; depth runs on an inverted axis (down = deeper), which is
 * scientifically conventional. The timeline adds a zoomable brush for long series.
 */

import { memo, useMemo } from 'react';
import { useTheme } from 'next-themes';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { chartColors, axis, tooltip, grid, ttHeader, ttRow, ttBadge } from '@/lib/echarts-theme';
import { SEISMIC_COLORS, magnitudeClass, depthClass, getDepthColor } from '@/lib/chart-config';
import { sampleMagnitudeDepth, sampleMagnitudeTime } from '@/lib/plot-sampling';

// Magnitude severity classes (match getMagnitudeColor / MAGNITUDE_COLOR_SCALE).
const MAG_PIECES = [
  { lt: 2, color: '#22c55e', label: '< 2' },
  { gte: 2, lt: 3, color: '#84cc16', label: '2–3' },
  { gte: 3, lt: 4, color: '#eab308', label: '3–4' },
  { gte: 4, lt: 5, color: '#f97316', label: '4–5' },
  { gte: 5, lt: 6, color: '#ef4444', label: '5–6' },
  { gte: 6, lt: 7, color: '#dc2626', label: '6–7' },
  { gte: 7, color: '#7f1d1d', label: '≥ 7' },
];

export const MagnitudeDepthScatter = memo(function MagnitudeDepthScatter({
  data,
  height = 350,
}: {
  data: { magnitude: number; depth: number | null; region?: string | null }[];
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const { points, total } = useMemo(() => sampleMagnitudeDepth(data), [data]);
  const exportRows = useMemo(() => points.map(point => ({
    magnitude: point.magnitude, depth: point.depth, region: point.region ?? 'Unknown',
  })), [points]);
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ top: 16, left: 56, right: 24, bottom: 52 }),
      tooltip: tooltip(c, {
        trigger: 'item',
        formatter: (p: any) => {
          const m = Number(p.value[0]);
          const d = Number(p.value[1]);
          return ttHeader(c, `M ${m.toFixed(1)} earthquake`) +
            ttRow(c, 'Magnitude', `${m.toFixed(1)} · ${magnitudeClass(m)}`, p.color) +
            ttRow(c, 'Depth', `${d.toFixed(1)} km`, getDepthColor(d)) +
            ttBadge(c, depthClass(d), getDepthColor(d));
        },
      }),
      xAxis: axis(c, { name: 'Magnitude', nameGap: 30 }),
      yAxis: { ...axis(c, { name: 'Depth (km)', nameGap: 44 }), inverse: true },
      visualMap: {
        type: 'piecewise',
        dimension: 2,
        pieces: MAG_PIECES,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 10,
        textStyle: { color: c.subtext, fontSize: 10 },
        outOfRange: { color: c.subtext },
      },
      series: [
        {
          type: 'scatter',
          name: 'Events',
          symbolSize: (val: number[]) => Math.min(22, 5 + Math.max(0, val[2]) * 2.4),
          itemStyle: { opacity: 0.72, borderColor: c.background, borderWidth: 0.5 },
          data: points.map((d) => [d.magnitude, d.depth, d.magnitude]),
        },
      ],
    }),
    [points, c]
  );
  return <div>
    {points.length < total && <p className="text-xs text-muted-foreground" role="status">
      Showing {points.length.toLocaleString()} of {total.toLocaleString()} events with magnitude and depth.
    </p>}
    <EChart option={option} height={height} exportData={exportRows} exportName="magnitude-vs-depth" aria-label="Magnitude versus depth" />
  </div>;
});

export const EventTimelineChart = memo(function EventTimelineChart({
  data,
  height = 400,
  seriesName = 'Events per Day',
  daysPerBin,
  exportName = 'earthquake-timeline',
  ariaLabel = 'Earthquake timeline',
}: {
  /**
   * `coveredDays` marks a bin its data span covers only part of (lib/event-timeline, or
   * a first or last calendar bin of lib/seismological-analysis's rate series); `days`
   * is a bin's own length where bins differ (calendar months), else `daysPerBin`.
   */
  data: { date: string; count: number; days?: number; coveredDays?: number }[];
  height?: number;
  seriesName?: string;
  daysPerBin?: number;
  exportName?: string;
  ariaLabel?: string;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const showDots = data.length < 100;
  const option = useMemo<EChartsOption>(() => {
    // A partial bin's raw total would read as a rate drop, so it is drawn scaled to a
    // full period, as a dashed segment ending in a hollow marker.
    const binDays = (d: { days?: number }) => d.days ?? daysPerBin;
    const isPartial = (d: { days?: number; coveredDays?: number }) => {
      const length = binDays(d);
      return length != null && d.coveredDays != null && d.coveredDays > 0 && d.coveredDays < length;
    };
    const scaled = (d: { count: number; days?: number; coveredDays?: number }) => d.count * binDays(d)! / d.coveredDays!;
    const partial = data.map(isPartial);
    const hasPartial = partial.some(Boolean);
    return {
      grid: grid({ top: 24, left: 56, right: 24, bottom: 64 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params?.length) return '';
          const p = params[0];
          const d = new Date(String(p.axisValue));
          const label = isNaN(d.getTime())
            ? String(p.axisValue)
            : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
          const row = typeof p.dataIndex === 'number' ? data[p.dataIndex] : undefined;
          if (row && isPartial(row)) {
            return ttHeader(c, label) +
              ttRow(c, 'Partial period', `${row.count.toLocaleString()} event${row.count === 1 ? '' : 's'} in ${row.coveredDays} of ${binDays(row)} days`, SEISMIC_COLORS.magnitude.dark) +
              ttRow(c, seriesName, `≈ ${Number(scaled(row).toPrecision(3)).toLocaleString()} (scaled to ${binDays(row)} days)`);
          }
          const value = row ? row.count : Number(p.value);
          return ttHeader(c, label) + ttRow(c, seriesName, `${value.toLocaleString()} events`, SEISMIC_COLORS.magnitude.dark);
        },
      }),
      xAxis: { ...axis(c, { type: 'category' }), boundaryGap: false, data: data.map((d) => d.date) },
      yAxis: { ...axis(c, { name: seriesName, nameGap: 44 }) },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 16, bottom: 28, borderColor: c.grid, textStyle: { color: c.subtext, fontSize: 10 } },
      ],
      series: [
        {
          type: 'line',
          name: seriesName,
          smooth: false,
          sampling: 'lttb',
          showSymbol: showDots,
          symbolSize: 5,
          lineStyle: { width: 2, color: SEISMIC_COLORS.magnitude.dark },
          itemStyle: { color: SEISMIC_COLORS.magnitude.dark },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59,130,246,0.35)' },
                { offset: 1, color: 'rgba(59,130,246,0.02)' },
              ],
            },
          },
          data: data.map((d, i) => (partial[i] ? null : d.count)),
        },
        // Each partial bin (a first and a last bin can both be partial) is joined to its
        // full neighbour by a dashed segment.
        ...(hasPartial ? [{
          type: 'line' as const,
          name: `${seriesName} (partial period, scaled)`,
          showSymbol: true,
          symbol: 'emptyCircle',
          symbolSize: 7,
          connectNulls: false,
          lineStyle: { width: 2, type: 'dashed' as const, color: SEISMIC_COLORS.magnitude.dark },
          itemStyle: { color: SEISMIC_COLORS.magnitude.dark },
          data: data.map((d, i) =>
            partial[i] ? scaled(d) : partial[i - 1] || partial[i + 1] ? d.count : null),
        }] : []),
      ],
    };
  }, [data, c, showDots, seriesName, daysPerBin]);
  return <EChart option={option} height={height} exportData={data} exportName={exportName} aria-label={ariaLabel} />;
});

/** Origin times are UTC: magnitude-time tooltips show the UTC instant with its zone. */
const UTC_MINUTE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'UTC', timeZoneName: 'short',
});

/**
 * Magnitude against origin time (paper, sec:viz "magnitude-vs.-time scatter"), on a UTC
 * time axis, coloured and sized by magnitude as the magnitude-depth scatter, with an
 * optional dashed reference line at the rate series' magnitude threshold (Mc or the
 * cut-off). Large catalogues are sampled (lib/plot-sampling sampleMagnitudeTime).
 */
export const MagnitudeTimeScatter = memo(function MagnitudeTimeScatter({
  data,
  threshold,
  thresholdLabel,
  height = 360,
}: {
  data: { time: string; magnitude: number; magnitude_type?: string | null }[];
  threshold?: number | null;
  thresholdLabel?: string;
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const { points, total } = useMemo(() => sampleMagnitudeTime(data), [data]);
  const exportRows = useMemo(() => points.map(point => ({
    time: new Date(point.t).toISOString(), magnitude: point.magnitude, magnitudeType: point.magnitude_type ?? '',
  })), [points]);
  const option = useMemo<EChartsOption>(
    () => ({
      useUTC: true,
      grid: grid({ top: 24, left: 56, right: 28, bottom: 52 }),
      tooltip: tooltip(c, {
        trigger: 'item',
        formatter: (p: any) => {
          const t = Number(p.value[0]);
          const m = Number(p.value[1]);
          const type = p.value[2] ? ` ${p.value[2]}` : '';
          return ttHeader(c, Number.isFinite(t) ? UTC_MINUTE_FORMAT.format(new Date(t)) : 'Unknown time') +
            ttRow(c, 'Magnitude', `${m.toFixed(1)}${type} · ${magnitudeClass(m)}`, p.color);
        },
      }),
      xAxis: axis(c, { type: 'time', name: 'Origin time (UTC)', nameGap: 30 }),
      yAxis: axis(c, { name: 'Magnitude', nameGap: 40 }),
      dataZoom: [{ type: 'inside' }],
      visualMap: {
        type: 'piecewise',
        dimension: 1,
        pieces: MAG_PIECES,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 10,
        textStyle: { color: c.subtext, fontSize: 10 },
        outOfRange: { color: c.subtext },
      },
      series: [
        {
          type: 'scatter',
          name: 'Events',
          symbolSize: (val: number[]) => Math.min(18, 3 + Math.max(0, val[1]) * 1.8),
          itemStyle: { opacity: 0.7, borderColor: c.background, borderWidth: 0.5 },
          data: points.map(point => [point.t, point.magnitude, point.magnitude_type ?? '']),
          ...(threshold != null && Number.isFinite(threshold) ? {
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: c.reference, type: 'dashed' as const, width: 1.5 },
              label: { formatter: thresholdLabel ?? `M ${threshold}`, color: c.reference, fontSize: 11, position: 'insideEndTop' as const },
              data: [{ yAxis: threshold }],
            },
          } : {}),
        },
      ],
    }),
    [points, c, threshold, thresholdLabel]
  );
  return <div>
    {points.length < total && <p className="text-xs text-muted-foreground" role="status">
      Showing {points.length.toLocaleString()} of {total.toLocaleString()} events: the largest, and an even sample
      of the rest in time order, so point density still follows the event rate.
    </p>}
    <EChart option={option} height={height} exportData={exportRows} exportName="magnitude-vs-time" aria-label="Magnitude versus time" />
  </div>;
});
