'use client';

/**
 * Overview plots (Apache ECharts): magnitude-vs-depth scatter and the event
 * timeline. The scatter encodes magnitude as both colour (severity scale) and
 * marker size, with depth on an inverted axis (down = deeper) — scientifically
 * conventional. The timeline adds a zoomable brush for exploring long series.
 */

import { memo, useMemo } from 'react';
import { useTheme } from 'next-themes';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { chartColors, axis, tooltip, grid, ttHeader, ttRow, ttBadge } from '@/lib/echarts-theme';
import { SEISMIC_COLORS, magnitudeClass, depthClass, getDepthColor } from '@/lib/chart-config';

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
  data: { magnitude: number; depth: number | null }[];
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const points = useMemo(
    () => data.filter((d): d is { magnitude: number; depth: number } => typeof d.depth === 'number'),
    [data]
  );
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
  return <EChart option={option} height={height} exportData={points} exportName="magnitude-vs-depth" aria-label="Magnitude versus depth" />;
});

export const EventTimelineChart = memo(function EventTimelineChart({
  data,
  height = 400,
  seriesName = 'Events per Day',
}: {
  data: { date: string; count: number }[];
  height?: number;
  seriesName?: string;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const showDots = data.length < 100;
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ top: 24, left: 56, right: 24, bottom: 64 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params?.length) return '';
          const p = params[0];
          const d = new Date(String(p.axisValue));
          const label = isNaN(d.getTime())
            ? String(p.axisValue)
            : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          return ttHeader(c, label) + ttRow(c, seriesName, `${Number(p.value).toLocaleString()} events`, SEISMIC_COLORS.magnitude.dark);
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
          smooth: true,
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
          data: data.map((d) => d.count),
        },
      ],
    }),
    [data, c, showDots, seriesName]
  );
  return <EChart option={option} height={height} exportData={data} exportName="earthquake-timeline" aria-label="Earthquake timeline" />;
});
