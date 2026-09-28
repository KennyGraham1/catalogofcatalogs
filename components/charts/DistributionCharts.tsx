'use client';

/**
 * Overview distribution charts (Apache ECharts): magnitude, depth, region, and
 * catalogue-share. Drop-in replacements for the previous recharts components —
 * same names and props — with the same scientific palette and richer interaction
 * (axis tooltips and the shared <EChart> export menu: image + data download).
 */

import { memo, useMemo } from 'react';
import { useTheme } from 'next-themes';
import type { EChartsOption } from 'echarts';
import { EChart } from './EChart';
import { chartColors, axis, tooltip, grid, legend, ttHeader, ttRow, ttBadge } from '@/lib/echarts-theme';
import { SEISMIC_COLORS, CATEGORICAL_COLORS, AXIS_FORMATTERS, magnitudeClass, depthClass, getDepthColor } from '@/lib/chart-config';

const compact = (v: number) => AXIS_FORMATTERS.compact(v);

/** A histogram bin; callers that know the numeric bounds [min, max) pass them. */
type RangeBin = { range: string; count: number; min?: number; max?: number };

const RANGE_LABEL = /^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/;
const NUMBER_LABEL = /-?\d+(?:\.\d+)?/;

/**
 * Bounds [min, max) of a bin: the caller's, else read from labels such as '< 2.0',
 * '2.0-2.5', '5.0+' or '40+ km'. Classing a bin by parseFloat(label) turned '< 2.0'
 * into NaN, which magnitudeClass calls 'Great', and classed open bins by one bound.
 */
function binBounds(bin: RangeBin): { min: number; max: number } {
  if (typeof bin.min === 'number' && typeof bin.max === 'number') return { min: bin.min, max: bin.max };
  const label = bin.range.trim();
  const pair = label.match(RANGE_LABEL);
  if (pair) return { min: Number(pair[1]), max: Number(pair[2]) };
  const single = label.match(NUMBER_LABEL);
  const value = single ? Number(single[0]) : NaN;
  if (label.startsWith('<')) return { min: -Infinity, max: value };
  if (label.includes('+')) return { min: value, max: Infinity };
  return { min: value, max: value };
}

/** Classes at the two ends of a bin's interior, or null if its bounds are unknown. */
function classSpan(bin: RangeBin | undefined, classify: (value: number) => string): { low: string; high: string; open: boolean } | null {
  if (!bin) return null;
  const { min, max } = binBounds(bin);
  if (Number.isNaN(min) || Number.isNaN(max)) return null;
  return { low: classify(min + 1e-9), high: classify(max - 1e-9), open: max === Infinity };
}

function magnitudeBinBadge(bin: RangeBin | undefined): string | null {
  const span = classSpan(bin, magnitudeClass);
  if (!span) return null;
  if (span.low === span.high) return `${span.low} class`;
  return span.open ? `${span.low} class or larger` : `${span.low} to ${span.high} classes`;
}

function depthBinBadge(bin: RangeBin | undefined): string | null {
  const span = classSpan(bin, depthClass);
  if (!span) return null;
  return span.low === span.high ? span.low : `${span.low} to ${span.high.toLowerCase()}`;
}

/** Colour magnitude bins by severity, keyed on the bin's lower bound (e.g. '4.5-5.0' -> 4.5, '5.0+' -> 5.0). */
function magnitudeBarColor(range: string): string {
  const lower = parseFloat(range);
  if (!Number.isFinite(lower)) return SEISMIC_COLORS.magnitude.dark;
  if (lower >= 5) return SEISMIC_COLORS.energy.dark; // M5+ : red
  if (lower >= 4) return '#f97316'; // M4-5 : orange
  if (lower >= 3) return '#eab308'; // M3-4 : yellow
  return SEISMIC_COLORS.magnitude.dark; // < M3 : blue
}

export const MagnitudeDistributionChart = memo(function MagnitudeDistributionChart({
  data,
}: {
  data: RangeBin[];
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ bottom: 56 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!params?.length) return '';
          const p = params[0];
          const range = String(p.axisValue);
          const count = Number(p.value) || 0;
          const total = data.reduce((s, d) => s + d.count, 0);
          const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
          const color = magnitudeBarColor(range);
          const badge = magnitudeBinBadge(data[p.dataIndex] ?? data.find(d => d.range === range));
          return ttHeader(c, `Magnitude ${range}`) +
            ttRow(c, 'Events', `${count.toLocaleString()} (${pct}%)`, color) +
            (badge ? ttBadge(c, badge, color) : '');
        },
      }),
      xAxis: { ...axis(c, { type: 'category', name: 'Magnitude Range', nameGap: 38 }), data: data.map((d) => d.range) },
      yAxis: { ...axis(c, { name: 'Event Count', nameGap: 44 }), axisLabel: { ...axis(c).axisLabel, formatter: compact } },
      series: [
        {
          type: 'bar',
          name: 'Events',
          barMaxWidth: 60,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: data.map((d) => ({ value: d.count, itemStyle: { color: magnitudeBarColor(d.range) } })),
        },
      ],
    }),
    [data, c]
  );
  return <EChart option={option} height={300} exportData={data} exportName="magnitude-distribution" aria-label="Magnitude distribution" />;
});

export const DepthDistributionChart = memo(function DepthDistributionChart({
  data,
}: {
  data: RangeBin[];
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ bottom: 56 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!params?.length) return '';
          const p = params[0];
          const range = String(p.axisValue);
          const count = Number(p.value) || 0;
          const total = data.reduce((s, d) => s + d.count, 0);
          const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
          const bin = data[p.dataIndex] ?? data.find(d => d.range === range);
          const badge = depthBinBadge(bin);
          const top = bin ? binBounds(bin).min : NaN;
          return ttHeader(c, `Depth ${range}`) +
            ttRow(c, 'Events', `${count.toLocaleString()} (${pct}%)`, SEISMIC_COLORS.depth.dark) +
            (badge ? ttBadge(c, badge, getDepthColor(top)) : '');
        },
      }),
      xAxis: { ...axis(c, { type: 'category', name: 'Depth Range', nameGap: 38 }), data: data.map((d) => d.range) },
      yAxis: { ...axis(c, { name: 'Event Count', nameGap: 44 }), axisLabel: { ...axis(c).axisLabel, formatter: compact } },
      series: [
        {
          type: 'bar',
          name: 'Events',
          barMaxWidth: 60,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: SEISMIC_COLORS.depth.dark },
                { offset: 1, color: SEISMIC_COLORS.depth.light },
              ],
            },
          },
          data: data.map((d) => d.count),
        },
      ],
    }),
    [data, c]
  );
  return <EChart option={option} height={300} exportData={data} exportName="depth-distribution" aria-label="Depth distribution" />;
});

export const RegionDistributionChart = memo(function RegionDistributionChart({
  data,
  total: totalEvents,
}: {
  data: { region: string; count: number }[];
  /**
   * Event total the tooltip percentages are taken over. Callers pass the top-N
   * regions only, so summing the drawn bars would report each region's share of
   * that truncated set as if it were its share of the catalogue. Defaults to the
   * bar sum for callers that really do pass every region.
   */
  total?: number;
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  // ECharts category axis renders bottom-to-top; reverse so the largest is on top.
  const ordered = useMemo(() => [...data].reverse(), [data]);
  const option = useMemo<EChartsOption>(
    () => ({
      grid: grid({ left: 8, right: 24 }),
      tooltip: tooltip(c, {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!params?.length) return '';
          const p = params[0];
          const count = Number(p.value) || 0;
          const total = totalEvents ?? ordered.reduce((s, d) => s + d.count, 0);
          const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
          return ttHeader(c, String(p.axisValue)) +
            ttRow(c, 'Events', `${count.toLocaleString()} (${pct}%)`, SEISMIC_COLORS.secondary.dark);
        },
      }),
      xAxis: { ...axis(c, { name: 'Events', nameGap: 28 }), axisLabel: { ...axis(c).axisLabel, formatter: compact } },
      yAxis: { ...axis(c, { type: 'category' }), data: ordered.map((d) => d.region), axisLabel: { ...axis(c).axisLabel, width: 90, overflow: 'truncate' } },
      series: [
        {
          type: 'bar',
          name: 'Events',
          barMaxWidth: 22,
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: {
              type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: SEISMIC_COLORS.secondary.light },
                { offset: 1, color: SEISMIC_COLORS.secondary.dark },
              ],
            },
          },
          data: ordered.map((d) => d.count),
        },
      ],
    }),
    [ordered, totalEvents, c]
  );
  return <EChart option={option} height={300} exportData={data} exportName="top-regions" aria-label="Top regions by event count" />;
});

export const CatalogueDistributionChart = memo(function CatalogueDistributionChart({
  data,
}: {
  data: { catalogue: string; count: number }[];
}) {
  const { resolvedTheme } = useTheme();
  const c = chartColors(resolvedTheme === 'dark');
  const total = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);
  const option = useMemo<EChartsOption>(
    () => ({
      color: CATEGORICAL_COLORS as unknown as string[],
      tooltip: tooltip(c, {
        trigger: 'item',
        formatter: (p: any) =>
          ttHeader(c, p.name) +
          ttRow(c, 'Events', Number(p.value).toLocaleString(), p.color) +
          ttRow(c, 'Share', `${p.percent}%`),
      }),
      legend: legend(c, { type: 'scroll', orient: 'horizontal', bottom: 0, left: 'center' }),
      title: {
        text: total.toLocaleString(),
        subtext: 'Total Events',
        left: 'center',
        top: '40%',
        textStyle: { color: c.text, fontSize: 22, fontWeight: 700 },
        subtextStyle: { color: c.subtext, fontSize: 11 },
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['50%', '46%'],
          avoidLabelOverlap: true,
          padAngle: 1.5,
          itemStyle: { borderColor: c.background, borderWidth: 2, borderRadius: 4 },
          label: {
            formatter: (p: any) => (p.percent >= 5 ? `${String(p.name).slice(0, 12)} ${p.percent}%` : ''),
            color: c.subtext,
            fontSize: 11,
          },
          labelLine: { lineStyle: { color: c.subtext } },
          data: data.map((d) => ({ name: d.catalogue, value: d.count })),
        },
      ],
    }),
    [data, total, c]
  );
  return <EChart option={option} height={300} exportData={data} exportName="catalogue-distribution" aria-label="Catalogue share of events" />;
});
